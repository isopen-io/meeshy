# Meeshy - CLAUDE.md

## Project Overview
Meeshy is a high-performance real-time messaging platform with multi-language translation, voice cloning, and end-to-end encryption. It supports 100k+ messages/second with simultaneous multi-language translation.

## Prisme Linguistique — Philosophie Produit

Le Prisme Linguistique est le principe fondamental de l'experience Meeshy :

**Par defaut, l'utilisateur consomme tout le contenu dans sa langue principale configuree.** Les traductions sont appliquees automatiquement, de maniere elegante et discrete — l'utilisateur ne devrait jamais ressentir de friction linguistique.

### Principes
- **Transparence** : Le contenu traduit s'affiche comme du contenu natif. Pas de popup, pas de banniere intrusive
- **Discretion** : Un indicateur subtil (icone translate, badge langue) signale qu'une traduction est active, sans distraire
- **Exploration** : L'utilisateur peut a tout moment voir l'original ou explorer d'autres langues via un geste naturel (long press, tap icone)
- **Automatisme** : La resolution de langue preferee est automatique (langue principale > langues secondaires > original)
- **Coherence** : Le prisme s'applique a TOUT le contenu — messages texte, transcriptions audio, metadonnees, previews

### Pipeline technique
```
Message recu → Detection langue originale → Traduction auto (NLLB-200 via translator)
→ Stockage MongoDB (MessageTranslation[]) → Push Socket.IO → Client affiche dans langue preferee
```

