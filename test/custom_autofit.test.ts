// @ts-nocheck
import { composeCustom, CUSTOM, centerX } from '../src/faces/engine.js';
import { test, expect } from 'vitest';
const fits=(L)=>{try{composeCustom(L);return true}catch{return false}};
function autoFit(L,np){ if(fits(L))return true; const y0=np.y;
 for(let d=1;d<=60;d++)for(const y of [y0-d,y0+d]){if(y<0||y>255)continue;np.y=y;if(fits(L))return true;}
 np.y=y0; const below=L.parts.filter(q=>q!==np&&q.y>np.y),sv=below.map(q=>q.y);
 for(let d=1;d<=60;d++){below.forEach((q,i)=>q.y=sv[i]+d);if(fits(L))return true;} return false;}
test('builder auto-fit places every nose with every mouth (Long nose blank-face bug)', () => {
  const raw=[],after=[];
  CUSTOM.parts.nose.forEach((n,id)=>CUSTOM.parts.mouth.forEach((mo,mid)=>{ const mk=()=>({v:2,border:5,parts:[{t:'brow',id:3,x:centerX('brow',3),y:26},{t:'eye',id:0,x:centerX('eye',0),y:50},{t:'mouth',id:mid,x:centerX('mouth',mid),y:112},{t:'nose',id,x:centerX('nose',id),y:92}]});
    const L=mk(); if(!fits(L)){ try{composeCustom(L)}catch(e){raw.push(n.name+'+'+mo.name+': '+e.message)} if(!autoFit(L,L.parts[3])) after.push(n.name+'+'+mo.name); } }));
  expect(raw.length).toBeGreaterThan(0); expect(after).toEqual([]);
});
