// ============================================================
// GEAR STORM — Gamedev.js Jam 2026 | Theme: Machines
// A top-down factory defense game — pure HTML5 Canvas + JS
// ============================================================

(function() {
"use strict";

// ---- CANVAS & CONTEXT ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// ---- CONSTANTS ----
const PI2 = Math.PI * 2;
const COLORS = {
    bg: '#0a0e1a', grid: 'rgba(0,240,255,0.04)', gridStrong: 'rgba(0,240,255,0.08)',
    player: '#00f0ff', playerGlow: 'rgba(0,240,255,0.3)', bullet: '#00ffcc',
    enemyDrone: '#ff4444', enemyTank: '#ff8800', enemySpeeder: '#ff00ff', enemyBoss: '#ff2200',
    gear: '#ffaa00', gearGlow: 'rgba(255,170,0,0.4)', turret: '#00ff88', turretGlow: 'rgba(0,255,136,0.3)',
    repairPad: '#00ccff', explosion: ['#ff6600','#ff4400','#ffaa00','#ff2200','#ffcc00'],
    healthPickup: '#00ff88'
};
const TURRET_COST = 10, REPAIR_COST = 15, UPGRADE_COST = 20;
const WORLD_SIZE = 3000;

// ---- STATE ----
let gameState = 'title'; // title, playing, gameover
let score = 0, kills = 0, turretsBuilt = 0;
let wave = 1, waveTimer = 0, waveEnemiesLeft = 0, waveActive = false, intermission = true, intermTimer = 3;
let screenShake = 0, screenShakeX = 0, screenShakeY = 0;
let placingTurret = false, placingRepair = false;

// ---- INPUT ----
const keys = {};
let mouseX = 0, mouseY = 0, mouseDown = false;
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; handleKeyPress(e.key.toLowerCase()); });
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
canvas.addEventListener('mousedown', e => { mouseDown = true; handleClick(e); });
canvas.addEventListener('mouseup', () => mouseDown = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---- AUDIO ENGINE (Web Audio API) ----
let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    switch(type) {
        case 'shoot':
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(200, t+0.08);
            gain.gain.setValueAtTime(0.08, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.08);
            osc.start(t); osc.stop(t+0.08); break;
        case 'explosion':
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(30, t+0.3);
            gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.3);
            osc.start(t); osc.stop(t+0.3); break;
        case 'pickup':
            osc.type = 'sine'; osc.frequency.setValueAtTime(600, t);
            osc.frequency.exponentialRampToValueAtTime(1200, t+0.15);
            gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.15);
            osc.start(t); osc.stop(t+0.15); break;
        case 'build':
            osc.type = 'square'; osc.frequency.setValueAtTime(200, t);
            osc.frequency.setValueAtTime(300, t+0.05); osc.frequency.setValueAtTime(500, t+0.1);
            gain.gain.setValueAtTime(0.06, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.2);
            osc.start(t); osc.stop(t+0.2); break;
        case 'hit':
            osc.type = 'square'; osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(80, t+0.1);
            gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.1);
            osc.start(t); osc.stop(t+0.1); break;
        case 'wave':
            osc.type = 'sine'; osc.frequency.setValueAtTime(300, t);
            osc.frequency.setValueAtTime(450, t+0.15); osc.frequency.setValueAtTime(600, t+0.3);
            gain.gain.setValueAtTime(0.08, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.5);
            osc.start(t); osc.stop(t+0.5); break;
        case 'gameover':
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(50, t+1);
            gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t+1);
            osc.start(t); osc.stop(t+1); break;
    }
}

// Background beat
let bgBeatInterval = null;
function startBGBeat() {
    if (bgBeatInterval) return;
    bgBeatInterval = setInterval(() => {
        if (!audioCtx || gameState !== 'playing') return;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(55, t);
        gain.gain.setValueAtTime(0.04, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.15);
        osc.start(t); osc.stop(t+0.15);
    }, 500);
}
function stopBGBeat() { if (bgBeatInterval) { clearInterval(bgBeatInterval); bgBeatInterval = null; } }

// ---- CAMERA ----
const camera = { x: 0, y: 0 };
function worldToScreen(x, y) { return { x: x - camera.x + W/2, y: y - camera.y + H/2 }; }
function screenToWorld(sx, sy) { return { x: sx + camera.x - W/2, y: sy + camera.y - H/2 }; }

// ---- PLAYER ----
const player = {
    x: WORLD_SIZE/2, y: WORLD_SIZE/2, vx: 0, vy: 0,
    radius: 18, angle: 0, speed: 220, hp: 100, maxHp: 100,
    fireRate: 0.15, fireTimer: 0, damage: 12,
    gears: 0, level: 1, invincible: 0,
    trail: []
};

// ---- ENTITY ARRAYS ----
let bullets = [], enemies = [], particles = [], gears = [], turrets = [], repairPads = [], pickups = [], enemyBullets = [], floatingTexts = [];

