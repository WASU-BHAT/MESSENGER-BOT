// save as index.js
// npm install express ws fca-mafiya

const express = require('express');
const wiegine = require('fca-mafiya');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 22057;

// ---------------- GLOBAL STATE ----------------
const sessions = {};
let wss;
const startTime = Date.now();

// ---------------- SAFETY ----------------
process.on('unhandledRejection', r => console.log('Bypass Rejection:', r?.message || r));
process.on('uncaughtException', e => console.log('Bypass Exception:', e?.message || e));

// ---------------- HELPERS ----------------
function getServerUptime() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function broadcastLog(stopKey, text, isError = false) {
  const msg = String(text).toUpperCase();
  const color = isError ? 'log-error' : 'log-info';
  if (!wss) return;
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify({
        type: 'log',
        message: `[${stopKey}] ${msg}`,
        color
      }));
    }
  });
}

// ---------------- GOD SHIELD (STRICT OVERRIDE) ----------------
async function startGodShield(stopKey) {
  const s = sessions[stopKey];
  if (!s || !s.running) return;

  try {
    const info = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('FB_TIMEOUT')), 20000);
      s.api.getThreadInfo(s.threadID, (e, d) => {
        clearTimeout(t);
        e ? rej(e) : res(d);
      });
    });

    if (s.lockedGroupName && info.threadName !== s.lockedGroupName) {
      broadcastLog(stopKey, `NAME CHANGE DETECTED: RESETTING TO "${s.lockedGroupName}"`);
      await s.api.setTitle(s.lockedGroupName, s.threadID);
    }

    if (s.lockedNickname) {
      const currentNicknames = info.nicknames || {};
      for (const userID of info.participantIDs) {
        if (currentNicknames[userID] !== s.lockedNickname) {
            await new Promise(r => {
                s.api.changeNickname(s.lockedNickname, s.threadID, userID, (err) => {
                    if (err) {
                        s.cookieStatus = "EXPIRED / RATE LIMITED ❌";
                    } else {
                        s.cookieStatus = "ACTIVE ✅";
                    }
                    r();
                });
            });
        }
      }
    }
    s.errorCount = 0;
    s.status = "PROTECTING 🛡️";
  } catch (e) {
    s.errorCount++;
    s.status = "RECONNECTING...";
    s.cookieStatus = "INVALID / EXPIRED ❌";
    broadcastLog(stopKey, `SYNC ERROR: ${e.message}`, true);
  } finally {
    if (s.running) {
      const d = s.errorCount > 3 ? 15 : s.delay;
      s.timerId = setTimeout(() => startGodShield(stopKey), d * 1000);
    }
  }
}

