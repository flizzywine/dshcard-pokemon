'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('renewed protect lasts until its own timer expires', () => {
  const declaration = source.match(/  const protectTimers = .*\r?\n  function clearProtectTimer\(side\) \{[^\n]+\}/)[0];
  const start = source.indexOf('  function showVolatile('), end = source.indexOf('  function applyBoostEvent(', start);
  assert.ok(start >= 0 && end > start);
  let now = 0, serial = 0; const timers = new Map();
  const classes = new Set(), tacticalStates = {player:new Set(),foe:new Set()};
  const sprite = {classList:{toggle:(name,active)=>active?classes.add(name):classes.delete(name),remove:name=>classes.delete(name)}};
  const context = {tacticalStates, state:{animationSpeed:1,boosts:{player:{},foe:{}}}, spriteFor:()=>sprite,renderBoosts:()=>{},
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(declaration+'\n'+source.slice(start,end)+'\nglobalThis.showVolatile=showVolatile;',context);
  function advance(ms) { now += ms; for (const [id,timer] of timers) if(timer.at<=now) {timers.delete(id);timer.fn();} }
  context.showVolatile('player','protect',true); advance(1000);
  context.showVolatile('player','protect',true); advance(800);
  assert.ok(classes.has('volatile-protect')); assert.ok(tacticalStates.player.has('protect'));
  advance(1000); assert.ok(!classes.has('volatile-protect')); assert.ok(!tacticalStates.player.has('protect'));
  context.showVolatile('player','protect',true); context.showVolatile('player','protect',false);
  assert.equal(timers.size,0);
});

