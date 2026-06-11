import Testing
import Foundation
@testable import MeeshySDK

/// BUG2 A' — les réactions par-image arrivent agrégées sur l'attachment wire
/// (`APIMessageAttachment.reactionSummary` emoji→count + `currentUserReactions`),
/// miroir des réactions message-level, puis copiées vers `MeeshyMessageAttachment`.
struct AttachmentReactionDecodingTests {

  private func decode(_ json: String) throws -> APIMessageAttachment {
    try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
  }

  @Test func decodes_reactionSummary_and_currentUserReactions() throws {
    let att = try decode(#"{"id":"a1","fileUrl":"/u","mimeType":"image/jpeg","reactionSummary":{"❤️":2,"👍":1},"currentUserReactions":["❤️"]}"#)
    #expect(att.reactionSummary?["❤️"] == 2)
    #expect(att.reactionSummary?["👍"] == 1)
    #expect(att.currentUserReactions == ["❤️"])
  }

  @Test func absent_reactions_decode_nil() throws {
    let att = try decode(#"{"id":"a1","fileUrl":"/u","mimeType":"image/jpeg"}"#)
    #expect(att.reactionSummary == nil)
    #expect(att.currentUserReactions == nil)
  }
}
