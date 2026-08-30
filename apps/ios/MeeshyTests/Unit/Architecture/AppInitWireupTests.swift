import XCTest
import MeeshySDK
import MeeshyUI

/// P3 wire-up invariant tests.
///
/// `MeeshyMetricsSubscriber.shared.register()` must be wired into the launch
/// sequence alongside `CrashDiagnosticsManager.shared.install(...)`: it attaches
/// to `MXMetricManager` so the `MXSignpostMetric` entries produced by
/// `TimelineSignposter` are actually aggregated into the 24h rolling window.
/// Without this call the entries appear in Instruments but no payload is ever
/// delivered to `didReceive(_:)`.
///
/// `MeeshyMetricsSubscriber` guards its registration state with a private
/// `OSAllocatedUnfairLock<Bool>` — no public getter, and `MXMetricManager.shared`
/// doesn't expose its subscriber list. The pragmatic invariant — and the one
/// that catches the actual regression (a developer accidentally removing the
/// call) — is a source-scan of `AppDelegate.swift`, mirroring the approach taken
/// by `SingleSourceOfTruthTests` for the optimistic-mutation invariant.
@MainActor
final class AppInitWireupTests: XCTestCase {

    // MARK: - Source-scan invariants

    func test_app_init_calls_metricsSubscriber_register() throws {
        let body = try appDelegateLaunchBody()
        XCTAssertTrue(
            body.contains("MeeshyMetricsSubscriber.shared.register()"),
            "P3 wire-up regression: AppDelegate.application(_:didFinishLaunchingWithOptions:) "
                + "must call MeeshyMetricsSubscriber.shared.register() so MXSignpostMetric "
                + "entries produced by TimelineSignposter are aggregated. Without this call "
                + "no MetricKit payload ever arrives and the 24h rolling window stays empty."
        )
    }

    func test_wireup_lives_in_same_MainActor_hop_as_crashDiagnostics() throws {
        // The metrics register is @MainActor-isolated. It MUST share the
        // MainActor hop that already installs CrashDiagnosticsManager so we
        // don't multiply the number of trampolines into MainActor at cold
        // start. The order inside the hop is also load-bearing — crash
        // diagnostics first (so any crash during wire-up is captured), then
        // the metrics subscriber, then AnalyticsManager.
        let body = try appDelegateLaunchBody()
        guard let crashRange = body.range(of: "CrashDiagnosticsManager.shared.install"),
              let registerRange = body.range(of: "MeeshyMetricsSubscriber.shared.register"),
              let analyticsRange = body.range(of: "AnalyticsManager.shared.syncCollectionState")
        else {
            XCTFail("Could not locate the three MainActor-hop calls in AppDelegate.swift")
            return
        }
        XCTAssertLessThan(
            crashRange.lowerBound,
            registerRange.lowerBound,
            "CrashDiagnosticsManager.install must run BEFORE MeeshyMetricsSubscriber.register "
                + "so any crash during launch wire-up is captured by the observer."
        )
        XCTAssertLessThan(
            registerRange.lowerBound,
            analyticsRange.lowerBound,
            "MeeshyMetricsSubscriber.register stays clustered with the other launch "
                + "wire-ups, just before AnalyticsManager."
        )
    }

    // MARK: - VoIP push registration timing

    /// `VoIPPushManager.shared.register()` must run INLINE in
    /// `didFinishLaunchingWithOptions`, not deferred via `Task { @MainActor in }`.
    /// The method is itself `@MainActor`-isolated (same as the
    /// `BackgroundTaskManager.shared.registerTasks()` call immediately above it,
    /// which is already called directly) — wrapping it in a `Task` doesn't change
    /// *where* it runs, only *when*: it defers `register()` to a later run-loop
    /// turn instead of the current synchronous launch path. That reopens the
    /// exact race the surrounding comment says this call was moved into
    /// `AppDelegate` to close — a VoIP push delivered at the moment of launch
    /// could reach the OS before `PKPushRegistry` exists, since PushKit has no
    /// obligation to wait for a later run-loop turn.
    func test_app_init_registersVoIPPushSynchronously() throws {
        let body = try appDelegateLaunchBody()
        XCTAssertTrue(
            body.contains("\n        VoIPPushManager.shared.register()"),
            "AppDelegate.application(_:didFinishLaunchingWithOptions:) must call "
                + "VoIPPushManager.shared.register() as a direct top-level statement "
                + "(8-space launch-body indent), not nested inside a Task block — see "
                + "test_app_init_doesNotDeferVoIPPushRegistrationInATask for why."
        )
    }

