interface IStateConnector {
    function requestAttestation(bytes calldata _attestationRequest) external returns (bytes32);
    function getAttestation(bytes32 _attestationId) external view returns (bool _proved, bytes calldata _data);
}