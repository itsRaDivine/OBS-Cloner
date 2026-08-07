import fs from 'fs';
import path from 'path';

// Vercel serverless ortamında sadece /tmp yazılabilir.
// Bu dosya işlem/instance ömrü boyunca korunur, kalıcı DB değildir
// ama pratikte rate limit için yeterlidir (aynı instance sıcak kaldığı sürece).
const RATE_LIMIT_FILE = path.join('/tmp', 'obscloner-ratelimit.json');

const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 saat
const MAX_CLONES_PER_WINDOW = 5;      // 2 saatte 5 klonlama

function readLimits() {
  try {
    if (!fs.existsSync(RATE_LIMIT_FILE)) return {};
    return JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
  } catch (err) {
    console.error('🔴 [RATELIMIT] Okuma hatası:', err);
    return {};
  }
}

function writeLimits(data) {
  try {
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(data), 'utf-8');
  } catch (err) {
    console.error('🔴 [RATELIMIT] Yazma hatası:', err);
  }
}

/**
 * Kullanıcının şu an klonlama yapıp yapamayacağını kontrol eder.
 * Yapabiliyorsa otomatik olarak bir kullanım hakkı düşer (consume).
 *
 * @param {string} userId - Discord kullanıcı ID'si
 * @returns {{ allowed: boolean, remaining: number, resetAt: number|null }}
 */
export function checkAndConsume(userId) {
  const now = Date.now();
  const limits = readLimits();

  // Kullanıcının geçmiş isteklerini al, pencere dışındakileri temizle
  const timestamps = (limits[userId] || []).filter(ts => now - ts < WINDOW_MS);

  if (timestamps.length >= MAX_CLONES_PER_WINDOW) {
    // Limit dolu — en eski isteğin ne zaman düşeceğini hesapla
    const oldestTs = Math.min(...timestamps);
    const resetAt = oldestTs + WINDOW_MS;
    return { allowed: false, remaining: 0, resetAt };
  }

  // İzin ver, kullanım hakkını düş
  timestamps.push(now);
  limits[userId] = timestamps;
  writeLimits(limits);

  return {
    allowed: true,
    remaining: MAX_CLONES_PER_WINDOW - timestamps.length,
    resetAt: null
  };
}

/**
 * Sadece durumu okur, kullanım hakkı düşmez.
 * Frontend'de "kaç hakkın kaldı" göstermek için kullanılır.
 */
export function peekStatus(userId) {
  const now = Date.now();
  const limits = readLimits();
  const timestamps = (limits[userId] || []).filter(ts => now - ts < WINDOW_MS);

  const remaining = Math.max(0, MAX_CLONES_PER_WINDOW - timestamps.length);
  let resetAt = null;
  if (timestamps.length > 0) {
    resetAt = Math.min(...timestamps) + WINDOW_MS;
  }

  return { remaining, resetAt, limit: MAX_CLONES_PER_WINDOW };
}

export const RATE_LIMIT_CONFIG = {
  windowMs: WINDOW_MS,
  maxRequests: MAX_CLONES_PER_WINDOW
};
