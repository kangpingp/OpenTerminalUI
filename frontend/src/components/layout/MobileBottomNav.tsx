import { NavLink } from "react-router-dom";
import { Home, List, LineChart, Search, Briefcase } from "lucide-react";

import { useI18n } from "../../i18n/useI18n";

export function MobileBottomNav() {
  const { t } = useI18n();
  const tabs = [
    { label: t("mobile.home"), path: "/home", icon: Home, ariaLabel: t("mobile.homeAria") },
    { label: t("mobile.watch"), path: "/equity/watchlist", icon: List, ariaLabel: t("mobile.watchAria") },
    { label: t("mobile.chart"), path: "/equity/chart-workstation", icon: LineChart, ariaLabel: t("mobile.chartAria") },
    { label: t("mobile.scan"), path: "/equity/screener", icon: Search, ariaLabel: t("mobile.scanAria") },
    { label: t("mobile.port"), path: "/equity/portfolio", icon: Briefcase, ariaLabel: t("mobile.portAria") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-terminal-border bg-terminal-panel px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 md:hidden" aria-label={t("nav.mobile")}>
      <div className="grid grid-cols-5 gap-1 text-[10px]">
        {tabs.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={item.ariaLabel}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 rounded border py-1.5 ${isActive ? "border-terminal-accent text-terminal-accent" : "border-terminal-border text-terminal-muted"}`
            }
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
