/* ============================================================
   لَزِج: المدينة الغارقة — عالم مفتوح
   (Three.js inlined by build_open.py; creature rig spliced at /*__RIG__*\/)
   ============================================================ */
const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = THREE.MathUtils.damp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function dampAngle(a, b, lambda, dt) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-lambda * dt));
}

/*__PHYS_START__*/
// ————————————————— world math: city, ground, web physics —————————————————
function makeRand(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const TOWER_H = 78;
const TOWER_S = 12;

function buildCity(rand) {
  const buildings = [];
  const lots = [];
  for (let gx = -TOWER_S; gx <= TOWER_S; gx += 2) {
    for (let gz = -TOWER_S; gz <= TOWER_S; gz += 2) {
      const cx = gx * 15, cz = gz * 15;
      const half = 11;
      lots.push({ x: cx, z: cz, half });
      const dist = Math.hypot(cx, cz);
      if (Math.abs(cx) < 22 && Math.abs(cz) < 22) {
        buildings.push({ x: cx, z: cz, w: 26, d: 26, h: TOWER_H, tower: true });
        continue;
      }
      const fall = Math.max(.16, 1 - dist / 400);
      const layout = rand() < .45 ? 1 : 2;
      for (let k = 0; k < layout; k++) {
        const w = (layout === 1 ? 13 + rand() * 9 : 6 + rand() * 5.5);
        const d = (layout === 1 ? 13 + rand() * 9 : 6 + rand() * 5.5);
        let ox = 0, oz = 0;
        if (layout === 2) {
          if (rand() < .5) ox = (k === 0 ? -1 : 1) * (7 + rand() * 2.5);
          else oz = (k === 0 ? -1 : 1) * (7 + rand() * 2.5);
        }
        const h = Math.max(6, (8 + Math.pow(rand(), 1.9) * 46) * fall * (1 + rand() * .2));
        buildings.push({
          x: cx + clamp(ox, -half + w / 2, half - w / 2),
          z: cz + clamp(oz, -half + d / 2, half - d / 2),
          w, d, h
        });
      }
    }
  }
  const cellOf = p => Math.round(p / 30);
  const index = new Map();
  const add = (key, obj) => {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(obj);
  };
  for (const b of buildings) {
    for (let ix = cellOf(b.x - b.w / 2); ix <= cellOf(b.x + b.w / 2); ix++)
      for (let iz = cellOf(b.z - b.d / 2); iz <= cellOf(b.z + b.d / 2); iz++)
        add(`${ix},${iz}`, b);
  }
  const cells = new Map();
  for (const l of lots) {
    const k = `${cellOf(l.x)},${cellOf(l.z)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(l);
  }
  return { buildings, lots, index, cells };
}

function groundAt(city, x, z) {
  const k = `${Math.round(x / 30)},${Math.round(z / 30)}`;
  let y = 0;
  const bs = city.index.get(k);
  if (bs) for (const b of bs) {
    if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) {
      y = Math.max(y, b.h);
    }
  }
  const ls = city.cells.get(k);
  if (ls && y <= 0) {
    for (const l of ls) {
      if (Math.abs(x - l.x) <= l.half && Math.abs(z - l.z) <= l.half) {
        y = .3;
        break;
      }
    }
  }
  return y;
}

function collidePush(city, p, r) {
  const k = `${Math.round(p.x / 30)},${Math.round(p.z / 30)}`;
  const bs = city.index.get(k);
  if (!bs) return false;
  let hit = false;
  for (const b of bs) {
    const px = b.w / 2 + r - Math.abs(p.x - b.x);
    const pz = b.d / 2 + r - Math.abs(p.z - b.z);
    if (px > 0 && pz > 0 && p.y < b.h - .55) {
      if (px < pz) p.x += (p.x >= b.x ? px : -px);
      else p.z += (p.z >= b.z ? pz : -pz);
      hit = true;
    }
  }
  return hit;
}

// Pick a web anchor: a rooftop up ahead, above us. Falls back to an air anchor.
function pickAnchor(city, pos, fwd) {
  let best = null, bestScore = .8;
  const cx = Math.round(pos.x / 30), cz = Math.round(pos.z / 30);
  for (let ix = cx - 2; ix <= cx + 2; ix++) {
    for (let iz = cz - 2; iz <= cz + 2; iz++) {
      const bs = city.index.get(`${ix},${iz}`);
      if (!bs) continue;
      for (const b of bs) {
        if (b.h < pos.y + 5.5) continue;
        const dx = b.x - pos.x, dz = b.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 7 || dist > 46) continue;
        const dot = (dx * fwd.x + dz * fwd.z) / dist;
        if (dot < .18) continue;
        const score = dot * 22 - dist * .16 + (b.h - pos.y) * .12;
        if (score > bestScore) { bestScore = score; best = b; }
      }
    }
  }
  if (best) {
    return { p: new THREE.Vector3(best.x, best.h + 1.6, best.z), real: true };
  }
  return {
    p: new THREE.Vector3(pos.x + fwd.x * 17, pos.y + 15, pos.z + fwd.z * 17),
    real: false
  };
}

function swingConstraint(pos, vel, anchor, len, maxCorr) {
  const d = pos.clone().sub(anchor);
  const dist = d.length();
  if (dist <= len || dist < 1e-5) return false;
  d.divideScalar(dist);
  // smooth reel: pull at most maxCorr units this frame — a web-zip, never a teleport
  const gap = dist - len;
  // small gap: snap exactly (no elastic sag). big gap: proportional zip pull, never sluggish
  const corr = gap < 8 ? gap : Math.min(gap, Math.max(gap * .4, maxCorr ?? 0));
  pos.addScaledVector(d, -corr);
  const radial = vel.dot(d);
  if (radial > 0) vel.addScaledVector(d, -radial);
  return true;
}

/*__PHYS_END__*/

let carried;
let state = "running";
let speed = 0;
let sideSpeed = 0;

const scene = new THREE.Scene();

/*__RIG__*/

// ——————————————————— renderer & atmosphere ———————————————————
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch {
  $("loadingText").textContent = "يحتاج المتصفح WebGL 2.";
  throw new Error("no webgl");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
document.body.prepend(renderer.domElement);

scene.background = new THREE.Color("#0a0e1c");
scene.fog = new THREE.FogExp2("#0a0e1c", .0082);

const hemi = new THREE.HemisphereLight("#5a6fae", "#0c0f18", 1.5);
scene.add(hemi);
const moon = new THREE.DirectionalLight("#aebfff", 1.1);
moon.position.set(-40, 80, 30);
scene.add(moon);
const cityGlow = new THREE.DirectionalLight("#ff5a8a", .45);
cityGlow.position.set(30, 8, -50);
scene.add(cityGlow);

// dusk skyline env for glossy wet reflections
{
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0c1430");
  g.addColorStop(.48, "#22304f");
  g.addColorStop(.58, "#5a3f4e");
  g.addColorStop(.63, "#c96b3f");
  g.addColorStop(1, "#080a10");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = ["#69e6ff", "#ffd08a", "#ff7ab0", "#b6ff7a"][i % 4];
    x.globalAlpha = .35 + Math.random() * .5;
    x.fillRect(Math.random() * 512, 138 + Math.random() * 46, 2 + Math.random() * 3, 1.5 + Math.random() * 5);
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(t).texture;
  t.dispose();
  pmrem.dispose();
}

carried = new THREE.Group();
creature.add(carried);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 520);

// ——— postprocessing: bloom (graceful — procedural world never depends on it) ———
let composer = null, bloomPass = null, bloomOn = false;
try {
  composer = new PP.EffectComposer(renderer);
  composer.addPass(new PP.RenderPass(scene, camera));
  bloomPass = new PP.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .72, .62, .7);
  composer.addPass(bloomPass);
  bloomOn = true;
} catch { composer = null; bloomOn = false; }
function renderFrame() {
  if (bloomOn && composer) composer.render();
  else renderer.render(scene, camera);
}

// ——————————————————— city meshes ———————————————————
const rand = makeRand(1973 + 83);
const city = buildCity(rand);

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(760, 760).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: "#0e1119", roughness: .55, metalness: .4, envMapIntensity: .6 })
);
groundMesh.position.y = -.02;
scene.add(groundMesh);

{
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: "#2b3247", roughness: .42, metalness: .48, envMapIntensity: 1.1
  });
  const im = new THREE.InstancedMesh(geo, mat, city.buildings.length + city.lots.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  for (const l of city.lots) {
    m.makeScale(l.half * 2 + 1.6, .6, l.half * 2 + 1.6);
    m.setPosition(l.x, -.02, l.z);
    im.setMatrixAt(n, m);
    col.setStyle("#1a202c").offsetHSL(0, 0, (rand() - .5) * .03);
    im.setColorAt(n, col);
    n++;
  }
  for (const b of city.buildings) {
    m.makeScale(b.w, b.h, b.d);
    m.setPosition(b.x, b.h / 2 - .3, b.z);
    im.setMatrixAt(n, m);
    const tall = b.h > 34;
    col.setStyle(tall ? "#33405e" : "#262c3d").offsetHSL(rand() * .04 - .02, rand() * .06 - .03, (rand() - .5) * .05);
    im.setColorAt(n, col);
    n++;
  }
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);

  // neon rooftop bands — the Spider-Man skyline signature
  const bandGeo = new THREE.BoxGeometry(1, 1, 1);
  const bandMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bands = new THREE.InstancedMesh(bandGeo, bandMat, city.buildings.length);
  const pal = ["#33e0ff", "#ff4d9d", "#ffb03a", "#8dff5a", "#b388ff", "#ff5340"];
  let bi = 0;
  for (const b of city.buildings) {
    m.makeScale(b.w * .96, .5, b.d * .96);
    m.setPosition(b.x, b.h + .18, b.z);
    bands.setMatrixAt(bi, m);
    col.setStyle(pal[(rand() * pal.length) | 0]);
    if (b.h < 14) col.multiplyScalar(.35);
    if (b.tower) col.setStyle("#ff2d55");
    bands.setColorAt(bi, col);
    bi++;
  }
  bands.instanceMatrix.needsUpdate = true;
  scene.add(bands);
}

// ——————————————————— rain ———————————————————
const RAIN_COUNT = 460;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 6);
const rainVel = new Float32Array(RAIN_COUNT);
for (let i = 0; i < RAIN_COUNT; i++) {
  const x = (rand() - .5) * 90, y = rand() * 70 - 5, z = (rand() - .5) * 90;
  rainPos.set([x, y, z, x, y + 1.4, z], i * 6);
  rainVel[i] = 26 + rand() * 22;
}
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
  color: "#9db9e8", transparent: true, opacity: .3
}));
rain.frustumCulled = false;
scene.add(rain);

// ——————————————————— player + web-swing + run/jump ———————————————————
const player = {
  pos: new THREE.Vector3(46, 0, 120),
  vel: new THREE.Vector3(),
  onGround: false,
  heading: Math.PI
};
const web = { active: false, anchor: new THREE.Vector3(), len: 0, taut: false, line: null };
let camYaw = .3626;
let camDist = 9;
let fovNow = 62;
let invuln = 0;

player.pos.y = groundAt(city, player.pos.x, player.pos.z);
player.heading = .3626;

const fwdVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();

/*__PHYS_LOGIC_START__*/
function stepPlayer(dt) {
  const p = player;
  // desired planar move from input, camera-relative
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  fwdVec.set(fx, 0, fz);
  rightVec.set(rx, 0, rz);
  let dx = fx * input.forward + rx * input.strafe;
  let dz = fz * input.forward + rz * input.strafe;
  const dl = Math.hypot(dx, dz);
  if (dl > 1) { dx /= dl; dz /= dl; }
  const wantSpeed = p.onGround || web.active ? (input.sprint ? 13.5 : 9.6) : 0;
  const accel = p.onGround ? 26 : web.active ? 12 : 5.2;
  p.vel.x = clamp(p.vel.x + (dx * wantSpeed - p.vel.x) * Math.min(1, accel * dt / Math.max(wantSpeed, 3)), -26, 26);
  p.vel.z = clamp(p.vel.z + (dz * wantSpeed - p.vel.z) * Math.min(1, accel * dt / Math.max(wantSpeed, 3)), -26, 26);

  // gravity & jump
  const g = web.active ? 13.5 : 25;
  p.vel.y -= g * dt;
  if (wantJump) {
    wantJump = false;
    if (p.onGround) { p.vel.y = 10.4; p.onGround = false; sfxJump(); }
  }
  if (p.onGround && p.vel.y <= 0) p.vel.y = Math.max(p.vel.y, -1.5);

  // web constraint + reel-in (the pull that makes swinging addictive)
  if (web.active) {
    web.t = (web.t || 0) + dt;
    const d = tmpA.copy(p.pos).sub(web.anchor);
    const dist = d.length();
    web.len = Math.max(6.5, web.len - 7.5 * dt);
    if (dist > web.len) {
      web.taut = true;
      if (swingConstraint(p.pos, p.vel, web.anchor, web.len, 26 * dt)) {
        const sp = Math.hypot(p.vel.x, p.vel.z);
        if (sp < 17 && dl > .1) { p.vel.x += dx * 7 * dt; p.vel.z += dz * 7 * dt; }
      }
    }
    if (dist < 4.2 && !p.onGround) releaseWeb();
  } else if (p.vel.y < -38) p.vel.y = -38;
  if (p.vel.y > 24) p.vel.y = 24;
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (hs > 24) { p.vel.x *= 24 / hs; p.vel.z *= 24 / hs; }

  // integrate + ground
  p.pos.addScaledVector(p.vel, dt);
  collidePush(city, p.pos, .42);
  p.pos.x = clamp(p.pos.x, -345, 345);
  p.pos.z = clamp(p.pos.z, -345, 345);
  const gh = groundAt(city, p.pos.x, p.pos.z);
  const wasAir = !p.onGround;
  if (p.pos.y <= gh && p.vel.y <= 0) {
    p.pos.y = gh;
    p.vel.y = 0;
    p.onGround = true;
    if (wasAir) fxLanded();
  } else p.onGround = false;

  if (dl > .1 && !web.active) p.heading = Math.atan2(-dx, -dz);
  else if (hs > .5) p.heading = Math.atan2(-p.vel.x, -p.vel.z);
}

function attachWeb() {
  if (web.active || uiBusy || paused) return;
  const fwd = tmpA.copy(fwdVec);
  const a = pickAnchor(city, player.pos, fwd);
  web.anchor.copy(a.p);
  const ad = player.pos.distanceTo(web.anchor);
  if (ad > 58) { web.active = false; return; }
  web.len = clamp(ad * .82, 8, 36);
  web.active = true;
  web.real = a.real;
  web.t = 0;
  web.taut = false;
  if (!player.onGround) player.vel.y = Math.max(player.vel.y, 1.2);
  else player.vel.y = 5.2;
  ensureWebLine();
  sfxZip();
}
function releaseWeb() {
  if (!web.active) return;
  web.active = false;
  player.vel.y = Math.min(player.vel.y + 2.6, 14);
  if (web.line) web.line.visible = false;
  sfxReel();
}
/*__PHYS_LOGIC_END__*/

// web rope visual
function ensureWebLine() {
  if (!web.line) {
    web.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: "#eef4ff", transparent: true, opacity: .9, depthTest: false })
    );
    scene.add(web.line);
  }
  web.line.visible = true;
}
function updateWebLine() {
  if (!web.active || !web.line) return;
  tmpB.copy(player.pos); tmpB.y += 1.1;
  web.line.geometry.setFromPoints([tmpB, web.anchor]);
}

// ——————————————————— parts of the Great Loom ———————————————————
function haloTex() {
  if (haloTex.t) return haloTex.t;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(.4, "rgba(255,215,94,.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  haloTex.t = new THREE.CanvasTexture(c);
  return haloTex.t;
}
const PART_TOTAL = 12;
const parts = [];
{
  const tall = city.buildings.filter(b => b.h > 20 && !b.tower);
  const step = Math.max(1, Math.floor(tall.length / PART_TOTAL));
  let i = 0;
  for (let k = 0; k < PART_TOTAL && k * step < tall.length; k++) {
    const b = tall[k * step];
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(.5, 0),
      new THREE.MeshStandardMaterial({
        color: "#0d1424", emissive: "#ffd75e", emissiveIntensity: 2.6, roughness: .3, flatShading: true
      })
    );
    mesh.position.set(b.x, b.h + 1.5, b.z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex(), color: "#ffd75e", transparent: true, opacity: .5,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(2.4, 2.4, 1);
    halo.position.copy(mesh.position);
    scene.add(mesh, halo);
    parts.push({ mesh, halo, taken: false, phase: rand() * 6.28, i: i++ });
  }
}
let partsGot = 0;
let mission = "find"; // find → boss → done
let hp = 5, score = 0, scoreShown = 0, healClock = 0, raceBest = 0;

// ——————————————————— hunters ———————————————————
const enemies = [];
function makeHunterMesh() {
  const g = new THREE.Group();
  const bodyMesh = hardShell(new THREE.OctahedronGeometry(.3, 0));
  bodyMesh.scale.set(1, .8, 1.3);
  bodyMesh.position.y = .34;
  g.add(bodyMesh);
  for (let k = 0; k < 4; k++) {
    const side = k % 2 ? 1 : -1;
    const leg = needle(.5, .035);
    aimSegment(leg,
      new THREE.Vector3(side * .16, .36, k < 2 ? -.12 : .14),
      new THREE.Vector3(side * .38, 0, k < 2 ? -.3 : .3));
    g.add(leg);
  }
  const eyes = new THREE.Sprite(new THREE.SpriteMaterial({
    color: "#9fc0ff", transparent: true, opacity: .8,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  eyes.scale.set(.7, .7, 1);
  eyes.position.set(0, .4, -.3);
  g.add(eyes);
  return g;
}
function streetSpotAround(x, z, rMin, rMax) {
  for (let k = 0; k < 14; k++) {
    const a = rand() * 6.283;
    const r = rMin + rand() * (rMax - rMin);
    const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
    const y = groundAt(city, sx, sz);
    if (y < 1) return { x: sx, z: sz, y };
  }
  return { x, z, y: 0 };
}
function pickTarget(e) {
  const w = streetSpotAround(e.pos.x, e.pos.z, 12, 46);
  e.target.set(w.x, w.y, w.z);
}
for (let i = 0; i < 20; i++) {
  const s = streetSpotAround(player.pos.x, player.pos.z, 30, 120);
  const mesh = makeHunterMesh();
  scene.add(mesh);
  const e = {
    pos: new THREE.Vector3(s.x, s.y, s.z),
    target: new THREE.Vector3(),
    mesh, alive: true, aggro: false
  };
  e.retarget = () => pickTarget(e);
  enemies.push(e);
  e.retarget();
}

function updateEnemies(dt) {
  let alive = 0;
  for (const e of enemies) {
    if (!e.alive) continue;
    alive++;
    const ddx = player.pos.x - e.pos.x, ddz = player.pos.z - e.pos.z;
    const ddy = player.pos.y - e.pos.y;
    const dist = Math.hypot(ddx, ddz);
    e.aggro = dist < 19 && Math.abs(ddy) < 5;
    let vx, vz;
    if (e.aggro) {
      vx = ddx / (dist || 1) * 6.6;
      vz = ddz / (dist || 1) * 6.6;
    } else {
      if (e.pos.distanceTo(e.target) < 2) e.retarget();
      const tx = e.target.x - e.pos.x, tz = e.target.z - e.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      vx = tx / tl * 3.1; vz = tz / tl * 3.1;
    }
    e.pos.x += vx * dt;
    e.pos.z += vz * dt;
    e.pos.y = groundAt(city, e.pos.x, e.pos.z);
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y = Math.atan2(-vx, -vz);
    if (e.mix) {
      setRobotClip(e, e.aggro ? "Running" : "Walking");
      e.mix.timeScale = clamp(.7 + Math.hypot(vx, vz) * .09, .7, 1.7);
      e.mix.update(dt);
    } else {
      e.mesh.position.y += Math.abs(Math.sin(performance.now() * .009 + e.pos.x)) * .06;
    }
    // contact
    if (dist < 1.25 && Math.abs(ddy) < 1.6 && invuln <= 0) {
      invuln = 1.8;
      const kd = tmpA.set(ddx, 0, ddz).normalize().multiplyScalar(-1);
      player.vel.x = kd.x * 13;
      player.vel.z = kd.z * 13;
      player.vel.y = 5.5;
      player.onGround = false;
      fxSlow = .45; fxCamShake = .3;
      releaseWeb();
      damagePlayer(1);
      toast("مطارد سنبيوتي مزّق ظهرك! اضربه بـ F أو 🕸");
    }
    if (dist > 130) {
      const w = streetSpotAround(player.pos.x, player.pos.z, 55, 90);
      e.pos.set(w.x, w.y, w.z);
      e.alive = true;
      e.mesh.visible = true;
      e.retarget();
    }
  }
}

function shootWeb() {
  if (uiBusy || paused || fxShootCd > 0) return;
  sfxShot();
  fxShootCd = .35;
  // boss first
  if (boss.active) {
    const d = tmpB.copy(boss.pos).sub(player.pos);
    if (d.length() < 36) {
      hitBoss();
      tmpA.copy(player.pos); tmpA.y += 1;
      tmpB.copy(boss.pos); tmpB.y += 1.4;
      spawnShotLine(tmpA, tmpB);
      return;
    }
  }
  let best = null, bestD = 1e9;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = tmpA.copy(e.pos).sub(player.pos);
    const dl = d.length();
    if (dl < 32 && dl > 3 && d.y > -2 && dl < bestD) { bestD = dl; best = e; }
  }
  if (best) {
    best.alive = false;
    best.mesh.visible = false;
    tmpA.copy(player.pos); tmpA.y += 1;
    spawnShotLine(tmpA, best.pos);
    const cocoon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.44, 0),
      new THREE.MeshStandardMaterial({ color: "#e8eef8", roughness: .8 })
    );
    cocoon.position.copy(best.pos); cocoon.position.y += .35;
    scene.add(cocoon);
    best.cocoon = cocoon;
    sfxKill();
    score += 50;
    combo.n++;
    combo.clock = 3;
    updateComboHud();
    if (combo.n === 3) toast("كومبو ×3! المطاردات تتعلم الخوف");
    if (combo.n === 6) toast("ستة شرانق… المدينة تتنفس الصعداء");
  } else {
    tmpA.copy(player.pos); tmpA.y += 1;
    tmpB.copy(fwdVec).multiplyScalar(9).add(tmpA);
    spawnShotLine(tmpA, tmpB);
  }
}
function spawnShotLine(a, b) {
  if (shootLine) {
    scene.remove(shootLine.line);
    shootLine.line.geometry.dispose();
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]),
    new THREE.LineBasicMaterial({ color: "#eef4ff", transparent: true, opacity: .95 })
  );
  scene.add(line);
  shootLine = { line, t: 1 };
}
const combo = { n: 0, clock: 0 };
let fxShootCd = 0;
let fxSlow = 1;
let fxCamShake = 0;

function updateFx(dt) {
  if (combo.clock > 0) {
    combo.clock -= dt;
    if (combo.clock <= 0) { combo.n = 0; updateComboHud(); }
  }
  if (invuln > 0) invuln -= dt;
  if (fxShootCd > 0) fxShootCd -= dt;
  if (shootLine) {
    shootLine.t -= dt * 5;
    shootLine.line.material.opacity = Math.max(0, shootLine.t);
    if (shootLine.t <= 0) {
      scene.remove(shootLine.line);
      shootLine.line.geometry.dispose();
      shootLine = null;
    }
  }
  fxCamShake = Math.max(0, fxCamShake - dt * 1.5);
  fxSlow = damp(fxSlow, 1, 4, dt);
}

// ——————————————————— the Black King ———————————————————
const boss = {
  active: false, pos: new THREE.Vector3(0, TOWER_H, 0), mesh: null,
  hp: 3, phase: "idle", t: 0, ring: null, stun: 0
};
function summonBoss() {
  if (boss.mesh) return;
  const g = new THREE.Group();
  const abd = hardShell(new THREE.OctahedronGeometry(.62, 0));
  abd.scale.set(.95, .85, 1.38).multiplyScalar(2.6);
  abd.position.set(0, 1.8, .8);
  g.add(abd);
  const thor = hardShell(new THREE.OctahedronGeometry(.4, 0));
  thor.scale.set(.92, .78, 1.12).multiplyScalar(2.6);
  thor.position.set(0, 1.55, -.9);
  g.add(thor);
  const head = hardShell(new THREE.OctahedronGeometry(.26, 0));
  head.scale.set(.85, .62, 1.15).multiplyScalar(2.6);
  head.position.set(0, 1.4, -1.95);
  g.add(head);
  for (let k = 0; k < 8; k++) {
    const side = k % 2 ? 1 : -1;
    const row = Math.floor(k / 2);
    const hz = -.9 + row * .75;
    const seg1 = needle(2.3, .16);
    aimSegment(seg1, new THREE.Vector3(side * .6, 1.55, hz), new THREE.Vector3(side * 2, 2.8, hz));
    const seg2 = needle(2.7, .11);
    aimSegment(seg2, new THREE.Vector3(side * 2, 2.8, hz), new THREE.Vector3(side * 2.9, 0, hz + .3));
    g.add(seg1, seg2);
  }
  for (const [sx, len] of [[0, 1], [.5, .75], [-.5, .75]]) {
    const sp = needle(len, .14);
    sp.position.set(sx, 2.7 + (Math.abs(sx) > .3 ? -.3 : 0), .4);
    sp.quaternion.setFromUnitVectors(UP, new THREE.Vector3(sx * .5, 1, .2).normalize());
    g.add(sp);
  }
  for (const ex of [-.22, .22]) {
    const eye = new THREE.Sprite(new THREE.SpriteMaterial({
      color: "#ffe0e0", transparent: true, opacity: .95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    eye.scale.set(1.2, 1.2, 1);
    eye.position.set(ex, 1.5, -2.6);
    g.add(eye);
  }
  boss.mesh = g;
  g.position.copy(boss.pos);
  scene.add(g);
  boss.ring = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 30).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: "#ff4433", transparent: true, opacity: 0, depthWrite: false })
  );
  boss.ring.visible = false;
  scene.add(boss.ring);
  boss.active = true;
  boss.hp = 3;
  renderBossPips();
  $("bossWrap").classList.remove("hidden");
  attachFoxBoss();
}
function hitBoss() {
  sfxHit();
  score += 300;
  renderScore();
  boss.stun = 1.6;
  boss.ring.visible = false;
  boss.phase = "idle";
  fxSlow = .6;
  fxCamShake = .25;
  $("bossPips").textContent = "●".repeat(Math.max(0, boss.hp));
  if (boss.hp <= 0) {
    boss.active = false;
    boss.ring.visible = false;
    boss.mesh.rotation.x = .9;
    boss.mesh.position.y = boss.pos.y - 6;
    $("bossWrap").classList.add("hidden");
    sfxBoss();
    score += 1000;
    renderScore();
    toast("انحنى الملك الأسود… الجسر لك يا لَزِج");
    mission = "done";
    saveAll();
    setTimeoutSafe(() => { $("wOverlay").dataset.done = "1"; openStory(ENDING, 0); }, 1400);
  }
}
function updateBoss(dt) {
  if (!boss.active || !boss.mesh) return;
  if (boss.mix) {
    const onRoof = player.pos.y > TOWER_H - 4;
    setBossClip(boss.stun > 0 ? "Walk" : boss.phase === "wind" ? "Run" : onRoof ? "Run" : "Survey");
    const ta = boss.acts && boss.acts[boss.bossClip];
    if (ta) ta.timeScale = boss.bossClip === "Run" ? (boss.stun > 0 ? 1.4 : 1.05) : .5;
    boss.mix.update(dt);
  }
  const onRoof = player.pos.y > TOWER_H - 4;
  boss.mesh.position.y = boss.pos.y + Math.sin(performance.now() * .0012) * .12;
  boss.mesh.rotation.y = dampAngle(boss.mesh.rotation.y,
    Math.atan2(-(player.pos.x - boss.pos.x), -(player.pos.z - boss.pos.z)), 1.4, dt);
  if (boss.stun > 0) { boss.stun -= dt; return; }
  if (!onRoof) { boss.phase = "idle"; boss.ring.visible = false; return; }
  boss.t -= dt;
  if (boss.phase === "idle") {
    if (boss.t <= 0) {
      boss.phase = "wind";
      boss.t = .85;
      boss.ring.visible = true;
      boss.ring.material.opacity = .16;
      boss.ring.position.set(player.pos.x, boss.pos.y + .1, player.pos.z);
    }
  } else if (boss.phase === "wind") {
    const k = 1 - Math.max(0, boss.t) / .85;
    boss.ring.material.opacity = .16 + .45 * k;
    boss.ring.scale.setScalar(1 - k * .22);
    if (boss.t <= 0) {
      boss.phase = "idle";
      boss.t = 2 + rand() * 1.2;
      const dd = Math.hypot(player.pos.x - boss.ring.position.x, player.pos.z - boss.ring.position.z);
      if (dd < 2.5 && Math.abs(player.pos.y - boss.pos.y) < 2 && invuln <= 0) {
        invuln = 1.6;
        player.vel.y = 8;
        player.vel.x += (player.pos.x - boss.pos.x) * 2.4;
        player.vel.z += (player.pos.z - boss.pos.z) * 2.4;
        fxCamShake = .5; fxSlow = .4;
        damagePlayer(2);
        toast("سحقك الملك! لا تثبته وجهًا لوجه — اضربه من بعيد");
      }
    }
  }
}

// ——————————————————— collect / progress ———————————————————
function tryCollect(dt) {
  for (const pt of parts) {
    if (pt.taken) continue;
    pt.mesh.rotation.y += dt * 2;
    pt.halo.material.opacity = .4 + .25 * Math.sin(performance.now() * .004 + pt.phase);
    const d = pt.mesh.position.distanceTo(player.pos);
    if (d < 2.1) {
      pt.taken = true;
      pt.mesh.visible = false;
      pt.halo.visible = false;
      partsGot++;
      fxCamShake = .12;
      sfxPickup();
      score += 200;
      healPlayer(1);
      renderScore();
      toast(`قطعة النول ${partsGot}/${PART_TOTAL} — ${partsStory(partsGot)}`);
      saveAll();
      if (partsGot >= 8 && mission === "find") {
        mission = "boss";
        summonBoss();
        toast("ثمانية تكفي. البرج الأوسط يغلي بالأسود — الملك الأسود صعد السطح. طِر إليه");
      }
    }
  }
}
function partsStory(n) {
  if (n === 4) return "المطاردات تحسّت بالخيط في يدك — توخَّ.";
  if (n === 8) return "يكفي. طالع البرج الأوسط.";
  if (n === 11) return "قطعة أخيرة… والباقي ملك.";
  if (n === 12) return "النول اكتمل. الآن الملك.";
  return "نسجت خيطًا آخر.";
}

// ——————————————————— input ———————————————————
const input = { forward: 0, strafe: 0, sprint: false };
const keys = { left: false, right: false, up: false, down: false };
let wantJump = false;
let drag = null;

window.addEventListener("keydown", e => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code === "F1") { e.preventDefault(); }
  if (e.code === "Escape") {
    if (mode === "play" && !document.pointerLockElement && !uiBusy) togglePause();
    return;
  }
  if (mode === "menu") {
    if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); startRun(false); }
    return;
  }
  if (e.code === "KeyP") { togglePause(); return; }
  if (e.code === "KeyV") { firstPerson = !firstPerson; creature.visible = !firstPerson;
    toast(firstPerson ? "منظور الشخص الأول 👁" : "منظور خلفي 🎥"); return; }
  if (e.code === "F3") { e.preventDefault(); SET.showFps = SET.showFps ? 0 : 1; applySettings(); saveSettings(); return; }
  if (e.code === "KeyM") { startRace(); return; }
  if (paused || uiBusy) return;
  if (e.code === "KeyW" || e.code === "ArrowUp") keys.up = true;
  if (e.code === "KeyS" || e.code === "ArrowDown") keys.down = true;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keys.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = true;
  if (!e.repeat && e.code === "Space") { e.preventDefault(); wantJump = true; }
  if (!e.repeat && e.code === "KeyE") attachWeb();
  if (!e.repeat && (e.code === "KeyF" || e.code === "KeyG")) shootWeb();
  syncKeys();
});
window.addEventListener("keyup", e => {
  if (e.code === "KeyW" || e.code === "ArrowUp") keys.up = false;
  if (e.code === "KeyS" || e.code === "ArrowDown") keys.down = false;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keys.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = false;
  if (e.code === "KeyE") releaseWeb();
  syncKeys();
});
function syncKeys() {
  input.forward = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  input.strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
}

const dom = renderer.domElement;
dom.addEventListener("pointerdown", e => {
  if (uiBusy || mouseLook) return;
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, id: e.pointerId };
  dom.setPointerCapture(e.pointerId);
});
dom.addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
  input.strafe = clamp((e.clientX - drag.x) * .03, -1.4, 1.4);
  input.forward = clamp(-(e.clientY - drag.y) * .03, -1.4, 1.4);
});
function endDrag(e) {
  if (!drag) return;
  const quick = performance.now() - drag.t < 240 && drag.moved < 12;
  drag = null;
  input.strafe = 0;
  input.forward = 0;
  if (quick && !uiBusy) shootWeb();
}
dom.addEventListener("pointerup", endDrag);
dom.addEventListener("pointercancel", endDrag);

function bindHold(id, down, up) {
  const b = $(id);
  b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); down(); });
  b.addEventListener("pointerup", () => up && up());
  b.addEventListener("pointercancel", () => up && up());
}
bindHold("wJump", () => { wantJump = true; });
bindHold("wWeb", attachWeb, releaseWeb);
bindHold("wShoot", shootWeb);
$("wPause").addEventListener("click", () => togglePause());

// ——————————————————— camera ———————————————————
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const hs = Math.hypot(player.vel.x, player.vel.z);
  if (hs > 2 && !mouseLook) camYaw = dampAngle(camYaw, player.heading, 1.8, dt);
  camDist = damp(camDist, (8.6 + Math.min(9, hs * .3) + (web.active ? 2 : 0) + camDistUser)
    * (1 - Math.abs(camPitch) * .35), 3, dt);
  fovNow = damp(fovNow, SET.fov + Math.min(22, hs * 1.2) + (player.onGround ? 0 : 6), 4, dt);
  camera.fov = fovNow;
  camera.updateProjectionMatrix();
  const lift = clamp((player.pos.y - groundAt(city, player.pos.x, player.pos.z)) * .3, 0, 8);
  if (firstPerson) {
    camPos.set(player.pos.x, player.pos.y + 1.72, player.pos.z);
    camera.position.copy(camPos);
    tmpB.set(player.pos.x + fwdVec.x * 12, player.pos.y + 1.55 + Math.sin(camPitch) * 12,
      player.pos.z + fwdVec.z * 12);
    camera.lookAt(tmpB);
    return;
  }
  tmpA.set(
    player.pos.x + Math.sin(camYaw) * camDist,
    player.pos.y + 3.1 + camDist * .32 + lift + camPitch * 10,
    player.pos.z + Math.cos(camYaw) * camDist
  );
  camPos.lerp(tmpA, 1 - Math.exp(-6 * dt));
  camera.position.copy(camPos);
  if (fxCamShake > 1e-3) {
    camera.position.x += (Math.random() - .5) * fxCamShake;
    camera.position.y += (Math.random() - .5) * fxCamShake * .8;
  }
  tmpB.copy(player.pos);
  tmpB.y += 1.5 + Math.max(0, player.vel.y * .06);
  tmpB.x += player.vel.x * .12;
  tmpB.z += player.vel.z * .12;
  camLook.lerp(tmpB, 1 - Math.exp(-10 * dt));
  camera.lookAt(camLook);
}

function fxLanded() {
  fxCamShake = Math.min(.25, speed * .02 + .05);
  releaseWeb();
  sfxLand();
  burst(player.pos.x, player.pos.y + .1, player.pos.z, 5, shellMaterial);
}

// ——————————————————— particles (goo flecks) ———————————————————
const fxGroup = new THREE.Group();
scene.add(fxGroup);
const fleckGeo = new THREE.IcosahedronGeometry(.1, 0);
const flecks = [];
function burst(x, y, z, count, material) {
  for (let i = 0; i < count; i++) {
    if (flecks.length > 120) return;
    const m = new THREE.Mesh(fleckGeo, material || shellMaterial);
    m.position.set(x, y, z);
    fxGroup.add(m);
    flecks.push({
      m,
      v: new THREE.Vector3((Math.random() - .5) * 3.2, 1.5 + Math.random() * 2.4, (Math.random() - .5) * 3.2),
      t: .55 + Math.random() * .3
    });
  }
}
function updateFlecks(dt) {
  for (let i = flecks.length - 1; i >= 0; i--) {
    const f = flecks[i];
    f.t -= dt;
    f.v.y -= 9 * dt;
    f.m.position.addScaledVector(f.v, dt);
    f.m.rotation.x += dt * 4;
    if (f.t <= 0) {
      fxGroup.remove(f.m);
      flecks.splice(i, 1);
    }
  }
}
let shootLine = null;

// ——————————————————— rain update ———————————————————
function updateRainWorld(dt) {
  const arr = rainGeo.attributes.position.array;
  const cx = player.pos.x, cy = player.pos.y, cz = player.pos.z;
  for (let i = 0; i < rainActive; i++) {
    const b = i * 6;
    let x = arr[b] + dt * 2.4;
    let y = arr[b + 1] - rainVel[i] * dt;
    let z = arr[b + 2] - dt * 3.2;
    if (y < cy - 14) y += 72;
    if (x - cx > 45) x -= 90;
    if (x - cx < -45) x += 90;
    if (z - cz > 45) z -= 90;
    if (z - cz < -45) z += 90;
    arr[b] = x; arr[b + 1] = y; arr[b + 2] = z;
    arr[b + 3] = x + .12; arr[b + 4] = y + 1.4; arr[b + 5] = z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ——————————————————— HUD / toasts / minimap ———————————————————
let toastQueue = [];
let toastCur = null;
function toast(msg) { toastQueue.push(msg); }
function updateToast(now) {
  if (!toastCur && toastQueue.length) {
    toastCur = { msg: toastQueue.shift(), until: now + 3600 };
    const el = $("wToast");
    el.textContent = toastCur.msg;
    el.style.opacity = "1";
  }
  if (toastCur && now > toastCur.until) {
    $("wToast").style.opacity = "0";
    toastCur = null;
  }
}
function updateComboHud() {
  const p = $("wCombo");
  if (combo.n >= 2) {
    p.classList.remove("hidden");
    $("wComboText").textContent = `×${combo.n}`;
  } else p.classList.add("hidden");
}
function renderBossPips() {
  $("bossPips").textContent = "●".repeat(Math.max(0, boss.hp));
}
function setTimeoutSafe(fn, ms) { setTimeout(fn, ms); }

const mm = $("minimap").getContext("2d");
const mmCanvas = $("minimap");
mmCanvas.width = mmCanvas.height = 148;
function drawMinimap() {
  const ctx = mm;
  const S = 148, sc = .55;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "#0b0f18";
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.fillStyle = "#1c2634";
  for (const b of city.buildings) {
    const dx = (b.x - player.pos.x) * sc, dz = (b.z - player.pos.z) * sc;
    if (Math.abs(dx) > 80 || Math.abs(dz) > 80) continue;
    ctx.globalAlpha = b.h > 26 ? .95 : .6;
    ctx.fillRect(dx - b.w * sc / 2, dz - b.d * sc / 2, b.w * sc, b.d * sc);
  }
  ctx.globalAlpha = 1;
  for (const pt of parts) {
    if (pt.taken) continue;
    const dx = (pt.mesh.position.x - player.pos.x) * sc;
    const dz = (pt.mesh.position.z - player.pos.z) * sc;
    const cl = Math.max(-70, Math.min(70, dx)), cz2 = Math.max(-70, Math.min(70, dz));
    ctx.fillStyle = "#ffd75e";
    ctx.fillRect(cl - 2, cz2 - 2, 4, 4);
  }
  if (race.active) {
    ctx.fillStyle = "#7dff9a";
    for (let i = race.idx; i < race.cps.length; i++) {
      const dx = (race.cps[i].x - player.pos.x) * sc, dz = (race.cps[i].z - player.pos.z) * sc;
      ctx.beginPath();
      ctx.arc(clamp(dx, -68, 68), clamp(dz, -68, 68), 3, 0, 7);
      ctx.fill();
    }
  }
  if (boss.active) {
    ctx.fillStyle = "#ff2d55";
    const dx = (boss.pos.x - player.pos.x) * sc, dz = (boss.pos.z - player.pos.z) * sc;
    ctx.beginPath();
    ctx.arc(clamp(dx, -68, 68), clamp(dz, -68, 68), 4, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = "#8fa3c4";
  for (const e of enemies) {
    if (!e.alive || !e.aggro) continue;
    const dx = (e.pos.x - player.pos.x) * sc, dz = (e.pos.z - player.pos.z) * sc;
    if (Math.abs(dx) > 72 || Math.abs(dz) > 72) continue;
    ctx.fillRect(dx - 1.5, dz - 1.5, 3, 3);
  }
  ctx.rotate(-player.heading);
  ctx.fillStyle = "#eaf2ff";
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function objectivePos() {
  if (race.active && race.cps[race.idx]) return race.cps[race.idx];
  if (mission === "boss" || mission === "done") return { x: 0, z: 0, y: TOWER_H };
  let best = null, bd = 1e9;
  for (const pt of parts) {
    if (pt.taken) continue;
    const d = (pt.mesh.position.x - player.pos.x) ** 2 + (pt.mesh.position.z - player.pos.z) ** 2;
    if (d < bd) { bd = d; best = pt.mesh.position; }
  }
  return best || { x: 0, z: 0, y: TOWER_H };
}
function updateMarker() {
  const o = objectivePos();
  const ang = Math.atan2(o.x - player.pos.x, -(o.z - player.pos.z));
  const rel = ang - (camYaw + Math.PI);
  $("wArrow").style.transform = `rotate(${rel}rad)`;
  $("wDist").textContent = `${Math.round(Math.hypot(o.x - player.pos.x, o.z - player.pos.z))}م`;
  $("wParts").textContent = `${partsGot}/${PART_TOTAL}`;
  $("wMission").textContent = race.active ? "🏁 سباق الأسطح — مِس الحلقات" :
    mission === "find" ? "اجمع قطع النول من الأسطح" :
    mission === "boss" ? "اصعد البرج الأوسط — الملك ينتظر" : "المدينة كلها لك 🕷";
}

// ——————————————————— story panels ———————————————————
let uiBusy = true;
let storyState = null;
function openStory(pages, idx) {
  storyState = { pages, idx };
  renderStory();
  $("wOverlay").classList.remove("hidden");
  uiBusy = true;
}
function renderStory() {
  const p = storyState.pages[storyState.idx];
  const last = storyState.idx >= storyState.pages.length - 1;
  $("wTitle").textContent = p[0];
  $("wText").textContent = p[1];
  $("wNext").textContent = last ? ($("wOverlay").dataset.done === "1" ? "متابعة اللعب" : "لنسج 🕷") : "التالي ▸";
  $("wBack").classList.toggle("hidden", storyState.idx === 0);
}
$("wNext").addEventListener("click", () => {
  if (storyState.idx < storyState.pages.length - 1) storyState.idx++;
  else {
    storyState = null;
    $("wOverlay").classList.add("hidden");
    uiBusy = false;
    try { localStorage.setItem("lazij-open-intro", "1"); } catch {}
    $("wOverlay").dataset.done = "0";
    onPlayResumed();
    return;
  }
  renderStory();
});
$("wBack").addEventListener("click", () => {
  if (storyState.idx > 0) { storyState.idx--; renderStory(); }
});

const INTRO = [
  ["مدينة تحت المطر", "بعد معارك الجزر، قاد أثرُ النول الكبير لَزِجَ إلى المدينة الغارقة: ناطحاتٌ لا تنام، أزقةٌ يزحف فيها جنودُ الملك الأسود، وسطحٌ لكل قصة هرب."],
  ["حكمة نَسْمة", "همست الجدة عبر خيطٍ قديم: «هذه المدينة لا تحتاج فاتحًا يا حفيدي، بل من يمرّ في سمائها. أرجل حادة، قلب ليّن… وصبرٌ في التأرجح»."],
  ["المهمة", "اثنتا عشرة قطعة من النول الكبير متناثرة على الأسطح. اجمع ثمانيًا وسيصعد الملك نفسه إلى أعلى برج. على الكمبيوتر: انقر بالماوس لقفل النظر — WASD حركة، Space قفز، E أو الزر الأيمن تأرجح، F أو الزر الأيسر شبكة، Shift جري، V المنظور، M سباق الأسطح، ESC إيقاف."]
];
const ENDING = [
  ["سقوط الملك", "عندما ارتطمت الشبكة الثالثة بصدره، ترجّح الملك الأسود من فوق البرج كجبلٍ من القار، وذاب قبل أن يلمس الأرض. غسل المطرُ نيون المدينة، ولأول مرة منذ سنين… صارت الأبراج لامعة لا مرعِبة."],
  ["مدينة بلا ملك", "جُمعت خيوطه وأُعيد النول الكبير — لا لعرشٍ، بل لطاولة. ضحكت نَسْمة: «لهذا تُصنع الجسور». والمدينة صارت لك: تأرجح حيث شئت، وحرّر ما تبقى من قطع، فالأبواب مفتوحة أبدًا."]
];

let paused = false;
function togglePause() {
  if (mode !== "play" || uiBusy) return;
  setPaused(!paused);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "play") {
    paused = true;
    $("wPause").textContent = "▶";
    $("pause").classList.remove("hidden");
  }
});

// save / restore
function saveAll() {
  try {
    localStorage.setItem("lazij-open", JSON.stringify({
      got: parts.filter(p => p.taken).length,
      flags: parts.map(p => p.taken ? 1 : 0),
      mission,
      hp, score, raceBest,
      pos: [player.pos.x, player.pos.y, player.pos.z],
      v: 2
    }));
  } catch {}
}
function loadAll() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem("lazij-open") || "null"); } catch {}
  if (!data || (data.v !== 1 && data.v !== 2)) return false;
  for (let i = 0; i < Math.min(parts.length, (data.flags || []).length); i++) {
    if (data.flags[i]) {
      parts[i].taken = true;
      parts[i].mesh.visible = false;
      parts[i].halo.visible = false;
    }
  }
  partsGot = data.got || parts.filter(p => p.taken).length;
  mission = data.mission || "find";
  if (data.pos) player.pos.set(data.pos[0], data.pos[1], data.pos[2]);
  hp = data.hp ?? hp; score = data.score || 0; raceBest = data.raceBest || 0;
  if (mission === "boss") summonBoss();
  return true;
}
let importedSpider = null, spiderMixer = null;
let robotTmpl = null, robotClips = {}, bossTmpl = null, bossClips = {}, skyline = null;
const resumed = loadAll();

// ——————————————————— main loop ———————————————————
let lastTime = performance.now();
let frame = 0;
let uiClock = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = Math.min((now - lastTime) / 1000, .04);
  lastTime = now;
  frame++;
  fpsTick(rawDt);
  if (mode === "menu") {
    menuFlyby(rawDt);
    renderFrame();
    return;
  }
  if (paused || uiBusy) {
    renderOnly(now);
    return;
  }
  pollGamepad();
  updateRace(rawDt);
  scoreShown = damp(scoreShown, score, 5, rawDt);
  $("wScore").textContent = Math.round(scoreShown);
  const dt = rawDt * fxSlow;
  stepPlayer(dt);
  if (invuln <= 0) updateEnemies(dt);
  if (boss.active) updateBoss(dt);
  tryCollect(dt);
  updateFx(dt);
  updateWebLine();
  updateRainWorld(rawDt);

  // feed the creature rig
  creature.position.copy(player.pos);
  creature.rotation.y = player.heading;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  speed = hs;
  sideSpeed = player.vel.x * rightVec.x + player.vel.z * rightVec.z;
  state = (!player.onGround && player.vel.y < -4) ? "falling" : "running";
  updateCreature(dt);
  if (spiderMixer) spiderMixer.update(Math.hypot(player.vel.x, player.vel.z) * dt * .08);

  // suit pulses with proximity danger
  let danger = false;
  for (const e of enemies) {
    if (e.alive && e.aggro) { danger = true; break; }
  }
  if (!danger && player.onGround) {
    healClock += dt;
    if (healClock > 8 && hp < 5) { healClock = 0; healPlayer(1); }
  } else healClock = 0;
  fxSense = Math.max(danger ? 1 : 0, fxSense - dt * 2);
  eyeMaterial.emissiveIntensity = 2.4 + fxSense * 1.6;
  vignetteEl = vignetteEl || $("senseVignette");
  vignetteEl.style.opacity = (fxSense * (.28 + .22 * Math.sin(now * .02))).toFixed(3);
  creature.scale.setScalar(invuln > 0 ? 1 + Math.sin(now * .03) * .03 : 1);

  updateCamera(dt);
  updateToast(now);
  if (frame % 2 === 0) drawMinimap();
  uiClock += rawDt;
  if (uiClock > .25) { uiClock = 0; updateMarker(); }

  renderFrame();
}
let fxSense = 0;
let vignetteEl = null;
function renderOnly(now) {
  updateCamera(.016);
  updateToast(now);
  renderFrame();
}

// ═══════════════ internet model imports: rigged glTF (robots, dragon, city) ═══════════════
const MODEL_SOURCES = {
  spider: "__MODEL_SPIDER__",
  robot: "__MODEL_ROBOT__",
  boss: "__MODEL_BOSS__",
  tokyo: "__MODEL_TOKYO__"
};
const importReport = { spider: creature.userData.boneCount || 0, robot: 0, dragon: 0, tokyo: 0 };

const hasEXT = typeof EXT !== "undefined" && EXT.GLTFLoader;
const gltfLoader = hasEXT ? new EXT.GLTFLoader() : null;
const skelClone = hasEXT ? EXT.SkeletonUtils.clone : null;

function loadGLB(url, ms = 22000, draco = false) {
  return new Promise((res, rej) => {
    if (!gltfLoader) return rej(new Error("no gltf loader"));
    let loader = gltfLoader;
    if (draco && EXT.DRACOLoader) {
      loader = new EXT.GLTFLoader();
      const dc = new EXT.DRACOLoader();
      dc.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/");
      loader.setDRACOLoader(dc);
    }
    let done = false;
    const fl = new THREE.FileLoader();
    fl.setResponseType("arraybuffer");
    const t = setTimeoutSafe(() => { if (!done) { done = true; rej(new Error("timeout")); } }, ms);
    fl.load(url, buf => {
      if (done) return; done = true;
      clearTimeout(t);
      try { loader.parse(buf, "", g => res(g), e => rej(e)); } catch (e) { rej(e); }
    }, undefined, e => { if (!done) { done = true; clearTimeout(t); rej(e); } });
  });
}
function countBones(obj) { let n = 0; obj.traverse(o => { if (o.isBone) n++; }); return n; }
function tintSkins(root, dark) {
  root.traverse(o => {
    if (o.isMesh && o.material) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (dark) { m.color && m.color.multiplyScalar(.32).offsetHSL(0, 0, .02); }
        m.metalness = Math.max(m.metalness || 0, .62);
        m.roughness = Math.min(m.roughness ?? 1, .48);
        m.envMapIntensity = Math.max(m.envMapIntensity || 0, 1.25);
        m.fog = true;
      }
    }
  });
}
function attachRobot(e) {
  if (!robotTmpl || !skelClone) return;
  try {
    const clone = skelClone(robotTmpl);
    tintSkins(clone, true);
    const wrap = new THREE.Group();
    clone.rotation.y = Math.PI;
    clone.scale.setScalar(.92);
    wrap.add(clone);
    if (e.mesh) { scene.remove(e.mesh); }
    e.mesh = wrap;
    scene.add(wrap);
    e.mix = new THREE.AnimationMixer(clone);
    e.acts = {};
    for (const name of ["Idle", "Walking", "Running"]) {
      if (robotClips[name]) { const a = e.mix.clipAction(robotClips[name]); a.enabled = false; a.setLoop(THREE.LoopRepeat, Infinity); e.acts[name] = a; }
    }
    if (e.acts.Idle) { e.acts.Idle.enabled = true; e.acts.Idle.play(); e.robotClip = "Idle"; }
  } catch (err) { console.warn("robot attach failed → procedural stays", err); }
}
function setRobotClip(e, want) {
  if (!e.acts || !e.acts[want] || e.robotClip === want) return;
  const prev = e.acts[e.robotClip];
  const next = e.acts[want];
  next.enabled = true;
  if (prev) { prev.enabled = true; prev.fadeOut(.22); }
  next.reset().fadeIn(.22).play();
  e.robotClip = want;
}
function attachFoxBoss() {
  if (!bossTmpl || !boss.mesh) return;
  try {
    for (const c of boss.mesh.children) c.visible = false;
    const d = skelClone ? skelClone(bossTmpl) : bossTmpl;
    d.traverse(o => {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          m.color && m.color.multiplyScalar(.14);
          m.emissive && m.emissive.setHex(0x3a0409);
          m.emissiveIntensity = .85;
          m.roughness = .38; m.metalness = .55; m.envMapIntensity = 1.4; m.fog = true;
        }
      }
    });
    const box = new THREE.Box3().setFromObject(d);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const sc = 9.6 / Math.max(sz.x, sz.y, .01);   // towering night-fox king
    d.scale.setScalar(sc);
    d.position.y = -box.min.y * sc + .2;
    d.rotation.y = Math.PI;
    boss.mesh.add(d);
    boss.pet = d;
    boss.mix = new THREE.AnimationMixer(d);
    boss.acts = {};
    for (const name of Object.keys(bossClips)) {
      const a = boss.mix.clipAction(bossClips[name]);
      a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = false;
      boss.acts[name] = a;
    }
    if (boss.acts.Survey) { boss.acts.Survey.enabled = true; boss.acts.Survey.timeScale = .5; boss.acts.Survey.play(); boss.bossClip = "Survey"; }
  } catch (err) { console.warn("fox attach failed → procedural king stays", err); }
}
function setBossClip(name) {
  if (!boss.acts || !boss.acts[name] || boss.bossClip === name) return;
  const prev = boss.acts[boss.bossClip];
  const next = boss.acts[name];
  next.enabled = true;
  if (prev) { prev.enabled = true; prev.fadeOut(.3); }
  next.reset().fadeIn(.3).play();
  boss.bossClip = name;
}
async function importModels() {
  if (!hasEXT) { toast("وضع أوفلاين — النماذج الإجرائية تكفي 🕷"); return; }
  try {
    const g = await loadGLB(MODEL_SOURCES.spider, 30000);
    const root = g.scene;
    let skins = 0;
    root.traverse(o => { if (o.isSkinnedMesh) skins++; });
    if (!skins || !countBones(root)) throw new Error("Spider has no skin/bone binding");
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const sc = 3.8 / Math.max(size.x, size.z);
    const wrap = new THREE.Group();
    root.scale.setScalar(sc);
    root.position.set(-center.x * sc, -box.min.y * sc - .75, -center.z * sc);
    root.traverse(o => { if (o.isMesh) { o.material = shellMaterial; o.frustumCulled = false; } });
    wrap.add(root);
    for (const child of creature.children) child.visible = false;
    creature.add(wrap);
    importedSpider = wrap;
    spiderMixer = new THREE.AnimationMixer(root);
    for (const clip of g.animations.filter(c => c.name.startsWith("Armature"))) spiderMixer.clipAction(clip).play();
    importReport.spider = countBones(root);
    toast(`عنكبوت آلي مستورد: ${importReport.spider} عظمة، ${skins} مجسمات مربوطة بالعظام`);
  } catch (err) { console.warn("spider import:", err.message); }
  try {
    const g = await loadGLB(MODEL_SOURCES.robot, 16000);
    robotTmpl = g.scene;
    g.animations.forEach(c => robotClips[c.name] = c);
    importReport.robot = countBones(robotTmpl);
    for (const e of enemies) attachRobot(e);
    toast(`🦴 استوردت الروبوتات من الإنترنت — كل صياد له ${importReport.robot} عظمة تتحرك`);
  } catch (err) { console.warn("robot import:", err.message); }
  try {
    const g = await loadGLB(MODEL_SOURCES.boss, 20000);
    bossTmpl = g.scene;
    g.animations.forEach(c => bossClips[c.name] = c);
    importReport.dragon = countBones(bossTmpl);
    if (boss.active) attachFoxBoss();
    toast(`🦊 الملك الأسود ثعلب الظلام مستورد — ${importReport.dragon} عظمة ويجري فوق البرج`);
  } catch (err) { console.warn("boss import:", err.message); }
  try {
    const g = await loadGLB(MODEL_SOURCES.tokyo, 40000, false);
    const c = g.scene;
    for (let i = c.children.length - 1; i >= 0; i--) {
      const ch = c.children[i];
      if (ch.isCamera || ch.isLight) c.remove(ch);
    }
    c.traverse(o => { if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.fog = false; }); });
    const box = new THREE.Box3().setFromObject(c);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const sc = 115 / Math.max(sz.x, sz.z, .01);
    c.scale.setScalar(sc);
    c.position.set(370, -box.min.y * sc - .5, -330);
    c.rotation.y = .61;
    scene.add(c);
    skyline = c;
    importReport.tokyo = Math.round(sz.y * sc);
    c.visible = SET.quality !== "low";
    toast(`🏙 استوردت مدينة كاملة — ناطحات حقيقية تحيط بالأفق (${importReport.tokyo}م ارتفاعًا)`);
  } catch (err) { console.warn("tokyo import:", err.message); }
  toast(`🦴 تقرير العظام: عنكبوتك ${importReport.spider} • صيادون ${importReport.robot} • زعيم ${importReport.dragon}`);
}

// ═══════════════ PC GAME LAYER — states, menu, settings, audio, health, races, gamepad ═══════════════

// ————— game state machine —————
let mode = "menu"; // menu | play
let firstPerson = false;
let mouseLook = false;
let camPitch = 0;
let camDistUser = 0;
let rainActive = RAIN_COUNT;
let introSeen = false;
try { introSeen = localStorage.getItem("lazij-open-intro") === "1"; } catch {}
const touchDevice = matchMedia("(pointer: coarse)").matches;

// ————— settings —————
const SET = { quality: "high", sens: 1, fov: 66, sfx: .8, mus: .5, showFps: 0 };
try { Object.assign(SET, JSON.parse(localStorage.getItem("lazij-open-settings") || "{}")); } catch {}
function saveSettings() {
  try { localStorage.setItem("lazij-open-settings", JSON.stringify(SET)); } catch {}
}
function applySettings() {
  const pr = SET.quality === "low" ? .7 : SET.quality === "med" ? 1 : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if (composer) {
    if (composer.setPixelRatio) composer.setPixelRatio(pr);
    composer.setSize(innerWidth, innerHeight);
  }
  if (bloomPass) {
    bloomOn = SET.quality !== "low";
    bloomPass.strength = SET.quality === "high" ? .72 : .5;
  }
  scene.fog.density = SET.quality === "low" ? .0115 : .0082;
  rainActive = SET.quality === "low" ? 130 : SET.quality === "med" ? 280 : RAIN_COUNT;
  rainGeo.setDrawRange(0, rainActive * 2);
  $("fpsBox").classList.toggle("hidden", !SET.showFps);
  if (skyline) skyline.visible = SET.quality !== "low";
  $("wActions").style.opacity = touchDevice ? "1" : ".55";
  if (sfxG) sfxG.gain.value = SET.sfx;
  if (musG) musG.gain.value = SET.mus;
}

// ————— audio: fully procedural (no files) —————
let actx = null, masterG = null, sfxG = null, musG = null, noiseBuf = null;
let ambStarted = false, chordI = 0, padTimer = null;
function initAudio() {
  if (actx) { if (actx.state === "suspended") actx.resume().catch(() => {}); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterG = actx.createGain(); masterG.gain.value = .9; masterG.connect(actx.destination);
    sfxG = actx.createGain(); sfxG.gain.value = SET.sfx; sfxG.connect(masterG);
    musG = actx.createGain(); musG.gain.value = SET.mus; musG.connect(masterG);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ambientStart();
  } catch { actx = null; }
}
function tone(f0, f1, dur, type, vol, dest) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || "sine";
  const t = actx.currentTime;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(.015, dur * .2));
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(dest || sfxG);
  o.start(t); o.stop(t + dur + .05);
}
function noiseHit(dur, f0, f1, q, vol) {
  if (!actx) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const flt = actx.createBiquadFilter();
  flt.type = "bandpass"; flt.Q.value = q || 1;
  const t = actx.currentTime;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .012);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(sfxG);
  src.start(t); src.stop(t + dur + .05);
}
function sfxJump() { tone(280, 520, .16, "sine", .1); }
function sfxLand() { noiseHit(.13, 320, 70, 1.4, .26); tone(92, 54, .16, "sine", .22); }
function sfxZip() { noiseHit(.2, 900, 3400, 2.2, .14); }
function sfxReel() { tone(620, 380, .12, "triangle", .08); }
function sfxShot() { tone(920, 220, .13, "square", .09); }
function sfxHit() { noiseHit(.1, 1200, 180, 1, .3); tone(150, 62, .22, "sine", .32); }
function sfxKill() { tone(520, 1040, .16, "triangle", .13); tone(880, 1580, .2, "sine", .07); }
function sfxPickup() { tone(660, 660, .1, "sine", .12); setTimeoutSafe(() => tone(990, 990, .1, "sine", .12), 90); setTimeoutSafe(() => tone(1320, 1320, .16, "sine", .12), 180); }
function sfxBoss() { tone(64, 40, 1.4, "sawtooth", .22); }
function sfxDown() { tone(320, 70, .8, "sawtooth", .2); }
function sfxUI() { tone(740, 740, .05, "sine", .05); }
function sfxRing() { tone(1240, 1660, .14, "sine", .12); }
function ambientStart() {
  if (!actx || ambStarted) return;
  ambStarted = true;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = actx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 760;
  const g = actx.createGain(); g.gain.value = .045;
  src.connect(f); f.connect(g); g.connect(musG);
  src.start();
  const CH = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
  padTimer = setInterval(() => {
    if (!actx || actx.state !== "running") return;
    const ch = CH[chordI++ % 4];
    for (const fr of ch) {
      const o = actx.createOscillator(), g2 = actx.createGain();
      o.type = "sine"; o.frequency.value = fr;
      const t = actx.currentTime;
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(.026, t + 1.6);
      g2.gain.linearRampToValueAtTime(.0001, t + 5);
      o.connect(g2); g2.connect(musG);
      o.start(t); o.stop(t + 5.2);
    }
  }, 5200);
}

// ————— health / score —————
function renderHp() { $("wHp").textContent = "❤".repeat(hp) + "🖤".repeat(5 - hp); }
function renderScore() { $("wScore").textContent = Math.round(score); }
function healPlayer(n) { hp = Math.min(5, hp + n); renderHp(); }
function knockDown() {
  releaseWeb();
  let best = city.lots[0], bd = 1e9;
  for (const l of city.lots) {
    const d = (l.x - player.pos.x) ** 2 + (l.z - player.pos.z) ** 2;
    if (d < bd) { bd = d; best = l; }
  }
  player.pos.set(best.x, groundAt(city, best.x, best.z) + .2, best.z);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  hp = 3; invuln = 3;
  combo.n = 0; combo.clock = 0; updateComboHud();
  fxCamShake = .55; fxSlow = .35;
  renderHp(); saveAll();
  sfxDown();
  toast("سقط لَزِج… نهض في الشارع — البقاء في الأمان يشفيك تدريجيًا");
}
function damagePlayer(n) {
  hp = Math.max(0, hp - n);
  renderHp();
  sfxHit();
  saveAll();
  if (hp <= 0) knockDown();
}

// ————— rooftop races (side missions) —————
const race = { active: false, cps: [], idx: 0, t: 0, rings: null };
function ensureRaceRings() {
  if (race.rings) return;
  race.rings = [];
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, .13, 8, 26).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#7dff9a", transparent: true, opacity: .95, depthTest: true })
    );
    r.visible = false;
    scene.add(r);
    race.rings.push(r);
  }
}
function hideRaceRings() { if (race.rings) for (const r of race.rings) r.visible = false; }
function startRace() {
  if (mode !== "play" || uiBusy || paused) return;
  if (race.active) { abortRace("خرجت من السباق"); return; }
  const pool = city.buildings.filter(b => !b.tower && b.h > 10 &&
    Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 120);
  if (pool.length < 3) { toast("منطقتك فيها أسطح قليلة — انزح لوسط المدينة ثم M"); return; }
  const cps = [];
  let cur = { x: player.pos.x, z: player.pos.z };
  while (pool.length && cps.length < 5) {
    pool.sort((a, b) =>
      ((a.x - cur.x) ** 2 + (a.z - cur.z) ** 2) - ((b.x - cur.x) ** 2 + (b.z - cur.z) ** 2));
    cur = pool.shift();
    cps.push(cur);
  }
  ensureRaceRings();
  race.cps = cps; race.idx = 0; race.t = 52; race.active = true;
  for (let i = 0; i < race.rings.length; i++) {
    const r = race.rings[i];
    if (i < cps.length) { r.visible = true; r.position.set(cps[i].x, cps[i].h + 1.4, cps[i].z); }
    else r.visible = false;
  }
  $("raceHud").classList.remove("hidden");
  toast("🏁 سباق الأسطح — مِس 5 حلقات خضر قبل انتهاء الوقت؛ كل حلقة تمنحك 11 ثانية");
  sfxUI();
}
function updateRace(dt) {
  if (!race.active) return;
  race.t -= dt;
  const b = race.cps[race.idx];
  if (b) {
    const d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
    if (d < 3.6 && player.pos.y > b.h - 1.3) {
      race.idx++;
      race.t += 11;
      score += 100;
      renderScore();
      sfxRing();
      burst(b.x, b.h + 1.8, b.z, 10, shellMaterial);
      if (race.rings[race.idx - 1]) race.rings[race.idx - 1].visible = false;
      toast(`حلقة ${race.idx}/${race.cps.length} ✓ (+11ث)`);
      if (race.idx >= race.cps.length) {
        race.active = false;
        $("raceHud").classList.add("hidden");
        hideRaceRings();
        const spent = (52 + 11 * (race.cps.length - 1)) - race.t;
        if (!raceBest || spent < raceBest) raceBest = spent;
        score += 250;
        renderScore();
        sfxPickup();
        toast(`🏆 أنهيت السباق في ${spent.toFixed(1)} ثانية! +250 نقطة${raceBest === spent ? " — رقمك الجديد!" : ""}`);
        saveAll();
      }
    }
  }
  for (let i = race.idx; i < race.rings.length; i++) {
    const r = race.rings[i];
    if (r.visible) { r.rotation.y += dt * 1.4; r.position.y += Math.sin(performance.now() * .004 + i) * .004; }
  }
  $("raceTxt").textContent = `حلقة ${race.idx}/${race.cps.length} • ${Math.max(0, race.t).toFixed(1)}ث`;
  if (race.t <= 0) abortRace("انتهى الوقت — تالي أحسن 🕷");
}
function abortRace(msg) {
  race.active = false;
  $("raceHud").classList.add("hidden");
  hideRaceRings();
  toast(msg);
}

// ————— gamepad —————
const gpPrev = {};
function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && gps[0];
  if (!gp) return;
  const ax = v => Math.abs(v) < .2 ? 0 : v;
  const lmag = Math.abs(gp.axes[0] || 0) + Math.abs(gp.axes[1] || 0);
  if (lmag > .2) {
    input.forward = clamp(-ax(gp.axes[1] || 0), -1, 1);
    input.strafe = clamp(ax(gp.axes[0] || 0), -1, 1);
  }
  input.sprint = !!(gp.buttons[10] && gp.buttons[10].pressed);
  const on = i => gp.buttons[i] && gp.buttons[i].pressed;
  const edge = i => { const v = on(i); const was = !!gpPrev[i]; gpPrev[i] = v; return v && !was; };
  if (edge(0)) wantJump = true;
  if (edge(2)) shootWeb();
  if (edge(9)) togglePause();
  if (on(7) || on(6)) { if (!gpPrev.web) { attachWeb(); gpPrev.web = true; } }
  else if (gpPrev.web) { releaseWeb(); gpPrev.web = false; }
  const rx = ax(gp.axes[2] || 0);
  if (rx) camYaw -= rx * 2.2 * .016;
}

// ————— fps meter —————
let fpsEma = 60;
function fpsTick(rawDt) {
  if (rawDt > 0) fpsEma = fpsEma * .92 + (1 / Math.max(rawDt, .0001)) * .08;
  if (SET.showFps && frame % 15 === 0)
    $("fpsBox").textContent = `${fpsEma.toFixed(0)} FPS • ${city.buildings.length} مبنى • ${enemies.length} صيادًا`;
}

// ————— pointer lock mouse-look —————
function lockPointer() {
  if (touchDevice || mode !== "play") return;
  try { const pr = dom.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch {}
}
dom.addEventListener("click", () => {
  if (mode === "play" && !paused && !uiBusy && !document.pointerLockElement) lockPointer();
});
document.addEventListener("pointerlockchange", () => {
  mouseLook = document.pointerLockElement === dom;
  $("lockHint").classList.add("hidden");
  if (!mouseLook && mode === "play" && !uiBusy) setPaused(true);
});
document.addEventListener("mousemove", e => {
  if (!mouseLook) return;
  const s = SET.sens * .0026;
  camYaw -= e.movementX * s;
  camPitch = clamp(camPitch - e.movementY * s, -.6, .95);
});
dom.addEventListener("mousedown", e => {
  if (!mouseLook || paused || uiBusy) return;
  if (e.button === 0) shootWeb();
  if (e.button === 2) attachWeb();
});
window.addEventListener("mouseup", e => { if (e.button === 2 && mouseLook) releaseWeb(); });
dom.addEventListener("contextmenu", e => e.preventDefault());
dom.addEventListener("wheel", e => {
  if (mode === "play") camDistUser = clamp(camDistUser + (e.deltaY > 0 ? .8 : -.8), -3.2, 6.5);
}, { passive: true });

// ————— menu / pause flow —————
function menuFlyby(dt) {
  flyT += dt * .14;
  const r = 165 + Math.sin(flyT * .7) * 34;
  camera.position.set(Math.sin(flyT) * r, 58 + Math.sin(flyT * .45) * 20, Math.cos(flyT) * r);
  camera.fov = damp(camera.fov, 68, 2, dt);
  camera.updateProjectionMatrix();
  camera.lookAt(0, TOWER_H * .5 + 4, 0);
  updateRainWorld(dt);
  updateToast(performance.now());
}
let flyT = 0.9;
function showMenuPage(id) {
  for (const pg of ["menuMain", "menuSettings", "menuControls", "menuStory"])
    $(pg).classList.toggle("hidden", pg !== id);
  $("pause").classList.add("hidden");
  $("menu").classList.remove("hidden");
}
function setPaused(v) {
  if (mode !== "play") return;
  paused = v;
  $("wPause").textContent = paused ? "▶" : "Ⅱ";
  $("pause").classList.toggle("hidden", !paused);
  if (paused) {
    try { document.exitPointerLock(); } catch {}
    $("pauseStats").textContent =
      `القطع ${partsGot}/${PART_TOTAL} • النقاط ${Math.round(score)} • أفضل سباق ${raceBest ? raceBest.toFixed(1) + "ث" : "—"} • حيوية ${hp}/5`;
    saveAll();
  } else if (race.active) $("raceHud").classList.remove("hidden");
}
function onPlayResumed() {
  ambientStart();
  if (!touchDevice) lockPointer();
  if (!touchDevice) {
    $("lockHint").classList.remove("hidden");
    setTimeoutSafe(() => $("lockHint").classList.add("hidden"), 5200);
  }
}
function resetRun() {
  for (let i = 0; i < parts.length; i++) {
    parts[i].taken = false;
    parts[i].mesh.visible = true;
    parts[i].halo.visible = true;
  }
  partsGot = 0;
  mission = "find";
  hp = 5; score = 0; scoreShown = 0;
  renderHp(); renderScore();
  player.pos.set(46, 0, 120);
  player.pos.y = groundAt(city, player.pos.x, player.pos.z);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  firstPerson = false; creature.visible = true;
  camPitch = 0; camYaw = .3626;
  if (boss.active) { boss.active = false; boss.ring.visible = false; $("bossWrap").classList.add("hidden"); }
  if (race.active) abortRace("—");
  try { localStorage.removeItem("lazij-open"); } catch {}
}
function startRun(fresh) {
  initAudio();
  $("wPause").classList.remove("hidden");
  if (fresh) resetRun();
  mode = "play";
  $("menu").classList.add("hidden");
  $("pause").classList.add("hidden");
  saveAll();
  openStory(INTRO, 0);
}
function quitToTitle() {
  saveAll();
  mode = "menu";
  paused = false;
  uiBusy = true;
  $("pause").classList.add("hidden");
  $("wPause").textContent = "Ⅱ";
  try { document.exitPointerLock(); } catch {}
  $("mContinue").disabled = false;
  showMenuPage("menuMain");
}
$("mNew").onclick = () => startRun(true);
$("mContinue").onclick = () => startRun(false);
$("mSettings").onclick = () => showMenuPage("menuSettings");
$("mControls").onclick = () => showMenuPage("menuControls");
$("mStoryPage").onclick = () => {
  const box = $("storyPages");
  box.innerHTML = "";
  for (const [t, txt] of INTRO.concat(ENDING)) {
    const h = document.createElement("div");
    h.style.cssText = "color:#ffd75e;font-weight:900;margin-top:10px";
    h.textContent = t;
    const p2 = document.createElement("div");
    p2.textContent = txt;
    box.appendChild(h); box.appendChild(p2);
  }
  showMenuPage("menuStory");
};
$("setBack").onclick = () => {
  if (mode === "play") { $("menu").classList.add("hidden"); setPaused(true); }
  else showMenuPage("menuMain");
};
$("ctrlBack").onclick = () => $("setBack").onclick();
$("storyBack").onclick = () => showMenuPage("menuMain");
$("pResume").onclick = () => { setPaused(false); lockPointer(); };
$("pSettings").onclick = () => { $("pause").classList.add("hidden"); showMenuPage("menuSettings"); };
$("pControls").onclick = () => { $("pause").classList.add("hidden"); showMenuPage("menuControls"); };
$("pSave").onclick = () => { saveAll(); toast("حُفظت المدينة ✓"); };
$("pFull").onclick = () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else { const pr = document.documentElement.requestFullscreen(); if (pr && pr.catch) pr.catch(() => {}); }
  } catch {}
};
$("pQuit").onclick = () => quitToTitle();
$("setQuality").onchange = e => { SET.quality = e.target.value; applySettings(); saveSettings(); };
$("setSens").oninput = e => { SET.sens = +e.target.value; saveSettings(); };
$("setFov").oninput = e => { SET.fov = +e.target.value; saveSettings(); };
$("setSfx").oninput = e => { SET.sfx = +e.target.value; if (sfxG) sfxG.gain.value = SET.sfx; saveSettings(); };
$("setMus").oninput = e => { SET.mus = +e.target.value; if (musG) musG.gain.value = SET.mus; saveSettings(); };
$("setFps").onchange = e => { SET.showFps = +e.target.value; applySettings(); saveSettings(); };
document.querySelectorAll(".mBtn, .primary, .secondary").forEach(b =>
  b.addEventListener("click", () => { initAudio(); sfxUI(); }));

// ————— boot —————
$("setQuality").value = SET.quality;
$("setSens").value = SET.sens;
$("setFov").value = SET.fov;
$("setSfx").value = SET.sfx;
$("setMus").value = SET.mus;
$("setFps").value = String(SET.showFps);
applySettings();
renderHp(); renderScore();
$("loading").classList.add("hidden");
$("mContinue").disabled = !resumed;
$("wPause").classList.add("hidden");
document.addEventListener("pointerdown", () => { if (mode === "play") initAudio(); }, { once: true });
requestAnimationFrame(animate);
importModels();

window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
