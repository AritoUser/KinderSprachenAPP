# Mitwirken an der Kinder-Deutsch-Lern-App 🤝

Vielen Dank, dass du dich für das Mitwirken an diesem Projekt interessierst! Gemeinsam können wir Kindern den Einstieg in die deutsche Sprache erleichtern.

Es gibt viele Möglichkeiten, wie du mithelfen kannst:
- **Programmierung:** Neue Mini-Spiele entwickeln, UI-Verbesserungen vornehmen oder den Zig-Core optimieren.
- **Inhalte (Vokabeln):** Neue Wörter, Kategorien oder Übersetzungen hinzufügen.
- **Design & Sound:** Kindgerechte Grafiken, Icons oder Sprachaufnahmen bereitstellen.
- **Feedback & Bug-Reports:** Probleme melden oder Ideen einbringen.

---

## 🛠️ Entwicklungs-Workflow

### Code-Änderungen vornehmen
1. Erstelle einen neuen Branch für deine Änderungen:
   ```bash
   git checkout -b feature/mein-neues-spiel
   ```
2. Nimm deine Änderungen vor.
3. Wenn du Änderungen am Zig-Code (`src/core.zig`) vorgenommen hast, kompiliere ihn neu:
   ```powershell
   ./build_wasm.ps1
   ```
4. Teste die App lokal mit einem Webserver (z. B. `npx http-server ./`).
5. Erstelle einen Commit und pushe ihn in deinen Fork:
   ```bash
   git commit -am "Füge neues Memory-Spiel hinzu"
   git push origin feature/mein-neues-spiel
   ```
6. Erstelle einen Pull Request (PR) auf GitHub gegen den `develop`-Branch.

### Wie füge ich neue Vokabeln hinzu?
Vokabeln befinden sich in [content/vocabulary.json](content/vocabulary.json). Du kannst sie entweder direkt im Texteditor bearbeiten oder in der App den **"Content Creator" (Inhalts-Editor)** nutzen.
Mit dem visuellen Inhalts-Editor kannst du:
1. Neue Wörter mit Artikel, Übersetzung, Kategorie und Emoji erfassen.
2. Die Liste als JSON-Datei exportieren.
3. Die exportierte Datei als Ersatz für `content/vocabulary.json` ins Projekt einpflegen.

Jedes Wort hat folgende Struktur:
```json
{
  "id": "apfel",            // Eindeutige ID (Kleinbuchstaben)
  "word": "der Apfel",      // Deutsches Wort (mit Artikel)
  "translation": "Apple",   // Übersetzung (z.B. Englisch oder Muttersprache des Kindes)
  "category": "Essen",      // Kategorie (z.B. Tiere, Farben, Essen, Schule, Kleidung)
  "emoji": "🍎",            // Passendes Emoji als visuelle Hilfe
  "difficulty": 1           // Schwierigkeitsgrad (1 = Einfach, 2 = Mittel, 3 = Schwer)
}
```

---

## 🎨 Design-Richtlinien
- **Zielgruppe:** Kinder von 4 bis 10 Jahren. Die UI sollte farbenfroh, aber aufgeräumt sein. Keine komplexen Texte, sondern Symbole, Emojis und visuelle Rückmeldungen (z.B. grünes Leuchten bei richtig, sanftes Rütteln bei falsch).
- **Barrierefreiheit:** Große Touch-Targets für kleine Finger auf Smartphones und Tablets.
- **Wortwahl:** Verwende Nomen immer mit ihrem Artikel (der, die, das) und markiere diese farblich (z.B. Blau für Maskulinum, Rot für Femininum, Grün für Neutrum), um das Lernen des grammatikalischen Geschlechts zu unterstützen.

---

## 📜 Verhaltenskodex
Bitte verhalte dich respektvoll gegenüber allen Mitgliedern der Community. Wir möchten ein offenes, freundliches und einladendes Umfeld für alle schaffen.
