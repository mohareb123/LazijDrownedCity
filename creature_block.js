const creature = new THREE.Group();
scene.add(creature);

// A hard, sharp spider creature wearing a living Symbiote skin: wet black
// oil with crawling white veins and an iridescent sheen — one material for
// the whole creature; the legs keep their fixed, sharp spider gait.
// Two synchronized canvases: one for the wet albedo, one pure glow map, so
// the veins emit light and stay visible even in shadow.
const VEIN_SIZE = 512;
const veinCanvas = document.createElement("canvas");
const veinGlowCanvas = document.createElement("canvas");
veinCanvas.width = veinCanvas.height = veinGlowCanvas.width = veinGlowCanvas.height = VEIN_SIZE;
const vc = veinCanvas.getContext("2d");
const gc = veinGlowCanvas.getContext("2d");
vc.fillStyle = "#050810";
vc.fillRect(0, 0, VEIN_SIZE, VEIN_SIZE);
gc.fillStyle = "#000000";
gc.fillRect(0, 0, VEIN_SIZE, VEIN_SIZE);
for (let i = 0; i < 34; i++) {
  const r = VEIN_SIZE / 256;
  const blob = vc.createRadialGradient(
    Math.random() * VEIN_SIZE, Math.random() * VEIN_SIZE, 2 * r,
    Math.random() * VEIN_SIZE, Math.random() * VEIN_SIZE, (30 + Math.random() * 60) * r
  );
  blob.addColorStop(0, "rgba(26,34,58,.6)");
  blob.addColorStop(1, "rgba(4,6,11,0)");
  vc.fillStyle = blob;
  vc.fillRect(0, 0, VEIN_SIZE, VEIN_SIZE);
}
vc.lineCap = gc.lineCap = "round";
for (let i = 0; i < 44; i++) {
  const pts = [];
  let x = Math.random() * VEIN_SIZE;
  let y = Math.random() * VEIN_SIZE;
  let a = Math.random() * 6.28;
  pts.push([x, y]);
  for (let st = 0; st < 7; st++) {
    a += (Math.random() - .5) * 1.4;
    x += Math.cos(a) * (20 + Math.random() * 48);
    y += Math.sin(a) * (20 + Math.random() * 48);
    pts.push([x, y]);
  }
  const w = 2.6 + Math.random() * 3.4;
  const draw = (ctx, style, width) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let q = 1; q < pts.length; q++) ctx.lineTo(pts[q][0], pts[q][1]);
    ctx.stroke();
  };
  // albedo: bright, thick veins on the black oil
  draw(vc, `rgba(232,240,255,${.6 + Math.random() * .4})`, w);
  // glow: wide soft halo + hot core, so veins visibly emit
  draw(gc, "rgba(150,185,255,.5)", w * 2.4);
  draw(gc, "rgba(240,248,255,.95)", w * .8);
}
const veinTexture = new THREE.CanvasTexture(veinCanvas);
veinTexture.wrapS = veinTexture.wrapT = THREE.RepeatWrapping;
veinTexture.repeat.set(1.6, 1.6);
veinTexture.colorSpace = THREE.SRGBColorSpace;
const veinGlowTexture = new THREE.CanvasTexture(veinGlowCanvas);
veinGlowTexture.wrapS = veinGlowTexture.wrapT = THREE.RepeatWrapping;
veinGlowTexture.repeat.set(1.6, 1.6);
veinGlowTexture.colorSpace = THREE.SRGBColorSpace;
let veinTime = 0;

const shellMaterial = new THREE.MeshPhysicalMaterial({
  map: veinTexture,
  emissive: "#b9d0ff",
  emissiveMap: veinGlowTexture,
  emissiveIntensity: 2.2,
  roughness: .12,
  metalness: .34,
  clearcoat: 1,
  clearcoatRoughness: .04,
  iridescence: .9,
  iridescenceIOR: 1.5,
  iridescenceThicknessRange: [140, 520],
  envMapIntensity: 2.2,
  flatShading: true
});

// One living material for everything metallic: the veins sell the illusion.
const tipMaterial = shellMaterial;

const eyeMaterial = new THREE.MeshStandardMaterial({
  color: "#f2f6ff",
  emissive: "#dce6ff",
  emissiveIntensity: 2.4,
  roughness: .2
});

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpHip = new THREE.Vector3();
const tmpFoot = new THREE.Vector3();
const kneePos = new THREE.Vector3();

