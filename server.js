import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET','POST'] },
  transports: ['websocket','polling']
});
const PORT = process.env.PORT || 3001;
const players = new Map();
const safeName = value => String(value || 'Player').replace(/[<>]/g,'').trim().slice(0,16) || 'Player';

app.get('/health', (_req,res) => res.json({ok:true,game:'CHAOS JUMP 3D',players:players.size}));
app.use(express.static(path.join(__dirname,'dist')));
app.get('*', (req,res,next) => {
  if(req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(__dirname,'dist','index.html'), err => { if(err) res.status(404).send('Build client first: npm run build'); });
});

io.on('connection', socket => {
  socket.on('join', data => {
    if(players.has(socket.id)) return;
    const p = { id:socket.id, name:safeName(data?.name), x:0, y:0, z:5, finished:false, joinedAt:Date.now() };
    players.set(socket.id,p);
    socket.emit('joined',{id:socket.id,players:Object.fromEntries(players)});
    io.emit('players',Object.fromEntries(players));
    socket.broadcast.emit('player-joined',p);
  });
  socket.on('move', data => {
    const p=players.get(socket.id); if(!p) return;
    // Basic validation prevents malformed or wildly out-of-bounds coordinates.
    const x=Number(data?.x), y=Number(data?.y), z=Number(data?.z);
    if(![x,y,z].every(Number.isFinite)) return;
    p.x=Math.max(-8,Math.min(8,x)); p.y=Math.max(-10,Math.min(10,y)); p.z=Math.max(-160,Math.min(15,z));
    p.finished=!!data?.finished;
    socket.broadcast.emit('state',{[socket.id]:p});
    if(p.finished && !p.announcedFinish) {
      p.announcedFinish=true;
      io.emit('round-winner',{id:p.id,name:p.name});
    }
  });
  socket.on('finish', data => {
    const p=players.get(socket.id); if(!p) return;
    if(data?.won) { p.finished=true; }
  });
  socket.on('leave-round', () => {
    const p=players.get(socket.id); if(p){p.finished=false;p.announcedFinish=false;p.x=0;p.y=0;p.z=5;io.emit('state',{[socket.id]:p});}
  });
  socket.on('disconnect',()=>{
    players.delete(socket.id);
    io.emit('player-left',socket.id);
    io.emit('players',Object.fromEntries(players));
  });
});

server.listen(PORT,'0.0.0.0',()=>console.log(`CHAOS JUMP 3D server listening on port ${PORT}`));
