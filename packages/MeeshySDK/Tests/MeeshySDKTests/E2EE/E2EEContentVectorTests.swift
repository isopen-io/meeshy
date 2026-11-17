import Foundation
import Testing
@testable import MeeshyE2EE
@testable import MeeshySDK

/// **Les vecteurs COMMUNS de ce que libsignal chiffre** (#18943, contrat #18940).
///
/// `packages/shared/fixtures/e2ee-content/` (contenu v1, remplissage) et
/// `e2ee-signal/` (signaux v1) fixent, à l'octet près, ce que l'iPhone, Android
/// et le web écrivent et acceptent. Ce banc les lit par chemin relatif (aucune
/// copie) et rejoue, pour chaque cas, l'encodage canonique, le remplissage et
/// l'OUVERTURE par l'ouvreur RÉEL (R-7) : chaque clair est scellé tel quel par
/// l'appareil auteur des vecteurs (`64f0…aaaa`, appareil 3), relayé, puis ouvert
/// par le `E2EEEnvelopeOpener` d'un lecteur — sonde, lecteur, place et auteur,
/// garde de ce qu'il ne lit pas, exactement comme en production. Un écart qui
/// tombe se corrige dans le SDK, jamais dans le fichier : le fichier est le contrat.
@Suite("Vecteurs communs du contenu et des signaux chiffrés")
struct E2EEContentVectorTests {

    private static let repository: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    private static let contentDirectory = repository.appendingPathComponent("packages/shared/fixtures/e2ee-content/")
    private static let signalDirectory = repository.appendingPathComponent("packages/shared/fixtures/e2ee-signal/")

    private func file(_ directory: URL, _ name: String) throws -> [String: Any] {
        let data = try Data(contentsOf: directory.appendingPathComponent(name))
        let object = try JSONSerialization.jsonObject(with: data)
        return try #require(object as? [String: Any])
    }

    private func entries(_ file: [String: Any], _ key: String) throws -> [[String: Any]] {
        let list = try #require(file[key] as? [[String: Any]])
        #expect(!list.isEmpty, "\(key) vide : le banc ne mesurerait rien")
        return list
    }

    private func bytes(_ base64: Any?) throws -> Data {
        try #require((base64 as? String).flatMap { Data(base64Encoded: $0) }, "base64 illisible dans les vecteurs")
    }

    private func json(_ object: Any?) throws -> Data {
        let present = try #require(object)
        return try JSONSerialization.data(withJSONObject: present)
    }

    private func conversation(of entry: [String: Any]) throws -> String {
        let served = try #require(entry["envelope"] as? [String: Any])
        return try #require(served["conversationId"] as? String)
    }

    // MARK: - Le banc : l'auteur des vecteurs, un lecteur, l'ouvreur réel

    private struct Bench {
        static let authorId = "64f0c0ffee0000000000aaaa"
        static let readerId = "64f0c0ffee0000000000dddd"

        let server: FakeE2EEServer
        let author: E2EETestPeer
        let reader: E2EETestPeer

        /// L'auteur est l'appareil 3 de `64f0…aaaa`, celui que les vecteurs
        /// nomment : ses deux premiers appareils, non approuvés, ne reçoivent rien.
        static func make() async throws -> Bench {
            let server = FakeE2EEServer()
            for _ in 1...2 { _ = try await E2EETestPeer.enroll(authorId, on: server) }
            let author = try await E2EETestPeer.enroll(authorId, on: server)
            let reader = try await E2EETestPeer.enroll(readerId, on: server)
            try #require(author.device.deviceId == 3, "les vecteurs nomment l'appareil 3")
            return Bench(server: server, author: author, reader: reader)
        }

        /// Le clair, scellé tel quel pour le lecteur, relayé dans la conversation
        /// de l'enveloppe des vecteurs, puis ouvert par l'ouvreur du lecteur.
        func open(_ plaintext: Data, in conversationId: String, as messageId: String) async throws -> E2EEOpenOutcome {
            let sealed = try await author.sealer.seal(plaintext: plaintext, to: reader.userId)
            try server.relay(sealed, from: author.userId, conversationId: conversationId, participants: [author.userId, reader.userId], messageId: messageId)
            let envelope = try #require(server.pending(userId: reader.userId, deviceId: reader.device.deviceId).last)
            return reader.opener.open(envelope)
        }

        func kept(_ messageId: String) throws -> E2EEKeptPlaintext? {
            guard case .awaitsUpgrade(let kept)? = try reader.plaintexts.entry(for: messageId) else { return nil }
            return kept
        }
    }

