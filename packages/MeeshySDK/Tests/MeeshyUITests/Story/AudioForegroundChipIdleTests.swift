import XCTest
@testable import MeeshyUI

/// **La puce audio de premier plan s'endort avec l'écran** (#3915).
///
/// Suivi explicite de #3906 : le ralenti de l'horloge d'édition
/// (`EditClockThrottle`, `editDisplayLink`) ne touchait PAS cette puce. Ses
/// deux `TimelineView(.animation(minimumInterval: 1/30))` tournent sur
/// l'horloge d'ANIMATION propre de SwiftUI. Tant qu'une piste n'était pas mise
/// en sourdine — le cas courant d'une musique de fond — elle redessinait à
/// 30 fps indéfiniment sur un écran que personne ne touche.
///
/// > Mettre une horloge en veille n'endort pas les autres. La question à poser
/// > à toute mise en sommeil n'est pas « la vue est-elle cachée ? » mais
/// > « qu'est-ce qui continue de se réveiller tout seul par-dessous ? ».
final class AudioForegroundChipIdleTests: XCTestCase {

    private typealias Chip = AudioForegroundChip

    // MARK: - La règle

    /// **LE témoin de l'issue** : une piste NON muette, sur un écran au repos,
    /// n'anime plus. C'est le seul cas que l'ancienne règle ratait, et c'est
    /// le cas nominal d'une musique de fond.
    func test_pisteNONMuette_écranAUREPOS_nAnimePLUS() {
        XCTAssertTrue(Chip.animationIsPaused(isUserMuted: false, isEditClockThrottled: true))
    }

    /// Non-régression du comportement d'avant : écran vivant, piste vivante ⇒
    /// l'animation joue. Sans ce témoin, une règle qui rendrait `true` partout
    /// passerait le premier.
    func test_pisteNONMuette_écranVIVANT_animeToujours() {
        XCTAssertFalse(Chip.animationIsPaused(isUserMuted: false, isEditClockThrottled: false))
    }

    /// **La sourdine survit au réveil.** Les deux raisons ne se remplacent pas :
    /// la sourdine est une décision de l'AUTEUR, le repos une décision de
    /// l'APPAREIL. Les confondre en un seul drapeau ferait qu'une interaction
    /// rallumerait l'animation d'une piste que l'auteur a coupée.
    func test_laSourdine_survitAuRÉVEIL() {
        XCTAssertTrue(Chip.animationIsPaused(isUserMuted: true, isEditClockThrottled: false))
        XCTAssertTrue(Chip.animationIsPaused(isUserMuted: true, isEditClockThrottled: true))
    }

    // MARK: - Le canal, de bout en bout

    private func source(_ chemin: String) throws -> String {
        ComposerSourceGuard.stripComments(
            try String(contentsOf: ComposerSourceGuard.packageRoot
                .appendingPathComponent("Sources/MeeshyUI/\(chemin)"), encoding: .utf8))
    }

    /// **Les DEUX bascules publient.** Ne publier que l'endormissement
    /// laisserait la puce figée après le premier réveil — un défaut PIRE que
    /// celui qu'on corrige, parce qu'il se voit alors que l'écran est vivant.
    func test_lesDEUXBascules_annoncentLeRégime() throws {
        let lecture = try source("Story/Canvas/StoryCanvasUIView+Playback.swift")
        XCTAssertTrue(lecture.contains("onEditClockThrottleChanged?(true)"),
                      "l'endormissement doit s'annoncer")
        XCTAssertTrue(lecture.contains("onEditClockThrottleChanged?(false)"),
                      "le RÉVEIL aussi — sinon la puce reste figée sur un écran vivant")
    }

    /// **Le canal atteint la PUCE.** Une valeur qui traverse trois couches sans
    /// arriver au pixel ne corrige personne : c'est le mode d'échec que la
    /// leçon des résolveurs de Prisme nomme — « qui AFFICHE ce que tu élis ? ».
    func test_leRégime_arriveJUSQUÀLaPuce() throws {
        let canvas = try source("Story/StoryComposerView+Canvas.swift")
        XCTAssertTrue(canvas.contains("onEditClockThrottleChanged: { throttled in"),
                      "la surface doit écouter le canvas")
        XCTAssertTrue(canvas.contains("isEditClockThrottled: isEditClockThrottled"),
                      "…et le passer à la puce, sinon la valeur meurt dans un @State")

        let puce = try source("Story/Controls/AudioForegroundChip.swift")
        XCTAssertEqual(puce.components(separatedBy: "Self.animationIsPaused(").count - 1, 2,
                       "les DEUX horloges d'animation — la marquise et la sinusoïde — passent par "
                           + "la règle ; en laisser une sur `isUserMuted` seul garderait 30 fps.")
        XCTAssertFalse(puce.contains("paused: isUserMuted,"),
                       "plus aucune horloge ne se pause sur la seule sourdine")
    }
}
