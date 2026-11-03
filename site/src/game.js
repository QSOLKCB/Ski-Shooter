// SPDX-License-Identifier: Apache-2.0
import {add,subtract,scale,normalize,dot,length,clamp} from '../vendor/vanillajs/modules/math/index.js';
import {castSegment,castMovingSegment,moveAndSlideAABB} from '../vendor/vanillajs/modules/collision/index.js';
import {terrain,castTerrain,pylons,BASE,CORE,HALF} from './world.js';

export const STEP=1/120;
export const PHYSICS=Object.freeze({gravity:22,thrust:36,drain:26,recharge:20,skiDrag:.055,walkSpeed:12,maxSpeed:110});
export function createPlayer(){return {position:[BASE[0],terrain(...BASE).height+.03,BASE[1]],previous:[BASE[0],terrain(...BASE).height+.03,BASE[1]],velocity:[0,0,0],yaw:0,pitch:0,energy:100,health:100,grounded:true,jetting:false,skiing:false,cooldown:0};}
export function lookDirection(yaw,pitch){return [-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
function movePlayer(p,input,dt){
  const cfg=PHYSICS;
  p.previous=[...p.position];
  const forward=clamp(input.forward||0,-1,1),right=clamp(input.right||0,-1,1);
  const desired=normalize([-Math.sin(p.yaw)*forward+Math.cos(p.yaw)*right,0,-Math.cos(p.yaw)*forward-Math.sin(p.yaw)*right]);
  p.jetting=!!input.jet&&p.energy>0;
  const burn=p.jetting?Math.min(p.energy,cfg.drain*dt):0;
  p.energy=clamp(p.energy-burn+(!input.jet?cfg.recharge*dt:0),0,100);
  const jetFraction=burn/(cfg.drain*dt);
  p.skiing=!!input.ski;
  const substeps=Math.max(1,Math.ceil(length(p.velocity)*dt/.45)),h=dt/substeps;
  for(let step=0;step<substeps;step++){
    const ground=terrain(p.position[0],p.position[2]),n=ground.normal;
    let accel=[0,-cfg.gravity,0];
    if(p.grounded&&!p.jetting){
      if(p.skiing){
        const inward=dot(p.velocity,n);p.velocity=subtract(p.velocity,scale(n,inward));
        accel=subtract(accel,scale(n,dot(accel,n)));
        const steer=normalize(subtract(desired,scale(n,dot(desired,n))));
        const along=dot(p.velocity,steer);
        if(along<27)accel=add(accel,scale(steer,Math.min(11,(27-along)/h)));
        p.velocity=scale(p.velocity,Math.exp(-cfg.skiDrag*h));
      }else{
        const target=scale(normalize(subtract(desired,scale(n,dot(desired,n)))),cfg.walkSpeed);
        p.velocity=p.velocity.map((v,i)=>v+(target[i]-v)*(1-Math.exp(-11*h)));
        accel=[0,0,0];
      }
    }else{
      const along=dot(p.velocity,desired);
      if(along<26)accel=add(accel,scale(desired,5.5));
      p.velocity[0]*=Math.exp(-.012*h);p.velocity[2]*=Math.exp(-.012*h);
    }
    if(p.jetting){accel[1]+=cfg.thrust*jetFraction;p.grounded=false;}
    p.velocity=add(p.velocity,scale(accel,h));
    const speed=length(p.velocity);if(speed>cfg.maxSpeed)p.velocity=scale(p.velocity,cfg.maxSpeed/speed);
    // Framework swept upright box collision against physical pylons. Terrain contact
    // remains game-owned; the stock walking controller does not support slopes.
    const center=add(p.position,[0,.9,0]);
    const moved=moveAndSlideAABB(center,p.velocity,h,[.5,.9,.5],pylons.map(c=>c.box));
    p.position=add(moved.position,[0,-.9,0]);p.velocity=moved.velocity;
    const g=terrain(p.position[0],p.position[2]);
    if(p.position[1]<=g.height+.03){
      p.position[1]=g.height+.03;
      const vn=dot(p.velocity,g.normal);if(vn<0)p.velocity=subtract(p.velocity,scale(g.normal,vn));
      p.grounded=true;
    }else p.grounded=false;
    if(!p.jetting&&!p.skiing&&p.position[1]<g.height+.2&&p.velocity[1]<=1){p.position[1]=g.height+.03;p.grounded=true;}
    for(const i of [0,2])if(Math.abs(p.position[i])>HALF-5){p.position[i]=clamp(p.position[i],-HALF+5,HALF-5);p.velocity[i]*=-.2;}
  }
  p.cooldown=Math.max(0,p.cooldown-dt);
}
export {movePlayer};

const nests=[[-16,100],[30,63],[-45,8],[46,-32],[-32,-92],[18,-132]];
export function enemyPose(index,time){
  const [x,z]=nests[index],phase=time*.35+index*1.7;
  const px=x+Math.sin(phase)*12,pz=z+Math.cos(phase*.77)*9;
  return [px,terrain(px,pz).height+7+Math.sin(time*.7+index)*4,pz];
}
const actorBox=(pos,r=1.35)=>({min:[pos[0]-r,pos[1],pos[2]-r],max:[pos[0]+r,pos[1]+3.4,pos[2]+r]});
export function createGame(training=false){return {
  time:0,ticks:0,player:createPlayer(),training,status:'playing',carrying:false,
  enemies:nests.map((_,i)=>({id:'enemy-'+i,index:i,position:enemyPose(i,0),previous:enemyPose(i,0),velocity:[0,0,0],health:100,cooldown:3+i*.4})),
  shots:[],effects:[],events:[],nextId:1,kills:0,score:0,shotsFired:0,directHits:0,midairs:0,topSpeed:0,
};}
export function fire(game,origin,direction,velocity=[0,0,0],owner='player'){
  if(game.shots.length>=96)return false;
  const speed=owner==='player'?135:62;
  game.shots.push({id:game.nextId++,owner,position:[...origin],previous:[...origin],velocity:add(scale(normalize(direction),speed),scale(velocity,owner==='player'?.35:0)),life:4});
  if(owner==='player'){game.shotsFired++;game.events.push({type:'fire'});}
  return true;
}
function lineClear(a,b){
  const delta=subtract(b,a);const t=castTerrain(a,delta);
  return (!t||t.time>.999)&&!castSegment(a,delta,pylons);
}
function damage(game,actor,amount,midair=false){
  if(actor.health<=0)return;
  actor.health=Math.max(0,actor.health-amount);
  if(actor!==game.player){
    game.events.push({type:'hit',amount});
    if(actor.health===0){game.kills++;game.score+=midair?150:100;game.midairs+=midair?1:0;game.events.push({type:'kill',midair});}
  }else game.events.push({type:'hurt'});
}
function explode(game,shot,point,direct,enemyAtImpact,playerAtImpact){
  game.effects.push({position:[...point],life:.55,owner:shot.owner});
  game.events.push({type:'explosion',position:[...point]});
  const targets=shot.owner==='player'?game.enemies:[game.player];
  let directMidair=false;
  for(const a of targets){
    if(a.health<=0)continue;
    const pos=a===game.player?playerAtImpact:enemyAtImpact.get(a.id),center=add(pos,[0,1.7,0]);
    const isDirect=direct===(a===game.player?'player':a.id);
    const distance=length(subtract(center,point));
    if(isDirect){directMidair=a!==game.player&&pos[1]-terrain(pos[0],pos[2]).height>3;damage(game,a,shot.owner==='player'?100:30,directMidair);if(shot.owner==='player')game.directHits++;}
    else if(distance<11&&lineClear(add(point,[0,.12,0]),center))damage(game,a,(shot.owner==='player'?85:22)*(1-distance/11));
  }
  // Self splash supplies a bounded impulse for deliberate disc jumps.
  if(shot.owner==='player'){
    const center=add(playerAtImpact,[0,1,0]),d=length(subtract(center,point));
    if(d<9&&lineClear(add(point,[0,.12,0]),center)){
      const strength=1-d/9;game.player.velocity=add(game.player.velocity,scale(normalize(subtract(center,point)),strength*16));
      if(!game.training)damage(game,game.player,strength*18);
    }
  }
}
export function stepGame(game,input,dt=STEP){
  if(game.status!=='playing')return;
  if(!Number.isFinite(dt)||dt<=0||dt>1/30)throw new RangeError('simulation step out of bounds');
  game.events=[];game.ticks++;game.time+=dt;
  const p=game.player;movePlayer(p,input,dt);
  for(const e of game.enemies){
    e.previous=[...e.position];e.position=enemyPose(e.index,game.time);e.velocity=scale(subtract(e.position,e.previous),1/dt);
    e.cooldown=Math.max(0,e.cooldown-dt);
  }
  if(input.fire&&p.cooldown<=1e-9){
    if(fire(game,add(p.previous,[0,1.65,0]),lookDirection(p.yaw,p.pitch),p.velocity))p.cooldown=.62;
  }
  for(const e of game.enemies){
    if(e.health<=0||e.cooldown>0||game.training)continue;
    const origin=add(e.previous,[0,1.7,0]),target=add(p.previous,[0,1.1,0]),distance=length(subtract(target,origin));
    if(distance<140&&lineClear(origin,target)){
      const lead=add(target,scale(p.velocity,Math.min(1.4,distance/62)*.55));
      // A deliberate deterministic spread makes movement the primary defence.
      lead[0]+=Math.sin(game.time*2+e.index)*3;lead[1]+=Math.cos(game.time+e.index)*1.5;
      fire(game,origin,subtract(lead,origin),[0,0,0],e.id);e.cooldown=2.4+e.index*.12;
    }
  }
  const hits=[];
  for(const shot of game.shots){
    shot.previous=[...shot.position];const travel=Math.min(dt,shot.life),fraction=travel/dt,delta=scale(shot.velocity,travel);
    const colliders=[...pylons,...(shot.owner==='player'?game.enemies.filter(e=>e.health>0).map(e=>({id:e.id,box:actorBox(e.previous),displacement:scale(subtract(e.position,e.previous),fraction)})):[{id:'player',box:{min:add(p.previous,[-.5,0,-.5]),max:add(p.previous,[.5,1.8,.5])},displacement:scale(subtract(p.position,p.previous),fraction)}])];
    const actor=castMovingSegment(shot.position,delta,colliders,{halfSize:.22});
    const ground=castTerrain(shot.position,delta,.22);
    const hit=ground&&(!actor||ground.time<=actor.time)?{...ground,id:'terrain'}:actor;
    if(hit){hits.push({shot,hit,fraction:hit.time*fraction,time:hit.time*travel});shot.life=0;}
    else {shot.position=add(shot.position,delta);shot.life-=travel;}
  }
  hits.sort((a,b)=>a.time-b.time||a.shot.id-b.shot.id);
  for(const {shot,hit,fraction} of hits){
    const at=(a,b)=>a.map((v,i)=>v+(b[i]-v)*fraction);
    explode(game,shot,hit.point,hit.id,new Map(game.enemies.map(e=>[e.id,at(e.previous,e.position)])),at(p.previous,p.position));
  }
  game.shots=game.shots.filter(s=>s.life>0);game.effects=game.effects.filter(e=>(e.life-=dt)>0);
  if(game.effects.length>64)game.effects.splice(0,game.effects.length-64);
  const speed=Math.hypot(p.velocity[0],p.velocity[2]);game.topSpeed=Math.max(game.topSpeed,speed);
  const atBase=Math.hypot(p.position[0]-BASE[0],p.position[2]-BASE[1])<9&&p.position[1]<terrain(...BASE).height+5;
  if(atBase&&p.health>0)p.health=Math.min(100,p.health+28*dt);
  if(game.kills===nests.length&&!game.carrying&&Math.hypot(p.position[0]-CORE[0],p.position[2]-CORE[1])<8&&p.position[1]<terrain(...CORE).height+7){game.carrying=true;game.events.push({type:'core'});}
  if(p.health<=0)game.status='lost';
  else if(game.carrying&&atBase){game.status='won';game.score+=500;game.events.push({type:'win'});}
}
export function aimLead(origin,target,targetVelocity,shooterVelocity=[0,0,0],speed=135){
  const r=subtract(target,origin),v=subtract(targetVelocity,scale(shooterVelocity,.35));
  const a=dot(v,v)-speed*speed,b=2*dot(r,v),c=dot(r,r),disc=b*b-4*a*c;
  if(disc<0)return null;
  const roots=Math.abs(a)<1e-10?(Math.abs(b)>1e-10?[-c/b]:[]):[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)];
  const t=Math.min(...roots.filter(t=>t>0&&t<=4));
  return Number.isFinite(t)?add(origin,add(r,scale(v,t))):null;
}
