# Story composer — sélection de langue per-asset & propagation traduction (2026-05-26)

**Status** : Design approuvé, prêt pour writing-plans.
**Branche cible** : `feat/story-composer-language-selection` (worktree à créer).
**Révision** : v2 — audit de réutilisation exhaustif, créations injustifiées éliminées.

## Surface modifiée

| Fichier | Type d'intervention |
|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ComposerLanguagePill.swift` | **NOUVEAU** (extraction de `UniversalComposerBar.languageSelectorPill`) |
| `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar.swift` | MODIF (remplace `languageSelectorPill` privée par appel à `ComposerLanguagePill`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | MODIF (ajout 3 `@Published` + binding `TextAnalyzer`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Language.swift` | **NOUVEAU** (extension méthodes : pattern `+TextEditing` existant) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | MODIF (insertion `ComposerLanguagePill` dans toolbar + split condition masquage) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryTextEditorView.swift` | MODIF (wiring `adopt/update` langue) |
| `apps/ios/Meeshy/.../StoryAudioRecorderView.swift` (à localiser au Spike) | MODIF (snapshot langue au start) |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | MODIF (généralisation `resolveTranslation` via protocol `TranslationVariant`) |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Views/BubbleTranslatedIndicator.swift` | **NOUVEAU** (pattern `BubbleEditedIndicator`) |
| Story reader view (à localiser au Spike) | MODIF (appel résolveur + indicateur) |
| `services/gateway/src/services/posts/PostTranslationService.ts` | MODIF (2 méthodes privées + dispatcher type-aware) |
| `services/translator/src/services/zmq_audio_handler.py` | MODIF (~3 lignes : accepte `sourceLanguage` forcé Whisper) |

**Nouveaux fichiers : 3** (1 extraction réutilisée par 2+ call sites + 1 extension VM + 1 badge calqué). Aucun nouveau modèle Prisma, aucun nouveau service, aucun nouveau Zod.

## Contexte

Aujourd'hui dans le composer story iOS :
- Chaque text/audio reçoit silencieusement `sourceLanguage = user.systemLanguage` via `StoryComposerViewModel.resolveComposerSourceLanguage(user:)`
- L'auteur n'a **aucune UI** pour choisir/modifier cette langue
- Côté backend, `PostTranslationService.translatePost()` ne traduit que le `content` root du Post — pas les text objects ni audios de `effects`
- Le translator Whisper transcrit en auto-detect, le `sourceLanguage` n'est pas propagé

Cette spec :
1. Réutilise/extrait le picker langue existant de `UniversalComposerBar` pour la toolbar story
2. Propage la langue active à chaque asset créé (text + audio)
3. Force Whisper côté translator pour audios stories
4. Étend `PostTranslationService` (dispatcher type-aware, prêt pour moods)
5. Affiche traductions selon le Prisme côté lecteur, avec indicateur "🔁 traduit"

**Décisions cristallisées (brainstorming)** : per-asset, top-5 langues (`en,fr,es,de,pt`), toggle inline toolbar + détection auto via `TextAnalyzer` réutilisé, choix langue audio AVANT enregistrement, toolbar reste visible pendant édition text, stockage pattern `MessageAttachment` (zéro nouveau modèle Prisma), service `PostTranslationService` étendu (pas nouveau).

## Principe directeur

**Réutilisation maximale, création minimale.** Tout nouveau composant doit être justifié par absence prouvée ou meilleure architecture/perf. Voir [[feedback_maximize_reuse_minimize_creation]].

## Inventaire — Composants existants réutilisés tels quels

### iOS — UI & helpers

