import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

export interface TestUsers {
  deployer: SignerWithAddress;
  kycVerifier: SignerWithAddress;
  oracle: SignerWithAddress;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
  user3: SignerWithAddress;
  apiConsumer: SignerWithAddress;
  dataProvider: SignerWithAddress;
  unauthorized: SignerWithAddress;
}

export async function setupTestUsers(): Promise<TestUsers> {
  const [
    deployer,
    kycVerifier,
    oracle,
    user1,
    user2,
    user3,
    apiConsumer,
    dataProvider,
    unauthorized,
  ] = await ethers.getSigners();

  return {
    deployer,
    kycVerifier,
    oracle,
    user1,
    user2,
    user3,
    apiConsumer,
    dataProvider,
    unauthorized,
  };
}

export const KYC_STATUS = {
  UNVERIFIED: 0,
  PENDING: 1,
  VERIFIED: 2,
  REJECTED: 3,
  EXPIRED: 4,
};

export const DOCUMENT_TYPE = {
  PASSPORT: 0,
  DRIVERS_LICENSE: 1,
  NATIONAL_ID: 2,
  UTILITY_BILL: 3,
  BANK_STATEMENT: 4,
};

export const SUBSCRIPTION_TIER = {
  FREE: 0,
  BASIC: 1,
  PREMIUM: 2,
  ENTERPRISE: 3,
};

export function generateRandomHash(): string {
  return ethers.keccak256(ethers.toUtf8Bytes(Math.random().toString()));
}

export function generatePersonalDataHash(data: any): string {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
}

export async function increaseTime(seconds: number): Promise<void> {
  await time.increase(seconds);
}

export async function setNextBlockTimestamp(timestamp: number): Promise<void> {
  await time.setNextBlockTimestamp(timestamp);
}

export function parseEther(value: string): bigint {
  return ethers.parseEther(value);
}

export function formatEther(value: bigint): string {
  return ethers.formatEther(value);
}

export async function signConsentMessage(
  signer: SignerWithAddress,
  requestId: string,
  permissionDuration: number
): Promise<string> {
  const message = ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "address"],
    [requestId, permissionDuration, signer.address]
  );
  
  return await signer.signMessage(ethers.getBytes(message));
}

export const DEFAULT_ROLES = {
  DEFAULT_ADMIN_ROLE: ethers.ZeroHash,
  KYC_VERIFIER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("KYC_VERIFIER_ROLE")),
  ORACLE_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE")),
  API_CONSUMER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("API_CONSUMER_ROLE")),
  CREDIT_ORACLE_ROLE: ethers.keccak256(ethers.toUtf8Bytes("CREDIT_ORACLE_ROLE")),
  SCORE_CALCULATOR_ROLE: ethers.keccak256(ethers.toUtf8Bytes("SCORE_CALCULATOR_ROLE")),
  API_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("API_ADMIN_ROLE")),
  PRIVACY_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("PRIVACY_ADMIN_ROLE")),
  DATA_PROCESSOR_ROLE: ethers.keccak256(ethers.toUtf8Bytes("DATA_PROCESSOR_ROLE")),
  ORACLE_ADMIN_ROLE: ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ADMIN_ROLE")),
  DATA_PROVIDER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("DATA_PROVIDER_ROLE")),
};

export const JURISDICTIONS = {
  US: "US",
  EU: "EU",
  UK: "UK",
  CA: "CA",
  AU: "AU",
  UNSUPPORTED: "XX",
};