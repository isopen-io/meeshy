import Foundation
import Testing
@testable import MeeshyE2EE

/// **Les vecteurs COMMUNS de ce que libsignal chiffre** (#18943, contrat #18940).
///
/// `packages/shared/fixtures/e2ee-content/` (contenu v1, remplissage) et
/// `e2ee-signal/` (signaux v1) fixent, à l'octet près, ce que l'iPhone, Android
/// et le web écrivent et acceptent. Ce banc les lit par chemin relatif (aucune
/// copie) et rejoue, pour chaque cas, l'encodage canonique, le remplissage et
/// l'ouverture par la chaîne même de `E2EEEnvelopeOpener` : la sonde
/// (`E2EEPayloadKind.of`), le lecteur (`decoded(from:)`, version d'abord), puis
/// la conversation avant l'auteur (`belongs`, `isAuthored`). Un écart qui tombe
/// se corrige dans le SDK, jamais dans le fichier : le fichier est le contrat.
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

    // MARK: - L'ouverture, telle que l'iPhone la juge

    private struct Opening: Equatable, CustomStringConvertible {
        var payload: String
        var verdict: String
        var version: Int? = nil
        var kind: String? = nil

        var description: String { "\(payload)/\(verdict)/\(version.map(String.init) ?? "-")/\(kind ?? "-")" }
    }

    private enum Admitted: Equatable {
        case content(E2EEContent)
        case signal(E2EESignal)
    }

    private struct Envelope {
        let conversationId: String
        let senderUserId: String
        let senderDeviceId: UInt32
    }

    private func envelope(_ entry: [String: Any]) throws -> Envelope {
        let served = try #require(entry["envelope"] as? [String: Any])
        let conversationId = try #require(served["conversationId"] as? String)
        let senderUserId = try #require(served["senderUserId"] as? String)
        let senderDeviceId = try #require(served["senderDeviceId"] as? Int)
        return Envelope(conversationId: conversationId, senderUserId: senderUserId, senderDeviceId: UInt32(senderDeviceId))
    }

    private func open(_ plaintext: Data, under envelope: Envelope) -> (Opening, Admitted?) {
        guard E2EEPayloadKind.of(plaintext) == .signal else { return openContent(plaintext, under: envelope) }
        let signal: E2EESignal
        do {
            signal = try E2EESignal.decoded(from: plaintext)
        } catch E2EESignalError.unsupportedVersion(let version) {
            return (Opening(payload: "signal", verdict: "future-version", version: version), nil)
        } catch {
            return (Opening(payload: "signal", verdict: "unreadable"), nil)
        }
        guard signal.belongs(to: envelope.conversationId) else { return (Opening(payload: "signal", verdict: "misattributed-conversation"), nil) }
        guard signal.isAuthored(by: envelope.senderUserId, deviceId: envelope.senderDeviceId) else {
            return (Opening(payload: "signal", verdict: "misattributed-author"), nil)
        }
        if case .unknown(let kind) = signal.action {
            return (Opening(payload: "signal", verdict: "admitted-unknown-kind", kind: kind), .signal(signal))
        }
        return (Opening(payload: "signal", verdict: "admitted"), .signal(signal))
    }

    private func openContent(_ plaintext: Data, under envelope: Envelope) -> (Opening, Admitted?) {
        let content: E2EEContent
        do {
            content = try E2EEContent.decoded(from: plaintext)
        } catch E2EEContentError.unsupportedVersion(let version) {
            return (Opening(payload: "message", verdict: "future-version", version: version), nil)
        } catch {
            return (Opening(payload: "message", verdict: "unreadable"), nil)
        }
        guard content.belongs(to: envelope.conversationId) else { return (Opening(payload: "message", verdict: "misattributed-conversation"), nil) }
        guard content.isAuthored(by: envelope.senderUserId, deviceId: envelope.senderDeviceId) else {
            return (Opening(payload: "message", verdict: "misattributed-author"), nil)
        }
        let unauthored = content.authorUserId == nil && content.authorDeviceId == nil
        return (Opening(payload: "message", verdict: unauthored ? "admitted-unauthored" : "admitted"), .content(content))
    }

    private func admission(of object: Any?, payload: String) throws -> Admitted? {
        guard let object else { return nil }
        let data = try json(object)
        if payload == "signal" { return .signal(try JSONDecoder().decode(E2EESignal.self, from: data)) }
        return .content(try JSONDecoder().decode(E2EEContent.self, from: data))
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

    @Test func eachContentCase_encodesToItsCanonicalBytes_padsAndOpensAdmitted() throws {
        for entry in try entries(file(Self.contentDirectory, "content.vectors.json"), "cases") {
            let name = entry["name"] as? String ?? "?"
            let content = try JSONDecoder().decode(E2EEContent.self, from: json(entry["object"]))
            let canonical = try bytes(entry["canonicalBase64"])
            let encoded = try content.encoded()

            #expect(encoded == canonical, "encodage canonique : \(name) — \(String(decoding: encoded, as: UTF8.self))")
            #expect(canonical.count == entry["canonicalLength"] as? Int, "longueur canonique : \(name)")
            try expectPadding(of: canonical, entry, name: name)
            let padded = try bytes((entry["padded"] as? [String: Any])?["base64"])
            let served = try envelope(entry)
            let (opening, admitted) = open(padded, under: served)
            #expect(opening == Opening(payload: "message", verdict: "admitted"), "ouverture : \(name)")
            #expect(admitted == .content(content), "contenu ouvert : \(name)")
        }
    }

    @Test func eachContentVerdict_isTheIPhonesVerdict() throws {
        try expectVerdicts(file(Self.contentDirectory, "content.vectors.json"))
    }

    // MARK: - Signaux

    @Test func eachSignalCase_encodesToItsCanonicalBytes_padsAndOpensAdmitted() throws {
        for entry in try entries(file(Self.signalDirectory, "signal.vectors.json"), "cases") {
            let name = entry["name"] as? String ?? "?"
            let signal = try JSONDecoder().decode(E2EESignal.self, from: json(entry["object"]))
            let canonical = try bytes(entry["canonicalBase64"])
            let encoded = try signal.encoded()

            #expect(encoded == canonical, "encodage canonique : \(name) — \(String(decoding: encoded, as: UTF8.self))")
            try expectPadding(of: canonical, entry, name: name)
            let padded = try bytes((entry["padded"] as? [String: Any])?["base64"])
            let served = try envelope(entry)
            let (opening, admitted) = open(padded, under: served)
            #expect(opening.payload == "signal", "sonde : \(name)")
            #expect(opening.verdict == "admitted", "ouverture : \(name) — \(opening)")
            #expect(admitted == .signal(signal), "signal ouvert : \(name)")
        }
    }

    @Test func eachSignalVerdict_isTheIPhonesVerdict() throws {
        try expectVerdicts(file(Self.signalDirectory, "signal.vectors.json"))
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

    private func expectVerdicts(_ vectors: [String: Any]) throws {
        for entry in try entries(vectors, "verdicts") {
            let name = entry["name"] as? String ?? "?"
            let payload = try #require(entry["payload"] as? String)
            let verdict = try #require(entry["verdict"] as? String)
            let wanted = Opening(payload: payload, verdict: verdict, version: entry["version"] as? Int, kind: entry["kind"] as? String)
            let plaintext = try bytes(entry["plaintextBase64"])
            let served = try envelope(entry)

            let (opening, admitted) = open(plaintext, under: served)

            #expect(opening == wanted, "\(name) : rendu \(opening), attendu \(wanted)")
            if let expected = try admission(of: entry["expected"], payload: payload) {
                #expect(admitted == expected, "\(name) : clair ouvert")
            }
        }
    }
}