// ---- PARTICLE SYSTEM ----
function spawnParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * PI2;
        const s = (Math.random() * 0.7 + 0.3) * speed;
        particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: life*(0.5+Math.random()*0.5),
            maxLife: life, color: Array.isArray(color) ? color[Math.floor(Math.random()*color.length)] : color,
            size: size*(0.5+Math.random()*0.5) });
    }
}
function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 1, maxLife: 1 });
}

// ---- ENEMY SPAWN ----
function spawnEnemy(type) {
    const side = Math.floor(Math.random()*4);
    let x, y;
    const margin = 100;
    if (side === 0) { x = camera.x - W/2 - margin; y = camera.y + (Math.random()-0.5)*H; }
    else if (side === 1) { x = camera.x + W/2 + margin; y = camera.y + (Math.random()-0.5)*H; }
    else if (side === 2) { x = camera.x + (Math.random()-0.5)*W; y = camera.y - H/2 - margin; }
    else { x = camera.x + (Math.random()-0.5)*W; y = camera.y + H/2 + margin; }
    // Clamp to world
    x = Math.max(50, Math.min(WORLD_SIZE-50, x));
    y = Math.max(50, Math.min(WORLD_SIZE-50, y));

    const e = { x, y, vx: 0, vy: 0, type, angle: 0, fireTimer: 0, flashTimer: 0 };
    switch(type) {
        case 'drone':
            Object.assign(e, { radius: 14, hp: 20, maxHp: 20, speed: 100, damage: 8, score: 10, gearDrop: 2, shootRate: 0 }); break;
        case 'speeder':
            Object.assign(e, { radius: 10, hp: 12, maxHp: 12, speed: 200, damage: 6, score: 15, gearDrop: 1, shootRate: 0 }); break;
        case 'tank':
            Object.assign(e, { radius: 22, hp: 60, maxHp: 60, speed: 50, damage: 15, score: 25, gearDrop: 4, shootRate: 2 }); break;
        case 'boss':
            Object.assign(e, { radius: 40, hp: 200 + wave*50, maxHp: 200 + wave*50, speed: 35, damage: 20, score: 100, gearDrop: 15, shootRate: 1 }); break;
    }
    enemies.push(e);
}

// ---- WAVE MANAGEMENT ----
function startWave() {
    waveActive = true; intermission = false;
    const baseCount = 3 + wave * 2;
    waveEnemiesLeft = baseCount;
    waveTimer = 0;
    // Announce
    const ann = document.getElementById('waveAnnounce');
    const annText = document.getElementById('waveAnnounceText');
    annText.textContent = wave % 5 === 0 ? `⚠ BOSS WAVE ${wave} ⚠` : `WAVE ${wave}`;
    ann.classList.remove('hidden');
    // Re-trigger animation
    annText.style.animation = 'none'; annText.offsetHeight; annText.style.animation = '';
    setTimeout(() => ann.classList.add('hidden'), 2500);
    playSound('wave');
    document.getElementById('waveNum').textContent = wave;
}

function spawnWaveEnemy() {
    if (wave % 5 === 0) { spawnEnemy('boss'); return; }
    const r = Math.random();
    if (wave >= 3 && r < 0.15) spawnEnemy('tank');
    else if (wave >= 2 && r < 0.35) spawnEnemy('speeder');
    else spawnEnemy('drone');
}

// ---- KEY PRESS HANDLER ----
function handleKeyPress(key) {
    if (gameState !== 'playing') return;
    if (key === 't') {
        if (player.gears >= TURRET_COST) { placingTurret = !placingTurret; placingRepair = false; }
        else { spawnFloatingText(player.x, player.y - 30, 'Need 10 gears!', '#ff4444'); placingTurret = false; }
    }
    if (key === 'e') {
        if (player.gears >= REPAIR_COST) { placingRepair = !placingRepair; placingTurret = false; }
        else { spawnFloatingText(player.x, player.y - 30, 'Need 15 gears!', '#ff4444'); placingRepair = false; }
    }
    if (key === 'u') {
        if (player.gears >= UPGRADE_COST) {
            player.gears -= UPGRADE_COST;
            player.level++;
            player.damage += 4;
            player.speed += 15;
            player.fireRate = Math.max(0.06, player.fireRate - 0.015);
            player.maxHp += 15; player.hp = Math.min(player.hp + 30, player.maxHp);
            playSound('build');
            spawnFloatingText(player.x, player.y - 30, `MECH LV${player.level}!`, '#00f0ff');
            spawnParticles(player.x, player.y, 20, COLORS.player, 150, 0.5, 3);
        } else { spawnFloatingText(player.x, player.y - 30, 'Need 20 gears!', '#ff4444'); }
    }
    if (key === 'escape') { placingTurret = false; placingRepair = false; }
}

