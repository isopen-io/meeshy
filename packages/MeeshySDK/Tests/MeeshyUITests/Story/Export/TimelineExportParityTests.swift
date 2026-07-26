import XCTest
import AVFoundation
import CoreMedia
import MeeshySDK
@testable import MeeshyUI

/// Garde de parité (Task 9, 2026-07-26) : TOUT chemin d'export de story doit
/// fournir filigrane ET interlude à l'exporteur. Sans ce test, un chemin
/// d'export pourrait réintroduire silencieusement la divergence constatée le
/// 2026-07-26 : l'export de l'outil timeline sortait un MP4 SANS interlude
/// de marque et avec un filigrane amputé du pseudo, alors que les trois
/// autres chemins (`StoryPhotoSaveService`, `StoryExportShareViewModel`,
/// `StoryVideoExportService`) les portaient tous les deux.
///
/// Vérifie les ENTRÉES passées à l'exporteur, pas des pixels : c'est ce qui a
/// régressé (l'appelant a-t-il transmis watermark/intro), pas « le rendu
/// final est-il visuellement correct » — déjà couvert par
/// `StoryExportBrandedEndToEndTests` et `StoryExporter_WatermarkTests`.
///
/// Revue round 2 (2026-07-26) — 4 findings Important corrigés ici :
///   1. `XCTAssertNotNil(lastWatermark)` seul ne détecte pas une régression
///      qui droppe `username:` (le type reste non-nil dans les deux cas) —
///      `test_timelineExport_watermarkReflectsTheAuthorUsername` compare le
///      filigrane produit à deux références indépendantes.
///   2. Le pseudo est maintenant injectable (`usernameProvider`), comme
///      l'interlude l'était déjà.
///   3. `SystemTimelineStoryExporterTests` exerce l'implémentation de
///      production RÉELLE (pas le spy) pour prouver que le chemin
///      effectivement emprunté transmet bien watermark/intro.
///   4. `introProvider` est maintenant borné dans le temps
///      (`introTimeout`, réutilisant `BoundedAsyncResolution` — le mécanisme
///      déjà éprouvé de `StoryPhotoSaveService`, pas un nouveau).
@MainActor
final class TimelineExportParityTests: XCTestCase {

