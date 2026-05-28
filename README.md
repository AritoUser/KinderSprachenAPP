# Kinder-Deutsch-Lern-App 🇩🇪🎮

Eine spielerische, kostenlose und quelloffene (Open-Source) Sprachlern-App, die speziell für geflüchtete Kinder entwickelt wurde, in deren Elternhaus kein Deutsch gesprochen wird. Ziel der App ist es, Kindern über spielerische Interaktion (Gamification) spielend leicht Deutsch beizubringen.

Die App funktioniert **vollständig offline** und läuft auf allen Geräten von **Smartphones bis Tablets**. Dank Progressive Web App (PWA)-Technologie prüft sie bei Internetverbindung automatisch auf GitHub nach Updates und fragt nach, ob die neue Version heruntergeladen werden soll – dabei bleiben alle bisherigen Spielstände und Fortschritte im lokalen Speicher erhalten!

## 🚀 Features
- **Offline-First:** Nach dem ersten Laden läuft die App ohne Internetverbindung.
- **Update-System:** Einfache Benachrichtigung bei neuen GitHub-Releases, Aktualisierung per Klick ohne Verlust von Spielständen (XP, Level, etc.).
- **Vibrant & Modern UI:** Kinderfreundliches, farbenfrohes Design mit flüssigen Animationen und großen Touch-Flächen (ohne Reizüberflutung).
- **Zig & WebAssembly Core:** Die Kernlogik (Vokabel-Verarbeitung, Spielregeln und Fortschritte) ist in der performanten Programmiersprache **Zig** geschrieben und zu **WebAssembly (Wasm)** kompiliert.
- **Einfache Inhaltserweiterung:** Vokabeln werden in einer einfachen JSON-Datei gepflegt. Zudem gibt es einen integrierten visuellen Editor (Content Creator), mit dem auch technisch nicht versierte Personen neue Vokabeln hinzufügen und exportieren können.

---

## 🛠️ Tech Stack & Struktur
- **Core:** [Zig](https://ziglang.org/) (kompiliert zu `wasm32-freestanding`)
- **UI / Design:** HTML5, Modern Vanilla CSS (keine dicken Frameworks, extrem schnell geladen)
- **Logik / Speicher:** JavaScript (Wasm-Lader, Service Worker für Offline-Caching, `localStorage` für Spielstände)
- **Struktur:**
  - `src/core.zig` - Der in Zig geschriebene Berechnungs- und Logik-Kern
  - `content/vocabulary.json` - Die Vokabeldatenbank
  - `index.html`, `style.css`, `app.js` - Das Frontend
  - `sw.js` - Der Service Worker für Offline-Fähigkeit und Update-Mechanismus
  - `tools/zig/` - Lokaler Zig-Compiler (wird automatisch per Skript eingerichtet)

---

## 💻 Lokale Einrichtung & Entwicklung

### 1. Repository klonen
```bash
git clone https://github.com/DEIN-USERNAME/KinderSprachenAPP.git
cd KinderSprachenAPP
```

### 2. Zig Compiler lokal einrichten
Du benötigst keinen global installierten Zig-Compiler. Führe einfach das Powershell-Skript im Projektverzeichnis aus:
```powershell
./setup_zig.ps1
```
Dies lädt die portable Version von Zig 0.13.0 herunter und entpackt sie in den Ordner `tools/zig/`.

### 3. WebAssembly Core kompilieren
Führe das Build-Skript aus, um den Zig-Core zu kompilieren:
```powershell
./build_wasm.ps1
```
Dies generiert die Datei `assets/wasm/core.wasm`.

### 4. App lokal ausführen
Da WebAssembly-Dateien und Service Worker aus Sicherheitsgründen nicht direkt über das Dateisystem (`file://`) geladen werden können, wird ein lokaler Webserver benötigt. Du kannst z. B. NodeJS `http-server` nutzen:
```bash
# Falls node installiert ist:
npx http-server ./
# Oder ein beliebiges anderes Tool wie VS Code "Live Server"
```
Öffne die angegebene URL (z.B. `http://localhost:8080`) in deinem Browser.

---

## 🤝 Mitwirken (Contributing)
Beiträge sind herzlich willkommen! Egal ob du Entwickler bist, Vokabeln übersetzen möchtest oder neue Ideen für Mini-Spiele hast. Bitte lies unsere [CONTRIBUTING.md](CONTRIBUTING.md) für weitere Informationen.

## 📄 Lizenz
Dieses Projekt steht unter der [MIT Lizenz](LICENSE).
