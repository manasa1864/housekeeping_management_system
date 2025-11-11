// manager.js — Manager adds tasks + resources; both flow to dept pages

/* ===== Keys (canonical + legacy mirror for compatibility) ===== */
const KEYS = {
  // Canonical keys used by Admin/Dept pages
  HK_TASKS: 'hk_tasks_v1',                // stored as { tasks: [...] }
  HK_TASK_PING: 'hk_tasks_pulse_v1',

  // Legacy Manager keys (kept as mirror so nothing else breaks)
  M_TASKS: 'hms_tasks_local_v1',          // stored as { tasks: [...] }
  M_TASK_PING: 'tasks-updated',

  // Resources (already canonical across pages)
  RES: 'hms_resources_local_v1',          // stored as { resources: [...] }
  RES_PING: 'resources-updated'
};

const $ = (s,p=document)=>p.querySelector(s);

/* ===== Small helpers ===== */
const safeGet = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const pulse   = (k) => { try { localStorage.setItem(k, String(Date.now())); window.dispatchEvent(new Event(k)); } catch {} };

/* ===== Department label normalization (matches dept-common.js) ===== */
function normDept(v){
  const k=String(v||'').toLowerCase().trim();
  const map = {
    'floor cleaning':'Floor Cleaning','room cleaning':'Room Cleaning','laundry':'Laundry',
    'food service':'Food Service','maintenance':'Maintenance','public area':'Public Area',
    'gardener':'Gardener','storekeeping':'Storekeeping','night shift':'Night Shift'
  };
  return map[k] || v || 'Floor Cleaning';
}

/* =================================================================
   TASKS — canonical source is hk_tasks_v1 { tasks: [...] }
   We also maintain a mirrored copy in hms_tasks_local_v1 for legacy.
================================================================= */

/* Read array of tasks from canonical with legacy fallback */
function readTasks(){
  const raw = safeGet(KEYS.HK_TASKS, null);
  if (raw && Array.isArray(raw.tasks)) return raw.tasks;
  if (Array.isArray(raw)) return raw; // extreme legacy (array saved directly)
  // fallback to old Manager bucket
  const legacy = safeGet(KEYS.M_TASKS, { tasks: [] });
  return Array.isArray(legacy.tasks) ? legacy.tasks : [];
}

/* Write array of tasks to canonical + mirror to legacy; fire both pulses */
function writeTasks(list){
  const tasks = Array.isArray(list) ? list : [];
  // Canonical
  setJSON(KEYS.HK_TASKS, { tasks });
  pulse(KEYS.HK_TASK_PING);
  // Mirror (legacy)
  setJSON(KEYS.M_TASKS, { tasks });
  pulse(KEYS.M_TASK_PING);
}

/* Create task (Manager) */
function addTaskMgr({title,assignee,dept,category,room}){
  const list = readTasks();
  // Make IDs resilient: numeric auto-inc if possible; else a prefixed random
  const numericIds = list.map(t => +t.id).filter(n => Number.isFinite(n));
  const nextNum = numericIds.length ? Math.max(...numericIds) + 1 : 1;
  const newId = Number.isFinite(nextNum) ? nextNum : ('m_' + Math.random().toString(36).slice(2));

  list.push({
    id: newId,
    title: String(title || `Task #${newId}`),
    assignee: String(assignee || ''),
    dept: normDept(dept || 'Floor Cleaning'),
    category: String(category || ''),
    type: String(category || ''),          // for compatibility with older filters
    room: String(room || '') || null,
    status: 'Pending',
    createdOn: new Date().toISOString()
  });
  writeTasks(list);
}