    // MARK: - Ce que l'iPhone fait de chaque verdict

    /// Un contenu admis s'ouvre ; un signal admis se range ; une version future
    /// se GARDE, privée de ses blancs de fin ; un contenu illisible se garde
    /// aussi, sans version (une version qui saurait le lire le relira) ; un
    /// signal illisible et tout clair mal placé se jugent.
    private enum Handling: Equatable, CustomStringConvertible {
        case opened(E2EEContent)
        case signal(E2EESignal)
        case unknownSignal(kind: String)
        case kept(version: Int?, isSignal: Bool, json: String?)
        case judged
        case other(String)

        var description: String {
            switch self {
            case .opened(let content): "ouvert \(content.text ?? "-")"
            case .signal(let signal): "signal \(signal.action)"
            case .unknownSignal(let kind): "signal inconnu \(kind)"
            case .kept(let version, let isSignal, let json): "gardé v\(version.map(String.init) ?? "-") signal=\(isSignal) \(json ?? "")"
            case .judged: "jugé"
            case .other(let what): what
            }
        }
    }

    private func handling(of outcome: E2EEOpenOutcome, as messageId: String, on bench: Bench) throws -> Handling {
        switch outcome {
        case .opened(let message):
            return .opened(message.content)
        case .signal(let received):
            if case .unknown(let kind) = received.signal.action { return .unknownSignal(kind: kind) }
            return .signal(received.signal)
        case .awaitingUpgrade:
            guard let kept = try bench.kept(messageId) else { return .other("gardé sans entrée au coffre") }
            let json = kept.version == nil ? nil : String(decoding: kept.bytes, as: UTF8.self)
            return .kept(version: kept.version, isSignal: kept.isSignal, json: json)
        case .undecryptable:
            return .judged
        case .notForThisDevice, .deferred:
            return .other("\(outcome)")
        }
    }

