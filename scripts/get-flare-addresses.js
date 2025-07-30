const { FlareContractRegistry } = require("@flarenetwork/flare-periphery-contracts");

async function main() {
  const network = hre.network.name;
  
  // Correct Flare Contract Registry addresses by network
  const registryAddresses = {
    flare: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    songbird: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019", 
    coston2: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
  };

  const registryAddress = registryAddresses[network];  
  console.log(`Flare Contract Registry on ${network}: ${registryAddress}`);
  
  // Use the correct interface from Flare periphery contracts
  const FlareContractRegistryABI = [
    "function getContractAddressByName(string calldata _name) external view returns (address)"
  ];
  
  const registry = await ethers.getContractAt(FlareContractRegistryABI, registryAddress);
  
  try {
    const ftsoRegistry = await registry.getContractAddressByName("FtsoRegistry");
    const stateConnector = await registry.getContractAddressByName("StateConnector");
    
    console.log(`FTSO Registry: ${ftsoRegistry}`);
    console.log(`State Connector: ${stateConnector}`);
  } catch (error) {
    console.log("Error getting contract addresses:", error.message);
    console.log("You may need to use hardcoded addresses for testnet");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});