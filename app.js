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
                if (reg.active && reg.active.state !== 'redundant') {
                    reg.update().catch(err => {
                        logDebug(`ServiceWorker update check failed: ${err.message}`, 'debug');
                    });
                }
            }, 5 * 60 * 1000); // Check every 5 minutes
            
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
        'Kleidung': '🧥',
        'Körper': '💪',
        'Familie': '👪',
        'Haus': '🏠',
        'Spielzeug': '🧸',
        'Natur': '🌲'
    };
    
    const categoryColors = {
        'Tiere': '#FF9F1C',
        'Essen': '#FF5B7F',
        'Farben': '#3A86FF',
        'Schule': '#2EC4B6',
        'Kleidung': '#8338EC',
        'Körper': '#4A90E2',
        'Familie': '#E63946',
        'Haus': '#457B9D',
        'Spielzeug': '#A8DADC',
        'Natur': '#1D3557'
    };

    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];

    categories.forEach(cat => {
        const count = state.vocabulary.filter(v => v.category === cat).length;
        const card = document.createElement('button');
        card.className = 'category-card';
        card.style.setProperty('--card-accent', categoryColors[cat] || '#5271FF');
        
        const emoji = categoryIcons[cat] || '⭐';
        const transCat = (t.categories && t.categories[cat]) ? t.categories[cat] : cat;
        const displayName = transCat === cat ? cat : `${transCat} (${cat})`;
        
        card.innerHTML = `
            <span class="category-emoji">${emoji}</span>
            <h3>${displayName}</h3>
            <span>${count} ${t.wordsCount || 'Words'}</span>
        `;
        
        card.addEventListener('click', () => showGameModal(cat));
        container.appendChild(card);
    });
}

function showGameModal(category) {
    state.activeCategory = category;
    
    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];
    const transCat = (t.categories && t.categories[category]) ? t.categories[category] : category;
    const displayName = transCat === category ? category : `${transCat} (${category})`;
    
    document.getElementById('modal-category-title').textContent = displayName;
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
    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];
    
    if (catWords.length < 3 && gameType !== 'memory') {
        alert(t.alertMinWords || 'Not enough vocabulary in this category! Please add more cards first.');
        return;
    }
    if (catWords.length < 4 && gameType === 'memory') {
        alert(t.alertMinMemory || 'Memory match game requires at least 4 vocabulary cards in this category!');
        return;
    }
    
    const gameConfigs = {
        'match': { title: t.gameMatchTitle || 'Word-Image Quiz', icon: '🖼️' },
        'spelling': { title: t.gameSpellingTitle || 'Spelling Game', icon: '🔤' },
        'memory': { title: t.gameMemoryTitle || 'Memory Match', icon: '🎴' }
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
    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];
    const confirmMsg = t.confirmDelete || 'Do you want to delete this vocabulary card?';
    if (confirm(confirmMsg)) {
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
    
    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];
    
    const emoji = isDark ? '☀️' : '🌙';
    const text = isDark ? (t.themeLight || '☀️ Light Mode') : (t.themeDark || '🌙 Dark Mode');
    const title = isDark ? (t.themeLightTitle || 'Switch to Light Mode') : (t.themeDarkTitle || 'Switch to Dark Mode');
    
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

function renderStickerAlbum() {
    const container = document.getElementById('sticker-grid-container');
    if (!container) return;
    container.innerHTML = '';
    
    const lang = state.language || 'de';
    const t = TRANSLATIONS[lang] || TRANSLATIONS['de'];
    
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
            labelEl.textContent = `${t.levelLabel || 'Lvl'} ${sticker.level}`;
            
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

function populateCategoryDropdown() {
    const catSelect = document.getElementById('vocab-category');
    if (!catSelect) return;
    const currentVal = catSelect.value;
    catSelect.innerHTML = '';
    const categories = ['Tiere', 'Essen', 'Farben', 'Schule', 'Kleidung', 'Körper', 'Familie', 'Haus', 'Spielzeug', 'Natur'];
    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];
    
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        const translatedName = (t.categories && t.categories[cat]) ? t.categories[cat] : cat;
        option.textContent = translatedName === cat ? cat : `${translatedName} (${cat})`;
        catSelect.appendChild(option);
    });
    if (currentVal) {
        catSelect.value = currentVal;
    }
}

