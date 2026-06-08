# Analyse Optimisation — Itération 11 (2026-06-08)

**Branche :** `claude/brave-archimedes-7D4kb`
**Base :** Itérations 1–10 mergées dans main

## Contexte

Itérations 1-10 ont couvert : perf DB, rate limiter, caches mémoire, console→logger dans
handlers Socket.IO (AuthHandler, ReactionHandler, ConversationHandler, MessageHandler,
StatusHandler, SocialEventsHandler, PrivacyPreferencesService). Cette itération cible les
trois zones encore non traitées : le middleware auth (hot-path), le service PostFeedService
(queries répétitives non cachées), et l'endpoint admin/languages (N+1 queries).

---

## Issue #1 — auth.ts middleware : 11 console.* sur hot-path (CRITIQUE)

**Fichier :** `services/gateway/src/middleware/auth.ts`

11 appels `console.warn/error` sur le hot-path de chaque requête authentifiée :
- Ligne 162, 298 : `console.warn` dans les trusted sessions (fire-and-forget)
- Ligne 328 : `console.warn` JWT expired — contient `tokenPrefix` (dernier 8 chars du token)
- Ligne 338, 340 : `console.warn/error` JWT invalid/unexpected — `error.message` peut contenir des données sensibles
- Ligne 430 : `console.warn` invalid session token  
- Lignes 500, 511, 516 : `console.error/warn` dans l'attach legacy path
- Ligne 593 : `console.warn` deprecated authenticate()
- Ligne 633 : `console.error` authentication failed

**Impact :** Chaque requête authentifiée qui échoue (JWT expiré, invalide) contourne la
PII redaction Pino. Token prefixes et error messages apparaissent en clair dans stdout.

**Fix :** Ajouter `enhancedLogger.child({ module: 'auth' })` et remplacer tous les console.*.

---

## Issue #2 — PostFeedService : getFriendIds/getContactIds non cachés (HAUTE)

**Fichier :** `services/gateway/src/services/PostFeedService.ts:486-527`

`getFriendIds()` et `getDirectConversationContactIds()` sont appelés **3 fois par page de feed** :
- Ligne 82 : dans `getPublicFeed`
- Lignes 159-160 : dans `getFriendsFeed` (2 appels parallèles)
- Lignes 213-214 : dans `getCommunityFeed`

Chaque appel fait 2-4 queries DB (findMany participants → findMany friends). Un user naviguant
dans le feed fait 6-12 queries DB sur des données stables (les amis changent rarement).

**Fix :** Injecter `CacheStore` optionnel dans PostFeedService. Cache Redis avec TTL 300s.
Clés : `feed:friends:${userId}` et `feed:contacts:${userId}`.

**Impact :** −6 à −12 queries DB par page de feed sur les 2ème+ pages consécutives.

---

## Issue #3 — admin/languages.ts : N+1 queries dans enrichissement (HAUTE)

**Fichier :** `services/gateway/src/routes/admin/languages.ts:86-111`

```typescript
const topLanguages = await Promise.all(
  topLanguagesByMessages.map(async (lang) => {
    const langMessages = await fastify.prisma.message.findMany({  // N queries !
      where: { originalLanguage: lang.originalLanguage, ... }
    });
```

Pour 10 top languages → **10 findMany parallèles** sur la collection messages.
Chacun scanne potentiellement des milliers de messages pour compter les userId distincts.

**Fix :** Remplacer les N queries par **1 findMany** qui récupère tous les messages des top
langues en une fois, puis grouper par langue en JS. Réduction de N queries → 1 query.

**Impact :** −(N-1) queries DB par requête admin GET /admin/languages/stats (N = nb top langues, typiquement 5-10).
