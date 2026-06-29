/**
 * Single-page HTML dashboard for the Claude-to-IM bridge.
 *
 * Self-contained: pulls /healthz, /stats, /peer, /skills via fetch and
 * renders them in a single page. Refreshes every 5 seconds.
 *
 * No frontend framework, no external CDN — pure HTML + JS. Works offline.
 * Designed to look reasonable on mobile and desktop.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Claude-to-IM Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #0f1115; color: #e6e6e6; padding: 20px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 15px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 8px; }
  .sub { color: #9ca3af; font-size: 12px; margin-bottom: 20px; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #1a1d23; border: 1px solid #2a2e36; border-radius: 8px; padding: 16px; }
  .card.ok { border-left: 4px solid #22c55e; }
  .card.err { border-left: 4px solid #ef4444; }
  .card.warn { border-left: 4px solid #eab308; }
  .kv { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #2a2e36; }
  .kv:last-child { border-bottom: none; }
  .kv .k { color: #9ca3af; }
  .kv .v { font-family: ui-monospace, "SF Mono", Consolas, monospace; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .pill.ok { background: #22c55e33; color: #22c55e; }
  .pill.err { background: #ef444433; color: #ef4444; }
  .pill.warn { background: #eab30833; color: #eab308; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #2a2e36; }
  th { color: #9ca3af; font-weight: 500; }
  td.num { text-family: monospace; text-align: right; }
  .bar { display: inline-block; height: 8px; background: #3b82f6; border-radius: 2px; vertical-align: middle; }
  .empty { color: #6b7280; font-style: italic; padding: 8px 0; }
  .err-msg { color: #ef4444; font-size: 12px; margin-top: 8px; }
  code { background: #0f1115; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
</style>
</head>
<body>
<h1>Claude-to-IM Dashboard</h1>
<div class="sub" id="meta">Loading...</div>

<h2>Health</h2>
<div class="row">
  <div class="card" id="health-card">
    <div class="kv"><span class="k">Status</span><span class="v" id="health-ok">-</span></div>
    <div class="kv"><span class="k">PID</span><span class="v" id="health-pid">-</span></div>
    <div class="kv"><span class="k">Uptime</span><span class="v" id="health-uptime">-</span></div>
    <div class="kv"><span class="k">Channels</span><span class="v" id="health-channels">-</span></div>
    <div class="kv"><span class="k">Pending Permissions</span><span class="v" id="health-pending">-</span></div>
  </div>
  <div class="card" id="peer-card">
    <div class="kv"><span class="k">Self Runtime</span><span class="v" id="peer-self">-</span></div>
    <div class="kv"><span class="k">Peer Bot</span><span class="v" id="peer-bot">-</span></div>
    <div class="kv"><span class="k">Peer Status</span><span class="v" id="peer-ok">-</span></div>
    <div class="kv"><span class="k">Peer PID</span><span class="v" id="peer-pid">-</span></div>
    <div class="kv"><span class="k">Peer Last Beat</span><span class="v" id="peer-beat">-</span></div>
  </div>
</div>

<h2>Usage & Cost</h2>
<div class="row">
  <div class="card">
    <div class="kv"><span class="k">Total Inbound</span><span class="v" id="stat-inbound">-</span></div>
    <div class="kv"><span class="k">Total Outbound</span><span class="v" id="stat-outbound">-</span></div>
    <div class="kv"><span class="k">Errors</span><span class="v" id="stat-errors">-</span></div>
  </div>
  <div class="card">
    <div class="kv"><span class="k">Tokens In</span><span class="v" id="stat-tokens-in">-</span></div>
    <div class="kv"><span class="k">Tokens Out</span><span class="v" id="stat-tokens-out">-</span></div>
    <div class="kv"><span class="k">Total Cost (USD)</span><span class="v" id="stat-cost" style="color:#22c55e">-</span></div>
  </div>
</div>
<div class="card" id="cost-breakdown-card">
  <h2 style="margin-top:0">Cost by Model</h2>
  <table id="cost-table"><thead><tr><th>Model</th><th>Input tokens</th><th>Output tokens</th><th>Cost (USD)</th></tr></thead><tbody></tbody></table>
</div>

<h2>Per-Channel Activity</h2>
<div class="card">
  <table id="channel-table"><thead><tr><th>Channel</th><th>Inbound</th><th>Outbound</th></tr></thead><tbody></tbody></table>
</div>

<h2>Top Chats</h2>
<div class="card">
  <table id="chat-table"><thead><tr><th>Chat ID</th><th>Messages</th><th>Last Activity</th></tr></thead><tbody></tbody></table>
</div>

<h2>Discovered Skills (top 10 by score for keyword <code>help</code>)</h2>
<div class="card">
  <table id="skill-table"><thead><tr><th>Skill</th><th>Score</th><th>Description</th></tr></thead><tbody></tbody></table>
</div>

<script>
const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const setHTML = (id, v) => { const el = $(id); if (el) el.innerHTML = v; };
const fmtTs = (s) => s ? new Date(s).toLocaleString() : '-';
const fmtUptime = (s) => {
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
};
const fmtNum = (n) => (n ?? 0).toLocaleString();
const fmtUSD = (n) => '$' + (n || 0).toFixed(4);

async function fetchJson(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    return { __error: e.message };
  }
}

async function refresh() {
  setText('meta', 'Last refresh: ' + new Date().toLocaleString() + ' · auto-refresh every 5s');

  // Health
  const health = await fetchJson('/healthz');
  if (health.__error) {
    setText('health-ok', 'DOWN'); return;
  }
  const ok = health.ok;
  const card = $('health-card');
  card.className = 'card ' + (ok ? 'ok' : 'err');
  setHTML('health-ok', '<span class="pill ' + (ok ? 'ok' : 'err') + '">' + (ok ? 'HEALTHY' : 'DOWN') + '</span>');
  setText('health-pid', health.pid);
  setText('health-uptime', fmtUptime(health.uptimeSec));
  setText('health-channels', (health.channels || []).join(', '));
  setText('health-pending', health.pendingPermissions);
  (health.adapterStates || []).forEach(a => {
    setText('health-channels', setText.toString || '');
  });

  // Peer
  const peer = await fetchJson('/peer');
  if (!peer.__error) {
    const peerCard = $('peer-card');
    setText('peer-self', peer.self?.runtime + ' (pid ' + peer.self?.pid + ')');
    if (peer.peer && peer.peer.ok) {
      peerCard.className = 'card ok';
      setHTML('peer-ok', '<span class="pill ok">ALIVE</span>');
      setText('peer-bot', peer.peer.bot);
      setText('peer-pid', peer.peer.pid);
      setText('peer-beat', fmtTs(peer.peer.lastBeat));
    } else {
      peerCard.className = 'card warn';
      setHTML('peer-ok', '<span class="pill warn">DOWN</span>');
      setText('peer-bot', peer.peer?.bot || 'none');
      setText('peer-pid', '-');
      setText('peer-beat', peer.peer?.note || '-');
    }
  }

  // Stats
  const stats = await fetchJson('/stats');
  if (!stats.__error) {
    setText('stat-inbound', fmtNum(stats.totalInbound));
    setText('stat-outbound', fmtNum(stats.totalOutbound));
    setText('stat-errors', fmtNum(stats.totalErrors));
    setText('stat-tokens-in', fmtNum(stats.totalTokensInput));
    setText('stat-tokens-out', fmtNum(stats.totalTokensOutput));
    setText('stat-cost', fmtUSD(stats.totalCostUSD));
    // Cost by model
    const costBody = document.querySelector('#cost-table tbody');
    costBody.innerHTML = '';
    const models = Object.entries(stats.costByModel || {}).sort((a, b) => b[1].costUSD - a[1].costUSD);
    if (models.length === 0) {
      costBody.innerHTML = '<tr><td colspan="4" class="empty">No cost data yet (need new conversations with tokenUsage)</td></tr>';
    } else {
      models.forEach(([model, m]) => {
        const row = document.createElement('tr');
        row.innerHTML = '<td>' + model + (m.isKnown ? '' : ' <span class="pill warn">unknown</span>') + '</td>' +
          '<td class="num">' + fmtNum(m.tokens.input) + '</td>' +
          '<td class="num">' + fmtNum(m.tokens.output) + '</td>' +
          '<td class="num">' + fmtUSD(m.costUSD) + '</td>';
        costBody.appendChild(row);
      });
    }
    // Channels
    const channelBody = document.querySelector('#channel-table tbody');
    channelBody.innerHTML = '';
    const channels = Object.entries(stats.perChannel || {});
    if (channels.length === 0) {
      channelBody.innerHTML = '<tr><td colspan="3" class="empty">No activity yet</td></tr>';
    } else {
      channels.forEach(([ch, c]) => {
        const row = document.createElement('tr');
        row.innerHTML = '<td>' + ch + '</td><td class="num">' + fmtNum(c.inbound) + '</td><td class="num">' + fmtNum(c.outbound) + '</td>';
        channelBody.appendChild(row);
      });
    }
    // Chats
    const chatBody = document.querySelector('#chat-table tbody');
    chatBody.innerHTML = '';
    const chats = stats.perChat || [];
    if (chats.length === 0) {
      chatBody.innerHTML = '<tr><td colspan="3" class="empty">No chats yet</td></tr>';
    } else {
      chats.slice(0, 10).forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = '<td>' + c.chatId + '</td><td class="num">' + fmtNum(c.messages) + '</td><td>' + fmtTs(c.lastAt) + '</td>';
        chatBody.appendChild(row);
      });
    }
  }

  // Skills (top 10 by score for keyword "help")
  const skillSuggest = await fetchJson('/skills?suggest=' + encodeURIComponent('help me analyze'));
  if (!skillSuggest.__error && skillSuggest.suggestions) {
    const skillBody = document.querySelector('#skill-table tbody');
    skillBody.innerHTML = '';
    if (skillSuggest.suggestions.length === 0) {
      skillBody.innerHTML = '<tr><td colspan="3" class="empty">No skill suggestions for that query</td></tr>';
    } else {
      skillSuggest.suggestions.forEach(s => {
        const row = document.createElement('tr');
        row.innerHTML = '<td><code>' + s.name + '</code></td><td class="num">' + s.score + '</td><td>' + (s.description || '').slice(0, 160) + '</td>';
        skillBody.appendChild(row);
      });
    }
  }
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;