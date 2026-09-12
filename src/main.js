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
import {
  loadGameState,
  addCoins,
  spendCoins,
  unlockLevel,
  getMaxLevel,
  getCoins
} from './storage.js';

// ─── Game State ───
let currentLevel = 1;
let score = 0;
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

// Dock Unlock charges
let videoDocks = 0;    // 2 unlockable via watching a video ad
let coinDocks = 0;     // 1 unlockable via spending coins
const VIDEO_DOCKS_MAX = 2;
const COIN_DOCKS_MAX = 1;
const COIN_DOCK_COST = 25;

function getTotalActiveSlots() {
  return 3 + videoDocks + coinDocks;
}

function getDockWorldPos(slotIndex, totalSlots) {
  const startX = -4.0;
  const stepX = 1.6;
  return { x: startX + slotIndex * stepX, y: 0.15, z: -4.5 };
}

function initUI() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="game-header">
      <button class="icon-btn-round" id="btnHome" title="Home Screen">🏠</button>
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

    <!-- Removed old dock unlock panel -->

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
        <button class="btn-secondary hidden" id="modalAdBtn">🎬 WATCH AD (2x COINS)</button>
      </div>
    </div>

    <div class="home-screen hidden" id="homeScreen">
      <h1 class="home-title">BUS FEVER</h1>
      <div class="home-stats">
        <div class="stat-pill coin-pill">🪙 <span id="homeCoinsDisplay">150</span></div>
      </div>
      <div class="level-grid" id="levelGrid"></div>
    </div>
  `;

  const container = document.getElementById('viewportContainer');
  sceneManager = new GameScene(container);
  container.addEventListener('pointerdown', handlePointerDown);

  document.getElementById('btnTopRestart').addEventListener('click', () => startLevel(currentLevel));
  document.getElementById('btnHome').addEventListener('click', showHomeScreen);
  document.getElementById('btnShuffle').addEventListener('click', handleShuffleQueue);
  document.getElementById('btnVIP').addEventListener('click', handleVIPClear);
  document.getElementById('btnAutoClear').addEventListener('click', handleAutoClear);
  document.getElementById('modalBtn').addEventListener('click', handleModalBtnClick);
  document.getElementById('modalAdBtn').addEventListener('click', handleModalAdClick);

  showHomeScreen();
  animate();
}

function showHomeScreen() {
  document.getElementById('homeScreen').classList.remove('hidden');
  document.getElementById('homeCoinsDisplay').textContent = getCoins();
  const levelGrid = document.getElementById('levelGrid');
  levelGrid.innerHTML = '';
  
  const maxLvl = getMaxLevel();
  // Show up to maxLevel + 1 or 20, whichever is larger, just to have a grid
  const displayLevels = Math.max(20, maxLvl + 1);
  
  for (let i = 1; i <= displayLevels; i++) {
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.textContent = i;
    if (i <= maxLvl) {
      btn.classList.add('unlocked');
      btn.addEventListener('click', () => startLevel(i));
    } else {
      btn.disabled = true;
    }
    levelGrid.appendChild(btn);
  }
}

// ─── Level Setup ───
function startLevel(lvl) {
  document.getElementById('homeScreen').classList.add('hidden');
  currentLevel = lvl;
  document.getElementById('levelDisplay').textContent = `Level ${currentLevel}`;
  document.getElementById('gameModal').classList.remove('active');

  bus3DMap.forEach(group => sceneManager.scene.remove(group));
  bus3DMap.clear();
  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];
  boardingLane = [];
  isBoardingInProgress = false;

  // Restore lock sprites for any docks that are still locked
  // (already-unlocked docks stay unlocked across levels)
  if (sceneManager) sceneManager.refreshLockSprites(videoDocks, coinDocks);

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
    const z = -10.8 + Math.sin(angle) * radiusZ;

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
    const z = -13.5 + Math.sin(angle) * radiusZ;

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

  // 0. Check if a lock sprite was clicked
  if (sceneManager.lockSprites && sceneManager.lockSprites.length > 0) {
    const lockHits = sceneManager.raycaster.intersectObjects(sceneManager.lockSprites, false);
    if (lockHits.length > 0) {
      const hit = lockHits[0].object;
      if (hit.userData && hit.userData.isLock) {
        const idx = hit.userData.slotIndex;
        if (idx === 3 || idx === 4) {
          handleVideoDockUnlock();
        } else if (idx === 5) {
          handleCoinDockUnlock();
        }
        return;
      }
    }
  }

  // 1. Check if a waiting line passenger was clicked
  if (waitingLine3DQueue.length > 0) {
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

function pickFromWaitingLine(waitIdx) {
  if (waitIdx < 0 || waitIdx >= waitingLine.length) return;

  // Move the picked passenger from waiting line to front of active line
  const pickedColor = waitingLine.splice(waitIdx, 1)[0];
  activeLine.unshift(pickedColor);

  sounds.playPassengerBoard();
  if (navigator.vibrate) navigator.vibrate(30);

  update3DPassengerQueue();
  renderUI();
  triggerBoarding();
}

function handleVideoDockUnlock() {
  sounds.init();
  if (videoDocks >= VIDEO_DOCKS_MAX) return;
  
  const remainingAds = VIDEO_DOCKS_MAX - videoDocks;
  const modal = document.getElementById('gameModal');
  document.getElementById('modalIcon').textContent = '🎬';
  document.getElementById('modalTitle').textContent = 'UNLOCK DOCK';
  document.getElementById('modalSubtitle').textContent =
    `Watch a short ad to unlock 1 extra dock! (${remainingAds} ad${remainingAds > 1 ? 's' : ''} remaining)`;
  
  const primaryBtn = document.getElementById('modalBtn');
  primaryBtn.textContent = 'WATCH AD';
  primaryBtn.onclick = () => {
    modal.classList.remove('active');
    // Simulate ad viewing — unlock exactly 1 dock
    setTimeout(() => {
      const newSlotIndex = 3 + videoDocks; // slot 3 first, then slot 4
      videoDocks++;
      sounds.playBooster();
      
      // Remove the lock sprite for only the newly-unlocked dock
      if (sceneManager && sceneManager.lockSprites) {
        sceneManager.lockSprites = sceneManager.lockSprites.filter(sprite => {
          if (sprite.userData.slotIndex === newSlotIndex) {
            sceneManager.scene.remove(sprite);
            return false;
          }
          return true;
        });
      }
      
      realignDockedBuses3D();
      renderUI();
      triggerBoarding();
    }, 1000);
  };
  
  document.getElementById('modalAdBtn').classList.add('hidden');
  modal.classList.add('active');
}

function handleCoinDockUnlock() {
  if (coinDocks >= COIN_DOCKS_MAX || getCoins() < COIN_DOCK_COST) return;
  
  const modal = document.getElementById('gameModal');
  document.getElementById('modalIcon').textContent = '🪙';
  document.getElementById('modalTitle').textContent = 'UNLOCK DOCK';
  document.getElementById('modalSubtitle').textContent = `Pay ${COIN_DOCK_COST} coins to unlock an extra dock!`;
  
  const primaryBtn = document.getElementById('modalBtn');
  primaryBtn.textContent = 'PAY COINS';
  primaryBtn.onclick = () => {
    modal.classList.remove('active');
    if (spendCoins(COIN_DOCK_COST)) {
      coinDocks++;
      
      // Remove lock sprite for coin dock
      if (sceneManager && sceneManager.lockSprites) {
        sceneManager.lockSprites = sceneManager.lockSprites.filter(sprite => {
          if (sprite.userData.slotIndex === 5) {
            sceneManager.scene.remove(sprite);
            return false;
          }
          return true;
        });
      }
      
      realignDockedBuses3D();
      renderUI();
      triggerBoarding();
    }
  };
  
  document.getElementById('modalAdBtn').classList.add('hidden');
  modal.classList.add('active');
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
  else if (bus.dir === 'DOWN') exitTargetZ = 8.5;
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
      realignDockedBuses3D();
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
      b => b.color === color && b.passengersCount < (b.maxCapacity || 3) && b.state === 'STATION'
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
    if (matchBus.passengersCount >= (matchBus.maxCapacity || 3)) {
      matchBus.state = 'EXITING';
      sounds.playBusFull();
      score += 50;
      addCoins(5); // award 5 coins per bus completed
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
      boardingLane.some(b => b.color === color && b.passengersCount < (b.maxCapacity || 3) && b.state === 'STATION')
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
    // Only realign buses already settled at station — skip buses currently driving/animating
    if (bus.state === 'STATION') {
      const busMesh = bus3DMap.get(bus.id);
      if (busMesh) {
        const dockPos = getDockWorldPos(idx, totalSlots);
        gsap.to(busMesh.position, {
          x: dockPos.x, y: dockPos.y, z: dockPos.z,
          duration: 0.3
        });
      }
    }
  });
}

// ─── Boosters ───
function handleShuffleQueue() {
  sounds.init();
  if (getCoins() < 20 || activeLine.length <= 1) return;
  if (!spendCoins(20)) return;
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
  if (getCoins() < 30 || boardingLane.length === 0) return;
  if (!spendCoins(30)) return;
  sounds.playBooster();

  const targetBus = boardingLane[0];
  targetBus.passengersCount = targetBus.maxCapacity || 3;
  targetBus.state = 'EXITING';

  const busMesh = bus3DMap.get(targetBus.id);
  if (busMesh && busMesh.userData.updateCapacity) {
    busMesh.userData.updateCapacity(3);
  }

  setTimeout(() => animateBusExit3D(targetBus), 400);
}

function handleAutoClear() {
  sounds.init();
  if (getCoins() < 40) return;

  const clickableBus = gridBuses.find(b => b.state === 'GRID' && canBusExitGrid(b, gridBuses));
  if (clickableBus) {
    if (!spendCoins(40)) return;
    sounds.playBooster();
    moveBusToStation3D(clickableBus);
  }
}

// ─── Win / Game Over ───
function triggerWin() {
  sounds.playWin();
  confetti({ particleCount: 180, spread: 100, origin: { y: 0.5 } });

  unlockLevel(currentLevel + 1);

  document.getElementById('modalIcon').textContent = '🏆';
  document.getElementById('modalTitle').textContent = 'LEVEL CLEARED!';
  document.getElementById('modalSubtitle').textContent = `Level ${currentLevel} Complete! +50 Coins!`;
  document.getElementById('modalBtn').textContent = 'NEXT LEVEL';
  document.getElementById('modalAdBtn').classList.remove('hidden');
  addCoins(50);
  document.getElementById('gameModal').classList.add('active');
}

function triggerGameOver() {
  sounds.playError();
  document.getElementById('modalIcon').textContent = '🚗';
  document.getElementById('modalTitle').textContent = 'TRAFFIC JAMMED!';
  document.getElementById('modalSubtitle').textContent = 'All docks full — no matching passengers can board!';
  document.getElementById('modalBtn').textContent = 'TRY AGAIN';
  document.getElementById('modalAdBtn').classList.add('hidden');
  document.getElementById('gameModal').classList.add('active');
}

function handleModalBtnClick() {
  document.getElementById('modalAdBtn').classList.add('hidden');
  const modalBtn = document.getElementById('modalBtn');
  if (modalBtn.textContent === 'NEXT LEVEL') {
    startLevel(currentLevel + 1);
  } else {
    startLevel(currentLevel);
  }
}

function handleModalAdClick() {
  // Simulate an ad watch
  const adBtn = document.getElementById('modalAdBtn');
  adBtn.textContent = "Loading Ad...";
  adBtn.disabled = true;
  
  setTimeout(() => {
    addCoins(50); // double the coins (+50)
    document.getElementById('modalSubtitle').textContent = `Level ${currentLevel} Complete! +100 Coins!`;
    adBtn.textContent = "REWARD GRANTED!";
    renderUI();
  }, 1500);
}

// ─── UI Render ───
function renderUI() {
  const coinsDisplay = getCoins();
  document.getElementById('coinsDisplay').textContent = coinsDisplay;
  const homeDisplay = document.getElementById('homeCoinsDisplay');
  if (homeDisplay) homeDisplay.textContent = coinsDisplay;

  const totalSlots = getTotalActiveSlots();
  const totalP = getTotalPassengers();
  document.getElementById('dockCapacityLabel').textContent =
    `${totalSlots}/6 Docks Active · ${activeLine.length} Passengers · Waiting: ${waitingLine.length}`;

  const adBtn = document.getElementById('adDockBtn');
  if (adBtn) {
    if (videoDocks >= 2) {
      adBtn.style.display = 'none';
    } else {
      adBtn.style.display = 'flex';
      adBtn.innerHTML = `<span class="icon">▶️</span> +1 Dock (Ad) [${2 - videoDocks} left]`;
    }
  }

  const coinBtn = document.getElementById('coinDockBtn');
  if (coinBtn) {
    if (coinDocks >= 1) {
      coinBtn.style.display = 'none';
    } else {
      coinBtn.style.display = 'flex';
    }
  }

  const dockCountEl = document.getElementById('dockCount');
  if (dockCountEl) {
    dockCountEl.textContent = `${totalSlots}/6`;
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
