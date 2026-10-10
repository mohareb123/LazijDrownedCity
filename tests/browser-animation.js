const puppeteer=require('puppeteer'),fs=require('fs'),assert=require('assert');
fs.mkdirSync('tests/artifacts',{recursive:true});
(async()=>{
const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const page=await b.newPage();await page.setViewport({width:960,height:600});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(()=>{localStorage.setItem('lazij-open-settings',JSON.stringify({quality:'low'}));localStorage.setItem('lazij-open',JSON.stringify({v:3,avatar:'hero',pos:[45,0,45],mission:'find',flags:[],hp:5}));const raf=window.requestAnimationFrame;window.requestAnimationFrame=fn=>raf.call(window,t=>{if(!window.frozen)fn(t)});});
await page.setRequestInterception(true);page.on('request',req=>{if(req.isNavigationRequest()){let s=fs.readFileSync('index.html','utf8').replace('</script>',`\nwindow.qa={player,creature,scene,camera,renderer,renderFrame,THREE,input,web,enemies,boss,startRun,updateAvatar,updateFx,updateFlecks,switchAvatar,cancelAction,beginAction,shootWeb,meleeAttack,damagePlayer,stepPlayer,attackOrigin,updateCityLOD,get hero(){return heroRoot},get action(){return heroAction},get pose(){return activePose},get age(){return actionAge},get timer(){return actionTimer},get serial(){return animationSerial},get shot(){return shootLine},get accents(){return spiderAccents},get avatar(){return avatar}};\n</script>`);req.respond({status:200,contentType:'text/html',body:s})}else req.continue()});
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});await page.waitForFunction(()=>window.qa?.hero&&document.getElementById('assetStatus').textContent.startsWith('جاهز'),{timeout:90000});await page.evaluate(()=>qa.startRun(false));for(let i=0;i<3;i++)await page.evaluate(()=>document.getElementById('wNext').click());await page.evaluate(()=>window.frozen=true);await new Promise(r=>setTimeout(r,200));
const result=await page.evaluate(()=>{
const q=qa,out={};
function setStreet(){q.cancelAction();q.input.climb=false;q.web.active=false;q.player.climbing=false;q.player.onGround=true;q.player.pos.set(45,0,45);q.player.heading=0;q.player.vel.set(0,0,0);q.creature.position.copy(q.player.pos);q.creature.rotation.set(0,0,0);q.updateAvatar(.8);q.updateFx(1);q.updateFlecks(2);}
function isolate(){q.enemies.forEach((e,i)=>{e.alive=true;e.mesh.visible=true;e.pos.set(200+i*5,0,200);e.mesh.position.copy(e.pos);});}
function foe(i,z=42.8){const e=q.enemies[i];e.alive=true;e.mesh.visible=true;e.pos.set(45,0,z);e.mesh.position.copy(e.pos);return e;}
setStreet();isolate();let e=foe(0);q.shootWeb();out.shotStartsAlive=e.alive;q.updateAvatar(.12);out.shotBeforeRelease=e.alive;q.updateAvatar(.05);out.shotAtRelease=!e.alive;out.shotClip=q.action;
const arr=q.shot.line.geometry.attributes.position;const muzzle=new q.THREE.Vector3(arr.getX(0),arr.getY(0),arr.getZ(0));out.handOriginError=muzzle.distanceTo(q.attackOrigin());
setStreet();isolate();e=foe(1);q.meleeAttack();q.updateAvatar(.2);out.punchBeforeContact=e.alive;q.updateAvatar(.04);out.punchAtContact=!e.alive;out.enemyReaction=e.reactionTime>0;out.punchClip=q.action;
setStreet();isolate();e=foe(2);q.player.onGround=false;q.player.pos.y=3;q.player.vel.y=-6;q.creature.position.copy(q.player.pos);q.shootWeb();q.updateAvatar(.17);out.airShot=q.pose==='shoot'&&q.action==='WebShoot'&&!e.alive;
setStreet();isolate();e=foe(3);q.shootWeb();q.switchAvatar();q.updateAvatar(.3);out.switchCancelsPending=e.alive;
q.switchAvatar();setStreet();isolate();e=foe(4);q.shootWeb();q.damagePlayer(1);q.updateAvatar(.3);out.hitCancelsPending=e.alive&&q.pose==='hit';
setStreet();q.player.climbing=true;q.player.onGround=false;q.player.vel.set(0,-5,0);q.player.wallNormal={x:1,z:0};q.updateAvatar(.1);out.descend=q.action==='WallDescend';q.player.vel.y=7;q.updateAvatar(.1);out.climb=q.action==='WallClimb';
setStreet();q.player.onGround=false;q.player.vel.y=-20;q.updateAvatar(.05);out.fall=q.action==='AirFall';q.player.onGround=true;q.player.impactSpeed=20;q.player.vel.y=0;q.updateAvatar(.05);out.hardLanding=q.pose==='landHard'&&q.action==='HardLanding';
setStreet();q.player.onGround=false;q.player.vel.y=-3;q.updateAvatar(.05);q.player.onGround=true;q.player.impactSpeed=3;q.player.vel.y=0;q.updateAvatar(.05);out.softLanding=q.pose==='land'&&q.action==='Jump_Land';
setStreet();q.switchAvatar();isolate();e=foe(5);q.meleeAttack();q.updateAvatar(.24);out.spiderMelee=!e.alive&&q.avatar==='spider';out.spiderAccents=q.accents.length;
setStreet();isolate();e=foe(6);q.shootWeb();q.updateAvatar(.17);out.spiderShot=!e.alive&&q.avatar==='spider';
return out;
});
for(const [k,v]of Object.entries(result))if(typeof v==='boolean')assert(v,k);assert(result.handOriginError<.01);assert(result.spiderAccents>0);assert.equal(errors.length,0);
fs.writeFileSync('tests/artifacts/animation-qa.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors},null,2));
await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
