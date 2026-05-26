# Agent Topic Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le catalogue hardcodé de 13 thèmes du strategist agent par un catalogue BDD CRUD-able via admin UI, avec whitelist per-conv (blacklist), cooldown per-topic, et taux de probabilité per-conv (déjà existant).

**Architecture:** 3 nouveaux modèles Prisma (`AgentTopicCatalog`, `AgentTopicUsageLog`, champ `freshTopicBlockedSlugs` sur `AgentConfig`). 3 nouveaux services agent (`TopicCatalogService` avec cache Redis + regex compile, `TopicSeedService` auto-seed boot idempotent, `TopicUsageService` cooldown + cron 30j). Refactor du strategist pour lire le catalogue dynamiquement. Routes admin gateway CRUD + Zod. UI admin : nouvelle tab Topics + modification AgentConfigDialog avec multi-select blacklist chips. Réutilise `ConfigCache.broadcastInvalidation` (PR #293) + `requireAgentAdmin` middleware.

**Tech Stack:** TypeScript strict + Prisma 6.19 + MongoDB + Redis (ioredis) + Jest 30 (services agent/gateway), Next.js + React + Zustand (frontend admin), Mustache (templating dans strategist).

**Spec source:** `docs/superpowers/specs/2026-05-26-agent-topic-catalog-design.md`

---

## File Structure

### Nouveaux fichiers (backend)
- `packages/shared/prisma/schema.prisma` (modify) — 3 changes : new models + new field
- `services/agent/src/topics/TopicCatalogService.ts` — singleton cache (Redis + memory compile)
- `services/agent/src/topics/TopicSeedService.ts` — auto-seed boot idempotent
- `services/agent/src/topics/TopicUsageService.ts` — record + cooldown filter
- `services/agent/src/topics/seeds/initial-topics.ts` — data file (13 thèmes)
- `services/agent/src/topics/types.ts` — TopicCatalogEntry type + helpers
- `services/agent/src/cron/topic-usage-cleanup.ts` — cron 24h purge >30j
- `services/agent/src/__tests__/topics/TopicCatalogService.test.ts`
- `services/agent/src/__tests__/topics/TopicSeedService.test.ts`
- `services/agent/src/__tests__/topics/TopicUsageService.test.ts`
- `services/agent/src/__tests__/cron/topic-usage-cleanup.test.ts`

### Fichiers modifiés (backend)
- `services/agent/src/server.ts` — instanciation services + startTopicUsageCleanupCron + TopicSeedService.run au boot
- `services/agent/src/agents/strategist.ts` — refactor flow provocation (lignes 160-313 + 837-848)
- `services/agent/src/graph/state.ts` — ajout `freshTopicBlockedSlugs: string[]`
- `services/agent/src/scheduler/conversation-scanner.ts` — passe `freshTopicBlockedSlugs` au state
- `services/agent/src/scheduler/eligible-conversations.ts` — inclut `freshTopicBlockedSlugs` dans EligibleConversation type
- `services/agent/src/config/config-cache.ts` — ajout `onTopicsInvalidated()` listener
- `services/agent/src/__tests__/agents/strategist.test.ts` — update pour mocker le catalogue

### Nouveaux fichiers (gateway)
- `services/gateway/src/routes/admin/agent-topics.ts` — CRUD routes + Zod + invalidation
- `services/gateway/src/__tests__/routes/agent-topics.test.ts`

### Fichiers modifiés (gateway)
- `services/gateway/src/routes/admin/agent.ts` — ajout broadcastInvalidation scope `'topics'`
- `services/gateway/src/routes/admin/index.ts` (ou équivalent) — registre route topics

### Nouveaux fichiers (frontend)
- `apps/web/components/admin/agent/AgentTopicsTab.tsx` — page list + modal create/edit
- `apps/web/components/admin/agent/AgentTopicEditModal.tsx` — modal (extrait pour lisibilité)
- `apps/web/components/admin/agent/AgentTopicRegexTester.tsx` — section "Tester regex"
- `apps/web/__tests__/components/admin/agent/AgentTopicsTab.test.tsx`

### Fichiers modifiés (frontend)
- `apps/web/services/agent-admin.service.ts` — ajout 6 méthodes topics CRUD
- `apps/web/components/admin/agent/AgentConfigDialog.tsx` — remplace champ free-text `freshTopicCategoryHints` par multi-select chips `freshTopicBlockedSlugs`
- Composant Tabs principal (à identifier pendant Task 10) — ajouter onglet "Topics"

### Nouveau fichier QA
- `docs/qa/2026-05-26-agent-topic-catalog-smoke.md`

---

## Task 0 : Setup worktree + branche

- [ ] **Step 1 :** Créer un worktree isolé.

```bash
git worktree add -b feat/agent-topic-catalog \
  ../v2_meeshy-feat-agent-topic-catalog main
cd ../v2_meeshy-feat-agent-topic-catalog
```

- [ ] **Step 2 :** Vérifier état propre + base.

```bash
git status
git log --oneline -1
```
Expected : `nothing to commit, working tree clean` ; HEAD au commit le plus récent de main.

- [ ] **Step 3 :** Baseline build agent + gateway.

```bash
pnpm --filter=@meeshy/shared run generate
pnpm --filter=@meeshy/shared run build
pnpm --filter=@meeshy/agent run build
pnpm --filter=@meeshy/gateway run build
```
Expected : tous les `tsc` passent. Si gateway tsc fail sur `emitAttachmentUpdated.ts`, rebuild shared (le bug est qu'un dist stale ne reflète pas le source).

- [ ] **Step 4 :** Baseline tests agent.

```bash
pnpm --filter=@meeshy/agent run test 2>&1 | tail -10
```
Expected : test suites passent (sinon, capturer flakes connus en note).

---

## Task 1 : Schema Prisma (3 changements + migrate)

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` — ajouts AgentTopicCatalog, AgentTopicUsageLog, freshTopicBlockedSlugs sur AgentConfig

- [ ] **Step 1 :** Localiser `model AgentConfig` (vers ligne 3073) et `model AgentScanLog` (vers ligne 3434) pour insérer les nouveaux modèles entre les deux ou en fin de fichier.

```bash
grep -n "^model AgentScanLog\|^model AgentConfig" packages/shared/prisma/schema.prisma
```

- [ ] **Step 2 :** Ajouter `freshTopicBlockedSlugs` au modèle `AgentConfig` (vers ligne 3170, juste après `freshTopicCategoryHints`) :

Ouvre `packages/shared/prisma/schema.prisma`, repère :
```prisma
  /// Topic seeds for fresh-topic mode (e.g. ["ai", "microservices", "news"]).
  /// When empty, the agent infers categories from the title/description.
  freshTopicCategoryHints  String[] @default([])
```

Remplace par :
```prisma
  /// Topic seeds for fresh-topic mode (e.g. ["ai", "microservices", "news"]).
  /// @deprecated Remplacé par freshTopicBlockedSlugs (sémantique inverse).
  /// Retiré dans une PR cleanup post-migration UI. Ne plus lire dans le strategist.
  freshTopicCategoryHints  String[] @default([])
  /// Slugs de topics bloqués sur cette conv (blacklist). Vide = tous topics
  /// actifs du catalogue éligibles. Nouveau topic créé après config = auto-actif.
  freshTopicBlockedSlugs   String[] @default([])
```

- [ ] **Step 3 :** Ajouter les deux nouveaux modèles à la fin du fichier (juste avant la dernière `}` de fichier — ou à un endroit cohérent dans le bloc Agent*).

À la fin du bloc agent (cherche le dernier `model AgentScanLog`), ajoute après :

```prisma
model AgentTopicCatalog {
  id                  String   @id @default(auto()) @map("_id") @db.ObjectId
  /// Identifiant stable utilisé par le strategist + admin UI (kebab-case, ex: 'ai_tech', 'astronomy')
  slug                String   @unique
  /// Label affichage admin/UI
  label               String
  description         String?
  /// Sources regex (string[]) compilées au runtime — caching agressif côté service
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
  @@index([usedAt])
}
```

- [ ] **Step 4 :** Générer le client Prisma + valider le schema.

```bash
pnpm --filter=@meeshy/shared run generate
```
Expected : `✔ Generated Prisma Client`.

- [ ] **Step 5 :** Vérifier que TypeScript reconnaît les nouveaux types.

```bash
grep -E "AgentTopicCatalog|AgentTopicUsageLog|freshTopicBlockedSlugs" packages/shared/prisma/client/index.d.ts | head -5
```
Expected : au moins 1 hit par symbole.

- [ ] **Step 6 :** Build shared (pour propager les types aux services consommateurs).

```bash
pnpm --filter=@meeshy/shared run build
```
Expected : `tsc` exit 0.

- [ ] **Step 7 :** Commit.

```bash
git add packages/shared/prisma/schema.prisma packages/shared/dist
git commit -m "feat(shared): AgentTopicCatalog + AgentTopicUsageLog + AgentConfig.freshTopicBlockedSlugs"
```

---

## Task 2 : Initial topic seed data (data file uniquement)

**Files:**
- Create: `services/agent/src/topics/seeds/initial-topics.ts`

- [ ] **Step 1 :** Créer le dossier + fichier.

```bash
mkdir -p services/agent/src/topics/seeds
```

- [ ] **Step 2 :** Créer le fichier avec les 13 thèmes existants extraits de `strategist.ts`.

Crée `services/agent/src/topics/seeds/initial-topics.ts` :

```typescript
/**
 * Source de seed pour AgentTopicCatalog. Inséré par TopicSeedService au boot
 * si le catalogue est vide. Reflète 1:1 les 13 thèmes hardcodés actuels du
 * strategist (THEME_PATTERNS + HINT_TO_THEME + buildTopicProvocationHint) —
 * la migration ne perd aucune capacité.
 *
 * Modifier ce fichier ne re-seed PAS automatiquement (idempotent). Pour
 * mettre à jour les topics existants en prod, passer par l'admin UI.
 */

export type InitialTopicSeed = {
  slug: string;
  label: string;
  description: string;
  keywordPatterns: string[];
  instructionTemplate: string;
  searchHintTemplate: string;
  examples: string[];
  cooldownMinutes: number;
};

export const INITIAL_TOPICS: InitialTopicSeed[] = [
  {
    slug: 'ai_tech',
    label: 'IA & LLM',
    description: 'Intelligence artificielle, modèles de langage, agents, providers (OpenAI, Anthropic, Mistral).',
    keywordPatterns: [
      '\\b(ia|ai|gpt|llm|claude|gemini|anthropic|openai|prompt|model|chatgpt|mistral|huggingface)\\b',
      '\\b(machine[\\s-]?learning|deep[\\s-]?learning|transformer|rag|agentic|embedding|fine[\\s-]?tuning)\\b',
    ],
    instructionTemplate: 'Cette conversation gravite autour de l\'IA / LLM ({{label}}). Lance un NOUVEAU sujet AUTOUR d\'une actualite chaude IA (nouveau modele, benchmark, levee de fonds, debat ethique, agent autonome).',
    searchHintTemplate: 'actualite IA LLM cette semaine',
    examples: ['Nouveau modèle Claude 4.7', 'Anthropic vs OpenAI sur l\'alignement'],
    cooldownMinutes: 60,
  },
  {
    slug: 'microservices',
    label: 'Microservices & Architecture distribuée',
    description: 'Kubernetes, Docker, service mesh, observabilité, patterns distribués.',
    keywordPatterns: [
      '\\b(microservice|kubernetes|k8s|docker|kafka|grpc|service[\\s-]?mesh|istio)\\b',
      '\\b(distribu(?:e|é)|message[\\s-]?broker|saga|event[\\s-]?driven|api[\\s-]?gateway|terraform|helm|prometheus|grafana|observability|monolith)\\b',
    ],
    instructionTemplate: 'Cette conversation porte sur l\'architecture distribuee / microservices ({{label}}). Lance un NOUVEAU sujet (release Kubernetes, retour d\'experience recent, debat distribue vs monolithe, observabilite, new pattern).',
    searchHintTemplate: 'microservices kubernetes actualite tendance',
    examples: ['Kubernetes 1.32', 'Service mesh : Istio vs Linkerd'],
    cooldownMinutes: 90,
  },
  {
    slug: 'web_dev',
    label: 'Développement web',
    description: 'React, Next.js, Vue, frontend/backend frameworks, bundlers.',
    keywordPatterns: [
      '\\b(react|next\\.?js|vue|svelte|angular|typescript|javascript|node\\.?js|fastify|express|tailwind|frontend|backend|fullstack|webpack|vite|deno|bun)\\b',
    ],
    instructionTemplate: 'Conversation web/frontend/backend ({{label}}). Lance un NOUVEAU sujet (release framework, retour d\'experience, debat outillage, performance).',
    searchHintTemplate: 'actualite developpement web framework',
    examples: ['React 20 RSC', 'Bun 2.0 vs Node 24'],
    cooldownMinutes: 60,
  },
  {
    slug: 'mobile_dev',
    label: 'Développement mobile',
    description: 'iOS, Android, React Native, Flutter, App Store policies.',
    keywordPatterns: [
      '\\b(swift|swiftui|kotlin|jetpack|android|ios|react[\\s-]?native|flutter|xcode|appstore|playstore)\\b',
    ],
    instructionTemplate: 'Conversation mobile iOS/Android ({{label}}). Lance un NOUVEAU sujet (release OS, framework, App Store policy, retour d\'experience).',
    searchHintTemplate: 'actualite developpement mobile iOS Android',
    examples: ['iOS 27 Liquid Glass', 'Flutter 4 et Impeller'],
    cooldownMinutes: 60,
  },
  {
    slug: 'cybersecurity',
    label: 'Cybersécurité',
    description: 'CVE, pentest, breach, zero-day, ransomware, OWASP.',
    keywordPatterns: [
      '\\b(s(?:e|é)curit(?:e|é)|cybers(?:e|é)curit(?:e|é)|pentest|cve|vuln(?:e|é)rabilit(?:e|é)|ransomware|phishing|zero[\\s-]?day|exploit|hacker|cisa|crypto[\\s-]?graphy)\\b',
    ],
    instructionTemplate: 'Conversation cybersecurite ({{label}}). Lance un NOUVEAU sujet (CVE recente, breach, retour pentest, debat zero-trust).',
    searchHintTemplate: 'actualite cybersecurite CVE breach',
    examples: ['CVE-2026-XXXX critical', 'Breach Cloudflare'],
    cooldownMinutes: 90,
  },
  {
    slug: 'data_science',
    label: 'Data science & Analytics',
    description: 'Big data, Spark, datalake, ETL, BI.',
    keywordPatterns: [
      '\\b(data[\\s-]?science|big[\\s-]?data|spark|hadoop|pandas|numpy|jupyter|datalake|warehouse|etl|bi|analytics|tableau|powerbi)\\b',
    ],
    instructionTemplate: 'Conversation data science / analytics ({{label}}). Lance un NOUVEAU sujet (release outil, tendance pipeline, retour d\'experience datalake).',
    searchHintTemplate: 'actualite data science analytics',
    examples: ['DuckDB 2.0', 'Snowflake vs Databricks'],
    cooldownMinutes: 60,
  },
  {
    slug: 'sports',
    label: 'Sports',
    description: 'Football, basket, tennis, JO, F1.',
    keywordPatterns: [
      '\\b(football|sport|match|(?:e|é)quipe|joueur|coupe|tournoi|psg|ligue|nba|formula|tennis|olympique|f1|rugby|jo|basket)\\b',
    ],
    instructionTemplate: 'Conversation sport ({{label}}). Lance un NOUVEAU sujet (resultat recent, transfert, evenement a venir).',
    searchHintTemplate: 'actualite sport resultats recents',
    examples: ['Mbappé record', 'Wimbledon final'],
    cooldownMinutes: 60,
  },
  {
    slug: 'science',
    label: 'Science',
    description: 'Découvertes, biologie, physique, espace, NASA, fusion.',
    keywordPatterns: [
      '\\b(science|recherche|(?:e|é)tude|chercheur|d(?:e|é)couverte|biologie|chimie|physique|espace|nasa|spacex|astronome|quantum|fusion)\\b',
    ],
    instructionTemplate: 'Conversation science ({{label}}). Lance un NOUVEAU sujet (decouverte recente, mission spatiale, debat).',
    searchHintTemplate: 'decouverte scientifique recente',
    examples: ['Mission lunaire Artemis 3', 'Fusion ITER première'],
    cooldownMinutes: 60,
  },
  {
    slug: 'business',
    label: 'Business & Finance',
    description: 'Startups, levée, crypto, bourse, IPO.',
    keywordPatterns: [
      '\\b(business|startup|investissement|lev(?:e|é)e|crypto|bitcoin|ethereum|bourse|action|trading|(?:e|é)conomie|finance|march(?:e|é)|ipo|fonds)\\b',
    ],
    instructionTemplate: 'Conversation business/finance ({{label}}). Lance un NOUVEAU sujet (levee, mouvement marche, tendance crypto, IPO).',
    searchHintTemplate: 'actualite business startup finance tendance',
    examples: ['Mistral IPO', 'BTC 200k$'],
    cooldownMinutes: 60,
  },
  {
    slug: 'gaming',
    label: 'Gaming',
    description: 'Sorties jeux, esport, consoles, Twitch.',
    keywordPatterns: [
      '\\b(jeu[x]?\\s|gaming|playstation|xbox|nintendo|steam|esport|twitch|gamer|ps5|switch)\\b',
    ],
    instructionTemplate: 'Conversation gaming ({{label}}). Lance un NOUVEAU sujet (sortie jeu, drama studio, esport).',
    searchHintTemplate: 'actualite gaming sortie jeu',
    examples: ['GTA VI gameplay leak', 'Worlds finals LoL'],
    cooldownMinutes: 60,
  },
  {
    slug: 'culture',
    label: 'Culture & Loisirs',
    description: 'Films, musique, séries, Netflix, cinéma.',
    keywordPatterns: [
      '\\b(film|musique|s(?:e|é)rie|netflix|spotify|concert|album|cin(?:e|é)ma|artiste|festival|livre|roman|disney|prime[\\s-]?video)\\b',
    ],
    instructionTemplate: 'Conversation culture ({{label}}). Lance un NOUVEAU sujet (sortie film, album, serie a debattre).',
    searchHintTemplate: 'sortie cinema musique serie recente',
    examples: ['Dune 3 trailer', 'Album surprise Taylor Swift'],
    cooldownMinutes: 60,
  },
  {
    slug: 'politics',
    label: 'Politique',
    description: 'Élections, gouvernement, président, assemblée.',
    keywordPatterns: [
      '\\b(politique|(?:e|é)lection|gouvernement|pr(?:e|é)sident|ministre|assembl(?:e|é)e|parti|d(?:e|é)putes?|s(?:e|é)nat|loi)\\b',
    ],
    instructionTemplate: 'Conversation politique ({{label}}). Lance un NOUVEAU sujet en lien avec une actualite politique chaude. Reste factuel, evite la polemique gratuite.',
    searchHintTemplate: 'actualite politique recente',
    examples: ['Réforme constitutionnelle', 'Élection US débat'],
    cooldownMinutes: 120,
  },
  {
    slug: 'general_news',
    label: 'Actualités générales',
    description: 'Catch-all : actualité monde, société, événement.',
    keywordPatterns: [
      '\\b(actualit(?:e|é)|news|info|monde|soci(?:e|é)t(?:e|é)|(?:e|é)v(?:e|é)nement)\\b',
    ],
    instructionTemplate: 'Lance un NOUVEAU sujet autour d\'une actualite chaude generale ({{label}}) susceptible d\'interesser les participants.',
    searchHintTemplate: 'actualite hot du moment',
    examples: ['Manifestation Paris', 'Catastrophe naturelle Pacific'],
    cooldownMinutes: 60,
  },
];
```

- [ ] **Step 3 :** Build agent pour confirmer compile.

```bash
pnpm --filter=@meeshy/agent run build
```
Expected : `tsc` exit 0.

- [ ] **Step 4 :** Commit.

```bash
git add services/agent/src/topics/seeds/initial-topics.ts
git commit -m "feat(agent/topics): initial 13 topics seed data (extracted from strategist hardcoded)"
```

---

## Task 3 : TopicCatalogService (TDD : cache + CRUD + regex compile)

**Files:**
- Create: `services/agent/src/topics/types.ts`
- Create: `services/agent/src/topics/TopicCatalogService.ts`
- Create: `services/agent/src/__tests__/topics/TopicCatalogService.test.ts`

- [ ] **Step 1 :** Créer `types.ts` (shared dans le module topics).

Crée `services/agent/src/topics/types.ts` :

```typescript
import type { AgentTopicCatalog } from '@meeshy/shared/prisma/client';

/**
 * Forme persistée + utilisée par le strategist. Champ scalaire =
 * `AgentTopicCatalog`. On ne réexpose pas le model Prisma directement pour
 * éviter les imports transitifs côté consumers.
 */
export type TopicCatalogEntry = Pick<
  AgentTopicCatalog,
  | 'id'
  | 'slug'
  | 'label'
  | 'description'
  | 'keywordPatterns'
  | 'instructionTemplate'
  | 'searchHintTemplate'
  | 'examples'
  | 'cooldownMinutes'
  | 'isActive'
>;

export type TopicInput = Omit<TopicCatalogEntry, 'id'>;
```

- [ ] **Step 2 :** Écrire les tests failing.

Crée `services/agent/src/__tests__/topics/TopicCatalogService.test.ts` :

```typescript
import { TopicCatalogService } from '../../topics/TopicCatalogService';
import type { TopicCatalogEntry } from '../../topics/types';

function makeRedisStore() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

function makePrisma(initial: TopicCatalogEntry[] = []) {
  let rows = [...initial];
  return {
    agentTopicCatalog: {
      findMany: jest.fn(async (args?: { where?: { isActive?: boolean } }) => {
        if (args?.where?.isActive === true) return rows.filter((r) => r.isActive);
        return rows;
      }),
      findUnique: jest.fn(async (args: { where: { id?: string; slug?: string } }) => {
        return rows.find((r) => r.id === args.where.id || r.slug === args.where.slug) ?? null;
      }),
      create: jest.fn(async (args: { data: Omit<TopicCatalogEntry, 'id'> }) => {
        const row = { id: `t${rows.length + 1}`, ...args.data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: Partial<TopicCatalogEntry> }) => {
        const idx = rows.findIndex((r) => r.id === args.where.id);
        if (idx < 0) throw new Error('not found');
        rows[idx] = { ...rows[idx], ...args.data };
        return rows[idx];
      }),
      delete: jest.fn(async (args: { where: { id: string } }) => {
        rows = rows.filter((r) => r.id !== args.where.id);
        return undefined;
      }),
    },
  } as any;
}

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1',
    slug: 'sample',
    label: 'Sample',
    description: null,
    keywordPatterns: ['\\bsample\\b'],
    instructionTemplate: 'Sample {{label}}',
    searchHintTemplate: 'sample search',
    examples: [],
    cooldownMinutes: 60,
    isActive: true,
    ...overrides,
  };
}

