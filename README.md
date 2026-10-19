# CHAOS JUMP 3D — Hengky Studio

A colorful browser-based 3D obstacle-course prototype with Three.js and Socket.IO realtime player presence.

## Requirements
- Node.js 20 or newer
- npm
- Modern desktop browser with WebGL

## Run locally
```bash
npm install
npm start
```
Open http://localhost:5173 in your browser. The Vite client runs on port 5173 and Socket.IO server runs on port 3001. Open another tab or browser window to see another connected player.

## Production build
```bash
npm run build
npm run server
```
The server serves the built client from `dist` and Socket.IO from the same origin at port 3001. Open http://localhost:3001.

## Deploy
For a simple single-service deployment:
1. Push this project to a Git repository.
2. Create a Node web service on Render, Railway, Fly.io, or another Node host.
3. Build command: `npm install && npm run build`
4. Start command: `npm run server`
5. Set `NODE_ENV=production` if desired.
6. Expose the service port provided by the host (`PORT` is read by server.js).
7. Open the public HTTPS URL.

Keep the client and Socket.IO server on the same service/origin for the simplest deployment. If you host them separately, set the client URL with `?server=https://YOUR-SOCKET-SERVER` and configure the server's `CLIENT_ORIGIN` to the client origin.

## Current prototype scope
Included: 3D scene, colorful floating race platforms, spinning obstacles, third-person camera, keyboard controls, jumping/gravity, finish state, player names, realtime presence and player position sync over Socket.IO.

This is a playable prototype, not a production-ready competitive game. Multiplayer currently synchronizes player presence/positions; physics and collision decisions are client-side, and there is no account system, matchmaking, authoritative server physics, persistent leaderboard, or anti-cheat. For production, add authoritative server simulation, proper platform collision, reconnection handling, rate limits, room matchmaking, and moderation.
