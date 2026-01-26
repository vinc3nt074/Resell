(() => {
  const app = document.getElementById("app");
  if (!app) {
    document.body.innerHTML = "<div>#app fehlt</div>";
    return;
  }

  /* ================= CONFIG ================= */
  const SUPABASE_URL = "https://sikhqmzpcdwwdywaejwl.supabase.co";
  const SUPABASE_ANON_KEY = "DEIN_KEY_IST_HIER_BEREITS_DRIN";

  const ALLOWED_EMAILS = new Set([
    "vince@mail.de",
    "freund@mail.de"
  ]);

  if (!window.supabase) {
    app.innerHTML = "<div>Supabase SDK fehlt</div>";
    return;
  }

  const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  /* ================= STATE ================= */
  let user = null;
  let profile = null;

  let state = {
    vehicles: [],
    todos: [],
    transactions: [],
    stock: [],
  };

  /* ================= HELPERS ================= */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replaceAll("<","&lt;").replaceAll(">","&gt;");
  const eur = (n) => Number(n||0).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
  const today = () => new Date().toISOString().slice(0,10);

  /* ================= ROUTER ================= */
  window.addEventListener("hashchange", route);

  function route(){
    if(!user) return renderLogin();
    const h = location.hash.replace("#/","");
    if(h==="vehicles") return renderVehicles();
    if(h.startsWith("vehicle/")) return renderVehicle(h.split("/")[1]);
    if(h==="stock") return renderStock();
    return renderDashboard();
  }

  /* ================= AUTH ================= */
  async function renderLogin(msg=""){
    app.innerHTML = `
      <div class="center">
        <div class="card loginCard">
          <div class="h2"><h2 class="loginTitle">FleetVault</h2></div>
          ${msg?`<div class="small">${esc(msg)}</div>`:""}
          <input class="input" id="email" placeholder="Email" />
          <input class="input" id="pw" type="password" placeholder="Passwort" />
          <div class="row">
            <button class="btn primary" onclick="login()">Login</button>
            <button class="btn" onclick="signup()">Registrieren</button>
          </div>
        </div>
      </div>`;
  }

  async function login(){
    const email=$("#email").value.trim().toLowerCase();
    const pw=$("#pw").value;
    if(!ALLOWED_EMAILS.has(email)) return renderLogin("Nicht freigeschaltet");

    const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
    if(error) return renderLogin(error.message);

    user=data.user;
    await loadAll();
    route();
  }

  async function signup(){
    const email=$("#email").value.trim().toLowerCase();
    const pw=$("#pw").value;
    if(!ALLOWED_EMAILS.has(email)) return renderLogin("Nicht freigeschaltet");

    const {error}=await sb.auth.signUp({email,password:pw});
    if(error) return renderLogin(error.message);
    renderLogin("Account erstellt – Mail bestätigen");
  }

  async function logout(){
    await sb.auth.signOut();
    user=null;
    route();
  }

  /* ================= DATA ================= */
  async function loadAll(){
    state.vehicles=(await sb.from("vehicles").select("*")).data||[];
    state.todos=(await sb.from("todos").select("*")).data||[];
    state.transactions=(await sb.from("transactions").select("*")).data||[];
    state.stock=(await sb.from("stock_parts").select("*")).data||[];
  }

  function computeTotals(){
    let income=0, expense=0;
    for(const t of state.transactions){
      if(t.type==="income") income+=Number(t.amount);
      else expense+=Number(t.amount);
    }
    return { income, expense, balance: income-expense };
  }

  /* ================= DASHBOARD ================= */
  async function renderDashboard(){
    await loadAll();
    const t=computeTotals();

    app.innerHTML=`
      <div class="wrap">
        ${nav("dash")}

        <div class="quickbar">
          <button class="btn primary" onclick="openTx()">+ Transaktion</button>
          <button class="btn" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
          <button class="btn" onclick="location.hash='#/stock'">Lager</button>
        </div>

        <div class="grid">
          <div class="card">
            <div class="kpis">
              <div class="kpi">
                <div class="label">Fahrzeuge</div>
                <div class="value">${state.vehicles.length}</div>
              </div>
              <div class="kpi">
                <div class="label">Einnahmen</div>
                <div class="value good">${eur(t.income)}</div>
              </div>
              <div class="kpi">
                <div class="label">Ausgaben</div>
                <div class="value bad">${eur(t.expense)}</div>
              </div>
              <div class="kpi">
                <div class="label">Saldo</div>
                <div class="value ${t.balance>=0?"good":"bad"}">${eur(t.balance)}</div>
              </div>
            </div>
          </div>

          <div class="card span8">
            <div class="h2"><h2>Letzte Transaktionen</h2></div>
            <div class="list">
              ${state.transactions.slice(-6).reverse().map(x=>`
                <div class="item">
                  <div class="row" style="justify-content:space-between">
                    <span>${esc(x.category||"")}</span>
                    <b class="${x.type==="income"?"good":"bad"}">
                      ${x.type==="income"?"+":"-"}${eur(x.amount)}
                    </b>
                  </div>
                </div>`).join("")}
            </div>
          </div>

          <div class="card span4">
            <div class="h2"><h2>To-Dos</h2></div>
            <div class="row">
              <input class="input" id="todoText" placeholder="Neue Aufgabe" />
              <button class="btn primary" onclick="addTodo()">+</button>
            </div>
            <div class="list">
              ${state.todos.map(t=>`
                <div class="item">
                  <div class="row" style="justify-content:space-between">
                    <span style="text-decoration:${t.done?"line-through":"none"}">${esc(t.text)}</span>
                    <button class="btn" onclick="toggleTodo('${t.id}',${t.done})">✓</button>
                  </div>
                </div>`).join("")}
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ================= TRANSACTIONS ================= */
  function openTx(){
    const opts=state.vehicles.map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join("");
    app.insertAdjacentHTML("beforeend",`
      <div class="modalOverlay" onclick="this.remove()">
        <div class="modalCard" onclick="event.stopPropagation()">
          <div class="h2"><h2>Neue Transaktion</h2></div>
          <select class="input" id="txVeh">${opts}</select>
          <select class="input" id="txType">
            <option value="expense">Ausgabe</option>
            <option value="income">Einnahme</option>
          </select>
          <input class="input" id="txAmt" type="number" placeholder="Betrag" />
          <input class="input" id="txCat" placeholder="Kategorie" />
          <button class="btn primary" onclick="saveTx()">Speichern</button>
        </div>
      </div>`);
  }

  async function saveTx(){
    await sb.from("transactions").insert({
      vehicle_id: $("#txVeh").value,
      type: $("#txType").value,
      amount: Number($("#txAmt").value),
      category: $("#txCat").value,
      date: today(),
      created_by: user.id
    });
    route();
  }

  /* ================= TODOS ================= */
  async function addTodo(){
    const t=$("#todoText").value.trim();
    if(!t) return;
    await sb.from("todos").insert({text:t,done:false});
    route();
  }
  async function toggleTodo(id,d){
    await sb.from("todos").update({done:!d}).eq("id",id);
    route();
  }

  /* ================= NAV ================= */
  function nav(active){
    return `
      <div class="topbar">
        <div class="brand">
          <div class="logo"></div>
          <h1>FleetVault</h1>
        </div>
        <div class="pill">
          <button class="btn ${active==="dash"?"primary":""}" onclick="location.hash='#/'">Dashboard</button>
          <button class="btn" onclick="logout()">Logout</button>
        </div>
      </div>`;
  }

  /* ================= BOOT ================= */
  (async ()=>{
    const {data}=await sb.auth.getSession();
    user=data.session?.user||null;
    if(user && !ALLOWED_EMAILS.has(user.email.toLowerCase())){
      await logout();
    }
    if(user) await loadAll();
    route();
  })();

  Object.assign(window,{login,signup,logout,addTodo,toggleTodo,openTx,saveTx});
})();
