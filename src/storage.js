const STORAGE_KEY = 'bus_fever_party_save';

const defaultState = {
  maxLevelUnlocked: 1,
  coins: 150
};

export function loadGameState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaultState, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load game state', e);
  }
  return { ...defaultState };
}

export function saveGameState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save game state', e);
  }
}

export function addCoins(amount) {
  const state = loadGameState();
  state.coins += amount;
  saveGameState(state);
  return state.coins;
}

export function spendCoins(amount) {
  const state = loadGameState();
  if (state.coins >= amount) {
    state.coins -= amount;
    saveGameState(state);
    return true; // Success
  }
  return false; // Insufficient funds
}

export function unlockLevel(levelNum) {
  const state = loadGameState();
  if (levelNum > state.maxLevelUnlocked) {
    state.maxLevelUnlocked = levelNum;
    saveGameState(state);
  }
}

export function getMaxLevel() {
  return loadGameState().maxLevelUnlocked;
}

export function getCoins() {
  return loadGameState().coins;
}
