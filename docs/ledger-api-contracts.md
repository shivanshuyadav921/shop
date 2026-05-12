# Ledger Service API Contracts

## Create account
POST /ledger/accounts

Request:
- ownerId: string
- ownerType: string
- accountType: string
- currency: string (optional, default `INR`)
- metadata: object

Response:
- id
- owner_id
- owner_type
- account_type
- currency
- balance
- reserved_balance
- available_balance
- metadata

## Get account
GET /ledger/accounts/:accountId

Response:
- account fields
- available_balance

## Create transaction
POST /ledger/transactions

Headers:
- Idempotency-Key: string

Request:
- externalId?: string
- type: payment|refund|chargeback|settlement|adjustment
- description?: string
- entries: [
  {
    accountId: string,
    entryType: debit|credit,
    amount: number,
    currency?: string,
    metadata?: object
  }
]
- metadata?: object

Response:
- id
- external_id
- type
- status
- description
- total_debit
- total_credit
- metadata

## Get transaction
GET /ledger/transactions/:transactionId

Response:
- transaction object
- entries array

## Settle transaction
POST /ledger/transactions/:transactionId/settle

Response:
- settled transaction with updated status

## Refund transaction
POST /ledger/transactions/:transactionId/refund

Request:
- reason: string

Response:
- refund transaction object

## Chargeback transaction
POST /ledger/transactions/:transactionId/chargeback

Request:
- reason: string

Response:
- chargeback transaction object
