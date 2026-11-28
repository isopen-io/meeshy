# Configuration détectée (relevé du 2026-11-28, `dev` @ 829707d0)

## Orchestration
- **Turborepo 2.11** (`turbo.json`) sur des **workspaces pnpm/bun** (`package.json` → `workspaces: apps/*, services/*, packages/*`). Ni Nx, ni Lerna, ni Bazel. Cache distant désactivé.
- Le graphe natif : `npx turbo run build --dry-run=json`. Il ne voit que les six workspaces JavaScript ; les projets natifs (Gradle, SwiftPM, xcodegen, Cargo) ont chacun le leur. `scripts/inventaire.mjs` les relève tous.
- La détection « ce qui est touché » de la CI n'utilise pas turbo : `scripts/ci-affected.mjs` compare les chemins modifiés à des listes de préfixes tenues à la main, par domaine de jobs.

## Versions épinglées
| Outil | Épingle | Où |
|---|---|---|
| bun | 1.3.14 | `BUN_VERSION` des workflows et Dockerfiles, vérifié par `scripts/check-bun-lockfile-parity.mjs` |
| pnpm | 9.15.0 | `packageManager` |
| Node | ≥ 22.19 | `engines` ; CI 22.19 ; images `node:22-*` (flottant) |
| TypeScript | ^6.0.3 | racine |
| Python (traducteur) | 3.10 en CI, `>=3.10,<3.11` dans `pyproject.toml`, **3.11 par défaut dans le Dockerfile** | voir RISK-REGISTER R3 |
| Swift | 6.2, iOS 16+ | `packages/MeeshySDK/Package.swift` |
| Android | minSdk 26, targetSdk 36 | `apps/android/app` |
| libsignal | 0.106.2 sur toutes les plateformes | `packages/shared/__tests__/ci/libsignal-version-alignment.test.ts` |

## Limites de l'environnement de session (conteneur Linux)
- bun 1.4.4, pas 1.3.14 : installer avec `--no-save`, ne jamais committer `bun.lock`.
- `download.pytorch.org` et `dl.google.com` refusés par le proxy : le traducteur et Android ne s'installent pas ici.
- Pas de macOS : iOS, MeeshySDK et LibSignalClient ne se compilent qu'en CI.
- Conséquence : pour ces projets, la preuve est l'identifiant d'un run CI, jamais une exécution locale.

## Configuration Claude Code
- `.claude/settings.json` : hook `SessionStart` (prépare l'arbre), `PreToolUse` → `worktree-limit.sh`, `garde-commandes.sh`, `garde-ecritures.sh`.
- `.claude/agents/` : 13 agents (6 du dépôt, 7 ajoutés par #20763). `.claude/skills/` : 6 skills. `.claude/workflows/` : scripts de workflows multi-agents du dépôt.
- `.githooks/commit-msg` : refuse un message qui combine un marqueur bêta et un saut de CI (#6351).
