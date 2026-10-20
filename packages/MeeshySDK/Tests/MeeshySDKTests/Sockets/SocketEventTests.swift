import Testing
@testable import MeeshySDK

@Suite("SocketEvent — un cas par nom d'événement du contrat")
struct SocketEventTests {

    @Test("la rawValue est le nom exact du fil")
    func rawValue_roundTrip_messageSendWithAttachments() {
        #expect(SocketEvent(rawValue: "message:send-with-attachments") == .messageSendWithAttachments)
        #expect(SocketEvent.messageSendWithAttachments.rawValue == "message:send-with-attachments")
        #expect(SocketEvent.callEnd.rawValue == "call:end")
        #expect(SocketEvent.readStatusUpdated.rawValue == "read-status:updated")
    }

    @Test("un nom inconnu n'est pas un cas")
    func rawValue_unknownName_isNil() {
        #expect(SocketEvent(rawValue: "message:unknown") == nil)
    }

    @Test("aucun cas ne contient un tiret bas, et chaque rawValue porte entité:action")
    func rawValues_followTheEventNamingConvention() {
        for event in SocketEvent.allCases {
            #expect(!event.rawValue.contains("_"), "\(event.rawValue)")
            #expect(event.rawValue.contains(":"), "\(event.rawValue)")
        }
    }

    @Test("les rawValues sont uniques")
    func rawValues_areUnique() {
        let raws = SocketEvent.allCases.map(\.rawValue)
        #expect(Set(raws).count == raws.count)
    }
}
