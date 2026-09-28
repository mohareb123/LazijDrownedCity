const puppeteer=require('puppeteer'),fs=require('fs'),assert=require('assert');
fs.mkdirSync('tests/artifacts',{recursive:true});
(async()=>{
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
const errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warn'||m.type()==='error')warnings.push(m.text().slice(0,180))});
await page.evaluateOnNewDocument(()=>{localStorage.setItem('lazij-open-settings',JSON.stringify({quality:'med'}));localStorage.setItem('lazij-open',JSON.stringify({v:3,avatar:'hero',pos:[45,0,45],got:0,flags:[],mission:'find',hp:5}));const raf=window.requestAnimationFrame;window.requestAnimationFrame=fn=>raf.call(window,t=>{if(!window.frozen)fn(t)});});
await page.setRequestInterception(true);page.on('request',req=>{if(req.isNavigationRequest()){let s=fs.readFileSync('index.html','utf8');s=s.replace('</script>',`\nwindow.qa={scene,renderer,renderFrame,THREE,player,creature,camera,input,web,stepPlayer,updateAvatar,updateCamera,updateWebLine,updateCityLOD,ensureWebLine,updateFx,updateFlecks,updateBoss,resetRun,damagePlayer,setPaused,loadAll,switchAvatar,saveAll,startRun,heroBones,shootWeb,hitBoss,parts,tryCollect,race,startRace,updateRace,boss,city,
get hero(){return heroRoot},get spider(){return importedSpider},get mixer(){return heroMixer},get actions(){return heroActions},get bones(){return heroBones},get avatar(){return avatar},get action(){return heroAction},get phase(){return {mode,paused,uiBusy,mission,hp,score}},get count(){return cityDetailBatches.reduce((n,b)=>n+b.im.count,0)},get poseClock(){return poseTime},get report(){return importReport},get fps(){return fpsEma}};\n</script>`);req.respond({status:200,contentType:'text/html',body:s});}else req.continue()});
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});await page.waitForFunction(()=>window.qa?.hero&&document.getElementById('assetStatus').textContent.startsWith('جاهز'),{timeout:90000});
assert(await page.evaluate(()=>qa.avatar==='hero'&&qa.hero.visible),'saved avatar did not restore');
await page.evaluate(()=>qa.startRun(false));for(let i=0;i<3;i++){await page.evaluate(()=>document.getElementById('wNext').click());}
await new Promise(r=>setTimeout(r,3000));await page.evaluate(()=>window.frozen=true);await new Promise(r=>setTimeout(r,300));
const result=await page.evaluate(()=>{
 const q=qa;const result={bones:Object.keys(q.bones),restore:q.avatar==='hero',clips:Object.keys(q.actions).length,instances:q.count};
 q.player.pos.set(13.65,54,0);q.player.vel.set(0,0,0);q.player.wallCooldown=0;q.input.climb=true;q.web.active=false;
 for(let i=0;i<30;i++){q.stepPlayer(1/60);q.creature.position.copy(q.player.pos);q.creature.rotation.y=q.player.heading;q.updateAvatar(1/60)}
 result.climbing=q.player.climbing;result.action=q.action;result.hand=q.bones.handR.getWorldPosition(new q.THREE.Vector3()).toArray();
 q.saveAll();result.save=JSON.parse(localStorage.getItem('lazij-open'));
 return result;
});
assert(result.climbing&&result.action==='WallClimb');assert(result.bones.length>=13);assert(result.save.avatar==='hero');
async function photo(name,cam,target){await page.evaluate(({cam,target})=>{const q=qa;document.getElementById('wToast').style.display='none';q.camera.position.set(...cam);q.camera.lookAt(...target);q.camera.fov=46;q.camera.updateProjectionMatrix();q.scene.updateMatrixWorld(true);q.renderFrame()},{cam,target});await page.screenshot({path:'tests/artifacts/'+name+'.png'});}
await photo('release-climb',[21,58,7],[13.52,58.3,0]);
await page.evaluate(()=>{const q=qa;q.input.climb=false;q.player.climbing=false;q.player.pos.set(22,56,18);q.player.vel.set(8,2,3);q.player.onGround=false;q.creature.position.copy(q.player.pos);q.creature.rotation.y=0;q.web.active=true;q.web.anchor.set(0,79.6,0);q.web.len=32;q.ensureWebLine();for(let i=0;i<40;i++)q.updateAvatar(1/60);q.updateWebLine();q.updateFlecks(2);});
await photo('release-swing',[27,58,10],[22,57,18]);
await page.evaluate(()=>{qa.web.active=false;if(qa.web.line)qa.web.line.visible=false;qa.updateFlecks(2);qa.player.pos.set(45,0,45);qa.player.vel.set(0,0,0);qa.player.onGround=true;qa.creature.position.copy(qa.player.pos);qa.creature.rotation.y=0;for(let i=0;i<40;i++)qa.updateAvatar(1/60);});
await photo('release-hero',[48,1.8,40],[45,1,45]);
await photo('release-city',[100,112,140],[0,20,0]);
const states=await page.evaluate(()=>{const q=qa,tests=[];for(const [name,ground,vx,vy] of [['Idle_Loop',true,0,0],['Walk_Loop',true,5,0],['Sprint_Loop',true,12,0],['Jump_Start',false,0,5],['Jump_Loop',false,0,-5]]){q.player.onGround=ground;q.player.vel.set(vx,vy,0);q.updateAvatar(.4);tests.push([name,q.action]);}return tests;});assert(states.every(x=>x[0]===x[1]));
const before=await page.evaluate(()=>qa.player.pos.toArray());await page.keyboard.press('c');const switched=await page.evaluate(()=>({avatar:qa.avatar,pos:qa.player.pos.toArray()}));assert(switched.avatar==='spider');assert.deepEqual(before,switched.pos);
const flow=await page.evaluate(()=>{
 const q=qa,checks={};q.input.climb=true;q.input.forward=1;q.setPaused(true);checks.pauseClearsInput=!q.input.climb&&q.input.forward===0;q.setPaused(false);
 q.resetRun();
 for(const part of q.parts.slice(0,8)){q.player.pos.copy(part.mesh.position);q.tryCollect(.016);}
 checks.eightPartsSpawnBoss=q.boss.active&&q.phase.mission==='boss'&&q.boss.hp===3;
 checks.bossMissionSaved=JSON.parse(localStorage.getItem('lazij-open')).mission==='boss';
 q.player.pos.set(8,78,8);
 const health=[];
 for(let i=0;i<3;i++){q.updateFx(2);q.updateBoss(2);q.shootWeb();health.push(q.boss.hp);}
 checks.health=health;checks.finished=q.phase.mission==='done'&&!q.boss.active;
 checks.endingSaved=JSON.parse(localStorage.getItem('lazij-open')).mission==='done';
 q.resetRun();checks.freshGame=q.parts.every(p=>!p.taken)&&q.phase.mission==='find'&&!q.boss.mesh.visible;
 q.damagePlayer(10);checks.respawn=q.phase.hp===3&&q.player.vel.length()===0;
 q.player.pos.set(45,0,45);q.startRace();checks.raceStarted=q.race.active;
 for(const b of q.race.cps){q.player.pos.set(b.x,b.h+1.4,b.z);q.updateRace(.25);}
 checks.raceFinished=!q.race.active&&q.race.idx===q.race.cps.length;
 checks.raceTime=JSON.parse(localStorage.getItem('lazij-open')).raceBest;
 q.saveAll();const saved=q.player.pos.clone();q.player.pos.set(0,200,0);q.loadAll();checks.loadRestoresPosition=saved.distanceTo(q.player.pos)<.001;
 return checks;
});assert(flow.eightPartsSpawnBoss&&flow.bossMissionSaved&&flow.finished&&flow.endingSaved&&flow.freshGame&&flow.respawn&&flow.loadRestoresPosition&&flow.pauseClearsInput);assert.deepEqual(flow.health,[2,1,0]);assert(flow.raceStarted&&flow.raceFinished&&flow.raceTime>0);
console.log(JSON.stringify({result,states,switched,flow,errors,warnings},null,2));fs.writeFileSync('tests/artifacts/release-qa.json',JSON.stringify({result,states,switched,flow,errors,warnings},null,2));assert.equal(errors.length,0);
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
