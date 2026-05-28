// app.js

// --- 1. CONFIGURATION & STATE ---
const CONFIG = {
    vocabPath: 'content/vocabulary.json',
    wasmPath: 'assets/wasm/core.wasm',
    defaultXP: 0,
};

let state = {
    xp: CONFIG.defaultXP,
    level: 1,
    vocabulary: [],
    customVocabulary: [], // Added via Creator
    activeCategory: null,
    activeGame: null, // 'match', 'spelling', 'memory'
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
    initUI();
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
        navigator.serviceWorker.register('sw.js').then((reg) => {
            console.log('ServiceWorker registriert mit Scope:', reg.scope);
            
            // Listen for updates
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available! Show toast
                        showUpdateToast(reg);
                    }
                });
            });
            
            // If there's an active waiting worker, show update toast
            if (reg.waiting) {
                showUpdateToast(reg);
            }
        }).catch((err) => {
            console.error('ServiceWorker Registrierung fehlgeschlagen:', err);
        });
    }
}

function showUpdateToast(registration) {
    const toast = document.getElementById('update-toast');
    toast.classList.remove('hidden');
    
    document.getElementById('update-btn').onclick = () => {
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        toast.classList.add('hidden');
        window.location.reload();
    };
    
    document.getElementById('close-toast-btn').onclick = () => {
        toast.classList.add('hidden');
    };
}

// --- 3. WASM INTEGRATION ---
async function loadWasm() {
    const loadingScreen = document.getElementById('wasm-loading-screen');
    loadingScreen.classList.remove('hidden');
    
    try {
        const response = await fetch(CONFIG.wasmPath);
        if (!response.ok) throw new Error(`Wasm Datei konnte nicht geladen werden: ${response.statusText}`);
        
        const wasmBytes = await response.arrayBuffer();
        const wasmObj = await WebAssembly.instantiate(wasmBytes, {
            env: {
                // Free standing wasm environment imports if needed (none required for this simple core)
            }
        });
        
        wasmExports = wasmObj.instance.exports;
        console.log('Zig Core WebAssembly erfolgreich geladen!');
        
        // Initialize the random seed in Zig core
        if (wasmExports.initSeed) {
            wasmExports.initSeed(BigInt(Date.now()));
        }
    } catch (err) {
        console.error('WebAssembly Ladefehler. Nutze JS Fallbacks.', err);
        // We will build pure JS fallback functions for robustness if Wasm fails to load (e.g. local file protocol)
        setupJsFallbacks();
    } finally {
        loadingScreen.classList.add('hidden');
    }
}

