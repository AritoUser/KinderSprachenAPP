// js/ui.js
// Handles layout screens, theme changes, translations mapping, and localization helpers.
// Part of the KinderSprachenAPP open-source project.

import { state, CONFIG, saveProgress, logDebug, debugLogs, loadVocabulary } from './state.js';
import { TRANSLATIONS, STICKERS_CONFIG } from './translations.js';
import { speakGerman } from './audio.js';
import { getWasmExports } from './wasm.js';
import { showGameModal, hideGameModal, getWordTranslation } from './games.js';
import { renderCreatorTable } from './creator.js';

export function switchScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById(`screen-${screenId}`);
    if (target) target.classList.add('active');
    
    // Toggle sidebar navigation highlighting
    document.querySelectorAll('.sidebar-nav .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const navBtn = document.getElementById(`nav-${screenId}-btn`);
    if (navBtn) navBtn.classList.add('active');
    
    // Auto scroll view to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || !savedTheme) {
        document.documentElement.classList.add('dark-mode');
        updateThemeButtons(true);
    } else {
        document.documentElement.classList.remove('dark-mode');
        updateThemeButtons(false);
    }
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeButtons(isDark);
}

export function updateThemeButtons(isDark) {
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

export function populateCategoryDropdown() {
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

export function applyLanguage(lang) {
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

export function renderCategories() {
    const categoriesSet = new Set(state.vocabulary.map(v => v.category));
    const categories = Array.from(categoriesSet);
    
    const container = document.getElementById('categories-container');
    if (!container) return;
    container.innerHTML = '';
    
    const categoryIcons = {
        'Tiere': '🐶',
        'Essen': '🍎',
        'Farben': '🎨',
        'Schule': '🎒',
        'Kleidung': '👕',
        'Körper': '👁️',
        'Familie': '👪',
        'Haus': '🏠',
        'Spielzeug': '🧸',
        'Natur': '🌳'
    };
    
    const t = TRANSLATIONS[state.language] || TRANSLATIONS['de'];
    
    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        
        const icon = categoryIcons[cat] || '❓';
        const transCat = (t.categories && t.categories[cat]) ? t.categories[cat] : cat;
        const displayName = transCat === cat ? cat : `${transCat} (${cat})`;
        
        card.innerHTML = `
            <div class="category-icon">${icon}</div>
            <h3>${displayName}</h3>
        `;
        
        card.addEventListener('click', () => {
            showGameModal(cat);
        });
        
        container.appendChild(card);
    });
}

export function renderStickerAlbum() {
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
            labelEl.textContent = `${t.levelBadgeLabel || 'Level'} ${sticker.level}`;
            
            const lockEl = document.createElement('div');
            lockEl.className = 'sticker-lock-badge';
            lockEl.textContent = '🔒';
            card.appendChild(lockEl);
        }
        
        card.appendChild(labelEl);
        
        if (isUnlocked) {
            card.addEventListener('click', () => {
                // Play German word sound on sticker tap
                speakGerman(sticker.name.de);
                
                if (card.classList.contains('clicked')) return;
                card.classList.add('clicked');
                setTimeout(() => card.classList.remove('clicked'), 600);
            });
        }
        
        container.appendChild(card);
    });
}

export function initUI() {
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
        if (!badge) return;
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
    const triggerUpdateBtn = document.getElementById('trigger-update-check-btn');
    if (triggerUpdateBtn) {
        triggerUpdateBtn.addEventListener('click', () => {
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
    }
    
    // Language dropdown change
    const langSelect = document.getElementById('settings-language-select');
    if (langSelect) {
        langSelect.value = state.language || 'de';
        langSelect.addEventListener('change', (e) => {
            applyLanguage(e.target.value);
        });
    }
}
