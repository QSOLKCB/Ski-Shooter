// SPDX-License-Identifier: Apache-2.0
import {FixedClock} from '../vendor/vanillajs/modules/time/index.js';
import {add,subtract,length,mix,clamp} from '../vendor/vanillajs/modules/math/index.js';
import {castSegment} from '../vendor/vanillajs/modules/collision/index.js';
import {createGame,stepGame,aimLead,STEP} from './game.js';
import {terrain,castTerrain,BASE,CORE,pylons} from './world.js';
import {Scene} from './render.js';
import {Sound} from './audio.js';

const $=id=>document.getElementById(id),canvas=$('world'),overlay=$('overlay'),ctx=overlay.getContext('2d');
let scene,game=createGame(),clock=new FixedClock({step:STEP,maxFrame:.15,maxSteps:18}),paused=true,started=false,failed=false,lastTime=0,noticeUntil=0,hitUntil=0,hurtUntil=0,lastHUD=0;
const sound=new Sound(),keys=new Set(),touch=new Map(),mouse=new Set();
let drag=null,pendingFire=false,settings={sensitivity:1,fov:90,resolution:.85,lead:true,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};
$('motion').checked=settings.motion;
document.body.classList.add('in-menu');clock.setPaused(true);
const text=(id,value)=>{const el=$(id);if(el.textContent!==String(value))el.textContent=String(value);};
function notice(message,seconds=3){text('notice',message);noticeUntil=game.time+seconds;}
function clearInput(){keys.clear();touch.clear();mouse.clear();drag=null;pendingFire=false;document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));}
function fatal(error){failed=true;paused=true;clock.setPaused(true);clearInput();sound.pause();$('fatal').hidden=false;text('fatal-message',`${error.message||error}. Try a browser with WebGL enabled, and serve this folder over HTTP rather than opening index.html directly.`);console.error(error);}
function pause(reason='Paused'){
  if(!started||paused)return;paused=true;clock.setPaused(true);clearInput();sound.pause();
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  $('menu').hidden=false;$('footer').hidden=false;$('pause').hidden=true;$('hud').hidden=true;
  document.body.classList.add('in-menu','paused');document.body.classList.remove('in-play');
  text('title','FLIGHT PAUSED');text('tagline',reason);text('intro','Take a breath. Your momentum and mission are waiting.');
  text('launch','Resume flight ↗');text('training','Restart raid ↗');text('mode-note',game.training?'Flight school · Sentries are passive':'Solo raid · Mission paused');$('debrief').hidden=true;$('launch').focus();
}
async function capture(){
  if(!canvas.requestPointerLock){notice('Drag the view to look. Use F to fire and Shift to jet.',5);return;}
  try{await canvas.requestPointerLock();}catch{notice('Drag the view to look. Use F to fire and Shift to jet.',5);}
}
function launch(training=false,resume=false){
  if(failed)return;
  if(!resume){game=createGame(training);clock.reset();noticeUntil=hitUntil=hurtUntil=0;text('notice','');}
  clearInput();paused=false;started=true;lastTime=performance.now();lastHUD=0;clock.setPaused(false);
  $('menu').hidden=true;$('footer').hidden=true;$('pause').hidden=false;$('hud').hidden=false;
  document.body.classList.remove('in-menu','paused');document.body.classList.add('in-play');
  canvas.focus();sound.start().catch(()=>{notice('Audio unavailable; flight controls are ready.',3);});capture();
  if(!resume)notice(training?'FLIGHT SCHOOL — Hold Space to ski. Hold Shift or RMB to jet.':'RIDGEBREAK — Clear six sentries, recover the core, return home.',5);
}
function finish(){
  const won=game.status==='won';paused=true;clock.setPaused(true);clearInput();sound.pause();if(document.pointerLockElement===canvas)document.exitPointerLock();
  $('menu').hidden=false;$('footer').hidden=false;$('pause').hidden=true;$('hud').hidden=true;document.body.classList.add('in-menu','paused');document.body.classList.remove('in-play');
  text('title',won?'CORE RECOVERED':'FLIGHT ENDED');text('tagline',won?'Gravity was a suggestion.':'The ridge gets another round.');
  text('intro',won?'The core is home. Try a faster route through the basin.':'Use the ridges as cover and keep moving. The cyan landing zone repairs armour.');
  text('launch','Fly again ↗');text('training','Flight school ↗');text('mode-note',game.training?'Flight school completed':'Solo raid debrief');
  $('debrief').hidden=false;text('debrief',`${game.score} points · ${Math.round(game.topSpeed*3.6)} km/h peak · ${game.midairs} midairs · ${game.directHits}/${game.shotsFired} direct hits`);$('launch').focus();
}
$('launch').addEventListener('click',()=>launch(game.training,started&&game.status==='playing'));
$('training').addEventListener('click',()=>launch(started&&game.status==='playing'?false:true));
$('pause').addEventListener('click',()=>pause('Flight paused'));
$('sensitivity').addEventListener('input',e=>{settings.sensitivity=+e.target.value;text('sens-value',settings.sensitivity.toFixed(1));});
$('fov').addEventListener('input',e=>{settings.fov=+e.target.value;text('fov-value',`${settings.fov}°`);});
$('quality').addEventListener('change',e=>settings.resolution=+e.target.value);
$('lead-assist').addEventListener('change',e=>settings.lead=e.target.checked);
$('motion').addEventListener('change',e=>settings.motion=e.target.checked);
$('sound').addEventListener('click',()=>{sound.mute(!sound.muted);$('sound').setAttribute('aria-pressed',String(sound.muted));text('sound',sound.muted?'Sound off':'Sound on');});

