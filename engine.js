// Betting engine, hand evaluator and GGStyle text generator.
// All money values are integer cents to avoid floating point drift.
(function (global) {
  const RANKS = '23456789TJQKA';
  const PLURAL = { 2: 'Deuces', 3: 'Treys', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
  const SINGULAR = { 2: 'Deuce', 3: 'Trey', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  const MIDDLE = {
    1: ['UTG'],
    2: ['UTG', 'CO'],
    3: ['UTG', 'MP', 'CO'],
    4: ['UTG', 'MP', 'HJ', 'CO'],
    5: ['UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
    6: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
    7: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO'],
  };
  const STREET_NAMES = ['Pre-Flop', 'Flop', 'Turn', 'River'];
  const SUMMARY_FOLD = ['before Flop', 'on the Flop', 'on the Turn', 'on the River'];

  // With a straddle the seat after the BB becomes STR and the remaining
  // seats take the position names of a table with one fewer player.
  // 3-handed, the straddler is the button, which keeps the BTN label.
  function positions(n, straddle) {
    if (n === 2) return ['BTN', 'BB'];
    if (n === 3) return ['BTN', 'SB', 'BB'];
    if (straddle) return ['BTN', 'SB', 'BB', 'STR', ...(MIDDLE[n - 4] || [])];
    return ['BTN', 'SB', 'BB', ...MIDDLE[n - 3]];
  }
  function positionOf(i, btn, n, straddle) {
    return positions(n, straddle)[(i - btn + n) % n];
  }
  function blindSeats(n, btn) {
    const sb = n === 2 ? btn : (btn + 1) % n;
    return { sb, bb: (sb + 1) % n };
  }

  function money(cents, cur) {
    const v = cents / 100;
    const s = Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(2)));
    return (cur || '') + s;
  }

  // ---------- Hand evaluation ----------
  const rankVal = (c) => RANKS.indexOf(c[0]) + 2;

  function eval5(cs) {
    const v = cs.map(rankVal).sort((a, b) => b - a);
    const flush = cs.every((c) => c[1] === cs[0][1]);
    const counts = {};
    v.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
    const groups = Object.entries(counts)
      .map(([r, c]) => [c, +r])
      .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let straightHigh = 0;
    if (groups.length === 5) {
      if (v[0] - v[4] === 4) straightHigh = v[0];
      else if (v[0] === 14 && v[1] === 5) straightHigh = 5;
    }
    const ranks = groups.map((g) => g[1]);
    if (straightHigh && flush) return [8, straightHigh];
    if (groups[0][0] === 4) return [7, ...ranks];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...ranks];
    if (flush) return [5, ...ranks];
    if (straightHigh) return [4, straightHigh];
    if (groups[0][0] === 3) return [3, ...ranks];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...ranks];
    if (groups[0][0] === 2) return [1, ...ranks];
    return [0, ...ranks];
  }

  function cmpScore(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function describe(s) {
    switch (s[0]) {
      case 8: return s[1] === 14 ? 'Royal Flush' : `${PLURAL[s[1]]}-High Straight Flush`;
      case 7: return `Four ${PLURAL[s[1]]}`;
      case 6: return `${PLURAL[s[1]]} Full of ${PLURAL[s[2]]}`;
      case 5: return `${PLURAL[s[1]]}-High Flush`;
      case 4: return `${PLURAL[s[1]]}-High Straight`;
      case 3: return `Three ${PLURAL[s[1]]}`;
      case 2: return `Pair of ${PLURAL[s[1]]} and Pair of ${PLURAL[s[2]]}`;
      case 1: return `Pair of ${PLURAL[s[1]]}`;
      default: return `${SINGULAR[s[1]]} High`;
    }
  }

  function bestHand(cards) {
    let best = null;
    const n = cards.length;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              const s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!best || cmpScore(s, best) > 0) best = s;
            }
    return { score: best, desc: describe(best) };
  }

  // ---------- Simulation ----------
  // setup: { players:[{name,label,stack}], button, hero, heroCards, sb, bb, straddle, straddleAmt,
  //          currency, handId, table, date }
  // events: [{t:'act',kind:'fold'|'check'|'call'|'raise',to}, {t:'board',cards}, {t:'show',cards}]
  function simulate(setup, events) {
    const n = setup.players.length;
    const btn = setup.button;
    const cur = setup.currency;
    const fmt = (c) => money(c, cur);
    const { sb, bb } = blindSeats(n, btn);
    const strSeat = setup.straddle && n >= 3 ? (bb + 1) % n : -1;

    const P = setup.players.map((p, i) => ({
      i,
      seat: i + 1,
      name: p.name,
      label: p.label,
      pos: positionOf(i, btn, n, strSeat >= 0),
      start: p.stack,
      stack: p.stack,
      street: 0,
      total: 0,
      folded: false,
      foldedOn: -1,
      allIn: false,
      acted: false,
      isHero: i === setup.hero,
      cards: i === setup.hero && setup.heroCards.length === 2 ? setup.heroCards.slice() : null,
      shown: false,
      best: null,
    }));

    const st = {
      P, n, btn, sbSeat: sb, bbSeat: bb, strSeat,
      board: [], street: 0, currentBet: 0, lastRaise: setup.bb, lastAgg: -1, ptr: 0,
      phase: 'bet', runout: false, done: false, showdown: false,
      lines: [], img: [[], [], [], [], []], streetPot: [null, null, null, null],
      winnings: new Array(n).fill(0), need: null, potTotal: 0,
    };
    const L = (s) => st.lines.push(s);
    const sumTotals = () => P.reduce((a, p) => a + p.total, 0);
    st.pot = sumTotals;

    const put = (p, a) => {
      a = Math.max(0, Math.min(a, p.stack));
      p.stack -= a;
      p.street += a;
      p.total += a;
      if (p.stack === 0) p.allIn = true;
      return a;
    };

    L(`Poker Hand #${setup.handId}: Hold'em No Limit (${fmt(setup.sb)}/${fmt(setup.bb)}) - ${setup.date}`);
    L(`Table '${setup.table}' ${n}-max Seat #${btn + 1} is the button`);
    P.forEach((p) => L(`Seat ${p.seat}: ${p.name} (${fmt(p.stack)} in chips)`));

    const post = (i, amt, label, tag) => {
      const p = P[i];
      const a = put(p, amt);
      L(`${p.name}: posts ${label} ${fmt(a)}`);
      st.img[0].push({ i, word: tag, amt: a, allIn: p.allIn });
    };
    post(sb, setup.sb, 'small blind', 'SB');
    post(bb, setup.bb, 'big blind', 'BB');
    if (strSeat >= 0) post(strSeat, setup.straddleAmt, 'straddle', 'STR');

    st.currentBet = Math.max(...P.map((p) => p.street));
    st.lastRaise = st.currentBet;
    L('*** HOLE CARDS ***');
    for (let k = 0; k < n; k++) {
      const p = P[(sb + k) % n];
      L(`Dealt to ${p.name}${p.cards ? ` [${p.cards.join(' ')}]` : ''}`);
    }
    st.ptr = ((strSeat >= 0 ? strSeat : bb) + 1) % n;
    st.streetPot[0] = sumTotals();

    function findActor() {
      const able = P.filter((p) => !p.folded && !p.allIn);
      for (let k = 0; k < n; k++) {
        const p = P[(st.ptr + k) % n];
        if (p.folded || p.allIn) continue;
        if (p.acted && p.street >= st.currentBet) continue;
        if (able.length === 1 && p.street >= st.currentBet) continue;
        return p.i;
      }
      return -1;
    }

    function showOrder() {
      const start = st.lastAgg >= 0 && !P[st.lastAgg].folded ? st.lastAgg : (btn + 1) % n;
      const out = [];
      for (let k = 0; k < n; k++) {
        const p = P[(start + k) % n];
        if (!p.folded) out.push(p);
      }
      return out;
    }

    function doShow(p) {
      p.shown = true;
      const desc = st.board.length >= 3 ? ` (${bestHand([...p.cards, ...st.board]).desc})` : '';
      L(`${p.name}: shows [${p.cards.join(' ')}]${desc}`);
    }

    function closeRound() {
      const sorted = [...P].sort((a, b) => b.street - a.street);
      if (sorted[0].street > sorted[1].street) {
        const p = sorted[0];
        const d = p.street - sorted[1].street;
        p.street -= d;
        p.total -= d;
        p.stack += d;
        if (p.stack > 0) p.allIn = false;
        L(`Uncalled bet (${fmt(d)}) returned to ${p.name}`);
      }
      const live = P.filter((p) => !p.folded);
      if (live.length === 1) return finishUncontested(live[0]);
      if (st.street === 3) { st.phase = 'show'; return; }
      if (live.filter((p) => !p.allIn).length <= 1) { st.runout = true; st.phase = 'show'; return; }
      st.phase = 'board';
    }

    function finishUncontested(w) {
      L('*** SHOWDOWN ***');
      const total = sumTotals();
      st.winnings[w.i] = total;
      L(`${w.name} collected ${fmt(total)} from pot`);
      st.done = true;
      summary();
    }

    function resolveShowdown() {
      L('*** SHOWDOWN ***');
      st.showdown = true;
      const live = P.filter((p) => !p.folded);
      live.forEach((p) => (p.best = bestHand([...p.cards, ...st.board])));
      const rem = P.map((p) => p.total);
      const pots = [];
      for (;;) {
        const lv = live.filter((p) => rem[p.i] > 0);
        if (!lv.length) break;
        const m = Math.min(...lv.map((p) => rem[p.i]));
        let amt = 0;
        P.forEach((q) => { const t = Math.min(rem[q.i], m); amt += t; rem[q.i] -= t; });
        pots.push({ amt, elig: lv });
      }
      const left = rem.reduce((a, b) => a + b, 0);
      if (left && pots.length) pots[pots.length - 1].amt += left;
      const distFromBtn = (p) => (p.i - btn - 1 + n) % n;
      pots.forEach((pot) => {
        let best = null;
        let ws = [];
        pot.elig.forEach((p) => {
          const c = best ? cmpScore(p.best.score, best) : 1;
          if (c > 0) { best = p.best.score; ws = [p]; } else if (c === 0) ws.push(p);
        });
        ws.sort((a, b) => distFromBtn(a) - distFromBtn(b));
        const share = Math.floor(pot.amt / ws.length);
        const odd = pot.amt - share * ws.length;
        ws.forEach((w, k) => (st.winnings[w.i] += share + (k < odd ? 1 : 0)));
      });
      live.forEach((p) => {
        if (st.winnings[p.i] > 0) L(`${p.name} collected ${fmt(st.winnings[p.i])} from pot`);
      });
      st.done = true;
      summary();
    }

    function summary() {
      L('*** SUMMARY ***');
      const total = sumTotals();
      st.potTotal = total;
      const z = fmt(0);
      L(`Total pot ${fmt(total)} | Rake ${z} | Jackpot ${z} | Bingo ${z} | Fortune ${z} | Tax ${z}`);
      if (st.board.length) L(`Board [${st.board.join(' ')}]`);
      P.forEach((p) => {
        let tags = '';
        if (p.i === btn) tags += ' (button)';
        if (p.i === sb) tags += ' (small blind)';
        if (p.i === bb) tags += ' (big blind)';
        let res;
        if (p.folded) {
          res = p.foldedOn === 0
            ? `folded before Flop${p.total === 0 ? " (didn't bet)" : ''}`
            : `folded ${SUMMARY_FOLD[p.foldedOn]}`;
        } else if (st.showdown) {
          const w = st.winnings[p.i];
          const c = p.cards.join(' ');
          res = w > 0
            ? `showed [${c}] and won (${fmt(w)}) with ${p.best.desc}`
            : `showed [${c}] and lost with ${p.best.desc}`;
        } else {
          res = `collected (${fmt(st.winnings[p.i])})`;
        }
        L(`Seat ${p.seat}: ${p.name}${tags} ${res}`);
      });
    }

    function deal(cards) {
      st.street++;
      P.forEach((p) => { p.street = 0; p.acted = false; });
      st.currentBet = 0;
      st.lastRaise = setup.bb;
      st.lastAgg = -1;
      const old = st.board.slice();
      st.board.push(...cards);
      if (st.street === 1) L(`*** FLOP *** [${st.board.join(' ')}]`);
      else L(`*** ${st.street === 2 ? 'TURN' : 'RIVER'} *** [${old.join(' ')}] [${cards.join(' ')}]`);
      st.streetPot[st.street] = sumTotals();
      if (st.runout) st.phase = st.board.length < 5 ? 'board' : 'showdown';
      else { st.phase = 'bet'; st.ptr = (btn + 1) % n; }
    }

    function act(i, ev) {
      const p = P[i];
      const col = st.img[st.street + 1];
      p.acted = true;
      let kind = ev.kind;
      if (kind === 'raise' && Math.min(ev.to, p.street + p.stack) <= st.currentBet) kind = 'call';
      if (kind === 'fold') {
        p.folded = true;
        p.foldedOn = st.street;
        L(`${p.name}: folds`);
        col.push({ i, word: 'Fold' });
      } else if (kind === 'check') {
        L(`${p.name}: checks`);
        col.push({ i, word: 'Check' });
      } else if (kind === 'call') {
        const a = put(p, st.currentBet - p.street);
        L(`${p.name}: calls ${fmt(a)}${p.allIn ? ' and is all-in' : ''}`);
        col.push({ i, word: 'Call', amt: a, allIn: p.allIn });
      } else {
        const to = Math.min(ev.to, p.street + p.stack);
        const prev = st.currentBet;
        put(p, to - p.street);
        const ai = p.allIn ? ' and is all-in' : '';
        if (prev === 0) {
          L(`${p.name}: bets ${fmt(to)}${ai}`);
          col.push({ i, word: 'Bet', amt: to, allIn: p.allIn });
        } else {
          L(`${p.name}: raises ${fmt(to - prev)} to ${fmt(to)}${ai}`);
          col.push({ i, word: 'Raise', amt: to, allIn: p.allIn });
        }
        if (to - prev >= st.lastRaise) st.lastRaise = to - prev;
        P.forEach((q) => { if (q !== p) q.acted = false; });
        st.currentBet = to;
        st.lastAgg = i;
      }
      st.ptr = (i + 1) % n;
    }

    function step() {
      if (st.done) return { type: 'done' };
      if (st.phase === 'bet') {
        if (P.filter((p) => !p.folded).length === 1) { closeRound(); return null; }
        const a = findActor();
        if (a < 0) { closeRound(); return null; }
        const p = P[a];
        const toCall = Math.min(st.currentBet - p.street, p.stack);
        const maxTo = p.street + p.stack;
        return {
          type: 'act', i: a, toCall, canCheck: toCall === 0,
          minTo: Math.min(st.currentBet + st.lastRaise, maxTo), maxTo,
          canRaise: maxTo > st.currentBet && P.some((q) => q !== p && !q.folded && !q.allIn),
          isBet: st.currentBet === 0, currentBet: st.currentBet, pot: sumTotals(),
          unopened: st.street === 0 && !st.img[1].some((a) => a.word === 'Call' || a.word === 'Raise'),
        };
      }
      if (st.phase === 'show') {
        const p = showOrder().find((q) => !q.shown);
        if (!p) { st.phase = st.runout && st.board.length < 5 ? 'board' : 'showdown'; return null; }
        if (p.cards) { doShow(p); return null; }
        return { type: 'show', i: p.i };
      }
      if (st.phase === 'board') {
        return { type: 'board', count: st.board.length === 0 ? 3 : 1, street: st.street + 1 };
      }
      if (st.phase === 'showdown') { resolveShowdown(); return null; }
      return { type: 'done' };
    }

    function nextNeed() {
      for (let g = 0; g < 1000; g++) {
        const need = step();
        if (need) return need;
      }
      throw new Error('Engine did not settle');
    }

    let ei = 0;
    for (;;) {
      const need = nextNeed();
      st.need = need;
      if (need.type === 'done' || ei >= events.length) break;
      const ev = events[ei++];
      if (need.type === 'act' && ev.t === 'act') act(need.i, ev);
      else if (need.type === 'show' && ev.t === 'show') { P[need.i].cards = ev.cards; doShow(P[need.i]); }
      else if (need.type === 'board' && ev.t === 'board') deal(ev.cards.slice(0, need.count));
    }
    st.consumed = ei;
    return st;
  }

  global.Engine = { simulate, positions, positionOf, blindSeats, money, bestHand, STREET_NAMES };
})(window);
