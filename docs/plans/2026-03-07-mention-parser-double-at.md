# Mention Parser `@DisplayName` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Supporter les mentions `@DisplayName` avec espaces (ex: `@Andre Tabeth !`) en plus des mentions `@username` existantes, côté backend (extraction + résolution) et iOS (rendu + autocomplete).

**Architecture:** Un seul `@` comme trigger. Deux couches de matching — (1) matching par `displayName` sur les participants connus (approche exacte, plus long en premier), (2) fallback regex `@(\w+)` pour les usernames legacy. L'ordre de priorité est : `mentionedUserIds` fournis par le frontend → extraction `@displayName` côté serveur → extraction `@username` legacy.

**Tech Stack:** TypeScript strict (shared + gateway), Jest (tests gateway), Swift/SwiftUI (iOS), XCTest (tests iOS)

---

## Contexte — ce qui existe aujourd'hui

| Fichier | Rôle | Comportement actuel |
|---|---|---|
| `packages/shared/types/mention.ts` | Constantes + utils partagés | `MENTION_REGEX: /@(\w+)/g` — single `@`, pas d'espaces |
| `services/gateway/src/services/MentionService.ts:35` | Service mention backend | `private MENTION_REGEX = /@(\w+)/g` |
| `services/gateway/src/services/MentionService.ts:154` | `extractMentions(content)` | Regex simple, pas de participants |
| `services/gateway/src/services/messaging/MessageProcessor.ts:465` | `processMentions()` | Utilise `mentionService.extractMentions()` en fallback |
| `apps/ios/Meeshy/.../ThemedMessageBubble.swift` | Rendu bulle | Cherche `@username` dans le texte |
| `apps/ios/Meeshy/.../ConversationViewModel.swift:263` | `mentionDisplayNames` | Map username→displayName pour le rendu |

---

## Task 1 — Tests unitaires pour le parser partagé

**Files:**
- Create: `packages/shared/src/__tests__/mention-parser.test.ts`

**Étape 1 — Écrire les tests**

```typescript
// packages/shared/src/__tests__/mention-parser.test.ts
import { parseMentions, hasMentions, type MentionParticipant } from '../utils/mention-parser';

const participants: MentionParticipant[] = [
  { userId: 'u1', username: 'atabeth',    displayName: 'Andre Tabeth' },
  { userId: 'u2', username: 'jcharlesnm', displayName: 'Jean Charles' },
  { userId: 'u3', username: 'marie',      displayName: 'Marie' },         // nom simple
  { userId: 'u4', username: 'ann_marie',  displayName: 'Ann-Marie Dupont' }, // tiret
];

describe('parseMentions', () => {
  describe('@displayName matching (avec espaces)', () => {
    it('extrait un displayName simple avec espace après @', () => {
      const result = parseMentions('Salut @Andre Tabeth !', participants);
      expect(result).toEqual(['u1']);
    });

    it('extrait un displayName en fin de string', () => {
      const result = parseMentions('Bonjour @Jean Charles', participants);
      expect(result).toEqual(['u2']);
    });

    it('extrait plusieurs displayNames dans la même phrase', () => {
      const result = parseMentions('@Andre Tabeth et @Jean Charles, rdv demain', participants);
      expect(result).toEqual(expect.arrayContaining(['u1', 'u2']));
      expect(result).toHaveLength(2);
    });

    it('est insensible à la casse', () => {
      const result = parseMentions('@andre tabeth merci', participants);
      expect(result).toEqual(['u1']);
    });

    it('matche le plus long displayName en priorité (évite les matches partiels)', () => {
      // "Ann-Marie" pourrait matcher "Marie" (u3) → doit matcher "Ann-Marie Dupont" (u4)
      const result = parseMentions('@Ann-Marie Dupont bravo', participants);
      expect(result).toEqual(['u4']);
    });

    it('matche un displayName simple sans espace', () => {
      const result = parseMentions('@Marie tu viens ?', participants);
      expect(result).toEqual(['u3']);
    });
  });

  describe('@username fallback', () => {
    it('extrait un username classique @username quand aucun displayName ne matche exactement', () => {
      const result = parseMentions('@atabeth tu es là ?', participants);
      expect(result).toEqual(['u1']);
    });

    it('extrait @username même si @DisplayName est aussi présent', () => {
      const result = parseMentions('@Andre Tabeth et @jcharlesnm', participants);
      expect(result).toEqual(expect.arrayContaining(['u1', 'u2']));
    });

    it('retourne handle brut si username non résolu sans participants', () => {
      const result = parseMentions('@unknown_user salut', []);
      expect(result).toEqual(['@unknown_user']);
    });
  });

  describe('deduplication et limites', () => {
    it('déduplique les mentions du même utilisateur', () => {
      const result = parseMentions('@Andre Tabeth et @atabeth', participants);
      expect(result).toEqual(['u1']); // même user, compté une fois
    });

    it('retourne [] pour un contenu vide', () => {
      expect(parseMentions('', participants)).toEqual([]);
    });

    it('retourne [] quand aucune mention', () => {
      expect(parseMentions('Bonjour tout le monde', participants)).toEqual([]);
    });

    it('sans participants, extrait les handles bruts', () => {
      const result = parseMentions('@alice et @bob dupont', []);
      // @alice est un username simple → retourner le handle brut
      expect(result).toContain('@alice');
    });
  });

  describe('hasMentions', () => {
    it('détecte @ comme mention', () => {
      expect(hasMentions('Salut @Andre Tabeth')).toBe(true);
    });

    it('détecte @username comme mention', () => {
      expect(hasMentions('Salut @alice')).toBe(true);
    });

    it('retourne false sans mention', () => {
      expect(hasMentions('Bonjour')).toBe(false);
    });
  });
});
```