| Besoin | Composant existant | Localisation | Verdict |
|---|---|---|---|
| Pill compact "drapeau + code + chevron + menu" pour toolbar | `UniversalComposerBar.languageSelectorPill` (private var) | `apps/ios/.../UniversalComposerBar.swift:702-745` | **Extraire en SDK** → réutilisé par 2 call sites (justification perf : cohérence visuelle + DRY) |
| Sheet plein écran picker langue (NLLB 35+ langues) | `LanguagePickerSheet` | `MeeshyUI/Primitives/LanguagePickerSheet.swift:117` | **Tel quel** pour V2 "Toutes les langues…" (out-of-scope MVP) |
| Liste 9 langues fréquentes | `TranslationLanguage.quickStrip` | `MeeshyUI/Primitives/LanguagePickerSheet.swift:22-84` | **Tel quel** |
| Liste 35+ langues NLLB | `TranslationLanguage.all` | idem | **Tel quel** |
| Liste 70+ langues globales (variantes pt-BR, zh-Hant…) | `LanguageData.allLanguages` | `MeeshySDK/Models/LanguageData.swift:22-131` | **Tel quel** |
| `flag(code) → emoji` | `LanguageDisplay.from(code:)` + `LanguageData.info(for:)` | `MeeshyUI/Utilities/LanguageDisplay.swift` + `MeeshySDK/Models/LanguageData.swift` | **Tel quel** |
| Détection langue depuis texte (NLLanguageRecognizer, debounce 0.3s, lock 10 mots) | `TextAnalyzer` | `MeeshyUI/Utilities/TextAnalyzer.swift` | **Tel quel** (atome SDK) |
| Résolveur détection vs override (seuil 86%) | `ComposerLanguageResolver.resolve()` (pure fn) | `apps/ios/.../ComposerModels.swift:140-168` | **Tel quel** |
| Langue par défaut user (system→regional→fr) | `StoryComposerViewModel.resolveComposerSourceLanguage(user:)` static | `MeeshyUI/Story/StoryComposerViewModel.swift:267-281` | **Tel quel** |
| Pattern extension VM (séparation par préoccupation) | `StoryComposerViewModel+TextEditing.swift` | `MeeshyUI/Story/` | **Pattern reproduit** |
| Pattern badge meta sous bubble | `BubbleEditedIndicator`, `BubblePinnedIndicator` | `Features/Main/Views/Bubble/BubbleMetaBadges.swift` | **Pattern reproduit** (1 nouveau badge calqué) |
| Décision "ce contenu est traduit" | `BubbleStandardLayout.hasAnyTranslation` + `BubbleContent.Translation` | `BubbleStandardLayout.swift:184`, `BubbleContentBuilder.swift:76-100` | **Pattern reproduit** côté story |

### iOS — Modèles & résolution