### Resolution de langue
1. Override manuel utilisateur (selection explicite dans l'onglet Language)
2. Langue principale configuree dans le profil
3. Langues secondaires configurees
4. Contenu original (fallback)

## Architecture

```
apps/web (Next.js 15)        apps/ios (SwiftUI)
         ↓ WebSocket/HTTP              ↓ REST/WebSocket
services/gateway (Fastify 5 + Socket.IO + ZMQ)
         ↓ ZeroMQ (PUSH/SUB)
services/translator (FastAPI + PyTorch + Whisper + TTS)
         ↓
MongoDB 8 (Prisma) + Redis 8
```

### Monorepo Structure
```
apps/web/          → Next.js 15 frontend (port 3100)
apps/ios/          → SwiftUI iOS app
services/gateway/  → Fastify 5 API + WebSocket (port 3000)
services/translator/ → FastAPI ML service (port 8000)
packages/shared/   → TypeScript types, Prisma schema, encryption
packages/MeeshySDK/ → Swift SDK for iOS
infrastructure/    → Docker, Traefik, env configs
scripts/           → Deployment & maintenance scripts
tests/             → E2E tests (Playwright)
docs/              → Architecture & feature documentation
```

### Build System
- **Package Manager**: pnpm 9+ (primary), bun 1.1+ (optional)
- **Orchestrator**: Turborepo with remote caching
- **Workspaces**: `apps/*`, `services/*`, `packages/*`

## Development Philosophy

### TDD is Non-Negotiable
Every line of production code must be written in response to a failing test. RED-GREEN-REFACTOR in small, known-good increments:
1. **RED**: Write failing test first (NO production code without failing test)
2. **GREEN**: Write MINIMUM code to pass test
3. **REFACTOR**: Assess improvement opportunities (only if adds value)

Each increment leaves the codebase in a working state.

### Testing Principles
- Test **behavior**, not implementation
- Test through public API exclusively
- Use factory functions for test data (no `let`/`beforeEach` mutation)
- 100% coverage through business behavior
- No 1:1 mapping between test files and implementation files
- Use real schemas/types in tests, never redefine them

### TypeScript Guidelines
- **Strict mode always** across all TypeScript services
- No `any` types - ever (use `unknown` if type truly unknown)
- No type assertions without justification
- Prefer `type` over `interface` for data structures
- Reserve `interface` for behavior contracts only
- Define schemas first (Zod), derive types from them at trust boundaries

### Code Style
- **Immutable data only** - no mutation
- Pure functions wherever possible
- No nested if/else - use early returns or composition
- No comments - code should be self-documenting
- Prefer options objects over positional parameters
- Use array methods (`map`, `filter`, `reduce`) over loops

### Preferred Tools
- **Language**: TypeScript strict mode (JS services), Swift (iOS), Python (translator)
- **Testing**: Jest/Vitest + React Testing Library (web), pytest (Python), XCTest (iOS)
- **Validation**: Zod (TypeScript), Pydantic (Python)
- **State**: Zustand (web), SwiftUI @Published (iOS)

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Parallel Worktree Strategy

Pour les larges feature sets, utiliser git worktrees pour le travail agent parallele:

### Setup
```bash
git worktree add ../v2_meeshy-{branch-name} -b {branch-name} main
```

### Regles
1. Chaque worktree possede des fichiers specifiques -- JAMAIS deux worktrees sur le meme fichier
2. project.pbxproj: gere par le DERNIER worktree a merger uniquement
3. Ordre de merge: branches pure-UI d'abord, branches avec fichiers partages en dernier
4. Chaque agent lance `./apps/ios/meeshy.sh build` dans son worktree pour verifier
5. Apres tous les merges, clean build depuis main pour catcher les problemes d'integration

### Convention de nommage
```
feat/{area}-{feature}  ex: feat/settings-legal, feat/settings-account
```

### Worktree Directory
```
../v2_meeshy-{branch-name}  (sibling du repo principal)
```

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Critical Rules

### Event Naming Convention
Socket.IO events use `entity:action-word` format with **hyphens** (NOT underscores):
```
message:send-with-attachments   (client → server)
message:new                     (server → client)
reaction:added                  (server → client)
```
Source of truth: `packages/shared/types/socketio-events.ts`

### Docker Environment Variables
**NEVER quote YAML env var values** in docker-compose files:
```yaml
# CORRECT
NEXT_PUBLIC_API_URL=https://gate.meeshy.me

# WRONG - causes double-quoting syntax errors in JS
NEXT_PUBLIC_API_URL="https://gate.meeshy.me"
```

### Database
- **MongoDB 8** with replica set (NOT PostgreSQL - copilot-instructions.md is outdated)
- **Prisma ORM** - Schema at `packages/shared/prisma/schema.prisma`
- IDs are MongoDB ObjectIds (24-char hex strings)

### Authentication
- **Registered users**: JWT via `Authorization: Bearer {token}`
- **Anonymous users**: Session token via `X-Session-Token` header (NO encryption)
- Roles: BIGBOSS > ADMIN > MODERATOR > AUDIT > ANALYST > USER

### Type Safety
- All shared types in `packages/shared/types/` - single source of truth
- Use `@meeshy/shared` imports across services
- Prisma schema generates DB types; manual types extend them
- NO `any` in shared package - use `unknown` with validation

## Development Environment

### Local Services (tmux "meeshy")
- Window 0: translator (FastAPI, port 8000)
- Window 1: gateway (Fastify, port 3000)
- Window 2: web (Next.js, port 3100)
- Window 3: web_v2

### Docker Environments
| Environment | Compose File | SSL | Domains |
|-------------|-------------|-----|---------|
| dev | docker-compose.dev.yml | HTTP | localhost:3100/3000/8000 |
| local | docker-compose.local.yml | mkcert | *.meeshy.local |
| prod | docker-compose.prod.yml | Let's Encrypt | meeshy.me |

### Production
- Server: `root@meeshy.me` at `/opt/meeshy/production/`
- Production docker-compose.yml differs from repo (different container/image names)
- Container names: `meeshy-frontend`, `meeshy-gateway`, `meeshy-translator`
- Healthcheck ~30s before Traefik routes traffic

### iOS Build
Always use `./apps/ios/meeshy.sh`:
```bash
./apps/ios/meeshy.sh build   # Build only (non-blocking)
./apps/ios/meeshy.sh run     # Build+install+launch+logs (BLOCKS)
```

### Test Credentials
- Username: `atabeth` / Password: `pD5p1ir9uxLUf2X2FpNE`

### Redis Rate Limit Reset
```bash
docker exec meeshy-local-redis redis-cli DEL "ratelimit:auth:login:ip:{ip}:{prefix}"
```

## Key Patterns

### API Response Format (all services)
```typescript
{ success: boolean, data?: T, error?: { code, message }, pagination?: PaginationMeta }
```

### ZMQ Communication (Gateway ↔ Translator)
- Gateway PUSH → Translator PULL (port 5555)
- Translator PUB → Gateway SUB (port 5558)
- Multipart frames: Frame 1 = JSON metadata, Frames 2+ = binary data
- `binaryFrames[0]` is first binary (NOT index [1])

### Audio Pipeline
- Audio translation ONLY via WebSocket `message:send-with-attachments`
- REST does NOT trigger audio pipeline
- 3 stages: Transcription (Whisper) → Translation (NLLB) → TTS (Chatterbox)

### Async EventEmitter Hazard
- `emit()` does NOT await Promises
- Always wrap async Socket.IO/EventEmitter listeners in try/catch

## Subdirectory CLAUDE.md Files
Each major directory has its own CLAUDE.md with domain-specific conventions:
- `apps/web/CLAUDE.md` - Next.js frontend patterns
- `apps/ios/CLAUDE.md` - SwiftUI iOS patterns
- `services/gateway/CLAUDE.md` - Fastify API patterns
- `services/translator/CLAUDE.md` - FastAPI ML patterns
- `packages/shared/CLAUDE.md` - Shared types & schema
- `packages/MeeshySDK/CLAUDE.md` - Swift SDK (core + UI targets)
- `infrastructure/CLAUDE.md` - Docker & deployment

## Architectural Decision Records
Each active development directory has a `decisions.md` file documenting key architectural choices:
- `apps/web/decisions.md` - State, routing, auth, styling, i18n, build decisions
- `apps/ios/decisions.md` - MVVM, navigation, singletons, cache, security decisions
- `services/gateway/decisions.md` - Framework, WebSocket, ZMQ, encryption, rate limiting decisions
- `services/translator/decisions.md` - ML models, TTS backends, worker pool, package manager decisions
- `packages/shared/decisions.md` - Type system, validation, events, database, API format decisions
- `packages/MeeshySDK/decisions.md` - Dual-target, networking, sockets, cache, auth decisions
