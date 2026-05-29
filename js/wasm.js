// js/wasm.js
// Handles WebAssembly binary initialization, imports/exports and JavaScript fallbacks.
// Part of the KinderSprachenAPP open-source project.

import { logDebug, CONFIG } from './state.js';

let wasmExports = null;

export function getWasmExports() {
    return wasmExports;
}

export async function loadWasm() {
    const loadingScreen = document.getElementById('wasm-loading-screen');
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    
    try {
        logDebug('Fetching WebAssembly core...');
        const response = await fetch(CONFIG.vocabPath.replace('content/vocabulary.json', CONFIG.wasmPath)); // Resolve relative path cleanly
        const fetchUrl = response.url ? response.url : CONFIG.wasmPath;
        
        logDebug(`Instantiating WebAssembly core from ${CONFIG.wasmPath}...`);
        const fetchResp = await fetch(CONFIG.wasmPath);
        if (!fetchResp.ok) throw new Error(`Wasm file could not be loaded: ${fetchResp.statusText}`);
        
        const wasmBytes = await fetchResp.arrayBuffer();
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
export function setupJsFallbacks() {
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
