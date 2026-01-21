/* FleetVault MVP – statisch, speichert in localStorage
   Global To-Dos im Dashboard enthalten.
   Später: sync + echtes Login via Supabase/Firebase leicht möglich.
*/
const $ = (sel) => document.querySelector(sel);

const STORE_KEY = "fleetvault_v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 8);
}

function moneyEUR(n) {
  const v = Number(n || 0);
  return v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.users || !parsed.vehicles) return seed();
    parsed.todos ||= [];
    return parsed;
  } catch {
    return seed();
  }
}

function save(db) {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

function seed() {
  return {
    users: ["Vince", "User2", "User3", "User4"],
    currentUser: null,
    vehicles: [],
    todos: [] // Global ToDos
  };
}

function totals(db) {
  let income = 0, expense = 0;
  for (const v of db.vehicles) {
    for (const t of (v.transactions || [])) {
      const amt = Number(t.amount || 0);
      if (t.type === "income") income += amt;
      else expense += amt;
    }
  }
  return { income, expense, balance: income - expense };
}

function vehicleTotals(v) {
  let income = 0, expense = 0;
  for (const t of (v.transactions || [])) {
    const amt = Number(t.amount || 0);
    if (t.type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense, balance: income - expense };
}

function route() {
  const h = (location.hash || "#/").slice(2); // remove "#/"
  const [page, id] = h.split("/");

  if (!db.currentUser) return renderLogin();

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
      <span class="badge">👤 ${db.currentUser}</span>
      <button class="btn ${active==="dash"?"primary":""}" onclick="location.hash='#/'">Dashboard</button>
      <button class="btn ${active==="veh"?"primary":""}" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
      <button class="btn" onclick="logout()">Logout</button>
    </div>
  </div>`;
}

function renderLogin() {
  $("#app").innerHTML = `
    <div class="wrap">
      <div class="topbar">
        <div class="brand">
          <div class="logo"></div>
          <div>
            <h1>FleetVault</h1>
            <div class="sub">MVP Login (später echtes Login)</div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="card span6">
          <div class="h2"><h2>Einloggen</h2><span class="badge">futuristisch · minimal</span></div>
          <div class="muted">Wähle einen Nutzer. Später ersetzen wir das durch Passwort/Invite.</div>
          <div class="hr"></div>

          <label class="muted">Nutzer</label>
          <select class="input" id="userSelect">
            ${db.users.map(u => `<option value="${u}">${u}</option>`).join("")}
          </select>

          <div class="row" style="margin-top:12px">
            <button class="btn primary" onclick="login()">Weiter</button>
            <button class="btn" onclick="resetAll()">Alles zurücksetzen</button>
          </div>

          <div class="small">Hinweis: Daten sind aktuell nur in diesem Browser gespeichert.</div>
        </div>

        <div class="card span6">
          <div class="h2"><h2>Was kann das MVP?</h2></div>
          <div class="list">
            <div class="item">
              <div class="itemTitle">✅ Dashboard</div>
              <div class="small">Übersicht: Fahrzeuge, Einnahmen, Ausgaben, Saldo + To-Do</div>
            </div>
            <div class="item">
              <div class="itemTitle">✅ Fahrzeuge + Detailseite</div>
              <div class="small">Notizen, Bilder (URLs), Ersatzteile, Finanz-Einträge</div>
            </div>
            <div class="item">
              <div class="itemTitle">➡️ Nächster Schritt</div>
              <div class="small">Gemeinsame Online-Daten (2–4 Personen) via Supabase/Firebase</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderDashboard() {
  const t = totals(db);
  const openTodos = (db.todos || []).filter(x => !x.done).length;

  $("#app").innerHTML = `
    <div class="wrap">
      ${nav("dash")}
      <div class="grid">
        <div class="card">
          <div class="h2">
            <h2>Dashboard</h2>
            <span class="badge">Live aus deinen Daten</span>
          </div>

          <div class="kpis">
            <div class="kpi">
              <div class="label">Fahrzeuge</div>
              <div class="value">${db.vehicles.length}</div>
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
          ${db.vehicles.length === 0 ? `<div class="muted">Noch keine Fahrzeuge. Leg eins an.</div>` : `
            <div class="list">
              ${db.vehicles.slice().reverse().slice(0,4).map(v => {
                const vt = vehicleTotals(v);
                return `
                  <div class="item">
                    <div class="row" style="justify-content:space-between; align-items:center">
                      <div>
                        <div class="itemTitle">${escapeHtml(v.name)} <span class="badge">${escapeHtml(v.type||"Fahrzeug")}</span></div>
                        <div class="small">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")} · VIN: ${escapeHtml(v.vin||"-")}</div>
                      </div>
                      <div style="text-align:right">
                        <div class="small">Saldo</div>
                        <div style="font-weight:900; color:${vt.balance>=0?"var(--good)":"var(--bad)"}">${moneyEUR(vt.balance)}</div>
                        <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
                      </div>
                    </div>
                  </div>`;
              }).join("")}
            </div>
          `}
        </div>

        <div class="card span4">
          <div class="h2">
            <h2>To-Do</h2>
            <span class="badge">${openTodos} offen</span>
          </div>

          <div class="row">
            <input class="input" id="todoText" placeholder="z.B. Öl wechseln / Teile bestellen" />
            <button class="btn primary" onclick="addTodo()">+</button>
          </div>

          <div class="hr"></div>

          ${(!db.todos || db.todos.length === 0) ? `
            <div class="muted">Noch keine Aufgaben. Schreib oben eine rein.</div>
          ` : `
            <div class="list">
              ${db.todos.slice().reverse().slice(0, 8).map(t => `
                <div class="item">
                  <div class="row" style="justify-content:space-between;align-items:center">
                    <div>
                      <div class="itemTitle" style="text-decoration:${t.done?'line-through':'none'};opacity:${t.done?0.65:1}">
                        ${escapeHtml(t.text)}
                      </div>
                      <div class="small">von ${escapeHtml(t.by || "-")} · ${new Date(t.createdAt).toLocaleString("de-DE")}</div>
                    </div>
                    <div class="row">
                      <button class="btn ${t.done?'':'primary'}" onclick="toggleTodo('${t.id}')">
                        ${t.done ? '↩︎' : '✓'}
                      </button>
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

        <div class="card span4">
          <div class="h2"><h2>Quick Tips</h2></div>
          <div class="muted">
            • Bilder: am einfachsten als URL (z.B. aus iCloud/Drive/Imgur).<br/>
            • Später Multi-User: wir hängen Supabase dran (Login + gemeinsame DB).<br/>
            • Kategorien helfen fürs Auswerten (TÜV, Teile, Sprit, Verkauf …).
          </div>
        </div>
      </div>
    </div>`;
}

function renderVehicles() {
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
          <div class="h2"><h2>Deine Fahrzeuge</h2><span class="badge">${db.vehicles.length} insgesamt</span></div>

          ${db.vehicles.length === 0 ? `<div class="muted">Noch leer.</div>` : `
            <div class="list">
              ${db.vehicles.map(v => {
                const vt = vehicleTotals(v);
                return `
                  <div class="item">
                    <div class="row" style="justify-content:space-between;align-items:center">
                      <div>
                        <div class="itemTitle">${escapeHtml(v.name)}</div>
                        <div class="small">${escapeHtml(v.brand||"")} ${escapeHtml(v.model||"")} · ${escapeHtml(v.type||"")}</div>
                        <div class="small">Saldo: <b style="color:${vt.balance>=0?"var(--good)":"var(--bad)"}">${moneyEUR(vt.balance)}</b></div>
                      </div>
                      <div class="row">
                        <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
                        <button class="btn danger" onclick="deleteVehicle('${v.id}')">Löschen</button>
                      </div>
                    </div>
                  </div>`;
              }).join("")}
            </div>
          `}
        </div>
      </div>
    </div>`;
}

function renderVehicle(id) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) { location.hash = "#/vehicles"; return; }

  v.transactions ||= [];
  v.parts ||= { need: [], have: [] };
  v.images ||= [];
  v.notes ||= "";

  const vt = vehicleTotals(v);

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
          <textarea class="input" id="notes">${escapeHtml(v.notes)}</textarea>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" onclick="saveNotes('${v.id}')">Notizen speichern</button>
          </div>
        </div>

        <div class="card span6">
          <div class="h2"><h2>Bilder</h2><span class="badge">${v.images.length}</span></div>
          <div class="muted">Füge Bild-URLs ein (z.B. aus Drive/iCloud/Imgur). Später können wir Upload einbauen.</div>
          <div class="hr"></div>
          <div class="row">
            <input class="input" id="imgUrl" placeholder="https://..." />
            <button class="btn primary" onclick="addImage('${v.id}')">Hinzufügen</button>
          </div>
          <div class="gallery">
            ${v.images.map((url, idx) => `
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

          ${v.transactions.length === 0 ? `<div class="muted">Noch keine Einträge.</div>` : `
            <table class="table">
              <tbody>
                ${v.transactions.slice().reverse().map((t, idxFromEnd) => {
                  const idx = v.transactions.length - 1 - idxFromEnd;
                  const isInc = t.type === "income";
                  return `
                    <tr class="tr">
                      <td>
                        <div class="row" style="justify-content:space-between;align-items:center">
                          <span class="badge">${escapeHtml(t.date)} · ${escapeHtml(t.category||"")}</span>
                          <b style="color:${isInc?"var(--good)":"var(--bad)"}">
                            ${isInc?"+":"-"}${moneyEUR(t.amount)}
                          </b>
                        </div>
                        <div class="small">${escapeHtml(t.desc||"")}</div>
                        <div class="row" style="margin-top:8px">
                          <button class="btn danger" onclick="removeTransaction('${v.id}', ${idx})">Löschen</button>
                        </div>
                      </td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
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
            ${v.parts.need.map((p,i)=>`
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
            ${v.parts.have.map((p,i)=>`
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

/* Actions */
function login() {
  const u = $("#userSelect").value;
  db.currentUser = u;
  save(db);
  location.hash = "#/";
}
function logout() {
  db.currentUser = null;
  save(db);
  location.hash = "#/";
}
function resetAll() {
  localStorage.removeItem(STORE_KEY);
  db = load();
  route();
}

function addVehicle() {
  const name = $("#v_name").value.trim();
  if (!name) return alert("Bitte Name eingeben.");

  const v = {
    id: uid(),
    name,
    brand: $("#v_brand").value.trim(),
    model: $("#v_model").value.trim(),
    type: $("#v_type").value,
    vin: $("#v_vin").value.trim(),
    notes: "",
    images: [],
    parts: { need: [], have: [] },
    transactions: [],
    createdBy: db.currentUser,
    createdAt: new Date().toISOString()
  };

  db.vehicles.push(v);
  save(db);
  location.hash = `#/vehicle/${v.id}`;
}

function quickAddVehicle() {
  const name = prompt("Name des Fahrzeugs?");
  if (!name) return;
  db.vehicles.push({
    id: uid(),
    name: name.trim(),
    brand: "",
    model: "",
    type: "Motorrad",
    vin: "",
    notes: "",
    images: [],
    parts: { need: [], have: [] },
    transactions: [],
    createdBy: db.currentUser,
    createdAt: new Date().toISOString()
  });
  save(db);
  location.hash = "#/vehicles";
}

function deleteVehicle(id) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  if (!confirm(`"${v.name}" wirklich löschen?`)) return;
  db.vehicles = db.vehicles.filter(x => x.id !== id);
  save(db);
  location.hash = "#/vehicles";
}

function saveNotes(id) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  v.notes = $("#notes").value;
  save(db);
  route();
}

function addImage(id) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  const url = $("#imgUrl").value.trim();
  if (!url) return;
  v.images.push(url);
  save(db);
  route();
}
function removeImage(id, idx) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  v.images.splice(idx, 1);
  save(db);
  route();
}

function addTransaction(id) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;

  const type = $("#t_type").value;
  const amount = Number($("#t_amount").value);
  const date = $("#t_date").value;
  const category = $("#t_cat").value.trim();
  const desc = $("#t_desc").value.trim();

  if (!amount || amount <= 0) return alert("Betrag muss > 0 sein.");
  if (!date) return alert("Datum fehlt.");

  v.transactions.push({
    id: uid(),
    type,
    amount,
    date,
    category,
    desc,
    by: db.currentUser
  });

  save(db);
  route();
}
function removeTransaction(id, idx) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  v.transactions.splice(idx, 1);
  save(db);
  route();
}

function addPart(id, which) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  const inputId = which === "need" ? "needInput" : "haveInput";
  const txt = $("#" + inputId).value.trim();
  if (!txt) return;
  v.parts[which].push(txt);
  save(db);
  route();
}
function removePart(id, which, idx) {
  const v = db.vehicles.find(x => x.id === id);
  if (!v) return;
  v.parts[which].splice(idx, 1);
  save(db);
  route();
}

/* Global To-Dos */
function ensureTodos() {
  db.todos ||= [];
}
function addTodo() {
  ensureTodos();
  const el = document.getElementById("todoText");
  const text = (el?.value || "").trim();
  if (!text) return;

  db.todos.push({
    id: uid(),
    text,
    done: false,
    by: db.currentUser,
    createdAt: new Date().toISOString()
  });

  save(db);
  route();
}
function toggleTodo(id) {
  ensureTodos();
  const t = db.todos.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  save(db);
  route();
}
function deleteTodo(id) {
  ensureTodos();
  db.todos = db.todos.filter(x => x.id !== id);
  save(db);
  route();
}
function clearDoneTodos() {
  ensureTodos();
  db.todos = db.todos.filter(x => !x.done);
  save(db);
  route();
}

/* basic escaping */
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){ return escapeHtml(str).replaceAll("`","&#096;"); }

/* boot */
let db = load();
window.addEventListener("hashchange", route);
route();
