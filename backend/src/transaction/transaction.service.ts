import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Client as PlaidClient } from 'plaid';
import { ConfigService } from '@nestjs/config';
import { BankAccount } from 'src/banking/entities/bank-account.entity';
import { Transaction } from './entities/transaction.entity';

// simple rule-based category map
const MCC_CATEGORY_MAP: Record<string, string> = {
  grocery: 'groceries',
  rent: 'housing',
  salary: 'income',
  atm: 'cash',
  // add more known mappings
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(BankAccount) private acctRepo: Repository<BankAccount>,
    private config: ConfigService,
  ) {}

  // initial fetch: fetch transactions with Plaid SDK and persist
  async initialFetchAndStore(
    accessToken: string,
    itemId: string,
    provider: string,
  ) {
    if (provider !== 'plaid') throw new Error('not implemented for provider');

    const client = new PlaidClient({
      clientID: this.config.get('PLAID_CLIENT_ID'),
      secret: this.config.get('PLAID_SECRET'),
      env: (this.config.get('PLAID_ENV') === 'sandbox'
        ? PlaidClient.environments?.sandbox
        : undefined) as any,
    } as any);

    // Plaid: use transactionsGet (for demo) — for production use /transactions/sync
    const res = await client.transactionsGet({
      access_token: accessToken,
      start_date: this._daysAgo(90),
      end_date: this._today(),
    });
    const txs = res.data.transactions;

    for (const t of txs) {
      await this.upsertTransactionFromPlaid(t, itemId);
    }
  }

  async syncTransactions(
    accessToken: string,
    itemId: string,
    provider: string,
  ) {
    // For production use /transactions/sync to get incremental changes.
    // For now just call transactionsGet for simplicity demo.
    return this.initialFetchAndStore(accessToken, itemId, provider);
  }

  private async upsertTransactionFromPlaid(t: any, itemId: string) {
    // find or create bankAccount (basic)
    let account = await this.acctRepo.findOneBy({
      providerAccountId: t.account_id,
    });
    if (!account) {
      account = this.acctRepo.create({
        providerAccountId: t.account_id,
        name: t.account_owner || 'Unknown',
        mask: t.account_id.slice(-4),
        type: t.account_type,
        subtype: t.account_subtype,
        currentBalance: null,
        bankTokenId: null, // you should set bankTokenId based on item->token mapping
      });
      await this.acctRepo.save(account);
    }

    // dedupe by provider transaction id (plaid has transaction_id)
    const existing = await this.txRepo.findOneBy({
      providerTransactionId: t.transaction_id,
    });
    if (existing) return existing;

    const tx = this.txRepo.create({
      providerTransactionId: t.transaction_id,
      bankAccountId: account.id,
      date: t.date,
      amount: Math.abs(t.amount),
      currency: t.iso_currency_code || 'USD',
      merchantName: t.merchant_name || null,
      rawDescription: t.name,
      pending: t.pending || false,
      category: this.categorizeTransaction(t),
    });

    return this.txRepo.save(tx);
  }

  categorizeTransaction(t: any) {
    // 1) MCC based if present
    if (
      t.merchant_classification &&
      t.merchant_classification.merchant_category_code
    ) {
      const mcc = t.merchant_classification.merchant_category_code.toString();
      // map some ranges or known codes (example simplified)
      if (mcc.startsWith('53')) return 'groceries';
      if (mcc === '4829') return 'utilities';
    }

    // 2) merchant name heuristics
    const name = (t.merchant_name || t.name || '').toLowerCase();
    if (!name) return 'uncategorized';

    if (
      name.includes('walmart') ||
      name.includes('supermarket') ||
      name.includes('grocery')
    )
      return 'groceries';
    if (name.includes('uber') || name.includes('lyft')) return 'transport';
    if (name.includes('starbucks') || name.includes('coffee')) return 'dining';
    if (name.match(/payroll|salary|deposit/)) return 'income';

    // fallback
    return 'uncategorized';
  }

  private _today() {
    return new Date().toISOString().slice(0, 10);
  }
  private _daysAgo(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
