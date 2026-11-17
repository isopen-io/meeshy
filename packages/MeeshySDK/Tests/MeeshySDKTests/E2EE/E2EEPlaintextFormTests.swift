import Foundation
import Testing
@testable import MeeshyE2EE

/// **Un clair que le contrat rend illisible l'est aussi sur l'iPhone, même
/// caché dans une clé que l'iPhone ignore** (#18943, contrat #18940).
///
/// `JSONDecoder` ne juge une chaîne qu'en la décodant : un clair qui portait
/// une demi-paire de substitution, un échappement inconnu ou un caractère de
/// contrôle brut dans une clé ignorée se lisait ici et nulle part ailleurs ; une
/// marque d'ordre d'octets ou de l'UTF-16 aussi. Chaque témoin a son miroir sain,
/// qui se lit, pour pouvoir tomber.
@Suite("La forme d'un clair chiffré se juge sur tout le document")
struct E2EEPlaintextFormTests {

    private func content(note: String, version: Int = 1) -> Data {
        Data(#"{"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","conversationId":"64f0c0ffee00000000000c01","note":"\#(note)","sentAt":1790000000000,"text":"x","v":\#(version)}"#.utf8)
    }

    private func signal(note: String) -> Data {
        Data(#"{"active":true,"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","conversationId":"64f0c0ffee00000000000c01","kind":"typing","note":"\#(note)","s":1,"sentAt":1790000000000}"#.utf8)
    }

    private func reads(_ plaintext: Data) -> Bool {
        (try? E2EEContent.decoded(from: plaintext)) != nil
    }

    private static let illFormedNotes: [(String, String)] = [
        ("demi-paire haute seule", #"\ud800"#),
        ("demi-paire basse seule", #"\udc00"#),
        ("demi-paires inversées", #"\ude00\ud83d"#),
        ("demi-paire haute suivie d'un autre échappement", #"\ud83dA"#),
        ("demi-paire haute suivie d'un caractère", #"\ud83dA"#),
        ("demi-paire haute en fin de chaîne", #"a\uD83D"#),
        ("échappement inconnu", #"\x41"#),
        ("chiffre hexadécimal invalide", #"\u12G4"#),
        ("échappement tronqué", #"\u12"#),
        ("octet de contrôle brut", "a\u{01}b"),
        ("tabulation brute dans une chaîne", "a\tb"),
        ("saut de ligne brut dans une chaîne", "a\nb"),
    ]

    private static let wellFormedNotes: [(String, String)] = [
        ("paire de substitution échappée", #"😀"#),
        ("paire en majuscules", #"😀"#),
        ("barre oblique inverse échappée devant un u", #"\\ud800"#),
        ("tous les échappements d'un caractère", #"\"\\\/\b\f\n\r\t"#),
        ("échappement d'un point de code ordinaire", #"é\u0000"#),
        ("émoji brut", "🙈"),
    ]

    @Test func anIllFormedStringInAKeyThisReaderIgnores_makesTheMessageUnreadable() {
        for (name, note) in Self.illFormedNotes {
            #expect(!reads(content(note: note)), "\(name) : illisible pour le contrat, donc ici")
        }
    }

    @Test func aWellFormedStringInAKeyThisReaderIgnores_keepsTheMessageReadable() {
        for (name, note) in Self.wellFormedNotes {
            #expect(reads(content(note: note)), "\(name) : un texte, lisible partout")
        }
    }

    @Test func theFormIsJudgedBeforeTheVersion() {
        #expect(throws: DecodingError.self, "mal formé : illisible, jamais « à relire après la mise à jour »") {
            try E2EEContent.decoded(from: content(note: #"\ud800"#, version: 2))
        }
        #expect(throws: E2EEContentError.unsupportedVersion(2), "le miroir : une version future bien formée se garde") {
            try E2EEContent.decoded(from: content(note: "ok", version: 2))
        }
    }

    @Test func anIllFormedSignal_isAnUnreadableMessage() {
        let illFormed = signal(note: #"\ud83d"#)
        let wellFormed = signal(note: "ok")

        #expect(E2EEPayloadKind.of(illFormed) == .message, "un signal mal formé est un message, que le lecteur juge illisible")
        #expect(!reads(illFormed))
        #expect(throws: DecodingError.self) { try E2EESignal.decoded(from: illFormed) }
        #expect(E2EEPayloadKind.of(wellFormed) == .signal, "le miroir : la sonde reconnaît le signal bien formé")
        #expect((try? E2EESignal.decoded(from: wellFormed)) != nil)
    }

    @Test func aByteOrderMarkOrAnotherEncoding_makesTheMessageUnreadable() {
        let healthy = content(note: "ok")
        let utf16 = String(decoding: healthy, as: UTF8.self).data(using: .utf16LittleEndian) ?? Data()

        #expect(reads(healthy), "le miroir : le même clair en UTF-8 se lit")
        #expect(!reads(Data([0xEF, 0xBB, 0xBF]) + healthy), "marque d'ordre d'octets")
        #expect(!utf16.isEmpty)
        #expect(!reads(utf16), "UTF-16")
        #expect(!reads(Data("{\"v\":1,".utf8) + Data([0x00]) + Data("\"sentAt\":1}".utf8)), "octet nul entre deux jetons")
    }

    @Test func invalidUTF8_makesTheMessageUnreadable_andValidUTF8Reads() {
        let prefix = Data(#"{"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","conversationId":"64f0c0ffee00000000000c01","note":""#.utf8)
        let suffix = Data(#"","sentAt":1790000000000,"text":"x","v":1}"#.utf8)
        let invalid: [(String, [UInt8])] = [
            ("demi-paire encodée en octets", [0xED, 0xA0, 0x80]),
            ("forme trop longue", [0xC0, 0xAF]),
            ("au-delà de U+10FFFF", [0xF4, 0x90, 0x80, 0x80]),
            ("séquence interrompue", [0xC3, 0x28]),
        ]

        for (name, bytes) in invalid {
            #expect(!reads(prefix + Data(bytes) + suffix), "\(name)")
        }
        #expect(reads(prefix + Data([0xF0, 0x9F, 0x99, 0x88]) + suffix), "le miroir : un émoji en UTF-8 valide se lit")
    }

    // MARK: - La profondeur d'imbrication (#19112)

    private func content(rawNote: String, version: Int = 1) -> Data {
        Data(#"{"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","conversationId":"64f0c0ffee00000000000c01","note":\#(rawNote),"sentAt":1790000000000,"text":"x","v":\#(version)}"#.utf8)
    }

    private func signal(rawNote: String) -> Data {
        Data(#"{"active":true,"authorDeviceId":3,"authorUserId":"64f0c0ffee0000000000aaaa","conversationId":"64f0c0ffee00000000000c01","kind":"typing","note":\#(rawNote),"s":1,"sentAt":1790000000000}"#.utf8)
    }

    /// `levels` tableaux imbriqués : sous l'objet du clair, `levels + 1` niveaux.
    private func arrays(_ levels: Int) -> String {
        String(repeating: "[", count: levels) + String(repeating: "]", count: levels)
    }

    @Test func sixtyFourLevels_read_andSixtyFive_areUnreadable() {
        #expect(E2EEPlaintextForm.maxDepth == 64, "la borne du contrat, E2EE_MAX_DEPTH")
        #expect(reads(content(rawNote: arrays(63))), "64 niveaux : la borne se lit")
        #expect(!reads(content(rawNote: arrays(64))), "65 niveaux : illisible")
        #expect(!reads(Data(arrays(1_000).utf8)), "mille niveaux : illisible avant toute analyse")
    }

    @Test func aFutureVersionBeyondTheLimit_isUnreadable_neverKeptForLater() {
        #expect(throws: DecodingError.self, "au-delà de la borne, aucune version ne se garde") {
            try E2EEContent.decoded(from: content(rawNote: arrays(64), version: 2))
        }
        #expect(throws: E2EEContentError.unsupportedVersion(2), "le miroir : sous la borne, une version future se garde") {
            try E2EEContent.decoded(from: content(rawNote: arrays(63), version: 2))
        }
    }

    @Test func bracketsInsideAString_doNotCount() {
        let brackets = String(repeating: "[", count: 400)

        #expect(reads(content(note: #"\"\#(brackets)\\"#)), "après un guillemet échappé et avant une barre échappée : du texte")
        #expect(reads(content(note: #"\"\#(arrays(64))"#)), "65 niveaux de crochets DANS une chaîne : du texte")
    }

    @Test func anEscapedBackslash_closesTheString_andTheArraysAfterItCount() {
        let closed = "\"\\\\\",\"deep\":" + arrays(64)

        #expect(!reads(content(rawNote: closed)), "« \\\\ » ferme la chaîne : les 64 tableaux qui suivent comptent")
    }

    @Test func aSignalBeyondTheLimit_isAnUnreadableMessage() {
        #expect(E2EEPayloadKind.of(signal(rawNote: arrays(64))) == .message)
        #expect(throws: DecodingError.self) { try E2EESignal.decoded(from: signal(rawNote: arrays(64))) }
        #expect(E2EEPayloadKind.of(signal(rawNote: arrays(63))) == .signal, "le miroir : 64 niveaux, un signal")
        #expect((try? E2EESignal.decoded(from: signal(rawNote: arrays(63)))) != nil)
    }

    @Test func thePaddingAndTheBlanksBetweenTokens_keepTheMessageReadable() {
        let padded = content(note: "ok") + Data(repeating: 0x20, count: 40) + Data("\n".utf8)
        let pretty = Data("{\n\t\"authorDeviceId\": 3,\r\n\t\"authorUserId\": \"64f0c0ffee0000000000aaaa\",\n\t\"conversationId\": \"64f0c0ffee00000000000c01\",\n\t\"sentAt\": 1790000000000,\n\t\"text\": \"x\",\n\t\"v\": 1\n}".utf8)

        #expect(reads(padded))
        #expect(reads(pretty))
    }
}
