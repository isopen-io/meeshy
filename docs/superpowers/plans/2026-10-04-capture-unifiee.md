# Capture unifiée — un seul objet pour viser, filmer et retoucher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer, dans l'app iOS, le viseur + la revue `ComposerPhotoLookReview` par UN objet `ComposerCaptureStage` (viser, filmer, retoucher), peint par UN peintre Core Image/Metal, sur un canevas 9:16 1080×1920 daté de la session — monté à l'identique par la barre de conversation (`ComposerViewfinder`) et par le composer story / post / réel (`MeeshyComposerHost+Viewfinder`).

**Architecture:** un peintre pur (`ComposerLookPainter`) sert l'aperçu, la photo, l'export vidéo, la boucle d'édition et les miniatures ; les couches statiques d'un look (cadre du catalogue OU classique du Montage, désormais découpé en couches) se cuisent une fois hors du fil principal dans un cache borné. La machine `ComposerCaptureSession` gagne une phase (capture / édition), des intentions de prise (scène → édition, miniature choisie → galerie), un budget thermique injecté et un zoom en facteur affiché (×0,5 sur caméra virtuelle). La vue `ComposerCaptureStage` assemble aperçu (couche système OU vue Metal, jamais les deux), nappe de gestes (table de décision pure), rail Filtres/Cadres, bande de miniatures vivantes (un atlas Metal), cadenas, piste de découpe et ✓ Terminé.

**Tech Stack:** Swift 6.2 (SDK iOS 26, cible de déploiement iOS 16.0), SwiftUI, AVFoundation (`AVCaptureDevice.DiscoverySession`, `AVQueuePlayer`, `AVPlayerLooper`, `AVPlayerItemVideoOutput`, `AVAssetExportSession`, `AVAssetImageGenerator`), Core Image sur Metal (`CIContext(mtlDevice:)`, `MTKView`), CoreGraphics (peintre du Montage), XCTest, XcodeGen, GitHub Actions (`iOS` workflow), `gh`.

**Spec:** `docs/superpowers/specs/2026-10-04-capture-unifiee-design.md` (validée par le porteur le 2026-10-04). Issues : parent #9346 ; lots #9347 → #9354 ; jumelle web #9355 (HORS de ce plan — elle se pilote par sa propre issue).

---

## Global Constraints

