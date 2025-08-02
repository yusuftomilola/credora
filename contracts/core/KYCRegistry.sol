pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../utils/KYCTypes";

/**
 * @title KYCRegistry
 * @dev Core contract for managing user identities and KYC status, using shared types.
 */
contract KYCRegistry is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;
    using ECDSA for bytes32;

    bytes32 public constant KYC_VERIFIER_ROLE = keccak256("KYC_VERIFIER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant API_CONSUMER_ROLE = keccak256("API_CONSUMER_ROLE");

    Counters.Counter private _userIds;

    

    
    mapping(address => uint256) public walletToUserId;
    mapping(uint256 => KYCTypes.User) public users;
    mapping(uint256 => KYCTypes.KYCDocument[]) public userDocuments;
    mapping(bytes32 => KYCTypes.VerificationRequest) public verificationRequests;
    mapping(address => bool) public authorizedVerifiers;
    mapping(string => bool) public supportedJurisdictions;

    event UserRegistered(uint256 indexed userId, address indexed wallet, string jurisdiction);
    event KYCStatusUpdated(uint256 indexed userId, KYCTypes.KYCStatus oldStatus, KYCTypes.KYCStatus newStatus);
    event DocumentUploaded(uint256 indexed userId, KYCTypes.DocumentType docType, bytes32 documentHash);
    event VerificationRequested(bytes32 indexed requestId, uint256 indexed userId);
    event ComplianceScoreUpdated(uint256 indexed userId, uint8 oldScore, uint8 newScore);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KYC_VERIFIER_ROLE, msg.sender);
        
        supportedJurisdictions["US"] = true;
        supportedJurisdictions["EU"] = true;
        supportedJurisdictions["UK"] = true;
        supportedJurisdictions["CA"] = true;
        supportedJurisdictions["AU"] = true;
    }

    function registerUser(
        bytes32 _personalDataHash,
        string calldata _jurisdiction
    ) external whenNotPaused nonReentrant {
        require(walletToUserId[msg.sender] == 0, "User already registered");
        require(supportedJurisdictions[_jurisdiction], "Jurisdiction not supported");
        require(_personalDataHash != bytes32(0), "Invalid personal data hash");

        _userIds.increment();
        uint256 newUserId = _userIds.current();

        
        users[newUserId] = KYCTypes.User({
            userId: newUserId,
            wallet: msg.sender,
            personalDataHash: _personalDataHash,
            status: KYCTypes.KYCStatus.UNVERIFIED,
            verificationTimestamp: 0,
            expirationTimestamp: 0,
            jurisdiction: _jurisdiction,
            complianceScore: 0,
            isActive: true,
            lastUpdated: block.timestamp 
        });

        walletToUserId[msg.sender] = newUserId;

        emit UserRegistered(newUserId, msg.sender, _jurisdiction);
    }

    
    function uploadDocument(
        KYCTypes.DocumentType _docType,
        bytes32 _documentHash,
        string calldata _ipfsHash
    ) external whenNotPaused {
        uint256 userId = walletToUserId[msg.sender];
        require(userId != 0, "User not registered");
        require(_documentHash != bytes32(0), "Invalid document hash");
        require(bytes(_ipfsHash).length > 0, "Invalid IPFS hash");

        
        userDocuments[userId].push(KYCTypes.KYCDocument({
            docType: _docType,
            documentHash: _documentHash,
            ipfsHash: _ipfsHash,
            uploadTimestamp: block.timestamp,
            verified: false,
            verifiedBy: address(0),
            expiryDate: 0, 
            issuer: ""     
        }));

        emit DocumentUploaded(userId, _docType, _documentHash);
    }

    
    function updateKYCStatus(
        uint256 _userId,
        KYCTypes.KYCStatus _newStatus,
        uint8 _complianceScore
    ) external onlyRole(KYC_VERIFIER_ROLE) whenNotPaused {
        require(_userId > 0 && _userId <= _userIds.current(), "Invalid user ID");
        require(_complianceScore <= 100, "Invalid compliance score");

        
        KYCTypes.User storage user = users[_userId];
        KYCTypes.KYCStatus oldStatus = user.status;
        uint8 oldScore = user.complianceScore;

        user.status = _newStatus;
        user.complianceScore = _complianceScore;
        user.lastUpdated = block.timestamp;

        
        if (_newStatus == KYCTypes.KYCStatus.VERIFIED) {
            user.verificationTimestamp = block.timestamp;
            
            user.expirationTimestamp = block.timestamp + KYCTypes.DEFAULT_KYC_VALIDITY; 
        }

        emit KYCStatusUpdated(_userId, oldStatus, _newStatus);
        emit ComplianceScoreUpdated(_userId, oldScore, _complianceScore);
    }

    
    function getUserKYCInfo(uint256 _userId) 
        external 
        view 
        onlyRole(API_CONSUMER_ROLE) 
        returns (
            KYCTypes.KYCStatus status,
            uint256 verificationTimestamp,
            uint256 expirationTimestamp,
            uint8 complianceScore,
            string memory jurisdiction
        ) 
    {
        require(_userId > 0 && _userId <= _userIds.current(), "Invalid user ID");
        
        KYCTypes.User memory user = users[_userId];
        
        return (
            user.status,
            user.verificationTimestamp,
            user.expirationTimestamp,
            user.complianceScore,
            user.jurisdiction
        );
    }

    function isKYCValid(uint256 _userId) external view returns (bool) {
        if (_userId == 0 || _userId > _userIds.current()) return false;
        
        
        KYCTypes.User memory user = users[_userId];
        
        return user.status == KYCTypes.KYCStatus.VERIFIED && 
               user.expirationTimestamp > block.timestamp &&
               user.isActive;
    }

    
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