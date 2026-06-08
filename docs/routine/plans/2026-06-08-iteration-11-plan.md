# Plan d'Implémentation — Itération 11 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-11-analyse.md`
**Branche :** `claude/brave-archimedes-7D4kb`

---

## Phase A — auth.ts middleware : console.* → logger

**Fichier :** `services/gateway/src/middleware/auth.ts`

1. Ajouter import logger en tête de fichier
2. Créer `const authLogger = enhancedLogger.child({ module: 'auth' });`
3. Remplacer les 11 console.warn/error par logger.warn/error/debug

---

## Phase B — PostFeedService : cache Redis pour friendIds/contactIds

**Fichiers :**
- `services/gateway/src/services/PostFeedService.ts`
- `services/gateway/src/routes/posts/feed.ts`

1. Ajouter `import type { CacheStore } from './CacheStore';`
2. Ajouter `getCacheStore()` import
3. Constructor: `constructor(private readonly prisma: PrismaClient, private readonly cache?: CacheStore)`
4. Dans `getFriendIds`: try cache first → on miss, fetch + set(300s)
5. Dans `getDirectConversationContactIds`: idem
6. Dans `feed.ts`: `new PostFeedService(prisma, getCacheStore())`

---

## Phase C — admin/languages.ts : N+1 → 1 query

**Fichier :** `services/gateway/src/routes/admin/languages.ts`

Remplacer le `Promise.all(topLanguagesByMessages.map(async (lang) => findMany(...)))` par :
1. Un seul `findMany` qui récupère tous les messages des top langues
2. Groupement par langue en JS avec `Map<string, Set<string>>`

---

## Statut

- [ ] A — auth.ts logger migration
- [ ] B — PostFeedService cache Redis
- [ ] C — admin/languages N+1 fix
