import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private ipfsClients: any[] = [];
  constructor(private ipfsClient?: any) {
    // Support multiple IPFS nodes for redundant pinning
    const nodeUrls = (process.env.IPFS_NODE_URLS || process.env.IPFS_NODE_URL || 'http://localhost:5001').split(',');
    this.ipfsClients = nodeUrls.map(url => this.ipfsClient || require('ipfs-http-client').create({ url: url.trim() }));
  }

  // Remove constructor logic for ipfs client

  async healthCheck(): Promise<boolean> {
    try {
  const ipfs = this.ipfsClient || (await import('ipfs-http-client')).create({ url: process.env.IPFS_NODE_URL || 'http://localhost:5001' });
  const id = await ipfs.id();
      this.logger.log(`Connected to IPFS node: ${id.id}`);
      return true;
    } catch (error) {
      this.logger.error('IPFS health check failed', error);
      return false;
    }
  }

  async pinDocument(content: Buffer | string, retries = 3): Promise<string | null> {
    let lastError;
    let cid: any = null;
    // Pin to all IPFS nodes
    for (const ipfs of this.ipfsClients) {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const result = await ipfs.add(content);
          cid = result.cid;
          // Content addressing validation: verify hash matches content
          const calculatedCid = await this.calculateContentCid(content);
          if (calculatedCid !== cid.toString()) {
            this.logger.error(`Content addressing validation failed: calculated ${calculatedCid}, got ${cid.toString()}`);
            return null;
          }
          await ipfs.pin.add(cid);
          this.logger.log(`Pinned document with CID: ${cid.toString()} on node ${ipfs.getEndpointConfig ? ipfs.getEndpointConfig().host : 'unknown'}`);
          break;
        } catch (error) {
          lastError = error;
          this.logger.warn(`Pin attempt ${attempt + 1} failed on node: ${error}`);
        }
      }
    }
    if (!cid) {
      this.logger.error('Failed to pin document after retries', lastError);
      return null;
    }
    return cid.toString();
  }
  // IPFS Cluster integration (basic)
  async pinToCluster(content: Buffer | string, clusterApiUrl: string): Promise<string | null> {
    // Example: POST to IPFS Cluster REST API
    const axios = require('axios');
    try {
      const response = await axios.post(`${clusterApiUrl}/add`, content, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const cid = response.data.cid;
      this.logger.log(`Pinned to IPFS Cluster with CID: ${cid}`);
      return cid;
    } catch (error) {
      this.logger.error('IPFS Cluster pinning failed', error);
      return null;
    }
  }
  // Automated pin lifecycle monitoring and re-pin
  async monitorPinsAndRepin(): Promise<void> {
    // Example: check all pins and re-pin if missing
    for (const ipfs of this.ipfsClients) {
      // This should be called periodically (e.g., with a scheduler)
      // For demo, just logs
      this.logger.log('Monitoring pins on node:', ipfs.getEndpointConfig ? ipfs.getEndpointConfig().host : 'unknown');
      // ...add logic to check pins and re-pin if needed...
    }
  }

  async calculateContentCid(content: Buffer | string): Promise<string> {
  // Use multiformats to calculate CID for raw data
  const { CID } = await import('multiformats/cid');
  const { sha256 } = await import('multiformats/hashes/sha2');
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  const hash = await sha256.digest(bytes);
  // 0x55 is the raw codec, version 1 CID
  return CID.create(1, 0x55, hash).toString();
  }

  async getPinStatus(cid: string): Promise<boolean> {
    try {
  const ipfs = this.ipfsClient || (await import('ipfs-http-client')).create({ url: process.env.IPFS_NODE_URL || 'http://localhost:5001' });
      for await (const pin of ipfs.pin.ls({ paths: cid })) {
        if (pin.cid.toString() === cid) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error('Error checking pin status', error);
      return false;
    }
  }

  async unpinDocument(cid: string): Promise<boolean> {
    try {
  const ipfs = this.ipfsClient || (await import('ipfs-http-client')).create({ url: process.env.IPFS_NODE_URL || 'http://localhost:5001' });
      await ipfs.pin.rm(cid);
      this.logger.log(`Unpinned document with CID: ${cid}`);
      return true;
    } catch (error) {
      this.logger.error('Error unpinning document', error);
      return false;
    }
  }

  getGatewayUrl(cid: string): string {
    return `https://ipfs.io/ipfs/${cid}`;
  }

  // Add more methods for redundant pinning, cluster integration, etc.
}
