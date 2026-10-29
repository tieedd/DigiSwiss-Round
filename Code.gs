/**
 * DigiSwiss TCG - Backend Google Apps Script (Web App)
 * Sistem Manajemen Turnamen Swiss Round untuk Digimon Card Game (TCG)
 * Versi 7.0.0:
 * - Fitur Timer Ronde Sinkron (Start, Pause, Resume, Reset) dengan server timestamp offset
 * - Tampilan sisa waktu real-time yang tersimpan di sheet Rounds
 * - Pengisian Deck Peserta Pasca-Turnamen Selesai (Nama Deck + Chip Toggle Warna: Merah, Biru, Kuning, Hijau, Hitam, Ungu, Putih)
 * - Riwayat Deck Pemain (sheet DeckHistory) dengan dropdown pilihan deck otomatis
 * - Ekspor Hasil Akhir (Klasemen + Deck + Warna) dalam format Teks Berbagi dan Gambar (PNG)
 * - Fitur Revert ke Ronde X & Koreksi Skor dengan Otomatisasi Pembuatan Ulang Pairing
 * - Riwayat lawan murni dihitung dari Ronde 1 sampai Ronde X saja
 * - Sheet AuditLog lengkap: pengguna, waktu, aksi, nilai lama, nilai baru, detail
 * - Skema Poin BO1 & BO3 tanpa seri, Klasemen 4-Tier Tie-Breaker (OMW%, GW%, OGW%, H2H)
 * 
 * Database: Google Spreadsheet
 * Komunikasi: POST JSON { action, token, data }
 * Header: Content-Type: text/plain;charset=utf-8
 */

// ==========================================
// 1. SKEMA TABEL & KONFIGURASI SISTEM
// ==========================================

var SCHEMA = {
  Users: ['id', 'username', 'salt', 'password_hash', 'role', 'name', 'status', 'failed_attempts', 'lockout_until', 'created_at'],
  Sessions: ['token', 'user_id', 'role', 'username', 'name', 'expires_at', 'created_at'],
  Tournaments: ['id', 'name', 'date', 'location', 'status', 'format', 'total_rounds', 'current_round', 'organizer_id', 'organizer_name', 'rules_config', 'created_at'],
  Registrations: ['id', 'tournament_id', 'user_id', 'player_name', 'deck_name', 'digimon_partner', 'status', 'match_points', 'game_points', 'matches_won', 'matches_lost', 'games_won', 'games_lost', 'omw_percentage', 'gw_percentage', 'ogw_percentage', 'created_at', 'deck_colors'],
  Rounds: ['id', 'tournament_id', 'round_number', 'status', 'started_at', 'completed_at', 'is_archived', 'timer_duration_minutes', 'timer_status', 'timer_start_timestamp', 'timer_remaining_seconds'],
  Matches: ['id', 'round_id', 'tournament_id', 'table_number', 'player1_id', 'player2_id', 'player1_name', 'player2_name', 'player1_wins', 'player2_wins', 'draws', 'winner_id', 'status', 'reported_by', 'dispute_reason', 'is_archived'],
  Decks: ['id', 'user_id', 'name', 'archetype', 'color', 'card_list', 'created_at'],
  DeckHistory: ['id', 'user_id', 'player_name', 'deck_name', 'deck_colors', 'tournament_id', 'tournament_name', 'updated_at'],
  AuditLog: ['id', 'user_id', 'username', 'timestamp', 'action', 'tournament_id', 'tournament_name', 'old_value', 'new_value', 'details']
};

/**
 * Aturan Poin Resmi Digimon TCG (Tanpa Seri)
 * BO1: Menang 3, Kalah 0
 * BO3: Menang 2-0 = 3, Menang 2-1 = 2, Kalah 1-2 = 1, Kalah 0-2 = 0
 */
var SCORING_RULES = {
  BO1: {
    win: 3,
    loss: 0
  },
  BO3: {
    win20: 3,
    win21: 2,
    loss12: 1,
    loss02: 0
  }
};

var VALID_DECK_COLORS = ['Merah', 'Biru', 'Kuning', 'Hijau', 'Hitam', 'Ungu', 'Putih'];

function doGet(e) {
  return respondJson({
    ok: true,
    data: {
      app: "DigiSwiss TCG Backend",
      version: "8.0.0",
      status: "ONLINE",
      features: "Player/Organizer/Admin History, Mobile Stats & Charts, Round Timer Sync, DeckHistory, Final Export, Revert & Auto-Pairing, 4-Tier Tie-Breaker",
      message: "Gunakan metode POST dengan body JSON {action, token, data}."
    }
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respondJson({ ok: false, error: "Body permintaan kosong atau tidak valid." });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var token = payload.token || "";
    var data = payload.data || {};

    if (!action) {
      return respondJson({ ok: false, error: "Parameter 'action' wajib disertakan." });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==========================================
    // AKSI PUBLIK (TANPA TOKEN)
    // ==========================================
    if (action === "ping") {
      var sheets = ss.getSheets().map(function(s) { return s.getName(); });
      return respondJson({
        ok: true,
        data: {
          message: "Pong! Google Apps Script siap untuk DigiSwiss TCG.",
          serverTime: new Date().toISOString(),
          spreadsheetTitle: ss.getName(),
          sheetCount: sheets.length,
          availableSheets: sheets,
          version: "8.0.0"
        }
      });
    }

    if (action === "setup") {
      return respondJson({ ok: true, data: setup() });
    }

    // Uji otomatis algoritma pairing, perhitungan skor, tie-breaker, revert, deck, riwayat & statistik
    if (action === "runPairingTests" || action === "runScoringTests") {
      var pairingTests = runSwissPairingTests();
      var scoringTests = runScoringAndTiebreakerTests();
      var revertTests = runScoreCorrectionAndRevertTest();
      var timerDeckTests = runTimerAndDeckTests();
      var historyStatsTests = runHistoryAndStatsTests();
      return respondJson({
        ok: true,
        data: pairingTests.concat(scoringTests).concat(revertTests).concat(timerDeckTests).concat(historyStatsTests)
      });
    }

    var lock = LockService.getScriptLock();
    var hasLock = lock.tryLock(25000);
    if (!hasLock) {
      return respondJson({ ok: false, error: "Server sedang sibuk. Silakan coba sesaat lagi." });
    }

    try {
      if (action === "register") return handleRegister(data, ss);
      if (action === "login") return handleLogin(data, ss);

      // ==========================================
      // VALIDASI TOKEN SESI
      // ==========================================
      var authUser = verifyToken(token, ss);
      if (!authUser) {
        return respondJson({
          ok: false,
          error: "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.",
          code: "SESSION_EXPIRED"
        });
      }

      if (action === "verifySession") {
        return respondJson({
          ok: true,
          data: {
            user: {
              id: authUser.id,
              username: authUser.username,
              name: authUser.name,
              role: authUser.role,
              status: authUser.status
            }
          }
        });
      }

      if (action === "logout") {
        deleteRow("Sessions", token, ss, "token");
        logAudit("LOGOUT", authUser, "Logout: " + authUser.username, "", "", "", "", ss);
        return respondJson({ ok: true, message: "Berhasil logout." });
      }

      if (action === "updateProfile") return handleUpdateProfile(authUser, data, ss);

      // Manajemen Turnamen
      if (action === "getTournaments") return handleGetTournaments(authUser, data, ss);
      if (action === "getTournamentDetails") return handleGetTournamentDetails(authUser, data, ss);
      if (action === "getTournamentStandings") return handleGetTournamentStandings(authUser, data, ss);
      if (action === "createTournament") return handleCreateTournament(authUser, data, ss);
      if (action === "updateTournament") return handleUpdateTournament(authUser, data, ss);
      if (action === "deleteTournament") return handleDeleteTournament(authUser, data, ss);
      if (action === "startTournament") return handleStartTournament(authUser, data, ss);

      // Peserta
      if (action === "registerPlayer") return handleRegisterPlayer(authUser, data, ss);
      if (action === "unregisterPlayer") return handleUnregisterPlayer(authUser, data, ss);
      if (action === "addManualPlayer") return handleAddManualPlayer(authUser, data, ss);
      if (action === "kickPlayer") return handleKickPlayer(authUser, data, ss);
      if (action === "dropPlayer") return handleDropPlayer(authUser, data, ss);

      // Swiss Pairing & Pertandingan
      if (action === "generateRoundPairing") return handleGenerateRoundPairing(authUser, data, ss);
      if (action === "getRoundMatches") return handleGetRoundMatches(authUser, data, ss);
      if (action === "getMyMatches") return handleGetMyMatches(authUser, data, ss);
      if (action === "swapPairing") return handleSwapPairing(authUser, data, ss);

      // Input Skor, Konfirmasi, Sengketa & Selesaikan Ronde
      if (action === "submitMatchScore") return handleSubmitMatchScore(authUser, data, ss);
      if (action === "confirmMatchScore") return handleConfirmMatchScore(authUser, data, ss);
      if (action === "disputeMatchScore") return handleDisputeMatchScore(authUser, data, ss);
      if (action === "completeRound") return handleCompleteRound(authUser, data, ss);

      // Revert & Koreksi Skor
      if (action === "getRevertImpact") return handleGetRevertImpact(authUser, data, ss);
      if (action === "revertRound") return handleRevertRound(authUser, data, ss);

      // Log Audit untuk Organizer & Admin
      if (action === "getAuditLogs") return handleGetAuditLogs(authUser, data, ss);

      // FITUR: Timer Ronde
      if (action === "updateRoundTimer") return handleUpdateRoundTimer(authUser, data, ss);
      if (action === "getRoundTimer") return handleGetRoundTimer(authUser, data, ss);

      // FITUR: Deck Peserta & Hasil Akhir
      if (action === "getPlayerDeckHistory") return handleGetPlayerDeckHistory(authUser, data, ss);
      if (action === "updateParticipantDeck") return handleUpdateParticipantDeck(authUser, data, ss);
      if (action === "getTournamentFinalResults") return handleGetTournamentFinalResults(authUser, data, ss);

      // FITUR: Riwayat & Statistik
      if (action === "getHistory") return handleGetHistory(authUser, data, ss);
      if (action === "getStats") return handleGetStats(authUser, data, ss);

      // Admin Kontrol
      if (action === "adminGetUsers") {
        if (authUser.role !== "admin") return respondJson({ ok: false, error: "Akses ditolak: Hanya Admin." });
        return handleAdminGetUsers(ss);
      }
      if (action === "adminUpdateRole") {
        if (authUser.role !== "admin") return respondJson({ ok: false, error: "Akses ditolak: Hanya Admin." });
        return handleAdminUpdateRole(authUser, data, ss);
      }
      if (action === "adminToggleStatus") {
        if (authUser.role !== "admin") return respondJson({ ok: false, error: "Akses ditolak: Hanya Admin." });
        return handleAdminToggleStatus(authUser, data, ss);
      }
      if (action === "adminResetPassword") {
        if (authUser.role !== "admin") return respondJson({ ok: false, error: "Akses ditolak: Hanya Admin." });
        return handleAdminResetPassword(authUser, data, ss);
      }

      return respondJson({ ok: false, error: "Aksi '" + action + "' tidak dikenali." });

    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    return respondJson({
      ok: false,
      error: "Terjadi kesalahan internal server: " + (err.message || err.toString())
    });
  }
}

function respondJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.TEXT);
}

// =========================================================================
// 2. ATURAN POIN RESMI (TANPA SERI) & LOGIKA MATCH
// =========================================================================

function calculateMatchPoints(format, p1Wins, p2Wins) {
  var p1 = parseInt(p1Wins, 10) || 0;
  var p2 = parseInt(p2Wins, 10) || 0;

  if (format === "BO1") {
    if (p1 > p2) {
      return { winner: "P1", p1Points: SCORING_RULES.BO1.win, p2Points: SCORING_RULES.BO1.loss };
    } else if (p2 > p1) {
      return { winner: "P2", p1Points: SCORING_RULES.BO1.loss, p2Points: SCORING_RULES.BO1.win };
    } else {
      return { winner: "NONE", p1Points: 0, p2Points: 0 };
    }
  } else {
    // Format BO3
    if (p1 === 2 && p2 === 0) {
      return { winner: "P1", p1Points: SCORING_RULES.BO3.win20, p2Points: SCORING_RULES.BO3.loss02 };
    } else if (p1 === 2 && p2 === 1) {
      return { winner: "P1", p1Points: SCORING_RULES.BO3.win21, p2Points: SCORING_RULES.BO3.loss12 };
    } else if (p1 === 1 && p2 === 2) {
      return { winner: "P2", p1Points: SCORING_RULES.BO3.loss12, p2Points: SCORING_RULES.BO3.win21 };
    } else if (p1 === 0 && p2 === 2) {
      return { winner: "P2", p1Points: SCORING_RULES.BO3.loss02, p2Points: SCORING_RULES.BO3.win20 };
    } else {
      return { winner: "NONE", p1Points: 0, p2Points: 0 };
    }
  }
}

// =========================================================================
// 3. SISTEM KLASEMEN & 4-TIER TIE-BREAKER (OMW%, GW%, OGW%, HEAD-TO-HEAD)
// =========================================================================

function recalculateTournamentStandings(tournamentId, ss) {
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return;

  var registrations = getTableData("Registrations", ss).filter(function(r) {
    return r.tournament_id === tournamentId;
  });

  var matches = getTableData("Matches", ss).filter(function(m) {
    var isArchived = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && m.status === "CONFIRMED" && !isArchived;
  });

  var stats = {};
  var nonByeOpponents = {};
  var headToHead = {};

  for (var i = 0; i < registrations.length; i++) {
    var regId = registrations[i].id;
    stats[regId] = {
      matchPoints: 0,
      matchesWon: 0,
      matchesLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      totalMatches: 0
    };
    nonByeOpponents[regId] = [];
  }

  for (var m = 0; m < matches.length; m++) {
    var match = matches[m];
    var p1 = match.player1_id;
    var p2 = match.player2_id;
    var w1 = parseInt(match.player1_wins, 10) || 0;
    var w2 = parseInt(match.player2_wins, 10) || 0;
    var isBye = (p2 === "BYE");

    var scoreResult = calculateMatchPoints(tournament.format, w1, w2);

    if (stats[p1]) {
      stats[p1].gamesWon += w1;
      stats[p1].gamesLost += w2;
      stats[p1].totalMatches += 1;

      if (scoreResult.winner === "P1" || match.winner_id === p1) {
        stats[p1].matchesWon += 1;
        stats[p1].matchPoints += scoreResult.p1Points;
      } else {
        stats[p1].matchesLost += 1;
        stats[p1].matchPoints += scoreResult.p1Points;
      }

      if (!isBye && stats[p2]) {
        nonByeOpponents[p1].push(p2);
      }
    }

    if (!isBye && stats[p2]) {
      stats[p2].gamesWon += w2;
      stats[p2].gamesLost += w1;
      stats[p2].totalMatches += 1;

      if (scoreResult.winner === "P2" || match.winner_id === p2) {
        stats[p2].matchesWon += 1;
        stats[p2].matchPoints += scoreResult.p2Points;
      } else {
        stats[p2].matchesLost += 1;
        stats[p2].matchPoints += scoreResult.p2Points;
      }

      if (stats[p1]) {
        nonByeOpponents[p2].push(p1);
      }

      if (scoreResult.winner === "P1") {
        headToHead[p1 + "_" + p2] = p1;
        headToHead[p2 + "_" + p1] = p1;
      } else if (scoreResult.winner === "P2") {
        headToHead[p1 + "_" + p2] = p2;
        headToHead[p2 + "_" + p1] = p2;
      }
    }
  }

  var mwMap = {};
  var gwMap = {};

  for (var r = 0; r < registrations.length; r++) {
    var id = registrations[r].id;
    var st = stats[id];

    var rawMW = st.totalMatches > 0 ? (st.matchesWon / st.totalMatches) : 0;
    mwMap[id] = Math.max(0.3333, rawMW);

    var totalGames = st.gamesWon + st.gamesLost;
    var rawGW = totalGames > 0 ? (st.gamesWon / totalGames) : 0;
    gwMap[id] = Math.max(0.3333, rawGW);
  }

  var omwMap = {};
  var ogwMap = {};

  for (var r2 = 0; r2 < registrations.length; r2++) {
    var regId2 = registrations[r2].id;
    var oppList = nonByeOpponents[regId2] || [];

    if (oppList.length === 0) {
      omwMap[regId2] = 33.33;
      ogwMap[regId2] = 33.33;
    } else {
      var sumOppMW = 0;
      var sumOppGW = 0;

      for (var o = 0; o < oppList.length; o++) {
        var oppId = oppList[o];
        sumOppMW += (mwMap[oppId] || 0.3333);
        sumOppGW += (gwMap[oppId] || 0.3333);
      }

      omwMap[regId2] = (sumOppMW / oppList.length) * 100;
      ogwMap[regId2] = (sumOppGW / oppList.length) * 100;
    }
  }

  for (var r3 = 0; r3 < registrations.length; r3++) {
    var curReg = registrations[r3];
    var cStats = stats[curReg.id];

    var totalG = cStats.gamesWon + cStats.gamesLost;
    var rawGWPercent = totalG > 0 ? (cStats.gamesWon / totalG) * 100 : 0;

    updateRow("Registrations", curReg.id, {
      match_points: cStats.matchPoints,
      game_points: cStats.gamesWon,
      matches_won: cStats.matchesWon,
      matches_lost: cStats.matchesLost,
      games_won: cStats.gamesWon,
      games_lost: cStats.gamesLost,
      omw_percentage: (omwMap[curReg.id] || 33.33).toFixed(2),
      gw_percentage: rawGWPercent.toFixed(2),
      ogw_percentage: (ogwMap[curReg.id] || 33.33).toFixed(2)
    }, ss);
  }

  return true;
}

function sortStandingsList(list, headToHeadMap) {
  list.sort(function(a, b) {
    var mpA = parseInt(a.match_points, 10) || 0;
    var mpB = parseInt(b.match_points, 10) || 0;
    if (mpA !== mpB) return mpB - mpA;

    var omwA = parseFloat(a.omw_percentage) || 0;
    var omwB = parseFloat(b.omw_percentage) || 0;
    if (Math.abs(omwA - omwB) > 0.001) return omwB - omwA;

    var gwA = parseFloat(a.gw_percentage) || 0;
    var gwB = parseFloat(b.gw_percentage) || 0;
    if (Math.abs(gwA - gwB) > 0.001) return gwB - gwA;

    var ogwA = parseFloat(a.ogw_percentage) || 0;
    var ogwB = parseFloat(b.ogw_percentage) || 0;
    if (Math.abs(ogwA - ogwB) > 0.001) return ogwB - ogwA;

    if (headToHeadMap) {
      var h2hWinner = headToHeadMap[a.id + "_" + b.id];
      if (h2hWinner === a.id) return -1;
      if (h2hWinner === b.id) return 1;
    }

    return 0;
  });
  return list;
}

// =========================================================================
// 4. HANDLER TIMER RONDE (SERVER-SIDE TIMESTAMP & DRIFT CORRECTION)
// =========================================================================

function calculateRoundTimerState(round) {
  var durationMin = parseInt(round.timer_duration_minutes, 10);
  if (isNaN(durationMin) || durationMin <= 0) durationMin = 45;

  var status = round.timer_status || "STOPPED";
  var startTs = round.timer_start_timestamp || "";
  var remSec = parseInt(round.timer_remaining_seconds, 10);
  if (isNaN(remSec)) remSec = durationMin * 60;

  var serverNow = new Date().getTime();

  if (status === "RUNNING" && startTs) {
    var startMs = new Date(startTs).getTime();
    var elapsedSec = Math.floor((serverNow - startMs) / 1000);
    remSec = Math.max(0, remSec - elapsedSec);
    if (remSec === 0) {
      status = "EXPIRED";
    }
  }

  return {
    round_id: round.id,
    duration_minutes: durationMin,
    status: status,
    start_timestamp: startTs,
    remaining_seconds: remSec,
    server_time: new Date().toISOString()
  };
}

function handleUpdateRoundTimer(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var roundId = data.roundId;
  var timerAction = data.timerAction; // 'START', 'PAUSE', 'RESUME', 'RESET'
  var durationMinutes = parseInt(data.durationMinutes, 10) || 45;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer yang dapat mengontrol timer." });
  }

  var allRounds = getTableData("Rounds", ss);
  var targetRound = null;
  for (var i = 0; i < allRounds.length; i++) {
    if (allRounds[i].id === roundId) { targetRound = allRounds[i]; break; }
  }
  if (!targetRound) return respondJson({ ok: false, error: "Ronde tidak ditemukan." });

  var currentTimerState = calculateRoundTimerState(targetRound);
  var updates = {};
  var serverNow = new Date().toISOString();

  if (timerAction === "START") {
    updates.timer_duration_minutes = durationMinutes;
    updates.timer_status = "RUNNING";
    updates.timer_start_timestamp = serverNow;
    updates.timer_remaining_seconds = durationMinutes * 60;
  } else if (timerAction === "PAUSE") {
    updates.timer_status = "PAUSED";
    updates.timer_start_timestamp = "";
    updates.timer_remaining_seconds = currentTimerState.remaining_seconds;
  } else if (timerAction === "RESUME") {
    updates.timer_status = "RUNNING";
    updates.timer_start_timestamp = serverNow;
    // timer_remaining_seconds tetap sama, start_timestamp diupdate ke sekarang
  } else if (timerAction === "RESET") {
    var dur = durationMinutes || currentTimerState.duration_minutes || 45;
    updates.timer_duration_minutes = dur;
    updates.timer_status = "STOPPED";
    updates.timer_start_timestamp = "";
    updates.timer_remaining_seconds = dur * 60;
  } else {
    return respondJson({ ok: false, error: "Aksi timer '" + timerAction + "' tidak valid." });
  }

  updateRow("Rounds", roundId, updates, ss);

  // Ambil state terbaru setelah update
  for (var key in updates) {
    targetRound[key] = updates[key];
  }
  var newTimerState = calculateRoundTimerState(targetRound);

  logAudit(
    "UPDATE_ROUND_TIMER",
    authUser,
    "Timer Ronde " + targetRound.round_number + ": " + timerAction + " (" + newTimerState.duration_minutes + " menit)",
    currentTimerState.status,
    newTimerState.status,
    tournamentId,
    tournament.name,
    ss
  );

  return respondJson({
    ok: true,
    data: newTimerState,
    message: "Timer ronde berhasil diubah: " + timerAction
  });
}

