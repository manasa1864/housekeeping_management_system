/****************************************************
 admin.js — Dashboard (graphs visibility fix only)
****************************************************/
const $ = (q) => document.querySelector(q);
const LS = {
  get(k, fb){ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{ return fb; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};

const KEY_STAFF="hk_staff";
const KEY_HIDE_BARS="hk_staff_bars_hidden";
const KEY_TASKS="hk_tasks_v1";
const ROOMS_AGG_KEY="hms_rooms_occupancy_v1";
const ROOMS_UPDATED_PULSE="rooms-updated";
const TASKS_PULSE="hk_tasks_pulse_v1";
const STAFF_PULSE="hk_staff_pulse_v1";
function pulse(key){ try{ localStorage.setItem(key, String(Date.now())); }catch{} }

(function ensure(){
  if (!LS.get(KEY_STAFF)) LS.set(KEY_STAFF, []);
  if (!LS.get(KEY_HIDE_BARS)) LS.set(KEY_HIDE_BARS, []);
  const r=LS.get(KEY_TASKS);
  if (!r) LS.set(KEY_TASKS,{tasks:[]});
  else if (Array.isArray(r)) LS.set(KEY_TASKS,{tasks:r});
  else if (!Array.isArray(r.tasks)) LS.set(KEY_TASKS,{tasks:[]});
})();

function getTasks(){ const d=LS.get(KEY_TASKS,{tasks:[]}); return Array.isArray(d)?d:d.tasks; }
function setTasks(x){ LS.set(KEY_TASKS,{tasks:x}); pulse(TASKS_PULSE); }

const cs=getComputedStyle(document.documentElement);
const INK=cs.getPropertyValue("--ink").trim()||"#fff";
const MUT=cs.getPropertyValue("--mut").trim()||"#aaa";
const BRAND=cs.getPropertyValue("--brand").trim()||"#2b74ff";
const BRAND2=cs.getPropertyValue("--brand2").trim()||"#1a59e6";

function hexToRgba(hex,a=1){
  const h=hex.replace("#",""); const n=parseInt(h.length===3?h.split("").map(x=>x+x).join(""):h,16);
  const r=(n>>16)&255,g=(n>>8)&255,b=n&255; return `rgba(${r},${g},${b},${a})`;
}
function grad(ctx,area,from=BRAND,to=BRAND2,aTop=1,aBot=1){
  const g=ctx.createLinearGradient(0,area.bottom,0,area.top);
  g.addColorStop(0,hexToRgba(from,aBot)); g.addColorStop(1,hexToRgba(to,aTop)); return g;
}

const toastEl=$("#toast");
const toast=(t)=>{ if(!toastEl) return; toastEl.textContent=t; toastEl.classList.add("show"); setTimeout(()=>toastEl.classList.remove("show"),1500); };

let taskTrendChart,staffBarChart,roomDonut;

const baseOpts={
  responsive:true,maintainAspectRatio:false,animation:{duration:300},
  plugins:{legend:{labels:{color:INK}},tooltip:{backgroundColor:"#000",titleColor:"#fff",bodyColor:"#fff"}},
  scales:{x:{ticks:{color:INK},grid:{color:"rgba(255,255,255,.08)"}},y:{ticks:{color:INK},grid:{color:"rgba(255,255,255,.08)"}}}
};

/* ===== Task Trend ===== */
(function(){
  const ctx=$("#taskTrendChart")?.getContext("2d"); if(!ctx) return;
  const sel=$("#yearSelect"); const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  if(sel){ sel.innerHTML="<option value='this'>This Week</option><option value='last'>Last Week</option>"; sel.value="this"; }

  function week(which){
    const staff=(LS.get(KEY_STAFF,[])||[]).length||1; const base=10+staff*4;
    const rnd=(s)=>{const x=Math.sin(s)*10000;return x-Math.floor(x);};
    const jit=(i)=> which==="this"?(Math.random()*10-5):(rnd(i+3)*10-5);
    const done=days.map((_,i)=>Math.max(2,Math.round(base+jit(i))));
    const pend=done.map(v=>Math.max(1,Math.round(v*0.35)));
    return {done,pend};
  }

  function make(which){
    const d=week(which);
    return {
      labels:days,
      datasets:[
        {
          label:"Completed",
          data:d.done,
          tension:.35,
          borderColor(c){const a=c.chart?.chartArea;return a?grad(c.chart.ctx,a):BRAND;},
          backgroundColor(c){const a=c.chart?.chartArea;return a?grad(c.chart.ctx,a,BRAND,BRAND2,.25,.05):hexToRgba(BRAND,.3);},
          fill:true
        },
        {
          label:"Pending",
          data:d.pend,
          tension:.35,
          borderColor:hexToRgba(MUT,.9),
          backgroundColor:hexToRgba(MUT,.2),
          fill:true
        }
      ]
    };
  }

  taskTrendChart=new Chart(ctx,{type:"line",data:make("this"),options:{...baseOpts,plugins:{...baseOpts.plugins,legend:{display:false}}}});
  sel?.addEventListener("change",()=>{ taskTrendChart.data=make(sel.value); taskTrendChart.update(); });
})();

/* ===== Rooms Donut ===== */
(function(){
  const ctx=$("#roomDonut")?.getContext("2d"); if(!ctx) return;
  const read=()=>{const a=LS.get(ROOMS_AGG_KEY,{occupied:0,vacant:0,needs:0});return[a.occupied||0,a.vacant||0,a.needs||0];};
  roomDonut=new Chart(ctx,{type:"doughnut",
    data:{labels:["Occupied","Vacant","Needs"],datasets:[{data:read(),backgroundColor:[BRAND,hexToRgba(MUT,.4),"#ff7070"]}]},
    options:{...baseOpts,cutout:"70%",plugins:{legend:{labels:{color:INK}}}}
  });
  window.addEventListener("storage",(e)=>{if(e.key===ROOMS_AGG_KEY||e.key===ROOMS_UPDATED_PULSE){roomDonut.data.datasets[0].data=read();roomDonut.update();}});
})();

/* ===== Staff Bar (graphs-only edits: counts ALL assigned; safe fallback; y-range) ===== */
function staffCfg(){
  const staff=LS.get(KEY_STAFF,[]);
  const hide=new Set(LS.get(KEY_HIDE_BARS,[]));
  const tasks=getTasks();

  // Count ALL tasks per assignee (any status) so bars show even if none completed
  const counts={};
  for(const t of tasks){
    if(t.assignee) counts[t.assignee]=(counts[t.assignee]||0)+1;
  }

  // Fallback to staff.assigned if everything is zero
  const allZero = Object.values(counts).every(v => !v);
  if (allZero && staff?.length){
    for (const s of staff){
      counts[s.name] = s.assigned ? Number(s.assigned) : 0;
    }
  }

  const names=[...new Set([...staff.map(s=>s.name),...Object.keys(counts)])];
  const labels=names.filter(n=>n && !hide.has(n));
  const values=labels.map(n=>counts[n]||0);

  const suggestedMax=Math.max(5, Math.max(0,...values)+2);
  return {labels, values, suggestedMax};
}
function initStaffBar(){
  const ctx=$("#staffBarChart")?.getContext("2d"); if(!ctx) return;
  const d=staffCfg();
  staffBarChart=new Chart(ctx,{
    type:"bar",
    data:{
      labels:d.labels,
      datasets:[{
        label:"Assigned",
        data:d.values,
        backgroundColor(c){const a=c.chart?.chartArea;return a?grad(c.chart.ctx,a):BRAND;},
        borderRadius:8
      }]
    },
    options:{
      ...baseOpts,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ...baseOpts.scales.x },
        y:{ ...baseOpts.scales.y, suggestedMax: d.suggestedMax }
      },
      onClick(e){
        const el=staffBarChart.getElementsAtEventForMode(e,"nearest",{intersect:true},false)[0];
        if(!el) return;
        const n=staffBarChart.data.labels[el.index];
        const h=new Set(LS.get(KEY_HIDE_BARS,[])); h.add(n); LS.set(KEY_HIDE_BARS,[...h]);
        initStaffBar();
      }
    }
  });
}
function refreshSB(){
  if(!staffBarChart) return initStaffBar();
  const d=staffCfg();
  staffBarChart.data.labels=d.labels;
  staffBarChart.data.datasets[0].data=d.values;
  staffBarChart.options.scales.y.suggestedMax = d.suggestedMax;
  staffBarChart.update();
}