    /// Twin of the above: proves the call is NOT nested one indent level deeper
    /// inside a `Task { @MainActor in ... }`, which is what silently reintroduces
    /// the deferred-registration race without breaking the simpler `.contains`
    /// check above (a `Task` wrapper still contains the same call text).
    func test_app_init_doesNotDeferVoIPPushRegistrationInATask() throws {
        let body = try appDelegateLaunchBody()
        XCTAssertFalse(
            body.contains("            VoIPPushManager.shared.register()"),
            "VoIPPushManager.shared.register() must not be indented as the sole "
                + "statement of a Task block in didFinishLaunchingWithOptions — that "
                + "defers PushKit registration past the current launch turn, reopening "
                + "the 'registry doesn't exist yet when the push arrives' race."
        )
    }

    // MARK: - Runtime smoke (symbol availability)

    /// Cheap proof that the symbol exists with the expected signature from the
    /// imported target. If a future refactor renames or removes it the
    /// source-scan tests above still pass, but this test fails at compile time —
    /// making the breakage impossible to miss.
    @MainActor
    func test_wireup_symbols_are_callable() {
        // Verified via launch instrumentation in production; this call site is a
        // compile-time guard, not a behaviour assertion. The call is idempotent
        // so invoking it in the test harness is a no-op after the first run.
        MeeshyMetricsSubscriber.shared.register()
    }

    // MARK: - Gate iOS : `meeshy.sh test` doit exécuter les tests du SDK

    /// `./apps/ios/meeshy.sh test` est LE gate exigé avant tout commit iOS
    /// (CLAUDE.md racine). Il ne lançait que le bundle de l'app
    /// (`-only-testing:MeeshyTests`) : n'importe quel test rouge sous
    /// `packages/MeeshySDK/Tests/**` restait invisible en local et n'apparaissait
    /// qu'au push, dans `sdk-tests.yml`. Deux tests de `LocationModelsTests` ont
    /// ainsi survécu à trois commits.
    func test_meeshyShTestGate_runsTheMeeshySDKPackageSuite() throws {
        let body = try scriptBody(of: "do_test() {", upTo: "# ─── Setup")

        XCTAssertTrue(
            body.contains("-scheme MeeshySDK-Package"),
            "meeshy.sh test doit lancer la suite du package MeeshySDK (scheme MeeshySDK-Package) : "
                + "sinon les tests de packages/MeeshySDK/Tests ne sont exercés que par sdk-tests.yml, au push."
        )
        XCTAssertTrue(
            body.contains("p0 != 0"),
            "L'exit code de la suite SDK doit entrer dans le verdict du gate — une phase dont "
                + "l'échec ne fait pas rougir le script ne prouve rien (cf. le `|| true` des UI tests)."
        )
    }

    // MARK: - Composer de story : le sélecteur de lieu vient de l'app

    /// Le composer de story vit au SDK ; le sélecteur de lieu, non (MapKit,
    /// CoreLocation, `MediaPermissionCoordinator`, catalogue `.main`). Le SDK
    /// expose donc `\.storyLocationPicker` et l'app l'alimente. Un site de
    /// présentation qui oublie l'injection rend le chip « Lieu » invisible : la
    /// pastille redevient inatteignable, sans le moindre signal.
    func test_everyStoryComposerPresentation_injectsTheLocationPicker() throws {
        for path in Self.storyComposerPresentationSites {
            let src = try appSource(path)
            let presentations = occurrences(of: "StoryComposerView(", in: src)
                + occurrences(of: "UnifiedPostComposer(", in: src)
            let injections = occurrences(of: ".storyLocationPickerProvided()", in: src)
            XCTAssertGreaterThan(presentations, 0, "\(path) ne présente plus de composer de story ?")
            XCTAssertEqual(
                injections, presentations,
                "\(path) : chaque présentation du composer doit injecter le picker de lieu "
                    + "(.storyLocationPickerProvided()) — sinon le chip « Lieu » n'est pas rendu."
            )
        }
    }

