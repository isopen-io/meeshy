# Prisme Linguistique — Cohérence Totale

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que chaque message affiche TOUJOURS la traduction dans la langue primaire de l'utilisateur, avec l'icône translate et les drapeaux de langues visibles systématiquement.

**Architecture:** 3 couches à corriger — Gateway (invalidation cache langues, ajout `sourceLanguage` dans la réponse API), iOS ThemedMessageBubble (icône translate + drapeaux toujours visibles, même sans traduction existante), iOS ConversationViewModel (robustesse du preferred translation). Aucun changement de modèle de données.

**Tech Stack:** TypeScript (gateway), Swift/SwiftUI (iOS), Prisma MongoDB, Socket.IO

---

## Fichiers impactés

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Modify | `services/gateway/src/utils/translation-transformer.ts` | Ajouter `sourceLanguage` dans la réponse API |
| Modify | `services/gateway/src/services/message-translation/MessageTranslationService.ts` | Invalider cache langues sur changement participants |
| Modify | `services/gateway/src/socketio/handlers/MessageHandler.ts` | Invalider cache lors de join/leave |
| Modify | `packages/shared/types/message-types.ts` | Ajouter `sourceLanguage` au type `MessageTranslation` |
| Modify | `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` | Icône translate + drapeaux toujours visibles |
| Modify | `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Robustesse preferredTranslation |
| Test | `services/gateway/src/__tests__/unit/translation-transformer.test.ts` | Tests transformer |
| Test | `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` | Tests preferredTranslation |

---

### Task 1: Gateway — Ajouter `sourceLanguage` à la réponse API traductions

Le transformer omet `sourceLanguage`, ce qui force l'iOS à deviner. Le message original stocke la langue source dans `Message.originalLanguage` mais elle n'est pas incluse dans chaque traduction retournée.

**Files:**
- Modify: `packages/shared/types/message-types.ts:29-46`
- Modify: `services/gateway/src/utils/translation-transformer.ts:37-57`

- [ ] **Step 1: Ajouter `sourceLanguage` au type shared `MessageTranslation`**

In `packages/shared/types/message-types.ts`, ajouter le champ :

```typescript
export interface MessageTranslation {
  readonly id: string;
  readonly messageId: string;
  readonly sourceLanguage?: string;  // ADD THIS LINE
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: TranslationModel;
  readonly confidenceScore?: number;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  // ... rest unchanged
}
```

- [ ] **Step 2: Mettre à jour `transformTranslationsToArray` pour inclure `sourceLanguage`**

In `services/gateway/src/utils/translation-transformer.ts`, modifier la signature et le retour :

```typescript
export function transformTranslationsToArray(
  messageId: string,
  translationsJson: Record<string, MessageTranslationJSON> | null | undefined,
  sourceLanguage?: string
): MessageTranslation[] {
  if (!translationsJson) return [];

  return Object.entries(translationsJson).map(([lang, data]) => ({
    id: `${messageId}-${lang}`,
    messageId,
    sourceLanguage: sourceLanguage || undefined,
    targetLanguage: lang,
    translatedContent: data.text,
    translationModel: data.translationModel,
    confidenceScore: data.confidenceScore,
    isEncrypted: data.isEncrypted || false,
    encryptionKeyId: data.encryptionKeyId || undefined,
    encryptionIv: data.encryptionIv || undefined,
    encryptionAuthTag: data.encryptionAuthTag || undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  }));
}
```

- [ ] **Step 3: Mettre à jour les call sites pour passer `sourceLanguage`**

In `services/gateway/src/routes/conversations/messages.ts`, trouver les appels à `transformTranslationsToArray` (lignes ~907 et ~2149) et ajouter le 3ème argument :

```typescript
// Line ~907
mappedMessage.translations = transformTranslationsToArray(
  message.id,
  message.translations as Record<string, any>,
  message.originalLanguage  // ADD THIS
);

// Line ~2149
? transformTranslationsToArray(msg.id, msg.translations as Record<string, any>, msg.originalLanguage)
```

In `services/gateway/src/socketio/MeeshySocketIOManager.ts` (line ~1054), même ajout :

```typescript
return transformTranslationsToArray(
  message.id,
  message.translations as Record<string, any>,
  message.originalLanguage  // ADD THIS
);
```

In `services/gateway/src/routes/messages.ts` (line ~785) :

```typescript
translations: transformTranslationsToArray(
  msg.id,
  msg.translations as Record<string, any>,
  msg.originalLanguage  // ADD THIS
),
```

In `services/gateway/src/routes/links/utils/message-formatters.ts` (lines ~45 and ~90), même ajout avec `message.originalLanguage`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/types/message-types.ts services/gateway/src/utils/translation-transformer.ts services/gateway/src/routes/conversations/messages.ts services/gateway/src/socketio/MeeshySocketIOManager.ts services/gateway/src/routes/messages.ts services/gateway/src/routes/links/utils/message-formatters.ts
git commit -m "feat(gateway): include sourceLanguage in translation API response"
```