describe('TopicCatalogService', () => {
  test('list({activeOnly:true}) hits prisma on first call', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    const list = await svc.list({ activeOnly: true });
    expect(list).toHaveLength(1);
    expect(prisma.agentTopicCatalog.findMany).toHaveBeenCalledTimes(1);
  });

  test('list() second call hits redis cache, not prisma', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true });
    await svc.list({ activeOnly: true });
    expect(prisma.agentTopicCatalog.findMany).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalled();
  });

  test('invalidate() clears redis + memory caches', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true });
    await svc.invalidate();
    expect(redis.del).toHaveBeenCalled();
    await svc.list({ activeOnly: true });
    expect(prisma.agentTopicCatalog.findMany).toHaveBeenCalledTimes(2);
  });

  test('compiledPatternsFor() returns pre-compiled regexes', async () => {
    const redis = makeRedisStore();
    const topic = makeTopic({ keywordPatterns: ['\\bai\\b', '\\bllm\\b'] });
    const prisma = makePrisma([topic]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true }); // warm cache
    const regexes = svc.compiledPatternsFor(topic.id);
    expect(regexes).toHaveLength(2);
    expect(regexes[0].test('this is ai stuff')).toBe(true);
    expect(regexes[1].test('llm models')).toBe(true);
  });

  test('compiledPatternsFor() returns empty array for unknown id', () => {
    const redis = makeRedisStore();
    const prisma = makePrisma();
    const svc = new TopicCatalogService(prisma, redis as any);
    expect(svc.compiledPatternsFor('unknown')).toEqual([]);
  });

  test('create() calls prisma.create + invalidates cache', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma();
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.list({ activeOnly: true }); // populate cache
    const input = { ...makeTopic(), id: undefined as any };
    delete (input as any).id;
    await svc.create(input);
    expect(prisma.agentTopicCatalog.create).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });

  test('update() calls prisma.update + invalidates cache', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.update('t1', { label: 'Updated' });
    expect(prisma.agentTopicCatalog.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { label: 'Updated' },
    });
    expect(redis.del).toHaveBeenCalled();
  });

  test('delete() with hard=true calls prisma.delete + invalidates', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.delete('t1', { hard: true });
    expect(prisma.agentTopicCatalog.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  test('delete() default soft delete = update isActive=false', async () => {
    const redis = makeRedisStore();
    const prisma = makePrisma([makeTopic()]);
    const svc = new TopicCatalogService(prisma, redis as any);
    await svc.delete('t1');
    expect(prisma.agentTopicCatalog.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { isActive: false },
    });
  });
});
```

- [ ] **Step 3 :** Run tests pour confirmer fail.

```bash
pnpm --filter=@meeshy/agent run test -- TopicCatalogService 2>&1 | tail -15
```
Expected : `Cannot find module '../../topics/TopicCatalogService'` ou similaire.

- [ ] **Step 4 :** Implémenter le service.

Crée `services/agent/src/topics/TopicCatalogService.ts` :

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Redis } from 'ioredis';
import type { TopicCatalogEntry, TopicInput } from './types';

const CACHE_KEY = 'agent:topics:catalog:active';
const CACHE_TTL_SEC = 5 * 60; // 5 min

/**
 * Source unique de lecture du catalogue de topics. Combine :
 *   - cache Redis (5min TTL) — partagé entre instances agent
 *   - cache mémoire local (compiled regex map) — évite la re-compile à chaque scan
 *
 * Toute mutation (create/update/delete) invalide les deux caches + broadcast
 * via le ConfigCache listener (branché côté server.ts au boot).
 */
export class TopicCatalogService {
  private compiledRegexCache: Map<string, RegExp[]> = new Map();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async list(opts: { activeOnly?: boolean } = {}): Promise<TopicCatalogEntry[]> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as TopicCatalogEntry[];
      this.rebuildCompiledCache(parsed);
      return opts.activeOnly ? parsed.filter((t) => t.isActive) : parsed;
    }
    const all = await this.prisma.agentTopicCatalog.findMany();
    await this.redis.set(CACHE_KEY, JSON.stringify(all), 'EX', CACHE_TTL_SEC);
    this.rebuildCompiledCache(all);
    return opts.activeOnly ? all.filter((t) => t.isActive) : all;
  }

  async get(id: string): Promise<TopicCatalogEntry | null> {
    return this.prisma.agentTopicCatalog.findUnique({ where: { id } });
  }

  async getBySlug(slug: string): Promise<TopicCatalogEntry | null> {
    return this.prisma.agentTopicCatalog.findUnique({ where: { slug } });
  }

  async create(input: TopicInput): Promise<TopicCatalogEntry> {
    const created = await this.prisma.agentTopicCatalog.create({ data: input });
    await this.invalidate();
    return created;
  }

  async update(id: string, patch: Partial<TopicInput>): Promise<TopicCatalogEntry> {
    const updated = await this.prisma.agentTopicCatalog.update({
      where: { id },
      data: patch,
    });
    await this.invalidate();
    return updated;
  }

  async delete(id: string, opts: { hard?: boolean } = {}): Promise<void> {
    if (opts.hard) {
      await this.prisma.agentTopicCatalog.delete({ where: { id } });
    } else {
      await this.prisma.agentTopicCatalog.update({
        where: { id },
        data: { isActive: false },
      });
    }
    await this.invalidate();
  }

  async invalidate(): Promise<void> {
    await this.redis.del(CACHE_KEY);
    this.compiledRegexCache.clear();
  }

  /**
   * Retourne les regex compilées pour ce topic. Vide si topic inconnu ou si
   * le cache n'a pas encore été warmé (consumers doivent appeler list() avant).
   */
  compiledPatternsFor(topicId: string): RegExp[] {
    return this.compiledRegexCache.get(topicId) ?? [];
  }

  private rebuildCompiledCache(topics: TopicCatalogEntry[]): void {
    this.compiledRegexCache.clear();
    for (const t of topics) {
      const regexes: RegExp[] = [];
      for (const src of t.keywordPatterns) {
        try {
          regexes.push(new RegExp(src, 'i'));
        } catch {
          // Ignore les regex invalides — validation faite à l'admin write.
        }
      }
      this.compiledRegexCache.set(t.id, regexes);
    }
  }
}
```

