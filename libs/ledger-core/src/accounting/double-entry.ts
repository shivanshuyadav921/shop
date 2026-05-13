import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import pino from 'pino';

/**
 * Double-entry accounting: every transaction debits one account and credits another
 * Ensures accounting equation: Assets = Liabilities + Equity
 */

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export interface Account {
  id: string;
  number: string; // e.g., "1000-1099" for assets
  name: string;
  type: AccountType;
  currency: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  description: string;
  entries: {
    account: string;
    debit?: string;
    credit?: string;
  }[];
  reference?: string;
  createdAt: Date;
}

export class DoubleEntryAccounting {
  private accounts: Map<string, Account> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Create account in chart of accounts
   */
  createAccount(
    number: string,
    name: string,
    type: AccountType,
    currency: string = 'USD'
  ): Account {
    const account: Account = {
      id: `acc_${uuidv4()}`,
      number,
      name,
      type,
      currency,
      isActive: true,
      createdAt: new Date(),
    };

    this.accounts.set(account.id, account);
    this.logger.info(`Created account: ${number} (${name})`);

    return account;
  }

  /**
   * Post double-entry transaction
   * Always balances: sum of debits = sum of credits
   */
  postTransaction(
    description: string,
    entries: Array<{
      account: string;
      debit?: string;
      credit?: string;
    }>,
    reference?: string
  ): Transaction {
    // Validate that debits equal credits
    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    for (const entry of entries) {
      if (entry.debit) {
        totalDebits = totalDebits.add(new Decimal(entry.debit));
      }
      if (entry.credit) {
        totalCredits = totalCredits.add(new Decimal(entry.credit));
      }
    }

    if (!totalDebits.equals(totalCredits)) {
      throw new Error(
        `Transaction unbalanced: debits (${totalDebits}) ≠ credits (${totalCredits})`
      );
    }

    // Validate accounts exist
    for (const entry of entries) {
      if (!this.accounts.has(entry.account)) {
        throw new Error(`Account ${entry.account} not found`);
      }
    }

    const transaction: Transaction = {
      id: `txn_${uuidv4()}`,
      description,
      entries,
      reference,
      createdAt: new Date(),
    };

    this.transactions.set(transaction.id, transaction);
    this.logger.info(`Posted transaction: ${transaction.id} (${totalDebits} ${entries[0]?.debit ? 'debit' : 'credit'})`);

    return transaction;
  }

  /**
   * Get trial balance (sum of all debits should equal credits)
   */
  getTrialBalance(): {
    valid: boolean;
    totalDebits: string;
    totalCredits: string;
    accounts: Array<{
      accountNumber: string;
      accountName: string;
      debit: string;
      credit: string;
    }>;
  } {
    const balanceMap = new Map<string, { debit: Decimal; credit: Decimal }>();

    for (const txn of this.transactions.values()) {
      for (const entry of txn.entries) {
        let balance = balanceMap.get(entry.account);
        if (!balance) {
          balance = { debit: new Decimal(0), credit: new Decimal(0) };
          balanceMap.set(entry.account, balance);
        }

        if (entry.debit) {
          balance.debit = balance.debit.add(new Decimal(entry.debit));
        }
        if (entry.credit) {
          balance.credit = balance.credit.add(new Decimal(entry.credit));
        }
      }
    }

    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);
    const accountBalances = [];

    for (const [accountId, balance] of balanceMap) {
      const account = this.accounts.get(accountId);
      if (!account) continue;

      totalDebits = totalDebits.add(balance.debit);
      totalCredits = totalCredits.add(balance.credit);

      accountBalances.push({
        accountNumber: account.number,
        accountName: account.name,
        debit: balance.debit.toString(),
        credit: balance.credit.toString(),
      });
    }

    return {
      valid: totalDebits.equals(totalCredits),
      totalDebits: totalDebits.toString(),
      totalCredits: totalCredits.toString(),
      accounts: accountBalances,
    };
  }

  /**
   * Get account balance
   */
  getAccountBalance(accountId: string): { debit: string; credit: string; balance: string } | null {
    const account = this.accounts.get(accountId);
    if (!account) return null;

    let debit = new Decimal(0);
    let credit = new Decimal(0);

    for (const txn of this.transactions.values()) {
      for (const entry of txn.entries) {
        if (entry.account === accountId) {
          if (entry.debit) debit = debit.add(new Decimal(entry.debit));
          if (entry.credit) credit = credit.add(new Decimal(entry.credit));
        }
      }
    }

    // Net balance depends on account type
    let balance: Decimal;
    switch (account.type) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        balance = debit.minus(credit);
        break;
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        balance = credit.minus(debit);
        break;
      default:
        balance = debit.minus(credit);
    }

    return {
      debit: debit.toString(),
      credit: credit.toString(),
      balance: balance.toString(),
    };
  }

  /**
   * Get chart of accounts
   */
  getChartOfAccounts(): Account[] {
    return Array.from(this.accounts.values()).sort((a, b) =>
      a.number.localeCompare(b.number)
    );
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): Transaction | null {
    return this.transactions.get(transactionId) || null;
  }
}

export default DoubleEntryAccounting;
