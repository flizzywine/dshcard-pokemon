'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../public/native-stage.css'), 'utf8');

test('native stage skin stays scoped to the Kanto addon and sizes scene elements within its viewport', () => {
  assert.match(css, /\.kanto-stage-shell\s*\{/);
  assert.match(css, /\.kanto-stage-shell \.kanto-stage-viewport/);
  assert.match(css, /\.kanto-stage-shell \.kanto-stage-viewport \.dsh-tavern-stage-scene/);
  assert.match(css, /\.kanto-stage-shell \.kanto-stage-starters/);
  assert.match(css, /\.kanto-stage-shell \.kanto-starter img/);
  assert.doesNotMatch(css, /(?:^|\})\s*(?:body|html|\.dsh-tavern-stage-[\w-]+)\s*\{/m);
  assert.doesNotMatch(css, /position\s*:\s*fixed/);
  assert.match(css, /data-kanto-mode="battle"\] \.kanto-stage-viewport[\s\S]*?min-height:\s*560px/);
  assert.match(css, /@media\s*\(max-height:\s*620px\)/);
});

test('starter selection has three readable image-first slots and a clear primary action', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.kanto-stage-shell \.kanto-starter\s*\{[\s\S]*?min-height:\s*86px/);
  assert.match(css, /\.kanto-stage-shell \.kanto-action\.is-primary/);
  assert.match(css, /\.dsh-tavern-stage-scene\.is-fullscreen \.dsh-tavern-stage-textbox/);
});
