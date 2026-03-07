# Agent Config Avancée + Quality Gate Déterministe

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter les paramètres de génération (min/max mots, température, quality gate) à la config agent et améliorer le quality gate avec des vérifications déterministes (@@username, longueur, révélation IA).

**Architecture:** Nouveau champs Prisma → propagés dans `EligibleConversation` → `ConversationState` → `generator.ts` (prompt + maxTokens) et `quality-gate.ts` (checks déterministes + config-aware). Admin UI : deux nouvelles sections "Génération" et "Quality Gate" dans `AgentConfigDialog`.

**Tech Stack:** Prisma/MongoDB, TypeScript strict, LangGraph, Jest, Next.js/React

---

## Contexte technique

### Fichiers clés
- Schema Prisma : `packages/shared/prisma/schema.prisma` (modèle `AgentConfig` ligne 2904)
- State graph : `services/agent/src/graph/state.ts`
- Eligible conversations : `services/agent/src/scheduler/eligible-conversations.ts`
- Scanner : `services/agent/src/scheduler/conversation-scanner.ts`
- Generator : `services/agent/src/agents/generator.ts`
- Quality Gate : `services/agent/src/agents/quality-gate.ts`
- Quality Gate tests : `services/agent/src/__tests__/agents/quality-gate.test.ts`
- Gateway admin route : `services/gateway/src/routes/admin/agent.ts`
- Admin dialog : `apps/web/components/admin/agent/AgentConfigDialog.tsx`
- Admin service : `apps/web/services/agent-admin.service.ts`

### Paramètres actuellement manquants dans AgentConfig
Ces valeurs sont **codées en dur** dans le code et doivent devenir configurables :
- `minWordsPerMessage` (hardcodé : 3 dans generator.ts prompt)
- `maxWordsPerMessage` (hardcodé : 400 dans generator.ts prompt)
- `generationTemperature` (hardcodé : 0.8 dans generator.ts)
- `qualityGateEnabled` (toujours activé — pas de bypass possible)
- `qualityGateMinScore` (hardcodé : 0.5 dans quality-gate.ts ligne 72)

### Checks déterministes à ajouter au quality-gate
Avant l'appel LLM, rejeter les messages qui :
1. Contiennent `@@` (double arobase — bug de mention)
2. Ont moins de `minWordsPerMessage` mots
3. Ont plus de `maxWordsPerMessage` mots
4. Contiennent des révélations IA (`je suis un agent ia`, `en tant qu'ia`, `as an ai`, etc.)
5. Sont vides après trim

Ces checks sont **déterministes** — pas besoin de LLM.

---

## Task 1 : Prisma schema — nouveaux champs AgentConfig

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (modèle AgentConfig ~ligne 2938)

**Step 1 : Ajouter les 5 champs dans le modèle AgentConfig**

Après la ligne `webSearchEnabled Boolean @default(false)`, ajouter :

```prisma
  /// Minimum words per generated message
  minWordsPerMessage       Int      @default(3)
  /// Maximum words per generated message
  maxWordsPerMessage       Int      @default(400)
  /// LLM temperature for generation (0.0-2.0)
  generationTemperature    Float    @default(0.8)
  /// Enable LLM-based quality gate check
  qualityGateEnabled       Boolean  @default(true)
  /// Minimum quality score to accept a message (0.0-1.0)
  qualityGateMinScore      Float    @default(0.5)
```

**Step 2 : Régénérer le client Prisma**

```bash
cd /Users/smpceo/Documents/v2_meeshy
pnpm --filter=@meeshy/shared run generate
```

Expected: `✓ Generated Prisma Client`

**Step 3 : Vérifier que les champs apparaissent dans le type**

```bash
grep -n "minWordsPerMessage\|qualityGateEnabled" packages/shared/prisma/generated/prisma/index.d.ts | head -5
```

Expected: lignes avec les nouveaux champs

