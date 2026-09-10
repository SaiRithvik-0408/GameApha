import './style.css';
import confetti from 'canvas-confetti';

// Colors
const COLORS = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316'
};
const COLOR_KEYS = Object.keys(COLORS);

// Game State Variables
let currentLevel = 1;
let score = 0;
let coins = 100;

// Slot Progression Rules:
// - Base slots start at 3 and increase +1 every 2 levels up to 4 (e.g. Lvl 1-2 = 3 slots, Lvl 3+ = 4 slots)
// - Ad unlocked slots allow up to +2 extra slots beyond base level slots!
let adBonusSlots = 0; // max 2
let boardingLane = []; 
let passengers = []; 
let gridBuses = []; 
let animationFrameId = null;

let canvas, ctx;
let gridSize = 6;
let cellSize = 60;
let gridOffsetX = 0;
let gridOffsetY = 0;

function getBaseSlotsForLevel(lvl) {
  return Math.min(3 + Math.floor((lvl - 1) / 3), 4); // 3 base slots, scales to 4
}

function getTotalActiveSlots() {
  return getBaseSlotsForLevel(currentLevel) + adBonusSlots;
}

function getMaxCapacitySlots() {
  return 6; // Max 4 base + 2 ad slots = 6 total potential slots
}

function generateLevel(levelNum) {
  const numColors = Math.min(3 + Math.floor((levelNum - 1) / 2), COLOR_KEYS.length);
  const activeColors = COLOR_KEYS.slice(0, numColors);
  
  const totalBuses = 3 + levelNum * 2;
  const busesData = [];
  const passengerList = [];

  for (let i = 0; i < totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    for (let p = 0; p < 3; p++) {
      passengerList.push(color);
    }
  }

  for (let i = passengerList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passengerList[i], passengerList[j]] = [passengerList[j], passengerList[i]];
  }

  const occupied = Array(6).fill(null).map(() => Array(6).fill(false));
  const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  let busId = 1;
  for (let i = 0; i < totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 100) {
      attempts++;
      const dir = directions[Math.floor(Math.random() * directions.length)];
      const isVert = dir === 'UP' || dir === 'DOWN';
      const len = 2;

      const maxR = isVert ? 6 - len : 5;
      const maxC = isVert ? 5 : 6 - len;

      const r = Math.floor(Math.random() * (maxR + 1));
      const c = Math.floor(Math.random() * (maxC + 1));

      let overlap = false;
      for (let l = 0; l < len; l++) {
        const nr = isVert ? r + l : r;
        const nc = isVert ? c : c + l;
        if (occupied[nr][nc]) {
          overlap = true;
          break;
        }
      }

      if (!overlap) {
        for (let l = 0; l < len; l++) {
          const nr = isVert ? r + l : r;
          const nc = isVert ? c : c + l;
          occupied[nr][nc] = true;
        }

        busesData.push({
          id: busId++,
          color: color,
          dir: dir,
          r: r,
          c: c,
          length: len,
          passengersCount: 0,
          maxCapacity: 3,
          x: 0,
          y: 0,
          state: 'GRID'
        });
        placed = true;
      }
    }
  }

  return { buses: busesData, passengers: passengerList };
}

