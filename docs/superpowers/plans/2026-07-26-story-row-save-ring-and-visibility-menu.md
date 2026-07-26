# Anneau de sauvegarde sur la ligne de story + menu de visibilité — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans « Mes stories », le `⋯` de chaque ligne devient un anneau de progression % pendant la sauvegarde de la story dans la photothèque et redevient `⋯` à la fin ; le menu renomme « Éditer les vues » en « Listing des vues » et gagne un sous-menu « Modifier la visibilité » à 6 modes.

**Architecture:** Un nouveau singleton `@MainActor` `StoryPhotoSaveService` porte l'état des sauvegardes en vol (`storyId → progression`), survit à la fermeture de la sheet et orchestre bake MP4 → écriture Photos → toast. La ligne `MyStoryRow` l'observe et échange son glyphe contre un anneau tappable (tap = annulation). Le sous-menu de visibilité réutilise l'enum `PostVisibility` et le picker `AudienceUserPickerView` déjà présents dans le SDK, et écrit via `PUT /posts/:postId` que le gateway sait déjà traiter.

**Tech Stack:** Swift 6.2 / SwiftUI (iOS 16+), XCTest, XcodeGen, MeeshySDK (SPM local).

**Spec de référence :** `docs/superpowers/specs/2026-07-26-story-row-save-ring-and-visibility-menu-design.md`

## Global Constraints

