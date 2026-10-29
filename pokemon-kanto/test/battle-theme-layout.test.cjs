'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../public/battle-theme.css'), 'utf8');

test('native roster keeps the header visible and scrolls the whole MVU panel region', () => {
  assert.match(css, /body\.native-mode\.roster-mode \.topbar\s*\{[\s\S]*?position:\s*sticky/);
  assert.doesNotMatch(css, /body\.native-mode\.roster-mode \.topbar\s*\{[^}]*display:\s*none/);
  assert.match(css, /body\.native-mode\.roster-mode \.battle-layout\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /body\.native-mode\.roster-mode \.setup-column\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /body\.native-mode\.roster-mode \.hud-tabs\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(css, /body\.native-mode\.roster-mode \.mvu-mon-card[\s\S]*?overflow:\s*visible/);
  assert.match(css, /body\.native-mode\.roster-mode \.mon-management-panel/);
});

test('party, bag, shop, quests and map controls remain touch-readable on narrow native screens', () => {
  for (const selector of ['.team-slots', '.mvu-stats-grid', '.inventory-row', '.shop-item-row', '.task-row', '.map-wrap', '.map-node.can-move']) {
    assert.ok(css.includes(`body.native-mode.roster-mode ${selector}`), `missing native roster styling for ${selector}`);
  }
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?body\.native-mode\.roster-mode \.team-slots\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /body\.native-mode\.roster-mode \.shop-item-row button/);
  assert.doesNotMatch(css, /position\s*:\s*fixed/);
});