---

### Task 2: Gateway — Invalider le cache langues lors de changements de participants

Le cache langues (TTL 5min) ne s'invalide pas quand un participant rejoint ou quitte. Résultat : les traductions ne ciblent pas les bonnes langues.

**Files:**
- Modify: `services/gateway/src/services/message-translation/MessageTranslationService.ts:600-690`

- [ ] **Step 1: Exposer une méthode publique `invalidateLanguageCache`**

Ajouter après le constructeur de `MessageTranslationService` (vers ligne ~80) :

```typescript
/**
 * Invalide le cache de langues pour une conversation.
 * À appeler quand les participants changent (join, leave, language update).
 */
public invalidateLanguageCache(conversationId: string): void {
  this.languageCache.delete(conversationId);
  logger.info(`🗑️ [LANG-CACHE] Invalidated language cache for conversation ${conversationId}`);
}
```

- [ ] **Step 2: Vérifier que `LanguageCache` a une méthode `delete`**

Le `LanguageCache` est un simple Map avec TTL. Vérifier qu'il expose `delete`. Si c'est un `Map<string, { value: string[], expiry: number }>`, `delete` existe nativement. Sinon, chercher la classe et ajouter la méthode.

- [ ] **Step 3: Appeler l'invalidation dans les handlers Socket.IO pertinents**

In `services/gateway/src/socketio/MeeshySocketIOManager.ts`, chercher les endroits où un participant rejoint/quitte (événements `conversation:join`, `conversation:leave`, `participant:added`, `participant:removed`) et ajouter :

```typescript
// Après tout changement de participant dans une conversation
(this.server as any).translationService?.invalidateLanguageCache(conversationId);
```

Alternativement, si le `translationService` est accessible comme décorateur Fastify, utiliser l'EventEmitter du service de traduction.

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/services/message-translation/MessageTranslationService.ts services/gateway/src/socketio/MeeshySocketIOManager.ts
git commit -m "fix(gateway): invalidate language cache on participant changes"
```

---

### Task 3: iOS — Icône translate TOUJOURS visible

Actuellement, l'icône translate et les drapeaux n'apparaissent que si `hasAnyTranslation` est true (= des traductions existent déjà). Le changement : montrer l'icône translate sur TOUS les messages non-emoji où la langue originale diffère d'une des langues préférées de l'utilisateur, même sans traduction existante.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift:76,420,430-449,865-891`

- [ ] **Step 1: Ajouter une computed property `shouldShowTranslationUI`**

Remplacer la logique `showTranslation` (ligne 420) par une property plus complète. Ajouter après `hasAnyTranslation` (ligne 76) :

```swift
private var shouldShowTranslationUI: Bool {
    guard !isEmojiOnly else { return false }
    if hasAnyTranslation { return true }
    // Montrer l'icône même sans traduction si la langue originale
    // diffère des langues préférées de l'utilisateur
    let orig = message.originalLanguage.lowercased()
    guard !orig.isEmpty else { return false }
    let user = AuthManager.shared.currentUser
    let preferred = [
        user?.systemLanguage?.lowercased(),
        user?.regionalLanguage?.lowercased()
    ].compactMap { $0 }
    guard !preferred.isEmpty else { return false }
    return !preferred.contains(orig)
}
```

- [ ] **Step 2: Remplacer `showTranslation` par `shouldShowTranslationUI` dans `identityBarSection`**

Ligne 420, remplacer :

```swift
// AVANT
let showTranslation = hasAnyTranslation && !isEmojiOnly

// APRÈS
let showTranslation = shouldShowTranslationUI
```

Le reste du code (lignes 430-451) utilise déjà `showTranslation`, donc il bénéficiera automatiquement.

- [ ] **Step 3: Mettre à jour `buildAvailableFlags` pour montrer les drapeaux même sans traduction**

Modifier `buildAvailableFlags()` pour toujours inclure les langues préférées de l'utilisateur, avec ou sans traduction disponible :