**Étape 2 — Vérifier que les tests échouent**
```bash
cd packages/shared
npx jest src/__tests__/mention-parser.test.ts --no-coverage
# Attendu: FAIL (module not found)
```

**Étape 3 — Commit (tests seuls)**
```bash
git add packages/shared/src/__tests__/mention-parser.test.ts
git commit -m "test(shared): failing tests for parseMentions with @displayName space support"
```

---

## Task 2 — Implémenter `parseMentions` dans shared

**Files:**
- Create: `packages/shared/src/utils/mention-parser.ts`

**Étape 1 — Implémenter**

```typescript
// packages/shared/src/utils/mention-parser.ts

export interface MentionParticipant {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
}

/**
 * Parse les mentions dans un message.
 *
 * Priorité :
 * 1. @DisplayName → résolution exacte sur les participants (insensible casse, plus long en premier)
 *    Délimiteur: espace double, ponctuation, @, ou fin de chaîne
 * 2. @username → résolution par username sur les participants (regex \w+)
 * 3. Sans participants → retourne les handles bruts ("@alice")
 *
 * Retourne une liste dédupliquée de userId (si participants fournis)
 * ou de handles bruts (si pas de participants).
 */
export function parseMentions(
  content: string,
  participants: readonly MentionParticipant[]
): string[] {
  if (!content) return [];

  const resolved = new Set<string>();

  // Trier par longueur de displayName décroissante pour matcher le plus long d'abord
  // (évite que "Marie" matche avant "Ann-Marie Dupont")
  const sorted = [...participants].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );

  let remaining = content;

  // Étape 1 : matcher @DisplayName sur les participants connus (avec espaces possibles)
  if (sorted.length > 0) {
    for (const p of sorted) {
      const escaped = escapeRegex(p.displayName);
      // @DisplayName suivi d'un délimiteur ou fin de chaîne
      // Délimiteurs: espace double, ponctuation (!?,;:.), @, nouvelle ligne, ou fin
      const regex = new RegExp(`@${escaped}(?=[!?,;:.\\n]|\\s{2,}|@|$)`, 'gi');
      if (regex.test(remaining)) {
        resolved.add(p.userId);
        // Remplacer les occurrences trouvées pour éviter le double matching
        remaining = remaining.replace(regex, '');
      }
    }
  }

  // Étape 2 : matcher @username classique (\w+ sans espaces) sur les participants restants
  const handleRegex = /@(\w{1,30})/g;
  for (const match of remaining.matchAll(handleRegex)) {
    const handle = match[1].toLowerCase();
    const found = sorted.find((p) => p.username.toLowerCase() === handle);
    if (found) {
      resolved.add(found.userId);
    } else if (participants.length === 0) {
      // Pas de participants → retourner le handle brut
      resolved.add(match[0]); // "@alice"
    }
  }

  return [...resolved];
}

/**
 * Vérifie si un texte contient au moins une mention (@)
 */
export function hasMentions(content: string): boolean {
  return /@\w/.test(content);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**Étape 2 — Exporter depuis shared**

Vérifier le fichier d'export de shared utils. Chercher d'abord :
```bash
ls packages/shared/src/utils/
# et
cat packages/shared/src/utils/index.ts  # ou index s'il existe
```

Si un `packages/shared/src/utils/index.ts` existe, y ajouter :
```typescript
export { parseMentions, hasMentions } from './mention-parser';
export type { MentionParticipant } from './mention-parser';
```

Si shared exporte via le `src/index.ts` principal, l'ajouter là.

**Étape 3 — Lancer les tests**
```bash
cd packages/shared
npx jest src/__tests__/mention-parser.test.ts --no-coverage
# Attendu: PASS (tous les tests verts)
```

**Étape 4 — Build shared**
```bash
cd packages/shared
pnpm run build
# Attendu: pas d'erreur TypeScript
```

**Étape 5 — Commit**
```bash
git add packages/shared/src/utils/mention-parser.ts
git add packages/shared/src/utils/index.ts  # ou src/index.ts selon la structure
git commit -m "feat(shared): parseMentions utility — @DisplayName avec espaces + @username"
```

---

## Task 3 — Mettre à jour MentionService (backend gateway)

**Files:**
- Modify: `services/gateway/src/services/MentionService.ts`
- Modify (si existe): `services/gateway/src/__tests__/unit/services/MentionService.test.ts`

### Contexte
`MentionService.extractMentions(content)` est appelé en fallback quand le frontend ne fournit pas de `mentionedUserIds`. Il doit maintenant aussi résoudre les `@DisplayName` avec espaces.

**Étape 1 — Ajouter les tests** (dans le fichier de test existant ou en créer un)

```typescript
describe('extractMentionsWithParticipants — @DisplayName support', () => {
  it('extrait userId depuis @DisplayName via les participants', () => {
    const service = new MentionService(prismaMock);
    const usernames = service.extractMentionsWithParticipants(
      '@Andre Tabeth tu viens ?',
      [{ userId: 'u1', username: 'atabeth', displayName: 'Andre Tabeth' }]
    );
    expect(usernames).toContain('atabeth');
  });

  it('rétrocompatibilité : extrait @username classique', () => {
    const service = new MentionService(prismaMock);
    const usernames = service.extractMentionsWithParticipants(
      '@atabeth salut',
      [{ userId: 'u1', username: 'atabeth', displayName: 'Andre Tabeth' }]
    );
    expect(usernames).toContain('atabeth');
  });
});
```

**Étape 2 — Ajouter `extractMentionsWithParticipants` dans MentionService**

Dans `services/gateway/src/services/MentionService.ts` :

```typescript
// Ajouter import en haut
import { parseMentions, type MentionParticipant } from '@meeshy/shared/utils/mention-parser';

