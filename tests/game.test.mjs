import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,createPlayer,stepGame,movePlayer,fire,aimLead,STEP,PHYSICS} from '../site/src/game.js';
import {terrain,terrainTriangles,castTerrain,pylons,BASE,CORE} from '../site/src/world.js';
import {castMovingSegment} from '../site/vendor/vanillajs/modules/collision/index.js';
import {FixedClock} from '../site/vendor/vanillajs/modules/time/index.js';
import {add,subtract,scale,dot,cross,normalize,length,seededRandom,clamp} from '../site/vendor/vanillajs/modules/math/index.js';

test('mesh and terrain sampler share exactly the same triangles',()=>{
  for(const tri of terrainTriangles()){
    const p=[0,1,2].map(k=>tri[0][k]*.23+tri[1][k]*.31+tri[2][k]*.46);
    assert.ok(Math.abs(terrain(p[0],p[2]).height-p[1])<1e-9);
    assert.ok(terrain(p[0],p[2]).normal[1]>0);
  }
});
function bruteTerrain(origin,delta){
  let nearest=Infinity;
  for(const [a,b,c] of terrainTriangles()){
    const e1=subtract(b,a),e2=subtract(c,a),p=cross(delta,e2),det=dot(e1,p);if(Math.abs(det)<1e-10)continue;
    const s=subtract(origin,a),u=dot(s,p)/det;if(u<0||u>1)continue;
    const q=cross(s,e1),v=dot(delta,q)/det;if(v<0||u+v>1)continue;
    const t=dot(e2,q)/det;if(t>=0&&t<=1)nearest=Math.min(nearest,t);
  }
  return Number.isFinite(nearest)?nearest:null;
}
test('grid-boundary terrain sweeps agree with independent ray/triangle oracle',()=>{
  const random=seededRandom(313);
  for(let i=0;i<60;i++){
    const a=[(random()-.5)*480,80+random()*20,(random()-.5)*480],b=[(random()-.5)*480,random()*35,(random()-.5)*480],d=subtract(b,a);
    const expected=bruteTerrain(a,d),actual=castTerrain(a,d);
    if(expected===null)assert.equal(actual,null);else assert.ok(Math.abs(actual.time-expected)<1e-8,`${actual?.time} != ${expected}`);
  }
});
test('terrain sweeps catch an intervening ridge with clear endpoints',()=>{
  let found=false;
  for(let x=-200;x<200&&!found;x+=15)for(let z=-180;z<100&&!found;z+=15){
    const a=[x,Math.max(terrain(x,z).height,terrain(x,z+100).height)+.1,z],d=[0,0,100];
    if(bruteTerrain(a,d)!==null){assert.ok(castTerrain(a,d));found=true;}
  }
  assert.ok(found,'fixture must cross an actual ridge');
});
test('jets consume finite fuel, lift the player, and recharge only on release',()=>{
  const p=createPlayer(),initial=p.position[1];
  for(let i=0;i<240;i++)movePlayer(p,{jet:true},STEP);
  assert.ok(p.position[1]>initial+10);assert.ok(Math.abs(p.energy-48)<1e-8);
  for(let i=0;i<400;i++)movePlayer(p,{jet:true},STEP);
  assert.equal(p.energy,0);assert.equal(p.jetting,false);
  for(let i=0;i<600;i++)movePlayer(p,{},STEP);assert.equal(p.energy,100);
});
test('partial final fuel burn cannot supply a full tick of thrust',()=>{
  const a=createPlayer(),b=createPlayer();for(const p of [a,b]){p.position[1]+=60;p.grounded=false;p.energy=.01;}
  movePlayer(a,{jet:true},STEP);movePlayer(b,{},STEP);
  assert.ok(Math.abs(a.velocity[1]-b.velocity[1]-PHYSICS.thrust*.01/PHYSICS.drain)<1e-9);assert.equal(a.energy,0);
});
test('skiing retains momentum that walking deliberately brakes',()=>{
  const a=createPlayer(),b=createPlayer();a.velocity=[20,0,0];b.velocity=[20,0,0];
  for(let i=0;i<60;i++){movePlayer(a,{ski:true},STEP);movePlayer(b,{},STEP);}
  assert.ok(Math.hypot(a.velocity[0],a.velocity[2])>Math.hypot(b.velocity[0],b.velocity[2])+8);
});
for(const training of [true,false])test(`grounded disc jump lifts a skier in ${training?'training':'raid'} mode`,()=>{
  const game=createGame(training),p=game.player;
  p.position=[0,terrain(0,100).height+.03,100];p.previous=[...p.position];p.pitch=-1.48;
  let impact=false;
  for(let i=0;i<20;i++){
    stepGame(game,{ski:true,fire:i===0},STEP);
    if(game.events.some(e=>e.type==='explosion')){impact=true;break;}
  }
  assert.ok(impact,'the downward disc must explode');
  const ground=()=>terrain(p.position[0],p.position[2]);
  const outward=dot(p.velocity,ground().normal),clearance=p.position[1]-ground().height;
  assert.ok(outward>10,'self splash supplies a separating impulse');
  const health=p.health;
  if(training)assert.equal(health,100);else assert.ok(health<100&&health>0,'raid keeps its self-damage cost');
  stepGame(game,{ski:true},STEP);
  assert.equal(p.grounded,false,'a separating impulse must leave ground contact');
  assert.ok(dot(p.velocity,ground().normal)>outward-1,'the next tick must preserve the launch impulse');
  assert.ok(p.position[1]-ground().height>clearance+.05,'the skier actually lifts off');
  assert.equal(p.health,health,'the explosion must not charge damage again');
  for(let i=0;i<24;i++)stepGame(game,{ski:true},STEP);
  assert.ok(p.position[1]-ground().height>1,'the jump continues into an airborne arc');
  assert.equal(p.energy,100,'disc jumping must not require jet fuel');
});
test('high-speed landings never leave the feet below rendered terrain',()=>{
  const p=createPlayer();p.position=[-170,80,20];p.previous=[...p.position];p.velocity=[95,-70,-10];p.grounded=false;
  for(let i=0;i<2400;i++){movePlayer(p,{ski:true},STEP);assert.ok(p.position[1]>=terrain(p.position[0],p.position[2]).height-1e-8);assert.ok([...p.position,...p.velocity,p.energy].every(Number.isFinite));}
});
test('upright body is stopped by physical pylons at speed',()=>{
  const p=createPlayer(),box=pylons[0].box;p.position=[box.min[0]-5,box.min[1]+6,(box.min[2]+box.max[2])/2];p.velocity=[100,0,0];p.grounded=false;
  for(let i=0;i<10;i++)movePlayer(p,{},STEP);assert.ok(p.position[0]<=box.min[0]-.5+1e-6);
});
test('moving-target sweep catches a target that crosses a shot between endpoints',()=>{
  const hit=castMovingSegment([-2,0,0],[4,0,0],[{id:'target',box:{min:[-.2,1.8,-.2],max:[.2,2.2,.2]},displacement:[0,-4,0]}]);
  assert.ok(hit&&hit.time>.4&&hit.time<.6);
});
test('travelling shots deal damage once and have bounded lifetime/capacity',()=>{
  const game=createGame(true),e=game.enemies[0];
  fire(game,add(e.position,[0,1.7,4]),[0,0,-1]);
  for(let i=0;i<30;i++)stepGame(game,{},STEP);
  assert.equal(e.health,0);assert.equal(game.kills,1);assert.equal(game.directHits,1);assert.equal(game.score,150);
  for(let i=0;i<100;i++)fire(game,[0,100,0],[0,1,0]);assert.equal(game.shots.length,96);
  for(let i=0;i<600;i++)stepGame(game,{},STEP);assert.equal(game.shots.length,0);
});
test('terrain blocks a shot before an enemy behind it',()=>{
  const game=createGame(true),e=game.enemies[0];fire(game,[0,terrain(0,0).height-.1,0],subtract(e.position,[0,0,0]));stepGame(game,{},STEP);assert.equal(game.kills,0);assert.equal(game.shots.length,0);
});
test('projectile lead includes inherited shooter velocity',()=>{
  const origin=[0,0,0],target=[10,4,-120],velocity=[15,2,0],shooter=[8,1,-3];
  const aim=aimLead(origin,target,velocity,shooter);assert.ok(aim);
  const flight=length(subtract(aim,origin))/135;
  const impact=add(origin,scale(add(scale(normalize(subtract(aim,origin)),135),scale(shooter,.35)),flight));
  const actual=add(target,scale(velocity,flight));assert.ok(length(subtract(impact,actual))<1e-8);
  assert.equal(aimLead(origin,[0,0,-200],[0,0,-500]),null);
});
test('clock pause freezes movement, shots, fuel and mission time',()=>{
  const game=createGame(true),clock=new FixedClock({step:STEP});clock.advance(.05,dt=>stepGame(game,{jet:true,fire:true},dt));
  clock.setPaused(true);const before=structuredClone(game);clock.advance(5,dt=>stepGame(game,{jet:true,fire:true},dt));assert.deepEqual(game,before);
  clock.setPaused(false);clock.advance(STEP,dt=>stepGame(game,{},dt));assert.ok(game.time>before.time);
});
test('identical fixed-tick inputs replay identically in this JS runtime',()=>{
  const a=createGame(true),b=createGame(true);for(let i=0;i<1800;i++){const input={forward:i%800<400?1:0,right:i%200<100?.5:-.5,ski:i%400<200,jet:i%300<75,fire:i%160<30};stepGame(a,input,STEP);stepGame(b,input,STEP);}assert.deepEqual(a,b);
});
test('mission requires all sentries, core collection, then a low return to base',()=>{
  const game=createGame(true);game.player.position=[CORE[0],terrain(...CORE).height,CORE[1]];game.player.previous=[...game.player.position];stepGame(game,{},STEP);assert.equal(game.carrying,false);
  game.enemies.forEach(e=>e.health=0);game.kills=6;stepGame(game,{},STEP);assert.equal(game.carrying,true);assert.equal(game.status,'playing');
  game.player.position=[BASE[0],terrain(...BASE).height+40,BASE[1]];game.player.velocity=[0,0,0];stepGame(game,{},STEP);assert.equal(game.status,'playing');
  game.player.position=[BASE[0],terrain(...BASE).height,BASE[1]];game.player.velocity=[0,0,0];stepGame(game,{},STEP);assert.equal(game.status,'won');const score=game.score;stepGame(game,{},STEP);assert.equal(game.score,score);
});
test('death wins over return and a terminal game cannot keep firing',()=>{
  const game=createGame(true);game.carrying=true;game.player.health=0;stepGame(game,{},STEP);assert.equal(game.status,'lost');const before=structuredClone(game);stepGame(game,{fire:true},STEP);assert.deepEqual(game,before);
});
test('training sentries are passive while raid sentries actually fire',()=>{
  const train=createGame(true),raid=createGame(false);for(const g of [train,raid]){g.player.position=[0,65,70];g.player.grounded=false;}
  let hostile=false;for(let i=0;i<720;i++){stepGame(train,{jet:i<120},STEP);stepGame(raid,{jet:i<120},STEP);hostile ||= raid.shots.some(s=>s.owner!=='player');}
  assert.equal(train.player.health,100);assert.ok(hostile);assert.equal(train.shots.length,0);
});
test('input-driven flight-school pilot completes the entire mission without teleporting',()=>{
  const g=createGame(true);
  for(let i=0;i<120*90&&g.status==='playing';i++){
    const p=g.player,e=g.enemies.find(e=>e.health>0),destination=g.carrying?BASE:CORE;
    const goal=e?e.position:[destination[0],0,destination[1]];
    const aim=e?aimLead(add(p.position,[0,1.65,0]),add(e.position,[0,1.7,0]),e.velocity,p.velocity):null;
    const dx=goal[0]-p.position[0],dz=goal[2]-p.position[2],distance=Math.hypot(dx,dz),v=aim?subtract(aim,add(p.position,[0,1.65,0])):[dx,0,dz];
    p.yaw=Math.atan2(-v[0],-v[2]);p.pitch=Math.atan2(v[1],Math.hypot(v[0],v[2]));
    const speed=clamp((distance-(e?25:0))*.8,0,14),wx=dx/(distance||1)*speed-p.velocity[0]*.75,wz=dz/(distance||1)*speed-p.velocity[2]*.75;
    const desiredHeight=e?Math.max(goal[1]+2,terrain(p.position[0],p.position[2]).height+8):terrain(p.position[0],p.position[2]).height+(distance>20?8:0);
    stepGame(g,{forward:clamp((-Math.sin(p.yaw)*wx-Math.cos(p.yaw)*wz)/6,-1,1),right:clamp((Math.cos(p.yaw)*wx-Math.sin(p.yaw)*wz)/6,-1,1),jet:p.position[1]<desiredHeight&&p.velocity[1]<7,fire:!!e},STEP);
  }
  assert.equal(g.status,'won');assert.equal(g.kills,6);assert.equal(g.carrying,true);assert.ok(g.directHits>=6);assert.ok(g.time<90);
});