    private func makeComposer() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    /// Le cœur de la garde : quand une identité est résolue, elle doit
    /// atteindre l'exporteur — EXACTEMENT comme le filigrane.
    func test_timelineExport_passesWatermarkAndIntroToExporter() async {
        let exporter = SpyTimelineStoryExporter()
        let expectedIntro = StoryExportIntroContent(displayName: "Alice", username: "alice",
                                                    accentColorHex: "4ECDC4")
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "alice" },
            introProvider: { expectedIntro }
        )

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        XCTAssertNotNil(exporter.lastWatermark, "l'export timeline doit graver le filigrane")
        XCTAssertNotNil(exporter.lastIntro, "l'export timeline doit graver l'interlude de marque")
        XCTAssertEqual(exporter.lastIntro?.username, "alice",
                       "l'interlude doit porter l'identité résolue, pas une valeur par défaut")
    }

    /// Sans identité résolue (pas de session), l'interlude est légitimement
    /// absent — même dégradation gracieuse que les 3 autres chemins — mais
    /// le FILIGRANE, lui, ne dépend d'aucune session : il doit rester présent
    /// dans tous les cas. Une régression qui omettrait le filigrane pour une
    /// raison indépendante de l'identité serait invisible au premier test.
    ///
    /// `usernameProvider`/`introProvider` injectés explicitement (au lieu de
    /// laisser le défaut lire `AuthManager.shared` ambiant) : un singleton
    /// partagé entre suites peut porter une session résiduelle d'un test
    /// précédent — déterministe, pas dépendant de l'ordre d'exécution.
    func test_timelineExport_withoutIdentity_stillCarriesTheWatermark() async {
        let exporter = SpyTimelineStoryExporter()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { nil },
            introProvider: { nil }
        )

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        XCTAssertNotNil(exporter.lastWatermark,
                        "le filigrane Meeshy doit toujours être gravé, identité résolue ou non")
        XCTAssertNil(exporter.lastIntro, "sans identité résolue, l'interlude est absent — pas simulé")
    }

    // MARK: - Finding 1 : le pseudo doit RÉELLEMENT atteindre le filigrane

    /// `XCTAssertNotNil(lastWatermark)` seul passe que `username:` soit
    /// transmis ou non — `StoryExportWatermark` est non-nil dans les deux cas,
    /// seul le texte gravé (bloc « meeshy » + « @handle ») diffère. Ce test
    /// compare le filigrane PRODUIT à des références indépendantes calculées
    /// dans le test lui-même.
    ///
    /// Revue finale (item 6) : avec un pseudo COURT, l'assertion sur-promettait.
    /// `MeeshyExportWatermark.make` mesure `textWidth = max(largeur(« meeshy »
    /// en 76 pt), largeur(« @pseudo » en 46 pt))` : pour « alice », « bob » ou
    /// « zzz », c'est toujours « meeshy » qui l'emporte, donc `blockAspect` est
    /// rigoureusement identique — le test prouvait « un pseudo non vide a été
    /// transmis », pas « CE pseudo ». Les pseudos utilisés ici sont assez longs
    /// pour que leur propre largeur domine : la mesure dépend alors réellement
    /// de leurs glyphes, ce que verrouille la dernière assertion.
    @MainActor
    func test_timelineExport_watermarkReflectsTheAuthorUsername() async throws {
        let handle = "marie-antoinette-de-habsbourg"
        let otherHandle = "bob-le-bricoleur-international-de-la-republique"

        let exporter = SpyTimelineStoryExporter()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { handle },
            introProvider: { nil }
        )

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        let produced = try XCTUnwrap(exporter.lastWatermark,
                                     "l'export timeline doit graver le filigrane")
        let withUsername = try XCTUnwrap(MeeshyExportWatermark.make(username: handle))
        let withoutUsername = try XCTUnwrap(MeeshyExportWatermark.make(username: nil))
        let withOtherUsername = try XCTUnwrap(MeeshyExportWatermark.make(username: otherHandle))

        // Garde-fou de conception : si ces deux références se mettaient un jour
        // à mesurer pareil, l'assertion finale ne prouverait plus rien.
        XCTAssertNotEqual(withUsername.blockAspect, withOtherUsername.blockAspect,
                          "les deux pseudos de référence doivent être mesurablement différents")

        XCTAssertEqual(produced.blockAspect, withUsername.blockAspect, accuracy: 0.0001,
                       "le filigrane produit doit refléter le pseudo « \(handle) », pas un filigrane générique")
        XCTAssertNotEqual(produced.blockAspect, withoutUsername.blockAspect,
                          "un filigrane SANS pseudo (le bug d'origine) ne doit jamais être produit ici")
        XCTAssertNotEqual(produced.blockAspect, withOtherUsername.blockAspect,
                          "la mesure doit dépendre des glyphes de CE pseudo, pas seulement de sa présence")
    }

    // MARK: - Finding 4 : la résolution de l'interlude est bornée dans le temps

    /// Même scénario que `StoryPhotoSaveServiceTests.
    /// test_save_introSlowerThanTimeout_bakesWithoutIntroWithoutBlocking` —
    /// mêmes constantes (bound 0.1s / opération lente 3s / seuil 1.5s),
    /// déjà éprouvées sur ce host bruyant (voir la doc de ce test-là pour le
    /// détail de calibration). `introProvider` lent (avatar/fond non caché,
    /// jusqu'à ~60s réseau en production) ne doit JAMAIS bloquer le
    /// démarrage du bake au-delà de `introTimeout`.
    func test_timelineExport_introSlowerThanTimeout_startsExportWithoutBlocking() async {
        let exporter = SpyTimelineStoryExporter()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "alice" },
            introProvider: {
                try? await Task.sleep(for: .seconds(3))
                return StoryExportIntroContent(displayName: "Late", username: "late", accentColorHex: "FFFFFF")
            },
            introTimeout: .milliseconds(100)
        )
        let start = Date()

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 1.5,
                          "doit démarrer près de la borne de 0.1s, jamais attendre les 3s de l'intro")
        XCTAssertNil(exporter.lastIntro, "passé le délai, l'export démarre sans interlude de marque")
        XCTAssertNotNil(exporter.lastWatermark, "le filigrane reste gravé même quand l'intro dépasse la borne")
    }

    /// L'inverse : une résolution rapide doit toujours être utilisée — la
    /// borne ne doit jamais faire perdre une résolution qui arrive à temps.
    func test_timelineExport_introFasterThanTimeout_isUsed() async {
        let exporter = SpyTimelineStoryExporter()
        let expected = StoryExportIntroContent(displayName: "Fast", username: "fast", accentColorHex: "112233")
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "fast" },
            introProvider: { expected },
            introTimeout: .seconds(2)
        )

        controller.start(composer: makeComposer())
        await exporter.waitForCall()

        XCTAssertEqual(exporter.lastIntro?.username, "fast")
    }

    // MARK: - Revue finale round 2, item 3 : annulation PENDANT la résolution

    /// Draine la file du MainActor un nombre BORNÉ de fois — assez pour
    /// qu'une tentative déjà reprise atteigne (ou non) son exporteur. Pas
    /// d'assertion temporelle : que des `Task.yield()`.
    private func drainMainActorQueue() async {
        for _ in 0..<200 { await Task.yield() }
    }

    /// **Contrôle positif du drain** du test suivant : sans annulation, la
    /// MÊME séquence (résolution suspendue puis relâchée, même borne de
    /// drain) voit l'export partir. Sans lui, l'assertion négative d'après
    /// serait décorative.
    func test_timelineExport_identityResolvedLate_thenReleased_startsTheExport() async {
        let exporter = SpyTimelineStoryExporter()
        let resolver = ManualIntroResolver()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "alice" },
            introProvider: { await resolver.resolve() },
            introTimeout: .seconds(5)
        )

        controller.start(composer: makeComposer())
        await resolver.waitUntilSuspended()
        XCTAssertEqual(exporter.callCount, 0,
                       "l'export ne doit pas démarrer tant que l'identité se résout")

        resolver.release()
        await drainMainActorQueue()

        XCTAssertEqual(exporter.callCount, 1)
    }

    /// « Annuler » tapé pendant que l'identité se résout (jusqu'à 4 s sur une
    /// installation fraîche). Le chemin « Partager » avait été corrigé
    /// (`0fb2dc55a`), celui-ci ne l'était pas : l'export partait quand même
    /// derrière une surface déjà partie, chauffait l'appareil, et son
    /// résultat était jeté à l'arrivée par le `guard !Task.isCancelled`
    /// d'après-export. Objectif « une seule pipeline » : les trois chemins
    /// coupent au même endroit.
    func test_timelineExport_cancelledDuringIdentityResolution_neverStartsTheExport() async {
        let exporter = SpyTimelineStoryExporter()
        let resolver = ManualIntroResolver()
        let controller = TimelineExportController(
            exporter: exporter,
            usernameProvider: { "alice" },
            introProvider: { await resolver.resolve() },
            introTimeout: .seconds(5)
        )

        controller.start(composer: makeComposer())
        await resolver.waitUntilSuspended()

        controller.cancel()
        resolver.release()
        await drainMainActorQueue()

        XCTAssertEqual(exporter.callCount, 0,
                       """
                       Annulé AVANT le démarrage, l'export ne doit jamais partir : 10 à 60 s de \
                       calcul et de chauffe pour un fichier que la garde d'après-export jettera.
                       """)
        XCTAssertFalse(controller.isExporting, "l'annulation doit laisser le contrôleur au repos")
    }
}

