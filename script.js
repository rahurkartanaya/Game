// Game constants
const GRID_SIZE = 40;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const FROG_SIZE = 40;
const OBSTACLE_HEIGHT = 40;
const OBSTACLE_WIDTH = 80;

// Game variables
let canvas, ctx;
let frog = {
    x: CANVAS_WIDTH / 2 - FROG_SIZE / 2,
    y: CANVAS_HEIGHT - FROG_SIZE,
    width: FROG_SIZE,
    height: FROG_SIZE
};
let obstacles = [];
let score = 0;
let highScore = localStorage.getItem('highScore') || 0;
let lives = 3;
let gameLoop;
let gameOver = false;
let flowers = [];
let lastTime = 0;
let gameStartTime;
let soundEnabled = true;
let particles = [];

// Audio Manager using Web Audio API
class AudioManager {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    createNoiseBuffer() {
        const bufferSize = this.audioContext.sampleRate * 0.5; // 0.5 seconds
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        return buffer;
    }

    playSound(type) {
        if (!soundEnabled) return;
        
        switch(type) {
            case 'jump':
                // Higher pitched blip for jump
                const jumpOsc = this.audioContext.createOscillator();
                const jumpGain = this.audioContext.createGain();
                
                jumpOsc.connect(jumpGain);
                jumpGain.connect(this.audioContext.destination);
                
                jumpOsc.type = 'sine';
                jumpOsc.frequency.setValueAtTime(600, this.audioContext.currentTime);
                jumpOsc.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.1);
                
                jumpGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                jumpGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                
                jumpOsc.start();
                jumpOsc.stop(this.audioContext.currentTime + 0.1);
                break;
                
            case 'crash':
                // Frog croak sound
                const croakTime = this.audioContext.currentTime;
                const duration = 0.3;
                
                // Create main oscillator for the croak
                const croakOsc = this.audioContext.createOscillator();
                const croakGain = this.audioContext.createGain();
                const filter = this.audioContext.createBiquadFilter();
                
                // Create modulator for the ribbit effect
                const modulator = this.audioContext.createOscillator();
                const modGain = this.audioContext.createGain();
                
                // Create noise for texture
                const noiseBuffer = this.createNoiseBuffer();
                const noiseSource = this.audioContext.createBufferSource();
                const noiseGain = this.audioContext.createGain();
                
                // Set up connections
                croakOsc.connect(croakGain);
                modulator.connect(modGain);
                modGain.connect(croakOsc.frequency);
                noiseSource.connect(noiseGain);
                croakGain.connect(filter);
                noiseGain.connect(filter);
                filter.connect(this.audioContext.destination);
                
                // Configure oscillators
                croakOsc.type = 'sawtooth';
                croakOsc.frequency.setValueAtTime(130, croakTime);
                croakOsc.frequency.exponentialRampToValueAtTime(80, croakTime + duration);
                
                modulator.type = 'sine';
                modulator.frequency.setValueAtTime(15, croakTime);
                modGain.gain.setValueAtTime(50, croakTime);
                
                // Configure noise
                noiseSource.buffer = noiseBuffer;
                noiseGain.gain.setValueAtTime(0.2, croakTime);
                noiseGain.gain.exponentialRampToValueAtTime(0.01, croakTime + duration);
                
                // Configure filter
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1000, croakTime);
                filter.frequency.exponentialRampToValueAtTime(100, croakTime + duration);
                filter.Q.setValueAtTime(10, croakTime);
                
                // Volume envelope
                croakGain.gain.setValueAtTime(0, croakTime);
                croakGain.gain.linearRampToValueAtTime(0.3, croakTime + 0.05);
                croakGain.gain.exponentialRampToValueAtTime(0.01, croakTime + duration);
                
                // Start and stop all nodes
                croakOsc.start(croakTime);
                modulator.start(croakTime);
                noiseSource.start(croakTime);
                
                croakOsc.stop(croakTime + duration);
                modulator.stop(croakTime + duration);
                noiseSource.stop(croakTime + duration);
                break;
                
