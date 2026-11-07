import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchBacktestV1Presets,
  fetchLatestNews,
  fetchPortfolio,
  fetchPortfolioBenchmarkOverlay,
  fetchQuotesBatch,
  fetchWatchlist,
  fetchWatchlists,
  type NewsLatestApiItem,
} from "../api/client";
import { fetchDashboardResults, type DashboardResults } from "../api/intelligence";
import { marketFromDesk } from "../api/ideasThemes";
import { ExposureHeatmap } from "../components/dashboard/ExposureHeatmap";
import { GuidedEmptyState } from "../components/dashboard/GuidedEmptyState";
import { IntelligenceTimeline } from "../components/dashboard/IntelligenceTimeline";
import { ResultsSummaryCards } from "../components/dashboard/ResultsSummaryCards";
import { LiveClockStrip } from "../components/home/LiveClockStrip";
import { MarketHeatStrip, type MarketHeatStripItem } from "../components/home/MarketHeatStrip";
import { MetricCard } from "../components/home/MetricCard";
import { PortfolioMiniChart } from "../components/home/PortfolioMiniChart";
import { ProfileCompletionRing } from "../components/home/ProfileCompletionRing";
import { QuickNavGrid, type QuickNavSection } from "../components/home/QuickNavGrid";
import { SystemHealthBar, type SystemHealthItem } from "../components/home/SystemHealthBar";
import { IdeasRadar } from "../components/ideas/IdeasRadar";
import { AiInsightCard } from "../components/terminal/AiInsightCard";
import { TerminalShell } from "../components/layout/TerminalShell";
import { useAuth } from "../contexts/AuthContext";
import { fetchChainSummary } from "../fno/api/fnoApi";
import { fetchCollectionBriefing } from "../api/client";
import { loadStoredProfileCompletion } from "../lib/profileCompletion";
import { useSettingsStore } from "../store/settingsStore";
import { useI18n } from "../i18n/useI18n";
import type { PortfolioItem } from "../types";
import { getWorkspacePresetConfig, readWorkspacePreset } from "../workspace/presets";

type MarketRow = {
  symbol: string;
  label?: string;
  ltp: number;
  chg: number;
  chgPct: number;
  flash: "up" | "down" | null;
};

type DashboardSnapshot = {
  equityValue: number | null;
  equityCost: number;
  equityPnl: number | null;
  holdingsCount: number;
  watchlistCount: number;
  watchlistDerivativesCount: number;
  backtestPresetCount: number;
  fnoSpot: number | null;
  fnoPcr: number | null;
  fnoSignal: string;
  updatedAt: number | null;
};

type NavCard = {
  id: string;
  label: string;
  to: string;
  badge: string;
};

const TRANSITION_FLAG_KEY = "ot-terminal-transition";
const NEWS_LIMIT = 15;

