// nav.js — highlights the active link in the sidebar
document.addEventListener("DOMContentLoaded", () => {
  try {
    const path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-link").forEach(link => {
      const href = link.getAttribute("href") || "";
      if (href === path || (href === "" && path === "index.html")) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      } else {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
      }
    });
  } catch (e) {
    console.warn("nav.js error:", e);
  }
});