            case 'score':
                // Victory fanfare
                const scoreTime = this.audioContext.currentTime;
                const frequencies = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
                const noteDuration = 0.1;
                
                frequencies.forEach((freq, index) => {
                    const noteOsc = this.audioContext.createOscillator();
                    const noteGain = this.audioContext.createGain();
                    
                    // Add reverb
                    const convolver = this.audioContext.createConvolver();
                    const reverbGain = this.audioContext.createGain();
                    reverbGain.gain.value = 0.2;
                    
                    noteOsc.connect(noteGain);
                    noteGain.connect(this.audioContext.destination);
                    noteGain.connect(reverbGain);
                    reverbGain.connect(this.audioContext.destination);
                    
                    noteOsc.type = 'sine';
                    noteOsc.frequency.setValueAtTime(freq, scoreTime + index * noteDuration);
                    
                    // Volume envelope
                    noteGain.gain.setValueAtTime(0, scoreTime + index * noteDuration);
                    noteGain.gain.linearRampToValueAtTime(0.3, scoreTime + index * noteDuration + 0.05);
                    noteGain.gain.exponentialRampToValueAtTime(0.01, scoreTime + index * noteDuration + noteDuration);
                    
                    noteOsc.start(scoreTime + index * noteDuration);
                    noteOsc.stop(scoreTime + index * noteDuration + noteDuration);
                });
                break;
        }
    }

    playJump() {
        this.playSound('jump');
    }

    playCrash() {
        this.playSound('crash');
    }

    playScore() {
        this.playSound('score');
    }
}

const audioManager = new AudioManager();

// Toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('toggleSoundBtn');
    btn.textContent = `🔊 Sound: ${soundEnabled ? 'On' : 'Off'}`;
}

// Calculate time bonus
function calculateTimeBonus() {
    const timeTaken = (Date.now() - gameStartTime) / 1000;
    const baseBonus = 1000;
    const bonus = Math.max(0, Math.floor(baseBonus - (timeTaken * 10)));
    return bonus;
}

// Update timer display
function updateTimer() {
    if (!gameOver && gameStartTime) {
        const timeTaken = Math.floor((Date.now() - gameStartTime) / 1000);
        document.getElementById('timer').textContent = timeTaken;
    }
}

// Particle system
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 2;
        this.dx = Math.cos(angle) * speed;
        this.dy = Math.sin(angle) * speed;
        this.size = Math.random() * 3 + 2;
        this.alpha = 1;
        this.color = ['#ff0000', '#ff6b6b', '#ff4444', '#ffeb3b'][Math.floor(Math.random() * 4)];
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.alpha -= 0.05;
        this.size *= 0.95;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createExplosion(x, y) {
    for(let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y));
    }
}

// Initialize the game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Initialize flowers
    initFlowers();
    
    // Create initial obstacles
    createObstacles();
    
    // Reset game state
    score = 0;
    lives = 3;
    gameOver = false;
    gameStartTime = Date.now();
    document.getElementById('highScore').textContent = highScore;
    
    // Start game loop
    gameLoop = setInterval(() => {
        update();
        updateTimer();
    }, 1000/60);
    
    // Add keyboard controls
    document.addEventListener('keydown', handleKeyPress);
    
    // Add sound toggle
    document.getElementById('toggleSoundBtn').addEventListener('click', toggleSound);
}

// Initialize flowers
function initFlowers() {
    flowers = [];
    const lowerGrassArea = {
        y: CANVAS_HEIGHT - GRID_SIZE * 2,
        height: GRID_SIZE * 2
    };
    
    const flowerColors = ['#ffeb3b', '#ffd700', '#fff176'];
    for(let i = 0; i < 30; i++) {
        flowers.push({
            x: Math.random() * CANVAS_WIDTH,
            y: lowerGrassArea.y + Math.random() * lowerGrassArea.height,
            color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
            phase: Math.random() * Math.PI * 2,
            amplitude: 0.3 + Math.random() * 0.3
        });
    }
}

