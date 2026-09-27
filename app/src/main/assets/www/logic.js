// Moteur de jeu pur (partagé, exécuté dans les transactions Firebase)
var MAXP = 8, END_SCORE = 100;

function arr(x) { return x ? (Array.isArray(x) ? x : Object.values(x)) : []; }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function newDeck() {
  var d = [], i, v;
  for (i = 0; i < 5; i++) d.push(-2);
  for (i = 0; i < 10; i++) d.push(-1);
  for (i = 0; i < 15; i++) d.push(0);
  for (v = 1; v <= 12; v++) for (i = 0; i < 10; i++) d.push(v);
  return shuffle(d);
}
function upCount(grid) { return arr(grid).filter(function (c) { return c.up && !c.gone; }).length; }
function allUp(grid) { return arr(grid).every(function (c) { return c.up || c.gone; }); }
function visibleSum(grid) { return arr(grid).reduce(function (s, c) { return s + (c.up && !c.gone ? c.v : 0); }, 0); }
function pname(g, u) { return (g.players && g.players[u] && g.players[u].name) || '?'; }

function startGame(g) {
  g.scores = {}; g.order.forEach(function (u) { g.scores[u] = 0; });
  g.round = 0; g.starter = null;
  startRound(g);
}

function startRound(g) {
  var d = newDeck();
  g.grids = {};
  g.order.forEach(function (u) {
    var c = []; for (var i = 0; i < 12; i++) c.push({ v: d.pop(), up: false, gone: false });
    g.grids[u] = c;
  });
  g.discard = [d.pop()]; g.deck = d;
  g.drawn = null; g.from = null; g.mustReveal = false;
  g.finisher = null; g.lastLeft = 0; g.roundScores = null;
  g.round = (g.round || 0) + 1;
  g.status = 'reveal2'; g.last = 'Manche ' + g.round + ' : chacun retourne 2 cartes';
}

function refill(g) {
  var deck = arr(g.deck);
  if (!deck.length) {
    var d = arr(g.discard), top = d.pop();
    deck = shuffle(d); g.discard = top == null ? [] : [top];
  }
  g.deck = deck;
}

function endTurn(g, uid) {
  var grid = g.grids[uid], disc = arr(g.discard);
  for (var c = 0; c < 4; c++) {
    var col = [grid[c], grid[c + 4], grid[c + 8]];
    if (!col[0].gone && col.every(function (x) { return x.up && x.v === col[0].v; })) {
      col.forEach(function (x) { x.gone = true; disc.push(x.v); });
      g.last += ' | colonne de ' + col[0].v + ' éliminée';
    }
  }
  g.discard = disc;
  var n = g.order.length;
  if (g.finisher != null) g.lastLeft--;
  else if (allUp(grid)) { g.finisher = uid; g.lastLeft = n - 1; g.last += ' | ' + pname(g, uid) + ' a tout retourné : dernier tour !'; }
  if (g.finisher != null && g.lastLeft <= 0) { endRound(g); return; }
  g.turn = (g.turn + 1) % n;
}

function endRound(g) {
  var rs = {}, min = Infinity, f = g.finisher;
  g.order.forEach(function (u) {
    var s = 0;
    arr(g.grids[u]).forEach(function (c) { if (!c.gone) { c.up = true; s += c.v; } });
    rs[u] = s;
  });
  g.order.forEach(function (u) { if (u !== f && rs[u] < min) min = rs[u]; });
  if (rs[f] > 0 && rs[f] >= min) rs[f] *= 2;
  g.roundScores = rs;
  g.order.forEach(function (u) { g.scores[u] = (g.scores[u] || 0) + rs[u]; });
  g.starter = f; g.drawn = null; g.mustReveal = false;
  g.status = g.order.some(function (u) { return g.scores[u] >= END_SCORE; }) ? 'gameOver' : 'roundEnd';
}

// Applique une action. Retourne un message d'erreur ou null (état modifié en place).
function act(g, uid, a) {
  if (a.t === 'start') {
    if (g.status !== 'lobby' || uid !== g.host || g.order.length < 2) return 'Impossible de lancer';
    startGame(g); return null;
  }
  var grid = g.grids && g.grids[uid];
  if (!grid) return 'Vous ne jouez pas dans cette partie';
  if (a.t === 'next') { if (g.status !== 'roundEnd' || uid !== g.host) return 'x'; startRound(g); return null; }
  if (a.t === 'restart') { if (g.status !== 'gameOver' || uid !== g.host) return 'x'; startGame(g); return null; }
  var c = a.i != null ? grid[a.i] : null;

  if (g.status === 'reveal2') {
    if (a.t !== 'flip' || !c || c.up || upCount(grid) >= 2) return 'x';
    c.up = true;
    if (g.order.every(function (u) { return upCount(g.grids[u]) >= 2; })) {
      var s = g.starter;
      if (s == null || g.order.indexOf(s) < 0) {
        var best = -Infinity;
        g.order.forEach(function (u) { var v = visibleSum(g.grids[u]); if (v > best) { best = v; s = u; } });
      }
      g.turn = g.order.indexOf(s); g.status = 'play';
      g.last = pname(g, s) + ' commence';
    }
    return null;
  }
  if (g.status !== 'play') return 'x';
  if (g.order[g.turn] !== uid) return 'Ce n\'est pas votre tour';
  var has = g.drawn != null, me = pname(g, uid);

  switch (a.t) {
    case 'deck':
      if (has || g.mustReveal) return 'x';
      refill(g); var d = arr(g.deck); if (!d.length) return 'Pioche vide';
      g.drawn = d.pop(); g.deck = d; g.from = 'deck'; g.last = me + ' pioche';
      return null;
    case 'disc':
      if (has || g.mustReveal) return 'x';
      var dc = arr(g.discard); if (!dc.length) return 'Défausse vide';
      g.drawn = dc.pop(); g.discard = dc; g.from = 'disc'; g.last = me + ' prend la défausse (' + g.drawn + ')';
      return null;
    case 'drop':
      if (!has || g.from !== 'deck') return 'x';
      g.discard = arr(g.discard).concat([g.drawn]);
      g.last = me + ' défausse ' + g.drawn; g.drawn = null; g.from = null;
      if (allUp(grid)) { endTurn(g, uid); return null; }
      g.mustReveal = true; return null;
    case 'swap':
      if (!has || !c || c.gone) return 'x';
      g.discard = arr(g.discard).concat([c.v]);
      g.last = me + ' pose ' + g.drawn + ' et défausse ' + c.v;
      grid[a.i] = { v: g.drawn, up: true, gone: false };
      g.drawn = null; g.from = null;
      endTurn(g, uid); return null;
    case 'flip':
      if (!g.mustReveal || !c || c.up || c.gone) return 'x';
      c.up = true; g.mustReveal = false; g.last += ' et retourne un ' + c.v;
      endTurn(g, uid); return null;
  }
  return 'x';
}
