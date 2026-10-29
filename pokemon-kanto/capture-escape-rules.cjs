'use strict';

const BALL_MULTIPLIERS = Object.freeze({pokeball: 10, greatball: 15, ultraball: 20});
const CATCH_STATUS = new Set(['psn', 'tox', 'brn', 'par']);
const SPECIAL_BALL_IDS = Object.freeze(['netball', 'diveball', 'nestball', 'repeatball', 'timerball', 'luxuryball', 'premierball', 'masterball']);

// Special-ball rules and integer order are checked against pret/pokefirered
// ce6406d8c2eaf46d543c8a2606de0c3cb1951982, Cmd_handleballthrow:
// https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_script_commands.c#L8930-L9017

function specialBallMultiplier(ballId, context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new TypeError('精灵球上下文无效。');
  if (context.types !== undefined && (!Array.isArray(context.types) || context.types.some(type => typeof type !== 'string'))) throw new TypeError('目标属性上下文无效。');
  if (context.level !== undefined && (!Number.isSafeInteger(context.level) || context.level < 1 || context.level > 100)) throw new RangeError('目标等级须为1—100整数。');
  if (context.alreadyCaught !== undefined && typeof context.alreadyCaught !== 'boolean') throw new TypeError('图鉴收服标记无效。');
  if (context.turns !== undefined && (!Number.isSafeInteger(context.turns) || context.turns < 0)) throw new RangeError('已完成回合数须为非负整数。');
  if (context.underwater !== undefined && typeof context.underwater !== 'boolean') throw new TypeError('水下场景标记无效。');

  switch (ballId) {
  case 'netball': {
    const types = (context.types || []).map(type => type.toLowerCase());
    return types.includes('water') || types.includes('bug') ? 30 : 10;
  }
  case 'diveball': return context.underwater === true ? 35 : 10;
  case 'nestball': {
    const level = context.level ?? 100;
    return level < 40 ? Math.max(10, 40 - level) : 10;
  }
  case 'repeatball': return context.alreadyCaught === true ? 30 : 10;
  case 'timerball': return Math.min(40, 10 + (context.turns ?? 0));
  case 'luxuryball':
  case 'premierball':
  case 'masterball': return 10;
  default: return 0;
  }
}

function integerSqrt(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('平方根输入必须是非负安全整数。');
  const n = BigInt(value);
  let low = 0n, high = n + 1n;
  while (low + 1n < high) {
    const middle = (low + high) >> 1n;
    if (middle * middle <= n) low = middle;
    else high = middle;
  }
  return Number(low);
}

function catchOdds({catchRate, maxHp, hp, status = '', ballId, context}) {
  if (![catchRate, maxHp, hp].every(Number.isSafeInteger) || catchRate < 0 || maxHp < 1 || hp < 0 || hp > maxHp) {
    throw new RangeError('捕获计算参数无效。');
  }
  const legacyBall = Object.prototype.hasOwnProperty.call(BALL_MULTIPLIERS, ballId);
  const specialBall = SPECIAL_BALL_IDS.includes(ballId);
  if (!legacyBall && !specialBall) throw new RangeError('未知精灵球。');
  if (specialBall && (context === null || typeof context !== 'object' || Array.isArray(context))) throw new TypeError('特殊精灵球需要战斗上下文。');
  const ballMultiplier = legacyBall ? BALL_MULTIPLIERS[ballId] : specialBallMultiplier(ballId, context);

  // Match Cmd_handleballthrow's left-to-right C integer divisions exactly.
  let odds = Math.floor(catchRate * ballMultiplier / 10);
  odds = Math.floor(odds * (3 * maxHp - 2 * hp) / (3 * maxHp));
  if (status === 'slp' || status === 'frz') odds *= 2;
  if (CATCH_STATUS.has(status)) odds = Math.floor(odds * 15 / 10);
  return odds;
}

function captureThreshold(odds) {
  if (!Number.isSafeInteger(odds) || odds < 0) throw new RangeError('捕获率必须是非负整数。');
  if (odds > 254) return 65536;
  if (odds === 0) return 0;
  const root = integerSqrt(integerSqrt(Math.floor(16711680 / odds)));
  return root ? Math.floor(1048560 / root) : 65536;
}

function resolveCapture(input, random16) {
  const odds = catchOdds(input);
  // FRLG's Master Ball always succeeds; its intermediate catch odds are not used as a probability.
  // The cartridge still performs throwaway checks for Master Balls with odds <= 254;
  // this pure helper models the guaranteed outcome and intentionally skips those RNG draws.
  if (input.ballId === 'masterball') return {odds, threshold: 65536, checks: 4, shakes: 3, success: true};
  if (typeof random16 !== 'function') throw new TypeError('捕获需要一个随机数函数。');
  if (odds > 254) return {odds, threshold: 65536, checks: 4, shakes: 3, success: true};
  const threshold = captureThreshold(odds);
  let checks = 0;
  while (checks < 4 && random16() < threshold) checks++;
  return {odds, threshold, checks, shakes: Math.min(checks, 3), success: checks === 4};
}

function resolveRun({playerSpeed, targetSpeed, attempts = 0, alwaysRun = false}, random8) {
  if (![playerSpeed, targetSpeed, attempts].every(Number.isSafeInteger) || playerSpeed < 1 || targetSpeed < 1 || attempts < 0) {
    throw new RangeError('逃跑计算参数无效。');
  }
  if (typeof random8 !== 'function') throw new TypeError('逃跑需要一个随机数函数。');
  const attempt = attempts + 1;
  if (alwaysRun) return {success: true, attempt, attempts};
  if (playerSpeed >= targetSpeed) return {success: true, attempt, attempts: attempts + 1};
  // The cartridge stores this intermediate in u8 speedVar, so slow escape
  // probabilities wrap modulo 256 before comparing against Random() & 0xFF.
  const chance = (Math.floor(playerSpeed * 128 / targetSpeed) + attempts * 30) & 0xff;
  const success = chance > random8();
  return {success, attempt, attempts: attempts + 1, chance};
}

module.exports = {BALL_MULTIPLIERS, SPECIAL_BALL_IDS, integerSqrt, catchOdds, captureThreshold, resolveCapture, resolveRun};
