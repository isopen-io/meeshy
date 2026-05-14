# Story Publish → Exporter Wiring — Design

> **SUPERSEDED (2026-05-14)** : la direction prise par ce spec (wirer
> l'export dans le publish path) était incorrecte vis-à-vis du **Prisme
> Linguistique**. Les stories publient désormais RAW (assets + JSON
> effects) ; le MP4 baked est une feature **auteur-only**, partage hors
> Meeshy uniquement. Plan de remédiation appliqué : `docs/superpowers/plans/2026-05-14-story-export-realignment-plan.md`.

**Date** : 2026-05-12
**Status** : ~~Approved (design phase)~~ → **Superseded**
**Worktree (recommended)** : `.claude/worktrees/feat+story-publish-exporter`
**Related** :
- `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md` (spec mère — Phase 4 export pipeline)
- `docs/superpowers/specs/2026-05-09-story-canvas-phase4-followups-design.md` (Plan B — synthetic track + SSIM + layer cache)
- `docs/superpowers/specs/2026-05-12-story-glass-backdrop-snapshot-design.md` (Step 2 backdrop)
- Audit dormant pipeline : `MEMORY.md` entry "StoryPublishService → StoryExporter wiring (post-launch)"

---

## 1. Contexte et objectif

### 1.1 Problème

Tout le pipeline Phase 4 (`StoryExporter` + `StoryAVCompositor` + B1 synthetic track + B3 cache + B2 SSIM + Step 2 backdrop) est **dormant en runtime**. Le code, les tests et la documentation existent (30+ tests passants en isolation) mais **aucun call site production n'invoque `StoryExporter.export(_:to:)`**.

Vérification (2026-05-12) :
```bash
$ grep -rn "StoryExporter\.export" --include='*.swift' apps/ios/Meeshy 2>/dev/null
# 0 hits
$ grep -rn "StoryExporter\.export\|StoryExporter\.shared" --include='*.swift' packages/MeeshySDK/Sources 2>/dev/null
# 1 hit (docstring comment dans StoryAVCompositor.swift:18)
```

Conséquence concrète :
- L'utilisateur ne peut pas exporter une story comme fichier MP4
- Les stories publiées passent toutes par l'upload asset legacy (image composite snapshot via TUS) + JSON `effects`, **jamais** par un export vidéo baked-in
- La promesse Phase 4 "live preview pixels = AVFoundation export pixels" est non vérifiable en prod
- Tout le code Plan B + Step 2 est code-mort runtime

### 1.2 Objectif

Wirer `StoryPublishService` → `StoryExporter.export()` pour les stories qui méritent un export vidéo, tout en gardant le path asset-based pour les stories statiques. Activer la pipeline Phase 4 entière en runtime.

### 1.3 Contraintes

- **Pré-launch** : pas de back-compat utilisateurs, schema migration franche possible
- **iOS 17+** target maintenu
- **Backend** : `PostMedia` doit accepter MP4 stories upload (peut nécessiter coordination gateway)
- **Performance** : export ≤ 4s pour 12-sec slide sur iPhone 16 Pro (cible spec mère §4.7)
- **Fallback** : si export échoue → retomber sur l'asset path legacy plutôt que bloquer la publication
- **Offline** : intégrer avec `StoryPublishQueue` existant pour persister les exports en pending

---

## 2. Décisions architecturales

| # | Décision | Justification |
|---|----------|---------------|
| **D-1** | Heuristique de routage : **video export** vs **asset upload** | Pas tous les contenus méritent un export 4s. Les stories texte-only + sticker peuvent rester asset-based (snapshot composite + JSON effects) — moins coûteux et déjà fonctionnel. |
| **D-2** | Trigger d'export = **présence d'au moins un élément temporel** | Définition : `hasVideoMedia` OR `hasAudio (background OR voice)` OR `hasKeyframes` OR `hasClipTransitions` OR `hasOpening`. Une story de pur texte statique n'a besoin que d'un PNG + JSON. |
| **D-3** | Export **côté client iOS**, pas côté backend | Le canvas state vit côté client (CALayer tree). Re-rendre côté serveur exigerait porter `StoryRenderer` + `StoryAVCompositor` en backend (énorme). Trade-off : consommation batterie iPhone, mais expérience instantanée. |
| **D-4** | `StoryExporter.export` produit un fichier **MP4 H.264** sur disk local, **AVANT** upload | Permet de chunker/résumer l'upload via TUS (existant). Le MP4 va dans `tmp/` puis cleanup sur succès. |
| **D-5** | Upload du MP4 via **TUS resumable** (chemin existant `MediaUploadCoordinator`) | Réutilise l'infrastructure de upload chunked + retry. MP4 traité comme un FeedMedia.video. |
| **D-6** | Backend reçoit `PostMedia.kind = .video` + `StoryItem.media = [{url, kind: .video}]` | Schema déjà supporte les videos dans `FeedMedia`. Pas de changement Prisma nécessaire si on traite l'export comme une vidéo standard. |
| **D-7** | Fallback path : si `StoryExporter.export` throw → retomber sur snapshot asset + JSON effects | Robustesse production. L'utilisateur préfère une story imparfaite à une story qui ne publie pas. |
| **D-8** | Progress reporting unifié via `StoryUploadState.phase` | Nouvelles phases : `.exporting` (entre `.preparingMedia` et `.uploadingMedia`). Surface dans `StoryTrayView` progress badge. |

---

## 3. Architecture

### 3.1 Decision tree publish flow

```
publishStorySingle(slide:effects:...) called
        │
        ▼
needsVideoExport(slide) ?
        ├── NO  → existing asset path (snapshot composite UIImage + JSON effects) → TUS upload PNG → POST /stories
        │
        └── YES → ┌─ phase = .exporting
                  │  StoryExporter.export(slide, to: tmp/export.mp4)
                  │  │
                  │  ├── throws → fallback to asset path (log warning + analytics)
                  │  │
                  │  └── success → phase = .uploadingMedia
                  │                TUS upload MP4 (resumable, chunked)
                  │                phase = .publishingStory
                  │                POST /stories with media={url, kind:.video}
                  │                cleanup tmp/export.mp4
                  └─ end
```

### 3.2 `needsVideoExport(_ slide: StorySlide) -> Bool`

Implémentation dans une extension SDK pour réutilisation :

```swift
extension StorySlide {
    /// Returns true when the slide has at least one time-evolving element
    /// that requires a baked-in video export to render correctly outside the
    /// live canvas (sharing, downloads, push notifications, web feed).
    public var needsVideoExport: Bool {
        // Background video media → looped
        if effects.mediaObjects?.contains(where: { $0.kind == .video }) == true {
            return true
        }
        // Background audio or voice
        if effects.backgroundAudioId != nil { return true }
        if effects.voiceAttachmentId != nil { return true }
        // Animated keyframes on text or media
        if effects.textObjects.contains(where: { ($0.keyframes?.count ?? 0) > 0 }) {
            return true
        }
        if effects.mediaObjects?.contains(where: { ($0.keyframes?.count ?? 0) > 0 }) == true {
            return true
        }
        // Clip transitions
        if (effects.clipTransitions?.count ?? 0) > 0 { return true }
        // Opening reveal/fade
        if effects.opening != nil { return true }
        return false
    }
}
```

### 3.3 Glass text mid-cas

`StoryTextBackgroundStyle.glass` (commit `22248479`) crée un effet visuel dynamique via MPS blur. **Question** : faut-il déclencher un export vidéo ?

**Réponse** : non, sauf si combiné avec un autre trigger. Raison : le glass effet est statique tant que la story ne contient pas d'éléments animés. La snapshot composite UIImage capturera correctement le rendu glass via le live composer canvas (`StoryCanvasUIView.snapshot()`). L'export vidéo n'apporte pas de fidélité supplémentaire pour un slide statique avec glass.

### 3.4 Intégration `StoryPublishQueue` (offline)

`StoryPublishQueueItem` doit pouvoir représenter un export en cours :

```swift
extension StoryPublishQueueItem {
    /// When set, the queue item carries a baked MP4 to upload instead of a
    /// raw composite image. The TUS uploader resumes the chunked upload from
    /// the saved `videoExportURL` after restarts.
    var videoExportURL: URL?
}
```

Persistance : l'URL temp + le SHA hash du MP4 sont stockés dans le payload sérialisé. Au prochain démarrage, si l'URL existe encore sur disk → resume TUS, sinon → re-run export depuis le slide sérialisé (slow path).

### 3.5 Progress phases mises à jour

```swift
public enum StoryUploadPhase: String, Sendable, Codable {
    case idle
    case preparingMedia    // existing
    case exporting         // NEW — running StoryExporter.export
    case uploadingMedia    // existing — TUS chunked upload
    case publishingStory   // existing — POST /stories
    case completed         // existing
    case failed            // existing
}
```

UI surface :
- `StoryTrayView` row : "Export en cours… 67%"
- Progress driven par `AVAssetExportSession.progress` exposed via `StoryExporter.exportWithProgress(...)`

### 3.6 `StoryExporter` API évolution

Actuelle :
```swift
public static func export(_ slide: StorySlide, to outputURL: URL) async throws
```

Évolue vers :
```swift
public static func export(_ slide: StorySlide,
                          to outputURL: URL,
                          progress: ((Double) -> Void)? = nil) async throws
```

Le callback reçoit `0.0...1.0` (mappable directement sur `AVAssetExportSession.progress`). Throttle conseillé à 10Hz côté caller (Combine debounce ou Timer).

---

## 4. File structure

### 4.1 Files to create

| Fichier | Rôle |
|---------|------|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StorySlide+ExportTrigger.swift` | `StorySlide.needsVideoExport` extension (SDK target, no UIKit) |
| `apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift` | Orchestrator : décide export vs asset, drive StoryExporter, surface progress, gère cleanup tmp files. Vit côté app (besoin de UIImage pour fallback). |
| `apps/ios/MeeshyTests/Integration/StoryPublishExporterIntegrationTests.swift` | Tests end-to-end : story avec video → export → upload mocked → POST /stories — vérifier la phase chain |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/StorySlideExportTriggerTests.swift` | Couvre `needsVideoExport` (matrice complète des triggers) |

### 4.2 Files to modify

| Fichier | Changement |
|---------|------------|
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | `publishStorySingle` + `launchUploadTask` branchent sur `StoryVideoExportService` quand `slide.needsVideoExport`. Nouvelle phase `.exporting` exposée. |
| `apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift` | `StoryPublishExecutor.executeQueuedPublish` route via export quand `item.videoExportURL` est nil + slide nécessite export. Resume si URL présente. |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueueItem.swift` | Ajouter `videoExportURL: URL?` + sérialisation Codable. |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift` | Ajouter param `progress: ((Double) -> Void)?` à `export(_:to:)`. Wire à `AVAssetExportSession.progress` via Timer poll 10Hz. |
| `apps/ios/Meeshy/Features/Main/Views/StoryTrayView.swift` | Render `.exporting` phase avec progress numerique |

### 4.3 Backend (gateway) — possibly no changes

`FeedMedia.kind = .video` est déjà supporté par le schema MongoDB + le validator gateway. Le MP4 généré côté iOS se traite comme une vidéo standard :
- TUS upload via `/media/tus/*` existing endpoints
- `POST /stories` accepte `media: [{ mediaUrl, kind: "video", durationMs }]`

**À vérifier en sprint** : le validator `StoryEffects` doit accepter qu'un slide ait `media[0].kind == .video` même quand `mediaObjects` est non-vide (le compositor inclut déjà les overlays dans le MP4). Le rendu côté web/Android fallback peut juste lire la vidéo sans rejouer les overlays.

---

## 5. Tests strategy

### 5.1 Niveau 1 — `needsVideoExport` matrix (Swift Testing)

`StorySlideExportTriggerTests.swift` — 8 tests :
- `test_emptyEffects_returnsFalse`
- `test_textOnly_returnsFalse`
- `test_stickerOnly_returnsFalse`
- `test_imageMediaOnly_returnsFalse` (image media is static, no export needed)
- `test_videoMedia_returnsTrue`
- `test_backgroundAudio_returnsTrue`
- `test_keyframes_returnsTrue`
- `test_clipTransitions_returnsTrue`
- `test_opening_returnsTrue`

### 5.2 Niveau 2 — `StoryVideoExportService` unit tests (XCTest)

- `test_publish_static_slide_skipsExport_usesLegacyPath`
- `test_publish_videoSlide_triggersExport_setsPhaseExporting`
- `test_export_failure_fallsBackTo_legacyPath`
- `test_export_success_uploadsMP4_via_TUS`
- `test_export_cleanup_removesTempFile_onSuccess`
- `test_export_cleanup_keepsTempFile_onTUSResumeNeeded`

### 5.3 Niveau 3 — Integration (XCTest async)

`StoryPublishExporterIntegrationTests.swift` :
- `test_endToEnd_videoSlide_publishes_with_mp4_url`
- `test_offlineQueue_resumes_export_after_restart`
- `test_queue_persists_videoExportURL_across_relaunch`

### 5.4 Niveau 4 — Manual smoke (cf. checklist QA)

Ajouter aux 12 scénarios un nouveau **scénario 13 : Video export end-to-end** dans `docs/qa/2026-05-12-story-canvas-smoke-tests.md` :
- Créer story avec background video
- Publier
- Vérifier phase `.exporting` visible dans StoryTrayView
- Vérifier MP4 généré dans Console.app (`Logger.stories` ligne `export.complete duration=...`)
- Ouvrir story publiée → vérifier rendu identique au composer preview

---

## 6. Acceptance criteria

1. ✅ `StorySlide.needsVideoExport` retourne valeurs correctes pour les 9 cas du test matrix
2. ✅ Publish d'une story texte-only → suit le path asset (pas d'export, pas de phase `.exporting`)
3. ✅ Publish d'une story avec video → suit le path export → MP4 généré → TUS upload → POST /stories avec `kind: .video`
4. ✅ Export échoue (mock `StoryExporterError`) → fallback transparent vers asset path, story publiée quand-même
5. ✅ Phase `.exporting` visible dans `StoryTrayView` avec progress numérique
6. ✅ Temp MP4 cleanup vérifié sur succès + relancement → pas d'orphelin dans `tmp/`
7. ✅ Offline scenario : kill app pendant `.exporting` → relaunch → resume depuis `videoExportURL` (si URL valide) ou re-export
8. ✅ MeeshyUITests + MeeshySDKTests baseline : aucune régression
9. ✅ iOS app build : succeed sans nouveau warning Swift 6
10. ✅ Smoke test #13 (manual) : créer story video → publier → ouvrir story publiée → rendu identique

