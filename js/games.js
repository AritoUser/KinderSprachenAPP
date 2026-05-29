// js/games.js
// Implementation of learning games (Match, Spelling, Memory) and spaced-repetition algorithms.
// Part of the KinderSprachenAPP open-source project.

import { state, saveProgress, addXP, logDebug } from './state.js';
import { TRANSLATIONS, VOCAB_TRANSLATIONS } from './translations.js';
import { playSuccessSound, playErrorSound, playLevelUpSound, speakGerman } from './audio.js';
import { getWasmExports } from './wasm.js';
import { switchScreen } from './ui.js';

export function showGameModal(category) {
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

export function hideGameModal() {
    document.getElementById('game-mode-modal').classList.add('hidden');
}

export function getWordTranslation(item, lang = state.language || 'de') {
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

export function getXPReward(card) {
    if (!state.mastery) state.mastery = {};
    const mastery = state.mastery[card.id] || 0;
    if (mastery <= 1) return 15; // New / Unfamiliar
    if (mastery === 2) return 8;  // Familiar
    return 3;                     // Mastered
}

export function updateMastery(wordId, isCorrect) {
    if (!state.mastery) state.mastery = {};
    const current = state.mastery[wordId] || 0;
    if (isCorrect) {
        state.mastery[wordId] = Math.min(current + 1, 3);
    } else {
        state.mastery[wordId] = Math.max(current - 1, 0);
    }
    saveProgress();
}

export function getWeightedRandomWords(words, count) {
    if (words.length === 0) return [];
    
    // Calculate weights
    const weightedPool = [];
    words.forEach(w => {
        const m = state.mastery[w.id] || 0;
        let weight = 1.0; // mastery 0/1
        if (m === 2) weight = 0.4;
        else if (m === 3) weight = 0.1;
        
        // Add item to candidate list along with calculated weight
        weightedPool.push({ word: w, weight: weight });
    });
    
    const selected = [];
    const poolCopy = [...weightedPool];
    
    for (let i = 0; i < count; i++) {
        if (poolCopy.length === 0) break;
        
        const totalWeight = poolCopy.reduce((sum, item) => sum + item.weight, 0);
        let randomVal = Math.random() * totalWeight;
        
        let chosenIdx = 0;
        for (let j = 0; j < poolCopy.length; j++) {
            randomVal -= poolCopy[j].weight;
            if (randomVal <= 0) {
                chosenIdx = j;
                break;
            }
        }
        
        selected.push(poolCopy[chosenIdx].word);
        poolCopy.splice(chosenIdx, 1);
    }
    
    return selected;
}

export function verifySpellingWithWasm(typed, expected) {
    const wasmExports = getWasmExports();
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

export function shuffleIndicesWithWasm(len) {
    const wasmExports = getWasmExports();
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

export function startGame(gameType) {
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

export function loadMatchRound() {
    const card = state.sessionCards[state.currentCardIndex];
    if (!card) {
        endGame();
        return;
    }
    
    // Reset helper texts
    const matchHelpText = document.getElementById('match-help-text');
    if (matchHelpText) matchHelpText.classList.add('hidden');
    
    // Play German word voice output
    speakGerman(card.word);
    
    // Display card emoji
    document.getElementById('match-question-emoji').textContent = card.emoji;
    
    // Load choices
    const container = document.getElementById('match-options-container');
    container.innerHTML = '';
    
    const catWords = state.vocabulary.filter(w => w.category === state.activeCategory);
    let wrongChoicesCandidates = catWords.filter(w => w.id !== card.id);
    
    // Select 3 random choices (1 correct, 2 wrong)
    const shuffledWrong = wrongChoicesCandidates.sort(() => 0.5 - Math.random());
    const chosenWrong = shuffledWrong.slice(0, 2);
    
    const choices = [card, ...chosenWrong];
    const shuffledChoicesIndices = shuffleIndicesWithWasm(choices.length);
    const shuffledChoices = shuffledChoicesIndices.map(idx => choices[idx]);
    
    shuffledChoices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'option-btn notranslate';
        btn.setAttribute('translate', 'no');
        btn.dataset.choiceId = choice.id;
        
        let article = '';
        let noun = choice.word;
        if (choice.word.includes(' ')) {
            const parts = choice.word.split(' ');
            if (['der', 'die', 'das'].includes(parts[0].toLowerCase())) {
                article = parts[0].toLowerCase();
                noun = parts.slice(1).join(' ');
            }
        }
        
        let displayWord = choice.word;
        if (article) {
            displayWord = `<span class="word-${article}">${article}</span> ${noun}`;
        }
        btn.innerHTML = displayWord;
        
        btn.addEventListener('click', () => {
            verifyMatchAnswer(btn, choice, card);
        });
        
        container.appendChild(btn);
    });
}

export function verifyMatchAnswer(button, selectedChoice, correctCard) {
    const isCorrect = (selectedChoice.id === correctCard.id);
    
    // Disable all options and show feedback
    document.querySelectorAll('#match-options-container .option-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.choiceId === correctCard.id.toString()) {
            btn.classList.add('correct');
        }
    });
    
    if (isCorrect) {
        button.classList.add('correct');
        playSuccessSound();
        const xpGained = getXPReward(correctCard);
        addXP(xpGained);
        state.gameScore += xpGained;
        document.getElementById('game-score').textContent = state.gameScore;
        updateMastery(correctCard.id, true);
    } else {
        button.classList.add('wrong');
        playErrorSound();
        updateMastery(correctCard.id, false);
    }
    
    setTimeout(() => {
        state.currentCardIndex += 1;
        loadMatchRound();
    }, 1500);
}

export function loadSpellingRound() {
    const card = state.sessionCards[state.currentCardIndex];
    if (!card) {
        endGame();
        return;
    }
    
    // Reset helper texts
    const spellingHelpText = document.getElementById('spelling-help-text');
    if (spellingHelpText) spellingHelpText.classList.add('hidden');
    
    speakGerman(card.word);
    
    document.getElementById('spelling-question-emoji').textContent = card.emoji;
    
    state.spellingTypedLetters = [];
    
    // Letters extraction
    const rawWord = card.word.toLowerCase();
    const cleanWord = rawWord.replace(/^(der|die|das)\s+/i, '').trim();
    
    const letters = cleanWord.split('');
    const shuffledLettersIndices = shuffleIndicesWithWasm(letters.length);
    const shuffledLetters = shuffledLettersIndices.map(idx => letters[idx]);
    
    // Render pool options
    const pool = document.getElementById('spelling-letters-pool');
    pool.innerHTML = '';
    shuffledLetters.forEach((l, idx) => {
        const key = `${l}-${idx}`;
        const item = document.createElement('button');
        item.className = 'pool-letter notranslate';
        item.setAttribute('translate', 'no');
        item.textContent = l.toUpperCase();
        item.dataset.key = key;
        
        item.addEventListener('click', () => {
            if (item.classList.contains('used')) return;
            item.classList.add('used');
            state.spellingTypedLetters.push({ letter: l, key: key });
            updateSpellingSlots();
        });
        
        pool.appendChild(item);
    });
    
    updateSpellingSlots();
    
    // Control buttons
    document.getElementById('spelling-clear-btn').onclick = () => {
        state.spellingTypedLetters = [];
        document.querySelectorAll('#spelling-letters-pool .pool-letter').forEach(t => {
            t.classList.remove('used');
        });
        updateSpellingSlots();
    };
    
    document.getElementById('spelling-submit-btn').onclick = () => {
        const typedString = state.spellingTypedLetters.map(x => x.letter).join('');
        const correct = verifySpellingWithWasm(typedString, cleanWord);
        
        const container = document.getElementById('spelling-slots');
        if (correct) {
            container.querySelectorAll('.letter-slot').forEach(t => t.classList.add('correct'));
            playSuccessSound();
            const xpGained = getXPReward(card);
            addXP(xpGained);
            state.gameScore += xpGained;
            document.getElementById('game-score').textContent = state.gameScore;
            updateMastery(card.id, true);
            
            setTimeout(() => {
                state.currentCardIndex += 1;
                loadSpellingRound();
            }, 1500);
        } else {
            container.querySelectorAll('.letter-slot').forEach(t => t.classList.add('wrong'));
            playErrorSound();
            updateMastery(card.id, false);
            
            const slots = document.getElementById('spelling-slots');
            slots.style.animation = 'shake 0.4s ease';
            setTimeout(() => {
                slots.style.animation = '';
                state.spellingTypedLetters = [];
                document.querySelectorAll('#spelling-letters-pool .pool-letter').forEach(t => {
                    t.classList.remove('used');
                });
                updateSpellingSlots();
            }, 800);
        }
    };
}

export function updateSpellingSlots() {
    const container = document.getElementById('spelling-slots');
    container.innerHTML = '';
    
    const card = state.sessionCards[state.currentCardIndex];
    if (!card) return;
    
    const cleanWord = card.word.toLowerCase().replace(/^(der|die|das)\s+/i, '').trim();
    const length = cleanWord.length;
    
    for (let i = 0; i < length; i++) {
        const slot = document.createElement('div');
        slot.className = 'letter-slot notranslate';
        slot.setAttribute('translate', 'no');
        
        if (state.spellingTypedLetters[i]) {
            const data = state.spellingTypedLetters[i];
            slot.textContent = data.letter.toUpperCase();
            slot.classList.add('filled');
            
            slot.addEventListener('click', () => {
                // Remove this letter from slots
                const removed = state.spellingTypedLetters.splice(i, 1)[0];
                // Find matching letter in pool
                const poolItem = document.querySelector(`#spelling-letters-pool .pool-letter[data-key="${removed.key}"]`);
                if (poolItem) poolItem.classList.remove('used');
                updateSpellingSlots();
            });
        }
        container.appendChild(slot);
    }
}

export function loadMemoryGame() {
    const container = document.getElementById('memory-grid-container');
    if (!container) return;
    container.innerHTML = '';
    
    state.selectedMemoryCards = [];
    state.matchedMemoryPairs = 0;
    
    // Create card items (1 word, 1 emoji)
    const cards = [];
    state.sessionCards.forEach(c => {
        cards.push({ id: c.id, type: 'word', content: c.word, data: c });
        cards.push({ id: c.id, type: 'emoji', content: c.emoji, data: c });
    });
    
    const shuffledIndices = shuffleIndicesWithWasm(cards.length);
    const shuffledCards = shuffledIndices.map(idx => cards[idx]);
    
    shuffledCards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'memory-card';
        cardEl.dataset.index = index;
        cardEl.dataset.id = card.id;
        
        const front = document.createElement('div');
        front.className = 'memory-card-front notranslate';
        front.setAttribute('translate', 'no');
        
        if (card.type === 'word') {
            front.classList.add('is-word');
            let article = '';
            let noun = card.content;
            if (card.content.includes(' ')) {
                const parts = card.content.split(' ');
                if (['der', 'die', 'das'].includes(parts[0].toLowerCase())) {
                    article = parts[0].toLowerCase();
                    noun = parts.slice(1).join(' ');
                }
            }
            if (article) {
                front.innerHTML = `<span class="word-${article}">${article}</span><br>${noun}`;
            } else {
                front.textContent = noun;
            }
        } else {
            front.classList.add('is-emoji');
            front.textContent = card.content;
        }
        
        const back = document.createElement('div');
        back.className = 'memory-card-back';
        
        cardEl.appendChild(front);
        cardEl.appendChild(back);
        
        cardEl.addEventListener('click', () => {
            flipMemoryCard(cardEl, card);
        });
        
        container.appendChild(cardEl);
    });
}

