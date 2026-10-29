/**
 * DigiSwiss API Client - Modul Pemanggilan Backend Google Apps Script v5.0
 * 
 * Aturan Penting:
 * 1. Single endpoint: POST dengan body JSON { action, token, data }
 * 2. Header WAJIB: 'Content-Type': 'text/plain;charset=utf-8' (menghindari CORS preflight)
 * 3. Fetch WAJIB: redirect: 'follow' (Google Apps Script melakukan HTTP 302 redirect)
 * 4. Timeout 20 detik menggunakan AbortController
 * 5. Format respons: { ok: true/false, data, error, message, code }
 */

import { getActiveApiUrl } from './config.js';

const STORAGE_KEYS = {
  API_URL: 'DIGISWISS_API_URL',
  TOKEN: 'DIGISWISS_AUTH_TOKEN',
  USER: 'DIGISWISS_USER_PROFILE',
  CACHE_PREFIX: 'DIGISWISS_CACHE_',
  LAST_PING: 'DIGISWISS_LAST_PING'
};

export function getApiUrl() {
  return getActiveApiUrl();
}

export function setApiUrl(newUrl) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (newUrl && newUrl.trim() !== '') {
      window.localStorage.setItem(STORAGE_KEYS.API_URL, newUrl.trim());
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.API_URL);
    }
  }
}

export function getToken() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  }
  return '';
}

export function setToken(token) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) {
      window.localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  }
}

export function getCurrentUser() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function setCurrentUser(user) {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (user) {
      window.localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }
}

function getCachedData(cacheKey) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEYS.CACHE_PREFIX + cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

const memoryCache = new Map();
const DEFAULT_TTL_MS = 45000;

export function clearApiCache() {
  memoryCache.clear();
}

function setCachedData(cacheKey, data) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const record = {
      timestamp: Date.now(),
      cachedAt: new Date().toLocaleTimeString('id-ID'),
      data: data
    };
    window.localStorage.setItem(STORAGE_KEYS.CACHE_PREFIX + cacheKey, JSON.stringify(record));
  } catch (e) {}
}

export async function callApi(action, data = {}, options = {}) {
  const timeoutMs = options.timeoutMs || 20000;
  const useCache = options.useCache !== false;
  const useMemoryTtl = options.useMemoryTtl === true;
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const cacheKey = action + (data ? '_' + JSON.stringify(data) : '');

  // Cek in-memory TTL cache terlebih dahulu untuk respons secepat kilat
  if (useMemoryTtl && memoryCache.has(cacheKey)) {
    const memEntry = memoryCache.get(cacheKey);
    if (Date.now() - memEntry.timestamp < ttlMs) {
      return {
        ok: true,
        data: memEntry.data,
        isCached: true,
        isMemoryCached: true,
        cachedAt: memEntry.cachedAt
      };
    }
  }

  const url = getApiUrl();
  const token = getToken();

  if (!url || url.includes('YOUR_SCRIPT_ID_HERE')) {
    const cached = useCache ? getCachedData(cacheKey) : null;
    return {
      ok: false,
      data: cached ? cached.data : null,
      isCached: !!cached,
      cachedAt: cached ? cached.cachedAt : null,
      error: 'URL Google Apps Script belum dikonfigurasi. Masukkan URL Web App di tab Pengaturan.',
      isMisconfigured: true
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const payload = { action, token, data };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.ok && json.data) {
      memoryCache.set(cacheKey, {
        timestamp: Date.now(),
        cachedAt: new Date().toLocaleTimeString('id-ID'),
        data: json.data
      });
      if (useCache) {
        setCachedData(cacheKey, json.data);
      }
    }

    if (!json.ok && json.code === 'SESSION_EXPIRED') {
      setToken('');
      setCurrentUser(null);
    }

    return json;

  } catch (err) {
    clearTimeout(timeoutId);

    let errorMessage = err.message || 'Terjadi kesalahan jaringan.';
    if (err.name === 'AbortError') {
      errorMessage = 'Permintaan waktu habis (timeout 20 detik). Periksa koneksi internet Anda.';
    } else if (err.message && err.message.includes('Failed to fetch')) {
      errorMessage = 'Tidak dapat menghubungi server. Periksa URL Apps Script dan izin Web App (Anyone).';
    }

    const cached = useCache ? getCachedData(cacheKey) : null;
    return {
      ok: false,
      data: cached ? cached.data : null,
      isCached: !!cached,
      cachedAt: cached ? cached.cachedAt : null,
      error: errorMessage,
      isNetworkError: true
    };
  }
}

export async function pingServer() {
  const startTime = Date.now();
  const res = await callApi('ping', {}, { timeoutMs: 10000, useCache: false });
  const latency = Date.now() - startTime;
  return {
    ...res,
    latency: latency
  };
}

// Auth Helpers
export async function register(username, password, name) {
  const res = await callApi('register', { username, password, name });
  if (res.ok && res.data) {
    setToken(res.data.token);
    setCurrentUser(res.data.user);
  }
  return res;
}

export async function login(username, password) {
  const res = await callApi('login', { username, password });
  if (res.ok && res.data) {
    setToken(res.data.token);
    setCurrentUser(res.data.user);
  }
  return res;
}

export async function logout() {
  const res = await callApi('logout');
  setToken('');
  setCurrentUser(null);
  return res;
}