// ---- CLICK HANDLER ----
function handleClick(e) {
    if (gameState !== 'playing') return;
    const wp = screenToWorld(e.clientX, e.clientY);
    if (placingTurret && player.gears >= TURRET_COST) {
        turrets.push({ x: wp.x, y: wp.y, angle: 0, fireTimer: 0, fireRate: 0.8, damage: 8, radius: 16, range: 250, hp: 80, maxHp: 80 });
        player.gears -= TURRET_COST; turretsBuilt++;
        placingTurret = false;
        playSound('build');
        spawnParticles(wp.x, wp.y, 15, COLORS.turret, 100, 0.4, 3);
        spawnFloatingText(wp.x, wp.y - 20, 'TURRET ONLINE', COLORS.turret);
    } else if (placingRepair && player.gears >= REPAIR_COST) {
        repairPads.push({ x: wp.x, y: wp.y, radius: 40, healRate: 8, glowPhase: 0 });
        player.gears -= REPAIR_COST;
        placingRepair = false;
        playSound('build');
        spawnParticles(wp.x, wp.y, 15, COLORS.repairPad, 100, 0.4, 3);
        spawnFloatingText(wp.x, wp.y - 20, 'REPAIR PAD', COLORS.repairPad);
    }
}

// ---- COLLISION ----
function circleCollide(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    return dist < (a.radius + b.radius);
}
function dist(a, b) { const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

// ---- UPDATE ----
function update(dt) {
    if (gameState !== 'playing') return;

    // Intermission
    if (intermission) {
        intermTimer -= dt;
        document.getElementById('waveStatus').textContent = `Next wave in ${Math.ceil(intermTimer)}s — Build defenses!`;
        if (intermTimer <= 0) { startWave(); }
        updatePlayer(dt); updateTurrets(dt); updateBullets(dt); updateEnemyBullets(dt);
        updateParticles(dt); updateGears(dt); updatePickups(dt); updateRepairPads(dt); updateFloatingTexts(dt);
        updateScreenShake(dt); return;
    }

    // Wave spawning
    if (waveActive && waveEnemiesLeft > 0) {
        waveTimer -= dt;
        if (waveTimer <= 0) {
            spawnWaveEnemy(); waveEnemiesLeft--;
            waveTimer = Math.max(0.3, 1.5 - wave * 0.05);
        }
    }
    if (waveActive && waveEnemiesLeft <= 0 && enemies.length === 0) {
        waveActive = false; intermission = true; intermTimer = 5;
        wave++; score += wave * 10;
        document.getElementById('waveNum').textContent = wave;
    }
    document.getElementById('waveStatus').textContent = waveActive ? `Enemies: ${enemies.length + waveEnemiesLeft}` : '';

    updatePlayer(dt); updateEnemies(dt); updateTurrets(dt); updateBullets(dt);
    updateEnemyBullets(dt); updateParticles(dt); updateGears(dt); updatePickups(dt);
    updateRepairPads(dt); updateFloatingTexts(dt); updateScreenShake(dt);
}

function updatePlayer(dt) {
    let ax = 0, ay = 0;
    if (keys['w'] || keys['arrowup']) ay -= 1;
    if (keys['s'] || keys['arrowdown']) ay += 1;
    if (keys['a'] || keys['arrowleft']) ax -= 1;
    if (keys['d'] || keys['arrowright']) ax += 1;
    if (ax !== 0 || ay !== 0) { const len = Math.sqrt(ax*ax+ay*ay); ax/=len; ay/=len; }
    player.vx += (ax * player.speed - player.vx) * 8 * dt;
    player.vy += (ay * player.speed - player.vy) * 8 * dt;
    player.x += player.vx * dt; player.y += player.vy * dt;
    // Clamp to world
    player.x = Math.max(player.radius, Math.min(WORLD_SIZE - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(WORLD_SIZE - player.radius, player.y));
    // Aim
    const wp = screenToWorld(mouseX, mouseY);
    player.angle = Math.atan2(wp.y - player.y, wp.x - player.x);
    // Shoot
    player.fireTimer -= dt;
    if (mouseDown && player.fireTimer <= 0) {
        player.fireTimer = player.fireRate;
        const bx = player.x + Math.cos(player.angle) * 25;
        const by = player.y + Math.sin(player.angle) * 25;
        bullets.push({ x: bx, y: by, vx: Math.cos(player.angle)*600, vy: Math.sin(player.angle)*600,
            radius: 4, life: 1.5, damage: player.damage, trail: [] });
        playSound('shoot');
    }
    // Trail
    if (Math.abs(player.vx) > 10 || Math.abs(player.vy) > 10) {
        player.trail.push({ x: player.x, y: player.y, life: 0.3 });
    }
    player.trail = player.trail.filter(t => { t.life -= dt; return t.life > 0; });
    // Invincibility
    if (player.invincible > 0) player.invincible -= dt;
    // Camera
    camera.x += (player.x - camera.x) * 5 * dt;
    camera.y += (player.y - camera.y) * 5 * dt;
    // Update HUD
    document.getElementById('healthFill').style.width = (player.hp / player.maxHp * 100) + '%';
    document.getElementById('healthFill').style.background = player.hp < 30 ? '#ff4444' : 'linear-gradient(90deg, #00f0ff, #00ff88)';
    document.getElementById('gearCount').textContent = player.gears;
    document.getElementById('scoreDisplay').textContent = score;
    document.getElementById('turretCount').textContent = turrets.length;
}

function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = player.x - e.x, dy = player.y - e.y;
        const d = Math.sqrt(dx*dx+dy*dy) || 1;
        e.angle = Math.atan2(dy, dx);
        // Movement
        let moveX = dx/d * e.speed, moveY = dy/d * e.speed;
        if (e.type === 'speeder') {
            // Speeder zigzags
            const perp = Math.sin(Date.now() * 0.005 + i) * 80;
            moveX += (-dy/d) * perp * dt;
            moveY += (dx/d) * perp * dt;
        }
        e.x += moveX * dt; e.y += moveY * dt;
        e.x = Math.max(e.radius, Math.min(WORLD_SIZE - e.radius, e.x));
        e.y = Math.max(e.radius, Math.min(WORLD_SIZE - e.radius, e.y));
        // Shooting (tank & boss)
        if (e.shootRate > 0) {
            e.fireTimer -= dt;
            if (e.fireTimer <= 0 && d < 500) {
                e.fireTimer = e.shootRate;
                const a = e.angle;
                enemyBullets.push({ x: e.x+Math.cos(a)*e.radius, y: e.y+Math.sin(a)*e.radius,
                    vx: Math.cos(a)*250, vy: Math.sin(a)*250, radius: 5, life: 2, damage: e.damage });
                if (e.type === 'boss') {
                    // Spread shot
                    for (let s = -2; s <= 2; s++) {
                        const sa = a + s * 0.3;
                        enemyBullets.push({ x: e.x+Math.cos(sa)*e.radius, y: e.y+Math.sin(sa)*e.radius,
                            vx: Math.cos(sa)*200, vy: Math.sin(sa)*200, radius: 4, life: 2, damage: e.damage*0.5 });
                    }
                }
            }
        }
        // Contact damage
        if (circleCollide(e, player) && player.invincible <= 0) {
            player.hp -= e.damage * 0.3;
            player.invincible = 0.3;
            screenShake = 0.15;
            playSound('hit');
            spawnParticles(player.x, player.y, 5, '#ff4444', 100, 0.3, 2);
            if (player.hp <= 0) gameOver();
        }
        // Flash
        if (e.flashTimer > 0) e.flashTimer -= dt;
    }
}

