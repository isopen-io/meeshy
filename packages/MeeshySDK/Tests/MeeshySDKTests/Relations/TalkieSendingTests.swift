import Foundation
import Testing
@testable import MeeshySDK

/// ÉMETTRE LE TALKIE (#16927) — ce que l'émetteur iOS lit du contrat `packages/shared/types/talkie.ts` : l'accusé de
/// `talkie:start`, ses refus codés, l'en-tête ADTS de chaque trame et le découpage en fragments sous les plafonds.
struct TalkieSendingTests {

    // MARK: - L'accusé de `talkie:start`

    private func verdict(_ raw: Any?) -> TalkieStartVerdict {
        TalkieStartVerdict.read(SocketAck<TalkieOpenedWire>.parse(raw, payloadAt: .data))
    }

    @Test func unAccuseOuvert_rendLaPriseDeParoleEtSesBornes() {
        let read = verdict([
            "success": true,
            "data": ["talkieId": "aaaaaaaaaaaaaaaaaaaaaaaa", "maxDurationMs": 20_000, "maxChunkBytes": 8_192],
        ])
        #expect(read == .opened(TalkieOpened(talkieId: "aaaaaaaaaaaaaaaaaaaaaaaa", maxDuration: 20, maxChunkBytes: 8_192)))
    }

