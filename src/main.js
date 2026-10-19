import * as THREE from 'three';
import { io } from 'socket.io-client';
import './style.css';

const app = document.querySelector('#app');
const connectionEl = document.querySelector('#connection');
const playersEl = document.querySelector('#players');
const timerEl = document.querySelector('#timer');
const positionEl = document.querySelector('#position');
const progressLabel = document.querySelector('#progress-label');
const progressBar = document.querySelector('#progress-bar');
const overlay = document.querySelector('#overlay');
const endOverlay = document.querySelector('#end-overlay');
const toastEl = document.querySelector('#toast');

const params = new URLSearchParams(location.search);
const SERVER_URL = params.get('server') || (location.port === '5173' ? `${location.protocol}//${location.hostname}:3001` : location.origin);
const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

let joined = false, started = false, finished = false, startTime = 0;
let playerId = null, playerName = 'Player', remotePlayers = new Map();
let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ddcff);
scene.fog = new THREE.Fog(0x8ddcff, 65, 180);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 350);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe8f8ff, 0x7d62a8, 2.1));
const sun = new THREE.DirectionalLight(0xfff2ce, 3.1);
sun.position.set(-15, 32, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
scene.add(sun);

const mat = (color, roughness = 0.78, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const mats = {
  grass: mat(0x53d69b), grass2: mat(0x35bb88), pink: mat(0xff6fae),
  yellow: mat(0xffd84d), blue: mat(0x51bfff), purple: mat(0x9c75ff),
  orange: mat(0xff9a50), white: mat(0xffffff), dark: mat(0x273254),
  skin: mat(0xffc49b), shoe: mat(0x28304b), red: mat(0xff4f67),
  green: mat(0x5fe1a0), cyan: mat(0x55e6ec)
};

function box(w,h,d, material, x,y,z, parent=scene, cast=true, receive=true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
  mesh.position.set(x,y,z); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); return mesh;
}
function sphere(r, material, x,y,z, parent=scene, seg=16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r,seg,12), material);
  mesh.position.set(x,y,z); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function cylinder(rt,rb,h,material,x,y,z,parent=scene,seg=12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),material);
  mesh.position.set(x,y,z); mesh.castShadow=true; parent.add(mesh); return mesh;
}

// Clouds and decorative islands
for (let i=0;i<42;i++) {
  const x=(Math.random()-.5)*190, y=10+Math.random()*34, z=-25-Math.random()*145;
  const g=new THREE.Group(); g.position.set(x,y,z); scene.add(g);
  const cloudMat=mat(i%3===0?0xffffff:0xeaf8ff);
  for(let j=0;j<4;j++) sphere(1.8+Math.random()*1.8,cloudMat,(j-1.5)*2.2,Math.random()*1.2,Math.random()*1.3,g,12);
}
for(let i=0;i<12;i++){
  const x=(Math.random()-.5)*120,z=-20-Math.random()*145;
  const island=new THREE.Group(); island.position.set(x,-2.5,z); scene.add(island);
  cylinder(1.2,3.4,5,mat([0x7e67cf,0x5a90d6,0x57c9a4][i%3]),0,0,0,island,7);
  sphere(1.2,mats.grass,0,2.2,0,island,8);
}

// Raceway platform segments: start to finish runs toward negative Z
const trackSegments = [];
const segmentDefs = [
  {z:0, len:18, color:0x55d9a0},
  {z:-18, len:16, color:0x63c8ff},
  {z:-35, len:18, color:0xff92c5},
  {z:-54, len:18, color:0xffd45c},
  {z:-73, len:18, color:0x9c83ff},
  {z:-92, len:18, color:0x5be2d0},
  {z:-111, len:20, color:0xffa05e},
  {z:-132, len:20, color:0x69c5ff}
];
for(const d of segmentDefs){
  const platform=box(16,1.1,d.len,mat(d.color),0,0.1,d.z);
  const edgeMat=mat(0xffffff);
  box(.35,.4,d.len,edgeMat,-7.9,.82,d.z);
  box(.35,.4,d.len,edgeMat,7.9,.82,d.z);
  trackSegments.push({z:d.z,len:d.len,mesh:platform});
}
// Starting gate and finish arch
for(const z of [8,-143]){
  const archMat=mat(z===8?0xffe45b:0xff5da7);
  box(.7,5,.7,archMat,-5,3,z);
  box(.7,5,.7,archMat,5,3,z);
  box(10.7,.7,.7,archMat,0,5.5,z);
}
box(9,.1,1,mats.white,0,.8,-143);