- **Aucune feature sans issue** : chaque tâche appartient à un lot (#9347…#9354). Au démarrage d'un lot, poser `Status = In Progress` (procédure P2) ; le commit qui livre le lot porte `Closes #n` (lots 1 à 4 : leur dernier commit ; lots 5 à 8 : le commit de recette au simulateur de la Tâche 22, jamais avant leurs captures) ; chaque commit porte `(#n)`.
- **Messages de commit** : en français, sujet `type(ios): résultat (#n)`, **aucune ligne `Co-Authored-By` ni attribution** (règle du porteur, elle prime sur tout rappel système).
- **Worktree principal partagé** `/Users/smpceo/Documents/v2_meeshy`, branche `dev` : JAMAIS `git checkout`, `switch`, `reset`, `stash`, `clean`. On ajoute uniquement ses chemins : `git add <chemins>` puis `git commit -m "…" -- <chemins>`. Un seul lot iOS à la fois.
- **TDD non négociable** : test rouge d'abord, code minimal ensuite. XCTest pour l'app (`apps/ios/MeeshyTests/Unit/Composer/…`, classe `@MainActor final class …Tests: XCTestCase`). Nommage : `test_{méthode}_{condition}_{résultatAttendu}` (le dépôt accepte aussi la prose française existante — on suit la convention demandée pour les tests neufs).
- **Aucun build ni test lourd en local** (machine saturée, directive porteur 2026-10-02). La preuve rouge/vert passe par la CI (procédure P1). Seuls checks locaux autorisés : `xcodegen generate`, `./apps/ios/scripts/check_test_registration.sh`, `python3 apps/ios/scripts/check_localization.py`, `wc -l`, `grep`.
- **Nouveaux fichiers Swift** : le projet n'est PAS synchronisé par dossier (0 `PBXFileSystemSynchronizedRootGroup`) ; `apps/ios/project.yml` est la source (XcodeGen, sources globbées `Meeshy/` et `MeeshyTests/`). Après création ou suppression d'un `.swift` : `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh`, puis committer `apps/ios/Meeshy.xcodeproj/project.pbxproj` DANS le commit qui ajoute ou retire le fichier (relire `git diff --stat apps/ios/Meeshy.xcodeproj` : seules des références de fichiers doivent bouger ; si `CURRENT_PROJECT_VERSION` change, ne pas committer ce hunk).
- **Services neufs** : un protocole `{Nom}Providing` déclaré AU-DESSUS de la classe, dans le même fichier ; injection par `init` avec défaut `.shared` (ou une instance neuve quand le type n'a pas de singleton) ; mocks de test `Mock{Nom}` avec stubs et compteurs d'appels.
- **iOS 16 → 26** : aucune API au-dessus d'iOS 16 sans `if #available`. APIs utilisées ici et leur plancher : `AVCaptureDevice.DiscoverySession` (iOS 10), `.builtInTripleCamera` / `.builtInDualWideCamera` / `virtualDeviceSwitchOverVideoZoomFactors` / `constituentDevices` (iOS 13), `AVPlayerLooper` (iOS 10), `AVPlayerItemVideoOutput` (iOS 6), `MTKView` (iOS 9), `CIContext(mtlDevice:)` (iOS 9), `AVAssetImageGenerator.images(for:)` (iOS 16), `SpatialTapGesture` (iOS 16). Rien d'iOS 17+ n'est requis.
- **Concurrence** : la cible `Meeshy` compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` et `NonisolatedNonsendingByDefault`. **Toute fermeture `async` neuve est annotée `@MainActor` ou `@concurrent`** (plantage iOS 16/17 sinon — la CI iOS 18.2 ne le voit pas). Types purs : `nonisolated`. Toute classe neuve : `nonisolated deinit {}` (garde `MainActorDeinitSourceGuardTests`).
- **Budget de taille** : 1 200 lignes par fichier, plafond dur. `MeeshyComposerHost+Surfaces.swift` (1 111) et `MeeshyComposerHost.swift` (1 012) ne prennent AUCUNE ligne nette : ce plan n'y fait que des retraits et des remplacements ligne pour ligne. `ComposerCaptureSession.swift` (529) ne reçoit que ses propriétés stockées ; les méthodes neuves vont dans des extensions `ComposerCaptureSession+….swift`.
- **Commentaires** : le style du dépôt — doc-comments `///` en français, en tête de type et de membre public de la loi ; aucun commentaire de paraphrase dans les corps.
- **Localisation** : `String(localized: "clé", defaultValue: "texte fr", bundle: .main)` ; toute clé neuve entre au catalogue `apps/ios/Meeshy/Localizable.xcstrings` dans les **sept** langues (`fr`, `en`, `es`, `de`, `it`, `pt-BR`, `ar`), `fr` = `defaultValue` mot pour mot ; toute clé dont le dernier usage disparaît SORT du catalogue (sinon `test_everyAppCatalogIdentifierKeyIsReferencedInCode` rougit). Outil : `apps/ios/scripts/catalog_keys.py` (créé en Tâche 3). Check local : `python3 apps/ios/scripts/check_localization.py` → `Localization consistency check passed.`
- **Accessibilité** : chaque contrôle a un `accessibilityLabel`, une cible ≥ 44 pt (`MeeshyControlSize.tapTarget`), et tout geste (double toucher, appui long, glissé) a son équivalent `accessibilityAction(named:)` ; Reduce Motion coupe les battements, jamais l'information.
- **Canevas canonique** : 9:16, **1080×1920**, rempli, avec ou sans cadre (`ComposerLookPainter.canvas`). Miniatures : **162×288**. Date gravée : TOUJOURS `ComposerCaptureSession.lookDate`, jamais `Date()` sur un chemin de rendu.
- **Simulateurs** : un seul démarré, `Meeshy-iOS26` (sur staging). JAMAIS « Meeshy Vitrine iPhone ».
- **Hors périmètre** : le web (#9355), Android Kotlin (gelé), le chemin CPU des APPELS (`CallFrameRenderer.render`, `CallCaptureController+Frames`) qui reste tel quel.

### Procédures partagées (citées par nom dans les tâches)

**P1 — Preuve CI d'un incrément (rouge ou vert).** Le push sur `ci/*` ne déclenche rien ; le lancement manuel exécute la suite COMPLÈTE (`workflow_dispatch` ⇒ tests, sans mot-clé).

```bash
cd /Users/smpceo/Documents/v2_meeshy
LOT=9347   # le numéro du lot en cours
git push --force origin HEAD:refs/heads/ci/capture-$LOT
gh workflow run iOS --ref ci/capture-$LOT
sleep 20
RUN=$(gh run list --workflow iOS --branch ci/capture-$LOT --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN" --exit-status; echo "exit=$?"
gh run view "$RUN" --log-failed | grep -E "error:|XCTAssert|failed \(" | head -40
```

Un RED attendu est soit une erreur de compilation qui nomme le symbole manquant (`cannot find 'X' in scope`), soit l'échec de l'assertion visée. Un GREEN est `exit=0`. Le sujet du commit de tête porte en plus « run test » quand il est poussé sur `dev` (la suite tourne alors aussi sur `dev`).

**P2 — Statut du projet.**

```bash
status() {  # status <numéro d'issue> <In Progress|Done>
  local opt; [ "$2" = "Done" ] && opt=98236657 || opt=47fc9ee4
  local item; item=$(gh project item-list 1 --owner isopen-io --limit 3000 --format json \
    | python3 -c "import json,sys; print(next(i['id'] for i in json.load(sys.stdin)['items'] if i.get('content',{}).get('number')==$1))")
  gh project item-edit --project-id PVT_kwDOC_6PRc4Bhgh9 --id "$item" \
    --field-id PVTSSF_lADOC_6PRc4Bhgh9zhgcBc4 --single-select-option-id "$opt"
}
```

**P3 — Livrer un incrément vert sur `dev`.**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git pull --rebase --autostash origin dev && git push origin HEAD:dev
```

---

## Review Focus

1. **Retourner la caméra pendant un look (et en filmant)** : la trame avant est miroir ; le TEXTE d'un cadre (légende, date, nom) ne doit jamais l'être, et le cadre ne doit pas « sauter ». Témoin : Tâche 2, `test_paint_frontCameraMirroredSource_keepsOverlayPixelsIdentical`.
2. **Une prise qui arrive après la fermeture ou pendant une interruption** (appel entrant, app en arrière-plan) alors qu'une prise « vers la galerie » était en cours : elle ne doit ni devenir un segment fantôme ni être perdue (le BRUT est déjà en galerie). Témoin : Tâche 14, `test_videoArrived_afterDisarm_discardsFileAndKeepsNoSegment`.
3. **Photos refusées** (`PHAuthorization` `.denied`) au moment d'enregistrer un RENDU : la capture continue, rien ne reste « en rendu », un toast explique. Témoin : Tâche 14, `test_saveRenderedPhoto_galleryRefuses_staysCapturingAndClearsRendering`.
4. **iPhone sans ultra grand-angle, caméra avant, simulateur** : la pastille ×0,5 n'apparaît pas, le zoom ne descend jamais sous 1, le pincement ne fait rien sans objectif. Témoin : Tâche 8, `test_presets_singleLensOrFrontCamera_excludesHalf`.
5. **Vidéo très courte** (segment de 0,3 s, ou plus court que la durée minimale de découpe) : la piste reste utilisable, la plage = le clip entier, l'export ne plante pas. Témoin : Tâche 19, `test_initialRange_clipShorterThanMinimum_isWholeClip`.

---

## Carte des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Composer/ComposerFraming.swift` (neuf) | le cadrage final : une fenêtre dans la source | 1 |
| `…/Composer/ComposerLookPainter.swift` (neuf) | le peintre unique, la clé de scène, le GPU partagé | 2, 5 |
| `…/Composer/ComposerLookSceneCache.swift` (neuf) | cuisson hors fil principal, `NSCache` borné | 2 |
| `…/Composer/ComposerLiveLookSurface.swift` | la vue Metal : peint par le peintre, au rythme des trames | 3, 7, 18 |
| `…/Composer/ComposerLookVideoExporter.swift` | l'export par le peintre (+ cadrage, + découpe) | 3, 18, 20 |
| `…/Composer/ComposerCaptureViews.swift` | aperçu 9:16 (couche système OU Metal) | 3, 7 |
| `…/Services/CallMontageRenderer+Layers.swift` (neuf) | un classique découpé en couches GPU | 4 |
| `…/Services/CallMontageRenderer.swift`, `…+Glamour.swift` | trou relevé à la peinture du portrait | 4 |
| `…/Services/CallFrames/CallLiveFrameCompositor.swift` | placement par transformation relevée | 4 |
| `…/Composer/ComposerLiveLook.swift` | classiques admis en direct | 5 |
| `…/Composer/ComposerThermalBudget.swift` (neuf) | palier thermique → budget | 6 |
| `…/Services/ThermalStateMonitor.swift` | protocole `ThermalStateMonitorProviding` | 6 |
| `…/Composer/ComposerFramePacing.swift` (neuf) | source de trames + cadence | 7 |
| `…/Composer/ComposerCameraFeed.swift` | prévient à chaque trame | 7 |
| `…/Composer/ComposerCaptureHold.swift` | zoom en facteur affiché | 8 |
| `…/Components/CameraModel.swift` | caméra virtuelle, zoom affiché, crochets de recette | 9, 10 |
| `…/Components/CameraModel+Fixture.swift` (neuf, DEBUG) | caméra de recette au simulateur | 10 |
| `…/Composer/ComposerCaptureGesture.swift` (neuf) | table zone × geste × phase × verrou | 11 |
| `…/Composer/ComposerLookStripRule.swift` (neuf) | familles, combinaison, fenêtre peinte | 12 |
| `…/Composer/ComposerLookStripSurface.swift` (neuf) | l'atlas Metal de la bande | 13 |
| `…/Composer/ComposerLookStrip.swift` (neuf) | la bande, le rail, la miniature-déclencheur | 13 |
| `…/Composer/ComposerGallery.swift` (neuf) | enregistrer un rendu en galerie | 14 |
| `…/Composer/ComposerCaptureSession+Takes.swift` (neuf) | intentions de prise, arrivées, rendus galerie | 14 |
| `…/Composer/ComposerCaptureStage.swift` (neuf) | l'objet unique : couche image + couche commandes | 15, 18, 20, 21 |
| `…/Composer/ComposerCaptureBottomRow.swift` (neuf) | zoom, bande, cadenas, ✓ Terminé | 15, 18 |
| `…/Composer/ComposerCapturePhase.swift` (neuf) | capture / édition, et leurs passages | 16 |
| `…/Composer/ComposerEditSources.swift` (neuf) | photo figée, vidéo en boucle | 17 |
| `…/Composer/ComposerCaptureSession+Edit.swift` (neuf) | cadrer, découper, Terminé | 18, 20 |
| `…/Composer/ComposerTrimRule.swift` (neuf) | plage, minimum, milliseconde, tête | 19 |
| `…/Composer/ComposerTrimTrack.swift` (neuf) | la piste de découpe | 20 |
| `…/Composer/MeeshyComposerHost+Viewfinder.swift` | monte `ComposerCaptureStage` | 21 |
| `apps/ios/scripts/catalog_keys.py` (neuf) | ajouter / retirer des clés du catalogue | 3 |
| Retirés | `ComposerPhotoLookReview.swift`, `ComposerLiveLookPanel.swift` | 15 |

---

## Lot 1 — #9347 : un peintre unique, un canevas 9:16, la date de la session

### Task 1: Le cadrage final se lit comme une fenêtre dans la source

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerFraming.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerFramingTests.swift`

**Interfaces:**
- Consumes: rien.
- Produces: `nonisolated struct ComposerFraming: Hashable, Sendable { var center: CGPoint; var scale: CGFloat; static let identity; static let scaleRange: ClosedRange<CGFloat>; var isIdentity: Bool; func window(in source: CGRect, aspect: CGFloat) -> CGRect; func settled(source: CGRect, aspect: CGFloat) -> ComposerFraming; func panned(by translation: CGSize, viewSize: CGSize, source: CGRect, aspect: CGFloat) -> ComposerFraming; func zoomed(by factor: CGFloat, source: CGRect, aspect: CGFloat) -> ComposerFraming }`

- [ ] **Step 0: Ouvrir le lot** — définir la fonction `status` de P2 dans le shell, puis :

```bash
cd /Users/smpceo/Documents/v2_meeshy
status 9346 "In Progress"; status 9347 "In Progress"
git pull --rebase --autostash origin dev
```

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import CoreGraphics
@testable import Meeshy

/// **Le cadrage final est une fenêtre dans la source** (#9347, spec § 3.3 / § 4.1).
@MainActor
final class ComposerFramingTests: XCTestCase {

    private let source = CGRect(x: 0, y: 0, width: 300, height: 400)
    private let portrait: CGFloat = 9.0 / 16.0

    func test_window_identity_fillsTheAspectCentered() {
        let fenetre = ComposerFraming.identity.window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.width, 225, accuracy: 0.001)
        XCTAssertEqual(fenetre.height, 400, accuracy: 0.001)
        XCTAssertEqual(fenetre.minX, 37.5, accuracy: 0.001)
        XCTAssertEqual(fenetre.minY, 0, accuracy: 0.001)
    }

    func test_window_scaleTwo_halvesTheWindowAroundTheCenter() {
        let fenetre = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 2).window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.width, 112.5, accuracy: 0.001)
        XCTAssertEqual(fenetre.height, 200, accuracy: 0.001)
        XCTAssertEqual(fenetre.midX, 150, accuracy: 0.001)
        XCTAssertEqual(fenetre.midY, 200, accuracy: 0.001)
    }

    func test_window_centerOutsideTheSource_staysInsideNeverAnEmptyEdge() {
        let fenetre = ComposerFraming(center: CGPoint(x: 1.4, y: -0.3), scale: 2).window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.maxX, source.maxX, accuracy: 0.001)
        XCTAssertEqual(fenetre.minY, source.minY, accuracy: 0.001)
    }

    func test_window_scaleBelowOne_isClampedToFill() {
        let fenetre = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 0.2).window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.height, 400, accuracy: 0.001, "dézoomer s'arrête au remplissage : jamais de bande vide")
    }

    func test_panned_fingerMovesRight_windowMovesLeft() {
        let depart = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 2)
        let suivi = depart.panned(by: CGSize(width: 50, height: 0), viewSize: CGSize(width: 200, height: 355),
                                  source: source, aspect: portrait)
        XCTAssertEqual(suivi.center.x, 0.5 - 0.25 * 112.5 / 300, accuracy: 0.0001)
        XCTAssertEqual(suivi.center.y, 0.5, accuracy: 0.0001)
    }

    func test_panned_beyondTheEdge_settlesOnTheEdgeAndDoesNotAccumulate() {
        let depart = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 2)
        let loin = depart.panned(by: CGSize(width: -5_000, height: 0), viewSize: CGSize(width: 200, height: 355),
                                 source: source, aspect: portrait)
        let retour = loin.panned(by: CGSize(width: 10, height: 0), viewSize: CGSize(width: 200, height: 355),
                                 source: source, aspect: portrait)
        XCTAssertLessThan(retour.center.x, loin.center.x, "un retour se sent tout de suite, sans « dette » de glissé")
    }

    func test_zoomed_isClampedToTheScaleRange() {
        let zoome = ComposerFraming.identity.zoomed(by: 10, source: source, aspect: portrait)
        XCTAssertEqual(zoome.scale, ComposerFraming.scaleRange.upperBound)
        XCTAssertFalse(zoome.isIdentity)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh` puis commit du test seul et P1 avec `LOT=9347`.

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/MeeshyTests/Unit/Composer/ComposerFramingTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — le cadrage final se lit comme une fenêtre dans la source (#9347)" -- apps/ios/MeeshyTests/Unit/Composer/ComposerFramingTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

Expected: FAIL — `cannot find 'ComposerFraming' in scope`.

- [ ] **Step 3: Write minimal implementation**

```swift
import CoreGraphics

/// **Le cadrage final d'une prise** (#9347, spec § 3.3 et § 4.1).
///
/// Il se lit comme une FENÊTRE dans la source : la plus grande fenêtre aux
/// proportions de la cible (le canevas 9:16 sans cadre, la découpe d'un cadre
/// sinon), divisée par l'échelle choisie, centrée sur le point choisi puis
/// ramenée dans la source. Une fenêtre ne sort jamais de la source : le canevas
/// reste toujours rempli, aucun bord vide.
nonisolated struct ComposerFraming: Hashable, Sendable {
    /// Le centre voulu, en fraction de la source (0…1, repère Core Image : y vers le haut).
    var center = CGPoint(x: 0.5, y: 0.5)
    /// 1 ⇒ remplissage exact ; au-delà, on rapproche.
    var scale: CGFloat = 1

    static let identity = ComposerFraming()
    static let scaleRange: ClosedRange<CGFloat> = 1...4

    var isIdentity: Bool { self == .identity }

    private var clampedScale: CGFloat {
        min(Self.scaleRange.upperBound, max(Self.scaleRange.lowerBound, scale))
    }

    func window(in source: CGRect, aspect: CGFloat) -> CGRect {
        guard source.width > 0, source.height > 0, aspect > 0 else { return source }
        let remplissage = source.width / source.height > aspect
            ? CGSize(width: source.height * aspect, height: source.height)
            : CGSize(width: source.width, height: source.width / aspect)
        let taille = CGSize(width: remplissage.width / clampedScale, height: remplissage.height / clampedScale)
        let voulu = CGPoint(x: source.minX + center.x * source.width, y: source.minY + center.y * source.height)
        let x = min(source.maxX - taille.width, max(source.minX, voulu.x - taille.width / 2))
        let y = min(source.maxY - taille.height, max(source.minY, voulu.y - taille.height / 2))
        return CGRect(x: x, y: y, width: taille.width, height: taille.height)
    }

    /// Le centre ramené à celui de la fenêtre RÉELLE : un glissé poussé contre un
    /// bord ne laisse aucune « dette » à rembourser au retour.
    func settled(source: CGRect, aspect: CGFloat) -> ComposerFraming {
        guard source.width > 0, source.height > 0 else { return self }
        let fenetre = window(in: source, aspect: aspect)
        return ComposerFraming(
            center: CGPoint(x: (fenetre.midX - source.minX) / source.width,
                            y: (fenetre.midY - source.minY) / source.height),
            scale: clampedScale)
    }

    /// Le doigt glisse de `translation` (points, y vers le bas) sur une case de
    /// `viewSize` : le média suit le doigt, la fenêtre part donc à l'opposé.
    func panned(by translation: CGSize, viewSize: CGSize, source: CGRect, aspect: CGFloat) -> ComposerFraming {
        guard viewSize.width > 0, viewSize.height > 0, source.width > 0, source.height > 0 else { return self }
        let fenetre = window(in: source, aspect: aspect)
        let dx = -translation.width / viewSize.width * fenetre.width / source.width
        let dy = translation.height / viewSize.height * fenetre.height / source.height
        return ComposerFraming(center: CGPoint(x: center.x + dx, y: center.y + dy), scale: scale)
            .settled(source: source, aspect: aspect)
    }

    func zoomed(by factor: CGFloat, source: CGRect, aspect: CGFloat) -> ComposerFraming {
        ComposerFraming(center: center, scale: scale * factor).settled(source: source, aspect: aspect)
    }
}
```

Note : `panned` part d'un cadrage `settled` (le test le vérifie) ; l'hôte d'un geste garde le cadrage du DÉBUT du geste comme ancre et appelle `ancre.panned(by: translationCumulée, …)` à chaque changement.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Composer/ComposerFraming.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): le cadrage final se lit comme une fenêtre dans la source (#9347)" -- apps/ios/Meeshy/Features/Main/Composer/ComposerFraming.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

Puis P1 (`LOT=9347`). Expected: PASS (`exit=0`), `ComposerFramingTests` 7/7.

- [ ] **Step 5: Commit** — fait aux étapes 2 et 4 ; livrer sur `dev` par P3.

---

### Task 2: Un seul peintre, une scène cuite une fois, à la date de la session

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookPainter.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookSceneCache.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerLookPainterTests.swift`

**Interfaces:**
- Consumes: `ComposerFraming` (Tâche 1) ; existants : `ComposerPhotoLook`, `ComposerPhotoFrame`, `ComposerLiveLookRule.graded(_:filter:declared:)`, `ComposerLiveLookRule.fit(scene:into:)`, `ComposerPhotoLookRule.colorSpace(of:)`, `ComposerPhotoLookSource.texts(at:)`, `CallMontageFrameRule.design(id:)`, `CallLiveFrameCompositor`, `CallLiveFrameScene`, `CallLiveFrameLayerInputs`, `CallFrameTextsRule.dateText(_:)`, `CallFramePerson`.
- Produces:
  - `nonisolated struct ComposerLookSceneKey: Equatable, Sendable { let look: ComposerPhotoLook; let canvas: CGSize; let date: Date; let person: CallFramePerson; var cacheKey: NSString; static func token(_ frame: ComposerPhotoFrame) -> String }`
  - `nonisolated enum ComposerLookGPU { static let device: MTLDevice?; static let commandQueue: MTLCommandQueue?; static let context: CIContext }`
  - `nonisolated enum ComposerLookPainter { static let canvas: CGSize; static let thumbnailCanvas: CGSize; static func scene(for look: ComposerPhotoLook, canvas: CGSize, date: Date, person: CallFramePerson) -> CallLiveFrameScene?; static func scene(for key: ComposerLookSceneKey) -> CallLiveFrameScene?; static func paint(_ source: CIImage, look: ComposerPhotoLook, framing: ComposerFraming, scene: CallLiveFrameScene?, canvas: CGSize, declared: CGColorSpace?) -> CIImage; static func filled(_ image: CIImage, framing: ComposerFraming, into target: CGRect) -> CIImage; static func photo(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming, scene: CallLiveFrameScene?, canvas: CGSize) -> CGImage?; static func onScreen(_ painted: CIImage, canvas: CGSize, drawable: CGSize) -> CIImage; @concurrent static func renderPhoto(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming, person: CallFramePerson, date: Date, scenes: any ComposerLookSceneProviding) async -> CGImage? }`
  - `protocol ComposerLookSceneProviding: AnyObject, Sendable { func cached(_ key: ComposerLookSceneKey) -> CallLiveFrameScene?; func prepare(_ key: ComposerLookSceneKey, ready: @escaping @MainActor @Sendable () -> Void); func purge() }` et `nonisolated final class ComposerLookSceneCache: ComposerLookSceneProviding` (`static let shared`).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import CoreImage
@testable import Meeshy

/// **Un seul peintre** (#9347, spec § 4.1) : l'aperçu, la photo et la vidéo
/// passent par le MÊME graphe, sur le même canevas, à la date de la session.
@MainActor
final class ComposerLookPainterTests: XCTestCase {

    private let auteur = CallFramePerson(id: "moi", name: "Ada", handle: "ada", isSelf: true)
    private let date = Date(timeIntervalSince1970: 1_790_000_000)

    func test_canvas_isCanonicalNineSixteen() {
        XCTAssertEqual(ComposerLookPainter.canvas, CGSize(width: 1080, height: 1920))
        XCTAssertEqual(ComposerLookPainter.thumbnailCanvas, CGSize(width: 162, height: 288))
    }

    func test_paint_withoutLook_isTheSourceFilledIntoTheCanvas() throws {
        let image = ComposerLookPainter.paint(Self.source(), look: ComposerPhotoLook(), framing: .identity,
                                              scene: nil, canvas: CGSize(width: 90, height: 160), declared: nil)
        XCTAssertEqual(image.extent, CGRect(x: 0, y: 0, width: 90, height: 160))
        let pixels = try Self.rgba(image, size: CGSize(width: 90, height: 160))
        XCTAssertGreaterThan(Self.pixel(pixels, x: 2, y: 80, width: 90).red, 200, "la moitié gauche de la source reste à gauche")
        XCTAssertGreaterThan(Self.pixel(pixels, x: 87, y: 80, width: 90).blue, 200, "la moitié droite reste à droite")
    }

    func test_photo_andPreview_paintTheSamePixels() throws {
        let cadre = try XCTUnwrap(Self.premierCadreDuCatalogue())
        let look = ComposerPhotoLook(filter: .warm, frame: cadre)
        let toile = CGSize(width: 108, height: 192)
        let scene = ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: auteur)
        XCTAssertNotNil(scene)
        let photo = try XCTUnwrap(ComposerLookPainter.photo(Self.cgSource(), look: look, framing: .identity,
                                                            scene: scene, canvas: toile))
        XCTAssertEqual(photo.width, 108)
        XCTAssertEqual(photo.height, 192)
        let apercu = ComposerLookPainter.paint(CIImage(cgImage: Self.cgSource()), look: look, framing: .identity,
                                               scene: scene, canvas: toile,
                                               declared: ComposerPhotoLookRule.colorSpace(of: Self.cgSource()))
        let a = try Self.rgba(CIImage(cgImage: photo), size: toile)
        let b = try Self.rgba(apercu, size: toile)
        for (x, y) in [(10, 10), (54, 96), (100, 180), (54, 20)] {
            let pa = Self.pixel(a, x: x, y: y, width: 108), pb = Self.pixel(b, x: x, y: y, width: 108)
            XCTAssertEqual(Int(pa.red), Int(pb.red), accuracy: 2, "(\(x),\(y))")
            XCTAssertEqual(Int(pa.green), Int(pb.green), accuracy: 2, "(\(x),\(y))")
            XCTAssertEqual(Int(pa.blue), Int(pb.blue), accuracy: 2, "(\(x),\(y))")
        }
    }

    func test_sceneKey_carriesTheSessionDateText_neverToday() {
        let cle = ComposerLookSceneKey(look: ComposerPhotoLook(), canvas: ComposerLookPainter.canvas,
                                       date: date, person: auteur)
        XCTAssertTrue((cle.cacheKey as String).contains(CallFrameTextsRule.dateText(date)))
        let autre = ComposerLookSceneKey(look: ComposerPhotoLook(), canvas: ComposerLookPainter.canvas,
                                         date: date.addingTimeInterval(86_400 * 3), person: auteur)
        XCTAssertNotEqual(cle.cacheKey, autre.cacheKey, "une autre date est une autre scène")
    }

    func test_scene_withoutFrame_isNil() {
        XCTAssertNil(ComposerLookPainter.scene(for: ComposerPhotoLook(filter: .vivid), canvas: ComposerLookPainter.canvas,
                                               date: date, person: auteur))
    }

    func test_paint_frontCameraMirroredSource_keepsOverlayPixelsIdentical() throws {
        let cadre = try XCTUnwrap(Self.premierCadreDuCatalogue())
        let look = ComposerPhotoLook(frame: cadre)
        let toile = CGSize(width: 108, height: 192)
        let scene = try XCTUnwrap(ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: auteur))
        let droite = ComposerLookPainter.paint(Self.source(), look: look, framing: .identity, scene: scene,
                                               canvas: toile, declared: nil)
        let miroir = ComposerLookPainter.paint(Self.source().oriented(.upMirrored), look: look, framing: .identity,
                                               scene: scene, canvas: toile, declared: nil)
        let a = try Self.rgba(droite, size: toile), b = try Self.rgba(miroir, size: toile)
        let horsCase = try XCTUnwrap(Self.pointHorsDeLaCase(scene))
        let pa = Self.pixel(a, x: horsCase.x, y: horsCase.y, width: 108)
        let pb = Self.pixel(b, x: horsCase.x, y: horsCase.y, width: 108)
        XCTAssertEqual(pa.red, pb.red, "le texte et le décor d'un cadre ne se retournent jamais avec l'objectif")
        XCTAssertEqual(pa.green, pb.green)
        XCTAssertEqual(pa.blue, pb.blue)
    }

    func test_cache_preparesOffMainOnce_thenServesTheScene() {
        let compte = Compteur()
        let cache = ComposerLookSceneCache(countLimit: 4) { cle in
            compte.incremente()
            return ComposerLookPainter.scene(for: cle)
        }
        let cadre = Self.premierCadreDuCatalogue() ?? .none
        let cle = ComposerLookSceneKey(look: ComposerPhotoLook(frame: cadre), canvas: CGSize(width: 54, height: 96),
                                       date: date, person: auteur)
        let pret = expectation(description: "scène cuite")
        cache.prepare(cle) { pret.fulfill() }
        cache.prepare(cle) {}
        wait(for: [pret], timeout: 10)
        XCTAssertNotNil(cache.cached(cle))
        XCTAssertEqual(compte.valeur, 1, "deux demandes de la même scène ne la cuisent qu'une fois")
        cache.purge()
        XCTAssertNil(cache.cached(cle), "la fermeture du viseur vide le cache")
    }

    // MARK: - Outils

    private final class Compteur: @unchecked Sendable {
        private let verrou = NSLock()
        private var n = 0
        func incremente() { verrou.lock(); n += 1; verrou.unlock() }
        var valeur: Int { verrou.lock(); defer { verrou.unlock() }; return n }
    }

    static func premierCadreDuCatalogue() -> ComposerPhotoFrame? {
        ComposerLiveLookRule.chips().lazy
            .flatMap { ComposerLiveLookRule.frames(for: $0) }
            .first { ComposerLiveLookRule.design(for: $0) != nil }
    }

    static func cgSource() -> CGImage {
        let contexte = CGContext(data: nil, width: 300, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 150, height: 400))
        contexte.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 0, width: 150, height: 400))
        return contexte.makeImage()!
    }

    static func source() -> CIImage { CIImage(cgImage: cgSource()) }

    struct Pixel { let red: UInt8; let green: UInt8; let blue: UInt8 }

    static func rgba(_ image: CIImage, size: CGSize) throws -> [UInt8] {
        let largeur = Int(size.width), hauteur = Int(size.height)
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        let contexte = CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
        contexte.render(image, toBitmap: &octets, rowBytes: largeur * 4,
                        bounds: CGRect(origin: .zero, size: size), format: .RGBA8,
                        colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }

    /// `y` en repère ÉCRAN (0 en haut) — `render(toBitmap:)` écrit la ligne du haut en premier.
    static func pixel(_ octets: [UInt8], x: Int, y: Int, width: Int) -> Pixel {
        let i = (y * width + x) * 4
        return Pixel(red: octets[i], green: octets[i + 1], blue: octets[i + 2])
    }

    static func pointHorsDeLaCase(_ scene: CallLiveFrameScene) -> (x: Int, y: Int)? {
        guard let slot = scene.slots.first else { return nil }
        let hauteur = scene.size.height
        let candidats = [(2, 2), (Int(scene.size.width) - 3, 2), (2, Int(hauteur) - 3), (Int(scene.size.width) - 3, Int(hauteur) - 3)]
        return candidats.first { x, y in
            !slot.mask.extent.contains(CGPoint(x: CGFloat(x), y: hauteur - CGFloat(y)))
                || !CallLiveFrameGeometry.flipped(slot.photo, canvasHeight: hauteur).insetBy(dx: -4, dy: -4)
                    .contains(CGPoint(x: CGFloat(x), y: hauteur - CGFloat(y)))
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/MeeshyTests/Unit/Composer/ComposerLookPainterTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — un seul peintre, une scène cuite une fois, à la date de la session (#9347)" -- apps/ios/MeeshyTests/Unit/Composer/ComposerLookPainterTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9347`). Expected: FAIL — `cannot find 'ComposerLookPainter' in scope`.

- [ ] **Step 3: Write minimal implementation** — `ComposerLookPainter.swift`

```swift
import CoreGraphics
import CoreImage
import Foundation
import Metal

/// **Ce qui identifie une scène cuite** (#9347) : le look, la toile, et ce que
/// le cadre ÉCRIT — l'auteur et la date de la SESSION, jamais celle du rendu.
nonisolated struct ComposerLookSceneKey: Equatable, Sendable {
    let look: ComposerPhotoLook
    let canvas: CGSize
    let date: Date
    let person: CallFramePerson

    var cacheKey: NSString {
        let morceaux = [
            look.filter.rawValue,
            Self.token(look.frame),
            "\(Int(canvas.width.rounded()))x\(Int(canvas.height.rounded()))",
            CallFrameTextsRule.dateText(date),
            person.id, person.name, person.handle ?? "",
        ]
        return morceaux.joined(separator: "|") as NSString
    }

    static func token(_ frame: ComposerPhotoFrame) -> String {
        switch frame {
        case .none: return "none"
        case .montage(.classic(let style)): return "classic:\(style.rawValue)"
        case .montage(.frame(let id)): return "frame:\(id)"
        }
    }
}

/// **Le processeur graphique de la capture, partagé** (spec § 5) : un seul
/// `CIContext` Metal pour l'aperçu, la bande, la boucle et la photo.
nonisolated enum ComposerLookGPU {
    nonisolated(unsafe) static let device: MTLDevice? = MTLCreateSystemDefaultDevice()
    nonisolated(unsafe) static let commandQueue: MTLCommandQueue? = device?.makeCommandQueue()
    static let context: CIContext = device.map {
        CIContext(mtlDevice: $0, options: [.cacheIntermediates: false, .priorityRequestLow: false])
    } ?? CIContext(options: [.cacheIntermediates: false])
}

/// **LE PEINTRE UNIQUE de la capture** (#9347, spec § 4.1).
///
/// L'aperçu (vue Metal), la photo, l'export vidéo, la boucle d'édition et les
/// miniatures appellent `paint` — un graphe Core Image pur, en un passage :
/// colorimétrie de l'appel → cadrage → ton de la case → fond / case / calque.
/// Ce qu'on voit est donc ce qui part, par construction.
nonisolated enum ComposerLookPainter {

    /// Le canevas canonique : 9:16, rempli, avec ou sans cadre.
    static let canvas = CGSize(width: 1080, height: 1920)
    /// La toile d'une miniature de la bande.
    static let thumbnailCanvas = CGSize(width: 162, height: 288)

    private static let compositor = CallLiveFrameCompositor()

    /// Les couches statiques d'un look, peintes par le processeur. `nil` sans cadre,
    /// ou pour un cadre inconnu du catalogue. À appeler HORS du fil principal.
    static func scene(for look: ComposerPhotoLook, canvas: CGSize, date: Date,
                      person: CallFramePerson) -> CallLiveFrameScene? {
        switch look.frame {
        case .none:
            return nil
        case .montage(.frame(let id)):
            guard let design = CallMontageFrameRule.design(id: id) else { return nil }
            let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: [person],
                                                  texts: ComposerPhotoLookSource.texts(at: date), size: canvas)
            return compositor.paint(design: design, inputs: inputs)
        case .montage(.classic):
            return nil
        }
    }

    static func scene(for key: ComposerLookSceneKey) -> CallLiveFrameScene? {
        scene(for: key.look, canvas: key.canvas, date: key.date, person: key.person)
    }

    /// Le graphe. `scene` doit avoir été cuite pour `canvas`.
    static func paint(_ source: CIImage, look: ComposerPhotoLook, framing: ComposerFraming,
                      scene: CallLiveFrameScene?, canvas: CGSize, declared: CGColorSpace? = nil) -> CIImage {
        let graded = ComposerLiveLookRule.graded(source, filter: look.filter, declared: declared)
        guard let scene, let slot = scene.slots.first, slot.photo.height > 0 else {
            return filled(graded, framing: framing, into: CGRect(origin: .zero, size: canvas))
        }
        let fenetre = framing.window(in: graded.extent, aspect: slot.photo.width / slot.photo.height)
        let cadre = graded.cropped(to: fenetre)
            .transformed(by: CGAffineTransform(translationX: -fenetre.minX, y: -fenetre.minY))
        return compositor.compose(scene, videos: [slot.personId: cadre])
    }

    /// La fenêtre du cadrage, posée pour remplir exactement `target`.
    static func filled(_ image: CIImage, framing: ComposerFraming, into target: CGRect) -> CIImage {
        guard target.width > 0, target.height > 0 else { return image }
        let fenetre = framing.window(in: image.extent, aspect: target.width / target.height)
        guard fenetre.width > 0, fenetre.height > 0 else { return image }
        let pose = CGAffineTransform(translationX: -fenetre.minX, y: -fenetre.minY)
            .concatenating(CGAffineTransform(scaleX: target.width / fenetre.width, y: target.height / fenetre.height))
            .concatenating(CGAffineTransform(translationX: target.minX, y: target.minY))
        return image.cropped(to: fenetre).transformed(by: pose).cropped(to: target)
    }

    /// **La photo qui part** : le même graphe, rendu dans l'espace de la photo (#9327).
    static func photo(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming,
                      scene: CallLiveFrameScene?, canvas: CGSize = canvas) -> CGImage? {
        let espace = ComposerPhotoLookRule.colorSpace(of: image)
        let peinte = paint(CIImage(cgImage: image), look: look, framing: framing, scene: scene,
                           canvas: canvas, declared: espace)
        return ComposerLookGPU.context.createCGImage(peinte, from: CGRect(origin: .zero, size: canvas),
                                                     format: .RGBA8, colorSpace: espace)
    }

    /// L'écran montre le canevas par UNE transformation d'ajustement.
    static func onScreen(_ painted: CIImage, canvas: CGSize, drawable: CGSize) -> CIImage {
        painted.transformed(by: ComposerLiveLookRule.fit(scene: canvas, into: drawable))
    }

    /// La photo en pleine toile, hors du fil principal. La scène vient du cache
    /// quand l'aperçu l'a déjà cuite ; un cadre qui ne se peint pas rend `nil`
    /// plutôt qu'une photo sans le cadre que l'auteur voyait.
    @concurrent
    static func renderPhoto(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming,
                            person: CallFramePerson, date: Date,
                            scenes: any ComposerLookSceneProviding) async -> CGImage? {
        let cle = ComposerLookSceneKey(look: look, canvas: canvas, date: date, person: person)
        let scene = scenes.cached(cle) ?? scene(for: cle)
        if look.frame != .none, scene == nil { return nil }
        return photo(image, look: look, framing: framing, scene: scene)
    }
}
```

`ComposerLookSceneCache.swift` :

```swift
import CoreImage
import Foundation

/// Ce que la capture attend du cache de scènes — injecté dans la surface, la
/// bande et la session.
protocol ComposerLookSceneProviding: AnyObject, Sendable {
    nonisolated func cached(_ key: ComposerLookSceneKey) -> CallLiveFrameScene?
    nonisolated func prepare(_ key: ComposerLookSceneKey, ready: @escaping @MainActor @Sendable () -> Void)
    nonisolated func purge()
}

/// **Les scènes cuites, une fois par (look, toile, date, auteur)** (spec § 4.1).
///
/// Cuire un cadre coûte des millisecondes de processeur : jamais sur le fil
/// principal, jamais deux fois. `NSCache` borné ; `purge` à la fermeture du viseur.
nonisolated final class ComposerLookSceneCache: ComposerLookSceneProviding, @unchecked Sendable {
    static let shared = ComposerLookSceneCache()

    private let scenes = NSCache<NSString, CallLiveFrameScene>()
    private let queue = DispatchQueue(label: "me.meeshy.composer.look-scenes", qos: .userInitiated)
    private let lock = NSLock()
    private var pending: Set<NSString> = []
    private let painter: @Sendable (ComposerLookSceneKey) -> CallLiveFrameScene?

    nonisolated deinit {}

    init(countLimit: Int = 48,
         painter: @escaping @Sendable (ComposerLookSceneKey) -> CallLiveFrameScene? = { ComposerLookPainter.scene(for: $0) }) {
        scenes.countLimit = countLimit
        self.painter = painter
    }

    func cached(_ key: ComposerLookSceneKey) -> CallLiveFrameScene? {
        scenes.object(forKey: key.cacheKey)
    }

    func prepare(_ key: ComposerLookSceneKey, ready: @escaping @MainActor @Sendable () -> Void) {
        let cle = key.cacheKey
        guard scenes.object(forKey: cle) == nil else { return }
        lock.lock()
        let dejaEnCours = pending.contains(cle)
        if !dejaEnCours { pending.insert(cle) }
        lock.unlock()
        guard !dejaEnCours else { return }
        queue.async {
            if let scene = self.painter(key) { self.scenes.setObject(scene, forKey: cle) }
            self.lock.lock()
            self.pending.remove(cle)
            self.lock.unlock()
            Task { @MainActor in ready() }
        }
    }

    func purge() {
        scenes.removeAllObjects()
        lock.lock()
        pending.removeAll()
        lock.unlock()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
git add $P/ComposerLookPainter.swift $P/ComposerLookSceneCache.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): un seul peintre Core Image, une scène cuite une fois hors du fil principal (#9347)" -- $P/ComposerLookPainter.swift $P/ComposerLookSceneCache.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9347`). Expected: PASS, `ComposerLookPainterTests` 7/7. Si `test_photo_andPreview_paintTheSamePixels` diffère de plus de 2 niveaux, c'est que `photo` et `paint` ne lisent pas la source dans le même espace : passer `declared` identique des deux côtés (c'est le contrat), ne pas élargir la tolérance.

- [ ] **Step 5: Commit** — fait ; P3.

---

### Task 3: L'aperçu, la photo et la vidéo passent par le peintre ; la revue grave la date de la session

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift` (tout le moteur)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureViews.swift:9-39` (`ComposerCapturePreview`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift:28-72`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift:288-332` (`validateSegments`) et `:510-528` (`lookedPhoto`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoLookReview.swift:117-120` (date), `:287-297` (peintre), `:319-328` (`upright` déplacé)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoLook.swift` (reçoit `upright` et `caption(at:)`)
- Create: `apps/ios/scripts/catalog_keys.py`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerLookPainterWiringTests.swift`
- Test (mise à jour) : `apps/ios/MeeshyTests/Unit/Composer/ComposerLiveLookTests.swift:236-246` (`test_laSurface_composeAvecLesPiecesDeLAppel`), `:217` (`test_leRendu_seDit…`, `declaredSpaceName: espace` reste)

**Interfaces:**
- Consumes: Tâches 1-2.
- Produces:
  - `ComposerLiveLookSurface(look:person:date:framing:source:scenes:)` (le paramètre `texts` disparaît ; `source` est encore `ComposerCameraFeed` ici, généralisé en Tâche 7).
  - `ComposerLookVideoExporter.export(_ url: URL, look: ComposerPhotoLook, framing: ComposerFraming = .identity, person: CallFramePerson, date: Date, declaredSpaceName: String? = nil) async -> URL?`
  - `ComposerPhotoLookSource.upright(_ image: UIImage) -> CGImage?` et `ComposerPhotoLookSource.caption(at: Date) -> CallMontageCaption`
  - `nonisolated enum ComposerCaptureCanvas { static func fitted(in bounds: CGRect) -> CGRect }`
  - `apps/ios/scripts/catalog_keys.py apply <fichier.json>` (format : `{"set": {"clé": {"fr": "…", "en": "…", "es": "…", "de": "…", "it": "…", "pt-BR": "…", "ar": "…"}}, "delete": ["clé", …]}`).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import CoreGraphics
@testable import Meeshy

/// **Tout part du même peintre, à la date de la session** (#9347).
@MainActor
final class ComposerLookPainterWiringTests: XCTestCase {

    func test_fitted_isNineSixteenCenteredInsideTheBounds() {
        let ecran = CGRect(x: 0, y: 0, width: 390, height: 844)
        let toile = ComposerCaptureCanvas.fitted(in: ecran)
        XCTAssertEqual(toile.width / toile.height, 9.0 / 16.0, accuracy: 0.001)
        XCTAssertEqual(toile.width, 390, accuracy: 0.001)
        XCTAssertEqual(toile.midY, ecran.midY, accuracy: 0.001)
    }

    func test_caption_isWrittenAtTheGivenDate() {
        let date = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertEqual(ComposerPhotoLookSource.caption(at: date).subtitle,
                       date.formatted(date: .abbreviated, time: .shortened))
    }

    func test_consumers_paintThroughThePainter_andTheSessionDate() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("ComposerLookPainter.paint("), "l'aperçu peint par le peintre unique")
        XCTAssertTrue(surface.contains("ComposerLookPainter.onScreen("), "une seule transformation d'ajustement")
        XCTAssertFalse(surface.contains("CallLiveFrameRule.paintSize("), "la scène se cuit au canevas canonique")
        let export = try Self.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("ComposerLookPainter.paint("), "la vidéo peint par le peintre unique")
        let session = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("ComposerLookPainter.renderPhoto("), "la photo peint par le peintre unique")
        XCTAssertTrue(session.contains("date: lookDate"), "la vidéo grave la date de la session")
        let revue = try Self.code("Meeshy/Features/Main/Composer/ComposerPhotoLookReview.swift")
        XCTAssertFalse(revue.contains("at: Date()"), "la revue grave la date de la session, pas celle de son ouverture")
        for fichier in ["ComposerLookPainter.swift", "ComposerLiveLookSurface.swift", "ComposerLookVideoExporter.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains("Date()"), "\(fichier) : aucune date du rendu sur un chemin de rendu")
        }
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("ComposerCaptureCanvas.fitted("), "l'aperçu montre le canevas 9:16, pas l'écran entier")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
```

Mettre à jour, dans `ComposerLiveLookTests.swift`, `test_laSurface_composeAvecLesPiecesDeLAppel` :

```swift
    func test_laSurface_composeAvecLesPiecesDeLAppel() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("ComposerLookPainter.paint("), "l'aperçu passe par le peintre unique")
        let peintre = try Self.code("Meeshy/Features/Main/Composer/ComposerLookPainter.swift")
        XCTAssertTrue(peintre.contains("CallLiveFrameCompositor()"), "le cadre se pose par le compositeur de l'appel")
        XCTAssertTrue(peintre.contains("compositor.compose("))
        XCTAssertTrue(peintre.contains("ComposerLiveLookRule.graded("))
        let loi = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLook.swift")
        XCTAssertTrue(loi.contains("VideoFilterColorimetry.graded("), "la teinte est celle du flux d'appel")
        for jumelle in ["CITemperatureAndTint", "CIColorControls", "CIColorCube"] {
            XCTAssertFalse(surface.contains(jumelle) || loi.contains(jumelle) || peintre.contains(jumelle),
                           "aucune jumelle de la colorimétrie : \(jumelle)")
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer
git add $T/ComposerLookPainterWiringTests.swift $T/ComposerLiveLookTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — l'aperçu, la photo et la vidéo passent par le peintre unique (#9347)" -- $T/ComposerLookPainterWiringTests.swift $T/ComposerLiveLookTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `cannot find 'ComposerCaptureCanvas' in scope`.

- [ ] **Step 3: Write minimal implementation**

3a. Dans `ComposerPhotoLook.swift`, ajouter à `ComposerPhotoLookSource` (et faire appeler `caption(at:)` par `taken(_:by:at:)`) :

```swift
    /// La légende d'un classique du Montage pour une prise faite à `date`.
    static func caption(at date: Date) -> CallMontageCaption {
        CallMontageCaption(title: CallCaptureController.brand,
                           subtitle: date.formatted(date: .abbreviated, time: .shortened))
    }

    /// Les pixels debout : le traitement de la prise (#8695) les rend déjà
    /// redressés ; une image venue d'ailleurs l'est ici, une fois.
    static func upright(_ image: UIImage) -> CGImage? {
        if image.imageOrientation == .up, let cgImage = image.cgImage { return cgImage }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let size = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.cgImage
    }
```

Ajouter `import UIKit` en tête de `ComposerPhotoLook.swift`. Dans `taken(_:by:at:)`, remplacer le littéral `CallMontageCaption(…)` par `caption: caption(at: date)`. Dans `ComposerPhotoLookReview.swift`, supprimer `static func upright` et remplacer ses appels par `ComposerPhotoLookSource.upright(…)`.

3b. `ComposerPhotoLookReview` — la date et le peintre :
- ajouter la propriété `let date: Date` (après `person`), le paramètre `date: Date` à son `init` (après `person:`), et remplacer `ComposerPhotoLookSource.taken(upright, by: person, at: Date())` par `ComposerPhotoLookSource.taken(upright, by: person, at: date)` ;
- dans `ComposerViewfinder.swift`, passer `date: capture.lookDate` à `ComposerPhotoLookReview(…)` ;
- remplacer `paintPreview` et `paintFinal` par :

```swift
    @concurrent
    nonisolated static func paintPreview(_ look: ComposerPhotoLook, source: ComposerPhotoLookSource,
                                         date: Date) async -> CGImage? {
        await ComposerLookPainter.renderPhoto(source.photo, look: look, framing: .identity, person: source.person,
                                              date: date, scenes: ComposerLookSceneCache.shared)
    }

    @concurrent
    nonisolated static func paintFinal(_ look: ComposerPhotoLook, source: ComposerPhotoLookSource,
                                       date: Date) async -> CGImage? {
        await ComposerLookPainter.renderPhoto(source.photo, look: look, framing: .identity, person: source.person,
                                              date: date, scenes: ComposerLookSceneCache.shared)
    }
```

et leurs deux appels : `await Self.paintPreview(look, source: source, date: date)`, `await Self.paintFinal(choisi, source: source, date: date)`. (La revue disparaît en Tâche 15 ; ce pas corrige « deux rendus » dès ce lot.)

3c. `ComposerCaptureViews.swift` — l'aperçu montre le canevas 9:16 :

```swift
/// **La toile à l'écran** (#9347) : le canevas 9:16, ajusté et centré — la
/// couche système comme la vue Metal s'y posent, donc l'écran montre exactement
/// ce qui part.
nonisolated enum ComposerCaptureCanvas {
    static func fitted(in bounds: CGRect) -> CGRect {
        let toile = ComposerLookPainter.canvas
        guard bounds.width > 0, bounds.height > 0 else { return bounds }
        let echelle = min(bounds.width / toile.width, bounds.height / toile.height)
        let taille = CGSize(width: toile.width * echelle, height: toile.height * echelle)
        return CGRect(x: bounds.midX - taille.width / 2, y: bounds.midY - taille.height / 2,
                      width: taille.width, height: taille.height)
    }
}
```

et, dans `ComposerCapturePreview.body`, remplacer le `case .viewfinder:` par :

```swift
            case .viewfinder:
                GeometryReader { proxy in
                    let toile = ComposerCaptureCanvas.fitted(in: CGRect(origin: .zero, size: proxy.size))
                    ZStack {
                        CameraPreviewLayer(session: session.camera.session, focusPoints: session.focusPoints)
                            .background(GeometryReader { mesure in
                                Color.clear.adaptiveOnChange(of: mesure.frame(in: .global), initial: true) { _, cadre in
                                    session.focusPoints.previewFrame = cadre
                                }
                            })
                        if ComposerLiveLookRule.rendersLive(session.look) {
                            ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                    date: session.lookDate, framing: .identity,
                                                    source: session.camera.liveFeed)
                        }
                    }
                    .frame(width: toile.width, height: toile.height)
                    .position(x: toile.midX, y: toile.midY)
                }
```

(Garder `adaptiveOnChange(of: proxy.frame(in: .global), initial: true)` mot pour mot : la garde `test_leChromePartage_porteLeDoubleToucherEtLePincement` le lit — renommer `mesure` en `proxy` en renommant le `GeometryReader` extérieur `exterieur`.)

3d. `ComposerLiveLookSurface.swift` — le moteur peint par le peintre, au canevas canonique :

```swift
import CoreImage
import Metal
import MetalKit
import QuartzCore
import SwiftUI

/// **Le look en direct, à l'écran** (#9329, #9347) — un `MTKView` qui peint le
/// canevas 9:16 par le peintre unique. Il ne prend aucun toucher.
struct ComposerLiveLookSurface: UIViewRepresentable {
    let look: ComposerPhotoLook
    let person: CallFramePerson
    let date: Date
    let framing: ComposerFraming
    let source: ComposerCameraFeed
    var scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared

    func makeCoordinator() -> ComposerLiveLookRenderer {
        ComposerLiveLookRenderer(source: source, scenes: scenes)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(look: look, person: person, date: date, framing: framing)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLiveLookRenderer) {
        coordinator.stop(view)
    }
}

/// Le moteur de la surface : la trame, le look, la scène cuite — rien d'autre.
final class ComposerLiveLookRenderer: NSObject, MTKViewDelegate {
    private let source: ComposerCameraFeed
    private let scenes: any ComposerLookSceneProviding

    private var look = ComposerPhotoLook()
    private var framing = ComposerFraming.identity
    private var key: ComposerLookSceneKey?

    nonisolated deinit {}

    init(source: ComposerCameraFeed, scenes: any ComposerLookSceneProviding) {
        self.source = source
        self.scenes = scenes
        super.init()
    }

    func makeView() -> MTKView {
        let view = MTKView(frame: .zero, device: ComposerLookGPU.device)
        view.delegate = self
        view.framebufferOnly = false
        view.colorPixelFormat = .bgra8Unorm
        view.preferredFramesPerSecond = 30
        view.enableSetNeedsDisplay = false
        view.isPaused = false
        view.autoResizeDrawable = true
        view.isOpaque = true
        view.backgroundColor = .black
        view.isUserInteractionEnabled = false
        (view.layer as? CAMetalLayer)?.colorspace = ComposerLiveLookRule.colorSpace
        return view
    }

    func update(look: ComposerPhotoLook, person: CallFramePerson, date: Date, framing: ComposerFraming) {
        self.look = look
        self.framing = framing
        let cle = ComposerLookSceneKey(look: look, canvas: ComposerLookPainter.canvas, date: date, person: person)
        key = cle
        guard look.frame != .none else { return }
        scenes.prepare(cle) {}
    }

    func stop(_ view: MTKView) {
        view.isPaused = true
        view.delegate = nil
        key = nil
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let commandQueue = ComposerLookGPU.commandQueue,
              let frame = source.latestImage(),
              let drawable = view.currentDrawable,
              let buffer = commandQueue.makeCommandBuffer() else { return }
        let scene = key.flatMap { scenes.cached($0) }
        let lookPeint = look.frame != .none && scene == nil ? ComposerPhotoLook(filter: look.filter) : look
        let peinte = ComposerLookPainter.paint(frame, look: lookPeint, framing: framing, scene: scene,
                                               canvas: ComposerLookPainter.canvas, declared: source.declaredSpace)
        let bounds = CGRect(origin: .zero, size: view.drawableSize)
        let ecran = ComposerLookPainter.onScreen(peinte, canvas: ComposerLookPainter.canvas, drawable: view.drawableSize)
        let opaque = ecran.composited(over: CIImage(color: .black).cropped(to: bounds))
        ComposerLookGPU.context.render(opaque, to: drawable.texture, commandBuffer: buffer, bounds: bounds,
                                       colorSpace: ComposerLiveLookRule.colorSpace)
        buffer.present(drawable)
        buffer.commit()
    }
}
```

(Pendant que la scène cuit, la trame FILTRÉE se montre — même promesse qu'avant ; la cadence et le dessin à l'arrivée d'une trame viennent en Tâche 7.)

3e. `ComposerLookVideoExporter.export` — remplacer la signature et le corps du `do` :

```swift
    @concurrent
    static func export(_ url: URL, look: ComposerPhotoLook, framing: ComposerFraming = .identity,
                       person: CallFramePerson, date: Date, declaredSpaceName: String? = nil) async -> URL? {
        guard ComposerLiveLookRule.rendersLive(look) || !framing.isIdentity else { return url }
        let asset = AVURLAsset(url: url)
        do {
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { return nil }
            let natural = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let upright = MeeshyVideoWatermarkBaker.orientedSize(natural: natural, transform: transform)
            let toile = ComposerLookPainter.canvas
            let scene = ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: person)
            if look.frame != .none, scene == nil { throw UnpaintedFrame() }
            let composition = AVMutableVideoComposition(asset: asset) { @Sendable request in
                let declare = declaredSpaceName.flatMap { CGColorSpace(name: $0 as CFString) }
                let image = ComposerLookPainter.paint(request.sourceImage, look: look, framing: framing,
                                                      scene: scene, canvas: toile, declared: declare)
                request.finish(with: image.cropped(to: CGRect(origin: .zero, size: toile)), context: nil)
            }
            guard MeeshyVideoWatermarkBaker.sizesMatch(composition.renderSize, upright) else { return nil }
            composition.renderSize = toile
            composition.colorPrimaries = AVVideoColorPrimaries_P3_D65
            composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
            composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
            return await write(asset, composition: composition)
        } catch {
            Logger.media.error("Live look video export failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
```

Supprimer `paintedScene(for:person:texts:size:)` (remplacée par le peintre).

3f. `ComposerCaptureSession.swift` — `validateSegments` : remplacer `let textes = lookTexts` par rien, et l'appel par

```swift
            let regardee = await ComposerLookVideoExporter.export(url, look: regard, person: auteur, date: lookDate,
                                                                   declaredSpaceName: espace)
```

et `lookedPhoto` par :

```swift
    /// **La photo part avec ce qu'on voyait** : le canevas 9:16 du peintre unique,
    /// à la date de la session, hors du fil principal. Le BRUT est déjà en galerie
    /// (`CameraModel`) ; un rendu qui échoue rend la prise d'origine plutôt que rien.
    func lookedPhoto(_ image: UIImage, data: Data?, deliver: @escaping @MainActor (CameraResult) -> Void) {
        guard let debout = ComposerPhotoLookSource.upright(image) else {
            deliver(.photo(image, data: data))
            return
        }
        let regard = look
        let auteur = lookPerson
        let date = lookDate
        Task { @MainActor in
            guard let rendu = await ComposerLookPainter.renderPhoto(debout, look: regard, framing: .identity,
                                                                    person: auteur, date: date,
                                                                    scenes: ComposerLookSceneCache.shared) else {
                deliver(.photo(image, data: data))
                return
            }
            deliver(.photo(UIImage(cgImage: rendu), data: nil))
        }
    }
```

et vider le cache à la fermeture : dans `disarm()`, après `extinguishFlash()`, ajouter `ComposerLookSceneCache.shared.purge()`.

3g. Mettre à jour les témoins existants qui décrivaient l'ancien chemin : dans `ComposerLiveLookTests`, les deux tests qui appellent `session.lookedPhoto(…)` (lignes ~141 et ~153) — remplacer l'assertion « sans look, les octets d'origine partent » par :

```swift
        guard case .photo(let rendue, let octets) = try XCTUnwrap(rendu) else { return XCTFail("une photo") }
        XCTAssertNil(octets, "la photo qui part est le canevas peint : ses octets ne décrivent plus le brut")
        XCTAssertEqual(rendue.size.width / rendue.size.height, 9.0 / 16.0, accuracy: 0.01)
```

(et attendre l'arrivée par `expectation` + `wait(for:timeout: 10)` : le rendu est désormais asynchrone dans les deux cas).

3h. `apps/ios/scripts/catalog_keys.py` (utilisé à partir de la Tâche 7) :

```python
#!/usr/bin/env python3
"""Ajoute, met à jour ou retire des clés du catalogue de l'app, dans les sept langues.

Usage : python3 apps/ios/scripts/catalog_keys.py apply changements.json
Format : {"set": {"clé": {"fr": "…", "en": "…", "es": "…", "de": "…", "it": "…", "pt-BR": "…", "ar": "…"}},
          "delete": ["clé", …]}
Le fichier est réécrit dans la forme exacte de Xcode (indentation 2, « : », fin de ligne).
"""
import json
import sys
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[1] / "Meeshy" / "Localizable.xcstrings"
LANGS = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "apply":
        print(__doc__)
        return 2
    changes = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    strings = catalog["strings"]
    for key, values in changes.get("set", {}).items():
        missing = [lang for lang in LANGS if lang not in values]
        if missing:
            print(f"{key}: langues manquantes {missing}")
            return 1
        strings[key] = {
            "extractionState": "manual",
            "localizations": {
                lang: {"stringUnit": {"state": "translated", "value": values[lang]}} for lang in LANGS
            },
        }
    for key in changes.get("delete", []):
        strings.pop(key, None)
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n",
                       encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Vérifier la fidélité d'écriture sans rien changer : `echo '{}' > /tmp/rien.json && python3 apps/ios/scripts/catalog_keys.py apply /tmp/rien.json && git diff --stat apps/ios/Meeshy/Localizable.xcstrings` → aucune ligne.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
F="$P/ComposerLiveLookSurface.swift $P/ComposerCaptureViews.swift $P/ComposerLookVideoExporter.swift $P/ComposerCaptureSession.swift $P/ComposerPhotoLookReview.swift $P/ComposerPhotoLook.swift $P/ComposerViewfinder.swift apps/ios/MeeshyTests/Unit/Composer/ComposerLiveLookTests.swift apps/ios/scripts/catalog_keys.py"
git add $F
git commit -m "fix(ios): l'aperçu, la photo et la vidéo sortent du même peintre, sur le canevas 9:16 et à la date de la session — run test (Closes #9347)" -- $F
```

P1. Expected: PASS — `ComposerLookPainterWiringTests` 3/3, `ComposerLiveLookTests` vert, `ComposerSingleViewfinderTests` vert (ses tests de `ComposerPhotoLookRenderer` restent valides : la classe vit jusqu'en Tâche 15).

- [ ] **Step 5: Livrer et clore le lot** — P3, puis `status 9347 Done` et commentaire de clôture (modèle en Tâche 22, étape 4).

---
## Lot 2 — #9348 : les cadres classiques en couches GPU, admis en direct

### Task 4: Un classique du Montage se découpe en couches (trou relevé à la peinture du portrait)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/CallMontageRenderer+Layers.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallMontageRenderer.swift:5-9` (`CallMontagePortrait`), `:190-203` (`drawPortrait`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallMontageRenderer+Glamour.swift:165-182` (`drawNoir`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallFrames/CallLiveFrameCompositor.swift:44-53` (`CallLiveFrameSlot`), `:188-191` (`place`), `:9-40` (`CallLiveFrameGeometry.placed`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/CallMontageLayersTests.swift`

**Interfaces:**
- Consumes: existants `CallMontageRenderer.render(style:portraits:canvas:caption:colorSpace:)`, `CallMontageRenderer.makeContext(size:colorSpace:)`, `CallLiveFrameCompositor.baked(_:)`, `CallLiveFrameScene`, `CallLiveFrameSlot`, `CallFrameTone`.
- Produces:
  - `nonisolated final class CallMontageHole: @unchecked Sendable { var path: CGPath? { get }; var frame: CGRect { get }; var toCanvas: CGAffineTransform { get }; func record(path:frame:toCanvas:) }`
  - `CallMontagePortrait.hole: CallMontageHole?` (défaut `nil` : les appels existants ne changent pas)
  - `CallLiveFrameSlot.placement: CGAffineTransform?` (défaut `nil`)
  - `CallLiveFrameGeometry.placed(source: CGRect, photo: CGRect, toCanvas: CGAffineTransform) -> CGAffineTransform`
  - `CallMontageRenderer.layers(style: CallMontageStyle, person: CallFramePerson, caption: CallMontageCaption, size: CGSize) -> CallLiveFrameScene?`
  - `CallMontageRenderer.tone(of: CallMontageStyle) -> CallFrameTone`

**Le principe, à lire avant d'écrire.** Peint pour UNE personne, un classique dessine : son décor, PUIS le portrait (`drawPortrait`), PUIS ce qui passe par-dessus (bandeaux, légendes, grain, vignette). Toutes ces opérations sont des « source-over » — sauf la désaturation de `noir` (mode `.saturation`). Le peintre reçoit donc un portrait « trou » : au lieu de peindre la photo, `drawPortrait` relève le chemin de la case et la transformation exacte du contexte (rotation de la polaroïd comprise) puis efface la case (`.clear`). L'image obtenue est le CALQUE (décor + dessus, avec un trou) ; le masque est le chemin relevé ; la vidéo se pose SOUS le calque, dans le masque. Composer « vidéo masquée, puis calque par-dessus » rend exactement ce que le peintre CPU rendait, parce que « source-over » est associatif. `noir` saute sa désaturation sur un trou et la remet en ton de case (`.mono`).

- [ ] **Step 0: Ouvrir le lot** — `status 9348 "In Progress"` (P2) ; `git pull --rebase --autostash origin dev`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import CoreImage
@testable import Meeshy

/// **Les classiques en couches** (#9348, spec § 4.2) : chaque style se cuit en
/// scène, et la scène composée sur le GPU rend ce que le peintre CPU rendait.
@MainActor
final class CallMontageLayersTests: XCTestCase {

    private let personne = CallFramePerson(id: "moi", name: "Ada", handle: "ada", isSelf: true)
    private let legende = CallMontageCaption(title: "Meeshy", subtitle: "4 oct. 2026")
    private let toile = CGSize(width: 108, height: 192)

    func test_layers_everyClassicStyle_producesASceneWithOneSlot() {
        for style in CallMontageStyle.allCases {
            let scene = CallMontageRenderer.layers(style: style, person: personne, caption: legende, size: toile)
            XCTAssertNotNil(scene, "\(style) se découpe en couches")
            XCTAssertEqual(scene?.slots.count, 1, "\(style) : une personne, une découpe")
            XCTAssertNotNil(scene?.slots.first?.placement, "\(style) : la case se pose par la transformation relevée")
        }
    }

    func test_layers_composedOnGPU_matchesTheHistoricalCPURender() throws {
        let photo = Self.photo()
        let contexte = CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
        for style in CallMontageStyle.allCases {
            let cpu = try XCTUnwrap(CallMontageRenderer.render(
                style: style,
                portraits: [CallMontagePortrait(id: personne.id, name: personne.name, image: photo)],
                canvas: toile, caption: legende))
            let scene = try XCTUnwrap(CallMontageRenderer.layers(style: style, person: personne,
                                                                 caption: legende, size: toile))
            let gpu = CallLiveFrameCompositor().compose(scene, videos: [personne.id: CIImage(cgImage: photo)])
            let a = Self.rgba(CIImage(cgImage: cpu), size: toile, context: contexte)
            let b = Self.rgba(gpu, size: toile, context: contexte)
            let ecart = zip(a, b).reduce(0.0) { $0 + abs(Double($1.0) - Double($1.1)) } / Double(a.count) / 255
            let tolerance = style == .noir ? 0.10 : 0.035
            XCTAssertLessThan(ecart, tolerance, "\(style) : écart moyen \(ecart) entre les couches et le rendu CPU")
        }
    }

    func test_render_withoutHole_isUnchangedForCalls() throws {
        let photo = Self.photo()
        let avant = try XCTUnwrap(CallMontageRenderer.render(
            style: .polaroid, portraits: [CallMontagePortrait(id: "a", name: "A", image: photo)],
            canvas: toile, caption: legende))
        XCTAssertEqual(avant.width, 108, "le chemin CPU des appels ne change pas")
    }

    func test_tone_noirIsMono_othersInColor() {
        XCTAssertEqual(CallMontageRenderer.tone(of: .noir), .mono)
        XCTAssertEqual(CallMontageRenderer.tone(of: .polaroid), .color)
    }

    // MARK: - Outils

    static func photo() -> CGImage {
        let contexte = CGContext(data: nil, width: 300, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 150, height: 400))
        contexte.setFillColor(CGColor(red: 0.1, green: 0.3, blue: 0.9, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 0, width: 150, height: 200))
        contexte.setFillColor(CGColor(red: 0.2, green: 0.8, blue: 0.3, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 200, width: 150, height: 200))
        return contexte.makeImage()!
    }

    static func rgba(_ image: CIImage, size: CGSize, context: CIContext) -> [UInt8] {
        let largeur = Int(size.width), hauteur = Int(size.height)
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        context.render(image, toBitmap: &octets, rowBytes: largeur * 4, bounds: CGRect(origin: .zero, size: size),
                       format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/CallMontageLayersTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — chaque classique se découpe en couches GPU fidèles au rendu CPU (#9348)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9348`). Expected: FAIL — `type 'CallMontageRenderer' has no member 'layers'`.

- [ ] **Step 3: Write minimal implementation**

3a. `CallMontageRenderer.swift` — le portrait peut être un trou :

```swift
nonisolated struct CallMontagePortrait: @unchecked Sendable {
    let id: String
    let name: String
    let image: CGImage?
    /// Peint, ce portrait est un TROU qui relève sa case (#9348) — `nil` pour
    /// les appels, qui peignent la photo.
    var hole: CallMontageHole? = nil
}
```

et `drawPortrait` :

```swift
    static func drawPortrait(_ context: CGContext, _ portrait: CallMontagePortrait, in slot: CallMontageSlot) {
        context.saveGState()
        if slot.rotation != 0, slot.shape != .rectangle {
            rotate(context, around: CGPoint(x: slot.frame.midX, y: slot.frame.midY), degrees: slot.rotation)
        }
        let chemin = path(for: slot)
        if let hole = portrait.hole {
            hole.record(path: chemin, frame: slot.frame, toCanvas: context.userSpaceToDeviceSpaceTransform)
            context.addPath(chemin)
            context.setBlendMode(.clear)
            context.fillPath()
            context.restoreGState()
            return
        }
        context.addPath(chemin)
        context.clip()
        if let image = portrait.image {
            drawImage(context, image, aspectFill: slot.frame)
        } else {
            drawPlaceholder(context, portrait, in: slot.frame)
        }
        context.restoreGState()
    }
```

3b. `CallMontageRenderer+Glamour.swift`, `drawNoir` — la désaturation ne s'applique qu'à une photo peinte :

```swift
        placed.forEach { slot, portrait in
            drawPortrait(context, portrait, in: slot)
            if portrait.hole == nil {
                context.saveGState()
                context.addPath(path(for: slot))
                context.clip()
                context.setBlendMode(.saturation)
                fill(context, slot.frame, gray: 0.5)
                context.restoreGState()
            }
            stroke(context, slot, color: white(0.85), width: 3 * unit)
        }
```

3c. `CallLiveFrameCompositor.swift` — une case peut porter sa transformation :

```swift
nonisolated struct CallLiveFrameSlot: @unchecked Sendable {
    let personId: String
    let photo: CGRect
    let rotation: Double
    let mask: CIImage
    let placeholder: CIImage
    let tone: CallFrameTone
    let duotone: CallFrameDuotone?
    /// Repère de la case → repère de la toile, relevé à la peinture d'un
    /// classique (#9348). `nil` ⇒ la case se pose par `photo` + `rotation`.
    var placement: CGAffineTransform? = nil
}
```

dans `CallLiveFrameGeometry` :

```swift
    /// La vidéo remplie dans `photo` (repère de la case, y vers le bas), puis
    /// portée dans la toile Core Image par la transformation relevée — rotation
    /// autour de n'importe quel centre comprise.
    static func placed(source: CGRect, photo: CGRect, toCanvas: CGAffineTransform) -> CGAffineTransform {
        guard source.width > 0, source.height > 0, photo.width > 0, photo.height > 0 else { return .identity }
        let scale = max(photo.width / source.width, photo.height / source.height)
        let fill = CGAffineTransform(translationX: -source.midX, y: -source.midY)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: photo.midX, y: photo.midY))
        let retourne = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: photo.minY + photo.maxY)
        return fill.concatenating(retourne).concatenating(toCanvas)
    }
```

et `place` :

```swift
    func place(_ video: CIImage, in slot: CallLiveFrameSlot, canvasHeight: CGFloat) -> CIImage {
        let transform = slot.placement.map {
            CallLiveFrameGeometry.placed(source: video.extent, photo: slot.photo, toCanvas: $0)
        } ?? CallLiveFrameGeometry.videoTransform(source: video.extent, photo: slot.photo, degrees: slot.rotation,
                                                  canvasHeight: canvasHeight)
        return Self.toned(video.transformed(by: transform), slot: slot).cropped(to: slot.mask.extent)
    }
```

3d. `CallMontageRenderer+Layers.swift` :

```swift
import CoreGraphics
import CoreImage
import Foundation

/// **Là où le portrait d'un classique se pose**, relevé PENDANT que le peintre le
/// peint (#9348) : le chemin de la case et la transformation exacte du contexte
/// à cet instant — la rotation d'une polaroïd autour de sa carte comprise.
nonisolated final class CallMontageHole: @unchecked Sendable {
    private(set) var path: CGPath?
    private(set) var frame: CGRect = .zero
    private(set) var toCanvas: CGAffineTransform = .identity

    nonisolated deinit {}

    func record(path: CGPath, frame: CGRect, toCanvas: CGAffineTransform) {
        guard self.path == nil else { return }
        self.path = path
        self.frame = frame
        self.toCanvas = toCanvas
    }
}

/// **Un classique du Montage, en couches** (#9348, spec § 4.2) : le peintre CPU
/// peint le décor et le dessus UNE fois, avec un trou à la place du portrait ;
/// la carte graphique pose la vidéo dans ce trou à chaque image.
nonisolated extension CallMontageRenderer {

    static func layers(style: CallMontageStyle, person: CallFramePerson, caption: CallMontageCaption,
                       size: CGSize) -> CallLiveFrameScene? {
        guard size.width >= 1, size.height >= 1 else { return nil }
        let trou = CallMontageHole()
        let portrait = CallMontagePortrait(id: person.id, name: person.name, image: nil, hole: trou)
        guard let calque = render(style: style, portraits: [portrait], canvas: size, caption: caption),
              let chemin = trou.path,
              let dessus = CallLiveFrameCompositor.baked(calque),
              let masque = holeMask(path: chemin, toCanvas: trou.toCanvas, size: size) else { return nil }
        let etendue = CGRect(origin: .zero, size: size)
        let vide = CIImage(color: .clear).cropped(to: etendue)
        let case_ = CallLiveFrameSlot(personId: person.id, photo: trou.frame, rotation: 0, mask: masque,
                                      placeholder: vide, tone: tone(of: style), duotone: nil,
                                      placement: trou.toCanvas)
        let textes = CallFrameTexts(groupName: nil, isGroup: false, date: caption.subtitle, accentHex: nil)
        let entrees = CallLiveFrameLayerInputs(frameId: "classic-\(style.rawValue)", people: [person],
                                               texts: textes, size: size)
        return CallLiveFrameScene(inputs: entrees, backdrop: vide, overlay: dessus, slots: [case_])
    }

    /// Le ton de la case : `noir` désature sa photo (mode `.saturation` du CPU),
    /// les autres la laissent en couleur.
    static func tone(of style: CallMontageStyle) -> CallFrameTone {
        style == .noir ? .mono : .color
    }

    /// Le chemin relevé, rempli en blanc dans le repère du périphérique (y vers le
    /// haut) — celui de Core Image.
    static func holeMask(path: CGPath, toCanvas: CGAffineTransform, size: CGSize) -> CIImage? {
        guard let context = makeContext(size: size) else { return nil }
        context.concatenate(context.userSpaceToDeviceSpaceTransform.inverted())
        var transformation = toCanvas
        guard let pose = path.copy(using: &transformation) else { return nil }
        context.addPath(pose)
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fillPath()
        guard let image = context.makeImage() else { return nil }
        return CallLiveFrameCompositor.baked(image)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
S=apps/ios/Meeshy/Features/Main/Services
F="$S/CallMontageRenderer+Layers.swift $S/CallMontageRenderer.swift $S/CallMontageRenderer+Glamour.swift $S/CallFrames/CallLiveFrameCompositor.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F
git commit -m "feat(ios): un classique du Montage se découpe en couches GPU, fidèles au rendu CPU (#9348)" -- $F
```

P1. Expected: PASS — `CallMontageLayersTests` 4/4 ; `CallMontageLayoutTests`, `CallCaptureControllerTests` toujours verts (chemin des appels inchangé). Si un style dépasse la tolérance, lire l'écart imprimé : un écart > 0,2 sur `polaroid` signe une rotation inversée (vérifier `placed` : `fill` → `retourne` → `toCanvas`, dans cet ordre) ; ne pas relever la tolérance.

- [ ] **Step 5: Commit** — fait ; P3.

---

### Task 5: Le peintre peint les classiques, et le viseur les offre en direct

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookPainter.swift` (`case .montage(.classic)`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLook.swift:29-74` (`chips`, `frames`, `isLive`, `chip(for:)`, `rendersLive`)
- Test (mise à jour) : `apps/ios/MeeshyTests/Unit/Composer/ComposerLiveLookTests.swift:16-48`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerLookPainterTests.swift` (+1 test)

**Interfaces:**
- Consumes: `CallMontageRenderer.layers(style:person:caption:size:)` (Tâche 4), `ComposerPhotoLookSource.caption(at:)` (Tâche 3).
- Produces: `ComposerLiveLookRule.chips()` inclut `.classics` ; `ComposerLiveLookRule.frames(for:)` inclut les classiques ; `ComposerLiveLookRule.isLive` SUPPRIMÉE ; `ComposerLiveLookRule.rendersLive(_ look:) -> Bool` = `!look.isUntouched`.

- [ ] **Step 1: Write the failing test**

Dans `ComposerLookPainterTests` :

```swift
    func test_scene_classic_isPaintedInLayersAtTheSessionDate() throws {
        let look = ComposerPhotoLook(frame: .montage(.classic(.polaroid)))
        let scene = try XCTUnwrap(ComposerLookPainter.scene(for: look, canvas: CGSize(width: 108, height: 192),
                                                            date: date, person: auteur))
        XCTAssertEqual(scene.inputs.texts.date, ComposerPhotoLookSource.caption(at: date).subtitle)
    }
```

Dans `ComposerLiveLookTests`, remplacer `test_puces_sontLesAmbiancesDuCatalogue_sansLesClassiques`, `test_unClassique_neSeComposePasEnDirect` et la ligne `XCTAssertTrue(cadres.allSatisfy(ComposerLiveLookRule.isLive))` de `test_carrousel_…` par :

```swift
    func test_chips_includeTheClassics_firstThenTheCatalogMoods() {
        let puces = ComposerLiveLookRule.chips()
        XCTAssertEqual(puces.first, .classics, "les classiques se choisissent en direct (#9348)")
        XCTAssertTrue(Set(puces).isSubset(of: Set(ComposerPhotoLookRule.chips())))
    }

    func test_frames_classics_areOfferedLive() {
        let cadres = ComposerLiveLookRule.frames(for: .classics)
        XCTAssertEqual(cadres.first, ComposerPhotoFrame.none)
        XCTAssertTrue(cadres.contains(.montage(.classic(.polaroid))))
        XCTAssertTrue(ComposerLiveLookRule.rendersLive(ComposerPhotoLook(frame: .montage(.classic(.noir)))))
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer
git add $T/ComposerLookPainterTests.swift $T/ComposerLiveLookTests.swift
git commit -m "test(ios): témoin rouge — les classiques se peignent et se choisissent en direct (#9348)" -- $T/ComposerLookPainterTests.swift $T/ComposerLiveLookTests.swift
```

P1. Expected: FAIL — `XCTAssertEqual failed: ("Optional(…mood…)") is not equal to ("Optional(.classics)")` et `XCTUnwrap failed` sur la scène classique.

- [ ] **Step 3: Write minimal implementation**

`ComposerLookPainter.scene(for:canvas:date:person:)` :

```swift
        case .montage(.classic(let style)):
            return CallMontageRenderer.layers(style: style, person: person,
                                              caption: ComposerPhotoLookSource.caption(at: date), size: canvas)
```

`ComposerLiveLook.swift` — remplacer `chips`, `frames(for:)`, `isLive`, `chip(for:)`, `rendersLive` et leur doc par :

```swift
    /// **Les cadres en direct : les classiques du Montage, puis les ambiances du
    /// catalogue** (#9348). Un classique se peint désormais en couches GPU
    /// (`CallMontageRenderer.layers`) : il se compose en direct comme un cadre.
    static func chips() -> [CallMontageMoodChip] {
        ComposerPhotoLookRule.chips().filter { puce in
            frames(for: puce).contains { $0 != ComposerPhotoFrame.none }
        }
    }

    /// « Aucun cadre » en tête ; un cadre du catalogue ne s'offre que s'il se
    /// compose en direct (`CallLiveFrameRule.isEligible`).
    static func frames(for chip: CallMontageMoodChip) -> [ComposerPhotoFrame] {
        ComposerPhotoLookRule.frames(for: chip).filter { cadre in
            guard let dessin = design(for: cadre) else { return true }
            return CallLiveFrameRule.isEligible(dessin)
        }
    }

    /// La puce ouverte pour un look : celle de son cadre.
    static func chip(for look: ComposerPhotoLook) -> CallMontageMoodChip? {
        ComposerPhotoLookRule.chip(of: look.frame)
    }

    /// **Sans look, l'aperçu reste la couche système** — aucun coût, aucune trame retenue.
    static func rendersLive(_ look: ComposerPhotoLook) -> Bool {
        !look.isUntouched
    }
```

Puis `grep -rn "isLive(" apps/ios/Meeshy apps/ios/MeeshyTests --include='*.swift'` → ne doit plus rien rendre (sinon remplacer l'appel par `rendersLive` ou le supprimer). Mettre à jour le doc-comment d'en-tête de `ComposerLiveLook.swift` : la ligne « La photo est peinte par le peintre de la prise (`ComposerPhotoLookRenderer`) » devient « La photo, la vidéo et l'aperçu sont peints par le peintre unique (`ComposerLookPainter`) ».

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
git add $P/ComposerLookPainter.swift $P/ComposerLiveLook.swift
git commit -m "feat(ios): les cadres classiques se peignent en couches GPU et se choisissent en direct dans le viseur — run test (Closes #9348)" -- $P/ComposerLookPainter.swift $P/ComposerLiveLook.swift
```

P1. Expected: PASS (`ComposerLiveLookTests`, `ComposerLookPainterTests`, `CallMontageLayersTests`).

- [ ] **Step 5: Livrer** — P3 ; `status 9348 Done` ; commentaire de clôture (modèle en Tâche 22).

---

## Lot 3 — #9349 : un passage par image, rien quand rien ne change, dégradation thermique

### Task 6: Le palier thermique fixe un budget, injecté par protocole

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerThermalBudget.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/ThermalStateMonitor.swift:1-60` (protocole + `onStateChange`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift` (propriétés stockées `thermal`, `thermalBudget` ; `init` ; `arm` ; `disarm`)
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerThermalBudgetTests.swift`

**Interfaces:**
- Produces:
  - `nonisolated struct ComposerThermalBudget: Equatable, Sendable { let previewFPS: Int; let thumbnailFPS: Int; let thumbnailCells: Int; let surfaceScale: CGFloat; let systemLayerOnly: Bool; static func budget(for: ProcessInfo.ThermalState) -> ComposerThermalBudget; func whileRecording() -> ComposerThermalBudget }`
  - `protocol ThermalStateMonitorProviding: AnyObject { var currentState: ProcessInfo.ThermalState { get }; var onStateChange: ((ProcessInfo.ThermalState) -> Void)? { get set }; func startMonitoring(); func stopMonitoring() }` ; `ThermalStateMonitor: ThermalStateMonitorProviding`.
  - `ComposerCaptureSession.init(…, thermal: (any ThermalStateMonitorProviding)? = nil)` ; `@Published private(set) var thermalBudget: ComposerThermalBudget` ; `func watchThermalState()` ; `func stopWatchingThermalState()`.

- [ ] **Step 0: Ouvrir le lot** — `status 9349 "In Progress"` ; `git pull --rebase --autostash origin dev`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **Rien ne chauffe** (#9349, spec § 5) : chaque palier thermique fixe ce que
/// l'aperçu et la bande ont le droit de coûter.
@MainActor
final class ComposerThermalBudgetTests: XCTestCase {

    func test_budget_eachThermalTier_matchesTheSpecTable() {
        XCTAssertEqual(ComposerThermalBudget.budget(for: .nominal),
                       ComposerThermalBudget(previewFPS: 30, thumbnailFPS: 12, thumbnailCells: 8,
                                             surfaceScale: 1, systemLayerOnly: false))
        XCTAssertEqual(ComposerThermalBudget.budget(for: .fair),
                       ComposerThermalBudget(previewFPS: 24, thumbnailFPS: 6, thumbnailCells: 5,
                                             surfaceScale: 1, systemLayerOnly: false))
        XCTAssertEqual(ComposerThermalBudget.budget(for: .serious),
                       ComposerThermalBudget(previewFPS: 15, thumbnailFPS: 0, thumbnailCells: 5,
                                             surfaceScale: 0.75, systemLayerOnly: false))
        XCTAssertEqual(ComposerThermalBudget.budget(for: .critical),
                       ComposerThermalBudget(previewFPS: 0, thumbnailFPS: 0, thumbnailCells: 0,
                                             surfaceScale: 1, systemLayerOnly: true))
    }

    func test_whileRecording_onlyTheChosenThumbnailLives() {
        XCTAssertEqual(ComposerThermalBudget.budget(for: .nominal).whileRecording().thumbnailCells, 1)
        XCTAssertEqual(ComposerThermalBudget.budget(for: .critical).whileRecording().thumbnailCells, 0)
    }

    func test_session_followsTheInjectedThermalState() {
        let thermique = MockThermalStateMonitor(state: .fair)
        let session = ComposerCaptureSession(thermal: thermique)
        session.watchThermalState()
        XCTAssertEqual(thermique.startCount, 1)
        XCTAssertEqual(session.thermalBudget.previewFPS, 24)
        thermique.emit(.critical)
        XCTAssertTrue(session.thermalBudget.systemLayerOnly)
        session.disarm()
        XCTAssertEqual(thermique.stopCount, 1, "le viseur fermé ne guette plus la température")
    }
}

final class MockThermalStateMonitor: ThermalStateMonitorProviding {
    var currentState: ProcessInfo.ThermalState
    var onStateChange: ((ProcessInfo.ThermalState) -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0

    nonisolated deinit {}

    init(state: ProcessInfo.ThermalState) { currentState = state }

    func startMonitoring() { startCount += 1 }
    func stopMonitoring() { stopCount += 1 }

    func emit(_ state: ProcessInfo.ThermalState) {
        currentState = state
        onStateChange?(state)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerThermalBudgetTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — le palier thermique fixe le budget de la capture (#9349)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9349`). Expected: FAIL — `cannot find 'ComposerThermalBudget' in scope`.

- [ ] **Step 3: Write minimal implementation**

`ComposerThermalBudget.swift` :

```swift
import CoreGraphics
import Foundation

/// **Ce que la capture a le droit de coûter, palier par palier** (#9349, spec § 5).
///
/// Dans TOUS les paliers, la photo et l'export reçoivent l'effet complet : seul
/// ce qu'on regarde se dégrade, jamais ce qui part.
nonisolated struct ComposerThermalBudget: Equatable, Sendable {
    let previewFPS: Int
    /// 0 ⇒ miniatures figées.
    let thumbnailFPS: Int
    /// 0 ⇒ miniatures coupées.
    let thumbnailCells: Int
    /// La surface de l'aperçu, en fraction de la définition de l'écran.
    let surfaceScale: CGFloat
    /// L'aperçu n'est plus que la couche système ; l'écran le dit.
    let systemLayerOnly: Bool

    static func budget(for state: ProcessInfo.ThermalState) -> ComposerThermalBudget {
        switch state {
        case .nominal:
            return ComposerThermalBudget(previewFPS: 30, thumbnailFPS: 12, thumbnailCells: 8,
                                         surfaceScale: 1, systemLayerOnly: false)
        case .fair:
            return ComposerThermalBudget(previewFPS: 24, thumbnailFPS: 6, thumbnailCells: 5,
                                         surfaceScale: 1, systemLayerOnly: false)
        case .critical:
            return ComposerThermalBudget(previewFPS: 0, thumbnailFPS: 0, thumbnailCells: 0,
                                         surfaceScale: 1, systemLayerOnly: true)
        case .serious:
            return serious
        @unknown default:
            return serious
        }
    }

    private static let serious = ComposerThermalBudget(previewFPS: 15, thumbnailFPS: 0, thumbnailCells: 5,
                                                       surfaceScale: 0.75, systemLayerOnly: false)

    /// Pendant l'enregistrement, seule la miniature choisie vit, au rythme du palier.
    func whileRecording() -> ComposerThermalBudget {
        ComposerThermalBudget(previewFPS: previewFPS, thumbnailFPS: thumbnailFPS,
                              thumbnailCells: min(1, thumbnailCells), surfaceScale: surfaceScale,
                              systemLayerOnly: systemLayerOnly)
    }
}
```

`ThermalStateMonitor.swift` — au-dessus de la classe :

```swift
/// Ce que la capture lit de la température de l'appareil (#9349).
protocol ThermalStateMonitorProviding: AnyObject {
    var currentState: ProcessInfo.ThermalState { get }
    var onStateChange: ((ProcessInfo.ThermalState) -> Void)? { get set }
    func startMonitoring()
    func stopMonitoring()
}
```

puis `final class ThermalStateMonitor: ThermalStateMonitorProviding {`, la propriété `var onStateChange: ((ProcessInfo.ThermalState) -> Void)?` sous `weak var delegate`, et dans `thermalStateChanged()` après `delegate?.thermalStateDidChange(to: newState)` : `onStateChange?(newState)`.

`ComposerCaptureSession.swift` — propriétés stockées (sous `lookDate`) :

```swift
    /// La température de l'appareil (#9349), guettée tant que le viseur vit.
    let thermal: any ThermalStateMonitorProviding
    /// Ce que l'aperçu et la bande ont le droit de coûter maintenant.
    @Published private(set) var thermalBudget = ComposerThermalBudget.budget(for: .nominal)
```

`init` — ajouter le paramètre `thermal: (any ThermalStateMonitorProviding)? = nil` (après `defaults:`) et `self.thermal = thermal ?? ThermalStateMonitor()` ; `arm(mode:)` — appeler `watchThermalState()` avant `camera.configure()` ; `disarm()` — appeler `stopWatchingThermalState()` après `camera.stop()`. Dans `ComposerViewfinder.onAppear`, après `camera.configure()` : `capture.watchThermalState()`. `thermalBudget` est `private(set)`, de portée FICHIER : son seul écrivain vit donc dans le fichier principal, et l'extension l'appelle :

```swift
    func applyThermal(_ state: ProcessInfo.ThermalState) {
        thermalBudget = ComposerThermalBudget.budget(for: state)
    }
```

`ComposerCaptureSession+Thermal.swift` :

```swift
import Foundation

/// **La capture suit la température de l'appareil** (#9349).
extension ComposerCaptureSession {

    func watchThermalState() {
        thermal.onStateChange = { [weak self] state in self?.applyThermal(state) }
        thermal.startMonitoring()
        applyThermal(thermal.currentState)
    }

    func stopWatchingThermalState() {
        thermal.onStateChange = nil
        thermal.stopMonitoring()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Composer/ComposerThermalBudget.swift $P/Composer/ComposerCaptureSession+Thermal.swift $P/Composer/ComposerCaptureSession.swift $P/Composer/ComposerViewfinder.swift $P/Services/ThermalStateMonitor.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F
git commit -m "feat(ios): la capture lit l'état thermique par protocole et en tire son budget (#9349)" -- $F
```

P1. Expected: PASS — `ComposerThermalBudgetTests` 3/3, `ThermalStateMonitorTests` vert.

- [ ] **Step 5: Commit** — fait ; P3.

---

### Task 7: Un passage par image — la couche système OU la vue Metal, qui ne dessine qu'à l'arrivée d'une trame

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerFramePacing.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCameraFeed.swift` (conformité, `setFrameHandler`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift` (source générique, cadence, échelle)
- Modify: `apps/ios/Meeshy/Features/Main/Components/CameraPreviewLayer.swift:4-50` (`mirrorsFrames`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureViews.swift` (`ComposerCapturePreview`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift:56-58` (`look.didSet` → `refreshFeed()`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift` (`refreshFeed`, `paintsWithMetal`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (1 clé)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerFramePacingTests.swift`

**Interfaces:**
- Consumes: `ComposerThermalBudget` (Tâche 6), peintre (Tâche 2).
- Produces:
  - `protocol ComposerFrameSourcing: AnyObject, Sendable { nonisolated func latestImage() -> CIImage?; nonisolated var declaredSpace: CGColorSpace? { get }; nonisolated func setFrameHandler(_ handler: (@Sendable () -> Void)?) }` ; `ComposerCameraFeed: ComposerFrameSourcing`.
  - `nonisolated struct ComposerFramePacer: Equatable, Sendable { let fps: Int; func shouldDraw(now: TimeInterval, last: TimeInterval?) -> Bool }`
  - `nonisolated enum ComposerCaptureSurfaceRule { static func paintsWithMetal(look: ComposerPhotoLook, budget: ComposerThermalBudget, fixture: Bool) -> Bool; static func showsThermalNotice(look: ComposerPhotoLook, budget: ComposerThermalBudget) -> Bool }`
  - `ComposerLiveLookSurface(look:person:date:framing:source: any ComposerFrameSourcing, fps: Int, surfaceScale: CGFloat, scenes:)`
  - `CameraPreviewLayer(session:focusPoints:mirrorsFrames:)`
  - `ComposerCaptureSession.refreshFeed()` ; `var paintsWithMetal: Bool` ; `var stripNeedsFeed: Bool` (faux jusqu'à la Tâche 13).
  - `ComposerCaptureCopy.thermalNotice: String` (clé `composer.capture.thermal.notice`).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import CoreImage
@testable import Meeshy

/// **Un passage par image, rien quand rien ne change** (#9349, spec § 5).
@MainActor
final class ComposerFramePacingTests: XCTestCase {

    func test_shouldDraw_firstFrame_isDrawn() {
        XCTAssertTrue(ComposerFramePacer(fps: 30).shouldDraw(now: 10, last: nil))
    }

    func test_shouldDraw_fasterThanTheBudget_isDropped() {
        let cadence = ComposerFramePacer(fps: 15)
        XCTAssertFalse(cadence.shouldDraw(now: 10.033, last: 10), "30 i/s offerts, 15 permis : une sur deux")
        XCTAssertTrue(cadence.shouldDraw(now: 10.066, last: 10))
    }

    func test_shouldDraw_zeroFPS_neverDraws() {
        XCTAssertFalse(ComposerFramePacer(fps: 0).shouldDraw(now: 10, last: nil))
    }

    func test_paintsWithMetal_onlyWithALook_andNeverInCriticalState() {
        let nominal = ComposerThermalBudget.budget(for: .nominal)
        let critique = ComposerThermalBudget.budget(for: .critical)
        XCTAssertFalse(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(), budget: nominal, fixture: false),
                       "sans effet : la couche système seule, aucun rendu")
        XCTAssertTrue(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(filter: .warm), budget: nominal, fixture: false))
        XCTAssertFalse(ComposerCaptureSurfaceRule.paintsWithMetal(look: ComposerPhotoLook(filter: .warm), budget: critique, fixture: false))
        XCTAssertTrue(ComposerCaptureSurfaceRule.showsThermalNotice(look: ComposerPhotoLook(filter: .warm), budget: critique))
        XCTAssertFalse(ComposerCaptureSurfaceRule.showsThermalNotice(look: ComposerPhotoLook(), budget: critique))
    }

    func test_feed_announcesEachFrameToItsHandler() {
        let flux = ComposerCameraFeed()
        let annonce = expectation(description: "trame annoncée")
        flux.setFrameHandler { annonce.fulfill() }
        flux.isActive = true
        flux.announceForTesting()
        wait(for: [annonce], timeout: 1)
    }

    func test_preview_neverStacksTheSystemLayerUnderMetal() throws {
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("mirrorsFrames: !session.paintsWithMetal"),
                      "avec effet, la couche système est détachée : un passage par image, jamais deux")
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("view.enableSetNeedsDisplay = true"), "la vue ne dessine qu'à l'arrivée d'une trame")
        XCTAssertTrue(surface.contains("view.isPaused = true"))
        XCTAssertFalse(surface.contains("CIContext("), "un seul CIContext, partagé")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerFramePacingTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — un passage par image, au rythme du palier thermique (#9349)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `cannot find 'ComposerFramePacer' in scope`.

- [ ] **Step 3: Write minimal implementation**

`ComposerFramePacing.swift` :

```swift
import CoreGraphics
import CoreImage
import Foundation

/// **Une source de trames pour le peintre** (#9349) : la caméra, la photo figée
/// ou la vidéo en boucle (#9352). Elle PRÉVIENT à chaque trame neuve : la vue
/// Metal ne dessine qu'alors, jamais sur une horloge libre.
protocol ComposerFrameSourcing: AnyObject, Sendable {
    nonisolated func latestImage() -> CIImage?
    nonisolated var declaredSpace: CGColorSpace? { get }
    nonisolated func setFrameHandler(_ handler: (@Sendable () -> Void)?)
}

/// La cadence permise : une trame qui arrive plus vite que le budget attend la suivante.
nonisolated struct ComposerFramePacer: Equatable, Sendable {
    let fps: Int

    func shouldDraw(now: TimeInterval, last: TimeInterval?) -> Bool {
        guard fps > 0 else { return false }
        guard let last else { return true }
        return now - last >= 1 / Double(fps) - 0.002
    }
}

/// **Une image par trame, jamais deux** (spec § 5) : sans effet, la couche
/// système seule ; avec effet, la vue Metal seule.
nonisolated enum ComposerCaptureSurfaceRule {
    static func paintsWithMetal(look: ComposerPhotoLook, budget: ComposerThermalBudget, fixture: Bool) -> Bool {
        guard !budget.systemLayerOnly else { return false }
        return fixture || ComposerLiveLookRule.rendersLive(look)
    }

    /// Au palier critique, un effet choisi ne se montre plus : l'écran le dit.
    static func showsThermalNotice(look: ComposerPhotoLook, budget: ComposerThermalBudget) -> Bool {
        budget.systemLayerOnly && ComposerLiveLookRule.rendersLive(look)
    }
}

/// Les mots de la capture unifiée.
enum ComposerCaptureCopy {
    static var thermalNotice: String {
        String(localized: "composer.capture.thermal.notice",
               defaultValue: "L'appareil chauffe : aperçu sans effet, la prise garde l'effet", bundle: .main)
    }
}
```

`ComposerCameraFeed.swift` — conformité (`final class ComposerCameraFeed: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, ComposerFrameSourcing, @unchecked Sendable`), propriété `private var frameHandler: (@Sendable () -> Void)?`, puis :

```swift
    func setFrameHandler(_ handler: (@Sendable () -> Void)?) {
        lock.lock()
        frameHandler = handler
        lock.unlock()
    }

    private func announce() {
        lock.lock()
        let prevenir = active ? frameHandler : nil
        lock.unlock()
        prevenir?()
    }

    #if DEBUG
    func announceForTesting() { announce() }
    #endif
```

et dans `captureOutput`, retirer `defer { lock.unlock() }`, déverrouiller explicitement après avoir posé `latest`/`space`, puis appeler `announce()` :

```swift
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock()
        guard active else {
            lock.unlock()
            return
        }
        latest = buffer
        if space == nil {
            space = CVBufferCopyAttachments(buffer, .shouldPropagate)
                .flatMap { CVImageBufferCreateColorSpaceFromAttachments($0)?.takeRetainedValue() }
        }
        lock.unlock()
        announce()
    }
```

`CameraPreviewLayer.swift` — `var mirrorsFrames = true` ; dans `makeUIView` et `updateUIView` :

```swift
        uiView.previewLayer.connection?.isEnabled = mirrorsFrames
        uiView.isHidden = !mirrorsFrames
```

(la couche reste montée : `CameraPreviewFocusPoints` y convertit toujours les touchers.)

`ComposerLiveLookSurface.swift` — la surface prend une source générique, une cadence et une échelle :

```swift
struct ComposerLiveLookSurface: UIViewRepresentable {
    let look: ComposerPhotoLook
    let person: CallFramePerson
    let date: Date
    let framing: ComposerFraming
    let source: any ComposerFrameSourcing
    var fps: Int = 30
    var surfaceScale: CGFloat = 1
    var scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared

    func makeCoordinator() -> ComposerLiveLookRenderer {
        ComposerLiveLookRenderer(source: source, scenes: scenes)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(look: look, person: person, date: date, framing: framing,
                                   pacer: ComposerFramePacer(fps: fps), surfaceScale: surfaceScale, view: view)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLiveLookRenderer) {
        coordinator.stop(view)
    }
}
```

et dans `ComposerLiveLookRenderer` : `source: any ComposerFrameSourcing` ; propriétés `private var pacer = ComposerFramePacer(fps: 30)`, `private var lastDraw: TimeInterval?`, `private weak var view: MTKView?` ; `makeView()` pose `view.enableSetNeedsDisplay = true`, `view.isPaused = true`, retient `self.view = view`, et branche la source :

```swift
        source.setFrameHandler { [weak self] in
            Task { @MainActor [weak self] in self?.frameArrived() }
        }
```

puis :

```swift
    func update(look: ComposerPhotoLook, person: CallFramePerson, date: Date, framing: ComposerFraming,
                pacer: ComposerFramePacer, surfaceScale: CGFloat, view: MTKView) {
        let changed = look != self.look || framing != self.framing
        self.look = look
        self.framing = framing
        self.pacer = pacer
        view.contentScaleFactor = max(1, view.traitCollection.displayScale * surfaceScale)
        let cle = ComposerLookSceneKey(look: look, canvas: ComposerLookPainter.canvas, date: date, person: person)
        key = cle
        if look.frame != .none {
            scenes.prepare(cle) { [weak self] in self?.view?.setNeedsDisplay() }
        }
        if changed { view.setNeedsDisplay() }
    }

    private func frameArrived() {
        let maintenant = CACurrentMediaTime()
        guard pacer.shouldDraw(now: maintenant, last: lastDraw) else { return }
        lastDraw = maintenant
        view?.setNeedsDisplay()
    }

    func stop(_ view: MTKView) {
        source.setFrameHandler(nil)
        view.isPaused = true
        view.delegate = nil
        key = nil
    }
```

(`draw(in:)` est inchangé depuis la Tâche 3 ; il lit toujours la dernière trame.)

`ComposerCaptureSession.swift` — `look.didSet { refreshFeed() }` ; `applyThermal` appelle `refreshFeed()` après avoir posé le budget. Dans `ComposerCaptureSession+Thermal.swift` :

```swift
    /// Avec effet, la vue Metal seule ; sans, la couche système seule (#9349).
    var paintsWithMetal: Bool {
        ComposerCaptureSurfaceRule.paintsWithMetal(look: look, budget: thermalBudget, fixture: false)
    }

    /// La bande ouverte peint des miniatures VIVANTES : elle aussi veut les trames (#9351).
    var stripNeedsFeed: Bool { false }

    /// Le guet des trames ne s'arme que si quelqu'un les peint.
    func refreshFeed() {
        camera.liveFeed.isActive = paintsWithMetal || stripNeedsFeed
    }
```

`ComposerCaptureViews.swift` — dans le `ZStack` de la toile (Tâche 3) :

```swift
                        CameraPreviewLayer(session: session.camera.session, focusPoints: session.focusPoints,
                                           mirrorsFrames: !session.paintsWithMetal)
                            .background(…inchangé…)
                        if session.paintsWithMetal {
                            ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                    date: session.lookDate, framing: .identity,
                                                    source: session.camera.liveFeed,
                                                    fps: session.thermalBudget.previewFPS,
                                                    surfaceScale: session.thermalBudget.surfaceScale)
                        }
                        if ComposerCaptureSurfaceRule.showsThermalNotice(look: session.look, budget: session.thermalBudget) {
                            VStack {
                                Text(ComposerCaptureCopy.thermalNotice)
                                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, MeeshySpacing.md)
                                    .padding(.vertical, MeeshySpacing.sm)
                                    .adaptiveLiquidGlass(in: Capsule())
                                    .padding(.top, MeeshySpacing.xl * 2)
                                Spacer()
                            }
                        }
```

Catalogue (clé neuve, sept langues) :

```bash
cat > /tmp/cap-9349.json <<'JSON'
{"set": {"composer.capture.thermal.notice": {
  "fr": "L'appareil chauffe : aperçu sans effet, la prise garde l'effet",
  "en": "Your device is warm: preview without effect, the capture keeps it",
  "es": "El dispositivo se calienta: vista previa sin efecto, la captura lo conserva",
  "de": "Das Gerät wird warm: Vorschau ohne Effekt, die Aufnahme behält ihn",
  "it": "Il dispositivo si scalda: anteprima senza effetto, lo scatto lo conserva",
  "pt-BR": "O aparelho está quente: prévia sem efeito, a captura o mantém",
  "ar": "الجهاز ساخن: معاينة بلا تأثير، واللقطة تحتفظ به"}}}
JSON
python3 apps/ios/scripts/catalog_keys.py apply /tmp/cap-9349.json && python3 apps/ios/scripts/check_localization.py | tail -1
```

Expected: `Localization consistency check passed.`

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Composer/ComposerFramePacing.swift $P/Composer/ComposerCameraFeed.swift $P/Composer/ComposerLiveLookSurface.swift $P/Components/CameraPreviewLayer.swift $P/Composer/ComposerCaptureViews.swift $P/Composer/ComposerCaptureSession.swift $P/Composer/ComposerCaptureSession+Thermal.swift apps/ios/Meeshy/Localizable.xcstrings apps/ios/Meeshy.xcodeproj/project.pbxproj"
cd apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh && cd ../..
git add $F
git commit -m "perf(ios): la capture peint un passage par image, à l'arrivée des trames et au rythme du palier thermique — run test (Closes #9349)" -- $F
```

P1. Expected: PASS — `ComposerFramePacingTests` 6/6, `ComposerLiveLookTests` et `ComposerCaptureLockZoomFlashTests` verts.

- [ ] **Step 5: Livrer** — P3 ; `status 9349 Done`. Commentaire de clôture : la mesure Instruments (Metal System Trace, Energy Log 5 min, Time Profiler, Allocations) reste à faire sur appareil réel — ouvrir l'issue de suivi « La capture unifiée est mesurée sur iPhone 12 : passages par image, ms GPU, palier après 5 min » (dimension 2 / 3 / 4) dans le même milestone si elle n'est pas faite au moment de la clôture.

---

## Lot 4 — #9350 : le zoom descend à ×0,5 (caméra virtuelle)

### Task 8: Le zoom raisonne en facteur AFFICHÉ, sans butée à ×1

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureHold.swift:71-103` (`ComposerCaptureZoom.range`, `showsBadge`) + nouveau type `ComposerCaptureZoomScale`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraCopy.swift:166-169` (+ `zoomPresetValue`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureZoomScaleTests.swift`
- Test (mise à jour) : `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureLockZoomFlashTests.swift:82-86`

**Interfaces:**
- Produces:
  - `nonisolated struct ComposerCaptureZoomScale: Equatable, Sendable { let base: CGFloat; static let preferredDeviceTypes: [AVCaptureDevice.DeviceType]; static func base(switchOvers: [CGFloat], hasUltraWide: Bool) -> CGFloat; func displayed(_ deviceFactor: CGFloat) -> CGFloat; func device(_ displayedFactor: CGFloat) -> CGFloat; func displayedRange(deviceMin: CGFloat, deviceMax: CGFloat) -> ClosedRange<CGFloat>; var opening: CGFloat; static func presets(in range: ClosedRange<CGFloat>) -> [CGFloat] }`
  - `ComposerCaptureZoom.range(deviceMin:deviceMax:)` SUPPRIMÉE (remplacée par `displayedRange`) ; `ComposerCaptureZoom.showsBadge(_:)` vrai dès que le facteur s'écarte de ×1 (dans les deux sens).
  - `ComposerSceneCameraCopy.zoomPresetValue(_ factor: CGFloat) -> String` (« 0,5× », « 1× », « 2× »).

- [ ] **Step 0: Ouvrir le lot** — `status 9350 "In Progress"` ; `git pull --rebase --autostash origin dev`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import AVFoundation
@testable import Meeshy

/// **Le viseur dézoome jusqu'à ×0,5** (#9350, spec § 4.5).
@MainActor
final class ComposerCaptureZoomScaleTests: XCTestCase {

    func test_base_tripleCamera_isTheFirstSwitchOver() {
        XCTAssertEqual(ComposerCaptureZoomScale.base(switchOvers: [2, 6], hasUltraWide: true), 2)
    }

    func test_base_dualWithoutUltraWide_staysOne() {
        XCTAssertEqual(ComposerCaptureZoomScale.base(switchOvers: [2], hasUltraWide: false), 1,
                       "grand-angle + téléobjectif : ×1 est le facteur 1 de l'appareil")
    }

    func test_displayedAndDevice_areInverse() {
        let echelle = ComposerCaptureZoomScale(base: 2)
        XCTAssertEqual(echelle.displayed(1), 0.5)
        XCTAssertEqual(echelle.device(1), 2)
        XCTAssertEqual(echelle.opening, 2, "le viseur s'ouvre à ×1 affiché")
    }

    func test_displayedRange_ultraWide_startsAtHalf_andIsCeilinged() {
        let plage = ComposerCaptureZoomScale(base: 2).displayedRange(deviceMin: 1, deviceMax: 123)
        XCTAssertEqual(plage.lowerBound, 0.5)
        XCTAssertEqual(plage.upperBound, ComposerCaptureZoom.ceiling)
    }

    func test_displayedRange_fixedLens_isOneToOne() {
        XCTAssertEqual(ComposerCaptureZoomScale(base: 1).displayedRange(deviceMin: 1, deviceMax: 1), 1...1)
    }

    func test_presets_ultraWide_offersHalfOneTwo() {
        XCTAssertEqual(ComposerCaptureZoomScale.presets(in: 0.5...10), [0.5, 1, 2])
    }

    func test_presets_singleLensOrFrontCamera_excludesHalf() {
        XCTAssertEqual(ComposerCaptureZoomScale.presets(in: 1...10), [1, 2])
        XCTAssertEqual(ComposerCaptureZoomScale.presets(in: 1...1), [], "sans zoom, aucun cran")
    }

    func test_showsBadge_belowOne_too() {
        XCTAssertTrue(ComposerCaptureZoom.showsBadge(0.5))
        XCTAssertFalse(ComposerCaptureZoom.showsBadge(1))
    }

    func test_preferredDeviceTypes_virtualFirst_wideLast() {
        XCTAssertEqual(ComposerCaptureZoomScale.preferredDeviceTypes,
                       [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera])
    }

    func test_zoomPresetValue_readsLikeTheSystemCamera() {
        XCTAssertTrue(ComposerSceneCameraCopy.zoomPresetValue(0.5).hasSuffix("×"))
        XCTAssertTrue(ComposerSceneCameraCopy.zoomPresetValue(1).hasPrefix("1"))
    }
}
```

Dans `ComposerCaptureLockZoomFlashTests`, remplacer `test_zoomRange_plafonneLeCapteur_etTolereUnObjectifFixe` par :

```swift
    func test_zoomRange_plafonneLeCapteur_etTolereUnObjectifFixe() {
        let echelle = ComposerCaptureZoomScale(base: 1)
        XCTAssertEqual(echelle.displayedRange(deviceMin: 1, deviceMax: 123), 1...ComposerCaptureZoom.ceiling)
        XCTAssertEqual(echelle.displayedRange(deviceMin: 1, deviceMax: 1), 1...1,
                       "sans zoom (simulateur), le geste n'a aucun effet")
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer
git add $T/ComposerCaptureZoomScaleTests.swift $T/ComposerCaptureLockZoomFlashTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — le zoom raisonne en facteur affiché, de ×0,5 au plafond (#9350)" -- $T/ComposerCaptureZoomScaleTests.swift $T/ComposerCaptureLockZoomFlashTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9350`). Expected: FAIL — `cannot find 'ComposerCaptureZoomScale' in scope`.

- [ ] **Step 3: Write minimal implementation**

`ComposerCaptureHold.swift` — ajouter `import AVFoundation` ; supprimer `static func range(deviceMin:deviceMax:)` ; remplacer `showsBadge` :

```swift
    /// Le badge ne dit rien tant que le cadrage est celui d'origine (×1).
    static func showsBadge(_ factor: CGFloat) -> Bool {
        abs(factor - 1) > 0.01
    }
```

et ajouter en fin de fichier :

```swift
/// **Le facteur qu'on LIT n'est pas celui de l'appareil** (#9350, spec § 4.5).
///
/// Une caméra virtuelle à ultra grand-angle (triple, double grand-angle) compte
/// son facteur 1 sur l'ultra grand-angle : le ×1 de l'appareil photo du système
/// est son premier basculement. On raisonne en facteur AFFICHÉ partout (geste,
/// pastille, badge) ; seul `CameraModel` convertit, à l'écriture.
nonisolated struct ComposerCaptureZoomScale: Equatable, Sendable {
    /// Le facteur de l'appareil qui s'affiche « ×1 ».
    let base: CGFloat

    /// Le premier trouvé gagne : les caméras virtuelles d'abord, l'objectif seul en dernier.
    static let preferredDeviceTypes: [AVCaptureDevice.DeviceType] = [
        .builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera,
    ]

    static func base(switchOvers: [CGFloat], hasUltraWide: Bool) -> CGFloat {
        guard hasUltraWide, let premier = switchOvers.first, premier > 0 else { return 1 }
        return premier
    }

    func displayed(_ deviceFactor: CGFloat) -> CGFloat { deviceFactor / base }

    func device(_ displayedFactor: CGFloat) -> CGFloat { displayedFactor * base }

    /// Ce que l'objectif sert, en facteur affiché, plafonné à `ComposerCaptureZoom.ceiling`.
    func displayedRange(deviceMin: CGFloat, deviceMax: CGFloat) -> ClosedRange<CGFloat> {
        let bas = deviceMin / base
        let haut = min(deviceMax / base, ComposerCaptureZoom.ceiling)
        return bas...max(bas, haut)
    }

    /// Le viseur s'ouvre à ×1 affiché.
    var opening: CGFloat { base }

    /// Les crans que la pastille offre — ceux que l'objectif sert vraiment.
    static func presets(in range: ClosedRange<CGFloat>) -> [CGFloat] {
        guard range.upperBound > range.lowerBound else { return [] }
        return [0.5, 1, 2].filter { range.contains($0) }
    }
}
```

`ComposerSceneCameraCopy.swift`, sous `zoomValue` :

```swift
    /// Un cran de la pastille, lu comme l'appareil photo : « 0,5× », « 1× », « 2× ».
    static func zoomPresetValue(_ factor: CGFloat) -> String {
        Double(factor).formatted(.number.precision(.fractionLength(0...1))) + "×"
    }
```

`grep -rn "ComposerCaptureZoom.range(" apps/ios/Meeshy apps/ios/MeeshyTests --include='*.swift'` : le seul appel restant est `CameraModel.zoomRange` — il est réécrit en Tâche 9 ; pour que ce commit compile seul, le remplacer DÈS MAINTENANT par :

```swift
        return ComposerCaptureZoomScale(base: 1).displayedRange(deviceMin: device.minAvailableVideoZoomFactor,
                                                                deviceMax: device.maxAvailableVideoZoomFactor)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Composer/ComposerCaptureHold.swift $P/Composer/ComposerSceneCameraCopy.swift $P/Components/CameraModel.swift"
git add $F
git commit -m "feat(ios): le zoom raisonne en facteur affiché, sans butée à ×1 (#9350)" -- $F
```

P1. Expected: PASS — `ComposerCaptureZoomScaleTests` 10/10, `ComposerCaptureLockZoomFlashTests` vert.

- [ ] **Step 5: Commit** — fait ; P3.

---

### Task 9: La caméra virtuelle s'ouvre à ×1 et la pastille offre ×0,5 / ×1 / ×2

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift:178-200` (`addVideoInput`), `:292-322` (`zoomRange`, `setZoom`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift` (`Capture` + `zoomPresets`, `shutterRow` côté gauche, vue `ComposerCaptureZoomPresets`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift` (`barCapture`), `ComposerCaptureViews.swift` (`onZoomPreset`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureZoomScaleTests.swift` (+1 garde)

**Interfaces:**
- Consumes: `ComposerCaptureZoomScale` (Tâche 8).
- Produces: `CameraModel.zoomScale: ComposerCaptureZoomScale { get }` ; `CameraModel.zoomFactor` publié en facteur AFFICHÉ ; `CameraModel.setZoom(_ displayed: CGFloat)` ; `nonisolated static func videoDevice(position:) -> AVCaptureDevice?` ; `nonisolated static func zoomScale(of: AVCaptureDevice) -> ComposerCaptureZoomScale` ; `ComposerSceneCameraBar.Capture.zoomPresets: [CGFloat]` ; `var onZoomPreset: (CGFloat) -> Void` ; `struct ComposerCaptureZoomPresets: View`.

- [ ] **Step 1: Write the failing test**

```swift
    func test_camera_opensTheVirtualDevice_andTheBarOffersThePresets() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("AVCaptureDevice.DiscoverySession("), "la caméra virtuelle d'abord")
        XCTAssertTrue(camera.contains("virtualDeviceSwitchOverVideoZoomFactors"))
        XCTAssertTrue(camera.contains("zoomScale.device("), "le facteur affiché se convertit à l'écriture")
        XCTAssertFalse(camera.contains("AVCaptureDevice.default(.builtInWideAngleCamera"),
                       "l'objectif grand-angle seul plafonnait le zoom à ×1")
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerCaptureZoomPresets("), "la pastille ×0,5 / ×1 / ×2")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureZoomScaleTests.swift
git add $T && git commit -m "test(ios): témoin rouge — la caméra virtuelle et la pastille de zoom (#9350)" -- $T
```

P1. Expected: FAIL — `XCTAssertTrue failed - la caméra virtuelle d'abord`.

- [ ] **Step 3: Write minimal implementation**

`CameraModel.swift` — propriété (sous `zoomFactor`) et fabriques :

```swift
    /// L'échelle entre le facteur de l'appareil et celui qu'on lit (#9350).
    private(set) var zoomScale = ComposerCaptureZoomScale(base: 1)

    /// **La caméra virtuelle d'abord** (#9350) : triple, double grand-angle,
    /// double, puis l'objectif seul — le premier que l'appareil a.
    nonisolated static func videoDevice(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let types = ComposerCaptureZoomScale.preferredDeviceTypes
        let trouves = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video,
                                                       position: position).devices
        return types.lazy.compactMap { type in trouves.first { $0.deviceType == type } }.first
    }

    nonisolated static func zoomScale(of device: AVCaptureDevice) -> ComposerCaptureZoomScale {
        ComposerCaptureZoomScale(base: ComposerCaptureZoomScale.base(
            switchOvers: device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) },
            hasUltraWide: device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }))
    }
```

`addVideoInput(position:)` — remplacer la ligne `guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, …)` par `guard let device = Self.videoDevice(position: position) else { return }` et, à la place de `zoomFactor = device.videoZoomFactor` :

```swift
        zoomScale = Self.zoomScale(of: device)
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = min(device.maxAvailableVideoZoomFactor,
                                         max(device.minAvailableVideoZoomFactor, zoomScale.opening))
            device.unlockForConfiguration()
        } catch {
            Logger.media.error("Zoom opening failed: \(error.localizedDescription, privacy: .public)")
        }
        zoomFactor = 1
```

`zoomRange` et `setZoom` :

```swift
    /// Ce que l'objectif sert, en facteur AFFICHÉ. Sans objectif (simulateur), `1...1`.
    var zoomRange: ClosedRange<CGFloat> {
        guard let device = activeVideoDevice else { return 1...1 }
        return zoomScale.displayedRange(deviceMin: device.minAvailableVideoZoomFactor,
                                        deviceMax: device.maxAvailableVideoZoomFactor)
    }

    /// `factor` est un facteur AFFICHÉ ; l'appareil reçoit sa conversion.
    func setZoom(_ factor: CGFloat) {
        let plage = zoomRange
        let borne = min(plage.upperBound, max(plage.lowerBound, factor))
        let appareil = zoomScale.device(borne)
        guard let device = activeVideoDevice, appareil != device.videoZoomFactor else { return }
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = appareil
            device.unlockForConfiguration()
            zoomFactor = borne
        } catch {
            Logger.media.error("Zoom configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }
```

`ComposerSceneCameraBar.swift` — `Capture` reçoit `var zoomPresets: [CGFloat] = []` ; la barre reçoit `var onZoomPreset: (CGFloat) -> Void = { _ in }` ; le créneau gauche de `shutterRow` devient :

```swift
            ZStack(alignment: .trailing) {
                Color.clear
                if stage == .recording {
                    ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: onZoomStep)
                        .transition(.opacity)
                } else if capture.zoomPresets.count > 1 {
                    ComposerCaptureZoomPresets(factor: capture.zoomFactor, presets: capture.zoomPresets,
                                               onSelect: onZoomPreset)
                } else if ComposerCaptureZoom.showsBadge(capture.zoomFactor) {
                    ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: onZoomStep)
                        .transition(.opacity)
                }
            }
```

et la vue, en fin de fichier :

```swift
/// **Les crans du zoom** (#9350) : ×0,5 / ×1 / ×2, ceux que l'objectif sert. Le
/// cran courant est jaune ; chacun est une cible de 44 pt, nommée à la voix.
struct ComposerCaptureZoomPresets: View {
    let factor: CGFloat
    let presets: [CGFloat]
    let onSelect: (CGFloat) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(presets, id: \.self) { cran in
                Button {
                    onSelect(cran)
                    HapticFeedback.light()
                } label: {
                    Text(ComposerSceneCameraCopy.zoomPresetValue(cran))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(abs(factor - cran) < 0.05 ? Color.yellow : .white)
                        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerSceneCameraCopy.zoomLabel)
                .accessibilityValue(ComposerSceneCameraCopy.zoomValue(cran))
                .accessibilityAddTraits(abs(factor - cran) < 0.05 ? .isSelected : [])
            }
        }
        .adaptiveLiquidGlass(in: Capsule())
    }
}
```

`ComposerCaptureSession.barCapture` — ajouter `zoomPresets: ComposerCaptureZoomScale.presets(in: camera.zoomRange)` ; `ComposerCaptureChrome` passe `onZoomPreset: { session.camera.setZoom($0) }` à la barre.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Components/CameraModel.swift $P/Composer/ComposerSceneCameraBar.swift $P/Composer/ComposerCaptureSession.swift $P/Composer/ComposerCaptureViews.swift"
git add $F
git commit -m "feat(ios): le viseur s'ouvre sur la caméra virtuelle et dézoome jusqu'à ×0,5 — run test (Closes #9350)" -- $F
```

P1. Expected: PASS. Puis P3, `status 9350 Done`. Commentaire de clôture : la vérification ×0,5 se fait sur un iPhone à ultra grand-angle (le simulateur n'a aucun objectif) — l'inscrire en « restant » si personne n'a l'appareil.

---

## Recette au simulateur — préalable du lot 5

### Task 10: Une caméra de recette au simulateur (DEBUG), pour photographier capture et édition

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/CameraModel+Fixture.swift` (tout entier entre `#if DEBUG` / `#endif`)
- Modify: `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift` (crochets `#if DEBUG` dans `configure`, `isCaptureReady`, `takePhoto`, `startRecording`, `stopRecording`, `stop` ; propriété `runsFixture`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCameraFeed.swift` (`inject`, DEBUG)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift` (`fixture: camera.runsFixture`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureFixtureTests.swift`

**Interfaces:**
- Produces: `ComposerCaptureFixture.isActive(arguments:) -> Bool` (vrai seulement au simulateur, avec `-MeeshyCaptureFixture`) ; `ComposerCaptureFixture.scene(phase:) -> CIImage` (1080×1440 debout) ; `ComposerCaptureFixture.sensorBuffer(phase:) -> CVPixelBuffer?` (1440×1080, couché) ; `ComposerCaptureFixture.photo() -> UIImage?` ; `@concurrent ComposerCaptureFixture.movie() async -> URL?` (3 s, 30 i/s, 1080×1920) ; `@MainActor final class ComposerCaptureFixtureDriver` ; `CameraModel.runsFixture: Bool` (toujours compilé, `false` hors DEBUG) ; `ComposerCameraFeed.inject(_:)` (DEBUG).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import AVFoundation
@testable import Meeshy

#if DEBUG
/// **La caméra de recette** (#9351) : le simulateur n'a pas d'objectif ; la
/// recette photographie quand même la capture, la bande et l'édition.
@MainActor
final class ComposerCaptureFixtureTests: XCTestCase {

    func test_isActive_onlyWithTheLaunchArgument() {
        XCTAssertFalse(ComposerCaptureFixture.isActive(arguments: []))
        #if targetEnvironment(simulator)
        XCTAssertTrue(ComposerCaptureFixture.isActive(arguments: ["-MeeshyCaptureFixture"]))
        #else
        XCTAssertFalse(ComposerCaptureFixture.isActive(arguments: ["-MeeshyCaptureFixture"]),
                       "jamais sur un appareil réel")
        #endif
    }

    func test_sensorBuffer_isLyingDown_andTheFeedStandsItUp() throws {
        let tampon = try XCTUnwrap(ComposerCaptureFixture.sensorBuffer(phase: 0))
        XCTAssertEqual(CVPixelBufferGetWidth(tampon), 1440)
        XCTAssertEqual(CVPixelBufferGetHeight(tampon), 1080)
        let flux = ComposerCameraFeed()
        flux.isActive = true
        flux.inject(tampon)
        let debout = try XCTUnwrap(flux.latestImage())
        XCTAssertEqual(debout.extent.width, 1080)
        XCTAssertEqual(debout.extent.height, 1440)
    }

    func test_movie_isThreeSecondsUprightNineSixteen() async throws {
        let url = try XCTUnwrap(await ComposerCaptureFixture.movie())
        let asset = AVURLAsset(url: url)
        let duree = try await asset.load(.duration).seconds
        XCTAssertEqual(duree, 3, accuracy: 0.2)
        let piste = try XCTUnwrap(try await asset.loadTracks(withMediaType: .video).first)
        let taille = try await piste.load(.naturalSize)
        XCTAssertEqual(taille, CGSize(width: 1080, height: 1920))
    }

    func test_fixtureCode_neverShipsInRelease() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let fichier = try String(contentsOf: racine.appendingPathComponent(
            "Meeshy/Features/Main/Components/CameraModel+Fixture.swift"), encoding: .utf8)
        XCTAssertTrue(fichier.hasPrefix("#if DEBUG"))
        XCTAssertTrue(fichier.trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("#endif"))
    }
}
#endif
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureFixtureTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — une caméra de recette au simulateur (#9351)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

`status 9351 "In Progress"` (le préalable sert la recette du lot 5). P1 (`LOT=9351`). Expected: FAIL — `cannot find 'ComposerCaptureFixture' in scope`.

- [ ] **Step 3: Write minimal implementation**

`CameraModel+Fixture.swift` :

```swift
#if DEBUG
import AVFoundation
import CoreImage
import UIKit

/// **Une caméra de recette au simulateur** (#9351) — `-MeeshyCaptureFixture` au
/// lancement. Le simulateur n'a pas d'objectif : sans elle, ni le viseur, ni la
/// bande, ni l'édition ne se photographient. DEBUG et simulateur seulement.
nonisolated enum ComposerCaptureFixture {
    static let argument = "-MeeshyCaptureFixture"
    static let upright = CGRect(x: 0, y: 0, width: 1080, height: 1440)

    static func isActive(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
        #if targetEnvironment(simulator)
        return arguments.contains(argument)
        #else
        return false
        #endif
    }

    /// Un ciel, un soleil qui se déplace avec `phase` (0…1), une silhouette.
    static func scene(phase: Double) -> CIImage {
        let ciel = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: 1440), "inputColor0": CIColor(red: 0.98, green: 0.62, blue: 0.35),
            "inputPoint1": CIVector(x: 0, y: 0), "inputColor1": CIColor(red: 0.20, green: 0.25, blue: 0.55),
        ])?.outputImage?.cropped(to: upright) ?? CIImage(color: .gray).cropped(to: upright)
        let soleil = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 540 + 260 * cos(phase * 2 * .pi), y: 980),
            "inputRadius0": 120, "inputRadius1": 170,
            "inputColor0": CIColor(red: 1, green: 0.95, blue: 0.7),
            "inputColor1": CIColor(red: 1, green: 0.95, blue: 0.7, alpha: 0),
        ])?.outputImage?.cropped(to: upright) ?? CIImage.empty()
        let silhouette = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 540, y: 420), "inputRadius0": 230, "inputRadius1": 236,
            "inputColor0": CIColor(red: 0.12, green: 0.10, blue: 0.16),
            "inputColor1": CIColor(red: 0, green: 0, blue: 0, alpha: 0),
        ])?.outputImage?.cropped(to: upright) ?? CIImage.empty()
        return silhouette.composited(over: soleil.composited(over: ciel))
    }

    /// La scène COUCHÉE, comme le capteur la sert : `ComposerCameraFeed` la redresse (`.right`).
    static func sensorBuffer(phase: Double) -> CVPixelBuffer? {
        let couchee = scene(phase: phase).oriented(.left)
        let image = couchee.transformed(by: CGAffineTransform(translationX: -couchee.extent.minX,
                                                              y: -couchee.extent.minY))
        return buffer(image)
    }

    static func photo() -> UIImage? {
        ComposerLookGPU.context.createCGImage(scene(phase: 0.15), from: upright).map { UIImage(cgImage: $0) }
    }

    /// Un film de 3 s, 30 i/s, 1080×1920 debout (la scène remplie dans le 9:16).
    @concurrent
    static func movie() async -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("capture-fixture.mov")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else { return nil }
        let entree = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 1080, AVVideoHeightKey: 1920,
        ])
        let adaptateur = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: entree, sourcePixelBufferAttributes: nil)
        guard writer.canAdd(entree) else { return nil }
        writer.add(entree)
        guard writer.startWriting() else { return nil }
        writer.startSession(atSourceTime: .zero)
        let toile = CGRect(x: 0, y: 0, width: 1080, height: 1920)
        for index in 0..<90 {
            while !entree.isReadyForMoreMediaData { try? await Task.sleep(nanoseconds: 2_000_000) }
            let image = ComposerLookPainter.filled(scene(phase: Double(index) / 90), framing: .identity, into: toile)
            guard let tampon = buffer(image) else { return nil }
            adaptateur.append(tampon, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: 30))
        }
        entree.markAsFinished()
        await writer.finishWriting()
        return writer.status == .completed ? url : nil
    }

    private static func buffer(_ image: CIImage) -> CVPixelBuffer? {
        var tampon: CVPixelBuffer?
        let attributs: [CFString: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey: [String: Any](),
            kCVPixelBufferMetalCompatibilityKey: true,
        ]
        guard CVPixelBufferCreate(kCFAllocatorDefault, Int(image.extent.width), Int(image.extent.height),
                                  kCVPixelFormatType_32BGRA, attributs as CFDictionary, &tampon) == kCVReturnSuccess,
              let tampon else { return nil }
        ComposerLookGPU.context.render(image, to: tampon)
        return tampon
    }
}

