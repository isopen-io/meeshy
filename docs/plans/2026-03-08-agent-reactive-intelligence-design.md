# Agent Reactive Intelligence — Design

## Contexte

Le service agent actuel traite chaque message entrant avec le même pipeline lourd (strategist + generator + quality gate = 3 appels LLM) et ne distingue pas les interpellations directes des messages normaux. Résultat : pas de réactivité naturelle, timing artificiel, et gaspillage de tokens LLM.

## Objectifs

1. Réponse naturelle aux interpellations (mention, reply) avec timing proportionnel
2. Budget LLM strict : 3-5 appels max par cycle
3. Timing de réponse réaliste (apparition + lecture + frappe)
4. Queue de delivery intelligente (pas de double-parole, réordonnancement)
5. Sélection de conversations basée sur le type, configurable via admin

## Architecture : 2 modes

### Mode Réactif (message entrant)

```
Gateway → agent:new-message (enrichi avec mentionedUserIds[])
  → ReactiveHandler : détecte si un user contrôlé est interpellé
    → Oui → Appel 1: Triage (urgency, complexity, delay)
           → Appel 2: Génération (contenu de la réponse)
           → Appel 3: Quality gate (si activé)
           → DeliveryQueue avec timing calculé
    → Non → Stocke le message en contexte, rien d'autre
```

### Mode Scan périodique (intervalle configurable)

```
Scanner → Sélection conversations éligibles (type + fraîcheur + config)
  → Pour chaque conversation :
    → Code: pré-sélection N candidats pondérés (non-connectés, rotation)
    → Appel 1: Triage (choisit qui parle parmi candidats, sujets)
    → Appel 2: Génération batch (tous les messages d'un coup)
    → Appel 3: Quality gate (si activé)
    → DeliveryQueue avec timing naturel
```

## Détection d'interpellation (ReactiveHandler)

Le gateway enrichit `agent:new-message` avec `mentionedUserIds[]`. L'agent parse aussi le contenu en fallback.

3 cas détectés :

| Cas | Détection | Délai base |
|-----|-----------|------------|
| Mention directe | `mentionedUserIds` inclut un user contrôlé | 60-240s |
| Reply à un agent user | `replyToId` pointe vers un message d'un user contrôlé | 30-120s |
| Salutation | Mention/reply + contenu matche pattern greeting | 5-30s |

Les délais de base sont ajustés par le timing naturel (voir ci-dessous).

## Timing naturel (3 composantes)

```
délai total = apparition + lecture + frappe

apparition = f(dernierMessageDuUser)
  - parlé < 2min ago  → 0-5s (déjà "présent")
  - parlé < 30min ago → 10-30s (revient vite)
  - parlé < 2h ago    → 30-90s (ouvre l'app)
  - parlé > 2h ago    → 60-180s (notification → ouvre)

lecture = ~2s par message non-lu récent (max 20s)

frappe = ~3-4s par mot × ±20% random
  - min: 3s
  - max: 180s
```

## Gestion de la queue intelligente

Quand un user est interpellé mais a déjà un message planifié dans la queue :

1. Si la réponse réactive est courte (< 10 mots) → envoyer immédiatement
2. Le message planifié est décalé après avec un délai de composition réaliste
3. Si la réponse réactive est longue → le message planifié passe en premier (il était "déjà en train d'écrire"), puis la réponse réactive suit

## Appels LLM (3-5 max par cycle)

### Appel 1 — Triage (~128-256 tokens output)

```json
{
  "shouldRespond": true,
  "responses": [
    {
      "asUserId": "...",
      "urgency": "high",
      "isGreeting": false,
      "needsElaboration": true,
      "suggestedTopic": "..."
    }
  ]
}
```

### Appel 2 — Génération batch (~512-1024 tokens output)

```json
{
  "messages": [
    {
      "asUserId": "...",
      "content": "...",
      "replyToId": "...",
      "wordCount": 23,
      "isGreeting": false
    }
  ]
}
```

### Appel 3 — Quality gate (optionnel, ~128 tokens)

Cohérence profil, langue, pas de révélation IA.

## Sélection des conversations (scan périodique)

### Critères d'éligibilité (tous configurables via admin)

- Types éligibles : `["group", "channel", "public", "global"]` (défaut, configurable)
- Dernier message < 22h (seuil configurable)
- `AgentConfig.enabled` : si absent → considéré `true`
- `AgentConfig.enabled = false` → exclusion explicite
- Max conversations par cycle : configurable (défaut: toutes)

### Sélection des users (scan périodique)

- Code pré-filtre les non-connectés depuis > `inactivityThresholdHours`
- Pondération : pas parlé aujourd'hui = 3x, section de journée différente = 2x
- Le LLM choisit parmi les candidats pondérés dans l'appel Triage

### Sélection des users (mode réactif)

- L'user interpellé est automatiquement sélectionné (mention/reply)
- Le Triage peut ajouter d'autres users si pertinent

## Anti-salutation

- Salutation OK uniquement pour la première intervention d'une section de journée (matin, après-midi, soir)
- Si une salutation existe dans les 4 dernières heures → bloquée
- Quality gate détecte et bloque les salutations redondantes
- Prompt generator évite les salutations sauf première intervention de section

## Fichiers impactés

### Gateway (enrichissement notification)
- `services/gateway/src/socketio/MeeshySocketIOManager.ts` — `_notifyAgent()` ajoute `mentionedUserIds`
- `services/gateway/src/services/zmq-agent/ZmqAgentClient.ts` — type enrichi

### Agent (refactoring principal)
- `services/agent/src/zmq/types.ts` — schema enrichi avec `mentionedUserIds`
- `services/agent/src/server.ts` — routing réactif vs simple stockage
- `services/agent/src/reactive/reactive-handler.ts` — NOUVEAU : détection + triage + génération réactive
- `services/agent/src/reactive/timing-calculator.ts` — NOUVEAU : calcul du timing naturel
- `services/agent/src/reactive/interpellation-detector.ts` — NOUVEAU : détection mention/reply/greeting
- `services/agent/src/delivery/delivery-queue.ts` — queue intelligente avec réordonnancement
- `services/agent/src/agents/strategist.ts` — optimisé, prompt allégé
- `services/agent/src/agents/generator.ts` — génération batch
- `services/agent/src/scheduler/eligible-conversations.ts` — sélection par type configurable
- `services/agent/src/scheduler/conversation-scanner.ts` — pré-sélection pondérée des candidats

### Prisma schema
- `AgentConfig` — nouveaux champs : `eligibleConversationTypes`, `maxConversationsPerCycle`, `messageFreshnessHours`

### Admin (configuration)
- Routes admin pour configurer les nouveaux paramètres
