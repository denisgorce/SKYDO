// Mode hôte : état en mémoire, publié via le serveur local (LanServer).
// Mode invité : interroge l'hôte en HTTP via le pont Android.
var PORT = 8765;
var $ = function (s) { return document.querySelector(s); };
function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
var uid = localStorage.getItem('uid') || (Math.random().toString(36).slice(2) + Date.now().toString(36));
localStorage.setItem('uid', uid);
var role = null, host = null, g = null, ver = -1, timer = null, lost = 0, ticking = false, tick = 0;

function toast(t) { var el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { el.classList.remove('on'); }, 2600); }
function show(id) { ['home', 'lobby', 'wait', 'game'].forEach(function (s) { $('#' + s).hidden = s !== id; }); }

if (!window.Android) { $('#home').innerHTML = '<p class="err">Ce jeu fonctionne dans l\'application Android Colonnes.</p>'; throw new Error('no bridge'); }

// ---------- Réseau (pont Java asynchrone) ----------
var pend = {}, nid = 0;
window.__net = function (id, code, body) { var p = pend[id]; delete pend[id]; if (p) p({ code: code, body: body }); };
function get(url) { return new Promise(function (res) { var id = ++nid; pend[id] = res; Android.http(id, url); }); }
function base() { return 'http://' + host + ':' + PORT; }

$('#name').value = localStorage.getItem('name') || '';
function getName() {
  var n = $('#name').value.trim().slice(0, 14);
  if (!n) { toast('Indiquez votre prénom'); $('#name').focus(); return null; }
  localStorage.setItem('name', n); return n;
}
(function prefillIp() {
  var last = localStorage.getItem('ip'), mine = (Android.ips() || '').split(',')[0];
  $('#ip').value = last || (mine ? mine.replace(/\d+$/, '') : '');
})();

// ---------- Hôte ----------
function hostStart(resume) {
  var name = getName(); if (!name) return;
  var ips = Android.startHost();
  if (!ips) { toast('Réseau indisponible : activez le Wi-Fi ou le partage de connexion'); Android.stopHost(); return; }
  role = 'host'; localStorage.setItem('role', 'host');
  if (!resume || !g) g = { status: 'lobby', host: uid, players: {}, order: [uid] };
  g.players[uid] = { name: name };
  publish();
  clearInterval(timer); timer = setInterval(hostTick, 150);
}
function publish() {
  var s = JSON.stringify(g);
  Android.setState(s); localStorage.setItem('hostGame', s);
  render();
}
function apply(u, a, name) {
  if (a.t === 'join') {
    name = String(name || '?').slice(0, 14);
    if (g.order.indexOf(u) >= 0) { if (g.players[u].name === name) return 'x'; g.players[u].name = name; return null; }
    if (g.status !== 'lobby' || g.order.length >= MAXP) return 'x';
    g.players[u] = { name: name }; g.order.push(u); return null;
  }
  var c = JSON.parse(JSON.stringify(g)), err = act(c, u, a);
  if (!err) g = c;
  return err;
}
function hostTick() {
  var list, changed = false;
  try { list = JSON.parse(Android.poll()); } catch (e) { return; }
  list.forEach(function (q) {
    var m; try { m = JSON.parse(q); } catch (e) { return; }
    if (m && typeof m.u === 'string' && m.a && typeof m.a.t === 'string' && !apply(m.u, m.a, m.name)) changed = true;
  });
  if (changed) publish();
}

// ---------- Invité ----------
function clientJoin(ip) {
  var name = getName(); if (!name) return;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { toast('Adresse invalide (ex. 192.168.1.23)'); return; }
  host = ip; role = 'client'; ver = -1; g = null; lost = 0;
  localStorage.setItem('role', 'client'); localStorage.setItem('ip', ip);
  $('#waitmsg').textContent = 'Connexion à ' + ip + '…'; show('wait');
  sendRemote({ t: 'join' });
  clearInterval(timer); timer = setInterval(clientTick, 500);
}
function sendRemote(a) {
  return get(base() + '/action?q=' + encodeURIComponent(JSON.stringify({ u: uid, a: a, name: localStorage.getItem('name') })));
}
function clientTick() {
  if (ticking) return; ticking = true; tick++;
  get(base() + '/state?v=' + ver).then(function (r) {
    ticking = false;
    if (role !== 'client') return;
    if (r.code === 0) { if (++lost >= 4) $('#conn').hidden = false; if (!g && lost === 6) $('#waitmsg').textContent = 'Hôte introuvable : vérifiez l\'adresse et le Wi-Fi'; return; }
    lost = 0; $('#conn').hidden = true;
    if (r.code === 200) { try { var d = JSON.parse(r.body); ver = d.v; g = d.g; } catch (e) { return; } }
    var inGame = g && arr(g.order).indexOf(uid) >= 0;
    if (g && !inGame && g.status !== 'lobby') { toast('Partie déjà commencée ou complète'); leave(); return; }
    if (!inGame && tick % 4 === 0) sendRemote({ t: 'join' });
    if (r.code === 200) render();
  });
}