/// Le pilote de la caméra de recette : 30 trames par seconde dans le guetteur,
/// une photo, une copie du film à chaque prise.
@MainActor
final class ComposerCaptureFixtureDriver {
    private var timer: Timer?
    private var phase = 0.0
    private var movie: URL?

    nonisolated deinit {}

    func start(feeding feed: ComposerCameraFeed) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.tick(feed) }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func photo() -> UIImage? { ComposerCaptureFixture.photo() }

    func movieCopy() async -> URL? {
        if movie == nil { movie = await ComposerCaptureFixture.movie() }
        guard let movie else { return nil }
        let copie = FileManager.default.temporaryDirectory.appendingPathComponent("video_fixture_\(UUID().uuidString).mov")
        do {
            try FileManager.default.copyItem(at: movie, to: copie)
            return copie
        } catch {
            return nil
        }
    }

    private func tick(_ feed: ComposerCameraFeed) {
        phase = (phase + 1.0 / 240).truncatingRemainder(dividingBy: 1)
        guard let tampon = ComposerCaptureFixture.sensorBuffer(phase: phase) else { return }
        feed.inject(tampon)
    }
}

extension CameraModel {
    /// La photo de recette, publiée comme une vraie prise (aucun enregistrement en galerie).
    func deliverFixturePhoto(_ driver: ComposerCaptureFixtureDriver) {
        guard let image = driver.photo() else { return }
        capturedPhoto = image
        capturedPhotoData = image.jpegData(compressionQuality: 0.9)
        capturedPhotoId = UUID().uuidString
    }