/* =================================================================
   RESOURCES — already aligned with dept pages; no change in keys
================================================================= */
function readResBlob(){
  const b = safeGet(KEYS.RES, { resources: [] });
  if (!b || !Array.isArray(b.resources)) return { resources: [] };
  return b;
}
function writeResBlob(obj){
  setJSON(KEYS.RES, obj || { resources: [] });
  pulse(KEYS.RES_PING);
}
function addResource({item,assignee,dept,quantity,unit,neededOn,notes,status}){
  const blob = readResBlob();
  const max = blob.resources.length ? Math.max(...blob.resources.map(r=>+r.id||0)) : 0;
  blob.resources.push({
    id: max + 1,
    item: String(item || 'Item'),
    assignee: String(assignee || ''),
    dept: normDept(dept || 'Floor Cleaning'),
    quantity: Number(quantity || 1),
    unit: String(unit || 'pcs'),
    neededOn: neededOn || '',
    notes: String(notes || ''),
    status: status || 'Requested',
    createdOn: new Date().toISOString()
  });
  writeResBlob(blob);
}
function updateResource(id, patch){
  const b = readResBlob();
  const r = b.resources.find(x => String(x.id) === String(id));
  if (!r) return;
  Object.assign(r, patch || {});
  writeResBlob(b);
}
function removeResource(id){
  const b = readResBlob();
  b.resources = b.resources.filter(x => String(x.id) !== String(id));
  writeResBlob(b);
}

/* ===== UI helpers ===== */
function toast(m){
  const t=$("#toastM"); if(!t) return;
  t.textContent=m; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1400);
}

/* ===== Render: Tasks ===== */
function renderTasks(){
  const q  = ($("#searchTasks")?.value||'').toLowerCase().trim();
  const fd = $("#filterDept")?.value||'';
  const fs = $("#filterStatusM")?.value||'All';
  const host = $("#mgrTaskList"); if (!host) return;
  host.innerHTML='';

  let list = readTasks();
  if(fd) list = list.filter(t=>t.dept===fd);
  if(fs!=='All') list = list.filter(t=>(t.status||'Pending')===fs);
  if(q) list = list.filter(t=>`${t.title||''} ${t.assignee||''} ${t.room||''} ${t.category||t.type||''}`.toLowerCase().includes(q));

  list.slice().reverse().forEach(t=>{
    const pill=t.status==='Completed'?'pill done':t.status==='In Progress'?'pill wait':'pill over';
    const div=document.createElement('div'); div.className='item';
    div.innerHTML = `
      <div>
        <div style="font-weight:800">${t.title}</div>
        <div style="font-size:12px;opacity:.8">
          Assignee: ${t.assignee||'-'} • Dept: ${t.dept} • Type: ${t.category||t.type||'-'} • Room: ${t.room||'-'}
        </div>
      </div>
      <div>
        ${t.status!=='Completed'?`<button class="btn" data-complete="${t.id}">Complete</button>`:''}
        <button class="btn ghost" data-del="${t.id}">Delete</button>
      </div>`;
    host.appendChild(div);
  });
}

