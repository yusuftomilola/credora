// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../utils/KYCTypes.sol"; 
import "../interfaces/IStateConnector.sol"; 
import "../interfaces/IFtsoRegistry.sol"; 

/**
 * @title OracleManager
 * @dev Contract for managing multiple oracle data sources and aggregation using shared types.
 */
contract OracleManager is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    bytes32 public constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN_ROLE");
    bytes32 public constant DATA_PROVIDER_ROLE = keccak256("DATA_PROVIDER_ROLE");

    IStateConnector public immutable stateConnector;
    IFtsoRegistry public immutable ftsoRegistry;

    
    mapping(string => KYCTypes.DataFeed) public dataFeeds;
    mapping(string => KYCTypes.OracleSource) public oracleSources;
    mapping(bytes32 => KYCTypes.DataPoint) public dataPoints;
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

    constructor(address _stateConnector, address _ftsoRegistry) {
        require(_stateConnector != address(0), "Invalid state connector");
        require(_ftsoRegistry != address(0), "Invalid FTSO registry");

        stateConnector = IStateConnector(_stateConnector);
        ftsoRegistry = IFtsoRegistry(_ftsoRegistry);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ADMIN_ROLE, msg.sender);

        _initializeDefaultSources();
    }

    function _initializeDefaultSources() internal {
        _addOracleSource("experian", address(this), 95);
        _addOracleSource("equifax", address(this), 90);
        _addOracleSource("transunion", address(this), 92);
        _addOracleSource("chainlink", address(this), 98);
        _addOracleSource("flare_ftso", address(this), 96);
    }

    function addOracleSource(string calldata _sourceId, address _provider, uint256 _reliability) external onlyRole(ORACLE_ADMIN_ROLE) {
        _addOracleSource(_sourceId, _provider, _reliability);
    }

    function _addOracleSource(string memory _sourceId, address _provider, uint256 _reliability) internal {
        require(bytes(_sourceId).length > 0, "Invalid source ID");
        require(_provider != address(0), "Invalid provider");
        require(_reliability <= 100, "Invalid reliability");
        require(bytes(oracleSources[_sourceId].name).length == 0, "Source already exists");

        
        oracleSources[_sourceId] = KYCTypes.OracleSource({
            name: _sourceId,
            provider: _provider,
            isActive: true,
            reliability: _reliability,
            lastUpdate: block.timestamp,
            totalRequests: 0,
            successfulRequests: 0,
            averageResponseTime: 0,
            supportedDataTypes: new string[](0),
            stakingAmount: 0
        });

        activeSourceIds.push(_sourceId);
        emit OracleSourceAdded(_sourceId, _provider);
    }

    function createDataFeed(
        string calldata _feedId,
        string calldata _dataType,
        string[] calldata _sourceIds,
        KYCTypes.AggregationMethod _aggregationMethod, 
        uint256 _minSources,
        uint256 _maxAge
    ) external onlyRole(ORACLE_ADMIN_ROLE) {
        require(bytes(_feedId).length > 0, "Invalid feed ID");
        require(_sourceIds.length > 0, "No sources provided");
        require(_minSources <= _sourceIds.length, "Invalid min sources");
        require(_maxAge > 0, "Invalid max age");
        require(bytes(dataFeeds[_feedId].feedId).length == 0, "Feed already exists");

        KYCTypes.OracleSource[] memory sources = new KYCTypes.OracleSource[](_sourceIds.length);
        for (uint i = 0; i < _sourceIds.length; i++) {
            require(bytes(oracleSources[_sourceIds[i]].name).length > 0, "Source not found");
            sources[i] = oracleSources[_sourceIds[i]];
        }

        
        dataFeeds[_feedId] = KYCTypes.DataFeed({
            feedId: _feedId,
            dataType: _dataType,
            sources: sources,
            aggregationMethod: _aggregationMethod,
            minSources: _minSources,
            maxAge: _maxAge,
            isActive: true,
            updateFrequency: 0,
            lastAggregation: 0,
            confidenceThreshold: 0
        });

        activeFeedIds.push(_feedId);
        emit DataFeedCreated(_feedId, _dataType);
    }

    function submitDataPoint(string calldata _feedId, string calldata _sourceId, uint256 _value, bytes32 _attestationId) external onlyRole(DATA_PROVIDER_ROLE) whenNotPaused {
        require(bytes(dataFeeds[_feedId].feedId).length > 0, "Feed not found");
        KYCTypes.OracleSource storage source = oracleSources[_sourceId];
        require(bytes(source.name).length > 0, "Source not found");
        require(source.isActive, "Source inactive");

        bool verified = true;
        if (_attestationId != bytes32(0)) {
            (verified, ) = stateConnector.getAttestation(_attestationId);
        }

        bytes32 dataPointId = keccak256(abi.encodePacked(_feedId, _sourceId, block.timestamp, _value));
        
        
        dataPoints[dataPointId] = KYCTypes.DataPoint({
            value: _value,
            timestamp: block.timestamp,
            source: source.provider,
            attestationId: _attestationId,
            verified: verified,
            confidence: 0, 
            dataHash: bytes32(0),
            metadata: ""
        });

        feedDataPoints[_feedId].push(dataPointId);

        source.totalRequests++;
        source.lastUpdate = block.timestamp;
        if (verified) {
            source.successfulRequests++;
        }

        emit DataReceived(_feedId, _sourceId, _value, _attestationId);
        _aggregateDataFeed(_feedId);
    }

    function _aggregateDataFeed(string memory _feedId) internal {
        KYCTypes.DataFeed memory feed = dataFeeds[_feedId];
        if (!feed.isActive) return;

        bytes32[] memory dataPointIds = feedDataPoints[_feedId];
        uint256[] memory recentValues = new uint256[](dataPointIds.length);
        uint256[] memory weights = new uint256[](dataPointIds.length);
        uint256 validPoints = 0;

        for (uint i = 0; i < dataPointIds.length; i++) {
            KYCTypes.DataPoint memory point = dataPoints[dataPointIds[i]];
            if (point.verified && block.timestamp - point.timestamp <= feed.maxAge) {
                recentValues[validPoints] = point.value;
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
        
        
        if (feed.aggregationMethod == KYCTypes.AggregationMethod.AVERAGE) {
            uint256 sum = 0;
            for (uint i = 0; i < validPoints; i++) sum += recentValues[i];
            aggregatedValue = sum / validPoints;
        } else if (feed.aggregationMethod == KYCTypes.AggregationMethod.MEDIAN) {
            aggregatedValue = _calculateMedian(recentValues, validPoints);
        } else if (feed.aggregationMethod == KYCTypes.AggregationMethod.WEIGHTED_AVERAGE) {
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
        
        for (uint i = 0; i < _length - 1; i++) {
            for (uint j = 0; j < _length - i - 1; j++) {
                if (_values[j] > _values[j + 1]) {
                    (_values[j], _values[j + 1]) = (_values[j + 1], _values[j]);
                }
            }
        }
        if (_length % 2 == 0) {
            return (_values[_length / 2 - 1] + _values[_length / 2]) / 2;
        } else {
            return _values[_length / 2];
        }
    }

    function getLatestData(string calldata _feedId) external view returns (uint256 value, uint256 timestamp, uint256 confidence) {
        KYCTypes.DataFeed memory feed = dataFeeds[_feedId];
        require(bytes(feed.feedId).length > 0, "Feed not found");

        bytes32[] memory dataPointIds = feedDataPoints[_feedId];
        if (dataPointIds.length == 0) return (0, 0, 0);

        uint256 mostRecentTimestamp = 0;
        uint256 mostRecentValue = 0;
        uint256 validSourcesCount = 0;
        
        for (uint i = dataPointIds.length; i > 0; i--) {
            KYCTypes.DataPoint memory point = dataPoints[dataPointIds[i - 1]];
            if (point.verified && block.timestamp - point.timestamp <= feed.maxAge) {
                validSourcesCount++; 
                if (point.timestamp > mostRecentTimestamp) {
                    mostRecentTimestamp = point.timestamp;
                    mostRecentValue = point.value;
                }
            }
        }

        uint256 sourceConfidence = (validSourcesCount * 100) / feed.sources.length;
        uint256 ageConfidence = mostRecentTimestamp > 0 ? 100 - ((block.timestamp - mostRecentTimestamp) * 100) / feed.maxAge : 0;
        confidence = (sourceConfidence + ageConfidence) / 2;

        return (mostRecentValue, mostRecentTimestamp, confidence);
    }

    function updateSourceReliability(string calldata _sourceId) external onlyRole(ORACLE_ADMIN_ROLE) {
        KYCTypes.OracleSource storage source = oracleSources[_sourceId];
        require(bytes(source.name).length > 0, "Source not found");

        if (source.totalRequests > 0) {
            uint256 successRate = (source.successfulRequests * 100) / source.totalRequests;
            source.reliability = successRate;
            emit OracleSourceUpdated(_sourceId, successRate);
        }
    }

    
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

    
    function getActiveFeedIds() external view returns (string[] memory) {
        return activeFeedIds;
    }

    function getActiveSourceIds() external view returns (string[] memory) {
        return activeSourceIds;
    }

    function getFeedSources(string calldata _feedId) external view returns (string[] memory sourceIds) {
        KYCTypes.DataFeed memory feed = dataFeeds[_feedId];
        sourceIds = new string[](feed.sources.length);
        for (uint i = 0; i < feed.sources.length; i++) {
            sourceIds[i] = feed.sources[i].name;
        }
        return sourceIds;
    }
}