// MARK: - Double : résolution d'identité pilotable

/// Résolution d'identité pilotable : `resolve()` suspend jusqu'à ce que le
/// test appelle `release(_:)`, et `waitUntilSuspended()` donne au test un
/// point de synchronisation déterministe. Jumeau de
/// `StoryPhotoSaveServiceTests.ManualIntroResolver` (autre target, donc
/// inaccessible d'ici) : `introTimeout` couvre « la résolution ne revient
/// jamais », ce double couvre « elle revient, mais trop tard ».
@MainActor
private final class ManualIntroResolver {

    private var pending: CheckedContinuation<StoryExportIntroContent?, Never>?
    private var suspensionWaiter: CheckedContinuation<Void, Never>?
    private var releasedValue: StoryExportIntroContent?
    private var hasReleased = false
    private(set) var isSuspended = false

    func resolve() async -> StoryExportIntroContent? {
        if hasReleased { return releasedValue }
        return await withCheckedContinuation { continuation in
            pending = continuation
            isSuspended = true
            suspensionWaiter?.resume()
            suspensionWaiter = nil
        }
    }

    func waitUntilSuspended() async {
        if isSuspended { return }
        await withCheckedContinuation { suspensionWaiter = $0 }
    }

    func release(_ content: StoryExportIntroContent? = nil) {
        hasReleased = true
        releasedValue = content
        isSuspended = false
        pending?.resume(returning: content)
        pending = nil
    }
}

