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
  getBaseSlotsForLevel,
  GRID_SIZE,
  CELL_SIZE
} from './gameLogic.js';

// ─── Game State ───
let currentLevel = 1;
let score = 0;
let coins = 150;
let adBonusSlots = 0;

let boardingLane = [];    // buses docked at station
let activeLine = [];      // front line of up to 10 passengers (visible)
let waitingLine = [];     // back line of remaining passengers (hidden)
let gridBuses = [];       // bus state objects

let sceneManager;
let bus3DMap = new Map();
let passenger3DQueue = [];      // 3D meshes for active line
let waitingLine3DQueue = [];    // 3D meshes for waiting line (clickable)
let isBoardingInProgress = false;

// Pick from waiting line charges
let freePicks = 3;     // 3 free picks per level
let videoPicks = 0;    // 2 unlockable via watching a video ad
let coinPicks = 0;     // 1 unlockable via spending coins
const VIDEO_PICKS_MAX = 2;
const COIN_PICKS_MAX = 1;
const COIN_PICK_COST = 25;

function getTotalPicks() {
  return freePicks + videoPicks + coinPicks;
}

function getTotalActiveSlots() {
  return getBaseSlotsForLevel(currentLevel) + adBonusSlots;
}

function getDockWorldPos(slotIndex, totalSlots) {
  const startX = -4.8;
  const stepX = 1.6;
  return { x: startX + slotIndex * stepX, y: 0.15, z: -4.2 };
}

function initUI() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="game-header">
      <button class="icon-btn-round" id="btnTopRestart" title="Restart Level">🔄</button>
      <div class="level-pill" id="levelDisplay">Level 1</div>
      <div class="stats-group">
        <div class="stat-pill coin-pill">🪙 <span id="coinsDisplay">150</span></div>
      </div>
    </header>

    <main class="game-viewport" id="viewportContainer"></main>

    <div class="ui-overlay">
      <div class="dock-badge-bar" id="dockCapacityLabel">4 Active Docks</div>
    </div>

    <!-- Pick from Waiting Line Panel -->
    <div class="pick-panel" id="pickPanel">
      <div class="pick-info">
        <span class="pick-label">✋ Pick:</span>
        <span class="pick-count" id="pickCount">3</span>
      </div>
      <button class="pick-btn video-btn" id="btnVideoPick">🎬 +2 Free</button>
      <button class="pick-btn coin-btn" id="btnCoinPick">🪙 +1 (25)</button>
    </div>

    <footer class="booster-bar">
      <button class="booster-card" id="btnVIP">
        <div class="booster-icon-wrap">🚗</div>
        <div class="booster-label">VIP Clear</div>
        <div class="booster-cost">🪙30</div>
      </button>
      <button class="booster-card" id="btnShuffle">
        <div class="booster-icon-wrap">🔄</div>
        <div class="booster-label">Arrange</div>
        <div class="booster-cost">🪙20</div>
      </button>
      <button class="booster-card" id="btnAutoClear">
        <div class="booster-icon-wrap">🎨</div>
        <div class="booster-label">Jumbo</div>
        <div class="booster-cost">🪙40</div>
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
  container.addEventListener('pointerdown', handlePointerDown);

  document.getElementById('btnTopRestart').addEventListener('click', () => startLevel(currentLevel));
  document.getElementById('btnShuffle').addEventListener('click', handleShuffleQueue);
  document.getElementById('btnVIP').addEventListener('click', handleVIPClear);
  document.getElementById('btnAutoClear').addEventListener('click', handleAutoClear);
  document.getElementById('modalBtn').addEventListener('click', handleModalBtnClick);
  document.getElementById('btnVideoPick').addEventListener('click', handleVideoPickUnlock);
  document.getElementById('btnCoinPick').addEventListener('click', handleCoinPickUnlock);

  startLevel(1);
  animate();
}