    /// Le film de recette, publié comme un vrai segment.
    func deliverFixtureMovie(_ driver: ComposerCaptureFixtureDriver) {
        Task { @MainActor in
            guard let url = await driver.movieCopy() else { return }
            capturedVideoURL = url
            capturedVideoId = UUID().uuidString
        }
    }
}
#endif
```

`ComposerCameraFeed.swift` :

```swift
    #if DEBUG
    /// La trame de la caméra de recette (#9351), comme une trame de l'objectif arrière.
    func inject(_ buffer: CVPixelBuffer) {
        lock.lock()
        guard active else {
            lock.unlock()
            return
        }
        latest = buffer
        position = .back
        lock.unlock()
        announce()
    }
    #endif
```

`CameraModel.swift` — propriétés (sous `liveFeed`) :

```swift
    #if DEBUG
    /// La caméra de recette (#9351) — `nil` hors simulateur ou sans `-MeeshyCaptureFixture`.
    let fixture: ComposerCaptureFixtureDriver? = ComposerCaptureFixture.isActive() ? ComposerCaptureFixtureDriver() : nil
    #endif

    /// La capture tourne-t-elle sur la caméra de recette ?
    var runsFixture: Bool {
        #if DEBUG
        return fixture != nil
        #else
        return false
        #endif
    }
```

et, en TÊTE de chaque corps :
- `configure()` : `#if DEBUG` / `if let fixture { permission = .granted; fixture.start(feeding: liveFeed); return }` / `#endif`
- `isCaptureReady` : `#if DEBUG` / `if fixture != nil { return true }` / `#endif`
- `takePhoto(flash:)` : `#if DEBUG` / `if let fixture { deliverFixturePhoto(fixture); return }` / `#endif`
- `startRecording()` : `#if DEBUG` / `if fixture != nil { recordingDuration = 0; isRecordingVideo = true; recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in Task { @MainActor [weak self] in self?.recordingDuration += 0.5 } }; return }` / `#endif`
- `stopRecording()` : `#if DEBUG` / `if let fixture { isRecordingVideo = false; recordingTimer?.invalidate(); recordingTimer = nil; deliverFixtureMovie(fixture); return }` / `#endif`
- `stop()` : `#if DEBUG` / `fixture?.stop()` / `#endif`

