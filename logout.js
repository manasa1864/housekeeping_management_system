/* =========================================================
   logout.js — universal logout button (safe + neutral style)
   - Injects its own CSS (no conflicts)
   - Auto-adds button to .side on every page
   - Redirects to index.html
========================================================= */

function injectLogoutCSS() {
  const css = `
    .logout-btn-uni {
      width: 100%;
      margin-top: 18px;
      padding: 10px 12px;
      font-weight: 700;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: #141b22;              /* neutral dark */
      color: #dfe7f1;
      cursor: pointer;
      transition: background .18s, filter .16s;
      text-align: center;
    }
    .logout-btn-uni:hover {
      background: rgba(255,255,255,0.08);
    }
    .logout-btn-uni:active {
      filter: brightness(1.15);
    }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

function injectLogoutButton() {
  const sidebar = document.querySelector(".side");
  if (!sidebar) return; // no sidebar on this page

  const btn = document.createElement("button");
  btn.className = "logout-btn-uni";
  btn.id = "logoutBtnUniversal";
  btn.textContent = "Logout";

  btn.onclick = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";   // ✅ redirect target
  };

  sidebar.appendChild(btn);
}

document.addEventListener("DOMContentLoaded", () => {
  injectLogoutCSS();
  injectLogoutButton();
});
