// js/state.js
// Global application state and progress manager.
// Part of the KinderSprachenAPP open-source project.

import { STICKERS_CONFIG } from './translations.js';
import { getWasmExports } from './wasm.js';
import { startConfetti } from './confetti.js';

export const CONFIG = {
    vocabPath: 'content/vocabulary.json',
    wasmPath: 'assets/wasm/core.wasm',
    defaultXP: 0,
    version: 'v1.0.7'
};

export let state = {
    xp: CONFIG.defaultXP,
    level: 1,
    language: 'de',
    vocabulary: [],
    customVocabulary: [], // Added via Creator
    activeCategory: null,
    activeGame: null, // 'match', 'spelling', 'memory'
    mastery: {}, // wordId -> level (0-3)
    stickers: [], // list of unlocked sticker emojis
    // Active session stats
    gameScore: 0,
    sessionCards: [],
    currentCardIndex: 0,
    spellingTypedLetters: [],
    selectedMemoryCards: [],
    matchedMemoryPairs: 0
};

export const debugLogs = [];

export function logDebug(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    debugLogs.push(formatted);
    
    // Explicitly output to browser console based on type to preserve error tracebacks in devtools
    if (type === 'error') {
        console.error(formatted);
    } else if (type === 'warning' || type === 'warn') {
        console.warn(formatted);
    } else {
        console.log(formatted);
    }
    
    if (debugLogs.length > 100) debugLogs.shift();
    
    const outputEl = document.getElementById('debug-log-output');
    if (outputEl) {
        outputEl.textContent = debugLogs.join('\n');
    }
}

export function loadProgress() {
    state.xp = parseInt(localStorage.getItem('user_xp')) || CONFIG.defaultXP;
    state.level = parseInt(localStorage.getItem('user_level')) || 1;
    state.language = localStorage.getItem('user_language') || 'de';
    try {
        state.mastery = JSON.parse(localStorage.getItem('user_mastery')) || {};
        state.stickers = JSON.parse(localStorage.getItem('user_stickers')) || [];
    } catch (e) {
        state.mastery = {};
        state.stickers = [];
    }
}

export function saveProgress() {
    localStorage.setItem('user_xp', state.xp);
    localStorage.setItem('user_level', state.level);
    localStorage.setItem('user_mastery', JSON.stringify(state.mastery));
    localStorage.setItem('user_stickers', JSON.stringify(state.stickers));
    updateXPBar();
}

export function updateXPBar() {
    const lvlEl = document.getElementById('user-level');
    if (lvlEl) lvlEl.textContent = state.level;
    
    const wasmExports = getWasmExports();
    if (wasmExports) {
        const currentLvlXP = wasmExports.xpForCurrentLevel(state.level);
        const nextLvlXP = wasmExports.xpForNextLevel(state.level);
        const relativeXP = state.xp - currentLvlXP;
        const totalNeeded = nextLvlXP - currentLvlXP;
        
        const percentage = Math.min(Math.max((relativeXP / totalNeeded) * 100, 0), 100);
        
        const xpFillEl = document.getElementById('user-xp-fill');
        if (xpFillEl) xpFillEl.style.width = `${percentage}%`;
        
        const xpTextEl = document.getElementById('user-xp-text');
        if (xpTextEl) xpTextEl.textContent = `${state.xp} / ${nextLvlXP} XP`;
    }
}

export function addXP(amount) {
    state.xp += amount;
    
    const wasmExports = getWasmExports();
    if (wasmExports) {
        const newLevel = wasmExports.calculateLevel(state.xp);
        if (newLevel > state.level) {
            state.level = newLevel;
            showLevelUpEffect();
        }
    }
    
    saveProgress();
}

function showLevelUpEffect() {
    startConfetti();
    
    // Find stickers unlocked at this level
    const newlyUnlocked = STICKERS_CONFIG.filter(s => s.level === state.level);
    if (newlyUnlocked.length > 0) {
        const emojis = newlyUnlocked.map(s => s.emoji).join(' ');
        alert(`🎉 LEVEL UP! You reached Level ${state.level}! 🌟\n\n🎁 You unlocked new stickers: ${emojis}\nCheck them in your Sticker Album! 📖`);
    }
}

export async function loadVocabulary() {
    try {
        logDebug('Fetching vocabulary database...');
        const response = await fetch(CONFIG.vocabPath);
        if (!response.ok) throw new Error('Vocabulary JSON could not be loaded');
        const defaultVocab = await response.json();
        
        const custom = JSON.parse(localStorage.getItem('custom_vocab')) || [];
        state.customVocabulary = custom;
        state.vocabulary = [...defaultVocab, ...custom];
        logDebug(`Loaded ${state.vocabulary.length} words (default: ${defaultVocab.length}, custom: ${custom.length}).`);
    } catch (err) {
        logDebug(`Vocabulary load failed. Error: ${err.message}. Using static fallbacks.`, 'error');
        state.vocabulary = [
            { id: "hund", word: "der Hund", translation: "dog", category: "Tiere", emoji: "🐶", difficulty: 1 },
            { id: "katze", word: "die Katze", translation: "cat", category: "Tiere", emoji: "🐱", difficulty: 1 },
            { id: "apfel", word: "der Apfel", translation: "apple", category: "Essen", emoji: "🍎", difficulty: 1 }
        ];
    }
}