    @Test func desBornesServiesAbsurdes_sontRameneesAuContrat() {
        let read = verdict([
            "success": true,
            "data": ["talkieId": "aaaaaaaaaaaaaaaaaaaaaaaa", "maxDurationMs": 999_999, "maxChunkBytes": -4],
        ])
        #expect(read == .opened(TalkieOpened(
            talkieId: "aaaaaaaaaaaaaaaaaaaaaaaa",
            maxDuration: TalkieContract.maxDuration,
            maxChunkBytes: TalkieContract.maxChunkBytes
        )))
    }

    @Test func unAccuseSansIdentifiant_estUnEchec() {
        #expect(verdict(["success": true, "data": ["talkieId": ""]]) == .refused(.failed))
        #expect(verdict(["success": true]) == .refused(.failed))
    }

    @Test func unBlocageEtUnRepli_rendentLaMemeIssue() {
        #expect(verdict(["success": false, "error": "x", "code": "TALKIE_BLOCKED"]) == .refused(.voice))
        #expect(verdict(["success": false, "error": "x", "code": "TALKIE_FALLBACK_VOICE"]) == .refused(.voice))
    }

    @Test func chaqueRefusCode_aSonIssue() {
        #expect(verdict(["success": false, "code": "TALKIE_NOT_ALLOWED"]) == .refused(.notAllowed))
        #expect(verdict(["success": false, "code": "TALKIE_E2EE_CONVERSATION"]) == .refused(.e2ee))
        #expect(verdict(["success": false, "code": "TALKIE_RATE_LIMITED"]) == .refused(.rateLimited))
        #expect(verdict(["success": false, "code": "TALKIE_UNAVAILABLE"]) == .refused(.failed))
        #expect(verdict(["success": false]) == .refused(.failed))
    }

    @Test func unAccuseQuiTarde_vautHorsLigne() {
        #expect(verdict("NO ACK") == .refused(.offline))
        #expect(verdict(nil) == .refused(.offline))
    }

    // MARK: - L'en-tête ADTS

    @Test func lEnTeteADTS_estCeluiDUnAacLcMono() throws {
        let packet = Data(repeating: 0xAB, count: 100)
        let frame = try #require(TalkieAdts.frame(packet, sampleRate: 48_000, channels: 1))
        #expect(frame.count == 107)
        #expect(Array(frame.prefix(7)) == [0xFF, 0xF1, 0x4C, 0x40, 0x0D, 0x7F, 0xFC])
        #expect(frame.suffix(100) == packet)
    }

    @Test func lIndexDeFrequence_suitLaTableMpeg4() throws {
        let frame = try #require(TalkieAdts.frame(Data([1]), sampleRate: 44_100, channels: 1))
        #expect((frame[2] >> 2) & 0x0F == 4)
        let low = try #require(TalkieAdts.frame(Data([1]), sampleRate: 16_000, channels: 1))
        #expect((low[2] >> 2) & 0x0F == 8)
    }

    @Test func uneFrequenceHorsTable_ouUneTrameTropLongue_neSeCadrentPas() {
        #expect(TalkieAdts.frame(Data([1]), sampleRate: 47_000, channels: 1) == nil)
        #expect(TalkieAdts.frame(Data(count: 8_190), sampleRate: 48_000, channels: 1) == nil)
        #expect(TalkieAdts.frame(Data(), sampleRate: 48_000, channels: 1) == nil)
    }

    // MARK: - Le découpage en fragments

    private static let start = Date(timeIntervalSince1970: 1_000)
    private static let frameDuration: TimeInterval = 1024.0 / 48_000

    @Test func unFragmentPart_desQuIlAtteintSaDuree() {
        var fragmenter = TalkieFragmenter()
        let completed = (0..<12).flatMap { index in
            fragmenter.append(Data(repeating: UInt8(index), count: 10), duration: Self.frameDuration, at: Self.start.addingTimeInterval(Double(index)))
        }
        #expect(completed.count == 1)
        #expect(completed.first?.data.count == 120)
        #expect(completed.first?.capturedAt == Self.start)
        #expect(fragmenter.flush() == nil)
    }

    @Test func unFragmentPart_avantDeDepasserLePlafondDOctets() {
        var fragmenter = TalkieFragmenter(maxChunkBytes: 25)
        let first = fragmenter.append(Data(count: 10), duration: 0.01, at: Self.start)
        let second = fragmenter.append(Data(count: 10), duration: 0.01, at: Self.start)
        let third = fragmenter.append(Data(count: 10), duration: 0.01, at: Self.start.addingTimeInterval(1))
        #expect(first.isEmpty && second.isEmpty)
        #expect(third.map(\.data.count) == [20])
        #expect(fragmenter.flush()?.capturedAt == Self.start.addingTimeInterval(1))
    }

    @Test func relacher_videCeQuiReste() {
        var fragmenter = TalkieFragmenter()
        _ = fragmenter.append(Data(count: 7), duration: 0.02, at: Self.start)
        #expect(fragmenter.flush()?.data.count == 7)
        #expect(fragmenter.flush() == nil)
    }

    @Test func uneTrameVide_nEntrePas() {
        var fragmenter = TalkieFragmenter()
        #expect(fragmenter.append(Data(), duration: 1, at: Self.start).isEmpty)
        #expect(fragmenter.flush() == nil)
    }

    // MARK: - Les plafonds d'une prise de parole

    @Test func leBudget_numeroteDansLOrdreEtRefuseAuDelaDesPlafonds() {
        var budget = TalkieBudget(maxTotalBytes: 30, maxChunks: 2)
        #expect(budget.admit(bytes: 10) == 0)
        #expect(budget.admit(bytes: 10) == 1)
        #expect(budget.admit(bytes: 1) == nil)
        var bytes = TalkieBudget(maxTotalBytes: 15, maxChunks: 10)
        #expect(bytes.admit(bytes: 10) == 0)
        #expect(bytes.admit(bytes: 10) == nil)
        #expect(bytes.admit(bytes: 5) == 1)
    }

    @Test func leBudgetParDefaut_estCeluiDuContrat() {
        #expect(TalkieContract.maxChunkBytes == 16_384)
        #expect(TalkieContract.maxTotalBytes == 512_000)
        #expect(TalkieContract.maxChunks == 300)
        #expect(SocketEvent.talkieStart.rawValue == "talkie:start")
        #expect(SocketEvent.talkieSendChunk.rawValue == "talkie:send-chunk")
        #expect(SocketEvent.talkieEnd.rawValue == "talkie:end")
    }
}
