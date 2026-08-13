import Foundation
import MeeshySDK
import XCTest
@testable import Meeshy

/// Le contrat de présence qui franchit l'App Group.
///
/// **Le défaut d'origine.** `WidgetDataManager` publiait
/// `conv.lastSeenText ?? "Offline"` — un libellé HUMAIN, en français codé en
/// dur dans le SDK (« En ligne », « Vu il y a 3min »). Le widget Favoris, seul
/// lecteur du champ, allumait sa pastille de présence sur
/// `contact.status == "Online"`. La comparaison ne pouvait donc jamais être
/// vraie : la pastille était littéralement inatteignable, dans toutes les
/// langues, depuis toujours.
///
/// Le champ existait, l'écrivain écrivait, le lecteur lisait, et rien n'était
/// rouge — parce que les deux côtés étaient corrects SÉPARÉMENT. Ce qui
/// manquait n'était vérifiable qu'en confrontant l'écrivain au lecteur, ce que
/// cette suite fait : ce qui traverse un processus doit être une DONNÉE, et
/// les deux bouts doivent s'accorder sur son vocabulaire.
@MainActor
final class WidgetPresenceContractTests: XCTestCase {

    // MARK: - Fixtures

    private func makeSUT(
        presence: @escaping @MainActor (String) -> PresenceState? = { _ in nil }
    ) throws -> (WidgetDataManager, UserDefaults) {
        let suite = "group.test.meeshy.presence.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let sut = WidgetDataManager(
            suiteName: suite,
            stagingDirectories: [],
            preferredContentLanguages: { [] },
            presenceState: presence
        )
        return (sut, defaults)
    }

    private func makePinnedDirect(
        id: String = "conv-1",
        participantUserId: String? = "user-1",
        lastSeenAt: Date? = nil
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: "ident-\(id)",
            type: .direct,
            title: "Alice",
            isPinned: true,
            participantUserId: participantUserId,
            lastSeenAt: lastSeenAt
        )
    }

    private func publishedContacts(
        _ defaults: UserDefaults
    ) throws -> [WidgetFavoriteContact] {
        let data = try XCTUnwrap(defaults.data(forKey: "favorite_contacts"))
        return try JSONDecoder().decode([WidgetFavoriteContact].self, from: data)
    }

    // MARK: - Le jeton publié est celui que le widget sait lire

    /// Le témoin qui aurait rougi avant le correctif : `"En ligne"` n'est pas
    /// un membre du vocabulaire, et aucune valeur produite par l'ancien code
    /// ne l'était.
    func test_publishedPresence_isAlwaysAKnownToken() throws {
        let known = Set([
            PresenceState.online, .away, .idle, .offline,
        ].map(\.rawValue))
        let cases: [(String, PresenceState?, Date?)] = [
            ("live-online", .online, nil),
            ("live-away", .away, nil),
            ("live-idle", .idle, nil),
            ("live-offline", .offline, nil),
            ("rest-recent", nil, Date()),
            ("rest-old", nil, Date().addingTimeInterval(-3600)),
            ("no-data", nil, nil),
        ]

        for (id, live, lastSeen) in cases {
            let (sut, defaults) = try makeSUT(presence: { _ in live })
            sut.publishFavoriteContacts([makePinnedDirect(id: id, lastSeenAt: lastSeen)])
            let published = try XCTUnwrap(publishedContacts(defaults).first)
            XCTAssertTrue(
                known.contains(published.presence),
                "\(id) a publié « \(published.presence) », hors du vocabulaire \(known.sorted())"
            )
        }
    }

    func test_publishedPresence_prefersRealtimeOverRestTimestamp() throws {
        // Horodatage REST vieux de deux heures — le pair serait « offline » —
        // mais le temps réel le sait connecté (snapshot, user:status ou
        // typing:start). C'est le temps réel qui doit gagner, comme dans la
        // liste in-app.
        let (sut, defaults) = try makeSUT(presence: { _ in .online })
        sut.publishFavoriteContacts([
            makePinnedDirect(lastSeenAt: Date().addingTimeInterval(-7200)),
        ])

        XCTAssertEqual(try publishedContacts(defaults).first?.presence, PresenceState.online.rawValue)
    }

    func test_publishedPresence_fallsBackToRestTimestampWhenPeerIsUntracked() throws {
        // Un favori jamais croisé depuis le lancement n'est pas « hors ligne » :
        // il est inconnu du temps réel. Son horodatage REST reste la meilleure
        // donnée dont on dispose.
        let (sut, defaults) = try makeSUT(presence: { _ in nil })
        sut.publishFavoriteContacts([makePinnedDirect(lastSeenAt: Date())])

        XCTAssertEqual(try publishedContacts(defaults).first?.presence, PresenceState.online.rawValue)
    }

    func test_publishedPresence_isOfflineWithoutAnySignal() throws {
        let (sut, defaults) = try makeSUT(presence: { _ in nil })
        sut.publishFavoriteContacts([makePinnedDirect(participantUserId: nil, lastSeenAt: nil)])

        XCTAssertEqual(try publishedContacts(defaults).first?.presence, PresenceState.offline.rawValue)
    }

    /// Règle produit 1/3/5 appliquée au repli REST : au-delà de cinq minutes,
    /// le pair est hors ligne — et hors ligne ne rend AUCUNE pastille.
    func test_publishedPresence_appliesTheOneThreeFiveRuleToRestTimestamps() throws {
        let expectations: [(TimeInterval, PresenceState)] = [
            (-30, .online), (-120, .away), (-240, .idle), (-600, .offline),
        ]

        for (offset, expected) in expectations {
            let (sut, defaults) = try makeSUT(presence: { _ in nil })
            sut.publishFavoriteContacts([
                makePinnedDirect(lastSeenAt: Date().addingTimeInterval(offset)),
            ])
            XCTAssertEqual(
                try publishedContacts(defaults).first?.presence, expected.rawValue,
                "\(Int(-offset))s après la dernière activité"
            )
        }
    }

    // MARK: - Le lecteur parle bien le même vocabulaire

    /// La cible widget ne peut pas lier `MeeshySDK` : elle recopie les symboles
    /// de `PresenceState` dans son propre `WidgetPresence`. Cette recopie est
    /// le contrat — cette garde la confronte à la source, par balayage du
    /// fichier (le bundle de tests ne compile pas la cible widget).
    func test_widgetMirror_declaresExactlyTheSDKTokens() throws {
        let source = try widgetSource()
        let cases = try firstMatch(
            in: source,
            pattern: #"enum WidgetPresence: String \{\s*case ([^\n]+)"#
        )
        let mirrored = Set(
            cases.split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
        )
        let sdk = Set([PresenceState.online, .away, .idle, .offline].map(\.rawValue))

        XCTAssertEqual(
            mirrored, sdk,
            "le miroir widget a divergé des jetons du SDK — le payload App Group cesserait d'être lisible"
        )
    }

    /// Le mapping couleur central (`PresenceState.dotColor`) n'est pas
    /// atteignable depuis la cible widget non plus ; elle en recopie les hex.
    /// Ils doivent rester ceux de `MeeshyColors`.
    func test_widgetMirror_usesTheCentralPresencePalette() throws {
        let source = try widgetSource()
        let expected = [
            "successHex": "34D399",     // MeeshyColors.success  — online
            "warningHex": "FBBF24",     // MeeshyColors.warning  — away
            "neutral400Hex": "9CA3AF",  // MeeshyColors.neutral400 — idle
        ]

        for (constant, hex) in expected {
            let found = try firstMatch(in: source, pattern: "static let \(constant) = \"([0-9A-Fa-f]{6})\"")
            XCTAssertEqual(found, hex, "\(constant) a divergé de la palette centrale")
        }
    }

    /// `offline` ne rend AUCUNE pastille (comportement WhatsApp, `CLAUDE.md`
    /// § User Presence). La règle est ici tenue par un `nil` dans `dotHex` —
    /// la garde vérifie que ce `nil` n'a pas été remplacé par un gris, ce qui
    /// ferait apparaître une pastille sur tous les contacts hors ligne.
    func test_widgetMirror_rendersNoDotWhenOffline() throws {
        let source = try widgetSource()
        XCTAssertTrue(
            source.contains("case .offline: return nil"),
            "hors ligne doit rendre nil (aucune pastille) dans WidgetPresence.dotHex"
        )
    }

    // MARK: - Balayage

    private func widgetSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("MeeshyWidgets/MeeshyWidgets.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(source.isEmpty, "source du widget introuvable — balayage vide")
        return source
    }

    private func firstMatch(in source: String, pattern: String) throws -> String {
        let regex = try NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators])
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        let match = try XCTUnwrap(
            regex.firstMatch(in: source, range: range),
            "motif introuvable dans la source du widget : \(pattern)"
        )
        let captured = try XCTUnwrap(Range(match.range(at: 1), in: source))
        return String(source[captured])
    }
}