- **Jamais `xcodebuild` à la main pour le dev courant** — utiliser `./apps/ios/meeshy.sh`. Le SDK a sa propre commande (voir ci-dessous).
- **Nouveaux fichiers `.swift` sous `apps/ios/Meeshy/`** : auto-inclus par `xcodegen generate` (globbing récursif). **Ne jamais éditer `project.pbxproj` à la main.** `meeshy.sh` ne lance PAS xcodegen : après avoir créé un fichier, lancer `cd apps/ios && xcodegen generate && cd -` avant de builder localement, puis **ne pas committer** le churn de `project.pbxproj` / `Meeshy.xcscheme` / `Package.resolved` (`git checkout --` dessus).
- **Pas de `.onChange` SwiftUI brut** — utiliser `adaptiveOnChange`.
- **Pas de `try?`** — `do/catch` avec log via `Logger.stories`.
- **Jamais `git commit --amend`** ni `git stash` nu (worktree partagé). Commits **sélectifs par pathspec** : `git commit -- <fichiers>`.
- **Pas de trailer `Co-Authored-By`** dans les messages de commit.
- **Assertions de tests indépendantes de la locale** : ne jamais comparer un `String(localized:)` à un littéral français — la CI tourne en `en`. Asserter sur la structure (présence d'un nombre, égalité avec la variante « sans suffixe »), pas sur les mots.
- **Compteurs d'appels en delta, jamais en absolu** — l'app hôte tourne pendant la suite de tests.
- **Emplacement des tests app** : `apps/ios/MeeshyTests/Unit/{Services,ViewModels,Views}/`. Emplacement des tests SDK : `packages/MeeshySDK/Tests/MeeshySDKTests/`.
- **Nommage** : services `{Function}Manager` ou `{Function}Service`, protocoles de capacité en `-ing`, booléens qui se lisent comme une assertion.
- **Ne pas toucher** au viewer plein écran (`StoryViewerView`), au chemin « Partager », ni à `ActiveUploadRow`.

**Commandes de vérification :**

```bash
# Tests app iOS (phasés) — depuis la racine du repo
./apps/ios/meeshy.sh test

# Tests SDK (xcodebuild requis — swift test ne linke pas UIKit)
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshySDKTests/<SuiteName>
```

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift` | **Créé.** Deux helpers purs partagés par les deux chemins d'export : résolution de la langue à graver et fabrication de l'identité du préambule. | 1 |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift` | **Modifié.** Délègue `prepare` et l'intro aux helpers ci-dessus (suppression de la duplication). | 1 |
| `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift` | **Créé.** Singleton d'état des sauvegardes en vol + orchestration bake → Photos → toast. Contient aussi `StorySaveProgressMapper` (pur). | 2 |
| `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` | **Modifié.** Anneau dans `MyStoryRow`, câblage du menu « Enregistrer », sous-menu de visibilité, picker d'audience. Contient les résolveurs purs `MyStoryRowAccessibility` et `StoryVisibilityMenuResolver`. | 3, 6 |
| `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift` | **Modifié.** Suppression du mode `.saveToPhotos` — redevient une sheet de partage pure. | 3 |
| `apps/ios/Meeshy/Localizable.xcstrings` | **Modifié.** Nouvelles clés + renommage de `story.mine.viewers`. | 3, 6 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | **Modifié.** `APIPost.visibilityUserIds` décodé. | 4 |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | **Modifié.** `StoryItem.visibility` devient `var`, ajout de `visibilityUserIds`, propagation. | 4 |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` | **Modifié.** `update(...)` transmet enfin `visibilityUserIds`. | 4 |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | **Modifié.** `applyVisibility(storyId:visibility:userIds:)` avec rollback. | 5 |

---

## Task 1 : Helpers d'export partagés (langue + identité)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift` (méthodes `prepare` ~L71-85, `currentUserBrandIntro` ~L95-107, `init` ~L58-64)
- Test: `apps/ios/MeeshyTests/Unit/Services/StoryExportPreflightTests.swift`

**Interfaces:**
- Consumes: `StoryItem`, `StoryTranslation`, `StoryExportIntroContent`, `AuthManager.shared`, `DynamicColorGenerator` (tous existants).
- Produces:
  - `StoryExportLanguageResolver.availableLanguages(story: StoryItem) -> [String]`
  - `StoryExportLanguageResolver.defaultLanguage(available: [String], preferred: [String]) -> String?`
  - `StoryExportIntroFactory.currentUser() -> StoryExportIntroContent?` (`@MainActor`)

**Pourquoi :** le chemin « Enregistrer » perd sa sheet (donc son sélecteur de langue) et doit résoudre la langue tout seul, avec exactement la règle du chemin « Partager ». Deux implémentations divergentes graveraient des langues différentes selon le bouton. `currentUserBrandIntro` est aujourd'hui `private static` dans le VM : le service en a besoin aussi.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Services/StoryExportPreflightTests.swift` :

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - StoryExportPreflightTests
//
// Règle de résolution de la langue gravée, partagée par « Partager » (sheet
// avec sélecteur) et « Enregistrer » (sans sheet, résolution automatique).
// Deux implémentations divergentes graveraient des langues différentes selon
// le bouton — d'où l'extraction en helper pur testé ici.

@MainActor
final class StoryExportPreflightTests: XCTestCase {

    private func makeStory(translations: [StoryTranslation]?) -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects(),
                  translations: translations)
    }

    // MARK: availableLanguages

    func test_availableLanguages_preservesPayloadOrder() {
        let story = makeStory(translations: [
            StoryTranslation(language: "fr", content: "Bonjour"),
            StoryTranslation(language: "en", content: "Hello"),
            StoryTranslation(language: "es", content: "Hola"),
        ])
        XCTAssertEqual(StoryExportLanguageResolver.availableLanguages(story: story), ["fr", "en", "es"])
    }

    func test_availableLanguages_dropsDuplicates() {
        let story = makeStory(translations: [
            StoryTranslation(language: "fr", content: "Bonjour"),
            StoryTranslation(language: "fr", content: "Salut"),
            StoryTranslation(language: "en", content: "Hello"),
        ])
        XCTAssertEqual(StoryExportLanguageResolver.availableLanguages(story: story), ["fr", "en"])
    }

    func test_availableLanguages_nilTranslations_isEmpty() {
        XCTAssertEqual(StoryExportLanguageResolver.availableLanguages(story: makeStory(translations: nil)), [])
    }

    // MARK: defaultLanguage

    func test_defaultLanguage_preferredPresent_isSelected() {
        XCTAssertEqual(
            StoryExportLanguageResolver.defaultLanguage(available: ["fr", "en"], preferred: ["en", "fr"]),
            "en"
        )
    }

    func test_defaultLanguage_preferredAbsent_fallsBackToOriginal() {
        XCTAssertNil(StoryExportLanguageResolver.defaultLanguage(available: ["fr", "en"], preferred: ["de"]))
    }

    func test_defaultLanguage_noAvailable_fallsBackToOriginal() {
        XCTAssertNil(StoryExportLanguageResolver.defaultLanguage(available: [], preferred: ["fr"]))
    }

    func test_defaultLanguage_noPreferred_fallsBackToOriginal() {
        XCTAssertNil(StoryExportLanguageResolver.defaultLanguage(available: ["fr"], preferred: []))
    }

    /// La première préférence GAGNE, même si une préférence plus tardive est
    /// aussi disponible — sinon l'ordre de préférence de l'utilisateur ne
    /// voudrait rien dire.
    func test_defaultLanguage_firstPreferenceWins() {
        XCTAssertEqual(
            StoryExportLanguageResolver.defaultLanguage(available: ["fr", "en"], preferred: ["fr", "en"]),
            "fr"
        )
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : **échec de compilation** — `cannot find 'StoryExportLanguageResolver' in scope`. C'est le mode d'échec attendu (`** TEST FAILED **` / exit 65 = échec de compile, cf. `apps/ios/CLAUDE.md`).

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift` :

```swift
import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportPreflight
//
// Décisions prises AVANT le bake d'un MP4 de story, partagées par les deux
// chemins d'export :
//   - « Partager »   → StoryExportShareSheet (sélecteur de langue explicite)
//   - « Enregistrer » → StoryPhotoSaveService (aucune sheet, tout est résolu ici)
//
// Extraites en helpers purs parce que deux implémentations divergentes
// graveraient des langues (ou des identités) différentes selon le bouton pressé.

/// Résolution de la langue gravée dans le MP4 (Prisme Linguistique).
enum StoryExportLanguageResolver {

    /// Langues effectivement disponibles à graver, dans l'ordre du payload,
    /// sans doublon. Une story sans `translations` n'en propose aucune : le
    /// renderer retombe alors sur le texte source.
    static func availableLanguages(story: StoryItem) -> [String] {
        var langs: [String] = []
        for translation in story.translations ?? [] where !langs.contains(translation.language) {
            langs.append(translation.language)
        }
        return langs
    }

    /// Première langue préférée de l'utilisateur qui figure parmi `available`.
    /// `nil` = graver le texte original (aucune préférence ne correspond).
    static func defaultLanguage(available: [String], preferred: [String]) -> String? {
        preferred.first { available.contains($0) }
    }
}

/// Identité peinte sur le préambule de marque de l'export.
///
/// L'export est réservé à l'auteur (`railPlan.showsExport == isOwnStory`) :
/// l'auteur de la story et celui qui l'exporte sont la même personne, donc
/// l'utilisateur courant EST l'identité à graver. Avatar et bannière restent
/// `nil` — le préambule retombe alors sur la couleur d'accent, et les charger
/// demanderait un aller-retour cache asynchrone que le bake n'a pas à attendre.
enum StoryExportIntroFactory {

    @MainActor
    static func currentUser() -> StoryExportIntroContent? {
        guard let user = AuthManager.shared.currentUser else { return nil }
        let display = [user.firstName, user.lastName]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        return StoryExportIntroContent(
            displayName: display.isEmpty ? user.username : display,
            username: user.username,
            accentColorHex: DynamicColorGenerator.colorForName(user.username)
        )
    }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : `StoryExportPreflightTests` **vert** (7 tests).

- [ ] **Step 5: Rebrancher `StoryExportShareViewModel` sur les helpers**

Dans `apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift` :

Remplacer le corps de `prepare(story:)` par :

```swift
    func prepare(story: StoryItem) {
        let langs = StoryExportLanguageResolver.availableLanguages(story: story)
        availableLanguages = langs
        selectedLanguage = StoryExportLanguageResolver.defaultLanguage(
            available: langs,
            preferred: AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        )
    }
```

Supprimer entièrement la méthode `private static func currentUserBrandIntro()` (et son bloc de documentation), puis dans `init` remplacer :

```swift
        self.brandIntro = brandIntro ?? Self.currentUserBrandIntro
```

par :

```swift
        self.brandIntro = brandIntro ?? StoryExportIntroFactory.currentUser
```

> Note : le comportement change sur un point mineur et **volontaire** — `prepare` consultait uniquement `preferredContentLanguages.first` ; il consulte désormais toute la liste dans l'ordre. C'est la même intention (respecter l'ordre de préférence), en mieux.

- [ ] **Step 6: Lancer les tests de régression du chemin « Partager »**

```bash
./apps/ios/meeshy.sh test
```

Attendu : `StoryExportShareViewModelTests` et `StoryExportBrandIntroTests` restent **verts** (le VM se comporte à l'identique, il délègue seulement).

- [ ] **Step 7: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null || true
git add apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift \
        apps/ios/MeeshyTests/Unit/Services/StoryExportPreflightTests.swift
git commit -m "refactor(ios/story): extrait la résolution de langue et l'identité d'export en helpers purs

Le chemin « Enregistrer » va perdre sa sheet et doit résoudre la langue gravée
tout seul, avec exactement la règle du chemin « Partager ». Deux implémentations
divergentes graveraient des langues différentes selon le bouton." \
  -- apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift \
     apps/ios/MeeshyTests/Unit/Services/StoryExportPreflightTests.swift \
     apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift
```

---

## Task 2 : `StoryPhotoSaveService` — état et orchestration de la sauvegarde

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/StoryPhotoSaveServiceTests.swift`

**Interfaces:**
- Consumes: `StoryExportLanguageResolver`, `StoryExportIntroFactory` (Task 1) ; `StoryVideoExportServiceProviding` (protocole existant : `prepareExport(slide:languages:watermark:intro:onProgress:onPhaseChange:) async -> URL?` et `cleanupExport(at:)`) ; `PhotoLibrarySaving` (protocole existant dans `MediaSaveCoordinator.swift`, `func saveVideo(at url: URL) async throws`) ; `PhotoLibraryManagerAdapter` ; `FeedbackToastSurfacing` ; `StoryItem.toRenderableSlide(preferredLanguages:)` ; `MeeshyExportWatermark.make(username:)`.
- Produces:
  - `StorySaveProgressMapper.bakeShare: Double` (= 0.9)
  - `StorySaveProgressMapper.bake(_ fraction: Double) -> Double`
  - `StoryPhotoSaveService.shared`
  - `StoryPhotoSaveService.init(exporter:photoSaver:toasts:preferredLanguages:intro:)`
  - `StoryPhotoSaveService.progress(for storyId: String) -> Double?`
  - `StoryPhotoSaveService.save(story: StoryItem)`
  - `StoryPhotoSaveService.cancel(storyId: String)`
  - `@Published private(set) var jobs: [String: Double]`

**Pourquoi un singleton :** `StoryExportShareViewModel` est un `@StateObject` de `MyStoriesView`, elle-même une sheet. La fermer détruit le VM ; le `Task` du bake garde `[weak self]`, donc le résultat tardif est silencieusement jeté. Un anneau censé survivre à la navigation ne peut pas s'appuyer sur un état à durée de vie de vue.

- [ ] **Step 1: Écrire le test qui échoue (mapper de progression)**

Créer `apps/ios/MeeshyTests/Unit/Services/StoryPhotoSaveServiceTests.swift` :

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - StorySaveProgressMapperTests

/// Le bake occupe 0…90 % de l'anneau, l'écriture Photos les 10 % restants.
/// Sans ce découpage l'anneau atteindrait 100 % avant que la vidéo ne soit
/// dans la photothèque — l'utilisateur croirait l'enregistrement terminé.
final class StorySaveProgressMapperTests: XCTestCase {

    func test_bake_zero_isZero() {
        XCTAssertEqual(StorySaveProgressMapper.bake(0), 0, accuracy: 0.0001)
    }

    func test_bake_full_stopsAtBakeShare() {
        XCTAssertEqual(StorySaveProgressMapper.bake(1), 0.9, accuracy: 0.0001)
    }

    func test_bake_half_isHalfOfBakeShare() {
        XCTAssertEqual(StorySaveProgressMapper.bake(0.5), 0.45, accuracy: 0.0001)
    }

    func test_bake_clampsAboveOne() {
        XCTAssertEqual(StorySaveProgressMapper.bake(1.5), 0.9, accuracy: 0.0001)
    }

    func test_bake_clampsBelowZero() {
        XCTAssertEqual(StorySaveProgressMapper.bake(-0.2), 0, accuracy: 0.0001)
    }
}
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : échec de compilation, `cannot find 'StorySaveProgressMapper' in scope`.

- [ ] **Step 3: Écrire le service complet**

Créer `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift` :

```swift
import Foundation
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - StorySaveProgressMapper

/// Découpage de l'anneau affiché sur la ligne « Mes stories ».
///
/// Le bake MP4 occupe 0…90 %, l'écriture dans la photothèque les 10 % restants.
/// Sans ce découpage, l'anneau atteindrait 100 % à la fin du bake — soit avant
/// que la vidéo n'existe dans Photos — et l'utilisateur croirait à tort que
/// l'enregistrement est terminé.
enum StorySaveProgressMapper {

    /// Part de l'anneau attribuée au bake.
    static let bakeShare: Double = 0.9

    /// Mappe une fraction de bake `0…1` (bornée) sur `0…bakeShare`.
    static func bake(_ fraction: Double) -> Double {
        min(max(fraction, 0), 1) * bakeShare
    }
}

// MARK: - StoryPhotoSaveService

/// Sauvegardes de stories vers la photothèque actuellement en vol.
///
/// Singleton et NON `@StateObject` d'une vue : `MyStoriesView` est une sheet,
/// et sa fermeture détruirait un état de vue — le `Task` du bake garde
/// `[weak self]`, donc le résultat tardif partirait à la poubelle en silence.
/// L'anneau doit survivre à la fermeture de la sheet et à la navigation, donc
/// l'état vit ici. Même patron que `StoryPublishService.shared`.
///
/// Orchestration app-side (SDK purity) : le SDK bake, ce service décide de
/// l'enchaînement bake → Photos → toast et de ce qui s'affiche.
@MainActor
final class StoryPhotoSaveService: ObservableObject {

    static let shared = StoryPhotoSaveService()

    /// `storyId → progression 0…1`. L'absence de clé signifie « aucune
    /// sauvegarde en vol pour cette story » : c'est ce que la ligne lit pour
    /// choisir entre le glyphe `⋯` et l'anneau.
    @Published private(set) var jobs: [String: Double] = [:]

    private var tasks: [String: Task<Void, Never>] = [:]

    private let exporter: StoryVideoExportServiceProviding
    private let photoSaver: PhotoLibrarySaving
    private let toasts: FeedbackToastSurfacing
    private let preferredLanguages: @MainActor () -> [String]
    private let intro: @MainActor () -> StoryExportIntroContent?

    init(
        exporter: StoryVideoExportServiceProviding? = nil,
        photoSaver: PhotoLibrarySaving = PhotoLibraryManagerAdapter(),
        toasts: FeedbackToastSurfacing? = nil,
        preferredLanguages: (@MainActor () -> [String])? = nil,
        intro: (@MainActor () -> StoryExportIntroContent?)? = nil
    ) {
        // `StoryVideoExportService.shared` et `FeedbackToastManager.shared`
        // sont `@MainActor`-isolés : impossible en expression de valeur par
        // défaut, résolus ici.
        self.exporter = exporter ?? StoryVideoExportService.shared
        self.photoSaver = photoSaver
        self.toasts = toasts ?? FeedbackToastManager.shared
        self.preferredLanguages = preferredLanguages
            ?? { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
        self.intro = intro ?? StoryExportIntroFactory.currentUser
    }

    // MARK: - Lecture

    /// Progression `0…1` de la sauvegarde en vol, `nil` si aucune.
    func progress(for storyId: String) -> Double? { jobs[storyId] }

    // MARK: - Actions

    /// Bake la story en MP4 puis l'écrit dans la photothèque, en publiant la
    /// progression sur `jobs[story.id]`. Idempotent : un second appel pendant
    /// qu'un job tourne pour la même story est ignoré (le menu reste
    /// atteignable via le long-press pendant l'export).
    func save(story: StoryItem) {
        guard jobs[story.id] == nil else { return }

        let available = StoryExportLanguageResolver.availableLanguages(story: story)
        let language = StoryExportLanguageResolver.defaultLanguage(
            available: available,
            preferred: preferredLanguages()
        )
        let languages: [String] = language.map { [$0] } ?? []
        let slide = story.toRenderableSlide(preferredLanguages: languages)
        let watermark = MeeshyExportWatermark.make(username: AuthManager.shared.currentUser?.username)
        // Résolu sur le MainActor AVANT d'entrer dans le Task : c'est ce qui
        // permet d'injecter une identité en test au lieu de recapturer le
        // singleton d'authentification.
        let introContent = intro()
        let storyId = story.id

        jobs[storyId] = 0

        let task = Task { [weak self] in
            guard let self else { return }
            let url = await self.exporter.prepareExport(
                slide: slide,
                languages: languages,
                watermark: watermark,
                intro: introContent,
                onProgress: { [weak self] fraction in
                    guard let self, self.jobs[storyId] != nil else { return }
                    self.jobs[storyId] = StorySaveProgressMapper.bake(fraction)
                },
                onPhaseChange: nil
            )

            // Annulation pendant le bake : `AVAssetWriter` n'observe pas
            // `Task.isCancelled`, donc le MP4 peut arriver APRÈS le cancel.
            // On le nettoie sans rien afficher — `cancel(storyId:)` a déjà
            // retiré le job et posé son toast.
            guard !Task.isCancelled else {
                if let url { self.exporter.cleanupExport(at: url) }
                return
            }

            guard let url else {
                self.finish(storyId: storyId)
                self.toasts.showError(String(
                    localized: "story.mine.save.failed",
                    defaultValue: "L'export de la story a échoué. Réessayez."
                ))
                return
            }

            self.jobs[storyId] = StorySaveProgressMapper.bakeShare

            do {
                try await self.photoSaver.saveVideo(at: url)
                self.jobs[storyId] = 1
                self.exporter.cleanupExport(at: url)
                self.finish(storyId: storyId)
                HapticFeedback.medium()
                self.toasts.showSuccess(String(
                    localized: "story.mine.save.success",
                    defaultValue: "Vidéo enregistrée dans Photos"
                ))
            } catch {
                Logger.stories.error(
                    "story save to photos failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                self.exporter.cleanupExport(at: url)
                self.finish(storyId: storyId)
                self.toasts.showError(String(
                    localized: "story.mine.save.photosDenied",
                    defaultValue: "Impossible d'enregistrer dans Photos. Vérifie l'autorisation Photos de Meeshy dans Réglages."
                ))
            }
        }
        tasks[storyId] = task
    }

    /// Annule la sauvegarde en vol : la ligne retrouve son `⋯` immédiatement.
    /// Le MP4 déjà baké (s'il arrive après coup) est nettoyé par le `Task`.
    func cancel(storyId: String) {
        guard jobs[storyId] != nil else { return }
        tasks[storyId]?.cancel()
        finish(storyId: storyId)
        toasts.showSuccess(String(
            localized: "story.mine.save.cancelled",
            defaultValue: "Export annulé"
        ))
    }

    // MARK: - Privé

    private func finish(storyId: String) {
        jobs[storyId] = nil
        tasks[storyId] = nil
    }
}
```

- [ ] **Step 4: Lancer pour vérifier que le mapper passe**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : `StorySaveProgressMapperTests` **vert** (5 tests).

- [ ] **Step 5: Écrire les tests du cycle de vie du service**

Ajouter à la fin de `apps/ios/MeeshyTests/Unit/Services/StoryPhotoSaveServiceTests.swift` :

```swift
// MARK: - Doubles

/// Exporteur pilotable : publie une suite de fractions puis rend (ou non) une URL.
/// Distinct de `MockShareExporter` (StoryExportShareViewModelTests) parce que ce
/// service a besoin de scripter la progression, pas seulement le résultat.
@MainActor
final class ScriptedStoryExporter: StoryVideoExportServiceProviding {

    enum Outcome { case success, failure }

    var outcome: Outcome = .success
    /// Fractions publiées via `onProgress` avant de rendre le résultat.
    var progressScript: [Double] = []

    private(set) var prepareCallCount = 0
    private(set) var cleanupCallCount = 0
    private(set) var lastLanguages: [String] = []
    private(set) var lastCleanupURL: URL?
    private(set) var lastBakedURL: URL?

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        prepareCallCount += 1
        lastLanguages = languages
        for fraction in progressScript { onProgress?(fraction) }

        switch outcome {
        case .success:
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("scripted-save-\(UUID().uuidString).mp4")
            do { try Data().write(to: url) } catch { XCTFail("temp write failed: \(error)") }
            lastBakedURL = url
            return url
        case .failure:
            return nil
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
        lastCleanupURL = url
        do { try FileManager.default.removeItem(at: url) } catch { /* déjà absent */ }
    }
}

/// Photothèque simulée. `MockPhotoLibrarySaver` (MediaSaveCoordinatorTests) est
/// `private` à son fichier — d'où ce double dédié.
final class StubPhotoSaver: PhotoLibrarySaving, @unchecked Sendable {

    enum Failure: Error { case denied }

    var shouldFail = false
    private(set) var savedVideoURLs: [URL] = []

    func saveImage(_ data: Data) async throws {}

    func saveVideo(at url: URL) async throws {
        savedVideoURLs.append(url)
        if shouldFail { throw Failure.denied }
    }
}

// MARK: - StoryPhotoSaveServiceTests

@MainActor
final class StoryPhotoSaveServiceTests: XCTestCase {

    private func makeSUT() -> (
        sut: StoryPhotoSaveService,
        exporter: ScriptedStoryExporter,
        photos: StubPhotoSaver,
        toasts: MockFeedbackToast
    ) {
        let exporter = ScriptedStoryExporter()
        let photos = StubPhotoSaver()
        let toasts = MockFeedbackToast()
        let sut = StoryPhotoSaveService(
            exporter: exporter,
            photoSaver: photos,
            toasts: toasts,
            preferredLanguages: { ["fr"] },
            intro: { nil }
        )
        return (sut, exporter, photos, toasts)
    }

    private func makeStory(translations: [StoryTranslation]? = nil) -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects(textObjects: [StoryTextObject(text: "Hello")]),
                  translations: translations)
    }

    /// Draine la file du MainActor jusqu'à ce que le job disparaisse, avec une
    /// borne dure : sans borne, un test rouge tournerait jusqu'au timeout xctest.
    private func waitUntilIdle(_ sut: StoryPhotoSaveService, storyId: String) async {
        for _ in 0..<200 {
            if sut.progress(for: storyId) == nil { return }
            await Task.yield()
        }
        XCTFail("le job n'a jamais été retiré pour \(storyId)")
    }

    // MARK: Succès

    func test_save_success_writesToPhotosThenClearsJob() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(photos.savedVideoURLs.count, 1)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.successMessages.count, 1)
        XCTAssertTrue(toasts.errorMessages.isEmpty)
        XCTAssertEqual(exporter.cleanupCallCount, 1, "le MP4 temporaire doit être nettoyé après l'écriture Photos")
    }

    /// La langue gravée est résolue automatiquement (le chemin « Enregistrer »
    /// n'a plus de sheet) : la préférence n'est honorée que si la story la porte.
    func test_save_bakesPreferredLanguageWhenAvailable() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory(translations: [StoryTranslation(language: "fr", content: "Bonjour")])

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastLanguages, ["fr"])
    }

    func test_save_bakesOriginalWhenPreferredUnavailable() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory(translations: [StoryTranslation(language: "de", content: "Hallo")])

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.lastLanguages, [], "aucune préférence disponible → texte original")
    }

    // MARK: Progression

    /// Le bake ne doit JAMAIS pousser l'anneau au-delà de 90 % : les 10 %
    /// restants appartiennent à l'écriture Photos.
    func test_save_bakeProgressNeverExceedsBakeShare() async {
        let (sut, exporter, photos, _) = makeSUT()
        exporter.progressScript = [0.25, 0.5, 1.0]
        photos.shouldFail = false
        let story = makeStory()

        var observed: [Double] = []
        let cancellable = sut.$jobs.sink { jobs in
            if let value = jobs[story.id] { observed.append(value) }
        }
        defer { cancellable.cancel() }

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        let duringBake = observed.filter { $0 < 1 }
        XCTAssertFalse(duringBake.isEmpty, "au moins une valeur de progression doit être publiée")
        XCTAssertTrue(duringBake.allSatisfy { $0 <= StorySaveProgressMapper.bakeShare + 0.0001 },
                      "progressions observées : \(observed)")
    }

    // MARK: Échecs

    func test_save_bakeFailure_clearsJobAndShowsError() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        exporter.outcome = .failure
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertTrue(photos.savedVideoURLs.isEmpty)
        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertTrue(toasts.successMessages.isEmpty)
    }

    func test_save_photosFailure_clearsJobCleansFileAndShowsError() async {
        let (sut, exporter, photos, toasts) = makeSUT()
        photos.shouldFail = true
        let story = makeStory()

        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertTrue(toasts.successMessages.isEmpty)
        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "un échec Photos ne doit pas laisser le MP4 temporaire derrière lui")
    }

    // MARK: Idempotence et annulation

    func test_save_twiceForSameStory_startsOnlyOneExport() async {
        let (sut, exporter, _, _) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        sut.save(story: story)
        await waitUntilIdle(sut, storyId: story.id)

        XCTAssertEqual(exporter.prepareCallCount, 1)
    }

    func test_cancel_clearsJobImmediately() async {
        let (sut, _, _, toasts) = makeSUT()
        let story = makeStory()

        sut.save(story: story)
        XCTAssertNotNil(sut.progress(for: story.id), "le job doit exister dès l'appel à save")

        sut.cancel(storyId: story.id)

        XCTAssertNil(sut.progress(for: story.id))
        XCTAssertEqual(toasts.successMessages.count, 1, "l'annulation est confirmée par un toast")
    }

    func test_cancel_unknownStory_isNoOp() {
        let (sut, _, _, toasts) = makeSUT()
        sut.cancel(storyId: "inexistante")
        XCTAssertTrue(toasts.successMessages.isEmpty)
        XCTAssertTrue(toasts.errorMessages.isEmpty)
    }
}
```

Ajouter `import Combine` en tête du fichier de test (nécessaire pour `sink`).

- [ ] **Step 6: Lancer les tests**

```bash
./apps/ios/meeshy.sh test
```

Attendu : `StoryPhotoSaveServiceTests` **vert** (9 tests) + `StorySaveProgressMapperTests` vert (5 tests).

- [ ] **Step 7: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null || true
git commit -m "feat(ios/story): service de sauvegarde photothèque avec progression observable

L'état des sauvegardes en vol vit dans un singleton, pas dans un @StateObject de
MyStoriesView : fermer la sheet détruisait le VM et le résultat tardif du bake
partait en silence. Le bake occupe 0…90 % de la progression, l'écriture Photos
les 10 % restants — sinon l'anneau afficherait 100 % avant que la vidéo existe." \
  -- apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift \
     apps/ios/MeeshyTests/Unit/Services/StoryPhotoSaveServiceTests.swift
```

---

## Task 3 : Anneau sur la ligne + suppression de la sheet de sauvegarde

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` (états ~L40-46, sheets ~L204-209, menu ~L310-314, `MyStoryRow` ~L422-515)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift` (enum `Mode` L16, `resolveActivityURL` L25-27, `adaptiveOnChange` L59-74, titre/sous-titre/CTA L43-45, L115-119, L200-202)
- Modify: `apps/ios/MeeshyTests/Unit/Views/MyStoriesBulkDeleteGuardTests.swift` (test `test_resolveActivityURL_saveToPhotos_neverPresentsShareSheet` ~L91)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`
- Test: `apps/ios/MeeshyTests/Unit/Views/MyStoryRowSaveRingTests.swift`

**Interfaces:**
- Consumes: `StoryPhotoSaveService.shared`, `StoryPhotoSaveService.progress(for:)`, `StoryPhotoSaveService.save(story:)`, `StoryPhotoSaveService.cancel(storyId:)` (Task 2).
- Produces: `MyStoryRowAccessibility.label(base: String, saveProgress: Double?) -> String`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/MyStoryRowSaveRingTests.swift` :

```swift
import XCTest
@testable import Meeshy

// MARK: - MyStoryRowSaveRingTests
//
// La ligne est `.accessibilityElement(children: .ignore)` : un bouton enfant
// (l'anneau) serait avalé par le rotor. La progression doit donc remonter dans
// le libellé de la LIGNE, pas dans celui de l'anneau.
//
// Assertions volontairement indépendantes de la locale : la CI tourne en `en`,
// comparer à un littéral français rendrait ces tests verts en local et rouges
// en CI.

final class MyStoryRowSaveRingTests: XCTestCase {

    func test_label_noSaveInFlight_returnsBaseUnchanged() {
        XCTAssertEqual(MyStoryRowAccessibility.label(base: "BASE", saveProgress: nil), "BASE")
    }

    func test_label_saveInFlight_keepsBaseAsPrefix() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.43)
        XCTAssertTrue(label.hasPrefix("BASE"), "libellé obtenu : \(label)")
        XCTAssertGreaterThan(label.count, "BASE".count, "un suffixe de progression doit être ajouté")
    }

    func test_label_saveInFlight_carriesPercentValue() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.43)
        XCTAssertTrue(label.contains("43"), "libellé obtenu : \(label)")
    }

    func test_label_roundsPercentToNearest() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.435)
        XCTAssertTrue(label.contains("44"), "libellé obtenu : \(label)")
    }

    func test_label_zeroProgress_carriesZero() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0)
        XCTAssertTrue(label.contains("0"), "libellé obtenu : \(label)")
    }

    func test_label_fullProgress_carriesHundred() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 1)
        XCTAssertTrue(label.contains("100"), "libellé obtenu : \(label)")
    }
}
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : échec de compilation, `cannot find 'MyStoryRowAccessibility' in scope`.