const NAV_CARD_SECTIONS: Array<{ title: string; cards: NavCard[] }> = [
  {
    title: "MARKETS",
    cards: [
      { id: "equity", label: "Equity", to: "/equity/stocks", badge: "M1" },
      { id: "fno", label: "F&O", to: "/fno", badge: "FO" },
      { id: "crypto", label: "Crypto", to: "/equity/crypto", badge: "CR" },
      { id: "economics", label: "Economics", to: "/equity/economics", badge: "EC" },
      { id: "yield-curve", label: "Yield Curve", to: "/equity/yield-curve", badge: "YC" },
      { id: "rotation", label: "Rotation", to: "/equity/sector-rotation", badge: "ROT" },
      { id: "heatmap", label: "Heatmap", to: "/equity/heatmap", badge: "HM" },
    ],
  },
  {
    title: "DERIVATIVES",
    cards: [
      { id: "option-chain", label: "Option Chain", to: "/fno", badge: "OC" },
      { id: "greeks", label: "Greeks", to: "/fno/greeks", badge: "GR" },
      { id: "futures", label: "Futures", to: "/fno/futures", badge: "FUT" },
      { id: "oi", label: "OI Analysis", to: "/fno/oi", badge: "OI" },
      { id: "strategy", label: "Strategy", to: "/fno/strategy", badge: "STR" },
      { id: "pcr", label: "PCR", to: "/fno/pcr", badge: "PCR" },
      { id: "flow", label: "Options Flow", to: "/fno/flow", badge: "FLW" },
      { id: "fno-heatmap", label: "F&O Heatmap", to: "/fno/heatmap", badge: "FHM" },
      { id: "expiry", label: "Expiry", to: "/fno/expiry", badge: "EXP" },
    ],
  },
  {
    title: "RESEARCH",
    cards: [
      { id: "security-hub", label: "Security Hub", to: "/equity/security", badge: "SH" },
      { id: "screener", label: "Screener", to: "/equity/screener", badge: "F2" },
      { id: "saved-views", label: "Saved Views", to: "/equity/saved-views", badge: "SV" },
      { id: "factors", label: "Factors", to: "/equity/factors", badge: "FAC" },
      { id: "alpha-zoo", label: "Alpha Zoo", to: "/equity/alpha-zoo", badge: "AZ" },
      { id: "strategy-export", label: "Strategy Export", to: "/equity/strategy-export", badge: "SE" },
      { id: "intelligence", label: "Intelligence", to: "/equity/intelligence-timeline", badge: "INT" },
      { id: "hotlists", label: "Hotlists", to: "/equity/hotlists", badge: "HOT" },
      { id: "insider", label: "Insider", to: "/equity/insider", badge: "INS" },
      { id: "compare", label: "Compare", to: "/equity/compare", badge: "CMP" },
    ],
  },
  {
    title: "LABS",
    cards: [
      { id: "backtesting", label: "Backtesting", to: "/backtesting", badge: "F9" },
      { id: "model-lab", label: "Model Lab", to: "/backtesting/model-lab", badge: "ML" },
      { id: "portfolio-lab", label: "Portfolio Lab", to: "/equity/portfolio/lab", badge: "PL" },
      { id: "model-compare", label: "Model Compare", to: "/backtesting/model-lab/compare", badge: "MC" },
      { id: "blends", label: "Blends", to: "/equity/portfolio/lab/blends", badge: "BL" },
      { id: "stat-lab", label: "Stat Lab", to: "/equity/stat-lab", badge: "SL" },
    ],
  },
  {
    title: "PORTFOLIO",
    cards: [
      { id: "holdings", label: "Holdings", to: "/equity/portfolio", badge: "F3" },
      { id: "risk", label: "Risk Desk", to: "/equity/risk", badge: "RSK" },
      { id: "correlation", label: "Correlation", to: "/equity/correlation", badge: "COR" },
      { id: "paper", label: "Paper", to: "/equity/paper", badge: "PP" },
      { id: "dividends", label: "Dividends", to: "/equity/dividends", badge: "DIV" },
      { id: "mutual-funds", label: "Mutual Funds", to: "/equity/mutual-funds", badge: "MF" },
      { id: "etf", label: "ETF Analytics", to: "/equity/etf-analytics", badge: "ETF" },
    ],
  },
  {
    title: "INTEL",
    cards: [
      { id: "news", label: "News", to: "/equity/news", badge: "NW" },
      { id: "alerts", label: "Alerts", to: "/equity/alerts", badge: "AL" },
      { id: "watchlist", label: "Watchlist", to: "/equity/watchlist", badge: "F4" },
      { id: "rs", label: "Relative Str", to: "/equity/rs", badge: "RS" },
      { id: "data-quality", label: "Data Quality", to: "/equity/data-quality", badge: "DQ" },
    ],
  },
  {
    title: "WORKSPACE",
    cards: [
      { id: "launchpad", label: "Launchpad", to: "/equity/launchpad", badge: "LP" },
      { id: "workstation", label: "Workstation", to: "/equity/chart-workstation", badge: "WS" },
      { id: "cockpit", label: "Cockpit", to: "/equity/cockpit", badge: "CP" },
      { id: "plugins", label: "Plugins", to: "/equity/plugins", badge: "PLG" },
      { id: "settings", label: "Settings", to: "/equity/settings", badge: "F6" },
      { id: "account", label: "Account", to: "/account", badge: "ACC" },
    ],
  },
];

const INITIAL_MARKET_ROWS: MarketRow[] = [
  { symbol: "^NSEI", label: "NIFTY 50", ltp: 0, chg: 0, chgPct: 0, flash: null },
  { symbol: "^BSESN", label: "SENSEX", ltp: 0, chg: 0, chgPct: 0, flash: null },
  { symbol: "^IXIC", label: "NASDAQ", ltp: 0, chg: 0, chgPct: 0, flash: null },
  { symbol: "^GSPC", label: "S&P 500", ltp: 0, chg: 0, chgPct: 0, flash: null },
  { symbol: "GC=F", label: "GOLD", ltp: 0, chg: 0, chgPct: 0, flash: null },
  { symbol: "SI=F", label: "SILVER", ltp: 0, chg: 0, chgPct: 0, flash: null },
  { symbol: "CL=F", label: "CRUDE OIL", ltp: 0, chg: 0, chgPct: 0, flash: null },
];

const MARKET_PULSE_SYMBOLS = INITIAL_MARKET_ROWS.map((row) => row.symbol);

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  equityValue: null,
  equityCost: 0,
  equityPnl: null,
  holdingsCount: 0,
  watchlistCount: 0,
  watchlistDerivativesCount: 0,
  backtestPresetCount: 0,
  fnoSpot: null,
  fnoPcr: null,
  fnoSignal: "NA",
  updatedAt: null,
};