// Handle keyboard input
function handleKeyPress(e) {
    if (gameOver) return;
    
    const STEP = GRID_SIZE;
    let moved = false;
    
    switch(e.key) {
        case 'ArrowUp':
            if (frog.y > 0) {
                frog.y -= STEP;
                moved = true;
                if (frog.y === 0) {
                    incrementScore();
                    resetFrog();
                }
            }
            break;
        case 'ArrowDown':
            if (frog.y < CANVAS_HEIGHT - FROG_SIZE) {
                frog.y += STEP;
                moved = true;
            }
            break;
        case 'ArrowLeft':
            if (frog.x > 0) {
                frog.x -= STEP;
                moved = true;
            }
            break;
        case 'ArrowRight':
            if (frog.x < CANVAS_WIDTH - FROG_SIZE) {
                frog.x += STEP;
                moved = true;
            }
            break;
    }
    
    if (moved) {
        audioManager.playJump();
    }
}

// Create obstacles
function createObstacles() {
    obstacles = [];
    const lanes = 3;
    const obstaclesPerLane = 3;
    const types = ['car', 'truck', 'motorcycle'];
    
    for (let lane = 0; lane < lanes; lane++) {
        const y = (lane + 1) * GRID_SIZE * 2;
        for (let i = 0; i < obstaclesPerLane; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            let width = OBSTACLE_WIDTH;
            
            if (type === 'truck') width = OBSTACLE_WIDTH * 1.5;
            if (type === 'motorcycle') width = OBSTACLE_WIDTH * 0.5;
            
            obstacles.push({
                x: i * (CANVAS_WIDTH / obstaclesPerLane),
                y: y,
                width: width,
                height: OBSTACLE_HEIGHT,
                speed: 2 + lane * 0.5,
                direction: lane % 2 === 0 ? 1 : -1,
                type: type
            });
        }
    }
}

// Update game state
function update() {
    if (gameOver) return;
    
    // Update obstacles
    obstacles.forEach(obstacle => {
        obstacle.x += obstacle.speed * obstacle.direction;
        
        if (obstacle.direction > 0 && obstacle.x > CANVAS_WIDTH) {
            obstacle.x = -obstacle.width;
        } else if (obstacle.direction < 0 && obstacle.x < -obstacle.width) {
            obstacle.x = CANVAS_WIDTH;
        }
        
        if (checkCollision(frog, obstacle)) {
            createExplosion(frog.x + FROG_SIZE/2, frog.y + FROG_SIZE/2);
            loseLife();
        }
    });
    
    // Update particles
    particles = particles.filter(particle => particle.alpha > 0);
    particles.forEach(particle => particle.update());
    
    draw();
}

// Check collision between two rectangles
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Draw game state
function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    drawBackground();
    drawRoads();
    drawDecorations();
    drawFrog(frog.x, frog.y, frog.width, frog.height);
    
    obstacles.forEach(obstacle => {
        switch(obstacle.type) {
            case 'car':
                drawCar(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.direction);
                break;
            case 'truck':
                drawTruck(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.direction);
                break;
            case 'motorcycle':
                drawMotorcycle(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.direction);
                break;
        }
    });
    
    particles.forEach(particle => particle.draw(ctx));
}

