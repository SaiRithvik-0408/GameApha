import './style.css';
import confetti from 'canvas-confetti';
import gsap from 'gsap';
import * as THREE from 'three';
import { sounds } from './audio.js';
import { createBus3D, BUS_COLORS } from './busBuilder.js';
import { createPassenger3D } from './passengerBuilder.js';
import { GameScene } from './threeScene.js';
import {
  generateSolvableLevel,
  canBusExitGrid,
  gridToWorld,
  GRID_SIZE,
  CELL_SIZE
} from './gameLogic.js';

// Game State
let currentLevel = 1;
let score = 0;
let coins = 100;
let adBonusSlots = 0; // max 2 extra slots

let boardingLane = []; // active buses docked at station
let passengers = []; // remaining passenger queue colors
let gridBuses = []; // array of bus objects

let sceneManager;
let bus3DMap = new Map(); // busId -> 3D Group
let passenger3DQueue = []; // array of 3D passenger meshes in queue line

function getBaseSlotsForLevel(lvl) {
  return Math.min(3 + Math.floor((lvl - 1) / 3), 4);
}

function getTotalActiveSlots() {
  return getBaseSlotsForLevel(currentLevel) + adBonusSlots;
}

// Map Dock Slot index (0..5) to 3D World X, Z positions on Station Platform
function getDockWorldPos(slotIndex, totalSlots) {
  const totalWidth = 10;
  const startX = -totalWidth / 2 + totalWidth / (totalSlots * 2);
  const xStep = totalWidth / totalSlots;
  return {
    x: startX + slotIndex * xStep,
    y: 0.15,
    z: -6
  };
}