function formatPrice(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatInr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "INR --";
  return `INR ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatSignedInr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "INR --";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}INR ${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatCompactDateLabel(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return date;
  return new Date(parsed).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getMetricTone(value: number | null): "accent" | "up" | "down" | "neutral" {
  if (value == null || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}

function getSignalTone(signal: string): "accent" | "up" | "down" | "neutral" {
  const normalized = signal.trim().toUpperCase();
  if (normalized.includes("BULL")) return "up";
  if (normalized.includes("BEAR")) return "down";
  if (normalized === "NA") return "neutral";
  return "accent";
}

function getSystemTone(signal: string): SystemHealthItem["tone"] {
  const normalized = signal.trim().toUpperCase();
  if (normalized.includes("BULL")) return "ok";
  if (normalized.includes("BEAR")) return "warning";
  if (normalized === "NA") return "neutral";
  return "info";
}

function getSentimentClass(label?: string): string {
  if (label === "Bullish") return "text-terminal-pos";
  if (label === "Bearish") return "text-terminal-neg";
  return "text-terminal-muted";
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const selectedMarket = useSettingsStore((s) => s.selectedMarket);
  const ideasMarket = marketFromDesk(selectedMarket);
  const displayCurrency = useSettingsStore((s) => s.displayCurrency);
  const realtimeMode = useSettingsStore((s) => s.realtimeMode);
  const newsAutoRefresh = useSettingsStore((s) => s.newsAutoRefresh);
  const newsRefreshSec = useSettingsStore((s) => s.newsRefreshSec);

  const [marketRows, setMarketRows] = useState<MarketRow[]>(INITIAL_MARKET_ROWS);
  const [newsLog, setNewsLog] = useState<NewsLatestApiItem[]>([]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY_SNAPSHOT);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [dashboardResults, setDashboardResults] = useState<DashboardResults | null>(null);
  const [activePreset, setActivePreset] = useState(readWorkspacePreset);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [performancePoints, setPerformancePoints] = useState<number[]>([]);
  const [performanceBenchmarkPoints, setPerformanceBenchmarkPoints] = useState<number[]>([]);
  const [performanceLabels, setPerformanceLabels] = useState<string[]>([]);
  const [selectedHeatId, setSelectedHeatId] = useState<string | null>(INITIAL_MARKET_ROWS[0]?.symbol ?? null);
  const [initializing, setInitializing] = useState(() => sessionStorage.getItem(TRANSITION_FLAG_KEY) === "1");

  const loadSnapshot = useCallback(async () => {
    const [portfolioRes, watchlistRes, backtestRes, chainRes, benchmarkRes, watchlistsRes] = await Promise.allSettled([
      fetchPortfolio(),
      fetchWatchlist(),
      fetchBacktestV1Presets(),
      fetchChainSummary("NIFTY"),
      fetchPortfolioBenchmarkOverlay(),
      fetchWatchlists(),
    ]);

    let next = { ...EMPTY_SNAPSHOT };
    let nextPerformancePoints: number[] = [];
    let nextBenchmarkPoints: number[] = [];
    let nextPerformanceLabels: string[] = [];

    if (portfolioRes.status === "fulfilled") {
      const data = portfolioRes.value;
      setPortfolioItems(data.items || []);
      const derivedValue = data.summary.total_value ?? data.items.reduce((acc, row) => acc + Number(row.current_value ?? 0), 0);
      next.equityValue = Number.isFinite(derivedValue) ? derivedValue : null;
      next.equityCost = Number(data.summary.total_cost ?? 0);
      next.equityPnl =
        typeof data.summary.overall_pnl === "number"
          ? data.summary.overall_pnl
          : next.equityValue != null
            ? next.equityValue - next.equityCost
            : null;
      next.holdingsCount = data.items.length;
    }

    if (watchlistRes.status === "fulfilled") {
      const items = watchlistRes.value;
      next.watchlistCount = items.length;
      next.watchlistDerivativesCount = items.filter((row) => row.has_futures || row.has_options).length;
    }
    // The Watchlist page uses the per-user multi-watchlist store; count those symbols so Home agrees with it.
    if (watchlistsRes.status === "fulfilled") {
      const symbols = new Set(watchlistsRes.value.flatMap((wl) => (wl.symbols || []).map((sym) => sym.toUpperCase())));
      next.watchlistCount = Math.max(next.watchlistCount, symbols.size);
    }

    if (backtestRes.status === "fulfilled") {
      next.backtestPresetCount = backtestRes.value.length;
    }

    if (chainRes.status === "fulfilled") {
      const spot = Number(chainRes.value.spot_price);
      const pcr = chainRes.value.pcr?.pcr_oi == null ? NaN : Number(chainRes.value.pcr.pcr_oi);
      next.fnoSpot = Number.isFinite(spot) && spot > 0 ? spot : null;
      next.fnoPcr = Number.isFinite(pcr) && pcr > 0 ? pcr : null;
      // An empty chain (no spot / no OI, backend signal "No data") must not yield a regime verdict.
      const signal = String(chainRes.value.pcr?.signal || "NA").toUpperCase();
      next.fnoSignal = next.fnoSpot != null && next.fnoPcr != null && signal !== "NO DATA" ? signal : "NA";
    }

    if (benchmarkRes.status === "fulfilled" && benchmarkRes.value?.equity_curve?.length > 0) {
      const curve = benchmarkRes.value.equity_curve;
      const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentCurve = curve.filter((pt) => {
        const ms = Date.parse(`${pt.date}T00:00:00Z`);
        return Number.isFinite(ms) && ms >= cutoffMs;
      });
      const windowCurve = (recentCurve.length >= 2 ? recentCurve : curve.slice(-30)).filter((pt) =>
        Number.isFinite(Number(pt.portfolio)) && Number(pt.portfolio) > 0,
      );

      const currentPortfolioValue =
        next.equityValue != null && Number.isFinite(next.equityValue)
          ? next.equityValue
          : null;
      const lastPortfolio = Number(windowCurve[windowCurve.length - 1]?.portfolio ?? NaN);
      const lastBenchmark = Number(windowCurve[windowCurve.length - 1]?.benchmark ?? NaN);
      const canScalePortfolio = currentPortfolioValue != null && Number.isFinite(lastPortfolio) && lastPortfolio > 0;
      const canScaleBenchmark = currentPortfolioValue != null && Number.isFinite(lastBenchmark) && lastBenchmark > 0;

      const scaledPoints = windowCurve
        .map((pt) => {
          const portfolio = Number(pt.portfolio);
          if (!Number.isFinite(portfolio)) return 0;
          return canScalePortfolio ? (portfolio / lastPortfolio) * currentPortfolioValue! : portfolio;
        })
        .filter((value) => Number.isFinite(value) && value > 0);

      const scaledBenchmarkPoints = windowCurve
        .map((pt) => {
          const benchmark = Number(pt.benchmark);
          if (!Number.isFinite(benchmark)) return 0;
          return canScaleBenchmark ? (benchmark / lastBenchmark) * currentPortfolioValue! : benchmark;
        })
        .filter((value) => Number.isFinite(value) && value > 0);

      if (scaledPoints.length >= 2) {
        nextPerformancePoints = scaledPoints;
        nextPerformanceLabels = windowCurve.map((pt) => formatCompactDateLabel(pt.date));
      }

      if (scaledBenchmarkPoints.length >= 2) {
        nextBenchmarkPoints = scaledBenchmarkPoints;
      }
    }

    // No portfolio history -> empty series (charts render their empty state); never a synthetic curve.
    setPerformancePoints(nextPerformancePoints);
    setPerformanceBenchmarkPoints(nextBenchmarkPoints);
    setPerformanceLabels(nextPerformanceLabels);
    next.updatedAt = Date.now();
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let active = true;
    setResultsLoading(true);
    fetchDashboardResults(4)
      .then((data) => {
        if (active) setDashboardResults(data);
      })
      .catch(() => {
        if (active) setDashboardResults({ modelLab: [], portfolioLab: [] });
      })
      .finally(() => {
        if (active) setResultsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  useEffect(() => {
    let active = true;

    const loadMarketPulse = async () => {
      try {
        const payload = await fetchQuotesBatch(MARKET_PULSE_SYMBOLS, selectedMarket);
        if (!active) return;
        const quotesBySymbol = new Map(
          (payload?.quotes || []).map((quote) => [String(quote.symbol || "").toUpperCase(), quote]),
        );
        setMarketRows((prev) =>
          prev.map((row) => {
            const quote = quotesBySymbol.get(row.symbol.toUpperCase());
            if (!quote || !Number.isFinite(Number(quote.last))) {
              return row.flash ? { ...row, flash: null } : row;
            }
            const nextLtp = Number(quote.last);
            const nextChg = Number.isFinite(Number(quote.change)) ? Number(quote.change) : row.chg;
            const nextChgPct = Number.isFinite(Number(quote.changePct)) ? Number(quote.changePct) : row.chgPct;
            const flash: MarketRow["flash"] = nextLtp > row.ltp ? "up" : nextLtp < row.ltp ? "down" : null;
            return {
              ...row,
              ltp: nextLtp,
              chg: nextChg,
              chgPct: nextChgPct,
              flash,
            };
          }),
        );
      } catch {
        if (!active) return;
      }
    };

    void loadMarketPulse();
    const timer = window.setInterval(() => {
      void loadMarketPulse();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedMarket]);

  useEffect(() => {
    let active = true;

    const loadNews = async () => {
      try {
        const items = await fetchLatestNews(NEWS_LIMIT);
        if (active && items.length) {
          setNewsLog(items);
        }
      } catch {
        if (!active) return;
      }
    };

    void loadNews();
    if (newsAutoRefresh) {
      const timer = window.setInterval(() => {
        void loadNews();
      }, newsRefreshSec * 1000);
      return () => {
        active = false;
        window.clearInterval(timer);
      };
    }

    return () => {
      active = false;
    };
  }, [newsAutoRefresh, newsRefreshSec]);

  useEffect(() => {
    if (!initializing) return;
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(TRANSITION_FLAG_KEY);
      setInitializing(false);
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [initializing]);

  useEffect(() => {
    if (marketRows.some((row) => row.symbol === selectedHeatId)) return;
    setSelectedHeatId(marketRows[0]?.symbol ?? null);
  }, [marketRows, selectedHeatId]);

  const equityPnlPct = useMemo(() => {
    if (snapshot.equityPnl == null || snapshot.equityCost <= 0) return null;
    return (snapshot.equityPnl / snapshot.equityCost) * 100;
  }, [snapshot.equityCost, snapshot.equityPnl]);

  const performanceSeries = useMemo(
    () =>
      performancePoints.map((value, index) => ({
        label: performanceLabels[index] ?? `D${index + 1}`,
        value,
      })),
    [performanceLabels, performancePoints],
  );

  const benchmarkSeries = useMemo(
    () =>
      performanceBenchmarkPoints.map((value, index) => ({
        label: performanceLabels[index] ?? `D${index + 1}`,
        value,
      })),
    [performanceBenchmarkPoints, performanceLabels],
  );

  const heatItems = useMemo<MarketHeatStripItem[]>(
    () =>
      marketRows.map((row) => ({
        id: row.symbol,
        label: row.label || row.symbol,
        value: row.ltp > 0 ? row.ltp : null,
        changePct: row.ltp > 0 ? row.chgPct : null,
        changeLabel:
          row.ltp > 0
            ? `${row.chg >= 0 ? "+" : ""}${formatPrice(row.chg)} / ${formatPercent(row.chgPct)}`
            : "--",
        flash: row.flash,
      })),
    [marketRows],
  );

  const focusedMarket = useMemo(
    () => marketRows.find((row) => row.symbol === selectedHeatId) ?? marketRows[0] ?? null,
    [marketRows, selectedHeatId],
  );

  useEffect(() => {
    const onStorage = () => setActivePreset(readWorkspacePreset());
    window.addEventListener("storage", onStorage);
    window.addEventListener("ot:preset-change", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ot:preset-change", onStorage);
    };
  }, []);

  const presetConfig = getWorkspacePresetConfig(activePreset);
  const showHomeSection = useCallback((section: string) => presetConfig.homeSections.includes(section), [presetConfig.homeSections]);

  const launchSections = useMemo<QuickNavSection[]>(
    () => {
      const preferred = new Set(presetConfig.quickLinks.map((link) => link.to));
      return NAV_CARD_SECTIONS.map((section) => {
        const title = t(`home.nav.${section.title}`);
        return {
        id: slugify(section.title),
        title,
        // Show ALL nav cards — the workspace preset only reorders (preferred first),
        // it must never hide features from the launcher.
        items: section.cards
          .slice()
          .sort((a, b) => Number(preferred.has(b.to)) - Number(preferred.has(a.to)))
          .map((card) => ({
          id: `${slugify(section.title)}-${card.id}`,
          label: t(`home.card.${card.id}`),
          shortcut: card.badge,
          description: t("home.deskAccess", { section: title }),
          onSelect: () => navigate(card.to),
        })),
      };}).filter((section) => section.items.length > 0);
    },
    [navigate, presetConfig.quickLinks, t],
  );

  const updatedLabel = snapshot.updatedAt
    ? new Date(snapshot.updatedAt).toLocaleTimeString("en-IN", { hour12: false })
    : "--:--:--";

  // Same computation as the Account page (saved profile fields), so both screens agree.
  const { value: profileCompletion, missingFields: profileMissingFields } = useMemo(() => loadStoredProfileCompletion(), []);

  const systemHealthItems = useMemo<SystemHealthItem[]>(
    () => [
      {
        id: "auth",
        label: t("home.auth"),
        value: user ? t("home.ready", { role: user.role.toUpperCase() }) : t("home.guest"),
        tone: user ? "ok" : "warning",
      },
      {
        id: "relay",
        label: t("home.relayLabel"),
        value: `${selectedMarket} ${realtimeMode.toUpperCase()}`,
        tone: realtimeMode === "ws" ? "ok" : "info",
      },
      {
        id: "snapshot",
        label: t("home.snapshot"),
        value: updatedLabel,
        tone: snapshot.updatedAt ? "stale" : "offline",
      },
      {
        id: "news",
        label: t("home.newsLabel"),
        value: newsAutoRefresh ? t("home.auto", { sec: newsRefreshSec }) : t("home.manual"),
        tone: newsAutoRefresh ? "info" : "neutral",
      },
      {
        id: "fno",
        label: t("home.fnoLabel"),
        value: `${snapshot.fnoSignal}${snapshot.fnoPcr != null ? ` | ${snapshot.fnoPcr.toFixed(2)}` : ""}`,
        tone: getSystemTone(snapshot.fnoSignal),
      },
    ],
    [newsAutoRefresh, newsRefreshSec, realtimeMode, selectedMarket, snapshot.fnoPcr, snapshot.fnoSignal, snapshot.updatedAt, updatedLabel, user, t],
  );

  const leadHeadline = newsLog[0] ?? null;

  return (
    <TerminalShell
      contentClassName="bg-terminal-bg"
      hideTickerLoader
      showMobileBottomNav
      showWorkspaceControls={false}
      statusBarTickerOverride={t("home.statusOverride")}
    >
      <div className="relative min-h-full bg-terminal-bg">
        {initializing ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-terminal-bg/95" role="status" aria-live="polite">
            <p className="ot-type-panel-title uppercase tracking-[0.18em] text-terminal-accent">{t("home.initializing")}</p>
            <div className="h-1.5 w-64 overflow-hidden rounded-full border border-terminal-border bg-terminal-panel/80">
              <span className="block h-full w-2/3 animate-pulse bg-terminal-accent/80" />
            </div>
          </div>
        ) : null}

        {!initializing ? (
          <main className="flex min-h-full flex-col gap-3 p-3 md:p-4" aria-label={t("home.missionAria")}>
            <section className="rounded-sm border border-terminal-border bg-terminal-panel/80 p-3" aria-label={t("home.headerAria")}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <p className="ot-type-panel-title uppercase tracking-[0.18em] text-terminal-accent">{t("home.missionControl")}</p>
                  <h1 className="text-2xl font-semibold uppercase tracking-[0.12em] text-terminal-text">{presetConfig.landing.headline}</h1>
                  <p className="max-w-3xl text-sm text-terminal-muted">
                    {presetConfig.landing.description}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-terminal-muted">
                    <span className="rounded-sm border border-terminal-border px-2 py-1">
                      {t("home.desk")} {(user?.email || "unknown").toUpperCase()}
                    </span>
                    <span className="rounded-sm border border-terminal-border px-2 py-1">
                      {t("home.market")} {selectedMarket}
                    </span>
                    <span className="rounded-sm border border-terminal-accent/60 px-2 py-1 text-terminal-accent">
                      {t("home.preset")} {presetConfig.label}
                    </span>
                    <span className="rounded-sm border border-terminal-border px-2 py-1">
                      {t("home.currency")} {displayCurrency}
                    </span>
                    <span className="rounded-sm border border-terminal-border px-2 py-1">
                      {t("home.refresh")} {newsAutoRefresh ? `${newsRefreshSec}s` : t("home.refreshManual")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:items-end">
                  <LiveClockStrip />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-sm border border-terminal-border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                      onClick={() => navigate("/equity/portfolio")}
                    >
                      {t("home.portfolioHq")}
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-terminal-accent px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-terminal-accent hover:bg-terminal-accent/10"
                      onClick={() => navigate(presetConfig.landing.primaryRoute)}
                    >
                      {presetConfig.landing.primaryLabel}
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-terminal-border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                      onClick={() => navigate("/equity/launchpad")}
                    >
                      {t("home.launchpad")}
                    </button>
                    <button
                      type="button"
                      className="rounded-sm border border-terminal-border px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                      onClick={() => navigate("/equity/news")}
                    >
                      {t("home.intelWire")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <MarketHeatStrip
                  ariaLabel={t("home.marketHeatAria")}
                  items={heatItems}
                  selectedItemId={selectedHeatId}
                  formatValue={(value) => (typeof value === "number" ? formatPrice(value) : "--")}
                  onSelect={(item) => setSelectedHeatId(item.id)}
                />
              </div>
            </section>

            <div className="grid grid-cols-1">
              <AiInsightCard
                title={t("home.aiOutlook")}
                description={t("home.aiOutlookSub")}
                fetcher={() => fetchCollectionBriefing(MARKET_PULSE_SYMBOLS, "global markets")}
              />
            </div>

            <section className="rounded-sm border border-terminal-border bg-terminal-panel/80 p-3" aria-label={t("home.ideasRadar")}>
              <div className="mb-3">
                <h2 className="ot-type-panel-title uppercase tracking-[0.14em] text-terminal-accent">{t("home.ideasRadar")}</h2>
                <p className="mt-1 text-sm text-terminal-muted">
                  {t("home.ideasRadarSub", { market: ideasMarket })}
                </p>
              </div>
              <IdeasRadar market={ideasMarket} />
            </section>

            {showHomeSection("portfolio") || showHomeSection("health") || showHomeSection("news") ? (
            <section className="grid gap-3 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]" aria-label={t("home.portfolioHq")}>
              {showHomeSection("portfolio") ? (
              <div className="rounded-sm border border-terminal-border bg-terminal-panel/80 p-3">
                <div className="flex flex-col gap-3 border-b border-terminal-border pb-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="ot-type-panel-title uppercase tracking-[0.14em] text-terminal-accent">{t("home.portfolioHq")}</h2>
                    <p className="mt-1 text-sm text-terminal-muted">
                      {t("home.portfolioHqSub")}
                    </p>
                  </div>
                  <ProfileCompletionRing
                    value={profileCompletion}
                    missingFields={profileMissingFields}
                    className="shrink-0"
                  />
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                  <MetricCard
                    label={t("home.netLiquidation")}
                    value={formatInr(snapshot.equityValue)}
                    tone={getMetricTone(snapshot.equityPnl)}
                    delta={
                      snapshot.equityPnl == null
                        ? undefined
                        : {
                            label: `${formatSignedInr(snapshot.equityPnl)} (${formatPercent(equityPnlPct)})`,
                            tone: getMetricTone(snapshot.equityPnl),
                          }
                    }
                    details={[
                      { label: t("home.holdings"), value: String(snapshot.holdingsCount) },
                      { label: t("home.watchlist"), value: String(snapshot.watchlistCount), tone: "accent" },
                      { label: t("home.backtests"), value: String(snapshot.backtestPresetCount) },
                      { label: t("home.sync"), value: updatedLabel, tone: "neutral" },
                    ]}
                    sparklinePoints={performancePoints}
                    sparklineAriaLabel={t("home.netLiquidation")}
                    footer={
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-sm border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                          onClick={() => navigate("/equity/portfolio")}
                        >
                          {t("home.openPortfolio")}
                        </button>
                        <button
                          type="button"
                          className="rounded-sm border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                          onClick={() => navigate("/backtesting")}
                        >
                          {t("home.runBacktests")}
                        </button>
                      </div>
                    }
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      label={t("home.marketFocus")}
                      value={focusedMarket?.ltp && focusedMarket.ltp > 0 ? formatPrice(focusedMarket.ltp) : "--"}
                      tone={getMetricTone(focusedMarket?.chg ?? null)}
                      delta={
                        focusedMarket
                          ? {
                              label:
                                focusedMarket.ltp > 0
                                  ? `${focusedMarket.chg >= 0 ? "+" : ""}${formatPrice(focusedMarket.chg)} (${formatPercent(focusedMarket.chgPct)})`
                                  : "--",
                              tone: getMetricTone(focusedMarket.chg),
                            }
                          : undefined
                      }
                      details={[
                        { label: t("home.ticker"), value: focusedMarket?.label || "--" },
                        { label: t("home.deskLabel"), value: selectedMarket, tone: "accent" },
                      ]}
                    />

                    <MetricCard
                      label={t("home.fnoRegime")}
                      value={snapshot.fnoSignal === "NA" ? t("home.noData") : snapshot.fnoSignal}
                      tone={getSignalTone(snapshot.fnoSignal)}
                      details={[
                        {
                          label: "PCR",
                          value: snapshot.fnoPcr != null ? snapshot.fnoPcr.toFixed(2) : "—",
                          tone: getSignalTone(snapshot.fnoSignal),
                        },
                        {
                          label: t("home.spot"),
                          value: snapshot.fnoSpot != null ? formatPrice(snapshot.fnoSpot) : "—",
                        },
                      ]}
                    />

                    <MetricCard
                      label={t("home.watchlistRadar")}
                      value={t("home.symbols", { count: snapshot.watchlistCount })}
                      tone={snapshot.watchlistCount > 0 ? "accent" : "neutral"}
                      delta={{
                        label: t("home.fnoLinked", { count: snapshot.watchlistDerivativesCount }),
                        tone: snapshot.watchlistDerivativesCount > 0 ? "up" : "neutral",
                      }}
                      details={[
                        { label: t("home.derivatives"), value: String(snapshot.watchlistDerivativesCount) },
                        { label: t("home.relay"), value: realtimeMode.toUpperCase() },
                      ]}
                    />

                    <MetricCard
                      label={t("home.researchQueue")}
                      value={t("home.headlinesCount", { count: newsLog.length })}
                      tone={leadHeadline?.sentiment?.label === "Bearish" ? "down" : leadHeadline ? "accent" : "neutral"}
                      delta={{
                        label: newsAutoRefresh ? t("home.autoRefresh", { sec: newsRefreshSec }) : t("home.manualNews"),
                        tone: newsAutoRefresh ? "accent" : "neutral",
                      }}
                      details={[
                        { label: t("home.leadSource"), value: leadHeadline?.source || "--" },
                        { label: t("home.headlines"), value: String(newsLog.length) },
                      ]}
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-sm border border-terminal-border bg-terminal-bg/40 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="ot-type-panel-title uppercase tracking-[0.14em] text-terminal-accent">{t("home.perf30d")}</h3>
                      <p className="mt-1 text-xs text-terminal-muted">
                        {t("home.perf30dSub")}
                      </p>
                    </div>
                    <span className="rounded-sm border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-terminal-muted">
                      {t("home.synced", { time: updatedLabel })}
                    </span>
                  </div>
                  <PortfolioMiniChart
                    points={performanceSeries}
                    benchmarkPoints={benchmarkSeries}
                    ariaLabel={t("home.portfolioChartAria")}
                    valueFormatter={(value) => formatInr(value)}
                  />
                </div>
              </div>
              ) : null}

              {showHomeSection("health") || showHomeSection("news") ? (
              <div className="space-y-3">
                {showHomeSection("health") ? (
                <section className="rounded-sm border border-terminal-border bg-terminal-panel/80 p-3" aria-label={t("home.systemHealth")}>
                  <div className="mb-3">
                    <h2 className="ot-type-panel-title uppercase tracking-[0.14em] text-terminal-accent">{t("home.systemHealth")}</h2>
                    <p className="mt-1 text-sm text-terminal-muted">
                      {t("home.systemHealthSub")}
                    </p>
                  </div>
                  <SystemHealthBar ariaLabel={t("home.healthAria")} items={systemHealthItems} />
                  <div className="mt-3 grid gap-2 text-xs text-terminal-muted sm:grid-cols-2">
                    <div className="rounded-sm border border-terminal-border bg-terminal-bg/40 px-2 py-2">
                      <span className="block text-[11px] uppercase tracking-[0.12em]">{t("home.focusAsset")}</span>
                      <span className="mt-1 block text-sm text-terminal-text">{focusedMarket?.label || "--"}</span>
                    </div>
                    <div className="rounded-sm border border-terminal-border bg-terminal-bg/40 px-2 py-2">
                      <span className="block text-[11px] uppercase tracking-[0.12em]">{t("home.deskMode")}</span>
                      <span className="mt-1 block text-sm text-terminal-text">
                        {selectedMarket} / {displayCurrency}
                      </span>
                    </div>
                  </div>
                </section>
                ) : null}

                {showHomeSection("news") ? (
                <section className="rounded-sm border border-terminal-border bg-terminal-panel/80 p-3" aria-label={t("home.intelWire")}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="ot-type-panel-title uppercase tracking-[0.14em] text-terminal-accent">{t("home.intelWire")}</h2>
                      <p className="mt-1 text-sm text-terminal-muted">
                        {t("home.intelWireSub")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-sm border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                      onClick={() => navigate("/equity/news")}
                    >
                      {t("home.openNews")}
                    </button>
                  </div>

                  {newsLog.length > 0 ? (
                    <ol className="space-y-2" role="list" aria-label={t("home.latestHeadlines")}>
                      {newsLog.slice(0, 5).map((entry) => (
                        <li key={String(entry.id)} className="rounded-sm border border-terminal-border bg-terminal-bg/40 p-2">
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block focus-visible:outline-none focus-visible:text-terminal-accent hover:text-terminal-accent"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.12em] text-terminal-muted">
                                  {entry.source}
                                  {entry.published_at
                                    ? ` • ${new Date(entry.published_at).toLocaleTimeString("en-US", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: false,
                                      })}`
                                    : ""}
                                </p>
                                <p className="mt-1 text-sm font-medium text-terminal-text">{entry.title}</p>
                              </div>
                              {entry.sentiment ? (
                                <span className={`shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] ${getSentimentClass(entry.sentiment.label)}`}>
                                  {entry.sentiment.label} {Math.round(entry.sentiment.confidence * 100)}%
                                </span>
                              ) : null}
                            </div>
                          </a>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <GuidedEmptyState
                      title="Start the news radar"
                      message="Create a watchlist or open the news desk so the home wire has symbols and headlines to prioritize."
                      icon="NEWS"
                      actions={[
                        { label: "Create Watchlist", onClick: () => navigate("/equity/watchlist") },
                        { label: "Open News", onClick: () => navigate("/equity/news") },
                      ]}
                    />
                  )}
                </section>
                ) : null}
              </div>
              ) : null}
            </section>
            ) : null}

            {showHomeSection("results") || showHomeSection("heatmap") || showHomeSection("timeline") ? (
            <section className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]" aria-label={t("home.dashboardIntel")}>
              <div className="space-y-3">
                {showHomeSection("results") ? <ResultsSummaryCards
                  results={dashboardResults}
                  loading={resultsLoading}
                  onRunBacktest={() => navigate("/backtesting")}
                /> : null}
                {showHomeSection("heatmap") ? <ExposureHeatmap
                  title="Portfolio Exposure Heatmap"
                  market={selectedMarket}
                  items={portfolioItems}
                  defaultMode="sector"
                  onCreateWatchlist={() => navigate("/equity/watchlist")}
                  onOpenRisk={() => navigate("/equity/risk")}
                /> : null}
              </div>
              {showHomeSection("timeline") ? <IntelligenceTimeline
                market={selectedMarket}
                symbols={portfolioItems.map((item) => item.ticker)}
                limit={10}
                title="Home Intelligence Timeline"
                onAddAlert={() => navigate("/equity/alerts")}
                onOpenScreener={() => navigate("/equity/screener")}
              /> : null}
            </section>
            ) : null}

            {showHomeSection("launch") ? (
            <section className="rounded-sm border border-terminal-border bg-terminal-panel/80 p-3" aria-label={t("home.launchMatrix")}>
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="ot-type-panel-title uppercase tracking-[0.14em] text-terminal-accent">{t("home.launchMatrix")}</h2>
                  <p className="mt-1 text-sm text-terminal-muted">
                    {t("home.launchMatrixSub")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-sm border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                    onClick={() => navigate("/equity/chart-workstation")}
                  >
                    {t("home.openWorkstation")}
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-terminal-muted hover:border-terminal-accent hover:text-terminal-accent"
                    onClick={() => navigate("/equity/screener")}
                  >
                    {t("home.openScreener")}
                  </button>
                </div>
              </div>
              <QuickNavGrid ariaLabel={t("home.launchMatrixAria")} sections={launchSections} columnCount={4} />
            </section>
            ) : null}
          </main>
        ) : null}
      </div>
    </TerminalShell>
  );
}
