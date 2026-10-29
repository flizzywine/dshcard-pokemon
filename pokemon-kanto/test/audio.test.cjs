'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/audio.js'), 'utf8');

function audioFixture(manifest) {
  let attempts = 0;
  const clips=[];
  const documentListeners = new Map(), windowListeners = new Map(), span = { textContent: '' };
  const button = { dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, querySelector() { return span; } };
  class FakeAudio {
    constructor(src = '') { this.src = src; this.paused = true; this.listeners = new Map(); this.volume = 1;clips.push(this); }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    play() {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error('autoplay blocked'));
      this.paused = false; this.listeners.get('playing')?.(); return Promise.resolve();
    }
    pause() { this.paused = true; this.listeners.get('pause')?.(); }
  }
  const window = {
    __KANTO_AUDIO_MANIFEST__: manifest||{ bgm: { wild: { file: 'assets/audio/wild.mp3', track: '野外战斗' } }, sfx: {} },
    KantoAssets: { href: file => `https://pack.example/${file}` },
    addEventListener(type, fn) { windowListeners.set(type, fn); },
  };
  const document = {
    baseURI: 'https://pack.example/index.html',
    getElementById: id => id === 'musicToggle' ? button : null,
    addEventListener(type, fn) { documentListeners.set(type, fn); },
  };
  vm.runInNewContext(source, { window, document, Audio: FakeAudio, URL, Promise, Set });
  return { api: window.KantoAudio, button, span, clips,get attempts() { return attempts; }, documentListeners, windowListeners };
}

test('both sides have move and impact audio even when the named move has an empty clip',async()=>{
 const manifest=require('../public/data/audio.json'),view=audioFixture(manifest);await view.api.init();
 for(const actor of ['p1a: 小火龙','p2a: 杰尼龟']){const start=view.clips.length;view.api.event(`|move|${actor}|Scratch|target`);view.api.event(`|-damage|target|10/20`);assert.equal(view.clips.length-start,2);assert.ok(view.clips.slice(start).every(clip=>clip.src.endsWith('hit-normal.wav')));}
 const start=view.clips.length;view.api.event('|move|p2a: 杰尼龟|Growl|p1a: 小火龙');assert.equal(view.clips.length,start+1,'enemy status moves also get a generic cue');view.api.event('|-miss|p2a: 杰尼龟');assert.ok(view.clips.at(-1).src.endsWith('hit-not-effective.wav'));
 view.api.effects(false);const muted=view.clips.length;view.api.event('|move|p2a: 杰尼龟|Tackle|p1a: 小火龙');assert.equal(view.clips.length,muted);await Promise.resolve();
});

test('blocked battle music exposes a retry state and resumes only from the explicit user action', async () => {
  const view = audioFixture(), states = [];
  view.api.watchState(state => states.push(state));
  await view.api.init();
  view.api.battle({ id: 'battle-1', ended: false, mode: 'wild' }, { 遭遇: { 类型: 'wild' } }, true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(view.api.status().needsGesture, true);
  assert.equal(view.span.textContent, '点击播放音乐');
  assert.equal(view.button.dataset.playing, 'false');
  const resume = view.api.resumeMusic();
  assert.equal(view.attempts, 2, 'resume calls play synchronously inside the click gesture');
  assert.equal(await resume, true);
  assert.deepEqual(JSON.parse(JSON.stringify(view.api.status())), {
    blocked: false, playing: true, musicEnabled: true, enabled: true, track: 'wild', needsGesture: false,
  });
  assert.equal(view.span.textContent, '音乐 开');
  assert.ok(states.some(state => state.needsGesture));
  assert.ok(states.some(state => state.playing));
  view.api.music(false);
  assert.equal(view.api.status().needsGesture, false);
  assert.equal(view.api.status().musicEnabled, false, 'resume never toggles the music preference');
});