**Step 4 : Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/generated/
git commit -m "feat(agent): add generation + quality-gate fields to AgentConfig schema"
```

---

## Task 2 : Propagation des nouveaux champs dans le pipeline

**Files:**
- Modify: `services/agent/src/scheduler/eligible-conversations.ts`
- Modify: `services/agent/src/graph/state.ts`
- Modify: `services/agent/src/scheduler/conversation-scanner.ts`

**Step 1 : Ajouter les champs à `EligibleConversation`**

Dans `eligible-conversations.ts`, ajouter après `webSearchEnabled: boolean;` :

```typescript
  minWordsPerMessage: number;
  maxWordsPerMessage: number;
  generationTemperature: number;
  qualityGateEnabled: boolean;
  qualityGateMinScore: number;
```

Et dans `findEligibleConversations`, ajouter dans le return du `.map` :

```typescript
    minWordsPerMessage: config.minWordsPerMessage,
    maxWordsPerMessage: config.maxWordsPerMessage,
    generationTemperature: config.generationTemperature,
    qualityGateEnabled: config.qualityGateEnabled,
    qualityGateMinScore: config.qualityGateMinScore,
```

**Step 2 : Ajouter les champs à `ConversationStateAnnotation` dans `state.ts`**

Après l'`Annotation` pour `webSearchEnabled`, ajouter :

```typescript
  minWordsPerMessage: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 3,
  }),
  maxWordsPerMessage: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 400,
  }),
  generationTemperature: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0.8,
  }),
  qualityGateEnabled: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  qualityGateMinScore: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0.5,
  }),
```

**Step 3 : Passer les champs dans `conversation-scanner.ts`**

Dans la méthode `processConversation`, dans l'appel `this.graph.invoke({...})`, ajouter après `webSearchEnabled: conv.webSearchEnabled,` :

```typescript
      minWordsPerMessage: conv.minWordsPerMessage,
      maxWordsPerMessage: conv.maxWordsPerMessage,
      generationTemperature: conv.generationTemperature,
      qualityGateEnabled: conv.qualityGateEnabled,
      qualityGateMinScore: conv.qualityGateMinScore,
```

Et dans `scanConversation()`, lire les nouveaux champs depuis `config` :

```typescript
      minWordsPerMessage: config.minWordsPerMessage,
      maxWordsPerMessage: config.maxWordsPerMessage,
      generationTemperature: config.generationTemperature,
      qualityGateEnabled: config.qualityGateEnabled,
      qualityGateMinScore: config.qualityGateMinScore,
```

**Step 4 : Build agent pour vérifier les types**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm run build
```

Expected: `0 errors`

**Step 5 : Commit**

```bash
git add services/agent/src/scheduler/eligible-conversations.ts services/agent/src/graph/state.ts services/agent/src/scheduler/conversation-scanner.ts
git commit -m "feat(agent): propagate generation/quality-gate config through pipeline"
```

---

## Task 3 : Quality Gate — checks déterministes (TDD)

**Files:**
- Modify: `services/agent/src/__tests__/agents/quality-gate.test.ts`
- Modify: `services/agent/src/agents/quality-gate.ts`

**Step 1 : Écrire les tests RED pour les nouveaux checks déterministes**

Ajouter à la fin de `quality-gate.test.ts`, dans le bloc `describe('Quality Gate', ...)` :

