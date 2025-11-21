import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- types.ts embedded for single-file logic flow ---
type Vector2 = { x: number; y: number };
type EntityType = 'PLAYER' | 'ZOMBIE_FAST' | 'ZOMBIE_TANK' | 'BULLET' | 'PARTICLE';

interface Entity {
  id: string;
  type: EntityType;
  pos: Vector2;
  vel: Vector2;
  radius: number;
  color: string;
  life: number; // 0-1 for particles, health for units
  maxLife: number;
  angle: number;
  markedForDeletion: boolean;
}

// --- Constants ---
const WORLD_COLOR = '#050505';
const GRID_COLOR = '#1a1a1a';
const PLAYER_COLOR = '#00ffff';
const PLAYER_GLOW = '#0088ff';
const BULLET_COLOR = '#ffff00';
const ZOMBIE_FAST_COLOR = '#ff0055';
const ZOMBIE_TANK_COLOR = '#aa00ff';
const BLOOD_COLOR_1 = '#00ff00'; // Neon toxic blood
const BLOOD_COLOR_2 = '#ff0055';
const FRICTION = 0.9;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 18;
const FIRERATE = 8; // Frames between shots

const NeonGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [gameOver, setGameOver] = useState(false);
  const [wave, setWave] = useState(1);

  // --- Game State Refs (Mutable for performance) ---
  // Using refs prevents React re-renders during the 60fps loop
  const gameState = useRef({
    player: {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      angle: 0,
      cooldown: 0,
      maxHealth: 100,
      currHealth: 100,
      recoil: 0,
    },
    entities: [] as Entity[],
    particles: [] as Entity[],
    keys: new Set<string>(),
    mouse: { x: 0, y: 0, down: false },
    camera: { x: 0, y: 0, shake: 0 },
    waveTimer: 0,
    score: 0,
    isRunning: true,
    frameCount: 0,
  });

  // --- Helper Functions ---
  const vecAdd = (v1: Vector2, v2: Vector2) => ({ x: v1.x + v2.x, y: v1.y + v2.y });
  const vecSub = (v1: Vector2, v2: Vector2) => ({ x: v1.x - v2.x, y: v1.y - v2.y });
  const vecMult = (v: Vector2, s: number) => ({ x: v.x * s, y: v.y * s });
  const vecLen = (v: Vector2) => Math.sqrt(v.x * v.x + v.y * v.y);
  const vecNorm = (v: Vector2) => {
    const len = vecLen(v);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
  };

  const createParticle = (pos: Vector2, count: number, color: string, speed: number, lifeBase: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * speed;
      gameState.current.particles.push({
        id: Math.random().toString(),
        type: 'PARTICLE',
        pos: { ...pos },
        vel: { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd },
        radius: Math.random() * 3 + 1,
        color: color,
        life: lifeBase + Math.random() * 30,
        maxLife: lifeBase + 30,
        angle: Math.random() * Math.PI * 2,
        markedForDeletion: false,
      });
    }
  };

  const addTrauma = (amount: number) => {
    gameState.current.camera.shake = Math.min(gameState.current.camera.shake + amount, 25);
  };

  const restartGame = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    gameState.current.player.pos = { x: width / 2, y: height / 2 };
    gameState.current.player.currHealth = 100;
    gameState.current.entities = [];
    gameState.current.particles = [];
    gameState.current.score = 0;
    gameState.current.waveTimer = 0;
    gameState.current.isRunning = true;
    
    setScore(0);
    setHealth(100);
    setGameOver(false);
    setWave(1);
  };

  // --- Main Loop Effect ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Alpha false for slight perf boost
    if (!ctx) return;

    // Resize handler
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Reset player pos if it's the very first load
      if (gameState.current.frameCount === 0) {
        gameState.current.player.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // Input Handlers
    const handleKeyDown = (e: KeyboardEvent) => gameState.current.keys.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => gameState.current.keys.delete(e.code);
    const handleMouseMove = (e: MouseEvent) => {
        gameState.current.mouse.x = e.clientX;
        gameState.current.mouse.y = e.clientY;
    };
    const handleMouseDown = () => { gameState.current.mouse.down = true; };
    const handleMouseUp = () => { gameState.current.mouse.down = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    // --- Game Loop ---
    let animationFrameId: number;

    const loop = () => {
      if (!gameState.current.isRunning) {
         // If game over, still render but don't update logic heavily
         if (gameState.current.player.currHealth <= 0 && !gameOver) {
             setGameOver(true);
         }
         animationFrameId = requestAnimationFrame(loop);
         return;
      }
      
      const state = gameState.current;
      state.frameCount++;

      // 1. UPDATE
      
      // Player Movement
      const move = { x: 0, y: 0 };
      if (state.keys.has('KeyW')) move.y -= 1;
      if (state.keys.has('KeyS')) move.y += 1;
      if (state.keys.has('KeyA')) move.x -= 1;
      if (state.keys.has('KeyD')) move.x += 1;

      const moveDir = vecNorm(move);
      state.player.vel = vecAdd(state.player.vel, vecMult(moveDir, 0.8));
      state.player.vel = vecMult(state.player.vel, FRICTION); // Friction
      state.player.pos = vecAdd(state.player.pos, state.player.vel);

      // Bounds Checking
      state.player.pos.x = Math.max(20, Math.min(canvas.width - 20, state.player.pos.x));
      state.player.pos.y = Math.max(20, Math.min(canvas.height - 20, state.player.pos.y));

      // Player Aim & Shoot
      const dx = state.mouse.x - state.player.pos.x;
      const dy = state.mouse.y - state.player.pos.y;
      state.player.angle = Math.atan2(dy, dx);

      // Shooting
      if (state.player.cooldown > 0) state.player.cooldown--;
      if (state.mouse.down && state.player.cooldown <= 0) {
        state.player.cooldown = FIRERATE;
        state.player.recoil = 6;
        addTrauma(4); // Screen shake on shot

        // Create Bullet
        const spread = (Math.random() - 0.5) * 0.1;
        const bulletVel = {
            x: Math.cos(state.player.angle + spread) * BULLET_SPEED,
            y: Math.sin(state.player.angle + spread) * BULLET_SPEED
        };
        // Muzzle position (slightly offset)
        const muzzlePos = vecAdd(state.player.pos, vecMult(vecNorm(bulletVel), 25));

        state.entities.push({
            id: Math.random().toString(),
            type: 'BULLET',
            pos: muzzlePos,
            vel: bulletVel,
            radius: 3,
            color: BULLET_COLOR,
            life: 1,
            maxLife: 1,
            angle: state.player.angle,
            markedForDeletion: false
        });
        
        // Muzzle Flash Particles
        createParticle(muzzlePos, 3, '#ffffaa', 2, 10);
      }

      if (state.player.recoil > 0) state.player.recoil *= 0.8;

      // Spawning Logic (Wave System)
      state.waveTimer++;
      // Scale difficulty
      const spawnRate = Math.max(20, 100 - (Math.floor(state.score / 500) * 5)); 
      
      if (state.waveTimer % spawnRate === 0) {
         // Spawn Point: Edge of screen
         const side = Math.floor(Math.random() * 4);
         let spawnPos = { x: 0, y: 0 };
         if (side === 0) spawnPos = { x: Math.random() * canvas.width, y: -50 }; // Top
         else if (side === 1) spawnPos = { x: canvas.width + 50, y: Math.random() * canvas.height }; // Right
         else if (side === 2) spawnPos = { x: Math.random() * canvas.width, y: canvas.height + 50 }; // Bottom
         else spawnPos = { x: -50, y: Math.random() * canvas.height }; // Left

         const isTank = Math.random() > 0.85;
         state.entities.push({
            id: Math.random().toString(),
            type: isTank ? 'ZOMBIE_TANK' : 'ZOMBIE_FAST',
            pos: spawnPos,
            vel: { x: 0, y: 0 },
            radius: isTank ? 25 : 12,
            color: isTank ? ZOMBIE_TANK_COLOR : ZOMBIE_FAST_COLOR,
            life: isTank ? 100 : 30,
            maxLife: isTank ? 100 : 30,
            angle: 0,
            markedForDeletion: false
         });
      }

      // Update Entities (Bullets & Zombies)
      state.entities.forEach(ent => {
        if (ent.type === 'BULLET') {
            ent.pos = vecAdd(ent.pos, ent.vel);
            // Bounds check bullet
            if (ent.pos.x < 0 || ent.pos.x > canvas.width || ent.pos.y < 0 || ent.pos.y > canvas.height) {
                ent.markedForDeletion = true;
            }
        } else if (ent.type.startsWith('ZOMBIE')) {
            // Boids - Separation
            let separation = { x: 0, y: 0 };
            state.entities.forEach(other => {
                if (other !== ent && other.type.startsWith('ZOMBIE')) {
                    const dist = vecLen(vecSub(ent.pos, other.pos));
                    if (dist < ent.radius + other.radius + 10) {
                        const push = vecNorm(vecSub(ent.pos, other.pos));
                        separation = vecAdd(separation, push);
                    }
                }
            });
            
            // Chase Player
            const dirToPlayer = vecNorm(vecSub(state.player.pos, ent.pos));
            const speed = ent.type === 'ZOMBIE_FAST' ? 2.5 + (state.score/5000) : 1.2;
            
            // Apply velocity
            ent.vel = vecAdd(vecMult(dirToPlayer, speed * 0.8), vecMult(separation, 0.5));
            ent.pos = vecAdd(ent.pos, ent.vel);
            ent.angle = Math.atan2(dirToPlayer.y, dirToPlayer.x);

            // Collision with Player
            const distPlayer = vecLen(vecSub(ent.pos, state.player.pos));
            if (distPlayer < ent.radius + 15) {
                state.player.currHealth -= 1;
                addTrauma(10);
                setHealth(state.player.currHealth);
                // Push back
                ent.vel = vecMult(dirToPlayer, -5);
                ent.pos = vecAdd(ent.pos, ent.vel);
                
                if (state.player.currHealth <= 0) state.isRunning = false;
            }
        }
      });

      // Collision Detection: Bullets vs Zombies
      for (const bullet of state.entities) {
          if (bullet.type !== 'BULLET' || bullet.markedForDeletion) continue;
          
          for (const enemy of state.entities) {
              if (!enemy.type.startsWith('ZOMBIE') || enemy.markedForDeletion) continue;
              
              const dist = vecLen(vecSub(bullet.pos, enemy.pos));
              if (dist < enemy.radius + bullet.radius) {
                  // Hit!
                  bullet.markedForDeletion = true;
                  enemy.life -= 25;
                  
                  // Hit feedback
                  enemy.pos = vecAdd(enemy.pos, vecMult(vecNorm(bullet.vel), 4)); // Knockback
                  createParticle(enemy.pos, 5, enemy.color, 3, 10); // Sparks

                  if (enemy.life <= 0) {
                      enemy.markedForDeletion = true;
                      addTrauma(8); // Kill shake
                      state.score += (enemy.type === 'ZOMBIE_TANK' ? 50 : 10);
                      setScore(state.score);
                      
                      // Blood explosion
                      createParticle(enemy.pos, 15, BLOOD_COLOR_1, 5, 40);
                      createParticle(enemy.pos, 10, BLOOD_COLOR_2, 4, 30);
                  }
                  break; // Bullet destroys only one enemy
              }
          }
      }

      // Update Particles
      state.particles.forEach(p => {
        p.pos = vecAdd(p.pos, p.vel);
        p.vel = vecMult(p.vel, 0.92); // Drag
        p.life--;
        if (p.life <= 0) p.markedForDeletion = true;
      });

      // Cleanup
      state.entities = state.entities.filter(e => !e.markedForDeletion);
      state.particles = state.particles.filter(p => !p.markedForDeletion);

      // 2. DRAW
      
      // Camera Shake Calculation
      let shakeX = 0;
      let shakeY = 0;
      if (state.camera.shake > 0) {
          shakeX = (Math.random() - 0.5) * state.camera.shake * 2;
          shakeY = (Math.random() - 0.5) * state.camera.shake * 2;
          state.camera.shake *= 0.9; // Decay
          if (state.camera.shake < 0.5) state.camera.shake = 0;
      }

      ctx.save();
      // Clear Screen
      ctx.fillStyle = WORLD_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Apply Camera Shake
      ctx.translate(shakeX, shakeY);

      // Draw Grid (Warp effect based on shake or explosions could go here)
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gridSize = 50;
      const offsetX = shakeX % gridSize;
      const offsetY = shakeY % gridSize;
      
      for (let x = offsetX; x < canvas.width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
      }
      for (let y = offsetY; y < canvas.height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();

      // Draw Particles (Beneath entities)
      state.particles.forEach(p => {
         ctx.globalAlpha = p.life / p.maxLife;
         ctx.fillStyle = p.color;
         ctx.beginPath();
         // Square particles look digital/retro
         ctx.rect(p.pos.x - p.radius/2, p.pos.y - p.radius/2, p.radius, p.radius);
         ctx.fill();
         ctx.globalAlpha = 1;
      });

      // Draw Enemies
      state.entities.forEach(ent => {
          if (!ent.type.startsWith('ZOMBIE')) return;
          
          // Flash white on hit (simple logic: using modulo of life or dedicated hit timer, simplifying here)
          ctx.save();
          ctx.translate(ent.pos.x, ent.pos.y);
          ctx.rotate(ent.angle);
          
          // Shadow/Glow
          ctx.shadowBlur = 15;
          ctx.shadowColor = ent.color;
          
          ctx.fillStyle = ent.color;
          // Tanks are squares, Walkers are triangles
          if (ent.type === 'ZOMBIE_TANK') {
              ctx.fillRect(-ent.radius, -ent.radius, ent.radius*2, ent.radius*2);
              // Health bar for tank
              ctx.fillStyle = 'white';
              ctx.fillRect(-ent.radius, -ent.radius - 10, ent.radius * 2 * (ent.life / ent.maxLife), 4);
          } else {
              ctx.beginPath();
              ctx.moveTo(ent.radius, 0);
              ctx.lineTo(-ent.radius, ent.radius);
              ctx.lineTo(-ent.radius, -ent.radius);
              ctx.fill();
          }
          ctx.restore();
      });

      // Draw Player
      ctx.save();
      const kickbackX = -Math.cos(state.player.angle) * state.player.recoil;
      const kickbackY = -Math.sin(state.player.angle) * state.player.recoil;
      
      ctx.translate(state.player.pos.x + kickbackX, state.player.pos.y + kickbackY);
      ctx.rotate(state.player.angle);
      
      // Player Glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = PLAYER_GLOW;
      
      // Body
      ctx.fillStyle = PLAYER_COLOR;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      
      // Gun
      ctx.fillStyle = '#444';
      ctx.fillRect(5, -5, 25, 10);
      
      ctx.restore();

      // Draw Bullets
      state.entities.forEach(ent => {
          if (ent.type !== 'BULLET') return;
          ctx.save();
          ctx.translate(ent.pos.x, ent.pos.y);
          ctx.shadowBlur = 10;
          ctx.shadowColor = BULLET_COLOR;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, ent.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
      });

      // Vignette & Chromatic Abberation simulation (Overlay)
      // We actually do this in CSS or logic, doing it in canvas is expensive.
      // Simple red border on low health
      if (state.player.currHealth < 30) {
          ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(Date.now() / 100) * 0.1})`;
          ctx.fillRect(-shakeX, -shakeY, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, []); // Empty dependency array: only run once on mount

  return (
    <div className="relative w-full h-full">
      {/* Game Canvas */}
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full cursor-crosshair"
      />

      {/* HUD */}
      <div className="absolute top-6 left-6 text-cyan-400 text-2xl font-bold tracking-widest drop-shadow-[0_0_10px_rgba(0,255,255,0.8)]">
        SCORE: {score.toString().padStart(6, '0')}
      </div>
      
      {/* Health Bar */}
      <div className="absolute bottom-8 left-8 w-64 h-6 border-2 border-cyan-900 bg-black/50 transform skew-x-[-12deg]">
        <div 
            className={`h-full transition-all duration-100 ease-out ${health < 30 ? 'bg-red-500 animate-pulse' : 'bg-cyan-500'}`}
            style={{ width: `${Math.max(0, health)}%` }}
        />
        <span className="absolute -top-8 left-0 text-cyan-500 font-bold text-sm tracking-widest">VITALITY</span>
      </div>

      {/* Controls Hint */}
      <div className="absolute bottom-8 right-8 text-right opacity-50 text-xs text-cyan-300 font-mono">
        <p>WASD - MOVE</p>
        <p>MOUSE - AIM/SHOOT</p>
      </div>

      {/* Game Over Screen */}
      {gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center border border-red-500/50 p-12 bg-black/90 shadow-[0_0_50px_rgba(255,0,0,0.2)]">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-t from-red-900 to-red-500 mb-4 animate-pulse">
              CRITICAL FAILURE
            </h1>
            <p className="text-xl text-gray-400 mb-8 font-mono">
              FINAL SCORE :: <span className="text-white">{score}</span>
            </p>
            <button 
              onClick={restartGame}
              className="px-8 py-3 border-2 border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black transition-all duration-200 font-bold tracking-widest text-lg uppercase"
            >
              Reboot System
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeonGame;