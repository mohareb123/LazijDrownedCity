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
TAIL = 'const city=buildCity(makeRand(2076));\nconst pass={};\nfunction reset(x=45,y=0,z=45){Object.assign(input,{climb:false,forward:0,strafe:0,sprint:false});web.active=false;player.pos.set(x,y,z);player.vel.set(0,0,0);player.onGround=y===0;player.wallCooldown=0;wantJump=false;}\npass.citySize=city.buildings.length>6000&&WORLD_LIMIT===1230;\npass.distinctDistricts=city.buildings.some(b=>b.h>150)&&city.buildings.some(b=>Math.abs(b.x)>1000&&b.h<15)&&city.lots.some(l=>l.park);\npass.nonOverlapping=city.buildings.every(b=>b.w<=26&&b.d<=26)&&new Set(city.buildings.map(b=>`${b.x},${b.z}`)).size===city.buildings.length;\npass.noAirAnchor=pickAnchor({index:new Map(),cells:new Map()},new THREE.Vector3(0,10,0),new THREE.Vector3(1,0,0))===null;\nconst a=pickAnchor(city,new THREE.Vector3(15,30,0),new THREE.Vector3(-1,0,0));\npass.realAnchor=!!a&&a.real&&a.building===city.buildings.find(b=>b.tower)&&Math.abs(a.p.x-13.08)<.001;\nreset(15,30,0);fwdVec.set(-1,0,0);player.vel.set(3,-2,4);const v=player.vel.clone();attachWeb();pass.attachNoImpulse=web.active&&v.equals(player.vel)&&Math.abs(web.len-player.pos.distanceTo(web.anchor))<1e-8;releaseWeb();pass.releaseMomentum=v.equals(player.vel)&&!web.active;\nreset(45,100,45);for(let i=0;i<60;i++)stepPlayer(1/60);pass.gravity=Math.abs(player.vel.y+9.81)<1e-7&&Math.abs(player.pos.y-95.054125)<.01;\nconst sixty=player.pos.clone();reset(45,100,45);for(let i=0;i<30;i++)stepPlayer(1/30);pass.frameRateIndependent=player.pos.distanceTo(sixty)<1e-7;\nreset();wantJump=true;let apex=0;for(let i=0;i<140;i++){stepPlayer(1/60);apex=Math.max(apex,player.pos.y);}pass.jumpAndLand=apex>2.4&&apex<2.6&&player.onGround&&player.pos.y===0;\nreset(13.8,4,0);player.vel.set(-7,0,0);stepPlayer(.1);pass.wallNotRoof=player.pos.x>=13.4&&player.pos.y<5&&!player.onGround;\nreset(0,180.03,0);player.vel.y=-8;stepPlayer(.1);pass.crossedRoof=player.pos.y===180&&player.onGround;\nreset(0,4,0);stepPlayer(.1);pass.insideWallNoTeleport=player.pos.y<4&&Math.hypot(player.pos.x,player.pos.z)>13;\nreset(13.52,2,0);input.climb=true;for(let i=0;i<1650&&!player.onGround;i++)stepPlayer(1/60);pass.climbMantle=player.onGround&&player.pos.y===180;\nreset(13.52,20,0);input.climb=true;wantJump=true;stepPlayer(1/60);pass.wallJump=player.vel.x>6&&player.vel.y>9&&!player.climbing;\nreset(1230,1,1230);player.vel.set(40,0,40);stepPlayer(.1);pass.bounds=player.pos.x<=WORLD_LIMIT&&player.pos.z<=WORLD_LIMIT;\nreset(45,40,45);for(let i=0;i<200&&!player.onGround;i++)stepPlayer(1/60);pass.heavyLandingImpact=player.onGround&&player.impactSpeed>20;\nconst p=new THREE.Vector3(0,0,0),vel=new THREE.Vector3(-3,4,0),anc=new THREE.Vector3(10,0,0);swingConstraint(p,vel,anc,8,Infinity);pass.ropeConstraint=p.distanceTo(anc)===8&&vel.x===0&&vel.y===4;\nconsole.log(JSON.stringify({pass,buildings:city.buildings.length,parks:city.lots.filter(l=>l.park).length,apex},null,2));if(!Object.values(pass).every(Boolean))process.exit(1);\n'
open('harness_openworld.mjs', 'w', encoding='utf-8').write(
    PRE + region('/*__PHYS_START__*/', '/*__PHYS_END__*/')
      + region('/*__PHYS_LOGIC_START__*/', '/*__PHYS_LOGIC_END__*/') + '\n' + TAIL)
print('harness generated: harness_openworld.mjs')
