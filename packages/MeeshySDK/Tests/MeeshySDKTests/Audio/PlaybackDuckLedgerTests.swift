import Testing
import Foundation
@testable import MeeshySDK

/// #11042 — le son Meeshy BAISSE pendant un enregistrement, sans s'arrêter, et
/// remonte EXACTEMENT au volume qu'il avait.
struct PlaybackDuckLedgerTests {

    private final class Player {}

    @Test func theDuckedFactorKeepsTheSoundAudible() {
        #expect(PlaybackDuckLedger.duckedFactor >= 0.25)
        #expect(PlaybackDuckLedger.duckedFactor <= 0.3)
    }

    @Test func duck_lowersTheVolumeByTheFactor() {
        var ledger = PlaybackDuckLedger()
        let player = Player()

        let applied = ledger.duck(ObjectIdentifier(player), currentVolume: 0.8)

        #expect(applied == 0.8 * PlaybackDuckLedger.duckedFactor)
        #expect(!ledger.isEmpty)
    }

    @Test func restore_givesBackExactlyTheRememberedVolume() throws {
        var ledger = PlaybackDuckLedger()
        let key = ObjectIdentifier(Player())
        let ducked = ledger.duck(key, currentVolume: 0.8)
        let applied = try #require(ducked)

        #expect(ledger.restore(key, currentVolume: applied) == 0.8)
        #expect(ledger.isEmpty)
    }

    @Test func duckingTwice_isIdempotentAndRestoresTheOriginal() throws {
        var ledger = PlaybackDuckLedger()
        let key = ObjectIdentifier(Player())
        let ducked = ledger.duck(key, currentVolume: 1)
        let applied = try #require(ducked)

        #expect(ledger.duck(key, currentVolume: applied) == nil)
        #expect(ledger.restore(key, currentVolume: applied) == 1)
    }

    @Test func restoreWithoutDuck_doesNothing() {
        var ledger = PlaybackDuckLedger()

        #expect(ledger.restore(ObjectIdentifier(Player()), currentVolume: 0.4) == nil)
    }

    @Test func aVolumeTheUserChangedDuringTheRecording_isKept() throws {
        var ledger = PlaybackDuckLedger()
        let key = ObjectIdentifier(Player())
        let ducked = ledger.duck(key, currentVolume: 1)
        _ = try #require(ducked)

        #expect(ledger.restore(key, currentVolume: 0) == nil)
        #expect(ledger.isEmpty)
    }

    @Test func aSilentPlayer_isNotDucked() {
        var ledger = PlaybackDuckLedger()

        #expect(ledger.duck(ObjectIdentifier(Player()), currentVolume: 0) == nil)
        #expect(ledger.isEmpty)
    }

    @Test func restoringTwice_restoresOnce() throws {
        var ledger = PlaybackDuckLedger()
        let key = ObjectIdentifier(Player())
        let ducked = ledger.duck(key, currentVolume: 1)
        let applied = try #require(ducked)

        #expect(ledger.restore(key, currentVolume: applied) == 1)
        #expect(ledger.restore(key, currentVolume: 1) == nil)
    }

    @Test func forget_dropsAPlayerThatIsGone() throws {
        var ledger = PlaybackDuckLedger()
        let key = ObjectIdentifier(Player())
        let ducked = ledger.duck(key, currentVolume: 1)
        _ = try #require(ducked)

        ledger.forget(key)

        #expect(ledger.isEmpty)
    }
}
