import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { CreditScoring, KYCRegistry, MockStateConnector, MockFtsoRegistry } from "../typechain-types";
import {
  setupTestUsers,
  TestUsers,
  KYC_STATUS,
  DEFAULT_ROLES,
  JURISDICTIONS,
  generatePersonalDataHash,
  parseEther,
} from "./helpers/testHelpers";

describe("CreditScoring", function () {
  async function deployCreditScoringFixture() {
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

    // Grant roles
    await kycRegistry.grantRole(DEFAULT_ROLES.KYC_VERIFIER_ROLE, users.kycVerifier.address);
    await kycRegistry.grantRole(DEFAULT_ROLES.API_CONSUMER_ROLE, await creditScoring.getAddress());
    
    await creditScoring.grantRole(DEFAULT_ROLES.CREDIT_ORACLE_ROLE, users.oracle.address);
    await creditScoring.grantRole(DEFAULT_ROLES.SCORE_CALCULATOR_ROLE, users.oracle.address);

    // Register and verify a test user
    const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
    await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
    await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.VERIFIED, 85);

    return { 
      creditScoring, 
      kycRegistry, 
      stateConnector, 
      ftsoRegistry, 
      users 
    };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { creditScoring, kycRegistry, stateConnector, ftsoRegistry, users } = 
        await loadFixture(deployCreditScoringFixture);

      expect(await creditScoring.kycRegistry()).to.equal(await kycRegistry.getAddress());
      expect(await creditScoring.stateConnector()).to.equal(await stateConnector.getAddress());
      expect(await creditScoring.ftsoRegistry()).to.equal(await ftsoRegistry.getAddress());
      
      expect(await creditScoring.hasRole(DEFAULT_ROLES.DEFAULT_ADMIN_ROLE, users.deployer.address)).to.be.true;
      expect(await creditScoring.hasRole(DEFAULT_ROLES.CREDIT_ORACLE_ROLE, users.deployer.address)).to.be.true;
    });

    it("Should have correct constants", async function () {
      const { creditScoring } = await loadFixture(deployCreditScoringFixture);

      expect(await creditScoring.MIN_CREDIT_SCORE()).to.equal(300);
      expect(await creditScoring.MAX_CREDIT_SCORE()).to.equal(850);
      expect(await creditScoring.DEFAULT_CREDIT_SCORE()).to.equal(500);
    });
  });

  describe("Credit Profile Initialization", function () {
    it("Should initialize credit profile for KYC-verified user", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await expect(creditScoring.connect(users.user1).initializeCreditProfile(1))
        .to.emit(creditScoring, "CreditProfileCreated")
        .withArgs(1, 500);

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.userId).to.equal(1);
      expect(profile.creditScore).to.equal(500);
      expect(profile.hasTraditionalCredit).to.be.false;
      expect(profile.hasDeFiActivity).to.be.false;
      expect(profile.onChainTransactions).to.equal(0);
      expect(profile.riskLevel).to.equal(5);
    });

    it("Should fail if user KYC is not valid", async function () {
      const { creditScoring, kycRegistry, users } = await loadFixture(deployCreditScoringFixture);

      // Register user without KYC verification
      const personalDataHash = generatePersonalDataHash({ name: "Jane Doe" });
      await kycRegistry.connect(users.user2).registerUser(personalDataHash, JURISDICTIONS.US);

      await expect(
        creditScoring.connect(users.user2).initializeCreditProfile(2)
      ).to.be.revertedWith("User KYC not valid");
    });

    it("Should fail if profile already exists", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);
      
      await expect(
        creditScoring.connect(users.user1).initializeCreditProfile(1)
      ).to.be.revertedWith("Profile already exists");
    });
  });

  describe("Transaction Data Management", function () {
    it("Should add transaction data and update credit score", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      await expect(
        creditScoring.connect(users.oracle).addTransactionData(1, 100, parseEther("10"))
      ).to.emit(creditScoring, "CreditScoreUpdated");

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.onChainTransactions).to.equal(100);
      expect(profile.totalVolume).to.equal(parseEther("10"));
      expect(profile.hasDeFiActivity).to.be.true;
      expect(profile.creditScore).to.be.greaterThan(500); // Should improve from default
    });

    it("Should fail if called by non-oracle", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      await expect(
        creditScoring.connect(users.unauthorized).addTransactionData(1, 100, parseEther("10"))
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);
    });

    it("Should fail if profile not found", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await expect(
        creditScoring.connect(users.oracle).addTransactionData(999, 100, parseEther("10"))
      ).to.be.revertedWith("Profile not found");
    });
  });

  describe("External Credit Data Integration", function () {
    it("Should ingest external credit data via State Connector", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Mock attestation data
      const attestationId = ethers.keccak256(ethers.toUtf8Bytes("test-attestation"));
      const externalScore = 750;
      const hasTraditionalCredit = true;
      const attestationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [externalScore, hasTraditionalCredit]
      );

      await stateConnector.setAttestation(attestationId, true, attestationData);

      await expect(
        creditScoring.connect(users.oracle).ingestExternalCreditData(
          1,
          attestationId,
          "experian"
        )
      )
        .to.emit(creditScoring, "ExternalDataIngested")
        .withArgs(1, "experian", attestationId)
        .and.to.emit(creditScoring, "CreditScoreUpdated");

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.hasTraditionalCredit).to.be.true;
      
      const providerScore = await creditScoring.providerScores(1, "experian");
      expect(providerScore).to.equal(externalScore);
    });

    it("Should fail with unproved attestation", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      const attestationId = ethers.keccak256(ethers.toUtf8Bytes("test-attestation"));
      await stateConnector.setAttestation(attestationId, false, "0x");

      await expect(
        creditScoring.connect(users.oracle).ingestExternalCreditData(
          1,
          attestationId,
          "experian"
        )
      ).to.be.revertedWith("Attestation not proved");
    });

    it("Should fail with already processed attestation", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      const attestationId = ethers.keccak256(ethers.toUtf8Bytes("test-attestation"));
      const attestationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [750, true]
      );

      await stateConnector.setAttestation(attestationId, true, attestationData);

      // First ingestion should succeed
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        1,
        attestationId,
        "experian"
      );

      // Second ingestion should fail
      await expect(
        creditScoring.connect(users.oracle).ingestExternalCreditData(
          1,
          attestationId,
          "equifax"
        )
      ).to.be.revertedWith("Attestation already processed");
    });
  });

  describe("Credit Score Calculation", function () {
    it("Should calculate credit score with on-chain activity only", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Add significant on-chain activity
      await creditScoring.connect(users.oracle).addTransactionData(
        1, 
        1500, // High transaction count
        parseEther("2000000") // High volume
      );

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.creditScore).to.be.greaterThan(600); // Should be well above default
    });

    it("Should calculate credit score with traditional credit data", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Add external credit data
      const attestationId = ethers.keccak256(ethers.toUtf8Bytes("test-attestation"));
      const attestationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [780, true]
      );

      await stateConnector.setAttestation(attestationId, true, attestationData);
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        1,
        attestationId,
        "experian"
      );

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.creditScore).to.be.greaterThan(700); // Should reflect high external score
    });

    it("Should calculate comprehensive credit score", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Add on-chain activity
      await creditScoring.connect(users.oracle).addTransactionData(1, 500, parseEther("100000"));

      // Add external credit data
      const attestationId = ethers.keccak256(ethers.toUtf8Bytes("test-attestation"));
      const attestationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [720, true]
      );

      await stateConnector.setAttestation(attestationId, true, attestationData);
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        1,
        attestationId,
        "experian"
      );

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.creditScore).to.be.greaterThan(650);
      expect(profile.riskLevel).to.be.lessThan(5); // Lower risk with higher score
    });
  });

  describe("Risk Level Calculation", function () {
    it("Should assign correct risk levels", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Test high score -> low risk
      const highScoreAttestation = ethers.keccak256(ethers.toUtf8Bytes("high-score"));
      const highScoreData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [780, true]
      );

      await stateConnector.setAttestation(highScoreAttestation, true, highScoreData);
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        1,
        highScoreAttestation,
        "experian"
      );

      let profile = await creditScoring.creditProfiles(1);
      expect(profile.riskLevel).to.be.lessThanOrEqual(2); // Very low to low risk

      // Register another user for low score test
      const personalDataHash = generatePersonalDataHash({ name: "Jane Doe" });
      await creditScoring.kycRegistry().connect(users.user2).registerUser(personalDataHash, JURISDICTIONS.US);
      await creditScoring.kycRegistry().connect(users.kycVerifier).updateKYCStatus(2, KYC_STATUS.VERIFIED, 60);
      
      await creditScoring.connect(users.user2).initializeCreditProfile(2);

      // Test low score -> high risk
      const lowScoreAttestation = ethers.keccak256(ethers.toUtf8Bytes("low-score"));
      const lowScoreData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [350, true]
      );

      await stateConnector.setAttestation(lowScoreAttestation, true, lowScoreData);
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        2,
        lowScoreAttestation,
        "experian"
      );

      profile = await creditScoring.creditProfiles(2);
      expect(profile.riskLevel).to.be.greaterThanOrEqual(8); // Very high risk
    });
  });

  describe("Credit Score Retrieval", function () {
    it("Should return credit score for authorized caller", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      const creditInfo = await creditScoring.connect(users.deployer).getCreditScore(1);
      
      expect(creditInfo.creditScore).to.equal(500);
      expect(creditInfo.riskLevel).to.equal(5);
      expect(creditInfo.hasTraditionalCredit).to.be.false;
      expect(creditInfo.hasDeFiActivity).to.be.false;
      expect(creditInfo.lastUpdated).to.be.greaterThan(0);
    });

    it("Should fail for unauthorized caller", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      await expect(
        creditScoring.connect(users.unauthorized).getCreditScore(1)
      ).to.be.revertedWith("Access denied");
    });

    it("Should fail for non-existent profile", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await expect(
        creditScoring.connect(users.deployer).getCreditScore(999)
      ).to.be.revertedWith("Profile not found");
    });
  });

  describe("Admin Functions", function () {
    it("Should pause and unpause contract", async function () {
      const { creditScoring, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.deployer).pause();
      expect(await creditScoring.paused()).to.be.true;

      await expect(
        creditScoring.connect(users.user1).initializeCreditProfile(1)
      ).to.be.revertedWith("Pausable: paused");

      await creditScoring.connect(users.deployer).unpause();
      expect(await creditScoring.paused()).to.be.false;

      await expect(
        creditScoring.connect(users.user1).initializeCreditProfile(1)
      ).to.not.be.reverted;
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle multiple provider scores", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Add scores from multiple providers
      const providers = ["experian", "equifax", "transunion"];
      const scores = [750, 720, 780];

      for (let i = 0; i < providers.length; i++) {
        const attestationId = ethers.keccak256(ethers.toUtf8Bytes(`${providers[i]}-attestation`));
        const attestationData = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint16", "bool"],
          [scores[i], true]
        );

        await stateConnector.setAttestation(attestationId, true, attestationData);
        await creditScoring.connect(users.oracle).ingestExternalCreditData(
          1,
          attestationId,
          providers[i]
        );
      }

      const profile = await creditScoring.creditProfiles(1);
      expect(profile.hasTraditionalCredit).to.be.true;
      expect(profile.creditScore).to.be.greaterThan(700); // Should reflect average of high scores
    });

    it("Should handle score bounds correctly", async function () {
      const { creditScoring, stateConnector, users } = await loadFixture(deployCreditScoringFixture);

      await creditScoring.connect(users.user1).initializeCreditProfile(1);

      // Test extremely high external score
      const highAttestation = ethers.keccak256(ethers.toUtf8Bytes("extreme-high"));
      const highData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [900, true] // Above maximum
      );

      await stateConnector.setAttestation(highAttestation, true, highData);
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        1,
        highAttestation,
        "test-provider"
      );

      let profile = await creditScoring.creditProfiles(1);
      expect(profile.creditScore).to.be.lessThanOrEqual(850); // Should be capped at maximum

      // Register another user for low score test
      const personalDataHash = generatePersonalDataHash({ name: "Jane Doe" });
      await creditScoring.kycRegistry().connect(users.user2).registerUser(personalDataHash, JURISDICTIONS.US);
      await creditScoring.kycRegistry().connect(users.kycVerifier).updateKYCStatus(2, KYC_STATUS.VERIFIED, 10);
      
      await creditScoring.connect(users.user2).initializeCreditProfile(2);

      // Test extremely low external score
      const lowAttestation = ethers.keccak256(ethers.toUtf8Bytes("extreme-low"));
      const lowData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint16", "bool"],
        [100, true] // Below minimum
      );

      await stateConnector.setAttestation(lowAttestation, true, lowData);
      await creditScoring.connect(users.oracle).ingestExternalCreditData(
        2,
        lowAttestation,
        "test-provider"
      );

      profile = await creditScoring.creditProfiles(2);
      expect(profile.creditScore).to.be.greaterThanOrEqual(300); // Should be capped at minimum
    });
  });
});