(`permission` et `recordingTimer` sont `private` : leurs écritures restent dans `CameraModel.swift`, d'où ces crochets.)

`ComposerCaptureSession+Thermal.swift` : `paintsWithMetal` passe `fixture: camera.runsFixture`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Components/CameraModel+Fixture.swift $P/Components/CameraModel.swift $P/Composer/ComposerCameraFeed.swift $P/Composer/ComposerCaptureSession+Thermal.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F
git commit -m "test(ios): une caméra de recette au simulateur pour photographier la capture et l'édition (#9351)" -- $F
```

P1. Expected: PASS — `ComposerCaptureFixtureTests` 4/4. P3.

- [ ] **Step 5: Commit** — fait.

---

## Lot 5 — #9351 : rail Filtres/Cadres, bande de miniatures vivantes, miniature-déclencheur, sans ( o ) ni revue

### Task 11: Une table de décision dit ce que fait chaque geste, selon la zone, la phase et le verrou

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureGesture.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureGestureTests.swift`

**Interfaces:**
- Consumes: `ComposerSceneCameraStage`, `ComposerLiveLookRule.isLocked(stage:pendingSegments:)`.
- Produces:
  - `nonisolated enum ComposerCaptureZone: Equatable, Sendable { case scene, chosenThumbnail, otherThumbnail, rail }`
  - `nonisolated enum ComposerCaptureGestureKind: Equatable, Sendable { case tap, doubleTap, longPress, pinch, drag }`
  - `nonisolated enum ComposerCaptureAction: Equatable, Sendable { case none, focus, photoToEdit, photoToGallery, filmSegment, filmToGallery, stopTake, zoom, steerTake, close, select, openFamily, reframe }`
  - `nonisolated struct ComposerCaptureGestureContext: Equatable, Sendable { var stage; var editing; var holding; var locked; var pendingSegments; var allowsPhoto; var allowsVideo }`
  - `nonisolated enum ComposerCaptureGesture { static func action(zone:gesture:context:) -> ComposerCaptureAction }`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **Chaque geste a UN effet, lu dans une table** (#9351, spec § 3.1 / § 3.2 / § 7).
@MainActor
final class ComposerCaptureGestureTests: XCTestCase {

    private func action(_ zone: ComposerCaptureZone, _ geste: ComposerCaptureGestureKind,
                        _ contexte: ComposerCaptureGestureContext = ComposerCaptureGestureContext()) -> ComposerCaptureAction {
        ComposerCaptureGesture.action(zone: zone, gesture: geste, context: contexte)
    }

    func test_action_sceneArmed_tapFocuses_doubleTapEdits_longPressFilmsASegment() {
        XCTAssertEqual(action(.scene, .tap), .focus)
        XCTAssertEqual(action(.scene, .doubleTap), .photoToEdit)
        XCTAssertEqual(action(.scene, .longPress), .filmSegment)
        XCTAssertEqual(action(.scene, .pinch), .zoom)
        XCTAssertEqual(action(.scene, .drag), .close)
    }

    func test_action_chosenThumbnailArmed_doubleTapAndLongPress_goToTheGallery() {
        XCTAssertEqual(action(.chosenThumbnail, .doubleTap), .photoToGallery)
        XCTAssertEqual(action(.chosenThumbnail, .longPress), .filmToGallery)
        XCTAssertEqual(action(.otherThumbnail, .tap), .select)
        XCTAssertEqual(action(.rail, .tap), .openFamily)
    }

    func test_action_recording_dragZooms_railAndOtherThumbnailsAreInert() {
        let enCours = ComposerCaptureGestureContext(stage: .recording)
        XCTAssertEqual(action(.scene, .drag, enCours), .zoom)
        XCTAssertEqual(action(.rail, .tap, enCours), .none, "aucun effet n'est choisissable pendant l'enregistrement")
        XCTAssertEqual(action(.otherThumbnail, .tap, enCours), .none)
        XCTAssertEqual(action(.scene, .doubleTap, enCours), .none)
    }

    func test_action_lockedRecording_tapOnChosenThumbnailStops() {
        XCTAssertEqual(action(.chosenThumbnail, .tap, ComposerCaptureGestureContext(stage: .recording, locked: true)), .stopTake)
        XCTAssertEqual(action(.chosenThumbnail, .tap, ComposerCaptureGestureContext(stage: .recording, locked: false)), .none)
    }

    func test_action_holding_dragSteersTheTake() {
        XCTAssertEqual(action(.scene, .drag, ComposerCaptureGestureContext(stage: .recording, holding: true)), .steerTake)
        XCTAssertEqual(action(.chosenThumbnail, .drag, ComposerCaptureGestureContext(stage: .recording, holding: true)), .steerTake)
    }

    func test_action_pendingSegments_noPhotoNoGalleryTake_butSegmentsContinue() {
        let segments = ComposerCaptureGestureContext(pendingSegments: 2)
        XCTAssertEqual(action(.scene, .doubleTap, segments), .none, "une photo jetterait les segments en attente")
        XCTAssertEqual(action(.chosenThumbnail, .longPress, segments), .none)
        XCTAssertEqual(action(.scene, .longPress, segments), .filmSegment, "la relance des segments reste")
        XCTAssertEqual(action(.otherThumbnail, .tap, segments), .none, "le look ne change plus une fois la prise commencée")
    }

    func test_action_formatWithoutPhoto_doubleTapIsInert() {
        let videoSeule = ComposerCaptureGestureContext(allowsPhoto: false)
        XCTAssertEqual(action(.scene, .doubleTap, videoSeule), .none)
        XCTAssertEqual(action(.chosenThumbnail, .doubleTap, videoSeule), .none)
    }

    func test_action_editing_dragAndPinchReframe_thumbnailsStillSelect() {
        let edition = ComposerCaptureGestureContext(editing: true)
        XCTAssertEqual(action(.scene, .drag, edition), .reframe)
        XCTAssertEqual(action(.scene, .pinch, edition), .reframe)
        XCTAssertEqual(action(.scene, .doubleTap, edition), .none)
        XCTAssertEqual(action(.otherThumbnail, .tap, edition), .select)
        XCTAssertEqual(action(.chosenThumbnail, .longPress, edition), .none)
    }

    func test_action_viewfinderOff_doesNothing() {
        XCTAssertEqual(action(.scene, .tap, ComposerCaptureGestureContext(stage: .off)), .none)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureGestureTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la table des gestes de la capture (#9351)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9351`). Expected: FAIL — `cannot find 'ComposerCaptureGesture' in scope`.

- [ ] **Step 3: Write minimal implementation**

```swift
import Foundation

/// Où le doigt est tombé.
nonisolated enum ComposerCaptureZone: Equatable, Sendable {
    case scene
    case chosenThumbnail
    case otherThumbnail
    case rail
}

nonisolated enum ComposerCaptureGestureKind: Equatable, Sendable {
    case tap
    case doubleTap
    case longPress
    case pinch
    case drag
}

/// Ce que le geste produit — la vue l'exécute, la table le décide.
nonisolated enum ComposerCaptureAction: Equatable, Sendable {
    case none
    case focus
    case photoToEdit
    case photoToGallery
    case filmSegment
    case filmToGallery
    case stopTake
    case zoom
    /// Le doigt qui tient la prise glisse : à droite le cadenas, à la verticale le zoom.
    case steerTake
    case close
    case select
    case openFamily
    case reframe
}

nonisolated struct ComposerCaptureGestureContext: Equatable, Sendable {
    var stage: ComposerSceneCameraStage = .armed
    var editing = false
    var holding = false
    var locked = false
    var pendingSegments = 0
    var allowsPhoto = true
    var allowsVideo = true
}

/// **La table des gestes de la capture** (#9351, spec § 3) — zone × geste ×
/// phase × verrou → action. Pure : la vue ne décide rien.
nonisolated enum ComposerCaptureGesture {

    static func action(zone: ComposerCaptureZone, gesture: ComposerCaptureGestureKind,
                       context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        if context.editing { return editing(zone: zone, gesture: gesture) }
        guard context.stage != .off else { return .none }
        switch zone {
        case .scene: return scene(gesture, context)
        case .chosenThumbnail: return chosen(gesture, context)
        case .otherThumbnail: return gesture == .tap && !lookIsLocked(context) ? .select : .none
        case .rail: return gesture == .tap && !lookIsLocked(context) ? .openFamily : .none
        }
    }

    private static func lookIsLocked(_ context: ComposerCaptureGestureContext) -> Bool {
        ComposerLiveLookRule.isLocked(stage: context.stage, pendingSegments: context.pendingSegments)
    }

    /// Une prise isolée (photo, ou vidéo vers la galerie) ne part que d'un viseur
    /// armé sans segment en attente.
    private static func mayShootAlone(_ context: ComposerCaptureGestureContext) -> Bool {
        context.stage == .armed && context.pendingSegments == 0
    }

    private static func scene(_ gesture: ComposerCaptureGestureKind,
                              _ context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        switch gesture {
        case .tap: return .focus
        case .doubleTap: return mayShootAlone(context) && context.allowsPhoto ? .photoToEdit : .none
        case .longPress: return context.stage == .armed && context.allowsVideo ? .filmSegment : .none
        case .pinch: return .zoom
        case .drag:
            if context.holding { return .steerTake }
            return context.stage == .recording ? .zoom : .close
        }
    }

    private static func chosen(_ gesture: ComposerCaptureGestureKind,
                               _ context: ComposerCaptureGestureContext) -> ComposerCaptureAction {
        switch gesture {
        case .tap: return context.stage == .recording && context.locked ? .stopTake : .none
        case .doubleTap: return mayShootAlone(context) && context.allowsPhoto ? .photoToGallery : .none
        case .longPress: return mayShootAlone(context) && context.allowsVideo ? .filmToGallery : .none
        case .pinch: return .zoom
        case .drag: return context.holding ? .steerTake : .none
        }
    }

    private static func editing(zone: ComposerCaptureZone, gesture: ComposerCaptureGestureKind) -> ComposerCaptureAction {
        switch (zone, gesture) {
        case (.scene, .drag), (.scene, .pinch): return .reframe
        case (.otherThumbnail, .tap): return .select
        case (.rail, .tap): return .openFamily
        default: return .none
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
F="apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureGesture.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F && git commit -m "feat(ios): une table de décision dit l'effet de chaque geste de la capture (#9351)" -- $F
```

P1. Expected: PASS — `ComposerCaptureGestureTests` 9/9. P3.

- [ ] **Step 5: Commit** — fait.

---

### Task 12: La bande : ses familles, la combinaison filtre × cadre, et les cases qui se peignent

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStripRule.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerLookStripRuleTests.swift`

**Interfaces:**
- Consumes: `ComposerPhotoLook`, `ComposerPhotoLookRule.filters`, `ComposerLiveLookRule.chips()/frames(for:)` (Tâche 5).
- Produces:
  - `nonisolated enum ComposerLookFamily: String, CaseIterable, Hashable, Sendable { case filters, frames }`
  - `nonisolated enum ComposerLookStripItem: Hashable, Sendable { case filter(VideoFilterPreset); case frame(ComposerPhotoFrame) }`
  - `nonisolated enum ComposerLookStripRule { static let cellSize: CGSize; static let spacing: CGFloat; static var pitch: CGFloat; static func items(_ family: ComposerLookFamily) -> [ComposerLookStripItem]; static func look(of item: ComposerLookStripItem, combinedWith current: ComposerPhotoLook) -> ComposerPhotoLook; static func isChosen(_ item: ComposerLookStripItem, in look: ComposerPhotoLook) -> Bool; static func chosenIndex(in items: [ComposerLookStripItem], look: ComposerPhotoLook) -> Int?; static func visibleRange(offset: CGFloat, width: CGFloat, count: Int) -> ClosedRange<Int>?; static func paintedIndices(visible: ClosedRange<Int>?, count: Int, cells: Int, chosen: Int?, recording: Bool) -> [Int] }`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **La bande combine, et ne peint que ce qui se voit** (#9351, spec § 3.1 / § 5).
@MainActor
final class ComposerLookStripRuleTests: XCTestCase {

    func test_items_filters_startWithNone() {
        XCTAssertEqual(ComposerLookStripRule.items(.filters).first, .filter(.natural))
        XCTAssertEqual(ComposerLookStripRule.items(.filters).count, VideoFilterPreset.allCases.count)
    }

    func test_items_frames_noneThenClassicsThenCatalog_withoutDuplicates() {
        let cadres = ComposerLookStripRule.items(.frames)
        XCTAssertEqual(cadres.first, .frame(.none))
        XCTAssertTrue(cadres.contains(.frame(.montage(.classic(.polaroid)))))
        XCTAssertEqual(Set(cadres).count, cadres.count)
    }

    func test_look_choosingAFilterKeepsTheFrame_andAFrameKeepsTheFilter() {
        let courant = ComposerPhotoLook(filter: .warm, frame: .montage(.classic(.noir)))
        XCTAssertEqual(ComposerLookStripRule.look(of: .filter(.cool), combinedWith: courant),
                       ComposerPhotoLook(filter: .cool, frame: .montage(.classic(.noir))))
        XCTAssertEqual(ComposerLookStripRule.look(of: .frame(.none), combinedWith: courant),
                       ComposerPhotoLook(filter: .warm, frame: .none))
    }

    func test_isChosen_readsTheMatchingHalfOfThePair() {
        let courant = ComposerPhotoLook(filter: .vivid, frame: .montage(.classic(.film)))
        XCTAssertTrue(ComposerLookStripRule.isChosen(.filter(.vivid), in: courant))
        XCTAssertTrue(ComposerLookStripRule.isChosen(.frame(.montage(.classic(.film))), in: courant))
        XCTAssertFalse(ComposerLookStripRule.isChosen(.filter(.natural), in: courant))
    }

    func test_visibleRange_fromTheScrollOffset() {
        let pas = ComposerLookStripRule.pitch
        XCTAssertEqual(ComposerLookStripRule.visibleRange(offset: pas * 3, width: pas * 4 - 1, count: 40), 3...6)
        XCTAssertNil(ComposerLookStripRule.visibleRange(offset: 0, width: 0, count: 40))
    }

    func test_paintedIndices_visiblePlusOne_cappedByTheThermalBudget_keepingTheChosen() {
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 3...6, count: 40, cells: 8, chosen: 4, recording: false),
                       [2, 3, 4, 5, 6, 7])
        let serrees = ComposerLookStripRule.paintedIndices(visible: 3...10, count: 40, cells: 5, chosen: 2, recording: false)
        XCTAssertEqual(serrees.count, 5)
        XCTAssertTrue(serrees.contains(2), "la miniature choisie vit toujours")
    }

    func test_paintedIndices_recording_onlyTheChosen_orNothingWhenCut() {
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 0...7, count: 40, cells: 1, chosen: 5, recording: true), [5])
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 0...7, count: 40, cells: 0, chosen: 5, recording: false), [])
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerLookStripRuleTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la bande combine filtre et cadre et ne peint que ce qui se voit (#9351)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `cannot find 'ComposerLookStripRule' in scope`.

- [ ] **Step 3: Write minimal implementation**

```swift
import CoreGraphics
import Foundation

/// Les deux familles du rail (#9351).
nonisolated enum ComposerLookFamily: String, CaseIterable, Hashable, Sendable {
    case filters
    case frames
}

/// Une case de la bande : un filtre ou un cadre — jamais un look entier ; la case
/// MONTRE la paire qu'elle produirait avec l'autre moitié en cours.
nonisolated enum ComposerLookStripItem: Hashable, Sendable {
    case filter(VideoFilterPreset)
    case frame(ComposerPhotoFrame)
}

/// **Les lois de la bande** (#9351, spec § 3.1 et § 5).
nonisolated enum ComposerLookStripRule {

    static let cellSize = CGSize(width: 56, height: 100)
    static let spacing: CGFloat = 8
    static var pitch: CGFloat { cellSize.width + spacing }

    /// « Aucun » en tête, puis la famille dans son ordre.
    static func items(_ family: ComposerLookFamily) -> [ComposerLookStripItem] {
        switch family {
        case .filters:
            return ComposerPhotoLookRule.filters.map { ComposerLookStripItem.filter($0) }
        case .frames:
            let cadres = ComposerLiveLookRule.chips()
                .flatMap { ComposerLiveLookRule.frames(for: $0) }
                .filter { $0 != ComposerPhotoFrame.none }
            let uniques = cadres.reduce(into: [ComposerPhotoFrame]()) { vus, cadre in
                if !vus.contains(cadre) { vus.append(cadre) }
            }
            return [.frame(.none)] + uniques.map { ComposerLookStripItem.frame($0) }
        }
    }

    /// **Filtre et cadre se COMBINENT** : choisir l'un garde l'autre.
    static func look(of item: ComposerLookStripItem, combinedWith current: ComposerPhotoLook) -> ComposerPhotoLook {
        switch item {
        case .filter(let preset): return ComposerPhotoLook(filter: preset, frame: current.frame)
        case .frame(let cadre): return ComposerPhotoLook(filter: current.filter, frame: cadre)
        }
    }

    static func isChosen(_ item: ComposerLookStripItem, in look: ComposerPhotoLook) -> Bool {
        switch item {
        case .filter(let preset): return look.filter == preset
        case .frame(let cadre): return look.frame == cadre
        }
    }

    static func chosenIndex(in items: [ComposerLookStripItem], look: ComposerPhotoLook) -> Int? {
        items.firstIndex { isChosen($0, in: look) }
    }

    /// Les cases dont un pixel se voit, pour un défilement `offset` sur `width` points.
    static func visibleRange(offset: CGFloat, width: CGFloat, count: Int) -> ClosedRange<Int>? {
        guard width > 0, count > 0 else { return nil }
        let premiere = max(0, Int((offset / pitch).rounded(.down)))
        let derniere = min(count - 1, Int(((offset + width) / pitch).rounded(.down)))
        return premiere <= derniere ? premiere...derniere : nil
    }

    /// **Les cases peintes** : visibles ±1, au plus `cells` (palier thermique), les
    /// plus proches du centre d'abord, la choisie toujours. En enregistrement, la
    /// choisie seule.
    static func paintedIndices(visible: ClosedRange<Int>?, count: Int, cells: Int, chosen: Int?,
                               recording: Bool) -> [Int] {
        guard cells > 0, count > 0 else { return [] }
        if recording { return chosen.map { [$0] } ?? [] }
        guard let visible else { return [] }
        let bas = max(0, visible.lowerBound - 1)
        let haut = min(count - 1, visible.upperBound + 1)
        guard bas <= haut else { return [] }
        let centre = Double(visible.lowerBound + visible.upperBound) / 2
        let proches = Array((bas...haut).sorted { abs(Double($0) - centre) < abs(Double($1) - centre) }.prefix(cells))
        guard let chosen, (bas...haut).contains(chosen), !proches.contains(chosen) else { return proches.sorted() }
        return (Array(proches.dropLast()) + [chosen]).sorted()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
F="apps/ios/Meeshy/Features/Main/Composer/ComposerLookStripRule.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F && git commit -m "feat(ios): les lois de la bande — familles, combinaison filtre × cadre, cases peintes (#9351)" -- $F
```

P1. Expected: PASS — 7/7. P3.

- [ ] **Step 5: Commit** — fait.

---

### Task 13: La bande peint ses miniatures vivantes dans UN atlas Metal ; le rail l'ouvre

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStripSurface.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookStrip.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift` (stockées `openFamily` ; `stage.didSet { refreshFeed() }`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift` (`stripNeedsFeed`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (3 clés)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerLookStripTests.swift`

**Interfaces:**
- Consumes: Tâches 2, 6, 7, 11, 12.
- Produces:
  - `nonisolated struct ComposerLookStripTile: Equatable, Sendable { let index: Int; let look: ComposerPhotoLook; let rect: CGRect }` (rect en points, repère du contenu, y vers le bas)
  - `struct ComposerLookStripSurface: UIViewRepresentable` (`tiles`, `source`, `person`, `date`, `framing`, `fps`, `frozen`, `scenes`) et `final class ComposerLookStripRenderer: NSObject, MTKViewDelegate`
  - `nonisolated enum ComposerLookStripGeometry { static func pixelRect(_ tile: CGRect, contentHeight: CGFloat, scale: CGFloat) -> CGRect }`
  - `struct ComposerLookRail: View` (`open: ComposerLookFamily?`, `onSelect: (ComposerLookFamily) -> Void`)
  - `struct ComposerLookStrip: View` (`session: ComposerCaptureSession`, `source: any ComposerFrameSourcing`, `context: ComposerCaptureGestureContext`)
  - `ComposerCaptureSession.openFamily: ComposerLookFamily?` (`@Published`) ; `func toggleFamily(_:)` ; `stripNeedsFeed` vrai dès que le viseur est armé et que le budget garde au moins une case.
  - `ComposerCaptureCopy.familyName(_:)`, `ComposerCaptureCopy.itemName(_:)`, `ComposerCaptureCopy.photoToPhotos`, `ComposerCaptureCopy.filmToPhotos`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **La bande : un atlas, des cases vivantes, un rail** (#9351, spec § 3.1 / § 5).
@MainActor
final class ComposerLookStripTests: XCTestCase {

    func test_pixelRect_flipsIntoCoreImageSpace_atTheContentScale() {
        let rect = ComposerLookStripGeometry.pixelRect(CGRect(x: 64, y: 0, width: 56, height: 100),
                                                       contentHeight: 100, scale: 3)
        XCTAssertEqual(rect, CGRect(x: 192, y: 0, width: 168, height: 300))
    }

    func test_toggleFamily_opensThenCloses_andSwitches() {
        let session = ComposerCaptureSession(stage: .armed)
        session.toggleFamily(.filters)
        XCTAssertEqual(session.openFamily, .filters)
        session.toggleFamily(.frames)
        XCTAssertEqual(session.openFamily, .frames)
        session.toggleFamily(.frames)
        XCTAssertNil(session.openFamily)
    }

    func test_stripNeedsFeed_armedWithCells_offOrCriticalWithout() {
        let thermique = MockThermalStateMonitor(state: .nominal)
        let session = ComposerCaptureSession(stage: .armed, thermal: thermique)
        session.watchThermalState()
        XCTAssertTrue(session.stripNeedsFeed, "la miniature choisie est vivante dès le viseur armé")
        thermique.emit(.critical)
        XCTAssertFalse(session.stripNeedsFeed, "au palier critique, les miniatures sont coupées")
        session.disarm()
        XCTAssertFalse(session.stripNeedsFeed)
    }

    func test_strip_isOneMetalAtlas_paintedOnlyWhereVisible() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStripSurface.swift")
        XCTAssertEqual(surface.components(separatedBy: "MTKView(frame:").count - 1, 1, "UNE vue Metal pour toute la bande")
        XCTAssertTrue(surface.contains("ComposerLookPainter.paint("), "les miniatures sortent du peintre unique")
        XCTAssertTrue(surface.contains("makeBlitCommandEncoder"), "l'atlas garde les cases qui ne se repeignent pas")
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("ComposerLookStripRule.paintedIndices("), "seules les cases visibles ±1 se peignent")
        XCTAssertTrue(bande.contains("ComposerCaptureGesture.action("), "la miniature choisie obéit à la table des gestes")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerLookStripTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la bande est un atlas Metal de miniatures vivantes (#9351)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `cannot find 'ComposerLookStripGeometry' in scope`.

- [ ] **Step 3: Write minimal implementation**

3a. `ComposerCaptureSession.swift` — stockées et `didSet` :

```swift
    @Published var stage: ComposerSceneCameraStage {
        didSet { refreshFeed() }
    }
    /// La famille dont la bande est ouverte ; `nil` ⇒ la bande se replie sur la
    /// seule miniature choisie, qui sert de déclencheur (#9351).
    @Published var openFamily: ComposerLookFamily?
```

`ComposerCaptureSession+Thermal.swift` — remplacer `stripNeedsFeed` :

```swift
    /// La miniature choisie est vivante dès le viseur armé ; la bande ouverte l'est
    /// aussi — tant que le palier garde au moins une case.
    var stripNeedsFeed: Bool {
        stage != .off && thermalBudget.thumbnailCells > 0
    }

    func toggleFamily(_ family: ComposerLookFamily) {
        openFamily = openFamily == family ? nil : family
        HapticFeedback.light()
    }
```

3b. `ComposerLookStripSurface.swift` :

```swift
import CoreImage
import Metal
import MetalKit
import SwiftUI

/// Une case peinte : sa position dans le CONTENU de la bande, et le look qu'elle montre.
nonisolated struct ComposerLookStripTile: Equatable, Sendable {
    let index: Int
    let look: ComposerPhotoLook
    let rect: CGRect
}

nonisolated enum ComposerLookStripGeometry {
    /// Le rectangle d'une case (points, y vers le bas) en pixels Core Image (y vers le haut).
    static func pixelRect(_ tile: CGRect, contentHeight: CGFloat, scale: CGFloat) -> CGRect {
        CGRect(x: tile.minX * scale, y: (contentHeight - tile.maxY) * scale,
               width: tile.width * scale, height: tile.height * scale)
    }
}

/// **La bande, peinte dans UN atlas Metal** (#9351, spec § 5) : la vue est aussi
/// large que le contenu et défile avec lui (aucun redessin pendant le défilement) ;
/// seules les cases visibles ±1 se repeignent, chacune dans sa région d'un atlas
/// persistant, copié dans le drawable en un seul passage.
struct ComposerLookStripSurface: UIViewRepresentable {
    let tiles: [ComposerLookStripTile]
    let source: any ComposerFrameSourcing
    let person: CallFramePerson
    let date: Date
    let framing: ComposerFraming
    let fps: Int
    let frozen: Bool
    var scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared

    func makeCoordinator() -> ComposerLookStripRenderer {
        ComposerLookStripRenderer(scenes: scenes)
    }

    func makeUIView(context: Context) -> MTKView {
        context.coordinator.makeView()
    }

    func updateUIView(_ view: MTKView, context: Context) {
        context.coordinator.update(tiles: tiles, source: source, person: person, date: date, framing: framing,
                                   pacer: ComposerFramePacer(fps: frozen ? 0 : fps), view: view)
    }

    static func dismantleUIView(_ view: MTKView, coordinator: ComposerLookStripRenderer) {
        coordinator.stop(view)
    }
}

final class ComposerLookStripRenderer: NSObject, MTKViewDelegate {
    private let scenes: any ComposerLookSceneProviding
    private var source: (any ComposerFrameSourcing)?
    private var tiles: [ComposerLookStripTile] = []
    private var person = ComposerPhotoLookPerson.author(id: nil, displayName: nil, username: nil)
    private var date = Date(timeIntervalSince1970: 0)
    private var framing = ComposerFraming.identity
    private var pacer = ComposerFramePacer(fps: 12)
    private var lastDraw: TimeInterval?
    private var atlas: MTLTexture?
    private var reducedBuffer: CVPixelBuffer?
    private weak var view: MTKView?

    nonisolated deinit {}

    init(scenes: any ComposerLookSceneProviding) {
        self.scenes = scenes
        super.init()
    }

    func makeView() -> MTKView {
        let view = MTKView(frame: .zero, device: ComposerLookGPU.device)
        view.delegate = self
        view.framebufferOnly = false
        view.colorPixelFormat = .bgra8Unorm
        view.enableSetNeedsDisplay = true
        view.isPaused = true
        view.autoResizeDrawable = true
        view.isOpaque = false
        view.backgroundColor = .clear
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        view.isUserInteractionEnabled = false
        (view.layer as? CAMetalLayer)?.colorspace = ComposerLiveLookRule.colorSpace
        self.view = view
        return view
    }

    func update(tiles: [ComposerLookStripTile], source: any ComposerFrameSourcing, person: CallFramePerson,
                date: Date, framing: ComposerFraming, pacer: ComposerFramePacer, view: MTKView) {
        if self.source !== source {
            self.source?.setFrameHandler(nil)
            self.source = source
            source.setFrameHandler { [weak self] in
                Task { @MainActor [weak self] in self?.frameArrived() }
            }
        }
        let changed = tiles != self.tiles || framing != self.framing
        self.tiles = tiles
        self.person = person
        self.date = date
        self.framing = framing
        self.pacer = pacer
        if changed { view.setNeedsDisplay() }
    }

    func stop(_ view: MTKView) {
        source?.setFrameHandler(nil)
        source = nil
        view.delegate = nil
        atlas = nil
        reducedBuffer = nil
    }

    private func frameArrived() {
        let maintenant = CACurrentMediaTime()
        guard pacer.shouldDraw(now: maintenant, last: lastDraw) else { return }
        lastDraw = maintenant
        view?.setNeedsDisplay()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        atlas = nil
    }

    func draw(in view: MTKView) {
        guard let source, let frame = source.latestImage(),
              let queue = ComposerLookGPU.commandQueue, let drawable = view.currentDrawable,
              let buffer = queue.makeCommandBuffer(),
              let atlas = atlas(for: view.drawableSize, buffer: buffer),
              let petit = reduced(frame) else { return }
        let destination = CIRenderDestination(mtlTexture: atlas, commandBuffer: buffer)
        destination.colorSpace = ComposerLiveLookRule.colorSpace
        let toile = ComposerLookPainter.thumbnailCanvas
        let hauteur = view.bounds.height
        let echelle = view.contentScaleFactor
        tiles.forEach { tile in
            let cle = ComposerLookSceneKey(look: tile.look, canvas: toile, date: date, person: person)
            let scene = scenes.cached(cle)
            if tile.look.frame != .none, scene == nil {
                scenes.prepare(cle) { [weak self] in self?.view?.setNeedsDisplay() }
            }
            let look = tile.look.frame != .none && scene == nil ? ComposerPhotoLook(filter: tile.look.filter) : tile.look
            let peinte = ComposerLookPainter.paint(petit, look: look, framing: framing, scene: scene, canvas: toile,
                                                   declared: source.declaredSpace)
            let cible = ComposerLookStripGeometry.pixelRect(tile.rect, contentHeight: hauteur, scale: echelle)
            let posee = peinte.transformed(by: CGAffineTransform(scaleX: cible.width / toile.width,
                                                                 y: cible.height / toile.height)
                .concatenating(CGAffineTransform(translationX: cible.minX, y: cible.minY)))
            _ = try? ComposerLookGPU.context.startTask(toRender: posee, from: cible, to: destination, at: cible.origin)
        }
        guard let copie = buffer.makeBlitCommandEncoder() else { return }
        copie.copy(from: atlas, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
                   sourceSize: MTLSize(width: atlas.width, height: atlas.height, depth: 1),
                   to: drawable.texture, destinationSlice: 0, destinationLevel: 0,
                   destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
        copie.endEncoding()
        buffer.present(drawable)
        buffer.commit()
    }

    /// L'atlas persistant, à la taille du drawable ; neuf, il est vidé (les glyphes
    /// posés dessous se voient tant qu'une case n'est pas peinte).
    private func atlas(for size: CGSize, buffer: MTLCommandBuffer) -> MTLTexture? {
        if let atlas, atlas.width == Int(size.width), atlas.height == Int(size.height) { return atlas }
        guard size.width >= 1, size.height >= 1, let device = ComposerLookGPU.device else { return nil }
        let description = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: Int(size.width),
                                                                   height: Int(size.height), mipmapped: false)
        description.usage = [.shaderRead, .shaderWrite, .renderTarget]
        description.storageMode = .private
        guard let neuf = device.makeTexture(descriptor: description) else { return nil }
        let passe = MTLRenderPassDescriptor()
        passe.colorAttachments[0].texture = neuf
        passe.colorAttachments[0].loadAction = .clear
        passe.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        passe.colorAttachments[0].storeAction = .store
        buffer.makeRenderCommandEncoder(descriptor: passe)?.endEncoding()
        atlas = neuf
        return neuf
    }

    /// **La source réduite UNE fois** pour toutes les cases (spec § 5).
    private func reduced(_ frame: CIImage) -> CIImage? {
        let plusGrand = max(frame.extent.width, frame.extent.height)
        guard plusGrand > 0 else { return nil }
        let echelle = min(1, 576 / plusGrand)
        let petit = frame.transformed(by: CGAffineTransform(translationX: -frame.extent.minX, y: -frame.extent.minY)
            .concatenating(CGAffineTransform(scaleX: echelle, y: echelle)))
        let largeur = Int(petit.extent.width.rounded()), hauteur = Int(petit.extent.height.rounded())
        if reducedBuffer.map({ CVPixelBufferGetWidth($0) != largeur || CVPixelBufferGetHeight($0) != hauteur }) ?? true {
            var tampon: CVPixelBuffer?
            let attributs: [CFString: Any] = [kCVPixelBufferIOSurfacePropertiesKey: [String: Any](),
                                              kCVPixelBufferMetalCompatibilityKey: true]
            CVPixelBufferCreate(kCFAllocatorDefault, largeur, hauteur, kCVPixelFormatType_32BGRA,
                                attributs as CFDictionary, &tampon)
            reducedBuffer = tampon
        }
        guard let reducedBuffer else { return nil }
        ComposerLookGPU.context.render(petit, to: reducedBuffer)
        return CIImage(cvPixelBuffer: reducedBuffer)
    }
}
```

3c. `ComposerLookStrip.swift` — le rail, la bande, la miniature-déclencheur :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

extension ComposerCaptureCopy {
    static func familyName(_ family: ComposerLookFamily) -> String {
        switch family {
        case .filters:
            return String(localized: "call.filters", defaultValue: "Filtres", bundle: .main)
        case .frames:
            return String(localized: "composer.capture.rail.frames", defaultValue: "Cadres", bundle: .main)
        }
    }

    static func familySymbol(_ family: ComposerLookFamily) -> String {
        family == .filters ? "camera.filters" : "square.on.square"
    }

    static func itemName(_ item: ComposerLookStripItem) -> String {
        switch item {
        case .filter(.natural):
            return String(localized: "composer.capture.band.noFilter", defaultValue: "Aucun filtre", bundle: .main)
        case .filter(let preset):
            return CallEffectsCopy.presetName(preset)
        case .frame(.none):
            return CallLiveFrameCopy.none
        case .frame(.montage(let choice)):
            return CallFrameCopy.choiceName(choice)
        }
    }

    static func itemSymbol(_ item: ComposerLookStripItem) -> String {
        switch item {
        case .filter(let preset): return CallEffectsCopy.presetSymbol(preset)
        case .frame(.none): return "circle.slash"
        case .frame(.montage(let choice)): return CallFrameCopy.choiceSymbol(choice)
        }
    }

    static var photoToPhotos: String {
        String(localized: "composer.capture.chosen.photoToPhotos", defaultValue: "Photo dans Photos", bundle: .main)
    }

    static var filmToPhotos: String {
        String(localized: "composer.capture.chosen.filmToPhotos", defaultValue: "Vidéo dans Photos", bundle: .main)
    }
}

/// **Le rail vertical, en bas à gauche** (#9351) : Filtres, Cadres. Toucher une
/// famille ouvre sa bande ; la retoucher la replie.
struct ComposerLookRail: View {
    let open: ComposerLookFamily?
    let onSelect: (ComposerLookFamily) -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(ComposerLookFamily.allCases, id: \.self) { famille in
                Button { onSelect(famille) } label: {
                    VStack(spacing: MeeshySpacing.xxs) {
                        Image(systemName: ComposerCaptureCopy.familySymbol(famille))
                            .font(MeeshyFont.relative(17, weight: .semibold))
                        Text(ComposerCaptureCopy.familyName(famille))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(open == famille ? Color.yellow : .white)
                    .frame(minWidth: 52, minHeight: 52)
                    .adaptiveLiquidGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous),
                                         interactive: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerCaptureCopy.familyName(famille))
                .accessibilityAddTraits(open == famille ? .isSelected : [])
            }
        }
    }
}

/// **La bande — et, repliée, la miniature-déclencheur** (#9351, spec § 3.1 / § 3.2).
///
/// Une seule vue : ouverte, toutes les cases de la famille, la choisie encadrée ;
/// repliée ou en enregistrement, la seule miniature choisie (la paire complète),
/// qui continue d'afficher le direct. Les gestes passent par la table.
struct ComposerLookStrip: View {
    @ObservedObject var session: ComposerCaptureSession
    let source: any ComposerFrameSourcing
    let context: ComposerCaptureGestureContext
    let recordingTime: TimeInterval

    @State private var offset: CGFloat = 0
    @State private var width: CGFloat = 0
    @State private var scrolling = false
    @State private var scrollSettle: Task<Void, Never>?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var items: [ComposerLookStripItem] {
        guard context.stage != .recording, let famille = session.openFamily else { return [] }
        return ComposerLookStripRule.items(famille)
    }

    var body: some View {
        Group {
            if items.isEmpty {
                chosenAlone
            } else {
                band
            }
        }
        .frame(height: ComposerLookStripRule.cellSize.height + 22)
    }

    // MARK: - Repliée : la miniature choisie, seule

    private var chosenAlone: some View {
        let cellule = ComposerLookStripRule.cellSize
        let tuile = ComposerLookStripTile(index: 0, look: session.look, rect: CGRect(origin: .zero, size: cellule))
        let peintes = context.stage == .recording
            ? (session.thermalBudget.whileRecording().thumbnailCells > 0 ? [tuile] : [])
            : (session.thermalBudget.thumbnailCells > 0 ? [tuile] : [])
        return ZStack {
            glyph(symbol: "camera.aperture")
            ComposerLookStripSurface(tiles: peintes, source: source, person: session.lookPerson,
                                     date: session.lookDate, framing: session.framing,
                                     fps: session.thermalBudget.thumbnailFPS, frozen: false)
            chosenOverlay
        }
        .frame(width: cellule.width, height: cellule.height)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .strokeBorder(Color.white, lineWidth: 3))
        .contentShape(Rectangle())
        .gesture(chosenGestures)
        .accessibilityElement()
        .accessibilityLabel(context.stage == .recording
            ? ComposerSceneCameraCopy.shutterLabel(mode: .video, stage: .recording)
            : ComposerCaptureCopy.photoToPhotos)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: Text(ComposerCaptureCopy.photoToPhotos)) { perform(.chosenThumbnail, .doubleTap) }
        .accessibilityAction(named: Text(ComposerCaptureCopy.filmToPhotos)) { voiceOverFilm() }
    }

    /// Le point rouge clignotant et le chronomètre, DÈS le premier segment.
    @ViewBuilder
    private var chosenOverlay: some View {
        if context.stage == .recording || !session.segments.isEmpty {
            VStack {
                HStack(spacing: MeeshySpacing.xxs) {
                    Circle().fill(MeeshyColors.error).frame(width: 7, height: 7)
                        .opacity(reduceMotion || context.stage != .recording ? 1 : blink)
                    Text(ComposerCaptureSegments.elapsed(segments: session.segments, live: recordingTime,
                                                         recording: context.stage == .recording)
                        .formatted(.number.precision(.fractionLength(0))) + "″")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, MeeshySpacing.xs)
                .background(Capsule().fill(.black.opacity(0.45)))
                .padding(.top, MeeshySpacing.xxs)
                Spacer()
            }
            .accessibilityHidden(true)
        }
    }

    @State private var blink: Double = 1

    // MARK: - Ouverte : toute la famille

    private var band: some View {
        let cellule = ComposerLookStripRule.cellSize
        let pas = ComposerLookStripRule.pitch
        let choisie = ComposerLookStripRule.chosenIndex(in: items, look: session.look)
        let visibles = ComposerLookStripRule.visibleRange(offset: offset, width: width, count: items.count)
        let peintes = ComposerLookStripRule.paintedIndices(visible: visibles, count: items.count,
                                                           cells: session.thermalBudget.thumbnailCells,
                                                           chosen: choisie, recording: false)
        let tuiles = peintes.map { index in
            ComposerLookStripTile(index: index,
                                  look: ComposerLookStripRule.look(of: items[index], combinedWith: session.look),
                                  rect: CGRect(x: CGFloat(index) * pas, y: 0, width: cellule.width, height: cellule.height))
        }
        let largeur = CGFloat(items.count) * pas - ComposerLookStripRule.spacing
        return GeometryReader { conteneur in
            ScrollViewReader { lecteur in
                ScrollView(.horizontal, showsIndicators: false) {
                    ZStack(alignment: .topLeading) {
                        HStack(spacing: ComposerLookStripRule.spacing) {
                            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                                glyph(symbol: ComposerCaptureCopy.itemSymbol(item))
                                    .frame(width: cellule.width, height: cellule.height)
                            }
                        }
                        ComposerLookStripSurface(tiles: tuiles, source: source, person: session.lookPerson,
                                                 date: session.lookDate, framing: session.framing,
                                                 fps: session.thermalBudget.thumbnailFPS, frozen: scrolling)
                            .frame(width: largeur, height: cellule.height)
                        HStack(spacing: ComposerLookStripRule.spacing) {
                            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                                cell(item: item, chosen: index == choisie)
                                    .id(index)
                            }
                        }
                    }
                    .padding(.horizontal, max(0, (conteneur.size.width - cellule.width) / 2))
                    .background(GeometryReader { contenu in
                        Color.clear.adaptiveOnChange(of: contenu.frame(in: .named("bande")).minX, initial: true) { _, x in
                            followScroll(x: x, inset: max(0, (conteneur.size.width - cellule.width) / 2))
                        }
                    })
                }
                .coordinateSpace(name: "bande")
                .onAppear {
                    width = conteneur.size.width
                    if let choisie { lecteur.scrollTo(choisie, anchor: .center) }
                }
            }
        }
    }

    private func cell(item: ComposerLookStripItem, chosen: Bool) -> some View {
        let cellule = ComposerLookStripRule.cellSize
        return VStack(spacing: MeeshySpacing.xxs) {
            RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                .strokeBorder(chosen ? Color.white : Color.white.opacity(0.25), lineWidth: chosen ? 3 : 1)
                .frame(width: cellule.width, height: cellule.height)
                .contentShape(Rectangle())
                .gesture(chosen ? AnyGesture(chosenGestures.map { _ in () }) : AnyGesture(TapGesture().onEnded {
                    perform(.otherThumbnail, .tap, item: item)
                }))
            Text(ComposerCaptureCopy.itemName(item))
                .font(MeeshyFont.relative(10, weight: chosen ? .bold : .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
                .frame(width: cellule.width + ComposerLookStripRule.spacing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ComposerCaptureCopy.itemName(item))
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { perform(.otherThumbnail, .tap, item: item) }
    }

    private func glyph(symbol: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .fill(Color.white.opacity(0.12))
            .overlay(Image(systemName: symbol).foregroundStyle(.white.opacity(0.7)))
            .accessibilityHidden(true)
    }

    // MARK: - Les gestes de la miniature choisie

    /// Appui long (puis glissé : cadenas à droite, zoom à la verticale), double
    /// toucher, toucher — chacun lu dans la table.
    private var chosenGestures: some Gesture {
        LongPressGesture(minimumDuration: ComposerSceneQuickCapture.armedHoldDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { valeur in
                guard case .second(true, let glisse) = valeur else { return }
                if session.holdStartedAt == nil {
                    perform(.chosenThumbnail, .longPress)
                } else if let glisse {
                    session.holdChanged(CGPoint(x: glisse.translation.width, y: glisse.translation.height))
                }
            }
            .onEnded { _ in session.endHold() }
            .exclusively(before: TapGesture(count: 2).onEnded { perform(.chosenThumbnail, .doubleTap) }
                .exclusively(before: TapGesture().onEnded { perform(.chosenThumbnail, .tap) }))
    }

    private func perform(_ zone: ComposerCaptureZone, _ geste: ComposerCaptureGestureKind,
                         item: ComposerLookStripItem? = nil) {
        session.perform(ComposerCaptureGesture.action(zone: zone, gesture: geste, context: context), item: item)
    }

    /// VoiceOver ne TIENT pas un doigt : l'action filme verrouillé, et le second
    /// déclenchement arrête.
    private func voiceOverFilm() {
        if context.stage == .recording {
            session.perform(.stopTake, item: nil)
            return
        }
        session.perform(ComposerCaptureGesture.action(zone: .chosenThumbnail, gesture: .longPress, context: context),
                        item: nil)
        session.lockTake()
    }

    private func followScroll(x: CGFloat, inset: CGFloat) {
        offset = max(0, inset - x)
        scrolling = true
        scrollSettle?.cancel()
        scrollSettle = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            scrolling = false
        }
    }
}
```

(`session.perform(_:item:)`, `session.framing` et `ComposerCaptureSegments.elapsed(segments:live:)` : `perform` arrive en Tâche 14, `framing` en Tâche 16 — pour que CE commit compile, ajouter dès maintenant à `ComposerCaptureSession.swift` la stockée `@Published var framing = ComposerFraming.identity` et, dans `ComposerCaptureSession+Thermal.swift`, un `perform` minimal qui ne connaît que `.select` : `func perform(_ action: ComposerCaptureAction, item: ComposerLookStripItem?) { guard action == .select, let item else { return }; look = ComposerLookStripRule.look(of: item, combinedWith: look) }` — la Tâche 14 le remplace par le dispatcher complet. `ComposerCaptureSegments.elapsed(segments:live:recording:)` est la loi existante du chrono : elle n'ajoute l'horloge vivante qu'en enregistrement. Le battement de `blink` s'anime dans `.onAppear` de `chosenOverlay` par `withAnimation(.easeInOut(duration: 0.6).repeatForever()) { blink = 0.25 }`, coupé sous Reduce Motion.)

3d. Catalogue :

```bash
cat > /tmp/cap-9351a.json <<'JSON'
{"set": {
 "composer.capture.rail.frames": {"fr": "Cadres", "en": "Frames", "es": "Marcos", "de": "Rahmen", "it": "Cornici", "pt-BR": "Molduras", "ar": "الإطارات"},
 "composer.capture.band.noFilter": {"fr": "Aucun filtre", "en": "No filter", "es": "Sin filtro", "de": "Kein Filter", "it": "Nessun filtro", "pt-BR": "Sem filtro", "ar": "بلا مرشّح"},
 "composer.capture.chosen.photoToPhotos": {"fr": "Photo dans Photos", "en": "Photo to Photos", "es": "Foto a Fotos", "de": "Foto in Fotos", "it": "Foto in Foto", "pt-BR": "Foto no Fotos", "ar": "صورة إلى الصور"},
 "composer.capture.chosen.filmToPhotos": {"fr": "Vidéo dans Photos", "en": "Video to Photos", "es": "Vídeo a Fotos", "de": "Video in Fotos", "it": "Video in Foto", "pt-BR": "Vídeo no Fotos", "ar": "فيديو إلى الصور"}
}}
JSON
python3 apps/ios/scripts/catalog_keys.py apply /tmp/cap-9351a.json && python3 apps/ios/scripts/check_localization.py | tail -1
```

Expected: `Localization consistency check passed.`

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
F="$P/ComposerLookStripSurface.swift $P/ComposerLookStrip.swift $P/ComposerCaptureSession.swift $P/ComposerCaptureSession+Thermal.swift apps/ios/Meeshy/Localizable.xcstrings apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F
git commit -m "feat(ios): la bande peint ses miniatures vivantes dans un atlas Metal, le rail l'ouvre (#9351)" -- $F
```

P1. Expected: PASS — `ComposerLookStripTests` 4/4.

- [ ] **Step 5: Commit** — fait ; P3.

---

### Task 14: Les intentions de prise — la scène vers l'édition, la miniature choisie vers la galerie (brut + rendu)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerGallery.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift` (stockées : `photoIntent`, `filmIntent`, `onDeliver`, `gallery`, `scenes`, `takeSubscriptions`, `pendingGallerySaves` ; `init` ; `beginGallerySave`/`endGallerySave`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift` (retirer le `perform` provisoire)
- Modify: `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift:555-571` (`saveToPhotoLibrary` → `reportPhotoLibraryRefusal`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerViewfinder.swift:138-152` (retrait des deux `onReceive`, `capture.onDeliver`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift:642-656` (retrait des deux `onReceive` — lignes en MOINS seulement)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift` (`sceneCapture.onDeliver` posé dans `sceneCameraChrome`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (1 clé)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureTakesTests.swift`
- Test (mise à jour) : `apps/ios/MeeshyTests/Unit/Composer/ComposerSceneCameraMountingTests.swift:238,275`

**Interfaces:**
- Consumes: Tâches 2, 3, 11, 12.
- Produces:
  - `protocol ComposerGalleryProviding: AnyObject, Sendable { func saveImage(_ image: UIImage) async -> Bool; func saveVideo(at url: URL) async -> Bool }` ; `nonisolated final class ComposerGallery: ComposerGalleryProviding` (`static let shared`).
  - `nonisolated enum ComposerTakeIntent: Equatable, Sendable { case edit, gallery }`
  - `ComposerCaptureSession.init(stage:mode:camera:defaults:thermal:gallery: any ComposerGalleryProviding = ComposerGallery.shared, scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared)`
  - `var onDeliver: (@MainActor (CameraResult) -> Void)?` ; `@Published private(set) var pendingGallerySaves: Int`
  - `func perform(_ action: ComposerCaptureAction, item: ComposerLookStripItem?)` ; `func shootPhoto(intent:)` ; `func photoArrived()` ; `func videoArrived()` ; `func saveRenderedPhoto(_:)` ; `func saveRenderedVideo(_:)`
  - `CameraModel.reportPhotoLibraryRefusal() async` (nonisolated static)
  - `ComposerCaptureCopy.savedToPhotos`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **Deux intentions de prise** (#9351, spec § 3.1 / § 3.4) : la scène mène à
/// l'édition (puis à l'hôte), la miniature choisie part en galerie, brut ET rendu,
/// sans changer de phase ni retenir de segment.
@MainActor
final class ComposerCaptureTakesTests: XCTestCase {

    func test_photoArrived_galleryIntent_savesTheRendered_andDeliversNothing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        session.photoIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(galerie.saveImageCount, 1, "le RENDU part en galerie (le brut y est déjà, par CameraModel)")
        XCTAssertEqual(remis, 0, "on reste en capture")
        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.photoIntent, .edit, "l'intention ne vaut que pour UNE prise")
    }

    func test_saveRenderedPhoto_galleryRefuses_staysCapturingAndClearsRendering() async {
        let galerie = MockComposerGallery(imageResult: false)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.photoIntent = .gallery
        Self.publishPhoto(on: session)
        await Self.waitUntil { galerie.saveImageCount == 1 && session.pendingGallerySaves == 0 }
        XCTAssertEqual(session.stage, .armed)
        XCTAssertEqual(session.pendingGallerySaves, 0)
        XCTAssertFalse(session.isRenderingLook)
    }

    func test_videoArrived_galleryIntent_keepsNoSegment() async throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.look = ComposerPhotoLook(filter: .warm)
        session.filmIntent = .gallery
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = UUID().uuidString
        await Self.waitUntil { session.pendingGallerySaves == 0 }
        XCTAssertTrue(session.segments.isEmpty, "une vidéo vers la galerie n'est jamais un segment")
        XCTAssertEqual(session.filmIntent, .edit)
    }

    func test_videoArrived_editIntent_isASegment() throws {
        let session = ComposerCaptureSession(stage: .armed)
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = UUID().uuidString
        XCTAssertEqual(session.segments.map(\.url), [url])
    }

    func test_videoArrived_afterDisarm_discardsFileAndKeepsNoSegment() throws {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        session.filmIntent = .gallery
        session.disarm()
        let url = try Self.tempFile()
        session.camera.capturedVideoURL = url
        session.camera.capturedVideoId = UUID().uuidString
        XCTAssertTrue(session.segments.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path), "le brut est déjà en galerie : le fichier temporaire part")
        XCTAssertEqual(galerie.saveVideoCount, 0)
    }

    func test_perform_select_combinesWithTheCurrentLook() {
        let session = ComposerCaptureSession(stage: .armed)
        session.look = ComposerPhotoLook(filter: .vivid)
        session.perform(.select, item: .frame(.montage(.classic(.polaroid))))
        XCTAssertEqual(session.look, ComposerPhotoLook(filter: .vivid, frame: .montage(.classic(.polaroid))))
    }

    func test_hostsNoLongerObserveTheCamera_theSessionDoes() throws {
        for fichier in ["ComposerViewfinder.swift", "MeeshyComposerHost+Surfaces.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains("$capturedPhotoId"), "\(fichier) : la session reçoit les prises, une fois")
            XCTAssertFalse(code.contains("$capturedVideoId"), "\(fichier)")
        }
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(prises.contains("camera.$capturedPhotoId"))
        XCTAssertTrue(prises.contains("camera.$capturedVideoId"))
    }

    // MARK: - Outils

    static func publishPhoto(on session: ComposerCaptureSession) {
        let contexte = CGContext(data: nil, width: 30, height: 40, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.4, green: 0.6, blue: 0.2, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 30, height: 40))
        session.camera.capturedPhoto = UIImage(cgImage: contexte.makeImage()!)
        session.camera.capturedPhotoId = UUID().uuidString
    }

    static func tempFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("prise_\(UUID().uuidString).mov")
        try Data([0, 1, 2]).write(to: url)
        return url
    }

    static func waitUntil(timeout: TimeInterval = 10, _ condition: @MainActor () -> Bool) async {
        let limite = Date().addingTimeInterval(timeout)
        while !condition(), Date() < limite {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}

final class MockComposerGallery: ComposerGalleryProviding, @unchecked Sendable {
    private let imageResult: Bool
    private let videoResult: Bool
    private(set) var saveImageCount = 0
    private(set) var saveVideoCount = 0

    nonisolated deinit {}

    init(imageResult: Bool = true, videoResult: Bool = true) {
        self.imageResult = imageResult
        self.videoResult = videoResult
    }

    func saveImage(_ image: UIImage) async -> Bool {
        saveImageCount += 1
        return imageResult
    }

    func saveVideo(at url: URL) async -> Bool {
        saveVideoCount += 1
        return videoResult
    }
}
```

Dans `ComposerSceneCameraMountingTests`, supprimer les deux assertions sur `onReceive(sceneCamera.$capturedPhotoId)` et `sceneCapture.lookedPhoto(…)` (lignes ~238 et ~275) : la garde `test_hostsNoLongerObserveTheCamera_theSessionDoes` les remplace.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer
git add $T/ComposerCaptureTakesTests.swift $T/ComposerSceneCameraMountingTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la scène mène à l'édition, la miniature choisie à la galerie (#9351)" -- $T/ComposerCaptureTakesTests.swift $T/ComposerSceneCameraMountingTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `cannot find type 'ComposerGalleryProviding' in scope`.

- [ ] **Step 3: Write minimal implementation**

3a. `CameraModel.swift` — extraire le toast de refus :

```swift
    nonisolated static func saveToPhotoLibrary(_ save: () async -> Bool) async {
        guard await save() == false else { return }
        await reportPhotoLibraryRefusal()
    }

    /// Le refus d'enregistrer dans Photos se DIT (réglages si l'accès est refusé).
    nonisolated static func reportPhotoLibraryRefusal() async {
        let state = PhotoLibraryManager.shared.authorizationState
        await MainActor.run {
            guard state.needsSettingsRedirect else {
                FeedbackToastManager.shared.showError(
                    String(localized: "camera.save.failed",
                           defaultValue: "Impossible d'enregistrer dans Photos", bundle: .main)
                )
                return
            }
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .photoLibraryAdd)
            ) { MediaPermissionCoordinator.openSettings() }
        }
    }
```

3b. `ComposerGallery.swift` :

```swift
import MeeshySDK
import UIKit

/// Ce que la capture enregistre en galerie : le RENDU (le brut y part déjà,
/// à la prise, par `CameraModel`).
protocol ComposerGalleryProviding: AnyObject, Sendable {
    func saveImage(_ image: UIImage) async -> Bool
    func saveVideo(at url: URL) async -> Bool
}

/// **La galerie de la capture** (#9351, spec § 3.4) — l'album Meeshy, et un refus
/// qui se dit.
nonisolated final class ComposerGallery: ComposerGalleryProviding, @unchecked Sendable {
    static let shared = ComposerGallery()

    nonisolated deinit {}

    func saveImage(_ image: UIImage) async -> Bool {
        let enregistre = await PhotoLibraryManager.shared.saveImage(image)
        if !enregistre { await CameraModel.reportPhotoLibraryRefusal() }
        return enregistre
    }

    func saveVideo(at url: URL) async -> Bool {
        let enregistre = await PhotoLibraryManager.shared.saveVideo(at: url)
        if !enregistre { await CameraModel.reportPhotoLibraryRefusal() }
        return enregistre
    }
}
```

3c. `ComposerCaptureSession.swift` — stockées (sous `thermalBudget`) :

```swift
    /// Où part la prochaine photo, la prochaine vidéo (#9351).
    var photoIntent = ComposerTakeIntent.edit
    var filmIntent = ComposerTakeIntent.edit
    /// Qui reçoit la prise finie — posé par l'hôte qui monte la capture.
    var onDeliver: (@MainActor (CameraResult) -> Void)?
    let gallery: any ComposerGalleryProviding
    let scenes: any ComposerLookSceneProviding
    var takeSubscriptions = Set<AnyCancellable>()
    /// Les rendus qui partent en galerie pendant qu'on reste en capture.
    @Published private(set) var pendingGallerySaves = 0

    func beginGallerySave() { pendingGallerySaves += 1 }
    func endGallerySave() { pendingGallerySaves = max(0, pendingGallerySaves - 1) }
```

`init` : paramètres `gallery: any ComposerGalleryProviding = ComposerGallery.shared, scenes: any ComposerLookSceneProviding = ComposerLookSceneCache.shared` ; affectations ; puis, après `relais = …`, `subscribeToTakes()`. Dans `disarm()`, ajouter `photoIntent = .edit` (l'intention vidéo reste : une vidéo vers la galerie déjà partie se jette, voir `videoArrived`).

3d. `ComposerCaptureSession+Takes.swift` :

```swift
import Combine
import MeeshySDK
import UIKit

/// Où part une prise (#9351).
nonisolated enum ComposerTakeIntent: Equatable, Sendable {
    /// La scène : la prise mène à l'édition (puis à l'hôte).
    case edit
    /// La miniature choisie : le RENDU part en galerie, on reste en capture.
    case gallery
}

extension ComposerCaptureCopy {
    static var savedToPhotos: String {
        String(localized: "composer.capture.savedToPhotos", defaultValue: "Enregistré dans Photos", bundle: .main)
    }
}

/// **Les prises arrivent à la session, une fois** (#9351) — plus aux hôtes.
extension ComposerCaptureSession {

    func subscribeToTakes() {
        camera.$capturedPhotoId.compactMap { $0 }
            .sink { [weak self] _ in self?.photoArrived() }
            .store(in: &takeSubscriptions)
        camera.$capturedVideoId.compactMap { $0 }
            .sink { [weak self] _ in self?.videoArrived() }
            .store(in: &takeSubscriptions)
    }

    /// **Le geste décidé par la table, exécuté.** Mise au point, zoom, rangement et
    /// cadrage ont besoin d'une géométrie : la vue les fait elle-même.
    func perform(_ action: ComposerCaptureAction, item: ComposerLookStripItem?) {
        switch action {
        case .photoToEdit:
            shootPhoto(intent: .edit)
        case .photoToGallery:
            shootPhoto(intent: .gallery)
        case .filmSegment:
            filmIntent = .edit
            beginHold()
        case .filmToGallery:
            filmIntent = .gallery
            beginHold()
        case .stopTake:
            closeTake()
        case .select:
            guard let item else { return }
            look = ComposerLookStripRule.look(of: item, combinedWith: look)
            HapticFeedback.light()
        case .none, .focus, .zoom, .steerTake, .close, .openFamily, .reframe:
            return
        }
    }

    func shootPhoto(intent: ComposerTakeIntent) {
        photoIntent = intent
        photographWhenReady()
    }

    func photoArrived() {
        guard stage != .off, let image = camera.capturedPhoto else { return }
        let intent = photoIntent
        photoIntent = .edit
        switch intent {
        case .gallery:
            saveRenderedPhoto(image)
        case .edit:
            lookedPhoto(image, data: camera.capturedPhotoData) { [weak self] resultat in
                self?.onDeliver?(resultat)
            }
        }
    }

    /// Une vidéo arrivée APRÈS la fermeture ne devient rien : son brut est déjà en
    /// galerie, son fichier temporaire part.
    func videoArrived() {
        guard let url = camera.capturedVideoURL else { return }
        let intent = filmIntent
        filmIntent = .edit
        guard stage != .off else {
            FileManager.default.removeItemLogging(at: url, context: "prise arrivée après la fermeture du viseur",
                                                  logger: .media)
            return
        }
        switch intent {
        case .gallery: saveRenderedVideo(url)
        case .edit: collectSegment(url)
        }
    }

    func saveRenderedPhoto(_ image: UIImage) {
        guard let debout = ComposerPhotoLookSource.upright(image) else { return }
        let regard = look
        let auteur = lookPerson
        let date = lookDate
        let cache = scenes
        let galerie = gallery
        beginGallerySave()
        Task { @MainActor in
            defer { endGallerySave() }
            guard let rendu = await ComposerLookPainter.renderPhoto(debout, look: regard, framing: .identity,
                                                                    person: auteur, date: date, scenes: cache) else { return }
            guard await galerie.saveImage(UIImage(cgImage: rendu)) else { return }
            FeedbackToastManager.shared.showSuccess(ComposerCaptureCopy.savedToPhotos)
        }
    }

    /// Le RENDU de la vidéo part en galerie ; une vidéo sans effet est déjà le brut
    /// (enregistré par `CameraModel`) — rien de plus ne part.
    func saveRenderedVideo(_ url: URL) {
        let regard = look
        let auteur = lookPerson
        let date = lookDate
        let galerie = gallery
        let espace = camera.liveFeed.declaredSpace?.name as String?
        beginGallerySave()
        Task { @MainActor in
            defer { endGallerySave() }
            guard let rendue = await ComposerLookVideoExporter.export(url, look: regard, person: auteur, date: date,
                                                                      declaredSpaceName: espace),
                  rendue != url else { return }
            if await galerie.saveVideo(at: rendue) {
                FeedbackToastManager.shared.showSuccess(ComposerCaptureCopy.savedToPhotos)
            }
            FileManager.default.removeItemLogging(at: rendue, context: "rendu enregistré en galerie", logger: .media)
            FileManager.default.removeItemLogging(at: url, context: "brut déjà en galerie", logger: .media)
        }
    }
}
```

Retirer le `perform` provisoire de `ComposerCaptureSession+Thermal.swift`.

3e. Hôtes : dans `ComposerViewfinder.swift`, supprimer les deux `.onReceive(camera.$capturedPhotoId)` / `.onReceive(camera.$capturedVideoId)` et ajouter dans `.onAppear` : `capture.onDeliver = { deliver($0) }` (la revue reste branchée jusqu'à la Tâche 15 : pour que la photo d'une porte qui revoyait passe encore par la revue, `onDeliver` pose `pendingPhoto` quand `reviewsPhoto` est vrai :

```swift
            capture.onDeliver = { resultat in
                guard reviewsPhoto, case .photo(let image, let data) = resultat else { return deliver(resultat) }
                pendingPhoto = ComposerPendingPhoto(id: UUID().uuidString, image: image, data: data, look: capture.look)
            }
```

). Dans `MeeshyComposerHost+Surfaces.swift`, supprimer les deux `.onReceive(sceneCamera.$capturedPhotoId)` / `.onReceive(sceneCamera.$capturedVideoId)` et leurs commentaires (lignes en moins). Dans `MeeshyComposerHost+Viewfinder.swift`, `sceneCameraChrome(rect:)` pose `.onAppear { sceneCapture.onDeliver = { poseSceneCapture($0) } }` sur le `ComposerCaptureChrome`.

3f. Catalogue :

```bash
cat > /tmp/cap-9351b.json <<'JSON'
{"set": {"composer.capture.savedToPhotos": {"fr": "Enregistré dans Photos", "en": "Saved to Photos", "es": "Guardado en Fotos", "de": "In Fotos gesichert", "it": "Salvato in Foto", "pt-BR": "Salvo no Fotos", "ar": "حُفظ في الصور"}}}
JSON
python3 apps/ios/scripts/catalog_keys.py apply /tmp/cap-9351b.json && python3 apps/ios/scripts/check_localization.py | tail -1
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Composer/ComposerGallery.swift $P/Composer/ComposerCaptureSession+Takes.swift $P/Composer/ComposerCaptureSession.swift $P/Composer/ComposerCaptureSession+Thermal.swift $P/Components/CameraModel.swift $P/Composer/ComposerViewfinder.swift $P/Composer/MeeshyComposerHost+Surfaces.swift $P/Composer/MeeshyComposerHost+Viewfinder.swift apps/ios/Meeshy/Localizable.xcstrings apps/ios/Meeshy.xcodeproj/project.pbxproj"
wc -l $P/Composer/MeeshyComposerHost+Surfaces.swift
git add $F
git commit -m "feat(ios): la session reçoit les prises — la scène mène à l'édition, la miniature choisie enregistre le rendu en galerie (#9351)" -- $F
```

Expected `wc -l` : < 1 111 (le fichier ne fait que rétrécir). P1. Expected: PASS — `ComposerCaptureTakesTests` 7/7, `ComposerSceneCameraMountingTests` vert.

- [ ] **Step 5: Commit** — fait ; P3.

---

### Task 15: `ComposerCaptureStage` — rail, bande, miniature-déclencheur et table des gestes ; la revue, `reviewsPhoto` et le ( o ) partent

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureStage.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureViews.swift` (`ComposerCaptureChrome` réécrit)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift` (retrait du déclencheur, du cadenas, du zoom, de la phrase, du bouton « Filtres et cadres »)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerViewfinder.swift` (monte la scène ; plus de revue ni de `reviewsPhoto`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerViewfinder+Provider.swift:20`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift` (`sceneCameraChrome` : nouvelle signature du chrome)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoLook.swift` (reçoit `ComposerPhotoLookCopy`, `ComposerPhotoLookPerson` ; perd `ComposerPhotoLookRenderer`, `ComposerPhotoLookThumbnails`, les constantes d'aperçu)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLook.swift` (retrait de `ComposerLiveLookPanelLayout`)
- Delete: `apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoLookReview.swift`, `apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLookPanel.swift`
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (1 clé retirée, 2 valeurs mises à jour)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureStageWiringTests.swift`
- Test (mise à jour) : `ComposerSingleViewfinderTests.swift`, `ComposerLiveLookTests.swift`, `ComposerCaptureLockZoomFlashTests.swift`

**Interfaces:**
- Consumes: Tâches 11-14.
- Produces:
  - `nonisolated enum ComposerCaptureStageLayer: Equatable, Sendable { case image, controls }`
  - `struct ComposerCaptureStage: View { session; layer; size; offersSizeToggle = true; allowsPhoto = true; allowsVideo = true; onToggleSize = {}; onDisarm; onDeliver: @MainActor (CameraResult) -> Void }`
  - `ComposerCaptureChrome(session:size:offersSizeToggle:allowsPhoto:allowsVideo:onToggleSize:onDisarm:onValidateSegments:)` (plus de `onTap` / `onHold`)
  - `ComposerCaptureSession.gestureContext(allowsPhoto:allowsVideo:) -> ComposerCaptureGestureContext`
  - `struct ComposerCaptureBottomRow: View` ; `struct ComposerCaptureLockTrack: View { let progress: Double }`
  - `ComposerViewfinder(initialMode:onCapture:)` (plus de `reviewsPhoto`)
  - `ComposerCaptureCopy.rendering` (clé `composer.capture.looks.rendering`, inchangée)

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **Un seul objet vise, filme et retouche** (#9351, spec § 2 / § 4.3 / § 7).
@MainActor
final class ComposerCaptureStageWiringTests: XCTestCase {

    func test_theReviewAndItsParameter_haveLeft() throws {
        let racine = Self.racine()
        for parti in ["ComposerPhotoLookReview.swift", "ComposerLiveLookPanel.swift"] {
            XCTAssertFalse(FileManager.default.fileExists(atPath: racine.appendingPathComponent(
                "Meeshy/Features/Main/Composer/\(parti)").path), "\(parti) a quitté le dépôt")
        }
        for fichier in ["ComposerViewfinder.swift", "ComposerViewfinder+Provider.swift", "ComposerCaptureViews.swift",
                        "ComposerCaptureSession.swift", "ComposerPhotoLook.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            for absent in ["reviewsPhoto", "ComposerPhotoLookReview", "ComposerPhotoLookRenderer",
                           "ComposerPhotoLookThumbnails", "ComposerLiveLookPanel"] {
                XCTAssertFalse(code.contains(absent), "\(fichier) : \(absent)")
            }
        }
    }

    func test_theShutterHasLeftTheBar_theChosenThumbnailReplacesIt() throws {
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertFalse(barre.contains("shutterGesture"), "le déclencheur ( o ) est retiré")
        XCTAssertFalse(barre.contains("onToggleLooks"), "le rail remplace le bouton « Filtres et cadres »")
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerLookStrip("))
        XCTAssertTrue(bas.contains("ComposerLookRail("))
        XCTAssertTrue(bas.contains("ComposerCaptureLockTrack("), "le cadenas reste à droite")
    }

    func test_theChrome_readsEveryGestureFromTheTable() throws {
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureGesture.action("))
        XCTAssertTrue(chrome.contains("SpatialTapGesture(count: 1, coordinateSpace: .global)"), "un toucher vise")
        XCTAssertTrue(chrome.contains("TapGesture(count: 2)"), "deux touchers photographient")
    }

    func test_theViewfinder_mountsTheStageTwice_imageAndControls() throws {
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("layer: .image"))
        XCTAssertTrue(viseur.contains("layer: .controls"))
    }

    func test_contextFromTheSession_carriesStageSegmentsAndFormat() {
        let session = ComposerCaptureSession(stage: .armed)
        let contexte = session.gestureContext(allowsPhoto: false, allowsVideo: true)
        XCTAssertEqual(contexte.stage, .armed)
        XCTAssertFalse(contexte.allowsPhoto)
        XCTAssertEqual(contexte.pendingSegments, 0)
    }

    static func racine() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    static func code(_ relative: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: racine().appendingPathComponent(relative), encoding: .utf8))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureStageWiringTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — un seul objet de capture, sans revue ni déclencheur (#9351)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `value of type 'ComposerCaptureSession' has no member 'gestureContext'`.

- [ ] **Step 3: Write minimal implementation**

3a. `ComposerCaptureStage.swift` :

```swift
import SwiftUI
import MeeshySDK

/// Les deux couches d'un montage : l'IMAGE ignore les marges système (en plein
/// écran, jusqu'au bord), les COMMANDES les respectent (#4080).
nonisolated enum ComposerCaptureStageLayer: Equatable, Sendable {
    case image
    case controls
}

/// **L'OBJET UNIQUE de la capture : viser, filmer, retoucher** (#9351, #9354,
/// spec § 2 et § 4.3).
///
/// Monté tel quel par la barre de composition (`ComposerViewfinder`, plein écran)
/// et par le composer story / post / réel (`MeeshyComposerHost+Viewfinder`, en
/// scène ou en plein écran). La seule différence entre les deux est
/// `offersSizeToggle` — réduire / plein écran. Le format décide seulement si la
/// photo et la vidéo sont offertes.
struct ComposerCaptureStage: View {
    @ObservedObject var session: ComposerCaptureSession
    let layer: ComposerCaptureStageLayer
    let size: ComposerSceneCameraSize
    var offersSizeToggle = true
    var allowsPhoto = true
    var allowsVideo = true
    var onToggleSize: () -> Void = {}
    let onDisarm: () -> Void
    let onDeliver: @MainActor (CameraResult) -> Void

    var body: some View {
        switch layer {
        case .image:
            ComposerCapturePreview(session: session, size: size)
        case .controls:
            ComposerCaptureChrome(
                session: session,
                size: size,
                offersSizeToggle: offersSizeToggle,
                allowsPhoto: allowsPhoto,
                allowsVideo: allowsVideo,
                onToggleSize: onToggleSize,
                onDisarm: onDisarm,
                onValidateSegments: { session.validateSegments { onDeliver(.video($0)) } })
            .onAppear { session.onDeliver = onDeliver }
        }
    }
}

extension ComposerCaptureSession {
    /// Ce que la table des gestes doit savoir, lu sur la machine.
    func gestureContext(allowsPhoto: Bool, allowsVideo: Bool) -> ComposerCaptureGestureContext {
        ComposerCaptureGestureContext(
            stage: stage,
            editing: false,
            holding: holdStartedAt != nil,
            locked: barCapture.locked,
            pendingSegments: segments.count,
            allowsPhoto: allowsPhoto,
            allowsVideo: allowsVideo)
    }
}
```

3b. `ComposerCaptureViews.swift` — `ComposerCaptureChrome` réécrit (l'anneau `ComposerCaptureFocusRing` reste tel quel) :

```swift
struct ComposerCaptureChrome: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize
    var offersSizeToggle = true
    var allowsPhoto = true
    var allowsVideo = true
    var onToggleSize: () -> Void = {}
    let onDisarm: () -> Void
    let onValidateSegments: () -> Void

    @State private var focusMark: ComposerCaptureFocusMark?
    @GestureState private var pinchActive = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var context: ComposerCaptureGestureContext {
        session.gestureContext(allowsPhoto: allowsPhoto, allowsVideo: allowsVideo)
    }

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(holdGesture.exclusively(before:
                        TapGesture(count: 2).onEnded { scene(.doubleTap) }
                            .exclusively(before: focusGesture(origin: proxy.frame(in: .global).origin))))
                    .simultaneousGesture(dragGesture)
                    .simultaneousGesture(pinchGesture)
                    .adaptiveOnChange(of: pinchActive) { _, actif in
                        guard !actif else { return }
                        session.endPinchZoom()
                    }
                    .overlay(alignment: .topLeading) {
                        if let focusMark {
                            ComposerCaptureFocusRing(reduceMotion: reduceMotion)
                                .id(focusMark.id)
                                .position(focusMark.location)
                                .allowsHitTesting(false)
                        }
                    }
                    .accessibilityElement()
                    .accessibilityLabel(ComposerSceneCameraCopy.shutterLabel(mode: .photo, stage: session.stage))
                    .accessibilityAction(named: Text(ComposerSceneCameraCopy.shutterLabel(mode: .photo, stage: .armed))) {
                        scene(.doubleTap)
                    }
                    .accessibilityAction(named: Text(ComposerSceneCameraCopy.filmActionLabel)) {
                        session.stage == .recording ? session.closeTake() : scene(.longPress)
                    }
            }
            VStack(spacing: 0) {
                ComposerSceneCameraBar(
                    stage: session.stage,
                    flashMode: session.flash,
                    onCycleFlash: { session.cycleFlash() },
                    onFlipCamera: { session.camera.switchCamera() },
                    onDisarm: onDisarm,
                    size: size,
                    onToggleSize: onToggleSize,
                    offersSizeToggle: offersSizeToggle,
                    segments: session.segments,
                    onDropLastSegment: { session.dropLastSegment() },
                    onValidateSegments: onValidateSegments,
                    liveDuration: session.camera.recordingDuration,
                    flashIntensity: session.barCapture.flashIntensity,
                    onFlashIntensity: { session.setFlashIntensity($0) })
                Spacer(minLength: 0)
                ComposerCaptureBottomRow(session: session, context: context)
            }
            if session.isRenderingLook {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .controlSize(.large)
                    .padding(MeeshySpacing.lg)
                    .adaptiveLiquidGlass(in: Circle())
                    .accessibilityLabel(ComposerCaptureCopy.rendering)
            }
        }
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: session.dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: session.dismissDrag))
    }

    /// Un geste sur la scène, décidé par la table.
    private func scene(_ geste: ComposerCaptureGestureKind) {
        session.perform(ComposerCaptureGesture.action(zone: .scene, gesture: geste, context: context), item: nil)
    }

    private var holdGesture: some Gesture {
        LongPressGesture(minimumDuration: ComposerSceneQuickCapture.armedHoldDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { valeur in
                guard case .second(true, _) = valeur, session.holdStartedAt == nil else { return }
                scene(.longPress)
            }
            .onEnded { _ in session.endHold() }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { valeur in
                switch ComposerCaptureGesture.action(zone: .scene, gesture: .drag, context: context) {
                case .steerTake:
                    session.holdChanged(CGPoint(x: valeur.translation.width, y: valeur.translation.height))
                case .zoom:
                    session.dragZoom(translationY: valeur.translation.height)
                case .close:
                    session.followDismissDrag(translationY: valeur.translation.height)
                default:
                    return
                }
            }
            .onEnded { valeur in
                session.endZoomDrag()
                guard session.holdStartedAt == nil else { return }
                guard session.releaseDismissDrag(translationY: valeur.translation.height) else { return }
                HapticFeedback.light()
                onDisarm()
            }
    }

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .updating($pinchActive) { _, actif, _ in actif = true }
            .onChanged { echelle in
                guard ComposerCaptureGesture.action(zone: .scene, gesture: .pinch, context: context) == .zoom else { return }
                session.pinchZoom(scale: echelle)
            }
            .onEnded { _ in session.endPinchZoom() }
    }

    /// **Un toucher vise** (#9351 — le double toucher photographie désormais).
    private func focusGesture(origin: CGPoint) -> some Gesture {
        SpatialTapGesture(count: 1, coordinateSpace: .global).onEnded { toucher in
            guard ComposerCaptureGesture.action(zone: .scene, gesture: .tap, context: context) == .focus,
                  !session.pinchSpoilsGestures, session.focus(atGlobalPoint: toucher.location) else { return }
            let marque = ComposerCaptureFocusMark(
                id: UUID(), location: CGPoint(x: toucher.location.x - origin.x, y: toucher.location.y - origin.y))
            focusMark = marque
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(ComposerCaptureFocus.markLifetime * 1_000_000_000))
                if focusMark == marque { focusMark = nil }
            }
        }
    }
}
```

Dans `ComposerCaptureFocus.swift`, renommer `focusesOnDoubleTap(stage:)` en `focusesOnTap(stage:)` (et son appel dans `ComposerCaptureSession.focus(atGlobalPoint:)`, et le test `test_focusesOnDoubleTap_…` → `test_focusesOnTap_seulementQuandLImageEstLa`).

3c. `ComposerCaptureBottomRow.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le bas de la capture** (#9351, spec § 3.1 / § 3.2) : le zoom (crans ou
/// badge), la bande ou la seule miniature choisie, le cadenas à droite, la phrase
/// du geste ; le rail vertical au-dessus, à gauche. Pendant l'enregistrement, le
/// rail se cache et la bande se réduit à la miniature choisie.
struct ComposerCaptureBottomRow: View {
    @ObservedObject var session: ComposerCaptureSession
    let context: ComposerCaptureGestureContext

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var capture: ComposerSceneCameraBar.Capture { session.barCapture }

    private var showsLock: Bool {
        ComposerCaptureHold.showsLock(stage: session.stage, holding: capture.holding, locked: capture.locked)
    }

    private var showsRail: Bool {
        ComposerCaptureGesture.action(zone: .rail, gesture: .tap, context: context) == .openFamily
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            zoom
            ZStack {
                ComposerLookStrip(session: session, source: session.camera.liveFeed, context: context,
                                  recordingTime: session.camera.recordingDuration)
                HStack {
                    Spacer(minLength: 0)
                    if showsLock {
                        ComposerCaptureLockTrack(progress: capture.lockProgress)
                            .padding(.trailing, MeeshySpacing.mdPlus)
                    }
                }
            }
            Text(showsLock ? ComposerSceneCameraCopy.lockHint
                           : ComposerSceneCameraCopy.hint(mode: session.mode ?? .photo, stage: session.stage))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                .foregroundStyle(.white.opacity(0.85))
                .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.75)
                .accessibilityHidden(true)
        }
        .padding(.bottom, MeeshySpacing.lg)
        .overlay(alignment: .bottomLeading) {
            if showsRail {
                ComposerLookRail(open: session.openFamily) { famille in session.toggleFamily(famille) }
                    .padding(.leading, MeeshySpacing.mdPlus)
                    .padding(.bottom, ComposerLookStripRule.cellSize.height + 64)
                    .transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsLock)
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: session.openFamily)
    }

    @ViewBuilder
    private var zoom: some View {
        if session.stage == .recording {
            ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: { session.stepZoom(up: $0) })
        } else if capture.zoomPresets.count > 1 {
            ComposerCaptureZoomPresets(factor: capture.zoomFactor, presets: capture.zoomPresets,
                                       onSelect: { session.camera.setZoom($0) })
        } else if ComposerCaptureZoom.showsBadge(capture.zoomFactor) {
            ComposerCaptureZoomChip(factor: capture.zoomFactor, onStep: { session.stepZoom(up: $0) })
        }
    }
}

