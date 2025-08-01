// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ICreditScoring {
    function getCreditScore(uint256 userId) external view returns (
        uint16 creditScore,
        uint256 lastUpdated,
        uint8 riskLevel,
        bool hasTraditionalCredit,
        bool hasDeFiActivity
    );
}