function applyLanguage(lang) {
    state.language = lang;
    localStorage.setItem('user_language', lang);
    
    document.documentElement.lang = lang;
    
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
        'clear-debug-logs-btn': p => p ? p.textContent = t.clearLogsBtn : null,
        
        // Progress bar level badge
        'level-badge-label': t.levelBadgeLabel || 'Level',
        
        // Form Labels in Content Creator
        'label-vocab-article': t.labelArticle,
        'label-vocab-word': t.labelWord,
        'label-vocab-translation': t.labelTranslation,
        'label-vocab-emoji': t.labelEmoji,
        'label-vocab-category': t.labelCategory,
        'label-vocab-difficulty': t.labelDifficulty,
        
        // Article dropdown options
        'opt-art-der': t.optDer,
        'opt-art-die': t.optDie,
        'opt-art-das': t.optDas,
        'opt-art-none': t.optNone,
        
        // Difficulty dropdown options
        'opt-diff-easy': t.optEasy,
        'opt-diff-medium': t.optMedium,
        'opt-diff-hard': t.optHard,
        
        // Input placeholders
        'vocab-word': p => p ? p.placeholder = t.placeholderWord : null,
        'vocab-translation': p => p ? p.placeholder = t.placeholderTranslation : null,
        'vocab-emoji': p => p ? p.placeholder = t.placeholderEmoji : null,
        
        // Add vocabulary button
        'vocab-submit-btn': t.buttonAddCard,
        
        // Table Headers / Preview text
        'title-preview-header': p => p ? p.innerHTML = `${t.titlePreview} (<span id="vocab-count">${state.vocabulary.length}</span> ${t.wordsCount})` : null,
        'desc-preview-p': t.descPreview,
        'th-image': t.thImage,
        'th-word': t.thWord,
        'th-translation': t.thTranslation,
        'th-category': t.thCategory,
        'th-action': t.thAction,
        
        // Export button
        'export-json-btn': t.exportJsonBtn,
        
        // Game mode modal selections
        'modal-game-subtitle': t.chooseGame,
        'game-match-title': t.gameMatchTitle,
        'game-match-desc': t.gameMatchDesc,
        'game-spelling-title': t.gameSpellingTitle,
        'game-spelling-desc': t.gameSpellingDesc,
        'game-memory-title': t.gameMemoryTitle,
        'game-memory-desc': t.gameMemoryDesc,
        
        // Game Views elements
        'game-back-btn': p => p ? p.innerHTML = `⬅️ ${t.backBtn || 'Back'}` : null,
        'match-question-prompt': t.matchQuestionPrompt,
        'spelling-question-prompt': t.spellingQuestionPrompt,
        'spelling-clear-btn': p => p ? p.innerHTML = `❌ ${t.clearBtn || 'Clear'}` : null,
        'spelling-submit-btn': p => p ? p.innerHTML = `✔️ ${t.checkBtn || 'Check'}` : null,
        'memory-question-prompt': t.memoryQuestionPrompt,
        
        // Game over screen overlay
        'game-over-title': t.gameOverTitle,
        'game-over-desc': t.gameOverDesc,
        'game-finish-btn': t.continueBtn,
        
        // Settings Card Texts
        'settings-storage-title': t.settingsStorageTitle,
        'settings-storage-desc': t.settingsStorageDesc,
        'settings-theme-title': t.settingsThemeTitle,
        'settings-theme-desc': t.settingsThemeDesc,
        'settings-theme-toggle-btn': t.themeToggleBtn,
        'settings-updates-title': t.settingsUpdatesTitle,
        'settings-updates-desc': t.settingsUpdatesDesc,
        'settings-debug-title': t.settingsDebugTitle,
        'settings-debug-desc': t.settingsDebugDesc,
        'settings-sysinfo-title': t.settingsSysInfoTitle,
        'label-online-status': t.labelOnlineStatus,
        'label-app-version': t.labelAppVersion,
        'label-core-engine': t.labelCoreEngine,
        'label-license': t.labelLicense,
        
        // Footer text
        'app-footer-text': t.footerText
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
    
    populateCategoryDropdown();
    renderCategories();
    updateThemeButtons(document.documentElement.classList.contains('dark-mode'));
    
    if (document.getElementById('screen-stickers').classList.contains('active')) {
        renderStickerAlbum();
    }
    
    renderCreatorTable();
}

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