/// **La clé du verrou** (#8671) — paraît dès que le doigt tient pour filmer, se
/// remplit pendant qu'il glisse ; à 1, la prise continue sans lui.
struct ComposerCaptureLockTrack: View {
    let progress: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: "chevron.forward")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .bold))
                .foregroundStyle(.white.opacity(0.45 + 0.55 * progress))
            Image(systemName: progress >= 1 ? "lock.fill" : "lock.open.fill")
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(.white)
                .scaleEffect(reduceMotion ? 1 : 1 + 0.15 * progress)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .frame(height: 44)
        .adaptiveLiquidGlass(in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.3 + 0.5 * progress), lineWidth: MeeshyBorder.strong))
        .accessibilityHidden(true)
        .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .leading)))
    }
}
```

3d. `ComposerSceneCameraBar.swift` — la barre ne garde que la rangée haute et la bande des segments. Supprimer : `mode`, `onPhoto`, `onStartFilming`, `onLock`, `onCloseTake`, `capture`, `onZoomDrag`, `onZoomDragEnded`, `onZoomStep`, `onShutterTouched`, `onToggleLooks`, `lookActive`, `onZoomPreset` ; les états `recordingBlink` (si la bande des segments ne le lit pas — sinon le garder), `pressedAt`, `locked`, `holdTask`, `lockProgress` ; les membres `isLocked`, `showsLock`, `shutterRow`, `sideSlot`, `lockTrack`, `shutter`, `shutterGesture`, `armHold`, `hint` ; le bouton `camera.filters` de `topControls`. Ajouter `var flashIntensity: Double = ComposerFlashIntensity.defaultLevel` (que `flashCluster` lit à la place de `capture.flashIntensity`), DÉCLARÉE juste après `liveDuration` et avant `onFlashIntensity` : l'initialiseur par membres suit l'ordre des déclarations, et l'appel du chrome (3b) suit cet ordre — `stage, flashMode, onCycleFlash, onFlipCamera, onDisarm, size, onToggleSize, offersSizeToggle, segments, onDropLastSegment, onValidateSegments, liveDuration, flashIntensity, onFlashIntensity` (la Tâche 18 ajoute `editing` en dernier). Garder le type `Capture` (le bas de la capture le lit) et `ComposerFlashIntensitySlider`, `ComposerCaptureZoomChip`, `ComposerCaptureZoomPresets`. Nouveau `body` :

```swift
    var body: some View {
        VStack(spacing: 0) {
            topControls
            if !segments.isEmpty { segmentStrip }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
    }
```

3e. `ComposerViewfinder.swift` — le viseur monte la scène ; supprimer `ComposerPendingPhoto`, `pendingPhoto`, `reviewsPhoto` (propriété, paramètre d'`init`, doc), l'overlay de la revue, `.animation(…, value: pendingPhoto?.id)`, `.accessibilityHidden(pendingPhoto != nil)`, `tapAnywhere`, `holdAnywhere`, et, dans `ComposerViewfinderRules`, `takesPhotoOnTap`, `filmsOnHold`, `originalBytes`. Le corps :

```swift
    var body: some View {
        ZStack {
            preview
                .ignoresSafeArea()
            if refused {
                refusedChrome
            } else {
                ComposerCaptureStage(session: capture, layer: .controls, size: .fullScreen,
                                     offersSizeToggle: false,
                                     onDisarm: { close() }, onDeliver: { deliver($0) })
            }
        }
        .background(Color.black.ignoresSafeArea())
        .onAppear {
            camera.configure()
            capture.watchThermalState()
            if initialMode == .video {
                Task { @MainActor in await camera.enableAudioCaptureIfNeeded() }
            }
        }
        .onDisappear { capture.disarm() }
        .statusBarHidden()
    }
```

et, dans `preview`, `ComposerCapturePreview(session: capture, size: .fullScreen)` devient `ComposerCaptureStage(session: capture, layer: .image, size: .fullScreen, onDisarm: { close() }, onDeliver: { deliver($0) })`. `ComposerViewfinder+Provider.swift` : `AnyView(ComposerViewfinder { result in … })`, et sa phrase de doc « La photo part SANS passer par la prise (#9295) » devient « La photo part peinte par le peintre unique, sur le canevas 9:16 (#9347) ».

3f. `MeeshyComposerHost+Viewfinder.swift` — `sceneCameraChrome(rect:)` :

```swift
    private func sceneCameraChrome(rect: CGRect) -> some View {
        let modes = ComposerSceneCamera.modes(for: selectedFormat)
        return ComposerCaptureChrome(
            session: sceneCapture,
            size: sceneCameraSize,
            allowsPhoto: modes.contains(.photo),
            allowsVideo: modes.contains(.video),
            onToggleSize: { sceneCameraSize = sceneCameraSize.toggled },
            onDisarm: { disarmSceneCamera() },
            onValidateSegments: { validateSceneSegments() })
        .onAppear { sceneCapture.onDeliver = { poseSceneCapture($0) } }
        .frame(width: rect.width, height: rect.height)
        .position(x: rect.midX, y: rect.midY)
    }
```

(`handleArmedSceneTap` et `handleArmedSceneHold` n'ont plus d'appelant : les supprimer, avec `ComposerSceneQuickCapture.armedTap`/`armedHold`/`ArmedTap`/`ArmedHold` s'ils n'en ont plus non plus — `grep -rn "armedTap\|armedHold\|ArmedTap\|ArmedHold" apps/ios/Meeshy apps/ios/MeeshyTests --include='*.swift'` — et leurs tests.)

3g. Retraits et déplacements :
- `ComposerPhotoLookReview.swift` : déplacer dans `ComposerPhotoLook.swift` `ComposerPhotoLookPerson` (tel quel) et `ComposerPhotoLookCopy` réduit à `filters`, `frames`, `frameName`, `frameSymbol` ; puis `git rm apps/ios/Meeshy/Features/Main/Composer/ComposerPhotoLookReview.swift`.
- `ComposerLiveLookPanel.swift` : déplacer `rendering` dans `ComposerCaptureCopy` (fichier `ComposerFramePacing.swift`, même clé `composer.capture.looks.rendering`) ; `git rm apps/ios/Meeshy/Features/Main/Composer/ComposerLiveLookPanel.swift`.
- `ComposerPhotoLook.swift` : supprimer `ComposerPhotoLookRenderer`, `ComposerPhotoLookThumbnails`, et de `ComposerPhotoLookRule` les membres qui n'ont plus d'appelant après ces retraits (`grep -rn "previewMaxPixel\|thumbnailMaxPixel\|previewFrameCanvas\|thumbnailFrameCanvas\|downscale(\|captureLook(" apps/ios/Meeshy --include='*.swift'` ; garder `frameCanvas`, `colorSpace`, `filters`, `chips`, `frames`, `entering`, `chip(of:)`, `grades` s'ils sont lus). Si `ComposerPhotoLookSource.taken(_:by:at:)` et ses propriétés stockées n'ont plus d'appelant, faire de `ComposerPhotoLookSource` un `nonisolated enum` qui ne garde que `texts(at:)`, `caption(at:)`, `upright(_:)`.
- `ComposerLiveLook.swift` : supprimer `ComposerLiveLookPanelLayout`.

3h. Catalogue — le bouton « Filtres et cadres » part, la photo se prend à deux touchers :

```bash
cat > /tmp/cap-9351c.json <<'JSON'
{"delete": ["composer.capture.looks"],
 "set": {
  "composer.camera.hint.photo": {"fr": "toucher deux fois pour une photo · maintenir pour filmer", "en": "double-tap for a photo · hold to film", "es": "toca dos veces para una foto · mantén para grabar", "de": "zweimal tippen für ein Foto · halten zum Filmen", "it": "tocca due volte per una foto · tieni premuto per girare", "pt-BR": "toque duas vezes para uma foto · segure para filmar", "ar": "انقر مرتين لالتقاط صورة · اضغط مطولًا للتصوير"},
  "composer.camera.gesture.tapAgainPhoto": {"fr": "Toucher deux fois : photo", "en": "Double-tap: photo", "es": "Tocar dos veces: foto", "de": "Zweimal tippen: Foto", "it": "Tocca due volte: foto", "pt-BR": "Tocar duas vezes: foto", "ar": "انقر مرتين: صورة"}
 }}
JSON
python3 apps/ios/scripts/catalog_keys.py apply /tmp/cap-9351c.json && python3 apps/ios/scripts/check_localization.py | tail -1
```

et mettre les `defaultValue:` des deux appels (`ComposerSceneCameraCopy.hint` cas `.photo`, `gestureLine(.tapAgainPhoto)`) au texte `fr` ci-dessus, mot pour mot. Expected: `Localization consistency check passed.`

3i. Témoins existants qui décrivaient l'ancien chemin (`grep -rn "ComposerPhotoLookReview\|reviewsPhoto\|ComposerLiveLookPanel\|ComposerPhotoLookRenderer\|ComposerPhotoLookThumbnails\|ComposerPhotoLookTab\|ComposerLiveLookCopy\|onToggleLooks\|takesPhotoOnTap\|filmsOnHold\|originalBytes\|ComposerPendingPhoto\|focusesOnDoubleTap" apps/ios/MeeshyTests --include='*.swift'`) — règle de mise à jour, cas par cas :
- `ComposerSingleViewfinderTests` : supprimer les tests de `ComposerPhotoLookRenderer` / `ComposerPhotoLookThumbnails` (le peintre a ses témoins, Tâche 2) ; retirer `"ComposerPhotoLookReview.swift"` de la liste des fichiers balayés ; remplacer `XCTAssertTrue(viseur.contains("ComposerPhotoLookReview("), …)` par `XCTAssertTrue(viseur.contains("ComposerCaptureStage("), "le viseur monte l'objet unique")` et `XCTAssertTrue(pont.contains("ComposerViewfinder(reviewsPhoto: false)"), …)` par `XCTAssertTrue(pont.contains("ComposerViewfinder {"), "la porte de l'atelier monte le même viseur")`.
- `ComposerLiveLookTests` : `test_lAperçuPartage_poseLeLookEnDirect` vérifie désormais `vues.contains("ComposerLiveLookSurface(")` et `bas.contains("ComposerLookRail(")` (fichier `ComposerCaptureBottomRow.swift`) ; dans `test_laPrise_partAvecLeLook_…`, remplacer les trois assertions sur `initialLook:`, `capture.lookedPhoto(` et `sceneCapture.lookedPhoto(` par `XCTAssertTrue(prises.contains("lookedPhoto(image"), "toute photo de la scène part regardée")` lu dans `ComposerCaptureSession+Takes.swift`.
- `ComposerCaptureLockZoomFlashTests` : `test_leChromePartage_…` lit `"SpatialTapGesture(count: 1, coordinateSpace: .global)"` et `"TapGesture(count: 2)"` ; `test_laBarreMontreLeCadenasLeZoomEtLeCurseur` lit le cadenas et le zoom dans `ComposerCaptureBottomRow.swift`, le curseur dans la barre ; `test_lesDeuxMontages_profitentDesGestesSansLesRecabler` accepte `ComposerCaptureStage(` OU `ComposerCaptureChrome(` (le composer passe à la scène en Tâche 21) ; `test_focusesOnDoubleTap_…` devient `test_focusesOnTap_…`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
git rm -q $P/ComposerPhotoLookReview.swift $P/ComposerLiveLookPanel.swift
cd apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh && cd ../..
python3 apps/ios/scripts/check_localization.py | tail -1
T=apps/ios/MeeshyTests/Unit/Composer
F="$P/ComposerCaptureStage.swift $P/ComposerCaptureBottomRow.swift $P/ComposerCaptureViews.swift $P/ComposerSceneCameraBar.swift $P/ComposerViewfinder.swift $P/ComposerViewfinder+Provider.swift $P/MeeshyComposerHost+Viewfinder.swift $P/ComposerPhotoLook.swift $P/ComposerLiveLook.swift $P/ComposerFramePacing.swift $P/ComposerCaptureFocus.swift $P/ComposerCaptureSession.swift $P/ComposerSceneCameraCopy.swift $P/ComposerSceneCaptureGesture.swift $P/ComposerPhotoLookReview.swift $P/ComposerLiveLookPanel.swift $T/ComposerSingleViewfinderTests.swift $T/ComposerLiveLookTests.swift $T/ComposerCaptureLockZoomFlashTests.swift apps/ios/Meeshy/Localizable.xcstrings apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F
git commit -m "feat(ios): le viseur se pilote par un rail, une bande de miniatures vivantes et la miniature choisie — sans revue ni déclencheur ( o ) — run test (#9351)" -- $F
```

P1. Expected: PASS — toute la suite verte (`ComposerCaptureStageWiringTests` 5/5).

- [ ] **Step 5: Livrer** — P3. L'issue #9351 reste `In Progress` : elle se ferme à la recette au simulateur de la Tâche 22 (un seul build local pour tout le plan), jamais sans ses captures.

---

## Lot 6 — #9352 : le mode édition — photo figée, vidéo en boucle, cadrage, ✓ Terminé, galerie brut + rendu

### Task 16: Une phase d'édition ; la photo prise par la scène s'y fige

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCapturePhase.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift` (stockées `phase`, `editPhoto`, `editSource` ; `isRenderingLook` en écriture interne ; `renderGeneration` en `private(set)` ; `disarm` remet la phase)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift` (`photoArrived` `.edit` → `beginEditing(photo:)`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureStage.swift` (`gestureContext.editing`)
- Modify: `apps/ios/Meeshy/Features/Main/Components/CameraModel.swift` (`pauseRunning`, `resumeRunning`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCapturePhaseTests.swift`
- Test (mise à jour) : `ComposerCaptureTakesTests.swift` (nouveau test `.edit`)

**Interfaces:**
- Produces:
  - `nonisolated enum ComposerEditMedia: Hashable, Sendable { case photo; case video(URL) }`
  - `nonisolated enum ComposerCapturePhase: Hashable, Sendable { case capturing; case editing(ComposerEditMedia); var isEditing: Bool }`
  - `nonisolated final class ComposerStillSource: ComposerFrameSourcing` (`init(_ image: CGImage)`)
  - `ComposerCaptureSession.phase` (`@Published`), `editPhoto: CGImage?`, `editSource: (any ComposerFrameSourcing)?`, `func beginEditing(photo: UIImage)`, `func cancelEditing()`, `var editExtent: CGRect?`, `var framingAspect: CGFloat`, `func reframe(from:translation:viewSize:)`, `func rezoom(from:scale:)`
  - `CameraModel.pauseRunning()`, `CameraModel.resumeRunning()`

- [ ] **Step 0: Ouvrir le lot** — `status 9352 "In Progress"` ; `git pull --rebase --autostash origin dev`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **Après la prise, la même interface retouche** (#9352, spec § 3.3).
@MainActor
final class ComposerCapturePhaseTests: XCTestCase {

    func test_isEditing_onlyInTheEditingPhase() {
        XCTAssertFalse(ComposerCapturePhase.capturing.isEditing)
        XCTAssertTrue(ComposerCapturePhase.editing(.photo).isEditing)
    }

    func test_stillSource_servesTheSameImage_andDrawsOnce() {
        let source = ComposerStillSource(Self.photo(width: 300, height: 400))
        XCTAssertEqual(source.latestImage()?.extent, CGRect(x: 0, y: 0, width: 300, height: 400))
        let dessin = expectation(description: "une image, une fois")
        source.setFrameHandler { dessin.fulfill() }
        wait(for: [dessin], timeout: 1)
    }

    func test_beginEditingPhoto_freezesThePhoto_andTheTableSwitchesToEditing() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 300, height: 400)))
        XCTAssertEqual(session.phase, .editing(.photo))
        XCTAssertNotNil(session.editPhoto)
        XCTAssertEqual(session.framing, .identity)
        XCTAssertTrue(session.gestureContext(allowsPhoto: true, allowsVideo: true).editing)
    }

    func test_reframe_followsTheFinger_withinTheSource() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 300, height: 400)))
        session.reframe(from: .identity, translation: CGSize(width: 40, height: 0), viewSize: CGSize(width: 200, height: 355))
        XCTAssertLessThan(session.framing.center.x, 0.5, "le média suit le doigt vers la droite")
        session.rezoom(from: session.framing, scale: 2)
        XCTAssertEqual(session.framing.scale, 2, accuracy: 0.001)
    }

    func test_cancelEditing_returnsToCapture() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 30, height: 40)))
        session.cancelEditing()
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertNil(session.editPhoto)
        XCTAssertNil(session.editSource)
    }

    func test_disarm_leavesEditing() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginEditing(photo: UIImage(cgImage: Self.photo(width: 30, height: 40)))
        session.disarm()
        XCTAssertEqual(session.phase, .capturing)
    }

    static func photo(width: Int, height: Int) -> CGImage {
        let contexte = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.3, green: 0.5, blue: 0.7, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return contexte.makeImage()!
    }
}
```

Dans `ComposerCaptureTakesTests`, ajouter :

```swift
    func test_photoArrived_editIntent_entersEditing_andDeliversNothingYet() {
        let session = ComposerCaptureSession(stage: .armed)
        var remis = 0
        session.onDeliver = { _ in remis += 1 }
        Self.publishPhoto(on: session)
        XCTAssertEqual(session.phase, .editing(.photo), "la photo de la scène s'ouvre en édition")
        XCTAssertEqual(remis, 0, "rien ne part avant « Terminé »")
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer
git add $T/ComposerCapturePhaseTests.swift $T/ComposerCaptureTakesTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la photo de la scène s'ouvre en édition (#9352)" -- $T/ComposerCapturePhaseTests.swift $T/ComposerCaptureTakesTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9352`). Expected: FAIL — `cannot find 'ComposerCapturePhase' in scope`.

- [ ] **Step 3: Write minimal implementation**

`ComposerCapturePhase.swift` :

```swift
import CoreGraphics
import CoreImage
import Foundation

/// Ce que l'édition retouche.
nonisolated enum ComposerEditMedia: Hashable, Sendable {
    case photo
    case video(URL)
}

/// **Deux phases, une interface** (#9352, spec § 4.3) : on vise, ou on retouche.
nonisolated enum ComposerCapturePhase: Hashable, Sendable {
    case capturing
    case editing(ComposerEditMedia)

    var isEditing: Bool {
        if case .editing = self { return true }
        return false
    }
}

/// **La photo figée, comme source du peintre** : une image, dessinée une fois ;
/// la vue ne redessine que si le look ou le cadrage change.
nonisolated final class ComposerStillSource: ComposerFrameSourcing, @unchecked Sendable {
    private let image: CIImage
    let declaredSpace: CGColorSpace?

    nonisolated deinit {}

    init(_ cgImage: CGImage) {
        image = CIImage(cgImage: cgImage)
        declaredSpace = ComposerPhotoLookRule.colorSpace(of: cgImage)
    }

    func latestImage() -> CIImage? { image }

    func setFrameHandler(_ handler: (@Sendable () -> Void)?) {
        handler?()
    }
}
```

`ComposerCaptureSession.swift` — stockées (sous `framing`) :

```swift
    /// On vise, ou on retouche (#9352).
    @Published var phase = ComposerCapturePhase.capturing
    /// La photo figée de l'édition, debout.
    var editPhoto: CGImage?
    /// Ce que le peintre lit en édition : la photo figée, ou la vidéo en boucle.
    var editSource: (any ComposerFrameSourcing)?
```

et : `@Published private(set) var isRenderingLook` → `@Published var isRenderingLook` ; `private var renderGeneration` → `private(set) var renderGeneration`. Dans `disarm()`, avant `stage = .off` : `leaveEditing()`.

`ComposerCaptureSession+Edit.swift` :

```swift
import CoreGraphics
import UIKit

/// **Le mode édition** (#9352, spec § 3.3) : même interface, la source change.
extension ComposerCaptureSession {

    func beginEditing(photo image: UIImage) {
        guard let debout = ComposerPhotoLookSource.upright(image) else { return }
        editPhoto = debout
        editSource = ComposerStillSource(debout)
        framing = .identity
        openFamily = nil
        phase = .editing(.photo)
        camera.pauseRunning()
    }

    /// « Fermer » en édition : on revient viser ; la prise est abandonnée.
    func cancelEditing() {
        leaveEditing()
        camera.resumeRunning()
    }

    func leaveEditing() {
        phase = .capturing
        editPhoto = nil
        editSource = nil
        framing = .identity
    }

    /// L'étendue de la source éditée.
    var editExtent: CGRect? {
        editSource?.latestImage()?.extent
    }

    /// Les proportions de la case où le média se pose : la découpe du cadre, le
    /// canevas 9:16 sinon.
    var framingAspect: CGFloat {
        let cle = ComposerLookSceneKey(look: look, canvas: ComposerLookPainter.canvas, date: lookDate, person: lookPerson)
        guard let photo = scenes.cached(cle)?.slots.first?.photo, photo.height > 0 else {
            return ComposerLookPainter.canvas.width / ComposerLookPainter.canvas.height
        }
        return photo.width / photo.height
    }

    func reframe(from anchor: ComposerFraming, translation: CGSize, viewSize: CGSize) {
        guard let source = editExtent else { return }
        framing = anchor.panned(by: translation, viewSize: viewSize, source: source, aspect: framingAspect)
    }

    func rezoom(from anchor: ComposerFraming, scale: CGFloat) {
        guard let source = editExtent else { return }
        framing = anchor.zoomed(by: scale, source: source, aspect: framingAspect)
    }
}
```

`ComposerCaptureSession+Takes.swift`, `photoArrived` — le cas `.edit` devient `beginEditing(photo: image)`. `ComposerCaptureStage.swift`, `gestureContext` : `editing: phase.isEditing`.

`CameraModel.swift`, sous `stop()` :

```swift
    /// L'édition n'a pas besoin de l'objectif : la session s'arrête, sans rien démonter.
    func pauseRunning() {
        liveFeed.flush()
        Task.detached { [weak self] in
            self?.session.stopRunning()
        }
    }

    func resumeRunning() {
        Task.detached { [weak self] in
            self?.session.startRunning()
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main
F="$P/Composer/ComposerCapturePhase.swift $P/Composer/ComposerCaptureSession+Edit.swift $P/Composer/ComposerCaptureSession.swift $P/Composer/ComposerCaptureSession+Takes.swift $P/Composer/ComposerCaptureStage.swift $P/Components/CameraModel.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F && git commit -m "feat(ios): la photo prise par la scène se fige en édition, cadrable au doigt (#9352)" -- $F
```

P1. Expected: PASS — `ComposerCapturePhaseTests` 6/6, `ComposerCaptureTakesTests` 8/8. P3.

- [ ] **Step 5: Commit** — fait.

---

### Task 17: La vidéo assemblée se retouche en boucle (`AVPlayerLooper` → `AVPlayerItemVideoOutput`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerEditSources.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession.swift` (stockées `loopPlayer`, `trim`, `loopPlayerFactory` ; `init` ; `validateSegments` RETIRÉ du fichier principal)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift` (`validateSegments()`, `beginEditing(video:)`, `leaveEditing` arrête la boucle)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureStage.swift` (`onValidateSegments: { session.validateSegments() }`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift` (`validateSceneSegments` → `sceneCapture.validateSegments()`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerLoopPlayerTests.swift`

**Interfaces:**
- Produces:
  - `nonisolated enum ComposerVideoOrientation { static func orientation(of: CGAffineTransform) -> CGImagePropertyOrientation }`
  - `protocol ComposerLoopPlayerProviding: ComposerFrameSourcing { nonisolated var duration: TimeInterval { get }; nonisolated var uprightSize: CGSize { get }; @MainActor func play(); @MainActor func stop(); @MainActor func setRange(_: ClosedRange<TimeInterval>); @MainActor func seek(to: TimeInterval); @MainActor var currentTime: TimeInterval { get } }`
  - `nonisolated final class ComposerLoopPlayer: NSObject, ComposerLoopPlayerProviding` ; `@MainActor static func load(url: URL) async -> ComposerLoopPlayer?`
  - `ComposerCaptureSession.loopPlayer: (any ComposerLoopPlayerProviding)?` ; `@Published var trim: ClosedRange<TimeInterval>?` ; `init(…, loopPlayerFactory: @escaping @MainActor (URL) async -> (any ComposerLoopPlayerProviding)? = { await ComposerLoopPlayer.load(url: $0) })` ; `func validateSegments()` (sans argument) ; `func beginEditing(video: URL) async`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import AVFoundation
@testable import Meeshy

/// **La vidéo en boucle, lue au tick, peinte par le peintre** (#9352, spec § 4.4).
@MainActor
final class ComposerLoopPlayerTests: XCTestCase {

    func test_orientation_cameraPortraitTransform_isRight() {
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 1080, ty: 0)), .right)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: .identity), .up)
        XCTAssertEqual(ComposerVideoOrientation.orientation(of: CGAffineTransform(a: -1, b: 0, c: 0, d: -1, tx: 0, ty: 0)), .down)
    }

    func test_validateSegments_entersVideoEditing_withTheWholeClipAsRange() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 4)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("seg_\(UUID().uuidString).mov")
        try Data([0]).write(to: url)
        session.collectSegment(url)
        session.validateSegments()
        await ComposerCaptureTakesTests.waitUntil { session.phase.isEditing }
        XCTAssertEqual(session.phase, .editing(.video(url)))
        XCTAssertEqual(session.trim, 0...4)
        XCTAssertEqual(lecteur.playCount, 1)
        XCTAssertTrue(session.segments.isEmpty)
    }

    func test_cancelEditingVideo_stopsTheLoop() async throws {
        let lecteur = MockComposerLoopPlayer(duration: 2)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: FileManager.default.temporaryDirectory.appendingPathComponent("x.mov"))
        session.cancelEditing()
        XCTAssertEqual(lecteur.stopCount, 1)
        XCTAssertNil(session.loopPlayer)
    }

    #if DEBUG
    func test_loopPlayer_onTheFixtureMovie_servesFrames() async throws {
        let url = try XCTUnwrap(await ComposerCaptureFixture.movie())
        let lecteur = try XCTUnwrap(await ComposerLoopPlayer.load(url: url))
        XCTAssertEqual(lecteur.duration, 3, accuracy: 0.2)
        XCTAssertEqual(lecteur.uprightSize, CGSize(width: 1080, height: 1920))
        lecteur.play()
        await ComposerCaptureTakesTests.waitUntil(timeout: 5) { lecteur.latestImage() != nil }
        XCTAssertNotNil(lecteur.latestImage())
        lecteur.setRange(0.5...1.5)
        lecteur.stop()
    }
    #endif
}

