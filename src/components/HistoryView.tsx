import React, { useState, useEffect } from 'react';
import { getHistory } from '../api.js';

interface HistoryViewProps {
  currentUser: any;
  onOpenTournamentDetails?: (tournamentId: string) => void;
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  Merah: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', hex: '#ef4444' },
  Biru: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40', hex: '#3b82f6' },
  Kuning: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/40', hex: '#eab308' },
  Hijau: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', hex: '#22c55e' },
  Hitam: { bg: 'bg-slate-700/60', text: 'text-slate-200', border: 'border-slate-500/40', hex: '#64748b' },
  Ungu: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/40', hex: '#a855f7' },
  Putih: { bg: 'bg-slate-200/20', text: 'text-slate-100', border: 'border-slate-300/40', hex: '#f8fafc' },
};

export default function HistoryView({ currentUser, onOpenTournamentDetails }: HistoryViewProps) {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [cachedTime, setCachedTime] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expanded cards state
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<Record<string, 'standings' | 'rounds'>>({});

  useEffect(() => {
    fetchHistory(false);
  }, [startDate, endDate]);

  const fetchHistory = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHistory(
        {
          search: searchQuery,
          startDate: startDate || undefined,
          endDate: endDate || undefined
        },
        forceRefresh
      );

      if (res.ok && res.data) {
        setHistoryItems(res.data.items || []);
        setIsCached(!!res.isMemoryCached || !!res.isCached);
        setCachedTime(res.cachedAt || null);
      } else {
        setError(res.error || 'Gagal memuat riwayat turnamen.');
        if (res.data?.items) {
          setHistoryItems(res.data.items);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(true);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setTimeout(() => fetchHistory(true), 10);
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
    if (!activeSubTab[id]) {
      setActiveSubTab(prev => ({ ...prev, [id]: 'standings' }));
    }
  };

  const renderColorChips = (colorsString: string) => {
    if (!colorsString) return null;
    const colors = colorsString.split(',').map(c => c.trim()).filter(Boolean);
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {colors.map(col => {
          const style = COLOR_MAP[col] || { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-600', hex: '#94a3b8' };
          return (
            <span
              key={col}
              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${style.bg} ${style.text} ${style.border}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.hex }}></span>
              {col}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <span>📜</span> Riwayat Turnamen
          </h2>
          <p className="text-xs text-slate-400">
            {currentUser?.role === 'player'
              ? 'Seluruh riwayat turnamen yang pernah Anda ikuti dan catatan pertandingan tiap ronde.'
              : currentUser?.role === 'organizer'
              ? 'Semua turnamen yang Anda selenggarakan beserta peserta, pairing, dan klasemen.'
              : 'Seluruh riwayat turnamen di dalam sistem DigiSwiss TCG.'}
          </p>
        </div>

        {/* Refresh & Cache Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isCached && (
            <span className="text-[10px] px-2 py-1 rounded-lg bg-[#00e5ff]/10 text-[#00e5ff] font-mono border border-[#00e5ff]/30 flex items-center gap-1">
              <span>⚡</span> Cached {cachedTime ? `(${cachedTime})` : ''}
            </span>
          )}
          <button
            onClick={() => fetchHistory(true)}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs font-bold border border-[#334155] flex items-center gap-1.5 transition-all active:scale-95"
            title="Muat data terbaru dari server"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span>Perbarui</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <form onSubmit={handleSearchSubmit} className="p-3 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-2.5 shadow-md">
        <div className="relative">
          <input
            type="text"
            placeholder="Cari turnamen, lokasi, atau deck..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-20 py-2 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs text-white placeholder-slate-500 outline-none focus:border-[#00e5ff]"
          />
          <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); fetchHistory(true); }}
              className="absolute right-12 top-2 text-xs text-slate-400 hover:text-white px-1"
            >
              ✕
            </button>
          )}
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 px-2.5 py-1 rounded-lg bg-[#00e5ff] text-black font-extrabold text-[11px]"
          >
            Cari
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-center text-xs">
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-0.5">Dari Tanggal:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[#080d1a] border border-[#1e293b] text-white text-[11px] outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 font-bold mb-0.5">Sampai Tanggal:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-[#080d1a] border border-[#1e293b] text-white text-[11px] outline-none"
            />
          </div>
          <div className="col-span-2 sm:col-span-1 pt-3 sm:pt-3">
            {(searchQuery || startDate || endDate) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] border border-slate-700"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>
      </form>

      {/* ERROR STATE */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2">
            <span className="text-base">⚠️</span>
            <div>
              <p className="font-bold text-rose-300">Gagal Memuat Riwayat</p>
              <p className="text-[11px] text-rose-200/80 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={() => fetchHistory(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex-shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* LOADING SKELETON */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] animate-pulse space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-4 bg-slate-700 rounded w-1/2"></div>
                <div className="h-4 bg-slate-700 rounded w-16"></div>
              </div>
              <div className="h-3 bg-slate-800 rounded w-3/4"></div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="h-8 bg-slate-800 rounded"></div>
                <div className="h-8 bg-slate-800 rounded"></div>
                <div className="h-8 bg-slate-800 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading && historyItems.length === 0 && !error && (
        <div className="p-8 rounded-3xl bg-[#0f172a] border border-[#1e293b] text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#1e293b] flex items-center justify-center text-3xl">
            📜
          </div>
          <h3 className="text-sm font-bold text-white">Belum Ada Riwayat Turnamen</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            {searchQuery || startDate || endDate
              ? 'Tidak ada turnamen yang cocok dengan filter pencarian Anda. Coba sesuaikan kata kunci atau reset filter.'
              : currentUser?.role === 'player'
              ? 'Anda belum pernah mengikuti turnamen. Silakan mendaftar di turnamen yang tersedia pada tab Turnamen.'
              : 'Belum ada turnamen yang tersimpan dalam riwayat.'}
          </p>
          {(searchQuery || startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              className="py-2 px-4 rounded-xl bg-[#00e5ff] text-black font-extrabold text-xs inline-block shadow-md"
            >
              Hapus Filter Pencarian
            </button>
          )}
        </div>
      )}

      {/* LIST RIWAYAT PEMAIN */}
      {!loading && historyItems.length > 0 && currentUser?.role === 'player' && (
        <div className="space-y-3">
          {historyItems.map((item, idx) => {
            const isExpanded = !!expandedItems[item.tournament_id];
            const rankMedal =
              item.final_rank === 1 ? '🥇 Juara 1' :
              item.final_rank === 2 ? '🥈 Juara 2' :
              item.final_rank === 3 ? '🥉 Juara 3' :
              item.final_rank > 0 ? `#${item.final_rank}` : '-';

            const rankBg =
              item.final_rank === 1 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
              item.final_rank === 2 ? 'bg-slate-300/20 text-slate-200 border-slate-300/40' :
              item.final_rank === 3 ? 'bg-amber-800/20 text-amber-500 border-amber-800/40' :
              'bg-[#1e293b] text-slate-300 border-[#334155]';

            return (
              <div
                key={item.tournament_id || idx}
                className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] hover:border-slate-700 transition-all space-y-3 shadow-md"
              >
                {/* Header Card Turnamen */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm text-white leading-tight">
                      {item.tournament_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                      <span>📅 {item.date || '-'}</span>
                      <span>•</span>
                      <span>📍 {item.location || 'Local Store'}</span>
                      <span>•</span>
                      <span className="font-mono text-cyan-400 font-bold">{item.format || 'BO3'}</span>
                    </div>
                  </div>

                  {/* Badge Peringkat */}
                  <div className={`px-2.5 py-1 rounded-xl text-xs font-black border ${rankBg} flex-shrink-0 text-center`}>
                    {rankMedal}
                    {item.total_participants > 0 && item.final_rank > 0 && (
                      <span className="block text-[9px] font-normal opacity-80">dari {item.total_participants}</span>
                    )}
                  </div>
                </div>

                {/* Info Deck Pemain */}
                <div className="p-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Deck yang Dipakai:</span>
                    <span className="font-bold text-white truncate max-w-[200px]">{item.deck_name || 'Tanpa Deck'}</span>
                  </div>
                  {renderColorChips(item.deck_colors)}
                </div>

                {/* Score & Record Summary */}
                <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">Poin</span>
                    <span className="font-black text-emerald-400 text-sm">{item.match_points}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">W - L</span>
                    <span className="font-black text-white text-sm">{item.matches_won} - {item.matches_lost}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">Game W/L</span>
                    <span className="font-bold text-slate-300 text-xs">{item.games_won}-{item.games_lost}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">OMW%</span>
                    <span className="font-bold text-[#00e5ff] text-xs font-mono">{parseFloat(item.omw_percentage || 0).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Accordion Toggle Detail Ronde */}
                <div>
                  <button
                    onClick={() => toggleExpand(item.tournament_id)}
                    className="w-full py-2 px-3 rounded-xl bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 font-bold text-xs flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>⚔️</span>
                      <span>Catatan Pertandingan Ronde ({item.round_scores?.length || 0})</span>
                    </span>
                    <span>{isExpanded ? '▲ Sembunyikan' : '▼ Tampilkan'}</span>
                  </button>

                  {/* Expanded Matches Detail */}
                  {isExpanded && (
                    <div className="mt-2 space-y-2 animate-fadeIn pt-1">
                      {item.round_scores && item.round_scores.length > 0 ? (
                        item.round_scores.map((m: any, mIdx: number) => {
                          const isWin = m.result === 'WIN';
                          const isLoss = m.result === 'LOSS';
                          const resBadge = isWin
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : isLoss
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

                          return (
                            <div
                              key={m.match_id || mIdx}
                              className="p-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] flex items-center justify-between text-xs gap-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-[#1e293b] text-slate-300 font-black flex items-center justify-center text-[10px]">
                                  R{m.round_number}
                                </span>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-white">vs {m.opponent_name}</span>
                                    {m.opponent_deck && (
                                      <span className="text-[10px] text-cyan-400 font-semibold truncate max-w-[120px]">
                                        ({m.opponent_deck})
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500 block">
                                    Meja #{m.table_number || 1} • {m.is_bye ? 'Bye Match' : `Skor: ${m.score_display}`}
                                  </span>
                                </div>
                              </div>

                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${resBadge}`}>
                                {m.result}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-[11px] text-slate-500 py-2">
                          Belum ada catatan pertandingan ronde.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST RIWAYAT ORGANIZER & ADMIN */}
      {!loading && historyItems.length > 0 && currentUser?.role !== 'player' && (
        <div className="space-y-4">
          {historyItems.map((item, idx) => {
            const isExpanded = !!expandedItems[item.tournament_id];
            const activeTab = activeSubTab[item.tournament_id] || 'standings';

            const statusBadge =
              item.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
              item.status === 'RUNNING' ? 'bg-[#ff6d00]/20 text-[#ff9100] border-[#ff6d00]/40' :
              'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40';

            const statusText =
              item.status === 'COMPLETED' ? 'Selesai' :
              item.status === 'RUNNING' ? 'Sedang Berjalan' :
              'Pendaftaran Dibuka';

            return (
              <div
                key={item.tournament_id || idx}
                className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] hover:border-slate-700 transition-all space-y-3 shadow-md"
              >
                {/* Header Turnamen */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-sm text-white leading-tight">
                      {item.tournament_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                      <span>📅 {item.date || '-'}</span>
                      <span>•</span>
                      <span>📍 {item.location || 'Local Store'}</span>
                      <span>•</span>
                      <span className="font-mono text-cyan-400 font-bold">{item.format || 'BO3'}</span>
                      {currentUser?.role === 'admin' && item.organizer_name && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400">Host: {item.organizer_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${statusBadge} flex-shrink-0`}>
                    {statusText}
                  </span>
                </div>

                {/* Summary Metrics */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">Total Peserta</span>
                    <span className="font-black text-white text-sm">{item.participant_count || 0} Pemain</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">Ronde Swiss</span>
                    <span className="font-black text-[#00e5ff] text-sm">{item.total_rounds || 3} Ronde</span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block font-bold">Pemenang</span>
                    <span className="font-black text-amber-300 text-xs truncate block">
                      {item.standings && item.standings.length > 0 ? `🥇 ${item.standings[0].player_name}` : '-'}
                    </span>
                  </div>
                </div>

                {/* Toggle Detail */}
                <div>
                  <button
                    onClick={() => toggleExpand(item.tournament_id)}
                    className="w-full py-2 px-3 rounded-xl bg-[#1e293b]/70 hover:bg-[#1e293b] text-slate-300 font-bold text-xs flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>📊</span>
                      <span>Lihat Detail Peserta, Klasemen & Pairing</span>
                    </span>
                    <span>{isExpanded ? '▲ Tutup' : '▼ Buka Detail'}</span>
                  </button>

                  {/* Expanded Detail (Klasemen & Rounds) */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3 pt-2 border-t border-[#1e293b] animate-fadeIn">
                      {/* Sub-Tabs: Klasemen vs Pairing Ronde */}
                      <div className="flex rounded-xl bg-[#080d1a] p-1 border border-[#1e293b]">
                        <button
                          type="button"
                          onClick={() => setActiveSubTab(prev => ({ ...prev, [item.tournament_id]: 'standings' }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'standings' ? 'bg-[#00e5ff] text-black shadow-sm' : 'text-slate-400'
                          }`}
                        >
                          🏆 Klasemen Akhir ({item.standings?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSubTab(prev => ({ ...prev, [item.tournament_id]: 'rounds' }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'rounds' ? 'bg-[#ff6d00] text-white shadow-sm' : 'text-slate-400'
                          }`}
                        >
                          ⚡ Pairing Ronde ({item.rounds?.length || 0})
                        </button>
                      </div>

                      {/* Sub-Tab 1: Klasemen */}
                      {activeTab === 'standings' && (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                          {item.standings && item.standings.length > 0 ? (
                            item.standings.map((st: any) => {
                              const medal = st.rank === 1 ? '🥇' : (st.rank === 2 ? '🥈' : (st.rank === 3 ? '🥉' : `#${st.rank}`));
                              return (
                                <div
                                  key={st.rank}
                                  className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b] flex items-center justify-between text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-amber-300 w-6 text-center">{medal}</span>
                                    <div>
                                      <p className="font-bold text-white">{st.player_name}</p>
                                      <p className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                        {st.deck_name} {st.deck_colors ? `(${st.deck_colors})` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-black text-emerald-400 text-xs block">{st.match_points} Poin</span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {st.matches_won}-{st.matches_lost} • {parseFloat(st.omw_percentage || 0).toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-center text-xs text-slate-500 py-3">Belum ada data klasemen.</p>
                          )}
                        </div>
                      )}

                      {/* Sub-Tab 2: Pairing Ronde */}
                      {activeTab === 'rounds' && (
                        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                          {item.rounds && item.rounds.length > 0 ? (
                            item.rounds.map((rnd: any) => (
                              <div key={rnd.round_id} className="p-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] space-y-2">
                                <div className="flex justify-between items-center border-b border-[#1e293b] pb-1">
                                  <span className="font-extrabold text-xs text-[#00e5ff]">Ronde {rnd.round_number}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{rnd.status}</span>
                                </div>
                                <div className="space-y-1">
                                  {rnd.matches && rnd.matches.map((m: any) => (
                                    <div key={m.id} className="flex justify-between items-center text-[11px] p-1.5 rounded-lg bg-[#0f172a]">
                                      <span className="text-slate-500 font-mono text-[10px] w-8">M#{m.table_number}</span>
                                      <div className="flex-1 px-1 truncate">
                                        <span className={m.winner_name === m.player1_name ? 'font-bold text-emerald-400' : 'text-slate-300'}>
                                          {m.player1_name}
                                        </span>
                                        <span className="text-slate-600 px-1 font-bold">vs</span>
                                        <span className={m.winner_name === m.player2_name ? 'font-bold text-emerald-400' : 'text-slate-300'}>
                                          {m.player2_name}
                                        </span>
                                      </div>
                                      <span className="font-black text-white px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono">
                                        {m.player1_wins} - {m.player2_wins}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-center text-xs text-slate-500 py-3">Belum ada ronde yang dibuat.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
