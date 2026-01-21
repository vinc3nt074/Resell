/* FleetVault – Multi-User Web App (Supabase + GitHub Pages)
   FINAL STABLE VERSION
*/

const $ = (s) => document.querySelector(s);

/* ================= SUPABASE ================= */
const SUPABASE_URL = "https://sikhqmzpcdwwdywaejwl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpa2hxbXpwY2R3d2R5d2FlandsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5OTA0ODgsImV4cCI6MjA4NDU2NjQ4OH0.rabK9l74yjAzJ4flMwE0_AasVu_3cth3g-FRNo4JCuM";

/* sichere Initialisierung */
if (!window.supabase) {
  document.getElementById("app").innerHTML =
    "<div style='color:white;padding:24px'>Supabase SDK nicht geladen</div>";
  throw new Error("Supabase SDK missing");
}

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/* ================= STATE ================= */
let user = null;
let vehicles = [];
let todos = [];
let activity = [];

/* ================= HELPERS ================= */
const eur = (n) =>
  Number(n || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });

const today = () => new Date().toISOString().slice(0, 10);

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/* ================= ROUTING ================= */
window.addEventListener("hashchange", render);

async function render() {
  const route = location.hash.replace("#/", "");
  if (!user) return renderLogin();
  if (route.startsWith("vehicle/")) {
    return renderVehicle(route.split("/")[1]);
  }
  if (route === "vehicles") return renderVehicles();
  return renderDashboard();
}

/* ================= AUTH ================= */
async function initAuth() {
  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null;

  supabase.auth.onAuthStateChange((_e, session) => {
    user = session?.user || null;
    render();
  });

  render();
}

async function login() {
  const email = $("#email").value;
  const password = $("#password").value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) alert(error.message);
}

async function signup() {
  const email = $("#email").value;
  const password = $("#password").value;

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) alert(error.message);
  else alert("Account erstellt – jetzt einloggen");
}

async function logout() {
  await supabase.auth.signOut();
}

/* ================= DATA ================= */
async function loadAll() {
  vehicles =
    (await supabase.from("vehicles").select("*").order("created_at")).data ||
    [];
  todos =
    (await supabase.from("todos").select("*").order("created_at")).data || [];
  activity =
    (
      await supabase
        .from("transactions")
        .select("*, vehicles(name)")
        .order("created_at", { ascending: false })
        .limit(6)
    ).data || [];
}

/* ================= UI ================= */

function layout(content) {
  return `
  <div class="wrap">
    <div class="topbar">
      <div class="brand">
        <div class="logo"></div>
        <div>
          <h1>FleetVault</h1>
          <div class="sub">Private Fahrzeugverwaltung</div>
        </div>
      </div>
      <div class="pill">
        <span class="badge">${user.email}</span>
        <button class="btn" onclick="location.hash='#/'">Dashboard</button>
        <button class="btn" onclick="location.hash='#/vehicles'">Fahrzeuge</button>
        <button class="btn danger" onclick="logout()">Logout</button>
      </div>
    </div>
    ${content}
  </div>`;
}

/* ---------- LOGIN ---------- */
function renderLogin() {
  $("#app").innerHTML = `
  <div class="center">
    <div class="card loginCard">
      <h2>Login</h2>
      <input class="input" id="email" placeholder="Email" />
      <input class="input" id="password" type="password" placeholder="Passwort" />
      <div class="row">
        <button class="btn primary" onclick="login()">Login</button>
        <button class="btn" onclick="signup()">Registrieren</button>
      </div>
    </div>
  </div>`;
}

/* ---------- DASHBOARD ---------- */
async function renderDashboard() {
  await loadAll();

  const income = activity
    .filter((a) => a.type === "income")
    .reduce((s, a) => s + Number(a.amount), 0);
  const expense = activity
    .filter((a) => a.type === "expense")
    .reduce((s, a) => s + Number(a.amount), 0);

  $("#app").innerHTML = layout(`
  <div class="grid">
    <div class="card">
      <div class="kpis">
        <div class="kpi"><div class="label">Fahrzeuge</div><div class="value">${vehicles.length}</div></div>
        <div class="kpi"><div class="label">Einnahmen</div><div class="value good">${eur(income)}</div></div>
        <div class="kpi"><div class="label">Ausgaben</div><div class="value bad">${eur(expense)}</div></div>
        <div class="kpi"><div class="label">To-Dos</div><div class="value">${todos.filter(t=>!t.done).length}</div></div>
      </div>
    </div>

    <div class="card span8">
      <h2>Letzte Fahrzeuge</h2>
      ${vehicles.slice(0,4).map(v=>`
        <div class="item">
          <b>${esc(v.name)}</b>
          <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
        </div>
      `).join("") || "<div class='muted'>Keine Fahrzeuge</div>"}
    </div>

    <div class="card span4">
      <h2>To-Do</h2>
      <input class="input" id="todoText" placeholder="Neue Aufgabe" />
      <button class="btn primary" onclick="addTodo()">+</button>
      ${todos.map(t=>`
        <div class="item">
          <span style="text-decoration:${t.done?'line-through':'none'}">${esc(t.text)}</span>
          <button class="btn" onclick="toggleTodo('${t.id}',${t.done})">✓</button>
        </div>
      `).join("")}
    </div>
  </div>`);
}

/* ---------- VEHICLES ---------- */
async function renderVehicles() {
  await loadAll();

  $("#app").innerHTML = layout(`
  <div class="grid">
    <div class="card span6">
      <h2>Fahrzeug hinzufügen</h2>
      <input class="input" id="vname" placeholder="Name" />
      <select class="input" id="vtype">
        <option>Motorrad</option>
        <option>Roller</option>
        <option>Auto</option>
      </select>
      <button class="btn primary" onclick="addVehicle()">Speichern</button>
    </div>

    <div class="card span6">
      <h2>Fahrzeuge</h2>
      ${vehicles.map(v=>`
        <div class="item">
          <b>${esc(v.name)}</b>
          <button class="btn" onclick="location.hash='#/vehicle/${v.id}'">Öffnen</button>
        </div>
      `).join("")}
    </div>
  </div>`);
}

async function addVehicle() {
  const name = $("#vname").value;
  const type = $("#vtype").value;
  if (!name) return;

  await supabase.from("vehicles").insert({
    name,
    type,
    created_by: user.id,
  });
  location.hash = "#/vehicles";
}

/* ---------- SINGLE VEHICLE ---------- */
async function renderVehicle(id) {
  const { data: v } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();

  $("#app").innerHTML = layout(`
  <div class="card">
    <h2>${esc(v.name)}</h2>
    <textarea class="input" id="notes">${esc(v.notes||"")}</textarea>
    <button class="btn primary" onclick="saveNotes('${id}')">Notizen speichern</button>
  </div>
  `);
}

async function saveNotes(id) {
  await supabase
    .from("vehicles")
    .update({ notes: $("#notes").value })
    .eq("id", id);
}

/* ---------- TODOS ---------- */
async function addTodo() {
  const text = $("#todoText").value;
  if (!text) return;
  await supabase.from("todos").insert({ text });
  renderDashboard();
}

async function toggleTodo(id, done) {
  await supabase.from("todos").update({ done: !done }).eq("id", id);
  renderDashboard();
}

/* ================= BOOT ================= */
initAuth();