final class MockComposerLoopPlayer: ComposerLoopPlayerProviding, @unchecked Sendable {
    let duration: TimeInterval
    let uprightSize = CGSize(width: 1080, height: 1920)
    let declaredSpace: CGColorSpace? = nil
    private(set) var playCount = 0
    private(set) var stopCount = 0
    private(set) var ranges: [ClosedRange<TimeInterval>] = []
    private(set) var seeks: [TimeInterval] = []
    var currentTime: TimeInterval = 0

    nonisolated deinit {}

    init(duration: TimeInterval) { self.duration = duration }

    func latestImage() -> CIImage? { CIImage(color: .gray).cropped(to: CGRect(origin: .zero, size: uprightSize)) }
    func setFrameHandler(_ handler: (@Sendable () -> Void)?) {}
    func play() { playCount += 1 }
    func stop() { stopCount += 1 }
    func setRange(_ range: ClosedRange<TimeInterval>) { ranges.append(range) }
    func seek(to time: TimeInterval) { seeks.append(time) }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerLoopPlayerTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la vidéo assemblée se retouche en boucle (#9352)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `cannot find 'ComposerVideoOrientation' in scope`.

- [ ] **Step 3: Write minimal implementation**

`ComposerEditSources.swift` :

```swift
import AVFoundation
import CoreImage
import MeeshyUI
import QuartzCore

/// L'orientation qu'une piste DÉCLARE (`preferredTransform`) — les tampons de
/// `AVPlayerItemVideoOutput` arrivent couchés comme ils ont été encodés.
nonisolated enum ComposerVideoOrientation {
    static func orientation(of transform: CGAffineTransform) -> CGImagePropertyOrientation {
        switch (transform.a, transform.b, transform.c, transform.d) {
        case (0, 1, -1, 0): return .right
        case (0, -1, 1, 0): return .left
        case (-1, 0, 0, -1): return .down
        default: return .up
        }
    }
}

/// Ce que l'édition attend d'une vidéo en boucle.
protocol ComposerLoopPlayerProviding: ComposerFrameSourcing {
    nonisolated var duration: TimeInterval { get }
    nonisolated var uprightSize: CGSize { get }
    @MainActor func play()
    @MainActor func stop()
    @MainActor func setRange(_ range: ClosedRange<TimeInterval>)
    @MainActor func seek(to time: TimeInterval)
    @MainActor var currentTime: TimeInterval { get }
}

/// **La vidéo en boucle** (#9352, spec § 4.4) : `AVQueuePlayer` + `AVPlayerLooper`,
/// chaque élément de la boucle sort ses trames par un `AVPlayerItemVideoOutput`
/// (IOSurface, Metal) lu au rythme de l'écran ; le peintre les peint. Changer de
/// look ne touche pas la lecture ; la découpe reconstruit la boucle sur sa plage.
nonisolated final class ComposerLoopPlayer: NSObject, ComposerLoopPlayerProviding, @unchecked Sendable {
    let duration: TimeInterval
    let uprightSize: CGSize
    var declaredSpace: CGColorSpace? { nil }

    private let asset: AVURLAsset
    private let orientation: CGImagePropertyOrientation
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var outputs: [ObjectIdentifier: AVPlayerItemVideoOutput] = [:]
    private var link: CADisplayLink?
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    private var handler: (@Sendable () -> Void)?

    nonisolated(unsafe) private static let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]

    nonisolated deinit {}

    private init(asset: AVURLAsset, duration: TimeInterval, uprightSize: CGSize, orientation: CGImagePropertyOrientation) {
        self.asset = asset
        self.duration = duration
        self.uprightSize = uprightSize
        self.orientation = orientation
        super.init()
    }

    @MainActor
    static func load(url: URL) async -> ComposerLoopPlayer? {
        let asset = AVURLAsset(url: url)
        guard let piste = try? await asset.loadTracks(withMediaType: .video).first,
              let naturelle = try? await piste.load(.naturalSize),
              let transformation = try? await piste.load(.preferredTransform),
              let duree = try? await asset.load(.duration), duree.seconds > 0 else { return nil }
        return ComposerLoopPlayer(
            asset: asset, duration: duree.seconds,
            uprightSize: MeeshyVideoWatermarkBaker.orientedSize(natural: naturelle, transform: transformation),
            orientation: ComposerVideoOrientation.orientation(of: transformation))
    }

    func latestImage() -> CIImage? {
        lock.lock()
        let tampon = latest
        lock.unlock()
        return tampon.map { CIImage(cvPixelBuffer: $0).oriented(orientation) }
    }

    func setFrameHandler(_ handler: (@Sendable () -> Void)?) {
        lock.lock()
        self.handler = handler
        lock.unlock()
    }

    @MainActor
    func play() {
        if looper == nil { setRange(0...duration) }
        player.play()
        guard link == nil else { return }
        let lien = CADisplayLink(target: ComposerLoopPlayerTick(owner: self), selector: #selector(ComposerLoopPlayerTick.tick))
        lien.preferredFramesPerSecond = 30
        lien.add(to: .main, forMode: .common)
        link = lien
    }

    @MainActor
    func stop() {
        link?.invalidate()
        link = nil
        player.pause()
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()
        outputs = [:]
    }

    @MainActor
    func setRange(_ range: ClosedRange<TimeInterval>) {
        looper?.disableLooping()
        player.removeAllItems()
        let plage = CMTimeRange(start: CMTime(seconds: range.lowerBound, preferredTimescale: 600),
                                end: CMTime(seconds: range.upperBound, preferredTimescale: 600))
        let boucle = AVPlayerLooper(player: player, templateItem: AVPlayerItem(asset: asset), timeRange: plage)
        outputs = boucle.loopingPlayerItems.reduce(into: [:]) { sorties, element in
            let sortie = AVPlayerItemVideoOutput(pixelBufferAttributes: Self.attributes)
            element.add(sortie)
            sorties[ObjectIdentifier(element)] = sortie
        }
        looper = boucle
        player.play()
    }

    @MainActor
    func seek(to time: TimeInterval) {
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    @MainActor
    var currentTime: TimeInterval { player.currentTime().seconds }

    @MainActor
    fileprivate func tick() {
        guard let element = player.currentItem, let sortie = outputs[ObjectIdentifier(element)] else { return }
        let temps = sortie.itemTime(forHostTime: CACurrentMediaTime())
        guard sortie.hasNewPixelBuffer(forItemTime: temps),
              let tampon = sortie.copyPixelBuffer(forItemTime: temps, itemTimeForDisplay: nil) else { return }
        lock.lock()
        latest = tampon
        let prevenir = handler
        lock.unlock()
        prevenir?()
    }
}

/// La cible du `CADisplayLink` — elle ne retient pas le lecteur.
private final class ComposerLoopPlayerTick: NSObject {
    weak var owner: ComposerLoopPlayer?

    nonisolated deinit {}

    init(owner: ComposerLoopPlayer) {
        self.owner = owner
        super.init()
    }

    @objc func tick() {
        owner?.tick()
    }
}
```

`ComposerCaptureSession.swift` — stockées (sous `editSource`) :

```swift
    /// La vidéo en boucle de l'édition (#9352).
    var loopPlayer: (any ComposerLoopPlayerProviding)?
    /// La plage gardée de la vidéo éditée (#9353).
    @Published var trim: ClosedRange<TimeInterval>?
    let loopPlayerFactory: @MainActor (URL) async -> (any ComposerLoopPlayerProviding)?
```

`init` — paramètre `loopPlayerFactory: @escaping @MainActor (URL) async -> (any ComposerLoopPlayerProviding)? = { await ComposerLoopPlayer.load(url: $0) }` et son affectation. Supprimer `validateSegments(deliver:)` du fichier principal.

`ComposerCaptureSession+Edit.swift` — ajouter :

```swift
    /// **`✓` assemble les segments et passe en édition** (spec § 3.2). Un
    /// assemblage qui échoue retombe sur le dernier segment plutôt que de perdre la prise.
    func validateSegments() {
        let pris = segments
        guard ComposerCaptureSegments.canValidate(pris) else { return }
        segments = []
        let generation = renderGeneration
        isRenderingLook = true
        Task { @MainActor in
            let finale = ComposerCaptureSegments.needsMerge(pris)
                ? await CameraModel.mergeSegments(pris.map(\.url))
                : pris.first?.url
            isRenderingLook = false
            guard generation == renderGeneration, let url = finale ?? pris.last?.url else { return }
            await beginEditing(video: url)
        }
    }

    /// Une vidéo qui ne se lit pas part telle quelle plutôt que d'être perdue.
    func beginEditing(video url: URL) async {
        guard let lecteur = await loopPlayerFactory(url) else {
            onDeliver?(.video(url))
            return
        }
        loopPlayer = lecteur
        editSource = lecteur
        framing = .identity
        trim = 0...lecteur.duration
        openFamily = nil
        phase = .editing(.video(url))
        camera.pauseRunning()
        lecteur.play()
    }
```

et `leaveEditing()` commence par `loopPlayer?.stop()`, puis `loopPlayer = nil`, `trim = nil`. `ComposerCaptureStage` : `onValidateSegments: { session.validateSegments() }` ; `MeeshyComposerHost+Viewfinder.validateSceneSegments()` : `sceneCapture.validateSegments()`.

`editExtent` (Tâche 16) lit `latestImage()` : pour une vidéo dont aucune trame n'est encore arrivée, il rend `nil` — le remplacer par :

```swift
    var editExtent: CGRect? {
        if let lecteur = loopPlayer { return CGRect(origin: .zero, size: lecteur.uprightSize) }
        return editSource?.latestImage()?.extent
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
F="$P/ComposerEditSources.swift $P/ComposerCaptureSession.swift $P/ComposerCaptureSession+Edit.swift $P/ComposerCaptureStage.swift $P/MeeshyComposerHost+Viewfinder.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F && git commit -m "feat(ios): ✓ assemble les segments et la vidéo se retouche en boucle (#9352)" -- $F
```

P1. Expected: PASS — `ComposerLoopPlayerTests` 4/4 (le test sur le film de recette tourne au simulateur de la CI). P3.

- [ ] **Step 5: Commit** — fait.

---

### Task 18: L'écran d'édition — la vue Metal sur la source éditée, le cadrage au doigt, ✓ Terminé qui livre et enregistre le rendu

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureViews.swift` (`ComposerCapturePreview` en édition ; gestes `.reframe` du chrome ; « Fermer » annule l'édition)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift` (édition : pas de zoom ni de cadenas ; ✓ Terminé ; bande sur la source éditée)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift` (`editing` cache flash et retournement)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift` (`finishEditing`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerFramePacing.swift` (`editFPS`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureEditTests.swift`

**Interfaces:**
- Consumes: Tâches 2, 3, 14, 16, 17.
- Produces: `ComposerCaptureSession.finishEditing()` ; `ComposerCaptureSurfaceRule.editFPS(_ budget: ComposerThermalBudget) -> Int` ; `ComposerSceneCameraBar.editing: Bool` ; `ComposerCaptureCopy.done`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **✓ Terminé livre le rendu final et l'enregistre en galerie** (#9352, spec § 3.3 / § 3.4).
@MainActor
final class ComposerCaptureEditTests: XCTestCase {

    func test_finishEditingPhoto_deliversTheCanvas_savesTheRendered_andLeavesEditing() async {
        let galerie = MockComposerGallery()
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 300, height: 400)))
        session.look = ComposerPhotoLook(filter: .cool)
        session.rezoom(from: .identity, scale: 1.5)
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        guard case .photo(let image, let octets) = remis else { return XCTFail("une photo") }
        XCTAssertEqual(image.size.width * image.scale, 1080)
        XCTAssertEqual(image.size.height * image.scale, 1920)
        XCTAssertNil(octets)
        XCTAssertEqual(galerie.saveImageCount, 1, "« Terminé » enregistre le RENDU final en galerie")
        XCTAssertEqual(session.phase, .capturing)
        XCTAssertFalse(session.isRenderingLook)
    }

    func test_finishEditingVideo_untouched_deliversTheClip_andSavesNothingMore() async {
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, loopPlayerFactory: { _ in lecteur })
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("clip_\(UUID().uuidString).mov")
        await session.beginEditing(video: url)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { remis != nil }
        guard case .video(let livree) = remis else { return XCTFail("une vidéo") }
        XCTAssertEqual(livree, url, "sans effet, sans cadrage, sans découpe : le brut, déjà en galerie")
        XCTAssertEqual(galerie.saveVideoCount, 0)
        XCTAssertEqual(lecteur.stopCount, 1)
    }

    func test_finishEditing_twice_deliversOnce() async {
        let session = ComposerCaptureSession(stage: .armed, gallery: MockComposerGallery())
        var compte = 0
        session.onDeliver = { _ in compte += 1 }
        session.beginEditing(photo: UIImage(cgImage: ComposerCapturePhaseTests.photo(width: 30, height: 40)))
        session.finishEditing()
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil { compte > 0 }
        try? await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(compte, 1)
    }

    func test_editFPS_neverZero_soAFrozenPhotoStillDraws() {
        XCTAssertGreaterThan(ComposerCaptureSurfaceRule.editFPS(ComposerThermalBudget.budget(for: .critical)), 0)
        XCTAssertEqual(ComposerCaptureSurfaceRule.editFPS(ComposerThermalBudget.budget(for: .nominal)), 30)
    }

    func test_editScreen_paintsTheEditedSource_andOffersDone() throws {
        let apercu = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("session.editSource"), "en édition, le peintre lit la photo figée ou la boucle")
        XCTAssertTrue(apercu.contains("session.reframe(from:"), "un doigt déplace, deux doigts zooment le média")
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("session.finishEditing()"), "le seul ajout : ✓ Terminé")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureEditTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — ✓ Terminé livre le rendu final et l'enregistre en galerie (#9352)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `value of type 'ComposerCaptureSession' has no member 'finishEditing'`.

- [ ] **Step 3: Write minimal implementation**

3a. `ComposerFramePacing.swift`, dans `ComposerCaptureSurfaceRule` et `ComposerCaptureCopy` :

```swift
    /// En édition, rien ne vient de l'objectif : la photo figée se dessine même au
    /// palier critique (à son rythme minimal), la boucle au rythme du palier.
    static func editFPS(_ budget: ComposerThermalBudget) -> Int {
        max(10, budget.previewFPS)
    }
```

```swift
    static var done: String {
        String(localized: "common.done", defaultValue: "Terminé", bundle: .main)
    }
```

3b. `ComposerCaptureSession+Edit.swift` :

```swift
    /// **✓ Terminé** : le rendu final (effet, cadrage, découpe) part vers l'hôte ET
    /// en galerie. Un second toucher pendant le rendu ne remet rien.
    func finishEditing() {
        guard !isRenderingLook else { return }
        switch phase {
        case .capturing: return
        case .editing(.photo): finishPhoto()
        case .editing(.video(let url)): finishVideo(url)
        }
    }

    private func finishPhoto() {
        guard let photo = editPhoto else { return }
        let regard = look
        let cadrage = framing
        let auteur = lookPerson
        let date = lookDate
        let cache = scenes
        let galerie = gallery
        isRenderingLook = true
        Task { @MainActor in
            guard let rendu = await ComposerLookPainter.renderPhoto(photo, look: regard, framing: cadrage,
                                                                    person: auteur, date: date, scenes: cache) else {
                isRenderingLook = false
                HapticFeedback.error()
                return
            }
            let image = UIImage(cgImage: rendu)
            _ = await galerie.saveImage(image)
            isRenderingLook = false
            leaveEditing()
            onDeliver?(.photo(image, data: nil))
        }
    }

    private func finishVideo(_ url: URL) {
        let regard = look
        let cadrage = framing
        let auteur = lookPerson
        let date = lookDate
        let galerie = gallery
        let espace = camera.liveFeed.declaredSpace?.name as String?
        let generation = renderGeneration
        loopPlayer?.stop()
        isRenderingLook = true
        Task { @MainActor in
            let rendue = await ComposerLookVideoExporter.export(url, look: regard, framing: cadrage, person: auteur,
                                                                date: date, declaredSpaceName: espace)
            guard generation == renderGeneration else {
                if let rendue, rendue != url {
                    FileManager.default.removeItemLogging(at: rendue, context: "rendu d'un viseur fermé", logger: .media)
                }
                return
            }
            let finale = rendue ?? url
            if finale != url { _ = await galerie.saveVideo(at: finale) }
            isRenderingLook = false
            leaveEditing()
            onDeliver?(.video(finale))
        }
    }
```

La boucle continue de jouer pendant le rendu ; `leaveEditing` l'arrête UNE fois. Réécrire donc `leaveEditing` (Tâche 17) ainsi, et retirer de `finishVideo` la ligne `loopPlayer?.stop()` :

```swift
    func leaveEditing() {
        let lecteur = loopPlayer
        loopPlayer = nil
        lecteur?.stop()
        trim = nil
        phase = .capturing
        editPhoto = nil
        editSource = nil
        framing = .identity
    }
```

3c. `ComposerCaptureViews.swift` — l'aperçu en édition. Dans `ComposerCapturePreview`, le `case .viewfinder:` devient :

```swift
            case .viewfinder:
                GeometryReader { exterieur in
                    let toile = ComposerCaptureCanvas.fitted(in: CGRect(origin: .zero, size: exterieur.size))
                    ZStack {
                        if session.phase.isEditing, let source = session.editSource {
                            ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                    date: session.lookDate, framing: session.framing,
                                                    source: source,
                                                    fps: ComposerCaptureSurfaceRule.editFPS(session.thermalBudget))
                                .id(session.phase)
                        } else {
                            CameraPreviewLayer(session: session.camera.session, focusPoints: session.focusPoints,
                                               mirrorsFrames: !session.paintsWithMetal)
                                .background(GeometryReader { proxy in
                                    Color.clear.adaptiveOnChange(of: proxy.frame(in: .global), initial: true) { _, cadre in
                                        session.focusPoints.previewFrame = cadre
                                    }
                                })
                            if session.paintsWithMetal {
                                ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                        date: session.lookDate, framing: .identity,
                                                        source: session.camera.liveFeed,
                                                        fps: session.thermalBudget.previewFPS,
                                                        surfaceScale: session.thermalBudget.surfaceScale)
                                    .id(session.phase)
                            }
                        }
                    }
                    .frame(width: toile.width, height: toile.height)
                    .position(x: toile.midX, y: toile.midY)
                }
```

(conserver le bloc de la mention thermique de la Tâche 7 dans la branche « capture »). Dans `ComposerCaptureChrome` : états `@State private var reframeAnchor: ComposerFraming?` et `@State private var rezoomAnchor: ComposerFraming?` ; `dragGesture.onChanged` gagne le cas :

```swift
                case .reframe:
                    let ancre = reframeAnchor ?? session.framing
                    reframeAnchor = ancre
                    session.reframe(from: ancre, translation: valeur.translation, viewSize: canvasSize)
```

et `onEnded` commence par `reframeAnchor = nil` ; `pinchGesture.onChanged` :

```swift
            .onChanged { echelle in
                switch ComposerCaptureGesture.action(zone: .scene, gesture: .pinch, context: context) {
                case .zoom:
                    session.pinchZoom(scale: echelle)
                case .reframe:
                    let ancre = rezoomAnchor ?? session.framing
                    rezoomAnchor = ancre
                    session.rezoom(from: ancre, scale: echelle)
                default:
                    return
                }
            }
            .onEnded { _ in
                rezoomAnchor = nil
                session.endPinchZoom()
            }
```

où `canvasSize` est mesuré une fois par le `GeometryReader` de la nappe : `@State private var canvasSize: CGSize = .zero` posé par `.adaptiveOnChange(of: proxy.size, initial: true) { _, taille in canvasSize = ComposerCaptureCanvas.fitted(in: CGRect(origin: .zero, size: taille)).size }`. La barre reçoit `editing: session.phase.isEditing`, et son `onDisarm` devient `session.phase.isEditing ? { session.cancelEditing() } : onDisarm`.

3d. `ComposerSceneCameraBar.swift` — `var editing = false` ; dans `topControls`, `flashCluster` et le bouton de retournement ne s'affichent que si `!editing` ; la bande des segments aussi.

3e. `ComposerCaptureBottomRow.swift` — en édition : pas de zoom, pas de cadenas ; la bande lit la source éditée ; ✓ Terminé à droite :

