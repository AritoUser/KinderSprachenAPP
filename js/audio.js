// js/audio.js
// Synthesized game sound effects (Web Audio API) and German text-to-speech engine.
// Part of the KinderSprachenAPP open-source project.

import { logDebug } from './state.js';

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

/**
 * Synthesizes a cute success chime.
 */
export function playSuccessSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        // Chime note 1
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.3);

        // Chime note 2
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.50, now + 0.08); // C6
        gain2.gain.setValueAtTime(0.1, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.4);
    } catch (e) {
        logDebug(`Audio playback failed: ${e.message}`, 'debug');
    }
}

/**
 * Synthesizes a failure/buzz sound.
 */
export function playErrorSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.25);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {
        logDebug(`Audio playback failed: ${e.message}`, 'debug');
    }
}

/**
 * Synthesizes a triumphant level up fanfare.
 */
export function playLevelUpSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        
        notes.forEach((freq, idx) => {
            const time = now + idx * 0.12;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);
            
            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(time);
            osc.stop(time + 0.45);
        });
    } catch (e) {
        logDebug(`Audio playback failed: ${e.message}`, 'debug');
    }
}

/**
 * Speaks German text using browser SpeechSynthesis.
 * @param {string} text German word to speak.
 */
export function speakGerman(text) {
    if (!('speechSynthesis' in window)) return;
    try {
        // Cancel any speaking in progress
        window.speechSynthesis.cancel();
        
        // Clean text (e.g. remove emojis, clean article helpers)
        const cleanText = text.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "").trim();
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'de-DE';
        
        // Try to pick a natural German voice if available
        const voices = window.speechSynthesis.getVoices();
        const deVoice = voices.find(v => v.lang.startsWith('de') && v.name.includes('Google'));
        if (deVoice) {
            utterance.voice = deVoice;
        } else {
            const deFallback = voices.find(v => v.lang.startsWith('de'));
            if (deFallback) utterance.voice = deFallback;
        }
        
        utterance.rate = 0.85; // Speak slightly slower for kids
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        logDebug(`SpeechSynthesis failed: ${e.message}`, 'debug');
    }
}

// Pre-load voices on browser load
if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
}
