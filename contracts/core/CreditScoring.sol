// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../utils/KYCTypes.sol"; 
import "../interfaces/IKYCRegistry.sol"; 
import "../interfaces/IStateConnector.sol"; 
import "../interfaces/IFtsoRegistry.sol"; 

/**
 * @title CreditScoring
 * @dev Contract for calculating and storing credit scores using shared types.
 */
contract CreditScoring is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;

    bytes32 public constant CREDIT_ORACLE_ROLE = keccak256("CREDIT_ORACLE_ROLE");
    bytes32 public constant SCORE_CALCULATOR_ROLE = keccak256("SCORE_CALCULATOR_ROLE");

    IKYCRegistry public immutable kycRegistry;
    IStateConnector public immutable stateConnector;
    IFtsoRegistry public immutable ftsoRegistry;

    //

    mapping(uint256 => KYCTypes.CreditProfile) public creditProfiles;
    mapping(uint256 => KYCTypes.CreditFactor[]) public creditFactors;
    mapping(uint256 => mapping(string => uint256)) public providerScores;
    mapping(bytes32 => bool) public processedAttestations;

    event CreditProfileCreated(uint256 indexed userId, uint16 initialScore);
    event CreditScoreUpdated(uint256 indexed userId, uint16 oldScore, uint16 newScore);
    event CreditFactorAdded(uint256 indexed userId, string factorName, uint16 score);
    event ExternalDataIngested(uint256 indexed userId, string provider, bytes32 attestationId);

    constructor(
        address _kycRegistryAddress,
        address _stateConnectorAddress,
        address _ftsoRegistryAddress
    ) {
        require(_kycRegistryAddress != address(0), "Invalid KYC registry");
        require(_stateConnectorAddress != address(0), "Invalid state connector");
        require(_ftsoRegistryAddress != address(0), "Invalid FTSO registry");

        kycRegistry = IKYCRegistry(_kycRegistryAddress);
        stateConnector = IStateConnector(_stateConnectorAddress);
        ftsoRegistry = IFtsoRegistry(_ftsoRegistryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(CREDIT_ORACLE_ROLE, msg.sender);
        _grantRole(SCORE_CALCULATOR_ROLE, msg.sender);
    }

    function initializeCreditProfile(uint256 _userId) external whenNotPaused {
        require(kycRegistry.isKYCValid(_userId), "User KYC not valid");
        require(creditProfiles[_userId].userId == 0, "Profile already exists");

        
        creditProfiles[_userId] = KYCTypes.CreditProfile({
            userId: _userId,
            creditScore: KYCTypes.DEFAULT_CREDIT_SCORE,
            lastUpdated: block.timestamp,
            hasTraditionalCredit: false,
            hasDeFiActivity: false,
            onChainTransactions: 0,
            totalVolume: 0,
            riskLevel: KYCTypes.riskLevelToScore(KYCTypes.RiskLevel.MEDIUM), 
            dataProviders: new string[](0),
            scoreHistory: 0,
            volatilityIndex: 0
        });

        emit CreditProfileCreated(_userId, KYCTypes.DEFAULT_CREDIT_SCORE);
    }

    function addTransactionData(uint256 _userId, uint32 _transactionCount, uint256 _volume) external onlyRole(CREDIT_ORACLE_ROLE) whenNotPaused {
        require(creditProfiles[_userId].userId != 0, "Profile not found");

        KYCTypes.CreditProfile storage profile = creditProfiles[_userId];
        profile.onChainTransactions += _transactionCount;
        profile.totalVolume += _volume;
        profile.hasDeFiActivity = true;
        
        _recalculateCreditScore(_userId);
    }

    function ingestExternalCreditData(uint256 _userId, bytes32 _attestationId, string calldata _provider) external onlyRole(CREDIT_ORACLE_ROLE) whenNotPaused {
        require(creditProfiles[_userId].userId != 0, "Profile not found");
        require(!processedAttestations[_attestationId], "Attestation already processed");

        (bool proved, bytes memory data) = stateConnector.getAttestation(_attestationId);
        require(proved, "Attestation not proved");

        (uint16 externalScore, bool hasTraditionalCredit) = abi.decode(data, (uint16, bool));
        
        providerScores[_userId][_provider] = externalScore;
        
        KYCTypes.CreditProfile storage profile = creditProfiles[_userId];
        profile.hasTraditionalCredit = hasTraditionalCredit;
        profile.dataProviders.push(_provider);
        processedAttestations[_attestationId] = true;

        emit ExternalDataIngested(_userId, _provider, _attestationId);
        _recalculateCreditScore(_userId);
    }

    function _recalculateCreditScore(uint256 _userId) internal {
        KYCTypes.CreditProfile storage profile = creditProfiles[_userId];
        uint16 oldScore = profile.creditScore;
        uint256 totalWeight = 0;
        uint256 weightedScore = 0;

        if (profile.hasDeFiActivity) {
            uint16 onChainScore = _calculateOnChainScore(profile);
            weightedScore += onChainScore * 3000; 
            totalWeight += 3000;
        }

        if (profile.hasTraditionalCredit) {
            uint16 traditionalScore = _getAverageProviderScore(_userId);
            weightedScore += traditionalScore * 5000; 
            totalWeight += 5000;
        }

        (, , , uint8 complianceScore, ) = kycRegistry.getUserKYCInfo(_userId);
        uint16 kycScore = KYCTypes.MIN_CREDIT_SCORE + (complianceScore * (KYCTypes.MAX_CREDIT_SCORE - KYCTypes.MIN_CREDIT_SCORE)) / 100;
        weightedScore += kycScore * 2000; 
        totalWeight += 2000;

        uint16 newScore = totalWeight > 0 ? uint16(weightedScore / totalWeight) : KYCTypes.DEFAULT_CREDIT_SCORE;

        newScore = newScore < KYCTypes.MIN_CREDIT_SCORE ? KYCTypes.MIN_CREDIT_SCORE : newScore;
        newScore = newScore > KYCTypes.MAX_CREDIT_SCORE ? KYCTypes.MAX_CREDIT_SCORE : newScore;

        profile.creditScore = newScore;
        profile.lastUpdated = block.timestamp;
        
        // Use the library function for consistency
        profile.riskLevel = KYCTypes.riskLevelToScore(KYCTypes.creditScoreToRiskLevel(newScore));

        emit CreditScoreUpdated(_userId, oldScore, newScore);
    }

    function _calculateOnChainScore(KYCTypes.CreditProfile memory _profile) internal pure returns (uint16) {
        uint256 baseScore = KYCTypes.DEFAULT_CREDIT_SCORE;
        
        if (_profile.onChainTransactions > 1000) baseScore += 100;
        else if (_profile.onChainTransactions > 100) baseScore += 50;
        else if (_profile.onChainTransactions > 10) baseScore += 25;

        if (_profile.totalVolume > 1e24) baseScore += 100; // 1,000,000 ether
        else if (_profile.totalVolume > 1e23) baseScore += 50; // 100,000 ether
        else if (_profile.totalVolume > 1e22) baseScore += 25; // 10,000 ether

        return uint16(baseScore > KYCTypes.MAX_CREDIT_SCORE ? KYCTypes.MAX_CREDIT_SCORE : baseScore);
    }

    function _getAverageProviderScore(uint256 _userId) internal view returns (uint16) {
        string[] memory providers = creditProfiles[_userId].dataProviders;
        if (providers.length == 0) return KYCTypes.DEFAULT_CREDIT_SCORE;

        uint256 total = 0;
        uint256 count = 0;
        for (uint i = 0; i < providers.length; i++) {
            uint256 score = providerScores[_userId][providers[i]];
            if (score > 0) {
                total += score;
                count++;
            }
        }
        return count > 0 ? uint16(total / count) : KYCTypes.DEFAULT_CREDIT_SCORE;
    }

    function getCreditScore(uint256 _userId) external view returns (
        uint16 creditScore,
        uint256 lastUpdated,
        uint8 riskLevel,
        bool hasTraditionalCredit,
        bool hasDeFiActivity
    ) {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || kycRegistry.hasRole(kycRegistry.API_CONSUMER_ROLE(), msg.sender),
            "Access denied"
        );

        KYCTypes.CreditProfile memory profile = creditProfiles[_userId];
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