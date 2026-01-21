document.getElementById("app").innerHTML =
  "<div style='min-height:100vh;background:#070a12;color:#e9eeff;font-family:system-ui;padding:24px'>FleetVault lädt…</div>";

window.addEventListener("error", (e) => {
  document.getElementById("app").innerHTML =
    "<div style='min-height:100vh;background:#070a12;color:#ff6b8a;font-family:system-ui;padding:24px'>" +
    "JS Fehler: " + (e.message || "unknown") + "</div>";
});
