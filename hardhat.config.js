require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Flare Mainnet
    flare: {
      url: "https://flare-api.flare.network/ext/C/rpc",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 14
    },
    // Songbird Testnet
    songbird: {
      url: "https://songbird-api.flare.network/ext/C/rpc", 
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 19
    },
    // Coston2 Testnet (recommended for testing)
    coston2: {
      url: "https://coston2-api.flare.network/ext/C/rpc",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 114
    }
  },
  etherscan: {
    apiKey: {
      flare: "flare", // placeholder
      songbird: "songbird",
      coston2: "coston2"
    }
  }
};