const controls=new Set(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyE','KeyF','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
addEventListener('keydown',e=>{
  if(e.code==='Escape'){pause('Flight paused');return;}
  if(paused||!controls.has(e.code))return;e.preventDefault();keys.add(e.code);if(e.code==='KeyF'&&!e.repeat)pendingFire=true;
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>pause('Focus lost — flight paused'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Tab hidden — flight paused');});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&!paused)pause('Mouse released — flight paused');});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fatal(new Error('Graphics context was lost. Reload to restart'));});
const look=(dx,dy)=>{game.player.yaw-=clamp(dx,-400,400)*.002*settings.sensitivity;game.player.pitch=clamp(game.player.pitch-clamp(dy,-400,400)*.002*settings.sensitivity,-1.48,1.48);};
canvas.addEventListener('contextmenu',e=>e.preventDefault());
// Mouse events report each button transition, including LMB/RMB chords.
document.addEventListener('mousedown',e=>{
  if(paused||document.pointerLockElement!==canvas)return;
  e.preventDefault();mouse.add(e.button);if(e.button===0)pendingFire=true;
});
document.addEventListener('mouseup',e=>mouse.delete(e.button));
canvas.addEventListener('pointerdown',e=>{
  if(paused||document.pointerLockElement===canvas)return;
  // Cancel only the capture/drag gesture; cancelling a locked pointerdown
  // would suppress the compatibility mousedown used above.
  e.preventDefault();
  if(e.pointerType==='mouse')capture();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove',e=>{
  if(paused)return;
  if(document.pointerLockElement===canvas){look(e.movementX,e.movementY);return;}
  if(drag?.id===e.pointerId){look(e.clientX-drag.x,e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;}
});
document.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)drag=null;});
document.addEventListener('pointercancel',e=>{mouse.clear();if(drag?.id===e.pointerId)drag=null;});
for(const button of document.querySelectorAll('[data-action]')){
  button.addEventListener('pointerdown',e=>{if(paused)return;e.preventDefault();button.setPointerCapture(e.pointerId);touch.set(e.pointerId,button.dataset.action);button.classList.add('held');if(button.dataset.action==='KeyF')pendingFire=true;});
  const release=e=>{touch.delete(e.pointerId);button.classList.remove('held');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function input(){const pressed=key=>keys.has(key)||[...touch.values()].includes(key);return {
  forward:Number(pressed('KeyW'))-Number(pressed('KeyS')),right:Number(pressed('KeyD'))-Number(pressed('KeyA')),
  ski:pressed('Space'),jet:mouse.has(2)||pressed('ShiftLeft')||pressed('ShiftRight')||pressed('KeyE'),fire:pendingFire||mouse.has(0)||pressed('KeyF'),
  yaw:Number(pressed('ArrowLeft'))-Number(pressed('ArrowRight')),pitch:Number(pressed('ArrowUp'))-Number(pressed('ArrowDown')),
};}
function tick(dt){
  const i=input();game.player.yaw+=i.yaw*1.7*dt;game.player.pitch=clamp(game.player.pitch+i.pitch*1.3*dt,-1.48,1.48);
  stepGame(game,i,dt);
  pendingFire=false;
  for(const e of game.events){
    if(e.type==='fire')sound.play('fire');
    if(e.type==='explosion')sound.play('explosion',length(subtract(e.position,game.player.position)));
    if(e.type==='hit'){sound.play('hit');hitUntil=game.time+.18;}
    if(e.type==='kill')notice(e.midair?'MIDAIR +150':'SENTRY DOWN +100',2);
    if(e.type==='hurt')hurtUntil=game.time+.2;
    if(e.type==='core')notice('CORE SECURED — Return to the cyan landing zone.',5);
  }
  if(game.kills===6&&!game.carrying&&game.events.some(e=>e.type==='kill'))notice('BASIN CLEAR — Collect the core at the orange beacon.',5);
  if(game.status!=='playing')finish();
}
function hud(){
  const p=game.player,speed=Math.hypot(p.velocity[0],p.velocity[2])*3.6;
  text('speed',Math.round(speed));$('speed-fill').style.transform=`scaleX(${Math.min(1,speed/250)})`;
  text('altitude',Math.max(0,Math.floor(p.position[1]-terrain(p.position[0],p.position[2]).height)));
  text('energy-label',Math.ceil(p.energy));$('energy').style.transform=`scaleX(${p.energy/100})`;
  text('health-label',Math.ceil(p.health));$('health').style.transform=`scaleX(${p.health/100})`;
  text('timer',`${Math.floor(game.time/60).toString().padStart(2,'0')}:${Math.floor(game.time%60).toString().padStart(2,'0')}`);
  text('score',String(game.score).padStart(4,'0'));text('mode',p.jetting?'JET BURN':p.grounded?(p.skiing?'SKIING':'ON FOOT'):'AIRBORNE');
  text('weapon-state',p.cooldown>.1?'CHARGING':'READY');
  const degrees=(((-p.yaw*180/Math.PI)%360)+360)%360;const compass=['N','NE','E','SE','S','SW','W','NW'];text('bearing',`${compass[Math.round(degrees/45)%8]} ${String(Math.round(degrees)).padStart(3,'0')}°`);
  text('objective',game.carrying?'Bring the core home':game.kills===6?'Collect the core':'Clear the sentries');
  const goal=game.carrying?BASE:CORE,distance=Math.round(Math.hypot(goal[0]-p.position[0],goal[1]-p.position[2]));
  text('progress',game.kills<6?`${game.kills} / 6 neutralised${game.training?' · FLIGHT SCHOOL':''}`:`${distance} m to ${game.carrying?'landing zone':'core'}`);
  $('crosshair').classList.toggle('hit',game.time<hitUntil);document.body.classList.toggle('hurt',game.time<hurtUntil&&!settings.motion);
  if(game.time>noticeUntil)text('notice','');
}
function drawOverlay(alpha){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}ctx.clearRect(0,0,w,h);
  if(paused)return;ctx.save();ctx.scale(dpr,dpr);const W=rect.width,H=rect.height;
  const screen=pos=>{const p=scene.project(pos);return p&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1?{x:(p.x+1)*W/2,y:(1-p.y)*H/2,depth:p.depth}:null;};
  let nearest=null,nearestDistance=Infinity;
  for(const e of game.enemies){
    if(e.health<=0)continue;const pos=add(mix(e.previous,e.position,alpha),[0,1.7,0]),s=screen(pos);if(!s)continue;
    const delta=subtract(pos,scene.camera),ground=castTerrain(scene.camera,delta);if(ground&&ground.time<.999||castSegment(scene.camera,delta,pylons))continue;
    const radius=Math.max(8,Math.min(30,950/s.depth));ctx.strokeStyle='#ffb47699';ctx.lineWidth=1;ctx.strokeRect(s.x-radius,s.y-radius*1.3,radius*2,radius*2.6);
    ctx.font='9px ui-monospace,monospace';ctx.fillStyle='#ffd1a4';ctx.textAlign='center';ctx.fillText(`${Math.round(length(delta))} m`,s.x,s.y-radius*1.3-8);
    const d=Math.hypot(s.x-W/2,s.y-H/2);if(d<nearestDistance){nearestDistance=d;nearest={e,pos};}
  }
  if(settings.lead&&nearest&&nearestDistance<Math.min(W,H)*.38){
    const lead=aimLead(add(game.player.position,[0,1.65,0]),nearest.pos,nearest.e.velocity,game.player.velocity),s=lead?screen(lead):null;
    if(s){ctx.strokeStyle='#b2f8ddcc';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s.x,s.y-5);ctx.lineTo(s.x+5,s.y);ctx.lineTo(s.x,s.y+5);ctx.lineTo(s.x-5,s.y);ctx.closePath();ctx.stroke();}
  }
  if(game.kills===6){const goal=game.carrying?BASE:CORE,pos=[goal[0],terrain(...goal).height+7,goal[1]],s=screen(pos);if(s){ctx.fillStyle='#a6f4dc';ctx.font='bold 10px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(game.carrying?'RETURN HOME':'CORE',s.x,s.y);}}
  // Compact radar is a navigation aid; the map does not participate in aiming.
  if(W>900){const cx=150,cy=H-270,rad=54;ctx.fillStyle='#0c24276b';ctx.strokeStyle='#aaccc940';ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(cx-rad,cy);ctx.lineTo(cx+rad,cy);ctx.moveTo(cx,cy-rad);ctx.lineTo(cx,cy+rad);ctx.stroke();
    const point=(x,z,color,r=2)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(cx+x/256*rad,cy+z/256*rad,r,0,Math.PI*2);ctx.fill();};
    point(...BASE,'#8aefce',3);point(...CORE,'#f6b077',3);for(const e of game.enemies)if(e.health>0)point(e.position[0],e.position[2],'#f9a76d');point(game.player.position[0],game.player.position[2],'#fff',3);
    ctx.fillStyle='#9dbbb6';ctx.font='8px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText('N',cx,cy-rad-7);
  }
  ctx.restore();
}
function frame(now){
  if(failed)return;
  try{
    const elapsed=Math.max(0,(now-lastTime)/1000);lastTime=now;
    const result=clock.advance(elapsed,tick);
    scene.draw(game,paused?1:result.alpha,{menu:!started,fov:settings.fov,resolution:settings.resolution,reducedMotion:settings.motion});
    drawOverlay(result.alpha);
    if(!paused){sound.update(game.player);if(now-lastHUD>50){hud();lastHUD=now;}}
    requestAnimationFrame(frame);
  }catch(e){fatal(e);}
}
try{
  scene=new Scene(canvas);
  await scene.ready;
  $('launch').disabled=false;$('training').disabled=false;text('launch','Start raid ↗');text('load-status','All systems ready. Click to launch.');
  lastTime=performance.now();requestAnimationFrame(frame);
}catch(e){fatal(e);}