// Ajouter méthode dans la classe MentionService (après extractMentions existant)

/**
 * Extrait les mentions avec connaissance des participants.
 * Supporte @DisplayName (avec espaces) et @username.
 * @returns Liste de usernames (strings) résolus
 */
extractMentionsWithParticipants(
  content: string,
  participants: MentionParticipant[]
): string[] {
  if (!content || content.length > this.MAX_CONTENT_LENGTH) return [];

  const results = parseMentions(content, participants);

  // Mapper userId → username via les participants, filtrer handles non résolus
  const usernames: string[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (result.startsWith('@')) {
      // Handle brut non résolu → extraire le username sans @ et valider
      const raw = result.replace(/^@/, '').toLowerCase();
      if (this.isValidUsername(raw) && !seen.has(raw)) {
        usernames.push(raw);
        seen.add(raw);
      }
    } else {
      // userId résolu → trouver le username correspondant
      const p = participants.find((x) => x.userId === result);
      if (p && !seen.has(p.username)) {
        usernames.push(p.username);
        seen.add(p.username);
      }
    }

    if (usernames.length >= this.MAX_MENTIONS_PER_MESSAGE) break;
  }

  return usernames;
}
```

**Note importante** : `isValidUsername` est déjà une méthode privée dans MentionService (ligne 143). Elle accepte `[a-z0-9_]{1,30}`. Pas besoin de la créer.

**Étape 3 — Lancer les tests MentionService**
```bash
cd services/gateway
npx jest --testPathPattern="MentionService" --no-coverage
# Attendu: PASS
```

**Étape 4 — Commit**
```bash
git add services/gateway/src/services/MentionService.ts
git add services/gateway/src/__tests__/unit/services/MentionService.test.ts  # si modifié
git commit -m "feat(gateway): MentionService — extractMentionsWithParticipants pour @DisplayName"
```

---

## Task 4 — Câbler les participants dans MessageProcessor

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts`

