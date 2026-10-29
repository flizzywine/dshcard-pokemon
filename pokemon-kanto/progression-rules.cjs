'use strict';

const fs = require('node:fs');
const path = require('node:path');
const shops = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/shops.json'), 'utf8'));

// Maximum party level while preparing for each Kanto Gym, keyed by badges owned.
const GYM_CAPS = Object.freeze([14, 21, 24, 29, 43, 43, 47, 50]);

function levelCap(world) {
  if (world?.设置?.道馆等级上限 === false) return null;
  if ((world?.剧情?.联盟进度 || 0) >= 5) return 100;
  const badgeCount = Math.min(8, world?.训练家?.徽章?.length || 0);
  return badgeCount === 8 ? 63 : GYM_CAPS[badgeCount];
}

function shopFor(world) {
  const nodeId = world?.地图?.节点;
  const shop = shops[nodeId];
  if (!shop) return {available: false, title: '商店', items: [], reason: '这里没有城镇商店。'};
  const badges = world?.训练家?.徽章?.length || 0;
  const items = shop.items.filter(entry => badges >= (entry.badges || 0)).map(entry => entry.id);
  return {available: true, title: shop.title, items,
    reason: items.length ? '' : '这家商店目前没有可购买的商品。'};
}

module.exports = {shops, GYM_CAPS, levelCap, shopFor};