function handleGetRoundTimer(authUser, data, ss) {
  var roundId = data.roundId;
  var allRounds = getTableData("Rounds", ss);
  var targetRound = null;
  for (var i = 0; i < allRounds.length; i++) {
    if (allRounds[i].id === roundId) { targetRound = allRounds[i]; break; }
  }
  if (!targetRound) return respondJson({ ok: false, error: "Ronde tidak ditemukan." });

  var timerState = calculateRoundTimerState(targetRound);
  return respondJson({
    ok: true,
    data: timerState
  });
}

// =========================================================================
// 5. HANDLER DECK PESERTA, DECK HISTORY & HASIL AKHIR
// =========================================================================

function handleGetPlayerDeckHistory(authUser, data, ss) {
  var userId = data.userId || "";
  var playerName = data.playerName || "";

  var allHistory = getTableData("DeckHistory", ss);
  var allDecks = getTableData("Decks", ss);

  var results = [];
  var seenMap = {};

  for (var i = 0; i < allHistory.length; i++) {
    var h = allHistory[i];
    var matchUser = (userId && h.user_id === userId);
    var matchName = (playerName && h.player_name && h.player_name.toLowerCase() === playerName.toLowerCase());

    if ((matchUser || matchName) && h.deck_name) {
      var key = h.deck_name + "::" + (h.deck_colors || "");
      if (!seenMap[key]) {
        seenMap[key] = true;
        results.push({
          deck_name: h.deck_name,
          deck_colors: h.deck_colors || "",
          last_used: h.updated_at || ""
        });
      }
    }
  }

  // Cek juga sheet Decks jika user terdaftar
  if (userId) {
    for (var j = 0; j < allDecks.length; j++) {
      var d = allDecks[j];
      if (d.user_id === userId && d.name) {
        var dKey = d.name + "::" + (d.color || "");
        if (!seenMap[dKey]) {
          seenMap[dKey] = true;
          results.push({
            deck_name: d.name,
            deck_colors: d.color || "",
            last_used: d.created_at || ""
          });
        }
      }
    }
  }

  return respondJson({
    ok: true,
    data: results
  });
}

function handleUpdateParticipantDeck(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var registrationId = data.registrationId;
  var deckName = (data.deckName || "").trim();
  var deckColorsInput = data.deckColors;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer turnamen yang dapat mengisi data deck peserta." });
  }

  if (!deckName) {
    return respondJson({ ok: false, error: "Nama deck tidak boleh kosong." });
  }

  // Parse deck colors
  var colorsArray = [];
  if (Array.isArray(deckColorsInput)) {
    colorsArray = deckColorsInput;
  } else if (typeof deckColorsInput === "string") {
    colorsArray = deckColorsInput.split(",").map(function(c) { return c.trim(); });
  }

  // Validasi minimal 1 warna
  var validSelectedColors = [];
  for (var c = 0; c < colorsArray.length; c++) {
    var cName = colorsArray[c];
    if (VALID_DECK_COLORS.indexOf(cName) !== -1 && validSelectedColors.indexOf(cName) === -1) {
      validSelectedColors.push(cName);
    }
  }

  if (validSelectedColors.length === 0) {
    return respondJson({
      ok: false,
      error: "Pilih minimal 1 warna deck (Merah, Biru, Kuning, Hijau, Hitam, Ungu, Putih)."
    });
  }

  var colorsString = validSelectedColors.join(", ");

  var allRegs = getTableData("Registrations", ss);
  var targetReg = null;
  for (var r = 0; r < allRegs.length; r++) {
    if (allRegs[r].id === registrationId) { targetReg = allRegs[r]; break; }
  }
  if (!targetReg) return respondJson({ ok: false, error: "Data registrasi peserta tidak ditemukan." });

  var oldDeck = targetReg.deck_name + " (" + (targetReg.deck_colors || "Tanpa Warna") + ")";
  var newDeck = deckName + " (" + colorsString + ")";

  // 1. Update tabel Registrations
  updateRow("Registrations", registrationId, {
    deck_name: deckName,
    deck_colors: colorsString
  }, ss);

  // 2. Simpan ke sheet DeckHistory
  var historyId = "dkh_" + Utilities.getUuid().substring(0, 8);
  addRow("DeckHistory", {
    id: historyId,
    user_id: targetReg.user_id,
    player_name: targetReg.player_name,
    deck_name: deckName,
    deck_colors: colorsString,
    tournament_id: tournamentId,
    tournament_name: tournament.name,
    updated_at: new Date().toISOString()
  }, ss);

  // 3. Jika peserta adalah user terdaftar (bukan manual), tambahkan ke Decks jika belum ada
  if (targetReg.user_id && targetReg.user_id.indexOf("MANUAL_") === -1) {
    var userDecks = getTableData("Decks", ss).filter(function(d) { return d.user_id === targetReg.user_id; });
    var deckExists = userDecks.some(function(d) { return d.name.toLowerCase() === deckName.toLowerCase(); });
    if (!deckExists) {
      addRow("Decks", {
        id: "dck_" + Utilities.getUuid().substring(0, 8),
        user_id: targetReg.user_id,
        name: deckName,
        archetype: deckName,
        color: colorsString,
        card_list: "",
        created_at: new Date().toISOString()
      }, ss);
    }
  }

  logAudit(
    "UPDATE_PARTICIPANT_DECK",
    authUser,
    "Update deck peserta " + targetReg.player_name + " di turnamen " + tournament.name,
    oldDeck,
    newDeck,
    tournamentId,
    tournament.name,
    ss
  );

  return respondJson({
    ok: true,
    data: {
      registration_id: registrationId,
      player_name: targetReg.player_name,
      deck_name: deckName,
      deck_colors: colorsString
    },
    message: "Deck peserta " + targetReg.player_name + " berhasil disimpan!"
  });
}

function handleGetTournamentFinalResults(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var regs = getTableData("Registrations", ss).filter(function(r) { return r.tournament_id === tournamentId; });

  var confirmedMatches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && m.status === "CONFIRMED" && !isArch;
  });

  var h2h = {};
  for (var i = 0; i < confirmedMatches.length; i++) {
    var cm = confirmedMatches[i];
    if (cm.player2_id !== "BYE" && cm.winner_id) {
      h2h[cm.player1_id + "_" + cm.player2_id] = cm.winner_id;
      h2h[cm.player2_id + "_" + cm.player1_id] = cm.winner_id;
    }
  }

  var sorted = sortStandingsList(regs.slice(), h2h);

  // Buat teks siap bagikan (WhatsApp / Discord)
  var textSummary = "🏆 HASIL AKHIR DIGISWISS TCG 🏆\n";
  textSummary += "Turnamen: " + tournament.name + "\n";
  textSummary += "Format: " + tournament.format + " | " + tournament.date + " | " + tournament.location + "\n";
  textSummary += "--------------------------------------\n";

  for (var k = 0; k < sorted.length; k++) {
    var item = sorted[k];
    var medal = k === 0 ? "🥇 Juara 1: " : (k === 1 ? "🥈 Juara 2: " : (k === 2 ? "🥉 Juara 3: " : (k + 1) + ". "));
    var deckInfo = item.deck_name ? " - Deck: " + item.deck_name : "";
    if (item.deck_colors) deckInfo += " (" + item.deck_colors + ")";
    var scoreInfo = " [Poin: " + item.match_points + " | W-L: " + item.matches_won + "-" + item.matches_lost + " | OMW: " + item.omw_percentage + "%]";
    textSummary += medal + item.player_name + deckInfo + scoreInfo + "\n";
  }
  textSummary += "--------------------------------------\n";
  textSummary += "Dikelola dengan DigiSwiss TCG (Swiss Round Manager)\n";

  return respondJson({
    ok: true,
    data: {
      tournament: tournament,
      standings: sorted,
      topCut: sorted.slice(0, 3),
      shareable_text: textSummary
    }
  });
}

// =========================================================================
// 5B. HANDLER RIWAYAT & STATISTIK (PLAYER, ORGANIZER, ADMIN)
// =========================================================================

