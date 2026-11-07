
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

console.log("[SERVER] Initializing...");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game settings
const WIDTH = 600;
const HEIGHT = 400;
const RADIUS = 20;
const ACCELERATION = 900;
const FRICTION = 0.985;
const RESTITUTION = 0.9;

// Connected players
const players = {};

console.log("[SERVER] Game settings initialized.");

// Register players
function registerPlayer(socket) {

    console.log("[SERVER] Starting registerPlayer.");

    const playerNumber = Object.keys(players).length;

    const spawnPositions = [
        { x: 150, y: 200 },
        { x: 450, y: 200 },
        { x: 150, y: 300 },
        { x: 450, y: 300 }
    ];

    const spawn = spawnPositions[playerNumber % spawnPositions.length];

    players[socket.id] = {
        sessionId: socket.id,
        pageAddress: "",
        address: socket.handshake.address,

        x: spawn.x,
        y: spawn.y,

        vx: 0,
        vy: 0,

        keys: {
            up: false,
            down: false,
            left: false,
            right: false
        }
    };

    console.log("[SERVER] Player registered:", players[socket.id]);
}

// Receive information from a browser
function updatePlayer(socket, data) {

    console.log("[SERVER] Starting updatePlayer.");
    console.log("[SERVER] Received message:", data);

    const player = players[socket.id];

    if (!player || !data) return;

    // Validate the coordinates sent by the browser
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) {
        console.log("[SERVER] Invalid coordinates.");
        return;
    }

    // Store the browser address
    player.pageAddress = data.pageAddress || "";

    // Store keyboard input
    if (data.keys) {
        player.keys = {
            up: data.keys.up === true,
            down: data.keys.down === true,
            left: data.keys.left === true,
            right: data.keys.right === true
        };
    }

    console.log("[SERVER] Player input updated:", player.keys);
}

// Move all players
function updatePhysics() {

    const deltaTime = 1 / 60;

    for (const id in players) {

        const player = players[id];

        // Apply acceleration based on keyboard input
        if (player.keys.left) {
            player.vx -= ACCELERATION * deltaTime;
        }

        if (player.keys.right) {
            player.vx += ACCELERATION * deltaTime;
        }

        if (player.keys.up) {
            player.vy -= ACCELERATION * deltaTime;
        }

        if (player.keys.down) {
            player.vy += ACCELERATION * deltaTime;
        }

        // Apply friction
        player.vx *= FRICTION;
        player.vy *= FRICTION;

        // Update position
        player.x += player.vx * deltaTime;
        player.y += player.vy * deltaTime;

        // Bounce off canvas boundaries
        if (player.x < RADIUS) {
            player.x = RADIUS;
            player.vx = Math.abs(player.vx);
        }

        if (player.x > WIDTH - RADIUS) {
            player.x = WIDTH - RADIUS;
            player.vx = -Math.abs(player.vx);
        }

        if (player.y < RADIUS) {
            player.y = RADIUS;
            player.vy = Math.abs(player.vy);
        }

        if (player.y > HEIGHT - RADIUS) {
            player.y = HEIGHT - RADIUS;
            player.vy = -Math.abs(player.vy);
        }
    }

    checkCollisions();
}

// Detect and resolve collisions
function checkCollisions() {

    const playerIds = Object.keys(players);

    for (let i = 0; i < playerIds.length; i++) {

        for (let j = i + 1; j < playerIds.length; j++) {

            const a = players[playerIds[i]];
            const b = players[playerIds[j]];

            const dx = b.x - a.x;
            const dy = b.y - a.y;

            const distance = Math.sqrt(dx * dx + dy * dy);
            const minimumDistance = RADIUS * 2;

            if (distance < minimumDistance) {

                console.log("[SERVER] Collision detected!");

                // Calculate collision direction
                let nx;
                let ny;

                if (distance === 0) {
                    nx = 1;
                    ny = 0;
                } else {
                    nx = dx / distance;
                    ny = dy / distance;
                }

                // Separate the overlapping balls
                const overlap = minimumDistance - distance;

                a.x -= nx * overlap / 2;
                a.y -= ny * overlap / 2;

                b.x += nx * overlap / 2;
                b.y += ny * overlap / 2;

                // Calculate relative velocity
                const relativeVelocityX = b.vx - a.vx;
                const relativeVelocityY = b.vy - a.vy;

                const velocityAlongNormal =
                    relativeVelocityX * nx +
                    relativeVelocityY * ny;

                // Bounce only if moving towards each other
                if (velocityAlongNormal < 0) {

                    const impulse =
                        -(1 + RESTITUTION) * velocityAlongNormal / 2;

                    a.vx -= impulse * nx;
                    a.vy -= impulse * ny;

                    b.vx += impulse * nx;
                    b.vy += impulse * ny;

                    console.log("[SERVER] Collision resolved.");
                }
            }
        }
    }
}

// Send player positions to all browsers
function broadcastPlayers() {

    console.log("[SERVER] Broadcasting player positions.");

    const publicPlayers = {};

    for (const id in players) {

        const p = players[id];

        publicPlayers[id] = {
            sessionId: p.sessionId,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy
        };
    }

    io.emit('updatePlayers', publicPlayers);
}

// Handle browser connections
io.on('connection', (socket) => {

    console.log("[SERVER] New client connected:", socket.id);

    registerPlayer(socket);

    socket.on('playerMove', (data) => {
        updatePlayer(socket, data);
    });

    socket.on('disconnect', () => {

        console.log("[SERVER] Client disconnected:", socket.id);

        delete players[socket.id];

    });

});

// Run physics 60 times per second
setInterval(updatePhysics, 1000 / 60);

// Send positions to browsers 10 times per second
setInterval(broadcastPlayers, 33);

// Start the server
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Running on port ${PORT}`);
});