function updateTurrets(dt) {
    for (let i = turrets.length - 1; i >= 0; i--) {
        const t = turrets[i];
        // Find nearest enemy
        let nearest = null, nearDist = t.range;
        for (const e of enemies) {
            const d = dist(t, e);
            if (d < nearDist) { nearest = e; nearDist = d; }
        }
        if (nearest) {
            t.angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
            t.fireTimer -= dt;
            if (t.fireTimer <= 0) {
                t.fireTimer = t.fireRate;
                const bx = t.x + Math.cos(t.angle)*20;
                const by = t.y + Math.sin(t.angle)*20;
                bullets.push({ x: bx, y: by, vx: Math.cos(t.angle)*500, vy: Math.sin(t.angle)*500,
                    radius: 3, life: 1, damage: t.damage, trail: [], fromTurret: true });
            }
        }
        // Turret health
        if (t.hp <= 0) {
            spawnParticles(t.x, t.y, 20, COLORS.explosion, 150, 0.5, 4);
            playSound('explosion');
            turrets.splice(i, 1);
        }
    }
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        b.trail.push({ x: b.x, y: b.y, life: 0.15 });
        b.trail = b.trail.filter(t => { t.life -= dt; return t.life > 0; });
        if (b.life <= 0 || b.x < 0 || b.x > WORLD_SIZE || b.y < 0 || b.y > WORLD_SIZE) { bullets.splice(i, 1); continue; }
        // Hit enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (circleCollide(b, e)) {
                e.hp -= b.damage;
                e.flashTimer = 0.08;
                spawnParticles(b.x, b.y, 4, '#ffaa00', 80, 0.2, 2);
                bullets.splice(i, 1);
                if (e.hp <= 0) {
                    // Enemy killed
                    score += e.score; kills++;
                    spawnParticles(e.x, e.y, e.type==='boss'?40:15, COLORS.explosion, e.type==='boss'?250:150, 0.6, e.type==='boss'?6:3);
                    playSound('explosion');
                    screenShake = e.type === 'boss' ? 0.4 : 0.15;
                    // Drop gears
                    for (let g = 0; g < e.gearDrop; g++) {
                        gears.push({ x: e.x + (Math.random()-0.5)*30, y: e.y + (Math.random()-0.5)*30,
                            radius: 8, life: 15, spinAngle: Math.random()*PI2, bobPhase: Math.random()*PI2 });
                    }
                    // Random pickup
                    if (Math.random() < 0.15) {
                        pickups.push({ x: e.x, y: e.y, type: 'health', radius: 10, life: 10, bobPhase: 0 });
                    }
                    spawnFloatingText(e.x, e.y - 15, `+${e.score}`, '#ffaa00');
                    enemies.splice(j, 1);
                }
                break;
            }
        }
    }
}

