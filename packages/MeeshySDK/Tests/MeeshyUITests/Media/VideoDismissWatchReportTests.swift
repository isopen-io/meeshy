import Testing
import Foundation
@testable import MeeshyUI

/// #3908 — fermer une vidéo plein écran EN PAUSE effaçait la position de reprise
/// que le player partagé venait d'écrire.
///
/// Deux propriétaires rapportent le même visionnage : `SharedAVPlayerManager.cleanup()`
/// (qui persiste la position PUIS remet ses compteurs à zéro) et le `.onDisappear`
/// du plein écran, qui s'exécute après. Le second lisait un player détaché, en
/// concluait « rien à reprendre », et effaçait.
struct VideoDismissWatchReportTests {

    @Test("player détaché → le rapport de fermeture se tait, quel que soit le temps passé")
    func detachedPlayerStaysSilent() {
        #expect(VideoDismissWatchReport.shouldReport(
            complete: false, watchedSeconds: 120, playerStillHoldsAttachment: false
        ) == false)
    }

    /// Le cas exact du défaut : fermeture EN PAUSE ⇒ `stop()` ⇒ `cleanup()` ⇒
    /// player détaché. C'est `cleanup()` qui a rapporté, avec les vraies valeurs.
    @Test("une fin de lecture sur un player détaché ne rapporte pas non plus")
    func detachedPlayerStaysSilentEvenWhenComplete() {
        #expect(VideoDismissWatchReport.shouldReport(
            complete: true, watchedSeconds: 120, playerStillHoldsAttachment: false
        ) == false)
    }

    /// La fermeture qui laisse le player ATTACHÉ — dismiss en lecture, handoff
    /// PiP, continuation inline — reste le chemin que ce rapport sert.
    @Test("player encore attaché et visionnage assez long → le rapport part")
    func attachedPlayerReports() {
        #expect(VideoDismissWatchReport.shouldReport(
            complete: false, watchedSeconds: 5, playerStillHoldsAttachment: true
        ))
    }

    @Test("un coup d'œil trop bref ne rapporte rien, même player attaché")
    func briefGlanceStaysSilent() {
        #expect(VideoDismissWatchReport.shouldReport(
            complete: false, watchedSeconds: 1, playerStillHoldsAttachment: true
        ) == false)
    }

    @Test("une lecture menée à son terme échappe au seuil de durée")
    func completeIgnoresTheThreshold() {
        #expect(VideoDismissWatchReport.shouldReport(
            complete: true, watchedSeconds: 0.5, playerStillHoldsAttachment: true
        ))
    }

    @Test("le seuil est inclusif à la seconde près")
    func thresholdIsInclusive() {
        let threshold = VideoDismissWatchReport.minimumPartialWatch
        #expect(VideoDismissWatchReport.shouldReport(
            complete: false, watchedSeconds: threshold, playerStillHoldsAttachment: true
        ))
        #expect(VideoDismissWatchReport.shouldReport(
            complete: false, watchedSeconds: threshold - 0.01, playerStillHoldsAttachment: true
        ) == false)
    }
}

/// Garde de CÂBLAGE : la règle ci-dessus peut être juste et n'être appelée par
/// personne. Le défaut #3908 était précisément une lecture non gardée.
struct VideoDismissWatchReportWiringTests {

    private func rendererSource() throws -> String {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
        let url = packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    @Test("le plein écran demande la règle avant de lire le player partagé")
    func fullscreenAsksTheRule() throws {
        let source = try rendererSource()
        #expect(source.contains("VideoDismissWatchReport.shouldReport("))
        #expect(source.contains("playerStillHoldsAttachment: isActive"))
    }

    /// L'ancienne forme lisait `manager.currentTime` derrière un simple seuil de
    /// durée — sans jamais demander si le player décrivait encore l'attachement.
    @Test("le seuil nu de 3 secondes ne garde plus rien à lui seul")
    func rawThresholdIsGone() throws {
        #expect(try rendererSource().contains("guard complete || watched >= 3 else") == false)
    }
}
