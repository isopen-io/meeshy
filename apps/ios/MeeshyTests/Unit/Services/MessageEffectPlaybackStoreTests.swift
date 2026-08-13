import XCTest
import MeeshySDK
@testable import Meeshy

/// Demande user 2026-08-13 : « les effets ne s'appliquent pas correctement ».
/// La règle produit : un effet d'apparition se déclenche sur l'ARRIVÉE du
/// message, pas sur l'arrivée de ses pixels — donc exactement une fois, quel que
/// soit le nombre d'allers-retours de la cellule dans une liste paresseuse.
@MainActor
final class MessageEffectPlaybackStoreTests: XCTestCase {

    private func makeSUT(limit: Int = 500) -> MessageEffectPlaybackStore {
        MessageEffectPlaybackStore(limit: limit)
    }

    // MARK: - Une seule fois

    func test_freshMessage_hasNotPlayed() {
        XCTAssertFalse(makeSUT().hasPlayed("msg-1"))
    }

    func test_markPlayed_makesTheMessageSkipItsEffectOnTheNextRender() {
        let sut = makeSUT()
        sut.markPlayed("msg-1")
        XCTAssertTrue(sut.hasPlayed("msg-1"),
                      "Une cellule recyclée doit relire « déjà joué » et s'abstenir")
    }

    func test_markPlayed_isIdempotent() {
        let sut = makeSUT()
        XCTAssertTrue(sut.markPlayed("msg-1"))
        XCTAssertFalse(sut.markPlayed("msg-1"), "Le second passage n'est plus une première fois")
    }

    func test_messagesAreTrackedIndependently() {
        let sut = makeSUT()
        sut.markPlayed("msg-1")
        XCTAssertFalse(sut.hasPlayed("msg-2"),
                       "L'effet d'un message ne consomme pas celui d'un autre")
    }

    func test_emptyId_isIgnored_ratherThanPoisoningTheSet() {
        let sut = makeSUT()
        XCTAssertFalse(sut.markPlayed(""))
        XCTAssertFalse(sut.hasPlayed(""))
    }

    // MARK: - Bornage FIFO

    func test_store_evictsOldestEntries_soLongConversationsDoNotGrowForever() {
        let sut = makeSUT(limit: 3)
        ["a", "b", "c", "d"].forEach { sut.markPlayed($0) }

        XCTAssertFalse(sut.hasPlayed("a"), "Le plus ancien sort de la fenêtre")
        XCTAssertTrue(sut.hasPlayed("b"))
        XCTAssertTrue(sut.hasPlayed("c"))
        XCTAssertTrue(sut.hasPlayed("d"))
    }

    func test_store_underLimit_keepsEverything() {
        let sut = makeSUT(limit: 3)
        ["a", "b", "c"].forEach { sut.markPlayed($0) }
        XCTAssertTrue(sut.hasPlayed("a"))
        XCTAssertTrue(sut.hasPlayed("c"))
    }

    // MARK: - Réconciliation tempId → serverId

    func test_transferPlayback_stopsTheSenderFromSeeingTheirOwnEffectTwice() {
        let sut = makeSUT()
        sut.markPlayed("temp_42")            // bulle optimiste : l'effet a joué

        sut.transferPlayback(from: "temp_42", to: "server_42")

        XCTAssertTrue(sut.hasPlayed("server_42"),
                      "La ligne reconstruite sous l'id serveur ne rejoue pas l'effet")
    }

    func test_transferPlayback_fromAnUnplayedId_marksNothing() {
        let sut = makeSUT()
        sut.transferPlayback(from: "temp_42", to: "server_42")
        XCTAssertFalse(sut.hasPlayed("server_42"),
                       "Un message dont l'effet n'a jamais joué doit pouvoir jouer sous son id serveur")
    }

    func test_transferPlayback_toEmptyOrIdenticalId_isANoOp() {
        let sut = makeSUT()
        sut.markPlayed("temp_42")
        sut.transferPlayback(from: "temp_42", to: "")
        sut.transferPlayback(from: "temp_42", to: "temp_42")
        XCTAssertFalse(sut.hasPlayed(""))
        XCTAssertTrue(sut.hasPlayed("temp_42"))
    }

    func test_reset_clearsEverything() {
        let sut = makeSUT()
        sut.markPlayed("msg-1")
        sut.reset()
        XCTAssertFalse(sut.hasPlayed("msg-1"))
    }

    // MARK: - Intégration avec le plan de lecture

    func test_playedMessage_yieldsAPlanThatSkipsAppearance_butKeepsPersistent() {
        let sut = makeSUT()
        sut.markPlayed("msg-1")

        let effects = MessageEffects(flags: [.confetti, .glow])
        let plan = effects.playbackPlan(hasPlayedAppearance: sut.hasPlayed("msg-1"),
                                        reduceMotion: false)

        XCTAssertFalse(plan.plays(.confetti), "Pas de seconde salve de confettis au scroll")
        XCTAssertTrue(plan.plays(.glow), "Le halo définit le message : il reste")
    }

    func test_unplayedMessage_yieldsAPlanThatFires() {
        let sut = makeSUT()
        let effects = MessageEffects(flags: [.confetti])
        let plan = effects.playbackPlan(hasPlayedAppearance: sut.hasPlayed("msg-1"),
                                        reduceMotion: false)
        XCTAssertTrue(plan.plays(.confetti))
    }
}
