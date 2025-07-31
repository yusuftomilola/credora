interface IFlareContractRegistry {
    function getContractAddressByName(string calldata _name) external view returns (address);
}