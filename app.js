(function () {
  const STORE_KEY = 'gg-live-hh-v1';
  const RANK_ORDER = 'AKQJT98765432';
  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const STEP_NAMES = ['Game', 'Players', 'Actions', 'Result'];
  const STREET_LABEL = ['Pre-Flop', 'Flop', 'Turn', 'River'];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hex8 = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
  const genHandId = () => 'HD' + String(Math.floor(1e9 + Math.random() * 9e9));
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 19);
  };
  const toCents = (v) => Math.round(parseFloat(v) * 100) || 0;
  const fromCents = (c) => String(c / 100);

  function defaultState() {
    return {
      step: 1,
      cfg: { title: 'Live', table: 'Live Table', currency: '$', sb: '1', bb: '2', straddle: false, straddleAmt: '4', n: 6, date: nowLocal() },
      players: [],
      button: 5,
      hero: 0,
      heroCards: [],
      events: [],
      unit: 'bb',
      handId: genHandId(),
    };
  }

  let S;
  try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || defaultState(); } catch { S = defaultState(); }
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(S));

  function syncPlayers() {
    const n = S.cfg.n;
    while (S.players.length < n) S.players.push({ name: '', stack: fromCents(toCents(S.cfg.bb) * 100), id: hex8() });
    S.players.length = n;
    if (S.button >= n) S.button = n - 1;
    if (S.hero >= n) S.hero = 0;
  }

  function resetHand() {
    S.events = [];
    S.heroCards = [];
    S.handId = genHandId();
    S.cfg.date = nowLocal();
  }

  function ggDate(local) {
    const s = (local || nowLocal()).replace('T', ' ').replace(/-/g, '/');
    return s.length === 16 ? s + ':00' : s.slice(0, 19);
  }

  function buildSetup() {
    const n = S.cfg.n;
    return {
      players: S.players.map((p, i) => {
        const custom = p.name.trim();
        const pos = Engine.positionOf(i, S.button, n, S.cfg.straddle);
        return {
          name: i === S.hero ? 'Hero' : custom || p.id,
          label: i === S.hero ? 'Hero' : custom || pos,
          stack: toCents(p.stack),
        };
      }),
      button: S.button,
      hero: S.hero,
      heroCards: S.heroCards,
      sb: toCents(S.cfg.sb),
      bb: toCents(S.cfg.bb),
      straddle: S.cfg.straddle && n >= 3,
      straddleAmt: toCents(S.cfg.straddleAmt),
      currency: S.cfg.currency,
      handId: S.handId,
      table: S.cfg.table || 'Live Table',
      title: S.cfg.title || 'Live',
      date: ggDate(S.cfg.date),
    };
  }

  // ---------- Card helpers ----------
  function cardHtml(c, cls = '') {
    if (!c) return `<span class="mini-card empty ${cls}"></span>`;
    const col = `suit-${c[1]}`;
    const r = c[0] === 'T' ? '10' : c[0];
    return `<span class="mini-card ${col} ${cls}"><span>${r}</span><span class="s">${SUIT_SYM[c[1]]}</span></span>`;
  }

  let pickerState = null;
  function openPicker(count, title, used, cb) {
    pickerState = { count, used: new Set(used), sel: [], cb };
    $('#pickerTitle').textContent = title;
    $('#picker').classList.remove('hidden');
    drawPicker();
  }
  function closePicker() {
    pickerState = null;
    $('#picker').classList.add('hidden');
  }
  function drawPicker() {
    const ps = pickerState;
    const sel = [];
    for (let k = 0; k < ps.count; k++) sel.push(cardHtml(ps.sel[k]));
    $('#pickerSelected').innerHTML = sel.join('') + `<span class="muted">${ps.sel.length}/${ps.count} selected</span>`;
    let html = '';
    SUITS.forEach((s) => {
      RANK_ORDER.split('').forEach((r) => {
        const c = r + s;
        const col = `suit-${s}`;
        const dis = ps.used.has(c) ? 'disabled' : '';
        const on = ps.sel.includes(c) ? 'sel' : '';
        html += `<button class="pc ${col} ${on}" data-card="${c}" ${dis}>${r === 'T' ? '10' : r}<br>${SUIT_SYM[s]}</button>`;
      });
    });
    $('#pickerGrid').innerHTML = html;
  }
  $('#pickerGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.pc');
    if (!b || b.disabled || !pickerState) return;
    const c = b.dataset.card;
    const ps = pickerState;
    const k = ps.sel.indexOf(c);
    if (k >= 0) ps.sel.splice(k, 1);
    else if (ps.sel.length < ps.count) ps.sel.push(c);
    drawPicker();
    if (ps.sel.length === ps.count) {
      const { cb, sel } = ps;
      setTimeout(() => { closePicker(); cb(sel.slice()); }, 150);
    }
  });
  $('#pickerClose').onclick = closePicker;
  $('#picker').addEventListener('click', (e) => { if (e.target.id === 'picker') closePicker(); });

  // ---------- Rendering ----------
  function renderSteps() {
    $('#steps').innerHTML = STEP_NAMES.map((n, k) => {
      const cls = k + 1 === S.step ? 'on' : k + 1 < S.step ? 'done' : '';
      const title = k + 1 < S.step ? ` title="Back to ${n}"` : '';
      return `<li class="${cls}" data-step="${k + 1}"${title}>${k + 1}. ${n}</li>`;
    }).join('');
  }
  $('#steps').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-step]');
    if (!li) return;
    const target = +li.dataset.step;
    if (target >= S.step) return;
    S.step = target;
    render();
  });

  function render() {
    save();
    renderSteps();
    const views = { 1: viewGame, 2: viewPlayers, 3: viewActions, 4: viewResult };
    views[S.step]();
  }

  function viewGame() {
    const c = S.cfg;
    const nOpts = Array.from({ length: 9 }, (_, k) => k + 2)
      .map((v) => `<option value="${v}" ${v === c.n ? 'selected' : ''}>${v} players</option>`).join('');
    const curOpts = [['$', '$ Dollars'], ['€', '€ Euros'], ['£', '£ Pounds'], ['', 'Chips (no symbol)']]
      .map(([v, l]) => `<option value="${v}" ${v === c.currency ? 'selected' : ''}>${l}</option>`).join('');
    $('#app').innerHTML = `
      <div class="card">
        <h2>Game setup</h2>
        <div class="form-grid">
          <label class="field">Number of players<select id="g-n">${nOpts}</select></label>
          <label class="field">Currency<select id="g-cur">${curOpts}</select></label>
          <label class="field">Small blind<input id="g-sb" type="number" min="0" step="any" value="${esc(c.sb)}"></label>
          <label class="field">Big blind<input id="g-bb" type="number" min="0" step="any" value="${esc(c.bb)}"></label>
          <label class="field">Straddle
            <span class="check"><input id="g-str" type="checkbox" ${c.straddle ? 'checked' : ''}> Straddle is on (UTG)</span>
          </label>
          <label class="field">Straddle amount<input id="g-stra" type="number" min="0" step="any" value="${esc(c.straddleAmt)}" ${c.straddle ? '' : 'disabled'}></label>
          <label class="field">Game title (image header)<input id="g-title" type="text" value="${esc(c.title)}"></label>
          <label class="field">Table name<input id="g-table" type="text" value="${esc(c.table)}"></label>
          <label class="field">Date &amp; time<input id="g-date" type="datetime-local" step="1" value="${esc(c.date)}"></label>
        </div>
        <div class="error" id="err"></div>
        <div class="row end"><button class="primary" id="next">Next: players →</button></div>
      </div>`;
    $('#g-str').onchange = (e) => {
      $('#g-stra').disabled = !e.target.checked;
      if (e.target.checked && !toCents($('#g-stra').value)) $('#g-stra').value = fromCents(toCents($('#g-bb').value) * 2);
    };
    $('#g-bb').oninput = (e) => { if (!$('#g-str').checked) $('#g-stra').value = fromCents(toCents(e.target.value) * 2); };
    $('#next').onclick = () => {
      const cfg = {
        n: +$('#g-n').value, currency: $('#g-cur').value, sb: $('#g-sb').value, bb: $('#g-bb').value,
        straddle: $('#g-str').checked, straddleAmt: $('#g-stra').value, title: $('#g-title').value.trim(),
        table: $('#g-table').value.trim(), date: $('#g-date').value,
      };
      const sb = toCents(cfg.sb), bb = toCents(cfg.bb), sa = toCents(cfg.straddleAmt);
      let err = '';
      if (sb <= 0 || bb <= 0) err = 'Blinds must be greater than zero.';
      else if (sb > bb) err = 'Small blind cannot be larger than the big blind.';
      else if (cfg.straddle && sa <= bb) err = 'Straddle must be larger than the big blind.';
      else if (cfg.straddle && cfg.n < 3) err = 'Straddle needs at least 3 players.';
      if (err) { $('#err').textContent = err; return; }
      const firstTime = !S.players.length;
      S.cfg = cfg;
      syncPlayers();
      if (firstTime) S.button = cfg.n - 1;
      S.step = 2;
      render();
    };
  }

  function viewPlayers() {
    syncPlayers();
    const n = S.cfg.n;
    const { sb, bb } = Engine.blindSeats(n, S.button);
    const strSeat = S.cfg.straddle && n >= 3 ? (bb + 1) % n : -1;
    const rows = S.players.map((p, i) => {
      const pos = Engine.positionOf(i, S.button, n, S.cfg.straddle);
      const role = i === sb ? ' · posts SB' : i === bb ? ' · posts BB' : i === strSeat ? ' · straddles' : '';
      return `<tr>
        <td>${i + 1}</td>
        <td><span class="pos-pill">${pos}</span><span class="muted" style="font-size:12px">${role}</span></td>
        <td>${i === S.hero ? '<b>Hero</b>' : `<input type="text" data-name="${i}" placeholder="${pos} (optional)" value="${esc(p.name)}">`}</td>
        <td><input type="number" min="0" step="any" data-stack="${i}" value="${esc(p.stack)}"></td>
        <td><input type="radio" name="btn" data-btn="${i}" ${i === S.button ? 'checked' : ''}></td>
        <td><input type="radio" name="hero" data-hero="${i}" ${i === S.hero ? 'checked' : ''}></td>
      </tr>`;
    }).join('');
    $('#app').innerHTML = `
      <div class="card">
        <h2>Players &amp; stacks</h2>
        <p class="muted">Seats go clockwise. Choose the dealer button and which seat is you (Hero). Names are optional; unnamed players get GGStyle anonymous IDs in the text and their position in the image.</p>
        <table class="players">
          <thead><tr><th>Seat</th><th>Position</th><th>Name</th><th>Starting stack (${esc(S.cfg.currency || 'chips')})</th><th>Button</th><th>Hero</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row" style="margin-top:14px">
          <span>Hero's hole cards:</span>
          <span>${cardHtml(S.heroCards[0])}${cardHtml(S.heroCards[1])}</span>
          <button id="pickHero">${S.heroCards.length ? 'Change' : 'Pick cards'}</button>
          <span class="spacer"></span>
          <button class="sm" id="allStacks">Set all stacks to…</button>
        </div>
        <div class="error" id="err"></div>
        <div class="row end">
          <button id="back">← Back</button>
          ${S.events.length ? `
          <span class="muted">A hand is in progress (${S.events.length} actions recorded).</span>
          <button class="danger" id="reset">Reset &amp; start new hand</button>
          <button class="primary" id="next">Resume hand →</button>` : `
          <button class="primary" id="next">Start hand →</button>`}
        </div>
      </div>`;
    if ($('#reset')) $('#reset').onclick = () => {
      if (!confirm('Discard all recorded actions and start a fresh hand?')) return;
      resetHand();
      render();
    };
    document.querySelectorAll('[data-name]').forEach((el) => (el.oninput = () => (S.players[+el.dataset.name].name = el.value, save())));
    document.querySelectorAll('[data-stack]').forEach((el) => (el.oninput = () => (S.players[+el.dataset.stack].stack = el.value, save())));
    document.querySelectorAll('[data-btn]').forEach((el) => (el.onchange = () => { S.button = +el.dataset.btn; render(); }));
    document.querySelectorAll('[data-hero]').forEach((el) => (el.onchange = () => { S.hero = +el.dataset.hero; render(); }));
    $('#pickHero').onclick = () => openPicker(2, "Hero's hole cards", [], (cards) => { S.heroCards = cards; render(); });
    $('#allStacks').onclick = () => {
      const v = prompt('Starting stack for every player:', S.players[0].stack);
      if (v != null && toCents(v) > 0) { S.players.forEach((p) => (p.stack = v)); render(); }
    };
    $('#back').onclick = () => { S.step = 1; render(); };
    $('#next').onclick = () => {
      let err = '';
      const names = new Set();
      S.players.forEach((p, i) => {
        if (toCents(p.stack) <= 0) err = `Seat ${i + 1} needs a stack greater than zero.`;
        const nm = i === S.hero ? 'Hero' : p.name.trim() || p.id;
        if (names.has(nm.toLowerCase())) err = `Two players are named "${nm}".`;
        if (i !== S.hero && nm.toLowerCase() === 'hero') err = 'Only the Hero seat may be named "Hero".';
        names.add(nm.toLowerCase());
      });
      if (S.heroCards.length !== 2) err = err || "Pick Hero's two hole cards.";
      if (err) { $('#err').textContent = err; return; }
      const heroUsed = new Set(S.heroCards);
      if (S.events.some((e) => (e.cards || []).some((c) => heroUsed.has(c)))) S.events = [];
      S.step = 3;
      render();
    };
  }

  function usedCards(st) {
    const used = new Set(S.heroCards);
    st.board.forEach((c) => used.add(c));
    st.P.forEach((p) => (p.cards || []).forEach((c) => used.add(c)));
    return [...used];
  }

  function viewActions() {
    const setup = buildSetup();
    const st = Engine.simulate(setup, S.events);
    if (st.consumed < S.events.length) S.events.length = st.consumed;
    const fmt = (c) => Engine.money(c, setup.currency);
    const need = st.need;
    const pot = st.pot();
    const actor = need.type === 'act' ? need.i : need.type === 'show' ? need.i : -1;

    const seats = st.P.map((p) => {
      const cls = [p.folded ? 'folded' : '', p.i === actor ? 'turn' : ''].join(' ');
      const tags = [p.allIn && !p.folded ? '<span class="tag">ALL-IN</span>' : '', p.folded ? '<span class="muted">folded</span>' : ''].join('');
      const cards = p.cards && (p.isHero || p.shown) ? `<div>${p.cards.map((c) => cardHtml(c)).join('')}</div>` : '';
      return `<div class="seat ${cls}">
        <div class="nm"><span>${p.seat}. ${esc(p.label)}</span><span class="pos-pill">${p.pos}</span></div>
        <div class="stk">${fmt(p.stack)}</div>
        <div class="front">${p.street ? 'In front: ' + fmt(p.street) : '&nbsp;'}</div>
        <div>${tags}</div>${cards}
      </div>`;
    }).join('');

    let prompt = '';
    if (need.type === 'act') {
      const p = st.P[need.i];
      const callLabel = need.canCheck ? 'Check' : `Call ${fmt(need.toCall)}${need.toCall >= p.stack ? ' (all-in)' : ''}`;
      const verb = need.isBet ? 'Bet' : 'Raise to';
      prompt = `
        <h3>${STREET_LABEL[st.street]} · ${esc(p.label)} <span class="pos-pill">${p.pos}</span></h3>
        <div class="muted">Stack ${fmt(p.stack)} · In front ${fmt(p.street)} · Pot ${fmt(pot)}${need.toCall ? ` · To call ${fmt(need.toCall)}` : ''}</div>
        <div class="actions">
          ${need.canCheck ? '' : '<button class="btn-fold" data-act="fold">Fold</button>'}
          <button class="btn-call" data-act="${need.canCheck ? 'check' : 'call'}">${callLabel}</button>
        </div>
        ${need.canRaise ? `
        <div class="raise-box">
          <div class="row">
            <span>${verb}</span>
            <input id="raiseTo" type="number" step="any" min="${fromCents(need.minTo)}" max="${fromCents(need.maxTo)}" value="${fromCents(need.minTo)}">
            <button class="primary" id="doRaise">${need.isBet ? 'Bet' : 'Raise'}</button>
            <span class="muted">min ${fmt(need.minTo)} · max ${fmt(need.maxTo)}</span>
          </div>
          <div class="row quick">
            <button class="sm" data-q="min">Min</button>
            <button class="sm" data-q="0.33">⅓ pot</button>
            <button class="sm" data-q="0.5">½ pot</button>
            <button class="sm" data-q="0.75">¾ pot</button>
            <button class="sm" data-q="1">Pot</button>
            <button class="sm danger" data-q="allin">All-in ${fmt(need.maxTo)}</button>
          </div>
          <div class="error" id="err"></div>
        </div>` : ''}`;
    } else if (need.type === 'board') {
      const name = ['', 'Flop', 'Turn', 'River'][need.street];
      prompt = `<h3>Deal the ${name}</h3>
        <p class="muted">${st.runout ? 'Players are all-in. Run out the board.' : 'Betting round complete.'}</p>
        <div class="actions"><button class="primary" id="dealBtn">Pick ${need.count} ${need.count > 1 ? 'cards' : 'card'} for the ${name}</button></div>`;
    } else if (need.type === 'show') {
      const p = st.P[need.i];
      prompt = `<h3>Showdown · ${esc(p.label)} <span class="pos-pill">${p.pos}</span></h3>
        <p class="muted">Enter the cards ${esc(p.label)} showed.</p>
        <div class="actions"><button class="primary" id="showBtn">Pick ${esc(p.label)}'s cards</button></div>`;
    } else {
      const winners = st.P.filter((p) => st.winnings[p.i] > 0).map((p) => `${esc(p.label)} wins ${fmt(st.winnings[p.i])}`).join(', ');
      prompt = `<h3>Hand complete</h3><p>${winners}</p>
        <div class="actions"><button class="primary" id="finish">Generate hand history →</button></div>`;
    }

    $('#app').innerHTML = `
      <div class="layout">
        <div>
          <div class="card">
            <div class="status">
              <span>Street: <b>${need.type === 'done' ? 'Finished' : STREET_LABEL[st.street]}</b></span>
              <span>Pot: <b>${fmt(pot)}</b></span>
              ${setup.straddle ? '<span class="muted">Straddle on</span>' : ''}
            </div>
            <div class="board-row">${[0, 1, 2, 3, 4].map((k) => cardHtml(st.board[k])).join('')}</div>
          </div>
          <div class="card"><div class="seat-list">${seats}</div></div>
        </div>
        <div>
          <div class="card prompt">${prompt}</div>
          <div class="card">
            <div class="row" style="margin-bottom:8px">
              <h3 style="margin:0">Hand history (live)</h3><span class="spacer"></span>
              <button class="sm" id="undo" ${S.events.length ? '' : 'disabled'}>↶ Undo</button>
              <button class="sm" id="back">← Players</button>
              <button class="sm danger" id="newHand">New hand</button>
            </div>
            <pre class="hh" id="log">${esc(st.lines.join('\n'))}</pre>
          </div>
        </div>
      </div>`;
    const log = $('#log');
    log.scrollTop = log.scrollHeight;

    const push = (ev) => { S.events.push(ev); render(); };
    document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => push({ t: 'act', kind: b.dataset.act })));
    if (need.type === 'act' && need.canRaise) {
      const input = $('#raiseTo');
      const potAfterCall = pot + need.toCall;
      document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
        const q = b.dataset.q;
        let to;
        if (q === 'min') to = need.minTo;
        else if (q === 'allin') to = need.maxTo;
        else to = need.isBet ? Math.round(pot * +q) : need.currentBet + Math.round(potAfterCall * +q);
        to = Math.max(need.minTo, Math.min(need.maxTo, to));
        if (q === 'allin') push({ t: 'act', kind: 'raise', to });
        else { input.value = fromCents(to); input.focus(); }
      }));
      const doRaise = () => {
        const to = toCents(input.value);
        if (to > need.maxTo) { $('#err').textContent = `Maximum is ${fmt(need.maxTo)} (all-in).`; return; }
        if (to < need.minTo && to !== need.maxTo) { $('#err').textContent = `Minimum ${need.isBet ? 'bet' : 'raise'} is ${fmt(need.minTo)}.`; return; }
        push({ t: 'act', kind: 'raise', to });
      };
      $('#doRaise').onclick = doRaise;
      input.onkeydown = (e) => { if (e.key === 'Enter') doRaise(); };
    }
    if (need.type === 'board') {
      const name = ['', 'Flop', 'Turn', 'River'][need.street];
      const byRank = (a, b) => RANK_ORDER.indexOf(a[0]) - RANK_ORDER.indexOf(b[0]);
      $('#dealBtn').onclick = () => openPicker(need.count, name, usedCards(st), (cards) =>
        push({ t: 'board', cards: need.count === 3 ? cards.slice().sort(byRank) : cards }));
    }
    if (need.type === 'show') {
      $('#showBtn').onclick = () => openPicker(2, `${st.P[need.i].label}'s cards`, usedCards(st), (cards) => push({ t: 'show', cards }));
    }
    if (need.type === 'done') $('#finish').onclick = () => { S.step = 4; render(); };
    $('#undo').onclick = () => { S.events.pop(); render(); };
    $('#newHand').onclick = () => {
      if (S.events.length && !confirm('Discard this hand and start a fresh one? Players and stacks are kept.')) return;
      resetHand();
      S.step = 2;
      render();
    };
    $('#back').onclick = () => {
      if (S.events.length && !confirm('Go back to players? Recorded actions are kept, but changing stacks or seats may invalidate them.')) return;
      S.step = 2;
      render();
    };
  }

  function viewResult() {
    const setup = buildSetup();
    const st = Engine.simulate(setup, S.events);
    if (st.need.type !== 'done') { S.step = 3; render(); return; }
    const text = st.lines.join('\n');
    $('#app').innerHTML = `
      <div class="result">
        <div class="card" style="padding:10px">
          <canvas id="cv"></canvas>
        </div>
        <div>
          <div class="card">
            <h3>Image</h3>
            <div class="row">
              <span class="toggle">
                <button class="${S.unit === 'bb' ? 'on' : ''}" data-unit="bb">Big blinds</button>
                <button class="${S.unit === 'money' ? 'on' : ''}" data-unit="money">${esc(setup.currency || 'Chips')}</button>
              </span>
              <button class="primary" id="dlPng">Download PNG</button>
            </div>
          </div>
          <div class="card">
            <div class="row" style="margin-bottom:8px">
              <h3 style="margin:0">GGStyle hand history</h3><span class="spacer"></span>
              <button class="sm" id="copy">Copy</button>
              <button class="sm" id="dlTxt">Download .txt</button>
            </div>
            <pre class="hh">${esc(text)}</pre>
          </div>
          <div class="row">
            <button id="edit">← Edit actions</button>
            <span class="spacer"></span>
            <button class="primary" id="newHand">Next hand (move button)</button>
          </div>
        </div>
      </div>`;
    const cv = $('#cv');
    HandImage.render(cv, setup, st, S.unit);
    document.querySelectorAll('[data-unit]').forEach((b) => (b.onclick = () => { S.unit = b.dataset.unit; render(); }));
    const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
    $('#dlPng').onclick = () => download(cv.toDataURL('image/png'), `${setup.handId}.png`);
    $('#dlTxt').onclick = () => {
      const url = URL.createObjectURL(new Blob([text + '\n\n'], { type: 'text/plain' }));
      download(url, `${setup.handId}.txt`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('#copy').onclick = async () => {
      await navigator.clipboard.writeText(text);
      $('#copy').textContent = 'Copied!';
      setTimeout(() => ($('#copy').textContent = 'Copy'), 1200);
    };
    $('#edit').onclick = () => { S.step = 3; render(); };
    $('#newHand').onclick = () => {
      // Carry final stacks into the next hand and move the button clockwise.
      st.P.forEach((p, i) => (S.players[i].stack = fromCents(p.stack + st.winnings[i])));
      S.button = (S.button + 1) % S.cfg.n;
      resetHand();
      S.step = 2;
      render();
    };
  }

  render();
})();
