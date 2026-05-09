let isPowered=false,isStrobe=false,isBlink=false,advPowered=false;
let brightness=75,color={r:255,g:176,b:0};
let knobA={pk:0,bk:135},drag=null,dragY=0,dragA=0;

function setRocker(on){
  document.getElementById('lever-group').setAttribute('transform',on?'rotate(-20,40,60)':'rotate(20,40,60)');
}
function setAdvRocker(on){
  document.getElementById('adv-lever-g').setAttribute('transform',on?'rotate(-16,24,35)':'rotate(16,24,35)');
}

function togglePower(){
  isPowered=!isPowered;
  setRocker(isPowered);
  document.getElementById('t-on-lbl').classList.toggle('vis',isPowered);
  document.getElementById('power-icon').classList.toggle('lit',isPowered);
  const seg=document.getElementById('seg-display');
  seg.textContent=isPowered?'ON':'OFF';
  seg.classList.toggle('off-state',!isPowered);
  if(!isPowered){
    if(isStrobe){isStrobe=false;stopStrobeAnim();updBtn('btn-strobe','dot-strobe',false)}
    if(isBlink){isBlink=false;stopBlinkAnim();updBtn('btn-blink','dot-blink',false)}
  }else{
    if(isStrobe)startStrobeAnim();
    if(isBlink)startBlinkAnim();
  }
}
function toggleStrobe(){
  if(!isPowered)return;
  isStrobe=!isStrobe;
  if(isBlink&&isStrobe){isBlink=false;stopBlinkAnim();updBtn('btn-blink','dot-blink',false)}
  updBtn('btn-strobe','dot-strobe',isStrobe);
  isStrobe?startStrobeAnim():stopStrobeAnim();
  flashBtn('btn-strobe');
}
function toggleBlink(){
  if(!isPowered)return;
  isBlink=!isBlink;
  if(isStrobe&&isBlink){isStrobe=false;stopStrobeAnim();updBtn('btn-strobe','dot-strobe',false)}
  updBtn('btn-blink','dot-blink',isBlink);
  isBlink?startBlinkAnim():stopBlinkAnim();
  flashBtn('btn-blink');
}
function startStrobeAnim(){document.getElementById('seg-display').style.animation='strobe-f .12s step-end infinite'}
function stopStrobeAnim(){document.getElementById('seg-display').style.animation=''}
function startBlinkAnim(){document.getElementById('seg-display').style.animation='fade-p .8s ease-in-out infinite'}
function stopBlinkAnim(){document.getElementById('seg-display').style.animation=''}
function updBtn(bid,did,on){document.getElementById(bid).classList.toggle('on',on);document.getElementById(did).classList.toggle('lit',on)}
function flashBtn(bid){const b=document.getElementById(bid);b.classList.add('pressed');setTimeout(()=>b.classList.remove('pressed'),140)}

function runScan(){
  const sl=document.getElementById('scan-line');
  sl.style.display='block';sl.style.animation='none';sl.offsetHeight;
  sl.style.animation='scan .46s linear forwards';
  setTimeout(()=>sl.style.display='none',500);
}

function switchToAdvanced(){
  const s=document.getElementById('simple-mode');
  const a=document.getElementById('advanced-mode');
  s.classList.add('mo');
  runScan();
  setTimeout(()=>{
    s.classList.remove('mo');
    s.style.display='none';
    a.style.display='block';
    a.offsetHeight; // force layout before animating
    a.classList.add('mi');
    if(isPowered){
      advPowered=true;
      setAdvRocker(true);
      document.getElementById('adv-status').textContent='ON';
      document.getElementById('adv-status').classList.add('on');
      document.getElementById('adv-seg').classList.remove('off-state');
    }
    setTimeout(()=>a.classList.remove('mi'),440);
  },430);
}

function switchToSimple(){
  const s=document.getElementById('simple-mode');
  const a=document.getElementById('advanced-mode');
  a.classList.add('mbo');
  runScan();
  setTimeout(()=>{
    a.classList.remove('mbo');
    a.style.display='none';
    s.style.display='block';
    s.offsetHeight;
    s.classList.add('mbi');
    isPowered=advPowered;
    setRocker(isPowered);
    document.getElementById('t-on-lbl').classList.toggle('vis',isPowered);
    document.getElementById('power-icon').classList.toggle('lit',isPowered);
    const seg=document.getElementById('seg-display');
    seg.textContent=isPowered?'ON':'OFF';
    seg.classList.toggle('off-state',!isPowered);
    setTimeout(()=>s.classList.remove('mbi'),440);
  },430);
}

