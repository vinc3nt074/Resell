// FleetVault – "unkaputtbar": zeigt Fehler direkt auf der Seite

(() => {
  const appEl = document.getElementById("app");
  if (!appEl) {
    document.body.innerHTML =
      "<div style='padding:24px;font-family:system-ui'>Fehler: #app fehlt in index.html</div>";
    return;
  }

  // On-page error overlay
  function showError(title, msg) {
    appEl.innerHTML = `
      <div style="min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px">
        <div style="max-width:720px;margin:0 auto;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:18px;padding:16px">
          <div style="font-weight:900;font-size:18px;margin-bottom:8px;color:#ff6b8a">${title}</div>
          <div style="white-space:pre-wrap;line-height:1.4;opacity:.9">${msg}</div>
        </div>
      </div>`;
  }

  window.addEventListener("error", (e) => showError("JS Fehler", e.message || "unknown"));
  window.addEventListener("unhandledrejection", (e) =>
    showError("Promise Fehler", (e.reason && (e.reason.message || String(e.reason))) || "unknown")
  );

  // Quick "loading" screen so it's never blank
  appEl.innerHTML = `
    <div style="min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px">
      <div style="max-width:520px;margin:0 auto;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:18px;padding:16px">
        <div style="font-weight:900;font-size:18px;margin-bottom:6px">FleetVault</div>
        <div style="opacity:.75">Lade…</div>
      </div>
    </div>`;

  // ===== Supabase config =====
  const SUPABASE_URL = "https://sikhqmzpcdwwdywaejwl.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpa2hxbXpwY2R3d2R5d2FlandsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5OTA0ODgsImV4cCI6MjA4NDU2NjQ4OH0.rabK9l74yjAzJ4flMwE0_AasVu_3cth3g-FRNo4JCuM";

  // Check that Supabase SDK exists
  if (!window.supabase || !window.supabase.createClient) {
    showError(
      "Supabase SDK fehlt",
      "Die Supabase-Library wurde nicht geladen.\n\nFix:\nIn index.html MUSS VOR app.js stehen:\n<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>\n<script src=\"app.js\"></script>"
    );
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Helpers
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  // Render Login
  function renderLogin(infoText = "") {
    appEl.innerHTML = `
      <div style="min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px;display:flex;align-items:center;justify-content:center">
        <div style="width:min(480px,100%);border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:18px;padding:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:34px;height:34px;border-radius:14px;background:linear-gradient(135deg, rgba(100,166,255,.55), rgba(102,255,176,.35));box-shadow:0 12px 28px rgba(0,0,0,.35)"></div>
            <div>
              <div style="font-weight:900;font-size:16px">FleetVault</div>
              <div style="opacity:.7;font-size:12px">Secure Access</div>
            </div>
          </div>

          ${infoText ? `<div style="opacity:.75;font-size:12px;margin-bottom:10px">${esc(infoText)}</div>` : ""}

          <label style="opacity:.75;font-size:12px">Email</label>
          <input id="email" style="width:100%;margin-top:6px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:#e9eeff;outline:none" placeholder="name@mail.de"/>

          <label style="opacity:.75;font-size:12px;margin-top:10px;display:block">Passwort</label>
          <input id="password" type="password" style="width:100%;margin-top:6px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:#e9eeff;outline:none" placeholder="••••••••"/>

          <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
            <button id="btnLogin" style="cursor:pointer;font-weight:800;padding:10px 12px;border-radius:14px;border:1px solid rgba(100,166,255,.45);background:rgba(100,166,255,.12);color:#e9eeff">Einloggen</button>
            <button id="btnSignup" style="cursor:pointer;font-weight:800;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e9eeff">Registrieren</button>
          </div>

          <div style="opacity:.6;font-size:12px;margin-top:10px">Wenn du nach Registrierung nichts siehst: evtl. Email bestätigen (Supabase Setting).</div>
        </div>
      </div>
    `;

    document.getElementById("btnLogin").onclick = signIn;
    document.getElementById("btnSignup").onclick = signUp;
  }

  async function signIn() {
    const email = (document.getElementById("email")?.value || "").trim();
    const password = (document.getElementById("password")?.value || "").trim();
    if (!email || !password) return renderLogin("Bitte Email + Passwort eingeben.");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return renderLogin("Login fehlgeschlagen: " + error.message);
    // onAuthStateChange rendert weiter
  }

  async function signUp() {
    const email = (document.getElementById("email")?.value || "").trim();
    const password = (document.getElementById("password")?.value || "").trim();
    if (!email || !password) return renderLogin("Bitte Email + Passwort eingeben.");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return renderLogin("Registrierung fehlgeschlagen: " + error.message);

    renderLogin("Account erstellt. Falls Email-Bestätigung aktiv ist: Mail bestätigen, dann einloggen.");
  }

  function renderDashboard(userEmail) {
    appEl.innerHTML = `
      <div style="min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px">
        <div style="max-width:900px;margin:0 auto;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);border-radius:18px;padding:16px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
            <div>
              <div style="font-weight:900;font-size:18px">Dashboard</div>
              <div style="opacity:.7;font-size:12px">Eingeloggt als: ${esc(userEmail)}</div>
            </div>
            <button id="btnLogout" style="cursor:pointer;font-weight:800;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,107,138,.45);background:rgba(255,107,138,.10);color:#e9eeff">Logout</button>
          </div>
          <div style="height:1px;background:rgba(255,255,255,.08);margin:14px 0"></div>
          <div style="opacity:.75">Wenn du hier bist, funktioniert der Login. Als nächstes können wir wieder Fahrzeuge/ToDos/DB-UI reinsetzen.</div>
        </div>
      </div>
    `;
    document.getElementById("btnLogout").onclick = async () => {
      await supabase.auth.signOut();
    };
  }

  async function boot() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return showError("Supabase Session Error", error.message);

    const sessUser = data.session?.user || null;
    if (!sessUser) renderLogin();
    else renderDashboard(sessUser.email || "User");

    supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      if (!u) renderLogin();
      else renderDashboard(u.email || "User");
    });
  }

  boot();
})();
