/* staff-pages.js — shared staff/task helpers for staff pages
   - Provides getSharedTasks / saveSharedTasks
   - Renders tasks for a staff type or assignee into #taskList (or creates floating panel)
   - Allows marking tasks Completed (updates localStorage + broadcast)
*/

(function(){
  const STORAGE_KEY = "hms_tasks_local_v1";
  const BROADCAST_KEY = "tasks-updated";

  // safe getter
  function getSharedTasks(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || "{}";
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.tasks) ? parsed.tasks : [];
    } catch(e){
      console.warn("getSharedTasks failed", e);
      return [];
    }
  }

  function saveSharedTasks(tasks){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: Array.isArray(tasks) ? tasks : [] }));
      // write broadcast key so other tabs pick up the change via storage event
      localStorage.setItem(BROADCAST_KEY, Date.now().toString());
    } catch(e){
      console.error("saveSharedTasks failed", e);
    }
  }

  function markTaskCompleted(id){
    const tasks = getSharedTasks();
    const t = tasks.find(x => String(x.id) === String(id));
    if(!t) return false;
    t.status = "Completed";
    t.doneOn = new Date().toISOString().slice(0,10);
    saveSharedTasks(tasks);
    return true;
  }

  function renderTaskItems(containerEl, tasks){
    containerEl.innerHTML = "";
    if(!tasks || tasks.length === 0){
      containerEl.innerHTML = `<div class="muted">No tasks assigned yet.</div>`;
      return;
    }

    tasks.forEach(t => {
      const div = document.createElement("div");
      div.className = "item";
      div.style.display = "flex";
      div.style.justifyContent = "space-between";
      div.style.alignItems = "center";
      div.style.padding = "10px";
      div.style.borderRadius = "8px";
      div.style.marginBottom = "8px";
      div.style.border = "1px solid rgba(0,0,0,0.04)";

      const title = escapeHtml(t.title || t.name || `Task #${t.id||"?"}`);
      const assignee = escapeHtml(t.assignee || "Unassigned");
      const room = escapeHtml(t.room || "-");
      const status = escapeHtml(t.status || "Pending");

      const rightButtons = `
        <span class="pill ${t.status === "Completed" ? "done" : t.status === "In Progress" ? "wait" : "over"}">${status}</span>
        ${t.status !== "Completed" ? `<button class="btn small mark-done" data-id="${escapeHtml(t.id)}" style="margin-left:8px">Complete</button>` : ""}
      `;

      div.innerHTML = `
        <div>
          <div style="font-weight:700">${title}</div>
          <div style="font-size:13px;color:#6b7a8c">Assignee: ${assignee} • Type: ${escapeHtml(t.type||"-")} • Room: ${room}</div>
        </div>
        <div style="text-align:right;min-width:140px">${rightButtons}</div>
      `;
      containerEl.appendChild(div);
    });
  }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function getRenderContainer(){
    // prefer page container #taskList, then #tasksSection, then create floating panel
    let container = document.getElementById("taskList") || document.getElementById("tasksSection") || document.getElementById("taskPanel");
    if(container && container.id === "tasksSection"){
      // we want the inner list area
      let inner = container.querySelector("#taskList");
      if(!inner){
        inner = document.createElement("div");
        inner.id = "taskList";
        container.appendChild(inner);
      }
      return inner;
    }
    if(!container){
      // create floating panel
      const panel = document.createElement("div");
      panel.id = "staffTasksFloating";
      panel.style.position = "fixed";
      panel.style.right = "18px";
      panel.style.bottom = "18px";
      panel.style.width = "320px";
      panel.style.maxHeight = "420px";
      panel.style.overflow = "auto";
      panel.style.zIndex = 9999;
      panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
      panel.style.background = "#fff";
      panel.style.borderRadius = "8px";
      panel.style.padding = "12px";
      panel.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Tasks</div><div id="taskList"></div>`;
      document.body.appendChild(panel);
      return panel.querySelector("#taskList");
    }
    return container;
  }

  function tasksForThisPage(allTasks){
    const cfg = window.STAFF_PAGE || {};
    const type = cfg.type || "";
    const staffName = cfg.staffName || "";
    // If there is no type and no staffName configured, show all tasks on this page
    if(!type && !staffName) return allTasks || [];
    return (allTasks || []).filter(t => {
      if(!t) return false;
      // match by assignee OR by type (case-insensitive)
      if(staffName && t.assignee && String(t.assignee).trim() === String(staffName).trim()) return true;
      if(type && t.type && String(t.type).trim().toLowerCase() === String(type).trim().toLowerCase()) return true;
      return false;
    });
  }

  // render current visible tasks
  function refreshTasksView(){
    const all = getSharedTasks();
    const visible = tasksForThisPage(all);
    const container = getRenderContainer();
    if(container) renderTaskItems(container, visible);
  }

  // click handler: mark done
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".mark-done");
    if(!btn) return;
    const id = btn.dataset.id;
    if(!id) return;
    const ok = markTaskCompleted(id);
    if(ok){
      refreshTasksView();
    }
  });

  // listen for storage broadcasts
  window.addEventListener("storage", (e) => {
    if(e.key === BROADCAST_KEY || e.key === STORAGE_KEY || e.key === "tasks-updated" || e.key === "hms_tasks_local_v1"){
      // refresh visible tasks for this page
      refreshTasksView();
    }
  });

  // initialize after DOM ready
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", refreshTasksView);
  else refreshTasksView();

  // Expose a small API for other scripts if needed
  window.SharedTasks = {
    get: getSharedTasks,
    save: saveSharedTasks,
    markDone: markTaskCompleted,
    refresh: refreshTasksView
  };
})();
