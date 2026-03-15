import { useState, useEffect, useRef } from 'react'
import {
  connectWallet, logMood, getEntry,
  getAuthorDays, getEntriesBatch, getTotalEntries,
  todayDay, buildCalendarGrid, CONTRACT_ID,
} from './lib/stellar'

// ── Mood config ────────────────────────────────────────────────────────────
const MOODS = [
  { score: 1, emoji: '😔', label: 'Awful',  color: '#c0392b' },
  { score: 2, emoji: '😕', label: 'Bad',    color: '#e07b1a' },
  { score: 3, emoji: '😐', label: 'Okay',   color: '#c8a84b' },
  { score: 4, emoji: '🙂', label: 'Good',   color: '#52b788' },
  { score: 5, emoji: '😄', label: 'Great',  color: '#2d6a4f' },
]

const MOOD_COLORS = {
  0: 'var(--cell-empty)',
  1: '#c0392b',
  2: '#e07b1a',
  3: '#c8a84b',
  4: '#52b788',
  5: '#2d6a4f',
}

const moodFor = (score) => MOODS.find(m => m.score === score)

// ── Calendar heatmap ───────────────────────────────────────────────────────
function HeatmapCalendar({ cells, onSelectCell, selectedDay }) {
  // Group into weeks (columns)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  const monthLabels = []
  weeks.forEach((week, wi) => {
    const first = week[0]
    if (first && first.date.getDate() <= 7) {
      monthLabels.push({
        wi,
        label: first.date.toLocaleString('default', { month: 'short' }),
      })
    }
  })

  return (
    <div className="heatmap-wrap">
      {/* Month labels */}
      <div className="heatmap-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 14px)` }}>
        {monthLabels.map(({ wi, label }) => (
          <span key={wi} className="month-label" style={{ gridColumn: wi + 1 }}>{label}</span>
        ))}
      </div>

      {/* Grid */}
      <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 14px)` }}>
        {weeks.map((week, wi) =>
          week.map((cell, di) => (
            <div
              key={cell.day}
              className={`heatmap-cell ${selectedDay === cell.day ? 'cell-selected' : ''} ${cell.day === todayDay() ? 'cell-today' : ''}`}
              style={{
                gridColumn: wi + 1,
                gridRow: di + 1,
                background: MOOD_COLORS[cell.mood],
                opacity: cell.day > todayDay() ? 0 : cell.mood === 0 ? 0.25 : 1,
              }}
              title={`${cell.date.toDateString()}${cell.mood ? ` — ${moodFor(cell.mood)?.label}` : ' — not logged'}`}
              onClick={() => onSelectCell(cell)}
            />
          ))
        )}
      </div>

      {/* Day-of-week labels */}
      <div className="heatmap-days">
        {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
          <div key={i} className="day-label">{d}</div>
        ))}
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <span className="legend-txt">Less</span>
        {[0, 1, 2, 3, 4, 5].map(m => (
          <div key={m} className="legend-cell"
            style={{ background: MOOD_COLORS[m], opacity: m === 0 ? 0.25 : 1 }} />
        ))}
        <span className="legend-txt">More</span>
      </div>
    </div>
  )
}

// ── Mood selector ──────────────────────────────────────────────────────────
function MoodSelector({ value, onChange }) {
  return (
    <div className="mood-selector">
      {MOODS.map(m => (
        <button
          key={m.score}
          className={`mood-btn ${value === m.score ? 'mood-active' : ''}`}
          style={{ '--mood-color': m.color }}
          onClick={() => onChange(m.score)}
          title={m.label}
        >
          <span className="mood-emoji">{m.emoji}</span>
          <span className="mood-label">{m.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Streak counter ─────────────────────────────────────────────────────────
function StreakBadge({ loggedDays }) {
  if (loggedDays.length === 0) return null
  const sorted = [...loggedDays].sort((a, b) => b - a)
  const today  = todayDay()
  let streak = 0
  let cur = today
  for (const d of sorted) {
    if (d === cur || d === cur - 1) { streak++; cur = d }
    else if (d < cur - 1) break
  }
  if (streak === 0) return null
  return (
    <div className="streak-badge">
      <span className="streak-fire">🔥</span>
      <span className="streak-num">{streak}</span>
      <span className="streak-label">day streak</span>
    </div>
  )
}

// ── Entry detail panel ─────────────────────────────────────────────────────
function EntryDetail({ entry, day }) {
  if (!entry) {
    const date = new Date(day * 86400000)
    return (
      <div className="entry-detail entry-empty">
        <div className="ed-date">{date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="ed-empty-msg">No entry for this day</div>
      </div>
    )
  }
  const mood  = moodFor(entry.mood)
  const date  = new Date(entry.day * 86400000)
  return (
    <div className="entry-detail" style={{ '--entry-color': mood?.color }}>
      <div className="ed-date">{date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <div className="ed-mood">
        <span className="ed-emoji">{mood?.emoji}</span>
        <span className="ed-label">{mood?.label}</span>
      </div>
      {entry.note && <p className="ed-note">"{entry.note}"</p>}
      <div className="ed-meta">Ledger #{entry.ledger?.toString()}</div>
    </div>
  )
}

// ── Log today form ─────────────────────────────────────────────────────────
function LogTodayForm({ wallet, alreadyLogged, onLogged }) {
  const [mood,  setMood]  = useState(4)
  const [note,  setNote]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')
  const today = todayDay()

  if (alreadyLogged) {
    return (
      <div className="already-logged">
        <div className="al-icon">✓</div>
        <div className="al-text">Today's mood is sealed on-chain.</div>
        <div className="al-sub">Entries are immutable — come back tomorrow.</div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!wallet) return
    setBusy(true); setErr('')
    try {
      const hash = await logMood(wallet, mood, note, today)
      onLogged({ hash, mood, note, day: today })
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <form className="log-form" onSubmit={handleSubmit}>
      <div className="lf-date">{todayDate}</div>
      <div className="lf-question">How are you feeling today?</div>
      <MoodSelector value={mood} onChange={setMood} />
      <textarea
        className="lf-note"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Add a note… (optional)"
        maxLength={140}
        rows={3}
        disabled={!wallet || busy}
      />
      <div className="lf-footer">
        <span className="lf-chars">{note.length}/140</span>
        <div className="lf-hint">
          <span className="lf-lock-icon">🔒</span>
          Once submitted, this entry is permanent on Stellar.
        </div>
      </div>
      {err && <p className="lf-err">{err}</p>}
      <button type="submit" className="btn-log" disabled={!wallet || busy}>
        {!wallet ? 'Connect wallet to log' : busy ? 'Writing to chain…' : 'Seal today\'s mood'}
      </button>
    </form>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,        setWallet]       = useState(null)
  const [loggedDays,    setLoggedDays]   = useState([])
  const [moodMap,       setMoodMap]      = useState({}) // day → mood score
  const [cells,         setCells]        = useState([])
  const [selectedCell,  setSelectedCell] = useState(null)
  const [selectedEntry, setSelectedEntry]= useState(null)
  const [todayEntry,    setTodayEntry]   = useState(null)
  const [totalEntries,  setTotalEntries] = useState(0)
  const [loading,       setLoading]      = useState(false)
  const [toast,         setToast]        = useState(null)
  const [tab,           setTab]          = useState('today') // today | calendar

  useEffect(() => { getTotalEntries().then(setTotalEntries) }, [])

  const loadCalendar = async (addr) => {
    setLoading(true)
    try {
      const days = await getAuthorDays(addr)
      setLoggedDays(days)

      // Batch fetch moods in chunks of 30
      const newMoodMap = {}
      for (let i = 0; i < days.length; i += 30) {
        const chunk = days.slice(i, i + 30)
        const moods = await getEntriesBatch(addr, chunk)
        chunk.forEach((d, idx) => { newMoodMap[d] = moods[idx] || 0 })
      }
      setMoodMap(newMoodMap)
      setCells(buildCalendarGrid(days, newMoodMap))

      // Check today
      const today = todayDay()
      if (days.includes(today)) {
        const entry = await getEntry(addr, today)
        setTodayEntry(entry)
      } else {
        setTodayEntry(null)
      }
    } catch {}
    setLoading(false)
  }

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWallet(addr)
      loadCalendar(addr)
    } catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleSelectCell = async (cell) => {
    setSelectedCell(cell)
    setSelectedEntry(null)
    if (cell.logged && wallet) {
      const entry = await getEntry(wallet, cell.day)
      setSelectedEntry(entry)
    }
  }

  const handleLogged = ({ hash, mood, note, day }) => {
    showToast(true, 'Mood sealed on-chain!', hash)
    setTodayEntry({ mood, note, day })
    setLoggedDays(prev => [...prev, day])
    setMoodMap(prev => ({ ...prev, [day]: mood }))
    setCells(buildCalendarGrid([...loggedDays, day], { ...moodMap, [day]: mood }))
    setTotalEntries(n => n + 1)
  }

  const short = (a) => a ? `${a.slice(0, 4)}…${a.slice(-4)}` : ''
  const todayMoodScore = moodMap[todayDay()] || 0
  const todayMood = moodFor(todayMoodScore)

  return (
    <div className="app">
      {/* ── Background blobs ── */}
      <div className="bg-blob blob-1" style={{ background: todayMood ? todayMood.color : '#c8a84b' }} />
      <div className="bg-blob blob-2" />

      <div className="layout">
        {/* ── Left panel ── */}
        <aside className="left-panel">
          <div className="brand">
            <div className="brand-title">Mood<br/>Ledger</div>
            <div className="brand-sub">immutable journal</div>
          </div>

          <div className="left-stats">
            <div className="ls-item">
              <div className="ls-n">{loggedDays.length}</div>
              <div className="ls-l">days logged</div>
            </div>
            <div className="ls-item">
              <div className="ls-n">{totalEntries}</div>
              <div className="ls-l">global entries</div>
            </div>
          </div>

          {loggedDays.length > 0 && <StreakBadge loggedDays={loggedDays} />}

          {/* Mood distribution */}
          {loggedDays.length > 0 && (
            <div className="mood-dist">
              <div className="md-title">Your mood spread</div>
              {MOODS.map(m => {
                const count = Object.values(moodMap).filter(v => v === m.score).length
                const pct = loggedDays.length > 0 ? (count / loggedDays.length) * 100 : 0
                return (
                  <div key={m.score} className="md-row">
                    <span className="md-emoji">{m.emoji}</span>
                    <div className="md-bar-wrap">
                      <div className="md-bar" style={{ width: `${pct}%`, background: m.color }} />
                    </div>
                    <span className="md-count">{count}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="left-footer">
            {wallet
              ? <div className="wallet-tag"><span className="wdot" />{short(wallet)}</div>
              : <button className="btn-connect" onClick={handleConnect}>Connect Wallet</button>
            }
            <a className="contract-ref"
              href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
              target="_blank" rel="noreferrer">
              contract ↗
            </a>
          </div>
        </aside>

        {/* ── Right panel ── */}
        <main className="right-panel">
          {/* Toast */}
          {toast && (
            <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
              <span>{toast.msg}</span>
              {toast.hash && (
                <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
                  target="_blank" rel="noreferrer" className="toast-link">view tx ↗</a>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${tab === 'today' ? 'tab-active' : ''}`} onClick={() => setTab('today')}>
              Today
            </button>
            <button className={`tab ${tab === 'calendar' ? 'tab-active' : ''}`}
              onClick={() => { setTab('calendar'); if (wallet && cells.length === 0) loadCalendar(wallet) }}>
              365-Day View
            </button>
          </div>

          {/* Today tab */}
          {tab === 'today' && (
            <div className="tab-body">
              {!wallet ? (
                <div className="connect-prompt">
                  <div className="cp-title">Your journal lives on-chain.</div>
                  <p className="cp-sub">Every entry is signed by your wallet and permanently stored on Stellar. No account needed — just your keys.</p>
                  <button className="btn-connect-lg" onClick={handleConnect}>Connect Freighter Wallet</button>
                </div>
              ) : (
                <LogTodayForm
                  wallet={wallet}
                  alreadyLogged={loggedDays.includes(todayDay())}
                  onLogged={handleLogged}
                />
              )}
            </div>
          )}

          {/* Calendar tab */}
          {tab === 'calendar' && (
            <div className="tab-body">
              {!wallet ? (
                <div className="connect-prompt">
                  <div className="cp-title">Connect to see your calendar.</div>
                  <button className="btn-connect-lg" onClick={handleConnect}>Connect Freighter Wallet</button>
                </div>
              ) : loading ? (
                <div className="loading-state">
                  <div className="loading-dots">
                    <div /><div /><div />
                  </div>
                  <p>Loading your journal from chain…</p>
                </div>
              ) : (
                <div className="calendar-layout">
                  <HeatmapCalendar
                    cells={cells.length > 0 ? cells : buildCalendarGrid([], {})}
                    onSelectCell={handleSelectCell}
                    selectedDay={selectedCell?.day}
                  />
                  {selectedCell && (
                    <EntryDetail
                      entry={selectedEntry}
                      day={selectedCell.day}
                    />
                  )}
                  {!selectedCell && loggedDays.length === 0 && (
                    <div className="cal-empty">
                      <p>No entries yet. Log your first mood on the Today tab.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