function hardShell(geometry, material = shellMaterial) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Angular tapered shaft growing along +Y from the origin.
function shaft(length, rBase, rTip) {
  const geometry = new THREE.CylinderGeometry(rTip, rBase, length, 5, 1);
  geometry.translate(0, length / 2, 0);
  return hardShell(geometry);
}

// Long sharp spike growing along +Y from the origin.
function needle(length, radius, material = tipMaterial) {
  const geometry = new THREE.ConeGeometry(radius, length, 5);
  geometry.translate(0, length / 2, 0);
  return hardShell(geometry, material);
}

function aimSegment(group, from, to) {
  group.position.copy(from);
  tmpA.subVectors(to, from);
  const length = tmpA.length();
  if (length > 1e-4) {
    tmpA.divideScalar(length);
    group.quaternion.setFromUnitVectors(UP, tmpA);
  }
}

// Two-bone IK, knee bent up and outward like a spider's.
function solveKnee(hip, foot, side, l1, l2) {
  tmpB.subVectors(foot, hip);
  let d = tmpB.length();
  if (d < 1e-3) {
    tmpB.set(0, -1, 0);
    d = 1e-3;
  }
  tmpB.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + .1, (l1 + l2) * .985);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.acos(cosA);
  tmpA.set(side * .85, 1, .1).normalize();
  tmpA.addScaledVector(tmpB, -tmpA.dot(tmpB));
  if (tmpA.lengthSq() < 1e-6) tmpA.set(side, 0, 0);
  tmpA.normalize();
  kneePos.copy(hip)
    .addScaledVector(tmpB, Math.cos(a) * l1)
    .addScaledVector(tmpA, Math.sin(a) * l1);
}

const body = new THREE.Group();
creature.add(body);

const abdomen = hardShell(new THREE.OctahedronGeometry(.62, 0));
abdomen.scale.set(.95, .85, 1.38);
abdomen.position.set(0, .68, .3);
body.add(abdomen);

const thorax = hardShell(new THREE.OctahedronGeometry(.4, 0));
thorax.scale.set(.92, .78, 1.12);
thorax.position.set(0, .56, -.35);
body.add(thorax);

const head = hardShell(new THREE.OctahedronGeometry(.26, 0));
head.scale.set(.85, .62, 1.15);
head.position.set(0, .5, -.75);
body.add(head);

function bodySpike(x, y, z, dx, dy, dz, length, radius) {
  const spike = needle(length, radius, shellMaterial);
  spike.position.set(x, y, z);
  spike.quaternion.setFromUnitVectors(
    UP, new THREE.Vector3(dx, dy, dz).normalize()
  );
  body.add(spike);
}

// Crown of sharp spikes along the back.
bodySpike(0, 1, 0, 0, 1, -.4, .58, .095);
bodySpike(0, .95, .4, 0, .85, .55, .48, .085);
bodySpike(.26, .88, .18, .45, .8, .3, .42, .075);
bodySpike(-.26, .88, .18, -.45, .8, .3, .42, .075);
bodySpike(.26, .7, .58, .3, .45, .9, .44, .07);
bodySpike(-.26, .7, .58, -.3, .45, .9, .44, .07);
bodySpike(0, .55, .85, 0, .1, 1, .52, .08);
// Horns and fangs around the head.
bodySpike(.07, .55, -.78, .15, .85, -.5, .3, .05);
bodySpike(-.07, .55, -.78, -.15, .85, -.5, .3, .05);
bodySpike(.06, .42, -.78, .1, -1, -.5, .27, .045);
bodySpike(-.06, .42, -.78, -.1, -1, -.5, .27, .045);
// Side blades on the thorax.
bodySpike(.3, .56, -.32, 1, .4, .1, .3, .055);
bodySpike(-.3, .56, -.32, -1, .4, .1, .3, .055);

// Glowing red eyes.
for (const [ex, ey, es] of [[.1, .55, .055], [-.1, .55, .055],
                             [.05, .62, .03], [-.05, .62, .03]]) {
  const eye = hardShell(new THREE.OctahedronGeometry(es, 0), eyeMaterial);
  eye.scale.set(1.35, .5, .5);
  eye.position.set(ex, ey, -.94);
  eye.rotation.z = ex > 0 ? -.55 : .55;
  eye.castShadow = false;
  body.add(eye);
}

const STEP_LENGTH = 1.55;
const LEG_DUTY = .56;
const STEP_LIFT = .27;

