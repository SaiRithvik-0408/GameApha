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

// Game State
let currentLevel = 1;
let score = 0;
let coins = 150;
let adBonusSlots = 0; // max 2 extra slots

let boardingLane = []; // active buses docked at station
let passengers = []; // remaining passenger queue colors
let gridBuses = []; // array of bus objects

let sceneManager;
let bus3DMap = new Map(); // busId -> 3D Group
let passenger3DQueue = []; // array of 3D passenger meshes in queue line
let isBoardingInProgress = false; // prevent concurrent boarding loops

function getTotalActiveSlots() {
  return getBaseSlotsForLevel(currentLevel) + adBonusSlots;
}

// Map Dock Slot index (0..7) to 3D World X, Z positions on Station Platform
function getDockWorldPos(slotIndex, totalSlots) {
  const startX = -4.8;
  const stepX = 1.6;
  return {
    x: startX + slotIndex * stepX,
    y: 0.15,
    z: -4.2
  };
}

function initUI() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top Minimal Action Header -->
    <header class="game-header">
      <button class="icon-btn-round" id="btnTopRestart" title="Restart Level">🔄</button>
      <div class="level-pill" id="levelDisplay">Level 1</div>
      <div class="stats-group">
        <div class="stat-pill coin-pill">🪙 <span id="coinsDisplay">150</span></div>
      </div>
    </header>

    <!-- 3D Canvas Viewport -->
    <main class="game-viewport" id="viewportContainer"></main>

    <!-- Minimal Overlay for Dock Badges -->
    <div class="ui-overlay">
      <div class="dock-badge-bar" id="dockCapacityLabel">4 Active Docks</div>
    </div>

    <!-- Bottom Booster Bar matching Reference Image -->
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

    <!-- Game Over & Win Modal -->
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

  document.getElementById('btnTopRestart').addEventListener('click', () => startLevel(currentLevel));
  document.getElementById('btnShuffle').addEventListener('click', handleShuffleQueue);
  document.getElementById('btnVIP').addEventListener('click', handleVIPClear);
  document.getElementById('btnAutoClear').addEventListener('click', handleAutoClear);
  document.getElementById('modalBtn').addEventListener('click', handleModalBtnClick);

  startLevel(1);
  animate();
}

function startLevel(lvl) {
  currentLevel = lvl;
  document.getElementById('levelDisplay').textContent = `Level ${currentLevel}`;
  document.getElementById('gameModal').classList.remove('active');

  // Clear existing 3D bus objects completely
  bus3DMap.forEach(group => sceneManager.scene.remove(group));
  bus3DMap.clear();

  // Clear existing 3D passenger queue objects completely
  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];

  boardingLane = [];
  isBoardingInProgress = false;

  // Generate new solvable level layout with scaling difficulty
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

  // Build 3D Passengers Queue (Exactly 10 visible at once in strict order)
  update3DPassengerQueue();
  renderUI();
}

