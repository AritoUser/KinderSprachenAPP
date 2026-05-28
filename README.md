# German-Learning-App for Kids 🇩🇪🎮

A playful, free, and open-source language learning application specifically designed for refugee children or kids who do not speak German at home. The goal of this app is to help children learn German easily through gamification and fun.

The app is **fully offline-capable** and works on all devices from **smartphones to tablets**. Using Progressive Web App (PWA) technology, it automatically checks GitHub for updates when an internet connection is available and prompts the user to download the new version – while keeping all previous game progress and XP intact!

## 🚀 Features
- **Offline-First:** Runs completely offline after the initial load.
- **Update System:** Automatic update check and prompt when new versions are deployed to GitHub, preserving user progress (XP, level, custom cards).
- **Vibrant & Modern UI:** A child-friendly, colorful interface with smooth animations and large touch targets, designed to avoid sensory overload.
- **Zig & WebAssembly Core:** The core logic (vocabulary management, game rules, progress calculation) is written in **Zig** and compiled to **WebAssembly (Wasm)**.
- **Easy Content Extension:** Vocabulary is managed in a simple JSON file. Additionally, a built-in visual editor (Content Creator) allows non-technical parents or teachers to add new vocabulary cards and export them.

---

## 🛠️ Tech Stack & Structure
- **Core:** [Zig](https://ziglang.org/) (compiled to `wasm32-freestanding`)
- **UI / Design:** HTML5, Modern Vanilla CSS (no heavy frameworks, loads instantly)
- **Logic & Storage:** JavaScript (Wasm loader, Service Worker for offline-caching, `localStorage` for game progress)
- **Folder Structure:**
  - `src/core.zig` - Logic core written in Zig.
  - `content/vocabulary.json` - Vocabulary database.
  - `index.html`, `style.css`, `app.js` - App frontend.
  - `sw.js` - Service Worker for offline caching and updating.
  - `tools/zig/` - Local Zig compiler (automatically set up via script).

---

## 💻 Local Setup & Development

### 1. Clone the repository
```bash
git clone https://github.com/AritoUser/KinderSprachenAPP.git
cd KinderSprachenAPP
```

### 2. Setup Local Zig Compiler
You do not need a globally installed Zig compiler. Simply run the PowerShell script in the root directory:
```powershell
./setup_zig.ps1
```
This downloads the portable Zig 0.13.0 compiler and extracts it into the `tools/zig/` folder.

### 3. Compile WebAssembly Core
Build the Zig core targeting WebAssembly:
```powershell
./build_wasm.ps1
```
This generates the `assets/wasm/core.wasm` file.

### 4. Run the App Locally
Because WebAssembly and Service Workers require a secure origin, the app cannot be opened directly via the filesystem (`file://`). You need a local web server (e.g. NodeJS `http-server`):
```bash
# If node is installed:
npx http-server ./
# Or any other live server tool (e.g. VS Code Live Server extension)
```
Open the provided URL (e.g., `http://localhost:8080`) in your browser.

---

## 🤝 Contributing
Contributions are welcome! Whether you are a developer, translator, or designer. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📄 License
This project is licensed under the [MIT License](LICENSE).