function togglePowerAdv(){
  advPowered=!advPowered;
  setAdvRocker(advPowered);
  const st=document.getElementById('adv-status');
  st.textContent=advPowered?'ON':'OFF';
  st.classList.toggle('on',advPowered);
  document.getElementById('adv-seg').classList.toggle('off-state',!advPowered);
}

function updateBrightness(v){
  brightness=parseInt(v);
  document.getElementById('adv-seg').textContent=String(brightness).padStart(3,'0');
  updateLCD();
  const angle=(brightness/100)*270-135;
  knobA.bk=angle;
  const d=document.getElementById('bk-dot');
  d.style.transform=`translateX(-50%) rotate(${angle}deg)`;
}
function updateColor(){
  const r=parseInt(document.getElementById('rs').value);
  const g=parseInt(document.getElementById('gs').value);
  const b=parseInt(document.getElementById('bs').value);
  color={r,g,b};
  const hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  document.getElementById('cprev').style.background=`rgb(${r},${g},${b})`;
  document.getElementById('cprev').style.boxShadow=`0 0 10px rgba(${r},${g},${b},.6)`;
  updateLCD(hex);
}
function updateLCD(hex){
  if(!hex){const{r,g,b}=color;hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()}
  document.getElementById('lcd').innerHTML=`HEX: ${hex}<br>LEVEL: ${brightness}%`;
}
function pressBtnFx(el){el.style.transform='translateY(2px)';el.style.color='#ffb000';setTimeout(()=>{el.style.transform='';el.style.color=''},140)}
function setMode(mode,el){
  document.querySelectorAll('.fbtn,.pbtn').forEach(b=>b.classList.remove('am'));
  const seg=document.getElementById('adv-seg');seg.style.animation='';
  if(el)el.classList.add('am');
  if(mode==='strobe')seg.style.animation='strobe-f .1s step-end infinite';
  else if(mode==='fade')seg.style.animation='fade-p 1.5s ease-in-out infinite';
  else if(mode==='rainbow')seg.style.animation='rainbow-c 3s linear infinite';
  else if(mode==='candle')seg.style.animation='candle-f .4s ease-in-out infinite';
  else if(mode==='police')seg.style.animation='strobe-f .3s step-end infinite';
}

function drawWheel(){
  const c=document.getElementById('hue-canvas');if(!c)return;
  const ctx=c.getContext('2d');const cx=36,cy=36,r=34;
  for(let a=0;a<360;a++){const s=(a-1)*Math.PI/180,e=(a+1)*Math.PI/180;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,s,e);ctx.closePath();ctx.fillStyle=`hsl(${a},100%,50%)`;ctx.fill()}
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  g.addColorStop(0,'rgba(0,0,0,.88)');g.addColorStop(.45,'rgba(0,0,0,.25)');g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  c.addEventListener('click',e=>{
    const rc=c.getBoundingClientRect();const x=e.clientX-rc.left-cx,y=e.clientY-rc.top-cy;
    const hue=((Math.atan2(y,x)*180/Math.PI)+360)%360;const dist=Math.min(Math.sqrt(x*x+y*y)/r,1);
    const[r2,g2,b2]=hsl2rgb(hue/360,dist,.5);
    document.getElementById('rs').value=r2;document.getElementById('gs').value=g2;document.getElementById('bs').value=b2;
    const ind=document.getElementById('hue-ind');
    ind.style.left=(cx+Math.cos(hue*Math.PI/180)*dist*r)+'px';ind.style.top=(cy+Math.sin(hue*Math.PI/180)*dist*r)+'px';
    updateColor();
  });
}
function hsl2rgb(h,s,l){let r,g,b;if(!s){r=g=b=l}else{const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;r=h2r(p,q,h+1/3);g=h2r(p,q,h);b=h2r(p,q,h-1/3)}return[Math.round(r*255),Math.round(g*255),Math.round(b*255)]}
function h2r(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}

function startDrag(e,id){drag=id;dragY=e.clientY;dragA=knobA[id];document.addEventListener('mousemove',onDrag);document.addEventListener('mouseup',stopDrag);e.preventDefault()}
function onDrag(e){if(!drag)return;const d=(dragY-e.clientY)*1.6;const a=Math.max(-135,Math.min(135,dragA+d));knobA[drag]=a;const dot=document.getElementById(drag+'-dot');dot.style.transform=`translateX(-50%) rotate(${a}deg)`;if(drag==='bk'){brightness=Math.round(((a+135)/270)*100);document.getElementById('br-sl').value=brightness;document.getElementById('adv-seg').textContent=String(brightness).padStart(3,'0');updateLCD()}}
function stopDrag(){drag=null;document.removeEventListener('mousemove',onDrag);document.removeEventListener('mouseup',stopDrag)}

drawWheel();updateLCD();
setRocker(false);setAdvRocker(false);
