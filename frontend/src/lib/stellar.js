import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, requestAccess, getAddress, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID || '').trim()
const NET         = (import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015').trim()
const RPC_URL     = (import.meta.env.VITE_SOROBAN_RPC_URL    || 'https://soroban-testnet.stellar.org').trim()
const DUMMY       = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

// ── Wallet ─────────────────────────────────────────────────────────────────
export async function connectWallet() {
  const { isConnected: connected } = await isConnected()
  if (!connected) throw new Error('Freighter not installed.')
  const { address, error } = await requestAccess()
  if (error) throw new Error(error)
  return address
}

// ── TX helper ──────────────────────────────────────────────────────────────
async function sendTx(publicKey, op) {
  const account = await rpc.getAccount(publicKey)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(60).build()

  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)

  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const result = await signTransaction(prepared.toXDR(), {
    network: 'TESTNET',
  })
  if (result.error) throw new Error(result.error)
  const signed = StellarSdk.TransactionBuilder.fromXDR(result.signedTxXdr, NET)
  const sent = await rpc.sendTransaction(signed)
  return pollTx(sent.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction timed out')
}

// ── Read helper ────────────────────────────────────────────────────────────
async function readContract(op) {
  const dummy = new StellarSdk.Account(DUMMY, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

const tc = () => new StellarSdk.Contract(CONTRACT_ID)

// ── log_mood ───────────────────────────────────────────────────────────────
export async function logMood(author, mood, note, day) {
  return sendTx(author, tc().call(
    'log_mood',
    StellarSdk.Address.fromString(author).toScVal(),
    StellarSdk.xdr.ScVal.scvU32(mood),
    StellarSdk.xdr.ScVal.scvString(note),
    StellarSdk.xdr.ScVal.scvU32(day),
  ))
}

// ── get_entry ──────────────────────────────────────────────────────────────
export async function getEntry(author, day) {
  try {
    const result = await readContract(tc().call(
      'get_entry',
      StellarSdk.Address.fromString(author).toScVal(),
      StellarSdk.xdr.ScVal.scvU32(day),
    ))
    return result // null or { mood, note, day, ledger, author }
  } catch { return null }
}

// ── get_author_days ────────────────────────────────────────────────────────
export async function getAuthorDays(author) {
  try {
    const days = await readContract(tc().call(
      'get_author_days',
      StellarSdk.Address.fromString(author).toScVal(),
    ))
    return Array.isArray(days) ? days.map(Number) : []
  } catch { return [] }
}

// ── batch get — up to 30 days ──────────────────────────────────────────────
export async function getEntriesBatch(author, days) {
  if (days.length === 0) return []
  const chunk = days.slice(0, 30)
  try {
    const moods = await readContract(tc().call(
      'get_entries_batch',
      StellarSdk.Address.fromString(author).toScVal(),
      StellarSdk.xdr.ScVal.scvVec(
        chunk.map(d => StellarSdk.xdr.ScVal.scvU32(d))
      ),
    ))
    return Array.isArray(moods) ? moods.map(Number) : []
  } catch { return chunk.map(() => 0) }
}

// ── total ──────────────────────────────────────────────────────────────────
export async function getTotalEntries() {
  try {
    const n = await readContract(tc().call('total_entries'))
    return Number(n)
  } catch { return 0 }
}

// ── Utility: today as days-since-epoch ────────────────────────────────────
export function todayDay() {
  return Math.floor(Date.now() / 86400000)
}

// ── Build a 365-day calendar grid ─────────────────────────────────────────
export function buildCalendarGrid(loggedDays, moodMap) {
  const today = todayDay()
  const start = today - 364
  const cells = []
  for (let d = start; d <= today; d++) {
    cells.push({
      day: d,
      mood: moodMap[d] || 0,
      logged: loggedDays.includes(d),
      date: new Date(d * 86400000),
    })
  }
  return cells
}

export { CONTRACT_ID }