### Contexte
`processMentions()` (vers ligne 465) appelle `mentionService.extractMentions()` en fallback.
Il a accès au `conversationId` → peut récupérer les participants.

**Étape 1 — Lire MessageProcessor.ts pour trouver la section exacte**
```bash
grep -n "extractMentions\|processMentions\|mentionedUsernames" \
  services/gateway/src/services/messaging/MessageProcessor.ts | head -20
```

**Étape 2 — Modifier `processMentions` dans MessageProcessor.ts**

Remplacer le fallback existant (ligne ~482) :

```typescript
// AVANT
const mentionedUsernames = this.mentionService.extractMentions(processedContent);

// APRÈS
const participants = await this.getConversationParticipants(data.conversationId);
const mentionedUsernames = this.mentionService.extractMentionsWithParticipants(
  processedContent,
  participants
);
```

Ajouter la méthode privée `getConversationParticipants` dans MessageProcessor :

```typescript
private async getConversationParticipants(
  conversationId: string
): Promise<import('@meeshy/shared/utils/mention-parser').MentionParticipant[]> {
  try {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      select: {
        user: {
          select: { id: true, username: true, displayName: true }
        }
      }
    });

    return members
      .filter((m) => m.user !== null)
      .map((m) => ({
        userId: m.user!.id,
        username: m.user!.username,
        displayName: m.user!.displayName ?? m.user!.username,
      }));
  } catch {
    return []; // Fallback silencieux : l'extraction @username classique prend le relais
  }
}
```

**Note** : Vérifier si MessageProcessor utilise `leftAt` ou `isActive` pour filtrer les membres actifs. Adapter selon le schéma Prisma.

**Étape 3 — Lancer les tests**
```bash
cd services/gateway
npx jest --testPathPattern="MessageProcessor|MentionService" --no-coverage
# Attendu: PASS (pas de régression)
```

**Étape 4 — Commit**
```bash
git add services/gateway/src/services/messaging/MessageProcessor.ts
git commit -m "feat(gateway): MessageProcessor passe les participants à extractMentionsWithParticipants"
```

---

## Task 5 — Mettre à jour MENTION_CONSTANTS dans shared/types/mention.ts

**Files:**
- Modify: `packages/shared/types/mention.ts`

Les constants sont importées par iOS (via le web) et le gateway. Mettre à jour pour cohérence.

