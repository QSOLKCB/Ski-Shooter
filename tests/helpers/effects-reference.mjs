// SPDX-License-Identifier: Apache-2.0
// Frozen fresh geometry reference from Ski-Shooter 17e3604fdea879c885aed5d36ae427b59648d025.
// Test/benchmark only; never packaged. Keep independent of the optimized builder.
import {ringVertices} from '../../site/vendor/vanillajs/modules/render-webgl/index.js';
import {mix} from '../../site/vendor/vanillajs/modules/math/index.js';
import {CORE,terrain} from '../../site/src/world.js';
function octahedron(pos,r,color){
  const v=[[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]].map(v=>v.map((n,i)=>n+pos[i]));
  const out=[];for(const f of [[0,2,4],[4,2,1],[1,2,5],[5,2,0],[4,3,0],[1,3,4],[5,3,1],[0,3,5]])for(const i of f)out.push(...v[i],...color);return out;
}
function cylinder(center,radius,height,color,sides=12){
  const out=[];for(let i=0;i<sides;i++){
    const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
    const x=center[0],y=center[1],z=center[2];
    const p=[x+Math.cos(a)*radius,y,z+Math.sin(a)*radius],q=[x+Math.cos(b)*radius,y,z+Math.sin(b)*radius];
    for(const v of [p,q,[q[0],y+height,q[2]],p,[q[0],y+height,q[2]],[p[0],y+height,p[2]],[x,y+height,z],[p[0],y+height,p[2]],[q[0],y+height,q[2]]])out.push(...v,...color);
  }return out;
}

export function referenceEffects(game,alpha,reducedMotion=false){
    const dynamic=[],lines=[];
    for(const e of game.enemies){if(e.health<=0)continue;const pos=mix(e.previous,e.position,alpha);
      dynamic.push(...cylinder([pos[0],pos[1]-.6,pos[2]],.55,.6,[1,.37,.12],8));
      dynamic.push(...octahedron([pos[0],pos[1]-.9-(reducedMotion?0:Math.sin(game.time*37+e.index)*.2),pos[2]],.42,[1,.7,.22]));
      lines.push(...ringVertices([pos[0],pos[1]+1.65,pos[2]],2.5,[.9,.35,.14],16));
    }
    for(const s of game.shots){const pos=mix(s.previous,s.position,alpha),c=s.owner==='player'?[.35,1,.93]:[1,.35,.12];dynamic.push(...octahedron(pos,.3,c));lines.push(...s.previous,...c,...pos,...c);}
    for(const e of game.effects){const radius=(.55-e.life)*14+.3;lines.push(...ringVertices(e.position,radius,e.owner==='player'?[.45,.95,.86]:[1,.5,.2],24));dynamic.push(...octahedron(e.position,e.life*1.8,[1,.8,.4]));}
    if(!game.carrying){const pos=[CORE[0],terrain(...CORE).height+3,CORE[1]];dynamic.push(...octahedron(pos,1.7,game.kills===6?[.4,1,.9]:[1,.55,.18]));}
    return {dynamic,lines};
}