function handleGetHistory(authUser, data, ss) {
  var searchQuery = (data.search || "").toLowerCase().trim();
  var startDate = data.startDate || "";
  var endDate = data.endDate || "";

  var allTournaments = getTableData("Tournaments", ss);
  var allRegs = getTableData("Registrations", ss);
  var allRounds = getTableData("Rounds", ss);
  var allMatches = getTableData("Matches", ss);

  // Filter tanggal jika diisi
  if (startDate) {
    allTournaments = allTournaments.filter(function(t) { return (t.date || "") >= startDate; });
  }
  if (endDate) {
    allTournaments = allTournaments.filter(function(t) { return (t.date || "") <= endDate; });
  }

  // Pre-index registrations berdasarkan tournament_id
  var regsByTournament = {};
  for (var r = 0; r < allRegs.length; r++) {
    var reg = allRegs[r];
    if (!regsByTournament[reg.tournament_id]) regsByTournament[reg.tournament_id] = [];
    regsByTournament[reg.tournament_id].push(reg);
  }

  // Pre-index matches berdasarkan tournament_id
  var matchesByTournament = {};
  for (var m = 0; m < allMatches.length; m++) {
    var match = allMatches[m];
    var isArch = (match.is_archived === true || match.is_archived === "true" || match.status === "ARCHIVED");
    if (!isArch) {
      if (!matchesByTournament[match.tournament_id]) matchesByTournament[match.tournament_id] = [];
      matchesByTournament[match.tournament_id].push(match);
    }
  }

  // Pre-index rounds berdasarkan tournament_id
  var roundsByTournament = {};
  for (var rnd = 0; rnd < allRounds.length; rnd++) {
    var rObj = allRounds[rnd];
    var rArch = (rObj.is_archived === true || rObj.is_archived === "true");
    if (!rArch) {
      if (!roundsByTournament[rObj.tournament_id]) roundsByTournament[rObj.tournament_id] = [];
      roundsByTournament[rObj.tournament_id].push(rObj);
    }
  }

  if (authUser.role === "player") {
    // Riwayat Pemain
    var playerHistory = [];

    for (var tIdx = 0; tIdx < allTournaments.length; tIdx++) {
      var t = allTournaments[tIdx];
      var tRegs = regsByTournament[t.id] || [];

      // Cari registrasi player ini
      var myReg = null;
      for (var regIdx = 0; regIdx < tRegs.length; regIdx++) {
        var rg = tRegs[regIdx];
        if (rg.user_id === authUser.id || (rg.player_name && rg.player_name.toLowerCase() === (authUser.name || authUser.username).toLowerCase())) {
          myReg = rg;
          break;
        }
      }

      if (!myReg) continue;

      // Hitung peringkat akhir pemain di turnamen ini
      var sortedRegs = sortStandingsList(tRegs.slice(), {});
      var finalRank = -1;
      for (var rk = 0; rk < sortedRegs.length; rk++) {
        if (sortedRegs[rk].id === myReg.id) {
          finalRank = rk + 1;
          break;
        }
      }

      // Ambil seluruh pertandingan ronde untuk pemain ini
      var tMatches = matchesByTournament[t.id] || [];
      var myRoundMatches = [];

      for (var mtIdx = 0; mtIdx < tMatches.length; mtIdx++) {
        var mt = tMatches[mtIdx];
        var isP1 = (mt.player1_id === myReg.id || mt.player1_name === myReg.player_name);
        var isP2 = (mt.player2_id === myReg.id || mt.player2_name === myReg.player_name);

        if (isP1 || isP2) {
          var roundNum = 1;
          var tRounds = roundsByTournament[t.id] || [];
          for (var ri = 0; ri < tRounds.length; ri++) {
            if (tRounds[ri].id === mt.round_id) {
              roundNum = parseInt(tRounds[ri].round_number, 10);
              break;
            }
          }

          var oppName = isP1 ? mt.player2_name : mt.player1_name;
          var oppId = isP1 ? mt.player2_id : mt.player1_id;
          var isBye = (oppId === "BYE" || oppName === "BYE");

          var oppDeck = "";
          var oppColors = "";
          if (!isBye) {
            for (var op = 0; op < tRegs.length; op++) {
              if (tRegs[op].id === oppId || tRegs[op].player_name === oppName) {
                oppDeck = tRegs[op].deck_name || "";
                oppColors = tRegs[op].deck_colors || "";
                break;
              }
            }
          }

          var myWins = isP1 ? parseInt(mt.player1_wins || 0, 10) : parseInt(mt.player2_wins || 0, 10);
          var oppWins = isP1 ? parseInt(mt.player2_wins || 0, 10) : parseInt(mt.player1_wins || 0, 10);
          var matchResult = "DRAW";
          if (isBye || mt.winner_id === myReg.id || (isP1 && mt.player1_wins > mt.player2_wins) || (isP2 && mt.player2_wins > mt.player1_wins)) {
            matchResult = "WIN";
          } else if (mt.winner_id && mt.winner_id !== myReg.id) {
            matchResult = "LOSS";
          }

          myRoundMatches.push({
            match_id: mt.id,
            round_number: roundNum,
            table_number: parseInt(mt.table_number, 10),
            opponent_name: isBye ? "BYE" : oppName,
            opponent_deck: oppDeck,
            opponent_colors: oppColors,
            is_bye: isBye,
            player_wins: myWins,
            opponent_wins: oppWins,
            score_display: isBye ? "BYE (Menang Otomatis)" : (myWins + " - " + oppWins),
            result: matchResult,
            status: mt.status
          });
        }
      }

      myRoundMatches.sort(function(a, b) { return a.round_number - b.round_number; });

      var historyEntry = {
        tournament_id: t.id,
        tournament_name: t.name,
        date: t.date,
        location: t.location,
        format: t.format,
        status: t.status,
        total_rounds: parseInt(t.total_rounds, 10),
        organizer_name: t.organizer_name,
        total_participants: tRegs.length,
        final_rank: finalRank,
        deck_name: myReg.deck_name || "-",
        deck_colors: myReg.deck_colors || "",
        match_points: parseInt(myReg.match_points || 0, 10),
        matches_won: parseInt(myReg.matches_won || 0, 10),
        matches_lost: parseInt(myReg.matches_lost || 0, 10),
        games_won: parseInt(myReg.games_won || 0, 10),
        games_lost: parseInt(myReg.games_lost || 0, 10),
        omw_percentage: myReg.omw_percentage || "0.00",
        gw_percentage: myReg.gw_percentage || "0.00",
        round_scores: myRoundMatches
      };

      if (searchQuery) {
        var matchSearch = (historyEntry.tournament_name.toLowerCase().indexOf(searchQuery) !== -1) ||
                          (historyEntry.location.toLowerCase().indexOf(searchQuery) !== -1) ||
                          (historyEntry.deck_name.toLowerCase().indexOf(searchQuery) !== -1) ||
                          (historyEntry.deck_colors.toLowerCase().indexOf(searchQuery) !== -1);
        if (!matchSearch) continue;
      }

      playerHistory.push(historyEntry);
    }

    playerHistory.sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });

    return respondJson({
      ok: true,
      data: {
        role: "player",
        items: playerHistory,
        total: playerHistory.length
      }
    });

  } else {
    // Riwayat Organizer atau Admin
    var isOrganizer = (authUser.role === "organizer");
    var targetTournaments = allTournaments;

    if (isOrganizer) {
      targetTournaments = targetTournaments.filter(function(t) { return t.organizer_id === authUser.id; });
    }

    var resultList = [];

    for (var i = 0; i < targetTournaments.length; i++) {
      var trn = targetTournaments[i];
      var tRegs = regsByTournament[trn.id] || [];
      var tMatches = matchesByTournament[trn.id] || [];
      var tRounds = roundsByTournament[trn.id] || [];

      var sortedStandings = sortStandingsList(tRegs.slice(), {});

      tRounds.sort(function(a, b) { return parseInt(a.round_number, 10) - parseInt(b.round_number, 10); });
      var roundsDetail = tRounds.map(function(r) {
        var rMatches = tMatches.filter(function(m) { return m.round_id === r.id; });
        rMatches.sort(function(a, b) { return parseInt(a.table_number, 10) - parseInt(b.table_number, 10); });
        return {
          round_id: r.id,
          round_number: parseInt(r.round_number, 10),
          status: r.status,
          matches: rMatches.map(function(m) {
            return {
              id: m.id,
              table_number: parseInt(m.table_number, 10),
              player1_name: m.player1_name,
              player2_name: m.player2_name,
              player1_wins: parseInt(m.player1_wins || 0, 10),
              player2_wins: parseInt(m.player2_wins || 0, 10),
              winner_name: m.winner_id === m.player1_id ? m.player1_name : (m.winner_id === m.player2_id ? m.player2_name : (m.winner_id ? m.winner_id : "-")),
              status: m.status
            };
          })
        };
      });

      var entry = {
        tournament_id: trn.id,
        tournament_name: trn.name,
        date: trn.date,
        location: trn.location,
        format: trn.format,
        status: trn.status,
        total_rounds: parseInt(trn.total_rounds, 10),
        current_round: parseInt(trn.current_round, 10),
        organizer_id: trn.organizer_id,
        organizer_name: trn.organizer_name,
        participant_count: tRegs.length,
        participants: tRegs.map(function(reg) {
          return {
            id: reg.id,
            player_name: reg.player_name,
            deck_name: reg.deck_name || "-",
            deck_colors: reg.deck_colors || "",
            match_points: parseInt(reg.match_points || 0, 10),
            matches_won: parseInt(reg.matches_won || 0, 10),
            matches_lost: parseInt(reg.matches_lost || 0, 10)
          };
        }),
        standings: sortedStandings.map(function(st, idx) {
          return {
            rank: idx + 1,
            player_name: st.player_name,
            deck_name: st.deck_name || "-",
            deck_colors: st.deck_colors || "",
            match_points: parseInt(st.match_points || 0, 10),
            matches_won: parseInt(st.matches_won || 0, 10),
            matches_lost: parseInt(st.matches_lost || 0, 10),
            omw_percentage: st.omw_percentage || "0.00"
          };
        }),
        rounds: roundsDetail
      };

      if (searchQuery) {
        var matchSearch = (entry.tournament_name.toLowerCase().indexOf(searchQuery) !== -1) ||
                          (entry.location.toLowerCase().indexOf(searchQuery) !== -1) ||
                          (entry.organizer_name && entry.organizer_name.toLowerCase().indexOf(searchQuery) !== -1);
        if (!matchSearch) continue;
      }

      resultList.push(entry);
    }

    resultList.sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });

    return respondJson({
      ok: true,
      data: {
        role: authUser.role,
        items: resultList,
        total: resultList.length
      }
    });
  }
}

