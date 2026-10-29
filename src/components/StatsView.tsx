import React, { useState, useEffect } from 'react';
import { getStats } from '../api.js';

interface StatsViewProps {
  currentUser: any;
}

const DIGIMON_COLORS: Record<string, { hex: string; bg: string; text: string; border: string }> = {
  Merah: { hex: '#ef4444', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' },
  Biru: { hex: '#3b82f6', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40' },
  Kuning: { hex: '#eab308', bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/40' },
  Hijau: { hex: '#22c55e', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  Hitam: { hex: '#64748b', bg: 'bg-slate-700/60', text: 'text-slate-200', border: 'border-slate-500/40' },
  Ungu: { hex: '#a855f7', bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/40' },
  Putih: { hex: '#f8fafc', bg: 'bg-slate-200/20', text: 'text-slate-100', border: 'border-slate-300/40' },
};

export default function StatsView({ currentUser }: StatsViewProps) {
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [cachedTime, setCachedTime] = useState<string | null>(null);

  // Tab switch for Admin (can switch between Admin overview, Organizer stats, or Player personal stats)
  const [activeRoleView, setActiveRoleView] = useState<'player' | 'organizer' | 'admin'>(
    currentUser?.role || 'player'
  );

  useEffect(() => {
    loadStats(false);
  }, []);

  const loadStats = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStats(forceRefresh);
      if (res.ok && res.data) {
        setStatsData(res.data);
        setIsCached(!!res.isMemoryCached || !!res.isCached);
        setCachedTime(res.cachedAt || null);
      } else {
        setError(res.error || 'Gagal memuat data statistik.');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  };

  // Helper untuk menggambar Grafik Tren Peringkat (Mobile SVG Line Chart)
  const renderRankTrendChart = (trendData: any[]) => {
    if (!trendData || trendData.length === 0) {
      return (
        <div className="p-6 rounded-2xl bg-[#080d1a] border border-[#1e293b] text-center text-xs text-slate-500">
          Belum ada riwayat turnamen untuk menampilkan tren peringkat.
        </div>
      );
    }

    if (trendData.length === 1) {
      const item = trendData[0];
      return (
        <div className="p-4 rounded-2xl bg-[#080d1a] border border-[#1e293b] text-center space-y-2">
          <p className="text-xs text-slate-400">Baru mengikuti 1 turnamen:</p>
          <p className="font-extrabold text-sm text-white">{item.tournament_name}</p>
          <div className="inline-block px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-black text-sm border border-amber-500/30">
            Peringkat #{item.rank} dari {item.total_participants} Pemain
          </div>
          <p className="text-[10px] text-slate-500">Ikuti minimal 2 turnamen untuk melihat grafik garis tren.</p>
        </div>
      );
    }

    // Hitung dimensi SVG
    const width = 360;
    const height = 180;
    const paddingLeft = 32;
    const paddingRight = 24;
    const paddingTop = 28;
    const paddingBottom = 32;

    const maxRank = Math.max(...trendData.map(d => d.rank || 1), 4);
    const minRank = 1; // Puncak grafik adalah Peringkat 1 (Rank 1 terbaik)

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    // Hitung koordinat (Y terbalik: rank 1 di paling atas, rank tinggi di bawah)
    const points = trendData.map((d, i) => {
      const x = paddingLeft + (i / (trendData.length - 1)) * plotWidth;
      const rankNorm = (d.rank - minRank) / (maxRank - minRank || 1);
      const y = paddingTop + rankNorm * plotHeight;
      return { x, y, ...d };
    });

    const pathD = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    // Area di bawah garis
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

    return (
      <div className="p-3.5 rounded-2xl bg-[#080d1a] border border-[#1e293b] space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <span>📈</span> Tren Peringkat Turnamen
          </span>
          <span className="text-[10px] text-slate-400">Peringkat #1 berada di puncak</span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 select-none">
            <defs>
              <linearGradient id="rankAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Lines Horizontal */}
            {[1, Math.round((maxRank + 1) / 2), maxRank].map(r => {
              const norm = (r - minRank) / (maxRank - minRank || 1);
              const y = paddingTop + norm * plotHeight;
              return (
                <g key={r}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={paddingLeft - 6}
                    y={y + 3}
                    fill="#64748b"
                    fontSize="9"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    #{r}
                  </text>
                </g>
              );
            })}

            {/* Area & Garis Tren */}
            <path d={areaD} fill="url(#rankAreaGrad)" />
            <path d={pathD} fill="none" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Titik Data Peringkat */}
            {points.map((p, idx) => (
              <g key={idx}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="5"
                  fill="#080d1a"
                  stroke={p.rank === 1 ? '#fbbf24' : '#00e5ff'}
                  strokeWidth="2.5"
                />
                <text
                  x={p.x}
                  y={p.y - 8}
                  fill={p.rank === 1 ? '#fbbf24' : '#ffffff'}
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  #{p.rank}
                </text>
                <text
                  x={p.x}
                  y={height - paddingBottom + 14}
                  fill="#94a3b8"
                  fontSize="8"
                  textAnchor="middle"
                >
                  {p.date ? p.date.substring(5) : `T${idx + 1}`}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Legend / Tooltip Ringkasan */}
        <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-[#1e293b]">
          <span>Pertama: #{points[0]?.rank || 1}</span>
          <span className="font-bold text-emerald-400">Terbaik: #{Math.min(...points.map(p => p.rank))}</span>
          <span>Terbaru: #{points[points.length - 1]?.rank || 1}</span>
        </div>
      </div>
    );
  };

  // Helper untuk Bar Chart Partisipasi Turnamen (Admin)
  const renderParticipationBarChart = (trend: any[]) => {
    if (!trend || trend.length === 0) {
      return <p className="text-center text-xs text-slate-500 py-4">Belum ada data turnamen.</p>;
    }

    const maxParticipants = Math.max(...trend.map(t => t.participants || 0), 8);
    const chartHeight = 120;

    return (
      <div className="p-3.5 rounded-2xl bg-[#080d1a] border border-[#1e293b] space-y-2">
        <span className="font-bold text-xs text-slate-300 block">📊 Tren Jumlah Peserta per Turnamen</span>

        <div className="flex items-end gap-2 h-28 pt-2 overflow-x-auto pb-1">
          {trend.slice(-8).map((t, idx) => {
            const count = t.participants || 0;
            const barHeight = Math.max(12, Math.round((count / maxParticipants) * chartHeight * 0.7));

            return (
              <div key={t.tournament_id || idx} className="flex-1 min-w-[36px] flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono font-bold text-white">{count}</span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-[#0077b6] to-[#00e5ff] transition-all"
                  style={{ height: `${barHeight}px` }}
                ></div>
                <span className="text-[8px] text-slate-400 truncate max-w-[42px] text-center">
                  {t.name ? t.name.substring(0, 7) : `T#${idx + 1}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const pStats = statsData?.player;
  const oStats = statsData?.organizer;
  const aStats = statsData?.admin;

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <span>📈</span> Statistik & Meta TCG
          </h2>
          <p className="text-xs text-slate-400">Analitik performa, win rate deck, dan tren meta Digimon TCG.</p>
        </div>

        {/* Refresh & Cache Badge */}
        <div className="flex items-center gap-2">
          {isCached && (
            <span className="text-[10px] px-2 py-1 rounded-lg bg-[#00e5ff]/10 text-[#00e5ff] font-mono border border-[#00e5ff]/30">
              ⚡ {cachedTime || 'Cached'}
            </span>
          )}
          <button
            onClick={() => loadStats(true)}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs font-bold border border-[#334155] flex items-center gap-1.5 transition-all active:scale-95"
            title="Muat data terbaru dari server"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span>Perbarui</span>
          </button>
        </div>
      </div>

      {/* Role View Switcher untuk Admin / Organizer */}
      {(currentUser?.role === 'admin' || currentUser?.role === 'organizer') && (
        <div className="flex rounded-xl bg-[#0f172a] p-1 border border-[#1e293b] text-xs">
          <button
            type="button"
            onClick={() => setActiveRoleView('player')}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
              activeRoleView === 'player' ? 'bg-[#00e5ff] text-black shadow-md' : 'text-slate-400'
            }`}
          >
            👤 Statistik Saya
          </button>
          <button
            type="button"
            onClick={() => setActiveRoleView('organizer')}
            className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
              activeRoleView === 'organizer' ? 'bg-[#ff6d00] text-white shadow-md' : 'text-slate-400'
            }`}
          >
            ⚔️ Statistik Host
          </button>
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setActiveRoleView('admin')}
              className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                activeRoleView === 'admin' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400'
              }`}
            >
              👑 Statistik Admin
            </button>
          )}
        </div>
      )}

      {/* ERROR STATE */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start justify-between gap-3 shadow-lg">
          <div>
            <p className="font-bold text-rose-300">Gagal Memuat Statistik</p>
            <p className="text-[11px] text-rose-200/80 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => loadStats(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-[11px]"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* LOADING SKELETON */}
      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] animate-pulse h-24"></div>
            <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] animate-pulse h-24"></div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] animate-pulse h-48"></div>
        </div>
      )}

      {/* 1. VIEW STATISTIK PEMAIN */}
      {!loading && statsData && activeRoleView === 'player' && (
        <div className="space-y-4">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Total Turnamen */}
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] text-center space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Turnamen</span>
              <p className="text-2xl font-black text-white">{pStats?.total_tournaments || 0}</p>
              <span className="text-[10px] text-slate-500">Pernah Diikuti</span>
            </div>

            {/* Match Win Rate */}
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] text-center space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Match Win Rate</span>
              <p className="text-2xl font-black text-[#00e5ff] font-mono">{pStats?.win_rate || 0}%</p>
              <span className="text-[10px] text-slate-400 font-bold">
                {pStats?.matches_won || 0}W - {pStats?.matches_lost || 0}L
              </span>
            </div>

            {/* Game Win Rate */}
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] text-center space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Game Win Rate</span>
              <p className="text-2xl font-black text-emerald-400 font-mono">{pStats?.game_win_rate || 0}%</p>
              <span className="text-[10px] text-slate-400 font-bold">
                {pStats?.games_won || 0}W - {pStats?.games_lost || 0}L
              </span>
            </div>

            {/* Deck Paling Sering */}
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] text-center space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Deck Favorit</span>
              <p className="text-xs font-black text-amber-300 truncate mt-1">
                {pStats?.most_used_deck?.deck_name || '-'}
              </p>
              <span className="text-[10px] text-slate-500 block">
                {pStats?.most_used_deck?.count ? `Dipakai ${pStats.most_used_deck.count}x` : 'Belum Ada'}
              </span>
            </div>
          </div>

          {/* CHART 1: Grafik Tren Peringkat (SVG Line Chart) */}
          {renderRankTrendChart(pStats?.rank_trend || [])}

          {/* CHART 2: Win Rate per Deck Pemain */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
            <h3 className="font-extrabold text-xs text-white flex items-center justify-between">
              <span>🃏 Win Rate per Deck / Archetype</span>
              <span className="text-[10px] text-slate-400 font-normal">Diurutkan performa terbaik</span>
            </h3>

            {pStats?.win_rate_per_deck && pStats.win_rate_per_deck.length > 0 ? (
              <div className="space-y-2.5">
                {pStats.win_rate_per_deck.map((d: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-white truncate max-w-[180px]">{d.deck_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {d.matches_won}W - {d.matches_lost}L ({d.usage_count} turnamen)
                        </span>
                        <span className="font-mono font-bold text-[#00e5ff] text-xs w-12 text-right">
                          {d.win_rate}%
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-[#080d1a] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#0077b6] to-[#00e5ff]"
                        style={{ width: `${Math.min(100, d.win_rate)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-500 py-3">Belum ada catatan deck pada turnamen Anda.</p>
            )}
          </div>

          {/* CHART 3: Win Rate per Warna Deck (7 Warna Digimon TCG) */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
            <h3 className="font-extrabold text-xs text-white flex items-center justify-between">
              <span>🎨 Win Rate per Warna Deck</span>
              <span className="text-[10px] text-slate-400 font-normal">7 Warna Resmi Digimon TCG</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pStats?.win_rate_per_color?.map((c: any) => {
                const style = DIGIMON_COLORS[c.color] || { hex: '#94a3b8', bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-600' };
                return (
                  <div key={c.color} className={`p-2.5 rounded-xl border ${style.bg} ${style.border} space-y-1`}>
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-black flex items-center gap-1.5 ${style.text}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: style.hex }}></span>
                        {c.color}
                      </span>
                      <span className="font-mono font-bold text-white text-xs">
                        {c.total_matches > 0 ? `${c.win_rate}%` : '-'}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, c.win_rate)}%`, backgroundColor: style.hex }}
                      ></div>
                    </div>

                    <div className="flex justify-between text-[10px] text-slate-300">
                      <span>{c.count > 0 ? `Dipakai ${c.count}x` : 'Belum pernah'}</span>
                      <span className="font-mono">{c.matches_won}W - {c.matches_lost}L</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. VIEW STATISTIK ORGANIZER (HOST) */}
      {!loading && statsData && activeRoleView === 'organizer' && (
        <div className="space-y-4">
          {/* KPI Organizer */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block">Turnamen Host</span>
              <p className="text-2xl font-black text-[#ff6d00]">{oStats?.total_tournaments || 0}</p>
              <span className="text-[10px] text-slate-500">Diselenggarakan</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block">Total Peserta</span>
              <p className="text-2xl font-black text-white">{oStats?.total_participants || 0}</p>
              <span className="text-[10px] text-slate-500">Seluruh Turnamen</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold block">Rata-rata Peserta</span>
              <p className="text-2xl font-black text-emerald-400">{oStats?.avg_participants || 0}</p>
              <span className="text-[10px] text-slate-500">per Turnamen</span>
            </div>
          </div>

          {/* Highlight Warna Meta Terbaik */}
          {oStats?.highest_win_rate_color && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/40 to-[#0f172a] border border-amber-500/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👑</span>
                <div>
                  <span className="text-[10px] uppercase font-black text-amber-400 block tracking-wider">
                    Warna Meta Juara (Win Rate Tertinggi)
                  </span>
                  <p className="font-extrabold text-sm text-white">
                    {oStats.highest_win_rate_color.color} ({oStats.highest_win_rate_color.win_rate}%)
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-[11px] text-slate-300">
                <span>{oStats.highest_win_rate_color.matches_won} Menang</span>
                <span className="block text-slate-500">{oStats.highest_win_rate_color.matches_lost} Kalah</span>
              </div>
            </div>
          )}

          {/* Distribusi Warna Deck Peserta */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
            <h3 className="font-extrabold text-xs text-white flex items-center justify-between">
              <span>🌈 Distribusi Warna Deck Peserta</span>
              <span className="text-[10px] text-slate-400 font-normal">Komposisi warna peserta turnamen</span>
            </h3>

            <div className="space-y-2">
              {oStats?.deck_color_distribution?.map((c: any) => {
                const style = DIGIMON_COLORS[c.color] || { hex: '#94a3b8', text: 'text-slate-300' };
                return (
                  <div key={c.color} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-bold flex items-center gap-1.5 ${style.text}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: style.hex }}></span>
                        {c.color}
                      </span>
                      <span className="font-mono text-[11px] text-slate-300">
                        {c.count} pemain ({c.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#080d1a] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, c.percentage)}%`, backgroundColor: style.hex }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deck Terpopuler */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
            <h3 className="font-extrabold text-xs text-white">🔥 Deck Paling Populer Dimainkan</h3>

            {oStats?.popular_decks && oStats.popular_decks.length > 0 ? (
              <div className="space-y-2">
                {oStats.popular_decks.map((dk: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-[#080d1a] border border-[#1e293b] flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#1e293b] text-slate-300 font-black flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-white">{dk.deck_name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-[#00e5ff] text-xs font-mono">{dk.count}x Dipakai</span>
                      <span className="text-[10px] text-slate-400 block font-mono">({dk.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-500 py-3">Belum ada data deck peserta.</p>
            )}
          </div>
        </div>
      )}

      {/* 3. VIEW STATISTIK ADMIN (SISTEM) */}
      {!loading && statsData && activeRoleView === 'admin' && (
        <div className="space-y-4">
          {/* User breakdown */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
            <h3 className="font-extrabold text-xs text-white">👥 Pengguna Terdaftar Berdasarkan Peran</h3>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                <span className="text-[10px] text-slate-400 block">Total</span>
                <span className="font-black text-white text-base">{aStats?.users_by_role?.total || 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                <span className="text-[10px] text-slate-400 block">Player</span>
                <span className="font-black text-[#00e5ff] text-base">{aStats?.users_by_role?.player || 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                <span className="text-[10px] text-slate-400 block">Organizer</span>
                <span className="font-black text-[#ff6d00] text-base">{aStats?.users_by_role?.organizer || 0}</span>
              </div>
              <div className="p-2 rounded-xl bg-[#080d1a] border border-[#1e293b]">
                <span className="text-[10px] text-slate-400 block">Admin</span>
                <span className="font-black text-purple-400 text-base">{aStats?.users_by_role?.admin || 0}</span>
              </div>
            </div>
          </div>

          {/* Tren Partisipasi Turnamen Bar Chart */}
          {renderParticipationBarChart(aStats?.participation_trend || [])}

          {/* Meta Warna Global */}
          <div className="p-4 rounded-2xl bg-[#0f172a] border border-[#1e293b] space-y-3">
            <h3 className="font-extrabold text-xs text-white">🌐 Meta Warna Global (Seluruh Turnamen)</h3>
            <div className="space-y-2">
              {aStats?.meta_colors?.map((c: any) => {
                const style = DIGIMON_COLORS[c.color] || { hex: '#94a3b8', text: 'text-slate-300' };
                return (
                  <div key={c.color} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-bold flex items-center gap-1.5 ${style.text}`}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: style.hex }}></span>
                        {c.color}
                      </span>
                      <span className="font-mono text-[11px] text-slate-300">
                        {c.count}x ({c.percentage}%) • Win Rate: <strong className="text-white">{c.win_rate}%</strong>
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#080d1a] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, c.percentage)}%`, backgroundColor: style.hex }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
