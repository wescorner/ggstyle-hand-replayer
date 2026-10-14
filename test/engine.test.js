// Run with: node test/engine.test.js
const assert = require('assert');
global.window = global;
require('../engine.js');
const { simulate } = window.Engine;

const base = (players, extra = {}) => ({
  players: players.map(([name, stack]) => ({ name, label: name, stack })),
  button: 5, hero: 4, heroCards: ['Ac', 'Kd'], sb: 2, bb: 5, straddle: false, straddleAmt: 10,
  currency: '$', handId: 'HD1234567890', table: 'Live Table', date: '2026/10/14 02:17:00', ...extra,
});
const act = (kind, to) => ({ t: 'act', kind, to });
const board = (...cards) => ({ t: 'board', cards });

// The hand shown in hand-history.webp ($0.02/$0.05, Hero CO with AcKd).
{
  const setup = base([['sb1', 795], ['bb2', 673], ['utg3', 1486], ['mp4', 418], ['Hero', 559], ['btn6', 500]]);
  const st = simulate(setup, [
    act('fold'), act('fold'), act('raise', 10), act('raise', 30), act('fold'), act('fold'),
    act('raise', 100), act('call'),
    board('6h', '5s', '3c'), act('raise', 55), act('call'),
    board('4c'), act('raise', 105), act('call'),
    board('Td'), act('check'), act('raise', 240), act('fold'),
  ]);
  console.log(st.lines.join('\n'));
  assert.strictEqual(st.need.type, 'done');
  assert.deepStrictEqual(st.streetPot, [7, 207, 317, 527]);
  assert.strictEqual(st.winnings[5], 527);
  assert.ok(st.lines.includes('btn6: bets $2.4 and is all-in'));
  assert.ok(st.lines.includes('Uncalled bet ($2.4) returned to btn6'));
  assert.ok(st.lines.includes('Hero: raises $0.7 to $1'));
}

// Straddle + preflop all-in runout with side pot and showdown.
{
  const setup = base([['a', 1000], ['b', 300], ['c', 1000], ['d', 1000], ['Hero', 1000], ['f', 1000]], { straddle: true });
  const st = simulate(setup, [
    act('raise', 1000), // d (seat after straddler c) shoves
    act('call'),        // Hero
    act('fold'),        // f
    act('fold'),        // a
    act('call'),        // b all-in for less
    act('fold'),        // c straddler
    { t: 'show', cards: ['Qs', 'Qh'] }, // d (aggressor) shows first
    { t: 'show', cards: ['7c', '2d'] }, // b
    board('Ks', '9h', '4d'), board('2s'), board('3h'),
  ]);
  console.log('\n' + st.lines.join('\n'));
  assert.strictEqual(st.need.type, 'done');
  assert.ok(st.lines.includes('c: posts straddle $0.1'));
  const total = st.P.reduce((a, p) => a + p.total, 0);
  assert.strictEqual(st.winnings.reduce((a, b) => a + b, 0), total);
  assert.strictEqual(st.winnings[4], total); // Hero's pair of kings wins main + side
}

// Split pot on the board.
{
  const setup = base([['a', 500], ['b', 500], ['c', 500], ['d', 500], ['Hero', 500], ['f', 500]]);
  const st = simulate(setup, [
    act('fold'), act('fold'), act('call'), act('fold'), act('fold'), act('check'),
    board('As', 'Ks', 'Qs'), act('check'), act('check'),
    board('Js'), act('check'), act('check'),
    board('Ts'), act('check'), act('check'),
    { t: 'show', cards: ['2c', '3c'] },
  ]);
  console.log('\n' + st.lines.join('\n'));
  assert.strictEqual(st.winnings[1], 6);
  assert.strictEqual(st.winnings[4], 6);
  assert.ok(st.lines.some((l) => l.includes('Royal Flush')));
}
console.log('\nAll engine tests passed.');
