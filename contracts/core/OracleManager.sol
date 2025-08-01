// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title OracleManager
 * @dev Contract for managing multiple oracle data sources and aggregation
 */
contract OracleManager is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    bytes32 public constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN_ROLE");
    bytes32 public constant DATA_PROVIDER_ROLE = keccak256("DATA_PROVIDER_ROLE");

    IStateConnector public immutable stateConnector;
    IFtsoRegistry public immutable ftsoRegistry;

    struct OracleSource {
        string name;
        address provider;
        bool isActive;
        uint256 reliability; // 0-100 scale
        uint256 lastUpdate;
        uint256 totalRequests;
        uint256 successfulRequests;
    }

    struct DataFeed {
        string feedId;
        string dataType; // "credit_score", "kyc_status", "transaction_data"
        OracleSource[] sources;
        uint256 aggregationMethod; // 0=average, 1=median, 2=weighted_average
        uint256 minSources;
        uint256 maxAge; // Maximum age of data in seconds
        bool isActive;
    }

    struct DataPoint {
        uint256 value;
        uint256 timestamp;
        address source;
        bytes32 attestationId;
        bool verified;
    }

    mapping(string => DataFeed) public dataFeeds;
    mapping(string => OracleSource) public oracleSources;
    mapping(bytes32 => DataPoint) public dataPoints;
    mapping(string => bytes32[]) public feedDataPoints;
    
    string[] public activeFeedIds;
    string[] public activeSourceIds;

    Counters.Counter private _requestCounter;

    event OracleSourceAdded(string indexed sourceId, address indexed provider);
    event OracleSourceUpdated(string indexed sourceId, uint256 reliability);
    event DataFeedCreated(string indexed feedId, string dataType);
    event DataFeedUpdated(string indexed feedId);
    event DataReceived(string indexed feedId, string indexed sourceId, uint256 value, bytes32 attestationId);
    event AggregatedDataUpdated(string indexed feedId, uint256 aggregatedValue);

    constructor(
        address _stateConnector,
        address _ftsoRegistry
    ) {
        require(_stateConnector != address(0), "Invalid state connector");
        require(_ftsoRegistry != address(0), "Invalid FTSO registry");

        stateConnector = IStateConnector(_stateConnector);
        ftsoRegistry = IFtsoRegistry(_ftsoRegistry);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ADMIN_ROLE, msg.sender);

        _initializeDefaultSources();
    }

    function _initializeDefaultSources() internal {
        // Add default oracle sources
        _addOracleSource("experian", address(this), 95);
        _addOracleSource("equifax", address(this), 90);
        _addOracleSource("transunion", address(this), 92);
        _addOracleSource("chainlink", address(this), 98);
        _addOracleSource("flare_ftso", address(this), 96);
    }

    /**
     * @dev Add new oracle source
     */
    function addOracleSource(
        string calldata _sourceId,
        address _provider,
        uint256 _reliability
    ) external onlyRole(ORACLE_ADMIN_ROLE) {
        _addOracleSource(_sourceId, _provider, _reliability);
    }

    function _addOracleSource(
        string memory _sourceId,
        address _provider,
        uint256 _reliability
    ) internal {
        require(bytes(_sourceId).length > 0, "Invalid source ID");
        require(_provider != address(0), "Invalid provider");
        require(_reliability <= 100, "Invalid reliability");
        require(bytes(oracleSources[_sourceId].name).length == 0, "Source already exists");

        oracleSources[_sourceId] = OracleSource({
            name: _sourceId,
            provider: _provider,
            isActive: true,
            reliability: _reliability,
            lastUpdate: block.timestamp,
            totalRequests: 0,
            successfulRequests: 0
        });

        activeSourceIds.push(_sourceId);
        emit OracleSourceAdded(_sourceId, _provider);
    }

    /**
     * @dev Create new data feed
     */
    function createDataFeed(
        string calldata _feedId,
        string calldata _dataType,
        string[] calldata _sourceIds,
        uint256 _aggregationMethod,
        uint256 _minSources,
        uint256 _maxAge
    ) external onlyRole(ORACLE_ADMIN_ROLE) {
        require(bytes(_feedId).length > 0, "Invalid feed ID");
        require(_sourceIds.length > 0, "No sources provided");
        require(_minSources <= _sourceIds.length, "Invalid min sources");
        require(_maxAge > 0, "Invalid max age");
        require(bytes(dataFeeds[_feedId].feedId).length == 0, "Feed already exists");

        // Validate sources exist
        OracleSource[] memory sources = new OracleSource[](_sourceIds.length);
        for (uint i = 0; i < _sourceIds.length; i++) {
            require(bytes(oracleSources[_sourceIds[i]].name).length > 0, "Source not found");
            sources[i] = oracleSources[_sourceIds[i]];
        }

        dataFeeds[_feedId] = DataFeed({
            feedId: _feedId,
            dataType: _dataType,
            sources: sources,
            aggregationMethod: _aggregationMethod,
            minSources: _minSources,
            maxAge: _maxAge,
            isActive: true
        });

        activeFeedIds.push(_feedId);
        emit DataFeedCreated(_feedId, _dataType);
    }

    /**
     * @dev Submit data point from oracle source
     */
    function submitDataPoint(
        string calldata _feedId,
        string calldata _sourceId,
        uint256 _value,
        bytes32 _attestationId
    ) external onlyRole(DATA_PROVIDER_ROLE) whenNotPaused {
        require(bytes(dataFeeds[_feedId].feedId).length > 0, "Feed not found");
        require(bytes(oracleSources[_sourceId].name).length > 0, "Source not found");
        require(oracleSources[_sourceId].isActive, "Source inactive");

        // Verify attestation if provided
        bool verified = true;
        if (_attestationId != bytes32(0)) {
            (verified, ) = stateConnector.getAttestation(_attestationId);
        }

        bytes32 dataPointId = keccak256(abi.encodePacked(_feedId, _sourceId, block.timestamp, _value));
        
        dataPoints[dataPointId] = DataPoint({
            value: _value,
            timestamp: block.timestamp,
            source: oracleSources[_sourceId].provider,
            attestationId: _attestationId,
            verified: verified
        });

        feedDataPoints[_feedId].push(dataPointId);

        // Update source statistics
        oracleSources[_sourceId].totalRequests++;
        oracleSources[_sourceId].lastUpdate = block.timestamp;
        if (verified) {
            oracleSources[_sourceId].successfulRequests++;
        }

        emit DataReceived(_feedId, _sourceId, _value, _attestationId);

        // Trigger aggregation if enough sources
        _aggregateDataFeed(_feedId);
    }

    /**
     * @dev Aggregate data from multiple sources
     */
    function _aggregateDataFeed(string memory _feedId) internal {
        DataFeed memory feed = dataFeeds[_feedId];
        if (!feed.isActive) return;

        bytes32[] memory dataPointIds = feedDataPoints[_feedId];
        uint256[] memory recentValues = new uint256[](dataPointIds.length);
        uint256[] memory weights = new uint256[](dataPointIds.length);
        uint256 validPoints = 0;

        // Collect recent valid data points
        for (uint i = 0; i < dataPointIds.length; i++) {
            DataPoint memory point = dataPoints[dataPointIds[i]];
            
            if (point.verified && 
                block.timestamp - point.timestamp <= feed.maxAge) {
                
                recentValues[validPoints] = point.value;
                
                // Get source reliability as weight
                for (uint j = 0; j < feed.sources.length; j++) {
                    if (feed.sources[j].provider == point.source) {
                        weights[validPoints] = feed.sources[j].reliability;
                        break;
                    }
                }
                
                validPoints++;
            }
        }

        if (validPoints < feed.minSources) return;

        uint256 aggregatedValue;
        
        if (feed.aggregationMethod == 0) {
            // Simple average
            uint256 sum = 0;
            for (uint i = 0; i < validPoints; i++) {
                sum += recentValues[i];
            }
            aggregatedValue = sum / validPoints;
            
        } else if (feed.aggregationMethod == 1) {
            // Median
            aggregatedValue = _calculateMedian(recentValues, validPoints);
            
        } else if (feed.aggregationMethod == 2) {
            // Weighted average
            uint256 weightedSum = 0;
            uint256 totalWeight = 0;
            
            for (uint i = 0; i < validPoints; i++) {
                weightedSum += recentValues[i] * weights[i];
                totalWeight += weights[i];
            }
            
            aggregatedValue = totalWeight > 0 ? weightedSum / totalWeight : 0;
        }

        emit AggregatedDataUpdated(_feedId, aggregatedValue);
    }

    function _calculateMedian(uint256[] memory _values, uint256 _length) internal pure returns (uint256) {
        // Simple bubble sort for small arrays
        for (uint i = 0; i < _length - 1; i++) {
            for (uint j = 0; j < _length - i - 1; j++) {
                if (_values[j] > _values[j + 1]) {
                    uint256 temp = _values[j];
                    _values[j] = _values[j + 1];
                    _values[j + 1] = temp;
                }
            }
        }

        if (_length % 2 == 0) {
            return (_values[_length / 2 - 1] + _values[_length / 2]) / 2;
        } else {
            return _values[_length / 2];
        }
    }

    /**
     * @dev Get latest aggregated data for feed
     */
    function getLatestData(string calldata _feedId) external view returns (
        uint256 value,
        uint256 timestamp,
        uint256 confidence
    ) {
        require(bytes(dataFeeds[_feedId].feedId).length > 0, "Feed not found");

        bytes32[] memory dataPointIds = feedDataPoints[_feedId];
        if (dataPointIds.length == 0) return (0, 0, 0);

        // Find most recent valid data point
        uint256 mostRecentTimestamp = 0;
        uint256 mostRecentValue = 0;
        uint256 validSources = 0;

        DataFeed memory feed = dataFeeds[_feedId];
        
        for (uint i = dataPointIds.length; i > 0; i--) {
            DataPoint memory point = dataPoints[dataPointIds[i - 1]];
            
            if (point.verified && 
                block.timestamp - point.timestamp <= feed.maxAge &&
                point.timestamp > mostRecentTimestamp) {
                
                mostRecentTimestamp = point.timestamp;
                mostRecentValue = point.value;
                validSources++;
            }
        }

        // Calculate confidence based on number of sources and data age
        uint256 sourceConfidence = (validSources * 100) / feed.sources.length;
        uint256 ageConfidence = mostRecentTimestamp > 0 ? 
            100 - ((block.timestamp - mostRecentTimestamp) * 100) / feed.maxAge : 0;
        
        confidence = (sourceConfidence + ageConfidence) / 2;

        return (mostRecentValue, mostRecentTimestamp, confidence);
    }

    /**
     * @dev Update oracle source reliability based on performance
     */
    function updateSourceReliability(string calldata _sourceId) external onlyRole(ORACLE_ADMIN_ROLE) {
        OracleSource storage source = oracleSources[_sourceId];
        require(bytes(source.name).length > 0, "Source not found");

        if (source.totalRequests > 0) {
            uint256 successRate = (source.successfulRequests * 100) / source.totalRequests;
            source.reliability = successRate;
            emit OracleSourceUpdated(_sourceId, successRate);
        }
    }

    // Admin functions
    function deactivateSource(string calldata _sourceId) external onlyRole(ORACLE_ADMIN_ROLE) {
        oracleSources[_sourceId].isActive = false;
    }

    function deactivateFeed(string calldata _feedId) external onlyRole(ORACLE_ADMIN_ROLE) {
        dataFeeds[_feedId].isActive = false;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // View functions
    function getActiveFeedIds() external view returns (string[] memory) {
        return activeFeedIds;
    }

    function getActiveSourceIds() external view returns (string[] memory) {
        return activeSourceIds;
    }

    function getFeedSources(string calldata _feedId) external view returns (string[] memory sourceIds) {
        DataFeed memory feed = dataFeeds[_feedId];
        sourceIds = new string[](feed.sources.length);
        
        for (uint i = 0; i < feed.sources.length; i++) {
            sourceIds[i] = feed.sources[i].name;
        }
        
        return sourceIds;
    }
}