// Draw background elements
function drawBackground() {
    const currentTime = performance.now() / 3000;
    
    const grassGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grassGradient.addColorStop(0, '#1a2e14');
    grassGradient.addColorStop(1, '#0a1a08');
    ctx.fillStyle = grassGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const lowerGrassArea = {
        y: CANVAS_HEIGHT - GRID_SIZE * 2,
        height: GRID_SIZE * 2
    };

    ctx.fillStyle = '#0d1f0a';
    ctx.fillRect(0, lowerGrassArea.y, CANVAS_WIDTH, lowerGrassArea.height);

    ctx.strokeStyle = '#1d4016';
    ctx.lineWidth = 1;
    for(let x = 0; x < CANVAS_WIDTH; x += 10) {
        const heightVariation = Math.random() * 15;
        const xOffset = Math.random() * 4 - 2;
        
        ctx.beginPath();
        ctx.moveTo(x, CANVAS_HEIGHT - 5);
        ctx.quadraticCurveTo(
            x + xOffset,
            CANVAS_HEIGHT - 20 - heightVariation,
            x + xOffset * 2,
            CANVAS_HEIGHT - 30 - heightVariation
        );
        ctx.stroke();
    }

    flowers.forEach(flower => {
        const movement = Math.sin(currentTime + flower.phase) * flower.amplitude;
        
        ctx.fillStyle = flower.color;
        ctx.beginPath();
        ctx.arc(flower.x + movement, flower.y, 2, 0, Math.PI * 2);
        ctx.fill();
        
        for(let j = 0; j < 5; j++) {
            const angle = (j / 5) * Math.PI * 2;
            const petalX = flower.x + movement + Math.cos(angle) * 3;
            const petalY = flower.y + Math.sin(angle) * 3;
            
            ctx.beginPath();
            ctx.arc(petalX, petalY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for(let i = 0; i < CANVAS_WIDTH; i += 20) {
        for(let j = lowerGrassArea.y; j < CANVAS_HEIGHT; j += 15) {
            if(Math.random() > 0.7) {
                const size = Math.random() * 4 + 2;
                ctx.beginPath();
                ctx.arc(i, j, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// Draw road elements
function drawRoads() {
    const roadHeight = GRID_SIZE * 2;
    const numRoads = 3;
    
    for(let i = 0; i < numRoads; i++) {
        const y = (i + 1) * GRID_SIZE * 2 - GRID_SIZE;
        
        const roadGradient = ctx.createLinearGradient(0, y, 0, y + roadHeight);
        roadGradient.addColorStop(0, '#1a1a1a');
        roadGradient.addColorStop(0.5, '#222222');
        roadGradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = roadGradient;
        ctx.fillRect(0, y, CANVAS_WIDTH, roadHeight);
        
        ctx.strokeStyle = '#f0f0f0';
        ctx.setLineDash([30, 40]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, y + roadHeight/2);
        ctx.lineTo(CANVAS_WIDTH, y + roadHeight/2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.moveTo(0, y + roadHeight);
        ctx.lineTo(CANVAS_WIDTH, y + roadHeight);
        ctx.stroke();
        
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y + 2);
        ctx.lineTo(CANVAS_WIDTH, y + 2);
        ctx.moveTo(0, y + roadHeight + 2);
        ctx.lineTo(CANVAS_WIDTH, y + roadHeight + 2);
        ctx.stroke();
    }
}

// Draw decorative elements
function drawDecorations() {
    const startGradient = ctx.createLinearGradient(0, CANVAS_HEIGHT - GRID_SIZE, 0, CANVAS_HEIGHT);
    startGradient.addColorStop(0, '#666666');
    startGradient.addColorStop(1, '#444444');
    ctx.fillStyle = startGradient;
    ctx.fillRect(0, CANVAS_HEIGHT - GRID_SIZE, CANVAS_WIDTH, GRID_SIZE);
    
    const goalGradient = ctx.createLinearGradient(0, 0, 0, GRID_SIZE);
    goalGradient.addColorStop(0, '#4CAF50');
    goalGradient.addColorStop(1, '#388E3C');
    ctx.fillStyle = goalGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GRID_SIZE);
    
    ctx.fillStyle = '#66BB6A';
    for(let i = 0; i < CANVAS_WIDTH; i += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + GRID_SIZE, 0);
        ctx.lineTo(i + GRID_SIZE/2, GRID_SIZE);
        ctx.closePath();
        ctx.fill();
    }
}

// Draw frog
function drawFrog(x, y, width, height) {
    ctx.fillStyle = '#33cc33';
    ctx.beginPath();
    ctx.ellipse(x + width/2, y + height/2, width/2, height/2, 0, 0, Math.PI * 2);
    ctx.fill();

    const eyeRadius = width * 0.15;
    const eyeOffset = width * 0.2;
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + width/2 - eyeOffset, y + height * 0.3, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x + width/2 + eyeOffset, y + height * 0.3, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    const pupilRadius = eyeRadius * 0.5;
    ctx.beginPath();
    ctx.arc(x + width/2 - eyeOffset, y + height * 0.3, pupilRadius, 0, Math.PI * 2);
    ctx.arc(x + width/2 + eyeOffset, y + height * 0.3, pupilRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#2eb82e';
    ctx.lineWidth = 2;
    ctx.arc(x + width/2, y + height * 0.5, width * 0.2, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    
    ctx.fillStyle = '#ffcccc';
    ctx.beginPath();
    ctx.arc(x + width/2, y + height * 0.5, width * 0.15, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#2eb82e';
    ctx.beginPath();
    ctx.ellipse(x + width * 0.1, y + height * 0.5, width * 0.1, height * 0.15, -Math.PI/4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + width * 0.9, y + height * 0.5, width * 0.1, height * 0.15, Math.PI/4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#248f24';
    ctx.lineWidth = 2;
    for(let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + width * 0.05, y + height * (0.45 + i * 0.05));
        ctx.lineTo(x - width * 0.05, y + height * (0.43 + i * 0.05));
        ctx.stroke();
    }
    for(let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + width * 0.95, y + height * (0.45 + i * 0.05));
        ctx.lineTo(x + width * 1.05, y + height * (0.43 + i * 0.05));
        ctx.stroke();
    }

    const legColor = '#2eb82e';
    ctx.fillStyle = legColor;
    ctx.strokeStyle = legColor;
    ctx.lineWidth = width * 0.1;

    ctx.beginPath();
    ctx.moveTo(x + width * 0.2, y + height * 0.6);
    ctx.lineTo(x + width * 0.1, y + height * 0.75);
    ctx.lineTo(x + width * 0.2, y + height * 0.9);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + width * 0.3, y + height * 0.6);
    ctx.lineTo(x + width * 0.2, y + height * 0.8);
    ctx.lineTo(x + width * 0.3, y + height * 0.95);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + width * 0.8, y + height * 0.6);
    ctx.lineTo(x + width * 0.9, y + height * 0.75);
    ctx.lineTo(x + width * 0.8, y + height * 0.9);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + width * 0.7, y + height * 0.6);
    ctx.lineTo(x + width * 0.8, y + height * 0.8);
    ctx.lineTo(x + width * 0.7, y + height * 0.95);
    ctx.stroke();

    const footColor = '#248f24';
    ctx.fillStyle = footColor;
    ctx.beginPath();
    ctx.ellipse(x + width * 0.2, y + height * 0.9, width * 0.12, height * 0.08, Math.PI/4, 0, Math.PI * 2);
    ctx.ellipse(x + width * 0.8, y + height * 0.9, width * 0.12, height * 0.08, -Math.PI/4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + width * 0.3, y + height * 0.95, width * 0.12, height * 0.08, Math.PI/4, 0, Math.PI * 2);
    ctx.ellipse(x + width * 0.7, y + height * 0.95, width * 0.12, height * 0.08, -Math.PI/4, 0, Math.PI * 2);
    ctx.fill();
}

// Draw car
function drawCar(x, y, width, height, direction) {
    const isRightFacing = direction > 0;
    
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(1, '#cc0000');
    ctx.fillStyle = gradient;
    
    ctx.beginPath();
    ctx.roundRect(x, y + height * 0.1, width, height * 0.7, 5);
    ctx.fill();
    
    ctx.fillStyle = '#dd0000';
    ctx.beginPath();
    ctx.roundRect(x + width * 0.1, y, width * 0.8, height * 0.3, 3);
    ctx.fill();
    
    ctx.fillStyle = '#87CEEB';
    const windowWidth = width * 0.25;
    const windowHeight = height * 0.25;
    const windowY = y + height * 0.05;
    
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? width * 0.6 : width * 0.15),
        windowY,
        windowWidth,
        windowHeight,
        2
    );
    ctx.fill();
    
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? width * 0.15 : width * 0.6),
        windowY,
        windowWidth,
        windowHeight,
        2
    );
    ctx.fill();
    
    const wheelSize = height * 0.3;
    const wheelY = y + height * 0.75;
    
    function drawWheel(wheelX) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(wheelX, wheelY, wheelSize/2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(wheelX, wheelY, wheelSize/3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.arc(wheelX, wheelY, wheelSize/6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawWheel(x + width * 0.2);
    drawWheel(x + width * 0.8);
    
    const lightSize = height * 0.15;
    ctx.fillStyle = isRightFacing ? '#ffff00' : '#ff0000';
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? width - lightSize * 1.5 : lightSize * 0.5),
        y + height * 0.3,
        lightSize,
        lightSize,
        2
    );
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? width - height * 0.3 : height * 0.1),
        y + height * 0.35,
        height * 0.2,
        height * 0.2,
        1
    );
    ctx.fill();
}

// Draw truck
function drawTruck(x, y, width, height, direction) {
    const isRightFacing = direction > 0;
    const cabWidth = width * 0.3;
    
    // Cab with gradient
    const cabGradient = ctx.createLinearGradient(x, y, x, y + height);
    cabGradient.addColorStop(0, '#0000ff');
    cabGradient.addColorStop(1, '#0000cc');
    ctx.fillStyle = cabGradient;
    
    // Draw cab
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? 0 : width - cabWidth),
        y + height * 0.1,
        cabWidth,
        height * 0.7,
        5
    );
    ctx.fill();
    
    // Cab roof
    ctx.fillStyle = '#0000dd';
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? 0 : width - cabWidth),
        y,
        cabWidth,
        height * 0.3,
        3
    );
    ctx.fill();
    
    // Trailer
    const trailerGradient = ctx.createLinearGradient(x, y, x, y + height);
    trailerGradient.addColorStop(0, '#4444ff');
    trailerGradient.addColorStop(1, '#3333cc');
    ctx.fillStyle = trailerGradient;
    
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? cabWidth : 0),
        y + height * 0.15,
        width - cabWidth,
        height * 0.7,
        3
    );
    ctx.fill();
    
    // Trailer details
    ctx.strokeStyle = '#3333aa';
    ctx.lineWidth = 2;
    const trailerX = x + (isRightFacing ? cabWidth : 0);
    const trailerWidth = width - cabWidth;
    
    for(let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(trailerX, y + height * (0.25 + i * 0.2));
        ctx.lineTo(trailerX + trailerWidth, y + height * (0.25 + i * 0.2));
        ctx.stroke();
    }
    
    // Wheels
    const wheelSize = height * 0.25;
    const wheelY = y + height * 0.8;
    
    function drawWheel(wheelX) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(wheelX, wheelY, wheelSize/2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(wheelX, wheelY, wheelSize/3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Multiple wheel sets
    [0.15, 0.35, 0.75, 0.9].forEach(pos => {
        drawWheel(x + width * pos);
    });
    
    // Window
    ctx.fillStyle = '#87CEEB';
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? width * 0.05 : width * 0.75),
        y + height * 0.15,
        width * 0.2,
        height * 0.2,
        2
    );
    ctx.fill();
    
    // Headlight/Taillight
    ctx.fillStyle = isRightFacing ? '#ffff00' : '#ff0000';
    const lightSize = height * 0.15;
    ctx.beginPath();
    ctx.roundRect(
        x + (isRightFacing ? width - lightSize : 0),
        y + height * 0.3,
        lightSize,
        lightSize,
        2
    );
    ctx.fill();
}

