# Story composer — sélection de langue per-asset & propagation traduction (2026-05-26)

**Status** : Design v3 — corrections post-review externe intégrées + découverte que la moitié du pipeline backend existe déjà. Prêt pour writing-plans.
**Branche cible** : `feat/story-composer-language-selection`.
**Révisions** : v1 → v2 (audit réutilisation maximale) → v3 (corrections post-review experts seniors + audit code réel).

## Surface modifiée

| Fichier | Type d'intervention |
|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ComposerLanguagePill.swift` | **NOUVEAU** (extraction de `UniversalComposerBar.languageSelectorPill`) |
| `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift` | MODIF (remplace `languageSelectorPill` privée par appel `ComposerLanguagePill`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | MODIF (ajout 3 `@Published` + binding `TextAnalyzer`, `lockedLanguage` côté VM) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Language.swift` | **NOUVEAU** (extension méthodes, pattern `+TextEditing`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | MODIF (insertion `ComposerLanguagePill` + split condition masquage avec audit `activeTool`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift` | MODIF (wiring `adopt/update` + reset `textAnalyzer` au commit, pattern `UniversalComposerBar:863`) |
| `apps/ios/Meeshy/.../StoryAudioRecorderView.swift` (localisé au Spike) | MODIF (binding au `viewModel.lockedLanguage`) |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | MODIF (généralisation `resolveTranslation` en fonction libre `resolvePrismeTranslation<T>` SANS protocol vide) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Views/BubbleTranslatedIndicator.swift` | **NOUVEAU** (calque `BubbleEditedIndicator`) |
| Story reader view (localisé au Spike) | MODIF (appel résolveur + indicateur + sink `SocialSocketManager.storyTranslationUpdated` existant) |
| `services/gateway/src/routes/posts/core.ts` (ou `PostService.ts`) | MODIF (déclencheur `zmqClient.sendStoryTextObjectRequest` pour chaque text object, fire-and-forget) |
| `services/translator/src/services/zmq_*_handler.py` | MODIF (~3-5 lignes : force `source_language` Whisper + normalisation ISO 639-1) |
| `apps/ios/Meeshy/.../LanguageOption.swift` ou `MeeshyUI/Primitives/LanguageOption.swift` | DÉPRÉCATION (alias vers `TranslationLanguage`, unification progressive) |

**Nouveaux fichiers : 3.** Aucun nouveau modèle Prisma, aucun nouveau service backend, aucun nouvel event Socket.IO, aucun nouveau handler ZMQ, aucun protocol vide.

## Contexte

Aujourd'hui dans le composer story iOS :
- Chaque text/audio reçoit silencieusement `sourceLanguage = user.systemLanguage` via `StoryComposerViewModel.resolveComposerSourceLanguage(user:)`
- **Aucune UI ne permet à l'auteur de choisir/modifier la langue**
- **Côté backend, le pipeline de traduction des text objects de story est DÉJÀ implémenté** : `StoryTextObjectTranslationService`, `ZmqRequestSender.sendStoryTextObjectRequest`, persistance atomique `$runCommandRaw`, broadcast `STORY_TRANSLATION_UPDATED`, tests intégration `core.story-translation.test.ts` — mais le **déclencheur depuis le POST /posts manque** (test `should not double-translate` ligne 232 confirme : "StoryTextObjectTranslationService is NOT invoked from the HTTP route — only from ZMQ")
- Pour l'audio : `PostAudioService` route déjà les transcriptions/traductions audio story via `MessageTranslationService:857-865` (`data.postId && data.postMediaId && data.translatedAudios.length > 0`) — la persistance est déjà branchée sur `PostMedia.translations`
- iOS SDK : `SocketStoryTranslationUpdatedData` + `SocialSocketManager.storyTranslationUpdated: PassthroughSubject<...>` existent et sont testés — il manque juste la consommation côté lecteur

Cette spec :
1. Réutilise/extrait le picker langue existant pour la toolbar story
2. Propage la langue active à chaque asset créé (text + audio) avec `lockedLanguage` géré côté VM
3. Force Whisper côté translator (normalisation ISO 639-1 strict)
4. Branche le déclencheur backend manquant (`sendStoryTextObjectRequest` au POST /posts)
5. Affiche les traductions selon le Prisme côté lecteur + sink realtime du `storyTranslationUpdated` existant + indicateur "🔁 traduit"

**Décisions cristallisées (brainstorming)** : per-asset, top-5 langues (`en,fr,es,de,pt`), toggle inline toolbar + détection auto via `TextAnalyzer` réutilisé, choix langue audio AVANT enregistrement, toolbar reste visible pendant édition text, stockage pattern `MessageAttachment` (zéro nouveau modèle Prisma), service `PostTranslationService` étendu (dispatcher type-aware prêt pour moods).

## Principe directeur

**Réutilisation maximale, création minimale.** Toute nouveauté doit être justifiée par absence prouvée OU meilleure architecture/perf. Voir [[feedback_maximize_reuse_minimize_creation]].

## Corrections intégrées post-review experts (v2 → v3)

| Bug review | Fix v3 |
|---|---|
| 🔴 `AudioTranslateService.translateSync` n'accepte PAS `postMediaId` | **Abandonné l'idée d'appeler `translateSync`.** Le pipeline audio story EXISTE déjà via `PostAudioService` + `MessageTranslationService:857-865` qui route sur `postId+postMediaId`. Le déclenchement audio sera celui déjà en place lors de l'upload du media. À auditer Phase 0 : qui déclenche aujourd'hui le pipeline audio pour PostMedia stories. |
| 🟠 Race condition `Post.effects` read-modify-write | **Réutiliser `StoryTextObjectTranslationService` existant** qui utilise déjà `$runCommandRaw` + dot-notation atomique sur `storyEffects.textObjects.${index}.translations.${lang}`. Pas de nouvel update à écrire. |
| 🟠 Whisper ISO 639-1 vs `pt-BR`/`zh-Hant` | **Normalisation côté translator** : `source_language = (payload.get('sourceLanguage') or '').split('-')[0].lower()` + allow-list Whisper. Côté iOS : le `ComposerLanguagePill` n'expose en MVP que des codes 2-lettres (pas de variantes régionales) — voir Section 1. |
| 🟡 `translateSync` timeout 16min × N audios | Absorbé par fix #1 — pipeline audio asynchrone déjà en place. |
| 🔴 Type mismatch `LanguageOption` vs `TranslationLanguage` (3 types pour la même chose) | **Décision archi** : `ComposerLanguagePill` accepte un protocol minimal interne `LanguagePillItem { var code: String { get }; var displayCode: String { get }; var flag: String { get } }` avec conformances bridge pour `LanguageOption` (SDK + app) et `TranslationLanguage`. Migration vers `TranslationLanguage` SDK marquée comme tâche de fond (déprécier les deux `LanguageOption`). Pas de breaking change forcé. |
| 🟠 Swift 6 isolation contradiction tests | `_languageBindingSink` marquée explicitement `nonisolated`. Tests purs non-`@MainActor` avec assertions sur `await viewModel.activeLanguage` via `Task { @MainActor in }` quand nécessaire (pattern conforme [[feedback_meeshyui_default_isolation]]). |
| 🟠 `shouldHideBottomToolbar = false` régression palette expandée | **Audit `activeTool` au Spike** : si certains outils texte (color picker, font picker) occupent la bottom region, `shouldHideBottomToolbar` devient `activeTool?.requiresFullBottomSpace == true`. Le `ComposerLanguagePill` reste alors masqué pendant l'usage de ces outils mais réapparaît dès qu'on quitte l'outil. Le commentaire `// Si certains outils texte nécessitent l'espace bas...` est implémenté, pas laissé en TODO. |
| 🟠 `TranslationVariant` protocol vide | **Supprimé.** Fonction libre `func resolvePrismeTranslation<T>(translations: [String: T]?, sourceLanguage: String?, preferredLanguages: [String]) -> T?` sans contrainte. Plus simple, plus honnête. |
| 🟡 UX bloquée hors `quickStrip` 9 langues | **`LanguagePickerSheet` inclus dans MVP** via item "Autre…" en bas du menu (composant déjà existant dans `MeeshyUI/Primitives/`, juste à câbler). |

**Améliorations architecturales intégrées** :
- **Map de handlers** `postTypeHandlers` au lieu de if/else dans le dispatcher (extension O(1) future pour mood)
- **`lockedLanguage` déplacé du AudioRecorder `@State` vers le VM** (`@Published lockedLanguage: String?` — survit aux re-créations de la View)
- **Reset `textAnalyzer` au commit text** dans le composer story (pattern `UniversalComposerBar:863` confirmé)

## Inventaire — Composants existants réutilisés tels quels (v3 enrichi)

### Backend gateway — DÉJÀ EN PLACE

| Surface | Existant | Localisation | Verdict |
|---|---|---|---|
| **Handler ZMQ callback story text translation** | `StoryTextObjectTranslationService.handleTranslationCompleted` (persiste via `$runCommandRaw` atomique + broadcast `STORY_TRANSLATION_UPDATED`) | `services/gateway/src/services/posts/StoryTextObjectTranslationService.ts:46-117` | **Tel quel** ✅ |
| **Sender ZMQ story text translation** | `ZmqRequestSender.sendStoryTextObjectRequest({postId, textObjectIndex, text, sourceLanguage, targetLanguages})` | `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts:395` | **Tel quel** ✅ |
| **Type ZMQ `story_text_object_translation_completed`** | défini | `services/gateway/src/services/zmq-translation/types.ts:546` | **Tel quel** ✅ |
| **Routing ZMQ message → handler** | `case 'story_text_object_translation_completed'` | `services/gateway/src/services/zmq-translation/ZmqMessageHandler.ts:212` | **Tel quel** ✅ |
| **Event Socket.IO** | `STORY_TRANSLATION_UPDATED = 'story:translation-updated'` | `packages/shared/types/socketio-events.ts` | **Tel quel** ✅ |
| **Broadcast audience** | Author + viewers via `resolveBroadcastRecipients` (visibility-aware) | `StoryTextObjectTranslationService.ts:104-115` | **Tel quel** ✅ |
| **Sanitization lang code** | regex `^[a-z]{2,5}$` | `StoryTextObjectTranslationService.ts:80-83` | **Tel quel** ✅ |
| **Tests intégration** | `services/gateway/src/routes/posts/__tests__/core.story-translation.test.ts` (test ligne 232 atteste : "StoryTextObjectTranslationService is NOT invoked from the HTTP route — only from ZMQ") | idem | **Étendre** — nouveau test couvrant le déclencheur ajouté |
| **Pipeline audio story** | `MessageTranslationService:857-865` route `postId+postMediaId+translatedAudios` → écrit `PostMedia.translations[lang] = {type:'audio', transcription, path, url}` via `PostAudioService` | `services/gateway/src/services/message-translation/MessageTranslationService.ts:855-870` + `services/gateway/src/services/posts/PostAudioService.ts` | **Tel quel** — déjà branché ✅ |
| **Init des singletons** | `StoryTextObjectTranslationService.init()` + `PostAudioService.init()` dans `MeeshySocketIOManager:220-224` | idem | **Tel quel** ✅ |
| **Dispatch handler ZMQ** | `MeeshySocketIOManager:848-856` délègue à `StoryTextObjectTranslationService.shared.handleTranslationCompleted` | idem | **Tel quel** ✅ |

### Backend gateway — À AJOUTER

| Brèche | Action minimale |
|---|---|
| **Déclencheur sendStoryTextObjectRequest** depuis POST /posts | Après `Prisma.post.create`, fire-and-forget : `for (const [index, obj] of textObjects.entries()) { if (!obj.text?.trim() || !obj.sourceLanguage) continue; zmqClient.sendStoryTextObjectRequest({ postId, textObjectIndex: index, text: obj.text, sourceLanguage: obj.sourceLanguage, targetLanguages: TOP5.filter(l => l !== obj.sourceLanguage) }); }` |
| **Déclencheur audio story** | Audit Phase 0 : le pipeline audio story est-il déjà déclenché à l'upload media (via `PostService` ou route REST media) ? Si oui, vérifier propagation du `sourceLanguage` depuis le payload story vers le job ZMQ audio. Si non, brancher. |
| **Translator Whisper force** | `zmq_audio_handler.py` (ou équivalent voice_translate handler) — normaliser et accepter `sourceLanguage` |

### Backend translator

| Besoin | Existant | Verdict |
|---|---|---|
| Whisper transcription | `whisper.transcribe(audio, language=?)` | **Étendu (~3-5 lignes)** : accepte `sourceLanguage` normalisé ISO 639-1 strict |

### iOS SDK — DÉJÀ EN PLACE pour le realtime

| Surface | Existant | Localisation | Verdict |
|---|---|---|---|
| **Codable event payload** | `SocketStoryTranslationUpdatedData` | `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift:155` | **Tel quel** ✅ |
| **Publisher Combine** | `storyTranslationUpdated: PassthroughSubject<SocketStoryTranslationUpdatedData, Never>` | `SocialSocketManager.swift:268` | **Tel quel** ✅ |
| **Decoder + sink Socket.IO** | `decode(SocketStoryTranslationUpdatedData.self, ...)` ligne 924 | `SocialSocketManager.swift:924` | **Tel quel** ✅ |
| **Tests Codable** | `test_socketStoryTranslationUpdatedData_emptyTranslations`, `testSocketStoryTranslationUpdatedDataDecoding` (passants) | `MeeshySDKTests/Sockets/` | **Tel quel** ✅ |
| **Modèle `StoryTranslation`** | défini | `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:131` | **Tel quel** ✅ |
| **Mapper post→story translations** | `dict.map { lang, entry in StoryTranslation(language: lang, content: entry.text) }` | `StoryModels.swift:1603` | **Tel quel** ✅ |

### iOS — UI & helpers

| Besoin | Composant existant | Localisation | Verdict |
|---|---|---|---|
| Pill compact "drapeau + code + chevron + menu" | `UniversalComposerBar.languageSelectorPill` (private var) | `apps/ios/.../UniversalComposerBar.swift:702-745` | **Extraire** vers SDK Primitives |
| Sheet plein écran picker langue (NLLB 35+) | `LanguagePickerSheet` | `MeeshyUI/Primitives/LanguagePickerSheet.swift:117` | **Tel quel** — câblé sur item "Autre…" du menu (MVP) |
| Liste 9 langues fréquentes | `TranslationLanguage.quickStrip` | `MeeshyUI/Primitives/LanguagePickerSheet.swift:22-84` | **Tel quel** |
| Liste 35+ langues NLLB | `TranslationLanguage.all` | idem | **Tel quel** |
| `flag(code) → emoji` | `LanguageDisplay.from(code:)` + `LanguageData.info(for:)` | `MeeshyUI/Utilities/LanguageDisplay.swift` + `MeeshySDK/Models/LanguageData.swift` | **Tel quel** |
| Reset textAnalyzer pattern | `UniversalComposerBar:863` `textAnalyzer.reset()` après commit | idem | **Pattern reproduit** côté story |
| Détection langue NLLanguageRecognizer | `TextAnalyzer` (debounce 0.3s, lock 10 mots, seuil 86%) | `MeeshyUI/Utilities/TextAnalyzer.swift` | **Tel quel** (atome SDK) |
| Résolveur seuil 86% | `ComposerLanguageResolver.resolve()` + `confidenceFloor` | `apps/ios/.../ComposerModels.swift:140-168` | **Tel quel** |
| Langue par défaut user | `StoryComposerViewModel.resolveComposerSourceLanguage(user:)` static | `MeeshyUI/Story/StoryComposerViewModel.swift:267-281` | **Tel quel** |
| Pattern extension VM | `StoryComposerViewModel+TextEditing.swift` | `MeeshyUI/Story/` | **Pattern reproduit** |
| Pattern badge meta | `BubbleEditedIndicator`, `BubblePinnedIndicator` | `Features/Main/Views/Bubble/BubbleMetaBadges.swift` | **Pattern reproduit** (1 nouveau calqué) |
| Décision "ce contenu est traduit" | `BubbleStandardLayout.hasAnyTranslation` + `BubbleContent.Translation` | `BubbleStandardLayout.swift:184`, `BubbleContentBuilder.swift:76-100` | **Pattern reproduit** côté story |

### iOS — Modèles & résolution

| Besoin | Existant | Localisation | Verdict |
|---|---|---|---|
| Champ langue source per-asset | `StoryTextObject.sourceLanguage` + `StoryAudioPlayerObject.sourceLanguage` | `MeeshySDK/Models/StoryModels.swift:242, 693` | **Tel quel** |
| Map traductions text | `StoryTextObject.translations: [String: String]?` | `StoryModels.swift:241` | **Tel quel** |
| Résolveur Prisme `(translations, originalLanguage, preferredLanguages) → variant?` SANS fallback `.first` | `PostModels.swift:295` `private static func resolveTranslation(...)` (spécifique à un type) | `MeeshySDK/Models/PostModels.swift:295` | **Généraliser** en fonction libre `resolvePrismeTranslation<T>` (pas de protocol vide) |
| Pattern `TranslationResolver.preferredTranslation(for:)` | `apps/ios/.../Conversation/TranslationResolver.swift:26` | idem | **Tel quel** (s'appuiera sur résolveur généralisé) |

## Création — strictement justifiée

| Nouveau | Justification | Taille |
|---|---|---|
| `ComposerLanguagePill.swift` SDK Primitives | Extraction de `UniversalComposerBar.languageSelectorPill` pour réutilisation 2+ call sites. Archi : DRY, cohérence visuelle. Accepte un protocol bridge minimal pour absorber `LanguageOption` (SDK + app) ET `TranslationLanguage` sans breaking change. Inclut item "Autre…" → `LanguagePickerSheet`. | ~70 lignes |
| `StoryComposerViewModel+Language.swift` extension | Pattern d'extension VM déjà utilisé (`+TextEditing`). Pas de nouvelle classe. | ~60 lignes |
| `BubbleTranslatedIndicator.swift` (sous `Story/Views/`) | Calqué sur `BubbleEditedIndicator`. Scope ciblé story — pas de besoin cross-scope identifié. | ~15 lignes |
| Fonction libre `resolvePrismeTranslation<T>` dans `MeeshySDK/Models/` | Généralisation de l'existant `PostModels.resolveTranslation` privé spécifique. Fonction libre générique, **pas de protocol vide**. | ~15 lignes (refactor) |
| Déclencheur dans `services/gateway/src/routes/posts/core.ts` ou `PostService.ts` | Brèche identifiée par les tests existants (`core.story-translation.test.ts:232-254`). Quelques lignes. | ~15 lignes |
| Modif Translator `zmq_*_handler.py` | Normalisation + force language Whisper | ~5 lignes |

**0 nouveau modèle Prisma. 0 nouveau service backend. 0 nouvel event Socket.IO. 0 nouveau handler ZMQ. 0 nouveau Zod schema. 0 nouveau Codable iOS pour le realtime. 0 protocol vide.**

## Architecture cible

### Flow écriture (composer iOS → DB → traductions)

```
StoryComposerView
  ├─ @StateObject viewModel: StoryComposerViewModel  (étendu via +Language)
  │    ├─ @Published activeLanguage: String          (NOUVEAU)
  │    ├─ @Published languageOrigin: LanguageOrigin  (NOUVEAU)
  │    ├─ @Published lockedLanguage: String?         (NOUVEAU, dans le VM pas la View — survit re-création)
  │    ├─ textAnalyzer: TextAnalyzer                 (RÉUTILISE)
  │    ├─ updateLanguageFromText(_:)                 (utilise ComposerLanguageResolver)
  │    ├─ overrideLanguage(_:)                       (origin → .manual)
  │    ├─ adoptLanguageFromExistingAsset(_:)         (re-edit text object)
  │    ├─ resetTextAnalyzerOnCommit()                (pattern UniversalComposerBar:863)
  │    └─ lockLanguageForRecording() / unlock        (snapshot pour audio)
  │
  ├─ Toolbar story (split chirurgical)
  │    └─ ComposerLanguagePill(                      (EXTRAIT de UniversalComposerBar)
  │           currentCode: viewModel.activeLanguage,
  │           availableLanguages: TranslationLanguage.quickStrip + [.other],
  │           onSelect: viewModel.overrideLanguage,
  │           onTapOther: { showLanguagePickerSheet = true },   (LanguagePickerSheet existant)
  │           showAutoBadge: viewModel.languageOrigin == .auto,
  │           disabled: viewModel.lockedLanguage != nil)
  │
  ├─ StoryTextEditorView (existant)
  │    ├─ onAppear : viewModel.adoptLanguageFromExistingAsset(textObject.sourceLanguage)
  │    ├─ onChange(text) : viewModel.updateLanguageFromText(text)
  │    └─ onCommit : textObject.sourceLanguage = viewModel.activeLanguage
  │                 viewModel.resetTextAnalyzerOnCommit()  (réactive .auto pour le suivant)
  │
  └─ StoryAudioRecorderView (existant)
       ├─ Affiche "Enregistrement en 🇫🇷 FR" (depuis viewModel.lockedLanguage)
       ├─ startRecording : viewModel.lockLanguageForRecording()  (active aussi pill .disabled)
       └─ stopRecording  : audioObject.sourceLanguage = viewModel.lockedLanguage ?? viewModel.activeLanguage
                           media.transcription = ["language": locked]  (bootstrap Whisper)
                           viewModel.unlockLanguage()

POST /posts (validation Zod : sourceLanguage propagés)
  └─ Prisma create Post + PostMedia
  └─ sendSuccess() → 201
  └─ fire-and-forget Promise.allSettled :
        ├─ existant : translateContentRoot via PostTranslationService            (inchangé)
        ├─ NOUVEAU déclencheur : pour chaque textObject avec sourceLanguage :
        │    zmqClient.sendStoryTextObjectRequest({                              (sender EXISTANT)
        │       postId, textObjectIndex, text,
        │       sourceLanguage,
        │       targetLanguages: TOP5 \ sourceLanguage })
        │  ↓
        │  translator processes → ZMQ callback story_text_object_translation_completed
        │  ↓
        │  StoryTextObjectTranslationService.handleTranslationCompleted          (handler EXISTANT)
        │  ├─ persiste via $runCommandRaw atomique                               (EXISTANT)
        │  └─ broadcast STORY_TRANSLATION_UPDATED                                (EXISTANT)
        │
        └─ audio : pipeline EXISTANT
             ├─ trigger déjà en place via PostAudioService (déclenché par upload media OU par route)
             ├─ ZMQ callback MessageTranslationService:857 route via postId+postMediaId
             ├─ écrit PostMedia.translations[lang] = {type:'audio', transcription, path, url}
             └─ broadcast existant (à confirmer Phase 0 quel event)
        + AJOUT : propagation du sourceLanguage forcé via le payload story
                  (au moment où le pipeline audio est déclenché)
```

### Flow lecture (DB → iOS Prisme + realtime patch)

```
GET /posts (audit Phase 0 — select Prisma doit inclure storyEffects + PostMedia.translations)
  └─ iOS StoryReaderViewModel résout per-asset

iOS StoryReaderViewModel
  ├─ Pour chaque text object :
  │     resolvePrismeTranslation(textObject.translations, sourceLanguage, preferredContentLanguages)
  │       → text dans preferredContentLanguages OU nil → afficher original
  │
  ├─ Pour chaque audio asset :
  │     resolvePrismeTranslation(media.translations, sourceLanguage, preferredContentLanguages)
  │       → variant URL audio TTS dans la langue souhaitée OU nil → original
  │
  ├─ BubbleTranslatedIndicator subtil sous chaque asset traduit (long-press → original)
  │
  └─ NOUVEAU : sink sur SocialSocketManager.shared.storyTranslationUpdated (publisher EXISTANT)
       ├─ filter event.postId == currentPostId
       └─ merge event.translations dans le store local du textObjectIndex correspondant
       → l'asset rafraîchit sans pull-to-refresh
```

## Design détaillé

### Section 1 — Extraction `ComposerLanguagePill` (SDK)

**Fichier nouveau** : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ComposerLanguagePill.swift`

```swift
import SwiftUI

/// Pill compact "drapeau + code ISO + chevron + menu".
/// EXTRAIT de UniversalComposerBar.languageSelectorPill (apps/ios/.../UniversalComposerBar.swift:702-745)
/// pour réutilisation par le composer message ET le composer story.
///
/// Bridge protocol pour absorber LanguageOption (SDK + app) ET TranslationLanguage
/// sans breaking change. Migration progressive vers TranslationLanguage en tâche de fond.
public protocol LanguagePillItem: Identifiable {
    var code: String { get }       // ISO 639-1 normalisé (2 lettres) pour Whisper-friendliness
    var displayCode: String { get } // peut être "pt-BR" pour affichage
    var flag: String { get }
    var displayName: String { get }
}

extension LanguageOption: LanguagePillItem { /* conformance bridge */ }
extension TranslationLanguage: LanguagePillItem { /* conformance bridge */ }

public struct ComposerLanguagePill<Item: LanguagePillItem>: View {
    public enum Style { case dark, light }

    let currentCode: String
    let availableLanguages: [Item]
    let onSelect: (String) -> Void
    let onTapOther: (() -> Void)?          // ouvre LanguagePickerSheet (V1 MVP inclus)
    var style: Style = .dark
    var showAutoBadge: Bool = false
    var disabled: Bool = false

    public var body: some View {
        Menu {
            // Section "Vos langues" (user system + regional) — réutilise data depuis AuthManager
            // Section "Langues fréquentes" — boucle sur availableLanguages
            // Item terminal "Autre…" → onTapOther
            ForEach(availableLanguages) { item in
                Button(action: { onSelect(item.code) }) {
                    Label(item.displayName, systemImage: currentCode == item.code ? "checkmark" : "")
                }
            }
            if onTapOther != nil {
                Divider()
                Button("Autre…", action: { onTapOther?() })
            }
        } label: {
            HStack(spacing: 4) {
                Text(flagForCode(currentCode))
                Text(currentCode.uppercased())
                    .font(.system(size: 12, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .bold))
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(.thinMaterial, in: Capsule())
            .overlay(alignment: .bottom) {
                if showAutoBadge {
                    Text("auto").font(.system(size: 8))
                        .foregroundStyle(.secondary).offset(y: 10)
                }
            }
            .opacity(disabled ? 0.5 : 1)
            .accessibilityLabel(Text("Langue active : \(currentCode.uppercased())"))
            .accessibilityHint(Text("Appuyez pour changer la langue"))
        }
        .disabled(disabled)
    }

    private func flagForCode(_ code: String) -> String {
        LanguageDisplay.from(code: code)?.flag ?? LanguageData.info(for: code)?.flag ?? "🌐"
    }
}
```

**Refactor `UniversalComposerBar.swift:702-745`** : remplace la `private var languageSelectorPill` par `ComposerLanguagePill<LanguageOption>(currentCode:, availableLanguages: availableLanguages, onSelect:, onTapOther: nil OR LanguagePickerSheet trigger, style: .dark, ...)`. Comportement préservé. Snapshot tests existants doivent rester verts.

**Bénéfice** : 1 composant = 1 endroit pour évoluer, pas de drift. Item "Autre…" déjà inclus.

**Tests TDD nouveaux** :
- `test_pill_displaysActiveLanguageCode`
- `test_pill_selectingItem_invokesOnSelect`
- `test_pill_tappingOther_invokesOnTapOther_whenProvided`
- `test_pill_disabled_doesNotInvokeOnSelect`
- `test_pill_showsAutoBadge_whenLanguageOriginIsAuto`
- `test_pill_a11y_announcesActiveLanguage`

### Section 2 — Extension VM : état langue active

**Modification `StoryComposerViewModel.swift` principal** :

```swift
// Ajouts dans la classe :
@Published public private(set) var activeLanguage: String
@Published public private(set) var languageOrigin: LanguageOrigin = .user
@Published public private(set) var lockedLanguage: String?       // pour audio recording
public let textAnalyzer = TextAnalyzer()

// Init (binding) :
self.activeLanguage = Self.resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
Publishers.CombineLatest(textAnalyzer.$language, textAnalyzer.$languageConfidence)
    .receive(on: DispatchQueue.main)
    .sink { [weak self] detected, confidence in
        self?._languageBindingSink(detected: detected, confidence: confidence)
    }
    .store(in: &cancellables)
```

**Fichier nouveau** : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Language.swift`

```swift
extension StoryComposerViewModel {

    public enum LanguageOrigin: String, Sendable { case user, auto, manual }

    public func updateLanguageFromText(_ text: String) {
        guard languageOrigin != .manual else { return }
        textAnalyzer.analyze(text: text)
    }

    public func overrideLanguage(_ code: String) {
        let normalized = normalizeToISO639_1(code)
        activeLanguage = normalized
        languageOrigin = .manual
    }

    /// À l'ouverture de l'éditeur d'un text object existant — force `.manual` pour respecter
    /// la langue déjà choisie pour cet asset.
    public func adoptLanguageFromExistingAsset(_ code: String?) {
        guard let code, !code.isEmpty else { return }
        activeLanguage = normalizeToISO639_1(code)
        languageOrigin = .manual
    }

    /// Au commit du text object (pattern UniversalComposerBar:863) — reset détection pour le suivant.
    public func resetTextAnalyzerOnCommit() {
        textAnalyzer.reset()
        languageOrigin = .user   // permet à la détection auto de reprendre dès le prochain text
    }

    public func lockLanguageForRecording() {
        lockedLanguage = activeLanguage
    }

    public func unlockLanguage() {
        lockedLanguage = nil
    }

    /// Explicitement nonisolated pour permettre les tests non-@MainActor sous MeeshyUI defaultIsolation(MainActor).
    /// Voir [[feedback_meeshyui_default_isolation]].
    internal nonisolated func _languageBindingSink(detected: DetectedLanguage?, confidence: Double) {
        Task { @MainActor in
            guard self.languageOrigin != .manual,
                  let detected, confidence >= ComposerLanguageResolver.confidenceFloor,
                  detected.code != self.activeLanguage
            else { return }
            self.activeLanguage = detected.code
            self.languageOrigin = .auto
        }
    }

    /// Normalise vers ISO 639-1 strict (2 lettres) pour compatibilité Whisper.
    /// "pt-BR" → "pt", "zh-Hant" → "zh", "fr" → "fr".
    private func normalizeToISO639_1(_ code: String) -> String {
        code.split(separator: "-").first.map(String.init)?.lowercased() ?? code.lowercased()
    }
}
```

**Modifications `StoryComposerViewModel.swift` lignes 942 (`addText`) et 1087 (`addAudioObject`)** :

```swift
// Avant :  sourceLanguage: detectedKeyboardLanguage
// Après :  sourceLanguage: activeLanguage
```

**Tests TDD** (non-`@MainActor` car `_languageBindingSink` est `nonisolated`) :

```
test_init_resolvesSystemLanguage_whenUserHasSystemLanguage
test_init_fallbacksToRegional_whenNoSystemLanguage
test_init_fallbacksToFR_whenNoLanguagesConfigured
test_overrideLanguage_setsOriginToManual_andStopsAutoDetection
test_overrideLanguage_normalizesPtBR_toPt
test_overrideLanguage_normalizesZhHant_toZh
test_updateLanguageFromText_switchesLanguage_whenAutoDetectionAbove86percent
test_updateLanguageFromText_doesNotSwitch_whenConfidenceBelow86percent
test_updateLanguageFromText_doesNotSwitch_whenOriginIsManual
test_adoptLanguageFromExistingAsset_forcesManual_andNormalizes
test_adoptLanguageFromExistingAsset_ignoresEmptyString
test_adoptLanguageFromExistingAsset_ignoresNil
test_resetTextAnalyzerOnCommit_resetsToUserOrigin
test_lockLanguageForRecording_snapshotsActiveLanguage
test_unlockLanguage_clearsLockedLanguage
test_addText_propagatesActiveLanguageToTextObject
test_addAudioObject_propagatesActiveLanguageToAudioObject
test_languageBindingSink_isReachableFromNonMainActorContext
```

### Section 3 — Toolbar story : insertion + masquage chirurgical

**Modifications `StoryComposerView.swift`** :

1. Insérer dans la toolbar :
```swift
ComposerLanguagePill<TranslationLanguage>(
    currentCode: viewModel.activeLanguage,
    availableLanguages: TranslationLanguage.quickStrip,
    onSelect: viewModel.overrideLanguage,
    onTapOther: { showLanguagePickerSheet = true },
    style: .dark,
    showAutoBadge: viewModel.languageOrigin == .auto,
    disabled: viewModel.lockedLanguage != nil
)
.sheet(isPresented: $showLanguagePickerSheet) {
    LanguagePickerSheet(style: .dark) { lang in
        viewModel.overrideLanguage(lang.code)
        showLanguagePickerSheet = false
    } onDismiss: { showLanguagePickerSheet = false }
}
```

2. **Split chirurgical de la condition `.opacity`** (`StoryComposerView.swift:286-298`) :

```swift
// Top sidebar — comportement actuel préservé
sidebarView
    .opacity(viewModel.shouldHideTopSidebar ? 0 : 1)
    .allowsHitTesting(!viewModel.shouldHideTopSidebar)

// Bottom region — split selon outil actif (audit Phase 0)
bottomRegionView
    .opacity(viewModel.shouldHideBottomToolbar ? 0 : 1)
    .allowsHitTesting(!viewModel.shouldHideBottomToolbar)
```

3. **Computed properties dans le VM** (avec audit Phase 0 des `activeTool` qui occupent la bottom region) :

```swift
public var shouldHideTopSidebar: Bool { textEditingMode != .inactive }

public var shouldHideBottomToolbar: Bool {
    // Audit Phase 0 : list des outils qui occupent toute la bottom region (color picker expandé, font picker, etc.)
    if case .active(_, let tool) = textEditingMode, tool?.requiresFullBottomSpace == true {
        return true
    }
    return false   // sinon la toolbar (avec ComposerLanguagePill) reste accessible
}
```

**Risque mitigé** : le `ComposerLanguagePill` est masqué quand un outil texte expandé en a besoin (color picker plein écran) mais réapparaît dès qu'on quitte. Pas de superposition.

### Section 4 — Wiring éditeur texte + audio recorder

**`StoryTextEditorView`** :

```swift
.onAppear {
    if let lang = textObject.sourceLanguage {
        viewModel.adoptLanguageFromExistingAsset(lang)
    }
}
.onChange(of: textObject.text) { _, newText in
    viewModel.updateLanguageFromText(newText)
}
// onCommit :
textObject.sourceLanguage = viewModel.activeLanguage
viewModel.resetTextAnalyzerOnCommit()   // pattern UniversalComposerBar:863
```

**`StoryAudioRecorderView`** (`lockedLanguage` désormais lu depuis le VM) :

```swift
private func startRecording() {
    viewModel.lockLanguageForRecording()   // VM gère le snapshot
    audioRecorderManager.start()
}

private func stopRecording() {
    audioRecorderManager.stop()
    let locked = viewModel.lockedLanguage ?? viewModel.activeLanguage
    let audioObject = StoryAudioPlayerObject(/* … */, sourceLanguage: locked)
    media.transcription = ["language": locked]   // bootstrap Whisper
    viewModel.unlockLanguage()
}

// Affichage :
if let locked = viewModel.lockedLanguage {
    Text("Enregistrement en \(LanguageDisplay.from(code: locked)?.flag ?? "🌐") \(locked.uppercased())")
        .font(.caption).foregroundStyle(.secondary)
}
```

**Gestion abandon enregistrement** (réponse à question reviewer #2) : si l'user dismiss le composer pendant `lockedLanguage != nil`, l'AudioRecorderView `onDisappear` doit appeler `viewModel.unlockLanguage()` + l'audio recorder doit cancel. Test dédié : `test_dismissingComposerWhileRecording_unlocksLanguage_andCancelsRecorder`.

### Section 5 — Généralisation résolveur Prisme (sans protocol vide)

**Modification `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:295`** :

```swift
// AVANT — privée + spécifique à APIPostTranslationEntry
private static func resolveTranslation(
    translations: [String: APIPostTranslationEntry]?,
    originalLanguage: String?,
    preferredLanguages: [String]
) -> String? { ... }

// APRÈS — fonction libre générique, PAS de protocol vide.
// Règle 1 du Prisme : JAMAIS de fallback `.first` — `nil` si aucune match.

public func resolvePrismeTranslation<T>(
    translations: [String: T]?,
    sourceLanguage: String?,
    preferredLanguages: [String]
) -> T? {
    guard let translations, !translations.isEmpty else { return nil }
    let origLower = sourceLanguage?.lowercased()
    for lang in preferredLanguages {
        let langLower = lang.lowercased()
        if origLower == langLower { return nil }   // contenu déjà dans la langue souhaitée
        if let match = translations.first(where: { $0.key.lowercased() == langLower }) {
            return match.value
        }
    }
    return nil
}
```

**Call sites couverts** (4) :
- text objects story : `T = String` → `resolvePrismeTranslation<String>(...)`
- audio variants PostMedia : `T = PostMediaTranslationVariant` (struct Codable, à confirmer existence ou créer si manque côté Swift)
- text post root : appelé depuis `PostModels.resolveTranslation` (rétrocompat — wrapper interne `T = APIPostTranslationEntry`)
- audio MessageAttachment : `T = APIAttachmentTranslation`

**Tests** :

```
test_resolve_returnsNil_whenTranslationsIsEmpty
test_resolve_returnsNil_whenSourceMatchesFirstPreferred
test_resolve_returnsMatchingVariant_whenInPreferred
test_resolve_skipsLanguagesNotInTranslations
test_resolve_returnsNil_whenNoLanguageMatches_neverFallsBackToFirst
test_resolve_caseInsensitive_FR_vs_fr
test_resolve_genericOverString_works
test_resolve_genericOverAttachmentVariant_works
test_resolve_genericOverPostMediaVariant_works
```

### Section 6 — Backend : déclencheur du sender existant

**Modification `services/gateway/src/routes/posts/core.ts` (ou `PostService.ts`)** — quelques lignes après création du Post :

```typescript
// Fire-and-forget : déclenche le pipeline ZMQ existant pour CHAQUE text object.
// Le handler ZMQ callback (StoryTextObjectTranslationService) est déjà branché.
// La persistance atomique et le broadcast Socket.IO sont déjà en place.

if (post.type === 'story' && post.storyEffects?.textObjects) {
  const TOP5 = ['en', 'fr', 'es', 'de', 'pt'];
  for (const [index, obj] of post.storyEffects.textObjects.entries()) {
    if (!obj.text?.trim() || !obj.sourceLanguage) continue;
    const targets = TOP5.filter(l => l !== obj.sourceLanguage);
    if (targets.length === 0) continue;
    zmqClient.sendStoryTextObjectRequest({
      postId: post.id,
      textObjectIndex: index,
      text: obj.text,
      sourceLanguage: obj.sourceLanguage,
      targetLanguages: targets,
    }).catch(err => log.error('sendStoryTextObjectRequest failed', err, { postId: post.id, index }));
  }
}

// Pour l'audio story : audit Phase 0 — vérifier que le pipeline audio est déjà déclenché
// par PostAudioService au moment de l'upload media, et qu'il propage bien sourceLanguage
// depuis storyEffects.audioPlayerObjects vers le job ZMQ Whisper (force language).
```

**Idempotence** : le handler `StoryTextObjectTranslationService` écrase via `$set` atomique — appelé 2x avec le même `(postId, index, lang)`, le résultat est identique. Le déclencheur peut être appelé sans risque même en retry.

**Tests intégration** (compléter `core.story-translation.test.ts` existant) :

```
test_postsRoute_triggers_sendStoryTextObjectRequest_perTextObject
test_postsRoute_skipsTextObject_whenSourceLanguageMissing
test_postsRoute_skipsTextObject_whenTextEmpty
test_postsRoute_doesNotTrigger_forNonStoryTypes
test_storyTextObjectTranslation_endToEnd_persistAtomic_andBroadcastsSocketIO
```

### Section 7 — Translator : force Whisper sur sourceLanguage normalisé

**Modification handler audio Python** (`services/translator/src/services/zmq_audio_handler.py` ou équivalent voice_translate) :

```python
import re

WHISPER_ISO_639_1 = re.compile(r'^[a-z]{2}$')

def _normalize_source_language(raw: str | None) -> str | None:
    if not raw:
        return None
    base = raw.split('-')[0].lower()  # "pt-BR" → "pt", "zh-Hant" → "zh"
    return base if WHISPER_ISO_639_1.match(base) else None

# Dans le handler :
source_language = _normalize_source_language(payload.get('sourceLanguage'))
user_language = payload.get('userLanguage')
forced = source_language or user_language

if forced:
    whisper_result = whisper.transcribe(audio_data, language=forced)
else:
    whisper_result = whisper.transcribe(audio_data)
```

**Tests pytest** :

```
test_normalize_handles_pt_BR_to_pt
test_normalize_handles_zh_Hant_to_zh
test_normalize_returns_None_for_invalid_codes
test_handle_audio_uses_normalized_source_language
test_handle_audio_falls_back_to_userLanguage_when_sourceLanguage_invalid
test_handle_audio_auto_detects_when_both_missing
```

### Section 8 — iOS lecture (Prisme + indicateur + sink realtime existant)

**Story reader view model** (à localiser au Spike) :

```swift
import Combine

@MainActor
public final class StoryReaderViewModel: ObservableObject {
    @Published private var translationsByObjectIndex: [Int: [String: String]] = [:]
    private var cancellables = Set<AnyCancellable>()

    init(currentPostId: String) {
        // RÉUTILISE publisher SDK EXISTANT — pas de nouveau Codable, pas de nouveau decoder
        SocialSocketManager.shared.storyTranslationUpdated
            .filter { $0.postId == currentPostId }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.translationsByObjectIndex[event.textObjectIndex, default: [:]]
                    .merge(event.translations) { _, new in new }
            }
            .store(in: &cancellables)
    }

    public func displayedText(for textObject: StoryTextObject, atIndex index: Int) -> String {
        // Merge realtime updates avec le snapshot initial du Post
        let mergedTranslations = (textObject.translations ?? [:])
            .merging(translationsByObjectIndex[index] ?? [:]) { _, new in new }
        return resolvePrismeTranslation(
            translations: mergedTranslations,
            sourceLanguage: textObject.sourceLanguage,
            preferredLanguages: preferredContentLanguages
        ) ?? textObject.text
    }

    public func audioVariant(for audioObject: StoryAudioPlayerObject, media: PostMedia) -> PostMediaTranslationVariant? {
        resolvePrismeTranslation(
            translations: media.translations,
            sourceLanguage: audioObject.sourceLanguage,
            preferredLanguages: preferredContentLanguages
        )
    }

    public func isTranslated(textObject: StoryTextObject, atIndex index: Int) -> Bool {
        displayedText(for: textObject, atIndex: index) != textObject.text
    }
}
```

**Fichier nouveau** : `packages/MeeshySDK/Sources/MeeshyUI/Story/Views/BubbleTranslatedIndicator.swift`

```swift
struct BubbleTranslatedIndicator: View {
    let sourceLanguage: String
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 9, weight: .semibold))
            // Localisable via String(localized:) (voir risque #11 reviewer)
            Text(String(localized: "translated_from_\(LanguageDisplay.from(code: sourceLanguage)?.flag ?? "🌐")",
                        defaultValue: "traduit de \(LanguageDisplay.from(code: sourceLanguage)?.flag ?? "🌐")"))
                .font(.system(size: 10, weight: .medium))
        }
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Contenu traduit depuis \(sourceLanguage.uppercased())"))
    }
}
```

**Tests** :

```
test_storyReader_displayedText_returnsTranslation_inPreferredLanguage
test_storyReader_displayedText_returnsOriginal_whenNoMatch
test_storyReader_displayedText_mergesRealtimePatchFromSocialSocket
test_storyReader_audioVariant_returnsCorrectURL_inPreferredLanguage
test_storyReader_sinkOnStoryTranslationUpdated_filtersByPostId
test_storyReader_isTranslated_returnsTrue_whenLanguageDiffers
test_bubbleTranslatedIndicator_displaysFlagAndCode
test_bubbleTranslatedIndicator_a11y_announcesTranslated
```

## Plan de livraison

### Phase 0 — Spike (0.5j) ⚠️ obligatoire

Audits ciblés (la majorité des inconnues sont levées par les 4 audits v2 + révision v3) :

1. **Brèche déclencheur backend** : confirmer dans `services/gateway/src/routes/posts/core.ts` (ou `PostService.ts`) que `sendStoryTextObjectRequest` n'est PAS encore appelé (le test `core.story-translation.test.ts:232-254` est explicite mais re-confirmer le code actuel).
2. **Audit `activeTool` qui occupent la bottom region** (color picker, font picker, etc.) — liste exhaustive pour caler `shouldHideBottomToolbar`.
3. **Pipeline audio story** : confirmer qui déclenche le job ZMQ audio pour un PostMedia story (probablement `PostAudioService.processPostAudio` au moment de l'upload media via `PostService.ts:172`). Vérifier que le `sourceLanguage` peut être propagé depuis `storyEffects.audioPlayerObjects[].sourceLanguage` jusqu'au payload ZMQ.
4. **Types PostMedia côté Swift** : `PostMediaTranslationVariant` / structure équivalente Codable existe-t-elle pour décoder `PostMedia.translations` JSON ? Sinon, créer le struct simple.
5. **Localisation `StoryAudioRecorderView`** dans `apps/ios/` + `StoryReaderViewModel` (ou équivalent).
6. **`LanguageOption` SDK vs app** : confirmer la double définition + viabilité du protocol `LanguagePillItem` bridge.

### Phase 1 — Backend MVP (parallélisable, ~0.5-0.75j)

| Lot | Contenu | Estim. |
|---|---|---|
| **B1** | Déclencheur dans POST /posts : boucle sur textObjects + `zmqClient.sendStoryTextObjectRequest` + tests intégration | 0.25j |
| **B2** | Audit + propagation `sourceLanguage` audio story du payload story vers le job ZMQ (selon Phase 0). Si déjà propagé : no-op | 0.25j |
| **B3** | `zmq_audio_handler.py` (ou voice_translate) : normalisation + force `sourceLanguage` + tests pytest | 0.25j |

### Phase 2 — iOS écriture MVP (parallélisable avec Phase 1, ~1.5j)

| Lot | Contenu | Estim. |
|---|---|---|
| **I1** | Extraction `ComposerLanguagePill` + protocol bridge `LanguagePillItem` + conformances `LanguageOption`/`TranslationLanguage` + refactor `UniversalComposerBar` (snapshot tests verts) + intégration `LanguagePickerSheet` (item "Autre…") | 0.75j |
| **I2** | `StoryComposerViewModel+Language.swift` extension (avec `nonisolated _languageBindingSink` + normalisation ISO 639-1 + `lockedLanguage` côté VM + `resetTextAnalyzerOnCommit`) + tests non-`@MainActor` | 0.5j |
| **I3** | Insertion `ComposerLanguagePill` dans toolbar + split `shouldHideTopSidebar`/`shouldHideBottomToolbar` (conditionnel sur `activeTool?.requiresFullBottomSpace`) + wiring `StoryTextEditorView` + `StoryAudioRecorderView` + propagation `addText`/`addAudioObject` + tests | 0.25j |

### Phase 3 — iOS lecture MVP (~0.5j)

| Lot | Contenu | Estim. |
|---|---|---|
| **R1** | Généralisation `PostModels.resolveTranslation` → fonction libre `resolvePrismeTranslation<T>` (sans protocol vide) + tests 4 call sites | 0.25j |
| **R2** | `StoryReaderViewModel` wiring résolveur + sink sur `SocialSocketManager.storyTranslationUpdated` (publisher EXISTANT) + `BubbleTranslatedIndicator` calque + tests | 0.25j |

**MVP total : ~2.5-2.75 jours** (vs 3.25j v2, vs 9-11j plan initial). Réduction grâce à la découverte du pipeline backend déjà en place.

### Phase 4 — Polish (post-MVP, optionnel, ~0.5j)

- Migration progressive `LanguageOption` (app + SDK) → `TranslationLanguage` SDK uniquement. Dépréciations + alias bridges.
- Localisation complète des strings `"Enregistrement en …"` et `"traduit de …"` via `String(localized:)`.
- A11y audit complet (VoiceOver, Dynamic Type, contraste high-contrast).

## Risques & mitigations

1. **Posts existants sans `sourceLanguage` sur textObjects** → traités comme `null`, pas de traduction. Pas de migration backfill.
2. **Perf — burst 20 text objects × 4 langues = 80 jobs ZMQ** → `sendStoryTextObjectRequest` non-bloquant (fire-and-forget) ; chaque job traité en parallèle côté translator. Throughput dépend du dimensionnement translator (out-of-scope MVP — à monitorer).
3. **iOS Equatable footgun** (cf. [[feedback_swiftui_equatable_state_footgun]]) — state vit dans `viewModel`, jamais dans la View `ComposerLanguagePill`.
4. **Swift 6 isolation** sur extension `+Language` — `_languageBindingSink` est `nonisolated` + utilise `Task { @MainActor in ... }` pour les mutations. Tests non-`@MainActor` conformes à [[feedback_meeshyui_default_isolation]].
5. **Idempotence** — `StoryTextObjectTranslationService.handleTranslationCompleted` utilise `$set` atomique : double-appel = même résultat. Le déclencheur peut retry sans risque.
6. **Migration `UniversalComposerBar` → `ComposerLanguagePill`** : snapshot tests existants couvrent la régression visuelle. Revue manuelle de l'XP composer message conversation obligatoire avant merge.
7. **Validation Zod côté gateway** : audit Phase 0 que `sourceLanguage` propagé n'est pas strippé par schéma response Fastify (voir [[feedback_fastify_schema_strips_fields]]).
8. **Concurrence Post.effects** : `$runCommandRaw` + dot-notation `$set` est atomique au niveau MongoDB — pas de race condition même si plusieurs `handleTranslationCompleted` arrivent en parallèle pour des `textObjectIndex` différents.
9. **`adoptLanguageFromExistingAsset` edge cases** — `""` (string vide) → guard, `nil` → guard, `"xx"` (code inconnu) → laissé tel quel après normalisation (Whisper rejettera côté translator avec fallback auto-detect). Tests couvrent les 3 cas.
10. **Variants régionaux dans `quickStrip`** → normalisation côté VM + côté translator. Whisper reçoit toujours du ISO 639-1 strict.
11. **Localisation** : `BubbleTranslatedIndicator` utilise `String(localized:)`. Strings `"Enregistrement en…"` et `"auto"` à localiser au polish Phase 4 (acceptable en MVP).
12. **Cleanup `lockedLanguage` au dismiss composer** : `AudioRecorderView.onDisappear` ou équivalent doit appeler `viewModel.unlockLanguage()` + cancel audio recorder.

## Out-of-scope explicite

- **Posts texte normaux** (non-stories) : déjà couverts par `translateContentRoot`, comportement inchangé.
- **Moods** : `post.type === 'mood'` ajouté en O(1) au dispatcher de POST /posts (map de handlers) — implémentation moods = follow-up sprint dédié, structure prête.
- **Migration backfill** stories existantes : pas de rétro-traduction.
- **Sélection langue composer message conversation** : `UniversalComposerBar` migre vers `ComposerLanguagePill` (cosmétique, comportement préservé).
- **Voice cloning audio cross-langue** : géré par `PostAudioService` existant.
- **E2EE des stories** : hypothèse "stories en clair côté serveur" confirmée par l'existence de `StoryTextObjectTranslationService` qui lit le texte clair.
- **Migration `LanguageOption` → `TranslationLanguage`** : Phase 4 polish post-MVP.
- **Tests E2E iOS** (composer → publish → lecture multilingue) : couverts par tests unitaires + intégration backend `core.story-translation.test.ts` étendu. E2E Playwright/iOS séparé post-MVP.
- **Détecteur langue gateway centralisé** : non requis (l'auteur fournit `sourceLanguage` explicitement).

## Décisions cristallisées

- **Granularité** : per-asset
- **Timing audio** : choix langue AVANT enregistrement (force Whisper)
- **Cibles traduction** : top-5 langues globales
- **Style picker** : toggle inline dans toolbar story = composant SDK `ComposerLanguagePill<Item: LanguagePillItem>` extrait de UniversalComposerBar, avec item "Autre…" → `LanguagePickerSheet` (V1 MVP inclus)
- **Type unification** : protocol bridge `LanguagePillItem` permet d'accepter `LanguageOption` + `TranslationLanguage` sans breaking change ; migration vers `TranslationLanguage` SDK reportée Phase 4
- **Détection auto** : `TextAnalyzer` + `ComposerLanguageResolver` réutilisés, `_languageBindingSink` `nonisolated`
- **Toolbar visible pendant édition text** : split `shouldHideTopSidebar` (comportement actuel) / `shouldHideBottomToolbar` (conditionnel sur `activeTool?.requiresFullBottomSpace`)
- **`lockedLanguage` audio** : dans le VM (`@Published`), pas dans la View — survit aux re-créations
- **Reset `textAnalyzer`** au commit text (pattern `UniversalComposerBar:863`)
- **Stockage** : pattern `MessageAttachment` (`PostMedia.translations Json?` typé application-level)
- **Pipeline backend** : RÉUTILISER l'existant intégral (`StoryTextObjectTranslationService` + `ZmqRequestSender.sendStoryTextObjectRequest` + `PostAudioService` + handlers ZMQ + broadcast Socket.IO). Brèche unique = déclencheur dans POST /posts.
- **Persistance atomique** : `$runCommandRaw` + dot-notation `$set` déjà en place, pas de read-modify-write
- **Translator Whisper** : normalisation ISO 639-1 strict + force language ; allow-list implicite Whisper
- **Résolveur Prisme** : fonction libre générique `resolvePrismeTranslation<T>` sans protocol vide
- **Indicateur traduit** : `BubbleTranslatedIndicator` calqué sur `BubbleEditedIndicator`, localisable
- **Realtime patch** : sink sur `SocialSocketManager.storyTranslationUpdated` publisher EXISTANT (pas de nouveau Codable, pas de nouveau decoder)
- **Polish reporté Phase 4** : migration `LanguageOption`, localisation complète, a11y audit
