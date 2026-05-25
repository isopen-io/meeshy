# Audio instant render + tailles de fichier sur attachments — Design

**Date :** 2026-05-25
**Status :** Approved (design phase)
**Scope :** iOS + Gateway (no web changes)

## Intention produit

Quand l'utilisateur ouvre une conversation, **tout le contenu d'un message audio est présent au premier render** — exactement comme les réactions, réponses citées et messages épinglés le sont déjà.

Concrètement, sur un bubble audio :
- La **transcription** dans la langue d'origine apparaît immédiatement sous le scrubber (déjà câblé visuellement, mais ~1s de pop-in aujourd'hui).
- Les **traductions audio** disponibles (autres langues, TTS re-synthétisé via Chatterbox) sont signalées immédiatement (badge langue) — pas après un délai.
- Quand l'attachment n'est pas encore téléchargé localement **et que `MediaDownloadPreferences` bloque l'auto-DL**, l'utilisateur voit la **flèche de téléchargement + la taille** (ex. « 850 KB · 0:42 ») — cohérence visuelle avec la vidéo, qui le fait déjà.

Le même critère « afficher la taille avant DL » s'applique à l'image : à vérifier et corriger si non-conforme.

## Diagnostic (root cause)

Trois brèches identifiées par exploration du code (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`, `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, `services/gateway/src/sockets/MeeshySocketIOManager.ts`).

### Brèche 1 — Race d'hydratation iOS (cause principale du pop-in 1s)

`ConversationViewModel.loadMessages()` publie d'abord les messages, **puis** hydrate les dictionnaires de métadonnées audio :

```swift
// ConversationViewModel.swift:1024-1030 (actuel)
await messageStore.loadInitial()        // ← publish messages, MainActor cède
hydrateMetadataFromGRDB()                // ← peuple messageTranscriptions / messageTranslatedAudios
// SwiftUI rend déjà entre les deux → bulles audio nues pendant ~1s
```

Le commentaire de code reconnaît explicitement le problème : « Sinon le MainActor cède pendant l'await et SwiftUI rend les bulles audio SANS transcription, puis re-rend ».

### Brèche 2 — Payload socket `message:new` incomplet

Le broadcast socket émet `(message as any).attachments` sans garantir que `transcription` et `translations` sont peuplés. Selon le chemin (POST REST, handler socket, worker async de transcription/TTS), la query Prisma sous-jacente n'utilise pas toujours un select équivalent à `attachmentMediaSelect` (qui inclut transcription/translations) — alors que la route REST `GET /conversations/:id/messages` est, elle, complète.

Résultat : un audio reçu en temps réel via socket arrive « nu », enrichi par un fetch ultérieur.

### Brèche 3 — Pas de badge taille pour audio (et à confirmer pour image)

- **Vidéo :** `DownloadBadgeView` (`apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`) affiche déjà `attachment.fileSize` formaté + flèche DL avant téléchargement. ✅
- **Image :** réutilise théoriquement `DownloadBadgeView` via `BubbleAttachmentView` — à vérifier visuellement.
- **Audio :** aucun affichage de taille avant DL. ❌ Manquant.

## Approche retenue : (A) Fix chirurgical par couche

Deux alternatives écartées :

- **(B) Refactor source unique** : `MessageStore.loadInitial()` retourne messages + metadata dans un seul snapshot publié, supprime les dictionnaires séparés du ViewModel. Plus propre par construction, mais touche l'API du store et oblige à migrer tous les call sites — disproportionné pour un fix de pop-in.
- **(C) Skeleton transcription** : placeholder grisé pendant le délai. Cosmétique, ne résout rien et ajoute du bruit.

L'approche (A) corrige les 3 brèches au plus près de leur point d'origine, sans introduire de refactor latéral.

## Spec par brèche

### Fix 1 — Hydratation atomique iOS (sous-option A1)

**Sous-option choisie :** A1 (hydratation atomique synchrone). La sous-option A2 (lecture directe depuis `attachment.transcription` + suppression des dictionnaires du ViewModel) est déférée à un sprint suivant, après stabilisation de A1 et cartographie complète des consommateurs des dictionnaires.