function makeLimb(spec) {
  const root = new THREE.Group();   // femur: hip → knee
  const mid = new THREE.Group();    // tibia: knee → needle tip
  creature.add(root, mid);

  root.add(hardShell(new THREE.OctahedronGeometry(spec.r0 * 1.45, 0)));
  root.add(shaft(spec.l1, spec.r0, spec.r1));

  mid.add(hardShell(new THREE.OctahedronGeometry(spec.r1 * 1.6, 0)));
  const shin = spec.l2 - spec.tipLen;
  mid.add(shaft(shin, spec.r1, spec.r2));
  const tip = needle(spec.tipLen, spec.rTip);
  tip.position.y = shin;
  mid.add(tip);

  if (spec.claw) {
    // Sharp barb at the knee, pointing back up the leg.
    const claw = needle(.2, spec.rTip * .85, shellMaterial);
    claw.quaternion.setFromUnitVectors(
      UP, new THREE.Vector3(0, -1, .5).normalize()
    );
    mid.add(claw);
  }

  return Object.assign({
    root, mid,
    hipRest: new THREE.Vector3(spec.hx, spec.hy, spec.hz),
    restFoot: new THREE.Vector3(spec.fx, spec.fy || 0, spec.fz),
    foot: new THREE.Vector3(),
    stepFrom: new THREE.Vector3(),
    stepTo: new THREE.Vector3(),
    stepping: false,
    stepT: 0,
    armed: true
  }, spec);
}

const limbs = [];

// Eight long spider legs — four pairs, alternating tetrapod gait.
const legPairs = [
  { hz: -.52, fan: -.45, reach: 1.52 },
  { hz: -.12, fan: -.1,  reach: 1.44 },
  { hz: .28,  fan: .15,  reach: 1.44 },
  { hz: .66,  fan: .5,   reach: 1.52 }
];

for (let pair = 0; pair < legPairs.length; pair++) {
  const { hz, fan, reach } = legPairs[pair];
  for (const side of [-1, 1]) {
    limbs.push(makeLimb({
      kind: "leg",
      side,
      hx: side * .36, hy: .42, hz,
      fx: side * reach, fz: hz + fan,
      l1: 1, l2: 1.34, tipLen: .34,
      r0: .1, r1: .06, r2: .03, rTip: .038,
      claw: true,
      phase: ((pair + (side > 0 ? 1 : 0)) % 2) * .5
        + (Math.random() - .5) * .05
    }));
  }
}

// Four extra iron-spider waldo arms: shorter, raised, restless.
for (const side of [-1, 1]) {
  limbs.push(makeLimb({
    kind: "waldo",
    side,
    hx: side * .28, hy: .6, hz: -.34,
    fx: side * .7, fy: 1.38, fz: -.98,
    l1: .6, l2: .86, tipLen: .36,
    r0: .07, r1: .045, r2: .02, rTip: .03,
    claw: false,
    phase: Math.random()
  }));
  limbs.push(makeLimb({
    kind: "waldo",
    side,
    hx: side * .3, hy: .6, hz: .5,
    fx: side * 1.05, fy: 1.25, fz: .4,
    l1: .6, l2: .86, tipLen: .36,
    r0: .07, r1: .045, r2: .02, rTip: .03,
    claw: false,
    phase: Math.random()
  }));
}

let visualTime = 0;
let visualSpeed = 0;
let visualSide = 0;
let gaitClock = 0;
let bodyBob = 0;
let bodyLean = 0;
const lastPos = new THREE.Vector3();

function hipPoint(hipRest, out) {
  out.copy(hipRest);
  out.applyAxisAngle(AXIS_Z, -bodyLean);
  out.x += bodyLean * .4;
  out.y += bodyBob;
}

function resetCreature() {
  visualTime = 0;
  visualSpeed = 0;
  visualSide = 0;
  gaitClock = 0;
  bodyBob = 0;
  bodyLean = 0;
  lastPos.copy(creature.position);
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  for (const limb of limbs) {
    limb.stepping = false;
    limb.stepT = 0;
    limb.armed = true;
    limb.foot.copy(limb.restFoot);
    limb.stepFrom.copy(limb.foot);
    limb.stepTo.copy(limb.foot);
  }
}

