/** Shared HTML shell for the Vault prophecies site. */

export function page(
  title: string,
  body: string,
  active: 'gallery' | 'publish' | 'detail' | 'key' = 'gallery',
  script = '/app.js',
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)} · CAPs Mind Prophecies</title>
<meta name="description" content="Vault prophecy tablets from CAPs mind on Base. Mint numbered copies with GEAR."/>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
<link rel="manifest" href="/manifest.webmanifest"/>
<meta property="og:title" content="CAPs Mind Prophecies"/>
<meta property="og:image" content="https://capsmind.gearup.wtf/og.jpg"/>
<style>
:root {
  --bg:#07090f; --panel:#101522; --line:#243049; --text:#e8eefc; --dim:#8b9bb8;
  --accent:#3b82f6; --walletBlue:#2563eb; --accent2:#93c5fd; --ok:#3ddc84; --bad:#ff5c7a; --tablet:#1e3a8a;
}
* { box-sizing:border-box; }
body {
  margin:0; min-height:100vh; color:var(--text);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  background:
    radial-gradient(1200px 600px at 20% -10%, #1e3a8a55, transparent),
    radial-gradient(900px 500px at 100% 0%, #0ea5e933, transparent),
    var(--bg);
}
a { color:var(--accent2); text-decoration:none; }
a:hover { text-decoration:underline; }
header {
  display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;
  padding:14px 18px; border-bottom:1px solid var(--line); backdrop-filter:blur(8px);
  position:sticky; top:0; background:#07090fdd; z-index:10;
}
.brand { font-weight:800; letter-spacing:.04em; }
.brand small { display:block; color:var(--accent2); font-size:11px; letter-spacing:.18em; font-weight:600; }
nav { display:flex; gap:14px; flex-wrap:wrap; align-items:center; }
nav a { color:var(--dim); font-size:13px; letter-spacing:.08em; text-transform:uppercase; }
nav a.on, nav a:hover { color:var(--accent2); text-decoration:none; }
/* Header wallet toggle: white with blue text when disconnected, solid blue with white text when connected. */
.walletbtn {
  font:700 13px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; letter-spacing:.02em;
  border:2px solid var(--walletBlue); border-radius:999px; padding:9px 16px; cursor:pointer;
  background:#ffffff; color:var(--walletBlue); white-space:nowrap;
}
.walletbtn:hover { box-shadow:0 0 0 3px #3b82f655; }
.walletbtn:focus-visible { outline:2px solid #ffffff; outline-offset:2px; }
.walletbtn.connected { background:var(--walletBlue); color:#ffffff; }
.walletbtn:disabled { opacity:.7; cursor:progress; }
main { max-width:1080px; margin:0 auto; padding:20px 16px 64px; }
.banner {
  border:1px solid var(--line); border-left:3px solid var(--accent); background:var(--panel);
  border-radius:12px; padding:12px 14px; color:var(--dim); margin-bottom:18px;
}
.banner b { color:var(--accent2); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
.card {
  background:var(--panel); border:1px solid var(--line); border-radius:16px; overflow:hidden;
  display:flex; flex-direction:column; min-height:100%;
}
.card:hover { border-color:var(--accent); }
.card .shot {
  aspect-ratio:4/3; object-fit:cover; width:100%; background:#0b1220; display:block;
}
.card .body { padding:12px 14px 14px; display:flex; flex-direction:column; gap:8px; flex:1; }
.card .desc {
  white-space:pre-wrap; font-size:12px; letter-spacing:.04em; color:var(--text);
  display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;
  text-transform:uppercase; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
.meta { color:var(--dim); font-size:12px; display:flex; justify-content:space-between; gap:8px; }
.btn, button {
  font:inherit; cursor:pointer; border-radius:10px; border:1px solid var(--line);
  background:#152036; color:var(--text); padding:10px 14px;
}
button.primary, .btn.primary { border-color:var(--accent); color:var(--accent2); font-weight:700; }
button:disabled { opacity:.45; cursor:not-allowed; }
label { display:block; color:var(--dim); font-size:12px; letter-spacing:.08em; margin:12px 0 6px; text-transform:uppercase; }
input, textarea {
  width:100%; border-radius:10px; border:1px solid var(--line); background:#0b1220; color:var(--text);
  padding:10px 12px; font:inherit;
}
textarea { min-height:140px; resize:vertical; text-transform:uppercase; letter-spacing:.03em; }
.tablet-frame {
  border:8px solid var(--tablet); outline:2px solid #dbeafe; border-radius:8px; background:#1e3a8a;
  padding:18px; box-shadow:0 10px 40px #0008;
}
.tablet-frame img { width:100%; display:block; border-radius:4px; }
.tablet-text {
  margin-top:14px; white-space:pre-wrap; text-align:center; text-transform:uppercase;
  letter-spacing:.06em; font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; color:#f8fafc;
}
.row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:14px; }
.kv { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--line); }
.kv span:first-child { color:var(--dim); }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:16px; }
.ok { color:var(--ok); } .bad { color:var(--bad); }
.empty { color:var(--dim); text-align:center; padding:48px 12px; border:1px dashed var(--line); border-radius:16px; }
footer { color:var(--dim); font-size:12px; text-align:center; padding:24px 12px 40px; }
footer .gear-logo-link { display:inline-block; vertical-align:middle; line-height:0; opacity:.9; transition:opacity .15s ease; }
footer .gear-logo-link:hover, footer .gear-logo-link:focus-visible { opacity:1; }
footer .gear-logo-link:active { opacity:.7; }
footer .gear-logo-link img { height:1.35em; width:auto; display:block; image-rendering:pixelated; position:relative; top:-1px; }
</style>
</head>
<body>
<header>
  <div class="brand">CAPs MIND<small>VAULT PROPHECIES</small></div>
  <nav>
    <a href="/" class="${active === 'gallery' || active === 'detail' ? 'on' : ''}">Tablets</a>
    <a href="/publish" class="${active === 'publish' ? 'on' : ''}">Publish</a>
    <a href="/key" class="${active === 'key' ? 'on' : ''}">Key</a>
  </nav>
  <button type="button" class="walletbtn" id="walletBtn" aria-pressed="false" aria-label="Connect wallet">Connect wallet</button>
</header>
<main>
${body}
</main>
<footer>doubles at every mint, 1000 cap, ${GEAR_LOGO_LINK} only—you pay gas. 90%-treasury 10%-gearvault.</footer>
<script type="module" src="${escapeHtml(script)}"></script>
</body>
</html>`;
}

/**
 * Cap's GEAR logo (his own pixel art, gear-logo-cutout.png from CAPSTILLER/gear-basescan-logo),
 * linking to the Gear home the same way his other Gear apps do.
 */
export const GEAR_HOME_URL = 'https://landonthis.gearup.wtf';
export const GEAR_LOGO_LINK = `<a class="gear-logo-link" href="${GEAR_HOME_URL}" target="_blank" rel="noopener noreferrer" aria-label="GEAR home on landonthis.gearup.wtf" title="GEAR"><img src="/gear-logo-cutout.png" alt="GEAR" width="512" height="128"/></a>`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