**Changements minimaux** (ne pas casser l'existant) :

```typescript
export const MENTION_CONSTANTS = {
  MAX_USERNAME_LENGTH: 30,
  MAX_DISPLAY_NAME_LENGTH: 50,           // Nouveau : longueur max displayName
  MAX_SUGGESTIONS: 10,
  AUTOCOMPLETE_DEBOUNCE_MS: 300,
  NOTIFICATION_WORD_LIMIT: 20,
  MENTION_TRIGGER: '@',
  MENTION_REGEX: /@(\w+)/g,              // Regex legacy (username sans espaces)
  MENTION_DISPLAY_REGEX: /@([\w][\w\s'-]{0,49})(?=[!?,;:.@\n]|\s{2,}|$)/g, // Pour rendu avec espaces
} as const;
```

Mettre aussi à jour `hasMentions()` dans ce fichier si elle existe (ligne 232 actuelle) :
```typescript
// AVANT
export function hasMentions(content: string): boolean {
  return /@\w+/.test(content);
}

// APRÈS — inchangée, déjà correct
export function hasMentions(content: string): boolean {
  return /@\w/.test(content);
}
```

**Build et commit :**
```bash
cd packages/shared && pnpm run build
git add packages/shared/types/mention.ts
git commit -m "feat(shared): MENTION_CONSTANTS — MENTION_DISPLAY_REGEX pour @DisplayName avec espaces"
```

---

## Task 6 — iOS : rendu `@DisplayName` dans ThemedMessageBubble

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

### Contexte
Le rendu actuel cherche `@username` pour highlighter les mentions. Il faut aussi matcher `@DisplayName` avec espaces.

**Étape 1 — Trouver le code de rendu des mentions**

```bash
grep -n "@mention\|highlight.*mention\|mention.*highlight\|mentionDisplayNames\|renderMention\|attributed\|AttributedString" \
  apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift | head -30
```

**Étape 2 — Lire le fichier complet avant modification**

```bash
cat apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
```

**Étape 3 — Mettre à jour le rendering**

La logique de rendu doit chercher `@DisplayName` (en utilisant le `mentionDisplayNames` map qui mappe `username → displayName`) ET `@username`.

Pattern de rendu à mettre à jour :

```swift
// Pour chaque (username, displayName) dans mentionDisplayNames :
//   - chercher "@{displayName}" dans le texte (avec espaces)
//   - chercher "@{username}" dans le texte (sans espaces)
// Highlighter les deux avec la même couleur/style

// Exemple d'implémentation avec AttributedString
private func renderMentions(
    in text: String,
    mentionDisplayNames: [String: String]
) -> AttributedString {
    var attributed = AttributedString(text)

    for (username, displayName) in mentionDisplayNames {
        // Matcher @DisplayName (avec espaces)
        let displayPattern = "@\(NSRegularExpression.escapedPattern(for: displayName))"
        if let range = text.range(of: displayPattern, options: [.caseInsensitive]) {
            if let attrRange = Range(range, in: attributed) {
                attributed[attrRange].foregroundColor = .accentColor
                attributed[attrRange].font = .body.bold()
            }
        }

        // Matcher @username (rétrocompatibilité)
        let usernamePattern = "@\(NSRegularExpression.escapedPattern(for: username))"
        if let range = text.range(of: usernamePattern, options: [.caseInsensitive]) {
            if let attrRange = Range(range, in: attributed) {
                attributed[attrRange].foregroundColor = .accentColor
                attributed[attrRange].font = .body.bold()
            }
        }
    }

    return attributed
}
```

**Note :** L'implémentation exacte dépend du code actuel dans ThemedMessageBubble. Lire le fichier complet avant de modifier. Adapter selon la méthode de rendering existante. L'important est de supporter les deux patterns.

**Étape 4 — Build iOS**
```bash
./apps/ios/meeshy.sh build
# Attendu: Build Succeeded
```

**Étape 5 — Commit**
```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): rendu mention @DisplayName avec espaces dans ThemedMessageBubble"
```

---

## Task 7 — iOS : trigger autocomplete sur `@` suivi d'un displayName avec espaces

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- (Possiblement) `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

### Contexte
L'autocomplete de mentions se déclenche sur `@`. Lors de la sélection d'un participant, si le displayName contient des espaces, insérer `@DisplayName` (au lieu de `@username`) — et permettre à l'utilisateur de continuer à taper après l'espace.

**Étape 1 — Lire le code existant de ConversationViewModel.swift**
```bash
grep -n "mention\|autocomplete\|@\|triggerChar\|mentionSearch\|mentionedUserIds\|displayName" \
  apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift | head -40
```

**Étape 2 — Mettre à jour la détection du trigger et l'insertion**

Trouver la logique qui détecte `@` dans le texte tapé. La logique actuelle doit probablement stopper l'autocomplete à un espace. Modifier pour :

```swift
// La logique de détection du curseur dans une mention :
// - Trouver le dernier @ avant le curseur
// - Extraire tout ce qui suit comme query (y compris les espaces)
// - Chercher les participants dont le displayName ou username commence par la query
// - Lors de l'insertion : utiliser @DisplayName si le displayName contient des espaces
//   sinon utiliser @username

// Lors de l'insertion depuis l'autocomplete :
// Si displayName contient des espaces → insérer "@{displayName} " (avec espace final)
// Sinon → insérer "@{username} " (comportement actuel)
// Toujours ajouter l'userId dans mentionedUserIds
```

**Étape 3 — Mettre à jour `mentionedUserIds`**

S'assurer que `mentionedUserIds` contient bien l'userId du participant sélectionné, qu'il ait été inséré via `@username` ou `@DisplayName`.

**Étape 4 — Build et test**
```bash
./apps/ios/meeshy.sh build
# Attendu: Build Succeeded
```

**Étape 5 — Commit**
```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "feat(ios): autocomplete mention — insertion @DisplayName avec espaces si nécessaire"
```

---

## Task 8 — Agent : résolution `@DisplayName` dans mentionedUsernames

**Files:**
- Modify: `services/gateway/src/socketio/MeeshySocketIOManager.ts` (section `handleAgentResponse`)

### Contexte
L'agent envoie `mentionedUsernames: ['atabeth']` dans sa réponse. Quand le content contient `@Andre Tabeth`, le gateway doit résoudre le displayName vers le userId.

**Étape 1 — Trouver la section dans MeeshySocketIOManager.ts**
```bash
grep -n "mentionedUsernames\|handleAgentResponse" \
  services/gateway/src/socketio/MeeshySocketIOManager.ts | head -10
```

**Étape 2 — Ajouter la résolution @DisplayName**

Dans `handleAgentResponse`, avant d'appeler `MessagingService.handleMessage`, si `mentionedUsernames` est vide mais que le content contient `@`, extraire les participants de la conversation et résoudre :

```typescript
// Dans handleAgentResponse
let resolvedMentionIds: string[] = [];

if (agentResponse.mentionedUsernames?.length) {
  // Résolution username → userId (existant)
  const userMap = await this.mentionService.resolveUsernames(agentResponse.mentionedUsernames);
  resolvedMentionIds = [...userMap.values()].map(u => u.id);
} else if (agentResponse.content?.includes('@')) {
  // Résolution @DisplayName depuis les participants de la conversation
  const participants = await this.getConversationParticipantsForMention(agentResponse.conversationId);
  const usernames = this.mentionService.extractMentionsWithParticipants(
    agentResponse.content,
    participants
  );
  const userMap = await this.mentionService.resolveUsernames(usernames);
  resolvedMentionIds = [...userMap.values()].map(u => u.id);
}
```

Si `getConversationParticipantsForMention` n'existe pas déjà dans MeeshySocketIOManager, la créer en s'inspirant de celle dans MessageProcessor.

**Étape 3 — Build gateway**
```bash
cd services/gateway && pnpm run build
# Attendu: pas d'erreur TypeScript
```

**Étape 4 — Commit**
```bash
git add services/gateway/src/socketio/MeeshySocketIOManager.ts
git commit -m "feat(gateway): résolution @DisplayName dans handleAgentResponse"
```

---

## Task 9 — Tests d'intégration et vérification E2E

**Étape 1 — Lancer tous les tests backend**
```bash
cd services/gateway
pnpm run test
# Attendu: PASS sans régression
```

**Étape 2 — Build complet**
```bash
cd /Users/smpceo/Documents/v2_meeshy
pnpm --filter=@meeshy/shared build
pnpm --filter=@meeshy/gateway build
./apps/ios/meeshy.sh build
# Attendu: tous builds OK
```

**Étape 3 — Test E2E manuel**

Envoyer depuis l'app iOS : `@Andre Tabeth tu es là ?`
- Vérifier que la mention est highlightée dans la bulle
- Vérifier que Andre Tabeth reçoit une notification de mention
- Vérifier en DB : `db.Mention.findMany({ where: { messageId: '...' } })` → contient le userId d'Andre Tabeth

**Étape 4 — Commit final**
```bash
git add .
git commit -m "chore: mention @DisplayName — intégration complète backend + iOS"
```

---

## Résumé des changements

| Fichier | Type | Description |
|---|---|---|
| `packages/shared/src/utils/mention-parser.ts` | **Nouveau** | Parser `parseMentions()` + `hasMentions()` |
| `packages/shared/types/mention.ts` | Modifié | `MENTION_DISPLAY_REGEX`, `MAX_DISPLAY_NAME_LENGTH` |
| `services/gateway/src/services/MentionService.ts` | Modifié | `extractMentionsWithParticipants()` |
| `services/gateway/src/services/messaging/MessageProcessor.ts` | Modifié | Passe participants au fallback d'extraction |
| `services/gateway/src/socketio/MeeshySocketIOManager.ts` | Modifié | Résolution `@DisplayName` dans `handleAgentResponse` |
| `apps/ios/.../ThemedMessageBubble.swift` | Modifié | Rendu `@DisplayName` highlighté |
| `apps/ios/.../ConversationViewModel.swift` | Modifié | Insertion `@DisplayName` depuis autocomplete |
