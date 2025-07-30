interface IFtsoRegistry {
    function getCurrentPrice(string calldata _symbol) external view returns (uint256 _price, uint256 _timestamp);
}