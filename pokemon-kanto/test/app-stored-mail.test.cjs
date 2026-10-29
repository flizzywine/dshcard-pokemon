'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const start = source.indexOf('  function renderStoredMail('), end = source.indexOf('  function renderInventoryRow(', start);
assert.ok(start >= 0 && end > start);
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.open = false; }
  appendChild(child) { this.children.push(child); }
  addEventListener(event, fn) { this.listeners[event] = fn; }
  set innerHTML(value) { throw Error('mail must not use HTML'); }
}
test('stored trade mail is rendered as safe text in a remembered disclosure', () => {
  assert.match(source, /renderStoredMail\(els\.inventory\)/);
  const state = {world:{邮件收纳:[{kind:'fab-mail',itemId:'fabmail',message:'THAT’S A HEALTHY JYNX! BE KIND TO IT.'}, {title:'<img src=x>',sender:'<script>',message:'<b>hello</b>'}]},bagDisclosure:{}};
  const context = {state, document:{createElement: tag => new Element(tag)}, itemName: id => id === 'fabmail' ? '华丽邮件' : id};
  vm.runInNewContext(source.slice(start,end) + '\nglobalThis.renderStoredMail=renderStoredMail;', context);
  const container = new Element('div'); context.renderStoredMail(container);
  const details = container.children[0]; assert.equal(details.tagName,'details'); assert.equal(details.open,false);
  assert.equal(details.children[0].textContent,'信件收纳 · 2 件');
  assert.deepEqual(details.children[1].children.map(x=>x.textContent),['信纸：华丽邮件','正文：THAT’S A HEALTHY JYNX! BE KIND TO IT.']);
  assert.deepEqual(details.children[2].children.map(x=>x.textContent),['标题：<img src=x>','发件人：<script>','正文：<b>hello</b>']);
  details.open = true; details.listeners.toggle(); assert.equal(state.bagDisclosure.mail,true);
  const next = new Element('div'); context.renderStoredMail(next); assert.equal(next.children[0].open,true);
});
