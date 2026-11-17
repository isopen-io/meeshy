import Testing
import Foundation
@testable import MeeshySDK

/// #18925 — `userPreferences[0]` de `GET /conversations` et `GET /conversations/:id` sert la version,
/// « mentions seulement », l'ordre manuel et l'effacement d'historique du lecteur. iOS les posait à leur
/// défaut : `version 0` et l'ordre perdu sur un store vierge, l'historique effacé ailleurs qui réapparaissait.
@Suite("Les préférences du lecteur servies par la ligne de conversation (#18925)")
struct APIConversationReaderPreferencesTests {

    private static func conversation(preferences: String) throws -> MeeshyConversation {
        let json = #"{"id":"conv1","type":"group","title":"Équipe","createdAt":"2026-10-01T10:00:00.000Z","userPreferences":[\#(preferences)]}"#
        return try MeeshyCoders.decoder(.api).decode(APIConversation.self, from: Data(json.utf8))
            .toConversation(currentUserId: "u1")
    }

    @Test("la version, mentions seulement, l'ordre et l'effacement d'historique servis atteignent l'état du lecteur")
    func servedReaderPreferencesReachTheUserState() throws {
        let served = try Self.conversation(preferences: #"""
            {"isPinned":true,"version":7,"mentionsOnly":true,"orderInCategory":3,"clearHistoryBefore":"2026-11-10T08:00:00.000Z"}
            """#)

        #expect(served.userState.version == 7)
        #expect(served.userState.mentionsOnly)
        #expect(served.userState.orderInCategory == 3)
        #expect(served.userState.clearHistoryBefore == WireDate.date(from: "2026-11-10T08:00:00.000Z"))
    }

    @Test("une ligne synthétisée sert la version 0, et un serveur antérieur sans ces clés n'en fabrique aucune")
    func synthesizedOrOlderRowsKeepTheDefaults() throws {
        let synthesized = try Self.conversation(preferences: #"""
            {"version":0,"mentionsOnly":false,"orderInCategory":null,"clearHistoryBefore":null}
            """#)
        let older = try Self.conversation(preferences: #"{"isPinned":false}"#)

        for row in [synthesized, older] {
            #expect(row.userState.version == 0)
            #expect(!row.userState.mentionsOnly)
            #expect(row.userState.orderInCategory == nil)
            #expect(row.userState.clearHistoryBefore == nil)
        }
    }
}