function initUI() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="game-header">
      <div class="level-badge" id="levelDisplay">LEVEL 1</div>
      <div class="stats-group">
        <div class="stat-pill" style="color:#fbbf24;">⚡ <span id="scoreDisplay">0</span></div>
        <div class="stat-pill" style="color:#38bdf8;">🪙 <span id="coinsDisplay">100</span></div>
      </div>
    </header>

    <main class="game-viewport">
      <section class="queue-container">
        <div class="queue-title">
          <span>Boarding Queue</span>
          <span id="queueCount">0 Passengers</span>
        </div>
        <div class="passenger-lane" id="passengerLane"></div>
      </section>

      <section class="boarding-station">
        <div class="queue-title">
          <span>Bus Boarding Docks</span>
          <span id="dockCapacityLabel">3 Active Slots</span>
        </div>
        <div class="station-slots" id="stationSlots"></div>
      </section>

      <section class="grid-stage">
        <canvas id="gameCanvas"></canvas>
      </section>
    </main>

    <footer class="booster-bar">
      <button class="booster-btn" id="btnShuffle">
        <span>🔄</span>
        <span>Shuffle Queue</span>
      </button>
      <button class="booster-btn" id="btnVIP">
        <span>⭐</span>
        <span>VIP Clear</span>
      </button>
      <button class="booster-btn" id="btnRestart">
        <span>🔁</span>
        <span>Restart</span>
      </button>
    </footer>

    <div class="modal-overlay" id="gameModal">
      <div class="modal-card">
        <h2 class="modal-title" id="modalTitle">LEVEL CLEARED!</h2>
        <p id="modalSubtitle" style="color: #94a3b8;">Great job!</p>
        <button class="btn-primary" id="modalBtn">NEXT LEVEL</button>
      </div>
    </div>
  `;

  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });

  document.getElementById('btnShuffle').addEventListener('click', handleShuffleQueue);
  document.getElementById('btnVIP').addEventListener('click', handleVIPClear);
  document.getElementById('btnRestart').addEventListener('click', () => startLevel(currentLevel));
  document.getElementById('modalBtn').addEventListener('click', handleModalBtnClick);

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  cellSize = Math.floor(Math.min(canvas.width / (gridSize + 0.5), canvas.height / (gridSize + 0.5)));
  gridOffsetX = Math.floor((canvas.width - cellSize * gridSize) / 2);
  gridOffsetY = Math.floor((canvas.height - cellSize * gridSize) / 2);

  gridBuses.forEach(bus => {
    if (bus.state === 'GRID') {
      bus.x = gridOffsetX + bus.c * cellSize;
      bus.y = gridOffsetY + bus.r * cellSize;
    }
  });
}

function startLevel(lvl) {
  currentLevel = lvl;
  document.getElementById('levelDisplay').textContent = `LEVEL ${currentLevel}`;
  document.getElementById('gameModal').classList.remove('active');

  const levelData = generateLevel(currentLevel);
  gridBuses = levelData.buses;
  passengers = levelData.passengers;
  boardingLane = [];

  resizeCanvas();
  renderUI();

  if (!animationFrameId) {
    gameLoop();
  }
}

function canBusExitGrid(bus) {
  if (bus.dir === 'UP') {
    for (let r = bus.r - 1; r >= 0; r--) if (isCellOccupied(r, bus.c, bus.id)) return false;
  } else if (bus.dir === 'DOWN') {
    for (let r = bus.r + bus.length; r < gridSize; r++) if (isCellOccupied(r, bus.c, bus.id)) return false;
  } else if (bus.dir === 'LEFT') {
    for (let c = bus.c - 1; c >= 0; c--) if (isCellOccupied(bus.r, c, bus.id)) return false;
  } else if (bus.dir === 'RIGHT') {
    for (let c = bus.c + bus.length; c < gridSize; c++) if (isCellOccupied(bus.r, c, bus.id)) return false;
  }
  return true;
}

function isCellOccupied(r, c, ignoreBusId) {
  for (const b of gridBuses) {
    if (b.id === ignoreBusId || b.state !== 'GRID') continue;
    const isVert = b.dir === 'UP' || b.dir === 'DOWN';
    for (let l = 0; l < b.length; l++) {
      const br = isVert ? b.r + l : b.r;
      const bc = isVert ? b.c : b.c + l;
      if (br === r && bc === c) return true;
    }
  }
  return false;
}

function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  processInputAt(e.clientX - rect.left, e.clientY - rect.top);
}

function handleCanvasTouch(e) {
  e.preventDefault();
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    processInputAt(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
  }
}

function processInputAt(x, y) {
  const activeSlots = getTotalActiveSlots();
  if (boardingLane.length >= activeSlots) return;

  for (const bus of gridBuses) {
    if (bus.state !== 'GRID') continue;

    const isVert = bus.dir === 'UP' || bus.dir === 'DOWN';
    const width = (isVert ? 1 : bus.length) * cellSize;
    const height = (isVert ? bus.length : 1) * cellSize;

    if (x >= bus.x && x <= bus.x + width && y >= bus.y && y <= bus.y + height) {
      if (canBusExitGrid(bus)) {
        moveBusToStation(bus);
      } else {
        shakeBus(bus);
      }
      break;
    }
  }
}

function moveBusToStation(bus) {
  bus.state = 'MOVING_TO_STATION';
  boardingLane.push(bus);
  renderUI();
  processBoarding();
}

function shakeBus(bus) {
  const origX = bus.x;
  const origY = bus.y;
  let frame = 0;

  const shakeInterval = setInterval(() => {
    frame++;
    const offset = (frame % 2 === 0 ? 1 : -1) * 4;
    if (bus.dir === 'LEFT' || bus.dir === 'RIGHT') {
      bus.x = origX + offset;
    } else {
      bus.y = origY + offset;
    }
    if (frame > 6) {
      clearInterval(shakeInterval);
      bus.x = origX;
      bus.y = origY;
    }
  }, 30);
}

function processBoarding() {
  if (passengers.length === 0 && boardingLane.length === 0 && gridBuses.every(b => b.state === 'EXITING')) {
    triggerWin();
    return;
  }

  while (passengers.length > 0) {
    const frontPassengerColor = passengers[0];
    const targetBus = boardingLane.find(b => b.color === frontPassengerColor && b.passengersCount < b.maxCapacity);

    if (targetBus) {
      passengers.shift();
      targetBus.passengersCount++;
      score += 10;
      
      if (targetBus.passengersCount >= targetBus.maxCapacity) {
        targetBus.state = 'EXITING';
        boardingLane = boardingLane.filter(b => b.id !== targetBus.id);
        score += 50;
        coins += 5;
      }
    } else {
      break;
    }
  }

  renderUI();

  const activeSlots = getTotalActiveSlots();
  if (boardingLane.length >= activeSlots && passengers.length > 0) {
    const canBoardNext = boardingLane.some(b => b.color === passengers[0] && b.passengersCount < b.maxCapacity);
    if (!canBoardNext) {
      setTimeout(triggerGameOver, 600);
    }
  }

  if (gridBuses.every(b => b.state === 'EXITING') && passengers.length === 0) {
    setTimeout(triggerWin, 600);
  }
}

function handleShuffleQueue() {
  if (coins < 20 || passengers.length <= 1) return;
  coins -= 20;
  for (let i = passengers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passengers[i], passengers[j]] = [passengers[j], passengers[i]];
  }
  renderUI();
  processBoarding();
}

function handleVIPClear() {
  if (coins < 30 || boardingLane.length === 0) return;
  coins -= 30;
  const targetBus = boardingLane[0];
  targetBus.passengersCount = targetBus.maxCapacity;
  targetBus.state = 'EXITING';
  boardingLane.shift();
  renderUI();
  processBoarding();
}

function watchAdToUnlockSlot() {
  if (adBonusSlots >= 2) return;

  const modal = document.getElementById('gameModal');
  document.getElementById('modalTitle').textContent = 'WATCHING AD... 📺';
  document.getElementById('modalSubtitle').textContent = 'Unlocking +1 Extra Bus Boarding Slot!';
  document.getElementById('modalBtn').style.display = 'none';
  modal.classList.add('active');

  setTimeout(() => {
    adBonusSlots++;
    document.getElementById('modalTitle').textContent = 'EXTRA SLOT UNLOCKED! 🎉';
    document.getElementById('modalSubtitle').textContent = `Total active slots: ${getTotalActiveSlots()}`;
    document.getElementById('modalBtn').style.display = 'inline-block';
    document.getElementById('modalBtn').textContent = 'CONTINUE GAME';
    renderUI();
  }, 1500);
}

function triggerWin() {
  confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  const modal = document.getElementById('gameModal');
  document.getElementById('modalTitle').textContent = 'LEVEL CLEARED! 🎉';
  document.getElementById('modalSubtitle').textContent = `Level ${currentLevel} cleared! Level Up reward: +1 Bus Slot unlocked!`;
  document.getElementById('modalBtn').textContent = 'NEXT LEVEL';
  coins += 20;
  modal.classList.add('active');
}

function triggerGameOver() {
  const modal = document.getElementById('gameModal');
  document.getElementById('modalTitle').textContent = 'TRAFFIC JAMMED! 🚗';
  document.getElementById('modalSubtitle').textContent = 'Boarding docks full! Watch an ad to unlock an extra slot or try again.';
  document.getElementById('modalBtn').textContent = 'TRY AGAIN';
  modal.classList.add('active');
}

function handleModalBtnClick() {
  const modalBtn = document.getElementById('modalBtn');
  if (modalBtn.textContent === 'NEXT LEVEL') {
    startLevel(currentLevel + 1);
  } else {
    startLevel(currentLevel);
  }
}

function renderUI() {
  document.getElementById('scoreDisplay').textContent = score;
  document.getElementById('coinsDisplay').textContent = coins;
  document.getElementById('queueCount').textContent = `${passengers.length} Passengers`;

  const totalSlots = getTotalActiveSlots();
  document.getElementById('dockCapacityLabel').textContent = `${totalSlots} Active Docks`;

  // Render Queue
  const lane = document.getElementById('passengerLane');
  lane.innerHTML = '';
  passengers.slice(0, 15).forEach((color, idx) => {
    const avatar = document.createElement('div');
    avatar.className = `passenger-avatar ${idx === 0 ? 'first-in-line' : ''}`;
    avatar.style.backgroundColor = COLORS[color];
    avatar.textContent = '👤';
    lane.appendChild(avatar);
  });

  // Render Docks
  const slotsContainer = document.getElementById('stationSlots');
  const visibleMax = Math.min(totalSlots + (adBonusSlots < 2 ? 1 : 0), 6);
  slotsContainer.style.gridTemplateColumns = `repeat(${visibleMax}, 1fr)`;
  slotsContainer.innerHTML = '';

  for (let i = 0; i < visibleMax; i++) {
    const slot = document.createElement('div');
    slot.className = 'bus-slot';

    if (i < totalSlots) {
      const bus = boardingLane[i];
      if (bus) {
        slot.classList.add('occupied');
        slot.innerHTML = `
          <div class="slot-bus-card" style="background:${COLORS[bus.color]};">
            <div class="slot-bus-header">
              <span>BUS ${bus.id}</span>
              <span>${bus.passengersCount}/${bus.maxCapacity}</span>
            </div>
            <div class="slot-bus-passengers">
              <div class="slot-passenger-dot ${bus.passengersCount >= 1 ? 'filled' : ''}"></div>
              <div class="slot-passenger-dot ${bus.passengersCount >= 2 ? 'filled' : ''}"></div>
              <div class="slot-passenger-dot ${bus.passengersCount >= 3 ? 'filled' : ''}"></div>
            </div>
          </div>
        `;
      }
    } else {
      // Extra ad slot lock
      slot.classList.add('locked');
      slot.innerHTML = `
        <div class="unlock-slot-btn">
          <span class="ad-badge">📺 AD</span>
          <span>+1 SLOT</span>
        </div>
      `;
      slot.addEventListener('click', watchAdToUnlockSlot);
    }
    slotsContainer.appendChild(slot);
  }
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let r = 0; r <= gridSize; r++) {
    ctx.beginPath();
    ctx.moveTo(gridOffsetX, gridOffsetY + r * cellSize);
    ctx.lineTo(gridOffsetX + gridSize * cellSize, gridOffsetY + r * cellSize);
    ctx.stroke();
  }
  for (let c = 0; c <= gridSize; c++) {
    ctx.beginPath();
    ctx.moveTo(gridOffsetX + c * cellSize, gridOffsetY);
    ctx.lineTo(gridOffsetX + c * cellSize, gridOffsetY + gridSize * cellSize);
    ctx.stroke();
  }

  gridBuses.forEach(bus => {
    if (bus.state === 'GRID') {
      const isVert = bus.dir === 'UP' || bus.dir === 'DOWN';
      const w = (isVert ? 1 : bus.length) * cellSize - 6;
      const h = (isVert ? bus.length : 1) * cellSize - 6;

      ctx.save();
      ctx.translate(bus.x + 3, bus.y + 3);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(4, 4, w, h, 12);
      ctx.fill();

      ctx.fillStyle = COLORS[bus.color];
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 16px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const arrow = bus.dir === 'UP' ? '▲' : bus.dir === 'DOWN' ? '▼' : bus.dir === 'LEFT' ? '◄' : '►';
      ctx.fillText(arrow, w / 2, h / 2);

      ctx.restore();
    }
  });

  animationFrameId = requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', () => {
  initUI();
  startLevel(1);
});


