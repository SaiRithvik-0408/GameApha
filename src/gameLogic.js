import { BUS_COLORS } from './busBuilder.js';

export const GRID_SIZE = 6;
export const CELL_SIZE = 1.8;
export const GRID_START_X = -((GRID_SIZE * CELL_SIZE) / 2) + CELL_SIZE / 2;

// Track last generated layout hash to ensure restarts produce different layouts
let lastLayoutHash = '';
export const GRID_START_Z = -((GRID_SIZE * CELL_SIZE) / 2) + CELL_SIZE / 2 + 1.5;

export function gridToWorld(r, c, len = 2, isVert = false) {
  const x = GRID_START_X + (isVert ? c : c + (len - 1) / 2) * CELL_SIZE;
  const z = GRID_START_Z + (isVert ? r + (len - 1) / 2 : r) * CELL_SIZE;
  return { x, y: 0, z };
}

export function getBaseSlotsForLevel(levelNum) {
  // Start with 4 docks, ramp slowly
  return Math.min(4 + Math.floor(levelNum / 3), 7);
}

/**
 * Difficulty config per level range
 */
function getDifficultyConfig(levelNum) {
  // Colors ramp: L1=3, L3=4, L5=5, L7=6, L10=7, L13+=8
  const numColors = Math.min(3 + Math.floor((levelNum) / 3), 8);
  
  // Passengers per bus is always 3
  // For easy rounds: total buses = exact minimum needed
  // Level 1: 3 buses (9 passengers), L2: 4, L3: 5 ... L10: 12, capped at 18
  const totalBuses = Math.min(3 + (levelNum - 1), 18);
  
  // Distractor passengers: 0 at L1-L2, then ramp up
  const distractorCount = levelNum <= 2 ? 0 : Math.min(Math.floor((levelNum - 2) * 1.5), 8);
  
  // Vehicle length mix changes with difficulty
  const compactChance = Math.min(0.1 + levelNum * 0.02, 0.30);
  const longChance = Math.min(0.02 + levelNum * 0.015, 0.18);
  
  return { numColors, totalBuses, distractorCount, compactChance, longChance };
}

export function generateSolvableLevel(levelNum) {
  // Try up to 5 times to produce a layout different from the last one
  let result;
  let hash;
  for (let attempt = 0; attempt < 5; attempt++) {
    result = generateLevelInternal(levelNum);
    // Create a simple hash of bus positions + passenger order
    hash = result.buses.map(b => `${b.color}${b.r}${b.c}${b.dir}`).join(',') + '|' +
           result.passengers.slice(0, 10).join(',');
    if (hash !== lastLayoutHash) break;
  }
  lastLayoutHash = hash;
  return result;
}

function generateLevelInternal(levelNum) {
  const colorKeys = Object.keys(BUS_COLORS);
  const config = getDifficultyConfig(levelNum);
  const activeColors = colorKeys.slice(0, config.numColors);

  const busesData = [];
  const passengerList = [];

  // Each bus needs exactly 3 matching passengers
  // buses = minimum needed = totalBuses (which equals passengers/3)
  for (let i = 0; i < config.totalBuses; i++) {
    const color = activeColors[i % activeColors.length];
    for (let p = 0; p < 3; p++) {
      passengerList.push(color);
    }
  }

  // Add distractor passengers (colors with no matching bus)
  const distractorColors = colorKeys.filter(c => !activeColors.includes(c));
  for (let d = 0; d < config.distractorCount; d++) {
    if (distractorColors.length > 0) {
      passengerList.push(distractorColors[d % distractorColors.length]);
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

    const randLen = Math.random();
    const len = randLen < config.compactChance ? 1 : randLen < (1 - config.longChance) ? 2 : 3;

    while (!placed && attempts < 400) {
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