- [ ] **Step 5 :** Run tests pour confirmer pass.

```bash
pnpm --filter=@meeshy/agent run test -- TopicCatalogService 2>&1 | tail -10
```
Expected : `Tests: 8 passed`.

- [ ] **Step 6 :** Commit.

```bash
git add services/agent/src/topics/types.ts \
        services/agent/src/topics/TopicCatalogService.ts \
        services/agent/src/__tests__/topics/TopicCatalogService.test.ts
git commit -m "feat(agent/topics): TopicCatalogService avec cache Redis + regex compile cache"
```

---

## Task 4 : TopicSeedService (TDD : idempotency)

**Files:**
- Create: `services/agent/src/topics/TopicSeedService.ts`
- Create: `services/agent/src/__tests__/topics/TopicSeedService.test.ts`

- [ ] **Step 1 :** Écrire les tests failing.

Crée `services/agent/src/__tests__/topics/TopicSeedService.test.ts` :

```typescript
import { TopicSeedService } from '../../topics/TopicSeedService';
import { INITIAL_TOPICS } from '../../topics/seeds/initial-topics';

function makePrisma(initialCount: number = 0, currentRows: any[] = []) {
  return {
    agentTopicCatalog: {
      count: jest.fn(async () => initialCount),
      createMany: jest.fn(async (args: { data: any[]; skipDuplicates?: boolean }) => {
        currentRows.push(...args.data);
        return { count: args.data.length };
      }),
    },
  } as any;
}

describe('TopicSeedService', () => {
  test('run() inserts INITIAL_TOPICS when catalog empty', async () => {
    const prisma = makePrisma(0);
    const svc = new TopicSeedService(prisma);
    const result = await svc.run();
    expect(prisma.agentTopicCatalog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.agentTopicCatalog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ slug: 'ai_tech' })]),
      skipDuplicates: true,
    });
    expect(result.inserted).toBe(INITIAL_TOPICS.length);
  });

  test('run() no-op when catalog non-empty', async () => {
    const prisma = makePrisma(5);
    const svc = new TopicSeedService(prisma);
    const result = await svc.run();
    expect(prisma.agentTopicCatalog.createMany).not.toHaveBeenCalled();
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(true);
  });

  test('run() seeds 13 topics with stable slug format', async () => {
    const prisma = makePrisma(0);
    const svc = new TopicSeedService(prisma);
    await svc.run();
    expect(INITIAL_TOPICS).toHaveLength(13);
    for (const t of INITIAL_TOPICS) {
      expect(t.slug).toMatch(/^[a-z0-9_]+$/);
      expect(t.label).toBeTruthy();
      expect(t.instructionTemplate.length).toBeGreaterThan(20);
    }
  });
});
```

- [ ] **Step 2 :** Run tests pour confirmer fail.

```bash
pnpm --filter=@meeshy/agent run test -- TopicSeedService 2>&1 | tail -10
```
Expected : `Cannot find module '../../topics/TopicSeedService'`.

- [ ] **Step 3 :** Implémenter le service.

Crée `services/agent/src/topics/TopicSeedService.ts` :

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { INITIAL_TOPICS } from './seeds/initial-topics';

/**
 * Auto-seed du catalogue au boot agent. Idempotent :
 *   - count == 0 → insert les 13 thèmes hardcodés depuis initial-topics.ts
 *   - count > 0  → no-op silencieux (respecte les éditions admin ultérieures)
 *
 * `skipDuplicates: true` protège contre la race au boot de plusieurs instances
 * agent simultanées (unique constraint sur `slug`).
 */
export class TopicSeedService {
  constructor(private readonly prisma: PrismaClient) {}

  async run(): Promise<{ inserted: number; skipped: boolean }> {
    const existing = await this.prisma.agentTopicCatalog.count();
    if (existing > 0) {
      console.log(`[TopicSeed] Catalogue non vide (${existing} entries), seed skipped`);
      return { inserted: 0, skipped: true };
    }
    const result = await this.prisma.agentTopicCatalog.createMany({
      data: INITIAL_TOPICS,
      skipDuplicates: true,
    });
    console.log(`[TopicSeed] Inserted ${result.count} topics from initial-topics.ts`);
    return { inserted: result.count, skipped: false };
  }
}
```

- [ ] **Step 4 :** Run tests pour confirmer pass.

```bash
pnpm --filter=@meeshy/agent run test -- TopicSeedService 2>&1 | tail -10
```
Expected : `Tests: 3 passed`.

- [ ] **Step 5 :** Commit.

```bash
git add services/agent/src/topics/TopicSeedService.ts \
        services/agent/src/__tests__/topics/TopicSeedService.test.ts
git commit -m "feat(agent/topics): TopicSeedService boot idempotent (13 topics from initial-topics)"
```

---

## Task 5 : TopicUsageService (TDD : record + cooldown filter)

**Files:**
- Create: `services/agent/src/topics/TopicUsageService.ts`
- Create: `services/agent/src/__tests__/topics/TopicUsageService.test.ts`

- [ ] **Step 1 :** Écrire les tests failing.

Crée `services/agent/src/__tests__/topics/TopicUsageService.test.ts` :

```typescript
import { TopicUsageService } from '../../topics/TopicUsageService';
import type { TopicCatalogEntry } from '../../topics/types';

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1', slug: 's1', label: 'L1', description: null,
    keywordPatterns: [], instructionTemplate: '', searchHintTemplate: '',
    examples: [], cooldownMinutes: 60, isActive: true,
    ...overrides,
  };
}

function makePrisma(usages: { topicId: string; conversationId: string; usedAt: Date }[] = []) {
  return {
    agentTopicUsageLog: {
      create: jest.fn(async (args: { data: any }) => {
        usages.push(args.data);
        return args.data;
      }),
      findMany: jest.fn(async (args: any) => {
        const filter = args.where;
        return usages
          .filter((u) =>
            u.conversationId === filter.conversationId &&
            (filter.topicId?.in ? filter.topicId.in.includes(u.topicId) : true)
          )
          .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime());
      }),
    },
  } as any;
}