// ─── Level Setup ───
function startLevel(lvl) {
  currentLevel = lvl;
  document.getElementById('levelDisplay').textContent = `Level ${currentLevel}`;
  document.getElementById('gameModal').classList.remove('active');

  bus3DMap.forEach(group => sceneManager.scene.remove(group));
  bus3DMap.clear();
  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];
  boardingLane = [];
  isBoardingInProgress = false;

  // Reset pick charges each level
  freePicks = 3;
  videoPicks = 0;
  coinPicks = 0;

  const levelData = generateSolvableLevel(currentLevel);
  gridBuses = levelData.buses;

  // Split passengers into active line (first 10) and waiting line (rest)
  const allPassengers = levelData.passengers;
  activeLine = allPassengers.slice(0, 10);
  waitingLine = allPassengers.slice(10);

  // Build 3D Bus Meshes
  gridBuses.forEach(bus => {
    const isVert = bus.dir === 'UP' || bus.dir === 'DOWN';
    const busMesh = createBus3D(bus.color, bus.dir, bus.length, bus.maxCapacity);
    const worldPos = gridToWorld(bus.r, bus.c, bus.length, isVert);
    busMesh.position.set(worldPos.x, worldPos.y, worldPos.z);
    sceneManager.scene.add(busMesh);
    bus3DMap.set(bus.id, busMesh);
  });

  update3DPassengerQueue();
  renderUI();
}

// ─── Passenger Queue Rendering (Two-Line System) ───
function refillActiveLine() {
  // Move passengers from waiting line to active line until active has 10
  while (activeLine.length < 10 && waitingLine.length > 0) {
    activeLine.push(waitingLine.shift());
  }
}

function getTotalPassengers() {
  return activeLine.length + waitingLine.length;
}

function update3DPassengerQueue() {
  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];
  waitingLine3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  waitingLine3DQueue = [];

  refillActiveLine();

  // ── Row 1: Active Line (front arc, full size, eligible to board) ──
  const activeCount = activeLine.length;
  activeLine.forEach((color, idx) => {
    const pMesh = createPassenger3D(color);

    const t = activeCount > 1 ? idx / (activeCount - 1) : 0;
    const angle = Math.PI * 0.15 + t * Math.PI * 0.7;
    const radiusX = 5.8;
    const radiusZ = 3.2;
    const x = Math.cos(angle) * radiusX;
    const z = -9.8 + Math.sin(angle) * radiusZ;

    pMesh.position.set(x, 0.3, z);
    pMesh.rotation.y = angle + Math.PI / 2;

    sceneManager.scene.add(pMesh);
    passenger3DQueue.push(pMesh);
  });

  // ── Row 2: Waiting Line (back arc, smaller, clickable for pick) ──
  const waitCount = Math.min(waitingLine.length, 15);
  for (let idx = 0; idx < waitCount; idx++) {
    const color = waitingLine[idx];
    const pMesh = createPassenger3D(color);

    const t = waitCount > 1 ? idx / (waitCount - 1) : 0;
    const angle = Math.PI * 0.1 + t * Math.PI * 0.8;
    const radiusX = 7.2;
    const radiusZ = 3.8;
    const x = Math.cos(angle) * radiusX;
    const z = -12.5 + Math.sin(angle) * radiusZ;

    pMesh.position.set(x, 0.3, z);
    pMesh.rotation.y = angle + Math.PI / 2;
    pMesh.scale.setScalar(0.75);
    pMesh.userData.waitingIndex = idx; // tag for raycasting

    sceneManager.scene.add(pMesh);
    waitingLine3DQueue.push(pMesh);
  }
}

