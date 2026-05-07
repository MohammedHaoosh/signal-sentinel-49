import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

export type ThemeName = "midnight" | "bloomberg" | "mint";

const themes: { id: ThemeName; label: string }[] = [
  { id: "midnight", label: "Midnight" },
  { id: "bloomberg", label: "Bloomberg" },
  { id: "mint", label: "Mint" },
];

export function applyTheme(t: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("theme", t);
  } catch {
    /* ignore */
  }
}

export function loadTheme(): ThemeName {
  if (typeof document === "undefined") return "midnight";
  try {
    const saved = (localStorage.getItem("theme") as ThemeName | null) ?? "midnight";
    document.documentElement.dataset.theme = saved;
    return saved;
  } catch {
    return "midnight";
  }
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeName>("midnight");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTheme(loadTheme());
  }, []);

  const select = (t: ThemeName) => {
    setTheme(t);
    applyTheme(t);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        aria-label="Switch theme"
      >
        <Palette className="h-3.5 w-3.5" />
        {themes.find((t) => t.id === theme)?.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              className={`block w-full px-3 py-2 text-left text-xs hover:bg-zinc-800 ${
                t.id === theme ? "text-emerald-400" : "text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
