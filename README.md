# MoodLedger

An immutable daily mood journal built on the Stellar blockchain. Log how you're feeling once per day — that entry is signed by your wallet and permanently stored on-chain. No edits. No deletes. Your honest record, forever.

## Live Links

| | |
|---|---|
| **Frontend** | `https://moodledger.vercel.app` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CAQLEC6KQZQQRLSTC6MS7G2NYDS2JR4BLIJDFGWHXJWNGHQ7ECGMF3L3` |

## How It Works

- Log a mood score (1–5) and optional note each day
- One entry per wallet per day — the contract rejects duplicates
- 365-day GitHub-style heatmap calendar shows your history
- Entries loaded in batches of 30 to minimise RPC calls
- No tokens, no fees — just a storage transaction

## Why This Project Matters

This project turns a familiar real-world workflow into a verifiable on-chain primitive on Stellar: transparent state transitions, user-authenticated actions, and deterministic outcomes.

## Architecture

- **Smart Contract Layer**: Soroban contract enforces business rules, authorization, and state transitions.
- **Client Layer**: React + Vite frontend handles wallet UX, transaction composition, and real-time status views.
- **Wallet/Auth Layer**: Freighter signs every state-changing action so operations are attributable and non-repudiable.
- **Infra Layer**: Stellar Testnet + Soroban RPC for execution; Vercel for frontend hosting.
## Contract Functions

```rust
log_mood(author, mood: u32, note: String, day: u32)
get_entry(author, day) -> Option<MoodEntry>
get_author_days(author) -> Vec<u32>
get_entries_batch(author, days: Vec<u32>) -> Vec<u32>
total_entries() -> u32
```

`day` is days since Unix epoch (`Math.floor(Date.now() / 86_400_000)`).

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter v1.7.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```



