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

const TOWER_H = 180;
const TOWER_S = 80;
const WORLD_LIMIT = 1230;
const GRAVITY = 9.81;
function districtAt(x,z) {
  if(Math.hypot(x,z)<310)return 'وسط المدينة — ناطحات السحاب';
  if(Math.hypot(x+600,z-420)<210)return 'حي الأعمال الغربي';
  if(Math.hypot(x-510,z-330)<155||Math.hypot(x+660,z+450)<170)return 'الحدائق';
  if(Math.abs(x)>850||Math.abs(z)>850)return 'الضواحي';
  return 'الأحياء السكنية';
}
function buildCity(rand) {
  const buildings=[],lots=[];
  for(let gx=-TOWER_S;gx<=TOWER_S;gx+=2)for(let gz=-TOWER_S;gz<=TOWER_S;gz+=2){
    const cx=gx*15,cz=gz*15,half=11;
    const park=Math.hypot(cx-510,cz-330)<140 || Math.hypot(cx+660,cz+450)<155;
    lots.push({x:cx,z:cz,half,park});
    if(cx===0&&cz===0){buildings.push({x:0,z:0,w:26,d:26,h:TOWER_H,tower:true,style:18});continue;}
    if(park)continue;
    const dist=Math.hypot(cx,cz),business=Math.hypot(cx+600,cz-420);
    const central=dist<280,secondary=business<170;
    const h=central?48+Math.floor(rand()*36)*3.2:secondary?30+Math.floor(rand()*18)*3.2:6+Math.floor(rand()*7)*3.2;
    const w=14+rand()*8,d=14+rand()*8;
    buildings.push({x:cx,z:cz,w,d,h,style:central||secondary?14+Math.floor(rand()*5):Math.floor(rand()*14)});
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

function wallAt(city, pos) {
  const ix=Math.round(pos.x/30), iz=Math.round(pos.z/30);
  let best=null, distance=1.25;
  for(let x=ix-1;x<=ix+1;x++)for(let z=iz-1;z<=iz+1;z++) {
    for(const b of city.index.get(`${x},${z}`)||[]) {
      if(pos.y>b.h+.2)continue;
      const dx=pos.x-b.x,dz=pos.z-b.z;
      if(Math.abs(dz)<b.d/2+.2) {
        const d=Math.abs(Math.abs(dx)-b.w/2);
        if(d<distance){distance=d;best={b,nx:Math.sign(dx)||1,nz:0};}
      }
      if(Math.abs(dx)<b.w/2+.2) {
        const d=Math.abs(Math.abs(dz)-b.d/2);
        if(d<distance){distance=d;best={b,nx:0,nz:Math.sign(dz)||1};}
      }
    }
  }
  return best;
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
    if (px > 0 && pz > 0 && p.y < b.h - .025) {
      if (px < pz) p.x += (p.x >= b.x ? px : -px);
      else p.z += (p.z >= b.z ? pz : -pz);
      hit = true;
    }
  }
  return hit;
}

// Real building facade anchors only; an unobstructed segment must reach them.
function sightClear(city,from,to) {
  const n=Math.ceil(from.distanceTo(to)/1.5);
  for(let i=1;i<n;i++) {
    const t=i/n,x=lerp(from.x,to.x,t),y=lerp(from.y,to.y,t),z=lerp(from.z,to.z,t);
    if(groundAt(city,x,z)>y+.05)return false;
  }
  return true;
}
function pickAnchor(city,pos,fwd) {
  let best=null,bestScore=-Infinity;
  const cx=Math.round(pos.x/30),cz=Math.round(pos.z/30),seen=new Set();
  for(let ix=cx-3;ix<=cx+3;ix++)for(let iz=cz-3;iz<=cz+3;iz++)for(const b of city.index.get(`${ix},${iz}`)||[]) {
    if(seen.has(b))continue;seen.add(b);
    if(b.h<pos.y+5)continue;
    const dx=pos.x-b.x,dz=pos.z-b.z;
    const p=new THREE.Vector3(clamp(pos.x,b.x-b.w/2,b.x+b.w/2),Math.min(b.h+.05,pos.y+38),clamp(pos.z,b.z-b.d/2,b.z+b.d/2));
    if(Math.abs(dx)/(b.w/2)>Math.abs(dz)/(b.d/2))p.x=b.x+Math.sign(dx)*(b.w/2+.08);
    else p.z=b.z+Math.sign(dz)*(b.d/2+.08);
    const v=p.clone().sub(pos),dist=v.length(),flat=Math.hypot(v.x,v.z);
    const dot=flat>.1?(v.x*fwd.x+v.z*fwd.z)/flat:1;
    if(dist<5||dist>75||dot<.05)continue;
    if(!sightClear(city,pos.clone().add(new THREE.Vector3(0,1,0)),p))continue;
    const score=dot*25-dist*.15;
    if(score>bestScore){bestScore=score;best={p,real:true,building:b};}
  }
  return best;
}

function swingConstraint(pos, vel, anchor, len, maxCorr) {
  const d = pos.clone().sub(anchor);
  const dist = d.length();
  if (dist <= len || dist < 1e-5) return false;
  d.divideScalar(dist);
  // Unilateral rope constraint: remove only outward radial velocity.
  const gap = dist - len;
  // The real anchor starts at the current distance; only manual reeling shortens it.
  const corr = Math.min(gap,Math.max(0,maxCorr ?? gap));
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
const nightUniform={value:0};

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

{
  const c=document.createElement('canvas');c.width=1024;c.height=512;
  const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#030813');g.addColorStop(.46,'#192b45');g.addColorStop(.56,'#30455c');g.addColorStop(1,'#070c18');ctx.fillStyle=g;ctx.fillRect(0,0,1024,512);
  const skyRand=makeRand(109);
  for(let i=0;i<200;i++){ctx.fillStyle=`rgba(212,230,255,${.2+skyRand()*.55})`;ctx.fillRect(skyRand()*1024,skyRand()*215,1,1);}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.mapping=THREE.EquirectangularReflectionMapping;scene.background=tex;
}
scene.fog = new THREE.FogExp2("#0a0e1c", .0082);

const hemi = new THREE.HemisphereLight("#bfd8ff", "#52627a", 2.5);
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

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 1800);

// ——— postprocessing: bloom (graceful — procedural world never depends on it) ———
let composer = null, bloomPass = null, bloomOn = false;
try {
  composer = new PP.EffectComposer(renderer);
  composer.addPass(new PP.RenderPass(scene, camera));
  bloomPass = new PP.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .72, .62, .7);
  composer.addPass(bloomPass);
  composer.addPass(new PP.OutputPass());
  bloomOn = true;
} catch { composer = null; bloomOn = false; }
function renderFrame() {
  if (bloomOn && composer) composer.render();
  else renderer.render(scene, camera);
}

// ——————————————————— city meshes ———————————————————
const rand = makeRand(1973 + 83);
const city = buildCity(rand);
let fallbackCityMesh = null;

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2520, 2520).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: "#0e1119", roughness: .55, metalness: .4, envMapIntensity: .6 })
);
groundMesh.position.y = -.02;
scene.add(groundMesh);

