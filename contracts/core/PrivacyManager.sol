// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../utils/KYCTypes.sol";       
import "../interfaces/IKYCRegistry.sol";   

/**
 * @title PrivacyManager
 * @dev Contract for managing data privacy and selective disclosure using shared types.
 */
contract PrivacyManager is AccessControl, ReentrancyGuard {
    using ECDSA for bytes32;

    bytes32 public constant PRIVACY_ADMIN_ROLE = keccak256("PRIVACY_ADMIN_ROLE");
    bytes32 public constant DATA_PROCESSOR_ROLE = keccak256("DATA_PROCESSOR_ROLE");

    IKYCRegistry public immutable kycRegistry;
    
    mapping(uint256 => KYCTypes.PrivacySettings) public userPrivacySettings;
    mapping(bytes32 => KYCTypes.DataPermission) public dataPermissions;
    mapping(bytes32 => KYCTypes.DataRequest) public dataRequests;
    mapping(uint256 => mapping(address => bool)) public userConsents;
    mapping(uint256 => bytes32[]) public userDataPermissions;

    event PrivacySettingsUpdated(uint256 indexed userId);
    event DataPermissionGranted(bytes32 indexed permissionId, uint256 indexed userId, address indexed requester);
    event DataPermissionRevoked(bytes32 indexed permissionId, uint256 indexed userId);
    event DataRequestSubmitted(bytes32 indexed requestId, uint256 indexed userId, address indexed requester);
    event ConsentGiven(uint256 indexed userId, address indexed requester, bytes32 consentHash);
    event ConsentRevoked(uint256 indexed userId, address indexed requester);

    constructor(address _kycRegistryAddress) {
        require(_kycRegistryAddress != address(0), "Invalid KYC registry");
        kycRegistry = IKYCRegistry(_kycRegistryAddress);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PRIVACY_ADMIN_ROLE, msg.sender);
    }

    function updatePrivacySettings(
        bool _allowCreditScoring,
        bool _allowDataSharing,
        bool _allowAnalytics,
        string[] calldata _restrictedJurisdictions,
        uint256 _dataRetentionPeriod
    ) external {
        uint256 userId = kycRegistry.walletToUserId(msg.sender);
        require(userId != 0, "User not registered");
        require(_dataRetentionPeriod >= KYCTypes.MIN_DATA_RETENTION, "Retention period too short");
        require(_dataRetentionPeriod <= KYCTypes.MAX_DATA_RETENTION, "Retention period too long");

        
        userPrivacySettings[userId] = KYCTypes.PrivacySettings({
            allowCreditScoring: _allowCreditScoring,
            allowDataSharing: _allowDataSharing,
            allowAnalytics: _allowAnalytics,
            restrictedJurisdictions: _restrictedJurisdictions,
            dataRetentionPeriod: _dataRetentionPeriod,
            defaultConsentLevel: KYCTypes.ConsentLevel.BASIC,
            requireExplicitConsent: true,
            consentExpiryPeriod: KYCTypes.DEFAULT_CONSENT_EXPIRY
        });

        emit PrivacySettingsUpdated(userId);
    }

    function submitDataRequest(
        uint256 _userId,
        string[] calldata _requestedFields,
        string calldata _purpose
    ) external returns (bytes32 requestId) {
        require(_userId != 0, "Invalid user ID");
        require(_requestedFields.length > 0, "No fields requested");
        require(bytes(_purpose).length > 0, "Purpose required");

        requestId = keccak256(abi.encodePacked(_userId, msg.sender, block.timestamp, _purpose));
        
        
        dataRequests[requestId] = KYCTypes.DataRequest({
            requestId: requestId,
            userId: _userId,
            requester: msg.sender,
            requestedFields: _requestedFields,
            purpose: _purpose,
            timestamp: block.timestamp,
            approved: false,
            processed: false,
            expiryTimestamp: block.timestamp + 1 days,
            requestedLevel: KYCTypes.ConsentLevel.BASIC
        });

        emit DataRequestSubmitted(requestId, _userId, msg.sender);
        return requestId;
    }

    function approveDataRequest(bytes32 _requestId, uint256 _permissionDuration, bytes calldata _signature) external {
        KYCTypes.DataRequest storage request = dataRequests[_requestId];
        require(request.requestId == _requestId, "Request not found");
        uint256 userId = kycRegistry.walletToUserId(msg.sender);
        require(request.userId == userId, "Unauthorized");
        require(!request.processed, "Already processed");

        bytes32 consentHash = keccak256(abi.encodePacked(_requestId, _permissionDuration, msg.sender));
        address signer = consentHash.toEthSignedMessageHash().recover(_signature);
        require(signer == msg.sender, "Invalid signature");

        KYCTypes.PrivacySettings memory settings = userPrivacySettings[request.userId];
        require(settings.allowDataSharing, "Data sharing not allowed");

        bytes32 permissionId = keccak256(abi.encodePacked(_requestId, block.timestamp));
        
        
        dataPermissions[permissionId] = KYCTypes.DataPermission({
            userId: request.userId,
            requester: request.requester,
            dataFields: request.requestedFields,
            expiryTimestamp: block.timestamp + _permissionDuration,
            isActive: true,
            consentHash: consentHash,
            consentLevel: KYCTypes.ConsentLevel.BASIC, 
            usageCount: 0,
            lastUsed: 0
        });

        userDataPermissions[request.userId].push(permissionId);
        userConsents[request.userId][request.requester] = true;
        request.approved = true;
        request.processed = true;

        emit DataPermissionGranted(permissionId, request.userId, request.requester);
        emit ConsentGiven(request.userId, request.requester, consentHash);
    }

    function revokeDataPermission(bytes32 _permissionId) external {
        KYCTypes.DataPermission storage permission = dataPermissions[_permissionId];
        require(permission.userId == kycRegistry.walletToUserId(msg.sender), "Unauthorized");
        require(permission.isActive, "Permission already inactive");

        permission.isActive = false;
        userConsents[permission.userId][permission.requester] = false;

        emit DataPermissionRevoked(_permissionId, permission.userId);
        emit ConsentRevoked(permission.userId, permission.requester);
    }

    function hasDataPermission(uint256 _userId, address _requester, string calldata _dataField) external view returns (bool) {
        bytes32[] memory permissions = userDataPermissions[_userId];
        
        for (uint i = 0; i < permissions.length; i++) {
            KYCTypes.DataPermission memory p = dataPermissions[permissions[i]];
            if (p.requester == _requester && p.isActive && p.expiryTimestamp > block.timestamp) {
                for (uint j = 0; j < p.dataFields.length; j++) {
                    if (keccak256(bytes(p.dataFields[j])) == keccak256(bytes(_dataField))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function getUserPermissions(uint256 _userId) external view returns (bytes32[] memory) {
        require(
            _userId == kycRegistry.walletToUserId(msg.sender) || hasRole(PRIVACY_ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );

        bytes32[] memory allPermissions = userDataPermissions[_userId];
        bytes32[] memory activePermissions = new bytes32[](allPermissions.length);
        uint256 activeCount = 0;
        
        for (uint i = 0; i < allPermissions.length; i++) {
            KYCTypes.DataPermission memory p = dataPermissions[allPermissions[i]];
            if (p.isActive && p.expiryTimestamp > block.timestamp) {
                activePermissions[activeCount] = allPermissions[i];
                activeCount++;
            }
        }

        
        assembly {
            mstore(activePermissions, activeCount)
        }

        return activePermissions;
    }

    function cleanupExpiredPermissions(uint256 _userId) external {
        bytes32[] storage permissions = userDataPermissions[_userId];
        
        for (uint i = 0; i < permissions.length; i++) {
            KYCTypes.DataPermission storage p = dataPermissions[permissions[i]];
            if (p.isActive && p.expiryTimestamp <= block.timestamp) {
                p.isActive = false;
                emit DataPermissionRevoked(permissions[i], _userId);
            }
        }
    }

    function emergencyRevokePermission(bytes32 _permissionId) external onlyRole(PRIVACY_ADMIN_ROLE) {
        KYCTypes.DataPermission storage permission = dataPermissions[_permissionId];
        require(permission.userId != 0, "Permission not found");
        
        permission.isActive = false;
        emit DataPermissionRevoked(_permissionId, permission.userId);
    }
}