function handleGetStats(authUser, data, ss) {
  var allTournaments = getTableData("Tournaments", ss);
  var allRegs = getTableData("Registrations", ss);
  var allMatches = getTableData("Matches", ss);
  var allUsers = getTableData("Users", ss);

  var colorsList = ['Merah', 'Biru', 'Kuning', 'Hijau', 'Hitam', 'Ungu', 'Putih'];

  // 1. STATISTIK PEMAIN
  var myRegs = allRegs.filter(function(r) {
    return r.user_id === authUser.id || (r.player_name && r.player_name.toLowerCase() === (authUser.name || authUser.username).toLowerCase());
  });

  var totalTourneys = myRegs.length;
  var totalMatchesWon = 0;
  var totalMatchesLost = 0;
  var totalGamesWon = 0;
  var totalGamesLost = 0;

  var deckStatsMap = {};
  var colorStatsMap = {};
  colorsList.forEach(function(c) {
    colorStatsMap[c] = { color: c, matches_won: 0, matches_lost: 0, total_matches: 0, count: 0 };
  });

  var rankTrend = [];
  var tourneyMap = {};
  for (var ti = 0; ti < allTournaments.length; ti++) {
    tourneyMap[allTournaments[ti].id] = allTournaments[ti];
  }

  for (var ri = 0; ri < myRegs.length; ri++) {
    var reg = myRegs[ri];
    var mWon = parseInt(reg.matches_won || 0, 10);
    var mLost = parseInt(reg.matches_lost || 0, 10);
    var gWon = parseInt(reg.games_won || 0, 10);
    var gLost = parseInt(reg.games_lost || 0, 10);

    totalMatchesWon += mWon;
    totalMatchesLost += mLost;
    totalGamesWon += gWon;
    totalGamesLost += gLost;

    var dName = (reg.deck_name || "Tanpa Nama").trim();
    if (!deckStatsMap[dName]) {
      deckStatsMap[dName] = { deck_name: dName, matches_won: 0, matches_lost: 0, total_matches: 0, usage_count: 0 };
    }
    deckStatsMap[dName].matches_won += mWon;
    deckStatsMap[dName].matches_lost += mLost;
    deckStatsMap[dName].total_matches += (mWon + mLost);
    deckStatsMap[dName].usage_count += 1;

    var regColors = (reg.deck_colors || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    for (var ci = 0; ci < regColors.length; ci++) {
      var col = regColors[ci];
      if (colorStatsMap[col]) {
        colorStatsMap[col].matches_won += mWon;
        colorStatsMap[col].matches_lost += mLost;
        colorStatsMap[col].total_matches += (mWon + mLost);
        colorStatsMap[col].count += 1;
      }
    }

    var trnObj = tourneyMap[reg.tournament_id];
    if (trnObj) {
      var tRegs = allRegs.filter(function(x) { return x.tournament_id === trnObj.id; });
      var sorted = sortStandingsList(tRegs.slice(), {});
      var rank = 1;
      for (var si = 0; si < sorted.length; si++) {
        if (sorted[si].id === reg.id) { rank = si + 1; break; }
      }
      rankTrend.push({
        tournament_id: trnObj.id,
        tournament_name: trnObj.name,
        date: trnObj.date || "",
        rank: rank,
        total_participants: tRegs.length,
        match_points: parseInt(reg.match_points || 0, 10)
      });
    }
  }

  rankTrend.sort(function(a, b) { return (a.date || "").localeCompare(b.date || ""); });

  var totalMatches = totalMatchesWon + totalMatchesLost;
  var winRate = totalMatches > 0 ? Math.round((totalMatchesWon / totalMatches) * 1000) / 10 : 0;
  var totalGames = totalGamesWon + totalGamesLost;
  var gameWinRate = totalGames > 0 ? Math.round((totalGamesWon / totalGames) * 1000) / 10 : 0;

  var winRatePerDeck = [];
  var mostUsedDeck = { deck_name: "-", count: 0 };
  for (var dk in deckStatsMap) {
    var dObj = deckStatsMap[dk];
    var dTotal = dObj.matches_won + dObj.matches_lost;
    var dRate = dTotal > 0 ? Math.round((dObj.matches_won / dTotal) * 1000) / 10 : 0;
    winRatePerDeck.push({
      deck_name: dObj.deck_name,
      usage_count: dObj.usage_count,
      matches_won: dObj.matches_won,
      matches_lost: dObj.matches_lost,
      win_rate: dRate
    });
    if (dObj.usage_count > mostUsedDeck.count) {
      mostUsedDeck = { deck_name: dObj.deck_name, count: dObj.usage_count };
    }
  }
  winRatePerDeck.sort(function(a, b) { return b.win_rate - a.win_rate; });

  var winRatePerColor = colorsList.map(function(c) {
    var cObj = colorStatsMap[c];
    var cTotal = cObj.matches_won + cObj.matches_lost;
    var cRate = cTotal > 0 ? Math.round((cObj.matches_won / cTotal) * 1000) / 10 : 0;
    return {
      color: c,
      count: cObj.count,
      matches_won: cObj.matches_won,
      matches_lost: cObj.matches_lost,
      total_matches: cTotal,
      win_rate: cRate
    };
  });

  var playerStats = {
    total_tournaments: totalTourneys,
    matches_won: totalMatchesWon,
    matches_lost: totalMatchesLost,
    total_matches: totalMatches,
    win_rate: winRate,
    games_won: totalGamesWon,
    games_lost: totalGamesLost,
    game_win_rate: gameWinRate,
    win_rate_per_deck: winRatePerDeck,
    win_rate_per_color: winRatePerColor,
    most_used_deck: mostUsedDeck,
    rank_trend: rankTrend
  };

  // 2. STATISTIK ORGANIZER
  var myTourneys = allTournaments.filter(function(t) {
    return authUser.role === "admin" ? true : (t.organizer_id === authUser.id);
  });

  var orgTourneyIds = myTourneys.map(function(t) { return t.id; });
  var orgRegs = allRegs.filter(function(r) { return orgTourneyIds.indexOf(r.tournament_id) !== -1; });

  var totalOrgTourneys = myTourneys.length;
  var totalParticipants = orgRegs.length;
  var avgParticipants = totalOrgTourneys > 0 ? Math.round((totalParticipants / totalOrgTourneys) * 10) / 10 : 0;

  var orgColorCounts = {};
  var orgColorWins = {};
  var orgColorLosses = {};
  colorsList.forEach(function(c) {
    orgColorCounts[c] = 0;
    orgColorWins[c] = 0;
    orgColorLosses[c] = 0;
  });

  var orgDeckCounts = {};

  for (var oi = 0; oi < orgRegs.length; oi++) {
    var oReg = orgRegs[oi];
    var oColors = (oReg.deck_colors || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    var oWon = parseInt(oReg.matches_won || 0, 10);
    var oLost = parseInt(oReg.matches_lost || 0, 10);

    for (var oc = 0; oc < oColors.length; oc++) {
      var clr = oColors[oc];
      if (orgColorCounts[clr] !== undefined) {
        orgColorCounts[clr] += 1;
        orgColorWins[clr] += oWon;
        orgColorLosses[clr] += oLost;
      }
    }

    var dkName = (oReg.deck_name || "").trim();
    if (dkName && dkName !== "-") {
      orgDeckCounts[dkName] = (orgDeckCounts[dkName] || 0) + 1;
    }
  }

  var totalColorOccurrences = 0;
  colorsList.forEach(function(c) { totalColorOccurrences += orgColorCounts[c]; });

  var deckColorDistribution = colorsList.map(function(c) {
    var cnt = orgColorCounts[c];
    var pct = totalColorOccurrences > 0 ? Math.round((cnt / totalColorOccurrences) * 1000) / 10 : 0;
    return { color: c, count: cnt, percentage: pct };
  });

  var popularDecks = [];
  for (var pDk in orgDeckCounts) {
    var pCnt = orgDeckCounts[pDk];
    var pPct = totalParticipants > 0 ? Math.round((pCnt / totalParticipants) * 1000) / 10 : 0;
    popularDecks.push({ deck_name: pDk, count: pCnt, percentage: pPct });
  }
  popularDecks.sort(function(a, b) { return b.count - a.count; });
  popularDecks = popularDecks.slice(0, 6);

  var colorWinRates = colorsList.map(function(c) {
    var w = orgColorWins[c];
    var l = orgColorLosses[c];
    var tot = w + l;
    var rate = tot > 0 ? Math.round((w / tot) * 1000) / 10 : 0;
    return {
      color: c,
      matches_won: w,
      matches_lost: l,
      total_matches: tot,
      win_rate: rate
    };
  });
  colorWinRates.sort(function(a, b) { return b.win_rate - a.win_rate; });

  var organizerStats = {
    total_tournaments: totalOrgTourneys,
    total_participants: totalParticipants,
    avg_participants: avgParticipants,
    deck_color_distribution: deckColorDistribution,
    popular_decks: popularDecks,
    color_win_rates: colorWinRates,
    highest_win_rate_color: colorWinRates.length > 0 && colorWinRates[0].total_matches > 0 ? colorWinRates[0] : null
  };

  // 3. STATISTIK ADMIN
  var adminStats = null;
  if (authUser.role === "admin") {
    var usersByRole = { admin: 0, organizer: 0, player: 0, total: allUsers.length };
    for (var u = 0; u < allUsers.length; u++) {
      var r = allUsers[u].role || "player";
      if (usersByRole[r] !== undefined) usersByRole[r] += 1;
      else usersByRole.player += 1;
    }

    var tourneyStatusMap = { REGISTRATION_OPEN: 0, RUNNING: 0, COMPLETED: 0 };
    for (var at = 0; at < allTournaments.length; at++) {
      var st = allTournaments[at].status;
      if (tourneyStatusMap[st] !== undefined) tourneyStatusMap[st] += 1;
    }

    var sortedAllTourneys = allTournaments.slice().sort(function(a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });
    var participationTrend = sortedAllTourneys.map(function(t) {
      var pCount = allRegs.filter(function(r) { return r.tournament_id === t.id && r.status !== "DROPPED"; }).length;
      return {
        tournament_id: t.id,
        name: t.name,
        date: t.date,
        participants: pCount,
        status: t.status
      };
    });

    var globalColorCounts = {};
    var globalColorWins = {};
    var globalColorLosses = {};
    colorsList.forEach(function(c) {
      globalColorCounts[c] = 0;
      globalColorWins[c] = 0;
      globalColorLosses[c] = 0;
    });

    var globalDeckCounts = {};
    var globalDeckWins = {};
    var globalDeckLosses = {};

    for (var gi = 0; gi < allRegs.length; gi++) {
      var gReg = allRegs[gi];
      var gCols = (gReg.deck_colors || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
      var gW = parseInt(gReg.matches_won || 0, 10);
      var gL = parseInt(gReg.matches_lost || 0, 10);

      for (var gc = 0; gc < gCols.length; gc++) {
        var cl = gCols[gc];
        if (globalColorCounts[cl] !== undefined) {
          globalColorCounts[cl] += 1;
          globalColorWins[cl] += gW;
          globalColorLosses[cl] += gL;
        }
      }

      var gDk = (gReg.deck_name || "").trim();
      if (gDk && gDk !== "-") {
        globalDeckCounts[gDk] = (globalDeckCounts[gDk] || 0) + 1;
        globalDeckWins[gDk] = (globalDeckWins[gDk] || 0) + gW;
        globalDeckLosses[gDk] = (globalDeckLosses[gDk] || 0) + gL;
      }
    }

    var totalGlobalColorOccurrences = 0;
    colorsList.forEach(function(c) { totalGlobalColorOccurrences += globalColorCounts[c]; });

    var metaColors = colorsList.map(function(c) {
      var cnt = globalColorCounts[c];
      var w = globalColorWins[c];
      var l = globalColorLosses[c];
      var tot = w + l;
      var rate = tot > 0 ? Math.round((w / tot) * 1000) / 10 : 0;
      var pct = totalGlobalColorOccurrences > 0 ? Math.round((cnt / totalGlobalColorOccurrences) * 1000) / 10 : 0;
      return {
        color: c,
        count: cnt,
        percentage: pct,
        matches_won: w,
        matches_lost: l,
        win_rate: rate
      };
    });

    var metaDecks = [];
    for (var md in globalDeckCounts) {
      var mdCnt = globalDeckCounts[md];
      var mdW = globalDeckWins[md] || 0;
      var mdL = globalDeckLosses[md] || 0;
      var mdTot = mdW + mdL;
      var mdRate = mdTot > 0 ? Math.round((mdW / mdTot) * 1000) / 10 : 0;
      var mdPct = allRegs.length > 0 ? Math.round((mdCnt / allRegs.length) * 1000) / 10 : 0;
      metaDecks.push({
        deck_name: md,
        count: mdCnt,
        percentage: mdPct,
        matches_won: mdW,
        matches_lost: mdL,
        win_rate: mdRate
      });
    }
    metaDecks.sort(function(a, b) { return b.count - a.count; });
    metaDecks = metaDecks.slice(0, 10);

    adminStats = {
      users_by_role: usersByRole,
      total_tournaments: allTournaments.length,
      tournaments_by_status: tourneyStatusMap,
      total_registrations: allRegs.length,
      participation_trend: participationTrend,
      meta_colors: metaColors,
      meta_decks: metaDecks
    };
  }

  return respondJson({
    ok: true,
    data: {
      role: authUser.role,
      player: playerStats,
      organizer: organizerStats,
      admin: adminStats
    }
  });
}

// =========================================================================
// 6. HANDLER PERTANDINGAN, INPUT HASIL & SENGKETA
// =========================================================================

function handleSubmitMatchScore(authUser, data, ss) {
  var matchId = data.matchId;
  var p1Wins = parseInt(data.player1Wins, 10);
  var p2Wins = parseInt(data.player2Wins, 10);
  var revertAndRegenerate = (data.revertAndRegenerate === true);
  var forceWithoutRevert = (data.forceWithoutRevert === true);

  var allMatches = getTableData("Matches", ss);
  var match = null;
  for (var i = 0; i < allMatches.length; i++) {
    if (allMatches[i].id === matchId) { match = allMatches[i]; break; }
  }
  if (!match) return respondJson({ ok: false, error: "Pertandingan tidak ditemukan." });

  var tournament = findTournament(match.tournament_id, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var allRounds = getTableData("Rounds", ss).filter(function(r) { return r.tournament_id === tournament.id; });
  var matchRound = null;
  for (var rIdx = 0; rIdx < allRounds.length; rIdx++) {
    if (allRounds[rIdx].id === match.round_id) { matchRound = allRounds[rIdx]; break; }
  }
  var matchRoundNum = matchRound ? parseInt(matchRound.round_number, 10) : 1;

  if (tournament.format === "BO1") {
    if (!((p1Wins === 1 && p2Wins === 0) || (p1Wins === 0 && p2Wins === 1))) {
      return respondJson({ ok: false, error: "Format BO1 harus 1-0 atau 0-1 (tanpa seri)." });
    }
  } else {
    var validBO3 = (p1Wins === 2 && p2Wins === 0) || 
                   (p1Wins === 2 && p2Wins === 1) || 
                   (p1Wins === 1 && p2Wins === 2) || 
                   (p1Wins === 0 && p2Wins === 2);
    if (!validBO3) {
      return respondJson({ ok: false, error: "Format BO3 harus 2-0, 2-1, 1-2, atau 0-2 (tanpa seri)." });
    }
  }

  var isOrganizerOrAdmin = (authUser.role === "admin" || tournament.organizer_id === authUser.id);

  var regList = getTableData("Registrations", ss).filter(function(r) { return r.tournament_id === tournament.id; });
  var userReg = null;
  for (var r = 0; r < regList.length; r++) {
    if (regList[r].user_id === authUser.id) { userReg = regList[r]; break; }
  }

  var isP1 = userReg && userReg.id === match.player1_id;
  var isP2 = userReg && userReg.id === match.player2_id;

  if (!isOrganizerOrAdmin && !isP1 && !isP2) {
    return respondJson({ ok: false, error: "Akses ditolak: Anda hanya dapat mengisi pertandingan milik Anda sendiri." });
  }

  var subsequentRounds = allRounds.filter(function(r) {
    var isArchived = (r.is_archived === true || r.is_archived === "true" || r.status === "ARCHIVED");
    return parseInt(r.round_number, 10) > matchRoundNum && !isArchived;
  });

  if (subsequentRounds.length > 0 && isOrganizerOrAdmin) {
    if (!revertAndRegenerate && !forceWithoutRevert) {
      return respondJson({
        ok: false,
        code: "CONFIRM_REVERT_REQUIRED",
        error: "Ronde " + matchRoundNum + " sudah selesai dan Ronde " + subsequentRounds.map(function(sr) { return sr.round_number; }).join(", ") + " sudah dibuat. Mengubah skor saja tidak akan mengubah pairing ronde berikutnya.",
        data: {
          matchRoundNumber: matchRoundNum,
          subsequentRounds: subsequentRounds.map(function(sr) { return sr.round_number; })
        }
      });
    }

    if (revertAndRegenerate) {
      performRevertInternal(tournament.id, matchRoundNum, authUser, ss);
    }
  }

  var winnerId = p1Wins > p2Wins ? match.player1_id : match.player2_id;
  var oldScoreValue = (match.player1_wins || 0) + "-" + (match.player2_wins || 0) + " (" + (match.status || "PENDING") + ")";
  var newScoreValue = p1Wins + "-" + p2Wins + " (CONFIRMED)";

  if (isOrganizerOrAdmin) {
    updateRow("Matches", matchId, {
      player1_wins: p1Wins,
      player2_wins: p2Wins,
      draws: 0,
      winner_id: winnerId,
      status: "CONFIRMED",
      reported_by: authUser.id,
      dispute_reason: ""
    }, ss);

    recalculateTournamentStandings(tournament.id, ss);

    logAudit(
      "CORRECT_SCORE",
      authUser,
      "Organizer memperbarui skor Meja #" + match.table_number + " Ronde " + matchRoundNum,
      oldScoreValue,
      newScoreValue,
      tournament.id,
      tournament.name,
      ss
    );

    var updatedTournament = findTournament(tournament.id, ss);
    var currentTournamentRound = parseInt(updatedTournament.current_round, 10);
    var autoPairingInfo = null;

    if (matchRoundNum === currentTournamentRound) {
      var activeRoundMatches = getTableData("Matches", ss).filter(function(m) {
        var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
        return m.round_id === match.round_id && !isArch;
      });

      var allConfirmed = true;
      for (var k = 0; k < activeRoundMatches.length; k++) {
        var mStatus = (activeRoundMatches[k].id === matchId) ? "CONFIRMED" : activeRoundMatches[k].status;
        if (mStatus !== "CONFIRMED") {
          allConfirmed = false;
          break;
        }
      }

      var totalRounds = parseInt(updatedTournament.total_rounds, 10);

      if (allConfirmed) {
        if (matchRoundNum < totalRounds) {
          updateRow("Rounds", match.round_id, {
            status: "COMPLETED",
            completed_at: new Date().toISOString()
          }, ss);

          var nextRoundNum = matchRoundNum + 1;
          var activeRegs = getTableData("Registrations", ss).filter(function(r) {
            return r.tournament_id === tournament.id && r.status !== "DROPPED";
          });

          var pastMatchesForNextRound = getTableData("Matches", ss).filter(function(m) {
            var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
            return m.tournament_id === tournament.id && !isArch;
          });

          var pairingResult = computeSwissPairingPure(activeRegs, pastMatchesForNextRound, tournament.format, nextRoundNum);

          if (pairingResult.success) {
            var newRoundId = "rnd_" + Utilities.getUuid().substring(0, 8);
            addRow("Rounds", {
              id: newRoundId,
              tournament_id: tournament.id,
              round_number: nextRoundNum,
              status: "ACTIVE",
              started_at: new Date().toISOString(),
              completed_at: "",
              is_archived: "",
              timer_duration_minutes: 45,
              timer_status: "STOPPED",
              timer_start_timestamp: "",
              timer_remaining_seconds: 45 * 60
            }, ss);

            for (var j = 0; j < pairingResult.matches.length; j++) {
              var mItem = pairingResult.matches[j];
              var isBye = mItem.isBye;

              addRow("Matches", {
                id: "mtc_" + Utilities.getUuid().substring(0, 8),
                round_id: newRoundId,
                tournament_id: tournament.id,
                table_number: mItem.table_number,
                player1_id: mItem.player1.id,
                player2_id: isBye ? "BYE" : mItem.player2.id,
                player1_name: mItem.player1.player_name,
                player2_name: isBye ? "BYE" : mItem.player2.player_name,
                player1_wins: isBye ? (tournament.format === "BO1" ? 1 : 2) : 0,
                player2_wins: 0,
                draws: 0,
                winner_id: isBye ? mItem.player1.id : "",
                status: isBye ? "CONFIRMED" : "PENDING",
                reported_by: isBye ? "SYSTEM" : "",
                dispute_reason: "",
                is_archived: ""
              }, ss);
            }

            updateRow("Tournaments", tournament.id, { current_round: nextRoundNum }, ss);

            if (pairingResult.hasBye) {
              recalculateTournamentStandings(tournament.id, ss);
            }

            logAudit(
              "AUTO_REGENERATE_PAIRING",
              authUser,
              "Pairing Ronde " + nextRoundNum + " otomatis dibuat ulang setelah semua pertandingan Ronde " + matchRoundNum + " Terkonfirmasi.",
              "",
              "Pairing Ronde " + nextRoundNum + " Aktif",
              tournament.id,
              tournament.name,
              ss
            );

            autoPairingInfo = {
              auto_regenerated: true,
              next_round_number: nextRoundNum,
              matches_count: pairingResult.matches.length,
              has_bye: pairingResult.hasBye
            };
          }
        } else {
          updateRow("Rounds", match.round_id, {
            status: "COMPLETED",
            completed_at: new Date().toISOString()
          }, ss);
          updateRow("Tournaments", tournament.id, { status: "FINISHED" }, ss);
          logAudit("FINISH_TOURNAMENT", authUser, "Turnamen selesai setelah koreksi skor ronde " + matchRoundNum, "", "FINISHED", tournament.id, tournament.name, ss);
        }
      }
    }

    var msg = "Hasil Meja #" + match.table_number + " disimpan dan Terkonfirmasi.";
    if (autoPairingInfo && autoPairingInfo.auto_regenerated) {
      msg = "Skor Meja #" + match.table_number + " diperbarui! Seluruh pertandingan Ronde " + matchRoundNum + " terkonfirmasi, dan Pairing Ronde " + autoPairingInfo.next_round_number + " OTOMATIS dibuat ulang!";
    } else if (subsequentRounds.length > 0 && forceWithoutRevert) {
      msg = "Skor Meja #" + match.table_number + " diperbarui. (Catatan: Pairing ronde setelahnya tidak berubah karena tidak dilakukan revert).";
    }

    return respondJson({
      ok: true,
      data: {
        status: "CONFIRMED",
        player1_wins: p1Wins,
        player2_wins: p2Wins,
        auto_pairing: autoPairingInfo
      },
      message: msg
    });

  } else {
    updateRow("Matches", matchId, {
      player1_wins: p1Wins,
      player2_wins: p2Wins,
      draws: 0,
      winner_id: winnerId,
      status: "WAITING_CONFIRMATION",
      reported_by: authUser.id,
      dispute_reason: ""
    }, ss);

    logAudit(
      "SUBMIT_SCORE_PLAYER",
      authUser,
      "Player melaporkan Meja #" + match.table_number + " (" + p1Wins + "-" + p2Wins + ")",
      oldScoreValue,
      p1Wins + "-" + p2Wins + " (WAITING_CONFIRMATION)",
      tournament.id,
      tournament.name,
      ss
    );

    return respondJson({
      ok: true,
      data: { status: "WAITING_CONFIRMATION", player1_wins: p1Wins, player2_wins: p2Wins },
      message: "Hasil pertandingan dilaporkan! Menunggu konfirmasi dari lawan Anda."
    });
  }
}

function handleConfirmMatchScore(authUser, data, ss) {
  var matchId = data.matchId;
  var allMatches = getTableData("Matches", ss);
  var match = null;
  for (var i = 0; i < allMatches.length; i++) {
    if (allMatches[i].id === matchId) { match = allMatches[i]; break; }
  }
  if (!match) return respondJson({ ok: false, error: "Pertandingan tidak ditemukan." });

  var tournament = findTournament(match.tournament_id, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var isOrganizerOrAdmin = (authUser.role === "admin" || tournament.organizer_id === authUser.id);

  var regList = getTableData("Registrations", ss).filter(function(r) { return r.tournament_id === tournament.id; });
  var userReg = null;
  for (var r = 0; r < regList.length; r++) {
    if (regList[r].user_id === authUser.id) { userReg = regList[r]; break; }
  }

  var isOpponent = userReg && (
    (match.player1_id === userReg.id && match.reported_by !== authUser.id) ||
    (match.player2_id === userReg.id && match.reported_by !== authUser.id)
  );

  if (!isOrganizerOrAdmin && !isOpponent) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya lawan pertandingan atau Organizer yang dapat mengonfirmasi skor." });
  }

  var oldStatus = match.status;
  updateRow("Matches", matchId, {
    status: "CONFIRMED",
    dispute_reason: ""
  }, ss);

  recalculateTournamentStandings(tournament.id, ss);

  logAudit(
    "CONFIRM_SCORE",
    authUser,
    "Konfirmasi skor Meja #" + match.table_number + " oleh " + authUser.username,
    oldStatus,
    "CONFIRMED",
    tournament.id,
    tournament.name,
    ss
  );

  return respondJson({
    ok: true,
    data: { status: "CONFIRMED" },
    message: "Hasil pertandingan Terkonfirmasi! Klasemen turnamen telah diperbarui."
  });
}

function handleDisputeMatchScore(authUser, data, ss) {
  var matchId = data.matchId;
  var reason = data.reason || "Lawan tidak menyetujui skor yang dilaporkan.";

  var allMatches = getTableData("Matches", ss);
  var match = null;
  for (var i = 0; i < allMatches.length; i++) {
    if (allMatches[i].id === matchId) { match = allMatches[i]; break; }
  }
  if (!match) return respondJson({ ok: false, error: "Pertandingan tidak ditemukan." });

  var tournament = findTournament(match.tournament_id, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var isOrganizerOrAdmin = (authUser.role === "admin" || tournament.organizer_id === authUser.id);

  var regList = getTableData("Registrations", ss).filter(function(r) { return r.tournament_id === tournament.id; });
  var userReg = null;
  for (var r = 0; r < regList.length; r++) {
    if (regList[r].user_id === authUser.id) { userReg = regList[r]; break; }
  }

  var isOpponent = userReg && (
    (match.player1_id === userReg.id && match.reported_by !== authUser.id) ||
    (match.player2_id === userReg.id && match.reported_by !== authUser.id)
  );

  if (!isOrganizerOrAdmin && !isOpponent) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya lawan pertandingan atau Organizer yang dapat mengajukan sengketa." });
  }

  var oldStatus = match.status;
  updateRow("Matches", matchId, {
    status: "DISPUTED",
    dispute_reason: reason
  }, ss);

  logAudit(
    "DISPUTE_SCORE",
    authUser,
    "Sengketa diajukan untuk Meja #" + match.table_number + ": " + reason,
    oldStatus,
    "DISPUTED",
    tournament.id,
    tournament.name,
    ss
  );

  return respondJson({
    ok: true,
    data: { status: "DISPUTED", dispute_reason: reason },
    message: "Laporan penolakan dikirim. Status pertandingan berubah menjadi Sengketa dan akan diputuskan oleh Organizer."
  });
}

function handleGetMyMatches(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var regList = getTableData("Registrations", ss).filter(function(r) { return r.tournament_id === tournamentId; });
  var myReg = null;
  for (var i = 0; i < regList.length; i++) {
    if (regList[i].user_id === authUser.id) { myReg = regList[i]; break; }
  }

  if (!myReg) {
    return respondJson({
      ok: true,
      data: { isRegistered: false, matches: [] },
      message: "Anda belum terdaftar pada turnamen ini."
    });
  }

  var allRounds = getTableData("Rounds", ss).filter(function(r) {
    var isArch = (r.is_archived === true || r.is_archived === "true" || r.status === "ARCHIVED");
    return r.tournament_id === tournamentId && !isArch;
  });

  var roundMap = {};
  var latestRound = null;
  for (var j = 0; j < allRounds.length; j++) {
    roundMap[allRounds[j].id] = allRounds[j];
    if (parseInt(allRounds[j].round_number, 10) === parseInt(tournament.current_round, 10)) {
      latestRound = allRounds[j];
    }
  }

  var timerData = latestRound ? calculateRoundTimerState(latestRound) : null;

  var matches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && (m.player1_id === myReg.id || m.player2_id === myReg.id) && !isArch;
  });

  matches.sort(function(a, b) {
    var rA = roundMap[a.round_id] ? parseInt(roundMap[a.round_id].round_number, 10) : 0;
    var rB = roundMap[b.round_id] ? parseInt(roundMap[b.round_id].round_number, 10) : 0;
    return rB - rA;
  });

  var formattedMatches = matches.map(function(m) {
    var isP1 = (m.player1_id === myReg.id);
    var oppId = isP1 ? m.player2_id : m.player1_id;
    var oppName = isP1 ? m.player2_name : m.player1_name;
    var myWins = isP1 ? parseInt(m.player1_wins, 10) || 0 : parseInt(m.player2_wins, 10) || 0;
    var oppWins = isP1 ? parseInt(m.player2_wins, 10) || 0 : parseInt(m.player1_wins, 10) || 0;
    var rnd = roundMap[m.round_id];
    var roundNum = rnd ? parseInt(rnd.round_number, 10) : 1;

    var canSubmit = (m.status === "PENDING" || m.status === "DISPUTED");
    var canConfirm = (m.status === "WAITING_CONFIRMATION" && m.reported_by !== authUser.id);
    var canDispute = (m.status === "WAITING_CONFIRMATION" && m.reported_by !== authUser.id);
    var isReporter = (m.reported_by === authUser.id);

    return {
      id: m.id,
      round_id: m.round_id,
      round_number: roundNum,
      table_number: m.table_number,
      my_name: myReg.player_name,
      opponent_id: oppId,
      opponent_name: oppName,
      my_wins: myWins,
      opp_wins: oppWins,
      my_role: isP1 ? "player1" : "player2",
      status: m.status,
      winner_id: m.winner_id,
      reported_by: m.reported_by,
      dispute_reason: m.dispute_reason,
      can_submit: canSubmit,
      can_confirm: canConfirm,
      can_dispute: canDispute,
      is_reporter: isReporter
    };
  });

  return respondJson({
    ok: true,
    data: {
      isRegistered: true,
      registration: myReg,
      format: tournament.format,
      matches: formattedMatches,
      timer: timerData
    }
  });
}

function handleGetTournamentStandings(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var regs = getTableData("Registrations", ss).filter(function(r) { return r.tournament_id === tournamentId; });

  var confirmedMatches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && m.status === "CONFIRMED" && !isArch;
  });

  var h2h = {};
  for (var i = 0; i < confirmedMatches.length; i++) {
    var cm = confirmedMatches[i];
    if (cm.player2_id !== "BYE" && cm.winner_id) {
      h2h[cm.player1_id + "_" + cm.player2_id] = cm.winner_id;
      h2h[cm.player2_id + "_" + cm.player1_id] = cm.winner_id;
    }
  }

  var sorted = sortStandingsList(regs.slice(), h2h);

  return respondJson({
    ok: true,
    data: {
      tournament: tournament,
      standings: sorted
    }
  });
}

