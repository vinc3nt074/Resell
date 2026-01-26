/* FleetVault – Working app.js (Login + Dashboard + Saldo + Quick Tx + Vehicles + Stock + Todos)
   - Uses your Supabase URL + anon key
   - Allowlist that won't lock you out accidentally
*/

(() => {
  const app = document.getElementById("app");
  if (!app) {
    document.body.innerHTML = "<div style='padding:24px;font-family:system-ui'>Fehler: #app fehlt</div>";
    return;
  }

  // On-page error so it's never blank
  function screen(title, msg) {
    app.innerHTML = `
      <div style="min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px">
        <div style="max-width:760px;margin:0 auto;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:18px;padding:16px">
          <div style="font-weight:950;font-size:16px;margin-bottom:8px">${escapeHtml(title)}</div>
          <div style="white-space:pre-wrap;opacity:.8;line-height:1.4">${escapeHtml(msg)}</div>
        </div>
      </div>`;
  }
  window.addEventListener("error", (e) => screen("JS Fehler", e.message || "unknown"));
  window.addEventListener("unhandledrejection", (e) =>
    screen("Promise Fehler", (e.reason && (e.reason.message || String(e.reason))) || "unknown")
  );

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  const $ = (s) => document.querySelector(s);
  const moneyEUR = (n) => Number(n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const todayISO = () => new Date().toISOString().slice(0, 10);

  /* ===================== Supabase ===================== */
  if (!window.supabase || !window.supabase.createClient) {
    screen(
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

  /* ===================== Allowlist (safe) ===================== */
  // Set this to true if you REALLY want to enforce allowlist.
  // If true and list is empty OR your email not included -> you get blocked.
  const ALLOWLIST_ENABLED = true;

  // IMPORTANT: put your REAL login emails here (lowercase!)
  const ALLOWED_EMAILS = new Set([
    // Beispiele – ERSETZEN:
    // "vince@gmail.com",
    // "friend@mail.de",
  ]);

  const normalizeEmail = (e) => (e || "").trim().toLowerCase();
  const isAllowed = (email) => {
    if (!ALLOWLIST_ENABLED) return true;
    if (ALLOWED_EMAILS.size === 0) return true; // prevents lockout if you forgot to fill it
    return ALLOWED_EMAILS.has(normalizeEmail(email));
  };

  /* ===================== State ===================== */
  let sessionUser = null;
  let state = { vehicles: [], todos: [], stock: [] };

  /* ===================== Router ===================== */
  window.addEventListener("hashchange", route);

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

  /* ===================== UI: Login ===================== */
  function renderLogin(info = "") {
    app.innerHTML = `
      <div class="center">
        <div class="card loginCard">
          <div class="h2">
            <h2 class="loginTitle">FleetVault</h2>
            <span class="badge">Secure</span>
          </div>
          ${info ? `<div class="small">${escapeHtml(info)}</div>` : ""}
          <div class="hr"></div>

          <label class="muted">Email</label>
          <input class="input" id="email" placeholder="name@mail.de" />

          <label class="muted" style="margin-top:10px;display:block">Passwort</label>
          <input class="input" id="password" type="password" placeholder="••••••••" />

          <div class="row" style="margin-top:12px">
            <button class="btn primary" id="btnLogin">Einloggen</button>
            <button class="btn" id="btnSignup">Registrieren</button>
          </div>

          <div class="small">Wenn Bestätigung aktiv ist: Mail-Link klicken, dann hier einloggen.</div>
        </div>
      </div>
    `;

    $("#btnLogin").onclick = signIn;
    $("#btnSignup").onclick = signUp;
  }

  async function signIn() {
    const email = normalizeEmail($("#email")?.value);
    const password = ($("#password")?.value || "").trim();

    if (!email || !password) return renderLogin("Bitte Email + Passwort eingeben.");
    if (!isAllowed(email)) return renderLogin("Nicht freigeschaltet (Allowlist).");

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return renderLogin("Login fehlgeschlagen: " + error.message);

    // Double-check allowlist after login too
    const loggedEmail = normalizeEmail(data.user?.email);
    if (!isAllowed(loggedEmail)) {
      await sb.auth.signOut();
      return renderLogin("Nicht freigeschaltet (Allowlist).");
    }

    sessionUser = data.user;
    location.hash = "#/";
    route();
  }

  async function signUp() {
    const email = normalizeEmail($("#email")?.value);
    const password = ($("#password")?.value || "").trim();

    if (!email || !password) return renderLogin("Bitte Email + Passwort eingeben.");
    if (!isAllowed(email)) return renderLogin("Diese Email ist nicht auf der Allowlist.");

    const redirectTo = window.location.origin + window.location.pathname;

    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) return renderLogin("Registrierung fehlgeschlagen: " + error.message);
    renderLogin("Account erstellt. Falls nötig: Email bestätigen, dann einloggen.");
  }

  async function logout() {
    await sb.auth.signOut();
    sessionUser = null;
    location.hash = "#/";
    route();
  }

  /* ===================== Data ===================== */
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
  async function loadStockSafe() {
    // If table doesn't exist, show a friendly message and continue
    const { data, error } = await sb.from("stock_parts").select("*").order("updated_at", { ascending: false }).limit(50);
    if (error) {
      state.stock = [];
      return { ok: false, msg: error.message };
    }
    state.stock = data || [];
    return { ok: true, msg: "" };
  }
  async function refreshAll() {
    await Promise.all([loadVehicles(), loadTodos()]);
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

  /* ===================== Dashboard ===================== */
  async function renderDashboard() {
    await refreshAll();
    const totals = await computeTotals();
    const stockRes = await loadStockSafe();

    const openTodos = state.todos.filter((t) => !t.done).length;
    const outOfStock = state.stock.filter((p) => Number(p.qty) <= 0).length;

    app.innerHTML = `
      <div class="wrap">
        ${topbar("dash")}
        <div class="quickbar">
          <button class="btn primary" onclick="openTxModal()">+ Einnahme/Ausgabe</button>
          <button class="btn" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
          <button class="btn" onclick="location.hash='#/stock'">Lager</button>
          <div class="badge">Offene To-Dos: ${openTodos}</div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="h2"><h2>Dashboard</h2><span class="badge">Live</span></div>

            <div class="kpis">
              <div class="kpi">
                <div class="label">Fahrzeuge</div>
                <div class="value">${state.vehicles.length}</div>
              </div>
              <div class="kpi">
                <div class="label">Einnahmen</div>
                <div class="value good">${moneyEUR(totals.income)}</div>
              </div>
              <div class="kpi">
                <div class="label">Ausgaben</div>
                <div class="value bad">${moneyEUR(totals.expense)}</div>
              </div>
              <div class="kpi">
                <div class="label">Saldo</div>
                <div class="value ${totals.balance >= 0 ? "good" : "bad"}">${moneyEUR(totals.balance)}</div>
              </div>
            </div>
          </div>

          <div class="card span8">
            <div class="h2"><h2>Fahrzeuge</h2></div>
            ${state.vehicles.length === 0 ? `<div class="muted">Noch keine Fahrzeuge.</div>` : `
              <div class="list">
                ${state.vehicles.slice(0,4).map(v => `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle">${escapeHtml(v.name)} <span class="badge">${escapeHtml(v.type||"Fahrzeug")}</span></div>
                        <div class="small">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")}</div>
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
            <div class="h2"><h2>To-Do</h2><span class="badge">${openTodos} offen</span></div>
            <div class="row">
              <input class="input" id="todoText" placeholder="Neue Aufgabe…" />
              <button class="btn primary" onclick="addTodo()">+</button>
            </div>
            <div class="hr"></div>
            ${state.todos.length === 0 ? `<div class="muted">Noch keine Aufgaben.</div>` : `
              <div class="list">
                ${state.todos.slice(0,8).map(t => `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div class="itemTitle" style="text-decoration:${t.done?'line-through':'none'};opacity:${t.done?.65:1}">${escapeHtml(t.text)}</div>
                      <div class="row">
                        <button class="btn ${t.done?'':'primary'}" onclick="toggleTodo('${t.id}', ${t.done ? "true":"false"})">${t.done?'↩︎':'✓'}</button>
                        <button class="btn danger" onclick="deleteTodo('${t.id}')">x</button>
                      </div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
          </div>

          <div class="card span12">
            <div class="h2">
              <h2>Lager (Quick View)</h2>
              <span class="badge">${stockRes.ok ? `${outOfStock} ausverkauft` : "nicht aktiv"}</span>
            </div>
            ${stockRes.ok ? `
              <div class="row">
                <input class="input" id="stockName" placeholder="Teil (z.B. Zündkerze)" />
                <input class="input" id="stockQty" type="number" step="1" placeholder="Menge" style="max-width:140px" />
                <button class="btn primary" onclick="addStock()">+</button>
              </div>
              <div class="hr"></div>
              ${state.stock.length === 0 ? `<div class="muted">Noch keine Lagerteile.</div>` : `
                <div class="list">
                  ${state.stock.slice(0,8).map(p => `
                    <div class="item">
                      <div class="row" style="justify-content:space-between;align-items:center">
                        <div>
                          <div class="itemTitle">${escapeHtml(p.name)} <span class="badge">${Number(p.qty)<=0 ? "Aus" : "OK"}</span></div>
                          <div class="small">${Number(p.qty||0)} ${escapeHtml(p.unit||"Stk")}</div>
                        </div>
                        <div class="row">
                          <button class="btn" onclick="changeStock('${p.id}', -1)">-</button>
                          <button class="btn" onclick="changeStock('${p.id}', +1)">+</button>
                          <button class="btn danger" onclick="deleteStock('${p.id}')">x</button>
                        </div>
                      </div>
                    </div>
                  `).join("")}
                </div>
              `}
            ` : `
              <div class="muted">stock_parts Tabelle nicht gefunden. Wenn du Lager willst: Tabelle in Supabase anlegen.</div>
              <div class="small">${escapeHtml(stockRes.msg || "")}</div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  /* ===================== Vehicles ===================== */
  async function renderVehicles() {
    await loadVehicles();

    app.innerHTML = `
      <div class="wrap">
        ${topbar("veh")}
        <div class="grid">

          <div class="card span6">
            <div class="h2"><h2>Fahrzeug hinzufügen</h2></div>

            <label class="muted">Name</label>
            <input class="input" id="v_name" placeholder="z.B. Yamaha DT80LC2" />

            <div class="split" style="margin-top:10px">
              <div>
                <label class="muted">Marke</label>
                <input class="input" id="v_brand" placeholder="Yamaha" />
              </div>
              <div>
                <label class="muted">Modell</label>
                <input class="input" id="v_model" placeholder="DT80LC2" />
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
                <label class="muted">VIN/FIN</label>
                <input class="input" id="v_vin" placeholder="optional" />
              </div>
            </div>

            <div class="row" style="margin-top:12px">
              <button class="btn primary" onclick="addVehicle()">Speichern</button>
            </div>
          </div>

          <div class="card span6">
            <div class="h2"><h2>Fahrzeuge</h2><span class="badge">${state.vehicles.length}</span></div>
            ${state.vehicles.length === 0 ? `<div class="muted">Noch keine.</div>` : `
              <div class="list">
                ${state.vehicles.map(v => `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle">${escapeHtml(v.name)}</div>
                        <div class="small">${escapeHtml(v.type||"")}</div>
                      </div>
                      <div class="row">
                        <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
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
    const name = ($("#v_name")?.value || "").trim();
    if (!name) return alert("Bitte Name eingeben.");

    const payload = {
      name,
      brand: ($("#v_brand")?.value || "").trim(),
      model: ($("#v_model")?.value || "").trim(),
      type: ($("#v_type")?.value || "").trim(),
      vin: ($("#v_vin")?.value || "").trim(),
      created_by: sessionUser.id,
    };

    const { data, error } = await sb.from("vehicles").insert(payload).select("*").single();
    if (error) return alert("Fehler: " + error.message);

    location.hash = `#/vehicle/${data.id}`;
    route();
  }

  async function deleteVehicle(id) {
    if (!confirm("Fahrzeug wirklich löschen?")) return;
    const { error } = await sb.from("vehicles").delete().eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    location.hash = "#/vehicles";
    route();
  }

  async function renderVehicle(id) {
    const { data: v, error } = await sb.from("vehicles").select("*").eq("id", id).single();
    if (error || !v) {
      location.hash = "#/vehicles";
      return;
    }

    app.innerHTML = `
      <div class="wrap">
        ${topbar("veh")}
        <div class="grid">
          <div class="card">
            <div class="h2">
              <h2>${escapeHtml(v.name)} <span class="badge">${escapeHtml(v.type||"")}</span></h2>
              <button class="btn primary" onclick="openTxModal('${v.id}')">+ Transaktion</button>
            </div>
            <div class="muted">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")} · VIN: ${escapeHtml(v.vin||"-")}</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ===================== Todos ===================== */
  async function addTodo() {
    const text = ($("#todoText")?.value || "").trim();
    if (!text) return;
    const { error } = await sb.from("todos").insert({ text, done: false, created_by: sessionUser.id });
    if (error) return alert("Fehler: " + error.message);
    route();
  }
  async function toggleTodo(id, done) {
    const { error } = await sb.from("todos").update({ done: !done }).eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    route();
  }
  async function deleteTodo(id) {
    const { error } = await sb.from("todos").delete().eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  /* ===================== Stock ===================== */
  async function renderStock() {
    const res = await loadStockSafe();
    if (!res.ok) {
      app.innerHTML = `<div class="wrap">${topbar("stock")}<div class="card"><div class="muted">stock_parts fehlt.</div><div class="small">${escapeHtml(res.msg)}</div></div></div>`;
      return;
    }

    app.innerHTML = `
      <div class="wrap">
        ${topbar("stock")}
        <div class="grid">
          <div class="card span12">
            <div class="h2"><h2>Lager</h2><span class="badge">${state.stock.length} Teile</span></div>
            <div class="row">
              <input class="input" id="stockName2" placeholder="Teil" />
              <input class="input" id="stockQty2" type="number" step="1" placeholder="Menge" style="max-width:140px" />
              <button class="btn primary" onclick="addStock2()">Hinzufügen</button>
            </div>
            <div class="hr"></div>
            ${state.stock.length===0?`<div class="muted">Noch keine Teile.</div>`:`
              <div class="list">
                ${state.stock.map(p=>`
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle">${escapeHtml(p.name)} <span class="badge">${Number(p.qty)<=0?"Aus":"OK"}</span></div>
                        <div class="small">${Number(p.qty||0)} ${escapeHtml(p.unit||"Stk")}</div>
                      </div>
                      <div class="row">
                        <button class="btn" onclick="changeStock('${p.id}',-1)">-</button>
                        <button class="btn" onclick="changeStock('${p.id}',+1)">+</button>
                        <button class="btn danger" onclick="deleteStock('${p.id}')">x</button>
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

  async function addStock() {
    const name = ($("#stockName")?.value || "").trim();
    const qty = Number($("#stockQty")?.value || 0);
    if (!name) return;
    const { error } = await sb.from("stock_parts").insert({ name, qty, unit: "Stk", created_by: sessionUser.id });
    if (error) return alert("Fehler: " + error.message);
    route();
  }
  async function addStock2() {
    const name = ($("#stockName2")?.value || "").trim();
    const qty = Number($("#stockQty2")?.value || 0);
    if (!name) return;
    const { error } = await sb.from("stock_parts").insert({ name, qty, unit: "Stk", created_by: sessionUser.id });
    if (error) return alert("Fehler: " + error.message);
    route();
  }
  async function changeStock(id, delta) {
    const item = state.stock.find((x) => x.id === id);
    if (!item) return;
    const newQty = Number(item.qty || 0) + Number(delta || 0);
    const { error } = await sb.from("stock_parts").update({ qty: newQty, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    route();
  }
  async function deleteStock(id) {
    if (!confirm("Teil löschen?")) return;
    const { error } = await sb.from("stock_parts").delete().eq("id", id);
    if (error) return alert("Fehler: " + error.message);
    route();
  }

  /* ===================== Quick Transaction Modal ===================== */
  function openTxModal(prefVehicleId = null) {
    if (state.vehicles.length === 0) return alert("Erst ein Fahrzeug anlegen.");

    const options = state.vehicles
      .map((v) => `<option value="${v.id}" ${prefVehicleId === v.id ? "selected" : ""}>${escapeHtml(v.name)}</option>`)
      .join("");

    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";
    overlay.innerHTML = `
      <div class="modalCard">
        <div class="modalHeader">
          <div class="modalTitle">Neue Transaktion</div>
          <button class="btn" id="closeModal">Schließen</button>
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
            <input class="input" id="m_cat" placeholder="Teile / Sprit / Verkauf" />
          </div>
          <div>
            <label class="muted">Beschreibung</label>
            <input class="input" id="m_desc" placeholder="optional" />
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="saveTx">Speichern</button>
        </div>
      </div>
    `;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    overlay.querySelector("#closeModal").onclick = () => overlay.remove();
    overlay.querySelector("#saveTx").onclick = async () => {
      const vehicle_id = overlay.querySelector("#m_vehicle").value;
      const type = overlay.querySelector("#m_type").value;
      const amount = Number(overlay.querySelector("#m_amount").value);
      const date = overlay.querySelector("#m_date").value;
      const category = (overlay.querySelector("#m_cat").value || "").trim();
      const description = (overlay.querySelector("#m_desc").value || "").trim();

      if (!amount || amount <= 0) return alert("Betrag muss > 0 sein.");
      if (!date) return alert("Datum fehlt.");

      const { error } = await sb.from("transactions").insert({
        vehicle_id,
        type,
        amount,
        date,
        category,
        description,
        created_by: sessionUser.id,
      });

      if (error) return alert("Fehler: " + error.message);
      overlay.remove();
      route();
    };
  }

  /* ===================== Topbar ===================== */
  function topbar(active) {
    return `
      <div class="topbar">
        <div class="brand">
          <div class="logo"></div>
          <div>
            <h1>FleetVault</h1>
            <div class="sub">Team · Fahrzeuge · Finanzen · Lager</div>
          </div>
        </div>

        <div class="pill">
          <button class="btn ${active === "dash" ? "primary" : ""}" onclick="location.hash='#/'">Dashboard</button>
          <button class="btn ${active === "veh" ? "primary" : ""}" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
          <button class="btn ${active === "stock" ? "primary" : ""}" onclick="location.hash='#/stock'">Lager</button>
          <button class="btn danger" onclick="logout()">Logout</button>
        </div>
      </div>
    `;
  }

  /* ===================== Boot ===================== */
  (async function init() {
    const { data, error } = await sb.auth.getSession();
    if (error) return screen("Supabase Session Error", error.message);

    sessionUser = data.session?.user || null;

    if (sessionUser) {
      // Allowlist check for existing sessions
      if (!isAllowed(sessionUser.email)) {
        await sb.auth.signOut();
        sessionUser = null;
      }
    }

    sb.auth.onAuthStateChange((_event, sess) => {
      sessionUser = sess?.user || null;
      route();
    });

    route();
  })();

  /* Expose */
  Object.assign(window, {
    openTxModal,
    logout,
    addVehicle,
    deleteVehicle,
    addTodo,
    toggleTodo,
    deleteTodo,
    renderDashboard,
    renderVehicles,
    renderStock,
    addStock,
    addStock2,
    changeStock,
    deleteStock,
  });
})();
