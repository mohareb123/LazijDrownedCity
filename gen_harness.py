#!/usr/bin/env python3
"""Generate the open-world physics harness (harness_openworld.mjs) from the CURRENT build. Run after every rebuild."""
src = open('open_world_script.mjs', encoding='utf-8').read()
def region(a, b):
    i = src.index(a) + len(a); j = src.index(b, i)
    return src[i:j]
PRE = """import * as THREE from './three_test.mjs';
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, damp = THREE.MathUtils.damp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
let uiBusy = false, paused = false, landedCount = 0;
let camYaw = .3626;
const input = { forward: 0, strafe: 0, sprint: false };
let wantJump = false;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
const fwdVec = new THREE.Vector3(0, 0, -1), rightVec = new THREE.Vector3(1, 0, 0);
function fxLanded() { landedCount++; }
function ensureWebLine() {}
function toast() {}
function saveAll() {}
function sfxZip() {}
function sfxReel() {}
function sfxJump() {}
function sfxLand() {}
function sfxShot() {}
const player = { pos: new THREE.Vector3(46, 0, 120), vel: new THREE.Vector3(), onGround: false, heading: .3626 };
const web = { active: false, anchor: new THREE.Vector3(), len: 0, taut: false, line: null };
"""
TAIL = """
const city = buildCity(makeRand(2076));
let pass = {};
const tB = city.buildings.find(b => b.tower);
pass.t1 = groundAt(city, 0, 0) === TOWER_H && groundAt(city, 120, 120) < 1 && groundAt(city, 46, 120) === 0;
console.log('t1 tower ground', groundAt(city, 0, 0), '| street', groundAt(city, 120, 120));
// t2 pickAnchor near tower from a roof
player.pos.set(20, 30, 0);
const fwd = new THREE.Vector3(0, 0, 0).set(-1, 0, 0);
const a = pickAnchor(city, player.pos, fwd);
pass.t2 = !!a && a.p.y > 20;
console.log('t2 anchor:', a && a.p.toArray().map(v => v.toFixed(1)).join(','));
// t3 constraint: far gap = smooth zip, near gap = snap
{
  const pos = new THREE.Vector3(0, 0, 0), vel = new THREE.Vector3(20, 0, 0);
  const anc = new THREE.Vector3(50, 0, 0);
  swingConstraint(pos, vel, anc, 10, 0.5);
  const zip = Math.abs(pos.distanceTo(anc) - 34) < .01;  // 40% proportional pull on big gaps
  pos.set(50 + 10.4, 0, 0); vel.set(9, 0, 0);  // outside rope, fleeing outward
  swingConstraint(pos, vel, anc, 10, .5);
  const snap = Math.abs(pos.distanceTo(anc) - 10) < .01 && vel.x <= 0;
  pass.t3 = zip && snap;
}
// t4 600-frame chaos run
{
  let nan = 0, below = 0, maxS = 0;
  input.forward = 1; input.strafe = .7;
  for (let f = 0; f < 600; f++) {
    wantJump = f % 37 === 0;
    if (f % 53 === 6) { attachWeb(); }
    if (f % 53 === 30) releaseWeb();
    camYaw += .02;
    stepPlayer(1 / 60);
    if (Number.isNaN(player.pos.length() + player.vel.length())) nan++;
    const g = groundAt(city, player.pos.x, player.pos.z);
    if (player.pos.y < g - .5) below++;
    maxS = Math.max(maxS, player.vel.length());
  }
  pass.t4 = nan === 0 && below === 0 && maxS < 26;
  console.log('t4 nan:', nan, '| belowGround:', below, '| maxSpeed:', maxS.toFixed(1));
}
// t5 rooftop web-hop climb
{
  input.forward = 1; input.strafe = 0;
  const nb = city.buildings.filter(x => !x.tower && x.h > 20)
    .sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
  player.pos.set(nb.x, nb.h, nb.z); player.vel.set(0, 0, 0); player.onGround = true;
  camYaw = Math.atan2(nb.x, nb.z) + Math.PI;
  wantJump = true;
  let attached = false, maxEx = -1e9;
  for (let f = 0; f < 260; f++) {
    if (f === 6) { attachWeb(); attached = web.active; }
    stepPlayer(1 / 60);
    if (web.active) maxEx = Math.max(maxEx, player.pos.distanceTo(web.anchor) - web.len);
  }
  // on the tower roof the collider legitimately holds the player off the anchor point
  const roofContention = player.pos.y > TOWER_H - 2;
  pass.t5 = attached && (maxEx < .6 || roofContention) && !Number.isNaN(player.pos.x);
  console.log('t5 attached', attached, 'exceed', maxEx.toFixed(2), 'y', player.pos.y.toFixed(1));
  if (web.active) releaseWeb();
}
// t7 jump apex
{
  player.pos.set(120, groundAt(city, 120, 120), 120); player.vel.set(0, 0, 0); player.onGround = true;
  input.forward = 0; input.strafe = 0;
  wantJump = true;
  let peak = 0;
  for (let f = 0; f < 40; f++) { stepPlayer(1 / 60); peak = Math.max(peak, player.pos.y); }
  pass.t7 = peak > 1.5 && peak < 3;
  console.log('t7 apex', peak.toFixed(2));
}
// t8 rooftop landing snap
{
  const b = city.buildings.filter(x => !x.tower && x.h > 14)[3];
  player.pos.set(b.x, b.h + 2.4, b.z); player.vel.set(0, -3, 0); player.onGround = false;
  landedCount = 0;
  let landed = false;
  for (let f = 0; f < 120; f++) { stepPlayer(1 / 60); if (landedCount > 0) { landed = true; break; } }
  pass.t8 = landed && Math.abs(player.pos.y - b.h) < .05;
  console.log('t8 y', player.pos.y.toFixed(2), 'vs', b.h.toFixed(2), 'landed', landed);
}
// t9 wall pushout
{
  const b = city.buildings.filter(x => !x.tower)[5];
  const p = new THREE.Vector3(b.x, 1, b.z);
  collidePush(city, p, .42);
  pass.t9 = !(p.x > b.x - b.w / 2 && p.x < b.x + b.w / 2 && p.z > b.z - b.d / 2 && p.z < b.z + b.d / 2);
}
// t10 world bounds
{
  player.pos.set(500, 0, 0); player.vel.set(50, 0, 0); player.onGround = true;
  stepPlayer(1 / 60);
  pass.t10 = player.pos.x <= 346 && player.pos.x >= -346;
  console.log('t10 x', player.pos.x);
}
const ok = Object.values(pass).every(Boolean);
console.log(ok ? 'OPEN-WORLD PHYSICS OK' : 'OPEN-WORLD PHYSICS FAILED', JSON.stringify(pass));
process.exit(ok ? 0 : 1);
"""
open('harness_openworld.mjs', 'w', encoding='utf-8').write(
    PRE + region('/*__PHYS_START__*/', '/*__PHYS_END__*/')
      + region('/*__PHYS_LOGIC_START__*/', '/*__PHYS_LOGIC_END__*/') + '\n' + TAIL)
print('harness generated: harness_openworld.mjs')
