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