import React, { useState, useEffect, useRef } from 'react';
import { 
  pingServer, 
  getApiUrl, 
  setApiUrl,
  login, 
  register, 
  logout, 
  getCurrentUser, 
  getToken, 
  verifyCurrentSession, 
  updateProfile,
  getTournaments,
  getTournamentDetails,
  getTournamentStandings,
  createTournament,
  startTournament,
  registerPlayer,
  generateRoundPairing,
  getRoundMatches,
  getMyMatches,
  swapPairing,
  submitMatchScore,
  confirmMatchScore,
  disputeMatchScore,
  completeRound,
  getRevertImpact,
  revertRound,
  getAuditLogs,
  updateRoundTimer,
  getRoundTimer,
  getPlayerDeckHistory,
  updateParticipantDeck,
  getTournamentFinalResults,
  runPairingTests,
  adminGetUsers,
  adminUpdateRole,
  adminToggleUserStatus
} from './api.js';
import HistoryView from './components/HistoryView.tsx';
import StatsView from './components/StatsView.tsx';

const AVAILABLE_DECK_COLORS = [
  { name: 'Merah', hex: '#ef4444', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  { name: 'Biru', hex: '#3b82f6', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
  { name: 'Kuning', hex: '#eab308', bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/50' },
  { name: 'Hijau', hex: '#22c55e', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50' },
  { name: 'Hitam', hex: '#64748b', bg: 'bg-slate-700/60', text: 'text-slate-200', border: 'border-slate-500/50' },
  { name: 'Ungu', hex: '#a855f7', bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/50' },
  { name: 'Putih', hex: '#f8fafc', bg: 'bg-slate-200/20', text: 'text-slate-100', border: 'border-slate-300/50' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>('turnamen');
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'cached' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState<string>('Memeriksa...');

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Tournament List State
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<any>(null);
  const [standingsList, setStandingsList] = useState<any[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);

  // Player "Pertandingan Saya" State
  const [myMatchesData, setMyMatchesData] = useState<any>(null);
  const [myMatchesLoading, setMyMatchesLoading] = useState(false);
  const [disputeModalMatch, setDisputeModalMatch] = useState<any>(null);
  const [disputeReasonInput, setDisputeReasonInput] = useState('');

  // Round & Matches State (Organizer)
  const [activeRound, setActiveRound] = useState<any>(null);
  const [roundMatches, setRoundMatches] = useState<any[]>([]);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);
  const [selectedRoundNum, setSelectedRoundNum] = useState<number | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Notification for Automatic Pairing Generation
  const [autoPairingNotification, setAutoPairingNotification] = useState<string | null>(null);

  // Score Input Modal (Organizer)
  const [scoreModalMatch, setScoreModalMatch] = useState<any>(null);
  const [scoreP1Wins, setScoreP1Wins] = useState<number>(2);
  const [scoreP2Wins, setScoreP2Wins] = useState<number>(0);
  const [scoreWarningSubsequent, setScoreWarningSubsequent] = useState<boolean>(false);

  // Revert Modal State
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertTargetRound, setRevertTargetRound] = useState<number | null>(null);
  const [revertImpact, setRevertImpact] = useState<any>(null);
  const [revertLoading, setRevertLoading] = useState(false);

  // Swap Pairing Modal
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapMatch1Id, setSwapMatch1Id] = useState('');
  const [swapMatch2Id, setSwapMatch2Id] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');

  // TIMER RONDE STATE
  const [timerDurationInput, setTimerDurationInput] = useState<number>(45);
  const [timerRawState, setTimerRawState] = useState<any>(null);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState<number>(0);
  const [displaySeconds, setDisplaySeconds] = useState<number>(45 * 60);
  const [timerStatus, setTimerStatus] = useState<string>('STOPPED');
  const [timerLoading, setTimerLoading] = useState<boolean>(false);
  const alert5MinFiredRef = useRef<boolean>(false);
  const alertExpiredFiredRef = useRef<boolean>(false);

  // DECK MANAGEMENT & FINAL RESULTS MODAL STATE
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [deckNameInput, setDeckNameInput] = useState('');
  const [selectedDeckColors, setSelectedDeckColors] = useState<string[]>(['Merah']);
  const [playerDeckHistory, setPlayerDeckHistory] = useState<any[]>([]);
  const [deckSaving, setDeckSaving] = useState(false);

  // EXPORT FINAL RESULTS MODAL STATE
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState<any>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0]);
  const [createLocation, setCreateLocation] = useState('Local Game Store');
  const [createFormat, setCreateFormat] = useState('BO3');
  const [createRounds, setCreateRounds] = useState(3);

  // Settings & Profile
  const [inputUrl, setInputUrl] = useState<string>(getApiUrl());
  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profileNewPass, setProfileNewPass] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Test Results
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  // Admin Users
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (currentUser) {
      if (activeTab === 'turnamen' || activeTab === 'turnamen_saya') {
        loadTournamentList();
      } else if (activeTab === 'pertandingan_saya') {
        loadMyMatches();
      } else if (activeTab === 'ronde') {
        loadRoundsData(selectedRoundNum);
      } else if (activeTab === 'klasemen') {
        loadStandings();
      } else if (activeTab === 'audit_log') {
        loadAuditLogs();
      } else if (activeTab === 'pengguna' && currentUser.role === 'admin') {
        loadAdminUsers();
      }
    }
  }, [activeTab, statusFilter, currentUser?.id, selectedTournamentId, selectedRoundNum]);

  // TIMER TICK LOOP (Setiap 1 detik menghitung sisa waktu berbasis offset server)
  useEffect(() => {
    const timerInterval = setInterval(() => {
      if (!timerRawState) return;

      const currentStatus = timerRawState.status;
      setTimerStatus(currentStatus);

      if (currentStatus === 'RUNNING' && timerRawState.start_timestamp) {
        const nowServerMs = Date.now() - serverTimeOffsetMs;
        const startMs = new Date(timerRawState.start_timestamp).getTime();
        const elapsedSec = Math.floor((nowServerMs - startMs) / 1000);
        const rem = Math.max(0, (timerRawState.remaining_seconds || 0) - elapsedSec);
        setDisplaySeconds(rem);

        // Getar & Visual Warning pada sisa 5 menit
        if (rem <= 300 && rem > 0 && !alert5MinFiredRef.current) {
          alert5MinFiredRef.current = true;
          try {
            const bridge = (window as any).AndroidBridge;
            if (bridge && typeof bridge.vibrate === 'function') {
              bridge.vibrate(300);
            } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
          } catch (e) {}
        }

        // Getar & Visual Warning saat waktu habis
        if (rem === 0 && !alertExpiredFiredRef.current) {
          alertExpiredFiredRef.current = true;
          setTimerStatus('EXPIRED');
          try {
            const bridge = (window as any).AndroidBridge;
            if (bridge && typeof bridge.vibrate === 'function') {
              bridge.vibrate(800);
            } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([500, 250, 500, 250, 500]);
            }
          } catch (e) {}
        }
      } else if (currentStatus === 'PAUSED') {
        setDisplaySeconds(timerRawState.remaining_seconds || 0);
      } else if (currentStatus === 'STOPPED') {
        setDisplaySeconds((timerRawState.duration_minutes || 45) * 60);
      } else if (currentStatus === 'EXPIRED') {
        setDisplaySeconds(0);
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [timerRawState, serverTimeOffsetMs]);

  // TIMER POLLING SINKRONISASI SERVER (Setiap 12 detik)
  useEffect(() => {
    if (!selectedTournamentId || (activeTab !== 'ronde' && activeTab !== 'pertandingan_saya')) {
      return;
    }

    const syncTimer = async () => {
      if (!activeRound?.id) return;
      try {
        const res = await getRoundTimer(selectedTournamentId, activeRound.id);
        if (res.ok && res.data) {
          applyTimerServerData(res.data);
        }
      } catch (e) {}
    };

    const pollInterval = setInterval(syncTimer, 12000);
    return () => clearInterval(pollInterval);
  }, [selectedTournamentId, activeRound?.id, activeTab]);

  const applyTimerServerData = (tData: any) => {
    if (!tData) return;
    setTimerRawState(tData);
    setTimerDurationInput(tData.duration_minutes || 45);

    if (tData.server_time) {
      const serverMs = new Date(tData.server_time).getTime();
      const localMs = Date.now();
      const offset = localMs - serverMs;
      setServerTimeOffsetMs(offset);
    }

    if (tData.status === 'RUNNING' && tData.start_timestamp) {
      const serverNow = Date.now() - (Date.now() - new Date(tData.server_time).getTime());
      const startMs = new Date(tData.start_timestamp).getTime();
      const elapsed = Math.floor((serverNow - startMs) / 1000);
      const rem = Math.max(0, (tData.remaining_seconds || 0) - elapsed);
      setDisplaySeconds(rem);
    } else {
      setDisplaySeconds(tData.remaining_seconds ?? (tData.duration_minutes * 60));
    }
  };

  const initApp = async () => {
    const res = await pingServer();
    if (res.ok) {
      setConnectionStatus('connected');
      setStatusMessage(`Online (${res.latency} ms)`);
    } else {
      setConnectionStatus(res.isMisconfigured ? 'error' : 'cached');
      setStatusMessage(res.isMisconfigured ? 'URL Belum Diatur' : 'Mode Offline');
    }

    if (getToken()) {
      try {
        const v = await verifyCurrentSession();
        if (v.ok && v.data?.user) {
          setCurrentUser(v.data.user);
          setProfileName(v.data.user.name || '');
        }
      } catch (e) {}
    }
  };

  const loadTournamentList = async () => {
    try {
      const isMyOnly = activeTab === 'turnamen_saya';
      const res = await getTournaments({ status: statusFilter, myOnly: isMyOnly });
      if (res.ok && res.data) {
        setTournaments(res.data);
        if (!selectedTournamentId && res.data.length > 0) {
          const running = res.data.find((t: any) => t.status === 'RUNNING');
          setSelectedTournamentId(running ? running.id : res.data[0].id);
        }
      }
    } catch (e) {}
  };

  const loadRoundsData = async (roundNumToFetch: number | null = null) => {
    if (!selectedTournamentId) return;
    setMatchesLoading(true);
    try {
      const detailRes = await getTournamentDetails(selectedTournamentId);
      if (detailRes.ok && detailRes.data) {
        setSelectedTournament(detailRes.data.tournament);
      }

      const matchRes = await getRoundMatches(selectedTournamentId, roundNumToFetch || undefined);
      if (matchRes.ok && matchRes.data) {
        setActiveRound(matchRes.data.round);
        setRoundMatches(matchRes.data.matches || []);
        if (matchRes.data.availableRounds) {
          setAvailableRounds(matchRes.data.availableRounds);
        }
        if (matchRes.data.round) {
          setSelectedRoundNum(parseInt(matchRes.data.round.round_number, 10));
        }
        if (matchRes.data.timer) {
          applyTimerServerData(matchRes.data.timer);
        }
      }
    } finally {
      setMatchesLoading(false);
    }
  };

  const loadMyMatches = async () => {
    if (!selectedTournamentId) return;
    setMyMatchesLoading(true);
    try {
      const res = await getMyMatches(selectedTournamentId);
      if (res.ok && res.data) {
        setMyMatchesData(res.data);
        if (res.data.timer) {
          applyTimerServerData(res.data.timer);
        }
      }
    } finally {
      setMyMatchesLoading(false);
    }
  };

  const loadStandings = async () => {
    if (!selectedTournamentId) return;
    setStandingsLoading(true);
    try {
      const res = await getTournamentStandings(selectedTournamentId);
      if (res.ok && res.data) {
        setStandingsList(res.data.standings || []);
        setSelectedTournament(res.data.tournament || selectedTournament);
      }
    } finally {
      setStandingsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const tourneyId = currentUser?.role === 'admin' ? '' : (selectedTournamentId || '');
      const res = await getAuditLogs(tourneyId);
      if (res.ok && res.data) {
        setAuditLogs(res.data);
      }
    } finally {
      setAuditLoading(false);
    }
  };

  const loadAdminUsers = async () => {
    const res = await adminGetUsers();
    if (res.ok && res.data) setAdminUsers(res.data);
  };

  // Auth Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await login(loginUsername, loginPassword);
      if (res.ok && res.data) {
        setCurrentUser(res.data.user);
        setProfileName(res.data.user.name || '');
        setActiveTab(res.data.user.role === 'admin' ? 'pengguna' : (res.data.user.role === 'organizer' ? 'turnamen_saya' : 'pertandingan_saya'));
      } else {
        setAuthError(res.error || 'Login gagal.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await register(regUsername, regPassword, regName);
      if (res.ok && res.data) {
        setCurrentUser(res.data.user);
        setProfileName(res.data.user.name || '');
        alert(`Pendaftaran berhasil! Peran Anda: ${res.data.user.role.toUpperCase()}`);
        setActiveTab('turnamen');
      } else {
        setAuthError(res.error || 'Registrasi gagal.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Swiss Round Actions
  const handleGeneratePairing = async () => {
    if (!selectedTournamentId) return;
    setPairingLoading(true);
    try {
      const res = await generateRoundPairing(selectedTournamentId);
      if (res.ok) {
        alert(res.message || "Pairing ronde berhasil dibuat!");
        loadRoundsData();
      } else {
        alert("Gagal: " + res.error);
      }
    } finally {
      setPairingLoading(false);
    }
  };

  // TIMER RONDE HANDLERS
  const handleTimerAction = async (action: 'START' | 'PAUSE' | 'RESUME' | 'RESET') => {
    if (!selectedTournamentId || !activeRound?.id) return;
    setTimerLoading(true);
    if (action === 'START' || action === 'RESET') {
      alert5MinFiredRef.current = false;
      alertExpiredFiredRef.current = false;
    }
    try {
      const res = await updateRoundTimer(selectedTournamentId, activeRound.id, action, timerDurationInput);
      if (res.ok && res.data) {
        applyTimerServerData(res.data);
      } else {
        alert("Gagal mengontrol timer: " + res.error);
      }
    } finally {
      setTimerLoading(false);
    }
  };

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Organizer Submit Score
  const handleScoreSubmit = async (options: { revertAndRegenerate?: boolean; forceWithoutRevert?: boolean } = {}) => {
    if (!scoreModalMatch) return;
    try {
      const res = await submitMatchScore(scoreModalMatch.id, scoreP1Wins, scoreP2Wins, 0, options);
      
      if (!res.ok) {
        if (res.code === 'CONFIRM_REVERT_REQUIRED') {
          setScoreWarningSubsequent(true);
          return;
        }
        alert("Gagal: " + res.error);
        return;
      }

      setScoreModalMatch(null);
      setScoreWarningSubsequent(false);

      if (res.data?.auto_pairing?.auto_regenerated) {
        setAutoPairingNotification(res.message);
      } else {
        alert(res.message || "Skor berhasil disimpan!");
      }

      loadRoundsData(selectedRoundNum);
      loadStandings();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Player Direct Quick Score Input
  const handlePlayerQuickScore = async (matchId: string, p1Wins: number, p2Wins: number) => {
    try {
      const res = await submitMatchScore(matchId, p1Wins, p2Wins, 0);
      if (res.ok) {
        alert(res.message || "Hasil dilaporkan! Menunggu konfirmasi lawan.");
        loadMyMatches();
      } else {
        alert("Gagal: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleConfirmMatch = async (matchId: string) => {
    if (!confirm("Konfirmasi dan setujui skor pertandingan ini? Klasemen akan otomatis diperbarui.")) return;
    try {
      const res = await confirmMatchScore(matchId);
      if (res.ok) {
        alert(res.message || "Hasil pertandingan Terkonfirmasi!");
        loadMyMatches();
      } else {
        alert("Gagal: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalMatch) return;
    try {
      const res = await disputeMatchScore(disputeModalMatch.id, disputeReasonInput);
      if (res.ok) {
        alert(res.message || "Pertandingan dialihkan ke status Sengketa.");
        setDisputeModalMatch(null);
        setDisputeReasonInput('');
        loadMyMatches();
      } else {
        alert("Gagal: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleCompleteRoundConfirm = async () => {
    if (!activeRound || !selectedTournamentId) return;
    if (!confirm(`Konfirmasi: Selesaikan Ronde ${activeRound.round_number}? Semua pertandingan harus sudah Terkonfirmasi.`)) {
      return;
    }

    try {
      const res = await completeRound(selectedTournamentId, activeRound.id);
      if (res.ok) {
        alert(res.message);
        loadRoundsData();
        loadStandings();
      } else {
        alert("Gagal: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleOpenRevertModal = async (targetRound: number) => {
    if (!selectedTournamentId) return;
    setRevertTargetRound(targetRound);
    setShowRevertModal(true);
    setRevertLoading(true);
    try {
      const impactRes = await getRevertImpact(selectedTournamentId, targetRound);
      if (impactRes.ok) {
        setRevertImpact(impactRes.data);
      }
    } finally {
      setRevertLoading(false);
    }
  };

  const handleExecuteRevert = async () => {
    if (!selectedTournamentId || revertTargetRound === null) return;
    setRevertLoading(true);
    try {
      const res = await revertRound(selectedTournamentId, revertTargetRound);
      if (res.ok) {
        alert(res.message || `Berhasil revert ke Ronde ${revertTargetRound}.`);
        setShowRevertModal(false);
        setRevertImpact(null);
        setSelectedRoundNum(revertTargetRound);
        loadRoundsData(revertTargetRound);
        loadTournamentList();
      } else {
        alert("Gagal: " + res.error);
      }
    } finally {
      setRevertLoading(false);
    }
  };

  const handleSwapConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournamentId || !swapMatch1Id || !swapMatch2Id) return;
    try {
      const res = await swapPairing(selectedTournamentId, swapMatch1Id, swapMatch2Id);
      if (res.ok) {
        alert(res.message || "Pasangan berhasil ditukar!");
        setShowSwapModal(false);
        loadRoundsData(selectedRoundNum);
      } else {
        alert("Gagal: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // DECK MANAGEMENT HANDLERS
  const handleOpenDeckModal = async (participant: any) => {
    setSelectedParticipant(participant);
    setDeckNameInput(participant.deck_name || '');
    
    // Parse warna yang sudah ada
    let existingColors = ['Merah'];
    if (participant.deck_colors) {
      existingColors = participant.deck_colors.split(',').map((c: string) => c.trim()).filter(Boolean);
    }
    setSelectedDeckColors(existingColors.length > 0 ? existingColors : ['Merah']);
    setShowDeckModal(true);

    // Ambil riwayat deck pemain
    try {
      const res = await getPlayerDeckHistory(participant.user_id, participant.player_name);
      if (res.ok && res.data) {
        setPlayerDeckHistory(res.data);
      } else {
        setPlayerDeckHistory([]);
      }
    } catch (e) {
      setPlayerDeckHistory([]);
    }
  };

  const handleToggleColorChip = (colorName: string) => {
    if (selectedDeckColors.includes(colorName)) {
      if (selectedDeckColors.length === 1) {
        alert("Pilih minimal 1 warna deck!");
        return;
      }
      setSelectedDeckColors(selectedDeckColors.filter(c => c !== colorName));
    } else {
      setSelectedDeckColors([...selectedDeckColors, colorName]);
    }
  };

  const handleSelectHistoryDeck = (h: any) => {
    setDeckNameInput(h.deck_name);
    if (h.deck_colors) {
      const colors = h.deck_colors.split(',').map((c: string) => c.trim()).filter(Boolean);
      setSelectedDeckColors(colors.length > 0 ? colors : ['Merah']);
    }
  };

  const handleSaveDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournamentId || !selectedParticipant || !deckNameInput.trim()) return;
    if (selectedDeckColors.length === 0) {
      alert("Pilih minimal 1 warna deck!");
      return;
    }

    setDeckSaving(true);
    try {
      const res = await updateParticipantDeck(
        selectedTournamentId,
        selectedParticipant.id,
        deckNameInput.trim(),
        selectedDeckColors
      );
      if (res.ok) {
        alert(res.message || "Data deck berhasil disimpan!");
        setShowDeckModal(false);
        loadStandings();
      } else {
        alert("Gagal: " + res.error);
      }
    } finally {
      setDeckSaving(false);
    }
  };

  // EXPORT FINAL RESULTS HANDLERS
  const handleOpenExportModal = async () => {
    if (!selectedTournamentId) return;
    try {
      const res = await getTournamentFinalResults(selectedTournamentId);
      if (res.ok && res.data) {
        setExportData(res.data);
        setShowExportModal(true);
        setCopySuccess(false);
      } else {
        alert("Gagal memuat hasil akhir: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleCopyShareText = () => {
    if (!exportData?.shareable_text) return;
    navigator.clipboard.writeText(exportData.shareable_text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    });
  };

  const handleNativeShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share && exportData?.shareable_text) {
      navigator.share({
        title: `Hasil Akhir ${exportData.tournament?.name || 'DigiSwiss TCG'}`,
        text: exportData.shareable_text
      }).catch(() => {});
    } else {
      handleCopyShareText();
      alert("Teks hasil turnamen disalin ke clipboard!");
    }
  };

  const handleDownloadImage = () => {
    if (!exportData || !exportData.standings) return;
    const canvas = document.createElement('canvas');
    const width = 800;
    const rowHeight = 44;
    const headerHeight = 220;
    const height = headerHeight + (exportData.standings.length * rowHeight) + 80;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background Gradient Dark Cyber
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0b1329');
    grad.addColorStop(1, '#080d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Borders
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Title & Logo
    ctx.fillStyle = '#00e5ff';
    ctx.font = '900 28px sans-serif';
    ctx.fillText('DIGISWISS TCG - HASIL AKHIR', 40, 60);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 20px sans-serif';
    ctx.fillText(exportData.tournament?.name || 'Turnamen Digimon Card Game', 40, 95);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 14px sans-serif';
    ctx.fillText(`Format: ${exportData.tournament?.format || 'BO3'}  •  Tanggal: ${exportData.tournament?.date || '-'}  •  Lokasi: ${exportData.tournament?.location || 'Local Store'}`, 40, 125);

    // Podium Preview (Top 3 Medals)
    const top3 = exportData.topCut || [];
    let podiumY = 160;
    const medalColors = ['#f59e0b', '#cbd5e1', '#b45309'];
    const medalLabels = ['JUARA 1', 'JUARA 2', 'JUARA 3'];

    top3.slice(0, 3).forEach((p: any, idx: number) => {
      const cardX = 40 + (idx * 240);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cardX, podiumY, 230, 48);
      ctx.strokeStyle = medalColors[idx];
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX, podiumY, 230, 48);

      ctx.fillStyle = medalColors[idx];
      ctx.font = '900 12px sans-serif';
      ctx.fillText(`${idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉')} ${medalLabels[idx]}`, cardX + 10, podiumY + 20);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px sans-serif';
      ctx.fillText(p.player_name, cardX + 10, podiumY + 38);
    });

    // Table Header
    const tableY = 230;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, tableY, width - 80, 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('#', 55, tableY + 21);
    ctx.fillText('TAMER / PEMAIN', 95, tableY + 21);
    ctx.fillText('DECK ARCHETYPE & WARNA', 310, tableY + 21);
    ctx.fillText('POIN', 560, tableY + 21);
    ctx.fillText('W - L', 630, tableY + 21);
    ctx.fillText('OMW%', 710, tableY + 21);

    // Table Rows
    exportData.standings.forEach((st: any, i: number) => {
      const rowY = tableY + 35 + (i * rowHeight);
      ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#131f37';
      ctx.fillRect(40, rowY, width - 80, rowHeight - 4);

      // Rank
      ctx.fillStyle = i === 0 ? '#fbbf24' : (i === 1 ? '#e2e8f0' : (i === 2 ? '#d97706' : '#94a3b8'));
      ctx.font = '800 14px sans-serif';
      ctx.fillText(String(i + 1), 55, rowY + 25);

      // Player Name
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 14px sans-serif';
      ctx.fillText(st.player_name, 95, rowY + 25);

      // Deck Name & Colors
      ctx.fillStyle = '#38bdf8';
      ctx.font = '600 13px sans-serif';
      const deckText = st.deck_name ? `${st.deck_name} ${st.deck_colors ? `(${st.deck_colors})` : ''}` : '-';
      ctx.fillText(deckText.substring(0, 32), 310, rowY + 25);

      // Points
      ctx.fillStyle = '#34d399';
      ctx.font = '800 15px sans-serif';
      ctx.fillText(String(st.match_points), 570, rowY + 25);

      // W - L
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 13px sans-serif';
      ctx.fillText(`${st.matches_won} - ${st.matches_lost}`, 635, rowY + 25);

      // OMW%
      ctx.fillStyle = '#00e5ff';
      ctx.font = '700 13px monospace';
      ctx.fillText(`${parseFloat(st.omw_percentage || 0).toFixed(1)}%`, 710, rowY + 25);
    });

    // Footer Watermark
    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px sans-serif';
    ctx.fillText('Generated with DigiSwiss TCG • Swiss Round Tournament Manager', 40, height - 25);

    // Trigger Download
    const downloadLink = document.createElement('a');
    const safeName = (exportData.tournament?.name || 'Turnamen').replace(/[^a-zA-Z0-9]/g, '_');
    downloadLink.download = `DigiSwiss_${safeName}_Hasil.png`;
    downloadLink.href = canvas.toDataURL('image/png');
    downloadLink.click();
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    try {
      const res = await runPairingTests();
      if (res.ok && res.data) {
        setTestResults(res.data);
      }
    } finally {
      setRunningTests(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await updateProfile({ name: profileName, newPassword: profileNewPass || undefined });
      if (res.ok) {
        alert("Profil berhasil diperbarui!");
        setProfileNewPass('');
        if (currentUser) {
          setCurrentUser({ ...currentUser, name: profileName });
        }
      } else {
        alert("Gagal: " + res.error);
      }
    } finally {
      setProfileSaving(false);
    }
  };

  // Dynamic Navigation per Role (Player: Turnamen, Pertandingan Saya, Riwayat, Statistik, Profil; Organizer: Turnamen Saya, Ronde, Klasemen, Riwayat, Statistik; Admin: Pengguna, Turnamen, Statistik, Pengaturan)
  const getNavItems = () => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') {
      return [
        { id: 'pengguna', label: 'Pengguna', icon: '👥' },
        { id: 'turnamen', label: 'Turnamen', icon: '🏆' },
        { id: 'statistik', label: 'Statistik', icon: '📈' },
        { id: 'pengaturan', label: 'Pengaturan', icon: '⚙️' },
      ];
    }
    if (currentUser.role === 'organizer') {
      return [
        { id: 'turnamen_saya', label: 'Turnamen Saya', icon: '⚔️' },
        { id: 'ronde', label: 'Ronde', icon: '⚡' },
        { id: 'klasemen', label: 'Klasemen', icon: '📊' },
        { id: 'riwayat', label: 'Riwayat', icon: '📜' },
        { id: 'statistik', label: 'Statistik', icon: '📈' },
      ];
    }
    // Player
    return [
      { id: 'turnamen', label: 'Turnamen', icon: '🏆' },
      { id: 'pertandingan_saya', label: 'Pertandingan Saya', icon: '⚔️' },
      { id: 'riwayat', label: 'Riwayat', icon: '📜' },
      { id: 'statistik', label: 'Statistik', icon: '📈' },
      { id: 'pengaturan', label: 'Profil', icon: '👤' },
    ];
  };

  // 1. AUTH SCREEN JIKA BELUM LOGIN
  if (!currentUser) {
    return (
      <div className="flex flex-col h-screen bg-[#080d1a] text-slate-100 font-sans select-none overflow-y-auto">
        <header className="bg-[#0f172a] border-b border-[#1e293b] px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-[#00e5ff]">DIGISWISS TCG</h1>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ff6d00]/20 text-[#ff9100]">v7.0</span>
          </div>
          <span className="text-xs text-slate-400">{statusMessage}</span>
        </header>

        <main className="flex-1 flex flex-col justify-center px-4 py-6 max-w-md mx-auto w-full">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-6 shadow-2xl">
            <div className="text-center mb-5">
              <h2 className="text-xl font-black text-white">{authMode === 'login' ? 'Masuk ke DigiSwiss' : 'Daftar Akun Baru'}</h2>
              <p className="text-xs text-slate-400 mt-1">Sistem Turnamen Swiss Round Digimon TCG</p>
            </div>

            <div className="flex rounded-xl bg-[#080d1a] p-1 border border-[#1e293b] mb-4">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${authMode === 'login' ? 'bg-[#00e5ff] text-black' : 'text-slate-400'}`}>Masuk</button>
              <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${authMode === 'register' ? 'bg-[#ff6d00] text-white' : 'text-slate-400'}`}>Daftar</button>
            </div>

            {authError && <div className="p-3 mb-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-xs text-rose-300">⚠️ {authError}</div>}

            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 ml-1">Username</label>
                  <input type="text" placeholder="Masukkan username" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 ml-1">Password</label>
                  <input type="password" placeholder="Masukkan password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]" />
                </div>
                <button type="submit" disabled={authLoading} className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0077b6] hover:brightness-110 active:scale-[0.98] text-black font-black text-sm tracking-wide shadow-lg shadow-[#00e5ff]/20 transition-all flex items-center justify-center gap-2">
                  {authLoading ? 'Memverifikasi...' : 'MASUK'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 ml-1">Nama Tampilan</label>
                  <input type="text" placeholder="Nama lengkap atau panggilan" value={regName} onChange={e => setRegName(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 ml-1">Username Unik</label>
                  <input type="text" placeholder="Username tanpa spasi" value={regUsername} onChange={e => setRegUsername(e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 ml-1">Password</label>
                  <input type="password" placeholder="Minimal 6 karakter" value={regPassword} onChange={e => setRegPassword(e.target.value)} required minLength={6} className="w-full px-4 py-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]" />
                </div>
                <button type="submit" disabled={authLoading} className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-[#ff6d00] to-[#ff9100] hover:brightness-110 active:scale-[0.98] text-white font-black text-sm tracking-wide shadow-lg shadow-[#ff6d00]/20 transition-all flex items-center justify-center gap-2">
                  {authLoading ? 'Mendaftarkan...' : 'DAFTAR'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  // 2. MAIN APP
  const isOrganizerOrAdmin = currentUser.role === 'admin' || (selectedTournament && selectedTournament.organizer_id === currentUser.id);
  const is5MinWarning = displaySeconds <= 300 && displaySeconds > 0 && timerStatus === 'RUNNING';
  const isTimeExpired = displaySeconds === 0 && (timerStatus === 'EXPIRED' || timerStatus === 'RUNNING');

  return (
    <div className="flex flex-col h-screen bg-[#080d1a] text-slate-100 font-sans select-none overflow-hidden">
      
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-[#1e293b] px-4 py-2.5 flex items-center justify-between shadow-lg z-20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00e5ff] to-[#ff6d00] p-[2px]">
            <div className="w-full h-full bg-[#080d1a] rounded-[7px] flex items-center justify-center font-black text-[#00e5ff] text-sm">D</div>
          </div>
          <div>
            <h1 className="text-sm font-black text-white">DIGISWISS</h1>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{currentUser.name} ({currentUser.role})</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {currentUser.role === 'organizer' && (
            <button
              onClick={() => setActiveTab('audit_log')}
              className={`px-2 py-1 rounded-lg border text-xs font-bold transition-all ${
                activeTab === 'audit_log' ? 'bg-[#ff6d00]/20 text-[#ff9100] border-[#ff6d00]/40' : 'bg-[#1e293b] text-slate-300 border-[#334155]'
              }`}
              title="Log Audit Turnamen"
            >
              📜 Log
            </button>
          )}
          {currentUser.role === 'organizer' && (
            <button
              onClick={() => setActiveTab('pengaturan')}
              className={`p-1 px-2 rounded-lg border text-xs font-bold transition-all ${
                activeTab === 'pengaturan' ? 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40' : 'bg-[#1e293b] text-slate-300 border-[#334155]'
              }`}
              title="Profil & Pengaturan"
            >
              ⚙️
            </button>
          )}
          {currentUser.role === 'admin' && (
            <button
              onClick={() => setActiveTab('audit_log')}
              className={`px-2 py-1 rounded-lg border text-xs font-bold transition-all ${
                activeTab === 'audit_log' ? 'bg-[#ff6d00]/20 text-[#ff9100] border-[#ff6d00]/40' : 'bg-[#1e293b] text-slate-300 border-[#334155]'
              }`}
              title="Log Audit Sistem"
            >
              📜 Log
            </button>
          )}
          <button onClick={async () => { await logout(); setCurrentUser(null); }} className="px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-bold">
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-4">

        {/* NOTIFIKASI OTOMATIS: PAIRING RONDE BARU DIBUAT SETELAH KOREKSI SKOR */}
        {autoPairingNotification && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950 via-[#132c2a] to-emerald-900 border border-emerald-400 shadow-xl flex items-start justify-between gap-2 animate-bounce">
            <div className="flex items-start gap-2">
              <span className="text-xl">🎉</span>
              <div>
                <h4 className="font-black text-emerald-300 text-xs uppercase tracking-wide">Pairing Baru Berhasil Dibuat Otomatis!</h4>
                <p className="text-xs text-emerald-100 mt-0.5">{autoPairingNotification}</p>
              </div>
            </div>
            <button onClick={() => setAutoPairingNotification(null)} className="text-emerald-400 hover:text-white font-bold text-sm px-1">✕</button>
          </div>
        )}

        {/* ======================================================== */}
        {/* WIDGET TIMER RONDE BESAR & SINKRON SERVER                */}
        {/* Tampil di tab 'ronde' dan 'pertandingan_saya'             */}
        {/* ======================================================== */}
        {(activeTab === 'ronde' || activeTab === 'pertandingan_saya') && selectedTournament?.status === 'RUNNING' && activeRound && (
          <div className={`p-4 rounded-3xl border transition-all shadow-2xl ${
            isTimeExpired 
              ? 'bg-rose-950/80 border-rose-500 animate-pulse' 
              : (is5MinWarning 
                ? 'bg-amber-950/70 border-amber-500 animate-pulse' 
                : 'bg-gradient-to-br from-[#0f172a] to-[#131f37] border-[#1e293b]')
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>⏱️ TIMER RONDE {activeRound.round_number}</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00e5ff]/15 text-[#00e5ff] font-mono">Sync Server</span>
              </span>

              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                timerStatus === 'RUNNING' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' :
                (timerStatus === 'PAUSED' ? 'bg-amber-950 text-amber-300 border-amber-500/40' :
                (timerStatus === 'EXPIRED' ? 'bg-rose-950 text-rose-300 border-rose-500/60' : 'bg-slate-800 text-slate-400 border-slate-700'))
              }`}>
                {timerStatus === 'RUNNING' ? '● Berjalan' :
                 (timerStatus === 'PAUSED' ? '❚❚ Jeda' :
                 (timerStatus === 'EXPIRED' ? '🚨 WAKTU HABIS' : '⏹ Berhenti'))}
              </span>
            </div>

            {/* Countdown Besar */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className={`font-mono text-5xl font-black tracking-tight ${
                isTimeExpired ? 'text-rose-400' : (is5MinWarning ? 'text-amber-300' : 'text-[#00e5ff]')
              }`}>
                {formatTimerDisplay(displaySeconds)}
              </div>

              {is5MinWarning && (
                <div className="text-xs font-bold text-amber-300 mt-1 flex items-center gap-1">
                  <span>⚠️</span> Peringatan: Sisa waktu pertandingan kurang dari 5 menit!
                </div>
              )}

              {isTimeExpired && (
                <div className="text-xs font-black text-rose-300 mt-1 flex items-center gap-1">
                  <span>🚨</span> WAKTU RONDE HABIS (TIME)! Selesaikan giliran aktif.
                </div>
              )}
            </div>

            {/* Kontrol Timer untuk Organizer */}
            {isOrganizerOrAdmin && (
              <div className="mt-3 pt-3 border-t border-[#1e293b]/70 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-400">Durasi:</span>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={timerDurationInput}
                    onChange={e => setTimerDurationInput(parseInt(e.target.value, 10) || 45)}
                    className="w-16 px-2 py-1 rounded-lg bg-[#080d1a] border border-[#1e293b] text-center text-xs font-bold text-white outline-none"
                  />
                  <span className="text-[11px] text-slate-400">menit</span>
                </div>

                <div className="flex gap-1.5">
                  {timerStatus === 'STOPPED' && (
                    <button
                      onClick={() => handleTimerAction('START')}
                      disabled={timerLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-md active:scale-95"
                    >
                      ▶ Mulai Timer
                    </button>
                  )}

                  {timerStatus === 'RUNNING' && (
                    <>
                      <button
                        onClick={() => handleTimerAction('PAUSE')}
                        disabled={timerLoading}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md active:scale-95"
                      >
                        ❚❚ Jeda
                      </button>
                      <button
                        onClick={() => handleTimerAction('RESET')}
                        disabled={timerLoading}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs border border-slate-700"
                      >
                        ⏹ Reset
                      </button>
                    </>
                  )}

                  {timerStatus === 'PAUSED' && (
                    <>
                      <button
                        onClick={() => handleTimerAction('RESUME')}
                        disabled={timerLoading}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-md active:scale-95"
                      >
                        ▶ Lanjutkan
                      </button>
                      <button
                        onClick={() => handleTimerAction('RESET')}
                        disabled={timerLoading}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs border border-slate-700"
                      >
                        ⏹ Reset
                      </button>
                    </>
                  )}

                  {timerStatus === 'EXPIRED' && (
                    <button
                      onClick={() => handleTimerAction('RESET')}
                      disabled={timerLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-[#00e5ff] text-black font-black text-xs shadow-md active:scale-95"
                    >
                      🔄 Reset Timer Baru
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB PERTANDINGAN SAYA (PLAYER SELF-REPORT & CONFIRM)     */}
        {/* ======================================================== */}
        {activeTab === 'pertandingan_saya' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Pertandingan Saya</h2>
                <p className="text-xs text-slate-400">Input skor & konfirmasi hasil meja Anda</p>
              </div>

              {tournaments.length > 0 && (
                <select
                  value={selectedTournamentId || ''}
                  onChange={(e) => setSelectedTournamentId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#0f172a] border border-[#1e293b] text-xs text-[#00e5ff] font-bold outline-none"
                >
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                  ))}
                </select>
              )}
            </div>

            {myMatchesLoading && <div className="p-6 text-center text-xs text-slate-400">Memuat pertandingan Anda...</div>}

            {!myMatchesLoading && myMatchesData && (
              <div className="space-y-3">
                {myMatchesData.matches?.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-[#0f172a] border border-[#1e293b] text-center space-y-2">
                    <div className="text-3xl">🛡️</div>
                    <h4 className="font-bold text-white">Belum Ada Pertandingan</h4>
                    <p className="text-xs text-slate-400">Anda belum dipasangkan di turnamen ini atau turnamen belum dimulai.</p>
                  </div>
                ) : (
                  myMatchesData.matches.map((m: any) => {
                    const isBO1 = myMatchesData.format === 'BO1';
                    const isBye = m.opponent_id === 'BYE';
                    const isP1 = m.my_role === 'player1';

                    return (
                      <div key={m.id} className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3 shadow-xl">
                        <div className="flex justify-between items-center border-b border-[#1e293b] pb-2 text-xs">
                          <span className="font-black text-[#00e5ff]">RONDE {m.round_number} • MEJA #{m.table_number}</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            m.status === 'CONFIRMED' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' :
                            (m.status === 'WAITING_CONFIRMATION' ? 'bg-amber-950 text-amber-300 border-amber-500/40' :
                            (m.status === 'DISPUTED' ? 'bg-rose-950 text-rose-300 border-rose-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'))
                          }`}>
                            {m.status === 'CONFIRMED' ? '✓ Terkonfirmasi' :
                             (m.status === 'WAITING_CONFIRMATION' ? '⏳ Menunggu Konfirmasi' :
                             (m.status === 'DISPUTED' ? '⚠️ Sengketa' : 'Belum Diisi'))}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm py-1">
                          <div className="flex-1">
                            <span className="text-[10px] text-slate-400 block">Anda:</span>
                            <p className="font-extrabold text-white text-sm">{m.my_name}</p>
                          </div>

                          <div className="px-3 py-1 bg-[#080d1a] border border-[#1e293b] rounded-xl font-mono font-bold text-sm text-center min-w-[70px]">
                            {m.status === 'CONFIRMED' || m.status === 'WAITING_CONFIRMATION' ? `${m.my_wins} - ${m.opp_wins}` : 'VS'}
                          </div>

                          <div className="flex-1 text-right">
                            <span className="text-[10px] text-slate-400 block">Lawan:</span>
                            <p className={`font-extrabold text-sm ${isBye ? 'text-amber-400 italic' : 'text-white'}`}>
                              {m.opponent_name}
                            </p>
                          </div>
                        </div>

                        {m.status === 'DISPUTED' && (
                          <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200">
                            <strong>⚠️ Sengketa Diajukan:</strong> {m.dispute_reason || 'Lawan tidak menyetujui skor. Menunggu keputusan Organizer.'}
                          </div>
                        )}

                        {m.can_confirm && (
                          <div className="p-3 rounded-xl bg-[#131f37] border border-[#00e5ff]/30 space-y-2">
                            <p className="text-xs text-slate-200 font-semibold">
                              👉 Lawan Anda melaporkan skor: <strong>{m.opp_wins} - {m.my_wins}</strong>. Apakah Anda menyetujuinya?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleConfirmMatch(m.id)}
                                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-xs shadow-md active:scale-95"
                              >
                                ✓ Setujui (Konfirmasi)
                              </button>
                              <button
                                onClick={() => {
                                  setDisputeModalMatch(m);
                                  setDisputeReasonInput('');
                                }}
                                className="py-2.5 px-4 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs"
                              >
                                ✕ Tolak (Sengketa)
                              </button>
                            </div>
                          </div>
                        )}

                        {m.status === 'WAITING_CONFIRMATION' && m.is_reporter && (
                          <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/30 text-xs text-amber-200 text-center">
                            ⏳ Anda telah melaporkan skor ({m.my_wins} - {m.opp_wins}). Menunggu lawan mengonfirmasi.
                          </div>
                        )}

                        {m.can_submit && !isBye && (
                          <div className="pt-2 border-t border-[#1e293b] space-y-2">
                            <span className="text-[11px] font-bold text-slate-400 block uppercase">
                              Pilih Hasil Pertandingan Anda:
                            </span>

                            {isBO1 ? (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handlePlayerQuickScore(m.id, isP1 ? 1 : 0, isP1 ? 0 : 1)}
                                  className="py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-md active:scale-95"
                                >
                                  🏆 MENANG 1 - 0 (3 Poin)
                                </button>
                                <button
                                  onClick={() => handlePlayerQuickScore(m.id, isP1 ? 0 : 1, isP1 ? 1 : 0)}
                                  className="py-3.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-bold text-xs border border-[#334155] active:scale-95"
                                >
                                  💀 KALAH 0 - 1 (0 Poin)
                                </button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handlePlayerQuickScore(m.id, isP1 ? 2 : 0, isP1 ? 0 : 2)}
                                  className="py-3 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0077b6] text-black font-black text-xs shadow-md active:scale-95"
                                >
                                  🏆 MENANG 2 - 0 (3 Poin)
                                </button>
                                <button
                                  onClick={() => handlePlayerQuickScore(m.id, isP1 ? 2 : 1, isP1 ? 1 : 2)}
                                  className="py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-md active:scale-95"
                                >
                                  ⚔️ MENANG 2 - 1 (2 Poin)
                                </button>
                                <button
                                  onClick={() => handlePlayerQuickScore(m.id, isP1 ? 1 : 2, isP1 ? 2 : 1)}
                                  className="py-3 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-amber-300 font-bold text-xs border border-amber-500/30 active:scale-95"
                                >
                                  🛡️ KALAH 1 - 2 (1 Poin)
                                </button>
                                <button
                                  onClick={() => handlePlayerQuickScore(m.id, isP1 ? 0 : 2, isP1 ? 2 : 0)}
                                  className="py-3 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-400 font-bold text-xs border border-[#334155] active:scale-95"
                                >
                                  💀 KALAH 0 - 2 (0 Poin)
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB RONDE & PAIRING SWISS (ORGANIZER / ADMIN)             */}
        {/* ======================================================== */}
        {activeTab === 'ronde' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Selector Turnamen */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Meja & Pairing Swiss</h2>
                <p className="text-xs text-slate-400">
                  {selectedTournament ? selectedTournament.name : 'Pilih Turnamen'}
                </p>
              </div>

              {tournaments.length > 1 && (
                <select
                  value={selectedTournamentId || ''}
                  onChange={(e) => {
                    setSelectedTournamentId(e.target.value);
                    setSelectedRoundNum(null);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[#0f172a] border border-[#1e293b] text-xs text-[#00e5ff] font-bold outline-none"
                >
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Selector Ronde Tabs jika sudah ada beberapa ronde */}
            {availableRounds.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Ronde:</span>
                {availableRounds.map(rNum => (
                  <button
                    key={rNum}
                    onClick={() => {
                      setSelectedRoundNum(rNum);
                      loadRoundsData(rNum);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                      selectedRoundNum === rNum
                        ? 'bg-[#00e5ff] text-black shadow-md'
                        : 'bg-[#0f172a] text-slate-400 border border-[#1e293b] hover:text-white'
                    }`}
                  >
                    Ronde {rNum}
                  </button>
                ))}
              </div>
            )}

            {/* Status Ronde Banner */}
            {selectedTournament && (
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#131f37] to-[#0f172a] border border-[#1e293b] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30">
                      Format: {selectedTournament.format}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-1">
                      {activeRound ? `Ronde ${activeRound.round_number} dari ${selectedTournament.total_rounds}` : 'Belum Ada Ronde Aktif'}
                    </h3>
                  </div>

                  <span className={`text-xs font-black px-2.5 py-1 rounded-lg border uppercase ${
                    activeRound?.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' : 'bg-amber-950 text-amber-300 border-amber-500/40'
                  }`}>
                    {activeRound?.status === 'COMPLETED' ? 'Ronde Selesai' : (activeRound ? 'Pertandingan Berjalan' : 'Siap')}
                  </span>
                </div>

                {/* Organizer Controls */}
                {isOrganizerOrAdmin && (
                  <div className="pt-2 border-t border-[#1e293b] flex flex-wrap gap-2">
                    {(!activeRound || activeRound.status === 'COMPLETED') && selectedTournament.status !== 'FINISHED' && (
                      <button
                        onClick={handleGeneratePairing}
                        disabled={pairingLoading}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#ff6d00] to-[#ff9100] text-white font-black text-xs shadow-md active:scale-95"
                      >
                        {pairingLoading ? 'Menyusun Pairing...' : `⚡ BUAT PAIRING RONDE ${(activeRound ? parseInt(activeRound.round_number, 10) + 1 : 1)}`}
                      </button>
                    )}

                    {activeRound && activeRound.status === 'ACTIVE' && (
                      <button
                        onClick={handleCompleteRoundConfirm}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs shadow-md active:scale-95"
                      >
                        ✓ SELESAIKAN RONDE & HITUNG POIN
                      </button>
                    )}

                    {activeRound && activeRound.status === 'ACTIVE' && roundMatches.length >= 2 && (
                      <button
                        onClick={() => setShowSwapModal(true)}
                        className="py-3 px-3 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-300 text-xs font-bold border border-[#334155]"
                      >
                        ⇄ Tukar Meja Manual
                      </button>
                    )}

                    {activeRound && (
                      <button
                        onClick={() => handleOpenRevertModal(parseInt(activeRound.round_number, 10))}
                        className="w-full py-2 px-3 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/50 text-amber-300 text-xs font-extrabold flex items-center justify-center gap-2"
                      >
                        <span>↺</span>
                        <span>Revert ke Ronde {activeRound.round_number}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Daftar Meja Pertandingan */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Daftar Meja Pertandingan ({roundMatches.length} Meja)
                </h3>
                {matchesLoading && <span className="text-[10px] text-slate-400">Memuat meja...</span>}
              </div>

              {roundMatches.map(m => {
                const isBye = m.player2_id === 'BYE';
                const isConfirmed = m.status === 'CONFIRMED';
                const isDisputed = m.status === 'DISPUTED';

                return (
                  <div key={m.id} className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-2.5 shadow-md">
                    <div className="flex justify-between items-center border-b border-[#1e293b] pb-1.5 text-xs">
                      <span className="font-black text-[#00e5ff]">MEJA #{m.table_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isConfirmed ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30' :
                        (isDisputed ? 'bg-rose-950 text-rose-300 border-rose-500/40' :
                        (m.status === 'WAITING_CONFIRMATION' ? 'bg-amber-950 text-amber-300 border-amber-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'))
                      }`}>
                        {isConfirmed ? '✓ Selesai' : (isDisputed ? '⚠️ Sengketa' : (m.status === 'WAITING_CONFIRMATION' ? 'Menunggu Konfirmasi' : 'Belum Diisi'))}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm py-1">
                      <div className="flex-1">
                        <p className="font-bold text-white text-xs">{m.player1_name}</p>
                      </div>

                      <div className="px-3 py-1 bg-[#080d1a] border border-[#1e293b] rounded-lg font-mono font-bold text-xs text-center min-w-[60px]">
                        {isConfirmed || m.status === 'WAITING_CONFIRMATION' ? `${m.player1_wins} - ${m.player2_wins}` : 'vs'}
                      </div>

                      <div className="flex-1 text-right">
                        <p className={`font-bold text-xs ${isBye ? 'text-amber-400 italic' : 'text-white'}`}>
                          {m.player2_name}
                        </p>
                      </div>
                    </div>

                    {isDisputed && (
                      <div className="text-[11px] p-2 rounded bg-rose-950/60 border border-rose-500/30 text-rose-200">
                        Alasan Sengketa: {m.dispute_reason || 'Lawan menolak skor'}
                      </div>
                    )}

                    {/* Organizer Input/Overwrite Score Button */}
                    {isOrganizerOrAdmin && !isBye && (
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => {
                            setScoreModalMatch(m);
                            setScoreP1Wins(parseInt(m.player1_wins, 10) || (selectedTournament?.format === 'BO1' ? 1 : 2));
                            setScoreP2Wins(parseInt(m.player2_wins, 10) || 0);
                            setScoreWarningSubsequent(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00e5ff] to-[#0077b6] text-black font-extrabold text-[11px] shadow-sm active:scale-95"
                        >
                          {isConfirmed ? '✏️ Koreksi / Ubah Skor' : '🎮 Input Skor Organizer'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Unit Test Runner Suite */}
            <div className="p-4 rounded-2xl bg-[#080d1a] border border-[#1e293b] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#00e5ff] uppercase">🧪 Tes Algoritma & Poin:</span>
                <button
                  onClick={handleRunTests}
                  disabled={runningTests}
                  className="px-3 py-1 rounded-lg bg-[#1e293b] text-xs font-bold text-slate-200"
                >
                  {runningTests ? 'Menguji...' : 'Jalankan Tes Otomatis'}
                </button>
              </div>

              {testResults && (
                <div className="space-y-1 pt-1">
                  {testResults.map((t, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-[#0f172a] border border-[#1e293b] text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white block">{t.name}</span>
                        <span className={t.passed ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                          {t.passed ? '✓ LULUS' : '✕ GAGAL'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{t.details || t.error || ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB KLASEMEN (STANDINGS + DECK PESERTA + EKSPOR HASIL)   */}
        {/* ======================================================== */}
        {activeTab === 'klasemen' && (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white">Klasemen Turnamen</h2>
                <p className="text-xs text-slate-400">Peringkat resmi tie-breaker: OMW% → GW% → OGW% → H2H</p>
              </div>

              {tournaments.length > 0 && (
                <select
                  value={selectedTournamentId || ''}
                  onChange={(e) => setSelectedTournamentId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#0f172a] border border-[#1e293b] text-xs text-[#00e5ff] font-bold outline-none"
                >
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Tombol Ekspor & Bagikan Hasil Akhir */}
            <div className="flex gap-2">
              <button
                onClick={handleOpenExportModal}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#00e5ff] to-[#0077b6] text-black font-black text-xs shadow-xl flex items-center justify-center gap-2 active:scale-95"
              >
                <span>📤</span>
                <span>Ekspor & Bagikan Hasil Akhir</span>
              </button>
            </div>

            {standingsLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Memuat klasemen...</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#1e293b] bg-[#0f172a] shadow-xl">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead className="bg-[#131f37] text-slate-400 font-bold uppercase text-[10px] border-b border-[#1e293b]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Pemain & Deck</th>
                      <th className="py-2.5 px-2 text-center text-emerald-400">Poin</th>
                      <th className="py-2.5 px-2 text-center">W - L</th>
                      <th className="py-2.5 px-2 text-center">GW - GL</th>
                      <th className="py-2.5 px-2 text-right text-[#00e5ff]">OMW%</th>
                      <th className="py-2.5 px-2 text-right">GW%</th>
                      <th className="py-2.5 px-3 text-right">OGW%</th>
                      {isOrganizerOrAdmin && <th className="py-2.5 px-2 text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b] text-slate-200">
                    {standingsList.map((p, idx) => {
                      const rank = idx + 1;
                      const isTop1 = rank === 1;
                      const isTop2 = rank === 2;
                      const isTop3 = rank === 3;
                      const colors = p.deck_colors ? p.deck_colors.split(',').map((c: string) => c.trim()).filter(Boolean) : [];

                      return (
                        <tr key={p.id} className={isTop1 ? 'bg-amber-500/10' : (isTop2 ? 'bg-slate-300/10' : (isTop3 ? 'bg-amber-800/10' : ''))}>
                          <td className="py-2.5 px-3 font-black">
                            {isTop1 ? <span className="text-amber-400 font-black">🥇 1</span> :
                             (isTop2 ? <span className="text-slate-300 font-black">🥈 2</span> :
                             (isTop3 ? <span className="text-amber-600 font-black">🥉 3</span> : <span className="text-slate-400">{rank}</span>))}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{p.player_name}</span>
                              {p.status === 'DROPPED' && <span className="text-[9px] bg-rose-950 text-rose-300 px-1 py-0.2 rounded">DROP</span>}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-normal">{p.deck_name || 'Belum ada deck'}</span>
                              {colors.map((cName: string, cIdx: number) => {
                                const cConfig = AVAILABLE_DECK_COLORS.find(c => c.name === cName);
                                return (
                                  <span key={cIdx} className={`text-[9px] px-1 py-0.2 rounded border font-bold ${cConfig ? `${cConfig.bg} ${cConfig.text} ${cConfig.border}` : 'bg-slate-800 text-slate-300'}`}>
                                    {cName}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-black text-emerald-400 text-sm">{p.match_points}</td>
                          <td className="py-2.5 px-2 text-center text-slate-300">{p.matches_won} - {p.matches_lost}</td>
                          <td className="py-2.5 px-2 text-center text-slate-400">{p.games_won} - {p.games_lost}</td>
                          <td className="py-2.5 px-2 text-right font-mono text-[#00e5ff] font-bold">{parseFloat(p.omw_percentage || 0).toFixed(1)}%</td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-300">{parseFloat(p.gw_percentage || 0).toFixed(1)}%</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">{parseFloat(p.ogw_percentage || 0).toFixed(1)}%</td>
                          {isOrganizerOrAdmin && (
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => handleOpenDeckModal(p)}
                                className="px-2 py-1 rounded-lg bg-[#1e293b] hover:bg-[#334155] text-amber-300 text-[10px] font-bold border border-amber-500/30"
                              >
                                🎴 Deck
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB LOG AUDIT (ORGANIZER & ADMIN)                         */}
        {/* ======================================================== */}
        {activeTab === 'audit_log' && (
          <div className="space-y-3 animate-fadeIn">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white">Log Audit Sistem</h2>
                <p className="text-xs text-slate-400">
                  {currentUser.role === 'admin' ? 'Seluruh riwayat aksi di semua turnamen' : 'Riwayat perubahan turnamen Anda'}
                </p>
              </div>

              <button
                onClick={loadAuditLogs}
                disabled={auditLoading}
                className="px-2.5 py-1.5 rounded-xl bg-[#0f172a] border border-[#1e293b] text-xs text-[#00e5ff] font-bold"
              >
                {auditLoading ? 'Memuat...' : '🔄 Refresh'}
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
              {['ALL', 'CORRECT_SCORE', 'REVERT_ROUND', 'AUTO_REGENERATE_PAIRING', 'UPDATE_ROUND_TIMER', 'UPDATE_PARTICIPANT_DECK', 'COMPLETE_ROUND', 'SWAP_PAIRING'].map(actionKey => (
                <button
                  key={actionKey}
                  onClick={() => setAuditActionFilter(actionKey)}
                  className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap ${
                    auditActionFilter === actionKey ? 'bg-[#00e5ff] text-black' : 'bg-[#0f172a] text-slate-400 border border-[#1e293b]'
                  }`}
                >
                  {actionKey === 'ALL' ? 'Semua Aksi' : actionKey}
                </button>
              ))}
            </div>

            {auditLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Memuat riwayat log...</div>
            ) : (
              <div className="space-y-2">
                {auditLogs
                  .filter(l => auditActionFilter === 'ALL' || l.action === auditActionFilter)
                  .map(log => {
                    const isRevert = log.action === 'REVERT_ROUND';
                    const isCorrection = log.action === 'CORRECT_SCORE';
                    const isAutoPair = log.action === 'AUTO_REGENERATE_PAIRING';
                    const isTimer = log.action === 'UPDATE_ROUND_TIMER';
                    const isDeck = log.action === 'UPDATE_PARTICIPANT_DECK';

                    return (
                      <div key={log.id} className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-2 shadow-md">
                        <div className="flex justify-between items-center text-xs">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] uppercase border ${
                            isRevert ? 'bg-amber-950 text-amber-300 border-amber-500/40' :
                            (isCorrection ? 'bg-blue-950 text-cyan-300 border-cyan-500/40' :
                            (isAutoPair ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' :
                            (isTimer ? 'bg-indigo-950 text-indigo-300 border-indigo-500/40' :
                            (isDeck ? 'bg-purple-950 text-purple-300 border-purple-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'))))
                          }`}>
                            {log.action}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-'}
                          </span>
                        </div>

                        <div className="text-xs">
                          <p className="font-bold text-white">
                            Oleh: <span className="text-[#00e5ff]">{log.username || log.user_id}</span>
                            {log.tournament_name && <span className="text-slate-400 font-normal"> • Turnamen: {log.tournament_name}</span>}
                          </p>
                          <p className="text-slate-300 mt-1">{log.details}</p>
                        </div>

                        {(log.old_value || log.new_value) && (
                          <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-[11px] grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-slate-500 block text-[9px] uppercase font-bold">Nilai Lama:</span>
                              <span className="text-rose-400 font-mono font-semibold">{log.old_value || '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[9px] uppercase font-bold">Nilai Baru:</span>
                              <span className="text-emerald-400 font-mono font-semibold">{log.new_value || '-'}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* TAB TURNAMEN (LIST) */}
        {(activeTab === 'turnamen' || activeTab === 'turnamen_saya') && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-white">Daftar Turnamen</h2>
              {(currentUser.role === 'admin' || currentUser.role === 'organizer') && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#ff6d00] to-[#ff9100] text-white font-bold text-xs shadow-md"
                >
                  + Buat Turnamen
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {tournaments.map(t => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTournamentId(t.id);
                    setActiveTab(currentUser.role === 'player' ? 'pertandingan_saya' : 'ronde');
                  }}
                  className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] hover:border-[#00e5ff]/50 cursor-pointer space-y-2 shadow-lg"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm text-white">{t.name}</h3>
                      <p className="text-xs text-slate-400">Format: {t.format} • {t.participant_count} Peserta</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 uppercase">
                      {t.status === 'RUNNING' ? `Ronde ${t.current_round}` : t.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#1e293b] text-xs">
                    <span className="text-slate-400 text-[11px]">Penyelenggara: {t.organizer_name}</span>
                    <span className="text-[#00e5ff] font-bold text-[11px]">Buka Detail →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB PENGGUNA (ADMIN) */}
        {activeTab === 'pengguna' && currentUser.role === 'admin' && (
          <div className="space-y-3 animate-fadeIn">
            <h2 className="text-base font-bold text-white">Daftar Pengguna Sistem</h2>
            <div className="space-y-2">
              {adminUsers.map(u => (
                <div key={u.id} className="p-3.5 rounded-xl bg-[#0f172a] border border-[#1e293b] flex justify-between items-center">
                  <div>
                    <p className="font-bold text-white text-xs">{u.name} (@{u.username})</p>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">Role: {u.role}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        const newR = u.role === 'player' ? 'organizer' : (u.role === 'organizer' ? 'admin' : 'player');
                        await adminUpdateRole(u.id, newR);
                        loadAdminUsers();
                      }}
                      className="px-2 py-1 rounded bg-[#1e293b] text-[10px] font-bold text-[#00e5ff]"
                    >
                      Ubah Role
                    </button>
                    <button
                      onClick={async () => {
                        await adminToggleUserStatus(u.id, u.status === 'active' ? 'inactive' : 'active');
                        loadAdminUsers();
                      }}
                      className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${u.status === 'active' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}
                    >
                      {u.status}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB PENGATURAN / PROFIL */}
        {activeTab === 'pengaturan' && (
          <div className="space-y-4 animate-fadeIn">
            <h2 className="text-base font-bold text-white">Pengaturan & Profil</h2>

            <form onSubmit={handleSaveProfile} className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
              <h3 className="text-sm font-bold text-white">Profil Akun Anda</h3>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Nama Tampilan</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Ganti Password (Opsional)</label>
                <input
                  type="password"
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  value={profileNewPass}
                  onChange={e => setProfileNewPass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={profileSaving}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0077b6] text-black font-extrabold text-xs shadow-md"
              >
                {profileSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </form>

            <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
              <h3 className="text-sm font-bold text-white">Koneksi Google Apps Script</h3>
              <p className="text-xs text-slate-400">URL Web App Google Apps Script tempat database spreadsheet disimpan.</p>
              <input
                type="text"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white font-mono outline-none"
              />
              <button
                onClick={() => {
                  setApiUrl(inputUrl);
                  alert("URL Apps Script disimpan!");
                  initApp();
                }}
                className="py-2 px-4 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs font-bold border border-[#334155]"
              >
                Simpan & Tes Koneksi
              </button>
            </div>
          </div>
        )}

        {/* TAB RIWAYAT */}
        {activeTab === 'riwayat' && (
          <HistoryView
            currentUser={currentUser}
            onOpenTournamentDetails={(tId) => {
              setSelectedTournamentId(tId);
              setActiveTab('turnamen');
            }}
          />
        )}

        {/* TAB STATISTIK */}
        {activeTab === 'statistik' && (
          <StatsView currentUser={currentUser} />
        )}

      </main>

      {/* Navigasi Bawah Responsif */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0b111e]/95 backdrop-blur-md border-t border-[#1e293b] px-2 py-2 flex justify-around items-center z-30 shadow-xl flex-shrink-0">
        {getNavItems().map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
              activeTab === item.id ? 'text-[#00e5ff] font-bold' : 'text-slate-400'
            }`}
          >
            <div className={`p-1 rounded-lg text-lg ${activeTab === item.id ? 'bg-[#00e5ff]/15' : ''}`}>
              {item.icon}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* MODAL KELOLA DECK PESERTA & CHIP WARNA (PASCA TURNAMEN) */}
      {showDeckModal && selectedParticipant && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveDeck} className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-bold text-base text-white">Data Deck Peserta</h3>
              <button type="button" onClick={() => setShowDeckModal(false)} className="text-slate-400">✕</button>
            </div>

            <div className="p-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Peserta:</span>
              <p className="font-bold text-white text-sm">{selectedParticipant.player_name}</p>
            </div>

            {/* Riwayat Deck Pemain dari DeckHistory */}
            {playerDeckHistory.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Pilih dari Riwayat Deck Pemain:
                </label>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {playerDeckHistory.map((h, hIdx) => (
                    <button
                      key={hIdx}
                      type="button"
                      onClick={() => handleSelectHistoryDeck(h)}
                      className="w-full p-2 text-left rounded-xl bg-[#080d1a] hover:bg-[#1e293b] border border-[#1e293b] text-xs flex justify-between items-center"
                    >
                      <span className="font-bold text-white">{h.deck_name}</span>
                      <span className="text-[10px] text-amber-300 font-mono">{h.deck_colors || 'Default'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Nama Deck */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Nama Archetype / Deck:</label>
              <input
                type="text"
                required
                placeholder="Contoh: Red Hybrid, MirageGaogamon, BloomLord"
                value={deckNameInput}
                onChange={e => setDeckNameInput(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none"
              />
            </div>

            {/* Chip Toggle Warna Deck (Minimal 1 Warna) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                Warna Deck (Pilih Minimal 1 Warna):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_DECK_COLORS.map(c => {
                  const isSelected = selectedDeckColors.includes(c.name);
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => handleToggleColorChip(c.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        isSelected 
                          ? `${c.bg} ${c.text} ${c.border} ring-2 ring-white/20` 
                          : 'bg-[#080d1a] text-slate-400 border-[#1e293b] hover:border-slate-600'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.hex }}></span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={deckSaving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#ff6d00] to-[#ff9100] text-white font-black text-xs shadow-md active:scale-95"
            >
              {deckSaving ? 'Menyimpan...' : '💾 SIMPAN DECK KE RIWAYAT'}
            </button>
          </form>
        </div>
      )}

      {/* MODAL EKSPOR & BAGIKAN HASIL AKHIR */}
      {showExportModal && exportData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-5 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-black text-base text-white flex items-center gap-2">
                <span>🏆</span> Ekspor Hasil Akhir Turnamen
              </h3>
              <button type="button" onClick={() => setShowExportModal(false)} className="text-slate-400">✕</button>
            </div>

            {/* Podium Preview */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {exportData.topCut?.slice(0, 3).map((p: any, idx: number) => {
                const medalBg = idx === 0 ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' :
                               (idx === 1 ? 'bg-slate-300/20 border-slate-300/50 text-slate-200' : 'bg-amber-800/20 border-amber-800/50 text-amber-500');
                const medalEmoji = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');

                return (
                  <div key={p.id} className={`p-2.5 rounded-2xl border ${medalBg} space-y-1`}>
                    <span className="text-xl">{medalEmoji}</span>
                    <p className="font-black text-white text-xs truncate">{p.player_name}</p>
                    <p className="text-[10px] text-slate-300 font-semibold truncate">{p.deck_name || 'Custom Deck'}</p>
                    <p className="text-[10px] font-mono font-bold text-emerald-400">{p.match_points} Poin</p>
                  </div>
                );
              })}
            </div>

            {/* Tombol Aksi Ekspor */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadImage}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#0077b6] text-black font-black text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95"
              >
                <span>🖼️</span>
                <span>Unduh Gambar Hasil Akhir (PNG)</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyShareText}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-200 font-bold text-xs border border-[#334155] flex items-center justify-center gap-1.5"
                >
                  <span>📋</span>
                  <span>{copySuccess ? '✓ Tersalin!' : 'Salin Teks Ringkasan'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>📱</span>
                  <span>Bagikan ke WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Pratinjau Teks Ringkasan */}
            <div>
              <span className="block text-[11px] font-bold text-slate-400 mb-1">Pratinjau Teks:</span>
              <pre className="p-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-[11px] font-mono text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {exportData.shareable_text}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REVERT KE RONDE X */}
      {showRevertModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-amber-500/50 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-black text-base text-amber-400 flex items-center gap-2">
                <span>⚠️</span> Revert ke Ronde {revertTargetRound}
              </h3>
              <button type="button" onClick={() => setShowRevertModal(false)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-2.5 text-xs">
              <p className="text-slate-200 font-semibold leading-relaxed">
                Anda akan merevert turnamen kembali ke status <strong>Ronde {revertTargetRound}</strong>.
              </p>

              <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 space-y-1.5 text-amber-200">
                <span className="font-black block uppercase text-[10px] tracking-wider">Daftar Dampak Revert:</span>
                {revertLoading ? (
                  <p className="text-[11px] text-slate-400">Menganalisis dampak revert...</p>
                ) : (
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    <li>
                      Ronde yang akan diarsipkan: <strong>{revertImpact?.roundsToArchive?.length > 0 ? `Ronde ${revertImpact.roundsToArchive.join(', ')}` : 'Tidak ada ronde lanjutan'}</strong>
                    </li>
                    <li>
                      Pertandingan diarsipkan: <strong>{revertImpact?.matchesToArchiveCount || 0} meja</strong>
                    </li>
                    <li>Status turnamen akan kembali menjadi <strong>'Berjalan' (RUNNING)</strong></li>
                    <li>Riwayat lawan dan poin akan dihitung murni dari <strong>Ronde 1 s/d {revertTargetRound}</strong></li>
                  </ul>
                )}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowRevertModal(false)}
                className="flex-1 py-3 rounded-xl bg-[#1e293b] text-slate-300 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={revertLoading}
                onClick={handleExecuteRevert}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-[#ff6d00] text-white text-xs font-black shadow-lg"
              >
                {revertLoading ? 'Memproses...' : `Ya, Revert ke R${revertTargetRound}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INPUT / KOREKSI SKOR ORGANIZER */}
      {scoreModalMatch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-bold text-base text-white">Koreksi Skor Organizer</h3>
              <button type="button" onClick={() => setScoreModalMatch(null)} className="text-slate-400">✕</button>
            </div>

            <div className="p-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs flex justify-between">
              <span className="font-bold text-white">{scoreModalMatch.player1_name}</span>
              <span className="text-slate-500 font-bold">VS</span>
              <span className="font-bold text-white">{scoreModalMatch.player2_name}</span>
            </div>

            {selectedTournament?.format === 'BO1' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setScoreP1Wins(1); setScoreP2Wins(0); }}
                  className={`py-3 rounded-xl text-xs font-black border ${scoreP1Wins === 1 ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-[#080d1a] text-slate-300 border-[#1e293b]'}`}
                >
                  Menang P1 (1 - 0)
                </button>
                <button
                  type="button"
                  onClick={() => { setScoreP1Wins(0); setScoreP2Wins(1); }}
                  className={`py-3 rounded-xl text-xs font-black border ${scoreP2Wins === 1 ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-[#080d1a] text-slate-300 border-[#1e293b]'}`}
                >
                  Menang P2 (0 - 1)
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setScoreP1Wins(2); setScoreP2Wins(0); }}
                  className={`py-2.5 rounded-xl text-xs font-black border ${scoreP1Wins === 2 && scoreP2Wins === 0 ? 'bg-[#00e5ff] text-black border-[#00e5ff]' : 'bg-[#080d1a] text-slate-300 border-[#1e293b]'}`}
                >
                  2 - 0 (P1 Menang)
                </button>
                <button
                  type="button"
                  onClick={() => { setScoreP1Wins(2); setScoreP2Wins(1); }}
                  className={`py-2.5 rounded-xl text-xs font-black border ${scoreP1Wins === 2 && scoreP2Wins === 1 ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-[#080d1a] text-slate-300 border-[#1e293b]'}`}
                >
                  2 - 1 (P1 Menang)
                </button>
                <button
                  type="button"
                  onClick={() => { setScoreP1Wins(1); setScoreP2Wins(2); }}
                  className={`py-2.5 rounded-xl text-xs font-black border ${scoreP1Wins === 1 && scoreP2Wins === 2 ? 'bg-amber-600 text-white border-amber-400' : 'bg-[#080d1a] text-slate-300 border-[#1e293b]'}`}
                >
                  1 - 2 (P2 Menang)
                </button>
                <button
                  type="button"
                  onClick={() => { setScoreP1Wins(0); setScoreP2Wins(2); }}
                  className={`py-2.5 rounded-xl text-xs font-black border ${scoreP1Wins === 0 && scoreP2Wins === 2 ? 'bg-rose-600 text-white border-rose-400' : 'bg-[#080d1a] text-slate-300 border-[#1e293b]'}`}
                >
                  0 - 2 (P2 Menang)
                </button>
              </div>
            )}

            {scoreWarningSubsequent && (
              <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/50 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <span>⚠️</span>
                  <span>Ronde Lanjutan Sudah Berjalan!</span>
                </div>
                <p className="text-amber-100 text-[11px] leading-relaxed">
                  Ronde ini sudah selesai dan ronde setelahnya sudah dibuat. Silakan pilih opsi tindakan di bawah:
                </p>
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleScoreSubmit({ revertAndRegenerate: true })}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-[#ff6d00] text-white font-black text-xs shadow-md"
                  >
                    🔄 Revert & Buat Ulang Pairing Otomatis
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScoreSubmit({ forceWithoutRevert: true })}
                    className="w-full py-2 px-3 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-bold text-[11px] border border-[#334155]"
                  >
                    ⚡ Koreksi Skor Saja (Pairing Berikutnya Tetap)
                  </button>
                </div>
              </div>
            )}

            {!scoreWarningSubsequent && (
              <button
                type="button"
                onClick={() => handleScoreSubmit()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#ff6d00] to-[#ff9100] text-white font-black text-xs shadow-md"
              >
                ✓ SIMPAN SKOR (LANGSUNG TERKONFIRMASI)
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL SENGKETA (DISPUTE) */}
      {disputeModalMatch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleDisputeSubmit} className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-bold text-base text-rose-400">Ajukan Sengketa Hasil</h3>
              <button type="button" onClick={() => setDisputeModalMatch(null)} className="text-slate-400">✕</button>
            </div>
            <p className="text-xs text-slate-300">
              Tuliskan alasan penolakan hasil pertandingan ini. Organizer turnamen akan memeriksa dan memutuskan skor akhir.
            </p>
            <textarea
              required
              rows={3}
              placeholder="Contoh: Skor yang benar adalah 2-1 untuk kemenangan saya, bukan 0-2."
              value={disputeReasonInput}
              onChange={(e) => setDisputeReasonInput(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none"
            />
            <button type="submit" className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md">
              ⚠️ KIRIM LAPORAN SENGKETA
            </button>
          </form>
        </div>
      )}

      {/* MODAL BUAT TURNAMEN */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await createTournament({ name: createName, date: createDate, location: createLocation, format: createFormat, total_rounds: createRounds });
              if (res.ok) {
                alert("Turnamen berhasil dibuat!");
                setShowCreateModal(false);
                loadTournamentList();
              } else {
                alert("Gagal: " + res.error);
              }
            }}
            className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl"
          >
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-bold text-base text-white">Buat Turnamen Baru</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-400">✕</button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Nama Turnamen</label>
              <input type="text" required value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Digimon Store Championship" className="w-full px-3 py-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Tanggal</label>
                <input type="date" required value={createDate} onChange={e => setCreateDate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Format</label>
                <select value={createFormat} onChange={e => setCreateFormat(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none">
                  <option value="BO3">Best of 3 (BO3)</option>
                  <option value="BO1">Best of 1 (BO1)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Lokasi</label>
              <input type="text" required value={createLocation} onChange={e => setCreateLocation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Jumlah Ronde Swiss</label>
              <input type="number" min={1} max={10} value={createRounds} onChange={e => setCreateRounds(parseInt(e.target.value, 10))} className="w-full px-3 py-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none" />
            </div>

            <button type="submit" className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#ff6d00] to-[#ff9100] text-white font-extrabold text-xs shadow-md">
              🚀 BUAT TURNAMEN SEKARANG
            </button>
          </form>
        </div>
      )}

      {/* MODAL TUKAR MEJA MANUAL */}
      {showSwapModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSwapConfirm} className="bg-[#0f172a] border border-[#1e293b] rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-2">
              <h3 className="font-bold text-base text-white">Tukar Meja Manual</h3>
              <button type="button" onClick={() => setShowSwapModal(false)} className="text-slate-400">✕</button>
            </div>
            <p className="text-xs text-slate-400">Pilih dua meja yang akan ditukar pemain keduanya (dijamin tanpa rematch).</p>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Meja Pertama</label>
              <select value={swapMatch1Id} onChange={e => setSwapMatch1Id(e.target.value)} className="w-full p-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none">
                <option value="">Pilih Meja 1</option>
                {roundMatches.filter(m => m.status !== 'CONFIRMED').map(m => (
                  <option key={m.id} value={m.id}>Meja #{m.table_number}: {m.player1_name} vs {m.player2_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Meja Kedua</label>
              <select value={swapMatch2Id} onChange={e => setSwapMatch2Id(e.target.value)} className="w-full p-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white outline-none">
                <option value="">Pilih Meja 2</option>
                {roundMatches.filter(m => m.id !== swapMatch1Id && m.status !== 'CONFIRMED').map(m => (
                  <option key={m.id} value={m.id}>Meja #{m.table_number}: {m.player1_name} vs {m.player2_name}</option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={!swapMatch1Id || !swapMatch2Id} className="w-full py-3 rounded-xl bg-[#00e5ff] text-black font-extrabold text-xs shadow-md">
              ⇄ TUKAR PASANGAN
            </button>
          </form>
        </div>
      )}

    </div>
  );
}