- [ ] **Step 3: Ajouter le composeur d'accessibilité**

Dans `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`, juste avant `// MARK: - Row` (avant `private struct MyStoryRow`) :

```swift
// MARK: - Row accessibility

/// Composition du libellé VoiceOver de la ligne.
///
/// La ligne est `.accessibilityElement(children: .ignore)` : l'anneau de
/// progression, posé en enfant, serait invisible au rotor. Sa valeur remonte
/// donc ici, en suffixe du libellé de la ligne.
enum MyStoryRowAccessibility {

    static func label(base: String, saveProgress: Double?) -> String {
        guard let saveProgress else { return base }
        let percent = Int((min(max(saveProgress, 0), 1) * 100).rounded())
        let suffix = String(
            localized: "story.mine.save.progress.a11y",
            defaultValue: "Enregistrement \(percent) %"
        )
        return "\(base) \(suffix)"
    }
}
```

- [ ] **Step 4: Lancer pour vérifier que ça passe**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : `MyStoryRowSaveRingTests` **vert** (6 tests).

- [ ] **Step 5: Commit du helper**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null || true
git commit -m "feat(ios/story): libellé VoiceOver de la ligne porte la progression de sauvegarde

La ligne est children: .ignore — un anneau enfant serait invisible au rotor." \
  -- apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift \
     apps/ios/MeeshyTests/Unit/Views/MyStoryRowSaveRingTests.swift
```

- [ ] **Step 6: Rendre l'anneau dans `MyStoryRow`**

Dans `MyStoryRow` (fichier `MyStoriesView.swift`), ajouter la propriété observée après `let onTap: () -> Void` :

```swift
    @ObservedObject var saveService: StoryPhotoSaveService
```

et dans son `init`, ajouter le paramètre (valeur par défaut = le singleton, pour que les call-sites restent courts) :

```swift
    init(story: StoryItem, accentColor: Color, isDark: Bool,
         isSelecting: Bool = false, isSelected: Bool = false,
         saveService: StoryPhotoSaveService = .shared,
         @ViewBuilder menuContent: @escaping () -> MenuContent,
         onTap: @escaping () -> Void) {
        self.story = story
        self.accentColor = accentColor
        self.isDark = isDark
        self.isSelecting = isSelecting
        self.isSelected = isSelected
        self.saveService = saveService
        self.menuContent = menuContent
        self.onTap = onTap
    }
```

Remplacer le bloc `if !isSelecting { Menu { … } … }` du `body` par :

```swift
            if !isSelecting {
                if let progress = saveService.progress(for: story.id) {
                    saveRing(progress: progress)
                } else {
                    // « … » ouvre le MÊME menu d'actions que le long-press
                    // (Partager, Enregistrer, Transférer, Republier, Supprimer) —
                    // un tap suffit (bug : l'affordance était décorative). VoiceOver
                    // garde ses chemins existants (`.contextMenu` + `.swipeActions`
                    // de la ligne) : le glyphe reste masqué du rotor, la ligne
                    // compose déjà son propre libellé (children: .ignore).
                    Menu {
                        menuContent()
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.secondary)
                            .padding(8)
                            .contentShape(Rectangle())
                    }
                    .accessibilityHidden(true)
                }
            }
