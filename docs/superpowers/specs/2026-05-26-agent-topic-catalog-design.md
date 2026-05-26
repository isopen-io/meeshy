# Agent Topic Catalog — Dynamic CRUD + per-conv whitelist (2026-05-26)

**Status** : Design approuvé en brainstorming, prêt pour writing-plans.
**Surface** : `services/agent/`, `services/gateway/src/routes/admin/`, `apps/web/components/admin/agent/`, `packages/shared/prisma/schema.prisma`.
**Branche cible** : `feat/agent-topic-catalog` (worktree à créer).

## Contexte

Le strategist agent provoque actuellement des "fresh topics" à partir d'un catalogue de **13 thèmes hardcodés** dans `services/agent/src/agents/strategist.ts` (enum `ConversationTheme`, constantes `THEME_PATTERNS`, `HINT_TO_THEME`, function `buildTopicProvocationHint`).

Limites de l'implémentation actuelle :
- ❌ **Ajouter un nouveau topic** (ex. "astronomie") = modifier le code + redeploy
- ❌ **Filtrer per-conv** : `freshTopicCategoryHints` actuel est un override "force le premier match", pas une vraie whitelist/blacklist
- ✅ **Taux de probabilité per-conv** : déjà OK via `AgentConfig.freshTopicProbability` (PR #293 mergé sur main via cherry-picks)

Le user veut :
1. **CRUD admin global** sur les topics (ajouter "astronomie" depuis l'admin UI, désactiver "politics" globalement)
2. **Blacklist per-conv** parmi les topics actifs (cocher/décocher = exclure de cette conv)
3. **Taux % per-conv** (déjà OK — pas re-touché ici)

## Décisions structurantes (validées en brainstorming)

| Question | Décision |
|---|---|
| Richesse Topic | Riche : slug, label, description, keywordPatterns[], instructionTemplate, searchHintTemplate, examples[], cooldownMinutes, isActive |
| Cooldown | Per-topic per-conv via nouveau model `AgentTopicUsageLog` |
| Comportement par défaut per-conv | Opt-out (tous topics actifs éligibles, admin coche pour exclure) → **blacklist** |
| Migration des 13 thèmes existants | Auto-seed au boot agent (idempotent : seed si count == 0) |
| RBAC CRUD catalogue | `BIGBOSS + ADMIN` (réutilise `requireAgentAdmin` existant) |
| Templating | Mustache (`{{conversationTitle}}`, `{{label}}`…) |

## Réutilisations (max possible)

| Composant | Origine | Usage dans ce sprint |
|---|---|---|
| `ConfigCache` listener pattern | PR #293 cherry-picked sur main (`config-cache.ts`) | Étendre avec `onTopicsInvalidated()` listener pour le catalogue |
| `broadcastInvalidation()` (Redis pub/sub + HTTP fallback) | PR #293 (`gateway/src/routes/admin/agent.ts`) | Étendre `scope: 'topics' \| 'config'` pour invalider le catalogue à chaque mutation admin |
| `requireAgentAdmin` middleware | `gateway/src/routes/admin/agent.ts:23` | Réutiliser tel quel sur tous les endpoints `/admin/agent/topics/*` |
| `sendSuccess`/`sendError`/`sendBadRequest`/`sendNotFound`/`sendInternalError` | `gateway/src/utils/response.ts` | Réutiliser tel quel |
| `OBJECT_ID_REGEX` + `validateObjectId` | `gateway/src/routes/admin/agent.ts:12` | Réutiliser tel quel |
| Tab UI pattern (Overview/Live/History/Archetypes/GlobalConfig/LLM/…) | `apps/web/components/admin/agent/` | Ajouter `AgentTopicsTab.tsx` comme nouvel onglet, sans refactor des tabs existants |
| Multi-select chips composant | À identifier dans `apps/web/components/ui/` ou `radix-ui` (utilisé pour languages picker) | Réutiliser pour `AgentConfigDialog` blacklist UX |
| Dialog/Modal patterns | Existants pour AgentConfigDialog | Réutiliser pour create/edit topic |
| Zod schemas | Pattern dans `agent.ts` admin route | Reproduire le pattern, pas créer une nouvelle infra |
| `Prisma migrate deploy` workflow | Standard projet | Réutiliser tel quel |

**Non-reuse explicite** :
- `AgentScanLog` : tentation de stocker `topicsUsedSlugs[]` dedans pour éviter `AgentTopicUsageLog`. **Rejeté pour perf** (voir section Performance ci-dessous).
- `AgentGlobalProfile.topicsOfExpertise[]` / `topicsAvoided[]` : c'est de la **persona per-user**, pas un catalogue global. Concept différent, ne pas conflater.
- `AgentGlobalConfig` : tentation d'y stocker `topicCatalog: Json`. Rejeté car (a) catalogue est CRUD individuel par topic, pas un blob unique ; (b) MongoDB queries inefficaces sur un blob JSON pour 50+ topics ; (c) UI a besoin de stats per-topic (usage, cooldown) qui requièrent relations.

## Architecture

### Schema Prisma (3 changements)

```prisma
model AgentTopicCatalog {
  id                  String   @id @default(auto()) @map("_id") @db.ObjectId
  /// Identifiant stable utilisé par le strategist + admin UI (kebab-case, ex: 'ai_tech', 'astronomy')
  slug                String   @unique
  /// Label affichage admin/UI
  label               String
  description         String?
  /// Sources regex (string[]) compilées au runtime — caching agressif côté service (voir Performance)
  keywordPatterns     String[]
  /// Template Mustache (variables : {{conversationTitle}}, {{conversationDescription}}, {{label}})
  instructionTemplate String
  /// Template Mustache pour la requête web search
  searchHintTemplate  String
  /// Exemples de provocations historiquement réussies (libre, affiché en preview admin)
  examples            String[] @default([])
  /// Anti-spam : un topic ne peut être re-pioché pour une même conv pendant N min
  cooldownMinutes     Int      @default(60)
  /// Kill switch admin sans suppression hard
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  usageLogs           AgentTopicUsageLog[]

  @@index([isActive])
  @@index([slug])
}

model AgentTopicUsageLog {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  topicId        String   @db.ObjectId
  topic          AgentTopicCatalog @relation(fields: [topicId], references: [id], onDelete: Cascade)
  conversationId String   @db.ObjectId
  usedAt         DateTime @default(now())

  @@index([conversationId, topicId, usedAt(sort: Desc)])
  @@index([usedAt])  // pour le cleanup cron (purge > 30j)
}

model AgentConfig {
  // ... champs existants ...

  /// Slugs de topics bloqués sur cette conv (blacklist). Vide = tous topics
  /// actifs du catalogue éligibles. Nouveau topic créé après config = auto-actif.
  freshTopicBlockedSlugs    String[] @default([])

  /// @deprecated Remplacé par freshTopicBlockedSlugs (sémantique inverse).
  /// À retirer dans une PR cleanup post-migration UI. Ne plus lire dans le strategist.
  freshTopicCategoryHints   String[] @default([])
}
```

### Services agent (3 nouveaux fichiers)

#### `services/agent/src/topics/TopicCatalogService.ts`
- Singleton accessible via DI (passé au strategist)
- Source unique de lecture du catalogue actif
- **Cache Redis 5min** clé `agent:topics:catalog:active` (sérialisation JSON brute)
- **Cache mémoire local** : `compiledRegexCache: Map<topicId, RegExp[]>` rebuild au cache load (voir Performance)
- Méthodes :
  - `list({ activeOnly?: boolean }): Promise<TopicCatalogEntry[]>` — cache hit Redis, fallback Prisma
  - `get(id: string)`, `getBySlug(slug: string)` — cache aware
  - `create(input: TopicInput)`, `update(id: string, patch: Partial<TopicInput>)`, `delete(id, opts?: { hard?: boolean })`
  - `invalidate()` — clear Redis + memory + broadcast
  - `compiledPatternsFor(topicId: string): RegExp[]` — accès au cache compilé

#### `services/agent/src/topics/TopicSeedService.ts`
- Appelé au boot dans `services/agent/src/server.ts` (après `prisma.$connect`, avant `LangGraph` init)
- Si `prisma.agentTopicCatalog.count() === 0` → insert les 13 thèmes hardcodés depuis `services/agent/src/topics/seeds/initial-topics.ts` (data plain TS, 1 array de 13 objets)
- Idempotent : si count > 0, no-op + log
- Pas d'upsert/merge : on respecte les modifications admin ultérieures

#### `services/agent/src/topics/TopicUsageService.ts`
- `record(topicId: string, conversationId: string): Promise<void>` — insert AgentTopicUsageLog
- `lastUsedAt(topicId: string, conversationId: string): Promise<Date | null>` — single-index query, ~1ms
- `filterEligible(topics: TopicCatalogEntry[], conversationId: string): Promise<TopicCatalogEntry[]>` — retire ceux en cooldown ; un seul `findMany` batch pour tous les topics (voir Performance)
- Cleanup cron 24h dans `services/agent/src/cron/topic-usage-cleanup.ts` : `DELETE WHERE usedAt < now - 30 days`

### Refactor `services/agent/src/agents/strategist.ts`

**Suppression** :
- `ConversationTheme` enum (lignes 165-178)
- `THEME_PATTERNS` constant (lignes 180-193)
- `HINT_TO_THEME` constant (lignes 199-213)
- `detectConversationTheme()` function (lignes 215-241)
- `buildTopicProvocationHint()` function (lignes 245+)
- `DEFAULT_TOPIC_PROVOCATION_PROBABILITY` const reste (fallback si state.freshTopicProbability null)

**Nouveau flow (placé là où `provokeNewTopic` est calculé actuellement, ligne ~838)** :

```ts
const provocationProbability = state.freshTopicProbability ?? DEFAULT_TOPIC_PROVOCATION_PROBABILITY;
const shouldProvoke = state.budgetRemaining > 0 && Math.random() < provocationProbability;

let provocationHint: ProvocationHint | null = null;
let chosenTopic: TopicCatalogEntry | null = null;

if (shouldProvoke) {
  const allTopics = await topicCatalog.list({ activeOnly: true });
  const blockedSet = new Set(state.freshTopicBlockedSlugs ?? []);
  const allowed = allTopics.filter((t) => !blockedSet.has(t.slug));
  const eligible = await topicUsage.filterEligible(allowed, state.conversationId);

  if (eligible.length > 0) {
    const haystack = buildHaystack(state);
    const scored = eligible.map((t) => ({
      topic: t,
      score: countMatches(topicCatalog.compiledPatternsFor(t.id), haystack),
    }));
    // top-3 puis random parmi top-3 (évite "toujours le même")
    const sorted = scored.sort((a, b) => b.score - a.score);
    const pool = sorted.slice(0, Math.min(3, sorted.length));
    chosenTopic = pool[Math.floor(Math.random() * pool.length)].topic;

    const ctx = {
      conversationTitle: state.conversationTitle ?? '',
      conversationDescription: state.conversationDescription ?? '',
      label: chosenTopic.label,
    };
    provocationHint = {
      instruction: Mustache.render(chosenTopic.instructionTemplate, ctx),
      searchHint: Mustache.render(chosenTopic.searchHintTemplate, ctx),
      topicCategory: chosenTopic.slug,
    };
  }
}

const prompt = buildStrategistPrompt(state, ...args, provocationHint);

// Record usage AFTER prompt construction succeeds (avoid recording if subsequent throws)
if (chosenTopic) {
  // Fire-and-forget : pas besoin d'attendre, mais on log les erreurs
  topicUsage.record(chosenTopic.id, state.conversationId)
    .catch((err) => console.error('[Strategist] Failed to record topic usage', err));
}
```

**Helpers** :
- `buildHaystack(state)` : extrait `state.conversationTitle + description + agentInstructions + last 30 messages content`. Mémoizable mais negligeable.
- `countMatches(regexes: RegExp[], haystack: string): number` : pure fonction, sum des `match().length` pour chaque regex.

### Gateway admin routes

**Nouveau fichier** : `services/gateway/src/routes/admin/agent-topics.ts`

Pattern identique à `agent.ts` (réutilise `requireAgentAdmin`, `sendSuccess`/`sendError`, `validateObjectId`, `AgentHttpClient`).

#### Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/v1/admin/agent/topics` | — | Liste paginée (default limit 50). Query `?active=true\|false\|all`. Default = `all`. |
| GET | `/api/v1/admin/agent/topics/:id` | — | Détail. Query `?withStats=true` → +usage 7j |
| POST | `/api/v1/admin/agent/topics` | TopicInput | Create. Slug unique check. |
| PATCH | `/api/v1/admin/agent/topics/:id` | Partial<TopicInput> | Update |
| DELETE | `/api/v1/admin/agent/topics/:id` | — | Soft delete (isActive=false). Query `?hard=true` = vraie suppression |
| POST | `/api/v1/admin/agent/topics/:id/test` | `{ sampleText: string }` | Test regex match contre texte sample, retourne count par pattern |

#### Schema Zod `TopicInputSchema`
```ts
const TopicInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/, 'kebab_case requis').min(2).max(40),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  keywordPatterns: z.array(
    z.string().refine((s) => {
      try { new RegExp(s); return true; } catch { return false; }
    }, 'Regex invalide')
  ).min(1).max(10),
  instructionTemplate: z.string().min(20).max(1000),
  searchHintTemplate: z.string().min(5).max(200),
  examples: z.array(z.string().max(300)).max(5).default([]),
  cooldownMinutes: z.number().int().min(0).max(10080).default(60), // max 7j
  isActive: z.boolean().default(true),
});
```

#### Cache invalidation
Chaque mutation (POST/PATCH/DELETE) déclenche `broadcastInvalidation({ scope: 'topics' })`. Le service agent écoute via `ConfigCache.onTopicsInvalidated()` → `TopicCatalogService.invalidate()` (clear Redis + memory).

### Admin UI

#### Nouvelle tab "Topics"

Nouveau fichier : `apps/web/components/admin/agent/AgentTopicsTab.tsx`

Ajoutée au composant Tabs principal (à côté de Overview/Live/History/Archetypes/GlobalConfig/LLM/Conversations/Roles).

**Layout** :
```
┌─────────────────────────────────────────────────────────────┐
│ Topics Catalog               [+ Nouveau topic] [Recharger]   │
├─────────────────────────────────────────────────────────────┤
│ Active │ Slug          │ Label              │ Cooldown │ ⋮  │
├─────────────────────────────────────────────────────────────┤
│ ✓      │ ai_tech       │ IA & LLM           │ 60 min   │ ✎  │
│ ✓      │ microservices │ Microservices      │ 90 min   │ ✎  │
│ ✗      │ politics      │ Politique          │ 120 min  │ ✎  │
│ …                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Modal Create/Edit** (réutilise composant Dialog existant) :
- Champs simples : slug (validation kebab-case côté client), label, description, instructionTemplate (textarea avec preview Mustache rendu en bas), searchHintTemplate, examples (chips éditables), cooldownMinutes (number), isActive (Switch)
- Section **Keywords / Regex** : éditeur multi-ligne, un regex par ligne, validation client (try `new RegExp` à la perte de focus, badge erreur en rouge)
- Section **Tester regex** : input "Texte d'exemple" + bouton "Tester" → appelle `POST /topics/:id/test` → affiche les matches par pattern (count, highlight)

#### Per-conversation : modif `AgentConfigDialog.tsx`

Remplace le champ free-text actuel `freshTopicCategoryHints` par un **multi-select chips** binded sur le nouveau `freshTopicBlockedSlugs` :

```
┌──────────────────────────────────────────────────────────┐
│ Topics éligibles pour les nouveaux sujets                 │
│ Décocher un topic pour l'exclure sur cette conversation.  │
│                                                            │
│  ☑ ai_tech     ☑ microservices  ☑ web_dev    ☑ mobile_dev │
│  ☑ cybersec    ☑ data_science   ☑ sports     ☑ culture    │
│  ☑ business    ☑ science        ☐ politics   ☑ gaming     │
│  ☑ general_news                                            │
│                                                            │
│ Probabilité de nouveau sujet par scan : ◯─────●──── 0.20  │
└──────────────────────────────────────────────────────────┘
```

- Liste = tous les topics actifs du catalogue (chargés via `agent-admin.service.listTopics({ activeOnly: true })`)
- Initialement TOUS cochés ; décocher = ajoute le slug à `freshTopicBlockedSlugs`
- PATCH `/admin/agent/conversation-config` avec le nouveau champ
- Slider probabilité (`freshTopicProbability`) reste inchangé

#### Frontend service additions (`apps/web/services/agent-admin.service.ts`)

```ts
listTopics(opts?: { activeOnly?: boolean }): Promise<TopicCatalogItem[]>
getTopic(id: string, opts?: { withStats?: boolean }): Promise<TopicCatalogItem>
createTopic(input: TopicInput): Promise<TopicCatalogItem>
updateTopic(id: string, patch: Partial<TopicInput>): Promise<TopicCatalogItem>
deleteTopic(id: string, opts?: { hard?: boolean }): Promise<void>
testTopicRegex(id: string, sampleText: string): Promise<{ matches: Record<string, number> }>
```

## Performance

3 risques identifiés, mitigation prévue :

### 🔴 Risque 1 : Re-compilation des regex à chaque scan strategist

**Problème** : Avec 13 topics × ~5 patterns regex chacun = 65 `new RegExp(...)` par invocation strategist. Au pic (10 scans/sec global), c'est 650 compile/sec → 5-15% CPU agent.

**Mitigation** : `TopicCatalogService` maintient un **cache en mémoire** des regex compilées :
```ts
private compiledRegexCache: Map<string /* topicId */, RegExp[]> = new Map();

private rebuildCompiledCache(topics: TopicCatalogEntry[]) {
  this.compiledRegexCache.clear();
  for (const t of topics) {
    this.compiledRegexCache.set(t.id, t.keywordPatterns.map((src) => new RegExp(src, 'i')));
  }
}
```
- Rebuild à chaque cache Redis hit OU au `invalidate()`
- Lookup O(1) via Map dans le strategist
- Coût compile total : 65 RegExp par 5min (TTL cache) — négligeable

### 🟡 Risque 2 : `filterEligible` query MongoDB

**Problème** : Pour chaque scan strategist, on doit savoir "pour la conv X, quel est le lastUsedAt de chaque topic du catalogue ?". Une query naïve par topic = 13 round-trips.

**Mitigation** : Single `findMany` avec `groupBy` ou `aggregate` MongoDB :
```ts
async filterEligible(topics, conversationId): Promise<TopicCatalogEntry[]> {
  const usages = await prisma.agentTopicUsageLog.findMany({
    where: { conversationId, topicId: { in: topics.map(t => t.id) } },
    orderBy: { usedAt: 'desc' },
    distinct: ['topicId'],
    select: { topicId: true, usedAt: true },
  });
  const lastUsedMap = new Map(usages.map(u => [u.topicId, u.usedAt]));
  const now = Date.now();
  return topics.filter(t => {
    const last = lastUsedMap.get(t.id);
    if (!last) return true; // jamais utilisé
    return (now - last.getTime()) >= t.cooldownMinutes * 60_000;
  });
}
```
- Index utilisé : `@@index([conversationId, topicId, usedAt(sort: Desc)])` (couverte par le `distinct` Prisma)
- 1 query par scan, ~5ms même à 10M logs

### 🟢 Risque 3 : Croissance illimitée de `AgentTopicUsageLog`

**Problème** : 10k conversations actives × 10 scans/jour × ~3 topics provoqués/jour = 300k logs/jour. Après 1 an = 110M logs.

**Mitigation** : Cron cleanup 24h dans `services/agent/src/cron/topic-usage-cleanup.ts` :
```ts
await prisma.agentTopicUsageLog.deleteMany({
  where: { usedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
});
```
- TTL effectif 30 jours (cooldownMinutes max 7j × 4 = 28j, marge à 30j)
- Index `@@index([usedAt])` couvre la requête
- Run 1×/24h, ~10s sur 10M logs

### Note finale perf

- Pas d'impact perf strategist hors les 2 risques ci-dessus (regex compile + cooldown query). Les autres lectures (cache Redis, Mustache render) sont O(1).
- Pas d'impact perf admin UI : 13-50 topics affichés en list/checkboxes, négligeable.
- Pas d'impact perf gateway : routes admin = trafic faible, pas de loop.

## Tests

### Backend
- `TopicCatalogServiceTests` : CRUD, cache hit/miss, regex pre-compile cache rebuild, invalidate.
- `TopicSeedServiceTests` : idempotency (count==0 seed ; count>0 no-op), data integrity post-seed (13 topics avec mêmes regex/instruction que les hardcoded actuels).
- `TopicUsageServiceTests` : record + filterEligible logic (cooldown match/no-match), distinct topicId query correctness.
- `StrategistTests` (update) : picksTopicFromCatalog, skipsBlockedSlugs, respectsCooldown, recordsUsageOnPick, skipsProvocationWhenAllInCooldown, fallbacksGracefullyWhenCatalogEmpty.

### Gateway
- `topics-admin-routes.spec.ts` : auth (BIGBOSS+ADMIN OK, USER 403), Zod validation (slug invalide, regex invalide → 400), CRUD success cases, cache invalidation broadcast appelé sur mutation, soft vs hard delete, `/test` endpoint.

### Frontend
- `AgentTopicsTab.spec.tsx` : list rendering, create modal flow, edit modal pre-fill, regex tester roundtrip, optimistic UI.
- `AgentConfigDialog.spec.tsx` (update) : multi-select chips behavior, default all-checked, decocher → added to blockedSlugs, PATCH payload correct.

### Migration / smoke
- Spec inclut **smoke checklist** (`docs/qa/2026-05-26-agent-topic-catalog-smoke.md`) :
  - [ ] Deploy → boot agent → `AgentTopicCatalog.count() === 13` (auto-seed OK)
  - [ ] CRUD admin UI (create "astronomy", edit, delete soft, delete hard, regex tester)
  - [ ] Per-conv blacklist : ouvrir AgentConfigDialog, décocher 2 topics, save, vérifier que le strategist n'utilise plus ces 2 sur la conv
  - [ ] Cooldown : provoquer manuellement un sujet sur une conv, attendre < cooldown, vérifier que le même topic n'est pas re-pioché ; attendre > cooldown, vérifier qu'il l'est à nouveau
  - [ ] Cache invalidation : modifier un topic via admin UI, vérifier propagation cross-agent < 5s
  - [ ] Cron cleanup : injecter un log usedAt = now - 31d, exécuter cron, vérifier suppression

## Découpage en commits (proposition pour writing-plans)

1. `feat(shared): AgentTopicCatalog + AgentTopicUsageLog + AgentConfig.freshTopicBlockedSlugs schema`
2. `feat(agent/topics): TopicCatalogService avec cache Redis + regex compile cache`
3. `feat(agent/topics): initial-topics seed data + TopicSeedService boot idempotent`
4. `feat(agent/topics): TopicUsageService record + filterEligible + cooldown cron`
5. `refactor(agent/strategist): replace hardcoded themes par lecture catalogue + cooldown`
6. `test(agent/topics): coverage services + strategist updated`
7. `feat(gateway/admin): /admin/agent/topics CRUD routes avec Zod + invalidation`
8. `feat(web/admin): AgentTopicsTab + create/edit modal + regex tester UI`
9. `feat(web/admin): AgentConfigDialog blacklist multi-select chips`
10. `docs(qa): smoke checklist agent topic catalog`

Chaque commit reste indépendamment buildable + testé. Pas de dépendance circulaire.

## Hors scope (explicite)

- Pas de UI globale pour stats catalogue (top topics les plus utilisés cross-conv) — backlog post-launch.
- Pas de cooldown global (cross-conv) — uniquement per-conv.
- Pas de bias positif (boost topics favoris) — uniquement blacklist.
- Pas de retention configurable du `AgentTopicUsageLog` (30j fixe) — backlog.
- `freshTopicCategoryHints` deprecated mais NON supprimé du schema dans ce sprint (PR cleanup ultérieur post-migration UI complète).
- Pas de versioning des templates instruction/searchHint (édition direct sans historique) — backlog.
- Pas de A/B testing entre versions de templates — backlog.

## Risques résiduels

1. **Mustache injection** : si un admin met `{{constructor.constructor('alert(1)')()}}` dans un template. → Mitigation : Mustache **n'évalue pas** d'expressions JS, juste des variables. Sûr par design. Si on passait à Handlebars, vigilance.
2. **Regex DoS (ReDoS)** : un admin peut écrire `^(a+)+$` qui catastrophic-backtrack. → Mitigation : timeout 50ms sur chaque `match()` côté strategist (via `safe-regex` ou wrapper avec `Promise.race`). À documenter dans le plan d'impl.
3. **Race condition seed au boot** : si 2 instances agent boot simultanément, les 2 voient count==0 et insèrent 13 topics → 26 entrées avec slug duplicate → unique constraint violation. → Mitigation : insertion idempotente avec `createMany({ skipDuplicates: true })` + lock advisory MongoDB optionnel.
4. **Cache stale après mutation** : si invalidation broadcast échoue (Redis down), agents servent du stale 5 min max. → Mitigation : broadcast HTTP fallback PR #293 + TTL Redis 5min sert de filet.
