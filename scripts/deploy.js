const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Deploying Flare KYC & Credit Scoring System...");

  // Get network-specific addresses
  const network = hre.network.name;
  const registryAddresses = {
    flare: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    songbird: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    coston2: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
  };

  const registryAddress = registryAddresses[network];
  const registry = await ethers.getContractAt("IFlareContractRegistry", registryAddress);
  
  const ftsoRegistryAddress = await registry.getContractAddressByName("FtsoRegistry");
  const stateConnectorAddress = await registry.getContractAddressByName("StateConnector");

  console.log(`Using FTSO Registry: ${ftsoRegistryAddress}`);
  console.log(`Using State Connector: ${stateConnectorAddress}`);

  // Deploy contracts in order
  console.log("\n1. Deploying KYCRegistry...");
  const KYCRegistry = await ethers.getContractFactory("KYCRegistry");
  const kycRegistry = await KYCRegistry.deploy();
  await kycRegistry.deployed();
  console.log(`KYCRegistry deployed to: ${kycRegistry.address}`);

  console.log("\n2. Deploying CreditScoring...");
  const CreditScoring = await ethers.getContractFactory("CreditScoring");
  const creditScoring = await CreditScoring.deploy(
    kycRegistry.address,
    stateConnectorAddress,
    ftsoRegistryAddress
  );
  await creditScoring.deployed();
  console.log(`CreditScoring deployed to: ${creditScoring.address}`);

  console.log("\n3. Deploying APIGateway...");
  const APIGateway = await ethers.getContractFactory("APIGateway");
  const apiGateway = await APIGateway.deploy(
    kycRegistry.address,
    creditScoring.address
  );
  await apiGateway.deployed();
  console.log(`APIGateway deployed to: ${apiGateway.address}`);

  console.log("\n4. Deploying PrivacyManager...");
  const PrivacyManager = await ethers.getContractFactory("PrivacyManager");
  const privacyManager = await PrivacyManager.deploy(kycRegistry.address);
  await privacyManager.deployed();
  console.log(`PrivacyManager deployed to: ${privacyManager.address}`);

  console.log("\n5. Deploying OracleManager...");
  const OracleManager = await ethers.getContractFactory("OracleManager");
  const oracleManager = await OracleManager.deploy(
    stateConnectorAddress,
    ftsoRegistryAddress
  );
  await oracleManager.deployed();
  console.log(`OracleManager deployed to: ${oracleManager.address}`);

  // Setup initial roles and permissions
  console.log("\n6. Setting up roles and permissions...");
  
  // Grant API consumer role to APIGateway
  await kycRegistry.grantRole(
    await kycRegistry.API_CONSUMER_ROLE(),
    apiGateway.address
  );

  // Grant oracle role to OracleManager
  await creditScoring.grantRole(
    await creditScoring.CREDIT_ORACLE_ROLE(),
    oracleManager.address
  );

  console.log("\n✅ Deployment completed successfully!");
  console.log("\nContract Addresses:");
  console.log(`KYCRegistry: ${kycRegistry.address}`);
  console.log(`CreditScoring: ${creditScoring.address}`);
  console.log(`APIGateway: ${apiGateway.address}`);
  console.log(`PrivacyManager: ${privacyManager.address}`);
  console.log(`OracleManager: ${oracleManager.address}`);

  // Save deployment info
  const deploymentInfo = {
    network: network,
    timestamp: new Date().toISOString(),
    contracts: {
      KYCRegistry: kycRegistry.address,
      CreditScoring: creditScoring.address,
      APIGateway: apiGateway.address,
      PrivacyManager: privacyManager.address,
      OracleManager: oracleManager.address
    },
    flareContracts: {
      FlareContractRegistry: registryAddress,
      FtsoRegistry: ftsoRegistryAddress,
      StateConnector: stateConnectorAddress
    }
  };

  console.log("\nDeployment info saved to deployments.json");
  require('fs').writeFileSync(
    'deployments.json', 
    JSON.stringify(deploymentInfo, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});