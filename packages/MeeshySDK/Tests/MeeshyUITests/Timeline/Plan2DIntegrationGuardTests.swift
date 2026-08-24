import XCTest
import CryptoKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Garde de source pour D3 : le plan REMPLACE le conteneur mono-piste.
///
///   1. Le conteneur RACINE (`StoryTimelineHost` — c'est lui que
///      `TimelineSheetContent` construit en réponse à
///      `bandStateMachine.openTimeline`, identifié au premier pas et figé
///      ici) référence `Plan2DView` et ne référence plus `StoryTimelineView`
///      (la vue mono-piste remplacée — gardée par ailleurs pour ses propres
///      tests, mais plus le point d'entrée).
///   2. `Views/Inspector` reste référencé (S4 : l'édition de keyframes n'a
///      pas bougé) — et l'inspecteur timing gagne l'action « Suivre la
///      slide » (remise de `timing` à `nil`, revue totale U9) : garde de
///      source sur le LIBELLÉ (`ClipInspector`) et sur le NIL
///      (`TimelineViewModel+Plan4Helpers`).
///   3. `ComposerControlsLayer` (Story/Controls/, hors ownership de ce lot)
///      N'EST PAS TOUCHÉ — hash de contenu épinglé, pas un `git diff` (pas de
///      dépendance à l'état du dépôt / d'un remote pour faire tourner un test).
final class Plan2DIntegrationGuardTests: XCTestCase {

    // MARK: - Guard 1 — le conteneur racine bascule sur Plan2DView

