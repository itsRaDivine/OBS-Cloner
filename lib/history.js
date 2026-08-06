import fs from 'fs';
import path from 'path';

// Vercel'de sadece /tmp yazılabilir. Kalıcılık istersen ileride
// bir veritabanına taşırsın, şimdilik dosya tabanlı basit çözüm.
const HISTORY_FILE = path.join('/tmp', 'obscloner-history.json');
const MAX_HISTORY_ENTRIES = 500; // dosya şişmesin diye üst sınır

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('🔴 [HISTORY] Okuma hatası:', err);
    return [];
  }
}

function writeHistory(entries) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('🔴 [HISTORY] Yazma hatası:', err);
  }
}

/**
 * Yeni bir klonlama kaydı ekler.
 */
export function addHistoryEntry(entry) {
  const history = readHistory();

  history.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    sourceGuildId: entry.sourceGuildId,
    sourceGuildName: entry.sourceGuildName || 'Bilinmiyor',
    targetGuildId: entry.targetGuildId,
    targetGuildName: entry.targetGuildName || 'Bilinmiyor',
    status: entry.status,        // "success" | "error"
    errorMessage: entry.errorMessage || null,
    rolesCloned: entry.rolesCloned || 0,
    categoriesCloned: entry.categoriesCloned || 0,
    channelsCloned: entry.channelsCloned || 0,
    emojisCloned: entry.emojisCloned || 0,
    durationMs: entry.durationMs || 0
  });

  // Üst sınırı aşarsa en eskileri at
  const trimmed = history.slice(0, MAX_HISTORY_ENTRIES);
  writeHistory(trimmed);
}

/**
 * Tüm geçmişi döndürür (en yeni en üstte).
 */
export function getHistory(limit = 50) {
  return readHistory().slice(0, limit);
}

/**
 * Basit istatistik özeti.
 */
export function getStats() {
  const history = readHistory();
  return {
    totalClones: history.length,
    successCount: history.filter(h => h.status === 'success').length,
    errorCount: history.filter(h => h.status === 'error').length,
    totalChannels: history.reduce((sum, h) => sum + (h.channelsCloned || 0), 0),
    totalRoles: history.reduce((sum, h) => sum + (h.rolesCloned || 0), 0)
  };
}
