# StarCraft2 Wiki

Static GitHub Pages site for the StarCraft II tech tree explorer.

## Local structure

- `index.html`: landing page
- `terran-tech-tree.html`: Terran tech tree
- `zerg-tech-tree.html`: Zerg tech tree
- `protoss-tech-tree.html`: Protoss tech tree

## GitHub Pages

This repo is configured to deploy with GitHub Actions from the `main` branch via `.github/workflows/deploy-pages.yml`.

## Firebase likes

The three race tech-tree pages now include a global like counter backed by Firebase Realtime Database.

Setup steps:

1. Create a Firebase project and add a Web app.
2. Enable Realtime Database.
3. `firebase-config.js` holds the Firebase web config used by the live like counter.
4. Create database paths under `techTreeLikes/terran/count`, `techTreeLikes/zerg/count`, and `techTreeLikes/protoss/count`, or let them be created automatically on first like.
5. Make sure your Realtime Database rules allow reads and writes for those counters.

Minimal example rules:

```json
{
  "rules": {
    "techTreeLikes": {
      "$race": {
        "count": {
          ".read": true,
          ".write": true,
          ".validate": "newData.isNumber() && newData.val() >= 0"
        }
      }
    }
  }
}
```

Client behavior:

- Each browser stores its like state in `localStorage`, so the same browser can only like each race once.
- The global count is read live from Firebase and updated through a database transaction.
- If the Firebase scripts fail to load or the config becomes invalid, the like widget stays disabled and explains why.
