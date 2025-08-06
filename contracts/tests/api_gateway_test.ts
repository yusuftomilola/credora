import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { APIGateway, KYCRegistry, CreditScoring, MockStateConnector, MockFtsoRegistry } from "../typechain-types";
import {
  setupTestUsers,
  TestUsers,
  KYC_STATUS,
  SUBSCRIPTION_TIER,
  DEFAULT_ROLES,
  JURISDICTIONS,
  generatePersonalDataHash,
  parseEther,
} from "./helpers/testHelpers";

describe("APIGateway", function () {
  async function deployAPIGatewayFixture() {
    const users = await setupTestUsers();
    
    // Deploy KYC Registry
    const KYCRegistryFactory = await ethers.getContractFactory("KYCRegistry");
    const kycRegistry = await KYCRegistryFactory.deploy();
    await kycRegistry.waitForDeployment();

    // Deploy mocks
    const MockStateConnectorFactory = await ethers.getContractFactory("MockStateConnector");
    const stateConnector = await MockStateConnectorFactory.deploy();
    await stateConnector.waitForDeployment();

    const MockFtsoRegistryFactory = await ethers.getContractFactory("MockFtsoRegistry");
    const ftsoRegistry = await MockFtsoRegistryFactory.deploy();
    await ftsoRegistry.waitForDeployment();

    // Deploy Credit Scoring
    const CreditScoringFactory = await ethers.getContractFactory("CreditScoring");
    const creditScoring = await CreditScoringFactory.deploy(
      await kycRegistry.getAddress(),
      await stateConnector.getAddress(),
      await ftsoRegistry.getAddress()
    );
    await creditScoring.waitForDeployment();

    // Deploy API Gateway
    const APIGatewayFactory = await ethers.getContractFactory("APIGateway");
    const apiGateway = await APIGatewayFactory.deploy(
      await kycRegistry.getAddress(),
      await creditScoring.getAddress()
    );
    await apiGateway.waitForDeployment();

    // Grant roles
    await kycRegistry.grantRole(DEFAULT_ROLES.KYC_VERIFIER_ROLE, users.kycVerifier.address);
    await kycRegistry.grantRole(DEFAULT_ROLES.API_CONSUMER_ROLE, await creditScoring.getAddress());
    await creditScoring.grantRole(DEFAULT_ROLES.CREDIT_ORACLE_ROLE, users.oracle.address);

    // Setup test user with KYC and credit profile
    const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
    await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
    await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.VERIFIED, 85);
    await creditScoring.connect(users.user1).initializeCreditProfile(1);

    return { 
      apiGateway,
      kycRegistry,
      creditScoring,
      stateConnector,
      ftsoRegistry,
      users 
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { apiGateway, kycRegistry, creditScoring, users } = 
        await loadFixture(deployAPIGatewayFixture);

      expect(await apiGateway.kycRegistry()).to.equal(await kycRegistry.getAddress());
      expect(await apiGateway.creditScoring()).to.equal(await creditScoring.getAddress());
      
      expect(await apiGateway.hasRole(DEFAULT_ROLES.DEFAULT_ADMIN_ROLE, users.deployer.address)).to.be.true;
      expect(await apiGateway.hasRole(DEFAULT_ROLES.API_ADMIN_ROLE, users.deployer.address)).to.be.true;
    });

    it("Should initialize tier limits and prices", async function () {
      const { apiGateway } = await loadFixture(deployAPIGatewayFixture);

      expect(await apiGateway.tierLimits(SUBSCRIPTION_TIER.FREE)).to.equal(100);
      expect(await apiGateway.tierLimits(SUBSCRIPTION_TIER.BASIC)).to.equal(1000);
      expect(await apiGateway.tierLimits(SUBSCRIPTION_TIER.PREMIUM)).to.equal(10000);
      expect(await apiGateway.tierLimits(SUBSCRIPTION_TIER.ENTERPRISE)).to.equal(100000);

      expect(await apiGateway.tierPrices(SUBSCRIPTION_TIER.FREE)).to.equal(0);
      expect(await apiGateway.tierPrices(SUBSCRIPTION_TIER.BASIC)).to.equal(parseEther("0.1"));
      expect(await apiGateway.tierPrices(SUBSCRIPTION_TIER.PREMIUM)).to.equal(parseEther("1"));
      expect(await apiGateway.tierPrices(SUBSCRIPTION_TIER.ENTERPRISE)).to.equal(parseEther("10"));
    });

    it("Should initialize API endpoints", async function () {
      const { apiGateway } = await loadFixture(deployAPIGatewayFixture);

      const kycEndpoint = await apiGateway.getEndpointInfo("getKYCStatus");
      expect(kycEndpoint.cost).to.equal(parseEther("0.001"));
      expect(kycEndpoint.requiresKYC).to.be.false;
      expect(kycEndpoint.isActive).to.be.true;

      const creditEndpoint = await apiGateway.getEndpointInfo("getCreditScore");
      expect(creditEndpoint.cost).to.equal(parseEther("0.005"));
      expect(creditEndpoint.requiresKYC).to.be.true;
      expect(creditEndpoint.isActive).to.be.true;

      const fullEndpoint = await apiGateway.getEndpointInfo("getFullProfile");
      expect(fullEndpoint.cost).to.equal(parseEther("0.01"));
      expect(fullEndpoint.requiresKYC).to.be.true;
      expect(fullEndpoint.isActive).to.be.true;
    });
  });

  describe("API Consumer Registration", function () {
    it("Should register free tier consumer", async function () {
      const { apiGateway, kycRegistry, users } = await loadFixture(deployAPIGatewayFixture);

      await expect(
        apiGateway.connect(users.apiConsumer).registerAPIConsumer(
          "Test Consumer",
          SUBSCRIPTION_TIER.FREE
        )
      )
        .to.emit(apiGateway, "APIConsumerRegistered")
        .withArgs(users.apiConsumer.address, "Test Consumer", SUBSCRIPTION_TIER.FREE)
        .and.to.emit(apiGateway, "PaymentReceived")
        .withArgs(users.apiConsumer.address, 0);

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.name).to.equal("Test Consumer");
      expect(consumer.tier).to.equal(SUBSCRIPTION_TIER.FREE);
      expect(consumer.requestsLimit).to.equal(100);
      expect(consumer.isActive).to.be.true;

      // Should have API consumer role in KYC registry
      expect(await kycRegistry.hasRole(DEFAULT_ROLES.API_CONSUMER_ROLE, users.apiConsumer.address)).to.be.true;
    });

    it("Should register paid tier consumer", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      const basicPrice = parseEther("0.1");
      
      await expect(
        apiGateway.connect(users.apiConsumer).registerAPIConsumer(
          "Premium Consumer",
          SUBSCRIPTION_TIER.BASIC,
          { value: basicPrice }
        )
      )
        .to.emit(apiGateway, "APIConsumerRegistered")
        .withArgs(users.apiConsumer.address, "Premium Consumer", SUBSCRIPTION_TIER.BASIC)
        .and.to.emit(apiGateway, "PaymentReceived")
        .withArgs(users.apiConsumer.address, basicPrice);

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.tier).to.equal(SUBSCRIPTION_TIER.BASIC);
      expect(consumer.requestsLimit).to.equal(1000);
      expect(consumer.totalPaid).to.equal(basicPrice);

      expect(await apiGateway.totalRevenue()).to.equal(basicPrice);
    });

    it("Should fail with insufficient payment", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await expect(
        apiGateway.connect(users.apiConsumer).registerAPIConsumer(
          "Test Consumer",
          SUBSCRIPTION_TIER.BASIC,
          { value: parseEther("0.05") } // Less than required 0.1
        )
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should fail if already registered", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.FREE
      );

      await expect(
        apiGateway.connect(users.apiConsumer).registerAPIConsumer(
          "Another Consumer",
          SUBSCRIPTION_TIER.FREE
        )
      ).to.be.revertedWith("Already registered");
    });

    it("Should refund excess payment", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      const initialBalance = await ethers.provider.getBalance(users.apiConsumer.address);
      const basicPrice = parseEther("0.1");
      const overpayment = parseEther("0.05");

      const tx = await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.BASIC,
        { value: basicPrice + overpayment }
      );
      
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const finalBalance = await ethers.provider.getBalance(users.apiConsumer.address);

      // Should have paid only the required amount (plus gas)
      expect(initialBalance - finalBalance).to.be.closeTo(basicPrice + gasUsed, parseEther("0.001"));
    });
  });

  describe("API Requests", function () {
    async function registerConsumer(apiGateway: APIGateway, user: any, tier: number = SUBSCRIPTION_TIER.FREE) {
      const payment = tier === SUBSCRIPTION_TIER.FREE ? 0 : await apiGateway.tierPrices(tier);
      await apiGateway.connect(user).registerAPIConsumer(
        "Test Consumer",
        tier,
        { value: payment }
      );
    }

    it("Should make successful KYC status request", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      const requestCost = parseEther("0.001");
      
      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: requestCost }
        )
      )
        .to.emit(apiGateway, "APIRequestMade")
        .withArgs(users.apiConsumer.address, "getKYCStatus", requestCost);

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.requestsUsed).to.equal(1);
    });

    it("Should make successful credit score request", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      const requestCost = parseEther("0.005");
      
      const result = await apiGateway.connect(users.apiConsumer).makeAPIRequest.staticCall(
        "getCreditScore",
        1,
        { value: requestCost }
      );

      expect(result.success).to.be.true;
      expect(result.data).to.not.equal("0x");

      await apiGateway.connect(users.apiConsumer).makeAPIRequest(
        "getCreditScore",
        1,
        { value: requestCost }
      );

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.requestsUsed).to.equal(1);
    });

    it("Should make successful full profile request", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      const requestCost = parseEther("0.01");
      
      const result = await apiGateway.connect(users.apiConsumer).makeAPIRequest.staticCall(
        "getFullProfile",
        1,
        { value: requestCost }
      );

      expect(result.success).to.be.true;
      expect(result.data).to.not.equal("0x");
    });

    it("Should fail if consumer not registered", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await expect(
        apiGateway.connect(users.unauthorized).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: parseEther("0.001") }
        )
      ).to.be.revertedWith("Not registered");
    });

    it("Should fail if subscription expired", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      // Fast forward 31 days to expire subscription
      await time.increase(31 * 24 * 60 * 60);

      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: parseEther("0.001") }
        )
      ).to.be.revertedWith("Subscription expired");
    });

    it("Should fail if request limit exceeded", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer, SUBSCRIPTION_TIER.FREE);

      // Make requests up to the limit (100 for free tier)
      for (let i = 0; i < 100; i++) {
        await apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: parseEther("0.001") }
        );
      }

      // 101st request should fail
      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: parseEther("0.001") }
        )
      ).to.be.revertedWith("Request limit exceeded");
    });

    it("Should fail if insufficient payment", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: parseEther("0.0005") } // Less than required 0.001
        )
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Should fail if KYC required but not valid", async function () {
      const { apiGateway, kycRegistry, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      // Register user without KYC verification
      const personalDataHash = generatePersonalDataHash({ name: "Jane Doe" });
      await kycRegistry.connect(users.user2).registerUser(personalDataHash, JURISDICTIONS.US);

      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getCreditScore",
          2, // User without KYC
          { value: parseEther("0.005") }
        )
      ).to.be.revertedWith("KYC required");
    });

    it("Should fail with unknown endpoint", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "unknownEndpoint",
          1,
          { value: parseEther("0.001") }
        )
      ).to.be.revertedWith("Unknown endpoint");
    });

    it("Should refund excess payment", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await registerConsumer(apiGateway, users.apiConsumer);

      const initialBalance = await ethers.provider.getBalance(users.apiConsumer.address);
      const requestCost = parseEther("0.001");
      const overpayment = parseEther("0.002");

      const tx = await apiGateway.connect(users.apiConsumer).makeAPIRequest(
        "getKYCStatus",
        1,
        { value: requestCost + overpayment }
      );

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const finalBalance = await ethers.provider.getBalance(users.apiConsumer.address);

      // Should have paid only the required amount (plus gas)
      expect(initialBalance - finalBalance).to.be.closeTo(requestCost + gasUsed, parseEther("0.0001"));
    });
  });

  describe("Subscription Management", function () {
    it("Should upgrade subscription tier", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      // Start with free tier
      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.FREE
      );

      const premiumPrice = parseEther("1");

      await expect(
        apiGateway.connect(users.apiConsumer).upgradeSubscription(
          SUBSCRIPTION_TIER.PREMIUM,
          { value: premiumPrice }
        )
      )
        .to.emit(apiGateway, "SubscriptionUpgraded")
        .withArgs(users.apiConsumer.address, SUBSCRIPTION_TIER.FREE, SUBSCRIPTION_TIER.PREMIUM)
        .and.to.emit(apiGateway, "PaymentReceived")
        .withArgs(users.apiConsumer.address, premiumPrice);

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.tier).to.equal(SUBSCRIPTION_TIER.PREMIUM);
      expect(consumer.requestsLimit).to.equal(10000);
    });

    it("Should fail to downgrade subscription", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      // Start with basic tier
      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.BASIC,
        { value: parseEther("0.1") }
      );

      await expect(
        apiGateway.connect(users.apiConsumer).upgradeSubscription(SUBSCRIPTION_TIER.FREE)
      ).to.be.revertedWith("Cannot downgrade");
    });

    it("Should fail upgrade with insufficient payment", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.FREE
      );

      await expect(
        apiGateway.connect(users.apiConsumer).upgradeSubscription(
          SUBSCRIPTION_TIER.PREMIUM,
          { value: parseEther("0.5") } // Less than required 1 ETH
        )
      ).to.be.revertedWith("Insufficient payment");
    });
  });

  describe("Consumer Information", function () {
    it("Should return consumer info", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.BASIC,
        { value: parseEther("0.1") }
      );

      const info = await apiGateway.getConsumerInfo(users.apiConsumer.address);
      expect(info.name).to.equal("Test Consumer");
      expect(info.tier).to.equal(SUBSCRIPTION_TIER.BASIC);
      expect(info.requestsUsed).to.equal(0);
      expect(info.requestsLimit).to.equal(1000);
      expect(info.isActive).to.be.true;
    });
  });

  describe("Admin Functions", function () {
    it("Should withdraw revenue", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      // Generate some revenue
      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.PREMIUM,
        { value: parseEther("1") }
      );

      const initialBalance = await ethers.provider.getBalance(users.deployer.address);
      const contractBalance = await ethers.provider.getBalance(await apiGateway.getAddress());

      expect(contractBalance).to.equal(parseEther("1"));

      const tx = await apiGateway.connect(users.deployer).withdrawRevenue();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const finalBalance = await ethers.provider.getBalance(users.deployer.address);
      const finalContractBalance = await ethers.provider.getBalance(await apiGateway.getAddress());

      expect(finalContractBalance).to.equal(0);
      expect(finalBalance).to.be.closeTo(initialBalance + parseEther("1") - gasUsed, parseEther("0.001"));
    });

    it("Should update endpoint configuration", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.deployer).updateEndpoint(
        "newEndpoint",
        parseEther("0.02"),
        true,
        true,
        true
      );

      const endpoint = await apiGateway.getEndpointInfo("newEndpoint");
      expect(endpoint.cost).to.equal(parseEther("0.02"));
      expect(endpoint.requiresKYC).to.be.true;
      expect(endpoint.requiresCreditCheck).to.be.true;
      expect(endpoint.isActive).to.be.true;
    });

    it("Should update tier limits and prices", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.deployer).updateTierLimits(SUBSCRIPTION_TIER.FREE, 200);
      expect(await apiGateway.tierLimits(SUBSCRIPTION_TIER.FREE)).to.equal(200);

      await apiGateway.connect(users.deployer).updateTierPrices(SUBSCRIPTION_TIER.BASIC, parseEther("0.2"));
      expect(await apiGateway.tierPrices(SUBSCRIPTION_TIER.BASIC)).to.equal(parseEther("0.2"));
    });

    it("Should deactivate consumer", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.FREE
      );

      await apiGateway.connect(users.deployer).deactivateConsumer(users.apiConsumer.address);

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.isActive).to.be.false;

      // Should fail to make requests when deactivated
      await expect(
        apiGateway.connect(users.apiConsumer).makeAPIRequest(
          "getKYCStatus",
          1,
          { value: parseEther("0.001") }
        )
      ).to.be.revertedWith("Consumer inactive");
    });

    it("Should pause and unpause contract", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.deployer).pause();
      expect(await apiGateway.paused()).to.be.true;

      await expect(
        apiGateway.connect(users.apiConsumer).registerAPIConsumer(
          "Test Consumer",
          SUBSCRIPTION_TIER.FREE
        )
      ).to.be.revertedWith("Pausable: paused");

      await apiGateway.connect(users.deployer).unpause();
      expect(await apiGateway.paused()).to.be.false;

      await expect(
        apiGateway.connect(users.apiConsumer).registerAPIConsumer(
          "Test Consumer",
          SUBSCRIPTION_TIER.FREE
        )
      ).to.not.be.reverted;
    });

    it("Should fail admin functions if not admin", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await expect(
        apiGateway.connect(users.unauthorized).withdrawRevenue()
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);

      await expect(
        apiGateway.connect(users.unauthorized).updateEndpoint("test", 0, false, false, false)
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);

      await expect(
        apiGateway.connect(users.unauthorized).deactivateConsumer(users.apiConsumer.address)
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);
    });
  });

  describe("View Functions", function () {
    it("Should return total requests", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.FREE
      );

      expect(await apiGateway.getTotalRequests()).to.equal(0);

      await apiGateway.connect(users.apiConsumer).makeAPIRequest(
        "getKYCStatus",
        1,
        { value: parseEther("0.001") }
      );

      expect(await apiGateway.getTotalRequests()).to.equal(1);
    });

    it("Should return endpoint info", async function () {
      const { apiGateway } = await loadFixture(deployAPIGatewayFixture);

      const info = await apiGateway.getEndpointInfo("getKYCStatus");
      expect(info.cost).to.equal(parseEther("0.001"));
      expect(info.requiresKYC).to.be.false;
      expect(info.requiresCreditCheck).to.be.false;
      expect(info.isActive).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle contract with no revenue", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      await expect(
        apiGateway.connect(users.deployer).withdrawRevenue()
      ).to.be.revertedWith("No revenue to withdraw");
    });

    it("Should handle multiple subscription upgrades", async function () {
      const { apiGateway, users } = await loadFixture(deployAPIGatewayFixture);

      // Start with free
      await apiGateway.connect(users.apiConsumer).registerAPIConsumer(
        "Test Consumer",
        SUBSCRIPTION_TIER.FREE
      );

      // Upgrade to basic
      await apiGateway.connect(users.apiConsumer).upgradeSubscription(
        SUBSCRIPTION_TIER.BASIC,
        { value: parseEther("0.1") }
      );

      // Upgrade to premium
      await apiGateway.connect(users.apiConsumer).upgradeSubscription(
        SUBSCRIPTION_TIER.PREMIUM,
        { value: parseEther("1") }
      );

      // Upgrade to enterprise
      await apiGateway.connect(users.apiConsumer).upgradeSubscription(
        SUBSCRIPTION_TIER.ENTERPRISE,
        { value: parseEther("10") }
      );

      const consumer = await apiGateway.apiConsumers(users.apiConsumer.address);
      expect(consumer.tier).to.equal(SUBSCRIPTION_TIER.ENTERPRISE);
      expect(consumer.requestsLimit).to.equal(100000);
      expect(consumer.totalPaid).to.equal(parseEther("11.1")); // 0.1 + 1 + 10
    });
  });
});