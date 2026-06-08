# Plan d'Implémentation — Itération 3 (2026-06-08)
**Référence:** `docs/routine/analyses/2026-06-08-iteration-3-analyse.md`  
**Branche:** `claude/brave-archimedes-xvj0l`

---

## Phase A — Bundle & Performance Quick Wins

### A1 — Tone.js Dynamic Import
**Fichier:** `apps/web/utils/audio-effects.ts`  
**Problème:** `import * as Tone from 'tone'` statique = 800KB dans le bundle critique  
**Action:** Transformer en dynamic import `const Tone = await import('tone')` dans chaque factory function  
**Impact:** −800KB bundle critique, TTFB plus rapide pour les non-utilisateurs d'effets audio

### A2 — Admin Dashboard Redis Cache
**Fichier:** `services/gateway/src/routes/admin/dashboard.ts`  
**Action:**
1. Wrapper toutes les queries count() dans un bloc `cacheStore.getOrSet('admin:dashboard', async () => {...}, 600)`
2. Utiliser `fastify.cacheStore` (déjà disponible via CacheStore.ts)
3. TTL: 10 min (dashboard ne nécessite pas une précision à la seconde)
4. Header: `Cache-Control: private, max-age=600`  
**Impact:** 19 queries MongoDB → 0 pendant 10 min

### A3 — Block List Redis Cache dans MessageHandler
**Fichier:** `services/gateway/src/socketio/handlers/MessageHandler.ts:160-170`  
**Action:**
1. Avant la query `blockedUserIds: { has: userId }`, chercher `blocks:{userId}:{peerId}` dans Redis
2. Si hit: utiliser le résultat caché
3. Si miss: query DB, cacher le résultat TTL 5 min
4. Lors du blocage/déblocage d'un utilisateur: invalider les clés correspondantes
**Impact:** −30-100ms sur chaque envoi de message en conversation directe

---

## Phase B — Schema & Index

### B1 — Champ `hasTranslations` dans Prisma
**Fichier:** `packages/shared/prisma/schema.prisma`  
**Action:**
1. Ajouter `hasTranslations Boolean @default(false)` au modèle `Message`
2. Ajouter `@@index([hasTranslations])` (sparse-like: seules 10-20% des messages sont traduits)
3. Mettre à jour dashboard.ts pour utiliser `where: { hasTranslations: true }` au lieu de `where: { translations: { not: { equals: null } } }`
4. Mettre à jour MessageTranslationService pour setter `hasTranslations: true` lors de l'enregistrement de traductions  
**Impact:** Dashboard translations count: O(N full scan) → O(index scan)

---

## Phase C — iOS Rendering

### C1 — AnyView → @ViewBuilder dans AudioBubbleRouter
**Fichier:** `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`  
**Action:** Remplacer les slots `AnyView?` par des types concrets ou enums avec @ViewBuilder  
**Note:** Vérifier que le fichier est déjà dans project.pbxproj avant de créer un nouveau code

---

## Checklist de Validation

- [ ] A1: `import * as Tone from 'tone'` n'est plus en top-level dans audio-effects.ts
- [ ] A2: GET /api/admin/dashboard renvoie en < 50ms (cache hit) au 2e appel
- [ ] A3: `MessageHandler.ts` utilise Redis avant la query block list
- [ ] B1: `Message.hasTranslations Boolean @default(false)` dans schema.prisma
- [ ] B1: dashboard.ts utilise `hasTranslations: true` au lieu de JSON query
- [ ] C1: AudioBubbleRouter n'utilise plus AnyView pour les slots
- [ ] Tests gateway passent
- [ ] Build TypeScript sans erreur
- [ ] Commit sur `claude/brave-archimedes-xvj0l`
- [ ] Push et PR vers main
