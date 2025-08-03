// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockFlareContractRegistry
 * @dev Mock contract for testing Flare contract registry functionality
 */
contract MockFlareContractRegistry {
    mapping(string => address) private contracts;

    function setContractAddress(string calldata _name, address _address) external {
        contracts[_name] = _address;
    }

    function getContractAddressByName(string calldata _name) external view returns (address) {
        return contracts[_name];
    }
}

/**
 * @title MockFtsoRegistry
 * @dev Mock contract for testing FTSO price feeds
 */
contract MockFtsoRegistry {
    mapping(string => uint256) private prices;
    mapping(string => uint256) private timestamps;

    function setPrice(string calldata _symbol, uint256 _price) external {
        prices[_symbol] = _price;
        timestamps[_symbol] = block.timestamp;
    }

    function getCurrentPrice(string calldata _symbol) external view returns (uint256 _price, uint256 _timestamp) {
        return (prices[_symbol], timestamps[_symbol]);
    }
}

/**
 * @title MockStateConnector
 * @dev Mock contract for testing State Connector attestations
 */
contract MockStateConnector {
    mapping(bytes32 => bool) private attestationProofs;
    mapping(bytes32 => bytes) private attestationData;
    uint256 private requestCounter;

    function setAttestation(bytes32 _attestationId, bool _proved, bytes calldata _data) external {
        attestationProofs[_attestationId] = _proved;
        attestationData[_attestationId] = _data;
    }

    function requestAttestation(bytes calldata _attestationRequest) external returns (bytes32) {
        requestCounter++;
        return keccak256(abi.encodePacked(_attestationRequest, requestCounter, block.timestamp));
    }

    function getAttestation(bytes32 _attestationId) external view returns (bool _proved, bytes memory _data) {
        return (attestationProofs[_attestationId], attestationData[_attestationId]);
    }
}