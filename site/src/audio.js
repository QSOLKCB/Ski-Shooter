// SPDX-License-Identifier: Apache-2.0
import {seededRandom} from '../vendor/vanillajs/modules/math/index.js';
export class Sound {
  constructor(){this.muted=false;this.buffers={};this.active=new Set();}
  async start(){
    if(!this.context){
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;
      const ctx=this.context=new Audio(),rng=seededRandom(89);this.master=ctx.createGain();this.master.gain.value=this.muted?0:.35;this.master.connect(ctx.destination);
      const noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(rng()*2-1)*.2;
      this.wind=ctx.createBufferSource();this.wind.buffer=noise;this.wind.loop=true;this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=700;
      this.windGain=ctx.createGain();this.windGain.gain.value=0;this.wind.connect(this.filter);this.filter.connect(this.windGain);this.windGain.connect(this.master);this.wind.start();
      this.loading=Promise.all(Object.entries({fire:'rocket1i',explosion:'r_exp3',hit:'lhit'}).map(async([key,file])=>{
        const res=await fetch(`assets/librequake/${file}.wav`);if(!res.ok)throw Error('Sound unavailable');this.buffers[key]=await ctx.decodeAudioData(await res.arrayBuffer());
      })).catch(()=>{this.unavailable=true;});
    }
    await this.context.resume();
  }
  pause(){if(this.context){this.windGain.gain.value=0;for(const s of this.active){try{s.stop();}catch{}}this.active.clear();this.context.suspend().catch(()=>{});}}
  mute(value){this.muted=value;if(this.master)this.master.gain.value=value?0:.35;}
  update(player){if(!this.context||this.context.state!=='running')return;const t=this.context.currentTime,speed=Math.hypot(...player.velocity);this.windGain.gain.setTargetAtTime(Math.min(.7,speed/170)+(player.jetting?.25:0),t,.08);this.filter.frequency.setTargetAtTime(player.jetting?1600:400+speed*10,t,.05);}
  play(type,distance=0){
    if(!this.buffers[type]||this.active.size>=24||!this.context||this.context.state!=='running')return;
    const s=this.context.createBufferSource(),gain=this.context.createGain();s.buffer=this.buffers[type];gain.gain.value=(type==='explosion'?.55:.75)/(1+distance*.035);s.connect(gain);gain.connect(this.master);this.active.add(s);s.onended=()=>{this.active.delete(s);s.disconnect();gain.disconnect();};s.start();
  }
}