function updateEnemyBullets(dt) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0) { enemyBullets.splice(i, 1); continue; }
        // Hit player
        if (circleCollide(b, player) && player.invincible <= 0) {
            player.hp -= b.damage;
            player.invincible = 0.2;
            screenShake = 0.1;
            playSound('hit');
            spawnParticles(player.x, player.y, 6, '#ff4444', 80, 0.3, 2);
            enemyBullets.splice(i, 1);
            if (player.hp <= 0) gameOver();
            continue;
        }
        // Hit turrets
        for (const t of turrets) {
            if (circleCollide(b, t)) {
                t.hp -= b.damage;
                spawnParticles(b.x, b.y, 3, '#ff8800', 50, 0.2, 2);
                enemyBullets.splice(i, 1); break;
            }
        }
    }
}

function updateGears(dt) {
    for (let i = gears.length - 1; i >= 0; i--) {
        const g = gears[i];
        g.life -= dt; g.spinAngle += dt * 3; g.bobPhase += dt * 4;
        if (g.life <= 0) { gears.splice(i, 1); continue; }
        // Magnet to player
        const d = dist(g, player);
        if (d < 100) {
            const dx = player.x - g.x, dy = player.y - g.y;
            const speed = 300 * (1 - d/100);
            g.x += dx/d * speed * dt; g.y += dy/d * speed * dt;
        }
        if (d < player.radius + g.radius) {
            player.gears++; score += 5;
            playSound('pickup');
            spawnFloatingText(g.x, g.y - 10, '+1⚙', COLORS.gear);
            gears.splice(i, 1);
        }
    }
}

function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        p.life -= dt; p.bobPhase += dt * 3;
        if (p.life <= 0) { pickups.splice(i, 1); continue; }
        if (circleCollide(p, player)) {
            if (p.type === 'health') {
                player.hp = Math.min(player.hp + 25, player.maxHp);
                spawnFloatingText(p.x, p.y - 10, '+25 HP', COLORS.healthPickup);
            }
            playSound('pickup');
            pickups.splice(i, 1);
        }
    }
}

function updateRepairPads(dt) {
    for (const pad of repairPads) {
        pad.glowPhase += dt * 2;
        if (dist(pad, player) < pad.radius + player.radius) {
            player.hp = Math.min(player.hp + pad.healRate * dt, player.maxHp);
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.96; p.vy *= 0.96;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function updateFloatingTexts(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.life -= dt; ft.y -= 40 * dt;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}

function updateScreenShake(dt) {
    if (screenShake > 0) {
        screenShake -= dt;
        screenShakeX = (Math.random()-0.5) * screenShake * 40;
        screenShakeY = (Math.random()-0.5) * screenShake * 40;
    } else { screenShakeX = 0; screenShakeY = 0; }
}

// ---- DRAW ----
function draw() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(screenShakeX, screenShakeY);

    drawGrid();
    drawRepairPads();
    drawTrail(player.trail, COLORS.player);
    drawTurrets();
    drawGears();
    drawPickups();
    drawPlayer();
    drawEnemies();
    drawBullets();
    drawEnemyBullets();
    drawParticles();
    drawFloatingTexts();
    // Placement preview
    if (placingTurret || placingRepair) drawPlacementPreview();

    ctx.restore();

    drawMinimap();
    drawVignette();
}

function drawGrid() {
    const gridSize = 80;
    const startX = Math.floor((camera.x - W/2) / gridSize) * gridSize;
    const startY = Math.floor((camera.y - H/2) / gridSize) * gridSize;
    for (let x = startX; x < camera.x + W/2 + gridSize; x += gridSize) {
        const sp = worldToScreen(x, 0);
        ctx.strokeStyle = x % (gridSize*4) === 0 ? COLORS.gridStrong : COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sp.x, 0); ctx.lineTo(sp.x, H); ctx.stroke();
    }
    for (let y = startY; y < camera.y + H/2 + gridSize; y += gridSize) {
        const sp = worldToScreen(0, y);
        ctx.strokeStyle = y % (gridSize*4) === 0 ? COLORS.gridStrong : COLORS.grid;
        ctx.beginPath(); ctx.moveTo(0, sp.y); ctx.lineTo(W, sp.y); ctx.stroke();
    }
    // World boundary
    ctx.strokeStyle = 'rgba(255,50,50,0.3)'; ctx.lineWidth = 3;
    const tl = worldToScreen(0,0), br = worldToScreen(WORLD_SIZE, WORLD_SIZE);
    ctx.strokeRect(tl.x, tl.y, br.x-tl.x, br.y-tl.y);
}

function drawCog(x, y, outerR, innerR, teeth, angle, fill, stroke) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
        const a1 = (i / teeth) * PI2;
        const a2 = ((i + 0.3) / teeth) * PI2;
        const a3 = ((i + 0.5) / teeth) * PI2;
        const a4 = ((i + 0.8) / teeth) * PI2;
        if (i === 0) ctx.moveTo(Math.cos(a1)*innerR, Math.sin(a1)*innerR);
        ctx.lineTo(Math.cos(a2)*outerR, Math.sin(a2)*outerR);
        ctx.lineTo(Math.cos(a3)*outerR, Math.sin(a3)*outerR);
        ctx.lineTo(Math.cos(a4)*innerR, Math.sin(a4)*innerR);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    // Center hole
    ctx.beginPath(); ctx.arc(0, 0, innerR*0.35, 0, PI2);
    ctx.fillStyle = COLORS.bg; ctx.fill();
    ctx.restore();
}