/* ===== UI (unchanged) ===== */
function wireStaffModal(){
  const m=$("#staffModal"); if(!m) return;
  $("#btnAddStaff")?.addEventListener("click",()=>m.style.display="flex");
  $("#closeStaffModal")?.addEventListener("click",()=>m.style.display="none");
  $("#cancelStaff")?.addEventListener("click",()=>m.style.display="none");
  $("#saveStaff")?.addEventListener("click",()=>{
    const name=$("#st_name").value.trim(); if(!name) return toast("Enter name");
    const staff=LS.get(KEY_STAFF,[]); if(staff.some(s=>s.name.toLowerCase()===name.toLowerCase())) return toast("Exists");
    staff.push({name,role:$("#st_role").value.trim(),type:$("#st_type").value,status:$("#st_status").value,assigned:Number($("#st_assigned").value||0)});
    LS.set(KEY_STAFF,staff); pulse(STAFF_PULSE); m.style.display="none"; refresh(); initStaffBar();
  });
}
function wireTaskModal(){
  const m=$("#taskModal");
  const open=()=>{ $("#assignees_list").innerHTML=(LS.get(KEY_STAFF,[])||[]).map(s=>`<option value="${s.name}"></option>`).join(""); m.style.display="flex"; };
  $("#btnAddTask")?.addEventListener("click",open); $("#btnAddTask2")?.addEventListener("click",open);
  $("#closeTaskModal")?.addEventListener("click",()=>m.style.display="none");
  $("#cancelTask")?.addEventListener("click",()=>m.style.display="none");
  $("#saveTask")?.addEventListener("click",()=>{
    const title=$("#tk_title").value.trim(); if(!title) return toast("Enter title");
    const tasks=getTasks();
    tasks.unshift({id:"t_"+Math.random(),title,assignee:$("#tk_assignee").value,dept:$("#tk_dept").value,category:$("#tk_category").value,room:$("#tk_room").value,status:"Pending",createdOn:new Date().toISOString()});
    setTasks(tasks); m.style.display="none"; renderTasks(); refresh(); refreshSB();
  });
}