```swift
    private var source: any ComposerFrameSourcing {
        session.editSource ?? session.camera.liveFeed
    }
```

(`ComposerLookStrip(session:source: source, …)`), `zoom` n'est rendu que si `!session.phase.isEditing`, et le `HStack` du cadenas devient :

```swift
                HStack {
                    Spacer(minLength: 0)
                    if session.phase.isEditing {
                        Button { session.finishEditing() } label: {
                            Label(ComposerCaptureCopy.done, systemImage: "checkmark")
                                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, MeeshySpacing.lg)
                                .frame(minHeight: MeeshyControlSize.tapTarget)
                                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.indigo500)
                        }
                        .buttonStyle(.plain)
                        .disabled(session.isRenderingLook)
                        .accessibilityLabel(ComposerCaptureCopy.done)
                        .padding(.trailing, MeeshySpacing.mdPlus)
                    } else if showsLock {
                        ComposerCaptureLockTrack(progress: capture.lockProgress)
                            .padding(.trailing, MeeshySpacing.mdPlus)
                    }
                }
```

et la phrase du geste se tait en édition (`if !session.phase.isEditing { Text(…) }`).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
F="$P/ComposerCaptureViews.swift $P/ComposerCaptureBottomRow.swift $P/ComposerSceneCameraBar.swift $P/ComposerCaptureSession+Edit.swift $P/ComposerFramePacing.swift"
git add $F
git commit -m "feat(ios): après la prise, la même interface retouche, se cadre au doigt et se valide d'un ✓ qui enregistre le rendu — run test (#9352)" -- $F
```

P1. Expected: PASS — `ComposerCaptureEditTests` 5/5 et toute la suite.

- [ ] **Step 5: Livrer** — P3. #9352 reste `In Progress` jusqu'à la recette de la Tâche 22.

---

## Lot 7 — #9353 : la piste de découpe, à la milliseconde sur appui long

### Task 19: Les lois de la découpe — plage bornée, durée minimale, milliseconde, tête de lecture

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerTrimRule.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerTrimRuleTests.swift`

**Interfaces:**
- Produces: `nonisolated enum ComposerTrimRule { static let minimum: TimeInterval; static let preciseZoom: CGFloat; static func initialRange(duration:) -> ClosedRange<TimeInterval>; static func canTrim(duration:) -> Bool; static func movedStart(_:range:) -> ClosedRange<TimeInterval>; static func movedEnd(_:range:duration:) -> ClosedRange<TimeInterval>; static func millisecondText(_:) -> String; static func playhead(_:in:) -> TimeInterval; static func time(atX:width:duration:) -> TimeInterval; static func preciseTime(anchor:translationX:pointsPerSecond:) -> TimeInterval; static func timeRange(_:duration:) -> CMTimeRange? }`

- [ ] **Step 0: Ouvrir le lot** — `status 9353 "In Progress"` ; `git pull --rebase --autostash origin dev`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import CoreMedia
@testable import Meeshy

/// **La découpe d'une vidéo capturée** (#9353, spec § 3.3).
@MainActor
final class ComposerTrimRuleTests: XCTestCase {

    func test_initialRange_isTheWholeClip() {
        XCTAssertEqual(ComposerTrimRule.initialRange(duration: 7.25), 0...7.25)
    }

    func test_initialRange_clipShorterThanMinimum_isWholeClip() {
        XCTAssertEqual(ComposerTrimRule.initialRange(duration: 0.2), 0...0.2)
        XCTAssertFalse(ComposerTrimRule.canTrim(duration: 0.2), "une prise trop courte ne se découpe pas")
        XCTAssertTrue(ComposerTrimRule.canTrim(duration: 1))
    }

    func test_movedStart_staysBeforeTheEndMinusTheMinimum() {
        XCTAssertEqual(ComposerTrimRule.movedStart(6.9, range: 1...7).upperBound, 7)
        XCTAssertEqual(ComposerTrimRule.movedStart(6.9, range: 1...7).lowerBound, 7 - ComposerTrimRule.minimum, accuracy: 0.0001)
        XCTAssertEqual(ComposerTrimRule.movedStart(-2, range: 1...7).lowerBound, 0)
    }

    func test_movedEnd_staysAfterTheStartPlusTheMinimum_andWithinTheClip() {
        XCTAssertEqual(ComposerTrimRule.movedEnd(1.1, range: 1...7, duration: 8).upperBound, 1 + ComposerTrimRule.minimum, accuracy: 0.0001)
        XCTAssertEqual(ComposerTrimRule.movedEnd(99, range: 1...7, duration: 8).upperBound, 8)
    }

    func test_millisecondText_readsMinutesSecondsMilliseconds() {
        XCTAssertEqual(ComposerTrimRule.millisecondText(3.482), "0:03.482")
        XCTAssertEqual(ComposerTrimRule.millisecondText(75.0405), "1:15.041")
    }

    func test_playhead_isClampedIntoTheRange() {
        XCTAssertEqual(ComposerTrimRule.playhead(0.5, in: 1...4), 1)
        XCTAssertEqual(ComposerTrimRule.playhead(2.5, in: 1...4), 2.5)
        XCTAssertEqual(ComposerTrimRule.playhead(9, in: 1...4), 4)
    }

    func test_timeAtX_mapsTheTrackToTheClip() {
        XCTAssertEqual(ComposerTrimRule.time(atX: 150, width: 300, duration: 8), 4, accuracy: 0.0001)
        XCTAssertEqual(ComposerTrimRule.time(atX: -20, width: 300, duration: 8), 0)
    }

    func test_preciseTime_stripMovesUnderTheFixedMarker() {
        let pps: CGFloat = 40 * 300 / 8
        XCTAssertEqual(ComposerTrimRule.preciseTime(anchor: 3, translationX: 15, pointsPerSecond: pps), 3 - 0.01, accuracy: 0.00001,
                       "faire glisser la bande vers la droite amène un instant ANTÉRIEUR sous le trait")
    }

    func test_timeRange_wholeClip_isNil_andAPartIsExported() {
        XCTAssertNil(ComposerTrimRule.timeRange(0...8, duration: 8))
        let plage = ComposerTrimRule.timeRange(1.5...4, duration: 8)
        XCTAssertEqual(plage?.start.seconds ?? -1, 1.5, accuracy: 0.001)
        XCTAssertEqual(plage?.duration.seconds ?? -1, 2.5, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerTrimRuleTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — les lois de la découpe vidéo (#9353)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9353`). Expected: FAIL — `cannot find 'ComposerTrimRule' in scope`.

- [ ] **Step 3: Write minimal implementation**

```swift
import CoreGraphics
import CoreMedia
import Foundation
import MeeshyUI

/// **La découpe d'une vidéo capturée** (#9353, spec § 3.3) — le principe de
/// `MeeshyAudioTrimmer` (#4657) : en précision, on amène l'instant sous un trait
/// FIXE plutôt que de viser un trait du doigt.
nonisolated enum ComposerTrimRule {

    /// La plus courte plage gardée — celle du rognage audio.
    static let minimum: TimeInterval = AudioTrimGeometry.minimumSegment
    /// L'appui long sur une poignée dilate la piste à ce facteur.
    static let preciseZoom: CGFloat = AudioTrimGeometry.zoomRange.upperBound

    static func initialRange(duration: TimeInterval) -> ClosedRange<TimeInterval> {
        0...max(0, duration)
    }

    static func canTrim(duration: TimeInterval) -> Bool {
        duration > minimum
    }

    static func movedStart(_ time: TimeInterval, range: ClosedRange<TimeInterval>) -> ClosedRange<TimeInterval> {
        let debut = min(max(0, time), max(0, range.upperBound - minimum))
        return debut...range.upperBound
    }

    static func movedEnd(_ time: TimeInterval, range: ClosedRange<TimeInterval>,
                         duration: TimeInterval) -> ClosedRange<TimeInterval> {
        let fin = max(min(duration, time), min(duration, range.lowerBound + minimum))
        return range.lowerBound...fin
    }

    /// « 0:03.482 » — minutes, secondes, millisecondes.
    static func millisecondText(_ time: TimeInterval) -> String {
        let millis = Int((max(0, time) * 1000).rounded())
        let minutes = millis / 60_000
        let secondes = (millis % 60_000) / 1000
        let reste = millis % 1000
        return String(format: "%d:%02d.%03d", minutes, secondes, reste)
    }

    static func playhead(_ time: TimeInterval, in range: ClosedRange<TimeInterval>) -> TimeInterval {
        min(range.upperBound, max(range.lowerBound, time))
    }

    /// Le point touché sur la piste (non dilatée), en temps du clip.
    static func time(atX x: CGFloat, width: CGFloat, duration: TimeInterval) -> TimeInterval {
        guard width > 0 else { return 0 }
        return min(duration, max(0, TimeInterval(x / width) * duration))
    }

    /// En précision : la bande suit le doigt sous le trait fixe — vers la droite,
    /// un instant antérieur passe sous le trait.
    static func preciseTime(anchor: TimeInterval, translationX: CGFloat, pointsPerSecond: CGFloat) -> TimeInterval {
        guard pointsPerSecond > 0 else { return anchor }
        return anchor - TimeInterval(translationX / pointsPerSecond)
    }

    /// La plage exportée ; `nil` quand elle est le clip entier.
    static func timeRange(_ range: ClosedRange<TimeInterval>?, duration: TimeInterval) -> CMTimeRange? {
        guard let range, range.lowerBound > 0.0005 || range.upperBound < duration - 0.0005 else { return nil }
        return CMTimeRange(start: CMTime(seconds: range.lowerBound, preferredTimescale: 600),
                           end: CMTime(seconds: range.upperBound, preferredTimescale: 600))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
F="apps/ios/Meeshy/Features/Main/Composer/ComposerTrimRule.swift apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F && git commit -m "feat(ios): les lois de la découpe — plage bornée, minimum, milliseconde, tête de lecture (#9353)" -- $F
```

P1. Expected: PASS — 9/9. P3.

- [ ] **Step 5: Commit** — fait.

---

### Task 20: La piste de découpe — vignettes, forme d'onde en filigrane, poignées, précision milliseconde, tête en boucle

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerTrimTrack.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift` (`setTrim`, `seekPlayhead`, `finishVideo` passe la plage)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift` (`timeRange:`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift` (piste AU-DESSUS du rail et de la bande, en édition vidéo)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (2 clés)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerTrimTrackTests.swift`

**Interfaces:**
- Consumes: Tâches 17, 19.
- Produces: `struct ComposerTrimTrack: View { @ObservedObject var session; let url: URL; let duration: TimeInterval }` ; `ComposerCaptureSession.setTrim(_:committed:)`, `seekPlayhead(to:)` ; `ComposerLookVideoExporter.export(_:look:framing:timeRange:person:date:declaredSpaceName:)` ; `ComposerCaptureCopy.trimPrecisionHint`, `ComposerCaptureCopy.playhead`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **La piste de découpe** (#9353, spec § 3.3).
@MainActor
final class ComposerTrimTrackTests: XCTestCase {

    func test_setTrim_whileDragging_movesTheRange_onlyTheEndRebuildsTheLoop() async {
        let lecteur = MockComposerLoopPlayer(duration: 6)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: FileManager.default.temporaryDirectory.appendingPathComponent("t.mov"))
        session.setTrim(1...5, committed: false)
        XCTAssertEqual(session.trim, 1...5)
        XCTAssertTrue(lecteur.ranges.isEmpty, "pendant le geste, la boucle ne se reconstruit pas")
        session.setTrim(1...4.5, committed: true)
        XCTAssertEqual(lecteur.ranges.last, 1...4.5)
    }

    func test_seekPlayhead_isClampedIntoTheKeptRange() async {
        let lecteur = MockComposerLoopPlayer(duration: 6)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: FileManager.default.temporaryDirectory.appendingPathComponent("t.mov"))
        session.setTrim(2...4, committed: true)
        session.seekPlayhead(to: 0.5)
        XCTAssertEqual(lecteur.seeks.last, 2)
    }

    func test_track_isAboveTheRail_andCarriesThePrecisionLaw() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        let piste = try XCTUnwrap(bas.range(of: "ComposerTrimTrack("))
        let bande = try XCTUnwrap(bas.range(of: "ComposerLookStrip("))
        XCTAssertLessThan(piste.lowerBound, bande.lowerBound, "la piste se pose AU-DESSUS du rail et de la bande")
        let vue = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerTrimTrack.swift")
        XCTAssertTrue(vue.contains("ComposerTrimRule.preciseTime("), "l'appui long amène l'instant sous le trait")
        XCTAssertTrue(vue.contains("ComposerTrimRule.millisecondText("))
        XCTAssertTrue(vue.contains("WaveformCache.shared.samples("), "forme d'onde en filigrane")
        let export = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("session.timeRange"), "la découpe part dans le rendu")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerTrimTrackTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — la piste de découpe au-dessus de la bande (#9353)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1. Expected: FAIL — `value of type 'ComposerCaptureSession' has no member 'setTrim'`.

- [ ] **Step 3: Write minimal implementation**

3a. `ComposerLookVideoExporter.swift` — paramètre `timeRange: CMTimeRange? = nil` (après `framing:`), garde `guard ComposerLiveLookRule.rendersLive(look) || !framing.isIdentity || timeRange != nil else { return url }`, appel `await write(asset, composition: composition, timeRange: timeRange)`, et dans `write` :

```swift
    private static func write(_ asset: AVAsset, composition: AVVideoComposition, timeRange: CMTimeRange?) async -> URL? {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
            return nil
        }
        let sortie = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_look_\(UUID().uuidString).mov")
        session.outputURL = sortie
        session.outputFileType = .mov
        session.videoComposition = composition
        if let timeRange { session.timeRange = timeRange }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { continuation.resume() }
        }
        guard session.status == .completed else {
            FileManager.default.removeItemLogging(at: sortie, context: "rendu du look abandonné", logger: .media)
            return nil
        }
        return sortie
    }
```

3b. `ComposerCaptureSession+Edit.swift` :

```swift
    /// Pendant le geste, la plage bouge ; à sa fin seulement, la boucle repart sur elle.
    func setTrim(_ range: ClosedRange<TimeInterval>, committed: Bool) {
        trim = range
        guard committed else { return }
        loopPlayer?.setRange(range)
    }

    /// Toucher la piste y place la tête ; la boucle repart de là.
    func seekPlayhead(to time: TimeInterval) {
        guard let trim else { return }
        loopPlayer?.seek(to: ComposerTrimRule.playhead(time, in: trim))
    }
```

et, dans `finishVideo`, l'appel à l'export passe `timeRange: ComposerTrimRule.timeRange(trim, duration: loopPlayer?.duration ?? 0)` (lire `trim` et la durée dans des constantes AVANT la `Task`).

3c. `ComposerTrimTrack.swift` :

```swift
import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

extension ComposerCaptureCopy {
    static var trimPrecisionHint: String {
        String(localized: "composer.capture.trim.precisionHint",
               defaultValue: "Maintenir pour régler à la milliseconde", bundle: .main)
    }

    static var playhead: String {
        String(localized: "composer.capture.trim.playhead", defaultValue: "Tête de lecture", bundle: .main)
    }

    static var trimStart: String {
        String(localized: "composer.object.editor.start", defaultValue: "Début", bundle: .main)
    }

    static var trimEnd: String {
        String(localized: "composer.object.editor.end", defaultValue: "Fin", bundle: .main)
    }
}

/// **La piste de découpe** (#9353, spec § 3.3) : `[poignée] ── vignettes (forme
/// d'onde en filigrane) ── [poignée]`, une tête de lecture qui parcourt la plage
/// en boucle. Appui long sur une poignée ⇒ la piste se dilate autour d'elle sous
/// un trait FIXE, et le temps se lit à la milliseconde.
struct ComposerTrimTrack: View {
    @ObservedObject var session: ComposerCaptureSession
    let url: URL
    let duration: TimeInterval

    private static let height: CGFloat = 52
    private static let handleWidth: CGFloat = 26

    private enum Handle { case start, end }

    @State private var frames: [CGImage] = []
    @State private var samples: [Float] = []
    @State private var width: CGFloat = 1
    @State private var precise: Handle?
    @State private var anchor: TimeInterval = 0
    @State private var dragStart: ClosedRange<TimeInterval>?

    private var range: ClosedRange<TimeInterval> { session.trim ?? ComposerTrimRule.initialRange(duration: duration) }
    private var pointsPerSecond: CGFloat { duration > 0 ? width / CGFloat(duration) : 0 }

    var body: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            if let precise {
                Text(ComposerTrimRule.millisecondText(precise == .start ? range.lowerBound : range.upperBound))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    strip(width: proxy.size.width)
                    playheadLine
                    handle(.start)
                    handle(.end)
                }
                .adaptiveOnChange(of: proxy.size.width, initial: true) { _, largeur in width = max(1, largeur) }
                .contentShape(Rectangle())
                .onTapGesture { point in
                    session.seekPlayhead(to: ComposerTrimRule.time(atX: point.x, width: proxy.size.width, duration: duration))
                }
            }
            .frame(height: Self.height)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .disabled(!ComposerTrimRule.canTrim(duration: duration))
        .task(id: url) {
            frames = await Self.thumbnails(url: url, count: 12)
            samples = (try? await WaveformCache.shared.samples(from: url, count: 256)) ?? []
        }
    }

    // MARK: - La bande

    private func strip(width: CGFloat) -> some View {
        let zoom = precise == nil ? 1 : ComposerTrimRule.preciseZoom
        let decalage = precise == nil ? 0 : CGFloat(anchor) * pointsPerSecond * zoom - x(for: anchor)
        return ZStack(alignment: .leading) {
            HStack(spacing: 0) {
                ForEach(Array(frames.enumerated()), id: \.offset) { _, image in
                    Image(decorative: image, scale: 1).resizable().aspectRatio(contentMode: .fill)
                        .frame(width: width * zoom / CGFloat(max(1, frames.count)), height: Self.height)
                        .clipped()
                }
            }
            waveform(width: width * zoom).opacity(0.25)
            Color.black.opacity(0.55)
                .frame(width: max(0, x(for: range.lowerBound) * zoom), height: Self.height)
            Color.black.opacity(0.55)
                .frame(width: max(0, (width - x(for: range.upperBound)) * zoom), height: Self.height)
                .offset(x: x(for: range.upperBound) * zoom)
        }
        .offset(x: -decalage)
        .frame(width: width, alignment: .leading)
        .accessibilityHidden(true)
    }

    private func waveform(width: CGFloat) -> some View {
        Path { chemin in
            guard !samples.isEmpty else { return }
            let pas = width / CGFloat(samples.count)
            for (index, valeur) in samples.enumerated() {
                let hauteur = max(2, CGFloat(valeur) * Self.height)
                chemin.addRect(CGRect(x: CGFloat(index) * pas, y: (Self.height - hauteur) / 2,
                                      width: max(1, pas - 1), height: hauteur))
            }
        }
        .fill(Color.white)
    }

    private var playheadLine: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { _ in
            let temps = ComposerTrimRule.playhead(session.loopPlayer?.currentTime ?? range.lowerBound, in: range)
            Rectangle().fill(Color.white).frame(width: 2, height: Self.height)
                .offset(x: x(for: temps) - 1)
                .opacity(precise == nil ? 1 : 0)
        }
        .accessibilityLabel(ComposerCaptureCopy.playhead)
    }

    // MARK: - Les poignées

    private func handle(_ poignee: Handle) -> some View {
        let temps = poignee == .start ? range.lowerBound : range.upperBound
        let posX = precise == poignee ? x(for: anchor) : x(for: temps)
        return RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
            .fill(Color.yellow)
            .overlay(Image(systemName: poignee == .start ? "chevron.compact.left" : "chevron.compact.right")
                .foregroundStyle(.black))
            .frame(width: Self.handleWidth, height: Self.height)
            .offset(x: poignee == .start ? posX - Self.handleWidth : posX)
            .contentShape(Rectangle().inset(by: -9))
            .gesture(precisionGesture(poignee).exclusively(before: coarseGesture(poignee)))
            .accessibilityElement()
            .accessibilityLabel(poignee == .start ? ComposerCaptureCopy.trimStart : ComposerCaptureCopy.trimEnd)
            .accessibilityValue(ComposerTrimRule.millisecondText(temps))
            .accessibilityHint(ComposerCaptureCopy.trimPrecisionHint)
            .accessibilityAdjustableAction { sens in
                let pas: TimeInterval = sens == .increment ? 0.1 : -0.1
                move(poignee, to: temps + pas, committed: true)
            }
    }

    private func coarseGesture(_ poignee: Handle) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { valeur in
                let depart = dragStart ?? range
                dragStart = depart
                let origine = poignee == .start ? depart.lowerBound : depart.upperBound
                move(poignee, to: origine + TimeInterval(valeur.translation.width / max(1, pointsPerSecond)),
                     committed: false)
            }
            .onEnded { _ in
                dragStart = nil
                session.setTrim(range, committed: true)
            }
    }

    /// **L'appui long dilate la piste autour de la poignée** ; le doigt fait
    /// défiler la bande sous le trait fixe — on AMÈNE l'instant, on ne le vise pas.
    private func precisionGesture(_ poignee: Handle) -> some Gesture {
        LongPressGesture(minimumDuration: 0.4)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { valeur in
                guard case .second(true, let glisse) = valeur else { return }
                if precise != poignee {
                    precise = poignee
                    anchor = poignee == .start ? range.lowerBound : range.upperBound
                    HapticFeedback.medium()
                }
                let temps = ComposerTrimRule.preciseTime(anchor: anchor,
                                                         translationX: glisse?.translation.width ?? 0,
                                                         pointsPerSecond: pointsPerSecond * ComposerTrimRule.preciseZoom)
                move(poignee, to: temps, committed: false)
            }
            .onEnded { _ in
                precise = nil
                session.setTrim(range, committed: true)
                Task { @MainActor in frames = await Self.thumbnails(url: url, count: 12) }
            }
    }

    private func move(_ poignee: Handle, to temps: TimeInterval, committed: Bool) {
        let nouvelle = poignee == .start
            ? ComposerTrimRule.movedStart(temps, range: range)
            : ComposerTrimRule.movedEnd(temps, range: range, duration: duration)
        session.setTrim(nouvelle, committed: committed)
    }

    private func x(for time: TimeInterval) -> CGFloat {
        CGFloat(time) * pointsPerSecond
    }

    /// Les vignettes de la plage, UNE fois (et à la fin d'un geste de précision).
    @concurrent
    nonisolated static func thumbnails(url: URL, count: Int) async -> [CGImage] {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration).seconds, duree > 0, count > 0 else { return [] }
        let generateur = AVAssetImageGenerator(asset: asset)
        generateur.appliesPreferredTrackTransform = true
        generateur.maximumSize = CGSize(width: 120, height: 120)
        let instants = (0..<count).map { CMTime(seconds: duree * (Double($0) + 0.5) / Double(count), preferredTimescale: 600) }
        var images: [CGImage] = []
        for await resultat in generateur.images(for: instants) {
            if let image = try? resultat.image { images.append(image) }
        }
        return images
    }
}
```

(La forme `for await … { append }` est la seule mutation locale tolérée : une séquence asynchrone ne se `map` pas.)

3d. `ComposerCaptureBottomRow.swift` — en tête du `VStack`, AVANT le zoom :

```swift
            if case .editing(.video(let url)) = session.phase, let lecteur = session.loopPlayer {
                ComposerTrimTrack(session: session, url: url, duration: lecteur.duration)
            }
```

et décaler le rail d'autant (`.padding(.bottom, ComposerLookStripRule.cellSize.height + 64)` reste : la piste est AU-DESSUS du rail, au sommet du `VStack`, donc le rail ne bouge pas).

3e. Catalogue :

```bash
cat > /tmp/cap-9353.json <<'JSON'
{"set": {
 "composer.capture.trim.precisionHint": {"fr": "Maintenir pour régler à la milliseconde", "en": "Hold to adjust to the millisecond", "es": "Mantén para ajustar al milisegundo", "de": "Halten für millisekundengenaue Einstellung", "it": "Tieni premuto per regolare al millisecondo", "pt-BR": "Segure para ajustar ao milissegundo", "ar": "اضغط مطولًا للضبط بدقة الملّي ثانية"},
 "composer.capture.trim.playhead": {"fr": "Tête de lecture", "en": "Playhead", "es": "Cabezal de reproducción", "de": "Abspielposition", "it": "Testina di riproduzione", "pt-BR": "Cursor de reprodução", "ar": "مؤشر التشغيل"}
}}
JSON
python3 apps/ios/scripts/catalog_keys.py apply /tmp/cap-9353.json && python3 apps/ios/scripts/check_localization.py | tail -1
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
F="$P/ComposerTrimTrack.swift $P/ComposerCaptureSession+Edit.swift $P/ComposerLookVideoExporter.swift $P/ComposerCaptureBottomRow.swift apps/ios/Meeshy/Localizable.xcstrings apps/ios/Meeshy.xcodeproj/project.pbxproj"
git add $F
git commit -m "feat(ios): la vidéo capturée se découpe entre deux poignées, à la milliseconde sur appui long, sous une tête en boucle — run test (#9353)" -- $F
```

P1. Expected: PASS — `ComposerTrimTrackTests` 3/3 et toute la suite.

- [ ] **Step 5: Livrer** — P3. #9353 reste `In Progress` jusqu'à la recette de la Tâche 22.

---

## Lot 8 — #9354 : le composer story / post / réel monte le même objet

### Task 21: Le composer monte `ComposerCaptureStage` — en scène ou en plein écran, seule différence : réduire / plein écran

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift:207-237` (`sceneCameraPreview`, `sceneCameraChrome` → la scène) ; retrait de `collectSceneSegment`, `validateSceneSegments` s'ils n'ont plus d'appelant
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureStageMountTests.swift`
- Test (mise à jour) : `ComposerCaptureLockZoomFlashTests.swift` (`test_lesDeuxMontages_…`), `ComposerSceneCameraMountingTests.swift` (assertions sur `sceneCameraPreview` / `ComposerCaptureChrome(`)

**Interfaces:**
- Consumes: `ComposerCaptureStage` (Tâche 15) et tout ce qu'il porte.
- Produces: aucune API neuve — le composer et la barre de conversation montent le MÊME type, avec les MÊMES couches.

- [ ] **Step 0: Ouvrir le lot** — `status 9354 "In Progress"` ; `git pull --rebase --autostash origin dev`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

/// **Un seul objet, deux montages** (#9354, spec § 2) : la barre de conversation et
/// le composer story / post / réel montent `ComposerCaptureStage`, couches image et
/// commandes ; seul le composer offre réduire / plein écran.
@MainActor
final class ComposerCaptureStageMountTests: XCTestCase {

    func test_bothHosts_mountTheSameStage_imageAndControls() throws {
        for montage in ["Meeshy/Features/Main/Composer/ComposerViewfinder.swift",
                        "Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift"] {
            let code = try ComposerCaptureStageWiringTests.code(montage)
            XCTAssertTrue(code.contains("ComposerCaptureStage("), "\(montage) monte l'objet unique")
            XCTAssertTrue(code.contains("layer: .image"), montage)
            XCTAssertTrue(code.contains("layer: .controls"), montage)
            XCTAssertFalse(code.contains("ComposerCaptureChrome("), "\(montage) ne recâble pas le chrome")
            XCTAssertFalse(code.contains("ComposerCapturePreview("), "\(montage) ne recâble pas l'aperçu")
        }
    }

    func test_onlyTheComposer_offersTheSizeToggle() throws {
        let viseur = try ComposerCaptureStageWiringTests.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("offersSizeToggle: false"))
        let composer = try ComposerCaptureStageWiringTests.code("Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertFalse(composer.contains("offersSizeToggle: false"), "le composer garde réduire / plein écran")
        XCTAssertTrue(composer.contains("onToggleSize:"))
    }

    func test_theComposer_deliversThroughThePose_andPassesItsFormat() throws {
        let composer = try ComposerCaptureStageWiringTests.code("Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(composer.contains("onDeliver: { poseSceneCapture($0) }"), "la prise se POSE dans la scène")
        XCTAssertTrue(composer.contains("allowsPhoto:"), "le format décide si la photo est offerte")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate --quiet && ./scripts/check_test_registration.sh
cd /Users/smpceo/Documents/v2_meeshy
T=apps/ios/MeeshyTests/Unit/Composer/ComposerCaptureStageMountTests.swift
git add $T apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "test(ios): témoin rouge — le composer monte le même objet de capture (#9354)" -- $T apps/ios/Meeshy.xcodeproj/project.pbxproj
```

P1 (`LOT=9354`). Expected: FAIL — `MeeshyComposerHost+Viewfinder.swift monte l'objet unique`.

- [ ] **Step 3: Write minimal implementation**

`MeeshyComposerHost+Viewfinder.swift` — remplacer `sceneCameraPreview(rect:)` et `sceneCameraChrome(rect:)` par :

```swift
    /// **Une seule `CameraPreviewLayer` pour toute la session** — la couche IMAGE
    /// de l'objet unique, posée à la taille du moment.
    private func sceneCameraPreview(rect: CGRect) -> some View {
        sceneCaptureStage(layer: .image)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    /// La couche COMMANDES du même objet ; le format décide de la photo et de la vidéo.
    private func sceneCameraChrome(rect: CGRect) -> some View {
        sceneCaptureStage(layer: .controls)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    /// **L'objet unique de la capture** (#9354) : le même que la barre de
    /// conversation ; seul ajout ici, réduire / plein écran.
    private func sceneCaptureStage(layer: ComposerCaptureStageLayer) -> some View {
        let modes = ComposerSceneCamera.modes(for: selectedFormat)
        return ComposerCaptureStage(
            session: sceneCapture,
            layer: layer,
            size: sceneCameraSize,
            allowsPhoto: modes.contains(.photo),
            allowsVideo: modes.contains(.video),
            onToggleSize: { sceneCameraSize = sceneCameraSize.toggled },
            onDisarm: { disarmSceneCamera() },
            onDeliver: { poseSceneCapture($0) })
    }
```

Puis `grep -rn "collectSceneSegment\|validateSceneSegments\|handleArmedSceneTap\|handleArmedSceneHold" apps/ios/Meeshy --include='*.swift'` : supprimer chaque fonction qui n'a plus d'appelant (et ses doc-comments). Mettre à jour les témoins : `test_lesDeuxMontages_profitentDesGestesSansLesRecabler` lit `"ComposerCaptureStage("` dans les deux montages ; dans `ComposerSceneCameraMountingTests`, les assertions sur `ComposerCaptureChrome(` / `ComposerCapturePreview(` dans `MeeshyComposerHost+Viewfinder.swift` deviennent `ComposerCaptureStage(` (garder celles qui vérifient les deux `overlayPreferenceValue`, la courbe `sceneCameraGrowth` et `.ignoresSafeArea()` de la couche image — inchangées).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
P=apps/ios/Meeshy/Features/Main/Composer
T=apps/ios/MeeshyTests/Unit/Composer
F="$P/MeeshyComposerHost+Viewfinder.swift $T/ComposerCaptureLockZoomFlashTests.swift $T/ComposerSceneCameraMountingTests.swift"
git add $F
git commit -m "feat(ios): le composer story, post et réel monte le même objet de capture, avec pour seul ajout réduire / plein écran — run test (#9354)" -- $F
```

P1. Expected: PASS — `ComposerCaptureStageMountTests` 3/3, toute la suite verte.

- [ ] **Step 5: Livrer** — P3. #9354 reste `In Progress` jusqu'à la recette de la Tâche 22.

---

## Recette finale

### Task 22: CI verte sur `ci/`, captures au simulateur, commentaires de clôture

**Files:**
- Aucun fichier de code. Captures dans le scratchpad, publiées en compte rendu (artifact autorisé : « compte rendu de communication »).

**Interfaces:**
- Consumes: tout le plan.

- [ ] **Step 1: CI complète sur la tête**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git pull --rebase --autostash origin dev
git push --force origin HEAD:refs/heads/ci/capture-recette
gh workflow run iOS --ref ci/capture-recette
sleep 20
RUN=$(gh run list --workflow iOS --branch ci/capture-recette --limit 1 --json databaseId,url -q '.[0].databaseId')
gh run watch "$RUN" --exit-status; echo "exit=$?"
gh run view "$RUN" --json url -q .url
```

Expected: `exit=0`. Garder l'URL du run : c'est la preuve citée dans chaque commentaire de clôture.

- [ ] **Step 2: Captures au simulateur (un seul simulateur, `Meeshy-iOS26`, sur staging)**

Le seul build lourd local du plan, lancé SEUL (aucun autre build ni test en cours — vérifier `pgrep -fl xcodebuild` vide) :

```bash
UDID=$(xcrun simctl list devices | grep "Meeshy-iOS26 (" | grep -oE '[0-9A-F-]{36}' | head -1)
xcrun simctl boot "$UDID" 2>/dev/null; open -a Simulator
cd /Users/smpceo/Documents/v2_meeshy
MEESHY_DEVICE_ID="$UDID" ./apps/ios/meeshy.sh build
APP=$(find apps/ios/Build -path '*Debug-iphonesimulator/Meeshy.app' -maxdepth 6 | head -1)
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant camera me.meeshy.app
xcrun simctl privacy "$UDID" grant microphone me.meeshy.app
xcrun simctl privacy "$UDID" grant photos-add me.meeshy.app
xcrun simctl launch "$UDID" me.meeshy.app -MeeshyCaptureFixture
SHOTS=/private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/recette-capture && mkdir -p "$SHOTS"
```

Piloter l'app par le skill `ios-simulator` (navigation sémantique) ou `idb` ; chaque capture : `xcrun simctl io "$UDID" screenshot "$SHOTS/<nom>.png"`. Les huit captures, dans cet ordre :
1. `1-capture-armee.png` — une conversation, bouton caméra : le viseur plein écran (canevas 9:16), rail Filtres/Cadres en bas à gauche, miniature choisie au centre, pastille ×1.
2. `2-bande-filtres.png` — toucher « Filtres » : la bande ouverte, miniatures vivantes, « Aucun filtre » en tête.
3. `3-bande-cadres-classique.png` — « Cadres », choisir « Polaroïd » (classique) : la miniature encadrée, l'aperçu cadré en direct.
4. `4-enregistrement.png` — appui long sur la scène (`idb ui tap --duration 3`) : bande réduite à la miniature choisie, point rouge + chrono, cadenas à droite.
5. `5-edition-photo.png` — double toucher sur la scène : la photo figée, rail + bande, ✓ Terminé.
6. `6-edition-video-piste.png` — filmer deux segments, ✓ : la vidéo en boucle, la piste de découpe au-dessus de la bande.
7. `7-composer-story-scene.png` — le composer story, toucher la scène vide puis viseur armé en CARTE.
8. `8-composer-story-plein-ecran.png` — le même viseur après « plein écran ».

Puis rendre le simulateur propre : `xcrun simctl terminate "$UDID" me.meeshy.app` (le simulateur reste sur staging ; aucune session de production ouverte).

- [ ] **Step 3: Publier le compte rendu de recette**

Charger le skill `artifact-design`, écrire `$SHOTS/recette-capture-unifiee.html` (titre « Recette capture unifiée », les huit captures en grille, une ligne de légende chacune, l'URL du run CI, la date), puis le publier par l'outil `Artifact` (`icon: "camera"`). Garder l'URL.

- [ ] **Step 4: Clore les lots d'interface, puis commenter chaque lot**

Les lots 5 à 8 se ferment ICI, une fois leurs captures prises :

```bash
cd /Users/smpceo/Documents/v2_meeshy
git commit --allow-empty -m "chore(ios): recette au simulateur de la capture unifiée — rail, bande, édition, découpe, composer (Closes #9351, Closes #9352, Closes #9353, Closes #9354)"
git pull --rebase --autostash origin dev && git push origin HEAD:dev
for n in 9351 9352 9353 9354; do status $n Done; done
```

Pour chaque issue #9347 → #9354, sur ce modèle (adapter les dimensions) :

```bash
gh issue comment 9351 --body "$(cat <<'MD'
Livré sur `dev` — preuve : commits `<sha court>…<sha court>`, CI iOS complète verte (<URL du run>), recette au simulateur (<URL du compte rendu>, captures 1-4).

**Dimensions mûres** : 1 Sécurité (aucune donnée nouvelle ; la caméra de recette est DEBUG + simulateur) · 5 Accès (actions VoiceOver photo/vidéo sur la scène et la miniature, cibles 44 pt, Reduce Motion) · 6 Positionnement (mêmes gestes dans les deux montages) · 7 Usage (photo = 2 touchers, vidéo = 1 appui long) · 9 Compatibilité (iOS 16 → 26, fermetures async annotées) · 11 Maintenabilité (une table de gestes, un peintre) · 12 Simplicité · 13 Complétude iOS.
**Restant** : 2 / 3 / 4 Performance, mémoire, fluidité — mesure Instruments sur iPhone 12 (issue #<n>) · 10 Utilité — usage à mesurer · web : #9355 · Android Kotlin gelé : le miroir n'a rien reçu (dette consignée, directive 2026-09-16).
MD
)"
```

Ouvrir, si elle n'existe pas, l'issue de mesure (même milestone, `Status = Todo`) : « La capture unifiée est mesurée sur iPhone 12 : un passage par image, ms GPU par image, palier thermique après 5 min de bande ouverte » — critère de fin : Metal System Trace + Energy Log + Time Profiler + Allocations joints (spec § 5). Sur le parent #9346 : un commentaire d'état (huit lots iOS livrés, web #9355 ouvert) — le parent reste OUVERT tant que #9355 l'est.

- [ ] **Step 5: Vérifier les deux sens**

```bash
for n in 9347 9348 9349 9350 9351 9352 9353 9354; do gh issue view $n --json state -q "\"$n \" + .state"; done
gh issue view 9346 --json state -q .state
gh issue view 9355 --json state -q .state
```

Expected : les huit lots `CLOSED` ; #9346 et #9355 `OPEN` (le second ne rougit jamais tout seul : c'est exprès qu'on le relit).
