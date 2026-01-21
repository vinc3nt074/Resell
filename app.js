/* FleetVault – Supabase Multi-User Version (GitHub Pages friendly)
   - Echter Login (Email/Passwort)
   - Gemeinsame Datenbank: vehicles, transactions, todos
   - UI: Login clean, Dashboard + global To-Dos + Activity
*/

const $ = (sel) => document.querySelector(sel);

/* Supabase */
const SUPABASE_URL = "https://sikhqmzpcdwwdywaejwl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpa2hxbXpwY2R3d2R5d2FlandsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5OTA0ODgsImV4cCI6MjA4NDU2NjQ4OH0.rabK9l74yjAzJ4flMwE0_AasVu_3cth3g-FRNo4JCuM";

/* Init */
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sessionUser = null;
let state = {
  vehicles: [],
  todos: [],
  activity: []
};

function moneyEUR(n) {
  const v = Number(n || 0);
  return v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){ return escapeHtml(str).replaceAll("`","&#096;"); }

function route() {
  const h = (location.hash || "#/").slice(2);
  const [page, id] = h.split("/");

  if (!sessionUser) return renderLogin();

  if (page === "" || page === undefined) return renderDashboard();
  if (page === "vehicles") return renderVehicles();
  if (page === "vehicle" && id) return renderVehicle(id);

  return renderDashboard();
}

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
      <span class="badge">👤 ${escapeHtml(sessionUser.email || "User")}</span>
      <button class="btn ${active==="dash"?"primary":""}" onclick="location.hash='#/'">Dashboard</button>
      <button class="btn ${active==="veh"?"primary":""}" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
      <button class="btn" onclick="logout()">Logout</button>
    </div>
  </div>`;
}

/* ---------- DATA LOADERS ---------- */
async function refreshAll() {
  await Promise.all([loadVehicles(), loadTodos(), loadActivity()]);
}

async function loadVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return alert("Fehler vehicles: " + error.message);
  state.vehicles = data || [];
}

async function loadTodos() {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return alert("Fehler todos: " + error.message);
  state.todos = data || [];
}

async function loadActivity() {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, date, category, description, created_at, vehicle_id, vehicles(name)")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) return alert("Fehler activity: " + error.message);
  state.activity = data || [];
}

/* ---------- COMPUTED TOTALS ---------- */
async function computeTotals() {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount");

  if (error) return { income:0, expense:0, balance:0 };

  let income = 0, expense = 0;
  for (const t of data || []) {
    const amt = Number(t.amount || 0);
    if (t.type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense, balance: income - expense };
}

async function computeVehicleTotals(vehicleId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("vehicle_id", vehicleId);

  if (error) return { income:0, expense:0, balance:0 };

  let income = 0, expense = 0;
  for (const t of data || []) {
    const amt = Number(t.amount || 0);
    if (t.type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense, balance: income - expense };
}

/* ---------- UI: LOGIN ---------- */
function renderLogin() {
  $("#app").innerHTML = `
    <div class="wrap">
      <div class="topbar">
        <div class="brand">
          <div class="logo"></div>
          <div>
            <h1>FleetVault</h1>
            <div class="sub">Secure Access</div>
          </div>
        </div>
      </div>

      <div class="center">
        <div class="card loginCard">
          <div class="h2"><h2 class="loginTitle">Login</h2><span class="badge">Supabase Auth</span></div>
          <div class="loginSub">Nur eingeloggte Nutzer können zugreifen.</div>
          <div class="hr"></div>

          <label class="muted">Email</label>
          <input class="input" id="email" placeholder="name@mail.de" />

          <label class="muted" style="margin-top:10px;display:block">Passwort</label>
          <input class="input" id="password" type="password" placeholder="••••••••" />

          <div class="row" style="margin-top:12px">
            <button class="btn primary" onclick="signIn()">Einloggen</button>
            <button class="btn" onclick="signUp()">Registrieren</button>
          </div>

          <div class="small">Registrier nur eure 2–4 Emails (oder ich baue dir eine Allowlist, wenn du willst).</div>
        </div>
      </div>
    </div>`;
}

async function signIn() {
  const email = ($("#email").value || "").trim();
  const password = ($("#password").value || "").trim();
  if (!email || !password) return alert("Email + Passwort eingeben.");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert("Login fehlgeschlagen: " + error.message);

  sessionUser = data.user;
  await refreshAll();
  location.hash = "#/";
  route();
}

async function signUp() {
  const email = ($("#email").value || "").trim();
  const password = ($("#password").value || "").trim();
  if (!email || !password) return alert("Email + Passwort eingeben.");

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return alert("Registrierung fehlgeschlagen: " + error.message);

  alert("Account erstellt. Falls Email-Confirm aktiv ist: Mail bestätigen, dann einloggen.");
}

/* ---------- UI: DASHBOARD ---------- */
async function renderDashboard() {
  await refreshAll();
  const t = await computeTotals();
  const openTodos = (state.todos || []).filter(x => !x.done).length;

  $("#app").innerHTML = `
    <div class="wrap">
      ${nav("dash")}
      <div class="grid">

        <div class="card">
          <div class="h2">
            <h2>Dashboard</h2>
            <span class="badge">Online Sync aktiv</span>
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
            <button class="btn primary" onclick="location.hash='#/vehicles'">Fahrzeuge verwalten</button>
            <button class="btn" onclick="quickAddVehicle()">+ Schnell hinzufügen</button>
          </div>
        </div>

        <div class="card span8">
          <div class="h2"><h2>Letzte Fahrzeuge</h2></div>
          ${state.vehicles.length === 0 ? `<div class="muted">Noch keine Fahrzeuge. Leg eins an.</div>` : `
            <div class="list">
              ${state.vehicles.slice(0,4).map(v => `
                <div class="item">
                  <div class="row" style="justify-content:space-between; align-items:center">
                    <div>
                      <div class="itemTitle">${escapeHtml(v.name)} <span class="badge">${escapeHtml(v.type||"Fahrzeug")}</span></div>
                      <div class="small">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")} · VIN: ${escapeHtml(v.vin||"-")}</div>
                    </div>
                    <div class="row">
                      <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <div class="card span4">
          <div class="h2">
            <h2>To-Do</h2>
            <span class="badge">${openTodos} offen</span>
          </div>

          <div class="row">
            <input class="input" id="todoText" placeholder="z.B. Teile bestellen / TÜV Termin" />
            <button class="btn primary" onclick="addTodo()">+</button>
          </div>

          <div class="hr"></div>

          ${(state.todos.length === 0) ? `
            <div class="muted">Noch keine Aufgaben.</div>
          ` : `
            <div class="list">
              ${state.todos.slice(0, 8).map(t => `
                <div class="item">
                  <div class="row" style="justify-content:space-between;align-items:center">
                    <div>
                      <div class="itemTitle" style="text-decoration:${t.done?'line-through':'none'};opacity:${t.done?0.65:1}">
                        ${escapeHtml(t.text)}
                      </div>
                      <div class="small">${new Date(t.created_at).toLocaleString("de-DE")}</div>
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

        <div class="card span12">
          <div class="h2"><h2>Activity</h2><span class="badge">Letzte Transaktionen</span></div>
          ${state.activity.length === 0 ? `<div class="muted">Noch keine Transaktionen.</div>` : `
            <div class="list">
              ${state.activity.map(a => {
                const isInc = a.type === "income";
                const vname = a.vehicles?.name || "Fahrzeug";
                return `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle">${escapeHtml(vname)} <span class="badge">${escapeHtml(a.date)} · ${escapeHtml(a.category || "")}</span></div>
                        <div class="small">${escapeHtml(a.description || "")}</div>
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
    </div>`;
}

/* ---------- UI: VEHICLES ---------- */
async function renderVehicles() {
  await loadVehicles();

  $("#app").innerHTML = `
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
                      <div class="itemTitle">${escapeHtml(v.name)}</div>
                      <div class="small">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")} · ${escapeHtml(v.type||"")}</div>
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
    </div>`;
}

async function renderVehicle(id) {
  const { data: v, error } = await supabase.from("vehicles").select("*").eq("id", id).single();
  if (error || !v) { location.hash = "#/vehicles"; return; }

  const vt = await computeVehicleTotals(id);

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  if (txErr) return alert("Fehler transactions: " + txErr.message);

  $("#app").innerHTML = `
    <div class="wrap">
      ${nav("veh")}

      <div class="grid">
        <div class="card">
          <div class="h2">
            <h2>${escapeHtml(v.name)} <span class="badge">${escapeHtml(v.type||"")}</span></h2>
            <span class="badge">Saldo: <b style="color:${vt.balance>=0?"var(--good)":"var(--bad)"}">${moneyEUR(vt.balance)}</b></span>
          </div>
          <div class="muted">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")} · VIN/FIN: ${escapeHtml(v.vin||"-")}</div>
          <div class="hr"></div>
          <div class="row">
            <button class="btn" onclick="location.hash='#/vehicles'">← Fahrzeuge</button>
            <button class="btn danger" onclick="deleteVehicle('${v.id}')">Fahrzeug löschen</button>
          </div>
        </div>

        <div class="card span6">
          <div class="h2"><h2>Notizen</h2></div>
          <textarea class="input" id="notes">${escapeHtml(v.notes || "")}</textarea>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" onclick="saveNotes('${v.id}')">Notizen speichern</button>
          </div>
        </div>

        <div class="card span6">
          <div class="h2"><h2>Bilder</h2><span class="badge">${(v.images||[]).length}</span></div>
          <div class="muted">Füge Bild-URLs ein. (Upload kann später dazu.)</div>
          <div class="hr"></div>
          <div class="row">
            <input class="input" id="imgUrl" placeholder="https://..." />
            <button class="btn primary" onclick="addImage('${v.id}')">Hinzufügen</button>
          </div>
          <div class="gallery">
            ${(v.images||[]).map((url, idx) => `
              <div>
                <img class="thumb" src="${escapeAttr(url)}" alt="Bild" onerror="this.style.opacity=.3" />
                <div style="margin-top:6px">
                  <button class="btn danger" onclick="removeImage('${v.id}', ${idx})">Entfernen</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="card span8">
          <div class="h2"><h2>Einnahmen & Ausgaben</h2></div>

          <div class="split">
            <div>
              <label class="muted">Typ</label>
              <select class="input" id="t_type">
                <option value="expense">Ausgabe</option>
                <option value="income">Einnahme</option>
              </select>
            </div>
            <div>
              <label class="muted">Betrag (€)</label>
              <input class="input" id="t_amount" type="number" step="0.01" placeholder="z.B. 49.99" />
            </div>
          </div>

          <div class="split" style="margin-top:10px">
            <div>
              <label class="muted">Datum</label>
              <input class="input" id="t_date" type="date" value="${todayISO()}" />
            </div>
            <div>
              <label class="muted">Kategorie</label>
              <input class="input" id="t_cat" placeholder="z.B. Teile / TÜV / Sprit / Verkauf" />
            </div>
          </div>

          <label class="muted" style="margin-top:10px;display:block">Beschreibung</label>
          <input class="input" id="t_desc" placeholder="z.B. NG Bremsscheibe vorne" />

          <div class="row" style="margin-top:12px">
            <button class="btn primary" onclick="addTransaction('${v.id}')">Eintrag hinzufügen</button>
          </div>

          <div class="hr"></div>

          ${(tx||[]).length === 0 ? `<div class="muted">Noch keine Einträge.</div>` : `
            <div class="list">
              ${(tx||[]).map(t => {
                const isInc = t.type === "income";
                return `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <span class="badge">${escapeHtml(t.date)} · ${escapeHtml(t.category||"")}</span>
                      <b style="color:${isInc?"var(--good)":"var(--bad)"}">
                        ${isInc?"+":"-"}${moneyEUR(t.amount)}
                      </b>
                    </div>
                    <div class="small">${escapeHtml(t.description||"")}</div>
                    <div class="row" style="margin-top:8px">
                      <button class="btn danger" onclick="removeTransaction('${t.id}','${v.id}')">Löschen</button>
                    </div>
                  </div>
                `;
              }).join("")}
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
            ${(v.parts_need||[]).map((p,i)=>`
              <div class="item">
                <div class="row" style="justify-content:space-between;align-items:center">
                  <div>${escapeHtml(p)}</div>
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
            ${(v.parts_have||[]).map((p,i)=>`
              <div class="item">
                <div class="row" style="justify-content:space-between;align-items:center">
                  <div>${escapeHtml(p)}</div>
                  <button class="btn danger" onclick="removePart('${v.id}','have',${i})">x</button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>`;
}

/* ---------- ACTIONS: AUTH ---------- */
async function logout() {
  await supabase.auth.signOut();
  sessionUser = null;
  location.hash = "#/";
  route();
}

/* ---------- ACTIONS: VEHICLES ---------- */
async function addVehicle() {
  const name = ($("#v_name").value || "").trim();
  if (!name) return alert("Bitte Name eingeben.");

  const payload = {
    name,
    brand: ($("#v_brand").value || "").trim(),
    model: ($("#v_model").value || "").trim(),
    type: ($("#v_type").value || "").trim(),
    vin: ($("#v_vin").value || "").trim(),
    created_by: sessionUser.id
  };

  const { data, error } = await supabase.from("vehicles").insert(payload).select("*").single();
  if (error) return alert("Fehler: " + error.message);

  location.hash = `#/vehicle/${data.id}`;
  route();
}

async function quickAddVehicle() {
  const name = prompt("Name des Fahrzeugs?");
  if (!name) return;
  const { error } = await supabase
    .from("vehicles")
    .insert({ name: name.trim(), type: "Motorrad", created_by: sessionUser.id });

  if (error) return alert("Fehler: " + error.message);
  location.hash = "#/vehicles";
  route();
}

async function deleteVehicle(id) {
  const ok = confirm("Fahrzeug wirklich löschen?");
  if (!ok) return;

  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) return alert("Fehler: " + error.message);

  location.hash = "#/vehicles";
  route();
}

async function saveNotes(vehicleId) {
  const notes = ($("#notes").value || "");
  const { error } = await supabase.from("vehicles").update({ notes }).eq("id", vehicleId);
  if (error) return alert("Fehler: " + error.message);
  route();
}

async function addImage(vehicleId) {
  const url = ($("#imgUrl").value || "").trim();
  if (!url) return;

  const { data: v, error: e1 } = await supabase.from("vehicles").select("images").eq("id", vehicleId).single();
  if (e1) return alert(e1.message);

  const images = [...(v.images || []), url];
  const { error: e2 } = await supabase.from("vehicles").update({ images }).eq("id", vehicleId);
  if (e2) return alert(e2.message);

  route();
}

async function removeImage(vehicleId, idx) {
  const { data: v, error: e1 } = await supabase.from("vehicles").select("images").eq("id", vehicleId).single();
  if (e1) return alert(e1.message);

  const images = (v.images || []).slice();
  images.splice(idx, 1);

  const { error: e2 } = await supabase.from("vehicles").update({ images }).eq("id", vehicleId);
  if (e2) return alert(e2.message);

  route();
}

/* ---------- ACTIONS: TRANSACTIONS ---------- */
async function addTransaction(vehicleId) {
  const type = $("#t_type").value;
  const amount = Number($("#t_amount").value);
  const date = $("#t_date").value;
  const category = ($("#t_cat").value || "").trim();
  const description = ($("#t_desc").value || "").trim();

  if (!amount || amount <= 0) return alert("Betrag muss > 0 sein.");
  if (!date) return alert("Datum fehlt.");

  const { error } = await supabase.from("transactions").insert({
    vehicle_id: vehicleId,
    type,
    amount,
    date,
    category,
    description,
    created_by: sessionUser.id
  });

  if (error) return alert("Fehler: " + error.message);
  route();
}

async function removeTransaction(transactionId, vehicleId) {
  const { error } = await supabase.from("transactions").delete().eq("id", transactionId);
  if (error) return alert("Fehler: " + error.message);
  location.hash = `#/vehicle/${vehicleId}`;
  route();
}

/* ---------- ACTIONS: PARTS ---------- */
async function addPart(vehicleId, which) {
  const inputId = which === "need" ? "needInput" : "haveInput";
  const txt = ($("#" + inputId).value || "").trim();
  if (!txt) return;

  const cols = which === "need" ? "parts_need" : "parts_have";
  const { data: v, error: e1 } = await supabase.from("vehicles").select(cols).eq("id", vehicleId).single();
  if (e1) return alert(e1.message);

  const arr = [...(v[cols] || []), txt];
  const { error: e2 } = await supabase.from("vehicles").update({ [cols]: arr }).eq("id", vehicleId);
  if (e2) return alert(e2.message);

  route();
}

async function removePart(vehicleId, which, idx) {
  const cols = which === "need" ? "parts_need" : "parts_have";
  const { data: v, error: e1 } = await supabase.from("vehicles").select(cols).eq("id", vehicleId).single();
  if (e1) return alert(e1.message);

  const arr = (v[cols] || []).slice();
  arr.splice(idx, 1);

  const { error: e2 } = await supabase.from("vehicles").update({ [cols]: arr }).eq("id", vehicleId);
  if (e2) return alert(e2.message);

  route();
}

/* ---------- ACTIONS: TODOS (GLOBAL) ---------- */
async function addTodo() {
  const text = ($("#todoText").value || "").trim();
  if (!text) return;

  const { error } = await supabase.from("todos").insert({ text, done: false, created_by: sessionUser.id });
  if (error) return alert("Fehler: " + error.message);
  route();
}

async function toggleTodo(id, currentlyDone) {
  const { error } = await supabase.from("todos").update({ done: !currentlyDone }).eq("id", id);
  if (error) return alert("Fehler: " + error.message);
  route();
}

async function deleteTodo(id) {
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return alert("Fehler: " + error.message);
  route();
}

async function clearDoneTodos() {
  const { error } = await supabase.from("todos").delete().eq("done", true);
  if (error) return alert("Fehler: " + error.message);
  route();
}

/* ---------- BOOT ---------- */
async function initAuth() {
  const { data } = await supabase.auth.getSession();
  sessionUser = data.session?.user || null;

  supabase.auth.onAuthStateChange(async (_event, sess) => {
    sessionUser = sess?.user || null;
    if (sessionUser) await refreshAll();
    route();
  });

  route();
}

window.addEventListener("hashchange", route);
initAuth();
