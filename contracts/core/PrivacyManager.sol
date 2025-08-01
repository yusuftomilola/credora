// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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