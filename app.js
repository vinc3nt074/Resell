/* FleetVault – Supabase Multi-User App
   + Dashboard: Quick Action Bar, Quick Transaction Modal
   + Apple-like Avatar Profile (profiles table)
   + Team Activity (transactions + todos + vehicles merged)
   + Lagerbestand (stock_parts table)
*/

(() => {
  const app = document.getElementById("app");
  if (!app) {
    document.body.innerHTML =
      "<div style='padding:24px;font-family:system-ui'>Fehler: #app fehlt in index.html</div>";
    return;
  }

  /* ---------- On-page error output ---------- */
  function fatal(title, msg) {
    app.innerHTML = `
      <div style="min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px">
        <div style="max-width:860px;margin:0 auto;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:18px;padding:16px">
          <div style="font-weight:900;font-size:18px;margin-bottom:8px;color:#ff6b8a">${esc(title)}</div>
          <pre style="white-space:pre-wrap;line-height:1.4;opacity:.9;margin:0">${esc(msg)}</pre>
        </div>
      </div>`;
  }
  window.addEventListener("error", (e) => fatal("JS Fehler", e.message || "unknown"));
  window.addEventListener("unhandledrejection", (e) =>
    fatal("Promise Fehler", (e.reason && (e.reason.message || String(e.reason))) || "unknown")
  );

  /* ---------- Supabase ---------- */
  if (!window.supabase || !window.supabase.createClient) {
    fatal(
      "Supabase SDK fehlt",
      `In index.html muss VOR app.js stehen:
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
    );
    return;
  }

  const SUPABASE_URL = "https://sikhqmzpcdwwdywaejwl.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpa2hxbXpwY2R3d2R5d2FlandsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5OTA0ODgsImV4cCI6MjA4NDU2NjQ4OH0.rabK9l74yjAzJ4flMwE0_AasVu_3cth3g-FRNo4JCuM";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ---------- State ---------- */
  let sessionUser = null;
  let profile = null; // current user profile
  let profilesMap = new Map(); // id -> profile

  let state = {
    vehicles: [],
    todos: [],
    txActivity: [],
    teamActivity: [],
    stock: [],
  };

  /* ---------- Helpers ---------- */
  const $ = (s) => document.querySelector(s);

  function esc(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function moneyEUR(n) {
    const v = Number(n || 0);
    return v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }
  function todayISO() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function initialsFromEmail(email) {
    const e = (email || "").split("@")[0] || "U";
    const parts = e.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    const a = parts[0]?.[0] || e[0] || "U";
    const b = parts[1]?.[0] || e[1] || "";
    return (a + b).toUpperCase();
  }
  function stableColor(seed) {
    // deterministic nice-ish color from a string
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 70% 60%)`;
  }
  function avatarHTML(p, size = 34) {
    const name = p?.display_name || "";
    const col = p?.avatar_color || "#7aa2ff";
    const initials = p?.display_name
      ? p.display_name.split(" ").map(x => x[0]).join("").slice(0,2).toUpperCase()
      : initialsFromEmail(sessionUser?.email || "U");

    return `
      <div class="avatar" style="width:${size}px;height:${size}px;background:${esc(col)}" title="${esc(name || "")}">
        ${esc(initials)}
      </div>
    `;
  }
  function fmtWhen(ts) {
    try { return new Date(ts).toLocaleString("de-DE"); } catch { return ""; }
  }

  /* ---------- Routing ---------- */
  function route() {
    const h = (location.hash || "#/").slice(2);
    const [page, id] = h.split("/");

    if (!sessionUser) return renderLogin();

    if (!page) return renderDashboard();
    if (page === "vehicles") return renderVehicles();
    if (page === "vehicle" && id) return renderVehicle(id);
    if (page === "stock") return renderStock();

    return renderDashboard();
  }
  window.addEventListener("hashchange", route);

  /* ---------- Top UI ---------- */
  function nav(active) {
    return `
      <div class="topbar">
        <div class="brand">
          <div class="logo"></div>
          <div>
            <h1>FleetVault</h1>
            <div class="sub">Fahrzeuge · Notizen · Finanzen · Teile</div>
          </div>
        </div>

        <div class="pill">
          <div class="avatarWrap">
            ${avatarHTML(profile || { avatar_color: stableColor(sessionUser?.id || "u") })}
          </div>

          <button class="btn ${active === "dash" ? "primary" : ""}" onclick="location.hash='#/'">Dashboard</button>
          <button class="btn ${active === "veh" ? "primary" : ""}" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
          <button class="btn ${active === "stock" ? "primary" : ""}" onclick="location.hash='#/stock'">Lager</button>

          <button class="btn danger" onclick="logout()">Logout</button>
        </div>
      </div>
    `;
  }

  /* ---------- Data loaders ---------- */
  async function loadVehicles() {
    const { data, error } = await sb.from("vehicles").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("vehicles: " + error.message);
    state.vehicles = data || [];
  }

  async function loadTodos() {
    const { data, error } = await sb.from("todos").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("todos: " + error.message);
    state.todos = data || [];
  }

  async function loadTxActivity() {
    const { data, error } = await sb
      .from("transactions")
      .select("id, type, amount, date, category, description, created_at, created_by, vehicle_id, vehicles(name)")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw new Error("activity: " + error.message);
    state.txActivity = data || [];
  }

  async function loadStock() {
    const { data, error } = await sb
      .from("stock_parts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) throw new Error("stock: " + error.message);
    state.stock = data || [];
  }

  async function loadProfilesFor(ids) {
    const uniq = [...new Set(ids.filter(Boolean))];
    const missing = uniq.filter((id) => !profilesMap.has(id));

    if (missing.length === 0) return;

    const { data, error } = await sb.from("profiles").select("id, display_name, avatar_color").in("id", missing);
    if (error) throw new Error("profiles: " + error.message);

    for (const p of data || []) profilesMap.set(p.id, p);
  }

  async function ensureMyProfile() {
    // create profile row if missing (first login)
    const { data, error } = await sb.from("profiles").select("id, display_name, avatar_color").eq("id", sessionUser.id).maybeSingle();
    if (error) throw new Error("profile load: " + error.message);

    if (data) {
      profile = data;
      profilesMap.set(data.id, data);
      return;
    }

    const display_name = (sessionUser.email || "User").split("@")[0];
    const avatar_color = stableColor(sessionUser.id);

    const { data: ins, error: e2 } = await sb
      .from("profiles")
      .insert({ id: sessionUser.id, display_name, avatar_color })
      .select("id, display_name, avatar_color")
      .single();

    if (e2) throw new Error("profile create: " + e2.message);

    profile = ins;
    profilesMap.set(ins.id, ins);
  }

  async function buildTeamActivity() {
    // Merge: last todos + last vehicles + last transactions (client side)
    const [todosRes, vehRes, txRes] = await Promise.all([
      sb.from("todos").select("id, text, done, created_at, created_by").order("created_at", { ascending: false }).limit(8),
      sb.from("vehicles").select("id, name, type, created_at, created_by").order("created_at", { ascending: false }).limit(8),
      sb.from("transactions").select("id, type, amount, created_at, created_by, vehicle_id, vehicles(name)").order("created_at", { ascending: false }).limit(8),
    ]);

    if (todosRes.error) throw new Error("team todos: " + todosRes.error.message);
    if (vehRes.error) throw new Error("team vehicles: " + vehRes.error.message);
    if (txRes.error) throw new Error("team tx: " + txRes.error.message);

    const items = [];

    for (const t of todosRes.data || []) {
      items.push({
        kind: "todo",
        created_at: t.created_at,
        created_by: t.created_by,
        title: t.done ? "To-Do erledigt" : "To-Do erstellt",
        sub: t.text,
      });
    }

    for (const v of vehRes.data || []) {
      items.push({
        kind: "vehicle",
        created_at: v.created_at,
        created_by: v.created_by,
        title: "Fahrzeug hinzugefügt",
        sub: `${v.name} · ${v.type || "Fahrzeug"}`,
      });
    }

    for (const x of txRes.data || []) {
      const isInc = x.type === "income";
      items.push({
        kind: "tx",
        created_at: x.created_at,
        created_by: x.created_by,
        title: isInc ? "Einnahme eingetragen" : "Ausgabe eingetragen",
        sub: `${x.vehicles?.name || "Fahrzeug"} · ${isInc ? "+" : "-"}${moneyEUR(x.amount)}`,
      });
    }

    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    state.teamActivity = items.slice(0, 10);

    await loadProfilesFor(state.teamActivity.map(i => i.created_by));
  }

  async function refreshAll() {
    await Promise.all([loadVehicles(), loadTodos(), loadTxActivity(), loadStock()]);
    await buildTeamActivity();
  }

  async function computeTotals() {
    const { data, error } = await sb.from("transactions").select("type, amount");
    if (error) return { income: 0, expense: 0, balance: 0 };

    let income = 0, expense = 0;
    for (const t of data || []) {
      const amt = Number(t.amount || 0);
      if (t.type === "income") income += amt;
      else expense += amt;
    }
    return { income, expense, balance: income - expense };
  }

  async function computeVehicleTotals(vehicleId) {
    const { data, error } = await sb.from("transactions").select("type, amount").eq("vehicle_id", vehicleId);
    if (error) return { income: 0, expense: 0, balance: 0 };

    let income = 0, expense = 0;
    for (const t of data || []) {
      const amt = Number(t.amount || 0);
      if (t.type === "income") income += amt;
      else expense += amt;
    }
    return { income, expense, balance: income - expense };
  }

  /* ---------- Auth UI ---------- */
  function renderLogin(info = "") {
    app.innerHTML = `
      <div class="wrap">
        <div class="center">
          <div class="card loginCard">
            <div class="h2"><h2 class="loginTitle">Login</h2><span class="badge">Supabase</span></div>
            ${info ? `<div class="small">${esc(info)}</div><div class="hr"></div>` : `<div class="hr"></div>`}

            <label class="muted">Email</label>
            <input class="input" id="email" placeholder="name@mail.de" />

            <label class="muted" style="margin-top:10px;display:block">Passwort</label>
            <input class="input" id="password" type="password" placeholder="••••••••" />

            <div class="row" style="margin-top:12px">
              <button class="btn primary" id="btnLogin">Einloggen</button>
              <button class="btn" id="btnSignup">Registrieren</button>
            </div>

            <div class="small">Wenn Email-Bestätigung aktiv ist: Link klicken, dann hier einloggen.</div>
          </div>
        </div>
      </div>
    `;

    $("#btnLogin").onclick = signIn;
    $("#btnSignup").onclick = signUp;
  }

  async function signIn() {
    const email = ($("#email").value || "").trim();
    const password = ($("#password").value || "").trim();
    if (!email || !password) return renderLogin("Bitte Email + Passwort eingeben.");

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return renderLogin("Login fehlgeschlagen: " + error.message);

    sessionUser = data.user;
    await ensureMyProfile();
    await refreshAll();
    location.hash = "#/";
    route();
  }

  async function signUp() {
    const email = ($("#email").value || "").trim();
    const password = ($("#password").value || "").trim();
    if (!email || !password) return renderLogin("Bitte Email + Passwort eingeben.");

    const redirectTo = window.location.origin + window.location.pathname;

    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) return renderLogin("Registrierung fehlgeschlagen: " + error.message);
    renderLogin("Account erstellt. Mail bestätigen (falls aktiv), dann einloggen.");
  }

  async function logout() {
    await sb.auth.signOut();
    sessionUser = null;
    profile = null;
    profilesMap.clear();
    location.hash = "#/";
    route();
  }

  /* ---------- Modals ---------- */
  function openModal(html) {
    const wrap = document.createElement("div");
    wrap.className = "modalOverlay";
    wrap.innerHTML = `
      <div class="modalCard">
        ${html}
      </div>
    `;
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closeModal();
    });
    document.body.appendChild(wrap);
    window.__modal = wrap;
  }
  function closeModal() {
    if (window.__modal) {
      window.__modal.remove();
      window.__modal = null;
    }
  }

  function openTxModal(prefVehicleId = null) {
    const options = state.vehicles.map(v =>
      `<option value="${v.id}" ${prefVehicleId===v.id ? "selected":""}>${esc(v.name)}</option>`
    ).join("");

    openModal(`
      <div class="modalHeader">
        <div class="modalTitle">Neue Transaktion</div>
        <button class="btn" onclick="closeModal()">Schließen</button>
      </div>

      <div class="split">
        <div>
          <label class="muted">Fahrzeug</label>
          <select class="input" id="m_vehicle">${options}</select>
        </div>
        <div>
          <label class="muted">Typ</label>
          <select class="input" id="m_type">
            <option value="expense">Ausgabe</option>
            <option value="income">Einnahme</option>
          </select>
        </div>
      </div>

      <div class="split" style="margin-top:10px">
        <div>
          <label class="muted">Betrag (€)</label>
          <input class="input" id="m_amount" type="number" step="0.01" placeholder="z.B. 29.99" />
        </div>
        <div>
          <label class="muted">Datum</label>
          <input class="input" id="m_date" type="date" value="${todayISO()}" />
        </div>
      </div>

      <div class="split" style="margin-top:10px">
        <div>
          <label class="muted">Kategorie</label>
          <input class="input" id="m_cat" placeholder="z.B. Teile / Sprit / Verkauf" />
        </div>
        <div>
          <label class="muted">Beschreibung</label>
          <input class="input" id="m_desc" placeholder="z.B. Bremsbeläge hinten" />
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <button class="btn primary" onclick="addTxFromModal()">Speichern</button>
      </div>
      <div class="small">Speichern aktualisiert KPIs & Activity sofort.</div>
    `);
  }

  async function addTxFromModal() {
    const vehicle_id = $("#m_vehicle").value;
    const type = $("#m_type").value;
    const amount = Number($("#m_amount").value);
    const date = $("#m_date").value;
    const category = ($("#m_cat").value || "").trim();
    const description = ($("#m_desc").value || "").trim();

    if (!vehicle_id) return alert("Bitte Fahrzeug auswählen.");
    if (!amount || amount <= 0) return alert("Betrag muss > 0 sein.");
    if (!date) return alert("Datum fehlt.");

    const { error } = await sb.from("transactions").insert({
      vehicle_id, type, amount, date, category, description,
      created_by: sessionUser.id,
    });
    if (error) return alert("Fehler: " + error.message);

    closeModal();
    await refreshAll();
    route();
  }

  /* ---------- Dashboard ---------- */
  async function renderDashboard() {
    await refreshAll();
    const t = await computeTotals();

    const openTodos = state.todos.filter(x => !x.done).length;
    const outOfStock = state.stock.filter(p => Number(p.qty) <= 0);
    const lowStock = state.stock.filter(p => Number(p.qty) > 0 && Number(p.qty) <= 2);

    // Build a small avatar stack from recent team activity
    const recentUsers = [];
    for (const it of state.teamActivity) {
      if (it.created_by && !recentUsers.includes(it.created_by)) recentUsers.push(it.created_by);
      if (recentUsers.length >= 4) break;
    }

    app.innerHTML = `
      <div class="wrap">
        ${nav("dash")}

        <!-- Quick Action Bar -->
        <div class="quickbar">
          <button class="btn primary" onclick="openTxModal()">+ Transaktion</button>
          <button class="btn" onclick="location.hash='#/vehicles'">+ Fahrzeug</button>
          <button class="btn" onclick="focusTodoInput()">+ To-Do</button>
          <button class="btn" onclick="location.hash='#/stock'">Lager</button>

          <div class="quickbarRight">
            <div class="avatarStack">
              ${recentUsers.map(uid => {
                const p = profilesMap.get(uid);
                const col = p?.avatar_color || stableColor(uid);
                const ini = p?.display_name
                  ? p.display_name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()
                  : "U";
                return `<div class="avatar small" style="background:${esc(col)}" title="${esc(p?.display_name || "")}">${esc(ini)}</div>`;
              }).join("")}
            </div>
          </div>
        </div>

        <div class="grid">

          <div class="card">
            <div class="h2">
              <h2>Dashboard</h2>
              <span class="badge">Team · Live</span>
            </div>

            <div class="kpis">
              <div class="kpi">
                <div class="label">Fahrzeuge</div>
                <div class="value">${state.vehicles.length}</div>
              </div>
              <div class="kpi">
                <div class="label">Einnahmen</div>
                <div class="value good">${moneyEUR(t.income)}</div>
              </div>
              <div class="kpi">
                <div class="label">Ausgaben</div>
                <div class="value bad">${moneyEUR(t.expense)}</div>
              </div>
              <div class="kpi">
                <div class="label">Saldo</div>
                <div class="value ${t.balance>=0?"good":"bad"}">${moneyEUR(t.balance)}</div>
              </div>
            </div>

            <div class="hr"></div>

            <div class="row">
              <button class="btn primary" onclick="openTxModal()">+ Einnahme/Ausgabe</button>
              <button class="btn" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
            </div>
          </div>

          <div class="card span8">
            <div class="h2"><h2>Letzte Fahrzeuge</h2></div>
            ${state.vehicles.length === 0 ? `<div class="muted">Noch keine Fahrzeuge.</div>` : `
              <div class="list">
                ${state.vehicles.slice(0,4).map(v => `
                  <div class="item">
                    <div class="row" style="justify-content:space-between; align-items:center">
                      <div>
                        <div class="itemTitle">${esc(v.name)} <span class="badge">${esc(v.type||"Fahrzeug")}</span></div>
                        <div class="small">${esc(v.brand||"")} ${esc(v.model||"")} · VIN: ${esc(v.vin||"-")}</div>
                      </div>
                      <div class="row">
                        <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
                        <button class="btn" onclick="openTxModal('${v.id}')">+ Tx</button>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
          </div>

          <div class="card span4">
            <div class="h2">
              <h2>To-Do (global)</h2>
              <span class="badge">${openTodos} offen</span>
            </div>

            <div class="row">
              <input class="input" id="todoText" placeholder="z.B. Teile bestellen / TÜV Termin" />
              <button class="btn primary" onclick="addTodo()">+</button>
            </div>

            <div class="hr"></div>

            ${(state.todos.length === 0) ? `<div class="muted">Noch keine Aufgaben.</div>` : `
              <div class="list">
                ${state.todos.slice(0, 8).map(t => `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle" style="text-decoration:${t.done?'line-through':'none'};opacity:${t.done?0.65:1}">
                          ${esc(t.text)}
                        </div>
                        <div class="small">${fmtWhen(t.created_at)}</div>
                      </div>
                      <div class="row">
                        <button class="btn ${t.done?'':'primary'}" onclick="toggleTodo('${t.id}', ${t.done ? "true":"false"})">${t.done ? '↩︎' : '✓'}</button>
                        <button class="btn danger" onclick="deleteTodo('${t.id}')">x</button>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>

              <div class="hr"></div>
              <div class="row">
                <button class="btn" onclick="clearDoneTodos()">Erledigte löschen</button>
              </div>
            `}
          </div>

          <div class="card span6">
            <div class="h2"><h2>Team Activity</h2><span class="badge">Letzte Aktionen</span></div>
            ${state.teamActivity.length === 0 ? `<div class="muted">Noch keine Aktionen.</div>` : `
              <div class="list">
                ${state.teamActivity.map(a => {
                  const p = profilesMap.get(a.created_by);
                  const col = p?.avatar_color || stableColor(a.created_by || "u");
                  const ini = p?.display_name
                    ? p.display_name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()
                    : "U";
                  return `
                    <div class="item">
                      <div class="row" style="justify-content:space-between;align-items:center">
                        <div class="row" style="gap:10px;align-items:center">
                          <div class="avatar small" style="background:${esc(col)}">${esc(ini)}</div>
                          <div>
                            <div class="itemTitle">${esc(a.title)}</div>
                            <div class="small">${esc(a.sub)} · ${fmtWhen(a.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `}
          </div>

          <div class="card span6">
            <div class="h2"><h2>Lager</h2><span class="badge">${outOfStock.length} aus</span><span class="badge">${lowStock.length} low</span></div>

            <div class="row">
              <input class="input" id="stockName" placeholder="Teil hinzufügen (z.B. Zündkerze)" />
              <input class="input" id="stockQty" type="number" step="1" placeholder="Menge" style="max-width:140px" />
              <button class="btn primary" onclick="addStockPart()">+</button>
            </div>

            <div class="hr"></div>

            ${state.stock.length === 0 ? `<div class="muted">Noch keine Lagerteile.</div>` : `
              <div class="list">
                ${state.stock.slice(0, 8).map(p => {
                  const q = Number(p.qty || 0);
                  const badge = q <= 0 ? `<span class="badge badBadge">Aus</span>` : (q <= 2 ? `<span class="badge warnBadge">Low</span>` : `<span class="badge">OK</span>`);
                  return `
                    <div class="item">
                      <div class="row" style="justify-content:space-between;align-items:center">
                        <div>
                          <div class="itemTitle">${esc(p.name)} ${badge}</div>
                          <div class="small">${q} ${esc(p.unit || "Stk")} · ${esc(p.notes || "")}</div>
                        </div>
                        <div class="row">
                          <button class="btn" onclick="changeStockQty('${p.id}', -1)">-</button>
                          <button class="btn" onclick="changeStockQty('${p.id}', +1)">+</button>
                          <button class="btn danger" onclick="deleteStockPart('${p.id}')">x</button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
              <div class="hr"></div>
              <div class="row">
                <button class="btn" onclick="location.hash='#/stock'">Alle Lagerteile</button>
              </div>
            `}
          </div>

          <div class="card span12">
            <div class="h2"><h2>Transaktionen</h2><span class="badge">Letzte Einträge</span></div>
            ${state.txActivity.length === 0 ? `<div class="muted">Noch keine Transaktionen.</div>` : `
              <div class="list">
                ${state.txActivity.map(a => {
                  const isInc = a.type === "income";
                  const vname = a.vehicles?.name || "Fahrzeug";
                  return `
                    <div class="item">
                      <div class="row" style="justify-content:space-between;align-items:center">
                        <div>
                          <div class="itemTitle">${esc(vname)} <span class="badge">${esc(a.date)} · ${esc(a.category || "")}</span></div>
                          <div class="small">${esc(a.description || "")}</div>
                        </div>
                        <div style="font-weight:950;color:${isInc?"var(--good)":"var(--bad)"}">
                          ${isInc?"+":"-"}${moneyEUR(a.amount)}
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `}
          </div>

        </div>
      </div>
    `;
  }

  function focusTodoInput() {
    const el = $("#todoText");
    if (el) el.focus();
  }

  /* ---------- Vehicles list + add ---------- */
  async function renderVehicles() {
    await loadVehicles();

    app.innerHTML = `
      <div class="wrap">
        ${nav("veh")}
        <div class="grid">

          <div class="card span6">
            <div class="h2"><h2>Fahrzeug hinzufügen</h2></div>

            <label class="muted">Name</label>
            <input class="input" id="v_name" placeholder="z.B. Yamaha DT80LC2" />

            <div class="split" style="margin-top:10px">
              <div>
                <label class="muted">Marke</label>
                <input class="input" id="v_brand" placeholder="z.B. Yamaha" />
              </div>
              <div>
                <label class="muted">Modell</label>
                <input class="input" id="v_model" placeholder="z.B. DT80LC2" />
              </div>
            </div>

            <div class="split" style="margin-top:10px">
              <div>
                <label class="muted">Typ</label>
                <select class="input" id="v_type">
                  <option>Motorrad</option>
                  <option>Roller</option>
                  <option>Auto</option>
                  <option>Sonstiges</option>
                </select>
              </div>
              <div>
                <label class="muted">VIN / FIN</label>
                <input class="input" id="v_vin" placeholder="optional" />
              </div>
            </div>

            <div class="row" style="margin-top:12px">
              <button class="btn primary" onclick="addVehicle()">Speichern</button>
              <button class="btn" onclick="location.hash='#/'">Zurück</button>
            </div>
          </div>

          <div class="card span6">
            <div class="h2"><h2>Fahrzeuge</h2><span class="badge">${state.vehicles.length} insgesamt</span></div>

            ${state.vehicles.length === 0 ? `<div class="muted">Noch leer.</div>` : `
              <div class="list">
                ${state.vehicles.map(v => `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle">${esc(v.name)}</div>
                        <div class="small">${esc(v.brand||"")} ${esc(v.model||"")} · ${esc(v.type||"")}</div>
                      </div>
                      <div class="row">
                        <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
                        <button class="btn" onclick="openTxModal('${v.id}')">+ Tx</button>
                        <button class="btn danger" onclick="deleteVehicle('${v.id}')">Löschen</button>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
          </div>

        </div>
      </div>
    `;
  }

  async function addVehicle() {
    const name = ($("#v_name").value || "").trim();
    if (!name) return alert("Bitte Name eingeben.");

    const payload = {
      name,
      brand: ($("#v_brand").value || "").trim(),
      model: ($("#v_model").value || "").trim(),
      type: ($("#v_type").value || "").trim(),
      vin: ($("#v_vin").value || "").trim(),
      created_by: sessionUser.id,
    };

    const { data, error } = await sb.from("vehicles").insert(payload).select("*").single();
    if (error) return alert("Fehler: " + error.message);

    location.hash = `#/vehicle/${data.id}`;
    route();
  }

  async function deleteVehicle(id) {
    const ok = confirm("Fahrzeug wirklich löschen?");
    if (!ok) return;

    const { error } = await sb.from("vehicles").delete().eq("id", id);
    if (error) return alert("Fehler: " + error.message);

    location.hash = "#/vehicles";
    route();
  }

  /* ---------- Vehicle detail ---------- */
  async function renderVehicle(id) {
    const { data: v, error } = await sb.from("vehicles").select("*").eq("id", id).single();
    if (error || !v) {
      location.hash = "#/vehicles";
      return;
    }

    const vt = await computeVehicleTotals(id);

    const { data: tx, error: txErr } = await sb
      .from("transactions")
      .select("*")
      .eq("vehicle_id", id)
      .order("created_at", { ascending: false });

    if (txErr) return alert("Fehler transactions: " + txErr.message);

    app.innerHTML = `
      <div class="wrap">
        ${nav("veh")}

        <div class="grid">
          <div class="card">
            <div class="h2">
              <h2>${esc(v.name)} <span class="badge">${esc(v.type || "")}</span></h2>
              <span class="badge">Saldo: <b style="color:${vt.balance >= 0 ? "var(--good)" : "var(--bad)"}">${moneyEUR(vt.balance)}</b></span>
            </div>
            <div class="muted">${esc(v.brand || "")} ${esc(v.model || "")} · VIN/FIN: ${esc(v.vin || "-")}</div>
            <div class="hr"></div>
            <div class="row">
              <button class="btn" onclick="location.hash='#/vehicles'">← Fahrzeuge</button>
              <button class="btn primary" onclick="openTxModal('${v.id}')">+ Transaktion</button>
              <button class="btn danger" onclick="deleteVehicle('${v.id}')">Fahrzeug löschen</button>
            </div>
          </div>

          <div class="card span6">
            <div class="h2"><h2>Notizen</h2></div>
            <textarea class="input" id="notes">${esc(v.notes || "")}</textarea>
            <div class="row" style="margin-top:10px">
              <button class="btn primary" onclick="saveNotes('${v.id}')">Notizen speichern</button>
            </div>
          </div>

          <div class="card span6">
            <div class="h2"><h2>Bilder</h2><span class="badge">${(v.images || []).length}</span></div>
            <div class="muted">Füge Bild-URLs ein. (Upload später möglich.)</div>
            <div class="hr"></div>
            <div class="row">
              <input class="input" id="imgUrl" placeholder="https://..." />
              <button class="btn primary" onclick="addImage('${v.id}')">Hinzufügen</button>
            </div>
            <div class="gallery">
              ${(v.images || [])
                .map(
                  (url, idx) => `
                  <div>
                    <img class="thumb" src="${esc(url)}" alt="Bild" onerror="this.style.opacity=.3" />
                    <div style="margin-top:6px">
                      <button class="btn danger" onclick="removeImage('${v.id}', ${idx})">Entfernen</button>
                    </div>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>

          <div class="card span8">
            <div class="h2"><h2>Einnahmen & Ausgaben</h2><span class="badge">Details</span></div>

            ${(tx || []).length === 0 ? `<div class="muted">Noch keine Einträge.</div>` : `
              <div class="list">
                ${(tx || [])
                  .map((t) => {
                    const isInc = t.type === "income";
                    return `
                      <div class="item">
                        <div class="row" style="justify-content:space-between;align-items:center">
                          <span class="badge">${esc(t.date)} · ${esc(t.category || "")}</span>
                          <b style="color:${isInc ? "var(--good)" : "var(--bad)"}">
                            ${isInc ? "+" : "-"}${moneyEUR(t.amount)}
                          </b>
                        </div>
                        <div class="small">${esc(t.description || "")}</div>
                        <div class="row" style="margin-top:8px">
                          <button class="btn danger" onclick="removeTransaction('${t.id}','${v.id}')">Löschen</button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `}
          </div>

          <div class="card span4">
            <div class="h2"><h2>Ersatzteile</h2></div>
            <div class="muted">Brauchst du / hast du schon.</div>
            <div class="hr"></div>

            <label class="muted">Benötigt</label>
            <div class="row">
              <input class="input" id="needInput" placeholder="z.B. Blinkerrelais" />
              <button class="btn primary" onclick="addPart('${v.id}','need')">+</button>
            </div>
            <div class="list" style="margin-top:10px">
              ${(v.parts_need || []).map((p,i)=>`
                <div class="item">
                  <div class="row" style="justify-content:space-between;align-items:center">
                    <div>${esc(p)}</div>
                    <button class="btn danger" onclick="removePart('${v.id}','need',${i})">x</button>
                  </div>
                </div>
              `).join("")}
            </div>

            <div class="hr"></div>

            <label class="muted">Vorhanden</label>
            <div class="row">
              <input class="input" id="haveInput" placeholder="z.B. Zündkerze neu" />
              <button class="btn primary" onclick="addPart('${v.id}','have')">+</button>
            </div>
            <div class="list" style="margin-top:10px">
              ${(v.parts_have || []).map((p,i)=>`
                <div class="item">
                  <div class="row" style="justify-content:space-between;align-items:center">
                    <div>${esc(p)}</div>
                    <button class="btn danger" onclick="removePart('${v.id}','have',${i})">x</button>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function saveNotes(vehicleId) {
    const notes = ($("#notes").value || "").toString();
    const { error } = await sb.from("vehicles").update({ notes }).eq("id", vehicleId);
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  async function addImage(vehicleId) {
    const url = ($("#imgUrl").value || "").trim();
    if (!url) return;

    const { data: v, error: e1 } = await sb.from("vehicles").select("images").eq("id", vehicleId).single();
    if (e1) return alert(e1.message);

    const images = [...(v.images || []), url];
    const { error: e2 } = await sb.from("vehicles").update({ images }).eq("id", vehicleId);
    if (e2) return alert(e2.message);

    route();
  }

  async function removeImage(vehicleId, idx) {
    const { data: v, error: e1 } = await sb.from("vehicles").select("images").eq("id", vehicleId).single();
    if (e1) return alert(e1.message);

    const images = (v.images || []).slice();
    images.splice(idx, 1);

    const { error: e2 } = await sb.from("vehicles").update({ images }).eq("id", vehicleId);
    if (e2) return alert(e2.message);

    route();
  }

  async function removeTransaction(transactionId, vehicleId) {
    const { error } = await sb.from("transactions").delete().eq("id", transactionId);
    if (error) return alert("Fehler: " + error.message);
    location.hash = `#/vehicle/${vehicleId}`;
    route();
  }

  async function addPart(vehicleId, which) {
    const inputId = which === "need" ? "needInput" : "haveInput";
    const txt = ($("#" + inputId).value || "").trim();
    if (!txt) return;

    const col = which === "need" ? "parts_need" : "parts_have";

    const { data: v, error: e1 } = await sb.from("vehicles").select(col).eq("id", vehicleId).single();
    if (e1) return alert(e1.message);

    const arr = [...(v[col] || []), txt];
    const { error: e2 } = await sb.from("vehicles").update({ [col]: arr }).eq("id", vehicleId);
    if (e2) return alert(e2.message);

    route();
  }

  async function removePart(vehicleId, which, idx) {
    const col = which === "need" ? "parts_need" : "parts_have";

    const { data: v, error: e1 } = await sb.from("vehicles").select(col).eq("id", vehicleId).single();
    if (e1) return alert(e1.message);

    const arr = (v[col] || []).slice();
    arr.splice(idx, 1);

    const { error: e2 } = await sb.from("vehicles").update({ [col]: arr }).eq("id", vehicleId);
    if (e2) return alert(e2.message);

    route();
  }

  /* ---------- Todos (global) ---------- */
  async function addTodo() {
    const text = ($("#todoText").value || "").trim();
    if (!text) return;

    const { error } = await sb.from("todos").insert({ text, done: false, created_by: sessionUser.id });
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  async function toggleTodo(id, currentlyDone) {
    const { error } = await sb.from("todos").update({ done: !currentlyDone, created_by: sessionUser.id }).eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  async function deleteTodo(id) {
    const { error } = await sb.from("todos").delete().eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  async function clearDoneTodos() {
    const { error } = await sb.from("todos").delete().eq("done", true);
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  /* ---------- Stock (Lager) ---------- */
  async function renderStock() {
    await loadStock();

    app.innerHTML = `
      <div class="wrap">
        ${nav("stock")}
        <div class="grid">
          <div class="card span12">
            <div class="h2"><h2>Lagerverwaltung</h2><span class="badge">${state.stock.length} Teile</span></div>

            <div class="row">
              <input class="input" id="stockName2" placeholder="Teil (z.B. Kette 420)" />
              <input class="input" id="stockQty2" type="number" step="1" placeholder="Menge" style="max-width:140px" />
              <input class="input" id="stockUnit2" placeholder="Unit (Stk)" style="max-width:140px" />
              <button class="btn primary" onclick="addStockPartFull()">Hinzufügen</button>
            </div>

            <div class="hr"></div>

            ${state.stock.length === 0 ? `<div class="muted">Noch keine Lagerteile.</div>` : `
              <div class="list">
                ${state.stock.map(p => {
                  const q = Number(p.qty || 0);
                  const badge = q <= 0 ? `<span class="badge badBadge">Aus</span>` : (q <= 2 ? `<span class="badge warnBadge">Low</span>` : `<span class="badge">OK</span>`);
                  return `
                    <div class="item">
                      <div class="row" style="justify-content:space-between;align-items:center">
                        <div>
                          <div class="itemTitle">${esc(p.name)} ${badge}</div>
                          <div class="small">${q} ${esc(p.unit || "Stk")} · ${esc(p.notes || "")}</div>
                        </div>
                        <div class="row">
                          <button class="btn" onclick="changeStockQty('${p.id}', -1)">-</button>
                          <button class="btn" onclick="changeStockQty('${p.id}', +1)">+</button>
                          <button class="btn danger" onclick="deleteStockPart('${p.id}')">x</button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  async function addStockPart() {
    const name = ($("#stockName").value || "").trim();
    const qty = Number($("#stockQty").value || 0);
    if (!name) return alert("Name fehlt.");

    const { error } = await sb.from("stock_parts").insert({
      name,
      qty: isFinite(qty) ? qty : 0,
      unit: "Stk",
      created_by: sessionUser.id,
    });
    if (error) return alert("Fehler: " + error.message);

    $("#stockName").value = "";
    $("#stockQty").value = "";
    await refreshAll();
    route();
  }

  async function addStockPartFull() {
    const name = ($("#stockName2").value || "").trim();
    const qty = Number($("#stockQty2").value || 0);
    const unit = ($("#stockUnit2").value || "Stk").trim() || "Stk";
    if (!name) return alert("Name fehlt.");

    const { error } = await sb.from("stock_parts").insert({
      name,
      qty: isFinite(qty) ? qty : 0,
      unit,
      created_by: sessionUser.id,
    });
    if (error) return alert("Fehler: " + error.message);

    $("#stockName2").value = "";
    $("#stockQty2").value = "";
    $("#stockUnit2").value = "Stk";
    await loadStock();
    renderStock();
  }

  async function changeStockQty(id, delta) {
    const item = state.stock.find(x => x.id === id);
    if (!item) return;

    const newQty = Number(item.qty || 0) + Number(delta || 0);
    const { error } = await sb.from("stock_parts").update({ qty: newQty, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert("Fehler: " + error.message);

    await refreshAll();
    route();
  }

  async function deleteStockPart(id) {
    const ok = confirm("Teil wirklich löschen?");
    if (!ok) return;

    const { error } = await sb.from("stock_parts").delete().eq("id", id);
    if (error) return alert("Fehler: " + error.message);

    await refreshAll();
    route();
  }

  /* ---------- Expose functions for onclick ---------- */
  Object.assign(window, {
    logout,
    closeModal,
    openTxModal,
    addTxFromModal,
    focusTodoInput,

    addVehicle,
    deleteVehicle,
    saveNotes,
    addImage,
    removeImage,
    removeTransaction,
    addPart,
    removePart,

    addTodo,
    toggleTodo,
    deleteTodo,
    clearDoneTodos,

    addStockPart,
    addStockPartFull,
    changeStockQty,
    deleteStockPart,
  });

  /* ---------- Boot ---------- */
  (async function init() {
    const { data, error } = await sb.auth.getSession();
    if (error) return fatal("Supabase Session Error", error.message);

    sessionUser = data.session?.user || null;

    sb.auth.onAuthStateChange(async (_event, sess) => {
      sessionUser = sess?.user || null;
      if (sessionUser) {
        await ensureMyProfile();
        await refreshAll();
      }
      route();
    });

    if (sessionUser) {
      await ensureMyProfile();
      await refreshAll();
    }
    route();
  })();
})();