function drawPlayer() {
    const sp = worldToScreen(player.x, player.y);
    const alpha = player.invincible > 0 ? 0.5 + Math.sin(Date.now()*0.03)*0.3 : 1;
    ctx.globalAlpha = alpha;
    // Glow
    ctx.shadowColor = COLORS.player; ctx.shadowBlur = 20;
    // Body (mech shape)
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(player.angle);
    // Hull
    ctx.fillStyle = '#112233';
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(-14, -14); ctx.lineTo(-10, 0); ctx.lineTo(-14, 14);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COLORS.player; ctx.lineWidth = 2; ctx.stroke();
    // Gun barrel
    ctx.fillStyle = '#334455';
    ctx.fillRect(10, -3, 15, 6);
    ctx.strokeStyle = COLORS.player; ctx.strokeRect(10, -3, 15, 6);
    // Cockpit
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, PI2);
    ctx.fillStyle = COLORS.player; ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
}

function drawTrail(trail, color) {
    for (const t of trail) {
        const sp = worldToScreen(t.x, t.y);
        ctx.globalAlpha = t.life * 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, PI2);
        ctx.fillStyle = color; ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawEnemies() {
    for (const e of enemies) {
        const sp = worldToScreen(e.x, e.y);
        if (sp.x < -100 || sp.x > W+100 || sp.y < -100 || sp.y > H+100) continue;
        const flash = e.flashTimer > 0;
        ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(e.angle);
        switch(e.type) {
            case 'drone':
                ctx.shadowColor = COLORS.enemyDrone; ctx.shadowBlur = flash ? 30 : 10;
                drawCog(0, 0, e.radius, e.radius*0.7, 6, Date.now()*0.003, flash?'#fff':COLORS.enemyDrone, '#ff6666');
                break;
            case 'speeder':
                ctx.shadowColor = COLORS.enemySpeeder; ctx.shadowBlur = flash ? 30 : 10;
                ctx.fillStyle = flash ? '#fff' : COLORS.enemySpeeder;
                ctx.beginPath(); ctx.moveTo(e.radius, 0); ctx.lineTo(-e.radius, -e.radius*0.6); ctx.lineTo(-e.radius*0.5, 0); ctx.lineTo(-e.radius, e.radius*0.6); ctx.closePath();
                ctx.fill(); ctx.strokeStyle = '#ff66ff'; ctx.lineWidth = 1.5; ctx.stroke();
                break;
            case 'tank':
                ctx.shadowColor = COLORS.enemyTank; ctx.shadowBlur = flash ? 30 : 10;
                ctx.fillStyle = flash ? '#fff' : '#332200';
                ctx.fillRect(-e.radius, -e.radius*0.7, e.radius*2, e.radius*1.4);
                ctx.strokeStyle = COLORS.enemyTank; ctx.lineWidth = 2;
                ctx.strokeRect(-e.radius, -e.radius*0.7, e.radius*2, e.radius*1.4);
                // Cannon
                ctx.fillStyle = COLORS.enemyTank;
                ctx.fillRect(e.radius*0.3, -3, e.radius, 6);
                break;
            case 'boss':
                ctx.shadowColor = COLORS.enemyBoss; ctx.shadowBlur = flash ? 40 : 20;
                drawCog(0, 0, e.radius, e.radius*0.75, 10, -Date.now()*0.002, flash?'#fff':'#441100', COLORS.enemyBoss);
                drawCog(0, 0, e.radius*0.55, e.radius*0.4, 6, Date.now()*0.004, flash?'#fff':'#662200', '#ff6600');
                // Eyes
                ctx.fillStyle = '#ff0000';
                ctx.beginPath(); ctx.arc(-8, -5, 4, 0, PI2); ctx.fill();
                ctx.beginPath(); ctx.arc(-8, 5, 4, 0, PI2); ctx.fill();
                break;
        }
        ctx.restore();
        ctx.shadowBlur = 0;
        // HP bar
        if (e.hp < e.maxHp) {
            const barW = e.radius * 2;
            const barX = sp.x - barW/2;
            const barY = sp.y - e.radius - 10;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, 4);
            ctx.fillStyle = e.hp > e.maxHp*0.5 ? '#00ff88' : e.hp > e.maxHp*0.25 ? '#ffaa00' : '#ff4444';
            ctx.fillRect(barX, barY, barW * (e.hp/e.maxHp), 4);
        }
    }
}