function drawMotorcycle(x, y, width, height, direction) {
    const isRightFacing = direction > 0;
    
    // Main body with gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#ffff00');
    gradient.addColorStop(1, '#cccc00');
    ctx.fillStyle = gradient;
    
    // Frame
    ctx.beginPath();
    ctx.moveTo(x + width * 0.3, y + height * 0.6);
    ctx.lineTo(x + width * 0.7, y + height * 0.6);
    ctx.lineTo(x + width * 0.6, y + height * 0.4);
    ctx.lineTo(x + width * 0.4, y + height * 0.4);
    ctx.closePath();
    ctx.fill();
    
    // Seat
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(
        x + width * 0.35,
        y + height * 0.35,
        width * 0.3,
        height * 0.15,
        3
    );
    ctx.fill();
    
    // Wheels with spokes
    function drawDetailedWheel(wheelX) {
        // Tire
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(wheelX, y + height * 0.6, height * 0.2, 0, Math.PI * 2);
        ctx.fill();
        
        // Rim
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(wheelX, y + height * 0.6, height * 0.15, 0, Math.PI * 2);
        ctx.fill();
        
        // Spokes
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        for(let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            ctx.beginPath();
            ctx.moveTo(wheelX, y + height * 0.6);
            ctx.lineTo(
                wheelX + Math.cos(angle) * height * 0.15,
                y + height * 0.6 + Math.sin(angle) * height * 0.15
            );
            ctx.stroke();
        }
    }
    
    drawDetailedWheel(x + width * 0.2);
    drawDetailedWheel(x + width * 0.8);
    
    // Handlebars
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + width * (isRightFacing ? 0.7 : 0.3), y + height * 0.4);
    ctx.lineTo(x + width * (isRightFacing ? 0.8 : 0.2), y + height * 0.3);
    ctx.stroke();
    
    // Headlight
    ctx.fillStyle = '#ffff88';
    ctx.beginPath();
    ctx.arc(
        x + width * (isRightFacing ? 0.9 : 0.1),
        y + height * 0.4,
        height * 0.08,
        0,
        Math.PI * 2
    );
    ctx.fill();
}

