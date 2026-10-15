import Testing
import Foundation
@testable import MeeshySDK

/// #7759 — la ligne d'arrivées de Meeshy Global (`metadata.kind ==
/// "members-arrived"`, #7740) se dit dans la langue du LECTEUR, en bulle comme
/// en liste. Son `content` n'est qu'un repli français ; la phrase se compose
/// depuis la métadonnée avec les quatre clés `system.members.arrived.*`. Les
/// cas reprennent ceux du témoin TS (`packages/shared/__tests__/arrivals-notice.test.ts`).
@Suite("ArrivalsNoticeMetadata — la ligne d'arrivées se lit dans la langue du lecteur (#7759)")
struct ArrivalsNoticeMetadataTests {

    private static func metadataJSON(names: [String], count: Int? = nil) -> String {
        let arrivals = names.enumerated()
            .map { #"{"participantId":"p-\#($0.offset)","displayName":"\#($0.element)"}"# }
            .joined(separator: ",")
        return #"{"kind":"members-arrived","arrivals":[\#(arrivals)],"count":\#(count ?? names.count),"windowStartedAt":"2026-09-28T09:00:00.000Z"}"#
    }

    private static func notice(_ names: [String], count: Int? = nil) throws -> ArrivalsNoticeMetadata {
        try JSONDecoder().decode(ArrivalsNoticeMetadata.self, from: Data(metadataJSON(names: names, count: count).utf8))
    }

    /// Les modèles du catalogue partagé, jetons compris — le SDK fait la substitution.
    private static let french = ConversationPreviewStrings(language: "fr") { key in
        switch key {
        case .systemMembersArrivedOne: return "{first} vient d’arriver — dis-lui salut"
        case .systemMembersArrivedTwo: return "{first} et {second} viennent d’arriver — dis-leur salut"
        case .systemMembersArrivedThree: return "{first}, {second} et {third} viennent d’arriver — dis-leur salut"
        case .systemMembersArrivedMany: return "{first}, {second} et {others} autres viennent d’arriver — dis-leur salut"
        default: return key.rawValue
        }
    }

    private static let english = ConversationPreviewStrings(language: "en") { key in
        switch key {
        case .systemMembersArrivedMany: return "{first}, {second} and {others} others just arrived — say hi"
        default: return key.rawValue
        }
    }

    @Test("un arrivant")
    func oneArrival() throws {
        #expect(try Self.notice(["Aïcha"]).text(Self.french) == "Aïcha vient d’arriver — dis-lui salut")
    }

    @Test("deux arrivants, les derniers arrivés en tête")
    func twoArrivals() throws {
        #expect(try Self.notice(["Tom", "Aïcha"]).text(Self.french) == "Tom et Aïcha viennent d’arriver — dis-leur salut")
    }

    @Test("trois arrivants, tous nommés")
    func threeArrivals() throws {
        #expect(try Self.notice(["Léa", "Tom", "Aïcha"]).text(Self.french)
                == "Léa, Tom et Aïcha viennent d’arriver — dis-leur salut")
    }

    @Test("au-delà : deux noms et le nombre des autres, le compte n'étant jamais borné par les noms gardés")
    func manyArrivals() throws {
        let notice = try Self.notice(["Aïcha", "Tom", "Léa"], count: 14)
        #expect(notice.lineKey == .systemMembersArrivedMany)
        #expect(notice.text(Self.french) == "Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut")
        #expect(notice.text(Self.english) == "Aïcha, Tom and 12 others just arrived — say hi")
    }

    @Test("la clé suit le compte, comme arrivalsLineKey")
    func lineKeyFollowsTheCount() {
        #expect(ArrivalsNoticeMetadata.lineKey(count: 1) == .systemMembersArrivedOne)
        #expect(ArrivalsNoticeMetadata.lineKey(count: 2) == .systemMembersArrivedTwo)
        #expect(ArrivalsNoticeMetadata.lineKey(count: 3) == .systemMembersArrivedThree)
        #expect(ArrivalsNoticeMetadata.lineKey(count: 4) == .systemMembersArrivedMany)
    }

    @Test("un autre kind n'est pas une ligne d'arrivées")
    func otherKindIsRejected() {
        let json = #"{"kind":"member-joined","arrivals":[{"participantId":"p","displayName":"Zoé"}],"count":1,"windowStartedAt":"x"}"#
        #expect((try? JSONDecoder().decode(ArrivalsNoticeMetadata.self, from: Data(json.utf8))) == nil)
    }

    @Test("un arrivant malformé est écarté sans perdre les autres ; aucun arrivant lisible, aucune ligne")
    func malformedArrivalIsDropped() throws {
        let json = #"{"kind":"members-arrived","arrivals":[{"participantId":"p-1","displayName":"Tom"},{"participantId":"","displayName":"X"},{"displayName":"Y"}],"count":3,"windowStartedAt":"2026-09-28T09:00:00.000Z"}"#
        let notice = try JSONDecoder().decode(ArrivalsNoticeMetadata.self, from: Data(json.utf8))
        #expect(notice.arrivals.map(\.displayName) == ["Tom"])
        #expect(notice.count == 3)
        let empty = #"{"kind":"members-arrived","arrivals":[{"participantId":""}],"count":1,"windowStartedAt":"x"}"#
        #expect((try? JSONDecoder().decode(ArrivalsNoticeMetadata.self, from: Data(empty.utf8))) == nil)
    }

    @Test("le message système porte sa ligne d'arrivées depuis metadata, et la colonne d'avis la relit")
    func apiMessageAndCacheColumnCarryTheNotice() throws {
        let metadata = Self.metadataJSON(names: ["Tom", "Aïcha"])
        let json = #"{"id":"m-arrivals","conversationId":"c-global","senderId":"u-aicha","content":"Tom et Aïcha viennent d’arriver — dis-leur salut","messageType":"system","messageSource":"system","createdAt":"2026-09-28T09:00:00.000Z","metadata":\#(metadata)}"#
        let api = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
        #expect(api.arrivalsNotice?.count == 2)
        #expect(api.joinNotice == nil)
        #expect(api.captureNotice == nil)
        #expect(api.toMessage(currentUserId: "u-me").arrivalsNotice == api.arrivalsNotice)

        let column = try #require(api.systemNoticeJson(encoder: JSONEncoder()))
        let relu = SystemNoticeColumn.decode(column, decoder: JSONDecoder(), id: "x")
        #expect(relu.arrivals == api.arrivalsNotice)
        #expect(relu.join == nil)
        #expect(relu.capture == nil)
    }
}
