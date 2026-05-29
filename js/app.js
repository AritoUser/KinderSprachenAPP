// js/app.js
// Main entry point and lifecycle manager. Bootstraps modules and registers PWA worker.
// Part of the KinderSprachenAPP open-source project.

import { state, CONFIG, loadProgress, updateXPBar, loadVocabulary, logDebug } from './state.js';
import { loadWasm } from './wasm.js';
import { initUI, initTheme, applyLanguage, renderCategories } from './ui.js';
import { handleAddVocab } from './creator.js';

// Global error handlers
window.addEventListener('error', (event) => {
    logDebug(`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, 'error');
});
window.addEventListener('unhandledrejection', (event) => {
    logDebug(`Unhandled promise rejection: ${event.reason}`, 'error');
});

document.addEventListener('DOMContentLoaded', async () => {
    loadProgress();
    initTheme();
    initUI();
    applyLanguage(state.language);
    
    const versionBadge = document.getElementById('app-version-badge');
    if (versionBadge) versionBadge.textContent = CONFIG.version;
    
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
    if (!toast) return;
    toast.classList.remove('hidden');
    
    const updateBtn = document.getElementById('update-btn');
    if (updateBtn) {
        updateBtn.onclick = () => {
            // Tell the waiting worker to activate
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
                // Fallback reload if worker reference was lost
                window.location.reload();
            }
            toast.classList.add('hidden');
        };
    }
    
    const closeToastBtn = document.getElementById('close-toast-btn');
    if (closeToastBtn) {
        closeToastBtn.onclick = () => {
            toast.classList.add('hidden');
        };
    }
}
