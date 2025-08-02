
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../utils/KYCTypes.sol"; 
import "../interfaces/IKYCRegistry.sol"; 
import "../interfaces/ICreditScoring.sol";

/**
 * @title APIGateway
 * @dev Gateway contract for external API access using shared types.
 */
contract APIGateway is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    IKYCRegistry public immutable kycRegistry;
    ICreditScoring public immutable creditScoring;

    bytes32 public constant API_ADMIN_ROLE = keccak256("API_ADMIN_ROLE");

    

    
    mapping(address => KYCTypes.APIConsumer) public apiConsumers;
    mapping(string => KYCTypes.APIEndpoint) public endpoints;
    mapping(KYCTypes.SubscriptionTier => uint256) public tierLimits;
    mapping(KYCTypes.SubscriptionTier => uint256) public tierPrices;

    Counters.Counter private _totalRequests;
    uint256 public totalRevenue;

    event APIConsumerRegistered(address indexed consumer, string name, KYCTypes.SubscriptionTier tier);
    event APIRequestMade(address indexed consumer, string endpoint, uint256 cost);
    event SubscriptionUpgraded(address indexed consumer, KYCTypes.SubscriptionTier oldTier, KYCTypes.SubscriptionTier newTier);
    event PaymentReceived(address indexed consumer, uint256 amount);

    constructor(address _kycRegistryAddress, address _creditScoringAddress) {
        require(_kycRegistryAddress != address(0), "Invalid KYC registry");
        require(_creditScoringAddress != address(0), "Invalid credit scoring");

        kycRegistry = IKYCRegistry(_kycRegistryAddress);
        creditScoring = ICreditScoring(_creditScoringAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(API_ADMIN_ROLE, msg.sender);

        _initializeTiers();
        _initializeEndpoints();
    }

    function _initializeTiers() internal {
        
        tierLimits[KYCTypes.SubscriptionTier.FREE] = KYCTypes.getTierRequestLimit(KYCTypes.SubscriptionTier.FREE);
        tierLimits[KYCTypes.SubscriptionTier.BASIC] = KYCTypes.getTierRequestLimit(KYCTypes.SubscriptionTier.BASIC);
        tierLimits[KYCTypes.SubscriptionTier.PREMIUM] = KYCTypes.getTierRequestLimit(KYCTypes.SubscriptionTier.PREMIUM);
        tierLimits[KYCTypes.SubscriptionTier.ENTERPRISE] = KYCTypes.getTierRequestLimit(KYCTypes.SubscriptionTier.ENTERPRISE);

        tierPrices[KYCTypes.SubscriptionTier.FREE] = KYCTypes.getTierPrice(KYCTypes.SubscriptionTier.FREE);
        tierPrices[KYCTypes.SubscriptionTier.BASIC] = KYCTypes.getTierPrice(KYCTypes.SubscriptionTier.BASIC);
        tierPrices[KYCTypes.SubscriptionTier.PREMIUM] = KYCTypes.getTierPrice(KYCTypes.SubscriptionTier.PREMIUM);
        tierPrices[KYCTypes.SubscriptionTier.ENTERPRISE] = KYCTypes.getTierPrice(KYCTypes.SubscriptionTier.ENTERPRISE);
    }

    function _initializeEndpoints() internal {
        
        endpoints["getKYCStatus"] = KYCTypes.APIEndpoint({
            name: "getKYCStatus",
            cost: 0.001 ether,
            requiresKYC: false,
            requiresCreditCheck: false,
            isActive: true,
            rateLimit: KYCTypes.DEFAULT_RATE_LIMIT,
            requiredConsent: KYCTypes.ConsentLevel.BASIC,
            dataFields: new string[](0)
        });

        endpoints["getCreditScore"] = KYCTypes.APIEndpoint({
            name: "getCreditScore",
            cost: 0.005 ether,
            requiresKYC: true,
            requiresCreditCheck: false,
            isActive: true,
            rateLimit: KYCTypes.DEFAULT_RATE_LIMIT,
            requiredConsent: KYCTypes.ConsentLevel.EXTENDED,
            dataFields: new string[](0)
        });

        endpoints["getFullProfile"] = KYCTypes.APIEndpoint({
            name: "getFullProfile",
            cost: 0.01 ether,
            requiresKYC: true,
            requiresCreditCheck: true,
            isActive: true,
            rateLimit: KYCTypes.DEFAULT_RATE_LIMIT,
            requiredConsent: KYCTypes.ConsentLevel.FULL,
            dataFields: new string[](0)
        });
    }

    function registerAPIConsumer(string calldata _name, KYCTypes.SubscriptionTier _tier) external payable whenNotPaused nonReentrant {
        require(bytes(_name).length > 0, "Invalid name");
        require(apiConsumers[msg.sender].wallet == address(0), "Already registered");
        
        uint256 requiredPayment = tierPrices[_tier];
        require(msg.value >= requiredPayment, "Insufficient payment");

        apiConsumers[msg.sender] = KYCTypes.APIConsumer({
            wallet: msg.sender,
            name: _name,
            tier: _tier,
            requestsUsed: 0,
            requestsLimit: tierLimits[_tier],
            subscriptionExpiry: block.timestamp + 30 days,
            isActive: true,
            totalPaid: msg.value,
            lastRequestTimestamp: block.timestamp,
            authorizedEndpoints: new string[](0)
        });

        totalRevenue += msg.value;
        kycRegistry.grantRole(kycRegistry.API_CONSUMER_ROLE(), msg.sender);

        emit APIConsumerRegistered(msg.sender, _name, _tier);
        emit PaymentReceived(msg.sender, msg.value);

        if (msg.value > requiredPayment) {
            payable(msg.sender).transfer(msg.value - requiredPayment);
        }
    }

    function makeAPIRequest(string calldata _endpoint, uint256 _userId) external payable whenNotPaused nonReentrant returns (bool success, bytes memory data) {
        KYCTypes.APIConsumer storage consumer = apiConsumers[msg.sender];
        require(consumer.wallet != address(0), "Not registered");
        require(consumer.isActive, "Consumer inactive");
        require(consumer.subscriptionExpiry > block.timestamp, "Subscription expired");
        require(consumer.requestsUsed < consumer.requestsLimit, "Request limit exceeded");

        KYCTypes.APIEndpoint memory endpoint = endpoints[_endpoint];
        require(endpoint.isActive, "Endpoint inactive");
        require(msg.value >= endpoint.cost, "Insufficient payment");

        if (endpoint.requiresKYC) {
            require(kycRegistry.isKYCValid(_userId), "KYC required");
        }

        if (keccak256(bytes(_endpoint)) == keccak256(bytes("getKYCStatus"))) {
            data = _getKYCStatusData(_userId);
        } else if (keccak256(bytes(_endpoint)) == keccak256(bytes("getCreditScore"))) {
            data = _getCreditScoreData(_userId);
        } else if (keccak256(bytes(_endpoint)) == keccak256(bytes("getFullProfile"))) {
            data = _getFullProfileData(_userId);
        } else {
            revert("Unknown endpoint");
        }

        consumer.requestsUsed++;
        consumer.lastRequestTimestamp = block.timestamp;
        consumer.totalPaid += msg.value;
        totalRevenue += msg.value;
        _totalRequests.increment();

        emit APIRequestMade(msg.sender, _endpoint, msg.value);

        if (msg.value > endpoint.cost) {
            payable(msg.sender).transfer(msg.value - endpoint.cost);
        }

        return (true, data);
    }

    function _getKYCStatusData(uint256 _userId) internal view returns (bytes memory) {
        (
            KYCTypes.KYCStatus status,
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

    function upgradeSubscription(KYCTypes.SubscriptionTier _newTier) external payable whenNotPaused nonReentrant {
        KYCTypes.APIConsumer storage consumer = apiConsumers[msg.sender];
        require(consumer.wallet != address(0), "Not registered");
        require(_newTier > consumer.tier, "Cannot downgrade");

        uint256 requiredPayment = tierPrices[_newTier];
        require(msg.value >= requiredPayment, "Insufficient payment");

        KYCTypes.SubscriptionTier oldTier = consumer.tier;
        consumer.tier = _newTier;
        consumer.requestsLimit = tierLimits[_newTier];
        consumer.subscriptionExpiry = block.timestamp + 30 days;
        consumer.totalPaid += msg.value;
        totalRevenue += msg.value;

        emit SubscriptionUpgraded(msg.sender, oldTier, _newTier);
        emit PaymentReceived(msg.sender, msg.value);

        if (msg.value > requiredPayment) {
            payable(msg.sender).transfer(msg.value - requiredPayment);
        }
    }

    function getConsumerInfo(address _consumer) external view returns (KYCTypes.APIConsumer memory) {
        return apiConsumers[_consumer];
    }

    
    function withdrawRevenue() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = address(this).balance;
        require(balance > 0, "No revenue to withdraw");
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Transfer failed.");
    }

    function updateEndpoint(string calldata _name, uint256 _cost, bool _requiresKYC, bool _requiresCreditCheck, bool _isActive) external onlyRole(API_ADMIN_ROLE) {
        endpoints[_name] = KYCTypes.APIEndpoint({
            name: _name,
            cost: _cost,
            requiresKYC: _requiresKYC,
            requiresCreditCheck: _requiresCreditCheck,
            isActive: _isActive,
            rateLimit: endpoints[_name].rateLimit,
            requiredConsent: endpoints[_name].requiredConsent,
            dataFields: endpoints[_name].dataFields
        });
    }

    function updateTierLimits(KYCTypes.SubscriptionTier _tier, uint256 _limit) external onlyRole(API_ADMIN_ROLE) {
        tierLimits[_tier] = _limit;
    }

    function updateTierPrices(KYCTypes.SubscriptionTier _tier, uint256 _price) external onlyRole(API_ADMIN_ROLE) {
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

    
    function getTotalRequests() external view returns (uint256) {
        return _totalRequests.current();
    }

    function getEndpointInfo(string calldata _name) external view returns (KYCTypes.APIEndpoint memory) {
        return endpoints[_name];
    }
}