    /// S5 — mêmes causes, mêmes effets : la caméra (AVCaptureSession,
    /// permissions), la pellicule (PhotoKit) et la lecture du presse-papier
    /// (`NSItemProvider`, autorisation sandbox) restent app-side, le composer
    /// SDK expose TROIS points d'injection. Un site de présentation qui les
    /// oublie fait disparaître les amorces de la page blanche SANS le moindre
    /// signal — c'est exactement ce que ce jumeau du garde-fou « Lieu »
    /// interdit.
    ///
    /// C5b l'a vérifié dans le mauvais sens : `storyPasteProvided()` a été
    /// écrit, testé, et n'a JAMAIS été appelé — donc `\.storyPaste` restait
    /// `nil` partout, donc `BlankCanvasPasteStarter` ne rendait rien sur aucun
    /// écran. Cette garde ne connaissait que deux des trois injections : c'est
    /// l'omission qu'elle couvre désormais.
    func test_everyStoryComposerPresentation_injectsTheBlankCanvasStarters() throws {
        let injections = [
            ".storyCameraCaptureProvided()":
                "sans injection caméra, l'amorce « Caméra » n'est pas rendue.",
            ".storyRecentCameraRollProvided()":
                "sans injection pellicule, la vignette « dernière photo » n'est pas rendue.",
            ".storyPasteProvided()":
                "sans injection presse-papier, la capsule « Coller » n'est pas rendue — "
                    + "`\\.storyPaste` reste nil et `BlankCanvasPasteStarter` rend un corps vide."
        ]
        for path in Self.storyComposerPresentationSites {
            let src = try appSource(path)
            let presentations = occurrences(of: "StoryComposerView(", in: src)
                + occurrences(of: "UnifiedPostComposer(", in: src)
            XCTAssertGreaterThan(presentations, 0, "\(path) ne présente plus de composer de story ?")
            for (modifier, why) in injections {
                XCTAssertEqual(
                    occurrences(of: modifier, in: src), presentations,
                    "\(path) : \(why)"
                )
            }
        }
    }

    /// Tous les fichiers qui MONTENT un composer de story eux-mêmes : un site
    /// oublié par ce garde-fou est un site où les amorces de page blanche
    /// disparaissent sans le moindre signal. `MeeshyComposerHost` (C3) en fait
    /// partie — c'est le meuble qui enveloppe l'atelier, donc un site de
    /// présentation à part entière.
    ///
    /// V3-2 — `StoryTrayActions` en est SORTI, et c'est un acquis, pas un
    /// oubli : la porte de création délègue désormais au meuble, qui pose les
    /// fournisseurs au plus près de l'atelier. Les reposer sur le cover en
    /// empilerait DEUX couches — la dernière gagne, en silence, et le compte
    /// « injections == présentations » cesserait de mesurer quoi que ce soit.
    /// L'invariant côté porte est tenu par
    /// `test_theStoryCreationDoor_mountsTheComposerHost_andLetsItPoseTheProviders`.
    private static let storyComposerPresentationSites = [
        "Meeshy/Features/Main/Views/StoryTrayView.swift",
        "Meeshy/Features/Main/Views/StoryViewerView.swift",
        // #4102 — `composerSurface`, qui PRÉSENTE l'atelier et pose les
        // fournisseurs, a suivi le découpage du meuble vers `+Surfaces`.
        // L'adresse d'une garde suit le montage, jamais le nom du type.
        "Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift"
    ]

    // MARK: - V3-2 : la porte de création monte le MEUBLE, pas l'atelier nu

    /// La porte de création du tray ouvre `MeeshyComposerHost`, qui construit
    /// le ViewModel, adopte le brouillon désigné et pose les fournisseurs
    /// d'environnement. Trois doublons guettaient, tous SILENCIEUX :
    ///
    /// - un second `StoryComposerViewModel` — le host en construit déjà un et
    ///   lui fait adopter le brouillon (`MeeshyComposerHost.init`). En
    ///   fabriquer un ici en laisserait vivre deux : le composer
    ///   s'autosauvegarderait sous un id NEUF et le brouillon repris resterait
    ///   intact à côté, en double — exactement le défaut que l'adoption existe
    ///   pour éviter ;
    /// - un second montage de `StoryComposerView` — la porte cesserait de
    ///   passer par le meuble sans que rien ne rougisse, et le chantier
    ///   redeviendrait invisible ;
    /// - un second jeu de fournisseurs — deux couches se recouvrent sans
    ///   erreur, la dernière gagne, et le compte de la garde de câblage devient
    ///   faux.
    ///
    /// Les trois assertions à zéro tiennent chacune leur objet PARCE QUE la
    /// première, positive, exige que le meuble soit bien là : une porte qui ne
    /// monterait plus rien du tout les rendrait toutes vertes, et
    /// `MeeshyComposerHostGuardTests.test_theHost_hasAtLeastOneProductionCaller`
    /// ferme la dernière issue.
    func test_theStoryCreationDoor_mountsTheComposerHost_andLetsItPoseTheProviders() throws {
        let path = "Meeshy/Features/Main/Views/StoryTrayActions.swift"
        let src = try appSource(path)

        XCTAssertEqual(
            occurrences(of: "MeeshyComposerHost(", in: src), 1,
            "\(path) : la porte de création monte le meuble, une fois et une seule."
        )
        XCTAssertEqual(
            occurrences(of: "StoryComposerViewModel(", in: src), 0,
            "\(path) : le ViewModel du composer appartient au meuble. Un second ici dédoublerait le brouillon repris."
        )
        XCTAssertEqual(
            occurrences(of: "StoryComposerView(", in: src), 0,
            "\(path) : la porte n'ouvre plus l'atelier nu — elle passe par le meuble, sans quoi V3-2 est défait."
        )
        for provider in [".storyLocationPickerProvided()",
                         ".storyCameraCaptureProvided()",
                         ".storyRecentCameraRollProvided()",
                         ".storyPasteProvided()",
                         ".storyStickerLibraryProvided()"] {
            XCTAssertEqual(
                occurrences(of: provider, in: src), 0,
                "\(path) : \(provider) est posé par le meuble. L'empiler ici superpose deux fournisseurs — le dernier gagne, en silence."
            )
        }
    }