// Fallback functions in pure JS in case WebAssembly isn't supported or fails to load
function setupJsFallbacks() {
    wasmExports = {
        calculateLevel: (xp) => Math.floor(Math.sqrt(xp / 100)) + 1,
        xpForNextLevel: (lvl) => lvl * lvl * 100,
        xpForCurrentLevel: (lvl) => (lvl <= 1) ? 0 : (lvl - 1) * (lvl - 1) * 100,
        validateSpelling: (typedPtr, typedLen, expectedPtr, expectedLen) => {
            // JS Fallback spelling check
            const decoder = new TextDecoder();
            const memoryBuffer = new Uint8Array(wasmExports.memory.buffer);
            
            const typed = decoder.decode(memoryBuffer.subarray(typedPtr, typedPtr + typedLen));
            const expected = decoder.decode(memoryBuffer.subarray(expectedPtr, expectedPtr + expectedLen));
            
            const clean = (s) => s.trim().toLowerCase().replace(/^(der|die|das)\s+/i, '');
            return clean(typed) === clean(expected) ? 1 : 0;
        },
        shuffleArray: (ptr, len) => {
            // JS Fallback shuffle
            const view = new Uint32Array(wasmExports.memory.buffer, ptr, len);
            for (let i = len - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = view[i];
                view[i] = view[j];
                view[j] = temp;
            }
        },
        // Mock buffer pointers in normal object for JS mode
        memory: {
            buffer: new ArrayBuffer(65536 * 10) // Mock buffer
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
    
    // 1. Get pointers to Wasm buffers
    const typedPtr = wasmExports.getTypedBufferPointer();
    const expectedPtr = wasmExports.getExpectedBufferPointer();
    const maxSize = wasmExports.getBufferMaxSize();
    
    // 2. Encode strings to UTF-8
    const encoder = new TextEncoder();
    const typedBytes = encoder.encode(typed);
    const expectedBytes = encoder.encode(expected);
    
    // Ensure we don't overflow Wasm buffer
    const typedLen = Math.min(typedBytes.length, maxSize);
    const expectedLen = Math.min(expectedBytes.length, maxSize);
    
    // 3. Write bytes to Wasm memory
    const wasmMem = new Uint8Array(wasmExports.memory.buffer);
    wasmMem.set(typedBytes.subarray(0, typedLen), typedPtr);
    wasmMem.set(expectedBytes.subarray(0, expectedLen), expectedPtr);
    
    // 4. Invoke Wasm function
    const result = wasmExports.validateSpelling(typedPtr, typedLen, expectedPtr, expectedLen);
    return result === 1;
}

// Helper to shuffle an array of indices using Zig Wasm
function shuffleIndicesWithWasm(len) {
    if (!wasmExports || len <= 1) {
        // Fallback shuffle
        const arr = Array.from({length: len}, (_, i) => i);
        return arr.sort(() => Math.random() - 0.5);
    }
    
    const maxShuffleSize = wasmExports.getShuffleBufferMaxSize();
    const shuffleSize = Math.min(len, maxShuffleSize);
    const shufflePtr = wasmExports.getShuffleBufferPointer();
    
    // Write 0..shuffleSize-1 to shuffle buffer
    const wasmMemU32 = new Uint32Array(wasmExports.memory.buffer, shufflePtr, shuffleSize);
    for (let i = 0; i < shuffleSize; i++) {
        wasmMemU32[i] = i;
    }
    
    // Call Zig shuffle
    wasmExports.shuffleArray(shufflePtr, shuffleSize);
    
    // Read back shuffled array
    const shuffled = [];
    for (let i = 0; i < shuffleSize; i++) {
        shuffled.push(wasmMemU32[i]);
    }
    
    // Append remaining elements unshuffled if input was larger than buffer limit
    for (let i = shuffleSize; i < len; i++) {
        shuffled.push(i);
    }
    
    return shuffled;
}

// --- 4. DATA LOADING & SAVE ---
async function loadVocabulary() {
    try {
        const response = await fetch(CONFIG.vocabPath);
        if (!response.ok) throw new Error('Vocabulary JSON could not be loaded');
        const defaultVocab = await response.json();
        
        // Combine default with custom vocabulary from localStorage
        const custom = JSON.parse(localStorage.getItem('custom_vocab')) || [];
        state.customVocabulary = custom;
        state.vocabulary = [...defaultVocab, ...custom];
    } catch (err) {
        console.error('Vocabulary loading failed, using static fallback.', err);
        // Safety Fallback Vocabulary if JSON fetch fails
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
}

function saveProgress() {
    localStorage.setItem('user_xp', state.xp);
    localStorage.setItem('user_level', state.level);
    updateXPBar();
}

function addXP(amount) {
    state.xp += amount;
    
    // Recalculate level
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
    // Alert or fancy display
    alert(`🎉 Gratulation! Du bist jetzt Level ${state.level}! 🌟 Weiter so!`);
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
    document.getElementById('nav-settings-btn').addEventListener('click', () => switchScreen('settings'));
    
    // Modal controls
    document.getElementById('close-game-modal').addEventListener('click', hideGameModal);
    
    // Game Exit / Back button
    document.getElementById('game-back-btn').addEventListener('click', () => {
        if(confirm('Möchtest du das Spiel beenden? Dein Fortschritt in dieser Runde geht verloren.')) {
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
        if (confirm('Möchtest du wirklich deinen gesamten Lernfortschritt (Level & XP) löschen?')) {
            localStorage.clear();
            state.xp = CONFIG.defaultXP;
            state.level = 1;
            state.customVocabulary = [];
            loadVocabulary().then(() => {
                saveProgress();
                renderCategories();
                alert('Fortschritt zurückgesetzt!');
                switchScreen('dashboard');
            });
        }
    });

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
    
    // Trigger mock update check
    document.getElementById('trigger-update-check-btn').addEventListener('click', () => {
        alert('Suche nach Updates auf GitHub...\nApp ist auf dem neuesten Stand (v1.0.0).');
    });
    
    // Export vocabulary JSON
    document.getElementById('export-json-btn').addEventListener('click', exportVocabJSON);
}

function switchScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    // Show active screen
    document.getElementById(`screen-${screenId}`).classList.add('active');
    
    // Update navigation buttons active state
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const matchingBtn = document.getElementById(`nav-${screenId}-btn`);
    if (matchingBtn) matchingBtn.classList.add('active');
    
    // Hide game modal if switching screens
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
    // Extract unique categories
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
        'Tiere': '#FF9F1C', // Soft Orange
        'Essen': '#FF5B7F', // Soft Pink
        'Farben': '#3A86FF', // Soft Blue
        'Schule': '#2EC4B6', // Soft Green
        'Kleidung': '#8338EC' // Soft Purple
    };

    categories.forEach(cat => {
        const count = state.vocabulary.filter(v => v.category === cat).length;
        const card = document.createElement('button');
        card.className = 'category-card';
        card.style.setProperty('--card-accent', categoryColors[cat] || '#5271FF');
        
        const emoji = categoryIcons[cat] || '⭐';
        
        card.innerHTML = `
            <span class="category-emoji">${emoji}</span>
            <h3>${cat}</h3>
            <span>${count} Wörter</span>
        `;
        
        card.addEventListener('click', () => showGameModal(cat));
        container.appendChild(card);
    });
}

function showGameModal(category) {
    state.activeCategory = category;
    document.getElementById('modal-category-title').textContent = category;
    document.getElementById('game-mode-modal').classList.remove('hidden');
    
    // Assign game button click triggers
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
    
    // Filter words matching active category
    const catWords = state.vocabulary.filter(w => w.category === state.activeCategory);
    
    if (catWords.length < 3 && gameType !== 'memory') {
        alert('Zu wenige Vokabeln in dieser Kategorie vorhanden! Füge zuerst mehr Vokabeln hinzu.');
        return;
    }
    if (catWords.length < 4 && gameType === 'memory') {
        alert('Für Memory werden mindestens 4 Vokabeln in dieser Kategorie benötigt!');
        return;
    }
    
    // Setup game active header
    const gameConfigs = {
        'match': { title: 'Wort-Bild-Rätsel', icon: '🖼️' },
        'spelling': { title: 'Buchstabieren', icon: '🔤' },
        'memory': { title: 'Memory', icon: '🎴' }
    };
    document.getElementById('game-active-icon').textContent = gameConfigs[gameType].icon;
    document.getElementById('game-active-name').textContent = gameConfigs[gameType].title;
    
    switchScreen('game');
    
    // Hide all sub-game views
    document.getElementById('game-view-match').classList.add('hidden');
    document.getElementById('game-view-spelling').classList.add('hidden');
    document.getElementById('game-view-memory').classList.add('hidden');
    
    // Select cards for session
    // For Match and Spelling, we take up to 5 random cards from the category.
    // Shuffle category words using Wasm or JS shuffle index helper
    const shuffledIndexes = shuffleIndicesWithWasm(catWords.length);
    state.sessionCards = shuffledIndexes.slice(0, 5).map(idx => catWords[idx]);
    state.currentCardIndex = 0;
    
    if (gameType === 'match') {
        document.getElementById('game-view-match').classList.remove('hidden');
        loadMatchRound();
    } else if (gameType === 'spelling') {
        document.getElementById('game-view-spelling').classList.remove('hidden');
        loadSpellingRound();
    } else if (gameType === 'memory') {
        // Memory needs exactly 4 cards to make 8 grid elements
        state.sessionCards = shuffledIndexes.slice(0, 4).map(idx => catWords[idx]);
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
    
    const correctCard = state.sessionCards[state.currentCardIndex];
    document.getElementById('match-question-emoji').textContent = correctCard.emoji;
    
    // Make choices
    // Must contain 1 correct choice + 3 random choices from whole vocab or category
    const otherOptions = state.vocabulary
        .filter(w => w.id !== correctCard.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
        
    const choices = [correctCard, ...otherOptions];
    // Shuffle choices using wasm
    const shuffledChoicesIdx = shuffleIndicesWithWasm(choices.length);
    const finalChoices = shuffledChoicesIdx.map(idx => choices[idx]);
    
    const optionsContainer = document.getElementById('match-options-container');
    optionsContainer.innerHTML = '';
    
    finalChoices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        
        // Add pedagogical article coloring
        const article = choice.word.split(' ')[0].toLowerCase();
        if (article === 'der') btn.classList.add('article-btn-der');
        else if (article === 'die') btn.classList.add('article-btn-die');
        else if (article === 'das') btn.classList.add('article-btn-das');
        
        // Make the article itself visually bold/accented in the button text
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
    // Disable all buttons in option grid during validation check
    document.querySelectorAll('#match-options-container button').forEach(b => b.style.pointerEvents = 'none');
    
    const isCorrect = selectedChoice.id === correctCard.id;
    if (isCorrect) {
        button.classList.add('correct');
        state.gameScore += 10;
        document.getElementById('game-score').textContent = state.gameScore;
        
        setTimeout(() => {
            state.currentCardIndex++;
            loadMatchRound();
        }, 1200);
    } else {
        button.classList.add('wrong');
        
        // Find correct button and flash it briefly
        setTimeout(() => {
            button.classList.remove('wrong');
            // Re-enable clicks to let them try again
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
    
    const correctCard = state.sessionCards[state.currentCardIndex];
    document.getElementById('spelling-question-emoji').textContent = correctCard.emoji;
    
    // Clear state
    state.spellingTypedLetters = [];
    
    // Get actual spelling letters (excluding article)
    const cleanWord = correctCard.word.replace(/^(der|die|das)\s+/i, '').trim();
    const letters = cleanWord.split('');
    
    // Generate empty answer slots
    const slotsContainer = document.getElementById('spelling-slots');
    slotsContainer.innerHTML = '';
    letters.forEach(() => {
        const slot = document.createElement('div');
        slot.className = 'letter-slot';
        slotsContainer.appendChild(slot);
    });
    
    // Create letters pool and shuffle them using Zig WebAssembly
    const indices = Array.from({length: letters.length}, (_, i) => i);
    const shuffledIndices = shuffleIndicesWithWasm(letters.length);
    const shuffledLetters = shuffledIndices.map(idx => letters[idx]);
    
    const poolContainer = document.getElementById('spelling-letters-pool');
    poolContainer.innerHTML = '';
    
    shuffledLetters.forEach((letter, index) => {
        const btn = document.createElement('button');
        btn.className = 'pool-letter';
        btn.textContent = letter;
        btn.dataset.poolIndex = index;
        
        btn.addEventListener('click', () => {
            // Append letter to typed answer if slots not full
            if (state.spellingTypedLetters.length < letters.length) {
                state.spellingTypedLetters.push({ letter, poolIndex: index });
                btn.classList.add('used');
                updateSpellingSlots();
            }
        });
        poolContainer.appendChild(btn);
    });
    
    // Clear and Submit actions
    document.getElementById('spelling-clear-btn').onclick = () => {
        state.spellingTypedLetters = [];
        // Re-enable pool letters
        document.querySelectorAll('.pool-letter').forEach(btn => btn.classList.remove('used'));
        updateSpellingSlots();
    };
    
    document.getElementById('spelling-submit-btn').onclick = () => {
        const typedWord = state.spellingTypedLetters.map(x => x.letter).join('');
        
        // CALL ZIG WASM EXPORT FOR SPELLING VALIDATION
        const isCorrect = verifySpellingWithWasm(typedWord, cleanWord);
        
        if (isCorrect) {
            // Show all slots green
            document.querySelectorAll('.letter-slot').forEach(slot => slot.classList.add('filled', 'correct'));
            state.gameScore += 15;
            document.getElementById('game-score').textContent = state.gameScore;
            
            setTimeout(() => {
                state.currentCardIndex++;
                loadSpellingRound();
            }, 1200);
        } else {
            // Shake visual error
            const slots = document.getElementById('spelling-slots');
            slots.style.animation = 'shake 0.4s ease';
            setTimeout(() => {
                slots.style.animation = '';
                // Automatically clear incorrect spelling to try again
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
    
    // Create pairs: 1 Word Card + 1 Emoji Card per item
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
    
    // Shuffle cards using Zig WebAssembly
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
        
        // Front and Back Elements
        const front = document.createElement('div');
        front.className = 'memory-card-front';
        front.textContent = card.value;
        
        // Style word articles helper
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
    // Avoid double click, clicking flipped or matched card, or clicking 3rd card
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
            state.gameScore += 20;
            document.getElementById('game-score').textContent = state.gameScore;
            
            state.selectedMemoryCards = [];
            
            // Check win condition (4 pairs matched)
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
    // Trigger Game Over overlay
    const overlay = document.getElementById('game-over-overlay');
    const xpGainedEl = document.getElementById('xp-gained');
    
    // Add XP to user profile
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
    
    // Formatting: combine article and word cleanly
    let finalWord = cleanWord;
    if (article !== '-') {
        finalWord = `${article} ${cleanWord}`;
    }
    
    const newCard = {
        id: cleanWord.toLowerCase().replace(/[^a-z0-9]/g, ''),
        word: finalWord,
        translation: transInput.value.trim(),
        category: catSelect.value,
        emoji: emojiInput.value.trim(),
        difficulty: parseInt(diffSelect.value)
    };
    
    // Save to runtime lists
    state.customVocabulary.push(newCard);
    state.vocabulary.push(newCard);
    
    // Save to localStorage persistence
    localStorage.setItem('custom_vocab', JSON.stringify(state.customVocabulary));
    
    // Reset inputs
    wordInput.value = '';
    transInput.value = '';
    emojiInput.value = '';
    
    // Re-render
    renderCreatorTable();
    renderCategories();
    
    alert('Vokabelkarte erfolgreich hinzugefügt! Sie kann jetzt sofort in den Spielen verwendet werden.');
}

function renderCreatorTable() {
    const tbody = document.getElementById('vocab-table-body');
    tbody.innerHTML = '';
    
    // Show count
    document.getElementById('vocab-count').textContent = state.vocabulary.length;
    
    state.vocabulary.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        // Highlight custom items
        const isCustom = state.customVocabulary.some(cv => cv.id === item.id);
        if (isCustom) {
            tr.style.backgroundColor = 'rgba(82, 113, 255, 0.04)';
        }
        
        tr.innerHTML = `
            <td style="font-size: 1.5rem;">${item.emoji}</td>
            <td><strong>${item.word}</strong></td>
            <td style="color: var(--text-muted);">${item.translation}</td>
            <td><span class="badge blue">${item.category}</span></td>
            <td>
                ${isCustom ? `<button class="badge-delete-btn" onclick="deleteCustomVocab('${item.id}')" title="Löschen">❌</button>` : `<span style="color: var(--text-muted); font-size: 0.8rem;">Standard</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Global reference helper for delete action in HTML rows
window.deleteCustomVocab = function(id) {
    if (confirm('Möchtest du diese Vokabelkarte löschen?')) {
        state.customVocabulary = state.customVocabulary.filter(v => v.id !== id);
        localStorage.setItem('custom_vocab', JSON.stringify(state.customVocabulary));
        
        // Re-load all vocabulary
        loadVocabulary().then(() => {
            renderCreatorTable();
            renderCategories();
        });
    }
};

// Export to file system (for Git PR workflows)
function exportVocabJSON() {
    // We only export the complete active vocabulary set
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.vocabulary, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "vocabulary.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}