// ─── Raycasting & Bus Click + Waiting Line Pick ───
function handlePointerDown(event) {
  sounds.init();
  const rect = sceneManager.renderer.domElement.getBoundingClientRect();
  sceneManager.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sceneManager.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  sceneManager.raycaster.setFromCamera(sceneManager.mouse, sceneManager.camera);

  // 1. Check if a waiting line passenger was clicked
  if (waitingLine3DQueue.length > 0 && getTotalPicks() > 0) {
    const waitingChildren = [];
    waitingLine3DQueue.forEach(group => {
      waitingChildren.push(...group.children);
    });
    const waitHits = sceneManager.raycaster.intersectObjects(waitingChildren, true);
    if (waitHits.length > 0) {
      // Walk up to find the group with waitingIndex
      let hit = waitHits[0].object;
      while (hit && hit.userData.waitingIndex === undefined) {
        hit = hit.parent;
      }
      if (hit && hit.userData.waitingIndex !== undefined) {
        pickFromWaitingLine(hit.userData.waitingIndex);
        return;
      }
    }
  }

  // 2. Check if a bus was clicked
  const clickableObjects = [];
  bus3DMap.forEach((group, id) => {
    const bus = gridBuses.find(b => b.id === id);
    if (bus && bus.state === 'GRID') {
      clickableObjects.push(...group.children);
    }
  });

  const intersects = sceneManager.raycaster.intersectObjects(clickableObjects, true);

  if (intersects.length > 0) {
    let clickedObj = intersects[0].object;
    let busGroup = null;
    let busId = null;

    while (clickedObj) {
      for (const [id, group] of bus3DMap.entries()) {
        if (group === clickedObj) {
          busGroup = group;
          busId = id;
          break;
        }
      }
      if (busGroup) break;
      clickedObj = clickedObj.parent;
    }

    if (busId !== null) {
      const bus = gridBuses.find(b => b.id === busId);
      if (bus && bus.state === 'GRID') {
        onBusClicked(bus);
      }
    }
  }
}

// ─── Pick from Waiting Line ───
function pickFromWaitingLine(waitIdx) {
  if (waitIdx < 0 || waitIdx >= waitingLine.length) return;
  if (getTotalPicks() <= 0) return;

  // Use a pick charge (free first, then video, then coin)
  if (freePicks > 0) {
    freePicks--;
  } else if (videoPicks > 0) {
    videoPicks--;
  } else if (coinPicks > 0) {
    coinPicks--;
  }

  // Move the picked passenger from waiting line to front of active line
  const pickedColor = waitingLine.splice(waitIdx, 1)[0];
  activeLine.unshift(pickedColor);

  sounds.playPassengerBoard();
  if (navigator.vibrate) navigator.vibrate(30);

  update3DPassengerQueue();
  renderUI();
  triggerBoarding();
}

function handleVideoPickUnlock() {
  sounds.init();
  if (videoPicks >= VIDEO_PICKS_MAX) return;
  // Simulate watching a video ad (instant unlock)
  videoPicks = VIDEO_PICKS_MAX;
  sounds.playBooster();
  renderUI();
}

function handleCoinPickUnlock() {
  sounds.init();
  if (coinPicks >= COIN_PICKS_MAX || coins < COIN_PICK_COST) return;
  coins -= COIN_PICK_COST;
  coinPicks = COIN_PICKS_MAX;
  sounds.playBooster();
  renderUI();
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
    onComplete: () => { mesh.position.x = origX; mesh.position.z = origZ; }
  });
}

// ─── Bus Dock Animation ───
function moveBusToStation3D(bus) {
  bus.state = 'MOVING_TO_STATION';
  boardingLane.push(bus);

  const busMesh = bus3DMap.get(bus.id);
  const targetSlotIndex = boardingLane.length - 1;
  const totalSlots = getTotalActiveSlots();
  const dockPos = getDockWorldPos(targetSlotIndex, totalSlots);

  let exitTargetX = busMesh.position.x;
  let exitTargetZ = busMesh.position.z;

  if (bus.dir === 'UP') exitTargetZ = -3.8;
  else if (bus.dir === 'DOWN') exitTargetZ = 7.5;
  else if (bus.dir === 'LEFT') exitTargetX = -8.5;
  else if (bus.dir === 'RIGHT') exitTargetX = 8.5;

  const timeline = gsap.timeline();

  // Step 1: Drive FORWARD in arrow direction
  timeline.to(busMesh.position, {
    x: exitTargetX, z: exitTargetZ,
    duration: 0.4, ease: 'power1.in'
  });

  // Step 2: Rotate to face dock
  timeline.to(busMesh.rotation, {
    y: Math.PI, duration: 0.2
  });

  // Step 3: Park into dock slot
  timeline.to(busMesh.position, {
    x: dockPos.x, y: dockPos.y, z: dockPos.z,
    duration: 0.4, ease: 'power2.out',
    onComplete: () => {
      bus.state = 'STATION';
      renderUI();
      triggerBoarding();
    }
  });

  renderUI();
}

// ─── Boarding Logic (ALL matching from first 10 board, not strict FIFO) ───
function triggerBoarding() {
  if (isBoardingInProgress) return;
  isBoardingInProgress = true;
  processBoarding();
}

