import test from 'node:test';
import assert from 'node:assert/strict';
import {castSegment,castMovingSegment,moveAndSlideAABB} from '../site/vendor/vanillajs/modules/collision/index.js';
import {seededRandom,scale} from '../site/vendor/vanillajs/modules/math/index.js';
import {segmentCandidates,sweptBoxCandidates} from '../site/src/broadphase.js';
import {pylons} from '../site/src/world.js';

// The broadphase may only drop colliders the full query would never report, so
// every result field the game reads (and the rest) must be identical.
const near=(random,box,spread)=>box.min.map((v,i)=>v+(box.max[i]-v)*random()+(random()-.5)*spread);
const moving=(random,i)=>{const c=[(random()-.5)*400,20+random()*60,(random()-.5)*400];
  return {id:'mover-'+i,box:{min:[c[0]-1.35,c[1],c[2]-1.35],max:[c[0]+1.35,c[1]+3.4,c[2]+1.35]},displacement:[(random()-.5)*.8,(random()-.5)*.4,(random()-.5)*.8]};};

test('segment broadphase returns exactly the full static cast result',()=>{
  const random=seededRandom(91);let hits=0;
  for(let i=0;i<20000;i++){
    const target=pylons[i%pylons.length].box,origin=i%3?near(random,target,30):[(random()-.5)*500,random()*90,(random()-.5)*500];
    const delta=[(random()-.5)*(i%4?3:60),(random()-.5)*(i%4?3:60),(random()-.5)*(i%4?3:60)],halfSize=i%2?.22:0;
    const full=castSegment(origin,delta,pylons,{halfSize}),fast=castSegment(origin,delta,segmentCandidates(origin,delta,pylons,halfSize),{halfSize});
    if(full)hits++;
    assert.deepEqual(fast&&{...fast,index:undefined},full&&{...full,index:undefined});
    if(full)assert.equal(fast.id,full.id);
  }
  assert.ok(hits>400,`fixture must actually hit pylons (${hits})`);
});

test('moving-segment broadphase matches the full cast against translating targets',()=>{
  const random=seededRandom(17);let hits=0;
  for(let i=0;i<20000;i++){
    const movers=Array.from({length:6},(_,k)=>moving(random,k)),colliders=[...pylons,...movers];
    const target=colliders[i%colliders.length].box,origin=near(random,target,12);
    const delta=[(random()-.5)*2.4,(random()-.5)*2.4,(random()-.5)*2.4];
    const full=castMovingSegment(origin,delta,colliders,{halfSize:.22});
    const fast=castMovingSegment(origin,delta,segmentCandidates(origin,delta,colliders,.22,true),{halfSize:.22});
    if(full)hits++;
    assert.deepEqual(fast&&{...fast,index:undefined},full&&{...full,index:undefined});
  }
  assert.ok(hits>2000,`fixture must actually hit targets (${hits})`);
});

test('swept-body broadphase matches full moveAndSlide, including starts inside a pylon',()=>{
  const random=seededRandom(5),boxes=pylons.map(c=>c.box),extents=[.5,.9,.5];let contacts=0,inside=0;
  for(let i=0;i<20000;i++){
    const box=boxes[i%boxes.length],center=near(random,box,i%5?8:0),velocity=[(random()-.5)*220,(random()-.5)*120,(random()-.5)*220],h=1/120/(1+i%3);
    const candidates=sweptBoxCandidates(center,scale(velocity,h),extents,boxes);
    if(candidates===boxes)inside++;
    const full=moveAndSlideAABB(center,velocity,h,extents,boxes),fast=moveAndSlideAABB(center,velocity,h,extents,candidates);
    if(full.contacts.length)contacts++;
    assert.deepEqual(fast.position,full.position);assert.deepEqual(fast.velocity,full.velocity);assert.equal(fast.truncated,full.truncated);
    assert.deepEqual(fast.contacts.map(c=>c.normal),full.contacts.map(c=>c.normal));
  }
  assert.ok(contacts>1000&&inside>1000,`fixture must slide and overlap (${contacts}, ${inside})`);
});