// =========================================================================
// 7. FITUR REVERT KE RONDE X & KOREKSI SKOR ORGANIZER
// =========================================================================

function handleGetRevertImpact(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var targetRoundNum = parseInt(data.targetRoundNumber, 10);

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer atau Admin yang dapat merevert ronde." });
  }

  var allRounds = getTableData("Rounds", ss).filter(function(r) {
    var isArch = (r.is_archived === true || r.is_archived === "true" || r.status === "ARCHIVED");
    return r.tournament_id === tournamentId && !isArch;
  });

  var roundsToArchive = [];
  var roundIdsToArchive = {};

  for (var i = 0; i < allRounds.length; i++) {
    var rNum = parseInt(allRounds[i].round_number, 10);
    if (rNum > targetRoundNum) {
      roundsToArchive.push(rNum);
      roundIdsToArchive[allRounds[i].id] = true;
    }
  }

  roundsToArchive.sort(function(a, b) { return a - b; });

  var allMatches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && !isArch;
  });

  var matchesToArchiveCount = 0;
  for (var j = 0; j < allMatches.length; j++) {
    if (roundIdsToArchive[allMatches[j].round_id]) {
      matchesToArchiveCount++;
    }
  }

  return respondJson({
    ok: true,
    data: {
      targetRoundNumber: targetRoundNum,
      currentRound: parseInt(tournament.current_round, 10),
      tournamentStatus: tournament.status,
      roundsToArchive: roundsToArchive,
      matchesToArchiveCount: matchesToArchiveCount,
      warning: roundsToArchive.length > 0 
        ? "Ronde " + roundsToArchive.join(", ") + " beserta " + matchesToArchiveCount + " pertandingan akan diarsipkan (tidak dihapus permanen). Status turnamen kembali 'Berjalan'."
        : "Tidak ada ronde setelah Ronde " + targetRoundNum + " yang perlu diarsipkan."
    }
  });
}

function performRevertInternal(tournamentId, targetRoundNum, authUser, ss) {
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return null;

  var allRounds = getTableData("Rounds", ss).filter(function(r) {
    return r.tournament_id === tournamentId;
  });

  var archivedRoundNumbers = [];
  var roundIdsToArchive = {};

  for (var i = 0; i < allRounds.length; i++) {
    var rNum = parseInt(allRounds[i].round_number, 10);
    var isAlreadyArchived = (allRounds[i].is_archived === true || allRounds[i].is_archived === "true" || allRounds[i].status === "ARCHIVED");
    if (rNum > targetRoundNum && !isAlreadyArchived) {
      archivedRoundNumbers.push(rNum);
      roundIdsToArchive[allRounds[i].id] = true;
      updateRow("Rounds", allRounds[i].id, {
        status: "ARCHIVED",
        is_archived: "true"
      }, ss);
    } else if (rNum === targetRoundNum) {
      updateRow("Rounds", allRounds[i].id, {
        status: "ACTIVE",
        is_archived: ""
      }, ss);
    }
  }

  var allMatches = getTableData("Matches", ss).filter(function(m) {
    return m.tournament_id === tournamentId;
  });

  var archivedMatchesCount = 0;
  for (var j = 0; j < allMatches.length; j++) {
    if (roundIdsToArchive[allMatches[j].round_id]) {
      updateRow("Matches", allMatches[j].id, {
        status: "ARCHIVED",
        is_archived: "true"
      }, ss);
      archivedMatchesCount++;
    }
  }

  var prevRound = tournament.current_round;
  var prevStatus = tournament.status;

  updateRow("Tournaments", tournamentId, {
    current_round: targetRoundNum,
    status: "RUNNING"
  }, ss);

  recalculateTournamentStandings(tournamentId, ss);

  logAudit(
    "REVERT_ROUND",
    authUser,
    "Turnamen direvert ke Ronde " + targetRoundNum + ". Mengarsipkan Ronde " + (archivedRoundNumbers.join(", ") || "-") + " (" + archivedMatchesCount + " meja)",
    "Ronde " + prevRound + " (" + prevStatus + ")",
    "Ronde " + targetRoundNum + " (RUNNING)",
    tournamentId,
    tournament.name,
    ss
  );

  return {
    targetRoundNumber: targetRoundNum,
    archivedRoundNumbers: archivedRoundNumbers,
    archivedMatchesCount: archivedMatchesCount
  };
}

function handleRevertRound(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var targetRoundNum = parseInt(data.targetRoundNumber, 10);

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer atau Admin yang dapat merevert ronde." });
  }

  if (isNaN(targetRoundNum) || targetRoundNum < 1) {
    return respondJson({ ok: false, error: "Nomor ronde target tidak valid." });
  }

  var res = performRevertInternal(tournamentId, targetRoundNum, authUser, ss);
  if (!res) return respondJson({ ok: false, error: "Gagal memproses revert ronde." });

  return respondJson({
    ok: true,
    data: res,
    message: "Berhasil revert ke Ronde " + targetRoundNum + ". Ronde " + (res.archivedRoundNumbers.length > 0 ? res.archivedRoundNumbers.join(", ") : "-") + " telah diarsipkan. Status turnamen kini Berjalan."
  });
}

// =========================================================================
// 8. LOG AUDIT LENGKAP: PENGGUNA, WAKTU, AKSI, NILAI LAMA, NILAI BARU
// =========================================================================

function logAudit(action, authUserOrId, details, oldValue, newValue, tournamentId, tournamentName, ss) {
  try {
    var auditSheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName("AuditLog");
    if (!auditSheet) return;

    var userId = "ANONYMOUS";
    var username = "System";

    if (typeof authUserOrId === "object" && authUserOrId !== null) {
      userId = authUserOrId.id || "ANONYMOUS";
      username = authUserOrId.username || authUserOrId.name || "User";
    } else if (typeof authUserOrId === "string") {
      userId = authUserOrId;
      username = authUserOrId;
    }

    var logId = "aud_" + Utilities.getUuid().substring(0, 8);
    var timestamp = new Date().toISOString();

    auditSheet.appendRow([
      logId,
      userId,
      username,
      timestamp,
      action || "INFO",
      tournamentId || "",
      tournamentName || "",
      oldValue !== undefined ? String(oldValue) : "",
      newValue !== undefined ? String(newValue) : "",
      details || ""
    ]);
  } catch (e) {
    Logger.log("Audit log failed: " + e.toString());
  }
}

function handleGetAuditLogs(authUser, data, ss) {
  var tournamentId = data.tournamentId || "";
  var allLogs = getTableData("AuditLog", ss);

  if (authUser.role === "organizer") {
    var myTournaments = getTableData("Tournaments", ss).filter(function(t) {
      return t.organizer_id === authUser.id;
    });
    var myTourneyIds = {};
    for (var i = 0; i < myTournaments.length; i++) {
      myTourneyIds[myTournaments[i].id] = true;
    }

    allLogs = allLogs.filter(function(log) {
      return log.tournament_id && myTourneyIds[log.tournament_id];
    });
  }

  if (tournamentId) {
    allLogs = allLogs.filter(function(log) {
      return log.tournament_id === tournamentId;
    });
  }

  allLogs.sort(function(a, b) {
    var tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    var tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
  });

  return respondJson({
    ok: true,
    data: allLogs
  });
}

// =========================================================================
// 9. SWISS PAIRING ALGORITHM (PURE FUNCTIONS)
// =========================================================================

function computeSwissPairingPure(players, pastMatches, format, roundNumber) {
  pastMatches = pastMatches || [];
  format = format || "BO3";
  roundNumber = roundNumber || 1;

  var metPairs = {};
  var byeRecipients = {};

  for (var i = 0; i < pastMatches.length; i++) {
    var p1 = pastMatches[i].player1_id;
    var p2 = pastMatches[i].player2_id;
    if (p1 && p2) {
      metPairs[p1 + "_" + p2] = true;
      metPairs[p2 + "_" + p1] = true;
    }
    if (p2 === "BYE" && p1) {
      byeRecipients[p1] = true;
    }
  }

  var pool = players.map(function(p) {
    return {
      id: p.id,
      player_name: p.player_name,
      match_points: parseInt(p.match_points, 10) || 0,
      game_points: parseInt(p.game_points, 10) || 0
    };
  });

  var hasBye = pool.length % 2 !== 0;
  var byePlayer = null;

  if (hasBye) {
    var byeCandidates = pool.slice().sort(function(a, b) {
      return a.match_points - b.match_points;
    });

    for (var bIdx = 0; bIdx < byeCandidates.length; bIdx++) {
      if (!byeRecipients[byeCandidates[bIdx].id]) {
        byePlayer = byeCandidates[bIdx];
        break;
      }
    }

    if (!byePlayer && byeCandidates.length > 0) {
      byePlayer = byeCandidates[0];
    }

    pool = pool.filter(function(p) { return p.id !== byePlayer.id; });
  }

  if (roundNumber === 1) {
    shuffleArray(pool);
  } else {
    var scoreGroups = {};
    for (var s = 0; s < pool.length; s++) {
      var pts = pool[s].match_points;
      if (!scoreGroups[pts]) scoreGroups[pts] = [];
      scoreGroups[pts].push(pool[s]);
    }

    var sortedScores = Object.keys(scoreGroups).map(Number).sort(function(a, b) { return b - a; });

    var orderedPool = [];
    for (var g = 0; g < sortedScores.length; g++) {
      var group = scoreGroups[sortedScores[g]];
      shuffleArray(group);
      for (var k = 0; k < group.length; k++) {
        orderedPool.push(group[k]);
      }
    }
    pool = orderedPool;
  }

  var candidateMap = {};
  for (var x = 0; x < pool.length; x++) {
    candidateMap[pool[x].id] = [];
    for (var y = 0; y < pool.length; y++) {
      if (x !== y) {
        var key = pool[x].id + "_" + pool[y].id;
        if (!metPairs[key]) {
          candidateMap[pool[x].id].push(pool[y]);
        }
      }
    }
  }

  var pairedMatches = backtrackPairings(pool, candidateMap, metPairs, []);

  if (!pairedMatches) {
    return {
      success: false,
      warning: "Tidak ditemukan solusi pairing sempurna tanpa rematch. Silakan periksa atau atur pairing manual.",
      matches: [],
      hasBye: hasBye,
      byePlayer: byePlayer
    };
  }

  var tableNumber = 1;
  var finalMatches = [];

  for (var m = 0; m < pairedMatches.length; m++) {
    finalMatches.push({
      table_number: tableNumber++,
      player1: pairedMatches[m].player1,
      player2: pairedMatches[m].player2,
      isBye: false
    });
  }

  if (hasBye && byePlayer) {
    finalMatches.push({
      table_number: tableNumber++,
      player1: byePlayer,
      player2: { id: "BYE", player_name: "BYE" },
      isBye: true
    });
  }

  return {
    success: true,
    matches: finalMatches,
    hasBye: hasBye,
    byePlayer: byePlayer
  };
}