---

## 7. Ordre d'exécution proposé

| Phase | Effort | Livre |
|-------|--------|-------|
| **P1** Modèle : `StorySlide.needsVideoExport` + tests | 0.5 j | Trigger heuristic safe et testable |
| **P2** API : `StoryExporter.export(_:to:progress:)` + tests | 0.5 j | Progress reporting câblé |
| **P3** Service : `StoryVideoExportService` (decision routing + fallback + cleanup) | 1 j | Orchestrator clean isolé |
| **P4** Wiring : `StoryViewModel.publishStorySingle` + `launchUploadTask` route via service | 1 j | Path live publish testable |
| **P5** Queue : `StoryPublishQueueItem.videoExportURL` + resume logic | 1 j | Offline durability |
| **P6** UI : `StoryTrayView` phase `.exporting` avec progress | 0.5 j | Feedback utilisateur |
| **P7** Integration tests + smoke test #13 manuel | 1 j | Validation end-to-end |
| **Total** | **~5.5 j** | |

P1-P2 indépendants → parallélisables. P3 dépend de P1+P2. P4+P5 dépendent de P3. P6 dépend de P4. P7 final.

---

## 8. Risques + mitigations

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| Export 12s slide > 4s sur iPhone 16 Pro | UX lente | Plan B B3 cache (déjà livré) divise par ~5 ; mesurer perf P3 |
| `StoryAVCompositor.startRequest` deadlock via `DispatchQueue.main.sync` | Crash export | Couvert : `cancelAllPendingVideoCompositionRequests` fixé dans `f8ce5357`, défense via timeout dans P3 |
| TUS upload échoue mid-chunk pour gros MP4 | Story perdue | Resume logic dans `StoryPublishQueue` (existing) + persistance `videoExportURL` (P5) |
| Backend rejette MP4 dans story media | Publish 500 | Coordination gateway sprint avant P4 — accepter `kind: .video` dans validator story |
| Memory pressure pendant export (240 frame layer instances) | OOM ou jank | Plan B B3 layer-tree cache (déjà actif via StoryAVCompositor.layerCache) |
| Glass text dans story exportée crash | Visual corruption export | StoryBackdropCapture côté AVCompositor (déjà wired commit `60737121`) — MPS path validé par diagnostic tests `e05e146b` |

