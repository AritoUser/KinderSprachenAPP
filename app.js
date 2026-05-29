// app.js

// --- DEBUG LOGGING ENGINE ---
const debugLogs = [];
function logDebug(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    debugLogs.push(formatted);
    console.log(formatted);
    
    if (debugLogs.length > 100) debugLogs.shift();
    
    const outputEl = document.getElementById('debug-log-output');
    if (outputEl) {
        outputEl.textContent = debugLogs.join('\n');
    }
}

// Global error handlers
window.addEventListener('error', (event) => {
    logDebug(`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, 'error');
});
window.addEventListener('unhandledrejection', (event) => {
    logDebug(`Unhandled promise rejection: ${event.reason}`, 'error');
});

// --- 1. CONFIGURATION & STATE ---
const CONFIG = {
    vocabPath: 'content/vocabulary.json',
    wasmPath: 'assets/wasm/core.wasm',
    defaultXP: 0,
    version: 'v1.0.7'
};

let state = {
    xp: CONFIG.defaultXP,
    level: 1,
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

// WebAssembly instance and exports
let wasmExports = null;

// --- 2. INITIALIZATION & PWAs ---
document.addEventListener('DOMContentLoaded', async () => {
    loadProgress();
    initTheme();
    initUI();
    applyLanguage(state.language);
    document.getElementById('app-version-badge').textContent = CONFIG.version;
    registerServiceWorker();
    
    // Load Vocabulary
    await loadVocabulary();
    
    // Load WebAssembly
    await loadWasm();
    
    // Render categories on Dashboard
    renderCategories();
    
    // Initial XP UI update
    updateXPBar();
});

// Register Progressive Web App Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        // Track whether we are already refreshing the page to avoid infinite loops
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });

        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
            logDebug(`ServiceWorker registered with scope: ${reg.scope}`);
            
            // Periodically check for updates on the server
            setInterval(() => {
                reg.update().catch(err => {
                    logDebug(`ServiceWorker update check failed (possibly invalid state): ${err.message}`, 'warning');
                });
            }, 60 * 1000); // Check every minute
            
            // Listen for new service workers installing
            reg.addEventListener('updatefound', () => {
                logDebug('New ServiceWorker update found. Installing...');
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    logDebug(`ServiceWorker install state changed: ${newWorker.state}`);
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        logDebug('New ServiceWorker installed. Displaying update toast.');
                        showUpdateToast(reg);
                    }
                });
            });
            
            // If there is already a waiting worker from a previous session, prompt user
            if (reg.waiting) {
                logDebug('ServiceWorker has waiting worker from previous session. Displaying update toast.');
                showUpdateToast(reg);
            }
        }).catch((err) => {
            logDebug(`ServiceWorker registration failed: ${err.message}`, 'error');
        });
    }
}

function showUpdateToast(registration) {
    const toast = document.getElementById('update-toast');
    toast.classList.remove('hidden');
    
    document.getElementById('update-btn').onclick = () => {
        // Tell the waiting worker to activate
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            // Fallback reload if worker reference was lost
            window.location.reload();
        }
        toast.classList.add('hidden');
    };
    
    document.getElementById('close-toast-btn').onclick = () => {
        toast.classList.add('hidden');
    };
}


// --- 3. WASM INTEGRATION ---
async function loadWasm() {
    const loadingScreen = document.getElementById('wasm-loading-screen');
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    
    try {
        logDebug('Fetching WebAssembly core...');
        const response = await fetch(CONFIG.wasmPath);
        if (!response.ok) throw new Error(`Wasm file could not be loaded: ${response.statusText}`);
        
        logDebug('Instantiating WebAssembly core...');
        const wasmBytes = await response.arrayBuffer();
        const wasmObj = await WebAssembly.instantiate(wasmBytes, {
            env: {
                jsPanic: (ptr, len) => {
                    const wasmMem = new Uint8Array(wasmExports.memory.buffer);
                    const decoder = new TextDecoder();
                    const message = decoder.decode(wasmMem.subarray(ptr, ptr + len));
                    logDebug(`Zig Wasm Panic: ${message}`, 'error');
                    alert(`A critical core engine error occurred: ${message}\nSwitching to JavaScript fallbacks.`);
                    setupJsFallbacks();
                }
            }
        });
        
        wasmExports = wasmObj.instance.exports;
        logDebug('Zig Core WebAssembly loaded successfully!');
        
        // Initialize the random seed in Zig core
        if (wasmExports.initSeed) {
            wasmExports.initSeed(BigInt(Date.now()));
        }
    } catch (err) {
        logDebug(`WebAssembly loading failed. Using JS Fallbacks. Error: ${err.message}`, 'error');
        setupJsFallbacks();
    } finally {
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }
}

// Fallback functions in pure JS in case WebAssembly isn't supported or fails to load
function setupJsFallbacks() {
    wasmExports = {
        calculateLevel: (xp) => Math.floor(Math.sqrt(xp / 100)) + 1,
        xpForNextLevel: (lvl) => lvl * lvl * 100,
        xpForCurrentLevel: (lvl) => (lvl <= 1) ? 0 : (lvl - 1) * (lvl - 1) * 100,
        validateSpelling: (typedPtr, typedLen, expectedPtr, expectedLen) => {
            const decoder = new TextDecoder();
            const memoryBuffer = new Uint8Array(wasmExports.memory.buffer);
            
            const typed = decoder.decode(memoryBuffer.subarray(typedPtr, typedPtr + typedLen));
            const expected = decoder.decode(memoryBuffer.subarray(expectedPtr, expectedPtr + expectedLen));
            
            const clean = (s) => s.trim().toLowerCase().replace(/^(der|die|das)\s+/i, '');
            return clean(typed) === clean(expected) ? 1 : 0;
        },
        shuffleArray: (ptr, len) => {
            const view = new Uint32Array(wasmExports.memory.buffer, ptr, len);
            for (let i = len - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = view[i];
                view[i] = view[j];
                view[j] = temp;
            }
        },
        memory: {
            buffer: new ArrayBuffer(65536 * 10)
        },
        getTypedBufferPointer: () => 0,
        getExpectedBufferPointer: () => 256,
        getShuffleBufferPointer: () => 512,
        getBufferMaxSize: () => 256,
        getShuffleBufferMaxSize: () => 64
    };
}

// Helper to call validateSpelling in Zig Wasm
function verifySpellingWithWasm(typed, expected) {
    if (!wasmExports) return false;
    
    const typedPtr = wasmExports.getTypedBufferPointer();
    const expectedPtr = wasmExports.getExpectedBufferPointer();
    const maxSize = wasmExports.getBufferMaxSize();
    
    const encoder = new TextEncoder();
    const typedBytes = encoder.encode(typed);
    const expectedBytes = encoder.encode(expected);
    
    const typedLen = Math.min(typedBytes.length, maxSize);
    const expectedLen = Math.min(expectedBytes.length, maxSize);
    
    const wasmMem = new Uint8Array(wasmExports.memory.buffer);
    wasmMem.set(typedBytes.subarray(0, typedLen), typedPtr);
    wasmMem.set(expectedBytes.subarray(0, expectedLen), expectedPtr);
    
    const result = wasmExports.validateSpelling(typedPtr, typedLen, expectedPtr, expectedLen);
    return result === 1;
}

// Helper to shuffle an array of indices using Zig Wasm
function shuffleIndicesWithWasm(len) {
    if (!wasmExports || len <= 1) {
        const arr = Array.from({length: len}, (_, i) => i);
        return arr.sort(() => Math.random() - 0.5);
    }
    
    const maxShuffleSize = wasmExports.getShuffleBufferMaxSize();
    const shuffleSize = Math.min(len, maxShuffleSize);
    const shufflePtr = wasmExports.getShuffleBufferPointer();
    
    const wasmMemU32 = new Uint32Array(wasmExports.memory.buffer, shufflePtr, shuffleSize);
    for (let i = 0; i < shuffleSize; i++) {
        wasmMemU32[i] = i;
    }
    
    wasmExports.shuffleArray(shufflePtr, shuffleSize);
    
    const shuffled = [];
    for (let i = 0; i < shuffleSize; i++) {
        shuffled.push(wasmMemU32[i]);
    }
    
    for (let i = shuffleSize; i < len; i++) {
        shuffled.push(i);
    }
    
    return shuffled;
}

// --- 4. DATA LOADING & SAVE ---
async function loadVocabulary() {
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

function loadProgress() {
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

function saveProgress() {
    localStorage.setItem('user_xp', state.xp);
    localStorage.setItem('user_level', state.level);
    localStorage.setItem('user_mastery', JSON.stringify(state.mastery));
    localStorage.setItem('user_stickers', JSON.stringify(state.stickers));
    updateXPBar();
}

function addXP(amount) {
    state.xp += amount;
    
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
    } else {
        alert(`🎉 LEVEL UP! You reached Level ${state.level}! 🌟 Keep it up!`);
    }
}

// --- 5. UI CONTROLLERS ---
function initUI() {
    // Navigation
    document.getElementById('nav-logo').addEventListener('click', () => switchScreen('dashboard'));
    document.getElementById('nav-dashboard-btn').addEventListener('click', () => switchScreen('dashboard'));
    document.getElementById('nav-creator-btn').addEventListener('click', () => {
        switchScreen('creator');
        renderCreatorTable();
    });
    document.getElementById('nav-stickers-btn').addEventListener('click', () => {
        switchScreen('stickers');
        renderStickerAlbum();
    });
    document.getElementById('nav-settings-btn').addEventListener('click', () => switchScreen('settings'));
    
    // Modal controls
    document.getElementById('close-game-modal').addEventListener('click', hideGameModal);
    
    // Game Exit / Back button
    document.getElementById('game-back-btn').addEventListener('click', () => {
        if(confirm('Do you want to leave the game? Your progress in this session will be lost.')) {
            switchScreen('dashboard');
        }
    });
    
    // Game Finish
    document.getElementById('game-finish-btn').addEventListener('click', () => {
        document.getElementById('game-over-overlay').classList.add('hidden');
        switchScreen('dashboard');
    });
    
    // Form submission inside Content Creator
    document.getElementById('vocab-form').addEventListener('submit', handleAddVocab);
    
    // Reset Progress
    document.getElementById('reset-progress-btn').addEventListener('click', () => {
        if (confirm('Do you really want to reset your entire learning progress (Level & XP)?')) {
            localStorage.clear();
            state.xp = CONFIG.defaultXP;
            state.level = 1;
            state.customVocabulary = [];
            state.mastery = {};
            state.stickers = [];
            loadVocabulary().then(() => {
                saveProgress();
                renderCategories();
                alert('Progress reset successfully!');
                switchScreen('dashboard');
            });
        }
    });

    // Theme toggles
    const handleThemeToggle = () => toggleTheme();
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', handleThemeToggle);
    const settingsThemeBtn = document.getElementById('settings-theme-toggle-btn');
    if (settingsThemeBtn) settingsThemeBtn.addEventListener('click', handleThemeToggle);

    // Debug Log controls
    const copyBtn = document.getElementById('copy-debug-logs-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(debugLogs.join('\n')).then(() => {
                alert('Debug logs copied to clipboard!');
            }).catch(err => {
                alert('Failed to copy logs: ' + err);
            });
        });
    }
    
    const clearBtn = document.getElementById('clear-debug-logs-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            debugLogs.length = 0;
            const outputEl = document.getElementById('debug-log-output');
            if (outputEl) outputEl.textContent = 'No logs. System running normally.';
        });
    }

    // Check offline status
    const updateOnlineStatus = () => {
        const badge = document.getElementById('online-status-badge');
        if (navigator.onLine) {
            badge.textContent = "Online";
            badge.className = "badge green";
        } else {
            badge.textContent = "Offline";
            badge.className = "badge warning";
        }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
    
    // Trigger actual update check
    document.getElementById('trigger-update-check-btn').addEventListener('click', () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.update().then(() => {
                    if (!reg.waiting && !reg.installing) {
                        alert(`Checking for updates... Application is up to date (${CONFIG.version}).`);
                    } else {
                        alert("A new version is available! The update banner will now appear.");
                    }
                }).catch(err => {
                    console.error("Update check failed:", err);
                    alert(`Checking for updates... Application is up to date (${CONFIG.version}).`);
                });
            });
        } else {
            alert(`Application is up to date (${CONFIG.version}).`);
        }
    });
    
    // Export vocabulary JSON
    document.getElementById('export-json-btn').addEventListener('click', exportVocabJSON);
    
    // Language dropdown change
    const langSelect = document.getElementById('settings-language-select');
    if (langSelect) {
        langSelect.value = state.language || 'de';
        langSelect.addEventListener('change', (e) => {
            applyLanguage(e.target.value);
        });
    }

    // Help buttons logic
    const matchHelpText = document.getElementById('match-help-text');
    const matchHelpBtn = document.getElementById('match-help-btn');
    if (matchHelpBtn && matchHelpText) {
        matchHelpBtn.addEventListener('click', () => {
            const correctCard = state.sessionCards[state.currentCardIndex];
            if (correctCard) {
                matchHelpText.textContent = getWordTranslation(correctCard);
                matchHelpText.classList.toggle('hidden');
            }
        });
    }

    const spellingHelpText = document.getElementById('spelling-help-text');
    const spellingHelpBtn = document.getElementById('spelling-help-btn');
    if (spellingHelpBtn && spellingHelpText) {
        spellingHelpBtn.addEventListener('click', () => {
            const correctCard = state.sessionCards[state.currentCardIndex];
            if (correctCard) {
                spellingHelpText.textContent = getWordTranslation(correctCard);
                spellingHelpText.classList.toggle('hidden');
            }
        });
    }
}

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const matchingBtn = document.getElementById(`nav-${screenId}-btn`);
    if (matchingBtn) matchingBtn.classList.add('active');
    
    hideGameModal();
}

function updateXPBar() {
    document.getElementById('user-level').textContent = state.level;
    
    if (wasmExports) {
        const currentLvlXP = wasmExports.xpForCurrentLevel(state.level);
        const nextLvlXP = wasmExports.xpForNextLevel(state.level);
        const relativeXP = state.xp - currentLvlXP;
        const totalNeeded = nextLvlXP - currentLvlXP;
        
        const percentage = Math.min(Math.max((relativeXP / totalNeeded) * 100, 0), 100);
        document.getElementById('user-xp-fill').style.width = `${percentage}%`;
        document.getElementById('user-xp-text').textContent = `${state.xp} / ${nextLvlXP} XP`;
    }
}

// --- 6. CATEGORIES RENDER ---
function renderCategories() {
    const categoriesSet = new Set(state.vocabulary.map(v => v.category));
    const categories = Array.from(categoriesSet);
    
    const container = document.getElementById('categories-container');
    container.innerHTML = '';
    
    const categoryIcons = {
        'Tiere': '🐶',
        'Essen': '🍎',
        'Farben': '🔴',
        'Schule': '🎒',
        'Kleidung': '🧥'
    };
    
    const categoryColors = {
        'Tiere': '#FF9F1C',
        'Essen': '#FF5B7F',
        'Farben': '#3A86FF',
        'Schule': '#2EC4B6',
        'Kleidung': '#8338EC'
    };

    // English localized headers for children in the UI
    const categoryNamesEn = {
        'Tiere': 'Animals (Tiere)',
        'Essen': 'Food (Essen)',
        'Farben': 'Colors (Farben)',
        'Schule': 'School (Schule)',
        'Kleidung': 'Clothes (Kleidung)'
    };

    categories.forEach(cat => {
        const count = state.vocabulary.filter(v => v.category === cat).length;
        const card = document.createElement('button');
        card.className = 'category-card';
        card.style.setProperty('--card-accent', categoryColors[cat] || '#5271FF');
        
        const emoji = categoryIcons[cat] || '⭐';
        const displayName = categoryNamesEn[cat] || cat;
        
        card.innerHTML = `
            <span class="category-emoji">${emoji}</span>
            <h3>${displayName}</h3>
            <span>${count} Words</span>
        `;
        
        card.addEventListener('click', () => showGameModal(cat));
        container.appendChild(card);
    });
}

function showGameModal(category) {
    state.activeCategory = category;
    
    const categoryNamesEn = {
        'Tiere': 'Animals (Tiere)',
        'Essen': 'Food (Essen)',
        'Farben': 'Colors (Farben)',
        'Schule': 'School (Schule)',
        'Kleidung': 'Clothes (Kleidung)'
    };
    
    document.getElementById('modal-category-title').textContent = categoryNamesEn[category] || category;
    document.getElementById('game-mode-modal').classList.remove('hidden');
    
    document.getElementById('start-game-match').onclick = () => startGame('match');
    document.getElementById('start-game-spelling').onclick = () => startGame('spelling');
    document.getElementById('start-game-memory').onclick = () => startGame('memory');
}

function hideGameModal() {
    document.getElementById('game-mode-modal').classList.add('hidden');
}

// --- 7. GAME PLAY ENGINE ---
function startGame(gameType) {
    hideGameModal();
    state.activeGame = gameType;
    state.gameScore = 0;
    document.getElementById('game-score').textContent = '0';
    
    const catWords = state.vocabulary.filter(w => w.category === state.activeCategory);
    
    if (catWords.length < 3 && gameType !== 'memory') {
        alert('Not enough vocabulary in this category! Please add more cards first.');
        return;
    }
    if (catWords.length < 4 && gameType === 'memory') {
        alert('Memory match game requires at least 4 vocabulary cards in this category!');
        return;
    }
    
    const gameConfigs = {
        'match': { title: 'Word-Image Quiz', icon: '🖼️' },
        'spelling': { title: 'Spelling Game', icon: '🔤' },
        'memory': { title: 'Memory Match', icon: '🎴' }
    };
    document.getElementById('game-active-icon').textContent = gameConfigs[gameType].icon;
    document.getElementById('game-active-name').textContent = gameConfigs[gameType].title;
    
    switchScreen('game');
    
    document.getElementById('game-view-match').classList.add('hidden');
    document.getElementById('game-view-spelling').classList.add('hidden');
    document.getElementById('game-view-memory').classList.add('hidden');
    
    if (gameType === 'memory') {
        state.sessionCards = getWeightedRandomWords(catWords, 4);
    } else {
        state.sessionCards = getWeightedRandomWords(catWords, 5);
    }
    state.currentCardIndex = 0;
    
    if (gameType === 'match') {
        document.getElementById('game-view-match').classList.remove('hidden');
        loadMatchRound();
    } else if (gameType === 'spelling') {
        document.getElementById('game-view-spelling').classList.remove('hidden');
        loadSpellingRound();
    } else if (gameType === 'memory') {
        document.getElementById('game-view-memory').classList.remove('hidden');
        loadMemoryGame();
    }
}

// --- GAME 1: Wort-Bild-Rätsel ---
function loadMatchRound() {
    if (state.currentCardIndex >= state.sessionCards.length) {
        endGame();
        return;
    }
    
    // Hide help text from previous round
    const helpText = document.getElementById('match-help-text');
    if (helpText) helpText.classList.add('hidden');
    
    const correctCard = state.sessionCards[state.currentCardIndex];
    document.getElementById('match-question-emoji').textContent = correctCard.emoji;
    
    const otherOptions = state.vocabulary
        .filter(w => w.id !== correctCard.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
        
    const choices = [correctCard, ...otherOptions];
    const shuffledChoicesIdx = shuffleIndicesWithWasm(choices.length);
    const finalChoices = shuffledChoicesIdx.map(idx => choices[idx]);
    
    const optionsContainer = document.getElementById('match-options-container');
    optionsContainer.innerHTML = '';
    
    finalChoices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'option-btn notranslate';
        btn.setAttribute('translate', 'no');
        
        const article = choice.word.split(' ')[0].toLowerCase();
        if (article === 'der') btn.classList.add('article-btn-der');
        else if (article === 'die') btn.classList.add('article-btn-die');
        else if (article === 'das') btn.classList.add('article-btn-das');
        
        let displayWord = choice.word;
        if (['der', 'die', 'das'].includes(article)) {
            const noun = choice.word.substring(article.length).trim();
            displayWord = `<span class="word-${article}">${article}</span> ${noun}`;
        }
        
        btn.innerHTML = displayWord;
        btn.addEventListener('click', () => verifyMatchAnswer(btn, choice, correctCard));
        optionsContainer.appendChild(btn);
    });
}

function verifyMatchAnswer(button, selectedChoice, correctCard) {
    document.querySelectorAll('#match-options-container button').forEach(b => b.style.pointerEvents = 'none');
    
    const isCorrect = selectedChoice.id === correctCard.id;
    if (isCorrect) {
        button.classList.add('correct');
        const xpGained = getXPReward(correctCard);
        state.gameScore += xpGained;
        document.getElementById('game-score').textContent = state.gameScore;
        updateMastery(correctCard.id, true);
        
        setTimeout(() => {
            state.currentCardIndex++;
            loadMatchRound();
        }, 1200);
    } else {
        button.classList.add('wrong');
        updateMastery(correctCard.id, false);
        setTimeout(() => {
            button.classList.remove('wrong');
            document.querySelectorAll('#match-options-container button').forEach(b => b.style.pointerEvents = 'auto');
        }, 1000);
    }
}

// --- GAME 2: Buchstabieren ---
function loadSpellingRound() {
    if (state.currentCardIndex >= state.sessionCards.length) {
        endGame();
        return;
    }
    
    // Hide help text from previous round
    const helpText = document.getElementById('spelling-help-text');
    if (helpText) helpText.classList.add('hidden');
    
    const correctCard = state.sessionCards[state.currentCardIndex];
    document.getElementById('spelling-question-emoji').textContent = correctCard.emoji;
    
    state.spellingTypedLetters = [];
    
    const cleanWord = correctCard.word.replace(/^(der|die|das)\s+/i, '').trim();
    const letters = cleanWord.split('');
    
    const slotsContainer = document.getElementById('spelling-slots');
    slotsContainer.innerHTML = '';
    letters.forEach(() => {
        const slot = document.createElement('div');
        slot.className = 'letter-slot notranslate';
        slot.setAttribute('translate', 'no');
        slotsContainer.appendChild(slot);
    });
    
    const indices = Array.from({length: letters.length}, (_, i) => i);
    const shuffledIndices = shuffleIndicesWithWasm(letters.length);
    const shuffledLetters = shuffledIndices.map(idx => letters[idx]);
    
    const poolContainer = document.getElementById('spelling-letters-pool');
    poolContainer.innerHTML = '';
    
    shuffledLetters.forEach((letter, index) => {
        const btn = document.createElement('button');
        btn.className = 'pool-letter notranslate';
        btn.setAttribute('translate', 'no');
        btn.textContent = letter;
        btn.dataset.poolIndex = index;
        
        btn.addEventListener('click', () => {
            if (state.spellingTypedLetters.length < letters.length) {
                state.spellingTypedLetters.push({ letter, poolIndex: index });
                btn.classList.add('used');
                updateSpellingSlots();
            }
        });
        poolContainer.appendChild(btn);
    });
    
    document.getElementById('spelling-clear-btn').onclick = () => {
        state.spellingTypedLetters = [];
        document.querySelectorAll('.pool-letter').forEach(btn => btn.classList.remove('used'));
        updateSpellingSlots();
    };
    
    document.getElementById('spelling-submit-btn').onclick = () => {
        const typedWord = state.spellingTypedLetters.map(x => x.letter).join('');
        
        const isCorrect = verifySpellingWithWasm(typedWord, cleanWord);
        
        if (isCorrect) {
            document.querySelectorAll('.letter-slot').forEach(slot => slot.classList.add('filled', 'correct'));
            const xpGained = getXPReward(correctCard);
            state.gameScore += xpGained;
            document.getElementById('game-score').textContent = state.gameScore;
            updateMastery(correctCard.id, true);
            
            setTimeout(() => {
                state.currentCardIndex++;
                loadSpellingRound();
            }, 1200);
        } else {
            updateMastery(correctCard.id, false);
            const slots = document.getElementById('spelling-slots');
            slots.style.animation = 'shake 0.4s ease';
            setTimeout(() => {
                slots.style.animation = '';
                document.getElementById('spelling-clear-btn').click();
            }, 500);
        }
    };
}

function updateSpellingSlots() {
    const slots = document.querySelectorAll('.letter-slot');
    slots.forEach((slot, idx) => {
        if (idx < state.spellingTypedLetters.length) {
            slot.textContent = state.spellingTypedLetters[idx].letter;
            slot.classList.add('filled');
        } else {
            slot.textContent = '';
            slot.classList.remove('filled');
        }
    });
}

// --- GAME 3: Memory ---
function loadMemoryGame() {
    const cards = [];
    
    state.sessionCards.forEach(item => {
        cards.push({
            id: item.id,
            type: 'word',
            value: item.word
        });
        cards.push({
            id: item.id,
            type: 'emoji',
            value: item.emoji
        });
    });
    
    const shuffledIndexes = shuffleIndicesWithWasm(cards.length);
    const shuffledCards = shuffledIndexes.map(idx => cards[idx]);
    
    state.selectedMemoryCards = [];
    state.matchedMemoryPairs = 0;
    
    const container = document.getElementById('memory-grid-container');
    container.innerHTML = '';
    
    shuffledCards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'memory-card';
        cardEl.dataset.index = index;
        cardEl.dataset.id = card.id;
        
        const front = document.createElement('div');
        front.className = 'memory-card-front notranslate';
        front.setAttribute('translate', 'no');
        front.textContent = card.value;
        
        if (card.type === 'word') {
            front.classList.add('is-word');
            const article = card.value.split(' ')[0].toLowerCase();
            if (article === 'der') front.classList.add('word-der');
            else if (article === 'die') front.classList.add('word-die');
            else if (article === 'das') front.classList.add('word-das');
        } else {
            front.classList.add('is-emoji');
        }
        
        const back = document.createElement('div');
        back.className = 'memory-card-back';
        
        cardEl.appendChild(front);
        cardEl.appendChild(back);
        
        cardEl.addEventListener('click', () => flipMemoryCard(cardEl, card));
        container.appendChild(cardEl);
    });
}

function flipMemoryCard(cardEl, cardData) {
    if (state.selectedMemoryCards.length >= 2 || 
        cardEl.classList.contains('flipped') || 
        cardEl.classList.contains('matched')) {
        return;
    }
    
    cardEl.classList.add('flipped');
    state.selectedMemoryCards.push({ el: cardEl, data: cardData });
    
    if (state.selectedMemoryCards.length === 2) {
        checkMemoryMatch();
    }
}

function checkMemoryMatch() {
    const [cardA, cardB] = state.selectedMemoryCards;
    const isMatch = cardA.data.id === cardB.data.id;
    
    if (isMatch) {
        setTimeout(() => {
            cardA.el.classList.add('matched');
            cardB.el.classList.add('matched');
            state.matchedMemoryPairs++;
            
            const xpGained = getXPReward(cardA.data) + 5; // Extra bonus for matching memory pairs
            state.gameScore += xpGained;
            document.getElementById('game-score').textContent = state.gameScore;
            updateMastery(cardA.data.id, true);
            
            state.selectedMemoryCards = [];
            
            if (state.matchedMemoryPairs === state.sessionCards.length) {
                setTimeout(endGame, 1000);
            }
        }, 600);
    } else {
        setTimeout(() => {
            cardA.el.classList.remove('flipped');
            cardB.el.classList.remove('flipped');
            state.selectedMemoryCards = [];
        }, 1200);
    }
}

// --- END GAME SESSIONS ---
function endGame() {
    const overlay = document.getElementById('game-over-overlay');
    const xpGainedEl = document.getElementById('xp-gained');
    
    const xpGained = state.gameScore;
    xpGainedEl.textContent = xpGained;
    
    overlay.classList.remove('hidden');
    addXP(xpGained);
}

// --- 8. VISUAL CONTENT CREATOR CONTROLLERS ---
function handleAddVocab(e) {
    e.preventDefault();
    
    const articleSelect = document.getElementById('vocab-article');
    const wordInput = document.getElementById('vocab-word');
    const transInput = document.getElementById('vocab-translation');
    const emojiInput = document.getElementById('vocab-emoji');
    const catSelect = document.getElementById('vocab-category');
    const diffSelect = document.getElementById('vocab-difficulty');
    
    const article = articleSelect.value;
    const cleanWord = wordInput.value.trim();
    const cleanTrans = transInput.value.trim();
    const cleanEmoji = emojiInput.value.trim();
    
    // VALIDATION FOR ERROR HANDLING
    if (!cleanWord || !cleanTrans || !cleanEmoji) {
        alert('Please fill out all vocabulary fields (German Word, Translation, and Emoji) before adding a card!');
        return;
    }
    
    let finalWord = cleanWord;
    if (article !== '-') {
        finalWord = `${article} ${cleanWord}`;
    }
    
    const newCard = {
        id: cleanWord.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now(),
        word: finalWord,
        translation: cleanTrans,
        category: catSelect.value,
        emoji: cleanEmoji,
        difficulty: parseInt(diffSelect.value)
    };
    
    state.customVocabulary.push(newCard);
    state.vocabulary.push(newCard);
    
    localStorage.setItem('custom_vocab', JSON.stringify(state.customVocabulary));
    logDebug(`Added custom word card: "${newCard.word}" to category "${newCard.category}"`);
    
    wordInput.value = '';
    transInput.value = '';
    emojiInput.value = '';
    
    renderCreatorTable();
    renderCategories();
    
    alert('Vocabulary card added successfully! You can use it in the games immediately.');
}

function renderCreatorTable() {
    const tbody = document.getElementById('vocab-table-body');
    tbody.innerHTML = '';
    
    document.getElementById('vocab-count').textContent = state.vocabulary.length;
    
    state.vocabulary.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        const isCustom = state.customVocabulary.some(cv => cv.id === item.id);
        if (isCustom) {
            tr.style.backgroundColor = 'rgba(82, 113, 255, 0.04)';
        }
        
        tr.innerHTML = `
            <td style="font-size: 1.5rem;">${item.emoji}</td>
            <td><strong>${item.word}</strong></td>
            <td style="color: var(--text-muted);">${getWordTranslation(item)}</td>
            <td><span class="badge blue">${item.category}</span></td>
            <td>
                ${isCustom ? `<button class="badge-delete-btn" onclick="deleteCustomVocab('${item.id}')" title="Delete">❌</button>` : `<span style="color: var(--text-muted); font-size: 0.8rem;">Default</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteCustomVocab = function(id) {
    if (confirm('Do you want to delete this vocabulary card?')) {
        state.customVocabulary = state.customVocabulary.filter(v => v.id !== id);
        localStorage.setItem('custom_vocab', JSON.stringify(state.customVocabulary));
        
        loadVocabulary().then(() => {
            renderCreatorTable();
            renderCategories();
        });
    }
};

function exportVocabJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.vocabulary, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "vocabulary.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// --- THEME MANAGEMENT ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark' || !savedTheme) {
        document.documentElement.classList.add('dark-mode');
        updateThemeButtons(true);
    } else {
        document.documentElement.classList.remove('dark-mode');
        updateThemeButtons(false);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeButtons(isDark);
}

function updateThemeButtons(isDark) {
    const themeBtn = document.getElementById('theme-toggle-btn');
    const settingsThemeBtn = document.getElementById('settings-theme-toggle-btn');
    
    const emoji = isDark ? '☀️' : '🌙';
    const text = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    const title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    
    if (themeBtn) {
        themeBtn.textContent = emoji;
        themeBtn.title = title;
    }
    if (settingsThemeBtn) {
        settingsThemeBtn.textContent = text;
    }
}

// --- MASTERY & ALGORITHM HELPERS ---
function getXPReward(card) {
    if (!state.mastery) state.mastery = {};
    const mastery = state.mastery[card.id] || 0;
    if (mastery <= 1) return 15; // New / Unfamiliar
    if (mastery === 2) return 8;  // Familiar
    return 3;                     // Mastered
}

function updateMastery(wordId, isCorrect) {
    if (!state.mastery) state.mastery = {};
    const current = state.mastery[wordId] || 0;
    if (isCorrect) {
        state.mastery[wordId] = Math.min(3, current + 1);
    } else {
        state.mastery[wordId] = Math.max(0, current - 1);
    }
    saveProgress();
}

function getWeightedRandomWords(words, count) {
    if (!state.mastery) state.mastery = {};
    
    const weighted = words.map(word => {
        const mastery = state.mastery[word.id] || 0;
        let weight = 1.0;
        if (mastery === 2) weight = 0.4;
        else if (mastery >= 3) weight = 0.1;
        return { word, weight };
    });
    
    const selected = [];
    const pool = [...weighted];
    
    while (selected.length < count && pool.length > 0) {
        const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
        if (totalWeight <= 0) break;
        
        let random = Math.random() * totalWeight;
        let foundIdx = -1;
        
        for (let i = 0; i < pool.length; i++) {
            random -= pool[i].weight;
            if (random <= 0) {
                foundIdx = i;
                break;
            }
        }
        if (foundIdx === -1) foundIdx = pool.length - 1;
        
        selected.push(pool[foundIdx].word);
        pool.splice(foundIdx, 1);
    }
    
    // Fill remaining spots if needed
    while (selected.length < count && words.length > 0) {
        const missing = words.find(w => !selected.some(s => s.id === w.id));
        if (!missing) break;
        selected.push(missing);
    }
    
    return selected;
}

// --- STICKER CONFIGURATION & SYSTEM ---
const STICKERS_CONFIG = [
    { level: 1, emoji: '🐱', name: { de: 'Katze', en: 'Cat', ar: 'قطة', uk: 'Кішка', tr: 'Kedi', ru: 'Кошка' } },
    { level: 1, emoji: '🐶', name: { de: 'Hund', en: 'Dog', ar: 'كلب', uk: 'Собака', tr: 'Köpek', ru: 'Собака' } },
    { level: 1, emoji: '⚽', name: { de: 'Ball', en: 'Ball', ar: 'كرة', uk: 'М\'яч', tr: 'Top', ru: 'Мяч' } },
    { level: 2, emoji: '🦁', name: { de: 'Löwe', en: 'Lion', ar: 'أسد', uk: 'Лев', tr: 'Aslan', ru: 'Лев' } },
    { level: 3, emoji: '🚀', name: { de: 'Rakete', en: 'Rocket', ar: 'صاروخ', uk: 'Ракета', tr: 'Roket', ru: 'Ракета' } },
    { level: 4, emoji: '🦄', name: { de: 'Einhorn', en: 'Unicorn', ar: 'وحيد القرن', uk: 'Єдиноріг', tr: 'Tek boynuzlu at', ru: 'Единорог' } },
    { level: 5, emoji: '🦖', name: { de: 'Dino', en: 'Dinosaur', ar: 'ديนาصور', uk: 'Динозавр', tr: 'Dinozor', ru: 'Динозавр' } },
    { level: 6, emoji: '🐬', name: { de: 'Delfin', en: 'Dolphin', ar: 'دولفين', uk: 'Дельфін', tr: 'Yunus', ru: 'Дельфін' } },
    { level: 7, emoji: '🧸', name: { de: 'Teddy', en: 'Teddy Bear', ar: 'دبدوب', uk: 'Ведмедик', tr: 'Oyuncak ayı', ru: 'Мишка' } },
    { level: 8, emoji: '🦊', name: { de: 'Fuchs', en: 'Fox', ar: 'ثعلب', uk: 'Лис', tr: 'Tilki', ru: 'Лиса' } },
    { level: 9, emoji: '🦉', name: { de: 'Eule', en: 'Owl', ar: 'بومة', uk: 'Сова', tr: 'Baykuş', ru: 'Сова' } },
    { level: 10, emoji: '👑', name: { de: 'Krone', en: 'Crown', ar: 'تاج', uk: 'Корона', tr: 'Taç', ru: 'Корона' } }
];

function renderStickerAlbum() {
    const container = document.getElementById('sticker-grid-container');
    if (!container) return;
    container.innerHTML = '';
    
    const lang = state.language || 'de';
    
    STICKERS_CONFIG.forEach(sticker => {
        const isUnlocked = state.level >= sticker.level;
        const card = document.createElement('div');
        card.className = `sticker-item ${isUnlocked ? '' : 'locked'}`;
        
        const emojiEl = document.createElement('span');
        emojiEl.className = 'sticker-emoji';
        emojiEl.textContent = sticker.emoji;
        card.appendChild(emojiEl);
        
        const labelEl = document.createElement('span');
        labelEl.className = 'sticker-label';
        
        if (isUnlocked) {
            labelEl.textContent = sticker.name[lang] || sticker.name['de'];
        } else {
            labelEl.textContent = `Lvl ${sticker.level}`;
            
            const lockEl = document.createElement('div');
            lockEl.className = 'sticker-lock-badge';
            lockEl.textContent = '🔒';
            card.appendChild(lockEl);
        }
        
        card.appendChild(labelEl);
        
        if (isUnlocked) {
            card.addEventListener('click', () => {
                if (card.classList.contains('clicked')) return;
                card.classList.add('clicked');
                setTimeout(() => card.classList.remove('clicked'), 600);
            });
        }
        
        container.appendChild(card);
    });
}

// --- CONFETTI PARTICLE ENGINE ---
let confettiActive = false;
const confettiParticles = [];
const confettiColors = ['#FF5B7F', '#5271FF', '#2EC4B6', '#FF9F1C', '#8338EC'];

function startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    confettiActive = true;
    confettiParticles.length = 0;
    
    for (let i = 0; i < 150; i++) {
        confettiParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height - 20,
            size: Math.random() * 8 + 5,
            color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
            speedY: Math.random() * 3 + 2,
            speedX: Math.random() * 2 - 1,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        });
    }
    
    function animate() {
        if (!confettiActive) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let alive = false;
        confettiParticles.forEach(p => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;
            
            if (p.y < canvas.height) {
                alive = true;
            }
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        });
        
        if (alive) {
            requestAnimationFrame(animate);
        } else {
            confettiActive = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    animate();
}

// --- MULTILINGUAL LOCALIZATION (TRANSLATIONS) ---
const TRANSLATIONS = {
    de: {
        welcomeTitle: "Hallo! Was möchtest du heute lernen? 🌟",
        welcomeSubtitle: "Wähle eine Kategorie und starte ein Spiel!",
        chooseGame: "Wähle dein Lieblingsspiel:",
        creatorTitle: "Eigene Karten ✍️",
        creatorSubtitle: "Erstelle deine eigenen Vokabelkarten.",
        settingsTitle: "Einstellungen & Info ⚙️",
        settingsSubtitle: "Passe die App an und erfahre mehr über das Projekt.",
        stickersTitle: "Mein Sticker-Album 📖",
        stickersSubtitle: "Steige Level auf, um Sticker zu sammeln! Tippe sie an! ✨",
        settingsLangTitle: "🌐 Sprache / Language",
        settingsLangDesc: "Wähle die Sprache für Menüs und Anleitungen.",
        resetProgressBtn: "🗑️ Fortschritt zurücksetzen",
        themeToggleBtn: "🌓 Dark Mode umschalten",
        checkUpdatesBtn: "🔍 Nach Updates suchen",
        copyLogsBtn: "📋 Logs kopieren",
        clearLogsBtn: "🧹 Logs löschen",
        systemInfoTitle: "ℹ️ Systeminformationen"
    },
    en: {
        welcomeTitle: "Hello! What do you want to learn today? 🌟",
        welcomeSubtitle: "Choose a category and select a game!",
        chooseGame: "Select your favorite game:",
        creatorTitle: "Content Creator ✍️",
        creatorSubtitle: "Create your own custom vocabulary cards.",
        settingsTitle: "Settings & Info ⚙️",
        settingsSubtitle: "Adjust your local settings and read details about the project.",
        stickersTitle: "My Sticker Album 📖",
        stickersSubtitle: "Level up to collect all stickers! Tap unlocked stickers for a surprise! ✨",
        settingsLangTitle: "🌐 Language / Sprache",
        settingsLangDesc: "Choose your preferred language for the buttons and instructions.",
        resetProgressBtn: "🗑️ Reset Progress",
        themeToggleBtn: "🌓 Toggle Dark Mode",
        checkUpdatesBtn: "🔍 Check for Updates",
        copyLogsBtn: "📋 Copy Logs",
        clearLogsBtn: "🧹 Clear Logs",
        systemInfoTitle: "ℹ️ System Information"
    },
    ar: {
        welcomeTitle: "مرحباً! ماذا تريد أن تتعلم اليوم؟ 🌟",
        welcomeSubtitle: "اختر فئة وابدأ اللعبة!",
        chooseGame: "اختر لعبتك المفضلة:",
        creatorTitle: "صانع المحتوى ✍️",
        creatorSubtitle: "أنشئ بطاقات المفردات الخاصة بك.",
        settingsTitle: "الإعدادات والمعلومات ⚙️",
        settingsSubtitle: "اضبط إعداداتك المحلية واقرأ تفاصيل المشروع.",
        stickersTitle: "ألبوم الملصقات الخاص بي 📖",
        stickersSubtitle: "ارتفع في المستوى لجمع كل الملصقات! اضغط عليها لمفاجأة! ✨",
        settingsLangTitle: "🌐 اللغة / Language",
        settingsLangDesc: "اختر لغتك المفضلة للأزرار والتعليمات.",
        resetProgressBtn: "🗑️ إعادة تعيين التقدم",
        themeToggleBtn: "🌓 تبديل الوضع الداكن",
        checkUpdatesBtn: "🔍 التحقق من التحديثات",
        copyLogsBtn: "📋 نسخ السجلات",
        clearLogsBtn: "🧹 مسح السجلات",
        systemInfoTitle: "ℹ️ معلومات النظام"
    },
    uk: {
        welcomeTitle: "Привіт! Що ти хочеш вивчити сьогодні? 🌟",
        welcomeSubtitle: "Вибери категорію та вибери гру!",
        chooseGame: "Вибери свою улюблену гру:",
        creatorTitle: "Створення карток ✍️",
        creatorSubtitle: "Створюйте власні картки зі словами.",
        settingsTitle: "Налаштування та інформація ⚙️",
        settingsSubtitle: "Налаштуйте локальні параметри та дізнайтеся більше про проект.",
        stickersTitle: "Мій альбом наліпок 📖",
        stickersSubtitle: "Підвищуй рівень, щоб збирати наліпки! Тисни на них! ✨",
        settingsLangTitle: "🌐 Мова / Language",
        settingsLangDesc: "Виберіть потрібну мову для кнопок та інструкцій.",
        resetProgressBtn: "🗑️ Скинути прогрес",
        themeToggleBtn: "🌓 Перемкнути темну тему",
        checkUpdatesBtn: "🔍 Перевірити оновлення",
        copyLogsBtn: "📋 Копіювати логи",
        clearLogsBtn: "🧹 Очистити логи",
        systemInfoTitle: "ℹ️ Системна інформація"
    },
    tr: {
        welcomeTitle: "Merhaba! Bugün ne öğrenmek istersin? 🌟",
        welcomeSubtitle: "Bir kategori seç ve oyuna başla!",
        chooseGame: "En sevdiğin oyunu seç:",
        creatorTitle: "Kart Oluşturucu ✍️",
        creatorSubtitle: "Kendi özel kelime kartlarınızı oluşturun.",
        settingsTitle: "Ayarlar ve Bilgi ⚙️",
        settingsSubtitle: "Yerel ayarlarınızı düzenleyin ve proje ayrıntılarını okuyun.",
        stickersTitle: "Sticker Albümüm 📖",
        stickersSubtitle: "Tüm stickerları toplamak için seviye atla! Dokun onlara! ✨",
        settingsLangTitle: "🌐 Dil / Language",
        settingsLangDesc: "Düğmeler ve talimatlar için tercih ettiğiniz dili seçin.",
        resetProgressBtn: "🗑️ İlerlemeyi Sıfırla",
        themeToggleBtn: "🌓 Karanlık Modu Değiştir",
        checkUpdatesBtn: "🔍 Güncellemeleri Denetle",
        copyLogsBtn: "📋 Günlükleri Kopyala",
        clearLogsBtn: "🧹 Günlükleri Temizle",
        systemInfoTitle: "ℹ️ Sistem Bilgisi"
    },
    ru: {
        welcomeTitle: "Привет! Что ты хочешь выучить сегодня? 🌟",
        welcomeSubtitle: "Выбери категорию и начни игру!",
        chooseGame: "Выбери свою любимую игру:",
        creatorTitle: "Создатель карт ✍️",
        creatorSubtitle: "Создавайте свои собственные карточки со словами.",
        settingsTitle: "Настройки и информация ⚙️",
        settingsSubtitle: "Настройте локальные параметры и узнайте подробности о проекте.",
        stickersTitle: "Мой альбом наклеек 📖",
        stickersSubtitle: "Повышай уровень, чтобы собирать наклейки! Нажми на них! ✨",
        settingsLangTitle: "🌐 Язык / Language",
        settingsLangDesc: "Выберите предпочитаемый язык для кнопок и инструкций.",
        resetProgressBtn: "🗑️ Сбросить прогресс",
        themeToggleBtn: "🌓 Переключить темную тему",
        checkUpdatesBtn: "🔍 Проверить обновления",
        copyLogsBtn: "📋 Копировать логи",
        clearLogsBtn: "🧹 Очистить логи",
        systemInfoTitle: "ℹ️ Системная информация"
    }
};

function applyLanguage(lang) {
    state.language = lang;
    localStorage.setItem('user_language', lang);
    
    const t = TRANSLATIONS[lang] || TRANSLATIONS['de'];
    
    const dashboardHeroTitle = document.querySelector('#screen-dashboard .hero-section h2');
    if (dashboardHeroTitle) dashboardHeroTitle.textContent = t.welcomeTitle;
    const dashboardHeroSubtitle = document.querySelector('#screen-dashboard .hero-section p');
    if (dashboardHeroSubtitle) dashboardHeroSubtitle.textContent = t.welcomeSubtitle;
    
    const creatorHeroTitle = document.querySelector('#screen-creator .hero-section h2');
    if (creatorHeroTitle) creatorHeroTitle.textContent = t.creatorTitle;
    const creatorHeroSubtitle = document.querySelector('#screen-creator .hero-section p');
    if (creatorHeroSubtitle) creatorHeroSubtitle.textContent = t.creatorSubtitle;
    
    const settingsHeroTitle = document.querySelector('#screen-settings .hero-section h2');
    if (settingsHeroTitle) settingsHeroTitle.textContent = t.settingsTitle;
    const settingsHeroSubtitle = document.querySelector('#screen-settings .hero-section p');
    if (settingsHeroSubtitle) settingsHeroSubtitle.textContent = t.settingsSubtitle;
    
    const elMap = {
        'modal-category-title': t.chooseGame,
        'stickers-title': t.stickersTitle,
        'stickers-subtitle': t.stickersSubtitle,
        'settings-lang-title': t.settingsLangTitle,
        'settings-lang-desc': t.settingsLangDesc,
        'reset-progress-btn': t.resetProgressBtn,
        'trigger-update-check-btn': t.checkUpdatesBtn,
        'copy-debug-logs-btn': p => p ? p.textContent = t.copyLogsBtn : null,
        'clear-debug-logs-btn': p => p ? p.textContent = t.clearLogsBtn : null
    };
    
    Object.keys(elMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (typeof elMap[id] === 'function') {
                elMap[id](el);
            } else {
                el.textContent = elMap[id];
            }
        }
    });
    
    if (document.getElementById('screen-stickers').classList.contains('active')) {
        renderStickerAlbum();
    }
    
    // Refresh Creator Table to update vocabulary translations
    renderCreatorTable();
}

// --- DEFAULT VOCABULARY TRANSLATIONS DICTIONARY ---
const VOCAB_TRANSLATIONS = {
    hund: { en: "dog", ar: "كلب", uk: "собака", tr: "köpek", ru: "собака" },
    katze: { en: "cat", ar: "قطة", uk: "кішка", tr: "kedi", ru: "кошка" },
    maus: { en: "mouse", ar: "فأر", uk: "миша", tr: "fare", ru: "мышь" },
    vogel: { en: "bird", ar: "طائر", uk: "птах", tr: "kuş", ru: "птица" },
    pferd: { en: "horse", ar: "حصان", uk: "кінь", tr: "at", ru: "лошадь" },
    fisch: { en: "fish", ar: "سمكة", uk: "риба", tr: "balık", ru: "рыба" },
    apfel: { en: "apple", ar: "تفاحة", uk: "яблуко", tr: "elma", ru: "яблоко" },
    banane: { en: "banana", ar: "موز", uk: "банан", tr: "muz", ru: "банан" },
    brot: { en: "bread", ar: "خبز", uk: "хліб", tr: "ekmek", ru: "хлеб" },
    milch: { en: "milk", ar: "حليب", uk: "молоко", tr: "süt", ru: "молоко" },
    erdbeere: { en: "strawberry", ar: "فراولة", uk: "полуниця", tr: "çilek", ru: "клубника" },
    pizza: { en: "pizza", ar: "بيتزا", uk: "піца", tr: "pizza", ru: "пицца" },
    rot: { en: "red", ar: "أحمر", uk: "червоний", tr: "kırmızı", ru: "красный" },
    blau: { en: "blue", ar: "أзرق", uk: "синій", tr: "mavi", ru: "синий" },
    gruen: { en: "green", ar: "أخضر", uk: "зелений", tr: "yeşil", ru: "зеленый" },
    gelb: { en: "yellow", ar: "أصفر", uk: "жовтий", tr: "sarı", ru: "желтый" },
    orange: { en: "orange", ar: "برتقالي", uk: "помаранчевий", tr: "turuncu", ru: "оранжевый" },
    buch: { en: "book", ar: "كتاب", uk: "книга", tr: "kitap", ru: "книга" },
    stift: { en: "pen / pencil", ar: "قلم", uk: "олівець / ручка", tr: "kalem", ru: "карандаш / ручка" },
    schere: { en: "scissors", ar: "مقص", uk: "ножиці", tr: "makas", ru: "ножницы" },
    tasche: { en: "bag", ar: "حقيبة", uk: "сумка", tr: "çanta", ru: "сумка" },
    jacke: { en: "jacket", ar: "سترة", uk: "куртка", tr: "ceket", ru: "куртка" },
    schuh: { en: "shoe", ar: "حذاء", uk: "взуття / черевик", tr: "ayakkabı", ru: "обувь / ботинок" },
    hose: { en: "pants / trousers", ar: "بنطال", uk: "штани", tr: "pantolon", ru: "штаны" },
    muetze: { en: "beanie / cap", ar: "قبعة", uk: "шапка", tr: "bere", ru: "шапка" },
    auge: { en: "eye", ar: "عين", uk: "око", tr: "göz", ru: "глаз" },
    ohr: { en: "ear", ar: "أذن", uk: "вухо", tr: "kulak", ru: "ухо" },
    nase: { en: "nose", ar: "أنф", uk: "ніс", tr: "burun", ru: "нос" },
    mund: { en: "mouth", ar: "فم", uk: "рот", tr: "ağız", ru: "рот" },
    hand: { en: "hand", ar: "يد", uk: "рука", tr: "el", ru: "рука" },
    fuss: { en: "foot", ar: "قدم", uk: "нога / стопа", tr: "ayak", ru: "нога / стопа" },
    mama: { en: "mom / mother", ar: "أمي", uk: "мама", tr: "anne", ru: "мама" },
    papa: { en: "dad / father", ar: "أبي", uk: "тато", tr: "baba", ru: "папа" },
    baby: { en: "baby", ar: "طفل رضيع", uk: "дитина / немовля", tr: "bebek", ru: "малыш / ребенок" },
    bruder: { en: "brother", ar: "أخ", uk: "брат", tr: "erkek kardeş", ru: "брат" },
    schwester: { en: "sister", ar: "أخت", uk: "сестра", tr: "kız kardeş", ru: "сестра" },
    haus: { en: "house", ar: "بيت", uk: "будинок", tr: "ev", ru: "дом" },
    bett: { en: "bed", ar: "سرير", uk: "ліжко", tr: "yatak", ru: "кровать" },
    tisch: { en: "table", ar: "طاولة", uk: "стіл", tr: "masa", ru: "стол" },
    tuer: { en: "door", ar: "باب", uk: "двері", tr: "kapı", ru: "дверь" },
    ball: { en: "ball", ar: "كرة", uk: "м'яч", tr: "top", ru: "мяч" },
    puppe: { en: "doll", ar: "دمية", uk: "лялька", tr: "oyuncak bebek", ru: "кукла" },
    auto: { en: "car", ar: "سيارة", uk: "машина", tr: "araba", ru: "машина" },
    sonne: { en: "sun", ar: "شمس", uk: "сонце", tr: "güneş", ru: "солнце" },
    mond: { en: "moon", ar: "قمر", uk: "місяць", tr: "ay", ru: "луна" },
    baum: { en: "tree", ar: "шجرة", uk: "дерево", tr: "ağaç", ru: "дерево" },
    blume: { en: "flower", ar: "زهرة", uk: "квітка", tr: "çiçek", ru: "цветок" },
    wolke: { en: "cloud", ar: "سحابة", uk: "хмара", tr: "bulut", ru: "облако" }
};

function getWordTranslation(item, lang = state.language || 'de') {
    const isCustom = state.customVocabulary.some(cv => cv.id === item.id);
    if (isCustom) {
        return item.translation;
    }
    const id = item.id;
    const defaultTranslations = VOCAB_TRANSLATIONS[id];
    if (defaultTranslations && defaultTranslations[lang]) {
        return defaultTranslations[lang];
    }
    return item.translation; // Fallback
}
