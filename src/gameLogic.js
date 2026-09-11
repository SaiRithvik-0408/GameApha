import { BUS_COLORS } from './busBuilder.js';

export const GRID_SIZE = 6;
export const CELL_SIZE = 1.8;
export const GRID_START_X = -((GRID_SIZE * CELL_SIZE) / 2) + CELL_SIZE / 2;
export const GRID_START_Z = -((GRID_SIZE * CELL_SIZE) / 2) + CELL_SIZE / 2 + 1.5;

export function gridToWorld(r, c, len = 2, isVert = false) {
  const x = GRID_START_X + (isVert ? c : c + (len - 1) / 2) * CELL_SIZE;
  const z = GRID_START_Z + (isVert ? r + (len - 1) / 2 : r) * CELL_SIZE;
  return { x, y: 0, z };
}

export function getBaseSlotsForLevel(levelNum) {
  // Base docks scale from 4 up to 7 based on level difficulty
  return Math.min(4 + Math.floor((levelNum - 1) / 3), 7);
}

export function generateSolvableLevel(levelNum) {
  const colorKeys = Object.keys(BUS_COLORS);
  // Scale active colors: Level 1 = 3 colors, Level 5 = 5 colors, Level 10 = 7 colors
  const numColors = Math.min(3 + Math.floor((levelNum - 1) / 2), colorKeys.length);
  const activeColors = colorKeys.slice(0, numColors);

  // Scale total vehicles: Level 1 = 6, Level 3 = 10, Level 5 = 14, Level 10 = 22
  const totalBuses = Math.min(6 + (levelNum - 1) * 2, 22);
  const busesData = [];
  const passengerList = [];

  // Generate passenger queue matching vehicles exactly (3 passengers per vehicle)
  for (let i = 0; i < totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    for (let p = 0; p < 3; p++) {
      passengerList.push(color);
    }
  }

  // Shuffle passenger queue
  for (let i = passengerList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passengerList[i], passengerList[j]] = [passengerList[j], passengerList[i]];
  }

  const occupied = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
  const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  let busId = 1;
  for (let i = 0; i < totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    let placed = false;
    let attempts = 0;

    // Mix vehicle lengths: 1-unit compact car (25%), 2-unit bus (65%), 3-unit long bus (10%)
    const randLen = Math.random();
    const len = randLen < 0.25 ? 1 : randLen < 0.9 ? 2 : 3;

    while (!placed && attempts < 200) {
      attempts++;
      const dir = directions[Math.floor(Math.random() * directions.length)];
      const isVert = dir === 'UP' || dir === 'DOWN';

      const maxR = isVert ? GRID_SIZE - len : GRID_SIZE - 1;
      const maxC = isVert ? GRID_SIZE - 1 : GRID_SIZE - len;

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
          state: 'GRID'
        });
        placed = true;
      }
    }
  }

  return { buses: busesData, passengers: passengerList };
}

export function isCellOccupiedInGrid(r, c, buses, ignoreBusId = null) {
  for (const b of buses) {
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

export function canBusExitGrid(bus, buses) {
  if (bus.dir === 'UP') {
    for (let r = bus.r - 1; r >= 0; r--) {
      if (isCellOccupiedInGrid(r, bus.c, buses, bus.id)) return false;
    }
  } else if (bus.dir === 'DOWN') {
    for (let r = bus.r + bus.length; r < GRID_SIZE; r++) {
      if (isCellOccupiedInGrid(r, bus.c, buses, bus.id)) return false;
    }
  } else if (bus.dir === 'LEFT') {
    for (let c = bus.c - 1; c >= 0; c--) {
      if (isCellOccupiedInGrid(bus.r, c, buses, bus.id)) return false;
    }
  } else if (bus.dir === 'RIGHT') {
    for (let c = bus.c + bus.length; c < GRID_SIZE; c++) {
      if (isCellOccupiedInGrid(bus.r, c, buses, bus.id)) return false;
    }
  }
  return true;
}
