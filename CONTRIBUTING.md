# Contributing to the German-Learning-App 🤝

Thank you for your interest in contributing to this project! Together, we can make it easier for children to start learning German.

There are many ways you can help:
- **Coding:** Developing new mini-games, improving the UI, or optimizing the Zig WebAssembly core.
- **Content (Vocabulary):** Adding new words, categories, or translations.
- **Design & Audio:** Providing child-friendly graphics, icons, or pronunciation recordings.
- **Feedback & Bug Reports:** Reporting issues or suggesting new features.

---

## 🛠️ Development Workflow

### Making Code Changes
1. Create a new branch for your changes:
   ```bash
   git checkout -b feature/my-new-game
   ```
2. Make your modifications.
3. If you changed the Zig code (`src/core.zig`), recompile the WebAssembly binary:
   ```powershell
   ./build_wasm.ps1
   ```
4. Test the app locally using a web server (e.g. `npx http-server ./`).
5. Commit and push your changes to your fork:
   ```bash
   git commit -am "Add new Memory card matching game"
   git push origin feature/my-new-game
   ```
6. Create a Pull Request (PR) on GitHub targeting the `develop` branch.

### How to Add New Vocabulary?
Vocabulary cards are stored in [content/vocabulary.json](content/vocabulary.json). You can edit this file directly or use the **"Content Creator"** inside the app.
Using the visual editor, you can:
1. Enter new words with their article, translation, category, and emoji.
2. Export the updated list as a JSON file.
3. Use the exported file to overwrite `content/vocabulary.json` in the project.

Each word follows this structure:
```json
{
  "id": "apfel",            // Unique ID (lowercase, alphanumeric)
  "word": "der Apfel",      // German word (with article)
  "translation": "Apple",   // Translation (English or the child's native language)
  "category": "Essen",      // Category (e.g., Tiere, Farben, Essen, Schule, Kleidung)
  "emoji": "🍎",            // Visual aid emoji
  "difficulty": 1           // Difficulty level (1 = Easy, 2 = Medium, 3 = Hard)
}
```

---

## 🎨 Design Guidelines
- **Target Audience:** Kids aged 4 to 10. The UI should be colorful but uncluttered. Avoid complex text instructions; instead, use symbols, emojis, and clear visual feedback (e.g., glowing green for correct, gentle shaking for incorrect).
- **Accessibility:** Large touch targets for small fingers on smartphones and tablets.
- **Language Learning:** Always include articles (`der`, `die`, `das`) for nouns. Nouns are color-coded (Blue for masculine, Red for feminine, Green for neuter) to help kids learn grammatical genders.

---

## 📜 Code of Conduct
Please be respectful and welcoming to all community members. We want to foster a friendly and collaborative environment.