// Moving obstacle bars
const obstacles=[];
function addSpinner(z, color, speed, y=2.3, length=10) {
  const pivot=new THREE.Group(); pivot.position.set(0,y,z); scene.add(pivot);
  const bar=box(length,.65,.8,mat(color),0,0,0,pivot);
  for(const s of [-1,1]){
    cylinder(.36,.36,.35,mats.yellow, s*length/2,0,0,pivot);
  }
  cylinder(.6,.6,.6,mats.purple,0,0,0,pivot);
  obstacles.push({type:'spin',pivot,speed,z});
}
addSpinner(-22,0xff5c9a,1.55,2.1,11);
addSpinner(-48,0xff9c42,-1.9,2.4,12);
addSpinner(-80,0x865eff,2.15,2.1,11);
addSpinner(-119,0xff5c9a,-2.25,2.4,12);

// Jump pads
for(const [x,z] of [[-4,-13],[4,-42],[-4,-66],[4,-101],[0,-126]]){
  const pad=box(2.5,.25,2.5,mats.yellow,x,.9,z);
  sphere(.18,mats.white,x,1.12,z);
  pad.userData.bounce=true;
}

// Finish flags / floating rings
for(let i=0;i<8;i++){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.12,8,24),mat([0xfff06a,0xff70b5,0x6ee8ff][i%3]));
  ring.position.set(Math.sin(i*1.4)*3,3.1,-14-i*16); ring.rotation.y=.3; scene.add(ring);
}

// Character models
function makeCharacter(color=0x5a5cff, name='Player', isLocal=false) {
  const root=new THREE.Group();
  const bodyMat=mat(color), faceMat=mat(0xffd0a8), whiteMat=mat(0xffffff), blackMat=mat(0x22283e);
  const body=sphere(.62,bodyMat,0,1.22,0,root,20); body.scale.set(.88,1.1,.72);
  sphere(.49,faceMat,0,2.02,.02,root,20);
  // hair / cap
  sphere(.5,mat(isLocal?0x37365e:0x45405b),0,2.34,-.03,root,16).scale.set(1,.42,.92);
  sphere(.075,whiteMat,-.17,2.06,.44,root,12); sphere(.075,whiteMat,.17,2.06,.44,root,12);
  sphere(.035,blackMat,-.16,2.05,.505,root,10); sphere(.035,blackMat,.18,2.05,.505,root,10);
  // smile
  const smile=new THREE.Mesh(new THREE.TorusGeometry(.11,.025,6,14,Math.PI),mat(0x8d4354));
  smile.position.set(0,1.88,.46); smile.rotation.z=Math.PI; root.add(smile);
  const arms=[];
  for(const s of [-1,1]){
    const arm=cylinder(.16,.13,.78,bodyMat,s*.62,1.25,0,root,10); arm.rotation.z=s*-.28; arms.push(arm);
    const leg=cylinder(.18,.16,.58,mat(0x414d75),s*.25,.38,0,root,10);
    sphere(.2,mat(0x26304b),s*.25,.12,.12,root,10);
  }
  // name tag
  const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(25,31,65,.82)'; ctx.roundRect(3,3,250,58,18); ctx.fill();
  ctx.font='bold 26px Arial'; ctx.textAlign='center'; ctx.fillStyle='#ffffff'; ctx.fillText(name.slice(0,16),128,40);
  const tex=new THREE.CanvasTexture(canvas);
  const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  tag.scale.set(3.2,.8,1); tag.position.y=3.15; root.add(tag);
  root.userData.arms=arms; root.userData.body=body; root.userData.isLocal=isLocal;
  scene.add(root); return root;
}