```swift
private func buildAvailableFlags() -> [String] {
    let activeLang = currentDisplayLangCode.lowercased()
    let origLower = message.originalLanguage.lowercased()
    let user = AuthManager.shared.currentUser

    var all: [String] = [origLower]
    var seen: Set<String> = [origLower]

    // Toujours ajouter la langue système (même sans traduction dispo)
    if let sys = user?.systemLanguage?.lowercased(), !seen.contains(sys) {
        all.append(sys); seen.insert(sys)
    }

    // Ajouter la traduction préférée si différente de systemLanguage
    if let pc = preferredTranslation?.targetLanguage.lowercased(), !seen.contains(pc) {
        all.append(pc); seen.insert(pc)
    }

    // Ajouter les langues avec traductions existantes
    if let reg = user?.regionalLanguage?.lowercased(), !seen.contains(reg) {
        all.append(reg); seen.insert(reg)
    }

    if let custom = user?.customDestinationLanguage?.lowercased(), !seen.contains(custom) {
        let hasIt = textTranslations.contains(where: { $0.targetLanguage.lowercased() == custom })
            || translatedAudios.contains(where: { $0.targetLanguage.lowercased() == custom })
        if hasIt {
            all.append(custom); seen.insert(custom)
        }
    }

    return all.filter { $0 != activeLang }
}
```

- [ ] **Step 4: Mettre à jour `handleFlagTap` pour demander les traductions manquantes**

`handleFlagTap` demande déjà une traduction quand `hasContent` est false (ligne 897-899). Pas de changement nécessaire ici — le code existant gère correctement le cas "tap sur un drapeau sans traduction".

- [ ] **Step 5: Vérifier visuellement**

```bash
./apps/ios/meeshy.sh build
```

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift
git commit -m "feat(ios): show translate icon and flags on all non-native messages"
```

---

### Task 4: iOS — Robustesse de `preferredTranslation` et extraction

Le `preferredTranslation` peut retourner nil quand les langues préférées sont vides (currentUser nil) ou quand `sourceLanguage` est absent.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1669-1751`

- [ ] **Step 1: Utiliser `sourceLanguage` de la traduction dans `extractTextTranslations`**

Ligne ~1677, le code fait déjà un fallback. S'assurer que `APITextTranslation.sourceLanguage` est bien mappé depuis la réponse API. Vérifier dans le SDK :

```swift
// Dans ConversationViewModel.swift, extractTextTranslations
// Ligne ~1677 — déjà correct :
sourceLanguage: t.sourceLanguage ?? msg.originalLanguage ?? "auto",
```

Ceci fonctionnera maintenant que le gateway retourne `sourceLanguage` (Task 1).

- [ ] **Step 2: Ajouter un guard sur `preferredLanguages` vide**

Dans `preferredTranslation(for:)` (ligne ~1731), ajouter un guard pour le cas où les langues préférées sont vides :

```swift
func preferredTranslation(for messageId: String) -> MessageTranslation? {
    // Check overrides first
    if let overrideEntry = activeTranslationOverrides[messageId] {
        return overrideEntry
    }

    guard let translations = messageTranslations[messageId], !translations.isEmpty else { return nil }

    let originalLang = messageIndex(for: messageId)
        .map { messages[$0].originalLanguage.lowercased() }

    let preferred = preferredLanguages
    // AJOUT : si aucune langue préférée, retourner la première traduction disponible
    guard !preferred.isEmpty else {
        return translations.first
    }

    for lang in preferred {
        let langLower = lang.lowercased()
        if let orig = originalLang, orig == langLower { return nil }
        if let match = translations.first(where: { $0.targetLanguage.lowercased() == langLower }) {
            return match
        }
    }
    return nil
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "fix(ios): improve preferredTranslation robustness with empty languages fallback"
```

---

### Task 5: iOS — Compiler et vérifier

**Files:**
- All modified iOS files

- [ ] **Step 1: Build complet**

```bash
./apps/ios/meeshy.sh build
```

Expected: BUILD SUCCEEDED

- [ ] **Step 2: Lancer les tests existants**

```bash
cd apps/ios && xcodebuild test -scheme MeeshyTests -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyTests/ConversationViewModelTests -quiet
```

Expected: All tests pass

- [ ] **Step 3: Commit final si corrections nécessaires**

```bash
git add -A
git commit -m "fix(ios): resolve compilation issues from prisme linguistique changes"
```

---

### Task 6: Déploiement et vérification

- [ ] **Step 1: Push et sync branches**

```bash
git push origin dev
git checkout main && git merge dev --no-edit && git push origin main && git checkout dev
```

- [ ] **Step 2: Vérifier l'API retourne `sourceLanguage`**

```bash
TOKEN=$(curl -s -X POST https://gate.meeshy.me/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"atabeth","password":"..."}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -s "https://gate.meeshy.me/api/v1/conversations/68f2a81417a557e8ce4ddfbb/messages?limit=1" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; msgs=json.load(sys.stdin)['data']; t=msgs[0].get('translations',[]); print([{k: v for k,v in x.items() if k in ('targetLanguage','sourceLanguage')} for x in t[:3]])"
```

Expected: Chaque traduction inclut `sourceLanguage`
