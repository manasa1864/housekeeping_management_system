/****************************************************
 dept-sync.js — Connects dept pages to Admin storage
****************************************************/
(function(){
  const KEY_TASKS   = "hk_tasks_v1";       // { tasks: [...] } or legacy array
  const KEY_STAFF   = "hk_staff";
  const TASKS_PULSE = "hk_tasks_pulse_v1";
  const STAFF_PULSE = "hk_staff_pulse_v1";

  const get = (k, fb)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{ return fb; } };

  function pull(dept){
    const tBlob = get(KEY_TASKS, { tasks: [] });
    const tasks = Array.isArray(tBlob?.tasks) ? tBlob.tasks
                 : Array.isArray(tBlob) ? tBlob
                 : [];
    const staff = get(KEY_STAFF, []);
    return {
      tasks: tasks.filter(t => (t.dept||"") === dept),
      staff: staff.filter(s => (s.type||"") === dept)
    };
  }

  window.DeptSync = {
    use(dept, handler){
      const update=()=> handler(pull(dept));
      update(); // first load

      // Listen to admin updates (cross-tab safe)
      window.addEventListener("storage", e=>{
        if ([KEY_TASKS, TASKS_PULSE, KEY_STAFF, STAFF_PULSE].includes(e.key)) update();
      });

      // On tab focus
      document.addEventListener("visibilitychange", ()=> !document.hidden && update());
    }
  };
})();