function initUI() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="game-header">
      <div class="level-badge" id="levelDisplay">LEVEL 1</div>
      <div class="stats-group">
        <div class="stat-pill score-pill">⚡ <span id="scoreDisplay">0</span></div>
        <div class="stat-pill coin-pill">🪙 <span id="coinsDisplay">100</span></div>
      </div>
    </header>

    <main class="game-viewport" id="viewportContainer">
      <!-- 3D Canvas Canvas container -->
    </main>

    <!-- Overlay UI for Docks & Passengers -->
    <div class="ui-overlay">
      <section class="queue-container">
        <div class="queue-header">
          <span>👥 Boarding Queue</span>
          <span class="badge" id="queueCount">0 Passengers</span>
        </div>
        <div class="passenger-lane" id="passengerLane"></div>
      </section>

      <section class="boarding-station-ui">
        <div class="queue-header">
          <span>🚌 Active Boarding Docks</span>
          <span class="badge" id="dockCapacityLabel">3 Active Slots</span>
        </div>
        <div class="station-slots" id="stationSlots"></div>
      </section>
    </div>

    <footer class="booster-bar">
      <button class="booster-btn" id="btnShuffle">
        <span class="icon">🔄</span>
        <span>Shuffle</span>
        <span class="cost">🪙20</span>
      </button>
      <button class="booster-btn" id="btnVIP">
        <span class="icon">⭐</span>
        <span>VIP Clear</span>
        <span class="cost">🪙30</span>
      </button>
      <button class="booster-btn" id="btnRestart">
        <span class="icon">🔁</span>
        <span>Restart</span>
      </button>
    </footer>

    <div class="modal-overlay" id="gameModal">
      <div class="modal-card">
        <div class="modal-icon" id="modalIcon">🎉</div>
        <h2 class="modal-title" id="modalTitle">LEVEL CLEARED!</h2>
        <p class="modal-sub" id="modalSubtitle">Great job sorting traffic!</p>
        <button class="btn-primary" id="modalBtn">NEXT LEVEL</button>
      </div>
    </div>
  `;

  const container = document.getElementById('viewportContainer');
  sceneManager = new GameScene(container);

  // Touch & Click listeners on 3D viewport
  container.addEventListener('pointerdown', handlePointerDown);

  document.getElementById('btnShuffle').addEventListener('click', handleShuffleQueue);
  document.getElementById('btnVIP').addEventListener('click', handleVIPClear);
  document.getElementById('btnRestart').addEventListener('click', () => startLevel(currentLevel));
  document.getElementById('modalBtn').addEventListener('click', handleModalBtnClick);

  startLevel(1);
  animate();
}

function startLevel(lvl) {
  currentLevel = lvl;
  document.getElementById('levelDisplay').textContent = `LEVEL ${currentLevel}`;
  document.getElementById('gameModal').classList.remove('active');

  // Clear existing 3D objects
  bus3DMap.forEach(group => sceneManager.scene.remove(group));
  bus3DMap.clear();

  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];

  boardingLane = [];

  // Generate new solvable level layout
  const levelData = generateSolvableLevel(currentLevel);
  gridBuses = levelData.buses;
  passengers = levelData.passengers;

  // Build 3D Bus Meshes
  gridBuses.forEach(bus => {
    const isVert = bus.dir === 'UP' || bus.dir === 'DOWN';
    const busMesh = createBus3D(bus.color, bus.dir, bus.length);
    const worldPos = gridToWorld(bus.r, bus.c, bus.length, isVert);

    busMesh.position.set(worldPos.x, worldPos.y, worldPos.z);
    sceneManager.scene.add(busMesh);
    bus3DMap.set(bus.id, busMesh);
  });

  // Build 3D Passengers Queue
  update3DPassengerQueue();
  renderUI();
}

function update3DPassengerQueue() {
  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];

  const visibleQueue = passengers.slice(0, 10);
  visibleQueue.forEach((color, idx) => {
    const pMesh = createPassenger3D(color);
    const x = -5 + idx * 0.7;
    const z = -4.5;
    pMesh.position.set(x, 0.3, z);
    pMesh.rotation.y = Math.PI / 2;
    sceneManager.scene.add(pMesh);
    passenger3DQueue.push(pMesh);
  });
}

function handlePointerDown(event) {
  sounds.init();
  const rect = sceneManager.renderer.domElement.getBoundingClientRect();
  sceneManager.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sceneManager.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  sceneManager.raycaster.setFromCamera(sceneManager.mouse, sceneManager.camera);

  const clickableObjects = [];
  bus3DMap.forEach((group, id) => {
    const bus = gridBuses.find(b => b.id === id);
    if (bus && bus.state === 'GRID') {
      clickableObjects.push(...group.children);
    }
  });

  const intersects = sceneManager.raycaster.intersectObjects(clickableObjects, true);

  if (intersects.length > 0) {
    let topGroup = intersects[0].object;
    while (topGroup.parent && topGroup.parent.type !== 'Scene' && !topGroup.userData.colorKey) {
      topGroup = topGroup.parent;
    }

    // Find corresponding bus state
    for (const [id, group] of bus3DMap.entries()) {
      if (group === topGroup) {
        const bus = gridBuses.find(b => b.id === id);
        if (bus && bus.state === 'GRID') {
          onBusClicked(bus);
        }
        break;
      }
    }
  }
}

function onBusClicked(bus) {
  const activeSlots = getTotalActiveSlots();

  if (boardingLane.length >= activeSlots) {
    sounds.playError();
    shakeBus3D(bus.id);
    return;
  }

  if (canBusExitGrid(bus, gridBuses)) {
    sounds.playEngineRev();
    if (navigator.vibrate) navigator.vibrate(40);
    moveBusToStation3D(bus);
  } else {
    sounds.playError();
    if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
    shakeBus3D(bus.id);
  }
}

function shakeBus3D(busId) {
  const mesh = bus3DMap.get(busId);
  if (!mesh) return;

  const origX = mesh.position.x;
  const origZ = mesh.position.z;

  gsap.to(mesh.position, {
    x: origX + 0.15,
    duration: 0.05,
    yoyo: true,
    repeat: 5,
    onComplete: () => {
      mesh.position.x = origX;
      mesh.position.z = origZ;
    }
  });
}

function moveBusToStation3D(bus) {
  bus.state = 'MOVING_TO_STATION';
  boardingLane.push(bus);

  const busMesh = bus3DMap.get(bus.id);
  const targetSlotIndex = boardingLane.length - 1;
  const totalSlots = getTotalActiveSlots();
  const dockPos = getDockWorldPos(targetSlotIndex, totalSlots);

  // Animate Bus driving out of grid to docking platform
  const isVert = bus.dir === 'UP' || bus.dir === 'DOWN';
  let exitTargetX = busMesh.position.x;
  let exitTargetZ = busMesh.position.z;

  if (bus.dir === 'UP') exitTargetZ = -5;
  else if (bus.dir === 'DOWN') exitTargetZ = 7;
  else if (bus.dir === 'LEFT') exitTargetX = -8;
  else if (bus.dir === 'RIGHT') exitTargetX = 8;

  const timeline = gsap.timeline();

  // Step 1: Drive forward off grid
  timeline.to(busMesh.position, {
    x: exitTargetX,
    z: exitTargetZ,
    duration: 0.4,
    ease: 'power2.in'
  });

  // Step 2: Rotate and steer into station dock slot
  timeline.to(busMesh.rotation, {
    y: Math.PI, // Face station dock
    duration: 0.2
  });

  // Step 3: Park smoothly into station dock slot
  timeline.to(busMesh.position, {
    x: dockPos.x,
    y: dockPos.y,
    z: dockPos.z,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => {
      bus.state = 'STATION';
      renderUI();
      processBoarding();
    }
  });

  renderUI();
}

function processBoarding() {
  if (passengers.length === 0 && boardingLane.length === 0 && gridBuses.every(b => b.state === 'EXITING')) {
    triggerWin();
    return;
  }

  // Boarding loop
  let boardedAny = false;

  while (passengers.length > 0) {
    const frontColor = passengers[0];
    const targetBus = boardingLane.find(b => b.color === frontColor && b.passengersCount < b.maxCapacity && b.state === 'STATION');

    if (targetBus) {
      passengers.shift();
      targetBus.passengersCount++;
      score += 10;
      boardedAny = true;

      sounds.playPassengerBoard();

      // Update 3D Bus capacity visual
      const busMesh = bus3DMap.get(targetBus.id);
      if (busMesh && busMesh.userData.updateCapacity) {
        busMesh.userData.updateCapacity(targetBus.passengersCount);
      }

      // Check if bus is full
      if (targetBus.passengersCount >= targetBus.maxCapacity) {
        targetBus.state = 'EXITING';
        sounds.playBusFull();
        score += 50;
        coins += 5;

        // Animate full bus exit driving off into city road
        setTimeout(() => animateBusExit3D(targetBus), 200);
      }
    } else {
      break;
    }
  }

  update3DPassengerQueue();
  renderUI();

  // Game over check
  const activeSlots = getTotalActiveSlots();
  if (boardingLane.length >= activeSlots && passengers.length > 0) {
    const canBoardNext = boardingLane.some(b => b.color === passengers[0] && b.passengersCount < b.maxCapacity);
    if (!canBoardNext) {
      setTimeout(triggerGameOver, 700);
    }
  }

  if (gridBuses.every(b => b.state === 'EXITING') && passengers.length === 0) {
    setTimeout(triggerWin, 800);
  }
}

function animateBusExit3D(bus) {
  const busMesh = bus3DMap.get(bus.id);
  if (!busMesh) return;

  boardingLane = boardingLane.filter(b => b.id !== bus.id);

  gsap.to(busMesh.position, {
    x: busMesh.position.x + (Math.random() > 0.5 ? 18 : -18),
    z: busMesh.position.z - 5,
    duration: 0.7,
    ease: 'power3.in',
    onComplete: () => {
      sceneManager.scene.remove(busMesh);
      bus3DMap.delete(bus.id);
      realignDockedBuses3D();
      renderUI();
      processBoarding();
    }
  });
}

function realignDockedBuses3D() {
  const totalSlots = getTotalActiveSlots();
  boardingLane.forEach((bus, idx) => {
    const busMesh = bus3DMap.get(bus.id);
    if (busMesh) {
      const dockPos = getDockWorldPos(idx, totalSlots);
      gsap.to(busMesh.position, {
        x: dockPos.x,
        y: dockPos.y,
        z: dockPos.z,
        duration: 0.3
      });
    }
  });
}

function handleShuffleQueue() {
  sounds.init();
  if (coins < 20 || passengers.length <= 1) return;
  coins -= 20;
  sounds.playBooster();

  for (let i = passengers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passengers[i], passengers[j]] = [passengers[j], passengers[i]];
  }

  update3DPassengerQueue();
  renderUI();
  processBoarding();
}

function handleVIPClear() {
  sounds.init();
  if (coins < 30 || boardingLane.length === 0) return;
  coins -= 30;
  sounds.playBooster();

  const targetBus = boardingLane[0];
  targetBus.passengersCount = targetBus.maxCapacity;
  targetBus.state = 'EXITING';

  const busMesh = bus3DMap.get(targetBus.id);
  if (busMesh && busMesh.userData.updateCapacity) {
    busMesh.userData.updateCapacity(3);
  }

  setTimeout(() => animateBusExit3D(targetBus), 200);
}

function watchAdToUnlockSlot() {
  sounds.init();
  if (adBonusSlots >= 2) return;

  const modal = document.getElementById('gameModal');
  document.getElementById('modalIcon').textContent = '📺';
  document.getElementById('modalTitle').textContent = 'UNLOCKING SLOT...';
  document.getElementById('modalSubtitle').textContent = 'Watching Ad to get +1 Extra Boarding Dock!';
  document.getElementById('modalBtn').style.display = 'none';
  modal.classList.add('active');

  setTimeout(() => {
    adBonusSlots++;
    sounds.playWin();
    document.getElementById('modalIcon').textContent = '🎉';
    document.getElementById('modalTitle').textContent = 'SLOT UNLOCKED!';
    document.getElementById('modalSubtitle').textContent = `Now you have ${getTotalActiveSlots()} active boarding docks!`;
    document.getElementById('modalBtn').style.display = 'inline-block';
    document.getElementById('modalBtn').textContent = 'CONTINUE PLAYING';
    realignDockedBuses3D();
    renderUI();
  }, 1400);
}

function triggerWin() {
  sounds.playWin();
  confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

  const modal = document.getElementById('gameModal');
  document.getElementById('modalIcon').textContent = '🏆';
  document.getElementById('modalTitle').textContent = 'LEVEL CLEARED!';
  document.getElementById('modalSubtitle').textContent = `Level ${currentLevel} Complete! Bonus +20 Coins awarded!`;
  document.getElementById('modalBtn').textContent = 'NEXT LEVEL';
  coins += 20;
  modal.classList.add('active');
}

function triggerGameOver() {
  sounds.playError();
  const modal = document.getElementById('gameModal');
  document.getElementById('modalIcon').textContent = '🚗';
  document.getElementById('modalTitle').textContent = 'TRAFFIC JAMMED!';
  document.getElementById('modalSubtitle').textContent = 'All docks are full and no matching passengers can board!';
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

  // Render Queue UI Avatars
  const lane = document.getElementById('passengerLane');
  lane.innerHTML = '';
  passengers.slice(0, 12).forEach((color, idx) => {
    const avatar = document.createElement('div');
    avatar.className = `passenger-avatar ${idx === 0 ? 'first-in-line' : ''}`;
    avatar.style.backgroundColor = BUS_COLORS[color] ? '#' + BUS_COLORS[color].toString(16).padStart(6, '0') : '#3b82f6';
    avatar.textContent = '👤';
    lane.appendChild(avatar);
  });

  // Render Station Slots
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
        const hexStr = '#' + BUS_COLORS[bus.color].toString(16).padStart(6, '0');
        slot.innerHTML = `
          <div class="slot-bus-card" style="background:${hexStr};">
            <div class="slot-bus-header">
              <span>BUS #${bus.id}</span>
              <span>${bus.passengersCount}/3</span>
            </div>
            <div class="slot-bus-passengers">
              <div class="slot-passenger-dot ${bus.passengersCount >= 1 ? 'filled' : ''}"></div>
              <div class="slot-passenger-dot ${bus.passengersCount >= 2 ? 'filled' : ''}"></div>
              <div class="slot-passenger-dot ${bus.passengersCount >= 3 ? 'filled' : ''}"></div>
            </div>
          </div>
        `;
      } else {
        slot.innerHTML = `<span class="slot-empty-label">EMPTY DOCK</span>`;
      }
    } else {
      slot.classList.add('locked');
      slot.innerHTML = `
        <div class="unlock-slot-btn">
          <span class="ad-badge">📺 AD</span>
          <span>+1 DOCK</span>
        </div>
      `;
      slot.addEventListener('click', watchAdToUnlockSlot);
    }
    slotsContainer.appendChild(slot);
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Micro-animations for 3D objects
  const time = clock.getElapsedTime();

  // Floating Roof Arrows on Buses
  bus3DMap.forEach((group) => {
    if (group.userData && group.userData.arrowGroup) {
      group.userData.arrowGroup.position.y = 1.3 + Math.sin(time * 4) * 0.08;
      group.userData.arrowGroup.rotation.z = time * 2;
    }
  });

  // Bobbing 3D Passengers
  passenger3DQueue.forEach((pMesh, idx) => {
    pMesh.position.y = 0.3 + Math.abs(Math.sin(time * 3 + idx * 0.5)) * 0.08;
  });

  sceneManager.render();
}

const clock = new THREE.Clock();

window.addEventListener('DOMContentLoaded', () => {
  initUI();
});