    func test_storyTimelineHost_referencesPlan2DView() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("Plan2DView("),
                     "StoryTimelineHost (conteneur racine) doit construire Plan2DView")
    }

    func test_storyTimelineHost_noLongerReferencesTheReplacedSingleLaneView() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertFalse(source.contains("StoryTimelineView"),
                       "Le conteneur racine ne doit plus référencer la vue mono-piste remplacée")
    }

    /// Contrôle positif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsAStoryTimelineViewReference() {
        let sample = "struct Fake { var body: some View { StoryTimelineView(viewModel: vm) } }"
        XCTAssertTrue(sample.contains("StoryTimelineView"))
    }

    // MARK: - Guard 2a — Views/Inspector reste référencé (S4)

    func test_storyTimelineHost_stillPresentsTheExistingInspector() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains(".timelineInspectorSheet("),
                     "L'édition de keyframes/clips reste celle de Views/Inspector (S4) — inchangée par D3")
    }

    // MARK: - Guard 2b — l'inspecteur gagne « Suivre la slide » (libellé + nil)

    func test_clipInspector_carriesTheFollowSlideLabel() throws {
        let source = try Self.strippedSource(of: Self.clipInspectorURL)
        XCTAssertTrue(source.contains("story.timeline.inspector.followSlide"),
                     "L'action « Suivre la slide » doit exister comme libellé/clé dans ClipInspector")
        XCTAssertTrue(source.contains("onFollowSlide"),
                     "Le callback doit exister sur ClipInspector — l'appelant (D3) décide de la mutation")
    }

    /// Revue Opus, mineur 9 : la planche P8 (`views.html:1687`) fige l'icône
    /// du retour fantôme U9 à `arrow.uturn.backward.circle` — `ClipInspector`
    /// dessinait `arrow.uturn.backward` (sans `.circle`), une glyphe DIFFÉRENTE.
    func test_clipInspector_followSlideIcon_matchesTheSymbolTable() throws {
        let source = try Self.strippedSource(of: Self.clipInspectorURL)
        XCTAssertTrue(source.contains(#"systemImage: "arrow.uturn.backward.circle""#),
                     "L'icône de « Suivre la slide » doit être arrow.uturn.backward.circle "
                     + "(table des symboles, views.html:1687) — pas arrow.uturn.backward seul")
    }

    func test_timelineViewModel_followSlide_resetsTimingToNil() throws {
        let source = try Self.strippedSource(of: Self.timelineViewModelPlan4HelpersURL)
        guard let range = source.range(of: "func followSlide(") else {
            return XCTFail("TimelineViewModel doit porter followSlide(id:)")
        }
        let body = String(source[range.lowerBound...].prefix(2000))
        XCTAssertTrue(body.contains("startTime = nil") && body.contains("duration = nil"),
                     "followSlide doit remettre start ET duration à nil (O4 : timing == nil = fantôme)")
    }

    /// Contrôle positif : la garde doit réellement détecter l'ABSENCE du nil.
    func test_guardDetectsAFollowSlideThatNeverResetsTiming() {
        let sample = """
        func followSlide(id: String) {
            project.mediaObjects[0].startTime = 0
        }
        """
        XCTAssertFalse(sample.contains("startTime = nil") && sample.contains("duration = nil"))
    }

    // MARK: - Guard 2c — tête de lecture + scrub + règle graduée du plan
    //
    // Le premier passage remplaçait le conteneur mono-piste par `Plan2DView`
    // SEUL : la tête de lecture (`TimelineScrubArea`), le scrub, le pinch et
    // la règle LABELLISÉE disparaissaient — `viewModel.scrub`/`beginScrub`/
    // `endScrub` n'avaient plus AUCUN appelant côté UI, et `addKeyframeAtPlayhead`/
    // `splitSelectedAtPlayhead` opéraient silencieusement à t≈0 (régression
    // constatée, corrigée ici). Plutôt que réinventer un scrub bespoke dans
    // la géométrie du plan (deux mappings temps→x incompatibles,
    // `Plan2DLayout.x` contre `TimelineGeometry.x`), le conteneur RÉUTILISE
    // `RulerView`/`PlayheadView` (gestes de scrub déjà construits, testés)
    // via `Plan2DView.equivalentGeometry` — la conversion pure qui les fait
    // coïncider exactement avec le repère du plan.

    func test_storyTimelineHost_reusesRulerViewForScrub() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("RulerView("),
                     "La tête de lecture doit réutiliser RulerView (scrub déjà construit) plutôt qu'un Canvas bespoke")
        XCTAssertTrue(source.contains("viewModel.scrub("),
                     "Le scrub doit atteindre viewModel.scrub(to:) — sinon addKeyframeAtPlayhead/splitSelectedAtPlayhead restent aveugles")
    }

    func test_storyTimelineHost_reusesPlayheadViewForTheIndicator() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("PlayheadView("),
                     "La tête de lecture visible doit réutiliser PlayheadView plutôt qu'une ligne bespoke")
    }

    func test_storyTimelineHost_scrubGeometryIsThePlansEquivalentGeometry() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("Plan2DView.equivalentGeometry("),
                     "RulerView/PlayheadView doivent recevoir la géométrie ÉQUIVALENTE du plan — "
                     + "sinon leurs graduations/scrub désynchronisent des barres dessinées par Plan2DLayout.x")
    }

    // MARK: - Guard 2d — chrome d'ouverture/fermeture + transitions inter-clips

    func test_storyTimelineHost_showsTheOpeningClosingChrome() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("TransitionChromeLane("),
                     "Le chrome ouverture/fermeture de slide doit rester visible (perdu par le premier passage)")
    }

    func test_storyTimelineHost_keepsPerClipTransitionsReachable() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("TransitionJunctionResolver.resolve("),
                     "Les jonctions inter-clips doivent être résolues — sinon aucune transition existante n'est plus affichée")
        XCTAssertTrue(source.contains("TransitionBadge(") && source.contains("TransitionCreationBadge("),
                     "La création ET l'édition d'une transition existante doivent rester atteignables (badges existants réutilisés, pas réinventés)")
    }

    // MARK: - Guard 2e — TransitionChromeLane partage le MÊME repère que la
    // règle/tête de lecture/plan, pas une TimelineGeometry indépendante
    //
    // `TransitionChromeLane.badgeWidth` dérive du `geometry` reçu pour
    // convertir les 1,2s fixes (`StoryRenderer.slideTransitionDuration`) en
    // largeur de pixels. Si ce `geometry` n'est pas le MÊME
    // `Plan2DView.equivalentGeometry` que RulerView/PlayheadView reçoivent,
    // la largeur des badges d'ouverture/fermeture ne représente pas 1,2s sur
    // l'axe temporel du plan — exactement la désynchronisation de repère que
    // `equivalentGeometry` a été créée pour supprimer.

    func test_storyTimelineHost_transitionChromeLaneSharesThePlansEquivalentGeometry() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        guard let range = source.range(of: "TransitionChromeLane(") else {
            return XCTFail("StoryTimelineHost doit construire TransitionChromeLane")
        }
        let body = String(source[range.upperBound...].prefix(400))
        XCTAssertTrue(body.contains("geometry: equivalentGeometry"),
                     "TransitionChromeLane doit recevoir la MÊME géométrie que RulerView/PlayheadView — "
                     + "sinon la largeur de ses badges ne représente pas la même échelle temporelle que le reste du plan")
        XCTAssertFalse(body.contains("geometry: TimelineGeometry(zoomScale:"),
                      "TransitionChromeLane ne doit plus recevoir une TimelineGeometry brute, indépendante du repère du plan")
    }

    /// Contrôle positif : la garde doit réellement détecter l'ABSENCE de la règle.
    func test_guardDetectsAMissingRulerView() {
        let sample = "struct Fake { var body: some View { Plan2DView(...) } }"
        XCTAssertFalse(sample.contains("RulerView("))
    }

    // MARK: - Guard 2f — capacités de l'ancien conteneur, rendues au plan
    //
    // Le swap avait laissé sans surface trois capacités que la barre de
    // l'ancien conteneur portait : le mute PAR CLIP (bouton sur la barre
    // vidéo/audio), les échos d'un fond qui BOUCLE (`LoopRepeatOverlay`) et
    // le déplacement temporel d'un clip AU DOIGT. Elles reviennent par
    // réutilisation des composants et des méthodes existants — jamais par
    // réinvention.

    func test_clipInspector_carriesTheMuteAction() throws {
        let source = try Self.strippedSource(of: Self.clipInspectorURL)
        XCTAssertTrue(source.contains("onToggleMute"),
                     "Le mute par clip doit exister comme action sur ClipInspector")
        XCTAssertTrue(source.contains("story.timeline.inspector.mute"),
                     "L'action doit porter un libellé localisé, pas une icône muette")
        XCTAssertTrue(source.contains("Button(action: onToggleMute)"),
                     "Le bouton doit réellement déclencher l'action — une propriété non rendue serait un contrôle mort")
    }

    func test_timelineInspectorHost_wiresTheMuteActionToTheUndoableToggle() throws {
        let source = try Self.strippedSource(of: Self.timelineInspectorHostURL)
        XCTAssertTrue(source.contains("viewModel.toggleClipMute("),
                     "Le mute de la fiche doit passer par toggleClipMute (annulable, rend le niveau quitté)")
    }

    func test_storyTimelineHost_redrawsTheLoopEchoesOfALoopingBackground() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("LoopRepeatOverlay("),
                     "Un fond qui boucle doit retrouver ses échos — sinon sa piste se lit comme « le fond disparaît »")
        XCTAssertTrue(source.contains("Self.loopEchoes("),
                     "Les échos doivent venir du calcul PUR, pas d'un filtrage inline dans la vue")
    }

    func test_storyTimelineHost_loopEchoesShareThePlansEquivalentGeometry() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        guard let range = source.range(of: "LoopRepeatOverlay(") else {
            return XCTFail("StoryTimelineHost doit construire LoopRepeatOverlay")
        }
        let body = String(source[range.upperBound...].prefix(400))
        XCTAssertTrue(body.contains("geometry: geometry") || body.contains("geometry: equivalentGeometry"),
                     "Les échos doivent partager le repère du plan — sinon leurs tuiles ne tombent pas sur les mêmes secondes que les barres")
    }

    /// Revue Opus, mineur 17 : les échos doivent aussi partager la fenêtre
    /// VERTICALE de la barre qu'ils prolongent — sinon ils tombent au bon
    /// endroit sur l'axe du temps mais flottent au-dessus/en-deçà d'elle sur
    /// l'axe vertical (deux marges indépendantes qui dérivaient).
    func test_storyTimelineHost_loopEchoesShareThePlansVerticalFrame() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("Plan2DView.loopEchoVerticalFrame("),
                     "loopEchoOverlay doit dériver sa fenêtre verticale de Plan2DView.loopEchoVerticalFrame — "
                     + "MÊME source que la marge de la barre .timed, jamais deux littéraux indépendants")
    }

    /// Le plan et le scroller de l'hôte se disputaient le même doigt : le trim
    /// et le déplacement armé s'appliquaient PENDANT que le contenu pannait
    /// dessous (revue Opus, constat 5). L'hôte doit donc écouter le verrou que
    /// le plan pose sur le geste.
    func test_storyTimelineHost_stopsTheScrollerWhileThePlanHoldsTheGesture() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("onScrollLockChanged:"),
                     "L'hôte doit recevoir le verrou de geste du plan")
        XCTAssertTrue(source.contains(".scrollDisabled("),
                     "Et le traduire en immobilité du scroller — sinon le contenu continue de panner sous le doigt")
    }

    // MARK: - Guard 2g — l'aimant lit l'échelle DU PLAN
    //
    // Le lot a introduit un second repère temps→pixels
    // (`Plan2DView.equivalentGeometry`, partagé par la règle, la tête de
    // lecture et le chrome) pendant que la tolérance d'aimantation continuait
    // de lire le `zoomScale` continu du transport : les deux n'avaient plus
    // aucun rapport (revue Opus, constat 6).

    func test_timelineViewModel_neverDerivesItsMagnetToleranceFromTheTransportZoom() throws {
        let source = try Self.strippedSource(of: Self.timelineViewModelURL)
        XCTAssertFalse(source.contains("TimelineGeometry(zoomScale: zoomScale)"),
                       "La tolérance d'aimantation ne doit plus se fabriquer une géométrie depuis le curseur du transport")
        XCTAssertTrue(source.contains("geometry.dragSnapToleranceSeconds"),
                     "Elle doit dériver de la géométrie que l'appelant DESSINE")
    }

    func test_storyTimelineHost_feedsTheMagnetThePlansOwnGeometry() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        guard let range = source.range(of: "viewModel.dragClipMoved(") else {
            return XCTFail("L'hôte doit conduire le glissement par dragClipMoved")
        }
        XCTAssertTrue(String(source[range.upperBound...].prefix(300)).contains("geometry: equivalentGeometry"),
                     "L'aimant doit recevoir le MÊME repère que la règle, la tête de lecture et les barres")
    }

    func test_storyTimelineHost_wiresTheClipTimeDragToTheExistingDragSession() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        XCTAssertTrue(source.contains("viewModel.beginClipDrag("),
                     "Le déplacement temporel doit ouvrir la session de glissement existante (origine capturée UNE fois)")
        XCTAssertTrue(source.contains("viewModel.dragClipMoved("),
                     "Le temps doit se reconstruire depuis l'origine capturée, jamais depuis le modèle déjà muté (dérive boule de neige)")
        XCTAssertTrue(source.contains("viewModel.endClipDrag("),
                     "La session de glissement doit se refermer au relâchement")
    }

    // MARK: - Guard 2h — l'hôte alimente le plan avec la SEULE source de
    // sélection (revue Opus, constat 4 ; rejetée en revue DoD sur D6b : le
    // câblage était corrigé mais sans garde à demeure sur l'hôte lui-même —
    // remplacer `viewModel.selection.selectedClipId` par `nil` compilait et
    // laissait les 14 tests de D6b au vert, exactement la forme du constat.
    // D6a portait déjà une garde d'hôte pour CHACUN de ses câblages dans ce
    // même fichier — `feedsTheMagnetThePlansOwnGeometry`,
    // `wiresTheClipTimeDragToTheExistingDragSession` ci-dessus — la
    // sélection en manquait une symétrique.

    func test_storyTimelineHost_feedsThePlanTheViewModelsSelection() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        guard let range = source.range(of: "Plan2DView(") else {
            return XCTFail("StoryTimelineHost doit construire Plan2DView")
        }
        let body = String(source[range.upperBound...].prefix(600))
        XCTAssertTrue(body.contains("selectedTrackId: viewModel.selection.selectedClipId"),
                     "Le plan doit surligner la piste que le viewModel tient déjà sélectionnée — sinon un selectedClipId changé ne redessine jamais le Canvas (constat 4)")
    }

    // MARK: - Guard 2i — un tap du plan ne pose la sélection QUE si un
    // inspecteur va s'ouvrir (addendum rév. 2, arbitrage 3 ; second volet du
    // constat 1).
    //
    // `ClipSelectionState.inspect()` écrase `selectedClipId` SANS condition :
    // router vers lui un id qu'aucun résolveur ne connaît n'ouvre aucune
    // fiche ET emporte la sélection en cours — l'utilisateur perd sa piste
    // sans rien recevoir en échange. L'hôte doit donc demander à
    // `TimelineInspectorHost` si une fiche s'ouvrirait AVANT de la poser.
    //
    // Garde de SOURCE, comme ses voisines 2g/2h : les tests de comportement
    // (`TimelineInspectorHostRoutingTests`) prouvent la garde elle-même, mais
    // seul le balayage de l'hôte prouve qu'elle est réellement CÂBLÉE — un
    // `viewModel.inspectClip` restauré ici les laisserait tous verts.

    func test_storyTimelineHost_neverPosesASelectionThatNoInspectorResolves() throws {
        let source = try Self.strippedSource(of: Self.storyTimelineHostURL)
        for callback in ["onSelectTrack:", "onSelectKeyframe:"] {
            guard let range = source.range(of: callback) else {
                return XCTFail("L'hôte doit câbler \(callback) sur le plan")
            }
            let body = String(source[range.upperBound...].prefix(200))
            XCTAssertTrue(body.contains("TimelineInspectorHost.inspectIfResolvable("),
                         "\(callback) doit passer par la garde — sinon un id sans inspecteur "
                         + "efface la sélection en cours sans rien ouvrir (constat 1)")
            XCTAssertFalse(body.contains("viewModel.inspectClip("),
                          "\(callback) ne doit plus poser la sélection sans garde")
        }
    }

    /// Contrôle positif : la garde doit réellement détecter le câblage nu.
    func test_guardDetectsAnUnguardedInspectClipWiring() {
        let sample = "onSelectKeyframe: { viewModel.inspectClip(id: $0) },"
        XCTAssertFalse(sample.contains("TimelineInspectorHost.inspectIfResolvable("))
        XCTAssertTrue(sample.contains("viewModel.inspectClip("))
    }

    // MARK: - Guard 3 — le diff de D3 ne déborde pas de Timeline/**
    //
    // La garde d'origine n'épinglait QU'UN fichier (`ComposerControlsLayer`)
    // et laissait tout le reste du dépôt hors de vue. Elle est étendue en
    // trois temps :
    //
    //   a. le MANIFESTE du diff — la liste des fichiers que D3 touche est
    //      écrite ici ; chacun doit exister, et chacun doit tomber soit dans
    //      le périmètre possédé (`Story/Timeline/**` en source comme en
    //      test), soit dans la liste COURTE et NOMMÉE des écarts assumés ;
    //   b. un balayage de l'arbre : aucun fichier hors `Story/Timeline/**`
    //      ne référence le plan — c'est la fuite d'ownership que le
    //      manifeste seul ne verrait pas (il ne connaît que ce qu'on lui
    //      déclare) ;
    //   c. les hash de contenu des DEUX voisins immédiats hors périmètre :
    //      `ComposerControlsLayer` (l'entrée du composer) et
    //      `TimelineExportFlow` (celui qui PRÉSENTE le conteneur racine).
    //
    // Écart assumé et consigné : `Resources/Localizable.xcstrings` vit hors
    // `Story/Timeline/**` mais est le catalogue UNIQUE du module — toute
    // chaîne neuve du plan doit y entrer pour tenir la règle des 7 langues.
    // Le contourner (littéraux non localisés) coûterait plus cher que
    // l'écart. Second écart : la matrice `docs/superpowers/specs/
    // 2026-08-19-meeshy-composer-views.html`, dont ce lot ne touche QUE sa
    // propre ligne (règle P0 du lot D).

    /// Les DEUX seuls chemins hors périmètre que D3 s'autorise.
    static let declaredOutOfScopePaths: Set<String> = [
        "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings",
        "docs/superpowers/specs/2026-08-19-meeshy-composer-views.html"
    ]

    static let ownedPathPrefixes: [String] = [
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/"
    ]

    /// Le MANIFESTE : tout ce que le lot touche, du premier commit
    /// d'intégration à celui-ci — D6a inclus (gestes, géométrie de
    /// l'aimant : les bancs de glissement qui passent désormais la géométrie
    /// rendue en paramètre en font partie).
    static let d3DiffPaths: [String] = [
        "docs/superpowers/specs/2026-08-19-meeshy-composer-views.html",
        "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Logic/Plan2DLayout.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/ViewModel/TimelineViewModel.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/Plan2DProjectAdapter.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/Plan2DReorderResolver.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineHost.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/StoryTimelineView.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Container/TimelineInspectorHost.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Inspector/ClipInspector.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/TimelineMetrics.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DIntegrationGuardTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DLayoutTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DRenderMeasureTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DRestoredCapabilitiesTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Plan2DViewGuardTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/TimelineLocalizationTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Gesture/AudioTextDragDriftTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Gesture/ClipDragGestureTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Gesture/SnapToPlayheadTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Gesture/TwoFingerDragDisablesSnapTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Offline/OfflineEditFlowTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelDragSnapToleranceTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelFollowSlideTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelNudgeStartTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelSlideDurationTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/ViewModel/TimelineViewModelTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/Plan2DProjectAdapterTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/Plan2DReorderResolverTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/StoryTimelineHost_ReorderTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/TimelineInspectorHost_FollowSlideTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Container/TimelineInspectorHostRoutingTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorSnapshotTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/ClipInspectorTests.swift",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_audioSelected.inspector-audioSelected-dark.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_audioSelected.inspector-audioSelected-light.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_followingSlide_hidesFollowSlideButton.inspector-followingSlide-hidesButton-dark.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_followingSlide_hidesFollowSlideButton.inspector-followingSlide-hidesButton-light.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_noSelection.inspector-noSelection-dark.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_noSelection.inspector-noSelection-light.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_textSelected.inspector-textSelected-dark.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_textSelected.inspector-textSelected-light.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_videoSelected.inspector-videoSelected-dark.png",
        "packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/Inspector/__Snapshots__/ClipInspectorSnapshotTests/test_snapshot_inspector_videoSelected.inspector-videoSelected-light.png"
    ]

    static func isWithinOwnership(_ path: String) -> Bool {
        ownedPathPrefixes.contains { path.hasPrefix($0) } || declaredOutOfScopePaths.contains(path)
    }

    func test_everyFileOfTheD3Diff_exists() {
        for path in Self.d3DiffPaths {
            XCTAssertTrue(
                FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent(path).path),
                "Chemin déclaré au manifeste mais absent du dépôt : \(path)"
            )
        }
    }

    /// Revue Opus, mineur 11 : le manifeste avait trois chemins de retard sur
    /// le diff réel. Deux ont été comblés en cours de D6 (`StoryTimelineView.swift`,
    /// `Plan2DRenderMeasureTests.swift`) ; celui-ci — l'extraction D2 de
    /// `TimelineMetrics.laneHeight` — restait absent malgré son appartenance
    /// au diff (`git diff d36869973..HEAD`).
    func test_d3DiffPaths_includesTimelineMetrics() {
        XCTAssertTrue(
            Self.d3DiffPaths.contains(
                "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/TimelineMetrics.swift"),
            "TimelineMetrics.swift (extraction D2 — laneHeight, cf. Guard 3 de Plan2DViewGuardTests) "
            + "doit figurer au manifeste du diff — absent (mineur 11, revue Opus)"
        )
    }

    func test_everyFileOfTheD3Diff_staysInsideTheOwnedPerimeterOrIsADeclaredException() {
        let strays = Self.d3DiffPaths.filter { !Self.isWithinOwnership($0) }
        XCTAssertEqual(strays, [],
                      "Le lot D ne possède que Timeline/** — tout autre fichier doit être un écart NOMMÉ (catalogue, matrice)")
    }

    /// Contrôle positif : la garde doit réellement rejeter un chemin hors
    /// périmètre non déclaré.
    func test_guardRejectsAFileOutsideThePerimeter() {
        XCTAssertFalse(Self.isWithinOwnership("packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/ComposerControlsLayer.swift"))
        XCTAssertFalse(Self.isWithinOwnership("apps/ios/Meeshy.xcodeproj/project.pbxproj"))
        XCTAssertTrue(Self.isWithinOwnership("packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Plan2D/Plan2DView.swift"))
    }

    /// Balayage de l'ARBRE, pas du manifeste : le plan ne doit avoir fuité
    /// dans aucun fichier hors `Story/Timeline/**`. Revue Opus, mineur 11 :
    /// l'origine ne parcourait que `Sources/MeeshyUI` — une fuite dans
    /// `Sources/MeeshySDK` (l'autre cible du même package) y était invisible
    /// par construction. `filesReferencingPlan2D` factorise le balayage pour
    /// que les deux racines le partagent réellement, pas deux copies qui
    /// pourraient diverger.
    func test_noFileOutsideTimeline_referencesThePlan() throws {
        let offenders = try Self.filesReferencingPlan2D(under: Self.sourcesRoot, excludingPrefix: "Story/Timeline/")
        XCTAssertEqual(offenders, [],
                      "Le plan 2D appartient à Timeline/** — aucune fuite hors périmètre")
    }

    /// Revue Opus, mineur 11, second volet : `Sources/MeeshySDK` — la cible
    /// core du MÊME package, hors ownership de ce lot — n'était balayée par
    /// personne. Balayage RÉEL, SANS ÉCRITURE : aucune fuite du plan
    /// aujourd'hui dans `Sources/MeeshySDK`.
    ///
    /// Corrigé après revue DoD (constat 3) : la version précédente PROUVAIT
    /// la détection en écrivant `__Plan2DLeakProbe.swift` DANS
    /// `Sources/MeeshySDK` — l'arbre source VIVANT du package. Un process
    /// tué entre l'écriture et le `defer` (Ctrl-C, crash d'un test voisin,
    /// timeout, kill de l'orchestrateur) laissait un résidu qui NE COMPILE
    /// PAS : il référence `Plan2DTrack` (défini dans `MeeshyUI`), alors que
    /// `Package.swift` fait dépendre `MeeshyUI` de `MeeshySDK` — jamais
    /// l'inverse — et le build SUIVANT de la cible `MeeshySDK` cassait. La
    /// preuve de détection vit désormais dans le test suivant, dans un
    /// répertoire jetable.
    func test_noFileOutsideMeeshyUI_referencesThePlan_sdkTargetIncluded() throws {
        let offenders = try Self.filesReferencingPlan2D(under: Self.sdkSourcesRoot, excludingPrefix: nil)
        XCTAssertEqual(offenders, [],
                      "Sources/MeeshySDK est hors ownership de ce lot — aucune fuite du plan n'y est attendue")
    }

    /// Contrôle positif du balayage — sur `Sources/MeeshySDK` précisément
    /// (`excludingPrefix: nil`, comme le test réel ci-dessus), dans un
    /// répertoire TEMPORAIRE jetable plutôt que dans l'arbre source vivant
    /// (constat 3, revue DoD) : `filesReferencingPlan2D` est déjà paramétrée
    /// par sa racine — pointer le contrôle positif ailleurs coûte une ligne.
    func test_treeScan_sdkTarget_detectsAPlanLeak_inATemporaryDirectory() throws {
        let probeRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("Plan2DLeakProbe-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: probeRoot, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: probeRoot) }

        let leakURL = probeRoot.appendingPathComponent("__Plan2DLeakProbe.swift")
        try "struct Plan2DLeakProbe { let track: Plan2DTrack? = nil }"
            .write(to: leakURL, atomically: true, encoding: .utf8)

        let offenders = try Self.filesReferencingPlan2D(under: probeRoot, excludingPrefix: nil)
        XCTAssertEqual(offenders, ["__Plan2DLeakProbe.swift"],
                      "Une fuite Plan2D doit être détectée par le balayage — prouvé ici sans jamais "
                      + "écrire dans l'arbre source vivant du package (mineur 11 / constat 3)")
    }

    /// Contrôle positif du balayage : le motif cherché est bien celui qui
    /// trahirait une fuite.
    func test_treeScanDetectsAPlanReferenceInASample() {
        XCTAssertTrue("struct Fake { let tracks: [Plan2DTrack] = [] }".contains("Plan2D"))
        XCTAssertFalse("struct Fake { let tracks: [TrackBar] = [] }".contains("Plan2D"))
    }

    /// Balayage PUR, partagé par les deux racines ci-dessus — `excludingPrefix`
    /// exempte le périmètre possédé (`Story/Timeline/` sous `Sources/MeeshyUI`)
    /// ; `nil` ne exempte rien (`Sources/MeeshySDK` n'a AUCUN sous-arbre possédé
    /// par ce lot).
    private static func filesReferencingPlan2D(under root: URL, excludingPrefix: String?) throws -> [String] {
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else {
            throw NSError(domain: "Plan2DIntegrationGuardTests", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "\(root.path) doit être parcourable"])
        }
        var offenders: [String] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            if let excludingPrefix, relative.hasPrefix(excludingPrefix) { continue }
            let source = try String(contentsOf: url, encoding: .utf8)
            if source.contains("Plan2D") { offenders.append(relative) }
        }
        return offenders
    }

    // MARK: - Guard 3c — les deux voisins immédiats hors périmètre

    func test_timelineExportFlow_contentIsUnchanged() throws {
        let data = try Data(contentsOf: Self.timelineExportFlowURL)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(
            digest,
            "de4d954b0876b86e2e0569ceec31029967e4fb8e7f4f68ec682ad5af9363f54c",
            "TimelineExportFlow.swift PRÉSENTE le conteneur racine mais n'appartient pas à ce lot — aucune ligne ne doit bouger"
        )
    }

    /// **Le hash a été remplacé par l'invariant qu'il servait — 2026-08-24.**
    ///
    /// Cette garde figeait `ComposerControlsLayer.swift` par empreinte SHA-256,
    /// au titre que le fichier « n'appartient pas à ce lot ». C'était vrai, et
    /// c'était utile TANT QUE le lot D était en vol : l'empreinte prouvait que
    /// le Plan 2D ne débordait pas sur un voisin.
    ///
    /// Le lot D est mergé (`24d1bf752`). Ce qui reste du hash n'est plus un
    /// invariant mais un instantané : il interdit à QUICONQUE, désormais et pour
    /// toujours, de toucher un fichier de contrôles de composer — alors que ces
    /// contrôles appartiennent au lot C, qui les fait légitimement évoluer (C7 y
    /// relaie le texte alternatif et l'extraction de son jusqu'au point de
    /// publication).
    ///
    /// L'invariant RÉEL — « le Plan 2D ne fuit pas hors de `Story/Timeline/` » —
    /// n'est pas perdu : il est porté par
    /// `test_noPlan2DReferenceLeaksOutsideTheTimeline` (l. 470), dont le balayage
    /// couvre `Story/Controls/`, et dont le contrôle positif prouve qu'il sait
    /// rougir. Cette garde-ci le REDIT sur le seul fichier nommé, ce qui la rend
    /// falsifiable sans figer une ligne : elle rougit si `Plan2D` réapparaît ici,
    /// jamais parce qu'un autre lot a fait son travail.
    func test_composerControlsLayer_carriesNoPlan2DReference() throws {
        let source = try String(contentsOf: Self.composerControlsLayerURL, encoding: .utf8)
        XCTAssertFalse(
            source.contains("Plan2D"),
            "Le Plan 2D ne déborde pas sur la couche de contrôles du composer — voisin hors périmètre du lot D"
        )
    }

    // MARK: - Helpers (garde de source)

    /// Le fichier vit dans `Tests/MeeshyUITests/Timeline/` : QUATRE remontées
    /// avant de redescendre dans `Sources` (même profondeur que
    /// `Plan2DViewGuardTests`).
    private static var sourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI")
    }

    /// La cible core DU MÊME package (`packages/MeeshySDK/Sources/MeeshySDK`)
    /// — hors ownership de ce lot, mais un balayage qui ne la couvre pas
    /// laisse passer une fuite du plan (mineur 11, revue Opus).
    private static var sdkSourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshySDK")
    }

    private static var storyTimelineHostURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/Views/Container/StoryTimelineHost.swift")
    }

    private static var clipInspectorURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/Views/Inspector/ClipInspector.swift")
    }

    private static var timelineViewModelPlan4HelpersURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/ViewModel/TimelineViewModel+Plan4Helpers.swift")
    }

    private static var timelineViewModelURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/ViewModel/TimelineViewModel.swift")
    }

    private static var timelineInspectorHostURL: URL {
        sourcesRoot.appendingPathComponent("Story/Timeline/Views/Container/TimelineInspectorHost.swift")
    }

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Timeline
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .deletingLastPathComponent()   // packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    private static var timelineExportFlowURL: URL {
        sourcesRoot.appendingPathComponent("Story/TimelineExportFlow.swift")
    }

    private static var composerControlsLayerURL: URL {
        sourcesRoot.appendingPathComponent("Story/Controls/ComposerControlsLayer.swift")
    }

    private static func strippedSource(of url: URL) throws -> String {
        strippingLineComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func strippingLineComments(_ source: String) -> String {
        source
            .components(separatedBy: "\n")
            .map { line -> String in
                guard let range = line.range(of: "//") else { return line }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }
}