function update3DPassengerQueue() {
  passenger3DQueue.forEach(pMesh => sceneManager.scene.remove(pMesh));
  passenger3DQueue = [];

  // Render ONLY 10 visible passengers at once in strict order
  const maxVisible = Math.min(passengers.length, 10);
  const visibleQueue = passengers.slice(0, maxVisible);

  visibleQueue.forEach((color, idx) => {
    const pMesh = createPassenger3D(color);

    // Position in 3D arc queue line
    const t = maxVisible > 1 ? idx / (maxVisible - 1) : 0;
    const angle = Math.PI * 0.15 + t * Math.PI * 0.7;
    const radiusX = 5.8;
    const radiusZ = 3.2;

    const x = Math.cos(angle) * radiusX;
    const z = -9.8 + Math.sin(angle) * radiusZ;

    pMesh.position.set(x, 0.3, z);
    pMesh.rotation.y = angle + Math.PI / 2;

    // Highlight front passenger #0
    if (idx === 0) {
      pMesh.scale.setScalar(1.25);
    }

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
    // Walk up the parent hierarchy to find the bus group
    let clickedObj = intersects[0].object;
    let busGroup = null;
    let busId = null;

    // Walk up to find a group registered in bus3DMap
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

  // Calculate FORWARD exit vector in exact arrow direction
  let exitTargetX = busMesh.position.x;
  let exitTargetZ = busMesh.position.z;

  if (bus.dir === 'UP') {
    exitTargetZ = -3.8; // Drive forward UP along negative Z
  } else if (bus.dir === 'DOWN') {
    exitTargetZ = 7.5;  // Drive forward DOWN along positive Z
  } else if (bus.dir === 'LEFT') {
    exitTargetX = -8.5; // Drive forward LEFT along negative X
  } else if (bus.dir === 'RIGHT') {
    exitTargetX = 8.5;  // Drive forward RIGHT along positive X
  }

  const timeline = gsap.timeline();

  // Step 1: Drive FORWARD in arrow direction
  timeline.to(busMesh.position, {
    x: exitTargetX,
    z: exitTargetZ,
    duration: 0.4,
    ease: 'power1.in'
  });

  // Step 2: Turn towards parking bay facing dock
  timeline.to(busMesh.rotation, {
    y: Math.PI, // Face station dock
    duration: 0.2
  });

  // Step 3: Park smoothly into assigned dock slot
  timeline.to(busMesh.position, {
    x: dockPos.x,
    y: dockPos.y,
    z: dockPos.z,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => {
      bus.state = 'STATION';
      renderUI();
      // THIS is the critical fix: only start boarding AFTER bus arrives at station
      triggerBoarding();
    }
  });

  renderUI();
}

/**
 * Safely trigger the boarding loop. Prevents multiple concurrent loops.
 */
function triggerBoarding() {
  if (isBoardingInProgress) return;
  isBoardingInProgress = true;
  processBoarding();
}

function processBoarding() {
  // Win condition: All passengers boarded and no buses remain
  const remainingActiveBuses = gridBuses.filter(b => b.state !== 'EXITING' && b.state !== 'EXITED');

  if (passengers.length === 0 && boardingLane.length === 0 && remainingActiveBuses.length === 0) {
    isBoardingInProgress = false;
    setTimeout(triggerWin, 400);
    return;
  }

  if (passengers.length === 0) {
    isBoardingInProgress = false;
    // Check if all docked buses are somehow full - could be a dead state
    checkGameOverState();
    return;
  }

  // Strict FIFO order: Evaluate ONLY front passenger #0
  const frontColor = passengers[0];
  
  // Find a matching bus that is in STATION state (fully parked and ready)
  const targetBus = boardingLane.find(
    b => b.color === frontColor && b.passengersCount < b.maxCapacity && b.state === 'STATION'
  );

  if (targetBus) {
    const boardedColor = passengers.shift(); // Remove front passenger
    targetBus.passengersCount++;
    score += 10;

    sounds.playPassengerBoard();

    // Animate 3D Passenger entering bus
    animatePassengerBoarding3D(boardedColor, targetBus);

    // Check if bus is full after this boarding
    if (targetBus.passengersCount >= targetBus.maxCapacity) {
      targetBus.state = 'EXITING';
      sounds.playBusFull();
      score += 50;
      coins += 5;

      // REQUIREMENT: For 1 bus, take at least 0.3s before removing / driving off
      setTimeout(() => animateBusExit3D(targetBus), 400);
    }

    update3DPassengerQueue();
    renderUI();

    // Schedule next passenger check with a small delay for visual clarity
    setTimeout(() => processBoarding(), 300);
  } else {
    // Front passenger doesn't match any available station bus
    // Check if this is a distractor passenger blocking the queue
    const hasAnyMatchingBusOnGrid = gridBuses.some(
      b => b.color === frontColor && b.state === 'GRID'
    );
    const hasAnyMatchingBusInLane = boardingLane.some(
      b => b.color === frontColor && b.passengersCount < b.maxCapacity
    );

    // If this passenger is a distractor (no matching bus exists at all), skip it
    if (!hasAnyMatchingBusOnGrid && !hasAnyMatchingBusInLane) {
      // Distractor passenger - remove from queue with a "reject" animation
      passengers.shift();
      update3DPassengerQueue();
      renderUI();
      // Try next passenger
      setTimeout(() => processBoarding(), 200);
      return;
    }

    // No match right now, stop the loop - it will restart when a new bus arrives
    isBoardingInProgress = false;
    update3DPassengerQueue();
    renderUI();
    checkGameOverState();
  }
}

function checkGameOverState() {
  const activeSlots = getTotalActiveSlots();
  if (passengers.length > 0 && boardingLane.length >= activeSlots) {
    // All docks full - check if front passenger can board any docked bus
    const frontColor = passengers[0];
    const canBoardFront = boardingLane.some(
      b => b.color === frontColor && b.passengersCount < b.maxCapacity && b.state === 'STATION'
    );
    // Also check if any bus on grid can still exit
    const canAnyBusExit = gridBuses.some(
      b => b.state === 'GRID' && canBusExitGrid(b, gridBuses)
    );

    if (!canBoardFront && !canAnyBusExit && boardingLane.every(b => b.state === 'STATION')) {
      setTimeout(triggerGameOver, 900);
    }
  }
}

function animatePassengerBoarding3D(colorKey, targetBus) {
  const pMesh = createPassenger3D(colorKey);
  pMesh.position.set(0, 0.3, -9.5);
  sceneManager.scene.add(pMesh);

  const busMesh = bus3DMap.get(targetBus.id);
  const endX = busMesh ? busMesh.position.x : 0;
  const endZ = busMesh ? busMesh.position.z : -4.2;

  // Animate 3D passenger walking & hopping into the bus door
  const timeline = gsap.timeline();
  timeline.to(pMesh.position, {
    x: endX,
    z: endZ,
    duration: 0.28,
    ease: 'power1.out'
  });
  timeline.to(pMesh.position, {
    y: 1.1,
    duration: 0.14,
    yoyo: true,
    repeat: 1
  }, 0);
  timeline.to(pMesh.scale, {
    x: 0,
    y: 0,
    z: 0,
    duration: 0.14,
    onComplete: () => {
      sceneManager.scene.remove(pMesh);
      if (busMesh && busMesh.userData.updateCapacity) {
        busMesh.userData.updateCapacity(targetBus.passengersCount);
      }
    }
  });
}

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
      // After a bus exits, a dock frees up - try boarding again
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

function triggerWin() {
  sounds.playWin();
  confetti({ particleCount: 160, spread: 90, origin: { y: 0.5 } });

  const modal = document.getElementById('gameModal');
  document.getElementById('modalIcon').textContent = '🏆';
  document.getElementById('modalTitle').textContent = 'LEVEL CLEARED!';
  document.getElementById('modalSubtitle').textContent = `Level ${currentLevel} Complete! Bonus +30 Coins awarded!`;
  document.getElementById('modalBtn').textContent = 'NEXT LEVEL';
  coins += 30;
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
  document.getElementById('coinsDisplay').textContent = coins;
  const totalSlots = getTotalActiveSlots();
  document.getElementById('dockCapacityLabel').textContent = `${totalSlots} Active Docks | ${passengers.length} Passengers Left`;
}

function animate() {
  requestAnimationFrame(animate);

  const time = clock.getElapsedTime();

  // Micro-bobbing 3D Passengers in queue
  passenger3DQueue.forEach((pMesh, idx) => {
    pMesh.position.y = 0.3 + Math.abs(Math.sin(time * 3 + idx * 0.4)) * 0.08;
  });

  sceneManager.render();
}

const clock = new THREE.Clock();

window.addEventListener('DOMContentLoaded', () => {
  initUI();
});
