// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";







/**
 * @title APIGateway
 * @dev Gateway contract for external API access with rate limiting and monetization
 */
contract APIGateway is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    KYCRegistry public immutable kycRegistry;
    CreditScoring public immutable creditScoring;

    bytes32 public constant API_ADMIN_ROLE = keccak256("API_ADMIN_ROLE");

    enum SubscriptionTier { FREE, BASIC, PREMIUM, ENTERPRISE }

    struct APIConsumer {
        address wallet;
        string name;
        SubscriptionTier tier;
        uint256 requestsUsed;
        uint256 requestsLimit;
        uint256 subscriptionExpiry;
        bool isActive;
        uint256 totalPaid;
    }

    struct APIEndpoint {
        string name;
        uint256 cost; // Cost per request in wei
        bool requiresKYC;
        bool requiresCreditCheck;
        bool isActive;
    }

    mapping(address => APIConsumer) public apiConsumers;
    mapping(string => APIEndpoint) public endpoints;
    mapping(SubscriptionTier => uint256) public tierLimits;
    mapping(SubscriptionTier => uint256) public tierPrices;

    Counters.Counter private _totalRequests;
    uint256 public totalRevenue;

    event APIConsumerRegistered(address indexed consumer, string name, SubscriptionTier tier);
    event APIRequestMade(address indexed consumer, string endpoint, uint256 cost);
    event SubscriptionUpgraded(address indexed consumer, SubscriptionTier oldTier, SubscriptionTier newTier);
    event PaymentReceived(address indexed consumer, uint256 amount);

    constructor(
        address _kycRegistry,
        address _creditScoring
    ) {
        require(_kycRegistry != address(0), "Invalid KYC registry");
        require(_creditScoring != address(0), "Invalid credit scoring");

        kycRegistry = KYCRegistry(_kycRegistry);
        creditScoring = CreditScoring(_creditScoring);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(API_ADMIN_ROLE, msg.sender);

        // Initialize tier limits (requests per month)
        tierLimits[SubscriptionTier.FREE] = 100;
        tierLimits[SubscriptionTier.BASIC] = 1000;
        tierLimits[SubscriptionTier.PREMIUM] = 10000;
        tierLimits[SubscriptionTier.ENTERPRISE] = 100000;

        // Initialize tier prices (monthly, in wei)
        tierPrices[SubscriptionTier.FREE] = 0;
        tierPrices[SubscriptionTier.BASIC] = 0.1 ether;
        tierPrices[SubscriptionTier.PREMIUM] = 1 ether;
        tierPrices[SubscriptionTier.ENTERPRISE] = 10 ether;

        // Initialize API endpoints
        _initializeEndpoints();
    }

    function _initializeEndpoints() internal {
        endpoints["getKYCStatus"] = APIEndpoint({
            name: "getKYCStatus",
            cost: 0.001 ether,
            requiresKYC: false,
            requiresCreditCheck: false,
            isActive: true
        });

        endpoints["getCreditScore"] = APIEndpoint({
            name: "getCreditScore",
            cost: 0.005 ether,
            requiresKYC: true,
            requiresCreditCheck: false,
            isActive: true
        });

        endpoints["getFullProfile"] = APIEndpoint({
            name: "getFullProfile",
            cost: 0.01 ether,
            requiresKYC: true,
            requiresCreditCheck: true,
            isActive: true
        });
    }

    /**
     * @dev Register as API consumer
     */
    function registerAPIConsumer(
        string calldata _name,
        SubscriptionTier _tier
    ) external payable whenNotPaused nonReentrant {
        require(bytes(_name).length > 0, "Invalid name");
        require(apiConsumers[msg.sender].wallet == address(0), "Already registered");
        
        uint256 requiredPayment = tierPrices[_tier];
        require(msg.value >= requiredPayment, "Insufficient payment");

        apiConsumers[msg.sender] = APIConsumer({
            wallet: msg.sender,
            name: _name,
            tier: _tier,
            requestsUsed: 0,
            requestsLimit: tierLimits[_tier],
            subscriptionExpiry: block.timestamp + 30 days,
            isActive: true,
            totalPaid: msg.value
        });

        totalRevenue += msg.value;

        // Grant API consumer role for KYC registry
        kycRegistry.grantRole(kycRegistry.API_CONSUMER_ROLE(), msg.sender);

        emit APIConsumerRegistered(msg.sender, _name, _tier);
        emit PaymentReceived(msg.sender, msg.value);

        // Refund excess payment
        if (msg.value > requiredPayment) {
            payable(msg.sender).transfer(msg.value - requiredPayment);
        }
    }

    /**
     * @dev Make API request
     */
    function makeAPIRequest(
        string calldata _endpoint,
        uint256 _userId
    ) external payable whenNotPaused nonReentrant returns (bool success, bytes memory data) {
        APIConsumer storage consumer = apiConsumers[msg.sender];
        require(consumer.wallet != address(0), "Not registered");
        require(consumer.isActive, "Consumer inactive");
        require(consumer.subscriptionExpiry > block.timestamp, "Subscription expired");
        require(consumer.requestsUsed < consumer.requestsLimit, "Request limit exceeded");

        APIEndpoint memory endpoint = endpoints[_endpoint];
        require(endpoint.isActive, "Endpoint inactive");
        require(msg.value >= endpoint.cost, "Insufficient payment");

        // Check requirements
        if (endpoint.requiresKYC) {
            require(kycRegistry.isKYCValid(_userId), "KYC required");
        }

        // Process request based on endpoint
        if (keccak256(bytes(_endpoint)) == keccak256(bytes("getKYCStatus"))) {
            data = _getKYCStatusData(_userId);
        } else if (keccak256(bytes(_endpoint)) == keccak256(bytes("getCreditScore"))) {
            data = _getCreditScoreData(_userId);
        } else if (keccak256(bytes(_endpoint)) == keccak256(bytes("getFullProfile"))) {
            data = _getFullProfileData(_userId);
        } else {
            revert("Unknown endpoint");
        }

        // Update usage and revenue
        consumer.requestsUsed++;
        consumer.totalPaid += msg.value;
        totalRevenue += msg.value;
        _totalRequests.increment();

        emit APIRequestMade(msg.sender, _endpoint, msg.value);

        // Refund excess payment
        if (msg.value > endpoint.cost) {
            payable(msg.sender).transfer(msg.value - endpoint.cost);
        }

        return (true, data);
    }

    function _getKYCStatusData(uint256 _userId) internal view returns (bytes memory) {
        (
            KYCRegistry.KYCStatus status,
            uint256 verificationTimestamp,
            uint256 expirationTimestamp,
            uint8 complianceScore,
            string memory jurisdiction
        ) = kycRegistry.getUserKYCInfo(_userId);

        return abi.encode(status, verificationTimestamp, expirationTimestamp, complianceScore, jurisdiction);
    }

    function _getCreditScoreData(uint256 _userId) internal view returns (bytes memory) {
        (
            uint16 creditScore,
            uint256 lastUpdated,
            uint8 riskLevel,
            bool hasTraditionalCredit,
            bool hasDeFiActivity
        ) = creditScoring.getCreditScore(_userId);

        return abi.encode(creditScore, lastUpdated, riskLevel, hasTraditionalCredit, hasDeFiActivity);
    }

    function _getFullProfileData(uint256 _userId) internal view returns (bytes memory) {
        bytes memory kycData = _getKYCStatusData(_userId);
        bytes memory creditData = _getCreditScoreData(_userId);
        
        return abi.encode(kycData, creditData);
    }

    /**
     * @dev Upgrade subscription tier
     */
    function upgradeSubscription(SubscriptionTier _newTier) external payable whenNotPaused nonReentrant {
        APIConsumer storage consumer = apiConsumers[msg.sender];
        require(consumer.wallet != address(0), "Not registered");
        require(_newTier > consumer.tier, "Cannot downgrade");

        uint256 requiredPayment = tierPrices[_newTier];
        require(msg.value >= requiredPayment, "Insufficient payment");

        SubscriptionTier oldTier = consumer.tier;
        consumer.tier = _newTier;
        consumer.requestsLimit = tierLimits[_newTier];
        consumer.subscriptionExpiry = block.timestamp + 30 days;
        consumer.totalPaid += msg.value;
        totalRevenue += msg.value;

        emit SubscriptionUpgraded(msg.sender, oldTier, _newTier);
        emit PaymentReceived(msg.sender, msg.value);

        // Refund excess payment
        if (msg.value > requiredPayment) {
            payable(msg.sender).transfer(msg.value - requiredPayment);
        }
    }

    /**
     * @dev Get API consumer info
     */
    function getConsumerInfo(address _consumer) external view returns (
        string memory name,
        SubscriptionTier tier,
        uint256 requestsUsed,
        uint256 requestsLimit,
        uint256 subscriptionExpiry,
        bool isActive
    ) {
        APIConsumer memory consumer = apiConsumers[_consumer];
        return (
            consumer.name,
            consumer.tier,
            consumer.requestsUsed,
            consumer.requestsLimit,
            consumer.subscriptionExpiry,
            consumer.isActive
        );
    }

    // Admin functions
    function withdrawRevenue() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = address(this).balance;
        require(balance > 0, "No revenue to withdraw");
        payable(msg.sender).transfer(balance);
    }

    function updateEndpoint(
        string calldata _name,
        uint256 _cost,
        bool _requiresKYC,
        bool _requiresCreditCheck,
        bool _isActive
    ) external onlyRole(API_ADMIN_ROLE) {
        endpoints[_name] = APIEndpoint({
            name: _name,
            cost: _cost,
            requiresKYC: _requiresKYC,
            requiresCreditCheck: _requiresCreditCheck,
            isActive: _isActive
        });
    }

    function updateTierLimits(SubscriptionTier _tier, uint256 _limit) external onlyRole(API_ADMIN_ROLE) {
        tierLimits[_tier] = _limit;
    }

    function updateTierPrices(SubscriptionTier _tier, uint256 _price) external onlyRole(API_ADMIN_ROLE) {
        tierPrices[_tier] = _price;
    }

    function deactivateConsumer(address _consumer) external onlyRole(API_ADMIN_ROLE) {
        apiConsumers[_consumer].isActive = false;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // View functions
    function getTotalRequests() external view returns (uint256) {
        return _totalRequests.current();
    }

    function getEndpointInfo(string calldata _name) external view returns (
        uint256 cost,
        bool requiresKYC,
        bool requiresCreditCheck,
        bool isActive
    ) {
        APIEndpoint memory endpoint = endpoints[_name];
        return (endpoint.cost, endpoint.requiresKYC, endpoint.requiresCreditCheck, endpoint.isActive);
    }
}