// MARK: - Double

/// Capture les entrées reçues par `TimelineExportController.start(composer:)`
/// sans toucher AVFoundation — `start()` n'est pas `async` (il lance un
/// `Task` interne), d'où l'attente par continuation plutôt qu'un simple
/// `await`.
@MainActor
private final class SpyTimelineStoryExporter: TimelineStoryExporting {
    private(set) var lastWatermark: StoryExportWatermark?
    private(set) var lastIntro: StoryExportIntroContent?
    private(set) var callCount = 0
    private var continuation: CheckedContinuation<Void, Never>?

    func export(
        slide: StorySlide,
        to outputURL: URL,
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?,
        progress: ((Double) -> Void)?
    ) async throws -> URL {
        lastWatermark = watermark
        lastIntro = intro
        callCount += 1
        continuation?.resume()
        continuation = nil
        return outputURL
    }

    /// Suspend jusqu'au premier appel à `export`, ou retourne immédiatement
    /// s'il a déjà eu lieu — évite une course si `start()` a déjà résolu
    /// avant que le test n'observe.
    func waitForCall() async {
        if callCount > 0 { return }
        await withCheckedContinuation { continuation = $0 }
    }
}

// MARK: - Finding 3 : l'implémentation de PRODUCTION, pas seulement le contrat

/// `TimelineExportParityTests` injecte systématiquement `SpyTimelineStoryExporter`
/// — ce qui prouve que `TimelineExportController` APPELLE correctement son
/// exporteur, mais rien ne prouve que `SystemTimelineStoryExporter` (le VRAI
/// exporteur par défaut au site d'appel réel) transmette effectivement le
/// filigrane à `StoryExporter.export` et prépose bien l'interlude. Ces tests
/// bakent un VRAI MP4 (comme `StoryExportBrandedEndToEndTests`) en appelant
/// directement `SystemTimelineStoryExporter().export(...)`.
///
/// Honore `MEESHY_SKIP_EXPORT_TESTS` comme le reste de la pipeline
/// (AVFoundation pas toujours fiable en CI).
@MainActor
final class SystemTimelineStoryExporterTests: XCTestCase {

    private static let storyDuration: TimeInterval = 2.0