/* ===== Render: Resources ===== */
function renderResources(){
  const body=$("#resBody"); if (!body) return;
  body.innerHTML='';
  const q = ($("#resSearch")?.value||'').toLowerCase().trim();
  const dept = $("#resDept")?.value||'';
  const st = $("#resStatus")?.value||'All';

  const list = readResBlob().resources
    .filter(r=>!dept || r.dept===dept)
    .filter(r=>st==='All' || (r.status||'Requested')===st)
    .filter(r=>!q || `${r.item} ${r.assignee} ${r.dept}`.toLowerCase().includes(q));

  if(!list.length){
    body.innerHTML=`<tr><td colspan="8" style="color:#a6b2bf;text-align:center;padding:12px">No resources</td></tr>`;
    return;
  }

  list.slice().reverse().forEach((r,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.item}</td>
      <td>${r.assignee||'-'}</td>
      <td>${r.dept}</td>
      <td>${r.quantity} ${r.unit||''}</td>
      <td>${r.neededOn||'-'}</td>
      <td>${r.status||'Requested'}</td>
      <td>
        <button class="btn" data-rstatus="${r.id}">Advance</button>
        <button class="btn ghost" data-rdel="${r.id}">Delete</button>
      </td>`;
    body.appendChild(tr);
  });
}

/* ===== Events ===== */
document.addEventListener('click', e=>{
  const b=e.target.closest('button'); if(!b) return;

  // open/close modals
  if(b.id==='btnAddTaskM'){
    $("#m_title").value=''; $("#m_assignee").value='';
    $("#m_dept").value='Floor Cleaning'; $("#m_category").value=''; $("#m_room").value='';
    $("#taskModalM").style.display='flex';
  }
  if(b.id==='closeTaskModalM'||b.id==='cancelM'){ $("#taskModalM").style.display='none'; }

  if(b.id==='btnAddRes'||b.id==='btnAddResTop'){
    $("#r_item").value=''; $("#r_assignee").value='';
    $("#r_dept").value='Floor Cleaning'; $("#r_qty").value='1'; $("#r_unit").value='pcs';
    $("#r_needed").value=''; $("#r_notes").value=''; $("#r_status").value='Requested';
    $("#resModal").style.display='flex';
  }
  if(b.id==='closeRes'||b.id==='cancelRes'){ $("#resModal").style.display='none'; }

  // save task
  if(b.id==='saveM'){
    const title=$("#m_title").value.trim(); if(!title) return toast('Enter title');
    addTaskMgr({
      title,
      assignee:$("#m_assignee").value.trim(),
      dept:$("#m_dept").value.trim(),
      category:$("#m_category").value.trim(),
      room:$("#m_room").value.trim()
    });
    $("#taskModalM").style.display='none'; toast('Task created'); renderTasks();
  }

  // task actions
  if(b.dataset.complete){
    const list=readTasks();
    const t=list.find(x=>String(x.id)===b.dataset.complete);
    if(t){
      t.status='Completed';
      t.doneOn=new Date().toISOString().slice(0,10);
      writeTasks(list);
      renderTasks();
      toast('Completed');
    }
  }
  if(b.dataset.del){
    const list=readTasks().filter(x=>String(x.id)!==b.dataset.del);
    writeTasks(list); renderTasks(); toast('Deleted');
  }

  // save resource
  if(b.id==='saveRes'){
    const item=$("#r_item").value.trim(); if(!item) return toast('Enter item');
    addResource({
      item,
      assignee:$("#r_assignee").value.trim(),
      dept:$("#r_dept").value.trim(),
      quantity:$("#r_qty").value,
      unit:$("#r_unit").value.trim(),
      neededOn:$("#r_needed").value,
      notes:$("#r_notes").value.trim(),
      status:$("#r_status").value
    });
    $("#resModal").style.display='none'; toast('Resource saved'); renderResources();
  }

  // resource actions
  if(b.dataset.rdel){ removeResource(b.dataset.rdel); toast('Resource deleted'); renderResources(); }
  if(b.dataset.rstatus){
    const id=b.dataset.rstatus; const next={'Requested':'Approved','Approved':'Issued','Issued':'Issued'};
    const blob=readResBlob(); const r=blob.resources.find(x=>String(x.id)===String(id));
    if(r){ r.status=next[r.status||'Requested']||'Approved'; writeResBlob(blob); toast(`Status: ${r.status}`); renderResources(); }
  }
});

/* ===== Filters ===== */
['searchTasks','filterDept','filterStatusM'].forEach(id=>document.getElementById(id)?.addEventListener('input',renderTasks));
['resDept','resStatus','resSearch'].forEach(id=>document.getElementById(id)?.addEventListener('input',renderResources));

/* ===== Cross-tab sync ===== */
window.addEventListener('storage', e=>{
  if ([KEYS.HK_TASKS, KEYS.HK_TASK_PING, KEYS.M_TASKS, KEYS.M_TASK_PING].includes(e.key)) renderTasks();
  if (e.key===KEYS.RES || e.key===KEYS.RES_PING) renderResources();
});

/* ===== Boot ===== */
document.addEventListener('DOMContentLoaded', ()=>{ renderTasks(); renderResources(); });
