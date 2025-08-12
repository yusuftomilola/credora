import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PlaidApi,
  PlaidEnvironments,
  Configuration,
  CountryCode,
  Products,
} from 'plaid';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TransactionsService } from 'src/transaction/transaction.service';
import { BankToken } from 'src/banking/entities/bank-token.entity';
import * as crypto from 'crypto';

@Injectable()
export class PlaidService {
  private readonly client: PlaidApi;
  private readonly logger = new Logger(PlaidService.name);

  constructor(
    private config: ConfigService,
    @InjectRepository(BankToken) private tokenRepo: Repository<BankToken>,
    private transactionsService: TransactionsService,
  ) {
    const env = this.config.get<string>('PLAID_ENV') || 'sandbox';
    const baseEnv =
      env === 'sandbox'
        ? PlaidEnvironments.sandbox
        : env === 'development'
          ? PlaidEnvironments.development
          : PlaidEnvironments.production;

    const configuration = new Configuration({
      basePath: baseEnv,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.config.get('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.config.get('PLAID_SECRET'),
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  // Encryption helper function
  private encrypt(text: string, key: string): string {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const keyBuffer = crypto.scryptSync(key, 'salt', 32);
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  // Decryption helper function
  private decrypt(encryptedText: string, key: string): string {
    const algorithm = 'aes-256-gcm';
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const keyBuffer = crypto.scryptSync(key, 'salt', 32);

    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async createLinkToken(userId: string) {
    const request = {
      user: { client_user_id: userId },
      client_name: 'My App',
      products: [Products.Transactions, Products.Auth, Products.Income],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: this.config.get<string>('PLAID_WEBHOOK_URL'), // optional: webhook url
    };

    const response = await this.client.linkTokenCreate(request);
    return response.data;
  }

  async exchangePublicToken(publicToken: string, provider = 'plaid') {
    const request = {
      public_token: publicToken,
    };

    const exchange = await this.client.itemPublicTokenExchange(request);
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // store encrypted
    const encKey = this.config.get<string>('TOKEN_ENC_KEY');
    if (!encKey) {
      throw new Error('TOKEN_ENC_KEY is not configured');
    }
    const enc = this.encrypt(accessToken, encKey);
    let token = await this.tokenRepo.findOneBy({ itemId, provider });
    if (!token) {
      token = this.tokenRepo.create({
        provider,
        itemId,
        encryptedToken: enc,
        meta: {},
      });
    } else {
      token.encryptedToken = enc;
    }
    await this.tokenRepo.save(token);

    // fetch accounts and persist: simple implementation
    const accountsRequest = {
      access_token: accessToken,
    };
    const accountsRes = await this.client.accountsGet(accountsRequest);

    // store accounts using Token relation - simplified
    // **You should upsert accounts in bank_accounts table**
    // Here we just call transaction sync
    await this.transactionsService.initialFetchAndStore(
      accessToken,
      itemId,
      provider,
    );

    return { itemId };
  }

  // decrypt helper to use token
  async getAccessTokenForItem(itemId: string) {
    const token = await this.tokenRepo.findOneBy({ itemId, provider: 'plaid' });
    if (!token) return null;

    const encKey = this.config.get<string>('TOKEN_ENC_KEY');
    if (!encKey) {
      throw new Error('TOKEN_ENC_KEY is not configured');
    }

    return this.decrypt(token.encryptedToken, encKey);
  }

  // verify webhook signature (Plaid signs with 'PLAID-SIGNATURE' or new 'Plaid-Verification' depending on API version).
  // We'll use a generic HMAC verification using a webhook secret if you have it.
  verifyWebhookSignature(body: string, signature: string) {
    // If you have PLAID_WEBHOOK_SECRET use HMAC-SHA256. Otherwise, if Plaid uses a different scheme adapt accordingly.
    const secret = this.config.get<string>('PLAID_WEBHOOK_SECRET');
    if (!secret) return true; // falling back - NOT recommended in prod

    const hmac = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');

    return hmac === signature;
  }

  async handlePlaidWebhook(rawBody: string, signatureHeader: string) {
    if (!this.verifyWebhookSignature(rawBody, signatureHeader)) {
      this.logger.warn('Plaid webhook signature mismatch');
      throw new Error('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody);
    // minimal handling: for transactions, call transaction sync
    if (payload.webhook_type === 'TRANSACTIONS') {
      // payload.webhook_code can be INITIAL_UPDATE, HISTORICAL_UPDATE, DEFAULT_UPDATE, etc.
      // For incremental sync use /transactions/sync
      // We'll call a service to sync for that item
      const itemId = payload.item_id;
      const accessToken = await this.getAccessTokenForItem(itemId);
      if (!accessToken) {
        this.logger.warn('No access token for item', itemId);
        return;
      }
      await this.transactionsService.syncTransactions(
        accessToken,
        itemId,
        'plaid',
      );
    }
  }
}