// ---------- Actions ----------
function send(a) {
  if (!g) return;
  if (role === 'host') { var e = apply(uid, a); if (e) { if (e !== 'x') toast(e); } else publish(); }
  else sendRemote(a).then(clientTick);
}
function leave() {
  clearInterval(timer); timer = null;
  if (role === 'host') { Android.stopHost(); localStorage.removeItem('hostGame'); }
  role = null; g = null; host = null; ver = -1;
  localStorage.removeItem('role'); $('#conn').hidden = true; show('home');
}

$('#create').onclick = function () { hostStart(false); };
$('#join').onclick = function () { clientJoin($('#ip').value.trim()); };
$('#leave').onclick = function () { if (role !== 'host' || confirm('Fermer la partie pour tous ?')) leave(); };
$('#cancel').onclick = leave;
$('#quit').onclick = function () { if (confirm(role === 'host' ? 'Vous êtes l\'hôte : la partie s\'arrêtera pour tous. Quitter ?' : 'Quitter la partie ?')) leave(); };
$('#share').onclick = function () { Android.share('Rejoins ma partie de Colonnes (même Wi-Fi) : ' + $('#lcode').textContent); };
$('#start').onclick = function () { send({ t: 'start' }); };

// ---------- Rendu ----------
function cls(c) {
  if (c.gone) return 'card gone';
  if (!c.up) return 'card down';
  var v = c.v;
  return 'card ' + (v < 0 ? 'neg' : v === 0 ? 'zero' : v <= 4 ? 'low' : v <= 8 ? 'mid' : 'high');
}
function cardHtml(c, attrs) { return '<div class="' + cls(c) + '" ' + (attrs || '') + '>' + (c.up && !c.gone ? c.v : '') + '</div>'; }
function val(v) { return { v: v, up: true }; }

function render() {
  if (!g) return;
  var order = arr(g.order);
  if (order.indexOf(uid) < 0) { show('wait'); return; }
  if (g.status === 'lobby') return renderLobby(order);
  show('game'); renderGame(order);
}

function renderLobby(order) {
  show('lobby');
  var isHost = role === 'host';
  $('#lhead').textContent = isHost ? 'Adresse à saisir par les autres joueurs' : 'Connecté à';
  $('#lcode').textContent = isHost ? (Android.ips() || '?').split(',').join(' ou ') : host;
  $('#share').hidden = !isHost;
  $('#lplayers').innerHTML = order.map(function (u) {
    return '<li>' + esc(g.players[u].name) + (u === g.host ? ' <small>(hôte)</small>' : '') + (u === uid ? ' <small>(vous)</small>' : '') + '</li>';
  }).join('');
  $('#start').hidden = !isHost; $('#start').disabled = order.length < 2;
  $('#lwait').textContent = isHost ? (order.length < 2 ? 'En attente d\'au moins un autre joueur' : order.length + ' joueurs prêts') : 'L\'hôte lancera la partie';
}

function hint(order) {
  var cur = order[g.turn], mine = cur === uid, grid = arr(g.grids[uid]);
  if (g.status === 'reveal2') return upCount(grid) < 2 ? 'Retournez ' + (2 - upCount(grid)) + ' carte(s) de votre grille' : 'En attente des autres joueurs';
  if (g.status !== 'play') return '';
  if (!mine) return 'Au tour de ' + esc(g.players[cur].name) + (g.finisher ? ' (dernier tour)' : '');
  if (g.mustReveal) return 'Retournez une carte cachée';
  if (g.drawn != null) return g.from === 'deck' ? 'Touchez une carte de votre grille pour échanger, ou la défausse pour jeter' : 'Touchez la carte de votre grille à remplacer';
  return 'À vous : piochez ou prenez la défausse' + (g.finisher ? ' (dernier tour)' : '');
}

