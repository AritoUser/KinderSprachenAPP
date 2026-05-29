// js/creator.js
// Handles Visual Content Creator, custom cards storage, validation, delete and JSON exports.
// Part of the KinderSprachenAPP open-source project.

import { state, loadVocabulary, logDebug } from './state.js';
import { TRANSLATIONS } from './translations.js';
import { getWordTranslation } from './games.js';
import { renderCategories } from './ui.js';

export function handleAddVocab(e) {
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

export function renderCreatorTable() {
    const tbody = document.getElementById('vocab-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const vocabCountEl = document.getElementById('vocab-count');
    if (vocabCountEl) vocabCountEl.textContent = state.vocabulary.length;
    
    state.vocabulary.forEach((item) => {
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

// Bind to window to allow dynamic HTML onclick calls to find it
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

export function exportVocabJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.vocabulary, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "vocabulary.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}
