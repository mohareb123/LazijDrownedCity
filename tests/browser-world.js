require('fs').mkdirSync(require('path').join(__dirname,'artifacts'),{recursive:true});
const puppeteer=require('puppeteer'),fs=require('fs'),assert=require('assert');
(async()=>{
const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const page=await b.newPage();await page.setViewport({width:960,height:600});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(()=>{localStorage.setItem('lazij-open-settings',JSON.stringify({quality:'low'}));localStorage.setItem('lazij-open',JSON.stringify({v:3,avatar:'hero',pos:[45,0,45],mission:'find',flags:[],hp:5}));const raf=window.requestAnimationFrame;window.requestAnimationFrame=fn=>raf.call(window,t=>{if(!window.frozen)fn(t)});});
await page.setRequestInterception(true);page.on('request',req=>{if(req.isNavigationRequest()){let s=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').replace('</script>',`\nwindow.qa={player,creature,scene,camera,renderer,renderFrame,THREE,input,web,city,cars,trafficRoutes,streetLights,updateLivingWorld,updateTraffic,trafficGreen,handleCarContact,sampleCar,toggleWorldMap,drawWorldMap,saveAll,loadAll,SET,startRun,updateAvatar,updateCityLOD,groundAt,pickAnchor,stepPlayer,get hero(){return heroRoot},get hour(){return worldHour},set hour(v){worldHour=v},get wet(){return weatherWet},get clock(){return trafficClock},set clock(v){trafficClock=v},get paused(){return paused},get mapOpen(){return worldMapOpen}};\n</script>`);req.respond({status:200,contentType:'text/html',body:s})}else req.continue()});
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});await page.waitForFunction(()=>window.qa?.hero&&document.getElementById('assetStatus').textContent.startsWith('جاهز'),{timeout:90000});await page.evaluate(()=>qa.startRun(false));for(let i=0;i<3;i++)await page.evaluate(()=>document.getElementById('wNext').click());await page.evaluate(()=>window.frozen=true);await new Promise(r=>setTimeout(r,200));

const result=await page.evaluate(()=>{
const q=qa,r={};q.input.forward=0;q.input.strafe=0;q.player.pos.set(45,0,120);
r.buildings=q.city.buildings.length;r.cars=q.cars.length;
const a=q.cars[100],old=a.pos.clone();q.clock=14;for(let i=0;i<30;i++)q.updateTraffic(.1);r.trafficMoves=a.pos.distanceTo(old)>1;
let safe=true,roads=true;for(let i=0;i<300;i++){q.updateTraffic(.1);for(const route of q.trafficRoutes){const ss=route.cars.map(c=>c.s).sort((a,b)=>a-b);for(let j=0;j<ss.length;j++){const gap=(ss[(j+1)%ss.length]-ss[j]+route.total)%route.total;if(gap<5.7)safe=false;}}for(const c of q.cars)if(q.groundAt(q.city,c.pos.x,c.pos.z)>1)roads=false;}
r.carSpacing=safe;r.carsStayOnRoads=roads;
const route=q.trafficRoutes[0],test=route.cars[0];test.s=110;test.speed=8;for(let i=1;i<route.cars.length;i++)route.cars[i].s=200+i*35;q.sampleCar(test);q.clock=2;for(let i=0;i<35;i++)q.updateTraffic(.1);r.redLightStops=test.speed<.01&&Math.abs(test.pos.x-(-858.4))<.2;r.redPosition=test.pos.toArray();
q.clock=14;const before=test.pos.clone();for(let i=0;i<15;i++)q.updateTraffic(.1);r.greenLightResumes=test.pos.distanceTo(before)>1;
q.SET.timeMode='auto';q.hour=12;const h=q.hour;q.updateLivingWorld(30);r.solarClockAdvances=q.hour>h;q.SET.timeMode='night';q.updateLivingWorld(0);r.nightSelectable=q.hour===0;q.SET.weather='rain';for(let i=0;i<40;i++)q.updateLivingWorld(.1);r.rainTransitions=q.wet>.3;
q.SET.timeMode='auto';q.hour=9.75;q.saveAll();q.hour=0;q.loadAll();r.timePersists=q.hour===9.75;
q.toggleWorldMap();r.mapPauses=q.mapOpen&&q.paused;q.toggleWorldMap();r.mapCloses=!q.mapOpen&&!q.paused;
return r;
});
console.log(JSON.stringify({result,errors},null,2));
fs.writeFileSync(require('path').join(__dirname,'artifacts')+'/world-qa.json',JSON.stringify({result,errors},null,2));
for(const [k,v] of Object.entries(result))if(typeof v==='boolean')assert(v,k);assert(!errors.length);
async function photo(name,mode,cam,target){await page.evaluate(({mode,cam,target})=>{const q=qa;q.SET.quality='med';q.SET.timeMode=mode;q.SET.weather='clear';q.player.pos.set(45,0,120);q.creature.position.copy(q.player.pos);q.camera.position.set(...cam);q.camera.lookAt(...target);if(cam[1]===5){const car=q.cars.find(c=>Math.abs(c.pos.x)<100&&Math.abs(c.pos.z)<100&&c.dir.z>.95);q.camera.position.copy(car.pos).addScaledVector(car.dir,-8);q.camera.position.y=3.2;q.camera.lookAt(car.pos.clone().add(new q.THREE.Vector3(0,.8,0)));}q.camera.fov=62;q.camera.updateProjectionMatrix();q.updateLivingWorld(0);q.updateCityLOD();q.scene.updateMatrixWorld(true);q.renderFrame();document.getElementById('wToast').style.display='none';document.getElementById('pause').classList.add('hidden');},{mode,cam,target});await page.screenshot({path:require('path').join(__dirname,'artifacts')+'/'+name+'.png'});}
await photo('world-day','day',[330,205,420],[0,55,0]);
await photo('world-night','night',[330,205,420],[0,55,0]);
await photo('world-traffic','day',[86,5,112],[73,1,74]);
await page.evaluate(()=>qa.toggleWorldMap());await page.screenshot({path:require('path').join(__dirname,'artifacts')+'/world-map.png'});
await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