function renderGame(order) {
  var cur = g.status === 'play' ? order[g.turn] : null, mine = cur === uid;
  $('#ground').textContent = 'Manche ' + g.round;
  $('#glast').textContent = g.last || '';
  $('#ghint').innerHTML = hint(order);
  $('#ghint').classList.toggle('me', mine);

  $('#opps').innerHTML = order.filter(function (u) { return u !== uid; }).map(function (u) {
    var gr = arr(g.grids[u]);
    return '<div class="opp' + (u === cur ? ' turn' : '') + '"><div class="oname">' + esc(g.players[u].name) + (u === g.finisher ? ' ★' : '') + '</div>'
      + '<div class="ogrid">' + gr.map(function (c) { return cardHtml(c); }).join('') + '</div>'
      + '<div class="oscore">visible ' + visibleSum(gr) + ' | total ' + (g.scores[u] || 0) + '</div></div>';
  }).join('');

  var disc = arr(g.discard), deck = arr(g.deck);
  $('#deck').innerHTML = '<div class="card down big"></div><span>' + deck.length + '</span>';
  $('#disc').innerHTML = disc.length ? cardHtml(val(disc[disc.length - 1])) : '<div class="card empty"></div>';
  $('#drawn').innerHTML = g.drawn != null ? cardHtml(val(g.drawn)) + '<span>' + (mine ? 'votre carte' : 'en main') + '</span>' : '';
  $('#deck').classList.toggle('act', mine && g.drawn == null && !g.mustReveal);
  $('#disc').classList.toggle('act', !!(mine && ((g.drawn == null && !g.mustReveal && disc.length) || g.from === 'deck')));

  var grid = arr(g.grids[uid]);
  $('#mine').innerHTML = grid.map(function (c, i) { return cardHtml(c, 'data-i="' + i + '"'); }).join('');
  $('#mscore').textContent = 'Vous | visible ' + visibleSum(grid) + ' | total ' + (g.scores[uid] || 0);
  $('#game').classList.toggle('myturn', mine || (g.status === 'reveal2' && upCount(grid) < 2));

  var ov = $('#overlay');
  if (g.status === 'roundEnd' || g.status === 'gameOver') {
    var sorted = order.slice().sort(function (a, b) { return g.scores[a] - g.scores[b]; });
    var rows = sorted.map(function (u) {
      return '<tr' + (u === uid ? ' class="me"' : '') + '><td>' + esc(g.players[u].name) + (u === g.finisher ? ' ★' : '') + '</td><td>' + g.roundScores[u] + '</td><td>' + g.scores[u] + '</td></tr>';
    }).join('');
    var isHost = role === 'host', over = g.status === 'gameOver';
    ov.innerHTML = '<div class="panel"><h2>' + (over ? esc(g.players[sorted[0]].name) + ' gagne !' : 'Fin de la manche ' + g.round) + '</h2>'
      + '<table><tr><th>Joueur</th><th>Manche</th><th>Total</th></tr>' + rows + '</table>'
      + '<p class="note">★ a terminé la manche : score doublé s\'il n\'est pas strictement le plus bas (et positif). Fin de partie dès qu\'un total atteint ' + END_SCORE + ' ; le plus bas gagne.</p>'
      + (isHost ? '<button id="nextBtn">' + (over ? 'Nouvelle partie' : 'Manche suivante') + '</button>' : '<p>En attente de l\'hôte…</p>')
      + '<button class="ghost" id="seeBtn">Voir les grilles</button></div>';
    ov.hidden = false;
    if (isHost) $('#nextBtn').onclick = function () { send({ t: over ? 'restart' : 'next' }); };
    $('#seeBtn').onclick = function () { ov.hidden = true; setTimeout(function () { if (g && (g.status === 'roundEnd' || g.status === 'gameOver')) ov.hidden = false; }, 5000); };
  } else ov.hidden = true;
}

$('#deck').onclick = function () { send({ t: 'deck' }); };
$('#disc').onclick = function () { send({ t: g && g.drawn != null ? 'drop' : 'disc' }); };
$('#mine').onclick = function (e) {
  var el = e.target.closest('[data-i]'); if (!el || !g) return;
  var i = +el.dataset.i;
  if (g.status === 'reveal2' || g.mustReveal) send({ t: 'flip', i: i });
  else if (g.drawn != null) send({ t: 'swap', i: i });
};
$('#rulesBtn').onclick = function () { $('#rules').showModal(); };

// Reprise automatique après fermeture de l'app
(function boot() {
  var r = localStorage.getItem('role');
  if (r === 'host') { try { g = JSON.parse(localStorage.getItem('hostGame')); } catch (e) { g = null; } if (g && $('#name').value) { hostStart(true); return; } }
  if (r === 'client' && localStorage.getItem('ip') && $('#name').value) { clientJoin(localStorage.getItem('ip')); return; }
  show('home');
})();