function drawTurrets() {
    for (const t of turrets) {
        const sp = worldToScreen(t.x, t.y);
        if (sp.x < -50 || sp.x > W+50 || sp.y < -50 || sp.y > H+50) continue;
        ctx.shadowColor = COLORS.turret; ctx.shadowBlur = 12;
        // Base
        drawCog(sp.x, sp.y, t.radius+4, t.radius-2, 8, Date.now()*0.001, '#0a2a1a', COLORS.turret);
        // Barrel
        ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(t.angle);
        ctx.fillStyle = '#1a3a2a'; ctx.fillRect(0, -3, 22, 6);
        ctx.strokeStyle = COLORS.turret; ctx.lineWidth = 1.5; ctx.strokeRect(0, -3, 22, 6);
        ctx.restore();
        ctx.shadowBlur = 0;
        // Range indicator (subtle)
        ctx.strokeStyle = 'rgba(0,255,136,0.03)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, t.range, 0, PI2); ctx.stroke();
    }
}

function drawRepairPads() {
    for (const pad of repairPads) {
        const sp = worldToScreen(pad.x, pad.y);
        if (sp.x < -60 || sp.x > W+60 || sp.y < -60 || sp.y > H+60) continue;
        const glow = 0.15 + Math.sin(pad.glowPhase) * 0.08;
        ctx.fillStyle = `rgba(0,200,255,${glow})`;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, pad.radius, 0, PI2); ctx.fill();
        ctx.strokeStyle = `rgba(0,200,255,0.3)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, pad.radius, 0, PI2); ctx.stroke();
        // Cross
        ctx.strokeStyle = `rgba(0,200,255,0.5)`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sp.x-10, sp.y); ctx.lineTo(sp.x+10, sp.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y-10); ctx.lineTo(sp.x, sp.y+10); ctx.stroke();
    }
}

function drawBullets() {
    for (const b of bullets) {
        // Trail
        for (const t of b.trail) {
            const tsp = worldToScreen(t.x, t.y);
            ctx.globalAlpha = t.life * 4;
            ctx.beginPath(); ctx.arc(tsp.x, tsp.y, 2, 0, PI2);
            ctx.fillStyle = b.fromTurret ? COLORS.turret : COLORS.bullet; ctx.fill();
        }
        ctx.globalAlpha = 1;
        const sp = worldToScreen(b.x, b.y);
        ctx.shadowColor = b.fromTurret ? COLORS.turret : COLORS.bullet; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, b.radius, 0, PI2);
        ctx.fillStyle = b.fromTurret ? COLORS.turret : COLORS.bullet; ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawEnemyBullets() {
    for (const b of enemyBullets) {
        const sp = worldToScreen(b.x, b.y);
        ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, b.radius, 0, PI2);
        ctx.fillStyle = '#ff4444'; ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawGears() {
    for (const g of gears) {
        const sp = worldToScreen(g.x, g.y);
        if (sp.x < -20 || sp.x > W+20 || sp.y < -20 || sp.y > H+20) continue;
        const bob = Math.sin(g.bobPhase) * 3;
        ctx.globalAlpha = Math.min(1, g.life * 2);
        ctx.shadowColor = COLORS.gearGlow; ctx.shadowBlur = 10;
        drawCog(sp.x, sp.y + bob, g.radius, g.radius*0.65, 6, g.spinAngle, COLORS.gear, '#ffcc44');
        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}

function drawPickups() {
    for (const p of pickups) {
        const sp = worldToScreen(p.x, p.y);
        const bob = Math.sin(p.bobPhase) * 4;
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.shadowColor = COLORS.healthPickup; ctx.shadowBlur = 12;
        ctx.fillStyle = COLORS.healthPickup;
        // Draw cross
        ctx.fillRect(sp.x-4, sp.y+bob-10, 8, 20);
        ctx.fillRect(sp.x-10, sp.y+bob-4, 20, 8);
        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}

function drawParticles() {
    for (const p of particles) {
        const sp = worldToScreen(p.x, p.y);
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.fillRect(sp.x - p.size/2, sp.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
    for (const ft of floatingTexts) {
        const sp = worldToScreen(ft.x, ft.y);
        ctx.globalAlpha = ft.life / ft.maxLife;
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, sp.x, sp.y);
    }
    ctx.globalAlpha = 1;
}

function drawPlacementPreview() {
    const wp = screenToWorld(mouseX, mouseY);
    const sp = worldToScreen(wp.x, wp.y);
    const color = placingTurret ? COLORS.turret : COLORS.repairPad;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, placingTurret ? 16 : 40, 0, PI2); ctx.stroke();
    if (placingTurret) {
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 250, 0, PI2); ctx.strokeStyle = 'rgba(0,255,136,0.1)'; ctx.stroke();
    }
    ctx.setLineDash([]);
}

function drawMinimap() {
    const mmW = 140, mmH = 140, mmX = W - mmW - 12, mmY = H - mmH - 12;
    const scale = mmW / WORLD_SIZE;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = 'rgba(0,240,255,0.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);
    // Player
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(mmX + player.x*scale - 2, mmY + player.y*scale - 2, 4, 4);
    // Enemies
    ctx.fillStyle = '#ff4444';
    for (const e of enemies) ctx.fillRect(mmX + e.x*scale - 1, mmY + e.y*scale - 1, 2, 2);
    // Turrets
    ctx.fillStyle = COLORS.turret;
    for (const t of turrets) ctx.fillRect(mmX + t.x*scale - 1.5, mmY + t.y*scale - 1.5, 3, 3);
    // Gears
    ctx.fillStyle = COLORS.gear;
    for (const g of gears) ctx.fillRect(mmX + g.x*scale - 1, mmY + g.y*scale - 1, 2, 2);
    // Viewport
    ctx.strokeStyle = 'rgba(0,240,255,0.3)';
    ctx.strokeRect(mmX+(camera.x-W/2)*scale, mmY+(camera.y-H/2)*scale, W*scale, H*scale);
}

function drawVignette() {
    const grad = ctx.createRadialGradient(W/2, H/2, W*0.3, W/2, H/2, W*0.75);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
}

// ---- GAME FLOW ----
function startGame() {
    initAudio();
    gameState = 'playing';
    score = 0; kills = 0; turretsBuilt = 0;
    wave = 1; waveTimer = 0; waveEnemiesLeft = 0; waveActive = false; intermission = true; intermTimer = 3;
    // Reset player
    Object.assign(player, { x: WORLD_SIZE/2, y: WORLD_SIZE/2, vx:0, vy:0, hp:100, maxHp:100,
        speed:220, fireRate:0.15, fireTimer:0, damage:12, gears:0, level:1, invincible:0, trail:[] });
    camera.x = player.x; camera.y = player.y;
    bullets=[]; enemies=[]; particles=[]; gears=[]; turrets=[]; repairPads=[]; pickups=[]; enemyBullets=[]; floatingTexts=[];
    placingTurret = false; placingRepair = false;
    // UI
    document.getElementById('titleScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('buildMenu').classList.remove('hidden');
    document.getElementById('waveNum').textContent = '1';
    startBGBeat();
}

function gameOver() {
    gameState = 'gameover';
    playSound('gameover');
    stopBGBeat();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('buildMenu').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('finalWave').textContent = wave;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalKills').textContent = kills;
    document.getElementById('finalTurrets').textContent = turretsBuilt;
}

// ---- TITLE SCREEN ANIMATION ----
function drawTitle() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    drawGrid();
    // Floating cogs
    const t = Date.now() * 0.001;
    ctx.globalAlpha = 0.08;
    drawCog(W*0.2, H*0.3, 80, 55, 10, t, null, COLORS.player);
    drawCog(W*0.8, H*0.7, 60, 40, 8, -t*1.3, null, '#ff6a00');
    drawCog(W*0.5, H*0.2, 50, 35, 7, t*0.8, null, '#ff4444');
    drawCog(W*0.7, H*0.4, 70, 50, 9, -t*0.6, null, COLORS.turret);
    ctx.globalAlpha = 1;
    drawVignette();
}

// ---- MAIN LOOP ----
let lastTime = 0;
function loop(time) {
    requestAnimationFrame(loop);
    const dt = Math.min((time - lastTime)/1000, 0.05);
    lastTime = time;

    if (gameState === 'title') { drawTitle(); return; }
    if (gameState === 'gameover') {
        // Keep rendering background
        draw();
        return;
    }
    update(dt);
    draw();
}
requestAnimationFrame(loop);

// ---- BUTTON HANDLERS ----
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

})();
