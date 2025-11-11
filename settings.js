/*
  settings.js — Housekeeping Settings page logic (no time-format)
  - Saves profile, theme, and work prefs to localStorage
  - Dark/Light theme applies instantly + hint text always matches
  - Reset buttons work (tasks-only, staff-only, full reset)
  - Emits:
      'hk:settings-changed' detail: { section, data }
      'hk:system-reset'     detail: { scope }
*/
(function SettingsModule() {
  "use strict";

  // ======= DOM -------
  const el = {
    hotelName: document.getElementById("hotelName"),
    adminName: document.getElementById("adminName"),
    saveProfile: document.getElementById("saveProfile"),

    themeSelect: document.getElementById("themeSelect"),
    themeHint: document.getElementById("themeHint"),

    autoAssign: document.getElementById("autoAssign"),
    autoRemind: document.getElementById("autoRemind"),
    staffComplete: document.getElementById("staffComplete"),

    clearTasks: document.getElementById("clearTasks"),
    clearStaff: document.getElementById("clearStaff"),
    resetAll: document.getElementById("resetAll"),
  };

  // ======= Storage keys / defaults -------
  const KEYS = {
    profile: "hk:profile",
    prefs: "hk:prefs",
    work: "hk:workPrefs",
    broadcast: "hk:broadcast",
  };

  const defaults = {
    profile: { hotelName: "", adminName: "" },
    prefs: { theme: "dark" },
    work: { autoAssign: false, autoRemind: true, staffComplete: true },
  };

  // ======= Helpers -------
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function broadcast(type, payload) {
    try {
      localStorage.setItem(KEYS.broadcast, JSON.stringify({ type, payload, ts: Date.now() }));
    } catch {}
    window.dispatchEvent(new CustomEvent(type, { detail: payload }));
  }

  // ======= Theme handling (Dark/Light + matching words) -------
  let themeStyleEl = null;
  function applyTheme(theme) {
    const t = (theme === "light") ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);

    // Update hint so words always match the selected theme
    if (el.themeHint) el.themeHint.textContent = `Theme: ${t[0].toUpperCase() + t.slice(1)}`;

    if (t === "light") {
      if (!themeStyleEl) {
        themeStyleEl = document.createElement("style");
        themeStyleEl.setAttribute("data-hk-theme", "light");
        document.head.appendChild(themeStyleEl);
      }
      // Override CSS variables for light
      themeStyleEl.textContent =
        `:root{--bg:#f6f8fb;--side:#ffffff;--panel:#ffffff;--line:rgba(0,0,0,.08);--ink:#0b1116;--mut:#445166;--brand:#2b74ff;--brand2:#1a59e6}
         body{background:var(--bg);color:var(--ink)}`;
    } else {
      if (themeStyleEl) { themeStyleEl.remove(); themeStyleEl = null; }
    }
  }

  // Small debounce to avoid thrashing
  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  // ======= Load from storage -------
  function populateFromStorage() {
    const profile = readJSON(KEYS.profile, defaults.profile);
    const prefs = readJSON(KEYS.prefs, defaults.prefs);
    const work = readJSON(KEYS.work, defaults.work);

    // Profile
    if (el.hotelName) el.hotelName.value = profile.hotelName || "";
    if (el.adminName) el.adminName.value = profile.adminName || "";

    // Theme (keep the words in the select in sync)
    const theme = (prefs.theme === "light") ? "light" : "dark";
    if (el.themeSelect) el.themeSelect.value = theme;
    applyTheme(theme);

    // Work prefs
    if (el.autoAssign) el.autoAssign.checked = !!work.autoAssign;
    if (el.autoRemind) el.autoRemind.checked = !!work.autoRemind;
    if (el.staffComplete) el.staffComplete.checked = !!work.staffComplete;
  }

  // ======= Save handlers -------
  function saveProfile() {
    const next = {
      hotelName: (el.hotelName?.value || "").trim(),
      adminName: (el.adminName?.value || "").trim(),
    };
    writeJSON(KEYS.profile, next);
    broadcast("hk:settings-changed", { section: "profile", data: next });
    toastHint("Profile saved ✅");
  }

  function saveTheme() {
    const theme = (el.themeSelect?.value === "light") ? "light" : "dark";
    const next = { theme };
    writeJSON(KEYS.prefs, next);
    applyTheme(theme);
    broadcast("hk:settings-changed", { section: "prefs", data: next });
    toastHint(`Theme set to ${theme === "light" ? "Light" : "Dark"} ✅`);
  }
  const saveThemeDebounced = debounce(saveTheme, 120);

  function saveWorkPrefs() {
    const next = {
      autoAssign: !!el.autoAssign?.checked,
      autoRemind: !!el.autoRemind?.checked,
      staffComplete: !!el.staffComplete?.checked,
    };
    writeJSON(KEYS.work, next);
    broadcast("hk:settings-changed", { section: "work", data: next });
    toastHint("Work preferences saved ✅");
  }
  const saveWorkDebounced = debounce(saveWorkPrefs, 120);

  // ======= Tiny hint helper (reuses nearest .hint if present) -------
  function toastHint(text) {
    // Prefer the hint in the currently interacted card if possible:
    const active = document.activeElement;
    let hintEl = active?.closest(".card")?.querySelector(".hint")
               || document.querySelector(".card .hint");
    if (!hintEl) return;
    const original = hintEl.textContent;
    hintEl.textContent = text;
    hintEl.style.opacity = "1";
    setTimeout(() => { hintEl.textContent = original; }, 1500);
  }

  // ======= Reset logic (buttons work) -------
  function clearByPrefix(prefix) {
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) remove.push(key);
    }
    remove.forEach(k => localStorage.removeItem(k));
  }

  function resetTasksOnly() {
    const prefixes = ["hk:tasks", "hk:task:", "hk:rooms", "hk:room:", "hk:history", "hk:events"];
    prefixes.forEach(clearByPrefix);
  }

  function resetStaffOnly() {
    const prefixes = ["hk:staff", "hk:staff:", "hk:roster", "hk:team:"];
    prefixes.forEach(clearByPrefix);
  }

  function resetEverything() {
    const remove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("hk:")) remove.push(key);
    }
    remove.forEach(k => localStorage.removeItem(k));
  }

  // ======= Wire events -------
  function wireEvents() {
    el.saveProfile?.addEventListener("click", saveProfile);

    el.themeSelect?.addEventListener("change", saveThemeDebounced);

    el.autoAssign?.addEventListener("change", saveWorkDebounced);
    el.autoRemind?.addEventListener("change", saveWorkDebounced);
    el.staffComplete?.addEventListener("change", saveWorkDebounced);

    el.clearTasks?.addEventListener("click", () => {
      if (!confirm("Clear all tasks, room states, and related history?")) return;
      resetTasksOnly();
      broadcast("hk:system-reset", { scope: "tasks" });
      alert("Tasks & room data cleared.");
    });

    el.clearStaff?.addEventListener("click", () => {
      if (!confirm("Clear all staff and rosters?")) return;
      resetStaffOnly();
      broadcast("hk:system-reset", { scope: "staff" });
      alert("Staff data cleared.");
    });

    el.resetAll?.addEventListener("click", () => {
      if (!confirm("Reset the entire Housekeeping app data (hk:*)? This cannot be undone.")) return;
      resetEverything();
      broadcast("hk:system-reset", { scope: "all" });
      alert("All Housekeeping app data cleared. Reloading…");
      location.reload();
    });
  }

  // ======= Init -------
  document.addEventListener("DOMContentLoaded", () => {
    populateFromStorage();
    wireEvents();
  });
})();