{
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: "#a7b3c3", roughness: .42, metalness: .48, envMapIntensity: 1.1
  });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uNight=nightUniform;
    shader.vertexShader='varying vec3 vCityP;varying vec3 vCityN;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vCityN=normal;
      vec4 cityP=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
      cityP=instanceMatrix*cityP;
      #endif
      vCityP=(modelMatrix*cityP).xyz;
      #include <project_vertex>`);
    shader.fragmentShader='uniform float uNight;varying vec3 vCityP;varying vec3 vCityN;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float column=mix(vCityP.x,vCityP.z,step(.5,abs(vCityN.x)));
      float lit=step(.36,fract(sin(floor(column*.4)*12.99+floor(vCityP.y*.3125)*78.23)*43758.54));
      float panes=step(.24,fract(column*.4))*step(fract(column*.4),.64)*step(.2,fract(vCityP.y*.3125))*step(fract(vCityP.y*.3125),.65);
      totalEmissiveRadiance+=vec3(.19,.27,.38)*uNight*panes*lit*(1.0-abs(vCityN.y));`);
  };
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
    m.setPosition(b.x, b.h / 2, b.z);
    im.setMatrixAt(n, m);
    const tall = b.h > 34;
    col.setStyle(tall ? "#33405e" : "#262c3d").offsetHSL(rand() * .04 - .02, rand() * .06 - .03, (rand() - .5) * .05);
    im.setColorAt(n, col);
    n++;
  }
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);
  fallbackCityMesh = im;

  // neon rooftop bands — the Spider-Man skyline signature
  const bandGeo = new THREE.BoxGeometry(1, 1, 1);
  const bandMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bands = new THREE.InstancedMesh(bandGeo, bandMat, city.buildings.length);
  const pal = ["#33e0ff", "#ff4d9d", "#ffb03a", "#8dff5a", "#b388ff", "#ff5340"];
  let bi = 0;
  for (const b of city.buildings) {
    m.makeScale(b.w * .8, .12, .16);
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
  let remaining=Math.min(Math.max(dt,0),.12);
  while(remaining>1e-8){const h=Math.min(remaining,1/120);stepPlayerTick(h);remaining-=h;}
}
function stepPlayerTick(dt) {
  const p = player;
  p.wallCooldown=Math.max(0,(p.wallCooldown||0)-dt);
  p.climbing=false;
  if(input.climb && !web.active && !p.wallCooldown) {
    const wall=wallAt(city,p.pos);
    if(wall) {
      const {b,nx,nz}=wall;
      p.climbing=true; p.wallNormal={x:nx,z:nz}; p.onGround=false;
      p.heading=Math.atan2(nx,nz);fwdVec.set(-nx,0,-nz);rightVec.set(nz,0,-nx);
      if(nx) p.pos.x=b.x+nx*(b.w/2+.52);
      else p.pos.z=b.z+nz*(b.d/2+.52);
      p.vel.set(0,input.forward<-.1?-5:7,0);
      if(wantJump) {
        wantJump=false;p.wallCooldown=.65;p.climbing=false;
        p.vel.set(nx*8,10,nz*8);sfxJump();
      } else {
        p.pos.y=Math.max(0,p.pos.y+p.vel.y*dt);
        // Sideways crawling along the contacted facade.
        if(nx)p.pos.z=clamp(p.pos.z+input.strafe*3*dt,b.z-b.d/2+.4,b.z+b.d/2-.4);
        else p.pos.x=clamp(p.pos.x-input.strafe*3*dt,b.x-b.w/2+.4,b.x+b.w/2-.4);
        if(p.pos.y>=b.h+.12){p.pos.y=b.h;p.pos.x-=nx*1.1;p.pos.z-=nz*1.1;p.onGround=true;p.climbing=false;p.vel.set(0,0,0);p.wallCooldown=.4;}
        return;
      }
    }
  }
  // desired planar move from input, camera-relative
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  fwdVec.set(fx, 0, fz);
  rightVec.set(rx, 0, rz);
  let dx = fx * input.forward + rx * input.strafe;
  let dz = fz * input.forward + rz * input.strafe;
  const dl = Math.hypot(dx, dz);
  if (dl > 1) { dx /= dl; dz /= dl; }
  if(p.dodgeTime>0){p.dodgeTime=Math.max(0,p.dodgeTime-dt);p.vel.x=p.dodgeDir.x*14;p.vel.z=p.dodgeDir.z*14;}
  else if(p.onGround){
    const target=input.sprint?11:7,accel=dl>.1?24:32;
    p.vel.x+=clamp(dx*target-p.vel.x,-accel*dt,accel*dt);
    p.vel.z+=clamp(dz*target-p.vel.z,-accel*dt,accel*dt);
  }else{
    p.vel.x=(p.vel.x+dx*4*dt)*Math.exp(-.025*dt);
    p.vel.z=(p.vel.z+dz*4*dt)*Math.exp(-.025*dt);
  }
  p.vel.y-=GRAVITY*dt;
  if(wantJump){wantJump=false;if(p.onGround){p.vel.y=7;p.onGround=false;sfxJump();}}
  if(web.active){
    web.t=(web.t||0)+dt;
    if(p.zipTime>0){p.zipTime=Math.max(0,p.zipTime-dt);p.vel.addScaledVector(web.anchor.clone().sub(p.pos).normalize(),30*dt);web.len=Math.max(5,web.len-18*dt);if(!p.zipTime||p.pos.distanceTo(web.anchor)<6)releaseWeb();}
    if(input.sprint)web.len=Math.max(5,web.len-4*dt);
  }
  const hs=Math.hypot(p.vel.x,p.vel.z);
  if(hs>40){p.vel.x*=40/hs;p.vel.z*=40/hs;}
  p.vel.y=clamp(p.vel.y,-65,40);
  const oldY=p.pos.y,wasAir=!p.onGround;
  p.pos.addScaledVector(p.vel,dt);
  if(web.active){
    web.taut=p.pos.distanceTo(web.anchor)>web.len;
    swingConstraint(p.pos,p.vel,web.anchor,web.len,Infinity);
    web.check=(web.check||0)-dt;
    if(web.check<=0){web.check=.1;if(!sightClear(city,p.pos.clone().add(new THREE.Vector3(0,.6,0)),web.anchor))releaseWeb();}
  }
  p.pos.x=clamp(p.pos.x,-WORLD_LIMIT,WORLD_LIMIT);p.pos.z=clamp(p.pos.z,-WORLD_LIMIT,WORLD_LIMIT);
  let gh=groundAt(city,p.pos.x,p.pos.z);
  const crossedRoof=p.vel.y<=0&&oldY>=gh-.04&&p.pos.y<=gh;
  if(crossedRoof)p.pos.y=gh;
  const beforeX=p.pos.x,beforeZ=p.pos.z;
  collidePush(city,p.pos,.42);
  if(Math.abs(p.pos.x-beforeX)>.0001)p.vel.x=0;
  if(Math.abs(p.pos.z-beforeZ)>.0001)p.vel.z=0;
  gh=groundAt(city,p.pos.x,p.pos.z);
  const canLand=(oldY>=gh-.04 || gh<=.31) && p.pos.y<=gh+.001 && p.vel.y<=0;
  if(canLand){
    p.pos.y=gh;if(wasAir)p.impactSpeed=Math.abs(p.vel.y);p.vel.y=0;p.onGround=true;
    if(wasAir)fxLanded();
  }else p.onGround=false;

  if (dl > .1 && !web.active) p.heading = Math.atan2(-dx, -dz);
  else if (hs > .5) p.heading = Math.atan2(-p.vel.x, -p.vel.z);
}

function attachWeb() {
  if (web.active || uiBusy || paused) return;
  const fwd = tmpA.copy(fwdVec);
  const a = pickAnchor(city, player.pos, fwd);
  if(!a){toast("لا توجد واجهة مناسبة في اتجاهك — لا يمكن ربط الخيط بالهواء");return;}
  web.anchor.copy(a.p);
  const ad = player.pos.distanceTo(web.anchor);
  if (ad > 75) { web.active = false; return; }
  web.len = ad;
  web.active = true;
  web.real = a.real;
  web.t = 0;
  player.webCasting=.28;
  web.taut = false;
  // Attaching changes no velocity. Jump first; Shift deliberately reels the rope.
  ensureWebLine();
  sfxZip();
}
function releaseWeb() {
  if (!web.active) return;
  web.active = false;
  player.zipTime=0;
  player.webReleasing=.28;
  // Releasing preserves the current momentum; no free upward impulse.
  if (web.line) web.line.visible = false;
  sfxReel();
}
/*__PHYS_LOGIC_END__*/

// web rope visual
function ensureWebLine() {
  if (!web.line) {
    web.line = new THREE.Line(
      new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(new Float32Array(13*3),3)),
      new THREE.LineBasicMaterial({ color: "#eef4ff", transparent: true, opacity: .9, depthTest: false })
    );
    scene.add(web.line);
  }
  web.line.visible = true;
}
function updateWebLine() {
  if (!web.active || !web.line) return;
  tmpB.copy(player.pos); tmpB.y += 1.1;
  if(avatar==='hero' && heroBones.handR) heroBones.handR.getWorldPosition(tmpB);
  const attr=web.line.geometry.attributes.position;
  const sag=web.taut?.12:Math.min(2,web.len*.055);
  for(let i=0;i<=12;i++){const t=i/12;attr.setXYZ(i,lerp(tmpB.x,web.anchor.x,t),lerp(tmpB.y,web.anchor.y,t)-4*sag*t*(1-t),lerp(tmpB.z,web.anchor.z,t));}
  attr.needsUpdate=true;web.line.geometry.computeBoundingSphere();
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
  const tall = city.buildings.filter(b => b.h > 20 && !b.tower && Math.hypot(b.x,b.z)<550);
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
    const sx = clamp(x + Math.cos(a) * r,-WORLD_LIMIT+4,WORLD_LIMIT-4), sz = clamp(z + Math.sin(a) * r,-WORLD_LIMIT+4,WORLD_LIMIT-4);
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
    if(e.healthBar)e.healthBar.visible=!!e.contract&&e.alive;
    if (!e.alive) continue;
    alive++;
    e.stun=Math.max(0,(e.stun||0)-dt);e.attackCd=Math.max(0,(e.attackCd||0)-dt);
    const wasWindup=(e.windup||0)>0;e.windup=Math.max(0,(e.windup||0)-dt);
    const ddx = player.pos.x - e.pos.x, ddz = player.pos.z - e.pos.z;
    const ddy = player.pos.y - e.pos.y;
    const dist = Math.hypot(ddx, ddz);
    e.aggro = dist < 19 && Math.abs(ddy) < 5;
    if(!wasWindup&&!e.stun&&!e.attackCd&&dist<2.5&&Math.abs(ddy)<1.7&&sightClear(city,e.pos.clone().add(new THREE.Vector3(0,1,0)),player.pos.clone().add(new THREE.Vector3(0,1,0))))e.windup=.72;
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
    if(e.stun>0||e.windup>0||wasWindup){vx=0;vz=0;}
    e.pos.x += vx * dt;
    e.pos.z += vz * dt;
    collidePush(city,e.pos,.55);
    e.pos.y = groundAt(city, e.pos.x, e.pos.z);
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y = Math.atan2(-vx, -vz);
    if (e.mix) {
      const punching=e.windup>0&&e.acts?.Punch;
      setRobotClip(e,punching?'Punch':e.stun>0?'Idle':e.aggro?'Running':'Walking');
      e.mix.timeScale=punching?robotClips.Punch.duration/.72:clamp(.7+Math.hypot(vx,vz)*.09,.7,1.7);
      e.mix.update(dt);
    } else {
      e.mesh.position.y += Math.abs(Math.sin(performance.now() * .009 + e.pos.x)) * .06;
    }
    enemyWarning(e,e.windup>0&&!e.stun);
    if(e.healthBar)e.healthBar.position.copy(e.pos).add(new THREE.Vector3(0,2.6,0));
    if(wasWindup && e.windup<=0 && !e.stun){
      e.attackCd=1.25;
      if(dist<2.7&&Math.abs(ddy)<1.7&&invuln<=0&&sightClear(city,e.pos.clone().add(new THREE.Vector3(0,1,0)),player.pos.clone().add(new THREE.Vector3(0,1,0)))){
        invuln=1;player.vel.set(ddx/(dist||1)*6,2,ddz/(dist||1)*6);player.onGround=false;
        fxCamShake=.2;damagePlayer(1);
      }
    }
    if (dist > 130 && !e.contract) {
      const w = streetSpotAround(player.pos.x, player.pos.z, 55, 90);
      e.pos.set(w.x, w.y, w.z);
      e.alive = true;
      e.mesh.visible = true;
      e.retarget();
    }
  }
}

function shootWeb() {
  if(uiBusy||paused||fxShootCd>0||actionKind==='hit'&&actionTimer>0)return;
  fxShootCd=.52;
  chooseShotTarget();
  beginAction('shoot',.52,.16,resolveWebShot);
}
function resolveWebShot() {
  sfxShot();
  // Target chosen when the cast begins; effect lands at the release frame.
  if (shotTarget===boss && boss.active) {
    const d = tmpB.copy(boss.pos).sub(player.pos);
    if (d.length() < 36 && player.pos.y > TOWER_H-3) {
      hitBoss();
      tmpA.copy(attackOrigin());
      tmpB.copy(boss.pos); tmpB.y += 1.4;
      spawnShotLine(tmpA, tmpB);
      return;
    }
  }
  const best=shotTarget!==boss && shotTarget?.alive && shotTarget.pos.distanceTo(player.pos)<34 && sightClear(city,player.pos.clone().add(new THREE.Vector3(0,1,0)),shotTarget.pos.clone().add(new THREE.Vector3(0,1,0))) ? shotTarget : null;
  if (best) {
    if(best.contract&&stunGuard(best,1)){spawnShotLine(attackOrigin(),best.pos.clone().add(new THREE.Vector3(0,1,0)));return;}
    enemyWarning(best,false);
    best.alive = false;
    best.mesh.visible = false;
    tmpA.copy(attackOrigin());
    tmpB.copy(best.pos);tmpB.y+=1;spawnShotLine(tmpA,tmpB);
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
    tmpA.copy(attackOrigin());
    tmpB.copy(shotAim);
    spawnShotLine(tmpA, tmpB);
  }
}
function spawnShotLine(a, b) {
  b=b.clone();const end=b.clone(),steps=Math.ceil(a.distanceTo(b)/.3);
  for(let i=1;i<=steps;i++){const p=a.clone().lerp(end,i/steps);if(groundAt(city,p.x,p.z)>p.y){b.copy(a).lerp(end,Math.max(0,(i-1)/steps));break;}}

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
  for(const e of enemies)if(!e.alive&&e.reactionTime>0&&e.mix){e.mix.update(dt);e.reactionTime-=dt;}
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
  if(boss.mesh)scene.remove(boss.mesh);if(boss.ring)scene.remove(boss.ring);
  boss.stun=0;boss.phase="idle";boss.t=2;
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
  if(!boss.active || boss.stun>0)return;
  boss.hp=Math.max(0,boss.hp-1);
  sfxHit();
  score += 300;
  renderScore();
  boss.stun = 1.6;
  saveAll();
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
    toast("انحنى الملك الأسود… المدينة حرة يا لَزِج");
    mission = "done";
    saveAll();
    setTimeoutSafe(() => { if(mission!=="done"||mode!=="play")return; $("wOverlay").dataset.done = "1"; openStory(ENDING, 0); }, 1400);
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
        saveAll();
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
const input = { forward: 0, strafe: 0, sprint: false, climb: false };
const keys = { left: false, right: false, up: false, down: false };
let wantJump = false;
let drag = null;

window.addEventListener("keydown", e => {
  if (e.ctrlKey || e.altKey || e.metaKey || /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.code === "F1") { e.preventDefault(); }
  if (e.code === "Escape") {
    if (mode === "play" && !document.pointerLockElement && !uiBusy) togglePause();
    return;
  }
  if (mode === "menu") {
    if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); startRun(false); }
    return;
  }
  if(e.code==="Tab"){e.preventDefault();toggleWorldMap();return;}
  if (e.code === "KeyP") { togglePause(); return; }
  if (e.code === "KeyV") { firstPerson = !firstPerson; creature.visible = !firstPerson;
    toast(firstPerson ? "منظور الشخص الأول 👁" : "منظور خلفي 🎥"); return; }
  if (e.code === "F3") { e.preventDefault(); SET.showFps = SET.showFps ? 0 : 1; applySettings(); saveSettings(); return; }
  if (e.code === "KeyM") { startRace(); return; }
  if (paused || uiBusy || worldMapOpen) return;
  if (e.code === "KeyQ") { input.climb=true; e.preventDefault(); }
  if (e.code === "KeyC" && !e.repeat) { switchAvatar(); return; }
  if(e.code==='KeyR'&&!e.repeat){dodge();return;}
  if(e.code==='KeyX'&&!e.repeat){startWebBurst();return;}
  if(e.code==='KeyN'&&!e.repeat){startPatrol();return;}
  if (e.code === "KeyT" && !e.repeat) { beginAction('dance',3); return; }
  if (e.code === "KeyJ" && !e.repeat) { meleeAttack(); return; }
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
  if(e.code === "KeyQ") input.climb=false;
  if (e.code === "KeyW" || e.code === "ArrowUp") keys.up = false;
  if (e.code === "KeyS" || e.code === "ArrowDown") keys.down = false;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keys.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = false;
  if (e.code === "KeyE") releaseWeb();
  syncKeys();
});
function clearControls() {
  for(const k of Object.keys(keys))keys[k]=false;
  input.forward=0;input.strafe=0;input.climb=false;input.sprint=false;wantJump=false;
}
window.addEventListener('blur',()=>{clearControls();if(mode==='play'&&!uiBusy)setPaused(true);});
window.addEventListener('pagehide',saveAll);
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
bindHold("wMelee",meleeAttack);
bindHold("wClimb", () => {input.climb=true;}, () => {input.climb=false;});
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
  const origin=new THREE.Vector3(player.pos.x,player.pos.y+1.25,player.pos.z);
  const dir=camPos.clone().sub(origin), desired=dir.length();
  dir.normalize(); const ray=new THREE.Ray(origin,dir), hit=new THREE.Vector3();
  let allowed=desired;
  const ix=Math.round(player.pos.x/30),iz=Math.round(player.pos.z/30);
  for(let x=ix-1;x<=ix+1;x++)for(let z=iz-1;z<=iz+1;z++)for(const b of city.index.get(`${x},${z}`)||[]) {
    const box=new THREE.Box3(new THREE.Vector3(b.x-b.w/2-.15,0,b.z-b.d/2-.15),new THREE.Vector3(b.x+b.w/2+.15,b.h+.2,b.z+b.d/2+.15));
    if(!box.containsPoint(origin) && ray.intersectBox(box,hit)) allowed=Math.min(allowed,Math.max(.65,origin.distanceTo(hit)-.2));
  }
  camera.position.copy(origin).addScaledVector(dir,allowed);
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
function setTimeoutSafe(fn, ms) { return setTimeout(fn, ms); }

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
  ["المهمة", "اثنتا عشرة قطعة من النول الكبير متناثرة على الأسطح. اجمع ثمانيًا وسيصعد الملك نفسه إلى أعلى برج. على الكمبيوتر: انقر بالماوس لقفل النظر — WASD حركة، Space قفز، E أو الزر الأيمن تأرجح، F أو الزر الأيسر شبكة، Shift جري، Q تسلق وS نزول أثناء التسلق، J ضربة قريبة، C تبديل الشخصية، R دحرجة، T رقصة، V المنظور، M سباق الأسطح، ESC إيقاف."]
];
const ENDING = [
  ["سقوط الملك", "عندما ارتطمت الشبكة الثالثة بصدره، ترجّح الملك الأسود من فوق البرج كجبلٍ من القار، وذاب قبل أن يلمس الأرض. غسل المطرُ نيون المدينة، ولأول مرة منذ سنين… صارت الأبراج لامعة لا مرعِبة."],
  ["مدينة بلا ملك", "جُمعت خيوطه وأُعيد النول الكبير — لا لعرشٍ، بل لطاولة. ضحكت نَسْمة: «لهذا تُنسج الخيوط». والمدينة صارت لك: تأرجح حيث شئت، وحرّر ما تبقى من قطع، فالأبواب مفتوحة أبدًا."]
];

let paused = false;
function togglePause() {
  if (mode !== "play" || uiBusy) return;
  if(worldMapOpen){toggleWorldMap();return;}
  setPaused(!paused);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "play") {
    clearControls();saveAll();
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
      hp, score, raceBest, avatar, bossHp:boss.active?boss.hp:0,
      pos: [player.pos.x, player.pos.y, player.pos.z],
      worldHour,weatherClock,progress:{xp:combat.xp,completed:combat.completed},v: 5
    }));
  } catch {}
}
function loadAll() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem("lazij-open") || "null"); } catch {}
  if (!data || ![1,2,3,4,5].includes(data.v)) return false;
  for (let i = 0; i < Math.min(parts.length, (data.flags || []).length); i++) {
    if (data.flags[i]) {
      parts[i].taken = true;
      parts[i].mesh.visible = false;
      parts[i].halo.visible = false;
    }
  }
  partsGot = data.got || parts.filter(p => p.taken).length;
  mission = data.mission || "find";
  if (Array.isArray(data.pos) && data.pos.length===3 && data.pos.every(Number.isFinite)) player.pos.set(clamp(data.pos[0],-WORLD_LIMIT,WORLD_LIMIT),clamp(data.pos[1],0,500),clamp(data.pos[2],-WORLD_LIMIT,WORLD_LIMIT));
  avatar=data.avatar==='hero'?'hero':'spider';
  if(Number.isFinite(data.worldHour))worldHour=((data.worldHour%24)+24)%24;
  weatherClock=Math.max(0,Number(data.weatherClock)||0);
  combat.xp=Math.max(0,Number(data.progress?.xp)||0);
  combat.completed=Array.isArray(data.progress?.completed)?data.progress.completed.filter(id=>patrolSites.some(s=>s.id===id)):[];
  hp = clamp(Number(data.hp)||5,1,5); score = Math.max(0,Number(data.score)||0); raceBest = Math.max(0, Number(data.raceBest)||0);
  if (mission === "boss") {summonBoss();boss.hp=clamp(Number(data.bossHp)||3,1,3);renderBossPips();}
  return true;
}
let importedSpider = null, spiderMixer = null;
let heroRoot = null, heroMixer = null, heroActions = {}, heroAction = '', avatar = 'spider';
let actionTimer = 0, actionKind = '', lastGrounded = false, previewHeroClip = '', previewTimer = 0;
let heroBones = {}, poseTime=0, saveClock=0, lodClock=0;
const cityDetailBatches=[];
let wallPoseBlend=0, wallGaitClock=0;
let actionDuration=0, actionAge=0, actionImpact=-1, actionCallback=null;
let animationSerial=0, heroEventSerial=-1, activePose='idle', meleeSide=0;
let shotTarget=null;
const shotAim=new THREE.Vector3();
const spiderAccents=[];
const originalCreatureParts = [...creature.children];
let robotTmpl = null, robotClips = {}, bossTmpl = null, bossClips = {}, skyline = null;
let worldHour=16,weatherClock=0,weatherWet=0,trafficClock=0;
const cars=[],trafficRoutes=[],streetLights=[];
let worldMapOpen=false;
const combat={focus:100,xp:0,completed:[],patrol:null,chain:0,chainClock:0,queue:false,zipCd:0,dodgeCd:0};
const patrolSites=[{id:'center',name:'دورية وسط المدينة',x:45,z:165},{id:'west',name:'دورية حي الأعمال',x:-585,z:435},{id:'suburb',name:'دورية الضواحي',x:1005,z:1005}];
const resumed = loadAll();

// ——————————————————— main loop ———————————————————
let lastTime = performance.now();
let frame = 0;
let uiClock = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const elapsed = Math.max(.001,(now - lastTime) / 1000);
  const rawDt = Math.min(elapsed, .1);
  lastTime = now;
  frame++;
  fpsTick(elapsed);
  lodClock+=rawDt;
  if(lodClock>.4){lodClock=0;updateCityLOD();}
  if (mode === "menu") {
    updateLivingWorld(rawDt);
    menuFlyby(rawDt);
    renderFrame();
    return;
  }
  if (paused || uiBusy) {
    renderOnly(now);
    return;
  }
  saveClock+=rawDt;if(saveClock>15){saveClock=0;saveAll();}
  pollGamepad();
  updateLivingWorld(rawDt);
  updateRace(rawDt);
  scoreShown = damp(scoreShown, score, 5, rawDt);
  $("wScore").textContent = Math.round(scoreShown);
  const dt = rawDt * fxSlow;
  stepPlayer(dt);
  handleCarContact();
  updateEnemies(dt);
  updateCombat(dt);
  if (boss.active) updateBoss(dt);
  tryCollect(dt);
  updateFx(dt);
  updateFlecks(dt);
  updateRainWorld(rawDt);

  // feed the creature rig
  creature.position.copy(player.pos);
  creature.rotation.y = player.heading;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  speed = hs;
  sideSpeed = player.vel.x * rightVec.x + player.vel.z * rightVec.z;
  state = (!player.onGround && player.vel.y < -4) ? "falling" : "running";
  updateCreature(dt);
  updateAvatar(dt);
  creature.updateMatrixWorld(true);
  updateWebLine();
  $("wSpeed").textContent = Math.round(hs * 3.6);

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
  if (frame % 4 === 0) drawMinimap();
  if(worldMapOpen && frame%15===0)drawWorldMap();
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
    const measure=new THREE.AnimationMixer(clone);
    if(robotClips.Idle)measure.clipAction(robotClips.Idle).play();measure.update(0);clone.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(clone,true),height=bounds.max.y-bounds.min.y;measure.stopAllAction();
    const enemyScale=2.2/Math.max(.1,height);clone.scale.setScalar(enemyScale);clone.position.y=-bounds.min.y*enemyScale;
    wrap.add(clone);
    if (e.mesh) { scene.remove(e.mesh); }
    e.mesh = wrap;
    wrap.position.copy(e.pos);
    scene.add(wrap);
    e.mix = new THREE.AnimationMixer(clone);
    e.acts = {};
    for (const name of ["Idle", "Walking", "Running", "Death", "Punch"]) {
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
    // Original model uses rigid bone parenting, not deformable skin weights.
    // Preserve that imported hierarchy instead of double-transforming each part.
    const joints = new Set((g.parser.json.skins || []).flatMap(skin => skin.joints));
    const replacements=[];
    root.traverse(o => {
      const assoc=g.parser.associations.get(o);
      if (assoc && joints.has(assoc.nodes) && !o.isBone) replacements.push(o);
    });
    for (const old of replacements) {
      const bone = new THREE.Bone(); bone.name=old.name;
      bone.position.copy(old.position);bone.quaternion.copy(old.quaternion);bone.scale.copy(old.scale);
      const parent=old.parent; for(const child of [...old.children]) bone.add(child);
      if(parent){parent.remove(old);parent.add(bone);}
    }
    let skins = 0;
    root.traverse(o=>{if(o.isMesh){let p=o.parent;while(p){if(p.isBone){skins++;break;}p=p.parent;}}});
    if(!countBones(root) || !skins) throw new Error('No rigid bone bindings');
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const sc = 3.8 / Math.max(size.x, size.z);
    const wrap = new THREE.Group();
    root.scale.setScalar(sc);
    root.position.set(-center.x * sc, -box.min.y * sc + .02, -center.z * sc);
    root.traverse(o => { if (o.isMesh) { o.material = shellMaterial; o.frustumCulled = false; } });
    wrap.add(root);
    // Fixed symbiote carapace over the imported mechanical chassis (no regrowth).
    const carapace = new THREE.Mesh(new THREE.SphereGeometry(1,24,16), shellMaterial);
    carapace.scale.set(.48,.28,.58);carapace.position.y=.66;wrap.add(carapace);
    for(const sign of [-1,1]) {
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.09,12,8),eyeMaterial);
      eye.scale.set(1,.65,.45);eye.position.set(sign*.17,.72,-.51);wrap.add(eye);
    }
    for (const child of creature.children) child.visible = false;
    creature.add(wrap);
    importedSpider = wrap;
    spiderMixer = new THREE.AnimationMixer(root);
    for (const clip of g.animations) spiderMixer.clipAction(clip).play();
    root.traverse(o=>{if(o.isBone && /Bone.?00[246]/.test(o.name))spiderAccents.push({bone:o,base:o.quaternion.clone()});});
    importReport.spider = countBones(root);
    toast(`عنكبوت آلي مستورد: ${importReport.spider} عظمة، ${skins} أجزاء مربوطة بالعظام`);
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
    toast("الحي الياباني المستورد جاهز — معلم إضافي بجانب أحياء اللعب");
  } catch (err) { console.warn("tokyo import:", err.message); }
  await importHero();
  await importCityBlocks();
  $('assetStatus').textContent = heroRoot && cityDetailBatches.length ? 'جاهز • نَسّاج والمدينة' : 'وضع احتياطي — بعض النماذج لم تُحمَّل';
  toast(`🦴 تقرير العظام: عنكبوتك ${importReport.spider} • صيادون ${importReport.robot} • زعيم ${importReport.dragon}`);
}

// Imported CC0 humanoid and animation state machine.
async function importHero() {
  try {
    const g = await loadGLB('models/hero.glb', 30000);
    heroRoot = new THREE.Group();
    const model = g.scene;
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const scale = 1.85 / size.y;
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    model.rotation.y = Math.PI;
    const suit = new THREE.MeshStandardMaterial({color:0xffffff, vertexColors:true, roughness:.5, metalness:.28,emissive:0x06242b,emissiveIntensity:.45});
    model.traverse(o=>{
      if(o.isBone) {
        const name=o.name.replace(/[^a-z0-9]/gi,'').toLowerCase();
        const wanted={'defupperarml':'upperL','defupperarmr':'upperR','defforearml':'foreL','defforearmr':'foreR','defhandl':'handL','defhandr':'handR','defhead':'head','defshinl':'shinL','defshinr':'shinR','deffootl':'footL','deffootr':'footR','defthighl':'thighL','defthighr':'thighR'};
        if(wanted[name])heroBones[wanted[name]]=o;
      }
      if(o.isMesh) {
        const geom=o.geometry.clone(), pos=geom.attributes.position, colors=[];
        for(let i=0;i<pos.count;i++) {
          const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
          let col=new THREE.Color(0x142434);
          if(y<.3 || Math.abs(x)>.65)col.setHex(0x168b8a);
          if(y>1.08 && y<1.5 && Math.abs(x)<.28 && z>.04) {
            col.setHex(Math.abs(Math.abs(x)-(1.48-y)*.48)<.045?0x79f3d2:0x20566c);
          }
          // Paired ivory lenses on the original mask, not a licensed character skin.
          if(y>1.66&&y<1.72&&Math.abs(x)>.025&&Math.abs(x)<.085&&z>.09)col.setHex(0xd8fff1);
          colors.push(col.r,col.g,col.b);
        }
        geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));o.geometry=geom;
      }
    });
    model.traverse(o => { if (o.isMesh) { o.material = suit; o.frustumCulled = false; } });
    heroRoot.add(model); creature.add(heroRoot); heroRoot.visible = false;
    playHero('Idle_Loop');
    heroMixer = new THREE.AnimationMixer(model);
    for (const clip of g.animations) heroActions[clip.name] = heroMixer.clipAction(clip);
    // Separate author-created base clips for wall/swing; upper limbs are driven by IK below.
    for(const [name,base] of [['WebSwing','Idle_Loop'],['WallClimb','Crouch_Idle_Loop'],['WallDescend','Crouch_Idle_Loop'],['WebShoot','Pistol_Aim_Neutral'],['WebCast','Idle_Loop'],['WebRelease','Jump_Loop'],['AirFall','Jump_Loop'],['HardLanding','Jump_Land'],['TurnIdle','Idle_Loop']]) {
      const clip=g.animations.find(c=>c.name===base).clone();clip.name=name;
      heroActions[name]=heroMixer.clipAction(clip);
    }
    playHero('Idle_Loop'); heroMixer.update(.01);
    heroRoot.visible=avatar==='hero';if(importedSpider)importedSpider.visible=avatar==='spider';
    $('avatarSwitch').textContent=avatar==='hero'?'C • نَسّاج':'C • العنكبوت';
    $('avatarSwitch').disabled = false;
    const names={Idle_Loop:'وقوف',Walk_Loop:'مشي',Sprint_Loop:'جري سريع',Jog_Fwd_Loop:'هرولة',Jump_Start:'بدء القفز',Jump_Land:'هبوط',Jump_Loop:'في الهواء',Roll:'دحرجة',Dance_Loop:'رقص',Punch_Cross:'لكمة',Crouch_Idle_Loop:'قرفصاء',WebShoot:'إطلاق شبكة',WebCast:'إرسال خيط التأرجح',WebRelease:'إفلات الخيط',WebSwing:'تأرجح',WallClimb:'صعود الجدار',WallDescend:'نزول الجدار',AirFall:'سقوط',HardLanding:'هبوط قوي',TurnIdle:'التفات',Punch_Jab:'لكمة يسار',Punch_Cross:'لكمة يمين',Hit_Chest:'تلقي ضربة'};
    for(const name of Object.keys(heroActions)) { const opt=document.createElement('option');opt.value=name;opt.textContent=names[name] || name.replaceAll('_',' ');$('animationSelect').appendChild(opt); }
    $('animationSelect').onchange=()=>{if(avatar!=='hero')switchAvatar();previewHeroClip=$('animationSelect').value;previewTimer=5;};
    toast('شخصية بشرية CC0 جاهزة • C للتبديل • R دحرجة • T رقصة • F هجوم');
  } catch(err) { console.warn('hero import',err.message); }
}
function switchAvatar() {
  if (!heroRoot || !importedSpider || paused || uiBusy) return;
  avatar = avatar === 'spider' ? 'hero' : 'spider';
  heroRoot.visible = avatar === 'hero'; importedSpider.visible = avatar === 'spider';
  for (const part of originalCreatureParts) part.visible = false;
  cancelAction();
  updateAvatar(0);
  $('avatarSwitch').textContent = avatar === 'hero' ? 'C • نَسّاج' : 'C • العنكبوت';
  saveAll();
  toast(avatar === 'hero' ? 'البطل البشري — نفس المكان والتقدم' : 'العنكبوت الآلي — نفس المكان والتقدم');
}
// Animation events own their timing. Effects fire at the release/contact frame.
function cancelAction() {
  combat.queue=false;
  actionTimer=0;actionDuration=0;actionAge=0;actionImpact=-1;actionCallback=null;
}
function beginAction(kind,duration,impact=-1,callback=null) {
  actionKind=kind;actionTimer=duration;actionDuration=duration;actionAge=0;
  actionImpact=impact;actionCallback=callback;animationSerial++;
}
function attackOrigin() {
  creature.updateMatrixWorld(true);
  if(avatar==='hero' && heroBones.handR) {
    const hand=activePose==='punchL'?heroBones.handL:heroBones.handR;
    return hand.getWorldPosition(new THREE.Vector3());
  }
  if(importedSpider)return importedSpider.localToWorld(new THREE.Vector3(0,.68,-.62));
  return player.pos.clone().add(new THREE.Vector3(0,1,0));
}
function chooseShotTarget() {
  shotTarget=null;
  const forward=new THREE.Vector3(-Math.sin(player.heading),0,-Math.cos(player.heading));
  let best=33;
  for(const e of enemies) {
    const d=e.pos.clone().sub(player.pos),flat=Math.hypot(d.x,d.z);
    if(e.alive && d.length()<best && Math.abs(d.y)<12 && (flat<2 || forward.dot(d.clone().setY(0).normalize())>-.1) && sightClear(city,player.pos.clone().add(new THREE.Vector3(0,1,0)),e.pos.clone().add(new THREE.Vector3(0,1,0)))) {shotTarget=e;best=d.length();}
  }
  if(boss.active && player.pos.y>TOWER_H-3 && player.pos.distanceTo(boss.pos)<36)shotTarget=boss;
  if(shotTarget)shotAim.copy(shotTarget.pos).add(new THREE.Vector3(0,1.25,0));
  else shotAim.copy(player.pos).addScaledVector(forward,12).add(new THREE.Vector3(0,1.25,0));
}
function meleeAttack() {
  if(actionTimer>0&&['punchL','punchR'].includes(actionKind)&&actionAge>.28){combat.queue=true;return;}
  if(uiBusy||paused||player.climbing||actionTimer>0 && ['punchL','punchR','shoot','hit','recover'].includes(actionKind))return;
  meleeSide=1-meleeSide;
  beginAction(meleeSide?'punchR':'punchL',.62,.23,resolveMeleeHit);
}
function resolveMeleeHit() {
  const forward=new THREE.Vector3(-Math.sin(player.heading),0,-Math.cos(player.heading));
  let victim=null,distance=2.8;
  for(const e of enemies) {
    const d=e.pos.clone().sub(player.pos),flat=Math.hypot(d.x,d.z);
    if(e.alive && Math.abs(d.y)<2 && flat<distance && (flat<.4||forward.dot(d.clone().setY(0).normalize())>0) && sightClear(city,player.pos.clone().add(new THREE.Vector3(0,1,0)),e.pos.clone().add(new THREE.Vector3(0,1,0)))) {victim=e;distance=flat;}
  }
  if(boss.active && player.pos.y>TOWER_H-3 && player.pos.distanceTo(boss.pos)<4) {hitBoss();return;}
  if(!victim) {tone(160,80,.08,'sine',.05);return;}
  combat.chain=combat.chain%3+1;combat.chainClock=1.5;
  if(victim.contract&&stunGuard(victim,combat.chain===3?2:1))return;
  enemyWarning(victim,false);
  victim.alive=false;victim.robotClip='';
  if(victim.mix && robotClips.Death) {
    victim.mix.stopAllAction();
    const fall=victim.mix.clipAction(robotClips.Death).reset().setLoop(THREE.LoopOnce,1);
    fall.clampWhenFinished=true;fall.timeScale=1.4;fall.play();
    victim.reactionTime=robotClips.Death.duration/1.4+.1;
  } else victim.mesh.visible=false;
  burst(victim.pos.x,victim.pos.y+1,victim.pos.z,7,eyeMaterial);
  score+=50;combo.n++;combo.clock=3;updateComboHud();renderScore();sfxHit();fxCamShake=.1;
}
function playHero(name,once=false,force=false) {
  if(!heroActions[name] || heroAction===name&&!force)return;
  if(heroActions[heroAction] && heroAction!==name)heroActions[heroAction].fadeOut(.12);
  const act=heroActions[name];act.enabled=true;act.reset().setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);
  act.clampWhenFinished=once;act.fadeIn(.12).play();heroAction=name;
  // One-shot clip and gameplay contact use the same duration.
  if(once && actionTimer>0 && actionDuration>0)act.timeScale=act.getClip().duration/actionDuration;
  else act.timeScale=1;
}
function updateAvatar(dt) {
  poseTime+=dt;
  const speedNow=Math.hypot(player.vel.x,player.vel.z);
  if(actionKind==='dance' && speedNow>.8)cancelAction();
  if(player.onGround&&!lastGrounded && !(actionTimer>0&&['shoot','punchL','punchR','hit','recover'].includes(actionKind))) {
    beginAction(player.impactSpeed>16?'landHard':'land',player.impactSpeed>16?.65:.32);
  }
  lastGrounded=player.onGround;
  if(actionTimer>0){actionAge+=dt;actionTimer=Math.max(0,actionDuration-actionAge);}
  player.webCasting=Math.max(0,(player.webCasting||0)-dt);
  player.webReleasing=Math.max(0,(player.webReleasing||0)-dt);
  let pose=player.climbing?(player.vel.y<-.1?'descend':Math.abs(player.vel.y)<.1?'wallIdle':'climb'):
    web.active?(player.webCasting>0?'cast':'swing'):
    !player.onGround?(player.webReleasing>0?'release':player.vel.y>1?'jump':'fall'):
    speedNow>10?'sprint':speedNow>.6?'walk':Math.abs(input.strafe)>.1?'turn':'idle';
  if(actionTimer>0)pose=actionKind;
  activePose=pose;
  if(player.climbing)wallGaitClock+=dt*(player.vel.y<-.1?-5:player.vel.y>.1?5:0);
  const mapping={idle:'Idle_Loop',turn:'TurnIdle',walk:'Walk_Loop',sprint:'Sprint_Loop',jump:'Jump_Start',fall:'AirFall',cast:'WebCast',release:'WebRelease',swing:'WebSwing',climb:'WallClimb',descend:'WallDescend',wallIdle:'Crouch_Idle_Loop',land:'Jump_Land',landHard:'HardLanding',shoot:'WebShoot',punchL:'Punch_Jab',punchR:'Punch_Cross',hit:'Hit_Chest',recover:'Jump_Land',roll:'Roll',dance:'Dance_Loop'};
  previewTimer=Math.max(0,previewTimer-dt);
  if(speedNow>.8||!player.onGround||actionTimer>0)previewTimer=0;
  if(importedSpider)updateSpiderAnimation(dt,pose,speedNow);
  if(heroMixer) {
    const once=['land','landHard','shoot','punchL','punchR','hit','recover','roll'].includes(pose);
    const restart=actionTimer>0 && heroEventSerial!==animationSerial;
    playHero(previewTimer>0?previewHeroClip:mapping[pose]||'Idle_Loop',previewTimer<=0&&once,restart);
    if(restart)heroEventSerial=animationSerial;
    heroMixer.update(dt);
    applyTraversalPose(dt,pose);
    applyHeroActionPose(pose);
  }
  creature.updateMatrixWorld(true);
  if(actionCallback && actionImpact>=0 && actionAge>=actionImpact) {
    const fn=actionCallback;actionCallback=null;actionImpact=-1;fn();
  }
  $('avatarState').textContent=({idle:'وقوف',turn:'التفات',walk:'مشي',sprint:'جري',jump:'قفز',fall:'سقوط',cast:'إرسال خيط',release:'إفلات الخيط',swing:'تأرجح',climb:'صعود الجدار',descend:'نزول الجدار',wallIdle:'تعلق بالجدار',land:'هبوط خفيف',landHard:'هبوط قوي',shoot:'إطلاق شبكة',punchL:'لكمة يسار',punchR:'لكمة يمين',hit:'تلقي ضربة',recover:'نهوض',roll:'تفادٍ',dance:'رقص'})[pose]||pose;
}
function updateSpiderAnimation(dt,pose,speedNow) {
  for(const part of originalCreatureParts)part.visible=false;
  importedSpider.visible=avatar==='spider';
  for(const a of spiderAccents)a.bone.quaternion.copy(a.base);
  const wall=['climb','descend','wallIdle'].includes(pose);
  if(spiderMixer)spiderMixer.update((wall?(pose==='descend'?-1.1:1.1):player.onGround?speedNow*.075:.12)*dt);
  for(const a of spiderAccents)a.base.copy(a.bone.quaternion);
  const t=actionDuration>0?clamp(actionAge/actionDuration,0,1):0;
  const pulse=Math.sin(t*Math.PI),punch=pose==='punchL'||pose==='punchR';
  const fold=pose==='fall'?.15:pose==='landHard'?-.22*pulse:pose==='shoot'?.09*pulse:punch?.14*pulse:pose==='jump'?.09:0;
  spiderAccents.forEach((a,i)=>a.bone.rotateX(fold*(i%2?1:-1)));
  importedSpider.rotation.x=damp(importedSpider.rotation.x,wall?-Math.PI/2:pose==='swing'||pose==='cast'?-.55:pose==='jump'?-.25:pose==='fall'?.24:pose==='landHard'?.25*pulse:punch?-.16*pulse:0,12,dt);
  const phase=poseTime*8;
  importedSpider.position.y=damp(importedSpider.position.y,pose==='landHard'?-.24*pulse:pose==='land'?-.1*pulse:pose==='dance'?.1+Math.sin(phase)*.1:pose==='idle'?Math.sin(phase*.25)*.035:0,12,dt);
  importedSpider.rotation.z=pose==='roll'?t*Math.PI*2:pose==='dance'?Math.sin(phase)*.16:pose==='hit'?Math.sin(t*Math.PI*3)*.14:0;
  importedSpider.position.z=wall?.1:punch?-.55*pulse:pose==='shoot'?Math.sin(t*Math.PI*2)*.08:pose==='hit'?.22*pulse:0;
}
function applyHeroActionPose(pose) {
  const t=actionDuration>0?clamp(actionAge/actionDuration,0,1):0,pulse=Math.sin(t*Math.PI);
  if(pose==='shoot') {
    if(shotTarget && (shotTarget===boss?boss.active:shotTarget.alive))shotAim.copy(shotTarget.pos).add(new THREE.Vector3(0,1.25,0));
    const shoulder=heroBones.upperR?.getWorldPosition(new THREE.Vector3());
    if(shoulder){const target=shoulder.clone().add(shotAim.clone().sub(shoulder).normalize().multiplyScalar(.72));const elbow=shoulder.clone().lerp(target,.5);elbow.y-=.08;aimJoint(heroBones.upperR,heroBones.foreR,elbow);aimJoint(heroBones.foreR,heroBones.handR,target);}
  }
  if(pose==='fall'||pose==='release') {
    for(const [side,sign] of [['L',-1],['R',1]]) {
      const arm=heroBones['upper'+side];if(!arm)continue;
      const shoulder=arm.getWorldPosition(new THREE.Vector3());
      const target=shoulder.clone().add(new THREE.Vector3(sign*.48,.22,-.12).applyAxisAngle(UP,player.heading));
      aimJoint(arm,heroBones['fore'+side],target,.7);
    }
  }
  if(pose==='landHard') {
    heroRoot.position.y=-.15*pulse;heroRoot.rotation.x=.3*pulse;
  }else heroRoot.position.y=0;
  // Punch/crouch/hit motion comes from the imported skeletal clips, not a root-only substitute.
}

// Stable bone aiming: preserve imported local hierarchy and limb lengths.
function aimJoint(bone, child, target, weight=1) {
  if(!bone||!child||!bone.parent)return;
  creature.updateMatrixWorld(true);
  const a=bone.getWorldPosition(new THREE.Vector3()),b=child.getWorldPosition(new THREE.Vector3());
  const from=b.sub(a).normalize(),to=target.clone().sub(a).normalize();
  if(from.lengthSq()<.5||to.lengthSq()<.5)return;
  const world=bone.getWorldQuaternion(new THREE.Quaternion());
  const turn=new THREE.Quaternion().setFromUnitVectors(from,to);
  const local=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn.multiply(world));
  bone.quaternion.slerp(local,weight);bone.updateMatrixWorld(true);
}
function applyTraversalPose(dt,pose=activePose) {
  if(!heroRoot)return;
  const climb=['climb','descend','wallIdle'].includes(pose),swing=['swing','cast'].includes(pose);
  heroRoot.rotation.x=damp(heroRoot.rotation.x,swing?-.16:0,8,dt);
  heroRoot.rotation.z=damp(heroRoot.rotation.z,swing?Math.sin(poseTime*2)*.06:0,8,dt);
  if(!climb&&!swing)return;
  creature.updateMatrixWorld(true);
  for(const [suffix,side] of [['L',-1],['R',1]]) {
    const upper=heroBones['upper'+suffix],fore=heroBones['fore'+suffix],hand=heroBones['hand'+suffix];
    if(!upper||!fore||!hand)continue;
    const shoulder=upper.getWorldPosition(new THREE.Vector3());
    let target;
    if(swing){
      target=shoulder.clone().add(web.anchor.clone().sub(shoulder).normalize().multiplyScalar(.72));
      target.x+=side*.055;
    }else{
      const n=player.wallNormal||{x:0,z:1},wave=Math.sin(wallGaitClock+side*Math.PI/2);
      target=new THREE.Vector3(player.pos.x-n.x*.4+side*n.z*.28,player.pos.y+1.48+wave*.18,player.pos.z-n.z*.4-side*n.x*.28);
    }
    // Bent elbow target, then forearm reaches the contact/rope direction.
    const elbow=shoulder.clone().lerp(target,.52);elbow.y-=.055;
    aimJoint(upper,fore,elbow,.95);aimJoint(fore,hand,target,.95);
    if(climb) {
      const n=player.wallNormal||{x:0,z:1},phase=Math.sin(wallGaitClock-side*Math.PI/2);
      const knee=new THREE.Vector3(player.pos.x+n.x*.05+side*n.z*.2,player.pos.y+.6+phase*.13,player.pos.z+n.z*.05-side*n.x*.2);
      const foot=knee.clone();foot.y=player.pos.y+.15+phase*.13;foot.x-=n.x*.38;foot.z-=n.z*.38;
      aimJoint(heroBones['thigh'+suffix],heroBones['shin'+suffix],knee,.85);
      aimJoint(heroBones['shin'+suffix],heroBones['foot'+suffix],foot,.85);
    }
  }
}
function updateCityLOD() {
  if(!cityDetailBatches.length||!fallbackCityMesh)return;
  const center=mode==='menu'?camera.position:player.pos;
  const radius=SET.quality==='low'?100:SET.quality==='med'?165:240;
  const near=b=>Math.hypot(b.x-center.x,b.z-center.z)<radius || b.tower;
  const m=new THREE.Matrix4();
  for(const batch of cityDetailBatches) {
    let n=0;
    for(const b of batch.matches)if(near(b)) {
      m.makeScale(b.w/batch.sz.x,b.h/batch.sz.y,b.d/batch.sz.z);m.setPosition(b.x,0,b.z);batch.im.setMatrixAt(n++,m);
    }
    batch.im.count=n;batch.im.instanceMatrix.needsUpdate=true;
    // Static full-city bounding sphere from initial instances stays conservative.
  }
  city.buildings.forEach((b,i)=>{
    if(near(b))m.makeScale(0,0,0);
    else {m.makeScale(b.w,b.h,b.d);m.setPosition(b.x,b.h/2,b.z);}
    fallbackCityMesh.setMatrixAt(city.lots.length+i,m);
  });
  fallbackCityMesh.instanceMatrix.needsUpdate=true;
}

async function importCityBlocks() {
  const names = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','skyscraper-a','skyscraper-b','skyscraper-c','skyscraper-d','skyscraper-e'];
  try {
    const models = await Promise.all(names.map(n=>loadGLB('models/city/building-'+n+'.glb',30000)));
    const group = new THREE.Group(); group.name='Imported playable districts';
    for(let t=0;t<models.length;t++) {
      const root=models[t].scene; root.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(root), sz=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
      const matches=city.buildings.filter(b=>b.style===t);
      root.traverse(o=>{
        if(!o.isMesh || !matches.length) return;
        const geo=o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
        geo.translate(-center.x,-box.min.y,-center.z);
        const mat=o.material.clone();mat.color.multiplyScalar(.76); mat.roughness=.7; mat.metalness=.12;
        const im=new THREE.InstancedMesh(geo,mat,matches.length), m=new THREE.Matrix4();
        matches.forEach((b,i)=>{m.makeScale(b.w/sz.x,b.h/sz.y,b.d/sz.z);m.setPosition(b.x,0,b.z);im.setMatrixAt(i,m);});
        im.instanceMatrix.needsUpdate=true; im.computeBoundingSphere(); group.add(im);
        cityDetailBatches.push({im,matches,sz});
      });
    }
    scene.add(group); fallbackCityMesh.visible=true;updateCityLOD();
    // Matching sidewalks and clear eight-metre street corridors.
    const walk=new THREE.InstancedMesh(new THREE.BoxGeometry(23,.28,23),new THREE.MeshStandardMaterial({color:0x4b5362,roughness:.95}),city.lots.length);
    const m=new THREE.Matrix4();city.lots.forEach((l,i)=>{m.makeTranslation(l.x,.05,l.z);walk.setMatrixAt(i,m);walk.setColorAt(i,new THREE.Color(l.park?0x52764e:0xffffff))});scene.add(walk);
    const marks=[];
    for(let x=-1215;x<=1215;x+=30) for(let z=-1230;z<=1230;z+=10){ marks.push(x,.015,z,x,.015,z+3); marks.push(z,.016,x,z+3,.016,x); }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(marks,3));scene.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x9da695})));
    toast(`أحياء اللعب جاهزة: ${city.buildings.length} مبنى مستورد • 19 تصميمًا • شوارع متصلة`);
  } catch(err) { console.warn('city modules',err.message); toast('تعذر تحميل بعض المباني؛ المدينة الاحتياطية متاحة'); }
}

// Offline world simulation: solar cycle, weather and lane-following traffic.
let skyDome=null, skyUniforms=null, carDraws=[];
const clockSky = new THREE.Color(), nightSky = new THREE.Color(0x081124), daySky = new THREE.Color(0x88b4d3);
function initLivingWorld() {
  skyUniforms={uDay:{value:1},uCloud:{value:0},uSun:{value:new THREE.Vector3(0,1,0)}};
  skyDome=new THREE.Mesh(new THREE.SphereGeometry(1500,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,uniforms:skyUniforms,
    vertexShader:'varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 vDirection;uniform float uDay,uCloud;uniform vec3 uSun;
    void main(){vec3 d=normalize(vDirection);float h=clamp(d.y*.8+.15,0.,1.);
    vec3 top=mix(vec3(.007,.013,.035),vec3(.16,.39,.68),uDay);
    vec3 horizon=mix(vec3(.03,.045,.08),vec3(.60,.73,.82),uDay);
    vec3 col=mix(horizon,top,h);col=mix(col,vec3(.2,.24,.29)*(.3+uDay*.7),uCloud*.6);
    float sun=smoothstep(.9992,.9998,dot(d,uSun));col+=vec3(1.,.80,.40)*sun*uDay*(1.-uCloud*.8);
    float moon=smoothstep(.99955,.9998,dot(d,-uSun));col+=vec3(.48,.61,.81)*moon*(1.-uDay);
    float stars=step(.9988,fract(sin(dot(floor(d.xz*1700.),vec2(12.98,78.23)))*43758.54))*step(.12,d.y);
    col+=vec3(stars*.5*(1.-uDay)*(1.-uCloud));gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`}));skyDome.renderOrder=-1000;skyDome.frustumCulled=false;scene.add(skyDome);
  // Rounded loops stay in the 8-metre road corridors; adjacent cars share a lane.
  const rng=makeRand(6991);
  for(let gx=-3;gx<=3;gx++)for(let gz=-3;gz<=3;gz++) {
    const x0=gx*300-73,x1=gx*300+73,z0=gz*300-73,z1=gz*300+73,r=2;
    const corners=[[x1-r,z0+r,-Math.PI/2],[x1-r,z1-r,0],[x0+r,z1-r,Math.PI/2],[x0+r,z0+r,Math.PI]];
    const points=[new THREE.Vector3(x0+r,0,z0)];
    for(const [cx,cz,start] of corners){for(let j=0;j<=8;j++){const a=start+j*Math.PI/16;points.push(new THREE.Vector3(cx+Math.cos(a)*r,0,cz+Math.sin(a)*r));}}
    const segments=[],lengths=[];let total=0;
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];const len=a.distanceTo(b);if(len<.001)continue;segments.push({a,b,len,start:total});total+=len;lengths.push(total);}
    const route={segments,total,cars:[]};trafficRoutes.push(route);
    for(let i=0;i<8;i++){const car={route,s:(i/8)*total,speed:0,maxSpeed:7+rng()*3,pos:new THREE.Vector3(),dir:new THREE.Vector3(0,0,1),color:new THREE.Color([0xc04f53,0x319e9d,0xd6b34a,0x6287b1,0xd6d8dd][Math.floor(rng()*5)])};route.cars.push(car);cars.push(car);sampleCar(car);}
  }
  const make=(geo,material,offsets)=>{const mesh=new THREE.InstancedMesh(geo,material,cars.length*offsets.length);mesh.frustumCulled=false;scene.add(mesh);carDraws.push({mesh,offsets});return mesh;};
  const body=make(new THREE.BoxGeometry(1.8,.57,3.65),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.35,metalness:.3}),[[0,.57,0]]);body.userData.paint=true;
  make(new THREE.BoxGeometry(1.5,.65,1.75),new THREE.MeshStandardMaterial({color:0x20374a,roughness:.18,metalness:.4}),[[0,1.16,-.12]]);
  make(new THREE.CylinderGeometry(.31,.31,.18,10).rotateZ(Math.PI/2),new THREE.MeshStandardMaterial({color:0x11151c,roughness:.9}),[[-.94,.31,-1.15],[.94,.31,-1.15],[-.94,.31,1.15],[.94,.31,1.15]]);
  const head=new THREE.MeshStandardMaterial({color:0xfff0bf,emissive:0xffe7a0,emissiveIntensity:.2});head.userData.headlight=true;
  make(new THREE.BoxGeometry(.38,.14,.06),head,[[-.55,.62,1.84],[.55,.62,1.84]]);
  make(new THREE.BoxGeometry(.34,.12,.06),new THREE.MeshStandardMaterial({color:0xb02025,emissive:0xd02018,emissiveIntensity:.6}),[[-.58,.63,-1.84],[.58,.63,-1.84]]);
  make(new THREE.PlaneGeometry(2.2,4.1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.24,depthWrite:false}),[[0,.025,0]]);
  // Signal props at route corners; all cross streets obey the same two-phase rule.
  for(const route of trafficRoutes){for(const segment of route.segments.filter(s=>s.len>100)){
    const p=segment.b;const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,3.1,5),new THREE.MeshStandardMaterial({color:0x384452}));pole.position.set(p.x+1.3,1.55,p.z+1.3);scene.add(pole);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.17,6,5),new THREE.MeshBasicMaterial({color:0xff4433}));bulb.position.copy(pole.position);bulb.position.y=3.15;scene.add(bulb);streetLights.push({pole,bulb,axis:Math.abs(segment.a.x-p.x)>5?'x':'z'});
  }}
  // Low-cost trees in two actual open parks.
  const parkLots=city.lots.filter(l=>l.park),trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.3,2.8,5),new THREE.MeshStandardMaterial({color:0x72573e}),parkLots.length),leaf=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.3,0),new THREE.MeshStandardMaterial({color:0x365f43,roughness:1}),parkLots.length);
  const m=new THREE.Matrix4();parkLots.forEach((l,i)=>{m.makeTranslation(l.x,1.4,l.z);trunk.setMatrixAt(i,m);m.makeScale(1,1.25,1);m.setPosition(l.x,4,l.z);leaf.setMatrixAt(i,m);});scene.add(trunk,leaf);
  updateLivingWorld(0);
}
function sampleCar(car) {
  const s=((car.s%car.route.total)+car.route.total)%car.route.total;
  const seg=car.route.segments.find(seg=>s<seg.start+seg.len)||car.route.segments[0];
  car.pos.copy(seg.a).lerp(seg.b,clamp((s-seg.start)/seg.len,0,1));car.dir.copy(seg.b).sub(seg.a).normalize();
}
function trafficGreen(axis) {
  const phase=trafficClock%24;
  if(phase<1||phase>12&&phase<13)return false;
  return axis==='x'?phase>=13:phase>=1&&phase<=12;
}
function updateTraffic(dt) {
  trafficClock+=dt;
  for(const route of trafficRoutes)for(const car of route.cars){
    let target=car.maxSpeed,allowed=Infinity;
    for(const other of route.cars)if(other!==car){const gap=(other.s-car.s+route.total)%route.total;if(gap<20){target=Math.min(target,Math.max(0,(gap-6)*.7));allowed=Math.min(allowed,Math.max(0,gap-5.8));}}
    const axis=Math.abs(car.dir.x)>.95?'x':Math.abs(car.dir.z)>.95?'z':null;
    if(axis&&!trafficGreen(axis)){
      const p=car.pos[axis],sign=Math.sign(car.dir[axis]);
      const next=15+(sign>0?Math.ceil((p-15+.01)/30):Math.floor((p-15-.01)/30))*30;
      const distance=(next-p)*sign;
      if(distance>=3.25 && distance<18){const stop=Math.max(0,distance-3.4);target=Math.min(target,Math.sqrt(6*stop));allowed=Math.min(allowed,stop);}
    }
    if(mode==='play'&&player.pos.y<1.6){const delta=player.pos.clone().sub(car.pos),ahead=delta.dot(car.dir),lateral=Math.abs(delta.x*car.dir.z-delta.z*car.dir.x);if(ahead>0&&ahead<12&&lateral<1.7){const stop=Math.max(0,ahead-3);target=Math.min(target,Math.sqrt(8*stop));allowed=Math.min(allowed,stop);}}
    car.speed+=clamp(target-car.speed,-5*dt,2.5*dt);
    const advance=Math.min(allowed,Math.max(0,car.speed*dt));if(dt>0&&advance<car.speed*dt)car.speed=advance/dt;
    car.s=(car.s+advance)%route.total;sampleCar(car);
  }
  const center=mode==='menu'?camera.position:player.pos,radius=SET.quality==='low'?160:260;
  const active=cars.filter(c=>Math.hypot(c.pos.x-center.x,c.pos.z-center.z)<radius);
  const base=new THREE.Matrix4(),offset=new THREE.Matrix4(),out=new THREE.Matrix4();
  for(const draw of carDraws){let i=0;for(const car of active){base.makeRotationY(Math.atan2(car.dir.x,car.dir.z));base.setPosition(car.pos);for(const p of draw.offsets){offset.makeTranslation(...p);out.multiplyMatrices(base,offset);draw.mesh.setMatrixAt(i,out);if(draw.mesh.userData.paint)draw.mesh.setColorAt(i,car.color);i++;}}draw.mesh.count=i;draw.mesh.instanceMatrix.needsUpdate=true;if(draw.mesh.instanceColor)draw.mesh.instanceColor.needsUpdate=true;}
  for(const s of streetLights){const near=s.pole.position.distanceTo(center)<radius;s.pole.visible=near;s.bulb.visible=near;s.bulb.material.color.setHex(trafficGreen(s.axis)?0x40e39a:0xef4938);}
}
function handleCarContact() {
  if(player.pos.y>1.35)return;
  for(const car of cars){
    const dx=player.pos.x-car.pos.x,dz=player.pos.z-car.pos.z;if(Math.abs(dx)>3||Math.abs(dz)>3)continue;
    const localX=dx*car.dir.z-dz*car.dir.x,localZ=dx*car.dir.x+dz*car.dir.z;
    if(Math.abs(localX)>=1.25||Math.abs(localZ)>=2.35)continue;
    const sx=Math.sign(localX)||1,sz=Math.sign(localZ)||1;
    if(1.25-Math.abs(localX)<2.35-Math.abs(localZ)){const push=sx*(1.25-Math.abs(localX));player.pos.x+=car.dir.z*push;player.pos.z-=car.dir.x*push;}
    else{const push=sz*(2.35-Math.abs(localZ));player.pos.addScaledVector(car.dir,push);}
    collidePush(city,player.pos,.42);
    if(car.speed>3&&invuln<=0){invuln=1.6;damagePlayer(1);player.vel.addScaledVector(car.dir,4);toast('اصطدام! السيارات تفرمل للمشاة، لكن الاقتراب الجانبي خطر.');}
  }
}
function updateLivingWorld(dt) {
  if(!skyUniforms)return;
  if(SET.timeMode==='auto')worldHour=(worldHour+dt*24/(Math.max(4,SET.dayMinutes)*60))%24;
  else worldHour=SET.timeMode==='day'?12:SET.timeMode==='sunset'?18:0;
  weatherClock+=dt;
  const weather=SET.weather==='rain'?2:SET.weather==='clear'?0:Math.floor(weatherClock/180)%3;
  weatherWet=damp(weatherWet,weather===2?1:0,.12,dt);
  const cloud=weather===0?0:weather===1?.55:.85;
  const angle=(worldHour-6)/24*Math.PI*2,elevation=Math.sin(angle),day=THREE.MathUtils.smoothstep(elevation,-.13,.18);
  const dir=new THREE.Vector3(Math.cos(angle)*.85,elevation,Math.cos(angle)*.45).normalize();
  skyUniforms.uDay.value=day;skyUniforms.uCloud.value=cloud;skyUniforms.uSun.value.copy(dir);skyDome.position.copy(camera.position);
  nightUniform.value=1-day;
  hemi.color.set(day>.5?0xbfdfff:0x657eac);hemi.groundColor.set(day>.5?0x8c988a:0x142238);hemi.intensity=lerp(.55,2.3,day)*(1-cloud*.2);
  moon.position.copy(dir).multiplyScalar(day>.1?800:-800);moon.color.set(day>.1?0xffedce:0x8aaae2);moon.intensity=lerp(.3,2.5,day)*(1-cloud*.6);
  cityGlow.intensity=.08+(1-day)*.2;
  clockSky.copy(nightSky).lerp(daySky,day).lerp(new THREE.Color(0x62798b),cloud*.3);scene.fog.color.copy(clockSky);scene.fog.density=(SET.quality==='low'?.0022:.0015)+cloud*.0008;
  rain.visible=weatherWet>.03;rain.material.opacity=.32*weatherWet;rainGeo.setDrawRange(0,Math.floor(rainActive*weatherWet)*2);
  groundMesh.material.roughness=lerp(.95,.35,weatherWet);
  for(const d of carDraws)if(d.mesh.material.userData.headlight)d.mesh.material.emissiveIntensity=.15+(1-day)*3;
  updateTraffic(dt);
  const h=Math.floor(worldHour),m=Math.floor((worldHour-h)*60);
  $('worldClock').textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} • ${['صحو','غائم','مطر'][weather]}`;
  $('worldDistrict').textContent=districtAt(player.pos.x,player.pos.z);
}
function toggleWorldMap() {
  if(mode!=='play'||uiBusy)return;
  worldMapOpen=!worldMapOpen;$('worldMapPanel').classList.toggle('hidden',!worldMapOpen);
  if(worldMapOpen){clearControls();setPaused(true);$('pause').classList.add('hidden');drawWorldMap();}else setPaused(false);
}
function drawWorldMap() {
  const canvas=$('worldMapCanvas'),c=canvas.getContext('2d'),S=700,k=S/(WORLD_LIMIT*2+60);
  c.fillStyle='#101d2e';c.fillRect(0,0,S,S);c.save();c.translate(S/2,S/2);
  for(const l of city.lots)if(l.park){c.fillStyle='#416c53';c.fillRect((l.x-11)*k,(l.z-11)*k,22*k,22*k);}
  for(const b of city.buildings){c.fillStyle=b.tower?'#f7cd66':b.h>70?'#68abb9':'#536478';c.fillRect((b.x-b.w/2)*k,(b.z-b.d/2)*k,Math.max(2,b.w*k),Math.max(2,b.d*k));}
  for(const p of parts)if(!p.taken){c.fillStyle='#ffe493';c.beginPath();c.arc(p.mesh.position.x*k,p.mesh.position.z*k,4,0,7);c.fill();}
  for(const site of patrolSites){c.fillStyle=combat.completed.includes(site.id)?'#617b78':'#78e0c6';c.fillRect(site.x*k-4,site.z*k-4,8,8);}
  c.fillStyle='#ff7c87';c.beginPath();c.arc(player.pos.x*k,player.pos.z*k,6,0,7);c.fill();c.strokeStyle='white';c.stroke();
  c.restore();$('worldMapInfo').textContent=`${(WORLD_LIMIT*2/1000).toFixed(2)} × ${(WORLD_LIMIT*2/1000).toFixed(2)} كم • ${city.buildings.length} مبنى • ${cars.length} سيارة مرور • اللون الذهبي: أهداف المهمة`;
}

// v1.7 playable progression slice: real-anchor burst, readable combat, three patrols.
function startWebBurst(){
  if(paused||uiBusy||player.onGround||combat.zipCd>0||combat.focus<25)return;
  if(!web.active)attachWeb();if(!web.active)return;
  combat.focus-=25;combat.zipCd=3;player.zipTime=.95;
  toast('اندفاعة خيط — اتجاه الواجهة الحقيقية، بدون انتقال فوري');
}
function dodge(){
  if(paused||uiBusy||!player.onGround||combat.dodgeCd>0||combat.focus<12)return;
  const dx=-Math.sin(camYaw)*input.forward+Math.cos(camYaw)*input.strafe;
  const dz=-Math.cos(camYaw)*input.forward-Math.sin(camYaw)*input.strafe;
  player.dodgeDir=new THREE.Vector3(dx,0,dz);
  if(player.dodgeDir.lengthSq()<.1)player.dodgeDir.set(Math.sin(player.heading),0,Math.cos(player.heading));
  player.dodgeDir.normalize();player.dodgeTime=.30;
  combat.focus-=12;combat.dodgeCd=.85;combat.queue=false;
  cancelAction();beginAction('roll',.5);invuln=Math.max(invuln,.28);
}
function nearestPatrol(){return patrolSites.filter(s=>!combat.completed.includes(s.id)).sort((a,b)=>Math.hypot(a.x-player.pos.x,a.z-player.pos.z)-Math.hypot(b.x-player.pos.x,b.z-player.pos.z))[0];}
function startPatrol(){
  if(paused||uiBusy||combat.patrol)return;
  const site=nearestPatrol();if(!site){toast('حررت الدوريات الثلاث!');return;}
  const d=Math.hypot(site.x-player.pos.x,site.z-player.pos.z);
  if(d>35||player.pos.y>3){toast(`${site.name}: اقترب من علامة الشارع — ${Math.round(d)}م`);return;}
  combat.patrol={id:site.id,wave:1,between:0};spawnPatrolWave(site);toast('دورية الحي: موجتان. الدائرة البرتقالية تحذّر من الضربة؛ R للمراوغة.');
}
function spawnPatrolWave(site){
  for(let i=0;i<3;i++){
    const e=enemies[i];if(e.cocoon){scene.remove(e.cocoon);e.cocoon=null;}
    e.contract=site.id;e.hp=3;e.alive=true;e.mesh.visible=true;e.stun=.6;e.windup=0;e.attackCd=.8+i*.35;e.reactionTime=0;e.robotClip='';
    if(e.mix)e.mix.stopAllAction();
    e.pos.set(site.x+[4,-4,0][i],0,site.z+[0,4,-5][i]);collidePush(city,e.pos,.55);e.mesh.position.copy(e.pos);e.target.copy(e.pos);guardHealthBar(e);
  }
}
function stunGuard(e,amount){
  e.hp=Math.max(0,(e.hp||3)-amount);e.stun=.6;e.windup=0;e.attackCd=1;
  if(e.warning)e.warning.visible=false;
  burst(e.pos.x,e.pos.y+1,e.pos.z,5,eyeMaterial);
  guardHealthBar(e);combat.hitText=`حارس: ${e.hp}/3 • ${combat.chain===3?'ضربة ختامية':'تابع الهجوم أو راوغ'}`;combat.hitTextTime=1.2;
  if(e.hp>0)return true;
  return false;
}
function guardHealthBar(e){
  if(!e.healthBar){const c=document.createElement('canvas');c.width=96;c.height=16;e.healthCanvas=c;const tex=new THREE.CanvasTexture(c);e.healthBar=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true}));e.healthBar.scale.set(1.1,.18,1);scene.add(e.healthBar);}
  const c=e.healthCanvas.getContext('2d');c.clearRect(0,0,96,16);
  for(let i=0;i<3;i++){c.fillStyle=i<e.hp?'#8feac7':'#354658';c.fillRect(i*32+2,2,28,12);}
  e.healthBar.material.map.needsUpdate=true;e.healthBar.visible=e.hp>0;e.healthBar.position.copy(e.pos).add(new THREE.Vector3(0,2.6,0));
}
function enemyWarning(e,on){
  if(on&&!e.warning){e.warning=new THREE.Mesh(new THREE.RingGeometry(.8,1,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xff9a45,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));scene.add(e.warning);}
  if(e.warning){e.warning.visible=on;e.warning.position.copy(e.pos);e.warning.position.y+=.045;e.warning.scale.setScalar(1+(1-Math.max(0,e.windup)/.72)*1.4);}
}
function updateCombat(dt){
  combat.zipCd=Math.max(0,combat.zipCd-dt);combat.dodgeCd=Math.max(0,combat.dodgeCd-dt);
  const level=combat.xp>=500?3:combat.xp>=250?2:1,maxFocus=100+(level-1)*25;
  combat.focus=Math.min(maxFocus,combat.focus+dt*(player.zipTime>0?0:9));
  combat.chainClock=Math.max(0,combat.chainClock-dt);if(!combat.chainClock)combat.chain=0;
  if(combat.queue&&actionTimer<=0){combat.queue=false;meleeAttack();}
  let objective='';
  const task=combat.patrol;
  if(task){
    const site=patrolSites.find(s=>s.id===task.id),left=enemies.filter(e=>e.contract===task.id&&e.alive).length;
    if(Math.hypot(player.pos.x-site.x,player.pos.z-site.z)>95){endPatrol(false);toast('ابتعدت عن الدورية؛ يمكنك إعادة المحاولة عند علامتها.');}
    else if(left===0){
      task.between+=dt;
      if(task.between>1.5){if(task.wave===1){task.wave=2;task.between=0;spawnPatrolWave(site);toast('الموجة الثانية وصلت');}else{endPatrol(true);}}
    }
    objective=`${site.name} • الموجة ${task.wave}/2 • ${left} حراس متبقين`;
  }else{const site=nearestPatrol();objective=site?`${site.name} • ${Math.round(Math.hypot(site.x-player.pos.x,site.z-player.pos.z))}م • N للبدء`:'الدوريات الثلاث محررة ✓';}
  $('combatStats').textContent=`مستوى ${level} • خبرة ${combat.xp} • تركيز ${Math.floor(combat.focus)}/${maxFocus}`;
  $('combatObjective').textContent=objective;
  combat.hitTextTime=Math.max(0,(combat.hitTextTime||0)-dt);
  $('combatHint').textContent=combat.hitTextTime>0?combat.hitText:`J هجوم متسلسل${combat.chain?' '+combat.chain+'/3':''} • R مراوغة • X اندفاعة في الهواء`;
  for(const site of patrolSites){if(!site.marker)continue;site.marker.visible=!combat.completed.includes(site.id);site.marker.rotation.y+=dt*.4;}
}
function endPatrol(success){
  if(!combat.patrol)return;
  const id=combat.patrol.id;
  for(const e of enemies)if(e.contract===id){e.alive=false;e.mesh.visible=false;e.contract=null;e.hp=1;if(e.healthBar)e.healthBar.visible=false;enemyWarning(e,false);}
  combat.patrol=null;
  if(success&&!combat.completed.includes(id)){combat.completed.push(id);combat.xp+=250;score+=350;hp=Math.min(5,hp+2);renderHp();renderScore();toast('الدورية تحررت! +250 خبرة، +350 نقطة، واستعادة قلبين.');}
  saveAll();
}
function initPatrols(){
  for(const site of patrolSites){const m=new THREE.Mesh(new THREE.TorusGeometry(2,.10,6,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x78e0c6}));m.position.set(site.x,.08,site.z);site.marker=m;scene.add(m);}
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
const SET = { weather:"auto",dayMinutes:12,timeMode:"auto",quality: "high", sens: 1, fov: 66, sfx: .8, mus: .5, showFps: 0 };
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
  scene.fog.density = SET.quality === "low" ? .0027 : .0018;
  rainActive = SET.quality === "low" ? 130 : SET.quality === "med" ? 280 : RAIN_COUNT;
  rainGeo.setDrawRange(0, rainActive * 2);
  $("fpsBox").classList.toggle("hidden", !SET.showFps);
  if (skyline) skyline.visible = SET.quality !== "low";
  updateCityLOD();
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
  endPatrol(false);player.dodgeTime=0;player.zipTime=0;combat.queue=false;
  beginAction('recover',.95);
  releaseWeb();
  let best = city.lots[0], bd = 1e9;
  for (const l of city.lots) {
    const d = (l.x - player.pos.x) ** 2 + (l.z - player.pos.z) ** 2;
    if (d < bd) { bd = d; best = l; }
  }
  player.pos.set(best.x, groundAt(city, best.x, best.z) + .2, best.z);
  player.vel.set(0, 0, 0);
  player.climbing=false;player.wallCooldown=0;input.climb=false;releaseWeb();player.vel.set(0,0,0);player.webCasting=0;player.webReleasing=0;
  player.onGround = true;
  hp = 3; invuln = 3;
  combo.n = 0; combo.clock = 0; updateComboHud();
  fxCamShake = .55; fxSlow = .35;
  renderHp(); saveAll();
  sfxDown();
  toast("سقط لَزِج… نهض في نقطة آمنة — البقاء في الأمان يشفيك تدريجيًا");
}
function damagePlayer(n) {
  combat.chain=0;combat.chainClock=0;combat.queue=false;player.dodgeTime=0;
  beginAction('hit',.45);
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
  race.cps = cps; race.idx = 0; race.t = 52; race.elapsed=0; race.active = true;
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
  race.elapsed=(race.elapsed||0)+dt;
  const b = race.cps[race.idx];
  if (b) {
    const d = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
    if (d < 3.6 && Math.abs(player.pos.y-(b.h+1.4)) < 3.3) {
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
        const spent = race.elapsed;
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
  $("pause").classList.toggle("hidden", !paused || worldMapOpen);
  if (paused) {
    clearControls();
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
  endPatrol(false);Object.assign(combat,{focus:100,xp:0,completed:[],patrol:null,chain:0,chainClock:0,queue:false,zipCd:0,dodgeCd:0});player.dodgeTime=0;player.zipTime=0;
  for(const e of enemies){e.hp=1;e.contract=null;e.windup=0;e.stun=0;e.attackCd=0;enemyWarning(e,false);}
  cancelAction();lastGrounded=false;player.webCasting=0;player.webReleasing=0;
  for (let i = 0; i < parts.length; i++) {
    parts[i].taken = false;
    parts[i].mesh.visible = true;
    parts[i].halo.visible = true;
  }
  for(const e of enemies){e.reactionTime=0;if(e.mix)e.mix.stopAllAction();e.robotClip='';e.alive=true;e.aggro=false;e.mesh.visible=true;if(e.cocoon){scene.remove(e.cocoon);e.cocoon=null;}e.retarget();}
  for(const f of flecks)fxGroup.remove(f.m);flecks.length=0;
  if(boss.mesh)boss.mesh.visible=false;
  partsGot = 0;
  mission = "find";
  hp = 5; score = 0; scoreShown = 0;
  renderHp(); renderScore();
  player.pos.set(46, 0, 120);
  player.pos.y = groundAt(city, player.pos.x, player.pos.z);
  player.vel.set(0, 0, 0);
  player.climbing=false;player.wallCooldown=0;input.climb=false;releaseWeb();player.vel.set(0,0,0);player.webCasting=0;player.webReleasing=0;
  player.onGround = true;
  firstPerson = false; creature.visible = true;
  camPitch = 0; camYaw = .3626;
  if (boss.active) { boss.active = false; boss.ring.visible = false; $("bossWrap").classList.add("hidden"); }
  if (race.active) abortRace("—");
  try { localStorage.removeItem("lazij-open"); } catch {}
}
function startRun(fresh) {
  cancelAction();
  initAudio();
  $("wPause").classList.remove("hidden");
  if (fresh) resetRun();
  mode = "play";
  paused=false;clearControls();
  $("avatarPanel").classList.remove("hidden");
  $("menu").classList.add("hidden");
  $("pause").classList.add("hidden");
  saveAll();
  openStory(INTRO, 0);
}
function quitToTitle() {
  $("avatarPanel").classList.add("hidden");
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

$('mapClose').onclick=toggleWorldMap;
$('mapOpen').onclick=toggleWorldMap;
for(const [id,key] of [['setTime','timeMode'],['setDayLength','dayMinutes'],['setWeather','weather']]){
  $(id).value=String(SET[key]);$(id).onchange=e=>{SET[key]=key==='dayMinutes'?+e.target.value:e.target.value;saveSettings();updateLivingWorld(0);};
}
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
$('avatarSwitch').onclick = switchAvatar;
initLivingWorld();
initPatrols();
requestAnimationFrame(animate);
importModels();

window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
  applySettings();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