describe('TopicUsageService', () => {
  test('record() inserts AgentTopicUsageLog', async () => {
    const usages: any[] = [];
    const prisma = makePrisma(usages);
    const svc = new TopicUsageService(prisma);
    await svc.record('t1', 'conv1');
    expect(prisma.agentTopicUsageLog.create).toHaveBeenCalledWith({
      data: { topicId: 't1', conversationId: 'conv1' },
    });
  });

  test('filterEligible() returns all topics when no usage recorded', async () => {
    const prisma = makePrisma();
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1' }), makeTopic({ id: 't2' })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(2);
  });

  test('filterEligible() excludes topic in cooldown window', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const prisma = makePrisma([{ topicId: 't1', conversationId: 'conv1', usedAt: tenMinutesAgo }]);
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1', cooldownMinutes: 60 })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(0);
  });

  test('filterEligible() includes topic past cooldown window', async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000);
    const prisma = makePrisma([{ topicId: 't1', conversationId: 'conv1', usedAt: twoHoursAgo }]);
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1', cooldownMinutes: 60 })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(1);
  });

  test('filterEligible() ignores usage from other conversation', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const prisma = makePrisma([{ topicId: 't1', conversationId: 'OTHER', usedAt: tenMinutesAgo }]);
    const svc = new TopicUsageService(prisma);
    const topics = [makeTopic({ id: 't1', cooldownMinutes: 60 })];
    const eligible = await svc.filterEligible(topics, 'conv1');
    expect(eligible).toHaveLength(1);
  });
});
```

- [ ] **Step 2 :** Run tests pour confirmer fail.

```bash
pnpm --filter=@meeshy/agent run test -- TopicUsageService 2>&1 | tail -10
```
Expected : compile error sur `TopicUsageService`.

- [ ] **Step 3 :** Implémenter le service.

Crée `services/agent/src/topics/TopicUsageService.ts` :

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { TopicCatalogEntry } from './types';

/**
 * Tracking d'usage des topics per conv pour respecter le cooldown anti-spam.
 *
 * Read pattern : `filterEligible(topics, conversationId)` retourne les
 * topics éligibles (pas en cooldown). Couvert par l'index
 * `[conversationId, topicId, usedAt(sort: Desc)]` → ~5ms même à 10M logs.
 */
export class TopicUsageService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(topicId: string, conversationId: string): Promise<void> {
    await this.prisma.agentTopicUsageLog.create({
      data: { topicId, conversationId },
    });
  }

  /**
   * Retourne les topics éligibles (pas en cooldown). Single batch query :
   * récupère le `usedAt` le plus récent par topicId pour cette conv.
   */
  async filterEligible(
    topics: TopicCatalogEntry[],
    conversationId: string,
  ): Promise<TopicCatalogEntry[]> {
    if (topics.length === 0) return [];

    const usages = await this.prisma.agentTopicUsageLog.findMany({
      where: {
        conversationId,
        topicId: { in: topics.map((t) => t.id) },
      },
      orderBy: { usedAt: 'desc' },
      distinct: ['topicId'],
      select: { topicId: true, usedAt: true },
    });

    const lastUsedMap = new Map<string, Date>();
    for (const u of usages) {
      lastUsedMap.set(u.topicId, u.usedAt);
    }

    const now = Date.now();
    return topics.filter((t) => {
      const last = lastUsedMap.get(t.id);
      if (!last) return true; // jamais utilisé pour cette conv
      const elapsedMs = now - last.getTime();
      return elapsedMs >= t.cooldownMinutes * 60_000;
    });
  }
}
```

- [ ] **Step 4 :** Run tests pour confirmer pass.

```bash
pnpm --filter=@meeshy/agent run test -- TopicUsageService 2>&1 | tail -10
```
Expected : `Tests: 5 passed`.

- [ ] **Step 5 :** Commit.

```bash
git add services/agent/src/topics/TopicUsageService.ts \
        services/agent/src/__tests__/topics/TopicUsageService.test.ts
git commit -m "feat(agent/topics): TopicUsageService record + filterEligible avec cooldown per-topic"
```

---

## Task 6 : Cron cleanup des usage logs (TDD)

**Files:**
- Create: `services/agent/src/cron/topic-usage-cleanup.ts`
- Create: `services/agent/src/__tests__/cron/topic-usage-cleanup.test.ts`

- [ ] **Step 1 :** Écrire les tests failing.

Crée `services/agent/src/__tests__/cron/topic-usage-cleanup.test.ts` :

```typescript
import { runTopicUsageCleanup, startTopicUsageCleanupCron } from '../../cron/topic-usage-cleanup';

function makePrisma(matchedCount: number = 0) {
  return {
    agentTopicUsageLog: {
      deleteMany: jest.fn(async (_args: any) => ({ count: matchedCount })),
    },
  } as any;
}

describe('topic-usage-cleanup', () => {
  test('runTopicUsageCleanup() deletes logs older than 30 days', async () => {
    const prisma = makePrisma(42);
    const result = await runTopicUsageCleanup(prisma);
    expect(prisma.agentTopicUsageLog.deleteMany).toHaveBeenCalled();
    const callArgs = prisma.agentTopicUsageLog.deleteMany.mock.calls[0][0];
    expect(callArgs.where.usedAt.lt).toBeInstanceOf(Date);
    const cutoff = callArgs.where.usedAt.lt as Date;
    const expectedCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(1000);
    expect(result).toBe(42);
  });

  test('startTopicUsageCleanupCron() returns an interval handle', () => {
    const prisma = makePrisma(0);
    const handle = startTopicUsageCleanupCron(prisma);
    expect(handle).toBeDefined();
    clearInterval(handle);
  });
});
```

- [ ] **Step 2 :** Run tests pour confirmer fail.

```bash
pnpm --filter=@meeshy/agent run test -- topic-usage-cleanup 2>&1 | tail -10
```
Expected : Cannot find module.

- [ ] **Step 3 :** Implémenter le cron.

Crée `services/agent/src/cron/topic-usage-cleanup.ts` :

```typescript
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const RETENTION_DAYS = 30;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // every 24h

/**
 * Supprime les logs d'usage de topics > 30 jours. Run quotidien.
 * Index `[usedAt]` couvre la requête → ~10s sur 10M logs.
 */
export async function runTopicUsageCleanup(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.agentTopicUsageLog.deleteMany({
    where: { usedAt: { lt: cutoff } },
  });
  console.log(`[TopicUsageCleanup] Deleted ${count} logs older than ${RETENTION_DAYS}d`);
  return count;
}

export function startTopicUsageCleanupCron(prisma: PrismaClient): ReturnType<typeof setInterval> {
  // Run au boot puis toutes les 24h
  runTopicUsageCleanup(prisma).catch((err) => console.error('[TopicUsageCleanup] Error', err));
  return setInterval(() => {
    runTopicUsageCleanup(prisma).catch((err) => console.error('[TopicUsageCleanup] Error', err));
  }, RUN_INTERVAL_MS);
}
```

- [ ] **Step 4 :** Run tests pour confirmer pass.

```bash
pnpm --filter=@meeshy/agent run test -- topic-usage-cleanup 2>&1 | tail -10
```
Expected : `Tests: 2 passed`.

- [ ] **Step 5 :** Commit.

```bash
git add services/agent/src/cron/topic-usage-cleanup.ts \
        services/agent/src/__tests__/cron/topic-usage-cleanup.test.ts
git commit -m "feat(agent/cron): topic usage cleanup 30j retention"
```

---

## Task 7 : Wire services dans server.ts boot

**Files:**
- Modify: `services/agent/src/server.ts`

- [ ] **Step 1 :** Localiser le bloc d'initialisation (autour de la ligne 251 où `startProfileRefreshCron` est appelé).

```bash
grep -n "startProfileRefreshCron\|startDailySnapshotCron" services/agent/src/server.ts
```

- [ ] **Step 2 :** Ajouter les imports en haut de `server.ts` (vers la ligne 25–27, à côté des imports `cron/`) :

```typescript
import { startTopicUsageCleanupCron } from './cron/topic-usage-cleanup';
import { TopicCatalogService } from './topics/TopicCatalogService';
import { TopicSeedService } from './topics/TopicSeedService';
import { TopicUsageService } from './topics/TopicUsageService';
```

- [ ] **Step 3 :** Au bloc d'initialisation (après `prisma.$connect` et avant `startProfileRefreshCron`), ajouter le seed + l'init des services topics + le démarrage du cron cleanup.

Repère :
```typescript
const profileRefreshInterval = startProfileRefreshCron(prisma);
```

Ajoute JUSTE AVANT :
```typescript
  // Topic catalog : seed initial (idempotent) + instanciation services partagés.
  await new TopicSeedService(prisma).run();
  const topicCatalogService = new TopicCatalogService(prisma, redis);
  const topicUsageService = new TopicUsageService(prisma);
  // Warm le cache + compiled regex au boot pour éviter le first-hit latency.
  await topicCatalogService.list({ activeOnly: true });
  const topicUsageCleanupInterval = startTopicUsageCleanupCron(prisma);
```

- [ ] **Step 4 :** Au bloc de cleanup (autour ligne 273 où `clearInterval(profileRefreshInterval)`), ajouter le clear du nouveau cron :

```typescript
clearInterval(topicUsageCleanupInterval);
```

- [ ] **Step 5 :** Passer `topicCatalogService` + `topicUsageService` au point d'injection du strategist. Localiser :

```bash
grep -n "buildStrategistNode\|new StrategistAgent\|strategistAgent" services/agent/src/server.ts | head -5
```

Si la strategist est instanciée dans `server.ts`, lui passer les services en paramètre. Si elle est instanciée via factory dans `agents/strategist.ts`, modifier la factory pour accepter ces deps (voir Task 8 pour le refactor strategist).

Pour ce step, on **stocke** les services dans des variables disponibles à l'instanciation du graph LangGraph :

```typescript
// Stocker dans le scope pour passage au graph (utilisé par Task 8)
const services = {
  topicCatalog: topicCatalogService,
  topicUsage: topicUsageService,
};
```

L'usage exact dans le LangGraph dependra de la convention déjà en place (DI ou closure). On ajuste à Task 8.

- [ ] **Step 6 :** Verify le build.

```bash
pnpm --filter=@meeshy/agent run build 2>&1 | tail -5
```
Expected : `tsc` exit 0.

- [ ] **Step 7 :** Commit.

```bash
git add services/agent/src/server.ts
git commit -m "feat(agent/server): wire TopicCatalogService/SeedService/UsageService + cleanup cron au boot"
```

---

## Task 8 : Refactor strategist.ts (TDD : catalog usage, blacklist, cooldown)

**Files:**
- Modify: `services/agent/src/agents/strategist.ts`
- Modify: `services/agent/src/__tests__/agents/strategist.test.ts` (ajout cases)
- Modify: `services/agent/src/graph/state.ts` (ajout `freshTopicBlockedSlugs`)
- Modify: `services/agent/src/scheduler/conversation-scanner.ts` (passe le champ au state)
- Modify: `services/agent/src/scheduler/eligible-conversations.ts` (inclut dans EligibleConversation type)

- [ ] **Step 1 :** Ajouter `freshTopicBlockedSlugs` au state graph.

Dans `services/agent/src/graph/state.ts`, repère le bloc :
```typescript
  freshTopicCategoryHints: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
```

Ajoute JUSTE APRÈS :
```typescript
  freshTopicBlockedSlugs: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
```

- [ ] **Step 2 :** Ajouter le champ à `EligibleConversation`.

```bash
grep -n "freshTopicCategoryHints" services/agent/src/scheduler/eligible-conversations.ts
```

Ajoute `freshTopicBlockedSlugs: string[]` au type à côté de `freshTopicCategoryHints`.

- [ ] **Step 3 :** Passer le champ depuis `conversation-scanner.ts`.

```bash
grep -n "freshTopicCategoryHints" services/agent/src/scheduler/conversation-scanner.ts
```

Ajouter `freshTopicBlockedSlugs: config.freshTopicBlockedSlugs ?? []` à côté de `freshTopicCategoryHints`.

- [ ] **Step 4 :** Installer mustache.

```bash
pnpm --filter=@meeshy/agent add mustache
pnpm --filter=@meeshy/agent add -D @types/mustache
```
Expected : packages installés, `package.json` mis à jour.

- [ ] **Step 5 :** Écrire des tests pour le nouveau flow strategist.

Localiser le fichier test existant ou en créer un nouveau :

```bash
ls services/agent/src/__tests__/agents/
```

Ajouter dans `services/agent/src/__tests__/agents/strategist-topics.test.ts` (nouveau fichier) :

