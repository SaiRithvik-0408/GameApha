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
  // Start with 4 docks, add 1 every 2 levels, cap at 7
  return Math.min(4 + Math.floor(levelNum / 2), 7);
}

/**
 * Difficulty config per level range
 */
function getDifficultyConfig(levelNum) {
  // Colors ramp: L1=3, L3=4, L5=5, L7=6, L9=7, L12+=8
  const numColors = Math.min(3 + Math.floor(levelNum / 2), 8);
  
  // Total buses: L1=4, L2=6, L3=8, L5=12, L8=16, L10+=20 max
  const totalBuses = Math.min(4 + levelNum * 2, 20);
  
  // Distractor passengers: 0 at L1, then 2 per level starting L2, max 10
  const distractorCount = levelNum <= 1 ? 0 : Math.min((levelNum - 1) * 2, 10);
  
  // Vehicle length mix changes with difficulty
  // Early: mostly 2-unit, later: more 1-unit and 3-unit variety
  const compactChance = Math.min(0.15 + levelNum * 0.03, 0.35);
  const longChance = Math.min(0.05 + levelNum * 0.02, 0.20);
  
  return { numColors, totalBuses, distractorCount, compactChance, longChance };
}

export function generateSolvableLevel(levelNum) {
  const colorKeys = Object.keys(BUS_COLORS);
  const config = getDifficultyConfig(levelNum);
  const activeColors = colorKeys.slice(0, config.numColors);

  const busesData = [];
  const passengerList = [];

  // Generate passenger queue matching vehicles exactly (3 passengers per vehicle)
  for (let i = 0; i < config.totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    for (let p = 0; p < 3; p++) {
      passengerList.push(color);
    }
  }

  // Add distractor passengers (colors that DON'T match any bus on grid)
  // Use colors NOT in activeColors, or if all colors used, use random active colors
  const distractorColors = colorKeys.filter(c => !activeColors.includes(c));
  for (let d = 0; d < config.distractorCount; d++) {
    if (distractorColors.length > 0) {
      passengerList.push(distractorColors[d % distractorColors.length]);
    } else {
      // All colors in use - add random active color as extra (still a blocker)
      passengerList.push(activeColors[Math.floor(Math.random() * activeColors.length)]);
    }
  }

  // Shuffle passenger queue thoroughly
  for (let i = passengerList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passengerList[i], passengerList[j]] = [passengerList[j], passengerList[i]];
  }

  const occupied = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(false));
  const directions = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  let busId = 1;
  for (let i = 0; i < config.totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    let placed = false;
    let attempts = 0;

    // Mix vehicle lengths based on difficulty
    const randLen = Math.random();
    const len = randLen < config.compactChance ? 1 : randLen < (1 - config.longChance) ? 2 : 3;

    while (!placed && attempts < 300) {
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