| Besoin | Existant | Localisation | Verdict |
|---|---|---|---|
| Champ langue source per-asset | `StoryTextObject.sourceLanguage` + `StoryAudioPlayerObject.sourceLanguage` | `MeeshySDK/Models/StoryModels.swift:242, 693` | **Tel quel** |
| Map traductions text | `StoryTextObject.translations: [String: String]?` | `StoryModels.swift:241` | **Tel quel** |
| Résolveur Prisme `(translations, originalLanguage, preferredLanguages) → variant?` SANS fallback `.first` | `PostModels.swift:295` `private static func resolveTranslation(...)` | `MeeshySDK/Models/PostModels.swift:295` | **Généraliser via protocol `TranslationVariant`** (justification archi : DRY 1 implémentation testée pour 4 call sites) |
| Pattern app `preferredTranslation(for:)` | `TranslationResolver` | `apps/ios/Meeshy/.../Conversation/TranslationResolver.swift:26` | **Tel quel** (s'appuiera sur résolveur généralisé) |
| Pattern `preferredLanguages: [String]` | `ConversationViewModel.preferredLanguages` | (déjà existant) | **Tel quel** côté story reader |

### Backend — Services & DB

| Besoin | Existant | Localisation | Verdict |
|---|---|---|---|
| Stockage transcription + traductions audio DB | `PostMedia.transcription Json?` + `translations Json?` + `language` + `variantOf` (identique `MessageAttachment`) | `prisma/schema.prisma:2882-2900+` | **Tel quel** (zéro migration) |
| Pipeline audio Whisper+NLLB+TTS générique | `AudioTranslateService.translateSync(userId, options)` | `services/gateway/src/services/AudioTranslateService.ts:377-407` | **Tel quel** — accepte `audioPath`, `attachmentId`, `sourceLanguage`, `targetLanguages` opaques |
| Payload ZMQ audio supporte déjà PostMedia | `AudioProcessRequest` avec `postId` + `postMediaId` | `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts:130-155` | **Tel quel** ✅ |
| Persistance PostMedia post-traduction | `PostAudioService` pattern `postMedia.update({ translations: payload })` (écrasement atomic) | `services/gateway/.../PostAudioService.ts:232-237` | **Pattern reproduit** (écrasement direct, pas merge — perf atomic write) |
| Service traduction post point d'entrée | `PostTranslationService.translatePost()` | `services/gateway/src/services/posts/PostTranslationService.ts` | **Étendu** (2 méthodes privées + dispatcher type-aware) |
| Schemas Zod sourceLanguage sur text/audio objects | Déjà `.optional()` | `services/gateway/src/routes/posts/types.ts:122, 145` | **Tel quel** (audit Phase 0 — compléter si manquant) |
| Top-5 langues globales | Constante déjà utilisée dans `PostTranslationService` pour content root | idem service | **Tel quel** |

### Backend — Translator

| Besoin | Existant | Localisation | Verdict |
|---|---|---|---|
| Whisper transcription auto-detect | `zmq_audio_handler.py` accepte `userLanguage` (fallback) | `services/translator/src/services/zmq_audio_handler.py:85` | **Étendu (~3 lignes)** : accepte `sourceLanguage` priorité haute |

## Création — strictement justifiée

| Nouveau | Justification | Taille |
|---|---|---|
| `ComposerLanguagePill.swift` SDK Primitives | **Extraction** de `languageSelectorPill` privé de UniversalComposerBar pour réutilisation 2+ call sites. Archi : DRY, cohérence visuelle, single point of evolution | ~50 lignes (move + paramétrage) |
| `StoryComposerViewModel+Language.swift` extension | Pattern d'extension VM déjà utilisé (`+TextEditing`) → séparation préoccupations, pas de nouvelle classe | ~60 lignes |
| `BubbleTranslatedIndicator.swift` (sous `Story/Views/`) | Pattern `BubbleEditedIndicator` reproduit pour scope story. Pas d'équivalent générique multi-scope existant. | ~15 lignes |
| 2 méthodes privées `PostTranslationService` (`translateTextObjects`, `translateAudioObjects`) + dispatcher | Le service est le point d'entrée existant ; éviter la dispersion en services parallèles | ~60-80 lignes total |
| 1 protocol `TranslationVariant` + 1 fonction générique dans `PostModels` (généralisation de l'existant) | Archi : DRY, 1 implémentation testée pour 4 call sites (text root post, audio attachment, text object story, audio variant PostMedia) | ~25 lignes (refactor) |

**0 nouveau modèle Prisma. 0 nouveau service. 0 nouveau Zod schema. 0 helper merge JSON** (écrasement direct, pattern `PostAudioService` existant).

## Architecture cible

### Flow écriture (composer iOS → DB)

```
StoryComposerView
  ├─ @StateObject viewModel: StoryComposerViewModel  (existant, étendu via +Language)
  │    ├─ @Published activeLanguage: String          (NOUVEAU)
  │    ├─ @Published languageOrigin: LanguageOrigin  (NOUVEAU)
  │    ├─ textAnalyzer: TextAnalyzer                 (RÉUTILISE atome SDK)
  │    ├─ updateLanguageFromText(_:)                 (utilise ComposerLanguageResolver)
  │    ├─ overrideLanguage(_:)                       (origin → .manual)
  │    └─ adoptLanguageFromExistingAsset(_:)         (re-edit text object)
  │
  ├─ Toolbar story (visible pendant édition text — split condition .opacity)
  │    └─ ComposerLanguagePill(                      (EXTRAIT de UniversalComposerBar)
  │           currentCode: viewModel.activeLanguage,
  │           availableLanguages: TranslationLanguage.quickStrip,
  │           onSelect: viewModel.overrideLanguage,
  │           showAutoBadge: viewModel.languageOrigin == .auto)
  │
  ├─ StoryTextEditorView (existant)
  │    ├─ onAppear : viewModel.adoptLanguageFromExistingAsset(textObject.sourceLanguage)
  │    ├─ onChange(text) : viewModel.updateLanguageFromText(text)
  │    └─ onCommit : textObject.sourceLanguage = viewModel.activeLanguage
  │
  └─ StoryAudioRecorderView (existant)
       ├─ Affiche "Enregistrement en 🇫🇷 FR" (LanguageDisplay.from)
       ├─ startRecording : let locked = viewModel.activeLanguage (snapshot)
       │  ├─ ComposerLanguagePill .disabled(isRecording)
       └─ stopRecording  : audioObject.sourceLanguage = locked
                           media.transcription = { language: locked }  (bootstrap)

POST /posts (validation Zod : sourceLanguage propagés)
  └─ Prisma create Post + PostMedia
  └─ sendSuccess() → 201
  └─ fire-and-forget → PostTranslationService.translatePost(post)
         ├─ dispatcher selon post.type :
         │    type === 'story' → translateContentRoot + translateTextObjects + translateAudioObjects
         │    type === 'mood'  → handler dédié (follow-up sprint, structure prête)
         │    autre            → translateContentRoot seul (comportement actuel)
         │
         ├─ translateTextObjects(post)
         │    └─ pour chaque obj.text avec sourceLanguage : zmqClient.translateToMultipleLanguages
         │    └─ écrasement atomic des translations dans Post.effects (pattern PostAudioService)
         │
         └─ translateAudioObjects(post)
              └─ pour chaque audioObj : AudioTranslateService.translateSync({
                   audioPath: media.fileUrl,
                   attachmentId: undefined, postMediaId: media.id,    (ZMQ supporte déjà)
                   sourceLanguage: obj.sourceLanguage,                 (force Whisper)
                   targetLanguages: TOP5 \ sourceLanguage,
                   saveToDatabase: true })
              └─ AudioTranslateService.translateSync écrit dans PostMedia.{transcription, translations}
                 via pattern PostAudioService existant
```

### Flow lecture (DB → iOS Prisme)

```
GET /posts (audit Phase 0 — select Prisma inclut transcription, translations, language sur PostMedia)
ou Socket.IO push existant
  └─ Post.effects JSON contient textObjects[].{sourceLanguage, translations}

iOS StoryReaderViewModel
  └─ Pour chaque text object :
       résolveur Prisme généralisé (PostModels.resolveTranslation<String>) → text dans preferredContentLanguages
       fallback : afficher sourceLanguage original, JAMAIS .first
  └─ Pour chaque audio asset :
       résolveur Prisme généralisé (PostModels.resolveTranslation<PostMediaTranslationVariant>)
       → audio variant URL dans preferredContentLanguages
       fallback : jouer original
  └─ BubbleTranslatedIndicator subtil sous chaque asset traduit (long-press → original)
```

## Design détaillé

### Section 1 — Extraction `ComposerLanguagePill` (SDK)

**Fichier nouveau** : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/ComposerLanguagePill.swift`

```swift
import SwiftUI

/// Pill compact "drapeau + code ISO + chevron + menu".
/// EXTRAIT de UniversalComposerBar.languageSelectorPill (apps/ios/.../UniversalComposerBar.swift:702-745)
/// pour réutilisation par le composer message ET le composer story.
public struct ComposerLanguagePill: View {

    public enum Style { case dark, light }

    let currentCode: String
    let availableLanguages: [TranslationLanguage]   // RÉUTILISE TranslationLanguage existant
    let onSelect: (String) -> Void
    var style: Style = .dark
    var showAutoBadge: Bool = false
    var disabled: Bool = false

    public var body: some View {
        Menu {
            // Sections : Vos langues (system+regional) / Langues fréquentes / Toutes…
            // Le contenu détaillé reste tel quel depuis l'implémentation extraite
            // (boutons checkmark, sections, etc.)
        } label: {
            HStack(spacing: 4) {
                Text(flagEmoji(for: currentCode))
                Text(currentCode.uppercased())
                    .font(.system(size: 12, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .bold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.thinMaterial, in: Capsule())
            .overlay(alignment: .bottom) {
                if showAutoBadge {
                    Text("auto").font(.system(size: 8)).foregroundStyle(.secondary).offset(y: 10)
                }
            }
            .opacity(disabled ? 0.5 : 1)
        }
        .disabled(disabled)
    }

    private func flagEmoji(for code: String) -> String {
        LanguageDisplay.from(code: code)?.flag ?? LanguageData.info(for: code)?.flag ?? "🏳️"
    }
}
```

**Refactor `UniversalComposerBar.swift:702-745`** : remplace la `private var languageSelectorPill` par appel à `ComposerLanguagePill(currentCode:, availableLanguages: TranslationLanguage.quickStrip, onSelect:, style: .dark)`. Comportement identique.

**Bénéfice** : 1 seul composant = 1 seul endroit pour évoluer (visual updates, a11y, animations), pas de drift.

### Section 2 — Extension VM : état langue active

**Modification `StoryComposerViewModel.swift` principal** (additions minimales) :

```swift
// Ajouts dans la classe :
@Published public private(set) var activeLanguage: String
@Published public private(set) var languageOrigin: LanguageOrigin = .user
public let textAnalyzer = TextAnalyzer()   // RÉUTILISE atome SDK

// Init (1 ligne après le init existant) :
self.activeLanguage = Self.resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
// Binding Combine :
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
        activeLanguage = code
        languageOrigin = .manual
    }

    /// Appelé à l'ouverture de l'éditeur d'un text object existant.
    /// Force `.manual` pour respecter la langue déjà choisie pour cet asset.
    public func adoptLanguageFromExistingAsset(_ code: String?) {
        guard let code, !code.isEmpty else { return }
        activeLanguage = code
        languageOrigin = .manual
    }

    /// Réutilise ComposerLanguageResolver.confidenceFloor (seuil 86%).
    internal func _languageBindingSink(detected: DetectedLanguage?, confidence: Double) {
        guard languageOrigin != .manual,
              let detected, confidence >= ComposerLanguageResolver.confidenceFloor,
              detected.code != activeLanguage
        else { return }
        activeLanguage = detected.code
        languageOrigin = .auto
    }
}
```

**Modifications `StoryComposerViewModel.swift` lignes 942 (`addText`) et 1087 (`addAudioObject`)** :

```swift
// Avant
sourceLanguage: detectedKeyboardLanguage
// Après
sourceLanguage: activeLanguage
```

**Tests TDD** (`Tests/MeeshySDKTests/Story/StoryComposerViewModelLanguageTests.swift`) — non-`@MainActor` (voir [[feedback_meeshyui_default_isolation]]) :

```
test_init_resolvesSystemLanguage_whenUserHasSystemLanguage
test_init_fallbacksToRegional_whenNoSystemLanguage
test_init_fallbacksToFR_whenNoLanguagesConfigured
test_overrideLanguage_setsOriginToManual_andStopsAutoDetection
test_updateLanguageFromText_switchesLanguage_whenAutoDetectionAbove86percent
test_updateLanguageFromText_doesNotSwitch_whenConfidenceBelow86percent
test_updateLanguageFromText_doesNotSwitch_whenOriginIsManual
test_adoptLanguageFromExistingAsset_forcesManual
test_addText_propagatesActiveLanguageToTextObject
test_addAudioObject_propagatesActiveLanguageToAudioObject
```

### Section 3 — Toolbar story : insertion + masquage chirurgical

**Modification `StoryComposerView.swift`** :

1. Insérer dans la toolbar story (à localiser exactement au Spike, structure existante) :
```swift
ComposerLanguagePill(
    currentCode: viewModel.activeLanguage,
    availableLanguages: TranslationLanguage.quickStrip,
    onSelect: viewModel.overrideLanguage,
    style: .dark,
    showAutoBadge: viewModel.languageOrigin == .auto,
    disabled: viewModel.isRecording   // greyed pendant enregistrement audio
)
```

2. **Split de la condition de masquage** (lignes 286-298 actuelles) :

```swift
// Avant
.opacity(viewModel.textEditingMode == .inactive ? 1 : 0)
.allowsHitTesting(viewModel.textEditingMode == .inactive)

// Après — split par cible :
// Top sidebar (édition outils texte) — reste masquée pour focus visuel
sidebarView
    .opacity(viewModel.shouldHideTopSidebar ? 0 : 1)
    .allowsHitTesting(!viewModel.shouldHideTopSidebar)

// Bottom toolbar (publish + LANGUAGE TOGGLE) — reste visible pendant édition text
bottomToolbarView
    .opacity(viewModel.shouldHideBottomToolbar ? 0 : 1)
    .allowsHitTesting(!viewModel.shouldHideBottomToolbar)
```

3. **Computed properties dans le VM** :

```swift
public var shouldHideTopSidebar: Bool { textEditingMode != .inactive }   // comportement actuel
public var shouldHideBottomToolbar: Bool { false }                       // toolbar bottom toujours visible
// Si certains outils texte nécessitent l'espace bas (ex: palette expanded), affiner :
// public var shouldHideBottomToolbar: Bool {
//     if case .active(_, let tool) = textEditingMode, tool?.requiresFullBottomSpace == true { return true }
//     return false
// }
```

**Bénéfice** : le `ComposerLanguagePill` est toujours accessible, l'auto-switch détection est observable en live par l'utilisateur (le pill passe `FR → EN` quand il bascule de langue dans la frappe).

### Section 4 — Wiring éditeur texte + audio recorder

**`StoryTextEditorView`** :

```swift
.onAppear {
    if let lang = textObject.sourceLanguage {
        viewModel.adoptLanguageFromExistingAsset(lang)  // force .manual
    }
}
.onChange(of: textObject.text) { _, newText in
    viewModel.updateLanguageFromText(newText)           // alimente TextAnalyzer
}
// onCommit / onDismiss :
textObject.sourceLanguage = viewModel.activeLanguage
```

**`StoryAudioRecorderView`** (à localiser au Spike) :

```swift
@State private var lockedLanguage: String?

private func startRecording() {
    lockedLanguage = viewModel.activeLanguage    // snapshot
    audioRecorderManager.start()
}

private func stopRecording() {
    audioRecorderManager.stop()
    let locked = lockedLanguage ?? viewModel.activeLanguage
    let audioObject = StoryAudioPlayerObject(/* … */, sourceLanguage: locked)
    media.transcription = ["language": locked]   // bootstrap pour Whisper
}

// Affichage au-dessus du bouton record :
if let locked = lockedLanguage {
    Text("Enregistrement en \(LanguageDisplay.from(code: locked)?.flag ?? "🌐") \(locked.uppercased())")
        .font(.caption).foregroundStyle(.secondary)
}
```

### Section 5 — Généralisation résolveur Prisme

**Modification `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:295`** :

```swift
// AVANT — privée + spécifique à APIPostTranslationEntry
private static func resolveTranslation(
    translations: [String: APIPostTranslationEntry]?,
    originalLanguage: String?,
    preferredLanguages: [String]
) -> String? { ... }

// APRÈS — protocol générique + fonction publique réutilisable par 4 call sites

public protocol TranslationVariant { }
extension String: TranslationVariant {}                                // text objects story
extension APIPostTranslationEntry: TranslationVariant {}              // text post root (existant)
extension APIAttachmentTranslation: TranslationVariant {}             // audio message
extension PostMediaTranslationVariant: TranslationVariant {}          // audio story

/// Prisme Linguistique — résolution variant depuis dict de traductions.
/// Règle 1 du Prisme : JAMAIS de fallback `.first` — `nil` si aucune match.
public func resolvePrismeTranslation<T: TranslationVariant>(
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

**Tests** : 4 call sites couverts par tests existants de `PostModels.resolveTranslation` + 3 nouveaux tests dédiés (text object, audio attachment, audio variant PostMedia).

### Section 6 — Backend : extension `PostTranslationService`

**Modification `services/gateway/src/services/posts/PostTranslationService.ts`** :

```typescript
class PostTranslationService {
  private static readonly TOP5 = ['en', 'fr', 'es', 'de', 'pt'];

  // Signature publique inchangée — dispatcher selon type
  async translatePost(post: Post & { effects: StoryEffects | null, media: PostMedia[] }): Promise<void> {
    const handlers: Promise<unknown>[] = [this.translateContentRoot(post)];
    if (post.type === 'story') {
      handlers.push(this.translateTextObjects(post), this.translateAudioObjects(post));
    }
    // if (post.type === 'mood') { handlers.push(this.translateMood(post)); }  // follow-up
    await Promise.allSettled(handlers);
  }

  private async translateContentRoot(post: Post): Promise<void> {
    // corps existant inchangé (refactor cosmetic en privé)
  }

  private async translateTextObjects(post: Post & { effects: StoryEffects | null }): Promise<void> {
    const textObjects = post.effects?.textObjects ?? [];
    for (const obj of textObjects) {
      if (!obj.text?.trim() || !obj.sourceLanguage) continue;

      const targets = PostTranslationService.TOP5.filter(l => l !== obj.sourceLanguage);
      // Idempotence : skip si déjà toutes traduites
      const existing = obj.translations ?? {};
      const missing = targets.filter(l => !existing[l]);
      if (missing.length === 0) continue;

      const newTrans = await zmqClient.translateToMultipleLanguages(
        obj.text, obj.sourceLanguage, missing
      );

      // Écrasement atomic du sous-objet (pattern PostAudioService)
      // Note : Prisma MongoDB supporte les nested updates via $set sur chemin imbriqué.
      // Si pas supporté nativement par notre version Prisma, fallback : read-modify-write
      // sur Post.effects entier (le translateTextObjects boucle séquentielle = pas de race).
      const merged = { ...existing, ...newTrans };
      await prisma.post.update({
        where: { id: post.id },
        data: {
          effects: updateTextObjectTranslations(post.effects!, obj.id, merged)
        }
      });
    }
  }

  private async translateAudioObjects(
    post: Post & { effects: StoryEffects | null, media: PostMedia[] }
  ): Promise<void> {
    const audioObjects = post.effects?.audioPlayerObjects ?? [];
    for (const obj of audioObjects) {
      const media = post.media.find(m => m.id === obj.mediaId);
      if (!media || !obj.sourceLanguage) continue;
      // Délègue à AudioTranslateService existant — supporte déjà postMediaId
      await audioTranslateService.translateSync(post.userId, {
        audioPath: media.fileUrl,
        postMediaId: media.id,                       // ZmqRequestSender route déjà sur ce champ
        sourceLanguage: obj.sourceLanguage,          // force Whisper côté translator
        targetLanguages: PostTranslationService.TOP5.filter(l => l !== obj.sourceLanguage),
        saveToDatabase: true,                        // AudioTranslateService persiste dans PostMedia
      });
    }
  }
}

// Helper pure (~10 lignes) — pas un nouveau module, inline dans le service
function updateTextObjectTranslations(
  effects: StoryEffects,
  objectId: string,
  translations: Record<string, string>
): StoryEffects {
  return {
    ...effects,
    textObjects: effects.textObjects.map(obj =>
      obj.id === objectId ? { ...obj, translations } : obj
    ),
  };
}
```

**Tests** (`PostTranslationService.test.ts`) :

```
translatePost_dispatchesOnlyContentRoot_whenPostTypeIsText
translatePost_dispatchesTextAndAudio_whenPostTypeIsStory
translateTextObjects_skipsEmptyText
translateTextObjects_skipsWhenSourceLanguageMissing
translateTextObjects_skipsLanguagesAlreadyTranslated_idempotent
translateTextObjects_dispatchesOneZmqCallPerObject_withMissingLanguagesOnly
translateAudioObjects_skipsWhenMediaNotFound
translateAudioObjects_skipsWhenSourceLanguageMissing
translateAudioObjects_delegatesToAudioTranslateService_withPostMediaId_andSourceLanguage
```

### Section 7 — Translator : force Whisper sur sourceLanguage

**Modification `services/translator/src/services/zmq_audio_handler.py:85`** (~3 lignes) :

```python
source_language = payload.get('sourceLanguage')   # NOUVEAU — priorité haute
user_language = payload.get('userLanguage')        # existant — fallback
forced_language = source_language or user_language

if forced_language:
    whisper_result = whisper.transcribe(audio_data, language=forced_language)
else:
    whisper_result = whisper.transcribe(audio_data)
```

**Tests pytest** :

```
test_handle_audio_uses_source_language_when_provided
test_handle_audio_falls_back_to_user_language_when_source_absent
test_handle_audio_auto_detects_when_both_absent
```

### Section 8 — iOS lecture (Prisme + indicateur)

**Story reader view model** (à localiser au Spike — `StoryReaderViewModel` ou équivalent) :

```swift
func displayedText(for textObject: StoryTextObject) -> String {
    resolvePrismeTranslation(
        translations: textObject.translations,
        sourceLanguage: textObject.sourceLanguage,
        preferredLanguages: preferredContentLanguages
    ) ?? textObject.text   // fallback original = sourceLanguage
}

func audioVariant(for audioObject: StoryAudioPlayerObject, media: PostMedia) -> PostMediaTranslationVariant? {
    resolvePrismeTranslation(
        translations: media.translations,
        sourceLanguage: audioObject.sourceLanguage,
        preferredLanguages: preferredContentLanguages
    )
}

func isTranslated(_ textObject: StoryTextObject) -> Bool {
    displayedText(for: textObject) != textObject.text
}
```

**Fichier nouveau** : `packages/MeeshySDK/Sources/MeeshyUI/Story/Views/BubbleTranslatedIndicator.swift` (~15 lignes, calqué sur `BubbleEditedIndicator`) :

```swift
struct BubbleTranslatedIndicator: View {
    let sourceLanguage: String
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 9, weight: .semibold))
            Text("traduit de \(LanguageDisplay.from(code: sourceLanguage)?.flag ?? "🌐")")
                .font(.system(size: 10, weight: .medium))
        }
        .foregroundStyle(.secondary)
    }
}
```

**Affichage** : sous chaque text object / audio asset où `isTranslated == true`. Long-press → toast/sheet avec texte original (réutilise pattern `handleFlagTap(code)` ligne 754 du `BubbleStandardLayout` si applicable, sinon micro-helper inline).

## Plan de livraison

### Phase 0 — Spike (0.25j) ⚠️ obligatoire

Audits rapides (la majorité des inconnues sont déjà levées par les 4 audits de la révision v2) :

1. Localisation exacte des fichiers `StoryAudioRecorderView` (composer) et `StoryReaderViewModel` (lecteur).
2. Audit `select` Prisma sur read paths posts : `transcription, translations, language` remontent-ils déjà sur `PostMedia` ? Si non, ajouter au `select` + audit response Fastify schema strip (voir [[feedback_fastify_schema_strips_fields]]).
3. Confirmer support Prisma MongoDB nested $set sur `Post.effects.textObjects.{id}.translations` (sinon read-modify-write, séquentiel = pas de race).
4. Audit `availableLanguages` UniversalComposerBar : actuellement `TranslationLanguage.quickStrip` ou autre ? Pour caler la migration sans régression.
5. Confirmer signature `AudioTranslateService.translateSync` accepte effectivement `postMediaId` (vu dans `ZmqRequestSender:130`, vérifier le `AudioTranslationOptions` type).

### Phase 1 — Backend + Translator (parallélisable, ~1j)

| Lot | Contenu | Estim. |
|---|---|---|
| **B1** | `PostTranslationService` : dispatcher type-aware + `translateTextObjects` + helper inline `updateTextObjectTranslations` + idempotence + tests | 0.5j |
| **B2** | `PostTranslationService.translateAudioObjects` : délégation à `AudioTranslateService.translateSync({ postMediaId, sourceLanguage, ... })` + tests | 0.25j |
| **B3** | `zmq_audio_handler.py` accepte `sourceLanguage` + tests pytest | 0.25j |

### Phase 2 — iOS écriture (parallélisable avec Phase 1, ~1.5j)

| Lot | Contenu | Estim. |
|---|---|---|
| **I1** | Extraction `ComposerLanguagePill` + refactor `UniversalComposerBar` + tests visuels snapshot inchangés | 0.5j |
| **I2** | `StoryComposerViewModel+Language.swift` extension + binding `TextAnalyzer` + tests | 0.5j |
| **I3** | Insertion `ComposerLanguagePill` toolbar story + split `shouldHideTopSidebar`/`shouldHideBottomToolbar` + wiring `StoryTextEditorView` + `StoryAudioRecorderView` snapshot + propagation `addText`/`addAudioObject` + tests | 0.5j |

### Phase 3 — iOS lecture (~0.75j)

| Lot | Contenu | Estim. |
|---|---|---|
| **R1** | Généralisation `PostModels.resolveTranslation` → `resolvePrismeTranslation<T>` + conformances + tests | 0.25j |
| **R2** | Story reader wiring résolveur + indicateur `BubbleTranslatedIndicator` + long-press original | 0.5j |

**MVP total : ~3.25 jours** (vs 4-6.5j de la révision v1, vs 9-11j du plan initial).

### Phase 4 — Polish (post-MVP, optionnel, ~0.5j)

- **Socket.IO push `post:asset-translation-ready`** : audit existence event posts, extension data avec `assetType`/`assetId` ; iOS écoute et patch store local sans recharger story. Aujourd'hui rafraîchit au pull-to-refresh = acceptable temporairement.
- **V2 ComposerLanguagePill** : option "Toutes les langues…" → `LanguagePickerSheet` (déjà existant, juste à câbler).

## Risques & mitigations

1. **Posts existants sans `sourceLanguage` sur textObjects** → traités comme `null`, pas de traduction. Acceptable, pas de migration.
2. **Perf — 20 text objects × 4 langues = 80 jobs ZMQ par publication** → `zmqClient.translateToMultipleLanguages` batche déjà (1 appel multi-target). Boucle séquentielle dans `translateTextObjects` car update Post.effects fait read-modify-write (si nested $set Mongo non supporté). Pour stories >10 text objects, considérer batch update si bottleneck (out-of-scope MVP).
3. **iOS Equatable footgun** (cf. [[feedback_swiftui_equatable_state_footgun]]) — state vit dans `viewModel`, pas dans la vue Toggle/Pill.
4. **Swift 6 isolation** sur extension `+Language` — `TextAnalyzer` est `@MainActor`. Tests **non-`@MainActor`** (voir [[feedback_meeshyui_default_isolation]]).
5. **Idempotence** : double-call de `translatePost` (retry réseau) — `translateTextObjects` skip via `existing[l]` check ; `translateAudioObjects` délègue à `AudioTranslateService` qui gère déjà ses propres garanties.
6. **Migration `UniversalComposerBar` vers `ComposerLanguagePill`** : risque régression visuelle sur composer message conversation (déjà en prod). Mitigation : snapshot tests existants doivent rester verts ; revue visuelle manuelle.
7. **Validation Zod côté gateway** : audit que `sourceLanguage` propagé n'est pas strippé par schéma response Fastify (voir [[feedback_fastify_schema_strips_fields]]).
8. **Prisma nested update** : si MongoDB nested $set sur `Post.effects.textObjects.{id}.translations` non supporté natif, fallback read-modify-write tout `Post.effects` séquentiel (déjà adopté dans le design). Pas un blocage.

## Out-of-scope explicite

- **Posts texte normaux** (non-stories) : déjà couverts par `translateContentRoot`, comportement inchangé.
- **Moods** : la méthode `translatePost` dispatche par `post.type` ; mood = follow-up sprint dédié (~0.25j) avec même pattern, structure prête.
- **Migration backfill** stories existantes : pas de rétro-traduction.
- **Sélection langue composer message conversation** : `UniversalComposerBar` a déjà sa logique (la migration vers `ComposerLanguagePill` est cosmétique, comportement préservé).
- **Voice cloning audio cross-langue** : géré par `AudioTranslateService` existant, pas de modif spécifique.
- **E2EE des stories** : hypothèse de travail "stories en clair côté serveur" (le PostTranslationService.translateContentRoot existant les traduit déjà sans déchiffrement). À confirmer Spike.
- **Tests E2E iOS** (composer → publish → lecture multilingue) : couverts par tests unitaires + intégration backend ; E2E Playwright/iOS séparé post-MVP.
- **Détecteur langue gateway centralisé** (`PostTranslationService.detectLanguage` regex naïve dupliqué dans `routes/translation.ts`) : factorisation dans `utils/language-detection.ts` recommandée mais pas requise par cette feature (l'auteur fournit `sourceLanguage` explicitement via la toolbar).

## Décisions cristallisées

- **Granularité** : per-asset
- **Timing audio** : choix langue AVANT enregistrement (force Whisper)
- **Cibles traduction** : top-5 langues globales
- **Style picker** : toggle inline dans toolbar story = composant SDK `ComposerLanguagePill` extrait de UniversalComposerBar
- **Détection auto** : réutilise `TextAnalyzer` + `ComposerLanguageResolver` (exact même fonction que UniversalComposerBar)
- **Toolbar visible pendant édition text** : split condition `shouldHideTopSidebar` / `shouldHideBottomToolbar`
- **Stockage** : pattern `MessageAttachment` (Json typé application-level, zéro nouveau modèle Prisma)
- **Pipeline audio** : `AudioTranslateService.translateSync` réutilisé tel quel (supporte déjà `postMediaId`)
- **Service traduction** : `PostTranslationService` étendu (dispatcher type-aware story/mood/default), pas de nouveau service
- **Résolveur Prisme** : 1 fonction générique `resolvePrismeTranslation<T>` + protocol `TranslationVariant`, généralisation de `PostModels.resolveTranslation`
- **Indicateur traduit** : `BubbleTranslatedIndicator` calqué sur `BubbleEditedIndicator`
- **Helper merge JSON** : éliminé, écrasement direct (pattern `PostAudioService`)
- **Polish** : Socket.IO realtime patch event reporté post-MVP, V2 picker `LanguagePickerSheet` reporté post-MVP