function updateCreature(dt) {
  // The suit is alive: veins creep slowly across the whole carapace.
  veinTime += dt;
  veinTexture.offset.x = veinGlowTexture.offset.x = veinTime * .02;
  veinTexture.offset.y = veinGlowTexture.offset.y = Math.sin(veinTime * .37) * .035;
  visualTime += dt;
  const moving = state === "running";
  const falling = state === "falling";
  visualSpeed = damp(visualSpeed, moving ? speed : 0, 10, dt);
  visualSide = damp(visualSide, moving ? sideSpeed : 0, 8, dt);
  const activity = clamp(visualSpeed / 5, 0, 1);

  // Gait advances with distance travelled, so the feet never skate.
  const moveX = creature.position.x - lastPos.x;
  const moveZ = creature.position.z - lastPos.z;
  lastPos.x = creature.position.x;
  lastPos.z = creature.position.z;
  if (moving) gaitClock += Math.hypot(moveX, moveZ) / STEP_LENGTH;

  bodyBob = Math.sin(visualTime * 2.6) * .014
    - Math.abs(Math.sin(gaitClock * Math.PI)) * .025 * activity;
  bodyLean = clamp(visualSide * .045, -.2, .2);
  body.position.set(bodyLean * .4, bodyBob, 0);
  body.rotation.z = -bodyLean;
  abdomen.rotation.z = Math.sin(visualTime * 3.1) * .04;
  abdomen.rotation.x = Math.sin(visualTime * 2.2) * .03;

  const stepDur = clamp(
    (1 - LEG_DUTY) * STEP_LENGTH * 1.15 / Math.max(visualSpeed, 1), .1, .32
  );

  for (const limb of limbs) {
    hipPoint(limb.hipRest, tmpHip);

    if (limb.kind === "waldo") {
      // Waldo arms hover and twitch — they never touch the ground.
      const seed = limb.phase * 12;
      const sway = .05 + activity * .1 + (falling ? .3 : 0);
      tmpFoot.copy(limb.restFoot);
      tmpFoot.x += Math.sin(visualTime * 2.4 + seed) * sway;
      tmpFoot.y += Math.sin(visualTime * 1.9 + seed * 1.3) * sway;
      tmpFoot.z += Math.sin(visualTime * 1.5 + seed * .7) * sway * 1.3
        - activity * .15;
      limb.foot.copy(tmpFoot);
    } else if (falling) {
      // Legs dangle and flail while the creature tumbles down.
      tmpFoot.set(
        limb.restFoot.x * .75,
        -1 + Math.sin(visualTime * 8 + limb.phase * 7) * .12,
        limb.restFoot.z * .4 + .3
      );
      limb.foot.lerp(tmpFoot, 1 - Math.exp(-7 * dt));
    } else if (limb.stepping) {
      limb.stepT = Math.min(1, limb.stepT + dt / stepDur);
      const t = smooth(limb.stepT);
      limb.foot.lerpVectors(limb.stepFrom, limb.stepTo, t);
      limb.foot.y = Math.sin(Math.PI * t) * (STEP_LIFT + activity * .1);
      if (limb.stepT >= 1) {
        limb.stepping = false;
        limb.foot.copy(limb.stepTo);
      }
    } else if (moving) {
      // A planted foot holds still in world space: slide it under the body.
      limb.foot.x -= moveX;
      limb.foot.z -= moveZ;
      const drift = Math.hypot(
        limb.foot.x - limb.restFoot.x,
        limb.foot.z - limb.restFoot.z
      );
      const phase = ((gaitClock + limb.phase) % 1 + 1) % 1;
      if (phase < LEG_DUTY) limb.armed = true;
      if ((phase >= LEG_DUTY && limb.armed) || drift > .62) {
        limb.armed = false;
        limb.stepping = true;
        limb.stepT = 0;
        limb.stepFrom.copy(limb.foot);
        // Land a little ahead of the resting stance, like a spider's step.
        limb.stepTo.set(
          limb.restFoot.x + Math.sin(limb.phase * 37) * .07,
          0,
          limb.restFoot.z - .4
        );
      }
    } else {
      // Idle: settle back into a sharp resting stance.
      limb.foot.x = damp(limb.foot.x, limb.restFoot.x, 5, dt);
      limb.foot.y = damp(limb.foot.y, limb.restFoot.y, 5, dt);
      limb.foot.z = damp(limb.foot.z, limb.restFoot.z, 5, dt);
    }

    solveKnee(tmpHip, limb.foot, limb.side, limb.l1, limb.l2);
    aimSegment(limb.root, tmpHip, kneePos);
    aimSegment(limb.mid, kneePos, limb.foot);
  }

  carried.position.set(-bodyLean * .3, 1.24 + bodyBob, .3);
  carried.rotation.z = -bodyLean * .7;
  carried.rotation.x = -.07 * activity;
}


resetCreature();
