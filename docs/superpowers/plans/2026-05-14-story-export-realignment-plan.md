# Story Export Realignment — Plan

**Date** : 2026-05-14
**Status** : Ready for execution (next session)
**Type** : Architectural realignment + remediation
**Estimated effort** : 1.5–2 days

---

## 1. Context

### 1.1 Product principle (clarified 2026-05-14)

Les stories Meeshy se publient **RAW** au backend :
- Assets individuels et réutilisables : `video bg`, `audio bg`, `voice attachments`, `images`, `stickers`
- `StoryEffects` JSON : texte, keyframes, transitions, filtres, opening, clipTransitions

Le backend **ne stocke jamais** de MP4 baked composite. Les viewers re-rendent localement depuis les assets + effects, en suivant le **Prisme Linguistique** :
- Texte retraduit par viewer (langue préférée du viewer, pas de l'auteur)
- Audio retraduit (transcription → translation → TTS) par viewer
- Chaque média réutilisable indépendamment

Le **MP4 export** est une feature distincte :
- Déclenchée par **l'auteur seulement**, depuis le viewer de SA story
- Bake tous les aspects (effets, transitions, filtres, durée exacte, langue principale auteur)
- Destiné au **partage hors Meeshy** (Photos, Messages, WhatsApp, X, AirDrop, etc.)
- **Ne touche jamais le backend Meeshy**

### 1.2 Misalignment actuel sur main

Sprint 8 publish→exporter wiring (`docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md`) a été conçu et mergé pour wirer `StoryExporter` dans le publish path : iOS bake un MP4 puis l'upload via TUS, le mediaId est ajouté à `mediaIds[]` dans `POST /posts`. Cela **détruit le Prisme Linguistique** car le texte/audio ne sont plus retraduisibles dans la version uploadée.

**Commits désalignés à corriger** :
- `325bd850` — P4 wire `StoryViewModel.runStoryUpload` → `StoryVideoExportService.prepareExport`
- `81983302` — P5 `StoryPublishQueueItem.videoExportURL` + resume fast-path
- `2448cfbd` — P6 `StoryTrayView .exporting` phase rendering
- `4d0c4e88` — P7 integration tests for publish→export end-to-end
- `15a7ef1e` — Xcode project registration of `StoryVideoExportService.swift`
- `073c37b1` — P0-D fix `hasValidVideoExport` gating in `executeQueuedPublish`
- `7b6ba7df`, `85a8aabd` — Sendable trampoline fixes (côté `StoryVideoExportService`, restent valides après refactor)

**Commits qui restent valides** :
- `e033c41f` — P1 `StorySlide.needsVideoExport` extension (réutilisable comme heuristique côté export-to-share)
- `377e0326` — P2 `StoryExporter.export(_:to:progress:)` (l'API évoluée reste utile)
- `efc70f19` — P3 `StoryVideoExportService` orchestrator (à réorienter, voir §3)
- `8aa819a1` — Spec document (à amender, voir §6)

### 1.3 Goal

Aligner le code avec le principe produit :
1. **Retirer** le wiring publish→export (P4-P7 + P0-D).
2. **Conserver et réorienter** `StoryVideoExportService` (P3) comme orchestrateur de l'export-to-share déclenché par l'auteur.
3. **Construire** la feature "Exporter en vidéo" déclenchée depuis le story viewer (bouton author-only).
4. **Mettre à jour** la spec et la documentation QA.

---

## 2. Pre-flight checks (à faire avant tout)

| Check | Commande | Critère |
|-------|----------|---------|
| Sur main, à jour | `cd /Users/smpceo/Documents/v2_meeshy && git status && git pull origin main` | Working tree clean (sauf WIP attendue), HEAD = origin/main |
| Mémoire chargée | Lire `project_story_media_architecture.md` | Principe confirmé |
| Build vert avant changement | `./apps/ios/meeshy.sh build` | Succès |
| Tests verts avant changement | `./apps/ios/meeshy.sh test` | 0 failures (les tests P7 publish-export passeront toujours — c'est pour ça qu'on doit les retirer aussi) |
| Worktree dédié | `git worktree add .claude/worktrees/feat+story-export-realignment -b feat/story-export-realignment main` | Worktree créé |

Toutes les modifications se font dans le worktree `feat+story-export-realignment`. Ne **pas** toucher main directement.

---

## 3. Plan d'exécution — étape par étape

Chaque étape = **1 commit atomique**. RED → GREEN → REFACTOR. Le build et les tests doivent passer après chaque commit.

### Étape 1 — Retirer le wiring `prepareExport` du publish path

**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`

**Lignes à supprimer/modifier** :
- `:64-75` — docstrings sur le fast-path TUS resume (à conserver mais simplifier)
- `:114-149` — bloc fast-path `hasValidVideoExport` dans `executeQueuedPublish` → **supprimer entièrement**
- `:830-1024` — bloc `runStoryUpload` qui appelle `videoExporter.prepareExport` :
  - `:888-911` — variable `exportedVideoURL` + appel `prepareExport` → **supprimer**
  - `:913-925` — branche `if let videoURL = exportedVideoURL` (TUS upload du MP4) → **supprimer**
  - `:948` `:982` — early-out `if exportedVideoURL == nil` sur mediaObjects/audioObjects → simplifier (toujours `if` true)
  - `:1013-1023` — `cleanupTempExport(at:)` après POST → **supprimer**
  - `:1008` — `mediaIds: allMediaIds.isEmpty ? nil : allMediaIds` → conserver, c'est la voie correcte (assets RAW déjà dans `allMediaIds`)
- `:740-754` — bloc `videoExportURL: nil` dans la construction `StoryPublishQueueItem` → simplifier (retirer le champ)

**Injection `videoExporter`** dans `StoryViewModel` init/properties :
- Trouver où le service est injecté (probablement via `StoryVideoExportService.shared` ou DI) et **retirer la dépendance**.

**Commit** :
```
revert(stories/publish): unwire MP4 export from publish path

Stories must publish RAW assets + JSON effects so the Prisme Linguistique
can retranslate text/audio per viewer. The baked MP4 path (Sprint 8 P4)
destroyed reusability and translatability.

Reverts the publish coupling introduced by 325bd850 (P4), 073c37b1 (P0-D).
Keeps StoryVideoExportService intact for the upcoming author-only export
feature (next commits).

Refs: docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md
```

**Vérification** : `./apps/ios/meeshy.sh build` + tests `StoryViewModel*`. Le test `StoryViewModel_VideoExportWiringTests.swift` va casser — c'est attendu, on le retire à l'étape 4.

### Étape 2 — Retirer la persistance `videoExportURL` de la queue (P5 revert)

**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift`

**Changements** :
- `:54` — supprimer le champ `videoExportURL: URL?`
- `:60` — supprimer le computed `hasValidVideoExport`
- Codable : retirer le champ du `init(from decoder:)` et `encode(to encoder:)` (avec back-compat decoding — un item sans `videoExportURL` doit toujours décoder OK)
- Tests : `StoryPublishQueueItem_VideoExportTests.swift` → **supprimer le fichier**

**Commit** :
```
revert(stories/sdk): remove StoryPublishQueueItem.videoExportURL (P5)

The MP4 export pre-bake path is no longer part of publish — stories
publish RAW assets. The queue item no longer needs a baked-video resume
URL.

Reverts 81983302. Codable decoding stays back-compat for queues
persisted with the old field (decoder ignores unknown keys).
```

**Vérification** : `./apps/ios/meeshy.sh test --filter StoryPublishQueue`. SDK tests verts.

### Étape 3 — Retirer la phase `.exporting` du `StoryTrayView` (P6 revert)

**Fichier** : `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift`

**Changements** :
- `:285-287` — retirer la branche `phase == .exporting` dans `storyTrayUploadLabel()`
- `:402-460` — retirer le rendu spécifique `.exporting` du `MyStoryButton`
- `StoryViewModel.StoryUploadState.UploadPhase` (StoryViewModel.swift `:248-253`) — retirer le case `.exporting`. Si d'autres call sites switch sur cette enum, les corriger.

**Tests à retirer** :
- `apps/ios/MeeshyTests/Unit/Views/StoryTrayView_ExportingPhaseTests.swift` (si présent) → **supprimer le fichier**

**Commit** :
```
revert(stories/ui): drop StoryTrayView .exporting phase (P6)

Publish no longer triggers a video export, so the "Export en cours… X%"
label has no caller. The phase enum case is removed.

Reverts 2448cfbd.
```

**Vérification** : `./apps/ios/meeshy.sh build` succeed.

### Étape 4 — Retirer les tests d'intégration publish→export (P7 revert)

**Fichiers à supprimer** :
- `apps/ios/MeeshyTests/Integration/StoryPublishExporterIntegrationTests.swift`
- `apps/ios/MeeshyTests/Unit/Services/StoryViewModel_VideoExportWiringTests.swift` (si présent)

**Garder** :
- `apps/ios/MeeshyTests/Unit/Services/StoryVideoExportServiceTests.swift` — le service reste, ses tests aussi (réorientation à l'étape 6)
- `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StorySlideExportTriggerTests.swift` — `needsVideoExport` reste utile pour décider quand activer le bouton "Exporter en vidéo" auteur

**Commit** :
```
revert(stories/tests): drop publish→export integration tests (P7)

Tests covered the now-removed publish path coupling. The export service
itself stays covered via its unit tests (will be reoriented to the
author-only share flow in upcoming commits).

Reverts 4d0c4e88.
```

**Vérification** : `./apps/ios/meeshy.sh test`. Tous les tests verts.

### Étape 5 — Retirer la registration du service du publish flow et docs QA

**Fichiers** :
- `apps/ios/Meeshy.xcodeproj/project.pbxproj` — la registration de `StoryVideoExportService.swift` reste OK (le service est conservé), pas de change ici.
- `docs/qa/2026-05-12-story-canvas-smoke-tests.md` — retirer le scénario #13 (manual video export end-to-end via publish) qui n'est plus applicable. Le remplacer par un scénario "Author exporte vers Photos / partage externe" décrit à l'étape 7.

**Commit** :
```
docs(qa): remove publish-path export smoke #13, replace with share-out

The manual smoke test for publish→export end-to-end is replaced by the
author-only "Export to share" scenario.
```

### Étape 6 — Réorienter `StoryVideoExportService` pour le partage externe

**Fichier** : `apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift`

**Changements** :
- Garder `prepareExport(slide:, onProgress:, onPhaseChange:) async -> URL?` — l'API est correcte pour ce use case
- Renommer `cleanupTempExport(at:)` → `cleanupExport(at:)` (mineur, optionnel)
- Mettre à jour la docstring de `StoryVideoExportService` pour expliquer que c'est un orchestrateur **author-only, external share**, pas publish
- Le `StoryUploadPhase` enum local devient inutile (publish n'utilise plus cette phase). Le retirer ou le renommer `StoryExportPhase` si on veut garder un signal pour l'UI du bouton "Exporter".

**Tests** : `StoryVideoExportServiceTests.swift` — mettre à jour les docstrings (test description) pour refléter le nouveau context (export-to-share, pas publish). Aucun changement de logique nécessaire — la mécanique routing/fallback/cleanup reste pertinente.

**Commit** :
```
refactor(stories/export): reorient StoryVideoExportService for author share

The service orchestrates the author-only "Export to share" flow, not
the publish path. Updates docstrings and removes the now-orphan
StoryUploadPhase enum (UI phase tracking moves to the share-button
view in upcoming commits).
```

### Étape 7 — Construire la feature "Exporter en vidéo" auteur-only

**Nouveaux fichiers** :

| Fichier | Rôle |
|---------|------|
| `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift` | SwiftUI view : bouton "Exporter en vidéo" + progress + UIActivityViewController wrapper |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryExportShareViewModel.swift` | @MainActor VM : drive `StoryVideoExportService.prepareExport`, expose progress + URL, gère cleanup post-share |
| `apps/ios/MeeshyTests/Unit/ViewModels/StoryExportShareViewModelTests.swift` | Tests TDD : happy path, fail-fallback, cancel |

**Fichiers à modifier** :
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` ou `StoryViewerView+Content.swift` — ajouter un bouton "Exporter" visible **seulement si `story.authorId == currentUser.id`**. Sur tap → présenter `StoryExportShareSheet`.

**Test scenarios à couvrir** (XCTest, `@MainActor`) :
1. `test_export_videoSlide_producesURL_presentsActivityVC` — happy path
2. `test_export_staticSlide_skipsExport_warnsUser` — `needsVideoExport == false` ; afficher un message (ou désactiver le bouton à l'avance)
3. `test_export_failure_showsErrorToast` — `prepareExport` retourne nil, toast d'erreur
4. `test_export_completion_cleansUpTempFile` — après share success (`UIActivityViewController.completionWithItemsHandler`)
5. `test_export_cancel_cleansUpTempFile` — user annule le share, MP4 doit être nettoyé
6. `test_button_visible_onlyForAuthor` — pour un viewer non-auteur, bouton absent

**Pseudo-code pour le ViewModel** :
```
@MainActor
final class StoryExportShareViewModel: ObservableObject {
    @Published var phase: ExportPhase = .idle
    @Published var progress: Double = 0
    @Published var sharedURL: URL? = nil
    @Published var errorMessage: String? = nil

    enum ExportPhase { case idle, exporting, sharing, completed, failed }

    private let exporter: StoryVideoExportServiceProviding

    func startExport(slide: StorySlide) async {
        guard slide.needsVideoExport else {
            errorMessage = "Cette story n'a pas de contenu animé à exporter."
            return
        }
        phase = .exporting
        let url = await exporter.prepareExport(
            slide: slide,
            onProgress: { [weak self] p in self?.progress = p },
            onPhaseChange: nil
        )
        if let url {
            sharedURL = url
            phase = .sharing
        } else {
            errorMessage = "L'export a échoué."
            phase = .failed
        }
    }

    func onShareComplete(success: Bool) {
        if let url = sharedURL { exporter.cleanupTempExport(at: url) }
        sharedURL = nil
        phase = success ? .completed : .idle
    }
}
```

**UI integration** dans `StoryViewerView` :
```
if story.authorId == currentUserId {
    Button("Exporter en vidéo") { showingExportSheet = true }
        .sheet(isPresented: $showingExportSheet) {
            StoryExportShareSheet(slide: currentSlide, viewModel: exportViewModel)
        }
}
```

**Commits** :
```
feat(stories/export): StoryExportShareViewModel for author share flow

ViewModel orchestrating the author-only export: drives
StoryVideoExportService, exposes progress, surfaces the temp MP4 URL
to a UIActivityViewController, cleans up after share completes.

Test coverage: 6 scenarios (happy/static-slide/failure/cleanup/cancel/
author-only visibility).
```

```
feat(stories/export): StoryExportShareSheet + viewer button

Adds the "Exporter en vidéo" button visible only to the story author.
Tap presents a sheet driving StoryExportShareViewModel and surfaces
UIActivityViewController for external sharing (Photos, Messages, etc.).
```

### Étape 8 — Mettre à jour la spec et CLAUDE.md

**Fichier** : `docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md`

Ajouter en tête :

```
> **NOTE (2026-05-14)** : La direction prise par ce spec (wirer l'export
> dans le publish path) était incorrecte. Le principe produit est :
> stories publient RAW (assets + JSON effects) pour le Prisme Linguistique ;
> le MP4 export est une feature auteur-only, partage externe Meeshy.
> Plan de remédiation : `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`.
```

**Fichier** : `apps/ios/CLAUDE.md` — ajouter une section "Story Architecture" qui documente le principe :

```markdown
## Story Architecture — Raw assets, never baked

Stories Meeshy se publient RAW au backend :
- Assets individuels (video bg, audio bg, voice, images, stickers) via TUS pre-upload
- StoryEffects JSON (texte, keyframes, transitions, filtres, opening)

Le backend ne stocke jamais de MP4 baked composite. Viewers re-rendent
localement en suivant le Prisme Linguistique (texte/audio retraduits par
viewer).

Le MP4 export (StoryVideoExportService + StoryExporter) est une feature
auteur-only, partage externe (UIActivityViewController / Photos) — NE
TOUCHE JAMAIS LE BACKEND.

Source : `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`
```

**Commit** :
```
docs(story): clarify raw-publish + author-export architecture

Adds an architecture section in apps/ios/CLAUDE.md and annotates the
publish-exporter wiring spec to flag it as superseded by the realignment
plan.
```

---

## 4. Test plan global

À la fin de toutes les étapes :

| Suite | Commande | Critère |
|-------|----------|---------|
| Unit iOS | `./apps/ios/meeshy.sh test` | 0 failures, count >= prior count |
| SDK tests | `xcodebuild test -scheme MeeshySDK-Package` | 0 failures |
| Build app | `./apps/ios/meeshy.sh build` | Succeed, zero new Swift 6 warning |
| Build SDK | `xcodebuild build -scheme MeeshyUI` | Succeed |
| Manual smoke (auteur perspective) | Voir §5 | Author voit + utilise le bouton |
| Manual smoke (viewer perspective) | Voir §5 | Viewer ne voit pas le bouton ; story se charge avec traductions |

---

## 5. Smoke tests manuels

À ajouter dans `docs/qa/2026-05-14-story-export-share-smoke-tests.md` (créer fichier).

**Pré-requis** : 2 users (Auteur A + Viewer B), gateway prod ou staging.

| # | Scénario | Attente |
|---|----------|---------|
| 1 | A crée story texte-only + publie | Backend reçoit storyEffects + 0 video media. Pas de bouton "Exporter" sur la story (texte-only = `needsVideoExport == false`). |
| 2 | A crée story avec background video + publie | Backend reçoit storyEffects + 1 video bg media (raw). B ouvre la story → voit la video bg + overlays texte rendus dans SA langue préférée. |
| 3 | A appuie sur "Exporter en vidéo" depuis story §2 | Progress "Export en cours… X%". Une fois fini, UIActivityViewController s'ouvre. A choisit "Enregistrer dans Photos" → MP4 visible dans Photos avec tous les overlays + transitions baked, durée exacte du slide. |
| 4 | A choisit "Annuler" dans le UIActivityViewController | Pas de fichier visible dans Photos. Le fichier temp est nettoyé (Console.app : `cleaned up temp export`). |
| 5 | B ouvre la même story #2 | Pas de bouton "Exporter" (B n'est pas auteur). B peut voir/partager la story via les actions standard (re-share via Meeshy). |
| 6 | A crée story avec voice attachment FR + B en EN ouvre | B voit le voice traduit en EN (TTS). C'est la preuve que le RAW + retranslation marche — l'MP4 baked aurait perdu cette feature. |
| 7 | A exporte la story #6 vers WhatsApp | Le MP4 contient le voice FR de l'auteur (langue principale auteur), pas la traduction de B. C'est attendu : l'export reflète la vision de l'auteur, pas du viewer. |

---

## 6. Stratégie de commit + push

Tous les commits dans `feat/story-export-realignment` (worktree `.claude/worktrees/feat+story-export-realignment`).

**Ordre commit** :
1. Étape 1 — revert publish wiring
2. Étape 2 — revert queue persistence
3. Étape 3 — revert UI phase
4. Étape 4 — revert integration tests
5. Étape 5 — update docs QA
6. Étape 6 — refactor service docstrings
7. Étape 7a — StoryExportShareViewModel + tests
7. Étape 7b — StoryExportShareSheet + viewer button
8. Étape 8 — spec/CLAUDE.md docs

**Final push & merge** :
```bash
cd .claude/worktrees/feat+story-export-realignment
git push -u origin feat/story-export-realignment

# Option A : PR review classique
gh pr create --base main --title "feat(stories): realign export as author-share feature" --body "$(cat <<'EOF'
## Summary
- Reverts Sprint 8 P4-P7 publish→export wiring (misaligned with Prisme Linguistique)
- Builds author-only "Export to share" feature using existing StoryVideoExportService
- Stories publish RAW assets + JSON effects (preserves text/audio retranslation per viewer)
- MP4 baked export reserved for external share (Photos, Messages, WhatsApp, etc.)

## Test plan
- [ ] `./apps/ios/meeshy.sh test` 0 failures
- [ ] `xcodebuild test -scheme MeeshySDK-Package` 0 failures
- [ ] Manual smoke §5 scenarios 1-7 from plan doc

Plan: docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md
EOF
)"

# Option B : admin merge to main (si pas de CI bloquant, app en pré-launch)
# gh pr merge --admin --merge
```

**Cleanup post-merge** :
```bash
cd /Users/smpceo/Documents/v2_meeshy
git worktree remove .claude/worktrees/feat+story-export-realignment
git branch -D feat/story-export-realignment
```

---

## 7. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| `runStoryUpload` est très long (200+ lignes), retirer les `exportedVideoURL` peut introduire des bugs subtils | Régression publish | Tests existants `StoryViewModel*` doivent rester verts après retrait. Si un test casse, vérifier qu'il ne test pas le path publish→export (à retirer aussi). |
| `StoryPublishQueueItem` Codable change peut casser le décodage des queues persistées avec l'ancien field | Données utilisateur perdues à la mise à jour | Garder le decoder back-compat (ignorer le champ absent). Tester avec un JSON ancien contenant `videoExportURL`. |
| Un autre call site quelque part appelle `prepareExport` côté publish | Code mort post-refactor | `grep -rn "prepareExport" apps/ios/Meeshy` après l'étape 1 → ne doit plus rien apparaître sauf le service lui-même + future viewmodel share. |
| UIActivityViewController peut crasher si l'URL pointe vers un fichier supprimé | UX cassée | Cleanup uniquement APRÈS `completionWithItemsHandler` callback. Garder le fichier en vie jusqu'à confirmation share réussie ou annulée. |
| `needsVideoExport == false` pour des stories qui pourraient quand même bénéficier d'un export (e.g. simple image + texte) | Bouton "Exporter" pas affiché alors que ce serait utile | Décision UX : afficher le bouton toujours pour l'auteur, et si `needsVideoExport == false`, exporter quand-même via un path "image+overlays → 3-sec MP4" ? À discuter — pour l'instant, le bouton est conditionné par `needsVideoExport == true`. |

---

## 8. Acceptance criteria

À la fin de l'exécution du plan :

1. ✅ `StoryViewModel.runStoryUpload` ne mentionne plus `prepareExport`, `exportedVideoURL`, `videoExportURL`
2. ✅ `StoryPublishQueueItem` n'a plus de champ `videoExportURL` ; décodage back-compat OK
3. ✅ `StoryTrayView` n'a plus de branche `.exporting` ; pas de "Export en cours…" affiché pendant publish
4. ✅ `StoryViewerView` (ou +Content) affiche un bouton "Exporter en vidéo" **seulement** si l'utilisateur courant est l'auteur de la story ET `slide.needsVideoExport == true`
5. ✅ Tap sur le bouton → progress visible → `UIActivityViewController` présenté → MP4 partageable
6. ✅ MP4 cleanup après share completion (success OU annulation)
7. ✅ Tous les tests passent (`./apps/ios/meeshy.sh test`)
8. ✅ Build app + SDK verts sans nouveau warning Swift 6
9. ✅ `apps/ios/CLAUDE.md` documente le principe "Story = RAW publish + author-only export"
10. ✅ La spec `2026-05-12-story-publish-exporter-wiring-design.md` a une note "SUPERSEDED" en tête
11. ✅ Mémoire `project_story_media_architecture.md` reste la source de vérité ; pas de duplication
12. ✅ Smoke tests §5 scénarios 1-7 exécutés et documentés dans `docs/qa/2026-05-14-story-export-share-smoke-tests.md`

---

## 9. Hors-scope

- **Animations du bouton "Exporter"** : design discret, pas de gradient flashy. Réserver les animations pour les phases d'export (progress) si pertinent.
- **Export multi-slide** : si la story a plusieurs slides, choisir : (a) un MP4 par slide, ou (b) un MP4 concaténé. Pour V1, **un MP4 par slide actif au moment du tap**. Multi-slide concaténation = follow-up.
- **Export resolution adaptive** : 1080×1920 fixe (cohérent avec spec mère). HEVC / 720p = follow-up perf.
- **Watermark "Made on Meeshy"** : à discuter produit. Pas dans ce plan.
- **Analytics** : Firebase event `story_exported` peut être ajouté en bonus, pas critique pour la fonctionnalité.
- **iOS < 17** : ce plan suppose iOS 17+. Pas de fallback pour les anciennes versions.

---

## 10. Validation finale (avant clôture)

À l'issue du plan, mettre à jour :

- `project_story_media_architecture.md` : ajouter "Implémenté 2026-05-XX, commits X..Y, PR #ZZZ"
- `MEMORY.md` entry : remplacer "Sprint 8 P4-P7 wiring publish→exporter DÉSALIGNÉ avec ce principe, plan de remédiation à exécuter" par "Réaligné 2026-05-XX, PR #ZZZ"

---

**Fin du plan.**