```typescript
import { selectProvocationTopic, renderProvocationHint } from '../../agents/strategist';
import type { TopicCatalogEntry } from '../../topics/types';

function makeTopic(overrides: Partial<TopicCatalogEntry> = {}): TopicCatalogEntry {
  return {
    id: 't1', slug: 's1', label: 'L1', description: null,
    keywordPatterns: [], instructionTemplate: 'Sample {{label}}',
    searchHintTemplate: 'sample {{label}}',
    examples: [], cooldownMinutes: 60, isActive: true,
    ...overrides,
  };
}

describe('strategist topic selection', () => {
  test('selectProvocationTopic returns null if eligible empty', () => {
    const compiled = new Map<string, RegExp[]>();
    const result = selectProvocationTopic([], compiled, 'haystack text');
    expect(result).toBeNull();
  });

  test('selectProvocationTopic picks from top-3 by regex score', () => {
    const compiled = new Map<string, RegExp[]>([
      ['t1', [/ai/i]],   // 1 match
      ['t2', [/ai/i, /llm/i]], // 2 matches
      ['t3', []], // 0 matches
    ]);
    const topics = [
      makeTopic({ id: 't1', label: 'AI' }),
      makeTopic({ id: 't2', label: 'AI-LLM' }),
      makeTopic({ id: 't3', label: 'Other' }),
    ];
    const result = selectProvocationTopic(topics, compiled, 'ai is great llm too');
    expect(['t1', 't2', 't3']).toContain(result?.id);
  });

  test('renderProvocationHint substitutes template variables', () => {
    const topic = makeTopic({
      label: 'IA',
      instructionTemplate: 'Sujet sur {{label}} dans {{conversationTitle}}',
      searchHintTemplate: '{{label}} news',
    });
    const hint = renderProvocationHint(topic, {
      conversationTitle: 'Devs talk',
      conversationDescription: '',
    });
    expect(hint.instruction).toBe('Sujet sur IA dans Devs talk');
    expect(hint.searchHint).toBe('IA news');
    expect(hint.topicCategory).toBe('s1');
  });
});
```

- [ ] **Step 6 :** Run tests pour confirmer fail.

```bash
pnpm --filter=@meeshy/agent run test -- strategist-topics 2>&1 | tail -10
```
Expected : `selectProvocationTopic` or `renderProvocationHint` not exported.

- [ ] **Step 7 :** Refactor `strategist.ts`.

Dans `services/agent/src/agents/strategist.ts` :

7a. Ajouter en haut, après les imports existants :
```typescript
import Mustache from 'mustache';
import type { TopicCatalogEntry } from '../topics/types';
import type { TopicCatalogService } from '../topics/TopicCatalogService';
import type { TopicUsageService } from '../topics/TopicUsageService';
```