function renderTasks(){
  const w=$("#taskList"); const t=getTasks();
  if(!t.length){ w.innerHTML="<div style='color:#aaa;padding:8px'>No tasks</div>"; return; }
  w.innerHTML=t.map(x=>`
<div class="item">
 <div><div style="font-weight:800">${x.title}</div><div style="color:#aaa;font-size:12px">${x.dept||""}${x.room?" • "+x.room:""}${x.assignee?" • "+x.assignee:""}</div></div>
 <div style="display:flex;gap:6px;align-items:center">
  <span class="pill ${x.status==="Completed"?"done":"wait"}">${x.status}</span>
  <button class="btn ghost" data-done="${x.id}" ${x.status==="Completed"?"disabled":""}>Done</button>
  <button class="btn ghost" data-del="${x.id}">Del</button>
 </div>
</div>`).join("");

  w.querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.done;const a=getTasks();const i=a.findIndex(z=>z.id==id);if(i>-1){a[i].status="Completed";setTasks(a);renderTasks();refresh();refreshSB();}
  });
  w.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    setTasks(getTasks().filter(z=>z.id!=b.dataset.del));renderTasks();refresh();refreshSB();
  });
}

function refresh(){
  const s=LS.get(KEY_STAFF,[]); $("#k_staff").textContent=s.length;
  const a=LS.get(ROOMS_AGG_KEY,{occupied:0,vacant:0,needs:0});
  $("#k_rooms").textContent=(a.occupied||0)+(a.vacant||0)+(a.needs||0);
  const t=getTasks();const d=t.filter(x=>x.status==="Completed").length;$("#k_done").textContent=d;$("#k_pending").textContent=t.length-d;
}

document.addEventListener("DOMContentLoaded",()=>{
  wireStaffModal(); wireTaskModal(); renderTasks(); refresh(); initStaffBar();
  window.addEventListener("storage",(e)=>{
    if([ROOMS_AGG_KEY,ROOMS_UPDATED_PULSE].includes(e.key)) refresh();
    if([KEY_TASKS,TASKS_PULSE].includes(e.key)){renderTasks();refresh();refreshSB();}
    if([KEY_STAFF,STAFF_PULSE].includes(e.key)){refresh();refreshSB();}
  });
});
