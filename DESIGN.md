# Design-Dokument (DESIGN.md) 🎨📱

Dieses Dokument beschreibt die Design-Philosophie, die visuelle Identität und die technologische Umsetzung der Benutzeroberfläche (UI) und Benutzererfahrung (UX) der **Kinder-Deutsch-Lern-App**.

---

## 1. Design-Philosophie & Zielgruppe
Die App richtet sich primär an **Kinder im Alter von 4 bis 10 Jahren**, insbesondere an Kinder mit Fluchthintergrund, die zu Hause kein Deutsch sprechen. 

Aus diesem Grund folgt das Design diesen Grundregeln:
- **Intuitiv ohne Textverständnis:** Kinder, die noch kein Deutsch können, müssen die App allein durch Symbole (Emojis), Farben und Animationen bedienen können. Textuelle Erklärungen werden auf ein Minimum reduziert.
- **Keine Reizüberflutung:** Ein sauberes, klares Layout mit viel Weißraum lenkt die Aufmerksamkeit der Kinder direkt auf das Wesentliche (z.B. das zu lernende Wort oder Bild).
- **Gamification & Belohnung:** Visuelle Fortschritte (XP-Leiste, Level-Ups, spielerische Animationen bei Erfolg) motivieren zum Weitermachen.

---

## 2. Visuelle Identität

### Farbpalette (Harmonisch & Vibrant)
Wir verwenden moderne HSL-basierte Farben, die freundlich und einladend wirken:
- **Primary Blue (`#5271FF`):** Steht für Interaktion und Navigation.
- **Success Green (`#2EC4B6`):** Signalisiert richtige Antworten und Fortschritt.
- **Error Pink/Red (`#FF5B7F`):** Sanftes Feedback bei falschen Antworten (kein aggressives Rot).
- **Warning Yellow (`#FF9F1C`):** Für Punkte, XP-Anzeigen und Highlights.
- **Hintergrund (`#F5F7FB`):** Ein sehr helles, augenschonendes Grau-Blau mit sanften, bunten Farbverläufen im Hintergrund.

### Pädagogische Farbkodierung (Artikel-Lernen)
Das Erlernen des grammatikalischen Geschlechts (der, die, das) ist eine der größten Hürden im Deutschen. Die App verwendet eine konsequente Farbkodierung für Artikel:
- 🔵 **Blau (`#3A86FF`):** Maskuline Nomen mit dem Artikel **"der"** (z. B. *der Hund*).
- 🔴 **Rot/Pink (`#FF006E`):** Feminine Nomen mit dem Artikel **"die"** (z. B. *die Katze*).
- 🟢 **Grün (`#38B000`):** Neutrale Nomen mit dem Artikel **"das"** (z. B. *das Buch*).
- 🟣 **Lila (`#8338EC`):** Wörter ohne Artikel, wie z. B. Farben (z. B. *Rot*).

Diese Farben werden sowohl auf den Spielknöpfen (Hover-Zustand) als auch bei der Textdarstellung verwendet, um das visuelle Gedächtnis der Kinder zu unterstützen.

---

## 3. Typografie
- **Schriftart:** [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts).
- **Begründung:** Outfit ist eine serifenlose, geometrische Schriftart mit weichen, abgerundeten Ecken. Sie wirkt dadurch extrem modern, freundlich und ist für Kinder sehr leicht lesbar.

---

## 4. UI-Komponenten & Layouts

### Glassmorphismus
Um der App ein besonders hochwertiges und modernes Erscheinungsbild zu verleihen, nutzen wir **Glassmorphismus-Effekte**:
- Halbdurchsichtige, weiße Hintergründe mit einer leichten Weichzeichnung dahinter (`backdrop-filter: blur(12px)`).
- Dünne, weiße Rahmenlinien (`border: 1px solid rgba(255, 255, 255, 0.4)`), die wie geschliffenes Glas wirken.
- Gefundene Anwendung im App-Header, in Modals und in den Einstellungs-Karten.

### Responsive Design
Das Layout passt sich nahtlos an alle Bildschirmgrößen an:
- **Smartphones:** Einspaltiges Design, optimiert für Daumen-Bedienung. Die Spiel-Auswahl-Buttons dehnen sich über die gesamte Breite aus, um die Treffsicherheit für kleine Kinderfinger zu erhöhen.
- **Tablets & Desktop:** Mehrspaltige Grids für die Kategorien-Auswahl und zentrierte Spielbereiche, um eine optimale Raumausnutzung zu garantieren.

---

## 5. Mikro-Interaktionen & Animationen
Kleine Animationen machen die App lebendig und reagieren dynamisch auf Aktionen:
- **Bouncy Hover:** Kacheln und Buttons heben sich beim Darüberfahren leicht an (`transform: translateY(-8px)`) und vergrößern sich minimal.
- **Erfolgs-Feedback:** Bei einer korrekten Antwort leuchtet der Button grün auf und macht eine kurze "Pop"-Animation (Skalierung auf 115% und zurück).
- **Fehler-Feedback:** Bei einer falschen Antwort rüttelt sich der ausgewählte Button kurz nach links und rechts (`shake`-Animation), um dem Kind spielerisch zu signalisieren: *"Versuch es noch einmal!"*.
- **Level-Up:** Ein animiertes Popup-Fenster mit Konfetti-Charakter belohnt das Kind beim Erreichen eines neuen Meilensteins.

---

## 6. Technische Designentscheidungen (Performance & Zugänglichkeit)
- **100% Offline-First (PWA):** Alle Layout-Assets, Schriften und der WebAssembly-Core werden lokal im Browser-Cache gespeichert. Das Design lädt und reagiert auch ohne jede Internetverbindung sofort.
- **Verwendung von Emojis:** Anstelle von schweren Bilddateien nutzt die App standardisierte System-Emojis (z. B. 🍎 für Apfel, 🐶 für Hund). Das hält die App winzig klein (Ladezeit < 1 Sekunde), sorgt für eine konsistente Darstellung und spart mobilen Datenverkehr beim ersten Download.
- **Große Touch-Targets:** Alle Buttons haben ein großzügiges Padding (mindestens `48px` Höhe/Breite), um Frustration durch Fehlklicks bei jüngeren Kindern zu vermeiden.