/**
 * @title PrivacyManager
 * @dev Contract for managing data privacy and selective disclosure
 */
contract PrivacyManager is AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;

    bytes32 public constant PRIVACY_ADMIN_ROLE = keccak256("PRIVACY_ADMIN_ROLE");
    bytes32 public constant DATA_PROCESSOR_ROLE = keccak256("DATA_PROCESSOR_ROLE");

    KYCRegistry public immutable kycRegistry;

    struct DataPermission {
        uint256 userId;
        address requester;
        string[] dataFields;
        uint256 expiryTimestamp;
        bool isActive;
        bytes32 consentHash;
    }

    struct PrivacySettings {
        bool allowCreditScoring;
        bool allowDataSharing;
        bool allowAnalytics;
        string[] restrictedJurisdictions;
        uint256 dataRetentionPeriod; // in seconds
    }

    struct DataRequest {
        bytes32 requestId;
        uint256 userId;
        address requester;
        string[] requestedFields;
        string purpose;
        uint256 timestamp;
        bool approved;
        bool processed;
    }

    mapping(uint256 => PrivacySettings) public userPrivacySettings;
    mapping(bytes32 => DataPermission) public dataPermissions;
    mapping(bytes32 => DataRequest) public dataRequests;
    mapping(uint256 => mapping(address => bool)) public userConsents;
    mapping(uint256 => bytes32[]) public userDataPermissions;

    event PrivacySettingsUpdated(uint256 indexed userId);
    event DataPermissionGranted(bytes32 indexed permissionId, uint256 indexed userId, address indexed requester);
    event DataPermissionRevoked(bytes32 indexed permissionId, uint256 indexed userId);
    event DataRequestSubmitted(bytes32 indexed requestId, uint256 indexed userId, address indexed requester);
    event ConsentGiven(uint256 indexed userId, address indexed requester, bytes32 consentHash);
    event ConsentRevoked(uint256 indexed userId, address indexed requester);

    constructor(address _kycRegistry) {
        require(_kycRegistry != address(0), "Invalid KYC registry");
        kycRegistry = KYCRegistry(_kycRegistry);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PRIVACY_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Update user privacy settings
     */
    function updatePrivacySettings(
        bool _allowCreditScoring,
        bool _allowDataSharing,
        bool _allowAnalytics,
        string[] calldata _restrictedJurisdictions,
        uint256 _dataRetentionPeriod
    ) external {
        uint256 userId = kycRegistry.walletToUserId(msg.sender);
        require(userId != 0, "User not registered");
        require(_dataRetentionPeriod >= 30 days, "Minimum retention period is 30 days");

        userPrivacySettings[userId] = PrivacySettings({
            allowCreditScoring: _allowCreditScoring,
            allowDataSharing: _allowDataSharing,
            allowAnalytics: _allowAnalytics,
            restrictedJurisdictions: _restrictedJurisdictions,
            dataRetentionPeriod: _dataRetentionPeriod
        });

        emit PrivacySettingsUpdated(userId);
    }

    /**
     * @dev Submit data access request
     */
    function submitDataRequest(
        uint256 _userId,
        string[] calldata _requestedFields,
        string calldata _purpose
    ) external returns (bytes32 requestId) {
        require(_userId != 0, "Invalid user ID");
        require(_requestedFields.length > 0, "No fields requested");
        require(bytes(_purpose).length > 0, "Purpose required");

        requestId = keccak256(abi.encodePacked(_userId, msg.sender, block.timestamp, _purpose));
        
        dataRequests[requestId] = DataRequest({
            requestId: requestId,
            userId: _userId,
            requester: msg.sender,
            requestedFields: _requestedFields,
            purpose: _purpose,
            timestamp: block.timestamp,
            approved: false,
            processed: false
        });

        emit DataRequestSubmitted(requestId, _userId, msg.sender);
        return requestId;
    }

    /**
     * @dev Approve data request and grant permission
     */
    function approveDataRequest(
        bytes32 _requestId,
        uint256 _permissionDuration,
        bytes calldata _signature
    ) external {
        DataRequest storage request = dataRequests[_requestId];
        require(request.requestId == _requestId, "Request not found");
        require(request.userId == kycRegistry.walletToUserId(msg.sender), "Unauthorized");
        require(!request.processed, "Already processed");

        // Verify signature for consent
        bytes32 consentHash = keccak256(abi.encodePacked(_requestId, _permissionDuration, msg.sender));
        address signer = consentHash.toEthSignedMessageHash().recover(_signature);
        require(signer == msg.sender, "Invalid signature");

        // Check privacy settings
        PrivacySettings memory settings = userPrivacySettings[request.userId];
        require(settings.allowDataSharing, "Data sharing not allowed");

        // Create permission
        bytes32 permissionId = keccak256(abi.encodePacked(_requestId, block.timestamp));
        
        dataPermissions[permissionId] = DataPermission({
            userId: request.userId,
            requester: request.requester,
            dataFields: request.requestedFields,
            expiryTimestamp: block.timestamp + _permissionDuration,
            isActive: true,
            consentHash: consentHash
        });

        userDataPermissions[request.userId].push(permissionId);
        userConsents[request.userId][request.requester] = true;

        request.approved = true;
        request.processed = true;

        emit DataPermissionGranted(permissionId, request.userId, request.requester);
        emit ConsentGiven(request.userId, request.requester, consentHash);
    }

    /**
     * @dev Revoke data permission
     */
    function revokeDataPermission(bytes32 _permissionId) external {
        DataPermission storage permission = dataPermissions[_permissionId];
        require(permission.userId == kycRegistry.walletToUserId(msg.sender), "Unauthorized");
        require(permission.isActive, "Permission already inactive");

        permission.isActive = false;
        userConsents[permission.userId][permission.requester] = false;

        emit DataPermissionRevoked(_permissionId, permission.userId);
        emit ConsentRevoked(permission.userId, permission.requester);
    }

    /**
     * @dev Check if requester has permission to access specific data
     */
    function hasDataPermission(
        uint256 _userId,
        address _requester,
        string calldata _dataField
    ) external view returns (bool) {
        bytes32[] memory permissions = userDataPermissions[_userId];
        
        for (uint i = 0; i < permissions.length; i++) {
            DataPermission memory permission = dataPermissions[permissions[i]];
            
            if (permission.requester == _requester && 
                permission.isActive && 
                permission.expiryTimestamp > block.timestamp) {
                
                for (uint j = 0; j < permission.dataFields.length; j++) {
                    if (keccak256(bytes(permission.dataFields[j])) == keccak256(bytes(_dataField))) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * @dev Get user's active permissions
     */
    function getUserPermissions(uint256 _userId) external view returns (bytes32[] memory activePermissions) {
        require(
            _userId == kycRegistry.walletToUserId(msg.sender) || 
            hasRole(PRIVACY_ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );

        bytes32[] memory allPermissions = userDataPermissions[_userId];
        uint256 activeCount = 0;

        // Count active permissions
        for (uint i = 0; i < allPermissions.length; i++) {
            DataPermission memory permission = dataPermissions[allPermissions[i]];
            if (permission.isActive && permission.expiryTimestamp > block.timestamp) {
                activeCount++;
            }
        }

        // Create array of active permissions
        activePermissions = new bytes32[](activeCount);
        uint256 index = 0;
        
        for (uint i = 0; i < allPermissions.length; i++) {
            DataPermission memory permission = dataPermissions[allPermissions[i]];
            if (permission.isActive && permission.expiryTimestamp > block.timestamp) {
                activePermissions[index] = allPermissions[i];
                index++;
            }
        }

        return activePermissions;
    }

    /**
     * @dev Cleanup expired permissions (can be called by anyone for gas optimization)
     */
    function cleanupExpiredPermissions(uint256 _userId) external {
        bytes32[] storage permissions = userDataPermissions[_userId];
        
        for (uint i = 0; i < permissions.length; i++) {
            DataPermission storage permission = dataPermissions[permissions[i]];
            if (permission.isActive && permission.expiryTimestamp <= block.timestamp) {
                permission.isActive = false;
                emit DataPermissionRevoked(permissions[i], _userId);
            }
        }
    }

    // Admin functions
    function emergencyRevokePermission(bytes32 _permissionId) external onlyRole(PRIVACY_ADMIN_ROLE) {
        DataPermission storage permission = dataPermissions[_permissionId];
        require(permission.userId != 0, "Permission not found");
        
        permission.isActive = false;
        emit DataPermissionRevoked(_permissionId, permission.userId);
    }
}

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