// Increment score
function incrementScore() {
    score++;
    const timeBonus = calculateTimeBonus();
    score += timeBonus;
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
        document.getElementById('highScore').textContent = highScore;
    }
    
    document.getElementById('score').textContent = score;
    audioManager.playScore();
    gameStartTime = Date.now(); // Reset timer for next crossing
}

// Lose a life
function loseLife() {
    lives--;
    document.getElementById('lives').textContent = lives;
    audioManager.playCrash();
    
    if (lives <= 0) {
        endGame();
    } else {
        resetFrog();
    }
}

// Reset frog position
function resetFrog() {
    frog.x = CANVAS_WIDTH / 2 - FROG_SIZE / 2;
    frog.y = CANVAS_HEIGHT - FROG_SIZE;
}

// End game
function endGame() {
    gameOver = true;
    clearInterval(gameLoop);
    
    const timeBonus = calculateTimeBonus();
    const totalScore = score + timeBonus;
    
    // Update final scores
    document.getElementById('finalScore').textContent = score;
    document.getElementById('timeBonus').textContent = timeBonus;
    document.getElementById('totalScore').textContent = totalScore;
    document.getElementById('finalHighScore').textContent = highScore;
    
    // Show modal with animation
    const modal = document.getElementById('gameOverModal');
    modal.style.display = 'flex';
    // Trigger reflow
    modal.offsetHeight;
    modal.classList.add('show');
    
    // Add event listener for play again button
    document.getElementById('playAgainBtn').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            restartGame();
        }, 300);
    });
}

// Restart game
function restartGame() {
    score = 0;
    lives = 3;
    gameOver = false;
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
    resetFrog();
    createObstacles();
    gameStartTime = Date.now();
    gameLoop = setInterval(() => {
        update();
        updateTimer();
    }, 1000/60);
}

// Start the game when the page loads
window.onload = init;
