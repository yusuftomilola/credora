pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title CreditScoring
 * @dev Contract for calculating and storing credit scores
 */

contract CreditScoring is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    bytes32 public constant CREDIT_ORACLE_ROLE = keccak256("CREDIT_ORACLE_ROLE");
    bytes32 public constant SCORE_CALCULATOR_ROLE = keccak256("SCORE_CALCULATOR_ROLE");

    KYCRegistry public immutable kycRegistry;
    IStateConnector public immutable stateConnector;
    IFtsoRegistry public immutable ftsoRegistry;

    struct CreditProfile {
        uint256 userId;
        uint16 creditScore; // 300-850 scale
        uint256 lastUpdated;
        bool hasTraditionalCredit;
        bool hasDeFiActivity;
        uint32 onChainTransactions;
        uint256 totalVolume;
        uint8 riskLevel; // 1-10 scale
        string[] dataProviders;
    }

    struct CreditFactor {
        string name;
        uint16 weight; // out of 10000 (100.00%)
        uint16 score;
        uint256 timestamp;
        bytes32 dataHash;
    }

    mapping(uint256 => CreditProfile) public creditProfiles;
    mapping(uint256 => CreditFactor[]) public creditFactors;
    mapping(uint256 => mapping(string => uint256)) public providerScores;
    mapping(bytes32 => bool) public processedAttestations;

    uint16 public constant MIN_CREDIT_SCORE = 300;
    uint16 public constant MAX_CREDIT_SCORE = 850;
    uint16 public constant DEFAULT_CREDIT_SCORE = 500;

    event CreditProfileCreated(uint256 indexed userId, uint16 initialScore);
    event CreditScoreUpdated(uint256 indexed userId, uint16 oldScore, uint16 newScore);
    event CreditFactorAdded(uint256 indexed userId, string factorName, uint16 score);
    event ExternalDataIngested(uint256 indexed userId, string provider, bytes32 attestationId);

    constructor(
        address _kycRegistry,
        address _stateConnector,
        address _ftsoRegistry
    ) {
        require(_kycRegistry != address(0), "Invalid KYC registry");
        require(_stateConnector != address(0), "Invalid state connector");
        require(_ftsoRegistry != address(0), "Invalid FTSO registry");

        kycRegistry = KYCRegistry(_kycRegistry);
        stateConnector = IStateConnector(_stateConnector);
        ftsoRegistry = IFtsoRegistry(_ftsoRegistry);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(CREDIT_ORACLE_ROLE, msg.sender);
        _grantRole(SCORE_CALCULATOR_ROLE, msg.sender);
    }

    /**
     * @dev Initialize credit profile for a KYC-verified user
     */
    function initializeCreditProfile(uint256 _userId) external whenNotPaused {
        require(kycRegistry.isKYCValid(_userId), "User KYC not valid");
        require(creditProfiles[_userId].userId == 0, "Profile already exists");

        creditProfiles[_userId] = CreditProfile({
            userId: _userId,
            creditScore: DEFAULT_CREDIT_SCORE,
            lastUpdated: block.timestamp,
            hasTraditionalCredit: false,
            hasDeFiActivity: false,
            onChainTransactions: 0,
            totalVolume: 0,
            riskLevel: 5,
            dataProviders: new string[](0)
        });

        emit CreditProfileCreated(_userId, DEFAULT_CREDIT_SCORE);
    }

    /**
     * @dev Add on-chain transaction data to credit profile
     */
    function addTransactionData(
        uint256 _userId,
        uint32 _transactionCount,
        uint256 _volume
    ) external onlyRole(CREDIT_ORACLE_ROLE) whenNotPaused {
        require(creditProfiles[_userId].userId != 0, "Profile not found");

        CreditProfile storage profile = creditProfiles[_userId];
        profile.onChainTransactions += _transactionCount;
        profile.totalVolume += _volume;
        profile.hasDeFiActivity = true;
        profile.lastUpdated = block.timestamp;

        _recalculateCreditScore(_userId);
    }

    /**
     * @dev Ingest external credit data via State Connector
     */
    function ingestExternalCreditData(
        uint256 _userId,
        bytes32 _attestationId,
        string calldata _provider
    ) external onlyRole(CREDIT_ORACLE_ROLE) whenNotPaused {
        require(creditProfiles[_userId].userId != 0, "Profile not found");
        require(!processedAttestations[_attestationId], "Attestation already processed");

        (bool proved, bytes memory data) = stateConnector.getAttestation(_attestationId);
        require(proved, "Attestation not proved");

        // Decode attestation data (example structure)
        (uint16 externalScore, bool hasTraditionalCredit) = abi.decode(data, (uint16, bool));
        
        providerScores[_userId][_provider] = externalScore;
        creditProfiles[_userId].hasTraditionalCredit = hasTraditionalCredit;
        creditProfiles[_userId].dataProviders.push(_provider);
        processedAttestations[_attestationId] = true;

        emit ExternalDataIngested(_userId, _provider, _attestationId);
        _recalculateCreditScore(_userId);
    }

    /**
     * @dev Calculate comprehensive credit score
     */
    function _recalculateCreditScore(uint256 _userId) internal {
        CreditProfile storage profile = creditProfiles[_userId];
        uint16 oldScore = profile.creditScore;
        uint256 totalWeight = 0;
        uint256 weightedScore = 0;

        // On-chain activity scoring (30% weight)
        if (profile.hasDeFiActivity) {
            uint16 onChainScore = _calculateOnChainScore(profile);
            weightedScore += onChainScore * 3000;
            totalWeight += 3000;
        }

        // Traditional credit scoring (50% weight if available)
        if (profile.hasTraditionalCredit) {
            uint16 traditionalScore = _getAverageProviderScore(_userId);
            weightedScore += traditionalScore * 5000;
            totalWeight += 5000;
        }

        // KYC compliance scoring (20% weight)
        (, , , uint8 complianceScore, ) = kycRegistry.getUserKYCInfo(_userId);
        uint16 kycScore = MIN_CREDIT_SCORE + (complianceScore * (MAX_CREDIT_SCORE - MIN_CREDIT_SCORE)) / 100;
        weightedScore += kycScore * 2000;
        totalWeight += 2000;

        // Calculate final score
        uint16 newScore = totalWeight > 0 ? 
            uint16(weightedScore / totalWeight) : 
            DEFAULT_CREDIT_SCORE;

        // Ensure score is within bounds
        newScore = newScore < MIN_CREDIT_SCORE ? MIN_CREDIT_SCORE : newScore;
        newScore = newScore > MAX_CREDIT_SCORE ? MAX_CREDIT_SCORE : newScore;

        profile.creditScore = newScore;
        profile.lastUpdated = block.timestamp;

        // Update risk level based on score
        profile.riskLevel = _calculateRiskLevel(newScore);

        emit CreditScoreUpdated(_userId, oldScore, newScore);
    }

    /**
     * @dev Calculate on-chain activity score
     */
    function _calculateOnChainScore(CreditProfile memory _profile) internal pure returns (uint16) {
        uint256 baseScore = DEFAULT_CREDIT_SCORE;
        
        // Transaction count factor
        if (_profile.onChainTransactions > 1000) {
            baseScore += 100;
        } else if (_profile.onChainTransactions > 100) {
            baseScore += 50;
        } else if (_profile.onChainTransactions > 10) {
            baseScore += 25;
        }

        // Volume factor (simplified)
        if (_profile.totalVolume > 1000000 ether) {
            baseScore += 100;
        } else if (_profile.totalVolume > 100000 ether) {
            baseScore += 50;
        } else if (_profile.totalVolume > 10000 ether) {
            baseScore += 25;
        }

        return uint16(baseScore > MAX_CREDIT_SCORE ? MAX_CREDIT_SCORE : baseScore);
    }

    /**
     * @dev Get average score from external providers
     */
    function _getAverageProviderScore(uint256 _userId) internal view returns (uint16) {
        string[] memory providers = creditProfiles[_userId].dataProviders;
        if (providers.length == 0) return DEFAULT_CREDIT_SCORE;

        uint256 total = 0;
        uint256 count = 0;

        for (uint i = 0; i < providers.length; i++) {
            uint256 score = providerScores[_userId][providers[i]];
            if (score > 0) {
                total += score;
                count++;
            }
        }

        return count > 0 ? uint16(total / count) : DEFAULT_CREDIT_SCORE;
    }

    /**
     * @dev Calculate risk level based on credit score
     */
    function _calculateRiskLevel(uint16 _creditScore) internal pure returns (uint8) {
        if (_creditScore >= 750) return 1; // Very Low Risk
        if (_creditScore >= 700) return 2; // Low Risk
        if (_creditScore >= 650) return 3; // Low-Medium Risk
        if (_creditScore >= 600) return 4; // Medium Risk
        if (_creditScore >= 550) return 5; // Medium Risk
        if (_creditScore >= 500) return 6; // Medium-High Risk
        if (_creditScore >= 450) return 7; // High Risk
        if (_creditScore >= 400) return 8; // High Risk
        if (_creditScore >= 350) return 9; // Very High Risk
        return 10; // Extremely High Risk
    }

    /**
     * @dev Get credit score for API consumers
     */
    function getCreditScore(uint256 _userId) 
        external 
        view 
        returns (
            uint16 creditScore,
            uint256 lastUpdated,
            uint8 riskLevel,
            bool hasTraditionalCredit,
            bool hasDeFiActivity
        ) 
    {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || 
            kycRegistry.hasRole(kycRegistry.API_CONSUMER_ROLE(), msg.sender),
            "Access denied"
        );

        CreditProfile memory profile = creditProfiles[_userId];
        require(profile.userId != 0, "Profile not found");

        return (
            profile.creditScore,
            profile.lastUpdated,
            profile.riskLevel,
            profile.hasTraditionalCredit,
            profile.hasDeFiActivity
        );
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}