**Constat structurel** : `transcription` et `audioTranslations` vivent déjà dans `message.attachments[i]` (`EmbeddedTranscription`, `EmbeddedAudioTranslation`). Les dictionnaires `messageTranscriptions` / `messageTranslatedAudios` du ViewModel sont une **dérivation** (Prisme appliqué + résolution langue), pas une source indépendante. La race vient du fait qu'ils sont peuplés séparément des `messages`.

**Modification** : `MessageStore` expose une variante qui retourne `(messages, transcriptionsMap, translatedAudiosMap)` en un seul yield. Le ViewModel les pose en un seul `MainActor.run` sans `await` intermédiaire.

```swift
let snapshot = await messageStore.loadInitialSnapshot()
await MainActor.run {
    self.messages                = snapshot.messages
    self.messageTranscriptions   = snapshot.transcriptions
    self.messageTranslatedAudios = snapshot.translatedAudios
}
```

**Chemins concernés (même règle atomique partout) :**

- `loadMessages()` (ouverture conv, fresh + stale + expired)
- `refreshMessagesFromAPI()` (REST round-trip) — bundle metadata avec messages avant publish
- Réception socket `message:new` — calculer les entrées metadata du message AVANT d'append dans le store
- Réception socket `message:attachment-updated` (cf. Fix 2) — atomique aussi

**Suppression** : le commentaire `ConversationViewModel.swift:1025-1029` qui justifiait le bug est retiré.

### Fix 2 — Sérialisation socket centralisée (gateway)

**Création** : un module unique `services/gateway/src/sockets/serializeMessageForSocket.ts` :

```ts
export function serializeMessageForSocket(message: PrismaMessage): SocketMessageEvent {
  return {
    ...basePayload(message),
    attachments: message.attachments.map(serializeAttachmentForSocket),
    // ↑ inclut transcription, translations, fileSize, durationMs, codec, etc.
  }
}
```

`serializeAttachmentForSocket` applique exactement le même mapping que `attachmentMediaSelect` côté REST (`services/gateway/src/services/attachments/attachmentIncludes.ts`) → **parité socket/REST garantie**.

**Adoption** : tous les call sites qui broadcastent un message passent par ce sérialiseur :

| Event socket | Trigger | Inclusion transcription/translations |
|---|---|---|
| `message:new` | POST REST + handler socket `message:send-with-attachments` | ✅ obligatoire |
| `message:updated` | Edit, react, pin | ✅ si l'attachment a été touché |
| `message:attachment-updated` (nouveau — voir ci-dessous) | Worker Whisper / TTS / NLLB fini | ✅ obligatoire |

**Si la query Prisma préalable** n'inclut pas les attachments avec leurs JSON (`transcription`, `translations`), re-query avec `include: { attachments: attachmentMediaSelect }` avant de sérialiser. Pas de cast `as any` autorisé.

### Fix 2bis — Event générique `message:attachment-updated`

**Décision** : un seul event générique remplace les events spécialisés potentiels (`audio-transcribed`, `audio-translated`).

**Payload** :

```ts
type AttachmentUpdatedEvent = {
  conversationId: string
  messageId: string
  attachment: SocketAttachment   // ← attachment COMPLET post-enrichissement
}
```

Émis chaque fois qu'un enrichissement async d'un attachment est terminé :
- Whisper transcribe fini → `attachment.transcription` peuplé
- NLLB+Chatterbox TTS pour une langue fini → `attachment.translations[lang]` peuplé (peut être émis plusieurs fois si plusieurs langues)

**iOS handler** : remplace l'attachment correspondant dans le store + recompute les dictionnaires metadata du message touché, en un seul `MainActor.run` (même règle d'atomicité que Fix 1).

