import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { PrivacyManager, MockKYCRegistry } from "../typechain-types";

describe("PrivacyManager", function () {
    // Constants from KYCTypes (adjust these based on your actual values)
    const MIN_DATA_RETENTION = 30 * 24 * 60 * 60; // 30 days in seconds
    const MAX_DATA_RETENTION = 365 * 24 * 60 * 60; // 365 days in seconds
    const DEFAULT_CONSENT_EXPIRY = 90 * 24 * 60 * 60; // 90 days in seconds

    interface TestFixture {
        privacyManager: PrivacyManager;
        kycRegistry: MockKYCRegistry;
        owner: SignerWithAddress;
        user1: SignerWithAddress;
        user2: SignerWithAddress;
        requester1: SignerWithAddress;
        requester2: SignerWithAddress;
        admin: SignerWithAddress;
        PRIVACY_ADMIN_ROLE: string;
        DATA_PROCESSOR_ROLE: string;
    }

    async function deployPrivacyManagerFixture(): Promise<TestFixture> {
        const [owner, user1, user2, requester1, requester2, admin]: SignerWithAddress[] = 
            await ethers.getSigners();

        // Mock KYC Registry
        const MockKYCRegistry = await ethers.getContractFactory("MockKYCRegistry");
        const kycRegistry: MockKYCRegistry = await MockKYCRegistry.deploy();
        await kycRegistry.waitForDeployment();

        // Deploy PrivacyManager
        const PrivacyManager = await ethers.getContractFactory("PrivacyManager");
        const privacyManager: PrivacyManager = await PrivacyManager.deploy(await kycRegistry.getAddress());
        await privacyManager.waitForDeployment();

        // Setup mock KYC registry with user mappings
        await kycRegistry.setUserMapping(user1.address, 1);
        await kycRegistry.setUserMapping(user2.address, 2);

        // Grant roles
        const PRIVACY_ADMIN_ROLE: string = await privacyManager.PRIVACY_ADMIN_ROLE();
        const DATA_PROCESSOR_ROLE: string = await privacyManager.DATA_PROCESSOR_ROLE();
        
        await privacyManager.grantRole(PRIVACY_ADMIN_ROLE, admin.address);

        return {
            privacyManager,
            kycRegistry,
            owner,
            user1,
            user2,
            requester1,
            requester2,
            admin,
            PRIVACY_ADMIN_ROLE,
            DATA_PROCESSOR_ROLE
        };
    }

    describe("Deployment", function () {
        it("Should set the right KYC registry", async function () {
            const { privacyManager, kycRegistry }: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            expect(await privacyManager.kycRegistry()).to.equal(await kycRegistry.getAddress());
        });

        it("Should grant DEFAULT_ADMIN_ROLE and PRIVACY_ADMIN_ROLE to deployer", async function () {
            const { privacyManager, owner }: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            
            const DEFAULT_ADMIN_ROLE: string = await privacyManager.DEFAULT_ADMIN_ROLE();
            const PRIVACY_ADMIN_ROLE: string = await privacyManager.PRIVACY_ADMIN_ROLE();
            
            expect(await privacyManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await privacyManager.hasRole(PRIVACY_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should revert if KYC registry address is zero", async function () {
            const PrivacyManager = await ethers.getContractFactory("PrivacyManager");
            
            await expect(
                PrivacyManager.deploy(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid KYC registry");
        });
    });

    describe("Privacy Settings", function () {
        it("Should update privacy settings for registered user", async function () {
            const { privacyManager, user1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            const restrictedJurisdictions: string[] = ["US", "EU"];
            const dataRetentionPeriod: number = 180 * 24 * 60 * 60; // 180 days

            await expect(
                privacyManager.connect(user1).updatePrivacySettings(
                    true,  // allowCreditScoring
                    true,  // allowDataSharing
                    false, // allowAnalytics
                    restrictedJurisdictions,
                    dataRetentionPeriod
                )
            ).to.emit(privacyManager, "PrivacySettingsUpdated")
            .withArgs(1);

            const settings = await privacyManager.userPrivacySettings(1);
            expect(settings.allowCreditScoring).to.be.true;
            expect(settings.allowDataSharing).to.be.true;
            expect(settings.allowAnalytics).to.be.false;
            expect(settings.dataRetentionPeriod).to.equal(dataRetentionPeriod);
        });

        it("Should revert if user is not registered", async function () {
            const { privacyManager, requester1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(requester1).updatePrivacySettings(
                    true, true, false, [], MIN_DATA_RETENTION
                )
            ).to.be.revertedWith("User not registered");
        });

        it("Should revert if retention period is too short", async function () {
            const { privacyManager, user1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(user1).updatePrivacySettings(
                    true, true, false, [], MIN_DATA_RETENTION - 1
                )
            ).to.be.revertedWith("Retention period too short");
        });

        it("Should revert if retention period is too long", async function () {
            const { privacyManager, user1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(user1).updatePrivacySettings(
                    true, true, false, [], MAX_DATA_RETENTION + 1
                )
            ).to.be.revertedWith("Retention period too long");
        });
    });

    describe("Data Requests", function () {
        it("Should submit data request successfully", async function () {
            const { privacyManager, user1, requester1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            
            // Setup privacy settings first
            await privacyManager.connect(user1).updatePrivacySettings(
                true, true, false, [], MIN_DATA_RETENTION
            );
            
            const userId: number = 1;
            const requestedFields: string[] = ["name", "email"];
            const purpose: string = "Credit assessment";

            await expect(
                privacyManager.connect(requester1).submitDataRequest(userId, requestedFields, purpose)
            ).to.emit(privacyManager, "DataRequestSubmitted");
        });

        it("Should revert if user ID is invalid", async function () {
            const { privacyManager, requester1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(requester1).submitDataRequest(0, ["name"], "test")
            ).to.be.revertedWith("Invalid user ID");
        });

        it("Should revert if no fields requested", async function () {
            const { privacyManager, requester1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(requester1).submitDataRequest(1, [], "test")
            ).to.be.revertedWith("No fields requested");
        });

        it("Should revert if no purpose provided", async function () {
            const { privacyManager, requester1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(requester1).submitDataRequest(1, ["name"], "")
            ).to.be.revertedWith("Purpose required");
        });
    });

    describe("Data Request Approval", function () {
        interface ApprovalFixture extends TestFixture {
            requestId: string;
        }

        async function setupDataRequestFixture(): Promise<ApprovalFixture> {
            const fixture: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            const { privacyManager, user1, requester1 } = fixture;

            // Setup privacy settings
            await privacyManager.connect(user1).updatePrivacySettings(
                true, true, false, [], MIN_DATA_RETENTION
            );

            // Submit a data request
            const tx = await privacyManager.connect(requester1).submitDataRequest(
                1, ["name", "email"], "Credit assessment"
            );
            const receipt = await tx.wait();
            
            if (!receipt || !receipt.logs) {
                throw new Error("Transaction receipt or logs not found");
            }

            const event = receipt.logs.find((log: any) => {
                try {
                    const parsedLog = privacyManager.interface.parseLog(log);
                    return parsedLog?.name === "DataRequestSubmitted";
                } catch {
                    return false;
                }
            });

            if (!event) {
                throw new Error("DataRequestSubmitted event not found");
            }

            const parsedEvent = privacyManager.interface.parseLog(event);
            const requestId: string = parsedEvent?.args[0];

            return { ...fixture, requestId };
        }

        it("Should approve data request with valid signature", async function () {
            const { privacyManager, user1, requester1, requestId }: ApprovalFixture = 
                await loadFixture(setupDataRequestFixture);

            const permissionDuration: number = 30 * 24 * 60 * 60; // 30 days
            
            // Create consent hash and signature
            const consentHash: string = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address"],
                [requestId, permissionDuration, user1.address]
            );
            const signature: string = await user1.signMessage(ethers.getBytes(consentHash));

            await expect(
                privacyManager.connect(user1).approveDataRequest(requestId, permissionDuration, signature)
            ).to.emit(privacyManager, "DataPermissionGranted")
            .and.to.emit(privacyManager, "ConsentGiven");

            // Check that user consents were updated
            expect(await privacyManager.userConsents(1, requester1.address)).to.be.true;
        });

        it("Should revert if request not found", async function () {
            const { privacyManager, user1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            
            const fakeRequestId: string = ethers.solidityPackedKeccak256(["string"], ["fake"]);
            const signature: string = await user1.signMessage(ethers.getBytes(fakeRequestId));

            await expect(
                privacyManager.connect(user1).approveDataRequest(fakeRequestId, 86400, signature)
            ).to.be.revertedWith("Request not found");
        });

        it("Should revert if unauthorized user tries to approve", async function () {
            const { privacyManager, user2, requestId }: ApprovalFixture = 
                await loadFixture(setupDataRequestFixture);
            
            const permissionDuration: number = 30 * 24 * 60 * 60;
            
            const consentHash: string = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address"],
                [requestId, permissionDuration, user2.address]
            );
            const signature: string = await user2.signMessage(ethers.getBytes(consentHash));

            await expect(
                privacyManager.connect(user2).approveDataRequest(requestId, permissionDuration, signature)
            ).to.be.revertedWith("Unauthorized");
        });

        it("Should revert with invalid signature", async function () {
            const { privacyManager, user1, user2, requestId }: ApprovalFixture = 
                await loadFixture(setupDataRequestFixture);
            
            const permissionDuration: number = 30 * 24 * 60 * 60;
            
            const consentHash: string = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address"],
                [requestId, permissionDuration, user1.address]
            );
            // Sign with wrong user
            const signature: string = await user2.signMessage(ethers.getBytes(consentHash));

            await expect(
                privacyManager.connect(user1).approveDataRequest(requestId, permissionDuration, signature)
            ).to.be.revertedWith("Invalid signature");
        });

        it("Should revert if data sharing not allowed", async function () {
            const { privacyManager, user1, requestId }: ApprovalFixture = 
                await loadFixture(setupDataRequestFixture);

            // Update privacy settings to disallow data sharing
            await privacyManager.connect(user1).updatePrivacySettings(
                true, false, false, [], MIN_DATA_RETENTION
            );

            const permissionDuration: number = 30 * 24 * 60 * 60;
            const consentHash: string = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address"],
                [requestId, permissionDuration, user1.address]
            );
            const signature: string = await user1.signMessage(ethers.getBytes(consentHash));

            await expect(
                privacyManager.connect(user1).approveDataRequest(requestId, permissionDuration, signature)
            ).to.be.revertedWith("Data sharing not allowed");
        });
    });

    describe("Permission Management", function () {
        interface PermissionFixture extends TestFixture {
            permissionId: string;
        }

        async function setupPermissionFixture(): Promise<PermissionFixture> {
            const fixture: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            const { privacyManager, user1, requester1 } = fixture;

            // Setup and approve a data request
            await privacyManager.connect(user1).updatePrivacySettings(
                true, true, false, [], MIN_DATA_RETENTION
            );

            const tx = await privacyManager.connect(requester1).submitDataRequest(
                1, ["name"], "test"
            );
            const receipt = await tx.wait();
            
            if (!receipt || !receipt.logs) {
                throw new Error("Transaction receipt or logs not found");
            }

            const requestEvent = receipt.logs.find((log: any) => {
                try {
                    const parsedLog = privacyManager.interface.parseLog(log);
                    return parsedLog?.name === "DataRequestSubmitted";
                } catch {
                    return false;
                }
            });

            if (!requestEvent) {
                throw new Error("DataRequestSubmitted event not found");
            }

            const parsedRequestEvent = privacyManager.interface.parseLog(requestEvent);
            const requestId: string = parsedRequestEvent?.args[0];

            const permissionDuration: number = 30 * 24 * 60 * 60;
            const consentHash: string = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address"],
                [requestId, permissionDuration, user1.address]
            );
            const signature: string = await user1.signMessage(ethers.getBytes(consentHash));

            const approveTx = await privacyManager.connect(user1).approveDataRequest(
                requestId, permissionDuration, signature
            );
            const approveReceipt = await approveTx.wait();
            
            if (!approveReceipt || !approveReceipt.logs) {
                throw new Error("Approve transaction receipt or logs not found");
            }

            const permissionEvent = approveReceipt.logs.find((log: any) => {
                try {
                    const parsedLog = privacyManager.interface.parseLog(log);
                    return parsedLog?.name === "DataPermissionGranted";
                } catch {
                    return false;
                }
            });

            if (!permissionEvent) {
                throw new Error("DataPermissionGranted event not found");
            }

            const parsedPermissionEvent = privacyManager.interface.parseLog(permissionEvent);
            const permissionId: string = parsedPermissionEvent?.args[0];

            return { ...fixture, permissionId };
        }

        it("Should check data permission correctly", async function () {
            const { privacyManager, requester1 }: PermissionFixture = 
                await loadFixture(setupPermissionFixture);

            const hasPermission: boolean = await privacyManager.hasDataPermission(1, requester1.address, "name");
            expect(hasPermission).to.be.true;

            const noPermission: boolean = await privacyManager.hasDataPermission(1, requester1.address, "email");
            expect(noPermission).to.be.false;
        });

        it("Should revoke data permission", async function () {
            const { privacyManager, user1, permissionId }: PermissionFixture = 
                await loadFixture(setupPermissionFixture);

            await expect(
                privacyManager.connect(user1).revokeDataPermission(permissionId)
            ).to.emit(privacyManager, "DataPermissionRevoked")
            .and.to.emit(privacyManager, "ConsentRevoked");

            const hasPermission: boolean = await privacyManager.hasDataPermission(1, user1.address, "name");
            expect(hasPermission).to.be.false;
        });

        it("Should revert if unauthorized user tries to revoke", async function () {
            const { privacyManager, user2, permissionId }: PermissionFixture = 
                await loadFixture(setupPermissionFixture);

            await expect(
                privacyManager.connect(user2).revokeDataPermission(permissionId)
            ).to.be.revertedWith("Unauthorized");
        });

        it("Should get user permissions", async function () {
            const { privacyManager, user1, permissionId }: PermissionFixture = 
                await loadFixture(setupPermissionFixture);

            const permissions: string[] = await privacyManager.connect(user1).getUserPermissions(1);
            expect(permissions.length).to.equal(1);
            expect(permissions[0]).to.equal(permissionId);
        });

        it("Should cleanup expired permissions", async function () {
            const { privacyManager }: PermissionFixture = await loadFixture(setupPermissionFixture);

            // Fast forward time to expire permissions
            await time.increase(31 * 24 * 60 * 60); // 31 days

            await expect(
                privacyManager.cleanupExpiredPermissions(1)
            ).to.emit(privacyManager, "DataPermissionRevoked");
        });
    });

    describe("Emergency Functions", function () {
        it("Should allow admin to emergency revoke permission", async function () {
            const { privacyManager, user1, requester1, admin }: TestFixture = 
                await loadFixture(deployPrivacyManagerFixture);

            // Setup and create a permission first
            await privacyManager.connect(user1).updatePrivacySettings(
                true, true, false, [], MIN_DATA_RETENTION
            );

            const tx = await privacyManager.connect(requester1).submitDataRequest(1, ["name"], "test");
            const receipt = await tx.wait();
            
            if (!receipt || !receipt.logs) {
                throw new Error("Transaction receipt or logs not found");
            }

            const requestEvent = receipt.logs.find((log: any) => {
                try {
                    const parsedLog = privacyManager.interface.parseLog(log);
                    return parsedLog?.name === "DataRequestSubmitted";
                } catch {
                    return false;
                }
            });

            if (!requestEvent) {
                throw new Error("DataRequestSubmitted event not found");
            }

            const parsedRequestEvent = privacyManager.interface.parseLog(requestEvent);
            const requestId: string = parsedRequestEvent?.args[0];

            const permissionDuration: number = 30 * 24 * 60 * 60;
            const consentHash: string = ethers.solidityPackedKeccak256(
                ["bytes32", "uint256", "address"],
                [requestId, permissionDuration, user1.address]
            );
            const signature: string = await user1.signMessage(ethers.getBytes(consentHash));

            const approveTx = await privacyManager.connect(user1).approveDataRequest(
                requestId, permissionDuration, signature
            );
            const approveReceipt = await approveTx.wait();
            
            if (!approveReceipt || !approveReceipt.logs) {
                throw new Error("Approve transaction receipt or logs not found");
            }

            const permissionEvent = approveReceipt.logs.find((log: any) => {
                try {
                    const parsedLog = privacyManager.interface.parseLog(log);
                    return parsedLog?.name === "DataPermissionGranted";
                } catch {
                    return false;
                }
            });

            if (!permissionEvent) {
                throw new Error("DataPermissionGranted event not found");
            }

            const parsedPermissionEvent = privacyManager.interface.parseLog(permissionEvent);
            const permissionId: string = parsedPermissionEvent?.args[0];

            // Admin emergency revoke
            await expect(
                privacyManager.connect(admin).emergencyRevokePermission(permissionId)
            ).to.emit(privacyManager, "DataPermissionRevoked");
        });

        it("Should revert if non-admin tries emergency revoke", async function () {
            const { privacyManager, user1 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);
            const fakePermissionId: string = ethers.solidityPackedKeccak256(["string"], ["fake"]);

            await expect(
                privacyManager.connect(user1).emergencyRevokePermission(fakePermissionId)
            ).to.be.revertedWith("AccessControl:");
        });
    });

    describe("Access Control", function () {
        it("Should revert getUserPermissions for unauthorized user", async function () {
            const { privacyManager, user2 }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            await expect(
                privacyManager.connect(user2).getUserPermissions(1)
            ).to.be.revertedWith("Unauthorized");
        });

        it("Should allow admin to get user permissions", async function () {
            const { privacyManager, admin }: TestFixture = await loadFixture(deployPrivacyManagerFixture);

            const permissions: string[] = await privacyManager.connect(admin).getUserPermissions(1);
            expect(permissions).to.be.an("array");
        });
    });
});