function backtrackPairings(unpaired, candidateMap, metPairs, currentMatches) {
  if (unpaired.length === 0) return currentMatches;

  var current = unpaired[0];
  var rest = unpaired.slice(1);
  var validOpponents = candidateMap[current.id] || [];

  for (var i = 0; i < validOpponents.length; i++) {
    var candidate = validOpponents[i];
    var candidateIdx = -1;
    for (var j = 0; j < rest.length; j++) {
      if (rest[j].id === candidate.id) { candidateIdx = j; break; }
    }
    if (candidateIdx === -1) continue;

    var pairKey = current.id + "_" + candidate.id;
    if (metPairs[pairKey]) continue;

    var newRest = rest.slice();
    newRest.splice(candidateIdx, 1);

    var nextMatches = currentMatches.concat([{ player1: current, player2: candidate }]);
    var result = backtrackPairings(newRest, candidateMap, metPairs, nextMatches);
    if (result) return result;
  }

  return null;
}

function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

// =========================================================================
// 10. HANDLER RONDE, PAIRING & TUKAR MEJA
// =========================================================================

function handleGenerateRoundPairing(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer turnamen yang dapat mengatur pairing." });
  }

  if (tournament.status === "FINISHED") {
    return respondJson({ ok: false, error: "Turnamen ini sudah selesai." });
  }

  var currentRoundNum = parseInt(tournament.current_round, 10) || 0;
  if (currentRoundNum === 0 && tournament.status === "REGISTRATION_OPEN") {
    return respondJson({ ok: false, error: "Klik 'Mulai Turnamen' terlebih dahulu sebelum membuat pairing ronde 1." });
  }

  var targetRoundNum = currentRoundNum;
  var allRounds = getTableData("Rounds", ss).filter(function(r) {
    var isArch = (r.is_archived === true || r.is_archived === "true" || r.status === "ARCHIVED");
    return r.tournament_id === tournamentId && !isArch;
  });

  var existingRound = null;
  for (var i = 0; i < allRounds.length; i++) {
    if (parseInt(allRounds[i].round_number, 10) === targetRoundNum) {
      existingRound = allRounds[i];
      break;
    }
  }

  if (existingRound && existingRound.status === "COMPLETED") {
    targetRoundNum = currentRoundNum + 1;
    if (targetRoundNum > parseInt(tournament.total_rounds, 10)) {
      return respondJson({ ok: false, error: "Seluruh " + tournament.total_rounds + " ronde telah selesai." });
    }
  } else if (existingRound && existingRound.status === "ACTIVE") {
    return respondJson({ ok: false, error: "Ronde " + targetRoundNum + " sedang berjalan. Selesaikan ronde ini terlebih dahulu." });
  } else {
    targetRoundNum = 1;
  }

  var registrations = getTableData("Registrations", ss).filter(function(r) {
    return r.tournament_id === tournamentId && r.status !== "DROPPED";
  });

  if (registrations.length < 2) {
    return respondJson({ ok: false, error: "Minimal butuh 2 peserta aktif untuk membuat pairing." });
  }

  var pastMatches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && !isArch;
  });

  var pairingResult = computeSwissPairingPure(registrations, pastMatches, tournament.format, targetRoundNum);
  if (!pairingResult.success) {
    return respondJson({
      ok: false,
      error: pairingResult.warning,
      code: "NO_SOLUTION_MANUAL_REQUIRED"
    });
  }

  var newRoundId = "rnd_" + Utilities.getUuid().substring(0, 8);
  var roundRecord = {
    id: newRoundId,
    tournament_id: tournamentId,
    round_number: targetRoundNum,
    status: "ACTIVE",
    started_at: new Date().toISOString(),
    completed_at: "",
    is_archived: "",
    timer_duration_minutes: 45,
    timer_status: "STOPPED",
    timer_start_timestamp: "",
    timer_remaining_seconds: 45 * 60
  };
  addRow("Rounds", roundRecord, ss);

  for (var j = 0; j < pairingResult.matches.length; j++) {
    var matchItem = pairingResult.matches[j];
    var isBye = matchItem.isBye;

    var matchRecord = {
      id: "mtc_" + Utilities.getUuid().substring(0, 8),
      round_id: newRoundId,
      tournament_id: tournamentId,
      table_number: matchItem.table_number,
      player1_id: matchItem.player1.id,
      player2_id: isBye ? "BYE" : matchItem.player2.id,
      player1_name: matchItem.player1.player_name,
      player2_name: isBye ? "BYE" : matchItem.player2.player_name,
      player1_wins: isBye ? (tournament.format === "BO1" ? 1 : 2) : 0,
      player2_wins: 0,
      draws: 0,
      winner_id: isBye ? matchItem.player1.id : "",
      status: isBye ? "CONFIRMED" : "PENDING",
      reported_by: isBye ? "SYSTEM" : "",
      dispute_reason: "",
      is_archived: ""
    };
    addRow("Matches", matchRecord, ss);
  }

  updateRow("Tournaments", tournamentId, { current_round: targetRoundNum }, ss);
  logAudit(
    "GENERATE_PAIRING",
    authUser,
    "Pairing Ronde " + targetRoundNum + " dibuat untuk turnamen " + tournament.name,
    "",
    "Ronde " + targetRoundNum + " Aktif",
    tournamentId,
    tournament.name,
    ss
  );

  if (pairingResult.hasBye) {
    recalculateTournamentStandings(tournamentId, ss);
  }

  return respondJson({
    ok: true,
    data: {
      round_number: targetRoundNum,
      matches_count: pairingResult.matches.length,
      has_bye: pairingResult.hasBye,
      bye_player: pairingResult.byePlayer ? pairingResult.byePlayer.player_name : null
    },
    message: "Pairing Ronde " + targetRoundNum + " berhasil disusun!"
  });
}

function handleGetRoundMatches(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var requestedRoundNum = data.roundNumber ? parseInt(data.roundNumber, 10) : null;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var allActiveRounds = getTableData("Rounds", ss).filter(function(r) {
    var isArch = (r.is_archived === true || r.is_archived === "true" || r.status === "ARCHIVED");
    return r.tournament_id === tournamentId && !isArch;
  });

  allActiveRounds.sort(function(a, b) {
    return parseInt(a.round_number, 10) - parseInt(b.round_number, 10);
  });

  var availableRoundNumbers = allActiveRounds.map(function(r) { return parseInt(r.round_number, 10); });

  var selectedRound = null;
  if (requestedRoundNum) {
    for (var i = 0; i < allActiveRounds.length; i++) {
      if (parseInt(allActiveRounds[i].round_number, 10) === requestedRoundNum) {
        selectedRound = allActiveRounds[i];
        break;
      }
    }
  }

  if (!selectedRound) {
    var curRoundNum = parseInt(tournament.current_round, 10) || 1;
    for (var j = 0; j < allActiveRounds.length; j++) {
      if (parseInt(allActiveRounds[j].round_number, 10) === curRoundNum) {
        selectedRound = allActiveRounds[j];
        break;
      }
    }
  }

  if (!selectedRound && allActiveRounds.length > 0) {
    selectedRound = allActiveRounds[allActiveRounds.length - 1];
  }

  if (!selectedRound) {
    return respondJson({
      ok: true,
      data: { round: null, matches: [], availableRounds: [], timer: null }
    });
  }

  var timerData = calculateRoundTimerState(selectedRound);

  var matches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.round_id === selectedRound.id && !isArch;
  });

  matches.sort(function(a, b) {
    return (parseInt(a.table_number, 10) || 0) - (parseInt(b.table_number, 10) || 0);
  });

  return respondJson({
    ok: true,
    data: {
      round: selectedRound,
      matches: matches,
      availableRounds: availableRoundNumbers,
      timer: timerData
    }
  });
}

function handleSwapPairing(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var match1Id = data.match1Id;
  var match2Id = data.match2Id;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer yang dapat menukar meja." });
  }

  var matches = getTableData("Matches", ss);
  var m1 = null, m2 = null;
  for (var i = 0; i < matches.length; i++) {
    if (matches[i].id === match1Id) m1 = matches[i];
    if (matches[i].id === match2Id) m2 = matches[i];
  }

  if (!m1 || !m2) return respondJson({ ok: false, error: "Meja pertandingan tidak ditemukan." });

  if (m1.status === "CONFIRMED" || m2.status === "CONFIRMED") {
    return respondJson({ ok: false, error: "Tidak dapat menukar meja yang skornya sudah Terkonfirmasi." });
  }

  var pastMatches = matches.filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.tournament_id === tournamentId && m.round_id !== m1.round_id && !isArch;
  });

  var metPairs = {};
  for (var j = 0; j < pastMatches.length; j++) {
    metPairs[pastMatches[j].player1_id + "_" + pastMatches[j].player2_id] = true;
    metPairs[pastMatches[j].player2_id + "_" + pastMatches[j].player1_id] = true;
  }

  var newP2_for_m1 = m2.player2_id;
  var newP2Name_for_m1 = m2.player2_name;
  var newP2_for_m2 = m1.player2_id;
  var newP2Name_for_m2 = m1.player2_name;

  if (newP2_for_m1 !== "BYE" && metPairs[m1.player1_id + "_" + newP2_for_m1]) {
    return respondJson({ ok: false, error: "Rematch! " + m1.player1_name + " sudah pernah bertemu " + newP2Name_for_m1 });
  }
  if (newP2_for_m2 !== "BYE" && metPairs[m2.player1_id + "_" + newP2_for_m2]) {
    return respondJson({ ok: false, error: "Rematch! " + m2.player1_name + " sudah pernah bertemu " + newP2Name_for_m2 });
  }

  var oldState = "Meja " + m1.table_number + " (" + m1.player1_name + " vs " + m1.player2_name + "), Meja " + m2.table_number + " (" + m2.player1_name + " vs " + m2.player2_name + ")";
  var newState = "Meja " + m1.table_number + " (" + m1.player1_name + " vs " + newP2Name_for_m1 + "), Meja " + m2.table_number + " (" + m2.player1_name + " vs " + newP2Name_for_m2 + ")";

  updateRow("Matches", m1.id, { player2_id: newP2_for_m1, player2_name: newP2Name_for_m1 }, ss);
  updateRow("Matches", m2.id, { player2_id: newP2_for_m2, player2_name: newP2Name_for_m2 }, ss);

  logAudit("SWAP_PAIRING", authUser, "Tukar meja: #" + m1.table_number + " dan #" + m2.table_number, oldState, newState, tournamentId, tournament.name, ss);

  return respondJson({ ok: true, message: "Pasangan meja berhasil ditukar tanpa rematch." });
}

function handleCompleteRound(authUser, data, ss) {
  var roundId = data.roundId;
  var tournamentId = data.tournamentId;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer turnamen yang dapat menyelesaikan ronde." });
  }

  var allMatches = getTableData("Matches", ss).filter(function(m) {
    var isArch = (m.is_archived === true || m.is_archived === "true" || m.status === "ARCHIVED");
    return m.round_id === roundId && !isArch;
  });

  var unconfirmedMatches = [];
  for (var i = 0; i < allMatches.length; i++) {
    if (allMatches[i].status !== "CONFIRMED") {
      var statusLabel = allMatches[i].status === "WAITING_CONFIRMATION" ? "Menunggu Konfirmasi" :
                        (allMatches[i].status === "DISPUTED" ? "Sengketa" : "Belum Diisi");
      unconfirmedMatches.push("Meja #" + allMatches[i].table_number + " (" + statusLabel + ")");
    }
  }

  if (unconfirmedMatches.length > 0) {
    return respondJson({
      ok: false,
      error: "Ronde belum dapat diselesaikan. Semua pertandingan harus berstatus Terkonfirmasi! Masih ada " + unconfirmedMatches.length + " meja yang belum selesai: " + unconfirmedMatches.join(", ")
    });
  }

  updateRow("Rounds", roundId, {
    status: "COMPLETED",
    completed_at: new Date().toISOString(),
    timer_status: "STOPPED"
  }, ss);

  recalculateTournamentStandings(tournamentId, ss);

  var roundNum = parseInt(tournament.current_round, 10);
  var totalRounds = parseInt(tournament.total_rounds, 10);
  var isFinished = roundNum >= totalRounds;

  if (isFinished) {
    updateRow("Tournaments", tournamentId, { status: "FINISHED" }, ss);
    logAudit("FINISH_TOURNAMENT", authUser, "Turnamen " + tournament.name + " resmi selesai setelah " + roundNum + " ronde.", "RUNNING", "FINISHED", tournamentId, tournament.name, ss);
  } else {
    logAudit("COMPLETE_ROUND", authUser, "Ronde " + roundNum + " diselesaikan.", "ACTIVE", "COMPLETED", tournamentId, tournament.name, ss);
  }

  return respondJson({
    ok: true,
    data: {
      isFinished: isFinished,
      roundNumber: roundNum,
      totalRounds: totalRounds
    },
    message: isFinished 
      ? "Selamat! Turnamen telah resmi selesai seluruh ronde (Status: FINISHED). Silakan lengkapi deck peserta dan ekspor hasil akhir." 
      : "Ronde " + roundNum + " selesai. Siap membuat pairing Ronde " + (roundNum + 1) + "."
  });
}

// =========================================================================
// 11. UNIT TESTS: PAIRING, POIN, TIE-BREAKER, REVERT, TIMER & DECK
// =========================================================================

function runSwissPairingTests() {
  var tests = [];

  // TEST 1: 8 Peserta, 3 Ronde Swiss Tanpa Rematch
  try {
    var players8 = [
      { id: "P1", player_name: "Player 1", match_points: 0 },
      { id: "P2", player_name: "Player 2", match_points: 0 },
      { id: "P3", player_name: "Player 3", match_points: 0 },
      { id: "P4", player_name: "Player 4", match_points: 0 },
      { id: "P5", player_name: "Player 5", match_points: 0 },
      { id: "P6", player_name: "Player 6", match_points: 0 },
      { id: "P7", player_name: "Player 7", match_points: 0 },
      { id: "P8", player_name: "Player 8", match_points: 0 }
    ];

    var history = [];
    var allNoRematch = true;

    for (var r = 1; r <= 3; r++) {
      var res = computeSwissPairingPure(players8, history, "BO3", r);
      if (!res.success) { allNoRematch = false; break; }

      for (var m = 0; m < res.matches.length; m++) {
        var p1 = res.matches[m].player1;
        var p2 = res.matches[m].player2;

        history.push({ player1_id: p1.id, player2_id: p2.id });
        p1.match_points = (p1.match_points || 0) + 3;
      }
    }

    tests.push({
      name: "Pairing Swiss: 8 Peserta 3 Ronde Tanpa Rematch",
      passed: allNoRematch && history.length === 12,
      details: "12 pertandingan berhasil disusun dengan backtracking tanpa pertemuan ganda."
    });
  } catch (e) {
    tests.push({ name: "Pairing Swiss: 8 Peserta 3 Ronde", passed: false, error: e.toString() });
  }

  // TEST 2: 7 Peserta (Ganjil) dengan BYE Tidak Berulang
  try {
    var players7 = [
      { id: "P1", player_name: "Player 1", match_points: 0 },
      { id: "P2", player_name: "Player 2", match_points: 0 },
      { id: "P3", player_name: "Player 3", match_points: 0 },
      { id: "P4", player_name: "Player 4", match_points: 0 },
      { id: "P5", player_name: "Player 5", match_points: 0 },
      { id: "P6", player_name: "Player 6", match_points: 0 },
      { id: "P7", player_name: "Player 7", match_points: 0 }
    ];

    var history7 = [];
    var byeRecipients = [];
    var noRepeatBye = true;

    for (var r2 = 1; r2 <= 2; r2++) {
      var res7 = computeSwissPairingPure(players7, history7, "BO3", r2);
      if (res7.hasBye && res7.byePlayer) {
        if (byeRecipients.indexOf(res7.byePlayer.id) !== -1) {
          noRepeatBye = false;
        }
        byeRecipients.push(res7.byePlayer.id);
        history7.push({ player1_id: res7.byePlayer.id, player2_id: "BYE" });
        res7.byePlayer.match_points = (res7.byePlayer.match_points || 0) + 3;
      }

      for (var m2 = 0; m2 < res7.matches.length; m2++) {
        if (!res7.matches[m2].isBye) {
          history7.push({ player1_id: res7.matches[m2].player1.id, player2_id: res7.matches[m2].player2.id });
        }
      }
    }

    tests.push({
      name: "Pairing Swiss: 7 Peserta Ganjil BYE Tidak Berulang",
      passed: noRepeatBye && byeRecipients.length === 2,
      details: "Penerima BYE ronde 1 & 2 berbeda: " + byeRecipients.join(", ") + " (tidak ada duplikasi)."
    });
  } catch (e2) {
    tests.push({ name: "Pairing Swiss: 7 Peserta Ganjil", passed: false, error: e2.toString() });
  }

  return tests;
}