```typescript
  describe('deterministic checks', () => {
    it('rejects message with @@username (double arobase)', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const msg: PendingMessage = { ...goodMessage, content: 'Salut @@atabeth comment tu vas ?' };
      const result = await gate({ pendingActions: [msg], controlledUsers: [controlledUser] } as any);
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects message that reveals AI identity', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const msg: PendingMessage = { ...goodMessage, content: 'En tant qu\'IA je pense que...' };
      const result = await gate({ pendingActions: [msg], controlledUsers: [controlledUser] } as any);
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects empty message', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const msg: PendingMessage = { ...goodMessage, content: '   ' };
      const result = await gate({ pendingActions: [msg], controlledUsers: [controlledUser] } as any);
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects message below minWordsPerMessage', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const msg: PendingMessage = { ...goodMessage, content: 'Ok' };
      const result = await gate({
        pendingActions: [msg],
        controlledUsers: [controlledUser],
        minWordsPerMessage: 5,
        maxWordsPerMessage: 400,
        qualityGateEnabled: true,
        qualityGateMinScore: 0.5,
      } as any);
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects message above maxWordsPerMessage', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const longContent = 'mot '.repeat(10).trim(); // 10 mots
      const msg: PendingMessage = { ...goodMessage, content: 'Bonjour ' + longContent };
      const result = await gate({
        pendingActions: [msg],
        controlledUsers: [controlledUser],
        minWordsPerMessage: 3,
        maxWordsPerMessage: 5,
        qualityGateEnabled: true,
        qualityGateMinScore: 0.5,
      } as any);
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('skips LLM check when qualityGateEnabled is false', async () => {
      const neverCalledLlm: LlmProvider = {
        name: 'never',
        async chat() { throw new Error('LLM should not be called'); },
      };
      const gate = createQualityGateNode(neverCalledLlm);
      const msg: PendingMessage = { ...goodMessage, content: 'Bonjour tout le monde comment vous allez ?' };
      const result = await gate({
        pendingActions: [msg],
        controlledUsers: [controlledUser],
        minWordsPerMessage: 3,
        maxWordsPerMessage: 400,
        qualityGateEnabled: false,
        qualityGateMinScore: 0.5,
      } as any);
      expect(result.pendingActions).toHaveLength(1);
    });
  });
```

**Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm test -- --testPathPattern="quality-gate" --no-coverage 2>&1 | tail -30
```

Expected: plusieurs tests FAIL (les nouveaux deterministic checks)

**Step 3 : Implémenter les checks déterministes dans `quality-gate.ts`**

Remplacer le contenu de `quality-gate.ts` par :

```typescript
import type { ConversationState, PendingAction, PendingMessage, AgentHistoryEntry } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';

