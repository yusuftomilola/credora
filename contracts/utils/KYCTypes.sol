// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title KYCTypes
 * @dev Shared data structures and enums for the KYC ecosystem
 */
library KYCTypes {
    

    
    /**
     * @dev KYC verification status levels
     */
    enum KYCStatus { 
        UNVERIFIED,     // 0 - Initial state, no verification attempted
        PENDING,        // 1 - Verification in progress
        VERIFIED,       // 2 - Successfully verified
        REJECTED,       // 3 - Verification failed or rejected
        EXPIRED         // 4 - Verification expired and needs renewal
    }
    
    /**
     * @dev Supported document types for KYC verification
     */
    enum DocumentType { 
        PASSPORT,           // 0 - Government issued passport
        DRIVERS_LICENSE,    // 1 - Driver's license
        NATIONAL_ID,        // 2 - National identity card
        UTILITY_BILL,       // 3 - Utility bill for address verification
        BANK_STATEMENT      // 4 - Bank statement for financial verification
    }
    
    /**
     * @dev API subscription tiers
     */
    enum SubscriptionTier { 
        FREE,           // 0 - Limited free tier
        BASIC,          // 1 - Basic paid tier
        PREMIUM,        // 2 - Premium tier with advanced features
        ENTERPRISE      // 3 - Enterprise tier with full access
    }
    
    /**
     * @dev Risk assessment levels
     */
    enum RiskLevel {
        VERY_LOW,       // 0 - Very low risk (750+ credit score)
        LOW,            // 1 - Low risk (700-749)
        LOW_MEDIUM,     // 2 - Low-medium risk (650-699)
        MEDIUM,         // 3 - Medium risk (550-649)
        MEDIUM_HIGH,    // 4 - Medium-high risk (500-549)
        HIGH,           // 5 - High risk (400-499)
        VERY_HIGH,      // 6 - Very high risk (350-399)
        EXTREME         // 7 - Extreme risk (<350)
    }
    
    /**
     * @dev Data aggregation methods for oracle feeds
     */
    enum AggregationMethod {
        AVERAGE,            // 0 - Simple arithmetic average
        MEDIAN,             // 1 - Median value
        WEIGHTED_AVERAGE,   // 2 - Weighted average based on source reliability
        MODE                // 3 - Most frequently occurring value
    }
    
    /**
     * @dev Privacy consent levels
     */
    enum ConsentLevel {
        NONE,               // 0 - No consent given
        BASIC,              // 1 - Basic data sharing consent
        EXTENDED,           // 2 - Extended data sharing consent
        FULL                // 3 - Full data sharing and analytics consent
    }
    
    
    /**
     * @dev Core user identity and KYC information
     */
    struct User {
        uint256 userId;                 // Unique user identifier
        address wallet;                 // Associated wallet address
        bytes32 personalDataHash;       // Hash of encrypted personal data stored off-chain
        KYCStatus status;               // Current KYC verification status
        uint256 verificationTimestamp;  // Timestamp of successful verification
        uint256 expirationTimestamp;    // Timestamp when KYC expires
        string jurisdiction;            // User's legal jurisdiction
        uint8 complianceScore;          // Compliance score (0-100)
        bool isActive;                  // Whether the user account is active
        uint256 lastUpdated;            // Last update timestamp
    }
    
    /**
     * @dev KYC document information
     */
    struct KYCDocument {
        DocumentType docType;           // Type of document
        bytes32 documentHash;           // Hash of the document
        string ipfsHash;                // IPFS hash for encrypted document storage
        uint256 uploadTimestamp;        // When the document was uploaded
        bool verified;                  // Whether the document has been verified
        address verifiedBy;             // Address of the verifier
        uint256 expiryDate;             // Document expiry date (if applicable)
        string issuer;                  // Document issuing authority
    }
    
    /**
     * @dev Verification request structure
     */
    struct VerificationRequest {
        uint256 userId;                 // User being verified
        address requester;              // Who requested the verification
        uint256 timestamp;              // Request timestamp
        bytes32 requestHash;            // Hash of request parameters
        bool processed;                 // Whether request has been processed
        KYCStatus result;               // Verification result
        string notes;                   // Verifier notes
        uint256 processingFee;          // Fee paid for verification
    }
    

    
    /**
     * @dev Comprehensive credit profile
     */
    struct CreditProfile {
        uint256 userId;                 // Associated user ID
        uint16 creditScore;             // Credit score (300-850 scale)
        uint256 lastUpdated;            // Last score update timestamp
        bool hasTraditionalCredit;      // Has traditional credit history
        bool hasDeFiActivity;           // Has DeFi transaction history
        uint32 onChainTransactions;     // Number of on-chain transactions
        uint256 totalVolume;            // Total transaction volume
        uint8 riskLevel;                // Risk level (1-10 scale)
        string[] dataProviders;         // List of data providers used
        uint256 scoreHistory;           // Reference to historical scores
        uint16 volatilityIndex;         // Score volatility measure
    }
    
    /**
     * @dev Individual credit scoring factor
     */
    struct CreditFactor {
        string name;                    // Factor name (e.g., "payment_history")
        uint16 weight;                  // Weight in final score (out of 10000)
        uint16 score;                   // Individual factor score
        uint256 timestamp;              // When factor was calculated
        bytes32 dataHash;               // Hash of underlying data
        string source;                  // Data source identifier
        bool verified;                  // Whether data is verified via attestation
    }
    
    /**
     * @dev Credit score historical record
     */
    struct ScoreHistory {
        uint16 score;                   // Historical score value
        uint256 timestamp;              // When score was recorded
        string reason;                  // Reason for score change
        bytes32 dataHash;               // Hash of data used for calculation
    }
    
    
    /**
     * @dev API consumer information
     */
    struct APIConsumer {
        address wallet;                 // Consumer wallet address
        string name;                    // Consumer organization name
        SubscriptionTier tier;          // Current subscription tier
        uint256 requestsUsed;           // Requests used in current period
        uint256 requestsLimit;          // Request limit for current tier
        uint256 subscriptionExpiry;     // When subscription expires
        bool isActive;                  // Whether consumer is active
        uint256 totalPaid;              // Total amount paid
        uint256 lastRequestTimestamp;   // Last API request timestamp
        string[] authorizedEndpoints;   // List of authorized endpoints
    }
    
    /**
     * @dev API endpoint configuration
     */
    struct APIEndpoint {
        string name;                    // Endpoint identifier
        uint256 cost;                   // Cost per request in wei
        bool requiresKYC;               // Whether KYC verification is required
        bool requiresCreditCheck;       // Whether credit check is required
        bool isActive;                  // Whether endpoint is active
        uint256 rateLimit;              // Rate limit (requests per hour)
        ConsentLevel requiredConsent;   // Minimum consent level required
        string[] dataFields;            // Data fields returned by endpoint
    }
    
    /**
     * @dev Data permission structure
     */
    struct DataPermission {
        uint256 userId;                 // User who granted permission
        address requester;              // Who requested access
        string[] dataFields;            // Specific data fields authorized
        uint256 expiryTimestamp;        // When permission expires
        bool isActive;                  // Whether permission is currently active
        bytes32 consentHash;            // Hash of signed consent
        ConsentLevel consentLevel;      // Level of consent granted
        uint256 usageCount;             // Number of times permission has been used
        uint256 lastUsed;               // Timestamp of last usage
    }
    
    /**
     * @dev Privacy settings for users
     */
    struct PrivacySettings {
        bool allowCreditScoring;        // Allow credit score calculation
        bool allowDataSharing;          // Allow data sharing with third parties
        bool allowAnalytics;            // Allow usage in analytics
        string[] restrictedJurisdictions; // Jurisdictions where data cannot be shared
        uint256 dataRetentionPeriod;    // How long data should be retained (seconds)
        ConsentLevel defaultConsentLevel; // Default consent level for new requests
        bool requireExplicitConsent;    // Whether all requests need explicit consent
        uint256 consentExpiryPeriod;    // Default consent expiry period
    }
    
    /**
     * @dev Data access request
     */
    struct DataRequest {
        bytes32 requestId;              // Unique request identifier
        uint256 userId;                 // Target user
        address requester;              // Requesting party
        string[] requestedFields;       // Specific data fields requested
        string purpose;                 // Purpose of data access
        uint256 timestamp;              // Request timestamp
        bool approved;                  // Whether request was approved
        bool processed;                 // Whether request has been processed
        uint256 expiryTimestamp;        // When request expires
        ConsentLevel requestedLevel;    // Requested consent level
    }
    
   
    /**
     * @dev Oracle data source information
     */
    struct OracleSource {
        string name;                    // Source identifier
        address provider;               // Provider contract address
        bool isActive;                  // Whether source is active
        uint256 reliability;            // Reliability score (0-100)
        uint256 lastUpdate;             // Last data update timestamp
        uint256 totalRequests;          // Total requests made to this source
        uint256 successfulRequests;     // Successful requests
        uint256 averageResponseTime;    // Average response time in seconds
        string[] supportedDataTypes;    // Types of data this source provides
        uint256 stakingAmount;          // Amount staked by provider
    }
    
    /**
     * @dev Data feed configuration
     */
    struct DataFeed {
        string feedId;                  // Unique feed identifier
        string dataType;                // Type of data (credit_score, kyc_status, etc.)
        OracleSource[] sources;         // Array of oracle sources
        AggregationMethod aggregationMethod; // How to combine multiple sources
        uint256 minSources;             // Minimum sources required for valid data
        uint256 maxAge;                 // Maximum age of data in seconds
        bool isActive;                  // Whether feed is active
        uint256 updateFrequency;        // How often feed should be updated
        uint256 lastAggregation;        // Last aggregation timestamp
        uint256 confidenceThreshold;    // Minimum confidence for valid data
    }
    
    /**
     * @dev Individual data point from oracle
     */
    struct DataPoint {
        uint256 value;                  // Data value
        uint256 timestamp;              // When data was recorded
        address source;                 // Source of the data
        bytes32 attestationId;          // State connector attestation ID
        bool verified;                  // Whether data is verified via attestation
        uint256 confidence;             // Confidence level (0-100)
        bytes32 dataHash;               // Hash of raw data
        string metadata;                // Additional metadata
    }
    
    
    /**
     * @dev Structured event data for better indexing
     */
    struct EventData {
        uint256 userId;                 // Associated user ID
        address actor;                  // Who triggered the event
        uint256 timestamp;              // Event timestamp
        bytes32 dataHash;               // Hash of event data
        string eventType;               // Type of event
        string description;             // Human readable description
    }
    
    
    /**
     * @dev Generic key-value pair for flexible data storage
     */
    struct KeyValue {
        string key;                     
        bytes value;                    
        uint256 timestamp;              
        address setter;                 
    }
    
    /**
     * @dev Address book entry for managing relationships
     */
    struct AddressBookEntry {
        address addr;                   
        string label;                   
        string category;                
        bool isActive;                  
        uint256 addedTimestamp;         
        uint256 lastInteraction;        
    }
    
    
    uint16 public constant MIN_CREDIT_SCORE = 300;
    uint16 public constant MAX_CREDIT_SCORE = 850;
    uint16 public constant DEFAULT_CREDIT_SCORE = 500;
    uint256 public constant DEFAULT_KYC_VALIDITY = 365 days;
    uint256 public constant DEFAULT_CONSENT_EXPIRY = 90 days;
    uint256 public constant MIN_DATA_RETENTION = 30 days;
    uint256 public constant MAX_DATA_RETENTION = 7 * 365 days; 
    
    uint8 public constant MAX_COMPLIANCE_SCORE = 100;
    uint8 public constant MAX_RISK_LEVEL = 10;
    uint256 public constant MAX_ORACLE_RELIABILITY = 100;
    uint256 public constant DEFAULT_RATE_LIMIT = 100; 
    uint256 public constant MAX_REQUEST_SIZE = 1000; 
    

    /**
     * @dev Convert risk level enum to numeric score
     */
    function riskLevelToScore(RiskLevel _riskLevel) internal pure returns (uint8) {
        if (_riskLevel == RiskLevel.VERY_LOW) return 1;
        if (_riskLevel == RiskLevel.LOW) return 2;
        if (_riskLevel == RiskLevel.LOW_MEDIUM) return 3;
        if (_riskLevel == RiskLevel.MEDIUM) return 5;
        if (_riskLevel == RiskLevel.MEDIUM_HIGH) return 6;
        if (_riskLevel == RiskLevel.HIGH) return 8;
        if (_riskLevel == RiskLevel.VERY_HIGH) return 9;
        return 10; // EXTREME
    }
    
    /**
     * @dev Convert credit score to risk level
     */
    function creditScoreToRiskLevel(uint16 _creditScore) internal pure returns (RiskLevel) {
        if (_creditScore >= 750) return RiskLevel.VERY_LOW;
        if (_creditScore >= 700) return RiskLevel.LOW;
        if (_creditScore >= 650) return RiskLevel.LOW_MEDIUM;
        if (_creditScore >= 550) return RiskLevel.MEDIUM;
        if (_creditScore >= 500) return RiskLevel.MEDIUM_HIGH;
        if (_creditScore >= 400) return RiskLevel.HIGH;
        if (_creditScore >= 350) return RiskLevel.VERY_HIGH;
        return RiskLevel.EXTREME;
    }
    
    /**
     * @dev Check if KYC status is considered valid
     */
    function isValidKYCStatus(KYCStatus _status) internal pure returns (bool) {
        return _status == KYCStatus.VERIFIED;
    }
    
    /**
     * @dev Check if document type requires additional verification
     */
    function requiresAdditionalVerification(DocumentType _docType) internal pure returns (bool) {
        return _docType == DocumentType.UTILITY_BILL || _docType == DocumentType.BANK_STATEMENT;
    }
    
    /**
     * @dev Get subscription tier request limit
     */
    function getTierRequestLimit(SubscriptionTier _tier) internal pure returns (uint256) {
        if (_tier == SubscriptionTier.FREE) return 100;
        if (_tier == SubscriptionTier.BASIC) return 1000;
        if (_tier == SubscriptionTier.PREMIUM) return 10000;
        return 100000; 
    }
    
    /**
     * @dev Get subscription tier monthly price in wei
     */
    function getTierPrice(SubscriptionTier _tier) internal pure returns (uint256) {
        if (_tier == SubscriptionTier.FREE) return 0;
        if (_tier == SubscriptionTier.BASIC) return 0.1 ether;
        if (_tier == SubscriptionTier.PREMIUM) return 1 ether;
        return 10 ether; 
    }
}