#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec,
};

// ── Mood scale: 1–5 ───────────────────────────────────────────────────────
// 1 = awful, 2 = bad, 3 = okay, 4 = good, 5 = great

// ── Types ──────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub struct MoodEntry {
    pub author: Address,
    pub mood:   u32,        // 1–5
    pub note:   String,     // optional note, max 140 chars
    pub day:    u32,        // days since unix epoch (timestamp / 86400)
    pub ledger: u32,
}

#[contracttype]
pub enum DataKey {
    // (author, day) → MoodEntry
    Entry(Address, u32),
    // author → Vec<u32> of days logged
    AuthorDays(Address),
    // global total count
    TotalEntries,
}

#[contract]
pub struct MoodLedgerContract;

#[contractimpl]
impl MoodLedgerContract {
    /// Log a mood for today. One entry per wallet per day — immutable once written.
    pub fn log_mood(
        env: Env,
        author: Address,
        mood: u32,
        note: String,
        day: u32,        // caller passes days-since-epoch for their local date
    ) {
        author.require_auth();
        assert!(mood >= 1 && mood <= 5, "Mood must be 1–5");
        assert!(note.len() <= 140, "Note max 140 chars");

        let key = DataKey::Entry(author.clone(), day);
        assert!(
            !env.storage().persistent().has(&key),
            "Already logged mood for this day"
        );

        let entry = MoodEntry {
            author: author.clone(),
            mood,
            note,
            day,
            ledger: env.ledger().sequence(),
        };

        env.storage().persistent().set(&key, &entry);

        // Track days list for this author (last 365)
        let mut days: Vec<u32> = env
            .storage().persistent()
            .get(&DataKey::AuthorDays(author.clone()))
            .unwrap_or(Vec::new(&env));
        days.push_back(day);
        // Trim to last 365
        while days.len() > 365 {
            days.remove(0);
        }
        env.storage().persistent().set(&DataKey::AuthorDays(author), &days);

        // Global counter
        let total: u32 = env.storage().instance()
            .get(&DataKey::TotalEntries).unwrap_or(0u32);
        env.storage().instance().set(&DataKey::TotalEntries, &(total + 1));

        env.events().publish((symbol_short!("logged"),), (mood, day));
    }

    /// Get a single mood entry
    pub fn get_entry(env: Env, author: Address, day: u32) -> Option<MoodEntry> {
        env.storage().persistent().get(&DataKey::Entry(author, day))
    }

    /// Get all logged days for a wallet (returns Vec<u32> of day numbers)
    pub fn get_author_days(env: Env, author: Address) -> Vec<u32> {
        env.storage().persistent()
            .get(&DataKey::AuthorDays(author))
            .unwrap_or(Vec::new(&env))
    }

    /// Batch-get moods for a list of days (max 30) for an author
    pub fn get_entries_batch(
        env: Env,
        author: Address,
        days: Vec<u32>,
    ) -> Vec<u32> {
        assert!(days.len() <= 30, "Max 30 days per batch");
        let mut moods: Vec<u32> = Vec::new(&env);
        for day in days.iter() {
            let mood = env.storage().persistent()
                .get::<DataKey, MoodEntry>(&DataKey::Entry(author.clone(), day))
                .map(|e| e.mood)
                .unwrap_or(0u32); // 0 = not logged
            moods.push_back(mood);
        }
        moods
    }

    pub fn total_entries(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::TotalEntries).unwrap_or(0u32)
    }
}
