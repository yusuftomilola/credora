// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../utils/KYCTypes";


interface IKYCRegistry {
    function API_CONSUMER_ROLE() external view returns (bytes32);
    function grantRole(bytes32 role, address account) external;
    function isKYCValid(uint256 userId) external view returns (bool);
    function getUserKYCInfo(uint256 userId) external view returns (
        KYCTypes.KYCStatus status,
        uint256 verificationTimestamp,
        uint256 expirationTimestamp,
        uint8 complianceScore,
        string memory jurisdiction
    );
}