let player=null;
const remoteColors=[0xff6f9f,0x63c7ff,0xffd84d,0x9a7bff,0x52dfad,0xff9b55,0xff6b6b];
function addRemote(id, data){
  if(remotePlayers.has(id)) return;
  const char=makeCharacter(remoteColors[remotePlayers.size%remoteColors.length],data.name||'Runner',false);
  remotePlayers.set(id,{root:char,target:new THREE.Vector3(data.x||0,0,data.z||5),lastSeen:performance.now(),finished:false});
}
function removeRemote(id){ const p=remotePlayers.get(id); if(p){scene.remove(p.root); disposeTree(p.root); remotePlayers.delete(id);} }
function disposeTree(obj){obj.traverse(o=>{if(o.geometry)o.geometry.dispose(); if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose()})}})}

const keys={};
addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space'&&player)jump();});
addEventListener('keyup',e=>keys[e.code]=false);
let pointerLocked=false, yaw=0, pitch=.18;
renderer.domElement.addEventListener('click',()=>{if(started&&!finished&&renderer.domElement.requestPointerLock)renderer.domElement.requestPointerLock();});
document.addEventListener('pointerlockchange',()=>pointerLocked=document.pointerLockElement===renderer.domElement);
document.addEventListener('mousemove',e=>{if(pointerLocked){yaw-=e.movementX*.0024;pitch=Math.max(-.25,Math.min(.65,pitch-e.movementY*.0018));}});
let touchYaw=0;
const velocity=new THREE.Vector3(), moveDir=new THREE.Vector3();
let grounded=false, jumps=0, health=100, elapsed=0, wins=0, lastEmit=0;
const playerState={x:0,y:1,z:5,finished:false};
function jump(){if(grounded&&started&&!finished){velocity.y=9.5;grounded=false;jumps++;}}
function resetPlayer(){
  if(!player) player=makeCharacter(0x5a5cff,playerName,true);
  player.position.set(0,0,5); player.rotation.set(0,0,0);
  velocity.set(0,0,0); health=100; grounded=false; jumps=0; finished=false;
  playerState.x=0;playerState.y=1;playerState.z=5;playerState.finished=false;
  started=true; elapsed=0; startTime=performance.now(); yaw=0;pitch=.18;
  endOverlay.classList.add('hidden');
}
function finishGame(won, message){
  if(finished)return; finished=true; playerState.finished=true;
  document.exitPointerLock?.();
  document.querySelector('#result-emoji').textContent=won?'🏆':'💫';
  document.querySelector('#result-title').textContent=won?'KAMU MENANG!':'COBA LAGI!';
  document.querySelector('#result-text').textContent=message;
  endOverlay.classList.remove('hidden');
  socket.emit('finish',{won,time:elapsed});
}
document.querySelector('#play-btn').addEventListener('click',()=>{
  playerName=(document.querySelector('#nickname').value||'Player').trim().slice(0,16)||'Player';
  if(!socket.connected){toast('Server belum terhubung. Coba lagi sebentar.');return;}
  socket.emit('join',{name:playerName});
});
document.querySelector('#again-btn').addEventListener('click',()=>{
  endOverlay.classList.add('hidden'); overlay.classList.remove('hidden'); started=false;
  socket.emit('leave-round');
});

socket.on('connect',()=>{connectionEl.textContent='Server terhubung';connectionEl.style.color='#7cffbd';});
socket.on('disconnect',()=>{connectionEl.textContent='Terputus';connectionEl.style.color='#ff7b8d';toast('Koneksi server terputus.');});
socket.on('joined',data=>{
  playerId=data.id; joined=true;
  overlay.classList.add('hidden'); resetPlayer();
  for(const [id,p] of Object.entries(data.players||{})){if(id!==playerId)addRemote(id,p);}
  toast('Selamat datang di arena, '+playerName+'!');
});
socket.on('players',players=>{
  playersEl.textContent=Object.keys(players).length;
  for(const [id,p] of Object.entries(players)){if(id!==playerId&&!remotePlayers.has(id))addRemote(id,p);}
  for(const id of [...remotePlayers.keys()])if(!players[id])removeRemote(id);
});
socket.on('player-joined',p=>{if(p.id!==playerId)addRemote(p.id,p);toast((p.name||'Pemain baru')+' masuk arena!');});
socket.on('player-left',id=>removeRemote(id));
socket.on('state',players=>{
  for(const [id,p] of Object.entries(players)){
    if(id===playerId)continue;
    if(!remotePlayers.has(id))addRemote(id,p);
    const r=remotePlayers.get(id); r.target.set(p.x,p.y,p.z); r.finished=!!p.finished; r.lastSeen=performance.now();
  }
});
socket.on('round-winner',data=>{if(data.id!==playerId&&!finished&&started)toast((data.name||'Pemain')+' menang!');});