**Source de vérité du contrat** : `packages/shared/types/socketio-events.ts` (ajout du type + nom d'event en hyphens, cf. convention `entity:action-word`).

### Fix 3 — Audio download gate

**Création** : un sous-composant `AudioDownloadGate` dans `packages/MeeshySDK/Sources/MeeshyUI/Media/`.

**Comportement de `AudioPlayerView`** : au mount, appelle `MediaDownloadPreferences.shouldAutoDownload(attachment, network)`. Si bloqué **et** attachment pas encore en cache local → rend `AudioDownloadGate` à la place du player normal. Sinon → rend le player actuel inchangé.

**Layout du gate** :

```
┌────────────────────────────────────────────┐
│  [⬇]   850 KB · 0:42         [tap to DL]   │
└────────────────────────────────────────────┘
```

- Icône `arrow.down.to.line` (parité visuelle avec `DownloadBadgeView.compactIdleBadge`)
- Taille via `AttachmentDownloader.fmt(Int64(attachment.fileSize))`
- Durée à droite via `attachment.duration` formatée
- Tap → délègue à `AttachmentDownloader` (même API que la vidéo)
- Pendant DL : progress bar in-place, label « 410 KB / 850 KB »
- Au DL terminé : swap automatique vers `AudioPlayerView` normal (binding cache)

**Recompute** : un `onChange(of: networkMonitor.isOnline)` et `onChange(of: preferences.audioPolicy)` ré-évaluent la décision (utilisateur passe en wifi, change ses préférences → le gate disparaît au profit de l'auto-DL).

**Couleurs** : `accentColor` de la conversation, comme les autres composants media.

### Fix 4 — Image : vérification + harmonisation

**Avant tout fix** : QA visuelle d'un bubble image dans une conv où `MediaDownloadPreferences.image` bloque l'auto-DL.

- **Si** `DownloadBadgeView` affiche déjà fileSize + flèche → rien à faire, documenter dans `apps/ios/CLAUDE.md` (section media).
- **Sinon** : ajouter le rendu de `attachment.fileSize` dans `centredIdleBadge` (1-liner — la valeur est déjà disponible dans `attachment.fileSize`).

## Modèles et fichiers touchés

### iOS

| Fichier | Modification |
|---|---|
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | Hydratation atomique (Fix 1) — 4 chemins (initial, refresh, socket new, socket attachment-updated) |
| `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift` (ou équivalent) | Nouvelle API `loadInitialSnapshot()` retournant `(messages, transcriptions, translatedAudios)` |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift` | Aucune modification fonctionnelle ; injecte `MediaDownloadPreferences` si pas déjà fait |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | Branche conditionnelle vers `AudioDownloadGate` selon politique DL |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioDownloadGate.swift` | **Nouveau** — composant gate compact |
| `packages/MeeshySDK/Sources/MeeshySDK/Sockets/` | Handler `message:attachment-updated` |
| `apps/ios/Meeshy/Meeshy.xcodeproj/project.pbxproj` | Entrée pour le nouveau fichier (rappel : objectVersion 63, classic pbxproj) |

### Gateway

| Fichier | Modification |
|---|---|
| `services/gateway/src/sockets/serializeMessageForSocket.ts` | **Nouveau** — sérialiseur centralisé |
| `services/gateway/src/sockets/MeeshySocketIOManager.ts` | Tous les `emit` de messages passent par le sérialiseur |
| `services/gateway/src/routes/messages.ts` | Émission de `message:attachment-updated` après upload + post-enrichissements workers |
| `services/gateway/src/services/attachments/attachmentIncludes.ts` | Aucune modification (déjà bon) |

### Shared

| Fichier | Modification |
|---|---|
| `packages/shared/types/socketio-events.ts` | Ajout `message:attachment-updated` + type `AttachmentUpdatedEvent` |

## Tests (TDD strict)

### Gateway

- `serializeMessageForSocket.test.ts` — message audio avec transcription + 2 translations → payload contient les deux champs non-undefined.
- `MeeshySocketIOManager.integration.test.ts` — POST `/messages` avec attachment audio → assertion que le `message:new` broadcasté inclut transcription/translations.
- `attachment-updated.integration.test.ts` — simulation worker Whisper fini → émission `message:attachment-updated` avec attachment complet.

### iOS — XCTest (`MeeshyTests`)

- `ConversationViewModelTests.test_loadInitial_publishesMessagesAndMetadataAtomically`
  Utilise un `MockMessageStore` qui retourne un snapshot avec messages + metadata. Vérifie qu'il n'existe aucun frame intermédiaire où `messages` est peuplé mais `messageTranscriptions` est vide.
- `ConversationViewModelTests.test_socketAttachmentUpdated_appliesAtomically`
  Mock socket → `message:attachment-updated` reçu → vérifie que message + metadata sont mis à jour dans le même `MainActor.run`.
- `BubbleAttachmentViewTests.test_audio_gateAppears_whenAutoDownloadBlocked`
  Mock `MediaDownloadPreferences` qui retourne `shouldAutoDownload = false` → vérifie présence du gate, affichage de fileSize, absence du player.
- `BubbleAttachmentViewTests.test_audio_playerAppears_whenAutoDownloadAllowed`
  Inverse du précédent.

### iOS — Swift Testing (`MeeshySDKTests`)

- `AudioDownloadGateTests.test_formatsFileSizeCorrectly`
- `AudioDownloadGateTests.test_progressUpdatesDuringDownload`
- `AudioDownloadGateTests.test_swapsToPlayerOnCompletion`

### Snapshots (Image)

- Nouvelle baseline : `AudioPlayerView_gate_state` (light + dark, fr + en).
- Vérification existante : `ImageBubble_idle_with_size` (créer si absente).

## Critères d'acceptation

1. Ouvrir une conversation contenant ≥ 1 message audio avec transcription + traductions : **aucun pop-in visible**. Les badges/textes sont là dès la première frame.
2. Recevoir un audio en temps réel via socket dans une conv déjà ouverte : transcription + indicateurs traduction présents dès l'apparition du bubble (cas où la transcription est déjà finalisée).
3. Recevoir un audio dont la transcription est en cours : bubble apparaît immédiatement (sans transcription, comme aujourd'hui), puis l'event `message:attachment-updated` enrichit le bubble en place — sans flash, sans saut visuel.
4. Couper l'auto-DL audio dans les préférences → tout bubble audio nouvellement ouvert montre `[⬇] 850 KB · 0:42`. Tap → DL progress → swap vers player. Aucune action ne déclenche un téléchargement non sollicité.
5. Bubble image avec auto-DL bloqué : affiche taille + flèche (parité vidéo). Documentation `apps/ios/CLAUDE.md` mise à jour.
6. Tous les tests (iOS + gateway) passent. `./apps/ios/meeshy.sh build` vert.

## Risques

| Risque | Mitigation |
|---|---|
| Le `MessageStore.loadInitialSnapshot()` casse des consommateurs existants de `loadInitial()` | Garder `loadInitial()` en place, ajouter `loadInitialSnapshot()` à côté. Migration progressive. |
| Les workers async (Whisper, TTS) émettent déjà des events ad-hoc qu'on duplique avec `message:attachment-updated` | Audit avant impl. Si events existants → on les remplace, pas on les double. Spec à valider en début d'implémentation. |
| iOS receive `message:attachment-updated` pour un message pas en cache local (conv pas chargée) | Handler no-op si message absent du store. Re-fetch déclenché à l'ouverture suivante de la conv. |
| `AudioDownloadGate` casse l'isolation Swift 6 sous `MeeshyUI/` defaultIsolation(MainActor) | Suivre le pattern documenté (`feedback_meeshyui_default_isolation`) — split Equatable extensions, nonisolated sur la pure logic. |
| Snapshot baselines audio cassent en CI | Re-record local avant push (cf. `feedback_running_ios_test_suites`). |

## Hors scope

- Composer-side (afficher transcription locale Whisper on-device avant envoi). Reporté.
- Refactor A2 (suppression des dictionnaires `messageTranscriptions` / `messageTranslatedAudios` au profit de la lecture directe depuis `attachment.*`). Reporté post-A1.
- Web (`apps/web`). Pas concerné par cette spec.
- Stories audio. Couvert par d'autres specs (`2026-05-20-stories-audio-hotfix-design.md`).

## Déploiement

- iOS : build standard via `./apps/ios/meeshy.sh build` puis QA simulateur (compte `atabeth`).
- Gateway : pas de migration DB. Hot reload local tmux window 1, puis push image → `docker compose up -d gateway` en prod.
- Le gateway peut shipper avant l'iOS sans casser quoi que ce soit (event `message:attachment-updated` ignoré par les vieux clients — pas de régression).
- L'iOS peut shipper avant le gateway sans casser (handler `message:attachment-updated` jamais déclenché, mais le fix iOS d'hydratation atomique fonctionne déjà sur le payload REST existant).