export function flipMemoryCard(cardEl, cardData) {
    if (state.selectedMemoryCards.length >= 2 || 
        cardEl.classList.contains('flipped') || 
        cardEl.classList.contains('matched')) {
        return;
    }
    
    cardEl.classList.add('flipped');
    
    // Speech synthesis for word on flip
    if (cardData.type === 'word') {
        speakGerman(cardData.content);
    } else {
        speakGerman(cardData.data.word);
    }
    
    state.selectedMemoryCards.push({ el: cardEl, data: cardData });
    
    if (state.selectedMemoryCards.length === 2) {
        setTimeout(checkMemoryMatch, 1000);
    }
}

export function checkMemoryMatch() {
    const [c1, c2] = state.selectedMemoryCards;
    
    if (c1.data.id === c2.data.id) {
        c1.el.classList.add('matched');
        c2.el.classList.add('matched');
        playSuccessSound();
        
        state.matchedMemoryPairs += 1;
        state.gameScore += 2;
        const scoreEl = document.getElementById('game-score');
        if (scoreEl) scoreEl.textContent = state.gameScore;
        
        const xpGained = getXPReward(c1.data.data);
        addXP(xpGained);
        updateMastery(c1.data.id, true);
        
        if (state.matchedMemoryPairs === state.sessionCards.length) {
            setTimeout(endGame, 1000);
        }
    } else {
        c1.el.classList.remove('flipped');
        c2.el.classList.remove('flipped');
        playErrorSound();
        updateMastery(c1.data.id, false);
    }
    
    state.selectedMemoryCards = [];
}

export function endGame() {
    document.getElementById('game-over-overlay').classList.remove('hidden');
    playLevelUpSound();
}