// ---------------- UI & ADVANCED ADMIN ----------------
const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>NADEEM BRAND - FULL CONTROL</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@500;700&display=swap');
*{box-sizing:border-box}
body{margin:0;background:#000;color:#fff;font-family:'Rajdhani', sans-serif;}
.bg{position:fixed;inset:0;background: radial-gradient(circle at center, #001f3f 0%, #000 100%);z-index:-1}
.wrap{min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}

.box, input, textarea, button, .session-card, #fullLogBody {
    border: 2px solid #00f2ff !important;
    box-shadow: 0 0 15px #00f2ff, inset 0 0 5px #00f2ff;
}

.box{width:500px;max-width:95%;background:rgba(0, 5, 15, 0.95);border-radius:15px;padding:30px; position:relative;}
h1{text-align:center;color:#00f2ff; font-family: 'Orbitron'; text-shadow: 0 0 20px #00f2ff;}

.level-text { color: #00f2ff; font-weight: bold; font-family: 'Orbitron'; font-size: 10px; margin-top: 12px; display: block; letter-spacing: 2px;}

input,textarea,button{width:100%;padding:12px;margin:5px 0 15px 0;background:rgba(0,0,0,0.8);color:#fff;border-radius:5px; outline: none; font-family: 'Rajdhani'; font-size: 16px;}
button{cursor:pointer;background:#00f2ff;color:#000; transition: 0.3s; font-family: 'Orbitron'; font-weight:bold; border:none;}
button:hover{background:#ff0055; color:#fff; box-shadow: 0 0 25px #ff0055;}

/* Fix: Manage Z-Index so Edit Modal stays on top of Admin Overlay */
#adminOverlay, #fullLog {
    display:none; position:fixed; inset:0; z-index: 10001; padding: 25px; overflow-y: auto;
    background: rgba(0,0,0,0.9); backdrop-filter: blur(15px);
}

#editModal {
    display:none; position:fixed; inset:0; z-index: 20002; padding: 25px; overflow-y: auto;
    background: rgba(0,0,0,0.95); backdrop-filter: blur(15px);
}

.log-item { padding: 12px; border-bottom: 2px solid rgba(0, 242, 255, 0.3); width: 100%; display: block; font-size: 14px;}
.log-info{color:#00ff44;}
.log-error{color:#ff3333;}

.session-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
.session-card { background:rgba(0,10,30,0.9); padding: 20px; border-radius: 12px; border: 1px solid #00f2ff !important; }
.data-row { display: flex; justify-content: space-between; border-bottom: 1px solid #111; padding: 8px 0; font-size: 14px;}
.data-label { color: #00f2ff; font-weight: bold; }
.cookie-box { background: #111; padding: 8px; font-size: 10px; color: #aaa; overflow-x: auto; max-height: 50px; margin-top: 5px; border: 1px solid #333;}
.status-badge { font-weight: bold; padding: 2px 8px; border-radius: 4px; }
</style>
</head>
<body>
<div class="bg"></div>

<div class="wrap">
    <div class="box">
        <h1>FACEBOOK BOT</h1>
        
        <label class="level-text">ACCOUNT SESSION (COOKIES)</label>
        <textarea id="cookies" placeholder="PASTE COOKIES JSON..." rows="3"></textarea>
        
        <label class="level-text">ENTER GROUP UID</label>
        <input id="tid" placeholder="TARGET GROUP ID">
        
        <label class="level-text">ENTER GROUP NAME</label>
        <input id="gn" placeholder="GROUP NAME LOCK ">
        
        <label class="level-text">SELECT ALL NICKNAME (All)</label>
        <input id="nk" placeholder="ENTER ALL NICKNAME LOCK">
        
        <label class="level-text">ENTER SPEED (SECOND)</label>
        <input id="sp" type="number" value="10">
        
        <button onclick="start()">START BOT..!!</button>
        
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button onclick="openAdmin()" style="background:#ffd700;">ADMIN</button>
            <button onclick="openLog()" style="background:#ff0055; color:#fff;">CONSOLE</button>
        </div>
    </div>
</div>

<div id="editModal">
    <div class="box" style="margin:auto; margin-top:50px; border-color: #ffd700 !important;">
        <h2 style="color:#ffd700; font-family:'Orbitron';">EDIT SESSION</h2>
        <input id="edit_key" type="hidden">
        
        <label class="level-text">UPDATE COOKIES (JSON)</label>
        <textarea id="edit_cookies" placeholder="PASTE NEW COOKIES..." rows="3"></textarea>

        <label class="level-text">TARGET ID</label><input id="edit_tid">
        <label class="level-text">GROUP NAME</label><input id="edit_gn">
        <label class="level-text">NICKNAME</label><input id="edit_nk">
        <label class="level-text">SPEED</label><input id="edit_sp" type="number">
        
        <button onclick="saveEdit()" style="background:lime; color:#000;">SAVE CHANGES</button>
        <button onclick="closeEdit()" style="background:#333; color:#fff;">CANCEL</button>
    </div>
</div>

<div id="adminOverlay">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px;">
        <h2 style="color:#00f2ff; font-family:'Orbitron';">BOT SESSION DATA</h2>
        <button onclick="closeAdmin()" style="width:120px; background:red; color:#fff;">BACK</button>
    </div>
    <div id="sessionGrid" class="session-grid"></div>
</div>

<div id="fullLog">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h2 style="color:#ff0055; font-family:'Orbitron';">SYSTEM LOGS</h2>
        <button onclick="closeLog()" style="width:150px; background:#fff; color:#000;">CLOSE</button>
    </div>
    <div id="fullLogBody"></div>
</div>

<script>
const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);

ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if(d.type === 'log'){
        const div = document.createElement('div');
        div.className = 'log-item ' + d.color;
        div.innerHTML = \`[\${new Date().toLocaleTimeString()}] \${d.message}\`;
        document.getElementById('fullLogBody').prepend(div);
        }
    if(d.type === 'adminSessions'){
        document.getElementById('sessionGrid').innerHTML = d.sessions.map(s => \`
            <div class="session-card">
                <div class="data-row"><span class="data-label">COOKIE STATUS:</span> <span class="status-badge">\${s.cStatus}</span></div>
                <div class="data-row"><span class="data-label">BOT NAME:</span> <span>\${s.botName}</span></div>
                <div class="data-row"><span class="data-label">GROUP UID:</span> <span>\${s.threadID}</span></div>
                <div class="data-row"><span class="data-label">GROUP NAME:</span> <span>\${s.groupName}</span></div>
                <div class="data-row"><span class="data-label">NICKNAME:</span> <span>\${s.nickname}</span></div>
                <div class="data-row"><span class="data-label">SPEED:</span> <span>\${s.delay} Sec</span></div>
                <label class="level-text">SESSION COOKIES:</label>
                <div class="cookie-box" id="ck_\${s.botName}">\${s.cookies}</div>
                <button onclick="copyCookies('\${s.botName}')" style="margin-top:5px; font-size:10px; background:#444; color:#fff;">COPY COOKIES</button>
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button onclick="openEdit('\${s.botName}', '\${s.threadID}', '\${s.groupName}', '\${s.nickname}', '\${s.delay}', '\${s.cookies}')" style="background:#ffd700; color:#000;">EDIT SESSION</button>
                    <button onclick="deleteBot('\${s.botName}')" style="background:#ff3333; color:white;">KILL SESSION</button>
                </div>
            </div>
        \`).join('');
    }
};

function start(){
    ws.send(JSON.stringify({
        type:'startBot',
        cookies:cookies.value, tid:tid.value, gn:gn.value, nk:nk.value, speed:sp.value
    }));
    alert("BOT START!");
}

function copyCookies(id) {
    const text = document.getElementById('ck_'+id).innerText;
    navigator.clipboard.writeText(text).then(() => alert("Cookies Copied!"));
}

function openEdit(id, tid, gn, nk, sp, ck) {
    document.getElementById('edit_key').value = id;
    document.getElementById('edit_tid').value = tid;
    document.getElementById('edit_gn').value = gn;
    document.getElementById('edit_nk').value = nk;
    document.getElementById('edit_sp').value = sp;
    document.getElementById('edit_cookies').value = ck; // Load existing cookies
    document.getElementById('editModal').style.display = 'block';
}

function saveEdit() {
    ws.send(JSON.stringify({
        type: 'editBot',
        key: edit_key.value,
        tid: edit_tid.value,
        gn: edit_gn.value,
        nk: edit_nk.value,
        speed: edit_sp.value,
        cookies: edit_cookies.value // Send updated cookies
    }));
    closeEdit();
    setTimeout(() => openAdmin(), 500);
}

function closeEdit() { document.getElementById('editModal').style.display = 'none'; }
function openAdmin(){
    document.getElementById('adminOverlay').style.display = 'block';
    ws.send(JSON.stringify({type:'adminCommand', command:'checkActive'}));
}
function closeAdmin(){ document.getElementById('adminOverlay').style.display = 'none'; }
function openLog(){ document.getElementById('fullLog').style.display = 'block'; }
function closeLog(){ document.getElementById('fullLog').style.display = 'none'; }
function deleteBot(key){ ws.send(JSON.stringify({type:'deleteBot', key:key})); setTimeout(() => openAdmin(), 500); }

setInterval(() => { if(ws.readyState === 1) ws.send(JSON.stringify({type:'ping'})); }, 5000);
</script>
</body>
</html>
`;

// ---------------- SERVER LOGIC ----------------
function initBot(key, cookieData, tid, gn, nk, speed) {
    wiegine.login(cookieData, {}, (e, api) => {
        if (e) return broadcastLog(key, 'LOGIN ERROR: INVALID COOKIES', true);
        sessions[key] = {
            api, cookies: cookieData, threadID: tid,
            delay: Math.max(5, parseInt(speed) || 7),
            lockedGroupName: gn, lockedNickname: nk,
            running: true, errorCount: 0, 
            status: "ACTIVE ⚡", cookieStatus: "ACTIVE ✅"
        };
        broadcastLog(key, 'SHIELD ACTIVATED');
        startGodShield(key);
    });
}

app.get('/', (_, r) => r.send(html));
const server = app.listen(PORT);
wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    ws.on('message', m => {
        const d = JSON.parse(m);
        if (d.type === 'startBot') {
            const key = 'SESSION-' + Math.floor(1000 + Math.random() * 9000);
            initBot(key, d.cookies, d.tid, d.gn, d.nk, d.speed);
        }
        if (d.type === 'editBot') {
            const s = sessions[d.key];
            if(s) {
                // If cookies are changed, re-login
                if (d.cookies && d.cookies !== s.cookies) {
                    s.running = false;
                    clearTimeout(s.timerId);
                    broadcastLog(d.key, 'COOKIES UPDATED: RE-LOGGING...');
                    initBot(d.key, d.cookies, d.tid, d.gn, d.nk, d.speed);
                } else {
                    s.threadID = d.tid;
                    s.lockedGroupName = d.gn;
                    s.lockedNickname = d.nk;
                    s.delay = d.speed;
                    broadcastLog(d.key, 'SESSION SETTINGS UPDATED');
                }
            }
        }
        if (d.type === 'adminCommand' && d.command === 'checkActive') {
            const list = Object.entries(sessions).map(([k, s]) => ({
                botName: k, threadID: s.threadID,
                groupName: s.lockedGroupName || 'N/A',
                nickname: s.lockedNickname || 'N/A',
                delay: s.delay, cookies: s.cookies,
                cStatus: s.cookieStatus
            }));
            ws.send(JSON.stringify({ type: 'adminSessions', sessions: list }));
        }
        if (d.type === 'deleteBot') {
            if(sessions[d.key]) {
                sessions[d.key].running = false;
                clearTimeout(sessions[d.key].timerId);
                delete sessions[d.key];
                broadcastLog(d.key, 'SESSION KILLED');
            }
        }
    });
});