    // MARK: - Composer de CRÉATION : l'audience mémorisée ne s'évapore pas

    /// C3 — le piège le plus cher du lot composer, et il est SILENCIEUX.
    ///
    /// `StoryComposerView.init` donne à `initialVisibility` une valeur PAR
    /// DÉFAUT (`PostVisibility.friends`). Un site de création qui l'oublie
    /// compile, tourne, et publie simplement dans la mauvaise audience : la
    /// mémoire du dernier choix (loi 10) disparaît sans un message, sans un
    /// crash, sans un test rouge. C'est exactement ce que cette garde refuse.
    ///
    /// L'ÉDITION en est exclue à dessein, et ce n'est pas une exemption de
    /// confort : `StoryComposerViewModel.editingInitialVisibility` SUPPLANTE le
    /// paramètre dans `init(viewModel:)` (« mode édition : PRIORITÉ ABSOLUE »),
    /// donc un site d'édition qui le passerait ne changerait rien. Une garde
    /// qui l'exigerait quand même ferait rougir du code correct — et serait
    /// désactivée à la première occasion.
    ///
    /// V3-2 — la chaîne de création compte désormais DEUX maillons, et
    /// l'audience doit traverser les deux : la porte la donne au meuble
    /// (`MeeshyComposerHost(`), le meuble la donne à l'atelier
    /// (`StoryComposerView(`). Le site seul ne suffit donc plus à nommer ce
    /// qu'on y cherche — d'où le montage attendu, écrit fichier par fichier.
    /// Un maillon qui l'oublie retombe sur `PostVisibility.friends` sans un mot.
    private static let storyComposerCreationMounts: [(path: String, mount: String)] = [
        ("Meeshy/Features/Main/Views/StoryTrayActions.swift", "MeeshyComposerHost("),
        // Lot 5 — la porte du média REÇU est le second site qui monte une
        // SCÈNE, et l'audience y traverse les mêmes deux maillons. Elle entre
        // ici plutôt que dans une garde à elle : le jour où un troisième site
        // ouvre l'atelier, c'est cette liste qu'on relira.
        ("Meeshy/Features/Main/Composer/ConversationMediaComposerDoor.swift", "MeeshyComposerHost("),
        // #4102 — `composerSurface`, qui MONTE l'atelier, a suivi le découpage du
        // meuble vers `+Surfaces`. L'adresse suit le montage, jamais le nom
        // du type : laissée sur le fichier principal, la garde aurait rougi
        // « le maillon a disparu » pour un maillon simplement déménagé.
        ("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift", "StoryComposerView(")
    ]

    func test_everyCreationComposerPresentation_passesTheMemorisedAudience() throws {
        for (path, mount) in Self.storyComposerCreationMounts {
            let src = try appSource(path)
            let mounts = src.components(separatedBy: mount).dropFirst()
            XCTAssertGreaterThan(mounts.count, 0, "\(path) ne monte plus `\(mount)` — le maillon de création a disparu ?")
            for montage in mounts {
                XCTAssertTrue(
                    String(montage.prefix(600)).contains("initialVisibility:"),
                    "\(path) : une présentation du composer de CRÉATION ne passe pas `initialVisibility`. "
                        + "Le SDK retombe alors sur `PostVisibility.friends` sans rien dire, et le dernier "
                        + "choix d'audience de l'auteur est perdu (loi 10)."
                )
            }
        }
    }

