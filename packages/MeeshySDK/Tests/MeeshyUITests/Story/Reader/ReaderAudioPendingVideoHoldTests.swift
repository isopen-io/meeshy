import XCTest
import UIKit
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **#6580 / D4 — la porte R1 gèle aussi les AVPlayer.**
///
/// `isSlideAudioPending()` (R1) attend que le fichier audio de la slide soit
/// téléchargé et schedulé. Elle gelait le PLAYHEAD — `isPlaybackStalled` coupe
/// `advancePlayheadIfActive` — mais PAS les `AVPlayer` : la vidéo continuait de
/// rouler pendant l'attente et prenait une avance qu'aucun recalage ne
/// rattrape, puisque le recalage vise justement le playhead gelé.
///
/// La retenue est une **SUSPENSION, pas une re-décision** : on mémorise ce que
/// valaient les deux portes vidéo et on les restaure telles quelles. Rejouer
/// les gates du « GO » à la relâche ferait démarrer des players que d'autres
/// portes — fenêtre absente, préemption — tenaient délibérément fermés.
///
/// **L'audio n'entre PAS dans `contentReadyFired`**, et c'est par CONCEPTION :
/// l'image ne doit pas attendre le son. L'y ajouter allongerait l'ouverture,
/// exactement ce que le porteur reproche par ailleurs. On gèle ce qui doit
/// rester EN PHASE ; on ne retarde pas ce qui doit s'afficher tout de suite.
@MainActor
final class ReaderAudioPendingVideoHoldTests: XCTestCase {

    /// Canvas en lecture, contenu annoncé prêt — donc « GO » consommé. Sans
    /// fenêtre, le GO lève la porte du FOND seul (`window != nil` garde
    /// l'avant-plan), et c'est précisément l'état que la relâche doit rendre
    /// à l'identique.
    private func readyCanvas() -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.background = "#112233"
        let slide = StorySlide(id: "slide-hold", effects: effects, duration: 10)
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view._markBackgroundReadyForTesting()
        return view
    }

    // MARK: - Pendant l'attente audio, la vidéo est retenue

    func test_audioPending_holdsTheVideoPlayers() {
        let view = readyCanvas()
        XCTAssertTrue(view.backgroundLayer.isPlaybackActive, "préalable : le GO a levé la porte du fond")
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false,
                                              audioPending: true, now: 0)
        XCTAssertFalse(view.backgroundLayer.isPlaybackActive,
                       "La vidéo ne doit pas rouler pendant que le playhead est gelé — sinon elle "
                       + "prend une avance qu'aucun recalage ne rattrape")
    }

    func test_audioPending_freezesThePlayheadToo() {
        // Le gel du playhead existait déjà ; on le re-pose pour que le témoin
        // dise l'INVARIANT complet — playhead ET image immobiles ENSEMBLE —
        // plutôt que la seule moitié qu'on vient d'ajouter.
        let view = readyCanvas()
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false,
                                              audioPending: true, now: 0)
        let before = view.currentTime.seconds
        view._advancePlayheadForTesting(by: 0.5)
        XCTAssertEqual(view.currentTime.seconds, before, accuracy: 0.0001)
    }

    // MARK: - L'attente finie, la vidéo repart — à l'état qu'elle avait

    func test_audioNoLongerPending_restoresTheGatesItFound() {
        let view = readyCanvas()
        let backgroundBefore = view.backgroundLayer.isPlaybackActive
        let foregroundBefore = view.foregroundVideosPlaybackActive
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false,
                                              audioPending: true, now: 0)
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false,
                                              audioPending: false, now: 0.2)
        XCTAssertEqual(view.backgroundLayer.isPlaybackActive, backgroundBefore)
        XCTAssertEqual(view.foregroundVideosPlaybackActive, foregroundBefore,
                       "La relâche RESTAURE ; elle ne rejoue pas les gates du GO")
    }

    // MARK: - Ce que la retenue ne doit PAS faire

    func test_videoBufferStall_doesNotHoldThePlayers() {
        // Un stall de BUFFER vidéo gèle le playhead mais ne doit surtout pas
        // mettre le player en pause : il bufferise, c'est lui qu'on attend.
        let view = readyCanvas()
        view._refreshPlaybackHealthForTesting(status: .waitingToPlayAtSpecifiedRate,
                                              failed: false, audioPending: false, now: 0)
        XCTAssertTrue(view.backgroundLayer.isPlaybackActive,
                      "Mettre en pause un player qui bufferise le priverait de ce qu'il attend")
    }

    func test_userPaused_isNeverResumedByTheAudioRelease() {
        // La relâche ne doit jamais RELEVER une pause utilisateur : elle rendrait
        // la lecture sous une slide que l'utilisateur a gelée.
        let view = readyCanvas()
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false,
                                              audioPending: true, now: 0)
        view.setPaused(true)
        view._refreshPlaybackHealthForTesting(status: .paused, failed: false,
                                              audioPending: false, now: 0.2)
        XCTAssertFalse(view.backgroundLayer.isPlaybackActive)
        XCTAssertFalse(view.foregroundVideosPlaybackActive)
    }

    func test_audioIsNotAddedToContentReadiness() {
        // L'exclusion est PAR CONCEPTION : l'image ne doit pas attendre le son.
        let view = readyCanvas()
        view._refreshPlaybackHealthForTesting(status: .playing, failed: false,
                                              audioPending: true, now: 0)
        XCTAssertTrue(view.contentReadyFired,
                      "Le son en attente ne retire JAMAIS la disponibilité déjà annoncée du contenu")
    }
}