    /// Allongement net apporté par la carte de fin : elle dure
    /// `StoryExportOutro.duration` (2 s) mais entre en crossfade sur les 1,5
    /// dernières secondes de la story — même arithmétique que
    /// `StoryExportOutroTests.test_append_extendsStoryByHalfSecond`.
    private static let outroTail: TimeInterval = 0.5

    private func makeSlide() -> StorySlide {
        let text = StoryTextObject(id: UUID().uuidString,
                                   text: "Timeline export",
                                   x: 0.5, y: 0.5,
                                   fontSize: 48,
                                   startTime: 0,
                                   duration: Self.storyDuration)
        var effects = StoryEffects()
        effects.textObjects = [text]
        effects.timelineDuration = Self.storyDuration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: Self.storyDuration,
                          order: 0)
    }

    private func makeIntro() -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "Alice", username: "alice", accentColorHex: "4ECDC4")
    }

    /// Le VRAI exporteur de production doit préposer l'interlude quand
    /// `intro != nil` — ce qu'aucun test avec le spy ne peut prouver (il ne
    /// bake rien, il se contente d'enregistrer ses arguments).
    func test_export_withIntro_prependsTheBrandInterlude() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let slide = makeSlide()
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-timeline-exporter-\(UUID().uuidString).mp4")
        let watermark = MeeshyExportWatermark.make(username: "alice")

        let finalURL = try await SystemTimelineStoryExporter().export(
            slide: slide,
            to: outputURL,
            watermark: watermark,
            intro: makeIntro(),
            audioResolver: nil,
            progress: nil
        )
        defer { try? FileManager.default.removeItem(at: finalURL) }

        let duration = try await AVURLAsset(url: finalURL).load(.duration)
        let expected = StoryExportIntro.duration + Self.storyDuration + Self.outroTail
        XCTAssertEqual(CMTimeGetSeconds(duration), expected, accuracy: 0.35,
                       "l'implémentation de PRODUCTION doit préposer l'interlude ET ajouter la carte de fin, pas seulement le contrat du protocole")
    }

    /// Sans intro, le VRAI exporteur ne prépose RIEN — mais la CARTE DE FIN,
    /// elle, ne dépend d'aucune identité et doit rester présente.
    ///
    /// Revue finale (item 1 + item 2) : c'est la garde qui rougit si l'appel à
    /// `StoryExportOutro.append` disparaît du chemin timeline, ou s'il
    /// retombe sous la dépendance de `intro != nil` comme il l'était côté
    /// `StoryVideoExportService`.
    func test_export_withoutIntro_stillAppendsTheBrandOutro() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let slide = makeSlide()
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-timeline-exporter-\(UUID().uuidString).mp4")

        let finalURL = try await SystemTimelineStoryExporter().export(
            slide: slide,
            to: outputURL,
            watermark: nil,
            intro: nil,
            audioResolver: nil,
            progress: nil
        )
        defer { try? FileManager.default.removeItem(at: finalURL) }

        let duration = try await AVURLAsset(url: finalURL).load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(duration), Self.storyDuration + Self.outroTail, accuracy: 0.35,
                       "sans intro, aucun préambule — mais la carte de fin de marque doit tout de même allonger la vidéo")
        XCTAssertGreaterThan(CMTimeGetSeconds(duration), Self.storyDuration + 0.15,
                             "une vidéo à la durée EXACTE de la story prouve que la carte de fin a disparu du chemin timeline")

        // La signature sonore de FERMETURE est la preuve la plus directe que
        // c'est bien `StoryExportOutro` qui a composé (la story de ce test est
        // muette : sans carte de fin, aucune piste audio n'existerait).
        let audio = try await AVURLAsset(url: finalURL).loadTracks(withMediaType: .audio)
        XCTAssertGreaterThanOrEqual(audio.count, 1,
                                    "la carte de fin apporte la signature sonore de fermeture — absente, elle n'a pas été appliquée")
    }
}