export async function verifyCurrentSession() {
  const res = await callApi('verifySession');
  if (res.ok && res.data?.user) {
    setCurrentUser(res.data.user);
  }
  return res;
}

export async function updateProfile(data) {
  return await callApi('updateProfile', data);
}

// Tournament Helpers
export async function getTournaments(filter = {}) {
  return await callApi('getTournaments', filter);
}

export async function getTournamentDetails(tournamentId) {
  return await callApi('getTournamentDetails', { tournamentId });
}

export async function getTournamentStandings(tournamentId) {
  return await callApi('getTournamentStandings', { tournamentId });
}

export async function createTournament(data) {
  return await callApi('createTournament', data);
}

export async function updateTournament(tournamentId, data) {
  return await callApi('updateTournament', { tournamentId, ...data });
}

export async function deleteTournament(tournamentId) {
  return await callApi('deleteTournament', { tournamentId });
}

export async function startTournament(tournamentId, totalRounds) {
  return await callApi('startTournament', { tournamentId, totalRounds });
}

export async function registerPlayer(tournamentId, deckName, digimonPartner) {
  return await callApi('registerPlayer', { tournamentId, deckName, digimonPartner });
}

export async function unregisterPlayer(tournamentId) {
  return await callApi('unregisterPlayer', { tournamentId });
}

export async function addManualPlayer(tournamentId, playerName, deckName, digimonPartner) {
  return await callApi('addManualPlayer', { tournamentId, playerName, deckName, digimonPartner });
}

export async function kickPlayer(tournamentId, registrationId) {
  return await callApi('kickPlayer', { tournamentId, registrationId });
}

export async function dropPlayer(tournamentId, registrationId) {
  return await callApi('dropPlayer', { tournamentId, registrationId });
}

// Swiss Round & Pairing Helpers
export async function generateRoundPairing(tournamentId) {
  return await callApi('generateRoundPairing', { tournamentId });
}

export async function getRoundMatches(tournamentId, roundNumber) {
  return await callApi('getRoundMatches', { tournamentId, roundNumber });
}

export async function getMyMatches(tournamentId) {
  return await callApi('getMyMatches', { tournamentId });
}

export async function swapPairing(tournamentId, match1Id, match2Id) {
  return await callApi('swapPairing', { tournamentId, match1Id, match2Id });
}

export async function submitMatchScore(matchId, player1Wins, player2Wins, draws = 0, options = {}) {
  return await callApi('submitMatchScore', {
    matchId,
    player1Wins,
    player2Wins,
    draws,
    revertAndRegenerate: options.revertAndRegenerate === true,
    forceWithoutRevert: options.forceWithoutRevert === true
  });
}

export async function confirmMatchScore(matchId) {
  return await callApi('confirmMatchScore', { matchId });
}

export async function disputeMatchScore(matchId, reason = '') {
  return await callApi('disputeMatchScore', { matchId, reason });
}

export async function completeRound(tournamentId, roundId) {
  return await callApi('completeRound', { tournamentId, roundId });
}

// Revert & Impact Helpers
export async function getRevertImpact(tournamentId, targetRoundNumber) {
  return await callApi('getRevertImpact', { tournamentId, targetRoundNumber });
}

export async function revertRound(tournamentId, targetRoundNumber) {
  return await callApi('revertRound', { tournamentId, targetRoundNumber });
}

// Audit Log Helper
export async function getAuditLogs(tournamentId = '') {
  return await callApi('getAuditLogs', { tournamentId });
}

export async function runPairingTests() {
  return await callApi('runPairingTests', {});
}

export async function runScoringTests() {
  return await callApi('runScoringTests', {});
}

// Timer Ronde Helpers
export async function updateRoundTimer(tournamentId, roundId, timerAction, durationMinutes = 45) {
  return await callApi('updateRoundTimer', { tournamentId, roundId, timerAction, durationMinutes });
}

export async function getRoundTimer(tournamentId, roundId) {
  return await callApi('getRoundTimer', { tournamentId, roundId });
}

// Deck & Hasil Akhir Helpers
export async function getPlayerDeckHistory(userId, playerName) {
  return await callApi('getPlayerDeckHistory', { userId, playerName });
}

export async function updateParticipantDeck(tournamentId, registrationId, deckName, deckColors) {
  return await callApi('updateParticipantDeck', { tournamentId, registrationId, deckName, deckColors });
}

export async function getTournamentFinalResults(tournamentId) {
  return await callApi('getTournamentFinalResults', { tournamentId });
}

// Admin Helpers
export async function adminGetUsers() {
  return await callApi('adminGetUsers', {});
}

export async function adminUpdateRole(userId, newRole) {
  return await callApi('adminUpdateRole', { userId, newRole });
}

export async function adminToggleUserStatus(userId, status) {
  return await callApi('adminToggleUserStatus', { userId, status });
}

export async function adminResetPassword(userId) {
  return await callApi('adminResetPassword', { userId });
}

// Riwayat & Statistik Helpers
export async function getHistory(params = {}, forceRefresh = false) {
  return await callApi('getHistory', params, { useMemoryTtl: !forceRefresh, ttlMs: 45000 });
}

export async function getStats(forceRefresh = false) {
  return await callApi('getStats', {}, { useMemoryTtl: !forceRefresh, ttlMs: 45000 });
}