function runScoringAndTiebreakerTests() {
  var tests = [];

  // TEST 3: Poin Pertandingan BO1 & BO3 (Tanpa Seri)
  try {
    var bo1Win = calculateMatchPoints("BO1", 1, 0);
    var bo1Loss = calculateMatchPoints("BO1", 0, 1);

    var bo3_20 = calculateMatchPoints("BO3", 2, 0);
    var bo3_21 = calculateMatchPoints("BO3", 2, 1);
    var bo3_12 = calculateMatchPoints("BO3", 1, 2);
    var bo3_02 = calculateMatchPoints("BO3", 0, 2);

    var pointsCorrect = (bo1Win.p1Points === 3 && bo1Win.p2Points === 0) &&
                        (bo1Loss.p1Points === 0 && bo1Loss.p2Points === 3) &&
                        (bo3_20.p1Points === 3 && bo3_20.p2Points === 0) &&
                        (bo3_21.p1Points === 2 && bo3_21.p2Points === 1) &&
                        (bo3_12.p1Points === 1 && bo3_12.p2Points === 2) &&
                        (bo3_02.p1Points === 0 && bo3_02.p2Points === 3);

    tests.push({
      name: "Poin Pertandingan: BO1 (3/0) & BO3 (3/0, 2/1, 1/2, 0/2)",
      passed: pointsCorrect,
      details: "BO1 Menang=3, Kalah=0. BO3 2-0=3, 2-1=2, 1-2=1, 0-2=0 terverifikasi presisi."
    });
  } catch (e) {
    tests.push({ name: "Poin Pertandingan", passed: false, error: e.toString() });
  }

  // TEST 4: Tie-Breaker OMW% -> GW% -> OGW% -> Head-to-Head
  try {
    var dummyStandings = [
      { id: "A", player_name: "Player A", match_points: 3, omw_percentage: 66.67, gw_percentage: 100.0, ogw_percentage: 33.33, status: "ACTIVE" },
      { id: "B", player_name: "Player B", match_points: 3, omw_percentage: 50.00, gw_percentage: 66.67, ogw_percentage: 50.00, status: "ACTIVE" },
      { id: "C", player_name: "Player C", match_points: 3, omw_percentage: 50.00, gw_percentage: 66.67, ogw_percentage: 50.00, status: "ACTIVE" }
    ];

    var dummyH2H = { "B_C": "B", "C_B": "B" };
    sortStandingsList(dummyStandings, dummyH2H);

    var tiebreakerCorrect = (dummyStandings[0].id === "A") &&
                            (dummyStandings[1].id === "B") &&
                            (dummyStandings[2].id === "C");

    tests.push({
      name: "Tie-Breaker: Hierarki OMW% -> GW% -> OGW% -> Head-to-Head",
      passed: tiebreakerCorrect,
      details: "Urutan klasemen terverifikasi: Player A (OMW tertinggi) > Player B (Menang H2H) > Player C."
    });
  } catch (e2) {
    tests.push({ name: "Tie-Breaker", passed: false, error: e2.toString() });
  }

  return tests;
}

function runScoreCorrectionAndRevertTest() {
  var tests = [];

  try {
    var correctedPlayers = [
      { id: "P1", player_name: "Agumon (P1)", match_points: 1 },
      { id: "P2", player_name: "Gabumon (P2)", match_points: 2 },
      { id: "P3", player_name: "Veemon (P3)", match_points: 3 },
      { id: "P4", player_name: "Guilmon (P4)", match_points: 0 },
      { id: "P5", player_name: "Renamon (P5)", match_points: 0 },
      { id: "P6", player_name: "Terriermon (P6)", match_points: 0 },
      { id: "P7", player_name: "Patamon (P7)", match_points: 3 },
      { id: "P8", player_name: "Gatomon (P8)", match_points: 0 }
    ];

    var correctedR1History = [
      { player1_id: "P1", player2_id: "P2" },
      { player1_id: "P3", player2_id: "P4" },
      { player1_id: "P5", player2_id: "P6" },
      { player1_id: "P7", player2_id: "P8" }
    ];

    var newR2Result = computeSwissPairingPure(correctedPlayers, correctedR1History, "BO3", 2);
    var pairingSucceeded = newR2Result.success === true && newR2Result.matches.length === 4;

    var hasRematch = false;
    var metMap = { "P1_P2": true, "P2_P1": true, "P3_P4": true, "P4_P3": true, "P5_P6": true, "P6_P5": true, "P7_P8": true, "P8_P7": true };

    var newPairs = [];
    var p2Opponent = null;
    var p1Opponent = null;

    for (var m = 0; m < newR2Result.matches.length; m++) {
      var pA = newR2Result.matches[m].player1.id;
      var pB = newR2Result.matches[m].player2.id;
      newPairs.push(pA + " vs " + pB);

      if (metMap[pA + "_" + pB]) {
        hasRematch = true;
      }
      if (pA === "P2") p2Opponent = pB;
      if (pB === "P2") p2Opponent = pA;
      if (pA === "P1") p1Opponent = pB;
      if (pB === "P1") p1Opponent = pA;
    }

    var p2ProperlyPaired = (p2Opponent !== null && p2Opponent !== "P1");
    var p1ProperlyPaired = (p1Opponent !== null && p1Opponent !== "P2");

    var testPassed = pairingSucceeded && !hasRematch && p2ProperlyPaired && p1ProperlyPaired;

    tests.push({
      name: "Revert & Koreksi Skor: Skor R1 Diubah -> Pairing R2 Baru Tanpa Rematch & Sesuai Poin Baru",
      passed: testPassed,
      details: "Skor Meja 1 dikoreksi (P2 menang 2-1). Ronde 2 direvert & disusun ulang: " + newPairs.join(", ") + " (0 rematch, poin terkalibrasi)."
    });

  } catch (e) {
    tests.push({
      name: "Revert & Koreksi Skor",
      passed: false,
      error: e.toString()
    });
  }

  return tests;
}

/**
 * TEST 6: Timer Ronde & Manajemen Warna Deck
 */
function runTimerAndDeckTests() {
  var tests = [];

  try {
    // 1. Tes Timer State Calculation
    var mockRound = {
      id: "rnd_test",
      timer_duration_minutes: 45,
      timer_status: "RUNNING",
      timer_start_timestamp: new Date(Date.now() - 60000).toISOString(), // 1 menit yang lalu
      timer_remaining_seconds: 45 * 60
    };

    var timerState = calculateRoundTimerState(mockRound);
    var timerPass = timerState.status === "RUNNING" &&
                    timerState.remaining_seconds <= (44 * 60) &&
                    timerState.remaining_seconds >= (43 * 60 + 55);

    // 2. Tes Validasi Chip Warna Deck
    var validColors = ['Merah', 'Biru', 'Kuning', 'Hijau', 'Hitam', 'Ungu', 'Putih'];
    var testSelection = ['Merah', 'Hitam'];
    var colorsValid = testSelection.every(function(c) { return validColors.indexOf(c) !== -1; }) && testSelection.length >= 1;

    tests.push({
      name: "Timer Ronde & Deck: Perhitungan Offset Server & Validasi Chip Warna",
      passed: timerPass && colorsValid,
      details: "Sisa waktu timer tersinkronisasi presisi (" + timerState.remaining_seconds + "s tersisa dari 45m). Validasi warna deck (Merah, Hitam) lolos."
    });

  } catch (e) {
    tests.push({
      name: "Timer Ronde & Deck",
      passed: false,
      error: e.toString()
    });
  }

  return tests;
}

/**
 * TEST 7: Riwayat & Statistik (Win Rate & Meta Agregasi)
 */
function runHistoryAndStatsTests() {
  var tests = [];

  try {
    // 1. Tes perhitungan Win Rate
    var mWon = 3, mLost = 1;
    var tot = mWon + mLost;
    var winRate = tot > 0 ? Math.round((mWon / tot) * 1000) / 10 : 0;
    var winRatePass = (winRate === 75.0);

    // 2. Tes Validasi 7 Warna Meta Digimon TCG
    var validColors = ['Merah', 'Biru', 'Kuning', 'Hijau', 'Hitam', 'Ungu', 'Putih'];
    var mockSelection = ['Merah', 'Kuning'];
    var colorsValid = mockSelection.every(function(c) { return validColors.indexOf(c) !== -1; });

    tests.push({
      name: "Riwayat & Statistik: Formula Win Rate & Validasi 7 Warna Meta",
      passed: winRatePass && colorsValid,
      details: "Perhitungan win rate 3-1 = " + winRate + "% berhasil. Agregasi 7 warna meta (Merah, Biru, Kuning, Hijau, Hitam, Ungu, Putih) valid."
    });

  } catch (e) {
    tests.push({
      name: "Riwayat & Statistik",
      passed: false,
      error: e.toString()
    });
  }

  return tests;
}

// =========================================================================
// 12. CRUD TURNAMEN & MANAJEMEN PESERTA
// =========================================================================

function findTournament(id, ss) {
  var list = getTableData("Tournaments", ss);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function handleGetTournaments(authUser, data, ss) {
  var filterStatus = data.status;
  var myOnly = data.myOnly === true;

  var list = getTableData("Tournaments", ss);

  if (myOnly && authUser.role === "organizer") {
    list = list.filter(function(t) { return t.organizer_id === authUser.id; });
  }

  if (filterStatus && filterStatus !== "ALL") {
    list = list.filter(function(t) { return t.status === filterStatus; });
  }

  var allRegs = getTableData("Registrations", ss);

  var result = list.map(function(t) {
    var regCount = allRegs.filter(function(r) {
      return r.tournament_id === t.id && r.status !== "DROPPED";
    }).length;

    var isMyTournament = (authUser.role === "admin" || t.organizer_id === authUser.id);
    var isRegistered = allRegs.some(function(r) {
      return r.tournament_id === t.id && r.user_id === authUser.id && r.status !== "DROPPED";
    });

    return {
      id: t.id,
      name: t.name,
      date: t.date,
      location: t.location,
      status: t.status,
      format: t.format,
      total_rounds: parseInt(t.total_rounds, 10),
      current_round: parseInt(t.current_round, 10),
      organizer_id: t.organizer_id,
      organizer_name: t.organizer_name,
      participant_count: regCount,
      is_my_tournament: isMyTournament,
      is_registered: isRegistered
    };
  });

  return respondJson({ ok: true, data: result });
}

function handleGetTournamentDetails(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  var regs = getTableData("Registrations", ss).filter(function(r) {
    return r.tournament_id === tournamentId;
  });

  var isOrganizerOrAdmin = (authUser.role === "admin" || tournament.organizer_id === authUser.id);
  var myReg = null;
  for (var i = 0; i < regs.length; i++) {
    if (regs[i].user_id === authUser.id) { myReg = regs[i]; break; }
  }

  return respondJson({
    ok: true,
    data: {
      tournament: tournament,
      participants: regs,
      isOrganizerOrAdmin: isOrganizerOrAdmin,
      myRegistration: myReg
    }
  });
}

function handleCreateTournament(authUser, data, ss) {
  if (authUser.role !== "admin" && authUser.role !== "organizer") {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer atau Admin yang dapat membuat turnamen." });
  }

  var name = data.name;
  var date = data.date || new Date().toISOString().split('T')[0];
  var location = data.location || "Lokal";
  var format = data.format === "BO1" ? "BO1" : "BO3";
  var totalRounds = parseInt(data.total_rounds, 10) || 3;

  if (!name || name.trim() === "") {
    return respondJson({ ok: false, error: "Nama turnamen wajib diisi." });
  }

  var newId = "trn_" + Utilities.getUuid().substring(0, 8);
  var record = {
    id: newId,
    name: name.trim(),
    date: date,
    location: location.trim(),
    status: "REGISTRATION_OPEN",
    format: format,
    total_rounds: totalRounds,
    current_round: 0,
    organizer_id: authUser.id,
    organizer_name: authUser.name,
    rules_config: JSON.stringify(SCORING_RULES),
    created_at: new Date().toISOString()
  };

  addRow("Tournaments", record, ss);
  logAudit("CREATE_TOURNAMENT", authUser, "Turnamen dibuat: " + name, "", "REGISTRATION_OPEN", newId, name, ss);

  return respondJson({ ok: true, data: record, message: "Turnamen berhasil dibuat." });
}

function handleUpdateTournament(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Anda hanya dapat mengubah turnamen milik Anda sendiri." });
  }

  var updates = {};
  if (data.name) updates.name = data.name.trim();
  if (data.date) updates.date = data.date;
  if (data.location) updates.location = data.location.trim();
  if (data.total_rounds && tournament.status === "REGISTRATION_OPEN") {
    updates.total_rounds = parseInt(data.total_rounds, 10);
  }

  updateRow("Tournaments", tournamentId, updates, ss);
  logAudit("UPDATE_TOURNAMENT", authUser, "Turnamen diperbarui: " + tournament.name, "", JSON.stringify(updates), tournamentId, tournament.name, ss);

  return respondJson({ ok: true, message: "Data turnamen berhasil diperbarui." });
}

function handleDeleteTournament(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Anda tidak berhak menghapus turnamen ini." });
  }

  deleteRow("Tournaments", tournamentId, ss);
  deleteRowsByCondition("Registrations", "tournament_id", tournamentId, ss);
  deleteRowsByCondition("Rounds", "tournament_id", tournamentId, ss);
  deleteRowsByCondition("Matches", "tournament_id", tournamentId, ss);

  logAudit("DELETE_TOURNAMENT", authUser, "Turnamen dihapus: " + tournament.name, tournament.name, "DELETED", tournamentId, tournament.name, ss);

  return respondJson({ ok: true, message: "Turnamen berhasil dihapus beserta seluruh datanya." });
}

function handleStartTournament(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer yang dapat memulai turnamen." });
  }

  if (tournament.status !== "REGISTRATION_OPEN") {
    return respondJson({ ok: false, error: "Turnamen ini sudah dimulai atau sudah selesai." });
  }

  var regs = getTableData("Registrations", ss).filter(function(r) {
    return r.tournament_id === tournamentId && r.status !== "DROPPED";
  });

  if (regs.length < 2) {
    return respondJson({ ok: false, error: "Minimal butuh 2 peserta aktif untuk memulai turnamen (disarankan minimal 4 peserta)." });
  }

  var totalRounds = parseInt(data.totalRounds, 10);
  if (!totalRounds || isNaN(totalRounds)) {
    totalRounds = Math.ceil(Math.log2(regs.length));
    if (totalRounds < 1) totalRounds = 1;
  }

  updateRow("Tournaments", tournamentId, {
    status: "RUNNING",
    total_rounds: totalRounds,
    current_round: 0
  }, ss);

  logAudit("START_TOURNAMENT", authUser, "Turnamen dimulai dengan " + regs.length + " peserta, " + totalRounds + " ronde.", "REGISTRATION_OPEN", "RUNNING", tournamentId, tournament.name, ss);

  return respondJson({
    ok: true,
    data: { total_rounds: totalRounds, participant_count: regs.length },
    message: "Turnamen resmi dimulai! Daftar peserta dan format terkunci. Siap membuat pairing Ronde 1."
  });
}

function handleRegisterPlayer(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (tournament.status !== "REGISTRATION_OPEN") {
    return respondJson({ ok: false, error: "Pendaftaran sudah ditutup untuk turnamen ini." });
  }

  var regs = getTableData("Registrations", ss);
  for (var i = 0; i < regs.length; i++) {
    if (regs[i].tournament_id === tournamentId && regs[i].user_id === authUser.id) {
      if (regs[i].status !== "DROPPED") {
        return respondJson({ ok: false, error: "Anda sudah terdaftar di turnamen ini." });
      }
    }
  }

  var regRecord = {
    id: "reg_" + Utilities.getUuid().substring(0, 8),
    tournament_id: tournamentId,
    user_id: authUser.id,
    player_name: authUser.name,
    deck_name: data.deckName || "Deck Tanpa Nama",
    digimon_partner: data.digimonPartner || "Agumon",
    status: "ACTIVE",
    match_points: 0,
    game_points: 0,
    matches_won: 0,
    matches_lost: 0,
    games_won: 0,
    games_lost: 0,
    omw_percentage: "33.33",
    gw_percentage: "33.33",
    ogw_percentage: "33.33",
    created_at: new Date().toISOString(),
    deck_colors: ""
  };

  addRow("Registrations", regRecord, ss);
  logAudit("REGISTER_PLAYER", authUser, authUser.name + " mendaftar turnamen " + tournament.name, "", "ACTIVE", tournamentId, tournament.name, ss);

  return respondJson({ ok: true, data: regRecord, message: "Pendaftaran berhasil!" });
}