---

## 9. Hors-scope (à différer)

- **Web side rendering** : Android et web reposent sur le MP4 baked-in. Si le rendu canvas-side ne suffit pas (e.g. interactive elements), créer un sprint séparé pour port `StoryRenderer` en backend ou web.
- **Audio crossfade entre exports** : si on enchaîne 2 stories video, gérer les transitions audio côté playback (player side, pas export side).
- **HEVC vs H.264 codec choice** : laisser H.264 pour compatibility max. HEVC sera un follow-up perf/storage.
- **Resolution adaptive** : 1080×1920 fixe pour l'export. 720p / 480p variants pour bande passante limitée = follow-up.
- **Story exporter pour reposts (slide-only)** : le repost actuel ne crée pas de nouveau slide — l'embed StoryReaderRepresentable suffit. Pas de re-export nécessaire.

---

## 10. Plan dépendant : implementation plan

Le plan d'exécution détaillé task-par-task (TDD style, checkbox-driven) sera écrit dans `docs/superpowers/plans/2026-XX-story-publish-exporter-wiring.md` au moment de l'exécution (séparation design / plan per conventions superpowers).

Le plan devra couvrir :
- Chaque task = 1 commit TDD
- Tests d'abord (RED), impl ensuite (GREEN), refactor optionnel
- Verification par task : `xcodebuild build` + targeted `xcodebuild test`
- Final task : full `./apps/ios/meeshy.sh build` + 4 niveaux de tests + smoke test #13 manuel

---

**Fin du document.**