    private func expectedHandling(of entry: [String: Any]) throws -> Handling {
        let isSignal = try #require(entry["payload"] as? String) == "signal"
        switch try #require(entry["verdict"] as? String) {
        case "admitted", "admitted-unauthored":
            let expected = try json(entry["expected"])
            guard isSignal else {
                let content = try JSONDecoder().decode(E2EEContent.self, from: expected)
                return .opened(content)
            }
            let signal = try JSONDecoder().decode(E2EESignal.self, from: expected)
            return .signal(signal)
        case "admitted-unknown-kind":
            let kind = try #require(entry["kind"] as? String)
            return .unknownSignal(kind: kind)
        case "future-version":
            let version = try #require(entry["version"] as? Int)
            let kept = try #require(entry["plaintextJson"] as? String)
            return .kept(version: version, isSignal: isSignal, json: kept)
        case "unreadable":
            return isSignal ? .judged : .kept(version: nil, isSignal: false, json: nil)
        default:
            return .judged
        }
    }

    // MARK: - Le contrat

    @Test func theFilesDeclareTheVersionsThisSDKWrites() throws {
        let content = try file(Self.contentDirectory, "content.vectors.json")
        let signal = try file(Self.signalDirectory, "signal.vectors.json")

        #expect(content["contract"] as? String == "meeshy-e2ee-content")
        #expect(content["version"] as? Int == E2EEContent.currentVersion)
        #expect(signal["contract"] as? String == "meeshy-e2ee-signal")
        #expect(signal["version"] as? Int == E2EESignal.currentVersion)
    }

    // MARK: - Contenu

    @Test func eachContentCase_encodesToItsCanonicalBytes_padsAndOpensAdmitted() async throws {
        let bench = try await Bench.make()
        for entry in try entries(file(Self.contentDirectory, "content.vectors.json"), "cases") {
            let name = entry["name"] as? String ?? "?"
            let content = try JSONDecoder().decode(E2EEContent.self, from: json(entry["object"]))
            let canonical = try bytes(entry["canonicalBase64"])
            let encoded = try content.encoded()

            #expect(encoded == canonical, "encodage canonique : \(name) — \(String(decoding: encoded, as: UTF8.self))")
            #expect(canonical.count == entry["canonicalLength"] as? Int, "longueur canonique : \(name)")
            try expectPadding(of: canonical, entry, name: name)
            let padded = try bytes((entry["padded"] as? [String: Any])?["base64"])
            let outcome = try await bench.open(padded, in: conversation(of: entry), as: "case-\(name)")
            let seen = try handling(of: outcome, as: "case-\(name)", on: bench)
            #expect(seen == .opened(content), "ouverture : \(name) — \(seen)")
        }
    }

    @Test func eachContentVerdict_isWhatTheIPhonesOpenerDoes() async throws {
        try await expectVerdicts(file(Self.contentDirectory, "content.vectors.json"))
    }

    // MARK: - Signaux

    @Test func eachSignalCase_encodesToItsCanonicalBytes_padsAndOpensAdmitted() async throws {
        let bench = try await Bench.make()
        for entry in try entries(file(Self.signalDirectory, "signal.vectors.json"), "cases") {
            let name = entry["name"] as? String ?? "?"
            let signal = try JSONDecoder().decode(E2EESignal.self, from: json(entry["object"]))
            let canonical = try bytes(entry["canonicalBase64"])
            let encoded = try signal.encoded()

            #expect(encoded == canonical, "encodage canonique : \(name) — \(String(decoding: encoded, as: UTF8.self))")
            try expectPadding(of: canonical, entry, name: name)
            let padded = try bytes((entry["padded"] as? [String: Any])?["base64"])
            let outcome = try await bench.open(padded, in: conversation(of: entry), as: "case-\(name)")
            let seen = try handling(of: outcome, as: "case-\(name)", on: bench)
            #expect(seen == .signal(signal), "ouverture : \(name) — \(seen)")
        }
    }

    @Test func eachSignalVerdict_isWhatTheIPhonesOpenerDoes() async throws {
        try await expectVerdicts(file(Self.signalDirectory, "signal.vectors.json"))
    }

    // MARK: - Remplissage

    @Test func thePaddingConstants_areTheContracts() throws {
        let padding = try file(Self.contentDirectory, "padding.vectors.json")

        #expect(padding["tiers"] as? [Int] == E2EEPadding.tiers)
        #expect(padding["step"] as? Int == E2EEPadding.step)
        #expect(padding["maxEnvelopeBytes"] as? Int == E2EEPadding.maxEnvelopeBytes)
        #expect(padding["maxTotalBytes"] as? Int == E2EEPadding.maxTotalBytes)
        #expect(padding["cipherOverhead"] as? Int == E2EEPadding.cipherOverhead)
        #expect(padding["byte"] as? Int == 0x20)
    }

    @Test func eachPaddingLine_isThePaddedLength() throws {
        let padding = try file(Self.contentDirectory, "padding.vectors.json")

        for line in try entries(padding, "lengths") {
            let length = try #require(line["length"] as? Int)
            let recipients = try #require(line["recipients"] as? Int)
            #expect(E2EEPadding.paddedLength(for: length, recipients: recipients) == line["padded"] as? Int,
                    "palier de \(length) octets pour \(recipients) enveloppe(s)")
        }
        for line in try entries(padding, "ceilings") {
            let recipients = try #require(line["recipients"] as? Int)
            #expect(E2EEPadding.ceiling(recipients: recipients) == line["ceiling"] as? Int, "plafond pour \(recipients) enveloppe(s)")
        }
    }

    // MARK: - Outils

    private func expectPadding(of canonical: Data, _ entry: [String: Any], name: String) throws {
        let padded = try #require(entry["padded"] as? [String: Any])
        let recipients = try #require(padded["recipients"] as? Int)
        let written = E2EEPadding.padded(canonical, recipients: recipients)
        let wanted = try bytes(padded["base64"])

        #expect(written == wanted, "remplissage : \(name)")
        #expect(written.count == padded["length"] as? Int, "palier : \(name)")
    }

    /// Chaque verdict, à travers l'ouvreur réel : la sonde dit le `payload` du
    /// contrat, et l'ouvreur fait ce que l'iPhone doit faire de ce verdict.
    private func expectVerdicts(_ vectors: [String: Any]) async throws {
        let bench = try await Bench.make()
        for entry in try entries(vectors, "verdicts") {
            let name = entry["name"] as? String ?? "?"
            let plaintext = try bytes(entry["plaintextBase64"])
            let payload = try #require(entry["payload"] as? String)
            let messageId = "verdict-\(name)"

            #expect(E2EEPayloadKind.of(plaintext) == (payload == "signal" ? .signal : .message), "sonde : \(name)")
            let outcome = try await bench.open(plaintext, in: conversation(of: entry), as: messageId)
            let seen = try handling(of: outcome, as: messageId, on: bench)
            let wanted = try expectedHandling(of: entry)
            #expect(seen == wanted, "\(name) : rendu \(seen), attendu \(wanted)")
        }
    }
}