const clock=new THREE.Clock();
function update(dt){
  obstacles.forEach(o=>{o.pivot.rotation.y+=o.speed*dt;});
  if(!player)return;
  if(started&&!finished){
    elapsed=(performance.now()-startTime)/1000;
    const mins=Math.floor(elapsed/60).toString().padStart(2,'0'), secs=Math.floor(elapsed%60).toString().padStart(2,'0');
    timerEl.textContent=`${mins}:${secs}`;
    const forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
    const side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
    const speed=(keys.ShiftLeft||keys.ShiftRight)?10:7;
    moveDir.set(side,0,forward);
    if(moveDir.lengthSq()>0){
      moveDir.normalize();
      const angle=Math.atan2(moveDir.x,moveDir.z)+yaw;
      player.position.x+=Math.sin(angle)*speed*dt;
      player.position.z-=Math.cos(angle)*speed*dt;
      player.rotation.y=angle;
      const swing=Math.sin(elapsed*13)*.48;
      player.userData.arms[0].rotation.x=swing;
      player.userData.arms[1].rotation.x=-swing;
    }
    velocity.y-=22*dt;
    player.position.y+=velocity.y*dt;
    // track collision: platform top at y=0.65
    const z=player.position.z;
    const onTrack=trackSegments.some(s=>Math.abs(z-s.z)<s.len/2+.15 && Math.abs(player.position.x)<8.4);
    if(onTrack&&player.position.y<=0){player.position.y=0;velocity.y=0;grounded=true;}
    else grounded=false;
    // bounce pads
    if(grounded&&keys.Space)jump();
    // Keep player on world; falling means elimination
    if(player.position.y < -8){finishGame(false,'Kamu jatuh dari arena. Coba atur lompatan dan perhatikan gerakan rintangan!');}
    player.position.x=Math.max(-7.25,Math.min(7.25,player.position.x));
    // collisions with spinner bars approximated
    for(const o of obstacles){
      const dx=player.position.x-o.pivot.position.x, dz=player.position.z-o.z;
      if(Math.abs(dz)<1.3 && Math.abs(dx)<5.6 && player.position.y<2.8 && player.position.y>.1){
        velocity.y=Math.max(velocity.y,5.8);
        player.position.x+=Math.sign(dx||1)*2.4*dt;
      }
    }
    // win at finish arch
    if(player.position.z < -141 && !finished)finishGame(true,`Kamu berhasil mencapai garis finis dalam ${Math.floor(elapsed)} detik!`);
    const progress=Math.max(0,Math.min(100,((5-player.position.z)/146)*100));
    progressBar.style.width=progress+'%';progressLabel.textContent=Math.round(progress)+'% menuju finis';
    playerState.x=player.position.x;playerState.y=player.position.y;playerState.z=player.position.z;
    if(performance.now()-lastEmit>50){
      socket.emit('move',{x:player.position.x,y:player.position.y,z:player.position.z,finished});
      lastEmit=performance.now();
    }
  }
  // Smooth remote interpolation
  for(const r of remotePlayers.values()){
    r.root.position.lerp(r.target,Math.min(1,dt*12));
    r.root.rotation.y += (0-r.root.rotation.y)*Math.min(1,dt*5);
  }
  // third-person camera
  if(player){
    const target=new THREE.Vector3(player.position.x,player.position.y+1.45,player.position.z);
    const distance=8.5, vertical=2.7+pitch*4;
    const desired=new THREE.Vector3(
      target.x+Math.sin(yaw)*distance,
      target.y+vertical,
      target.z+Math.cos(yaw)*distance
    );
    camera.position.lerp(desired,Math.min(1,dt*5.5));
    camera.lookAt(target.x,target.y+.25,target.z-1.8);
  }else{
    const t=performance.now()*.00015;
    camera.position.set(Math.sin(t)*22,13,16+Math.cos(t)*4);
    camera.lookAt(0,0,-45);
  }
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  update(dt);
  renderer.render(scene,camera);
}
animate();

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
