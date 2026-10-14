// Draws a hand replay image (table on top, per-street action columns below).
(function (global) {
  const W = 640;
  const SCALE = 2;
  const HEAD_H = 40;
  const ACT_TOP = 528;
  const ACT_HEAD = 58;
  const COL_W = W / 5;
  const CX = 320;
  const CY = 300;
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", Roboto, Arial, sans-serif';

  const C = {
    bg: '#0b1120',
    bg2: '#111a2e',
    panel: '#16213a',
    line: 'rgba(148,163,184,.14)',
    text: '#e5e9f0',
    muted: '#8b97ad',
    felt: '#0f4c3a',
    felt2: '#0a3528',
    hero: '#6366f1',
    win: '#22c55e',
    stack: '#e5e9f0',
    allIn: '#ef4444',
  };
  const POS_COLORS = {
    BTN: '#f59e0b', SB: '#a3e635', BB: '#34d399', STR: '#fb923c', UTG: '#22d3ee', 'UTG+1': '#38bdf8',
    'UTG+2': '#60a5fa', MP: '#818cf8', LJ: '#a78bfa', HJ: '#c084fc', CO: '#f472b6',
  };
  const WORD_COLORS = { Fold: '#8b97ad', Check: '#cbd5e1', Call: '#4ade80', Bet: '#fbbf24', Raise: '#fbbf24', SB: '#cbd5e1', BB: '#cbd5e1', STR: '#cbd5e1' };
  const SUIT_SYM = { s: '\u2660\uFE0E', h: '\u2665\uFE0E', d: '\u2666\uFE0E', c: '\u2663\uFE0E' };
  const SUIT_COL = { s: '#1e293b', h: '#e11d48', d: '#2563eb', c: '#16a34a' };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function font(size, weight = 500) {
    return `${weight} ${size}px ${FONT}`;
  }

  function fitFont(ctx, text, size, maxW, weight = 600) {
    let s = size;
    ctx.font = font(s, weight);
    while (s > 9 && ctx.measureText(text).width > maxW) ctx.font = font(--s, weight);
    return s;
  }

  function drawCard(ctx, card, x, y, w, h) {
    const rank = card[0] === 'T' ? '10' : card[0];
    const col = SUIT_COL[card[1]];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    rr(ctx, x, y, w, h, Math.max(4, w * 0.12));
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font(Math.round(h * 0.34), 700);
    if (rank === '10') {
      ctx.save();
      ctx.translate(x + w * 0.08, y + h * 0.07);
      ctx.scale(0.78, 1);
      ctx.fillText(rank, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(rank, x + w * 0.12, y + h * 0.07);
    }
    ctx.font = font(Math.round(h * 0.24), 400);
    ctx.fillText(SUIT_SYM[card[1]], x + w * 0.13, y + h * 0.42);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.9;
    ctx.font = font(Math.round(h * 0.5), 400);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(SUIT_SYM[card[1]], x + w * 0.93, y + h * 0.92);
    ctx.globalAlpha = alpha;
  }

  function drawPill(ctx, text, x, y, { bg, fg, size = 12, weight = 700, padX = 8, h = 20, align = 'left' }) {
    ctx.font = font(size, weight);
    const w = ctx.measureText(text).width + padX * 2;
    const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    rr(ctx, left, y, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + w / 2, y + h / 2 + 0.5);
    return w;
  }

  function seatPoint(rel, n) {
    const a = ((90 + (rel * 360) / n) * Math.PI) / 180;
    return { x: CX + 256 * Math.cos(a), y: CY + 168 * Math.sin(a) };
  }

  function itemHeight(it, isHero) {
    const base = !isHero && it.amt != null ? 44 : 30;
    return base + (it.allIn ? 22 : 0) + 8;
  }

  function render(canvas, setup, st, unit) {
    const n = st.n;
    const bbNum = (v) => {
      let r = Math.round(v * 10) / 10;
      if (r === 0 && v > 0) r = Math.round(v * 100) / 100;
      return String(r);
    };
    const amt = (c) => (unit === 'bb' ? `${bbNum(c / setup.bb)} BB` : Engine.money(c, setup.currency));

    const cols = [{ title: 'Blinds', pot: null, items: st.img[0] }];
    for (let k = 0; k < 4; k++) cols.push({ title: Engine.STREET_NAMES[k], pot: st.streetPot[k], items: st.img[k + 1] });
    const colHeights = cols.map((c) => c.items.reduce((a, it) => a + itemHeight(it, st.P[it.i].isHero), 0));
    const H = Math.max(ACT_TOP + 340, ACT_TOP + ACT_HEAD + 14 + Math.max(...colHeights) + 16);

    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, ACT_TOP);
    bg.addColorStop(0, C.bg2);
    bg.addColorStop(1, C.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, ACT_TOP);

    // Header
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.text;
    ctx.font = font(15, 650);
    const stakes = `${Engine.money(setup.sb, setup.currency)} / ${Engine.money(setup.bb, setup.currency)}`;
    ctx.fillText(`${setup.title}  ${stakes}`, 18, HEAD_H / 2 + 2);
    if (setup.straddle) {
      const w = ctx.measureText(`${setup.title}  ${stakes}`).width;
      drawPill(ctx, `STR ${Engine.money(setup.straddleAmt, setup.currency)}`, 18 + w + 10, HEAD_H / 2 - 8, { bg: 'rgba(251,146,60,.16)', fg: '#fdba74', size: 11, h: 18 });
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    ctx.font = font(11, 500);
    ctx.fillText(`#${setup.handId}  \u00B7  ${setup.date}`, W - 18, HEAD_H / 2 - 5);
    ctx.font = font(11, 800);
    ctx.fillStyle = C.text;
    const brandW = ctx.measureText('GGSTYLE').width;
    ctx.fillText('GGSTYLE', W - 18, HEAD_H / 2 + 10);
    ctx.fillStyle = C.hero;
    ctx.beginPath();
    ctx.arc(W - 18 - brandW - 7, HEAD_H / 2 + 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.line;
    ctx.fillRect(0, HEAD_H, W, 1);

    // Table
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.ellipse(CX, CY, 286, 128, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2638';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(CX, CY, 276, 118, 0, 0, Math.PI * 2);
    const felt = ctx.createRadialGradient(CX, CY - 30, 20, CX, CY, 280);
    felt.addColorStop(0, C.felt);
    felt.addColorStop(1, C.felt2);
    ctx.fillStyle = felt;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(CX, CY, 244, 96, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Board
    const cw = 52;
    const ch = 72;
    const gap = 6;
    const bx = CX - (5 * cw + 4 * gap) / 2;
    for (let k = 0; k < 5; k++) {
      const x = bx + k * (cw + gap);
      if (st.board[k]) drawCard(ctx, st.board[k], x, CY - 44, cw, ch);
      else {
        rr(ctx, x, CY - 44, cw, ch, 6);
        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (st.potTotal) {
      drawPill(ctx, `Pot ${amt(st.potTotal)}`, CX, CY + 38, { bg: 'rgba(0,0,0,.35)', fg: C.text, size: 12, weight: 600, h: 22, padX: 12, align: 'center' });
    }

    // Seats
    const hero = st.P.find((p) => p.isHero);
    const R = n <= 6 ? 30 : n <= 8 ? 27 : 24;
    const pts = st.P.map((p) => seatPoint((p.i - hero.i + n) % n, n));

    st.P.forEach((p) => {
      const { x, y } = pts[p.i];
      const won = st.winnings[p.i] > 0;
      const accent = POS_COLORS[p.pos] || '#94a3b8';
      const showCards = p.cards && (p.isHero || p.shown);
      const avY = y - 14;
      ctx.globalAlpha = p.folded && !showCards ? 0.7 : 1;

      if (showCards) {
        const w = p.isHero ? 44 : 38;
        const h = p.isHero ? 62 : 54;
        const top = avY - h / 2 - (p.isHero ? 10 : 4);
        if (won) {
          ctx.save();
          ctx.shadowColor = C.win;
          ctx.shadowBlur = 22;
          rr(ctx, x - w - 1, top - 1, 2 * w + 2, h + 2, 8);
          ctx.fillStyle = 'rgba(34,197,94,.35)';
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        if (p.folded) {
          ctx.filter = 'grayscale(1)';
          ctx.globalAlpha = 0.6;
        }
        drawCard(ctx, p.cards[0], x - w - 1, top, w, h);
        drawCard(ctx, p.cards[1], x + 1, top, w, h);
        ctx.restore();
      } else {
        if (won) {
          ctx.save();
          ctx.shadowColor = C.win;
          ctx.shadowBlur = 24;
          ctx.beginPath();
          ctx.arc(x, avY, R + 2, 0, Math.PI * 2);
          ctx.fillStyle = C.win;
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(x, avY, R, 0, Math.PI * 2);
        ctx.fillStyle = '#18233a';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = won ? C.win : accent;
        ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitFont(ctx, p.pos, Math.round(R * 0.5), R * 1.5, 700);
        ctx.fillText(p.pos, x, avY + 1);
      }

      const pw = 92;
      const ph = 34;
      const pt = p.isHero ? y + 6 : avY + R + 4;
      rr(ctx, x - pw / 2, pt, pw, ph, 9);
      ctx.fillStyle = 'rgba(15,23,42,.92)';
      ctx.fill();
      ctx.strokeStyle = won ? 'rgba(34,197,94,.6)' : C.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.muted;
      fitFont(ctx, p.label, 10.5, pw - 12, 500);
      ctx.fillText(p.label, x, pt + 10);
      ctx.fillStyle = C.stack;
      fitFont(ctx, amt(p.start), 13, pw - 12, 700);
      ctx.fillText(amt(p.start), x, pt + 24);
      ctx.globalAlpha = 1;

      if (won) {
        const label = `+${amt(st.winnings[p.i])}`;
        const tx = x + (CX - x) * 0.42;
        const ty = y + (CY - y) * 0.42 - 12;
        drawPill(ctx, label, tx, ty, { bg: C.win, fg: '#052e16', size: 12, weight: 800, h: 22, padX: 10, align: 'center' });
        drawPill(ctx, 'WIN', x + pw / 2 - 4, pt - 8, { bg: C.win, fg: '#052e16', size: 9, weight: 800, h: 15, padX: 6, align: 'right' });
      }
    });

    // Dealer button
    {
      const { x, y } = pts[st.btn];
      const dx = x + (CX - x) * 0.22 + (x < CX ? 20 : x > CX ? -20 : 34);
      const dy = y + (CY - y) * 0.22 + 14;
      ctx.beginPath();
      ctx.arc(dx, dy, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = font(9, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('D', dx, dy + 0.5);
    }

    // Action columns
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, ACT_TOP, W, H - ACT_TOP);
    ctx.fillStyle = C.line;
    ctx.fillRect(0, ACT_TOP, W, 1);
    ctx.fillRect(0, ACT_TOP + ACT_HEAD, W, 1);
    for (let k = 1; k < 5; k++) ctx.fillRect(k * COL_W, ACT_TOP + 10, 1, H - ACT_TOP - 20);

    cols.forEach((col, c) => {
      const x0 = c * COL_W;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.muted;
      ctx.font = font(10.5, 700);
      ctx.fillText(col.title.toUpperCase(), x0 + 12, ACT_TOP + 20);
      ctx.fillStyle = col.pot != null ? C.text : 'rgba(139,151,173,.4)';
      ctx.font = font(15, 700);
      ctx.fillText(col.pot != null ? amt(col.pot) : c === 0 ? '' : '—', x0 + 12, ACT_TOP + 40);

      let y = ACT_TOP + ACT_HEAD + 12;
      col.items.forEach((it) => {
        const p = st.P[it.i];
        const amtText = it.amt != null ? amt(it.amt) : null;
        if (p.isHero) {
          const text = amtText ? `${it.word} ${amtText}` : it.word;
          fitFont(ctx, text, 13, COL_W - 40, 700);
          const w = ctx.measureText(text).width + 22;
          const xr = x0 + COL_W - 10;
          rr(ctx, xr - w, y, w, 30, 8);
          ctx.fillStyle = C.hero;
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, xr - w / 2, y + 15.5);
          y += 30;
          if (it.allIn) { drawPill(ctx, 'ALL-IN', xr, y + 4, { bg: 'rgba(239,68,68,.16)', fg: '#fca5a5', size: 10, weight: 800, h: 16, align: 'right' }); y += 22; }
        } else {
          const accent = POS_COLORS[p.pos] || '#94a3b8';
          const ax = x0 + 22;
          const ay = y + 15;
          ctx.beginPath();
          ctx.arc(ax, ay, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#18233a';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = accent;
          ctx.stroke();
          ctx.fillStyle = C.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          fitFont(ctx, p.pos, 9, 20, 700);
          ctx.fillText(p.pos, ax, ay + 0.5);

          const bx0 = x0 + 40;
          const bw = COL_W - 50;
          const h = amtText ? 44 : 30;
          rr(ctx, bx0, y, bw, h, 8);
          ctx.fillStyle = C.panel;
          ctx.fill();
          ctx.textAlign = 'left';
          ctx.fillStyle = WORD_COLORS[it.word] || C.text;
          if (amtText) {
            ctx.font = font(10.5, 700);
            ctx.fillText(it.word.toUpperCase(), bx0 + 10, y + 13);
            ctx.fillStyle = C.text;
            fitFont(ctx, amtText, 14, bw - 18, 700);
            ctx.fillText(amtText, bx0 + 10, y + 30);
          } else {
            fitFont(ctx, it.word, 13, bw - 18, 600);
            ctx.fillText(it.word, bx0 + 10, y + 15.5);
          }
          y += h;
          if (it.allIn) { drawPill(ctx, 'ALL-IN', bx0, y + 4, { bg: 'rgba(239,68,68,.16)', fg: '#fca5a5', size: 10, weight: 800, h: 16 }); y += 22; }
        }
        y += 8;
      });
    });
  }

  global.HandImage = { render };
})(window);