7b. **Supprimer** les blocs hardcodés :
- `const TOPIC_PROVOCATION_PROBABILITY = 0.20;` (remplacé par `DEFAULT_TOPIC_PROVOCATION_PROBABILITY` ailleurs ; ok à garder si déjà nommé ainsi)
- `type ConversationTheme = ...` (l'enum)
- `const THEME_PATTERNS: Array<...>` 
- `const HINT_TO_THEME: Record<...>`
- `function detectConversationTheme(state) { ... }`
- `function buildTopicProvocationHint(theme) { ... }`

Garde uniquement `DEFAULT_TOPIC_PROVOCATION_PROBABILITY` (la constante de fallback).

7c. **Ajouter** ces helpers exportés (utiles pour les tests + clarté) :

```typescript
export type ProvocationHint = { instruction: string; searchHint: string; topicCategory: string };

/**
 * Construit le haystack utilisé pour le scoring regex. Concatène titre +
 * description + agent instructions + 30 derniers messages.
 */
function buildHaystack(state: ConversationState): string {
  return [
    state.conversationTitle ?? '',
    state.conversationDescription ?? '',
    state.agentInstructions ?? '',
    ...state.messages.slice(-30).map((m) => m.content),
  ].join(' ').toLowerCase();
}

function countMatches(regexes: RegExp[], haystack: string): number {
  let total = 0;
  for (const r of regexes) {
    const matches = haystack.match(new RegExp(r.source, r.flags + 'g')) ?? [];
    total += matches.length;
  }
  return total;
}

/**
 * Sélectionne le topic à provoquer : top-3 par score regex puis random
 * parmi ce top pour éviter le déterminisme. Retourne null si liste vide.
 */
export function selectProvocationTopic(
  eligible: TopicCatalogEntry[],
  compiledPatterns: Map<string, RegExp[]>,
  haystack: string,
): TopicCatalogEntry | null {
  if (eligible.length === 0) return null;
  const scored = eligible.map((t) => ({
    topic: t,
    score: countMatches(compiledPatterns.get(t.id) ?? [], haystack),
  }));
  const sorted = scored.sort((a, b) => b.score - a.score);
  const pool = sorted.slice(0, Math.min(3, sorted.length));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick.topic;
}

export function renderProvocationHint(
  topic: TopicCatalogEntry,
  ctx: { conversationTitle: string; conversationDescription: string },
): ProvocationHint {
  const renderCtx = {
    label: topic.label,
    conversationTitle: ctx.conversationTitle,
    conversationDescription: ctx.conversationDescription,
  };
  return {
    instruction: Mustache.render(topic.instructionTemplate, renderCtx),
    searchHint: Mustache.render(topic.searchHintTemplate, renderCtx),
    topicCategory: topic.slug,
  };
}
```

7d. **Modifier** le flow principal de provocation (autour ligne 837–848). Repère :

```typescript
    const detectedTheme = detectConversationTheme(state);
    const provocationProbability = state.freshTopicProbability ?? DEFAULT_TOPIC_PROVOCATION_PROBABILITY;
    const provokeNewTopic =
      state.budgetRemaining > 0 && provocationProbability > 0 && Math.random() < provocationProbability;
    const provocationHint = provokeNewTopic ? buildTopicProvocationHint(detectedTheme) : null;
```

Remplace par :

```typescript
    const provocationProbability = state.freshTopicProbability ?? DEFAULT_TOPIC_PROVOCATION_PROBABILITY;
    const shouldProvoke =
      state.budgetRemaining > 0 && provocationProbability > 0 && Math.random() < provocationProbability;

    let provocationHint: ProvocationHint | null = null;
    let chosenTopic: TopicCatalogEntry | null = null;

    if (shouldProvoke) {
      const allTopics = await topicCatalog.list({ activeOnly: true });
      const blockedSet = new Set(state.freshTopicBlockedSlugs ?? []);
      const allowed = allTopics.filter((t) => !blockedSet.has(t.slug));
      const eligible = await topicUsage.filterEligible(allowed, state.conversationId);

      if (eligible.length > 0) {
        const haystack = buildHaystack(state);
        const compiledMap = new Map<string, RegExp[]>();
        for (const t of eligible) {
          compiledMap.set(t.id, topicCatalog.compiledPatternsFor(t.id));
        }
        chosenTopic = selectProvocationTopic(eligible, compiledMap, haystack);
        if (chosenTopic) {
          provocationHint = renderProvocationHint(chosenTopic, {
            conversationTitle: state.conversationTitle ?? '',
            conversationDescription: state.conversationDescription ?? '',
          });
          console.log(
            `[Strategist] Topic provocation TRIGGERED (slug=${chosenTopic.slug}, searchHint="${provocationHint.searchHint}")`,
          );
        }
      }
    }
```

7e. **Modifier** le log dans `buildStrategistPrompt` qui prend `detectedTheme` : remplace `detectedTheme` par `chosenTopic?.slug ?? 'none'` partout où c'est référé.

7f. **Modifier** `buildStrategistPrompt` signature pour accepter `provocationHint: ProvocationHint | null` au lieu de `(detectedTheme, provocationHint)`. Ajuster les usages internes.

7g. **Ajouter** l'enregistrement d'usage après le prompt build (fire-and-forget) :

```typescript
    // Record usage AFTER prompt construction succeeds
    if (chosenTopic) {
      topicUsage.record(chosenTopic.id, state.conversationId).catch((err) =>
        console.error('[Strategist] Failed to record topic usage', err),
      );
    }
```

7h. **Modifier** la signature du strategist node pour injecter `topicCatalog` + `topicUsage`. Pattern : ajouter ces deps au closure / DI là où le node est instancié (cf. Task 7 step 5).

- [ ] **Step 8 :** Run tests strategist-topics pour confirmer pass.

```bash
pnpm --filter=@meeshy/agent run test -- strategist-topics 2>&1 | tail -10
```
Expected : `Tests: 3 passed`.

- [ ] **Step 9 :** Run l'ensemble des tests agent pour catch les régressions.

```bash
pnpm --filter=@meeshy/agent run test 2>&1 | tail -15
```
Expected : tous passent. Si l'ancien test `strategist.test.ts` référence les anciens helpers supprimés (`detectConversationTheme`, `buildTopicProvocationHint`), MODIFIER ces tests pour utiliser les nouveaux helpers `selectProvocationTopic` + `renderProvocationHint`.

- [ ] **Step 10 :** Build agent.

```bash
pnpm --filter=@meeshy/agent run build 2>&1 | tail -5
```
Expected : `tsc` exit 0.

- [ ] **Step 11 :** Commit.

```bash
git add services/agent/src/agents/strategist.ts \
        services/agent/src/graph/state.ts \
        services/agent/src/scheduler/conversation-scanner.ts \
        services/agent/src/scheduler/eligible-conversations.ts \
        services/agent/src/__tests__/agents/strategist-topics.test.ts \
        services/agent/package.json \
        pnpm-lock.yaml
git commit -m "refactor(agent/strategist): replace hardcoded themes par catalogue + cooldown + Mustache templates"
```

---

## Task 9 : ConfigCache extension (`onTopicsInvalidated`)

**Files:**
- Modify: `services/agent/src/config/config-cache.ts`
- Modify: `services/agent/src/server.ts` (subscription au listener)

- [ ] **Step 1 :** Localiser ConfigCache et son pattern de listener existant.

```bash
grep -n "onGlobalInvalidated\|invalidate\|export class ConfigCache" services/agent/src/config/config-cache.ts | head -10
```

- [ ] **Step 2 :** Ajouter le listener `onTopicsInvalidated` au pattern existant.

Si `ConfigCache` expose déjà `onGlobalInvalidated(callback)`, ajoute un pattern identique pour les topics. Le payload pub/sub gateway → agent doit inclure `{ scope: 'topics' | 'config' | 'global' }`.

Exemple d'extension (à adapter au pattern précis trouvé dans le fichier) :

```typescript
private topicListeners: Array<() => void | Promise<void>> = [];

onTopicsInvalidated(callback: () => void | Promise<void>): void {
  this.topicListeners.push(callback);
}

private async dispatchInvalidation(scope: string): Promise<void> {
  if (scope === 'topics') {
    for (const cb of this.topicListeners) {
      try { await cb(); } catch (err) {
        console.error('[ConfigCache] topic listener error', err);
      }
    }
  }
  // ... dispatch existant pour 'config'/'global' ...
}
```

Si le pub/sub channel actuel ne carry pas `scope` dans le payload, étendre :
- Côté gateway `broadcastInvalidation`: ajouter `scope: string` au message JSON
- Côté agent ConfigCache pub/sub handler: parser ce champ et dispatcher en fonction

- [ ] **Step 3 :** Brancher `TopicCatalogService.invalidate()` au listener dans `server.ts`.

Juste après l'instanciation de `topicCatalogService` (Task 7 step 3), ajouter :

```typescript
configCache.onTopicsInvalidated(() => topicCatalogService.invalidate());
```

(`configCache` doit déjà être instancié à ce stade, sinon adapter l'ordre.)

- [ ] **Step 4 :** Build pour confirmer.

```bash
pnpm --filter=@meeshy/agent run build 2>&1 | tail -5
```
Expected : `tsc` exit 0.

- [ ] **Step 5 :** Commit.

```bash
git add services/agent/src/config/config-cache.ts services/agent/src/server.ts
git commit -m "feat(agent/config-cache): onTopicsInvalidated listener pour propagation Redis pub/sub"
```

---

## Task 10 : Gateway admin routes `/admin/agent/topics`

**Files:**
- Create: `services/gateway/src/routes/admin/agent-topics.ts`
- Create: `services/gateway/src/__tests__/routes/agent-topics.test.ts`
- Modify: `services/gateway/src/routes/admin/agent.ts` (broadcast scope `'topics'`)
- Modify: `services/gateway/src/routes/admin/index.ts` (registre routes)

- [ ] **Step 1 :** Identifier le registre des routes admin.

```bash
grep -rn "agentRoutes\|admin/agent" services/gateway/src/routes/admin/ services/gateway/src/server.ts 2>&1 | head -10
```

- [ ] **Step 2 :** Écrire les tests failing.

Crée `services/gateway/src/__tests__/routes/agent-topics.test.ts` :

```typescript
// Note : test d'intégration léger avec Fastify inject. Adapte au pattern déjà
// utilisé dans services/gateway/src/__tests__/routes/ pour les routes admin.

import Fastify from 'fastify';
import { agentTopicsRoutes } from '../../routes/admin/agent-topics';

function makePrisma() {
  const rows: any[] = [];
  return {
    rows,
    agentTopicCatalog: {
      findMany: jest.fn(async () => rows),
      findUnique: jest.fn(async (args: any) => rows.find((r) => r.id === args.where.id || r.slug === args.where.slug) ?? null),
      create: jest.fn(async (args: any) => { const row = { id: 't1', ...args.data }; rows.push(row); return row; }),
      update: jest.fn(async (args: any) => { const r = rows.find((x) => x.id === args.where.id); Object.assign(r, args.data); return r; }),
      delete: jest.fn(async (args: any) => { const idx = rows.findIndex((x) => x.id === args.where.id); rows.splice(idx, 1); }),
    },
  } as any;
}

function makeAuthMock(role: string = 'ADMIN') {
  return async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      registeredUser: { id: 'u1', role },
    };
  };
}

describe('admin/agent-topics routes', () => {
  test('GET /topics returns list', async () => {
    const prisma = makePrisma();
    prisma.rows.push({ id: 't1', slug: 'ai', label: 'AI', isActive: true });
    const app = Fastify();
    app.addHook('preValidation', makeAuthMock('ADMIN'));
    await app.register(agentTopicsRoutes, { prisma });
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/agent/topics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe('ai');
  });

  test('POST /topics validates Zod schema (rejects invalid regex)', async () => {
    const prisma = makePrisma();
    const app = Fastify();
    app.addHook('preValidation', makeAuthMock('ADMIN'));
    await app.register(agentTopicsRoutes, { prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/agent/topics',
      payload: {
        slug: 'test',
        label: 'Test',
        keywordPatterns: ['[invalid('], // regex invalide
        instructionTemplate: 'a'.repeat(25),
        searchHintTemplate: 'hint',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  test('POST /topics succeeds with valid input', async () => {
    const prisma = makePrisma();
    const app = Fastify();
    app.addHook('preValidation', makeAuthMock('ADMIN'));
    await app.register(agentTopicsRoutes, { prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/agent/topics',
      payload: {
        slug: 'astronomy',
        label: 'Astronomie',
        keywordPatterns: ['\\bastronomy\\b'],
        instructionTemplate: 'Lance sujet astronomie qui passionne les amateurs',
        searchHintTemplate: 'astronomy news',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.agentTopicCatalog.create).toHaveBeenCalled();
  });

  test('USER role gets 403', async () => {
    const prisma = makePrisma();
    const app = Fastify();
    app.addHook('preValidation', makeAuthMock('USER'));
    await app.register(agentTopicsRoutes, { prisma });
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/agent/topics' });
    expect(res.statusCode).toBe(403);
  });

  test('POST /topics/:id/test runs regex match', async () => {
    const prisma = makePrisma();
    prisma.rows.push({
      id: 't1', slug: 'ai', label: 'AI', isActive: true,
      keywordPatterns: ['\\bai\\b', '\\bllm\\b'],
    });
    const app = Fastify();
    app.addHook('preValidation', makeAuthMock('ADMIN'));
    await app.register(agentTopicsRoutes, { prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/agent/topics/t1/test',
      payload: { sampleText: 'this is ai with llm models, and more ai stuff' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.matches['\\bai\\b']).toBe(2);
    expect(body.data.matches['\\bllm\\b']).toBe(1);
  });
});
```

- [ ] **Step 3 :** Run tests pour confirmer fail.

```bash
pnpm --filter=@meeshy/gateway run test -- agent-topics 2>&1 | tail -10
```
Expected : `Cannot find module ../../routes/admin/agent-topics`.

- [ ] **Step 4 :** Implémenter les routes.

Crée `services/gateway/src/routes/admin/agent-topics.ts` :

```typescript
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const requireAgentAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    sendError(reply, 401, 'Authentification requise');
    return;
  }
  if (!['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role)) {
    sendError(reply, 403, 'Permission insuffisante');
    return;
  }
};

const TopicInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/, 'kebab_case requis').min(2).max(40),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional().nullable(),
  keywordPatterns: z.array(
    z.string().refine((s) => {
      try { new RegExp(s); return true; } catch { return false; }
    }, 'Regex invalide')
  ).min(1).max(10),
  instructionTemplate: z.string().min(20).max(1000),
  searchHintTemplate: z.string().min(5).max(200),
  examples: z.array(z.string().max(300)).max(5).default([]),
  cooldownMinutes: z.number().int().min(0).max(10080).default(60),
  isActive: z.boolean().default(true),
});

const TopicPatchSchema = TopicInputSchema.partial();

const TestRegexBodySchema = z.object({ sampleText: z.string().min(1).max(5000) });

export type AgentTopicsRoutesOpts = { prisma: PrismaClient };

export const agentTopicsRoutes: FastifyPluginAsync<AgentTopicsRoutesOpts> = async (fastify, opts) => {
  const { prisma } = opts;

  fastify.get('/api/v1/admin/agent/topics', { preValidation: [requireAgentAdmin] }, async (request, reply) => {
    try {
      const query = request.query as { active?: string };
      const where: any = {};
      if (query.active === 'true') where.isActive = true;
      else if (query.active === 'false') where.isActive = false;
      const topics = await prisma.agentTopicCatalog.findMany({ where, orderBy: { slug: 'asc' } });
      sendSuccess(reply, topics);
    } catch (err) {
      sendInternalError(reply, 'Erreur récupération topics', err);
    }
  });

  fastify.get('/api/v1/admin/agent/topics/:id', { preValidation: [requireAgentAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    try {
      const topic = await prisma.agentTopicCatalog.findUnique({ where: { id } });
      if (!topic) {
        sendNotFound(reply, 'Topic introuvable');
        return;
      }
      sendSuccess(reply, topic);
    } catch (err) {
      sendInternalError(reply, 'Erreur récupération topic', err);
    }
  });

  fastify.post('/api/v1/admin/agent/topics', { preValidation: [requireAgentAdmin] }, async (request, reply) => {
    const parsed = TopicInputSchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    try {
      const created = await prisma.agentTopicCatalog.create({ data: parsed.data });
      // TODO Step 5 : broadcast invalidation 'topics' (voir end of task)
      sendSuccess(reply, created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        sendBadRequest(reply, 'Slug déjà existant');
      } else {
        sendInternalError(reply, 'Erreur création topic', err);
      }
    }
  });

  fastify.patch('/api/v1/admin/agent/topics/:id', { preValidation: [requireAgentAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const parsed = TopicPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    try {
      const updated = await prisma.agentTopicCatalog.update({ where: { id }, data: parsed.data });
      sendSuccess(reply, updated);
    } catch (err: any) {
      if (err?.code === 'P2025') {
        sendNotFound(reply, 'Topic introuvable');
      } else {
        sendInternalError(reply, 'Erreur update topic', err);
      }
    }
  });

  fastify.delete('/api/v1/admin/agent/topics/:id', { preValidation: [requireAgentAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const query = request.query as { hard?: string };
    const hard = query.hard === 'true';
    try {
      if (hard) {
        await prisma.agentTopicCatalog.delete({ where: { id } });
      } else {
        await prisma.agentTopicCatalog.update({ where: { id }, data: { isActive: false } });
      }
      sendSuccess(reply, { id, deleted: hard ? 'hard' : 'soft' });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        sendNotFound(reply, 'Topic introuvable');
      } else {
        sendInternalError(reply, 'Erreur suppression topic', err);
      }
    }
  });

  fastify.post('/api/v1/admin/agent/topics/:id/test', { preValidation: [requireAgentAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const parsed = TestRegexBodySchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, 'sampleText requis');
      return;
    }
    try {
      const topic = await prisma.agentTopicCatalog.findUnique({ where: { id } });
      if (!topic) {
        sendNotFound(reply, 'Topic introuvable');
        return;
      }
      const matches: Record<string, number> = {};
      for (const src of topic.keywordPatterns) {
        try {
          const re = new RegExp(src, 'gi');
          const found = parsed.data.sampleText.match(re) ?? [];
          matches[src] = found.length;
        } catch {
          matches[src] = -1; // regex invalide (devrait pas arriver si Zod a validé à la création)
        }
      }
      sendSuccess(reply, { matches });
    } catch (err) {
      sendInternalError(reply, 'Erreur test regex', err);
    }
  });
};
```

- [ ] **Step 5 :** Brancher l'invalidation broadcast aux endpoints mutation.

Dans `services/gateway/src/routes/admin/agent.ts`, repérer la fonction `broadcastInvalidation` (du PR #293) et étendre pour accepter `scope: 'config' | 'topics'`. Si elle n'accepte pas encore ce paramètre, l'ajouter avec default `'config'`.

Dans `agent-topics.ts`, importer cette fonction et l'appeler après les mutations success :
```typescript
import { broadcastInvalidation } from './agent';
// Dans POST/PATCH/DELETE après succès :
await broadcastInvalidation({ scope: 'topics' });
```

Si broadcastInvalidation n'est pas exportée, soit l'exporter, soit dupliquer la logique (Redis pub/sub + HTTP POST à `/api/agent/cache/invalidate`).

- [ ] **Step 6 :** Registre la route plugin dans le bootstrap admin.

Dans `services/gateway/src/routes/admin/index.ts` (ou `server.ts`), ajouter :
```typescript
import { agentTopicsRoutes } from './agent-topics';
// ...
await fastify.register(agentTopicsRoutes, { prisma });
```

- [ ] **Step 7 :** Run tests gateway.

```bash
pnpm --filter=@meeshy/gateway run test -- agent-topics 2>&1 | tail -10
```
Expected : 5 tests passent.

- [ ] **Step 8 :** Build gateway.

```bash
pnpm --filter=@meeshy/gateway run build 2>&1 | tail -5
```
Expected : `tsc` exit 0.

- [ ] **Step 9 :** Commit.

```bash
git add services/gateway/src/routes/admin/agent-topics.ts \
        services/gateway/src/routes/admin/agent.ts \
        services/gateway/src/routes/admin/index.ts \
        services/gateway/src/__tests__/routes/agent-topics.test.ts
git commit -m "feat(gateway/admin): /admin/agent/topics CRUD routes avec Zod + invalidation broadcast"
```

---

## Task 11 : Frontend service additions

**Files:**
- Modify: `apps/web/services/agent-admin.service.ts`

- [ ] **Step 1 :** Localiser le service.

```bash
head -30 apps/web/services/agent-admin.service.ts
```

- [ ] **Step 2 :** Ajouter le type `TopicCatalogItem` + `TopicInput` en haut du fichier (après les types existants).

```typescript
export type TopicCatalogItem = {
  id: string;
  slug: string;
  label: string;
  description?: string | null;
  keywordPatterns: string[];
  instructionTemplate: string;
  searchHintTemplate: string;
  examples: string[];
  cooldownMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TopicInput = Omit<TopicCatalogItem, 'id' | 'createdAt' | 'updatedAt'>;
```

- [ ] **Step 3 :** Ajouter les 6 méthodes dans le service. Utiliser le même pattern HTTP que les méthodes existantes (`apiClient.get/post/patch/delete` ou équivalent).

```typescript
// À ajouter dans la classe / l'objet exporté
async listTopics(opts?: { activeOnly?: boolean }): Promise<TopicCatalogItem[]> {
  const params = opts?.activeOnly ? '?active=true' : '';
  const res = await fetch(`${API_BASE}/admin/agent/topics${params}`, { headers: this.authHeaders() });
  if (!res.ok) throw new Error(`listTopics failed: ${res.status}`);
  const body = await res.json();
  return body.data;
}

async getTopic(id: string): Promise<TopicCatalogItem> {
  const res = await fetch(`${API_BASE}/admin/agent/topics/${id}`, { headers: this.authHeaders() });
  if (!res.ok) throw new Error(`getTopic failed: ${res.status}`);
  const body = await res.json();
  return body.data;
}

async createTopic(input: TopicInput): Promise<TopicCatalogItem> {
  const res = await fetch(`${API_BASE}/admin/agent/topics`, {
    method: 'POST',
    headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `createTopic failed: ${res.status}`);
  }
  const body = await res.json();
  return body.data;
}

async updateTopic(id: string, patch: Partial<TopicInput>): Promise<TopicCatalogItem> {
  const res = await fetch(`${API_BASE}/admin/agent/topics/${id}`, {
    method: 'PATCH',
    headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateTopic failed: ${res.status}`);
  const body = await res.json();
  return body.data;
}

async deleteTopic(id: string, opts?: { hard?: boolean }): Promise<void> {
  const params = opts?.hard ? '?hard=true' : '';
  const res = await fetch(`${API_BASE}/admin/agent/topics/${id}${params}`, {
    method: 'DELETE',
    headers: this.authHeaders(),
  });
  if (!res.ok) throw new Error(`deleteTopic failed: ${res.status}`);
}

async testTopicRegex(id: string, sampleText: string): Promise<{ matches: Record<string, number> }> {
  const res = await fetch(`${API_BASE}/admin/agent/topics/${id}/test`, {
    method: 'POST',
    headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleText }),
  });
  if (!res.ok) throw new Error(`testTopicRegex failed: ${res.status}`);
  const body = await res.json();
  return body.data;
}
```

**Note :** adapte `this.authHeaders()` / `API_BASE` / fetch pattern au style existant du fichier (peut être `apiClient.request` ou un wrapper similaire).

- [ ] **Step 4 :** Build frontend (typecheck).

```bash
pnpm --filter=@meeshy/web run build 2>&1 | tail -10
```
Expected : pas d'erreur sur les nouveaux types. Si build complet trop long, faire `pnpm --filter=@meeshy/web exec tsc --noEmit`.

- [ ] **Step 5 :** Commit.

```bash
git add apps/web/services/agent-admin.service.ts
git commit -m "feat(web/admin): agent-admin.service additions pour topics CRUD"
```

---

## Task 12 : `AgentTopicsTab` UI page

**Files:**
- Create: `apps/web/components/admin/agent/AgentTopicsTab.tsx`
- Create: `apps/web/components/admin/agent/AgentTopicEditModal.tsx`
- Create: `apps/web/components/admin/agent/AgentTopicRegexTester.tsx`
- Modify: composant Tabs principal pour ajouter onglet "Topics" (à identifier)

- [ ] **Step 1 :** Identifier le composant Tabs root et son pattern d'ajout.

```bash
grep -rn "AgentLlmTab\|AgentOverviewTab" apps/web/components/admin/agent/ apps/web/app/ 2>&1 | head -10
```

Repérer l'endroit où les onglets sont enregistrés (probablement dans une page admin ou dans un composant racine `AgentAdminPage.tsx` / `AgentDashboard.tsx`).

- [ ] **Step 2 :** Créer `AgentTopicsTab.tsx`.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { agentAdminService, type TopicCatalogItem } from '@/services/agent-admin.service';
import { AgentTopicEditModal } from './AgentTopicEditModal';

export function AgentTopicsTab() {
  const [topics, setTopics] = useState<TopicCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TopicCatalogItem | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await agentAdminService.listTopics();
      setTopics(list);
    } catch (err: any) {
      setError(err.message ?? 'Erreur chargement topics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleDelete = async (id: string, hard: boolean) => {
    if (!confirm(hard ? 'Supprimer DÉFINITIVEMENT ?' : 'Désactiver ce topic ?')) return;
    try {
      await agentAdminService.deleteTopic(id, { hard });
      await reload();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Topics Catalog</h2>
        <div className="flex gap-2">
          <button onClick={() => setCreating(true)} className="px-4 py-2 bg-blue-600 text-white rounded">
            + Nouveau topic
          </button>
          <button onClick={reload} className="px-4 py-2 border rounded">Recharger</button>
        </div>
      </div>

      {loading && <div>Chargement...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-2">Active</th>
              <th className="text-left p-2">Slug</th>
              <th className="text-left p-2">Label</th>
              <th className="text-left p-2">Cooldown</th>
              <th className="text-left p-2">Patterns</th>
              <th className="text-right p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="p-2">{t.isActive ? '✓' : '✗'}</td>
                <td className="p-2 font-mono text-sm">{t.slug}</td>
                <td className="p-2">{t.label}</td>
                <td className="p-2">{t.cooldownMinutes} min</td>
                <td className="p-2 text-sm text-gray-600">{t.keywordPatterns.length}</td>
                <td className="p-2 text-right">
                  <button onClick={() => setEditing(t)} className="text-blue-600 mr-2">Éditer</button>
                  <button onClick={() => handleDelete(t.id, false)} className="text-orange-600 mr-2">Désactiver</button>
                  <button onClick={() => handleDelete(t.id, true)} className="text-red-600">Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <AgentTopicEditModal
          topic={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3 :** Créer `AgentTopicEditModal.tsx`.

```tsx
'use client';