function processBoarding() {
  // Check win condition
  const remainingBuses = gridBuses.filter(b => b.state !== 'EXITING' && b.state !== 'EXITED');
  if (getTotalPassengers() === 0 && boardingLane.length === 0 && remainingBuses.length === 0) {
    isBoardingInProgress = false;
    setTimeout(triggerWin, 400);
    return;
  }

  if (activeLine.length === 0 && waitingLine.length === 0) {
    isBoardingInProgress = false;
    checkGameOverState();
    return;
  }

  // Find ANY passenger in the active line (first 10) that matches a docked bus
  let matchIndex = -1;
  let matchBus = null;

  for (let i = 0; i < activeLine.length; i++) {
    const color = activeLine[i];
    const bus = boardingLane.find(
      b => b.color === color && b.passengersCount < b.maxCapacity && b.state === 'STATION'
    );
    if (bus) {
      matchIndex = i;
      matchBus = bus;
      break;
    }
  }

  if (matchIndex >= 0 && matchBus) {
    // Remove this passenger from active line (any position, not just front)
    const boardedColor = activeLine.splice(matchIndex, 1)[0];
    matchBus.passengersCount++;
    score += 10;

    sounds.playPassengerBoard();
    animatePassengerBoarding3D(boardedColor, matchBus, matchIndex);

    // Check if bus is full
    if (matchBus.passengersCount >= matchBus.maxCapacity) {
      matchBus.state = 'EXITING';
      sounds.playBusFull();
      score += 50;
      coins += 5;
      setTimeout(() => animateBusExit3D(matchBus), 400);
    }

    // Refill active line from waiting line
    refillActiveLine();
    update3DPassengerQueue();
    renderUI();

    // Continue boarding with delay
    setTimeout(() => processBoarding(), 280);
  } else {
    // No match in active line right now — wait for a new bus to dock
    isBoardingInProgress = false;
    update3DPassengerQueue();
    renderUI();
    checkGameOverState();
  }
}

function checkGameOverState() {
  const activeSlots = getTotalActiveSlots();
  const totalP = getTotalPassengers();
  if (totalP > 0 && boardingLane.length >= activeSlots) {
    const canAnyMatch = activeLine.some(color =>
      boardingLane.some(b => b.color === color && b.passengersCount < b.maxCapacity && b.state === 'STATION')
    );
    const canAnyBusExit = gridBuses.some(b => b.state === 'GRID' && canBusExitGrid(b, gridBuses));

    if (!canAnyMatch && !canAnyBusExit && boardingLane.every(b => b.state === 'STATION')) {
      setTimeout(triggerGameOver, 900);
    }
  }
}

// ─── Passenger Boarding Animation ───
function animatePassengerBoarding3D(colorKey, targetBus, queueIndex) {
  const pMesh = createPassenger3D(colorKey);

  // Start from passenger's queue position
  const maxVisible = Math.max(activeLine.length + 1, 2);
  const t = maxVisible > 1 ? queueIndex / (maxVisible - 1) : 0;
  const angle = Math.PI * 0.15 + t * Math.PI * 0.7;
  const startX = Math.cos(angle) * 5.8;
  const startZ = -9.8 + Math.sin(angle) * 3.2;

  pMesh.position.set(startX, 0.3, startZ);
  sceneManager.scene.add(pMesh);

  const busMesh = bus3DMap.get(targetBus.id);
  const endX = busMesh ? busMesh.position.x : 0;
  const endZ = busMesh ? busMesh.position.z : -4.2;

  const timeline = gsap.timeline();
  timeline.to(pMesh.position, {
    x: endX, z: endZ,
    duration: 0.32, ease: 'power1.out'
  });
  timeline.to(pMesh.position, {
    y: 1.2, duration: 0.16, yoyo: true, repeat: 1
  }, 0);
  timeline.to(pMesh.scale, {
    x: 0, y: 0, z: 0,
    duration: 0.14,
    onComplete: () => {
      sceneManager.scene.remove(pMesh);
      if (busMesh && busMesh.userData.updateCapacity) {
        busMesh.userData.updateCapacity(targetBus.passengersCount);
      }
    }
  });
}