```

Ajouter la vue de l'anneau après `selectionCircle` :

```swift
    /// Anneau de progression de la sauvegarde photothèque, à la place du « … ».
    /// Tap = annulation. Masqué du rotor : la valeur et l'action d'annulation
    /// remontent sur la LIGNE (children: .ignore l'avalerait sinon).
    private func saveRing(progress: Double) -> some View {
        Button {
            HapticFeedback.medium()
            saveService.cancel(storyId: story.id)
        } label: {
            ZStack {
                Circle()
                    .stroke(Color.secondary.opacity(0.25), lineWidth: 2.5)
                Circle()
                    .trim(from: 0, to: max(0, min(progress, 1)))
                    .stroke(accentColor, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    // Anime la VALEUR uniquement — jamais l'apparition/disparition
                    // du contrôle, qui ferait sauter la hauteur de ligne dans la List.
                    .animation(.linear(duration: 0.2), value: progress)
                Text("\(Int((progress * 100).rounded()))")
                    .font(MeeshyFont.relative(9, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundColor(.secondary)
            }
            .frame(width: 28, height: 28)
            .padding(8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHidden(true)
    }
```

Brancher le libellé et l'action d'accessibilité de la ligne. Remplacer `rowAccessibilityLabel` par :

```swift
    /// Libellé VoiceOver composé : tampon temporel + les trois compteurs
    /// d'engagement rendus visuellement par des icônes muettes, plus la
    /// progression de sauvegarde quand un export est en vol.
    private var rowAccessibilityLabel: String {
        let base = String(
            localized: "story.mine.row.a11y",
            defaultValue: "\(story.timeAgo). \(story.viewCount ?? 0) vues, \(story.reactionCount) réactions, \(story.commentCount) commentaires"
        )
        return MyStoryRowAccessibility.label(base: base, saveProgress: saveService.progress(for: story.id))
    }
```

et ajouter, après `.accessibilityAddTraits(isSelected ? .isSelected : [])` dans le `body` :

```swift
        .accessibilityAction(named: Text(String(
            localized: "story.mine.save.cancel.a11y",
            defaultValue: "Annuler l'enregistrement"
        ))) {
            guard saveService.progress(for: story.id) != nil else { return }
            saveService.cancel(storyId: story.id)
        }
```

- [ ] **Step 7: Câbler le menu « Enregistrer » sur le service**

Dans `MyStoriesView.actionMenu(for:)`, remplacer :

```swift
        Button {
            saveStory = story
        } label: {
```

par :

```swift
        Button {
            StoryPhotoSaveService.shared.save(story: story)
        } label: {
```

Supprimer `@State private var saveStory: StoryItem?` (L42) et le bloc `.sheet(item: $saveStory) { … }` (L207-209).

- [ ] **Step 8: Retirer le mode `.saveToPhotos` de la sheet de partage**

Dans `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift` :

1. Supprimer l'enum `Mode`, la propriété `var mode: Mode = .share` et la fonction `resolveActivityURL(mode:sharedURL:)` (bloc L14-27).
2. Remplacer le `.sheet(item:)` de partage (L75-78) par :

```swift
            .sheet(item: Binding<ShareWrapper?>(
                get: { viewModel.sharedURL.map(ShareWrapper.init) },
                set: { _ in }
            )) { wrapper in
```

3. Supprimer entièrement le bloc `.adaptiveOnChange(of: viewModel.sharedURL) { … }` (L59-74) — il n'existait que pour le mode Photos.
4. Remplacer les trois ternaires `mode == .share ? … : …` par leur seule branche `.share` :
   - `navigationTitle` (L43-45) → `String(localized: "story.export.share.title", defaultValue: "Exporter en vidéo")`
   - sous-titre du header (L115-119) → `String(localized: "story.export.share.subtitle", defaultValue: "Génère un MP4 fidèle à la prévisualisation pour le partager hors Meeshy.")`
   - CTA (L200-202) → `String(localized: "story.export.share.cta", defaultValue: "Exporter en vidéo")`
5. Dans `MyStoriesView`, le call-site restant devient `StoryExportShareSheet(story: story, viewModel: exportViewModel)`.

Dans `apps/ios/MeeshyTests/Unit/Views/MyStoriesBulkDeleteGuardTests.swift`, supprimer le test `test_resolveActivityURL_saveToPhotos_neverPresentsShareSheet` et son bloc de documentation (~L80-95). L'invariant qu'il protégeait est devenu structurel : le chemin de sauvegarde ne touche plus `UIActivityViewController`, il est couvert par `StoryPhotoSaveServiceTests`.

- [ ] **Step 9: Ajouter les clés de localisation**

Dans `apps/ios/Meeshy/Localizable.xcstrings`, ajouter 6 clés avec `extractionState: "manual"` et les 7 langues (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`), `state: "translated"` :

| Clé | fr | en | es | de | it | pt-BR | ar |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `story.mine.save.success` | Vidéo enregistrée dans Photos | Video saved to Photos | Vídeo guardado en Fotos | Video in Fotos gespeichert | Video salvato in Foto | Vídeo salvo em Fotos | تم حفظ الفيديو في الصور |
| `story.mine.save.failed` | L'export de la story a échoué. Réessayez. | Story export failed. Try again. | Error al exportar la historia. Inténtalo de nuevo. | Story-Export fehlgeschlagen. Erneut versuchen. | Esportazione della storia non riuscita. Riprova. | Falha ao exportar o story. Tente novamente. | فشل تصدير القصة. حاول مرة أخرى. |
| `story.mine.save.photosDenied` | Impossible d'enregistrer dans Photos. Vérifie l'autorisation Photos de Meeshy dans Réglages. | Couldn't save to Photos. Check Meeshy's Photos permission in Settings. | No se pudo guardar en Fotos. Comprueba el permiso de Fotos de Meeshy en Ajustes. | Speichern in Fotos nicht möglich. Prüfe die Fotos-Berechtigung von Meeshy in den Einstellungen. | Impossibile salvare in Foto. Controlla l'autorizzazione Foto di Meeshy in Impostazioni. | Não foi possível salvar em Fotos. Verifique a permissão de Fotos do Meeshy nos Ajustes. | تعذّر الحفظ في الصور. تحقّق من إذن الصور لتطبيق Meeshy في الإعدادات. |
| `story.mine.save.cancelled` | Export annulé | Export cancelled | Exportación cancelada | Export abgebrochen | Esportazione annullata | Exportação cancelada | تم إلغاء التصدير |
| `story.mine.save.progress.a11y` | Enregistrement %lld %% | Saving %lld%% | Guardando %lld %% | Speichern %lld %% | Salvataggio %lld%% | Salvando %lld%% | جارٍ الحفظ %lld%% |
| `story.mine.save.cancel.a11y` | Annuler l'enregistrement | Cancel saving | Cancelar el guardado | Speichern abbrechen | Annulla il salvataggio | Cancelar o salvamento | إلغاء الحفظ |

> `story.mine.save.progress.a11y` est interpolée : le `defaultValue` du code utilise `\(percent)`, le catalogue doit donc porter le placeholder `%lld` (et `%%` pour un signe pourcent littéral). Vérifier après édition que le JSON reste valide : `python3 -c "import json;json.load(open('apps/ios/Meeshy/Localizable.xcstrings'))"`.

- [ ] **Step 10: Lancer les tests et vérifier visuellement**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : suite **verte**, sans référence résiduelle à `.saveToPhotos`. Contrôler :

```bash
grep -rn "saveToPhotos\|saveStory" apps/ios/Meeshy apps/ios/MeeshyTests --include="*.swift" | grep -v -E "Build|Index"
```

Attendu : **aucun résultat**.

Puis vérification manuelle :

```bash
./apps/ios/meeshy.sh run
```

Ouvrir le tray « Moi » → « Mes stories » → menu `⋯` d'une story → « Enregistrer ». Attendu : aucune sheet, l'anneau apparaît immédiatement à la place du `⋯`, monte jusqu'à 100 %, puis revient au `⋯` avec un toast de succès. Relancer et taper l'anneau en cours de route : retour immédiat au `⋯` + toast d'annulation.

- [ ] **Step 11: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null || true
git commit -m "feat(ios/story): le « … » de la ligne devient un anneau de progression pendant la sauvegarde

« Enregistrer » lance directement l'export (plus de sheet intermédiaire) : la
langue gravée est résolue automatiquement et la progression s'affiche là où
l'action a été déclenchée. Tap sur l'anneau = annulation.

Le mode .saveToPhotos de StoryExportShareSheet n'a plus d'appelant et disparaît ;
son invariant (la sauvegarde ne présente jamais la share sheet système) est
devenu structurel et couvert par StoryPhotoSaveServiceTests." \
  -- apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift \
     apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift \
     apps/ios/MeeshyTests/Unit/Views/MyStoriesBulkDeleteGuardTests.swift \
     apps/ios/Meeshy/Localizable.xcstrings
```

---

## Task 4 : `visibilityUserIds` de bout en bout dans le SDK

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` (struct `APIPost` ~L122-174, `CodingKeys` ~L177-186, `init(from:)` ~L195+, factory `~L408`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (`StoryItem` ~L1709-1836, `mergingTextObjectTranslations` ~L1879, `toStoryGroups` ~L2053)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (protocole L33, implémentation L293-297)
- Modify: `apps/ios/MeeshyTests/Mocks/MockPostService.swift` (L307-315)
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/ComposeAndPublishFlowTests.swift` (conformance `MockPostService` L37+, méthode `update`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryVisibilityUserIdsTests.swift`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces:
  - `APIPost.visibilityUserIds: [String]?`
  - `StoryItem.visibility: String?` devient **`var`**
  - `StoryItem.visibilityUserIds: [String]?` (paramètre d'init optionnel, défaut `nil`)
  - `PostServiceProviding.update(postId:content:visibility:visibilityUserIds:moodEmoji:originalLanguage:type:removeMediaIds:) async throws -> APIPost`

**Pourquoi :** le gateway accepte déjà `visibilityUserIds` sur `PUT /posts/:postId` et le renvoie déjà dans le payload (`getPostById` utilise `include: postInclude`, donc tous les scalaires sortent). Côté iOS, `UpdatePostRequest` **porte déjà le champ** (`ServiceModels.swift:133`) mais `PostService.update` ne le renseigne jamais : il part toujours à `nil`, ce qui fait rejeter EXCEPT/ONLY par le `refine` Zod (`services/gateway/src/routes/posts/types.ts:215-220`). Et rien ne décode le champ en lecture, donc le picker ne peut pas être pré-rempli.

> `StoryViewModel.storiesCacheKey` n'a **pas** besoin d'être bumpé : le champ ajouté est optionnel, les rows GRDB antérieurs le décodent en `nil`. Le bump n'est requis que pour un champ NON optionnel (cf. le commentaire de la constante).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryVisibilityUserIdsTests.swift` :

```swift
import XCTest
@testable import MeeshySDK

// MARK: - StoryVisibilityUserIdsTests
//
// Le picker « Sauf… » / « Seulement… » s'ouvre pré-coché sur la sélection
// actuelle : il faut donc que `visibilityUserIds` traverse le décodage du
// payload jusqu'à `StoryItem`. Optionnel partout → les payloads et les rows
// GRDB antérieurs continuent de décoder sans migration.

final class StoryVisibilityUserIdsTests: XCTestCase {

    private func decodePost(_ json: String) throws -> APIPost {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIPost.self, from: Data(json.utf8))
    }

    private func postJSON(visibilityUserIdsFragment: String) -> String {
        """
        {
          "id": "post-1",
          "type": "STORY",
          "visibility": "EXCEPT",
          \(visibilityUserIdsFragment)
          "createdAt": "2026-07-26T10:00:00Z",
          "author": { "id": "user-1", "username": "alice" }
        }
        """
    }

    func test_apiPost_decodesVisibilityUserIds() throws {
        let post = try decodePost(postJSON(
            visibilityUserIdsFragment: "\"visibilityUserIds\": [\"u1\", \"u2\"],"))
        XCTAssertEqual(post.visibilityUserIds, ["u1", "u2"])
    }

    /// Rétro-compatibilité : un payload antérieur au champ doit décoder, pas jeter.
    func test_apiPost_missingVisibilityUserIds_decodesAsNil() throws {
        let post = try decodePost(postJSON(visibilityUserIdsFragment: ""))
        XCTAssertNil(post.visibilityUserIds)
    }

    func test_storyItem_defaultVisibilityUserIdsIsNil() {
        let item = StoryItem(id: "s1", visibility: "PUBLIC")
        XCTAssertNil(item.visibilityUserIds)
    }

    func test_storyItem_carriesVisibilityUserIds() {
        let item = StoryItem(id: "s1", visibility: "ONLY", visibilityUserIds: ["u1"])
        XCTAssertEqual(item.visibilityUserIds, ["u1"])
    }

    /// `visibility` devient `var` pour permettre la mise à jour optimiste
    /// (même patron que `isViewed`, muté en place plutôt que reconstruit —
    /// une reconstruction partielle droppait ~13 champs à leur défaut).
    func test_storyItem_visibilityIsMutable() {
        var item = StoryItem(id: "s1", visibility: "PUBLIC")
        item.visibility = "PRIVATE"
        item.visibilityUserIds = ["u9"]
        XCTAssertEqual(item.visibility, "PRIVATE")
        XCTAssertEqual(item.visibilityUserIds, ["u9"])
    }

    /// Un `StoryItem` persisté AVANT le champ doit se relire en `nil`
    /// (cache GRDB : aucune migration, décodage tolérant).
    func test_storyItem_decodesLegacyPayloadWithoutVisibilityUserIds() throws {
        let json = """
        {
          "id": "s1",
          "media": [],
          "createdAt": 774000000,
          "visibility": "PUBLIC",
          "isViewed": false,
          "reactionCount": 0,
          "commentCount": 0
        }
        """
        let item = try JSONDecoder().decode(StoryItem.self, from: Data(json.utf8))
        XCTAssertNil(item.visibilityUserIds)
        XCTAssertEqual(item.visibility, "PUBLIC")
    }

    /// La fusion de traductions temps réel reconstruit la `StoryItem` via son
    /// init memberwise : le nouveau champ doit y être transmis, sinon une
    /// traduction reçue effacerait silencieusement la liste d'audience.
    func test_mergingTextObjectTranslations_preservesVisibilityUserIds() {
        let effects = StoryEffects(textObjects: [StoryTextObject(text: "Hello")])
        let item = StoryItem(id: "s1", storyEffects: effects,
                             visibility: "ONLY", visibilityUserIds: ["u1", "u2"])
        let merged = item.mergingTextObjectTranslations(at: 0, translations: ["fr": "Bonjour"])
        XCTAssertEqual(merged.visibilityUserIds, ["u1", "u2"])
        XCTAssertEqual(merged.visibility, "ONLY")
    }
}
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshySDKTests/StoryVisibilityUserIdsTests
```

Attendu : échec de compilation — `value of type 'APIPost' has no member 'visibilityUserIds'`.

- [ ] **Step 3: Décoder `visibilityUserIds` sur `APIPost`**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` :

1. Après `public let visibility: String?` (L125), ajouter :

```swift
    /// Ids ciblés (`ONLY`) ou exclus (`EXCEPT`). Renvoyé par le gateway pour
    /// tous les posts (`include: postInclude` ne filtre aucun scalaire).
    /// `nil` sur les payloads antérieurs au champ — le picker d'audience
    /// s'ouvre alors vierge plutôt que de casser le décodage.
    public let visibilityUserIds: [String]?
```

2. Dans `CodingKeys`, remplacer la première ligne par :

```swift
        case id, type, visibility, visibilityUserIds, content, originalLanguage, createdAt, updatedAt, expiresAt
```

3. Dans `init(from:)`, juste après la ligne `visibility = try c.decodeIfPresent(String.self, forKey: .visibility)` :

```swift
        visibilityUserIds = try c.decodeIfPresent([String].self, forKey: .visibilityUserIds)
```

4. Au site de construction `~L408` (`visibility: nil,`), ajouter `visibilityUserIds: nil,` juste après — le compilateur signalera l'emplacement exact si une init memberwise est utilisée.

- [ ] **Step 4: Ajouter le champ à `StoryItem` et le propager**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` :

1. Remplacer `public let visibility: String?` (L1723) par :

```swift
    /// `var` (et non `let`) pour la mise à jour optimiste du menu « Modifier
    /// la visibilité » : muter en place, comme `isViewed`, plutôt que
    /// reconstruire via une init partielle qui droppait ~13 champs.
    public var visibility: String?
    /// Ids ciblés (`ONLY`) ou exclus (`EXCEPT`). Optionnel → les rows GRDB et
    /// payloads antérieurs décodent en `nil` sans migration.
    public var visibilityUserIds: [String]?
```

2. Dans l'init memberwise, après `visibility: String? = nil,` ajouter `visibilityUserIds: [String]? = nil,` et dans le corps, après `self.visibility = visibility;` ajouter `self.visibilityUserIds = visibilityUserIds`.

> Le défaut `nil` garantit que les ~24 autres sites de construction de `StoryItem` continuent de compiler sans modification.

3. Dans `mergingTextObjectTranslations` (~L1879), ajouter `visibilityUserIds: visibilityUserIds,` juste après `visibility: visibility,`.

4. Dans `toStoryGroups` (~L2053), ajouter après `visibility: post.visibility,` :

```swift
                                 visibilityUserIds: post.visibilityUserIds,
```

- [ ] **Step 5: Lancer les tests SDK**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet \
  -only-testing:MeeshySDKTests/StoryVisibilityUserIdsTests
```

Attendu : **7 tests verts**.

- [ ] **Step 6: Transmettre `visibilityUserIds` dans `PostService.update`**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` :

1. Ligne 33 (protocole), remplacer par :

```swift
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost
```

2. Lignes 293-297, remplacer par :

```swift
    public func update(postId: String, content: String? = nil, visibility: String? = nil, visibilityUserIds: [String]? = nil, moodEmoji: String? = nil, originalLanguage: String? = nil, type: String? = nil, removeMediaIds: [String]? = nil) async throws -> APIPost {
        // `visibilityUserIds` était déclaré dans `UpdatePostRequest` mais JAMAIS
        // renseigné ici : il partait toujours à `nil`, et le `refine` Zod du
        // gateway rejetait donc systématiquement EXCEPT/ONLY.
        let body = UpdatePostRequest(content: content, visibility: visibility, visibilityUserIds: visibilityUserIds, moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type, removeMediaIds: removeMediaIds)
        let response: APIResponse<APIPost> = try await api.put(endpoint: "/posts/\(postId)", body: body)
        return response.data
    }
```

> Vérifier l'ordre exact des paramètres de `UpdatePostRequest.init` dans `ServiceModels.swift:142` et l'appeler avec les libellés — ne pas se fier à l'ordre positionnel.

3. Mettre à jour les deux conformances de test :

`apps/ios/MeeshyTests/Mocks/MockPostService.swift` — remplacer la méthode L307-315 :

```swift
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost {
        updateCallCount += 1
        lastUpdatePostId = postId
        lastUpdateContent = content
        lastUpdateVisibility = visibility
        lastUpdateVisibilityUserIds = visibilityUserIds
        lastUpdateOriginalLanguage = originalLanguage
        lastUpdateType = type
        lastUpdateRemoveMediaIds = removeMediaIds
        return try createResult.get()
    }
```

et déclarer les deux nouvelles propriétés capturées à côté des autres `lastUpdate*` :

```swift
    var lastUpdateVisibility: String?
    var lastUpdateVisibilityUserIds: [String]?
```

`packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/ComposeAndPublishFlowTests.swift` — ajouter `visibilityUserIds: [String]?` à la signature de sa méthode `update` (ce mock ignore le paramètre ; ajouter le libellé suffit à recompiler).

- [ ] **Step 7: Lancer les deux suites**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
./apps/ios/meeshy.sh test
```

Attendu : les deux **vertes**. Toute erreur `does not conform to protocol 'PostServiceProviding'` désigne une conformance oubliée — le compilateur donne le fichier.

- [ ] **Step 8: Commit**

```bash
git commit -m "fix(sdk/posts): update transmet enfin visibilityUserIds, et StoryItem le porte

Le champ existait dans UpdatePostRequest mais PostService.update ne le
renseignait jamais : il partait toujours à nil, et le refine Zod du gateway
rejetait donc systématiquement EXCEPT/ONLY. En lecture, rien ne le décodait —
impossible de pré-remplir un picker d'audience.

visibility passe de let à var pour permettre la mise à jour optimiste ; le
nouveau champ est optionnel partout (rows GRDB et payloads antérieurs décodent
en nil, aucune migration, pas de bump de storiesCacheKey)." \
  -- packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift \
     packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
     packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift \
     packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/StoryVisibilityUserIdsTests.swift \
     packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Integration/ComposeAndPublishFlowTests.swift \
     apps/ios/MeeshyTests/Mocks/MockPostService.swift
```

---

## Task 5 : `StoryViewModel.applyVisibility` avec rollback

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` (ajout après `markViewed`, ~L707)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/StoryVisibilityUpdateTests.swift`

**Interfaces:**
- Consumes: `StoryItem.visibility` (`var`), `StoryItem.visibilityUserIds`, `PostServiceProviding.update(postId:content:visibility:visibilityUserIds:moodEmoji:originalLanguage:type:removeMediaIds:)` (Task 4) ; `StoryViewModel.postService` (déjà injecté) ; `storyGroups[i].with(stories:)` ; `persistStoryCache()`.
- Produces: `StoryViewModel.applyVisibility(storyId: String, visibility: String, userIds: [String]?) async -> Bool`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/ViewModels/StoryVisibilityUpdateTests.swift` :

```swift
import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - StoryVisibilityUpdateTests
//
// Mise à jour optimiste + rollback du menu « Modifier la visibilité ».
// L'écriture locale précède l'appel réseau pour que le checkmark bouge tout de
// suite ; un échec doit restaurer EXACTEMENT l'état d'avant, sinon l'UI ment.

@MainActor
final class StoryVisibilityUpdateTests: XCTestCase {

    private func makeSUT(postService: MockPostService) -> StoryViewModel {
        StoryViewModel(postService: postService)
    }

    private func seed(_ sut: StoryViewModel, story: StoryItem) {
        sut.storyGroups = [
            StoryGroup(id: "user-1", username: "alice", avatarColor: "4ECDC4",
                       avatarURL: nil, stories: [story])
        ]
    }

    private func currentStory(_ sut: StoryViewModel, id: String) -> StoryItem? {
        sut.storyGroups.flatMap(\.stories).first { $0.id == id }
    }

    func test_applyVisibility_success_updatesLocalStory() async {
        let postService = MockPostService()
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "PUBLIC"))

        let before = postService.updateCallCount
        let ok = await sut.applyVisibility(storyId: "s1", visibility: "PRIVATE", userIds: nil)

        XCTAssertTrue(ok)
        XCTAssertEqual(postService.updateCallCount - before, 1, "compteur en delta : l'app hôte tourne")
        XCTAssertEqual(postService.lastUpdatePostId, "s1")
        XCTAssertEqual(postService.lastUpdateVisibility, "PRIVATE")
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibility, "PRIVATE")
    }

    func test_applyVisibility_withUserIds_forwardsThem() async {
        let postService = MockPostService()
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "PUBLIC"))

        let ok = await sut.applyVisibility(storyId: "s1", visibility: "ONLY", userIds: ["u1", "u2"])

        XCTAssertTrue(ok)
        XCTAssertEqual(postService.lastUpdateVisibilityUserIds, ["u1", "u2"])
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibilityUserIds, ["u1", "u2"])
    }

    func test_applyVisibility_failure_restoresPreviousValue() async {
        let postService = MockPostService()
        postService.createResult = .failure(URLError(.notConnectedToInternet))
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "EXCEPT", visibilityUserIds: ["u7"]))

        let ok = await sut.applyVisibility(storyId: "s1", visibility: "PUBLIC", userIds: nil)

        XCTAssertFalse(ok)
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibility, "EXCEPT")
        XCTAssertEqual(currentStory(sut, id: "s1")?.visibilityUserIds, ["u7"],
                       "le rollback doit restaurer la liste d'audience, pas seulement le mode")
    }

    func test_applyVisibility_unknownStory_returnsFalseWithoutNetworkCall() async {
        let postService = MockPostService()
        let sut = makeSUT(postService: postService)
        seed(sut, story: StoryItem(id: "s1", visibility: "PUBLIC"))

        let before = postService.updateCallCount
        let ok = await sut.applyVisibility(storyId: "inexistante", visibility: "PRIVATE", userIds: nil)

        XCTAssertFalse(ok)
        XCTAssertEqual(postService.updateCallCount - before, 0)
    }
}
```

> Signatures vérifiées : `MockPostService.createResult: Result<APIPost, Error>` (`MockPostService.swift:23`), `MockPostService.updateCallCount` (L101), et `StoryGroup.init(id:username:avatarColor:avatarURL:stories:authorPresence:)` (`StoryModels.swift:1924`). `lastUpdateVisibility` / `lastUpdateVisibilityUserIds` n'existent pas encore — ils sont ajoutés au Step 6 de la Task 4.

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : échec de compilation — `value of type 'StoryViewModel' has no member 'applyVisibility'`.

- [ ] **Step 3: Implémenter `applyVisibility`**

Dans `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`, juste après la fermeture de `markViewed(storyId:)` :

```swift
    /// Change le mode de visibilité d'une story (menu « Modifier la
    /// visibilité » de « Mes stories »).
    ///
    /// Écriture locale D'ABORD pour que le checkmark du menu bouge tout de
    /// suite, appel serveur ensuite, restauration de l'état exact d'avant si
    /// l'appel échoue — sinon l'UI affirmerait un changement que le serveur
    /// n'a jamais enregistré.
    ///
    /// Mutation EN PLACE (`visibility` et `visibilityUserIds` sont des `var`),
    /// jamais une reconstruction via init partielle : celle-ci droppait ~13
    /// champs à leur défaut et le cache gravait l'état corrompu (cf. le
    /// commentaire de `markViewed`).
    ///
    /// - Returns: `true` si le serveur a accepté le changement.
    func applyVisibility(storyId: String, visibility: String, userIds: [String]?) async -> Bool {
        guard let groupIndex = storyGroups.firstIndex(where: { $0.stories.contains { $0.id == storyId } }),
              let storyIndex = storyGroups[groupIndex].stories.firstIndex(where: { $0.id == storyId })
        else { return false }

        let previousVisibility = storyGroups[groupIndex].stories[storyIndex].visibility
        let previousUserIds = storyGroups[groupIndex].stories[storyIndex].visibilityUserIds

        write(visibility: visibility, userIds: userIds, groupIndex: groupIndex, storyIndex: storyIndex)

        do {
            _ = try await postService.update(
                postId: storyId,
                content: nil,
                visibility: visibility,
                visibilityUserIds: userIds,
                moodEmoji: nil,
                originalLanguage: nil,
                type: nil,
                removeMediaIds: nil
            )
            return true
        } catch {
            Logger.stories.error(
                "applyVisibility failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            // La story a pu disparaître (suppression temps réel) pendant l'appel :
            // relocaliser avant de restaurer plutôt que réutiliser des index périmés.
            if let g = storyGroups.firstIndex(where: { $0.stories.contains { $0.id == storyId } }),
               let s = storyGroups[g].stories.firstIndex(where: { $0.id == storyId }) {
                write(visibility: previousVisibility, userIds: previousUserIds, groupIndex: g, storyIndex: s)
            }
            return false
        }
    }

    private func write(visibility: String?, userIds: [String]?, groupIndex: Int, storyIndex: Int) {
        var stories = storyGroups[groupIndex].stories
        stories[storyIndex].visibility = visibility
        stories[storyIndex].visibilityUserIds = userIds
        storyGroups[groupIndex] = storyGroups[groupIndex].with(stories: stories)
        persistStoryCache()
    }
```

- [ ] **Step 4: Lancer les tests**

```bash
./apps/ios/meeshy.sh test
```

Attendu : `StoryVisibilityUpdateTests` **vert** (4 tests).

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null || true
git commit -m "feat(ios/story): applyVisibility — écriture optimiste et rollback exact

Le checkmark du menu bouge immédiatement ; un échec réseau restaure le mode ET
la liste d'audience d'avant. La story est relocalisée avant le rollback : elle
a pu disparaître (suppression temps réel) pendant l'appel." \
  -- apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift \
     apps/ios/MeeshyTests/Unit/ViewModels/StoryVisibilityUpdateTests.swift
```

---

## Task 6 : « Listing des vues » + sous-menu de visibilité

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` (états ~L40-50, sheets ~L196-224, `actionMenu(for:)` ~L293-332)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (clé `story.mine.viewers` + nouvelle clé `story.mine.visibility`)
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryVisibilityMenuResolverTests.swift`

**Interfaces:**
- Consumes: `PostVisibility` (`composerSelectableCases`, `label`, `icon`, `rawValue`, `requiresUserSelection`), `AudienceUserPickerView(mode:initialSelection:onDone:)`, `StoryItem.visibility`, `StoryItem.visibilityUserIds` (Task 4), `StoryViewModel.applyVisibility(storyId:visibility:userIds:)` (Task 5).
- Produces:
  - `StoryVisibilityMenuResolver.isCurrent(_ candidate: PostVisibility, rawValue: String?) -> Bool`
  - `StoryVisibilityMenuResolver.symbol(for candidate: PostVisibility, currentRawValue: String?) -> String`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/StoryVisibilityMenuResolverTests.swift` :

```swift
import XCTest
@testable import Meeshy
@testable import MeeshyUI

// MARK: - StoryVisibilityMenuResolverTests
//
// Le sous-menu marque le mode courant d'un `checkmark` à la place de son icône.
// Choix conservateur assumé face aux cases à cocher natives d'un Picker inline :
// sous iOS 26, un `.tint(.clear)` fait disparaître TOUTES les icônes d'un menu.

final class StoryVisibilityMenuResolverTests: XCTestCase {

    func test_isCurrent_matchingRawValue_isTrue() {
        XCTAssertTrue(StoryVisibilityMenuResolver.isCurrent(.public, rawValue: "PUBLIC"))
    }

    /// Le serveur peut renvoyer une casse inattendue — la comparaison est
    /// insensible à la casse, comme `StoryItem.isPublic`.
    func test_isCurrent_lowercasedRawValue_isTrue() {
        XCTAssertTrue(StoryVisibilityMenuResolver.isCurrent(.friends, rawValue: "friends"))
    }

    func test_isCurrent_differentRawValue_isFalse() {
        XCTAssertFalse(StoryVisibilityMenuResolver.isCurrent(.private, rawValue: "PUBLIC"))
    }

    func test_isCurrent_nilRawValue_isFalse() {
        XCTAssertFalse(StoryVisibilityMenuResolver.isCurrent(.public, rawValue: nil))
    }

    func test_isCurrent_unknownRawValue_matchesNothing() {
        for candidate in PostVisibility.composerSelectableCases {
            XCTAssertFalse(StoryVisibilityMenuResolver.isCurrent(candidate, rawValue: "WEIRD"),
                           "\(candidate) ne doit pas matcher une valeur inconnue")
        }
    }

    func test_symbol_currentMode_isCheckmark() {
        XCTAssertEqual(StoryVisibilityMenuResolver.symbol(for: .only, currentRawValue: "ONLY"), "checkmark")
    }

    func test_symbol_otherMode_isItsOwnIcon() {
        XCTAssertEqual(StoryVisibilityMenuResolver.symbol(for: .friends, currentRawValue: "ONLY"),
                       PostVisibility.friends.icon)
    }

    /// Contrat du menu : exactement les 6 modes demandés, dans cet ordre.
    func test_composerSelectableCases_isTheSixRequestedModes() {
        XCTAssertEqual(PostVisibility.composerSelectableCases,
                       [.public, .community, .friends, .except, .only, .private])
    }

    /// Un seul checkmark à la fois — sinon le menu affirmerait deux modes actifs.
    func test_exactlyOneCheckmarkForAKnownMode() {
        let checkmarks = PostVisibility.composerSelectableCases
            .filter { StoryVisibilityMenuResolver.symbol(for: $0, currentRawValue: "EXCEPT") == "checkmark" }
        XCTAssertEqual(checkmarks, [.except])
    }

    // MARK: Routage du tap

    /// Re-choisir le mode déjà actif ne doit RIEN faire : pas d'aller-retour
    /// réseau, pas de picker qui s'ouvre pour rien.
    func test_route_sameMode_isIgnored() {
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .public, current: "PUBLIC"), .ignored)
    }

    func test_route_simpleMode_appliesDirectly() {
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .private, current: "PUBLIC"), .applyDirectly)
    }

    /// EXCEPT / ONLY ne partent JAMAIS au serveur sans sélection : le gateway
    /// les rejette (refine Zod « require at least one userId »).
    func test_route_audienceModes_openPicker() {
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .except, current: "PUBLIC"), .openAudiencePicker)
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .only, current: "PUBLIC"), .openAudiencePicker)
    }

    /// Une visibilité serveur inconnue ne doit bloquer aucun choix.
    func test_route_unknownCurrent_stillAllowsEveryMode() {
        for mode in PostVisibility.composerSelectableCases {
            XCTAssertNotEqual(StoryVisibilityMenuResolver.route(to: mode, current: "WEIRD"), .ignored)
        }
    }
}
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : échec de compilation — `cannot find 'StoryVisibilityMenuResolver' in scope`.

- [ ] **Step 3: Ajouter le résolveur**

Dans `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`, juste après `enum MyStoryRowAccessibility` (Task 3) :

```swift
// MARK: - Visibility menu

/// Marquage du mode de visibilité courant dans le sous-menu « Modifier la
/// visibilité ». Le mode actif porte un `checkmark` à la place de son icône.
///
/// Pourquoi pas un `Picker` inline (qui coche nativement) : sous iOS 26, un
/// `.tint(.clear)` fait disparaître toutes les icônes d'un menu — on garde donc
/// la main sur le symbole rendu.
enum StoryVisibilityMenuResolver {

    /// Ce que déclenche le tap sur une entrée du sous-menu.
    enum Route: Equatable {
        /// Mode déjà actif : ne rien faire (ni réseau, ni picker).
        case ignored
        /// Écriture directe — aucune sélection d'utilisateurs requise.
        case applyDirectly
        /// `EXCEPT` / `ONLY` : le gateway rejette un envoi sans `visibilityUserIds`.
        case openAudiencePicker
    }

    static func isCurrent(_ candidate: PostVisibility, rawValue: String?) -> Bool {
        guard let rawValue else { return false }
        return rawValue.uppercased() == candidate.rawValue
    }

    static func symbol(for candidate: PostVisibility, currentRawValue: String?) -> String {
        isCurrent(candidate, rawValue: currentRawValue) ? "checkmark" : candidate.icon
    }

    static func route(to candidate: PostVisibility, current rawValue: String?) -> Route {
        if isCurrent(candidate, rawValue: rawValue) { return .ignored }
        return candidate.requiresUserSelection ? .openAudiencePicker : .applyDirectly
    }
}
```

- [ ] **Step 4: Lancer pour vérifier que ça passe**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Attendu : `StoryVisibilityMenuResolverTests` **vert** (13 tests).

- [ ] **Step 5: Renommer « Éditer les vues » en « Listing des vues »**

Dans `MyStoriesView.actionMenu(for:)` (~L303), remplacer :

```swift
            Label(String(localized: "story.mine.viewers", defaultValue: "Éditer les vues"), systemImage: "eye")
```

par :

```swift
            Label(String(localized: "story.mine.viewers", defaultValue: "Listing des vues"), systemImage: "eye")
```

Dans `apps/ios/Meeshy/Localizable.xcstrings`, mettre à jour la clé `story.mine.viewers` :

| Langue | Ancienne valeur | Nouvelle valeur |
| --- | --- | --- |
| fr | Éditer les vues | Listing des vues |
| en | Edit views | Views list |
| es | Editar vistas | Lista de vistas |
| de | Aufrufe bearbeiten | Aufrufliste |
| it | Modifica le visualizzazioni | Elenco delle visualizzazioni |
| pt-BR | Editar visualizações | Lista de visualizações |
| ar | تعديل المشاهدات | قائمة المشاهدات |

Ajouter la clé `story.mine.visibility` (`extractionState: "manual"`, `state: "translated"`) :

| Langue | Valeur |
| --- | --- |
| fr | Modifier la visibilité |
| en | Change visibility |
| es | Cambiar la visibilidad |
| de | Sichtbarkeit ändern |
| it | Modifica la visibilità |
| pt-BR | Alterar a visibilidade |
| ar | تغيير مدى الظهور |

Valider le JSON :

```bash
python3 -c "import json;json.load(open('apps/ios/Meeshy/Localizable.xcstrings'));print('ok')"
```

- [ ] **Step 6: Ajouter le sous-menu et le picker d'audience**

Dans `MyStoriesView`, déclarer la cible du picker à côté des autres `@State` (~L44) :

```swift
    /// Cible du picker d'audience — un SEUL état porte la story et le mode,
    /// pour qu'ils ne puissent pas se désynchroniser.
    @State private var audienceTarget: AudienceTarget?
```

et le type support, en bas du fichier (à côté des autres types privés) :

```swift
/// Story + mode en attente d'une sélection d'utilisateurs (`EXCEPT` / `ONLY`).
private struct AudienceTarget: Identifiable {
    let story: StoryItem
    let mode: PostVisibility
    var id: String { "\(story.id)-\(mode.rawValue)" }
}
```

Dans `actionMenu(for:)`, insérer juste après le bouton « Listing des vues » :

```swift
        Menu {
            ForEach(PostVisibility.composerSelectableCases) { mode in
                Button {
                    selectVisibility(mode, for: story)
                } label: {
                    Label(mode.label,
                          systemImage: StoryVisibilityMenuResolver.symbol(
                            for: mode, currentRawValue: story.visibility))
                }
            }
        } label: {
            Label(String(localized: "story.mine.visibility", defaultValue: "Modifier la visibilité"),
                  systemImage: "lock.rotation")
        }
```

Ajouter la sheet du picker, à la suite des autres `.sheet(item:)` (~L224) :

```swift
        .sheet(item: $audienceTarget) { target in
            AudienceUserPickerView(
                mode: target.mode,
                initialSelection: target.story.visibilityUserIds ?? []
            ) { ids in
                audienceTarget = nil
                guard !ids.isEmpty else { return }
                applyVisibility(target.mode, for: target.story, userIds: ids)
            }
        }
```

Ajouter les deux actions dans la section `// MARK: Actions` :

```swift
    /// `EXCEPT` / `ONLY` demandent une sélection d'utilisateurs — le picker
    /// s'ouvre pré-coché sur la sélection actuelle. Les autres modes partent
    /// directement au serveur.
    private func selectVisibility(_ mode: PostVisibility, for story: StoryItem) {
        switch StoryVisibilityMenuResolver.route(to: mode, current: story.visibility) {
        case .ignored:
            return
        case .openAudiencePicker:
            audienceTarget = AudienceTarget(story: story, mode: mode)
        case .applyDirectly:
            applyVisibility(mode, for: story, userIds: nil)
        }
    }

    private func applyVisibility(_ mode: PostVisibility, for story: StoryItem, userIds: [String]?) {
        HapticFeedback.medium()
        Task {
            let ok = await viewModel.applyVisibility(
                storyId: story.id, visibility: mode.rawValue, userIds: userIds)
            if ok {
                FeedbackToastManager.shared.showSuccess(
                    String(localized: "story.mine.visibility.success", defaultValue: "Visibilité mise à jour"))
            } else {
                FeedbackToastManager.shared.showError(
                    String(localized: "story.mine.visibility.error", defaultValue: "Échec de la mise à jour"))
            }
        }
    }
```

Ajouter les deux clés de toast dans `Localizable.xcstrings` :

| Clé | fr | en | es | de | it | pt-BR | ar |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `story.mine.visibility.success` | Visibilité mise à jour | Visibility updated | Visibilidad actualizada | Sichtbarkeit aktualisiert | Visibilità aggiornata | Visibilidade atualizada | تم تحديث مدى الظهور |
| `story.mine.visibility.error` | Échec de la mise à jour | Update failed | Error al actualizar | Aktualisierung fehlgeschlagen | Aggiornamento non riuscito | Falha na atualização | فشل التحديث |

Vérifier que `MyStoriesView.swift` importe bien `MeeshyUI` (il le fait déjà, L3) — `PostVisibility` et `AudienceUserPickerView` en viennent.

- [ ] **Step 7: Lancer les tests et vérifier visuellement**

```bash
cd apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
python3 -c "import json;json.load(open('apps/ios/Meeshy/Localizable.xcstrings'));print('xcstrings ok')"
```

Attendu : suite **verte**.

```bash
./apps/ios/meeshy.sh run
```

Ouvrir « Mes stories » → menu `⋯`. Vérifier :
1. l'entrée s'appelle « Listing des vues » et ouvre bien la feuille de vues ;
2. « Modifier la visibilité » ouvre un sous-menu à 6 entrées, le mode courant coché ;
3. choisir « Privé » → toast de succès, rouvrir le menu → le checkmark a bougé ;
4. choisir « Seulement… » → le picker s'ouvre pré-coché s'il y avait déjà une sélection ; valider → toast de succès ;
5. annuler le picker → aucun appel réseau, la visibilité ne bouge pas.

- [ ] **Step 8: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Meeshy.xcodeproj/xcshareddata/xcschemes/Meeshy.xcscheme 2>/dev/null || true
git commit -m "feat(ios/story): « Listing des vues » et sous-menu de modification de la visibilité

L'entrée ouvrait déjà un listing de vues — seul le libellé « Éditer les vues »
mentait. Le sous-menu réutilise PostVisibility et AudienceUserPickerView du SDK ;
Sauf/Seulement ouvrent le picker pré-coché sur la sélection actuelle.

Le mode courant porte un checkmark à la place de son icône plutôt qu'un Picker
inline : sous iOS 26 un .tint(.clear) fait disparaître toutes les icônes d'un menu." \
  -- apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift \
     apps/ios/Meeshy/Localizable.xcstrings \
     apps/ios/MeeshyTests/Unit/Views/StoryVisibilityMenuResolverTests.swift
```

---

## Vérification finale

- [ ] **Suite complète app + SDK verte**

```bash
./apps/ios/meeshy.sh test
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```

- [ ] **Aucun résidu du chemin supprimé**

```bash
grep -rn "saveToPhotos\|saveStory\|Éditer les vues\|currentUserBrandIntro" \
  apps/ios/Meeshy apps/ios/MeeshyTests --include="*.swift" | grep -v -E "Build|Index"
```

Attendu : **aucun résultat**.

- [ ] **Catalogue de localisation valide et complet**

```bash
python3 - <<'PY'
import json
d = json.load(open('apps/ios/Meeshy/Localizable.xcstrings'))
langs = {'ar','de','en','es','fr','it','pt-BR'}
keys = ['story.mine.viewers','story.mine.visibility','story.mine.visibility.success',
        'story.mine.visibility.error','story.mine.save.success','story.mine.save.failed',
        'story.mine.save.photosDenied','story.mine.save.cancelled',
        'story.mine.save.progress.a11y','story.mine.save.cancel.a11y']
for k in keys:
    entry = d['strings'].get(k)
    assert entry, f'clé manquante : {k}'
    have = set(entry.get('localizations', {}))
    assert langs <= have, f'{k} : langues manquantes {langs - have}'
print('xcstrings ok —', len(keys), 'clés × 7 langues')
PY
```

- [ ] **Worktree propre hors travail concurrent**

```bash
git status --short
```

Attendu : seules les modifications préexistantes d'autres sessions (`StoryViewerView.swift`, `StoryComposerViewModel+Voice.swift`, …) — **aucun** fichier de ce plan non committé, **aucun** churn de `project.pbxproj` / `Package.resolved`.

---

# Extension du périmètre (demande utilisateur, 2026-07-26)

Trois ajouts décidés après la tâche 4. Ils ne remplacent rien de ce qui précède.

## Politique de fusion

À la fin de **chaque** tâche validée, le travail est fusionné dans `main` et donc visible
depuis le worktree principal. Concrètement, la branche de travail a été fusionnée dans `main`
(`6598ea418`) et les tâches suivantes committent directement sur `main`, par pathspec strict.
Aucune tâche ne reste isolée sur une branche après validation.

---

## Task 7 : progression d'export partagée entre le reader et la liste

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/StorySaveProgressRing.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` (`saveRing(progress:)` dans `MyStoryRow`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift` (bouton export, ~L368-377)
- Test: `apps/ios/MeeshyTests/Unit/Views/StorySaveProgressRingTests.swift`

**Interfaces:**
- Consumes: `StoryPhotoSaveService.shared` (`progress(for:)`, `save(story:)`, `cancel(storyId:)`), `StoryActionButton`.
- Produces: `StorySaveProgressRing(progress:tint:diameter:)` — vue réutilisable.

**Le problème.** L'anneau de progression est aujourd'hui dessiné inline dans `MyStoryRow`, et
le reader ouvre une sheet d'export séparée. Un export lancé depuis le reader n'apparaît donc
nulle part dans la liste, et l'icône du reader reste statique. Or l'état des exports en vol vit
déjà dans un singleton (`StoryPhotoSaveService.shared`) : les deux surfaces peuvent l'observer.

**Décision.** Le bouton « Exporter » du reader passe par `StoryPhotoSaveService.shared.save(story:)`,
exactement comme « Enregistrer » de la liste. Les deux surfaces partagent donc une seule source de
vérité, et un export lancé depuis l'une est visible depuis l'autre. Tant qu'un job est en vol pour
cette story, l'icône du reader devient l'anneau de progression et son tap annule.

**Réutilisation.** L'anneau est extrait de `MyStoryRow` en vue autonome plutôt que dupliqué —
deux dessins divergeraient (épaisseur, arrondi, sens de rotation) dès la première retouche.

```swift
/// Anneau de progression d'une sauvegarde de story vers la photothèque.
/// Partagé par la ligne « Mes stories » et le rail d'actions du reader :
/// une seule définition, sinon les deux rendus divergent à la première retouche.
struct StorySaveProgressRing: View {
    let progress: Double
    var tint: Color
    var diameter: CGFloat = 28

    private var clamped: Double { min(max(progress, 0), 1) }

    var body: some View {
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: clamped)
            Text("\(Int((clamped * 100).rounded()))")
                .font(MeeshyFont.relative(9, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundColor(.secondary)
        }
        .frame(width: diameter, height: diameter)
    }
}
```

`MyStoryRow.saveRing(progress:)` conserve son `Button`, son `.padding(8)`, son
`.contentShape(Rectangle())` et son `.accessibilityHidden(true)`, mais délègue le dessin à
`StorySaveProgressRing(progress: progress, tint: accentColor)`.

Dans `StoryViewerView+Sidebar.swift`, la branche `if railPlan.showsExport` devient :

```swift
            if railPlan.showsExport {
                if let progress = StoryPhotoSaveService.shared.progress(for: story.id) {
                    // Même job, même source de vérité que la ligne « Mes stories » :
                    // un export lancé depuis l'une des deux surfaces progresse sur les deux.
                    Button {
                        HapticFeedback.light()
                        StoryPhotoSaveService.shared.cancel(storyId: story.id)
                    } label: {
                        StorySaveProgressRing(progress: progress, tint: MeeshyColors.indigo400, diameter: 32)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "story.mine.save.cancel.a11y",
                                               defaultValue: "Annuler l'enregistrement", bundle: .main))
                    .accessibilityValue(Text(String(
                        localized: "story.mine.save.progress.a11y",
                        defaultValue: "Enregistrement \(Int((progress * 100).rounded())) %", bundle: .main)))
                } else {
                    StoryActionButton(
                        icon: "square.and.arrow.up.fill",
                        label: String(localized: "story.viewer.action.export", defaultValue: "Exporter", bundle: .main)
                    ) {
                        HapticFeedback.light()
                        StoryPhotoSaveService.shared.save(story: story)
                    }
                }
            }
```

La vue hôte doit observer le service pour se redessiner : ajouter
`@ObservedObject private var saveService = StoryPhotoSaveService.shared` à la vue qui porte
le rail, et lire `saveService.progress(for:)` plutôt que `StoryPhotoSaveService.shared.progress(for:)`.

> Contrairement à la ligne de liste, le bouton du reader **n'est pas** masqué du rotor : il n'est
> pas enfant d'un élément `children: .ignore`, donc il porte lui-même son libellé et sa valeur.

**Tests** (`StorySaveProgressRingTests`, purs) :
- le clamp ramène une progression négative à 0 et une progression > 1 à 1 ;
- le pourcentage affiché est arrondi au plus proche (0,435 → 44) ;
- `clamped` de 0 et de 1 donnent bien 0 et 1.

Vérification manuelle exigée : lancer un export depuis le reader, revenir à la liste, constater
l'anneau sur la ligne ; puis l'inverse.

---

## Task 8 : commentaires d'une story depuis le listing

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`
- Test: `apps/ios/MeeshyTests/Unit/Views/MyStoriesCommentsButtonTests.swift`

**Interfaces:**
- Consumes: `CommentsSheetView(post:accentColor:)` (`FeedCommentsSheet.swift:184`),
  `APIPost.toFeedPost(preferredLanguages:)`, `StoryService.shared.cachedPost(id:)` et
  `fetchPost(id:)`, `StoryPhotoSaveService.shared`.
- Produces: `MyStoriesCommentTarget` (type `Identifiable` portant le `FeedPost` résolu).

**Ce qu'on ajoute.** Dans chaque ligne de « Mes stories », une icône de commentaire **avec son
compteur** est posée **immédiatement à gauche du `⋯`**. Elle ouvre `CommentsSheetView` sur les
commentaires de la story, avec la possibilité d'y répondre (le composeur de la sheet est déjà
fonctionnel : `FeedView` et `FeedPostCard` l'utilisent sans passer `onSendComment`, le chemin
d'envoi par défaut suffit).

**⚠️ NE PAS TOUCHER à la vue de commentaires incrustée du reader.** `StoryViewerView` possède
son propre overlay (`showCommentsOverlay`, `StoryViewerView+Canvas.swift`), volontairement
distinct : c'est le socle prévu pour les commentaires en direct, il doit continuer d'exister et
d'évoluer séparément. Aucune « unification » des deux surfaces — l'incrustation du reader et la
sheet du listing sont deux composants différents servant deux usages différents. Cette tâche
n'ajoute la sheet QUE dans `MyStoriesView`.

**Réutilisation.** La sheet est `CommentsSheetView`, celle des posts — on ne réécrit rien. Elle
attend un `FeedPost` alors que la ligne porte un `StoryItem` : la conversion passe par
`APIPost.toFeedPost(preferredLanguages:)`, cache d'abord (`StoryService.shared.cachedPost(id:)`),
réseau ensuite (`fetchPost(id:)`) si le cache est froid.

`CommentsSheetView` exige `statusViewModel` et `storyViewModel` en `@EnvironmentObject` :
`MyStoriesView` possède les deux (`statusViewModel` en paramètre, `viewModel` comme
`StoryViewModel`) et doit les réinjecter sur la sheet — sans quoi la présentation crashe à la
traversée de frontière de sheet.

Bouton, placé dans `MyStoryRow` juste avant la branche anneau/`⋯` :

```swift
            if !isSelecting {
                Button {
                    onOpenComments()
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 15, weight: .semibold))
                        if story.commentCount > 0 {
                            Text("\(story.commentCount)")
                                .font(MeeshyFont.relative(12, weight: .medium))
                        }
                    }
                    .foregroundColor(.secondary)
                    .padding(8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            }
```

Comme pour l'anneau, le bouton est masqué du rotor (la ligne est `children: .ignore`) et l'accès
VoiceOver passe par une action de ligne :

```swift
        .accessibilityAction(named: Text(String(
            localized: "story.mine.comments.a11y",
            defaultValue: "Afficher les commentaires"
        ))) { onOpenComments() }
```

Résolution et présentation, côté `MyStoriesView` :

```swift
    @State private var commentTarget: MyStoriesCommentTarget?
    @State private var isResolvingComments = false

    /// Résout le `FeedPost` derrière une story pour alimenter la sheet de
    /// commentaires des posts. Cache d'abord — une story fraîchement listée est
    /// déjà en cache, inutile de payer un aller-retour réseau pour l'ouvrir.
    private func openComments(for story: StoryItem) {
        guard !isResolvingComments else { return }
        let preferred = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        if let cached = StoryService.shared.cachedPost(id: story.id) {
            commentTarget = MyStoriesCommentTarget(post: cached.toFeedPost(preferredLanguages: preferred))
            return
        }
        isResolvingComments = true
        Task {
            do {
                let post = try await StoryService.shared.fetchPost(id: story.id)
                commentTarget = MyStoriesCommentTarget(post: post.toFeedPost(preferredLanguages: preferred))
            } catch {
                Logger.stories.error(
                    "openComments failed for \(story.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                FeedbackToastManager.shared.showError(
                    String(localized: "story.mine.comments.error", defaultValue: "Commentaires indisponibles"))
            }
            isResolvingComments = false
        }
    }
```

```swift
        .sheet(item: $commentTarget) { target in
            CommentsSheetView(post: target.post, accentColor: target.post.authorColor)
                .environmentObject(statusViewModel)
                .environmentObject(viewModel)
        }
```

```swift
/// `FeedPost` résolu pour la sheet de commentaires d'une story.
private struct MyStoriesCommentTarget: Identifiable {
    let post: FeedPost
    var id: String { post.id }
}
```

**Clés de localisation** (7 langues, `extractionState: "manual"`, `state: "translated"`) :

| Clé | fr | en | es | de | it | pt-BR | ar |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `story.mine.comments.a11y` | Afficher les commentaires | Show comments | Mostrar los comentarios | Kommentare anzeigen | Mostra i commenti | Mostrar os comentários | عرض التعليقات |
| `story.mine.comments.error` | Commentaires indisponibles | Comments unavailable | Comentarios no disponibles | Kommentare nicht verfügbar | Commenti non disponibili | Comentários indisponíveis | التعليقات غير متاحة |

**Tests** (`MyStoriesCommentsButtonTests`) :
- une garde pure `MyStoriesCommentsResolver.shouldUseCache(cachedPost:) -> Bool` : cache présent → pas d'appel réseau ; cache absent → appel réseau ;
- le libellé a11y de la ligne reste inchangé par l'ajout du bouton (le bouton est masqué du rotor) ;
- l'ordre visuel : le bouton commentaire précède l'anneau/`⋯` — vérifié par une garde de source sur `MyStoriesView.swift` ancrée sur le comportement (l'index de `"bubble.left"` est inférieur à celui de `"ellipsis"`), pas sur une fenêtre de caractères.

Vérification manuelle exigée : ouvrir la sheet depuis une story ayant des commentaires, en
publier un, constater que le compteur de la ligne suit.

---

# Extension 2 — pipeline d'enregistrement unique (demande utilisateur, 2026-07-26)

## Le constat qui motive ces tâches

Quatre chemins produisent aujourd'hui un MP4 de story. Trois convergent, un diverge :

| Chemin | Filigrane | Interlude de marque | Orchestrateur |
| --- | --- | --- | --- |
| Liste → « Enregistrer » | ✅ avec pseudo | ✅ | `StoryPhotoSaveService` |
| Reader → « Exporter » (Task 7) | ✅ avec pseudo | ✅ | `StoryPhotoSaveService` |
| Liste → « Partager » | ✅ avec pseudo | ✅ | `StoryExportShareViewModel` |
| **Composer timeline → « Enregistrer »** | ⚠️ **sans pseudo** | ❌ **absent** | `TimelineExportController` → `StoryExporter` direct |

`TimelineExportFlow.swift:45` appelle `MeeshyExportWatermark.make()` sans `username:`, et
`:60-72` invoque `StoryExporter.export` **sans paramètre `intro:`**. Une story enregistrée
depuis l'outil timeline sort donc sans interlude et avec un filigrane amputé.

## Task 9 : une seule pipeline d'enregistrement de story

**Objectif.** Tout chemin qui écrit une story dans la photothèque passe par le même
orchestrateur, pour que filigrane et interlude soient garantis par construction et non par
répétition de code.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelineExportFlow.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/TimelineExportParityTests.swift`

**Correction de conception (2026-07-26, après vérification).** Une première version de cette
tâche prévoyait d'injecter `watermark:` et `intro:` en paramètres de
`TimelineExportController.start(...)`, au motif que le SDK ne peut pas dépendre de l'app.
**Ce motif est faux** : `StoryExportIntroFactory` n'a AUCUNE dépendance applicative — toutes
les siennes sont SDK (`AuthManager` et `CacheCoordinator` dans MeeshySDK, `MeeshyConfig`,
`ThumbHashDecoder`, `StoryExportIntroContent` et `MeeshyExportWatermark` dans MeeshyUI,
`DynamicColorGenerator` dans MeeshySDK). Elle ne vit côté app que par accident de la Task 1.

**Ce qu'on fait donc — réutiliser, pas recréer :**

1. **Déplacer** `StoryExportIntroFactory` de
   `apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift`
   vers le SDK, à côté de son modèle :
   `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportIntroFactory.swift`.
   API publique inchangée (`public enum StoryExportIntroFactory { public static func currentUser() async -> StoryExportIntroContent? }`).
   `StoryExportLanguageResolver` **reste côté app** — il dépend de `StoryItem`, un modèle de liste, pas du bake.
2. `TimelineExportController.start(composer:)` appelle **la même** fabrique et
   `MeeshyExportWatermark.make(username: AuthManager.shared.currentUser?.username)`,
   puis transmet `intro:` à `StoryExporter.export(...)` — paramètre qu'il n'utilisait pas.
3. `StoryPhotoSaveService` et `StoryExportShareViewModel` continuent d'appeler la même fabrique,
   désormais importée du SDK. **Aucun changement de comportement de leur côté** — c'est le test
   de non-régression le plus important de la tâche.

Aucun nouveau paramètre, aucune décision dupliquée, un seul endroit qui sait ce qu'est
l'interlude d'un export Meeshy.

**Test de parité** — c'est le cœur de la tâche : un test qui échoue si un chemin d'export
oublie le filigrane ou l'interlude. Il ne compare pas des pixels, il vérifie que les
**entrées** passées à l'exporteur sont identiques entre les chemins :

```swift
/// Garde de parité : tout chemin d'export de story doit fournir filigrane ET interlude.
/// Sans ce test, un quatrième chemin réintroduirait silencieusement la divergence
/// (constatée le 2026-07-26 : l'export timeline sortait sans interlude et avec un
/// filigrane sans pseudo, alors que les trois autres chemins les portaient).
func test_timelineExport_passesWatermarkAndIntroToExporter() async {
    let exporter = SpyStoryExporter()
    let controller = TimelineExportController(exporter: exporter)
    let watermark = MeeshyExportWatermark.make(username: "alice")
    let intro = StoryExportIntroContent(displayName: "Alice", username: "alice", accentColorHex: "4ECDC4")

    controller.start(composer: makeComposer(), watermark: watermark, intro: intro)
    await exporter.waitForCall()

    XCTAssertNotNil(exporter.lastWatermark, "l'export timeline doit graver le filigrane")
    XCTAssertNotNil(exporter.lastIntro, "l'export timeline doit graver l'interlude de marque")
    XCTAssertEqual(exporter.lastIntro?.username, "alice")
}
```

**Vérification manuelle exigée** : enregistrer la MÊME story depuis l'outil timeline puis
depuis la liste, et comparer les deux MP4 — l'interlude et le filigrane (pseudo inclus)
doivent être présents dans les deux.

## Task 10 : le reader retrouve « Partager », la liste garde la sienne

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (réactive `showExportShareSheet`)
- Test: `apps/ios/MeeshyTests/Unit/Views/StoryViewerExportRailTests.swift`

**Le problème que ça corrige.** La Task 7 a fait passer le bouton « Exporter » du reader par
`StoryPhotoSaveService`. Conséquence non anticipée, relevée en revue : le reader a perdu
**tout** accès au partage externe (WhatsApp, AirDrop, Messages) — pas seulement le choix de
la langue gravée. Le bouton gardait pourtant le libellé « Exporter » et l'icône de partage
`square.and.arrow.up.fill`, donc il mentait sur son comportement.

**Ce qu'on livre.** Le rail du reader porte désormais **deux** actions distinctes, alignées
sur celles de la liste :

| Action | Icône | Comportement |
| --- | --- | --- |
| Partager | `square.and.arrow.up.fill` | sheet d'export (choix de langue) → `UIActivityViewController` |
| Enregistrer | `square.and.arrow.down.fill` | `StoryPhotoSaveService.save(story:)` → anneau de progression, annulable |

Le code aujourd'hui mort dans `StoryViewerView.swift` (`showExportShareSheet`,
`exportShareViewModel`, la `.sheet` associée) redevient le support de « Partager » — il n'y a
donc rien à supprimer, seulement à rebrancher.

L'anneau de progression ne concerne que « Enregistrer » : « Partager » doit rester au premier
plan jusqu'à la présentation de la share sheet système, sinon celle-ci surgirait après coup
alors que l'utilisateur a navigué ailleurs.

**Accessibilité** : les deux boutons portent leur propre libellé (le rail n'est pas un élément
fusionné). L'anneau porte libellé + valeur, comme livré en Task 7.

**Tests** (purs, sur un résolveur extrait) :
- le rail d'une story de l'auteur expose « Partager » ET « Enregistrer » ;
- une story qui n'est pas de l'auteur n'expose aucune des deux ;
- pendant un job de sauvegarde, « Enregistrer » est remplacé par l'anneau et « Partager » reste présent.

---

## Task 11 : supprimer le compteur de commentaires inerte de la rangée de métriques

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift` (`MyStoryRow`, rangée `metric(...)`)
- Test: `apps/ios/MeeshyTests/Unit/Views/MyStoriesCommentsButtonTests.swift` (garde de source à étendre)

**Le doublon.** Depuis la Task 8, la ligne affiche le nombre de commentaires **deux fois** :
1. dans la rangée de métriques, en `metric(icon: "bubble.left.fill", value: story.commentCount)` — purement décoratif, non tappable ;
2. à côté du `⋯`, en bouton actionnable ouvrant `CommentsSheetView`.

Deux affichages du même chiffre, dont un seul réagit au toucher : l'utilisateur ne peut pas
deviner lequel est cliquable, et tapoter le décoratif ne fait rien.

**Ce qu'on livre.** La métrique `bubble.left.fill` est **retirée** de la rangée. Les métriques
« vues » et « réactions » restent inchangées. Le compteur de commentaires ne subsiste que sur le
bouton actionnable, à gauche du `⋯`.

```swift
                        HStack(spacing: 12) {
                            metric(icon: "eye.fill", value: story.viewCount ?? 0)
                            metric(icon: "heart.fill", value: story.reactionCount)
                        }
```

**Le libellé VoiceOver de la ligne ne change PAS.** `story.mine.row.a11y` continue d'annoncer
« … N vues, N réactions, N commentaires » : le nombre reste une information de la ligne, seule
sa duplication visuelle disparaît. Retirer le mot du libellé priverait l'utilisateur VoiceOver
d'une donnée que l'écran affiche toujours (sur le bouton).

**Garde de source à étendre** : après la modification, `bubble.left.fill` ne doit plus apparaître
dans le corps de `MyStoryRow`, et `"bubble.left"` (le bouton) doit toujours y être. Réutiliser
`strippingComments(_:)` déjà présent dans le fichier de test.
