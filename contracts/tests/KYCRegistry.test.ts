import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { KYCRegistry } from "../typechain-types";
import {
  setupTestUsers,
  TestUsers,
  KYC_STATUS,
  DOCUMENT_TYPE,
  DEFAULT_ROLES,
  JURISDICTIONS,
  generatePersonalDataHash,
  generateRandomHash,
} from "./helpers/testHelpers";

describe("KYCRegistry", function () {
  async function deployKYCRegistryFixture() {
    const users = await setupTestUsers();
    
    const KYCRegistryFactory = await ethers.getContractFactory("KYCRegistry");
    const kycRegistry = await KYCRegistryFactory.deploy();
    await kycRegistry.waitForDeployment();

    // Grant roles
    await kycRegistry.grantRole(DEFAULT_ROLES.KYC_VERIFIER_ROLE, users.kycVerifier.address);
    await kycRegistry.grantRole(DEFAULT_ROLES.API_CONSUMER_ROLE, users.apiConsumer.address);

    return { kycRegistry, users };
  }

  describe("Deployment", function () {
    it("Should set the correct initial state", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);

      expect(await kycRegistry.hasRole(DEFAULT_ROLES.DEFAULT_ADMIN_ROLE, users.deployer.address)).to.be.true;
      expect(await kycRegistry.hasRole(DEFAULT_ROLES.KYC_VERIFIER_ROLE, users.deployer.address)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.US)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.EU)).to.be.true;
    });

    it("Should initialize supported jurisdictions", async function () {
      const { kycRegistry } = await loadFixture(deployKYCRegistryFixture);

      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.US)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.EU)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.UK)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.CA)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.AU)).to.be.true;
      expect(await kycRegistry.supportedJurisdictions(JURISDICTIONS.UNSUPPORTED)).to.be.false;
    });
  });

  describe("User Registration", function () {
    it("Should register a new user successfully", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      const personalData = { name: "John Doe", email: "john@example.com" };
      const personalDataHash = generatePersonalDataHash(personalData);
      
      await expect(
        kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US)
      )
        .to.emit(kycRegistry, "UserRegistered")
        .withArgs(1, users.user1.address, JURISDICTIONS.US);

      const userId = await kycRegistry.walletToUserId(users.user1.address);
      expect(userId).to.equal(1);

      const user = await kycRegistry.users(userId);
      expect(user.userId).to.equal(1);
      expect(user.wallet).to.equal(users.user1.address);
      expect(user.personalDataHash).to.equal(personalDataHash);
      expect(user.status).to.equal(KYC_STATUS.UNVERIFIED);
      expect(user.jurisdiction).to.equal(JURISDICTIONS.US);
      expect(user.complianceScore).to.equal(0);
      expect(user.isActive).to.be.true;
    });

    it("Should fail if user is already registered", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      await expect(
        kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US)
      ).to.be.revertedWith("User already registered");
    });

    it("Should fail with unsupported jurisdiction", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      
      await expect(
        kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.UNSUPPORTED)
      ).to.be.revertedWith("Jurisdiction not supported");
    });

    it("Should fail with invalid personal data hash", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      await expect(
        kycRegistry.connect(users.user1).registerUser(ethers.ZeroHash, JURISDICTIONS.US)
      ).to.be.revertedWith("Invalid personal data hash");
    });
  });

  describe("Document Upload", function () {
    it("Should upload a document successfully", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user first
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      const documentHash = generateRandomHash();
      const ipfsHash = "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      
      await expect(
        kycRegistry.connect(users.user1).uploadDocument(
          DOCUMENT_TYPE.PASSPORT,
          documentHash,
          ipfsHash
        )
      )
        .to.emit(kycRegistry, "DocumentUploaded")
        .withArgs(1, DOCUMENT_TYPE.PASSPORT, documentHash);
    });

    it("Should fail if user is not registered", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      const documentHash = generateRandomHash();
      const ipfsHash = "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      
      await expect(
        kycRegistry.connect(users.user1).uploadDocument(
          DOCUMENT_TYPE.PASSPORT,
          documentHash,
          ipfsHash
        )
      ).to.be.revertedWith("User not registered");
    });

    it("Should fail with invalid document hash", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user first
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      const ipfsHash = "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
      
      await expect(
        kycRegistry.connect(users.user1).uploadDocument(
          DOCUMENT_TYPE.PASSPORT,
          ethers.ZeroHash,
          ipfsHash
        )
      ).to.be.revertedWith("Invalid document hash");
    });

    it("Should fail with invalid IPFS hash", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user first
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      const documentHash = generateRandomHash();
      
      await expect(
        kycRegistry.connect(users.user1).uploadDocument(
          DOCUMENT_TYPE.PASSPORT,
          documentHash,
          ""
        )
      ).to.be.revertedWith("Invalid IPFS hash");
    });
  });

  describe("KYC Status Updates", function () {
    it("Should update KYC status successfully by verifier", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      const complianceScore = 85;
      
      await expect(
        kycRegistry.connect(users.kycVerifier).updateKYCStatus(
          1,
          KYC_STATUS.VERIFIED,
          complianceScore
        )
      )
        .to.emit(kycRegistry, "KYCStatusUpdated")
        .withArgs(1, KYC_STATUS.UNVERIFIED, KYC_STATUS.VERIFIED)
        .and.to.emit(kycRegistry, "ComplianceScoreUpdated")
        .withArgs(1, 0, complianceScore);
      
      const user = await kycRegistry.users(1);
      expect(user.status).to.equal(KYC_STATUS.VERIFIED);
      expect(user.complianceScore).to.equal(complianceScore);
      expect(user.verificationTimestamp).to.be.greaterThan(0);
      expect(user.expirationTimestamp).to.be.greaterThan(user.verificationTimestamp);
    });

    it("Should fail if not called by verifier", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      await expect(
        kycRegistry.connect(users.unauthorized).updateKYCStatus(
          1,
          KYC_STATUS.VERIFIED,
          85
        )
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);
    });

    it("Should fail with invalid user ID", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      await expect(
        kycRegistry.connect(users.kycVerifier).updateKYCStatus(
          999,
          KYC_STATUS.VERIFIED,
          85
        )
      ).to.be.revertedWith("Invalid user ID");
    });

    it("Should fail with invalid compliance score", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      await expect(
        kycRegistry.connect(users.kycVerifier).updateKYCStatus(
          1,
          KYC_STATUS.VERIFIED,
          101
        )
      ).to.be.revertedWith("Invalid compliance score");
    });
  });

  describe("KYC Information Retrieval", function () {
    it("Should return KYC info for API consumer", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register and verify user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.VERIFIED, 85);
      
      const kycInfo = await kycRegistry.connect(users.apiConsumer).getUserKYCInfo(1);
      
      expect(kycInfo.status).to.equal(KYC_STATUS.VERIFIED);
      expect(kycInfo.complianceScore).to.equal(85);
      expect(kycInfo.jurisdiction).to.equal(JURISDICTIONS.US);
      expect(kycInfo.verificationTimestamp).to.be.greaterThan(0);
      expect(kycInfo.expirationTimestamp).to.be.greaterThan(kycInfo.verificationTimestamp);
    });

    it("Should fail if not called by API consumer", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      await expect(
        kycRegistry.connect(users.unauthorized).getUserKYCInfo(1)
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);
    });
  });

  describe("KYC Validity Check", function () {
    it("Should return true for valid KYC", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register and verify user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.VERIFIED, 85);
      
      expect(await kycRegistry.isKYCValid(1)).to.be.true;
    });

    it("Should return false for unverified KYC", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register but don't verify user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      expect(await kycRegistry.isKYCValid(1)).to.be.false;
    });

    it("Should return false for expired KYC", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register and verify user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.VERIFIED, 85);
      
      // Fast forward time beyond expiration (365 days + 1 day)
      await time.increase(366 * 24 * 60 * 60);
      
      expect(await kycRegistry.isKYCValid(1)).to.be.false;
    });

    it("Should return false for invalid user ID", async function () {
      const { kycRegistry } = await loadFixture(deployKYCRegistryFixture);
      
      expect(await kycRegistry.isKYCValid(0)).to.be.false;
      expect(await kycRegistry.isKYCValid(999)).to.be.false;
    });
  });

  describe("Admin Functions", function () {
    it("Should add supported jurisdiction", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      const newJurisdiction = "JP";
      expect(await kycRegistry.supportedJurisdictions(newJurisdiction)).to.be.false;
      
      await kycRegistry.connect(users.deployer).addSupportedJurisdiction(newJurisdiction);
      expect(await kycRegistry.supportedJurisdictions(newJurisdiction)).to.be.true;
    });

    it("Should pause and unpause contract", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      await kycRegistry.connect(users.deployer).pause();
      expect(await kycRegistry.paused()).to.be.true;
      
      // Should fail to register when paused
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await expect(
        kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US)
      ).to.be.revertedWith("Pausable: paused");
      
      await kycRegistry.connect(users.deployer).unpause();
      expect(await kycRegistry.paused()).to.be.false;
      
      // Should work after unpause
      await expect(
        kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US)
      ).to.not.be.reverted;
    });

    it("Should fail admin functions if not admin", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      await expect(
        kycRegistry.connect(users.unauthorized).addSupportedJurisdiction("JP")
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);
      
      await expect(
        kycRegistry.connect(users.unauthorized).pause()
      ).to.be.revertedWith(/AccessControl: account .* is missing role/);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple document uploads", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      // Upload multiple documents
      const documents = [
        { type: DOCUMENT_TYPE.PASSPORT, hash: generateRandomHash(), ipfs: "QmPassport" },
        { type: DOCUMENT_TYPE.DRIVERS_LICENSE, hash: generateRandomHash(), ipfs: "QmLicense" },
        { type: DOCUMENT_TYPE.UTILITY_BILL, hash: generateRandomHash(), ipfs: "QmUtility" },
      ];
      
      for (const doc of documents) {
        await expect(
          kycRegistry.connect(users.user1).uploadDocument(doc.type, doc.hash, doc.ipfs)
        ).to.emit(kycRegistry, "DocumentUploaded");
      }
    });

    it("Should handle status transitions", async function () {
      const { kycRegistry, users } = await loadFixture(deployKYCRegistryFixture);
      
      // Register user
      const personalDataHash = generatePersonalDataHash({ name: "John Doe" });
      await kycRegistry.connect(users.user1).registerUser(personalDataHash, JURISDICTIONS.US);
      
      // Test status transitions
      await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.PENDING, 50);
      let user = await kycRegistry.users(1);
      expect(user.status).to.equal(KYC_STATUS.PENDING);
      
      await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.VERIFIED, 85);
      user = await kycRegistry.users(1);
      expect(user.status).to.equal(KYC_STATUS.VERIFIED);
      
      await kycRegistry.connect(users.kycVerifier).updateKYCStatus(1, KYC_STATUS.EXPIRED, 0);
      user = await kycRegistry.users(1);
      expect(user.status).to.equal(KYC_STATUS.EXPIRED);
    });
  });
});