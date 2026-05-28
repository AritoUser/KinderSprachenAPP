# Design Document (DESIGN.md) 🎨📱

This document describes the design philosophy, visual identity, and user interface (UI) / user experience (UX) implementation details of the **German-Learning-App**.

---

## 1. Design Philosophy & Target Audience
The app is primarily designed for **children aged 4 to 10 years**, with a focus on refugee children who do not speak German at home.

As a result, the design follows these core principles:
- **Intuitive Without Text:** Children who cannot read German yet must be able to navigate the app through symbols (emojis), colors, and animations alone. Text instructions are kept to a absolute minimum.
- **No Sensory Overload:** Clean layout with generous white space guides children's focus directly to the vocabulary and graphics they are learning.
- **Gamification & Rewards:** Gamified progress (XP bar, level badge, success animations) keeps children engaged and motivated.

---

## 2. Visual Identity

### Color Palette (Harmonious & Vibrant)
We use modern, HSL-tailored colors that look friendly and engaging:
- **Primary Blue (`#5271FF`):** Used for primary buttons, titles, and active navigation.
- **Success Green (`#2EC4B6`):** Used for correct answers, progress highlights, and success screens.
- **Error Pink/Red (`#FF5B7F`):** Gentle feedback color for incorrect attempts (avoiding harsh red).
- **Warning Yellow (`#FF9F1C`):** Used for XP badge, points counter, and star icons.
- **App Background (`#F5F7FB`):** A soft, light blue-grey background decorated with gentle pastel background gradients.

### Pedagogical Color-Coding (Articles)
Learning grammatical gender (der, die, das) is one of the biggest challenges in German. The app uses a consistent visual color-coding system:
- 🔵 **Blue (`#3A86FF`):** Masculine nouns with the article **"der"** (e.g., *der Hund*).
- 🔴 **Red/Pink (`#FF006E`):** Feminine nouns with the article **"die"** (e.g., *die Katze*).
- 🟢 **Green (`#38B000`):** Neuter nouns with the article **"das"** (e.g., *das Buch*).
- 🟣 **Purple (`#8338EC`):** Words without articles, such as colors or adjectives (e.g., *Rot*).

These colors are applied to text highlights and button hovers to help anchor the correct gender in children's visual memory.

---

## 3. Typography
- **Font Family:** [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts).
- **Rationale:** Outfit is a geometric sans-serif typeface with soft, rounded terminals. It feels friendly, child-appropriate, modern, and is highly legible.

---

## 4. UI Components & Layouts

### Glassmorphism
To create a high-fidelity, premium look and feel, we integrate **glassmorphism** design elements:
- Semi-transparent white backgrounds with a backing blur (`backdrop-filter: blur(12px)`).
- Thin, subtle borders (`border: 1px solid rgba(255, 255, 255, 0.4)`) mimicking polished glass.
- Applied to the app header, game modals, settings, and card wrappers.

### Responsive Design
The layout adjusts automatically depending on the viewport size:
- **Smartphones:** Single-column layout optimized for easy thumb reach. Action buttons span the full width to increase touch target accuracy for children.
- **Tablets & Desktop:** Multi-column grids for categories and centered workspace templates to make use of screen width without looking sparse.

---

## 5. Micro-Interactions & Animations
Micro-animations make the app feel alive and interactive:
- **Bouncy Hover:** Cards and buttons lift slightly (`transform: translateY(-8px)`) and scale up slightly on hover.
- **Success Feedback:** Correct selections glow green and perform a quick spring "pop" animation.
- **Error Feedback:** Wrong choices flash pink and perform a fast horizontal shake animation, encouraging the child to try again.
- **Level-Up:** A custom overlay pops up celebrating level changes.

---

## 6. Technical Design Decisions (Performance & Accessibility)
- **100% Offline-First (PWA):** All CSS, JS, HTML, Wasm, and content assets are cached locally by a Service Worker. The app loads instantly even with zero connectivity.
- **Emoji-Driven Visuals:** Instead of hosting heavy image asset folders, the app utilizes system emojis (e.g., 🍎, 🐱, 🎒). This ensures a fast page load speed (< 1 second) and zero download latency for kids.
- **Large Touch Targets:** All interactive components have a minimum target of `48px` width/height to avoid click frustrations.