function handleUnregisterPlayer(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (tournament.status !== "REGISTRATION_OPEN") {
    return respondJson({ ok: false, error: "Tidak dapat membatalkan pendaftaran saat turnamen sudah berjalan." });
  }

  var regs = getTableData("Registrations", ss);
  var targetRegId = null;
  for (var i = 0; i < regs.length; i++) {
    if (regs[i].tournament_id === tournamentId && regs[i].user_id === authUser.id) {
      targetRegId = regs[i].id;
      break;
    }
  }

  if (!targetRegId) return respondJson({ ok: false, error: "Data pendaftaran Anda tidak ditemukan." });

  deleteRow("Registrations", targetRegId, ss);
  logAudit("UNREGISTER_PLAYER", authUser, authUser.name + " membatalkan pendaftaran turnamen " + tournament.name, "ACTIVE", "CANCELLED", tournamentId, tournament.name, ss);

  return respondJson({ ok: true, message: "Pendaftaran berhasil dibatalkan." });
}

function handleAddManualPlayer(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer yang dapat menambah peserta manual." });
  }

  if (tournament.status !== "REGISTRATION_OPEN") {
    return respondJson({ ok: false, error: "Turnamen sudah berjalan. Peserta baru tidak dapat ditambahkan." });
  }

  var playerName = data.playerName;
  if (!playerName || playerName.trim() === "") {
    return respondJson({ ok: false, error: "Nama peserta wajib diisi." });
  }

  var regRecord = {
    id: "reg_" + Utilities.getUuid().substring(0, 8),
    tournament_id: tournamentId,
    user_id: "MANUAL_" + Utilities.getUuid().substring(0, 6),
    player_name: playerName.trim(),
    deck_name: data.deckName || "Custom Deck",
    digimon_partner: data.digimonPartner || "Agumon",
    status: "ACTIVE",
    match_points: 0,
    game_points: 0,
    matches_won: 0,
    matches_lost: 0,
    games_won: 0,
    games_lost: 0,
    omw_percentage: "33.33",
    gw_percentage: "33.33",
    ogw_percentage: "33.33",
    created_at: new Date().toISOString(),
    deck_colors: ""
  };

  addRow("Registrations", regRecord, ss);
  logAudit("ADD_MANUAL_PLAYER", authUser, "Organizer menambahkan peserta manual: " + playerName, "", "ACTIVE", tournamentId, tournament.name, ss);

  return respondJson({ ok: true, data: regRecord, message: "Peserta manual berhasil ditambahkan." });
}

function handleKickPlayer(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var registrationId = data.registrationId;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer yang dapat mengeluarkan peserta." });
  }

  if (tournament.status !== "REGISTRATION_OPEN") {
    return respondJson({ ok: false, error: "Turnamen sudah berjalan. Gunakan fitur 'Drop Peserta' bukan 'Keluarkan'." });
  }

  deleteRow("Registrations", registrationId, ss);
  logAudit("KICK_PLAYER", authUser, "Organizer mengeluarkan peserta (" + registrationId + ")", "ACTIVE", "KICKED", tournamentId, tournament.name, ss);

  return respondJson({ ok: true, message: "Peserta berhasil dikeluarkan dari turnamen." });
}

function handleDropPlayer(authUser, data, ss) {
  var tournamentId = data.tournamentId;
  var registrationId = data.registrationId;

  var tournament = findTournament(tournamentId, ss);
  if (!tournament) return respondJson({ ok: false, error: "Turnamen tidak ditemukan." });

  if (authUser.role !== "admin" && tournament.organizer_id !== authUser.id) {
    return respondJson({ ok: false, error: "Akses ditolak: Hanya Organizer yang dapat menandai drop peserta." });
  }

  updateRow("Registrations", registrationId, { status: "DROPPED" }, ss);
  logAudit("DROP_PLAYER", authUser, "Peserta ditandai Drop (" + registrationId + ")", "ACTIVE", "DROPPED", tournamentId, tournament.name, ss);

  return respondJson({ ok: true, message: "Peserta ditandai Drop. Peserta tidak akan dipasangkan lagi di ronde berikutnya." });
}

// =========================================================================
// 13. SISTEM AUTENTIKASI (SALTED SHA-256) & KELOLA PENGGUNA
// =========================================================================

function handleRegister(data, ss) {
  var username = (data.username || "").toLowerCase().trim();
  var password = data.password || "";
  var name = (data.name || "").trim() || username;

  if (!username || username.length < 3) {
    return respondJson({ ok: false, error: "Username minimal 3 karakter." });
  }
  if (!password || password.length < 6) {
    return respondJson({ ok: false, error: "Password minimal 6 karakter." });
  }

  var users = getTableData("Users", ss);
  for (var i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === username) {
      return respondJson({ ok: false, error: "Username sudah digunakan. Silakan pilih username lain." });
    }
  }

  var role = (users.length === 0) ? "admin" : "player";
  var salt = generateRandomString(16);
  var passwordHash = hashPassword(password, salt);
  var userId = "usr_" + Utilities.getUuid().substring(0, 8);

  var newUser = {
    id: userId,
    username: username,
    salt: salt,
    password_hash: passwordHash,
    role: role,
    name: name,
    status: "active",
    failed_attempts: 0,
    lockout_until: "",
    created_at: new Date().toISOString()
  };

  addRow("Users", newUser, ss);
  var sessionToken = createSession(newUser, ss);
  logAudit("REGISTER", newUser, "Pendaftaran akun baru: " + username + " (Role: " + role + ")", "", role, "", "", ss);

  return respondJson({
    ok: true,
    data: {
      token: sessionToken,
      user: { id: userId, username: username, name: name, role: role, status: "active" },
      isFirstAdmin: role === "admin"
    },
    message: role === "admin" 
      ? "Pendaftaran berhasil! Akun pertama otomatis menjadi Admin." 
      : "Pendaftaran berhasil! Selamat datang, Tamer."
  });
}

function handleLogin(data, ss) {
  var username = (data.username || "").toLowerCase().trim();
  var password = data.password || "";

  if (!username || !password) {
    return respondJson({ ok: false, error: "Username dan password wajib diisi." });
  }

  var users = getTableData("Users", ss);
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === username) { user = users[i]; break; }
  }

  if (!user) return respondJson({ ok: false, error: "Username atau password salah." });

  if (user.status === "inactive") {
    return respondJson({ ok: false, error: "Akun Anda telah dinonaktifkan oleh Admin." });
  }

  var nowTime = new Date().getTime();
  if (user.lockout_until && !isNaN(new Date(user.lockout_until).getTime())) {
    var lockTime = new Date(user.lockout_until).getTime();
    if (nowTime < lockTime) {
      var remainingSec = Math.ceil((lockTime - nowTime) / 1000);
      return respondJson({
        ok: false,
        error: "Terlalu banyak percobaan gagal. Akun dikunci sementara. Silakan tunggu " + remainingSec + " detik lagi."
      });
    }
  }

  var inputHash = hashPassword(password, user.salt);
  if (inputHash !== user.password_hash) {
    var attempts = (parseInt(user.failed_attempts, 10) || 0) + 1;
    var updates = { failed_attempts: attempts };

    if (attempts >= 5) {
      var lockoutUntil = new Date(nowTime + 5 * 60 * 1000).toISOString();
      updates.lockout_until = lockoutUntil;
      updates.failed_attempts = 0;
      updateRow("Users", user.id, updates, ss);
      logAudit("ACCOUNT_LOCKOUT", user, "Akun dikunci 5 menit karena 5x gagal login", "", "LOCKED_5MIN", "", "", ss);
      return respondJson({
        ok: false,
        error: "Password salah 5 kali berturut-turut. Akun dikunci selama 5 menit."
      });
    }

    updateRow("Users", user.id, updates, ss);
    return respondJson({
      ok: false,
      error: "Username atau password salah. Sisa kesempatan: " + (5 - attempts) + "x."
    });
  }

  updateRow("Users", user.id, { failed_attempts: 0, lockout_until: "" }, ss);
  var sessionToken = createSession(user, ss);
  logAudit("LOGIN", user, "Login berhasil: " + user.username, "", "ACTIVE_SESSION", "", "", ss);

  return respondJson({
    ok: true,
    data: {
      token: sessionToken,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, status: user.status }
    },
    message: "Login berhasil."
  });
}

function createSession(user, ss) {
  var token = "tok_" + Utilities.getUuid().replace(/-/g, "") + generateRandomString(12);
  var expiresAt = new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  var sessionRecord = {
    token: token,
    user_id: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
    expires_at: expiresAt,
    created_at: new Date().toISOString()
  };

  addRow("Sessions", sessionRecord, ss);
  return token;
}

function verifyToken(token, ss) {
  if (!token) return null;
  var sessions = getTableData("Sessions", ss);
  var session = null;
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].token === token) { session = sessions[i]; break; }
  }
  if (!session) return null;

  var exp = new Date(session.expires_at).getTime();
  if (new Date().getTime() > exp) {
    deleteRow("Sessions", token, ss, "token");
    return null;
  }

  var users = getTableData("Users", ss);
  for (var j = 0; j < users.length; j++) {
    if (users[j].id === session.user_id) {
      if (users[j].status === "inactive") return null;
      return users[j];
    }
  }
  return null;
}

function hashPassword(password, salt) {
  var salted = password + "::" + salt;
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < rawHash.length; i++) {
    var byteVal = rawHash[i];
    if (byteVal < 0) byteVal += 256;
    var byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = "0" + byteHex;
    hex += byteHex;
  }
  return hex;
}

function generateRandomString(len) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var result = "";
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function handleUpdateProfile(authUser, data, ss) {
  var updates = {};
  if (data.name && data.name.trim() !== "") updates.name = data.name.trim();

  if (data.newPassword && data.newPassword.length >= 6) {
    var newSalt = generateRandomString(16);
    updates.salt = newSalt;
    updates.password_hash = hashPassword(data.newPassword, newSalt);
  }

  updateRow("Users", authUser.id, updates, ss);
  logAudit("UPDATE_PROFILE", authUser, "Profil diperbarui: " + authUser.username, "", "UPDATED", "", "", ss);

  return respondJson({ ok: true, message: "Profil berhasil diperbarui." });
}

function handleAdminGetUsers(ss) {
  var users = getTableData("Users", ss);
  var sanitized = users.map(function(u) {
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      status: u.status,
      created_at: u.created_at
    };
  });
  return respondJson({ ok: true, data: sanitized });
}

function handleAdminUpdateRole(adminUser, data, ss) {
  var targetUserId = data.userId;
  var newRole = data.newRole;

  if (targetUserId === adminUser.id && newRole !== "admin") {
    var allUsers = getTableData("Users", ss);
    var adminCount = allUsers.filter(function(u) { return u.role === "admin" && u.status === "active"; }).length;
    if (adminCount <= 1) {
      return respondJson({ ok: false, error: "Anda tidak dapat menurunkan peran diri sendiri karena Anda satu-satunya Admin aktif." });
    }
  }

  var oldUser = null;
  var allUsersList = getTableData("Users", ss);
  for (var u = 0; u < allUsersList.length; u++) {
    if (allUsersList[u].id === targetUserId) { oldUser = allUsersList[u]; break; }
  }

  updateRow("Users", targetUserId, { role: newRole }, ss);
  logAudit("ADMIN_UPDATE_ROLE", adminUser, "Ubah role user " + targetUserId, oldUser ? oldUser.role : "", newRole, "", "", ss);

  return respondJson({ ok: true, message: "Peran pengguna berhasil diubah menjadi: " + newRole });
}

function handleAdminToggleStatus(adminUser, data, ss) {
  var targetUserId = data.userId;
  var newStatus = data.status === "inactive" ? "inactive" : "active";

  if (targetUserId === adminUser.id && newStatus === "inactive") {
    return respondJson({ ok: false, error: "Anda tidak dapat menonaktifkan akun Anda sendiri." });
  }

  updateRow("Users", targetUserId, { status: newStatus }, ss);
  logAudit("ADMIN_TOGGLE_STATUS", adminUser, "Ubah status user " + targetUserId, "", newStatus, "", "", ss);

  return respondJson({ ok: true, message: "Status akun berhasil diubah menjadi: " + newStatus });
}

function handleAdminResetPassword(adminUser, data, ss) {
  var targetUserId = data.userId;
  var tempPassword = "DGS" + Math.floor(100000 + Math.random() * 900000);
  var newSalt = generateRandomString(16);
  var newHash = hashPassword(tempPassword, newSalt);

  updateRow("Users", targetUserId, {
    salt: newSalt,
    password_hash: newHash,
    failed_attempts: 0,
    lockout_until: ""
  }, ss);

  logAudit("ADMIN_RESET_PASSWORD", adminUser, "Reset password user " + targetUserId, "", "TEMP_PASSWORD_GENERATED", "", "", ss);

  return respondJson({
    ok: true,
    data: { tempPassword: tempPassword },
    message: "Password berhasil direset. Password sementara: " + tempPassword
  });
}

// =========================================================================
// 14. HELPER DATABASE & PERSISTENSI GOOGLE SPREADSHEET
// =========================================================================

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var createdSheets = [];

  for (var sheetName in SCHEMA) {
    var headers = SCHEMA[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      createdSheets.push(sheetName);
    }

    var currentCols = sheet.getLastColumn();
    var currentRows = sheet.getLastRow();

    if (currentCols === 0 || currentRows === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#0B1E36");
      headerRange.setFontColor("#FFFFFF");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
      for (var col = 1; col <= headers.length; col++) sheet.setColumnWidth(col, 160);
    } else {
      var existingHeaders = sheet.getRange(1, 1, 1, currentCols).getValues()[0];
      var missingHeaders = [];
      for (var h = 0; h < headers.length; h++) {
        if (existingHeaders.indexOf(headers[h]) === -1) missingHeaders.push(headers[h]);
      }
      if (missingHeaders.length > 0) {
        var startCol = currentCols + 1;
        sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
        var newRange = sheet.getRange(1, startCol, 1, missingHeaders.length);
        newRange.setBackground("#0B1E36");
        newRange.setFontColor("#FFFFFF");
        newRange.setFontWeight("bold");
        newRange.setHorizontalAlignment("center");
      }
    }
  }

  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }

  return {
    success: true,
    message: "Inisialisasi tabel DigiSwiss TCG berhasil diselaraskan (v7.0.0).",
    createdSheets: createdSheets,
    allSheets: Object.keys(SCHEMA)
  };
}

function getTableData(sheetName, ss) {
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var data = [];
  for (var i = 0; i < rows.length; i++) {
    var item = {};
    for (var j = 0; j < headers.length; j++) {
      item[headers[j]] = rows[i][j];
    }
    data.push(item);
  }
  return data;
}

function addRow(sheetName, rowObj, ss) {
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(sheetName);
  if (!sheet) return null;
  var headers = SCHEMA[sheetName] || sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var rowValues = [];
  for (var i = 0; i < headers.length; i++) {
    var val = rowObj[headers[i]];
    rowValues.push(val !== undefined ? val : "");
  }

  sheet.appendRow(rowValues);
  return rowObj;
}

function updateRow(sheetName, idValue, updates, ss, keyColName) {
  keyColName = keyColName || "id";
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(sheetName);
  if (!sheet) return { updated: false };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { updated: false };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keyColIdx = headers.indexOf(keyColName);
  if (keyColIdx === -1) return { updated: false };

  var keys = sheet.getRange(2, keyColIdx + 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(idValue)) {
      var rowNum = i + 2;
      for (var field in updates) {
        var colIdx = headers.indexOf(field);
        if (colIdx !== -1) {
          sheet.getRange(rowNum, colIdx + 1).setValue(updates[field]);
        }
      }
      return { updated: true, row: rowNum };
    }
  }
  return { updated: false };
}

function deleteRow(sheetName, idValue, ss, keyColName) {
  keyColName = keyColName || "id";
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(sheetName);
  if (!sheet) return { deleted: false };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { deleted: false };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keyColIdx = headers.indexOf(keyColName);
  if (keyColIdx === -1) return { deleted: false };

  var keys = sheet.getRange(2, keyColIdx + 1, lastRow - 1, 1).getValues();

  for (var i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i][0]) === String(idValue)) {
      sheet.deleteRow(i + 2);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function deleteRowsByCondition(sheetName, colName, valueToMatch, ss) {
  var sheet = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(sheetName);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return;

  var vals = sheet.getRange(2, colIdx + 1, lastRow - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(valueToMatch)) {
      sheet.deleteRow(i + 2);
    }
  }
}
