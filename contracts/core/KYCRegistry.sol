pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title KYCRegistry
 * @dev Core contract for managing user identities and KYC status
 */

contract KYCRegistry is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;
    using ECDSA for bytes32;

    bytes32 public constant KYC_VERIFIER_ROLE = keccak256("KYC_VERIFIER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant API_CONSUMER_ROLE = keccak256("API_CONSUMER_ROLE");

    Counters.Counter private _userIds;

    enum KYCStatus { UNVERIFIED, PENDING, VERIFIED, REJECTED, EXPIRED }
    enum DocumentType { PASSPORT, DRIVERS_LICENSE, NATIONAL_ID, UTILITY_BILL, BANK_STATEMENT }

    struct User {
        uint256 userId;
        address wallet;
        bytes32 personalDataHash; // Hash of encrypted personal data stored off-chain
        KYCStatus status;
        uint256 verificationTimestamp;
        uint256 expirationTimestamp;
        string jurisdiction;
        uint8 complianceScore; // 0-100
        bool isActive;
    }

    struct KYCDocument {
        DocumentType docType;
        bytes32 documentHash;
        string ipfsHash; // For encrypted document storage
        uint256 uploadTimestamp;
        bool verified;
        address verifiedBy;
    }

    struct VerificationRequest {
        uint256 userId;
        address requester;
        uint256 timestamp;
        bytes32 requestHash;
        bool processed;
        KYCStatus result;
    }

    mapping(address => uint256) public walletToUserId;
    mapping(uint256 => User) public users;
    mapping(uint256 => KYCDocument[]) public userDocuments;
    mapping(bytes32 => VerificationRequest) public verificationRequests;
    mapping(address => bool) public authorizedVerifiers;
    mapping(string => bool) public supportedJurisdictions;

    event UserRegistered(uint256 indexed userId, address indexed wallet, string jurisdiction);
    event KYCStatusUpdated(uint256 indexed userId, KYCStatus oldStatus, KYCStatus newStatus);
    event DocumentUploaded(uint256 indexed userId, DocumentType docType, bytes32 documentHash);
    event VerificationRequested(bytes32 indexed requestId, uint256 indexed userId);
    event ComplianceScoreUpdated(uint256 indexed userId, uint8 oldScore, uint8 newScore);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KYC_VERIFIER_ROLE, msg.sender);
        
        // Initialize supported jurisdictions
        supportedJurisdictions["US"] = true;
        supportedJurisdictions["EU"] = true;
        supportedJurisdictions["UK"] = true;
        supportedJurisdictions["CA"] = true;
        supportedJurisdictions["AU"] = true;
    }

    /**
     * @dev Register a new user in the KYC system
     */
    function registerUser(
        bytes32 _personalDataHash,
        string calldata _jurisdiction
    ) external whenNotPaused nonReentrant {
        require(walletToUserId[msg.sender] == 0, "User already registered");
        require(supportedJurisdictions[_jurisdiction], "Jurisdiction not supported");
        require(_personalDataHash != bytes32(0), "Invalid personal data hash");

        _userIds.increment();
        uint256 newUserId = _userIds.current();

        users[newUserId] = User({
            userId: newUserId,
            wallet: msg.sender,
            personalDataHash: _personalDataHash,
            status: KYCStatus.UNVERIFIED,
            verificationTimestamp: 0,
            expirationTimestamp: 0,
            jurisdiction: _jurisdiction,
            complianceScore: 0,
            isActive: true
        });

        walletToUserId[msg.sender] = newUserId;

        emit UserRegistered(newUserId, msg.sender, _jurisdiction);
    }

    /**
     * @dev Upload KYC document
     */
    function uploadDocument(
        DocumentType _docType,
        bytes32 _documentHash,
        string calldata _ipfsHash
    ) external whenNotPaused {
        uint256 userId = walletToUserId[msg.sender];
        require(userId != 0, "User not registered");
        require(_documentHash != bytes32(0), "Invalid document hash");
        require(bytes(_ipfsHash).length > 0, "Invalid IPFS hash");

        userDocuments[userId].push(KYCDocument({
            docType: _docType,
            documentHash: _documentHash,
            ipfsHash: _ipfsHash,
            uploadTimestamp: block.timestamp,
            verified: false,
            verifiedBy: address(0)
        }));

        emit DocumentUploaded(userId, _docType, _documentHash);
    }

    /**
     * @dev Update KYC status (only by authorized verifiers)
     */
    function updateKYCStatus(
        uint256 _userId,
        KYCStatus _newStatus,
        uint8 _complianceScore
    ) external onlyRole(KYC_VERIFIER_ROLE) whenNotPaused {
        require(_userId > 0 && _userId <= _userIds.current(), "Invalid user ID");
        require(_complianceScore <= 100, "Invalid compliance score");

        User storage user = users[_userId];
        KYCStatus oldStatus = user.status;
        uint8 oldScore = user.complianceScore;

        user.status = _newStatus;
        user.complianceScore = _complianceScore;

        if (_newStatus == KYCStatus.VERIFIED) {
            user.verificationTimestamp = block.timestamp;
            user.expirationTimestamp = block.timestamp + 365 days; // 1 year validity
        }

        emit KYCStatusUpdated(_userId, oldStatus, _newStatus);
        emit ComplianceScoreUpdated(_userId, oldScore, _complianceScore);
    }

    /**
     * @dev Get user KYC information (with access control)
     */
    function getUserKYCInfo(uint256 _userId) 
        external 
        view 
        onlyRole(API_CONSUMER_ROLE) 
        returns (
            KYCStatus status,
            uint256 verificationTimestamp,
            uint256 expirationTimestamp,
            uint8 complianceScore,
            string memory jurisdiction
        ) 
    {
        require(_userId > 0 && _userId <= _userIds.current(), "Invalid user ID");
        User memory user = users[_userId];
        
        return (
            user.status,
            user.verificationTimestamp,
            user.expirationTimestamp,
            user.complianceScore,
            user.jurisdiction
        );
    }

    /**
     * @dev Check if user's KYC is valid and not expired
     */
    function isKYCValid(uint256 _userId) external view returns (bool) {
        if (_userId == 0 || _userId > _userIds.current()) return false;
        
        User memory user = users[_userId];
        return user.status == KYCStatus.VERIFIED && 
               user.expirationTimestamp > block.timestamp &&
               user.isActive;
    }

    // Admin functions
    function addSupportedJurisdiction(string calldata _jurisdiction) external onlyRole(DEFAULT_ADMIN_ROLE) {
        supportedJurisdictions[_jurisdiction] = true;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}