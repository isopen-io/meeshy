import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipInspectorTests: XCTestCase {

    private func makeClip(
        id: String = "clip-1",
        start: Float = 0.5,
        duration: Float = 5.0,
        volume: Float = 0.85,
        fadeIn: Float = 0.4,
        fadeOut: Float = 0.0,
        loop: Bool = false,
        background: Bool = true
    ) -> ClipInspector.ClipSnapshot {
        ClipInspector.ClipSnapshot(
            id: id,
            displayName: "intro.mp4",
            kind: .video,
            startTime: start,
            duration: duration,
            volume: volume,
            fadeInDuration: fadeIn,
            fadeOutDuration: fadeOut,
            isLooping: loop,
            isBackground: background
        )
    }

    func test_init_quickPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .sheet,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_init_popoverPresentation_doesNotCrash() {
        let view = ClipInspector(
            presentation: .popover,
            clip: makeClip(),
            onVolumeChanged: { _ in },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        _ = view.body
    }

    func test_formattedStart_usesFractionalSeconds() {
        let formatted = ClipInspector.formatTime(seconds: 0.5)
        XCTAssertEqual(formatted, "0:00.500")
    }

    func test_formattedDuration_above60s_includesMinutes() {
        XCTAssertEqual(ClipInspector.formatTime(seconds: 65.25), "1:05.250")
    }

    /// `ClipInspector.formatTime` MUST delegate to `TransportBar.formatTime`
    /// (SSOT) rather than re-deriving the same formula — guards against the
    /// two forking apart again.
    func test_formatTime_delegatesToTransportBarFormatTime() {
        for seconds: Float in [0, 0.5, 59.999, 65.25, 3600.1] {
            XCTAssertEqual(
                ClipInspector.formatTime(seconds: seconds),
                TransportBar.formatTime(seconds: seconds)
            )
        }
    }

    func test_volumeChanged_invokesCallback() {
        var captured: Float?
        let inspector = ClipInspector(
            presentation: .sheet,
            clip: makeClip(volume: 0.5),
            onVolumeChanged: { captured = $0 },
            onFadeInChanged: { _ in },
            onFadeOutChanged: { _ in },
            onLoopToggled: { _ in },
            onBackgroundToggled: { _ in },
            onAddKeyframe: {},
            onDelete: {}
        )
        inspector.simulateVolumeCommit(value: 0.72)
        XCTAssertEqual(captured ?? -1, 0.72, accuracy: 0.001)
    }

    func test_fadeBounds_areClampedTo0to3() {
        XCTAssertEqual(ClipInspector.fadeRange.lowerBound, 0)
        XCTAssertEqual(ClipInspector.fadeRange.upperBound, 3)
    }

    // MARK: - Sections visibles
    //
    // Directive user 2026-07-27 : « affiche directement tous les éléments
    // d'édition dans les fiches d'édition ». Les deux replis d'avant — ⓘ pour
    // le timing fin, « Animation » pour les fondus — sont supprimés, et la
    // section `details` est absorbée par `timing`, dont les trois valeurs sont
    // devenues des champs saisissables.

    /// Depuis le 2026-07-29 la fiche ne redit plus ce qu'un geste fait déjà :
    /// début/fin/durée se règlent sur la piste, le plan au canvas.
    func test_visibleSections_foregroundVideo_showsWhatNoGestureProduces() {
        let sections = ClipInspector.visibleSections(kind: .video, isBackground: false)
        XCTAssertEqual(sections, [.header, .volume, .animation, .toggles, .actions])
    }

    func test_sectionEnum_hasNoDetailsCase() {
        XCTAssertFalse(ClipInspector.Section.allCases.map(\.rawValue).contains("details"),
                       "`details` dupliquait les valeurs que `timing` porte désormais.")
    }

    func test_visibleSections_textAndImageClips_haveNoVolume() {
        for kind in [ClipInspector.ClipSnapshot.Kind.text, .image] {
            let sections = ClipInspector.visibleSections(kind: kind, isBackground: false)
            XCTAssertFalse(sections.contains(.volume),
                           "\(kind) n'a pas de piste audio — pas de section volume")
        }
    }

    /// L'IMAGE garde sa rangée d'interrupteurs : la bascule « Fond » agit
    /// réellement sur elle (`setClipBackground` la traite).
    func test_visibleSections_imageKeepsItsBackgroundToggle() {
        let sections = ClipInspector.visibleSections(kind: .image, isBackground: false)
        XCTAssertEqual(sections, [.header, .animation, .toggles, .actions])
    }

    /// Le TEXTE, lui, la perd : `setClipLoop` ET `setClipBackground` l'ignorent
    /// silencieusement depuis toujours. La rangée n'affichait que des
    /// interrupteurs morts — on ne montre plus un contrôle qui ne fait rien.
    func test_visibleSections_textDropsItsDeadTogglesRow() {
        let sections = ClipInspector.visibleSections(kind: .text, isBackground: false)
        XCTAssertEqual(sections, [.header, .animation, .actions])
    }

    // Un FOND couvre toute la slide : début/durée sont ignorés par le moteur —
    // afficher la barre de timing serait un contrôle sans effet (capture user
    // 2026-07-20 : steppers « 0:0… » affichés ET ignorés sur un clip Background).
    // Sa POSITION n'a pas davantage de sens : il remplit le cadre.
    func test_visibleSections_backgroundClip_hidesTimingAndTransform() {
        let sections = ClipInspector.visibleSections(kind: .video, isBackground: true)
        XCTAssertEqual(sections, [.header, .volume, .animation, .toggles, .actions])
    }

    /// Un AUDIO ne se voit pas : ses x/y existent dans le modèle mais ne
    /// pilotent aucun rendu. Un STICKER s'édite au canvas — la commande de
    /// propriété refuse explicitement ses champs.
    func test_visibleSections_audioAndSticker_haveNoTransform() {
        XCTAssertFalse(ClipInspector.visibleSections(kind: .audio, isBackground: false)
            .contains(.transform))
        XCTAssertFalse(ClipInspector.visibleSections(kind: .sticker, isBackground: false)
            .contains(.transform))
    }

    // MARK: - Saisie numérique

    /// L'utilisateur tape « 3,5 » en français et « 3.5 » ailleurs : refuser la
    /// virgule rendrait le champ inutilisable en France.
    func test_parseSeconds_acceptsBothDecimalSeparators() {
        XCTAssertEqual(ClipInspector.parseSeconds("3.5") ?? -1, 3.5, accuracy: 0.001)
        XCTAssertEqual(ClipInspector.parseSeconds("3,5") ?? -1, 3.5, accuracy: 0.001)
    }

    func test_parseSeconds_rejectsGarbageAndNegatives() {
        XCTAssertNil(ClipInspector.parseSeconds(""))
        XCTAssertNil(ClipInspector.parseSeconds("abc"))
        XCTAssertNil(ClipInspector.parseSeconds("-3"), "Un temps négatif n'existe pas sur la timeline.")
    }

    /// La rotation et la position, elles, sont SIGNÉES.
    func test_parseDecimal_acceptsNegatives() {
        XCTAssertEqual(ClipInspector.parseDecimal("-45") ?? 0, -45, accuracy: 0.001)
        XCTAssertEqual(ClipInspector.parseDecimal("-12,5") ?? 0, -12.5, accuracy: 0.001)
        XCTAssertNil(ClipInspector.parseDecimal("oops"))
    }

    // MARK: - Confirmation de suppression (jamais de delete direct)

    func test_deleteConfirmation_request_presentsAlert() {
        var confirmation = ClipInspector.DeleteConfirmation()
        XCTAssertFalse(confirmation.isPresented)
        confirmation.request()
        XCTAssertTrue(confirmation.isPresented)
    }

    func test_deleteConfirmation_cancel_dismissesWithoutSideEffect() {
        var confirmation = ClipInspector.DeleteConfirmation()
        confirmation.request()
        confirmation.cancel()
        XCTAssertFalse(confirmation.isPresented)
    }

    func test_deleteConfirmation_confirm_invokesDeleteOnceAndDismisses() {
        var confirmation = ClipInspector.DeleteConfirmation()
        confirmation.request()
        var deleteCount = 0
        confirmation.confirm { deleteCount += 1 }
        XCTAssertEqual(deleteCount, 1)
        XCTAssertFalse(confirmation.isPresented)
    }

    // MARK: - Timing lié début / fin / durée (fin = début + durée)




}