    /// R4 — le cover du composer de création n'est monté qu'UNE fois par racine.
    ///
    /// `StoryTrayView` le montait, et elle est instanciée par
    /// `ConversationListView`, `FeedView` et `RootViewComponents` ; sur iPhone la
    /// feuille de feed recouvre la liste sans la démonter, donc deux trays
    /// vivantes présentaient le même cover sur le même `@Published`
    /// (« Attempt to present … which is already presenting »). C'est la course
    /// que les `Task.sleep(350 ms)` masquaient.
    func test_theStoryComposerCoverIsMountedOnlyAtTheRoots() throws {
        let mounts = ["Meeshy/Features/Main/Views/RootView.swift",
                      "Meeshy/Features/Main/Views/iPadRootView+Sheets.swift"]
        for path in mounts {
            XCTAssertEqual(
                occurrences(of: ".storyComposerCover(", in: try appSource(path)), 1,
                "\(path) : une racine, un montage."
            )
        }
        for path in ["Meeshy/Features/Main/Views/StoryTrayView.swift",
                     "Meeshy/Features/Main/Views/RootViewComponents.swift",
                     "Meeshy/Features/Main/Views/FeedView.swift",
                     "Meeshy/Features/Main/Views/ConversationListView.swift"] {
            XCTAssertEqual(
                occurrences(of: "isPresented: $viewModel.showStoryComposer", in: try appSource(path))
                    + occurrences(of: "isPresented: $storyViewModel.showStoryComposer", in: try appSource(path)),
                0,
                "\(path) : les hôtes DÉCLENCHENT le composer, ils ne le présentent plus."
            )
        }
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Source d'un fichier de l'app, commentaires `//` retirés — un `.contains`
    /// qui matche un commentaire ne prouve rien (et les doc-comments de ces deux
    /// vues NOMMENT les composers qu'on compte ici).
    private func appSource(_ relativePath: String) throws -> String {
        let projectRoot = #filePath.components(separatedBy: "/MeeshyTests/").first ?? ""
        let raw = try String(contentsOfFile: "\(projectRoot)/\(relativePath)", encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let comment = line.range(of: "//") else { return line }
                return line[line.startIndex..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    // MARK: - Helpers

    /// Extrait une portion de `apps/ios/meeshy.sh`, commentaires `#` retirés :
    /// une assertion qui matche un commentaire ne prouve rien.
    private func scriptBody(of startMarker: String, upTo endMarker: String) throws -> String {
        let projectRoot = #filePath.components(separatedBy: "/MeeshyTests/").first ?? ""
        let source = try String(contentsOfFile: "\(projectRoot)/meeshy.sh", encoding: .utf8)
        guard let start = source.range(of: startMarker) else {
            XCTFail("meeshy.sh ne contient plus « \(startMarker) »")
            return ""
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[start.lowerBound..<end])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let comment = line.range(of: "#") else { return line }
                return line[line.startIndex..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    /// Returns the body of `application(_:didFinishLaunchingWithOptions:)`
    /// from `AppDelegate.swift`. Mirrors the file-path resolution used by
    /// `SingleSourceOfTruthTests` so the test stays portable across the
    /// Xcode and SPM test runners.
    private func appDelegateLaunchBody() throws -> String {
        let filePath = #filePath
        let projectRoot = filePath
            .components(separatedBy: "/MeeshyTests/")
            .first ?? ""
        let appDelegatePath = "\(projectRoot)/Meeshy/AppDelegate.swift"
        let source = try String(contentsOfFile: appDelegatePath, encoding: .utf8)
        guard let methodStart = source.range(of: "func application(") else {
            XCTFail("AppDelegate.swift no longer contains a `func application(` declaration")
            return ""
        }
        // Strip `//` line comments before scanning. The launch sequence carries
        // an explanatory comment block that NAMES the very symbol we order-check
        // (`register()`); without stripping, the first `range(of:)` match lands
        // inside that comment — above the real call — and the ordering assertions
        // read a bogus position. We only need the executable lines, so drop
        // everything from `//` onward per line.
        let executable = String(source[methodStart.lowerBound...])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                if let commentStart = line.range(of: "//") {
                    return line[line.startIndex..<commentStart.lowerBound]
                }
                return line
            }
            .joined(separator: "\n")
        return executable
    }
}