// Patterns de révélation d'identité IA (insensible à la casse)
const AI_REVEAL_PATTERNS = [
  /en tant qu['']ia/i,
  /je suis un(e)? (agent|bot|ia|intelligence artificielle|assistant ia)/i,
  /as an ai/i,
  /i am an ai/i,
  /i'm an ai/i,
  /comme ia je/i,
  /en tant qu['']assistant ia/i,
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runDeterministicChecks(
  content: string,
  minWords: number,
  maxWords: number,
): { ok: boolean; reason: string } {
  if (!content.trim()) {
    return { ok: false, reason: 'empty content' };
  }

  if (content.includes('@@')) {
    return { ok: false, reason: 'double @@ mention detected (malformed mention)' };
  }

  for (const pattern of AI_REVEAL_PATTERNS) {
    if (pattern.test(content)) {
      return { ok: false, reason: `AI identity revealed: matched ${pattern}` };
    }
  }

  const wordCount = countWords(content);
  if (wordCount < minWords) {
    return { ok: false, reason: `too short: ${wordCount} words < min ${minWords}` };
  }
  if (wordCount > maxWords) {
    return { ok: false, reason: `too long: ${wordCount} words > max ${maxWords}` };
  }

  return { ok: true, reason: '' };
}

export function createQualityGateNode(llm: LlmProvider) {
  return async function qualityGate(state: ConversationState) {
    const actions = state.pendingActions;
    if (actions.length === 0) return { pendingActions: [] };

    const messages = actions.filter((a): a is PendingMessage => a.type === 'message');
    const reactions = actions.filter((a) => a.type === 'reaction');

    if (messages.length === 0) {
      return { pendingActions: reactions };
    }

    const minWords = state.minWordsPerMessage ?? 3;
    const maxWords = state.maxWordsPerMessage ?? 400;
    const qualityGateEnabled = state.qualityGateEnabled ?? true;
    const minScore = state.qualityGateMinScore ?? 0.5;

    const validatedMessages: PendingAction[] = [];
    const seenContents = new Set<string>();

    const pastContents = new Set(
      (state.agentHistory ?? []).map((h) => h.contentHash),
    );

    for (const msg of messages) {
      const userId = msg.asUserId;
      const profile = state.controlledUsers.find((u) => u.userId === userId)?.role;

      if (!profile) {
        console.warn(`[QualityGate] No profile found for user ${userId}, skipping`);
        continue;
      }

      // Phase 1 : checks déterministes (pas de LLM)
      const deterministicResult = runDeterministicChecks(msg.content, minWords, maxWords);
      if (!deterministicResult.ok) {
        console.warn(`[QualityGate] Deterministic check failed for user ${userId}: ${deterministicResult.reason}`);
        continue;
      }

      // Phase 2 : dédoublonnage
      const contentKey = msg.content.toLowerCase().trim().slice(0, 100);
      if (seenContents.has(contentKey)) {
        console.warn(`[QualityGate] Duplicate content detected, skipping`);
        continue;
      }
      if (pastContents.has(contentKey)) {
        console.warn(`[QualityGate] Content too similar to past agent message, skipping`);
        continue;
      }

      // Phase 3 : quality gate LLM (optionnel)
      if (qualityGateEnabled) {
        const expectedLanguage = msg.originalLanguage || state.controlledUsers.find((u) => u.userId === userId)?.systemLanguage || 'fr';

        const checkPrompt = `Verifie cette reponse pour coherence avec le profil.

Profil attendu:
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur: ${profile.typicalLength}
- Langue attendue: ${expectedLanguage}

Reponse a verifier: "${msg.content}"

Retourne un JSON: { "coherent": boolean, "score": 0-1, "correctLanguage": boolean, "reason": "..." }`;

        try {
          const response = await llm.chat({
            messages: [{ role: 'user', content: checkPrompt }],
            temperature: 0.1,
            maxTokens: 128,
          });

          const result = parseJsonLlm<{ coherent: boolean; score: number; correctLanguage?: boolean; reason: string }>(response.content);

          if (result.correctLanguage === false) {
            console.warn(`[QualityGate] Wrong language for user ${userId} (expected ${expectedLanguage}): ${result.reason}`);
            continue;
          }

          if (result.score < minScore) {
            console.warn(`[QualityGate] Low score (${result.score}) for user ${userId}: ${result.reason}`);
            continue;
          }
        } catch (error) {
          console.error(`[QualityGate] Error validating message for ${userId}:`, error);
          continue;
        }
      }

      seenContents.add(contentKey);
      validatedMessages.push(msg);
    }

    console.log(`[QualityGate] Validated ${validatedMessages.length}/${messages.length} messages, ${reactions.length} reactions pass-through`);

    const newHistory: AgentHistoryEntry[] = validatedMessages
      .filter((a): a is PendingMessage => a.type === 'message')
      .map((a) => ({
        userId: a.asUserId,
        topic: a.content.slice(0, 50),
        contentHash: a.content.toLowerCase().trim().slice(0, 100),
        timestamp: Date.now(),
      }));

    return { pendingActions: [...validatedMessages, ...reactions], agentHistory: newHistory };
  };
}
```

**Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm test -- --testPathPattern="quality-gate" --no-coverage 2>&1 | tail -20
```

Expected: tous les tests PASS (anciens + nouveaux)

**Step 5 : Commit**

```bash
git add services/agent/src/__tests__/agents/quality-gate.test.ts services/agent/src/agents/quality-gate.ts
git commit -m "feat(agent/quality-gate): checks déterministes @@, longueur, révélation IA + qualityGateEnabled bypass"
```

---

## Task 4 : Generator — utiliser les paramètres de config

**Files:**
- Modify: `services/agent/src/agents/generator.ts`

**Step 1 : Modifier `buildGeneratorPrompt` pour utiliser `minWords`/`maxWords`**

Remplacer la signature de `buildGeneratorPrompt` pour accepter `minWords` et `maxWords` :

```typescript
function buildGeneratorPrompt(
  displayName: string,
  profile: { ... },
  topic: string,
  conversationContext: string,
  summary: string,
  mentionUsernames: string[],
  userLanguage: string,
  recentTopics: string,
  conversationTitle: string,
  conversationDescription: string,
  agentInstructions: string,
  minWords: number,   // NEW
  maxWords: number,   // NEW
): string {
```

Et dans le corps du prompt, remplacer la ligne hardcodée :

```
- Ta reponse doit faire entre 3 mots et 400 mots.
```

par :

```typescript
  `- Ta reponse doit faire entre ${minWords} mots et ${maxWords} mots.`
```

**Step 2 : Passer les valeurs depuis `generateMessage`**

Dans `generateMessage`, lire `minWords`/`maxWords`/`temperature` depuis le state :

```typescript
  const minWords = state.minWordsPerMessage ?? 3;
  const maxWords = state.maxWordsPerMessage ?? 400;
  const temperature = state.generationTemperature ?? 0.8;
```

Et passer ces valeurs dans l'appel `buildGeneratorPrompt(...)` (ajouter `minWords, maxWords` à la fin).

Utiliser `temperature` dans l'appel `llm.chat`:
```typescript
      temperature: temperature,
```

Calculer `maxTokens` à partir de `maxWords` (1 token ≈ 0.75 mot) :
```typescript
      maxTokens: useWebSearch ? Math.max(512, Math.round(maxWords * 1.5)) : Math.max(64, Math.round(maxWords * 1.5)),
```

**Step 3 : Build pour vérifier les types**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm run build 2>&1 | tail -10
```

Expected: `0 errors`

**Step 4 : Commit**

```bash
git add services/agent/src/agents/generator.ts
git commit -m "feat(agent/generator): min/max mots et température depuis config"
```

---

## Task 5 : Gateway — admin route accepte les nouveaux champs

**Files:**
- Modify: `services/gateway/src/routes/admin/agent.ts`

**Step 1 : Ajouter les 5 champs dans `agentConfigSchema` (Zod)**

Dans le fichier `agent.ts`, dans le bloc `const agentConfigSchema = z.object({...})`, ajouter après `webSearchEnabled: z.boolean().optional(),` :

```typescript
  minWordsPerMessage: z.number().int().min(1).max(200).optional(),
  maxWordsPerMessage: z.number().int().min(10).max(2000).optional(),
  generationTemperature: z.number().min(0).max(2).optional(),
  qualityGateEnabled: z.boolean().optional(),
  qualityGateMinScore: z.number().min(0).max(1).optional(),
```

**Step 2 : Build gateway**

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm run build 2>&1 | tail -10
```

Expected: `0 errors`

**Step 3 : Commit**

```bash
git add services/gateway/src/routes/admin/agent.ts
git commit -m "feat(gateway/admin): expose nouveaux champs config agent dans la route admin"
```

---

## Task 6 : Admin UI — nouveaux champs dans AgentConfigDialog + AgentConfigData

**Files:**
- Modify: `apps/web/services/agent-admin.service.ts`
- Modify: `apps/web/components/admin/agent/AgentConfigDialog.tsx`

**Step 1 : Ajouter les nouveaux champs dans `AgentConfigData` et `AgentConfigUpsert`**

Dans `agent-admin.service.ts` :

```typescript
// Dans AgentConfigData, ajouter après webSearchEnabled:
  minWordsPerMessage: number;
  maxWordsPerMessage: number;
  generationTemperature: number;
  qualityGateEnabled: boolean;
  qualityGateMinScore: number;

// Dans AgentConfigUpsert, ajouter après webSearchEnabled?:
  minWordsPerMessage?: number;
  maxWordsPerMessage?: number;
  generationTemperature?: number;
  qualityGateEnabled?: boolean;
  qualityGateMinScore?: number;
```

**Step 2 : Ajouter les valeurs par défaut dans `AgentConfigDialog.tsx`**

Dans les deux initialisations `setForm({...})` (état initial vide et chargement config), ajouter :

```typescript
        minWordsPerMessage: config?.minWordsPerMessage ?? 3,
        maxWordsPerMessage: config?.maxWordsPerMessage ?? 400,
        generationTemperature: config?.generationTemperature ?? 0.8,
        qualityGateEnabled: config?.qualityGateEnabled ?? true,
        qualityGateMinScore: config?.qualityGateMinScore ?? 0.5,
```

**Step 3 : Ajouter deux nouvelles sections UI dans le Dialog**

Avant le bloc `<Separator />` final (avant la section "Rôles utilisateurs"), insérer les deux sections suivantes :

```tsx
          <Separator />

          {/* Génération */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Génération</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mots min. par message</Label>
                <Input
                  type="number"
                  value={form.minWordsPerMessage ?? 3}
                  onChange={e => updateField('minWordsPerMessage', Math.max(1, Math.min(200, parseInt(e.target.value) || 3)))}
                  min={1}
                  max={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Mots max. par message</Label>
                <Input
                  type="number"
                  value={form.maxWordsPerMessage ?? 400}
                  onChange={e => updateField('maxWordsPerMessage', Math.max(10, Math.min(2000, parseInt(e.target.value) || 400)))}
                  min={10}
                  max={2000}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Température de génération ({((form.generationTemperature ?? 0.8) * 100).toFixed(0)}%)</Label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-10">Précis</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={Math.round((form.generationTemperature ?? 0.8) * 100)}
                  onChange={e => updateField('generationTemperature', parseInt(e.target.value) / 100)}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12">Créatif</span>
              </div>
              <p className="text-xs text-gray-500">0 = déterministe, 1 = équilibré, 2 = très créatif</p>
            </div>
          </div>

          <Separator />

          {/* Quality Gate */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Quality Gate</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label>Vérification LLM activée</Label>
                <p className="text-xs text-gray-500 mt-1">
                  Vérifie la cohérence du ton, registre et langue. Les checks déterministes (@@, longueur, révélation IA) s&apos;appliquent toujours.
                </p>
              </div>
              <Switch
                checked={form.qualityGateEnabled ?? true}
                onCheckedChange={v => updateField('qualityGateEnabled', v)}
              />
            </div>
            {(form.qualityGateEnabled ?? true) && (
              <div className="space-y-2 pl-4">
                <Label>Score minimum ({Math.round((form.qualityGateMinScore ?? 0.5) * 100)}%)</Label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-10">Laxiste</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((form.qualityGateMinScore ?? 0.5) * 100)}
                    onChange={e => updateField('qualityGateMinScore', parseInt(e.target.value) / 100)}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-400 w-10">Strict</span>
                </div>
                <p className="text-xs text-gray-500">
                  Score en dessous duquel le message est rejeté. 50% = équilibré, 80% = très strict.
                </p>
              </div>
            )}
          </div>
```

**Step 4 : Build web**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/web && pnpm run build 2>&1 | grep -E "error|✓" | head -10
```

Expected: `✓ Compiled successfully`

**Step 5 : Commit**

```bash
git add apps/web/services/agent-admin.service.ts apps/web/components/admin/agent/AgentConfigDialog.tsx
git commit -m "feat(admin/ui): sections Génération et Quality Gate dans le dialog de config agent"
```

---

## Vérification finale

```bash
# Tests agent
cd /Users/smpceo/Documents/v2_meeshy/services/agent && pnpm test --no-coverage 2>&1 | tail -15

# Build complet
cd /Users/smpceo/Documents/v2_meeshy && pnpm run build 2>&1 | grep -E "error|✓|✗" | head -20
```

Expected: tous les tests passent, build clean.