// ─── Bus Exit Animation ───
function animateBusExit3D(bus) {
  const busMesh = bus3DMap.get(bus.id);
  if (!busMesh) return;

  boardingLane = boardingLane.filter(b => b.id !== bus.id);

  gsap.to(busMesh.position, {
    x: busMesh.position.x + (Math.random() > 0.5 ? 18 : -18),
    z: busMesh.position.z - 5,
    duration: 0.65,
    ease: 'power3.in',
    onComplete: () => {
      sceneManager.scene.remove(busMesh);
      bus3DMap.delete(bus.id);
      bus.state = 'EXITED';
      realignDockedBuses3D();
      renderUI();
      triggerBoarding();
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
        x: dockPos.x, y: dockPos.y, z: dockPos.z,
        duration: 0.3
      });
    }
  });
}

// ─── Boosters ───
function handleShuffleQueue() {
  sounds.init();
  if (coins < 20 || activeLine.length <= 1) return;
  coins -= 20;
  sounds.playBooster();

  // Shuffle only the active line
  for (let i = activeLine.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [activeLine[i], activeLine[j]] = [activeLine[j], activeLine[i]];
  }

  update3DPassengerQueue();
  renderUI();
  triggerBoarding();
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

  setTimeout(() => animateBusExit3D(targetBus), 400);
}

function handleAutoClear() {
  sounds.init();
  if (coins < 40) return;

  const clickableBus = gridBuses.find(b => b.state === 'GRID' && canBusExitGrid(b, gridBuses));
  if (clickableBus) {
    coins -= 40;
    sounds.playBooster();
    moveBusToStation3D(clickableBus);
  }
}

// ─── Win / Game Over ───
function triggerWin() {
  sounds.playWin();
  confetti({ particleCount: 180, spread: 100, origin: { y: 0.5 } });

  document.getElementById('modalIcon').textContent = '🏆';
  document.getElementById('modalTitle').textContent = 'LEVEL CLEARED!';
  document.getElementById('modalSubtitle').textContent = `Level ${currentLevel} Complete! +30 Coins!`;
  document.getElementById('modalBtn').textContent = 'NEXT LEVEL';
  coins += 30;
  document.getElementById('gameModal').classList.add('active');
}

function triggerGameOver() {
  sounds.playError();
  document.getElementById('modalIcon').textContent = '🚗';
  document.getElementById('modalTitle').textContent = 'TRAFFIC JAMMED!';
  document.getElementById('modalSubtitle').textContent = 'All docks full — no matching passengers can board!';
  document.getElementById('modalBtn').textContent = 'TRY AGAIN';
  document.getElementById('gameModal').classList.add('active');
}

function handleModalBtnClick() {
  const modalBtn = document.getElementById('modalBtn');
  if (modalBtn.textContent === 'NEXT LEVEL') {
    startLevel(currentLevel + 1);
  } else {
    startLevel(currentLevel);
  }
}

// ─── UI Render ───
function renderUI() {
  document.getElementById('coinsDisplay').textContent = coins;
  const totalSlots = getTotalActiveSlots();
  const totalP = getTotalPassengers();
  document.getElementById('dockCapacityLabel').textContent =
    `${totalSlots} Docks · ${totalP} Passengers · Waiting: ${waitingLine.length}`;

  const pickCountEl = document.getElementById('pickCount');
  if (pickCountEl) {
    pickCountEl.textContent = getTotalPicks();
  }
  const btnVideoPick = document.getElementById('btnVideoPick');
  if (btnVideoPick) {
    btnVideoPick.disabled = videoPicks >= VIDEO_PICKS_MAX;
  }
  const btnCoinPick = document.getElementById('btnCoinPick');
  if (btnCoinPick) {
    btnCoinPick.disabled = coinPicks >= COIN_PICKS_MAX || coins < COIN_PICK_COST;
  }
}

// ─── Animation Loop ───
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Bobbing passengers
  passenger3DQueue.forEach((pMesh, idx) => {
    pMesh.position.y = 0.3 + Math.abs(Math.sin(time * 3 + idx * 0.4)) * 0.08;
  });

  sceneManager.render();
}

const clock = new THREE.Clock();

window.addEventListener('DOMContentLoaded', () => {
  initUI();
});