import { useState } from 'react';
import { agentAdminService, type TopicCatalogItem, type TopicInput } from '@/services/agent-admin.service';
import { AgentTopicRegexTester } from './AgentTopicRegexTester';

interface Props {
  topic: TopicCatalogItem | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export function AgentTopicEditModal({ topic, onClose, onSaved }: Props) {
  const isEdit = topic !== null;
  const [form, setForm] = useState<TopicInput>(
    topic
      ? { ...topic, description: topic.description ?? '' }
      : {
          slug: '', label: '', description: '',
          keywordPatterns: [], instructionTemplate: '', searchHintTemplate: '',
          examples: [], cooldownMinutes: 60, isActive: true,
        }
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Validation client basique
      if (!/^[a-z0-9_-]+$/.test(form.slug)) throw new Error('Slug doit être kebab-case');
      if (form.keywordPatterns.length === 0) throw new Error('Au moins 1 regex pattern requis');
      for (const p of form.keywordPatterns) {
        try { new RegExp(p); } catch { throw new Error(`Regex invalide : ${p}`); }
      }
      if (isEdit) {
        await agentAdminService.updateTopic(topic!.id, form);
      } else {
        await agentAdminService.createTopic(form);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{isEdit ? 'Éditer topic' : 'Nouveau topic'}</h3>

        {error && <div className="text-red-600 mb-3">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <label>
            Slug
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              disabled={isEdit}
              className="w-full border rounded p-2 font-mono"
              placeholder="astronomy"
            />
          </label>
          <label>
            Label
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full border rounded p-2"
              placeholder="Astronomie"
            />
          </label>
        </div>

        <label className="block mt-3">
          Description
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border rounded p-2 h-16"
          />
        </label>

        <label className="block mt-3">
          Regex patterns (un par ligne)
          <textarea
            value={form.keywordPatterns.join('\n')}
            onChange={(e) => setForm({ ...form, keywordPatterns: e.target.value.split('\n').filter(Boolean) })}
            className="w-full border rounded p-2 h-24 font-mono text-sm"
            placeholder="\bastronomy\b&#10;\bspace\b"
          />
        </label>

        <label className="block mt-3">
          Instruction template (Mustache : {`{{label}}, {{conversationTitle}}, {{conversationDescription}}`})
          <textarea
            value={form.instructionTemplate}
            onChange={(e) => setForm({ ...form, instructionTemplate: e.target.value })}
            className="w-full border rounded p-2 h-24"
            placeholder="Lance un NOUVEAU sujet sur {{label}}..."
          />
        </label>

        <label className="block mt-3">
          Search hint template
          <input
            value={form.searchHintTemplate}
            onChange={(e) => setForm({ ...form, searchHintTemplate: e.target.value })}
            className="w-full border rounded p-2"
            placeholder="{{label}} news this week"
          />
        </label>

        <div className="grid grid-cols-2 gap-4 mt-3">
          <label>
            Cooldown (minutes)
            <input
              type="number"
              value={form.cooldownMinutes}
              onChange={(e) => setForm({ ...form, cooldownMinutes: Number(e.target.value) })}
              className="w-full border rounded p-2"
              min={0}
              max={10080}
            />
          </label>
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Actif
          </label>
        </div>

        {isEdit && topic && (
          <div className="mt-4 border-t pt-4">
            <AgentTopicRegexTester topicId={topic.id} patterns={form.keywordPatterns} />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded" disabled={saving}>Annuler</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded" disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4 :** Créer `AgentTopicRegexTester.tsx`.

```tsx
'use client';

import { useState } from 'react';
import { agentAdminService } from '@/services/agent-admin.service';

interface Props {
  topicId: string;
  patterns: string[];
}

export function AgentTopicRegexTester({ topicId, patterns }: Props) {
  const [sampleText, setSampleText] = useState('');
  const [matches, setMatches] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setMatches(null);
    try {
      const result = await agentAdminService.testTopicRegex(topicId, sampleText);
      setMatches(result.matches);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h4 className="font-medium mb-2">Tester regex contre texte sample</h4>
      <textarea
        value={sampleText}
        onChange={(e) => setSampleText(e.target.value)}
        className="w-full border rounded p-2 h-20"
        placeholder="Colle un extrait de conversation ici..."
      />
      <button
        onClick={handleTest}
        disabled={loading || !sampleText}
        className="mt-2 px-4 py-2 bg-gray-600 text-white rounded"
      >
        {loading ? 'Test...' : 'Tester'}
      </button>
      {error && <div className="text-red-600 mt-2">{error}</div>}
      {matches && (
        <div className="mt-2 text-sm">
          {Object.entries(matches).map(([pattern, count]) => (
            <div key={pattern} className="font-mono">
              <span className={count > 0 ? 'text-green-600' : 'text-gray-500'}>
                {count} match{count !== 1 ? 'es' : ''}
              </span>
              {' — '}
              <code>{pattern}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5 :** Ajouter l'onglet "Topics" au composant Tabs principal (identifié en Step 1).

L'ajout exact dépend du pattern existant. Probablement :
```tsx
import { AgentTopicsTab } from '@/components/admin/agent/AgentTopicsTab';

// Dans le mapping des tabs :
{ id: 'topics', label: 'Topics', component: AgentTopicsTab }
```

- [ ] **Step 6 :** Vérifier typecheck.

```bash
pnpm --filter=@meeshy/web exec tsc --noEmit 2>&1 | tail -15
```
Expected : pas d'erreur sur les nouveaux fichiers (potentiels phantoms SourceKit/IDE ignorés).

- [ ] **Step 7 :** Commit.

```bash
git add apps/web/components/admin/agent/AgentTopicsTab.tsx \
        apps/web/components/admin/agent/AgentTopicEditModal.tsx \
        apps/web/components/admin/agent/AgentTopicRegexTester.tsx
git commit -m "feat(web/admin): AgentTopicsTab catalogue UI + edit modal + regex tester"
```

- [ ] **Step 8 :** Commit séparé pour le branchement Tabs (si fichier différent).

```bash
git add <le fichier Tabs root modifié>
git commit -m "feat(web/admin): onglet Topics dans le panel admin agent"
```

---

## Task 13 : `AgentConfigDialog` blacklist multi-select chips

**Files:**
- Modify: `apps/web/components/admin/agent/AgentConfigDialog.tsx`

- [ ] **Step 1 :** Localiser le champ existant `freshTopicCategoryHints`.

```bash
grep -n "freshTopicCategoryHints" apps/web/components/admin/agent/AgentConfigDialog.tsx
```

- [ ] **Step 2 :** Importer le service topics + ajouter `freshTopicBlockedSlugs` au state.

En haut du fichier (avec les autres imports) :
```tsx
import { agentAdminService, type TopicCatalogItem } from '@/services/agent-admin.service';
```

Dans le state du composant, ajouter à côté de `freshTopicCategoryHints` :
```tsx
const [availableTopics, setAvailableTopics] = useState<TopicCatalogItem[]>([]);
const [blockedSlugs, setBlockedSlugs] = useState<string[]>(config.freshTopicBlockedSlugs ?? []);
```

Et un useEffect pour charger les topics actifs :
```tsx
useEffect(() => {
  agentAdminService.listTopics({ activeOnly: true })
    .then(setAvailableTopics)
    .catch((err) => console.error('Failed to load topics', err));
}, []);
```

- [ ] **Step 3 :** Remplacer le champ free-text `freshTopicCategoryHints` par les checkboxes blacklist.

Repérer le bloc qui rend `freshTopicCategoryHints` (probablement un `<input>` ou `<textarea>`). Remplacer par :

```tsx
<div className="mt-4">
  <label className="block font-medium mb-2">Topics éligibles pour les nouveaux sujets</label>
  <p className="text-sm text-gray-600 mb-2">
    Décocher un topic pour l'exclure sur cette conversation. Par défaut, tous les topics actifs sont éligibles.
  </p>
  <div className="grid grid-cols-3 gap-2">
    {availableTopics.map((topic) => {
      const isBlocked = blockedSlugs.includes(topic.slug);
      const isChecked = !isBlocked;
      return (
        <label key={topic.slug} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              if (e.target.checked) {
                setBlockedSlugs(blockedSlugs.filter((s) => s !== topic.slug));
              } else {
                setBlockedSlugs([...blockedSlugs, topic.slug]);
              }
            }}
          />
          <span>{topic.label}</span>
        </label>
      );
    })}
  </div>
</div>
```

- [ ] **Step 4 :** Inclure `freshTopicBlockedSlugs: blockedSlugs` dans le payload PATCH `/admin/agent/conversation-config` au save.

Repérer le handler save (probablement `handleSave` ou `onSubmit`) et ajouter le champ au body.

- [ ] **Step 5 :** Typecheck.

```bash
pnpm --filter=@meeshy/web exec tsc --noEmit 2>&1 | tail -10
```
Expected : pas d'erreur sur le nouveau code.

- [ ] **Step 6 :** Commit.

```bash
git add apps/web/components/admin/agent/AgentConfigDialog.tsx
git commit -m "feat(web/admin): AgentConfigDialog blacklist multi-select chips pour freshTopicBlockedSlugs"
```

---

## Task 14 : Smoke checklist QA + build full + PR

**Files:**
- Create: `docs/qa/2026-05-26-agent-topic-catalog-smoke.md`

- [ ] **Step 1 :** Build full agent + gateway + shared.

```bash
pnpm --filter=@meeshy/shared run build
pnpm --filter=@meeshy/agent run build
pnpm --filter=@meeshy/gateway run build
```
Expected : tous `tsc` exit 0.

- [ ] **Step 2 :** Run tests agent + gateway.

```bash
pnpm --filter=@meeshy/agent run test 2>&1 | tail -10
pnpm --filter=@meeshy/gateway run test -- agent-topics 2>&1 | tail -10
```
Expected : tous passent.

- [ ] **Step 3 :** Écrire la smoke checklist.

Crée `docs/qa/2026-05-26-agent-topic-catalog-smoke.md` :

```markdown
# QA Smoke — Agent Topic Catalog (2026-05-26)

**Spec :** `docs/superpowers/specs/2026-05-26-agent-topic-catalog-design.md`
**Plan :** `docs/superpowers/plans/2026-05-26-agent-topic-catalog-plan.md`
**Branche :** `feat/agent-topic-catalog`

## Pré-déploiement

- [ ] Migration Prisma déployée (`pnpm --filter=@meeshy/shared prisma migrate deploy` sur prod)
- [ ] Agent service redéployé (image rebuild avec topics/ + cron + server.ts wiring)
- [ ] Gateway service redéployé (image rebuild avec routes admin)
- [ ] Frontend web redéployé (image rebuild avec AgentTopicsTab + AgentConfigDialog modif)

## Boot agent (post-deploy)

- [ ] Logs agent au boot mentionnent `[TopicSeed] Inserted 13 topics from initial-topics.ts` (ou skipped si re-deploy)
- [ ] MongoDB : `db.agentTopicCatalog.count() === 13` après premier deploy
- [ ] MongoDB : indexes `[isActive]`, `[slug]` existent sur `agentTopicCatalog`
- [ ] MongoDB : indexes `[conversationId, topicId, usedAt]`, `[usedAt]` existent sur `agentTopicUsageLog`

## Admin UI : CRUD catalogue

- [ ] Login admin (BIGBOSS ou ADMIN), naviguer vers le panel agent
- [ ] Onglet "Topics" visible et cliquable
- [ ] La liste affiche les 13 topics seedés (tous actifs)
- [ ] Cliquer "+ Nouveau topic", remplir : slug="astronomy", label="Astronomie", patterns=["\\bastronomy\\b", "\\bspace\\b"], instruction longue, search hint, save
- [ ] Le nouveau topic apparaît dans la liste
- [ ] Cliquer "Éditer" sur "astronomy", modifier le label, save → label change
- [ ] Cliquer "Tester regex" : coller "astronomy is fascinating, space too" → matches count > 0 par pattern
- [ ] Cliquer "Désactiver" sur "politics" → ligne passe à isActive=false, mais reste visible
- [ ] Cliquer "Supprimer" (hard) sur "astronomy" → confirm dialog → disparait de la liste

## Admin UI : blacklist per-conv

- [ ] Ouvrir AgentConfigDialog d'une conversation
- [ ] La section "Topics éligibles" affiche tous les topics actifs cochés par défaut
- [ ] Décocher 2 topics (ex: "politics", "gaming"), save
- [ ] Rouvrir la dialog → ces 2 topics sont toujours décochés
- [ ] BDD : `AgentConfig.freshTopicBlockedSlugs === ["politics", "gaming"]` pour cette conv

## Strategist : fonctionnement runtime

- [ ] Sur une conversation test (taux=1.0 pour forcer la provocation à chaque scan)
- [ ] Trigger un scan agent
- [ ] Logs : `[Strategist] Topic provocation TRIGGERED (slug=<X>, searchHint="...")` avec X dans le catalogue actif
- [ ] BDD : `AgentTopicUsageLog` insert pour (topicId=<X>, conversationId=<conv>)
- [ ] Sur la même conv, trigger un 2e scan immédiat
- [ ] Le topic X **NE PEUT PAS** être re-pioché (cooldown actif), un autre slug est utilisé
- [ ] Attendre cooldownMinutes (ou hack timestamp en BDD pour simuler), trigger un 3e scan
- [ ] Le topic X peut être re-pioché

## Blacklist runtime

- [ ] Sur la conv ayant "politics" + "gaming" blacklistés (du test précédent)
- [ ] Trigger 10 scans avec taux=1.0
- [ ] Aucun log ne mentionne `slug=politics` ou `slug=gaming`

## Invalidation cross-instance

- [ ] Avec 2+ instances agent qui tournent
- [ ] Admin modifie un topic via UI (ex: change cooldown de 60→120 min)
- [ ] Les 2 instances reçoivent l'invalidation en < 5s (logs `[TopicCatalogService] cache invalidated`)
- [ ] Prochain scan utilise la valeur 120 min (pas 60 cache stale)

## Cron cleanup

- [ ] Injecter un AgentTopicUsageLog avec `usedAt = now - 31 days`
- [ ] Trigger manuellement `runTopicUsageCleanup(prisma)` (ou attendre le cron 24h)
- [ ] Le log est supprimé
- [ ] Les logs récents (< 30j) restent intacts

## Diagnostics

Si un point fail :
1. Vérifier les logs agent : `docker logs meeshy-agent | grep -iE "topic|catalog|strategist"`
2. Vérifier le cache Redis : `redis-cli get agent:topics:catalog:active`
3. Vérifier la BDD : `mongo meeshy --eval "db.agentTopicCatalog.find().count()"`
```

- [ ] **Step 4 :** Commit la smoke checklist.

```bash
git add docs/qa/2026-05-26-agent-topic-catalog-smoke.md
git commit -m "docs(qa): smoke checklist agent topic catalog"
```

- [ ] **Step 5 :** Push de la branche + ouvrir la PR.

```bash
git push -u origin feat/agent-topic-catalog
gh pr create --base dev --title "feat(agent): dynamic topic catalog avec CRUD admin + per-conv blacklist" \
  --body "Closes user request 2026-05-26. Remplace les 13 thèmes hardcodés du strategist par un catalogue BDD CRUD-able.

**Spec :** \`docs/superpowers/specs/2026-05-26-agent-topic-catalog-design.md\`
**Plan :** \`docs/superpowers/plans/2026-05-26-agent-topic-catalog-plan.md\`
**QA :** \`docs/qa/2026-05-26-agent-topic-catalog-smoke.md\`

## Changes

### Schema (3 changements)
- New: \`AgentTopicCatalog\` (slug + label + keywordPatterns + instructionTemplate + searchHintTemplate + cooldownMinutes + isActive…)
- New: \`AgentTopicUsageLog\` (cooldown tracking per topic/conv)
- New: \`AgentConfig.freshTopicBlockedSlugs\` (per-conv blacklist)

### Services agent (3 new)
- \`TopicCatalogService\` — cache Redis 5min + compiled regex cache
- \`TopicSeedService\` — auto-seed boot idempotent (13 thèmes initiaux extraits du strategist hardcodé)
- \`TopicUsageService\` — record + filterEligible avec single-query batch

### Strategist refactor
- Supprime ~200 lignes hardcodées (enum, regex, instructions par thème)
- Lecture catalogue dynamique + filtre blacklist + cooldown + render Mustache

### Gateway admin
- 6 endpoints CRUD + /test regex : \`/api/v1/admin/agent/topics/*\`
- RBAC BIGBOSS+ADMIN, Zod validation, broadcast invalidation Redis+HTTP

### Frontend admin
- Nouvel onglet \"Topics\" avec list + create/edit modal + regex tester
- AgentConfigDialog : multi-select chips blacklist (remplace free-text)

### Performance
3 risques mitigés :
- Regex compile cache mémoire (TopicCatalogService.compiledPatternsFor)
- Single-query filterEligible avec index couvert
- Cron 24h cleanup logs > 30j

⚠️ **QA device requise avant merge** — voir smoke checklist."
```

---

## Self-Review

**1. Spec coverage :**

| Section spec | Tâche(s) qui la livre |
|---|---|
| Schema Prisma | Task 1 ✓ |
| TopicCatalogService | Task 3 ✓ |
| TopicSeedService | Task 4 ✓ |
| TopicUsageService | Task 5 ✓ |
| Cron cleanup | Task 6 ✓ |
| Wire server.ts | Task 7 ✓ |
| Strategist refactor | Task 8 ✓ |
| ConfigCache listener | Task 9 ✓ |
| Gateway routes CRUD | Task 10 ✓ |
| Frontend service | Task 11 ✓ |
| AgentTopicsTab UI | Task 12 ✓ |
| AgentConfigDialog blacklist | Task 13 ✓ |
| Smoke QA + PR | Task 14 ✓ |
| Performance mitigations | Task 3 (regex cache), Task 5 (filterEligible single query), Task 6 (cron) ✓ |
| Réutilisations | requireAgentAdmin (Task 10), sendSuccess/Error (Task 10), ConfigCache (Task 9), Tabs pattern (Task 12), Dialog (Task 12), validateObjectId (Task 10) ✓ |

**2. Placeholder scan :**
- Pas de TBD, TODO, "implement later".
- Étapes UI mentionnent "à identifier" pour le Tabs root → c'est une **action de discovery légitime** (le repo n'a pas un point d'entrée unique mappable à priori), pas un placeholder de logique. L'étape donne grep commands.
- Task 7 step 5 mentionne "L'usage exact dans le LangGraph dépendra de la convention" — légitime car le pattern d'injection au strategist node n'est pas observable depuis la spec ; on documente le besoin et on ajustera Task 8 avec le pattern réel.

**3. Type consistency :**
- `TopicCatalogEntry` (Task 3 types.ts) → utilisé tasks 3, 5, 8 ✓
- `TopicInput` (Task 3 types.ts) → utilisé task 3 service + task 10 routes ✓
- `selectProvocationTopic`, `renderProvocationHint`, `ProvocationHint` (Task 8) → testés dans Task 8 step 5 ✓
- `TopicCatalogItem` frontend (Task 11) → utilisé Task 12 + Task 13 ✓
- `AgentTopicsRoutesOpts` (Task 10) → utilisé Task 10 step 6 (registre) ✓

Aucun nom drift identifié. Plan cohérent.
