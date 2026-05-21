import Foundation
import MeeshySDK
import os

/// Centralizes the fire-and-forget POSTs that `StoryViewerView+Canvas`,
/// `+Sidebar`, and `+Content` used to make directly against
/// `APIClient.shared`. Before this extraction each call site looked like:
///
/// ```swift
/// let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
///     endpoint: "/posts/\(story.id)/translate",
///     body: ["targetLanguage": lang.id]
/// )
/// ```
///
/// The `try?` muted every failure — including auth / rate-limit
/// problems that the on-call team would want to know about. This
/// service preserves the silent failure semantics for the user-facing
/// UX (a missing reaction or untranslated story IS preferable to a
/// disruptive error banner over a story viewer) but routes the error
/// through `os.Logger` so it surfaces in Console.app and in production
/// log capture.
///
/// M1 follow-up to PR #280.
@MainActor
final class StoryInteractionService {

    private let api: APIClientProviding
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "story.interaction")

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// Requests a server-side translation of the story (title + slide
    /// texts) into `targetLanguage`. Used by the per-story language
    /// picker (sidebar + canvas). Fire-and-forget: the actual translated
    /// payload arrives via the social socket, not via the response of
    /// this POST.
    func requestTranslation(storyId: String, targetLanguage: String) async {
        let body: [String: String] = ["targetLanguage": targetLanguage]
        do {
            let _: APIResponse<AnyCodable> = try await api.post(
                endpoint: "/posts/\(storyId)/translate",
                body: body
            )
        } catch {
            Self.logger.error("Failed to request translation for story \(storyId, privacy: .public) → \(targetLanguage, privacy: .public): \(error.localizedDescription)")
        }
    }

    /// Posts a comment (or a reply if `parentId` is set). Optimistic UI
    /// already inserted the comment locally before this call — see
    /// `StoryViewerView+Content.sendComment` — so a failure here is
    /// recoverable on next refresh.
    func postComment(
        storyId: String,
        content: String,
        originalLanguage: String,
        effectFlags: Int? = nil,
        parentId: String? = nil
    ) async {
        let body = StoryCommentBody(
            content: content,
            originalLanguage: originalLanguage,
            effectFlags: effectFlags,
            parentId: parentId
        )
        do {
            let _: APIResponse<AnyCodable> = try await api.post(
                endpoint: "/posts/\(storyId)/comments",
                body: body
            )
        } catch {
            Self.logger.error("Failed to post comment on story \(storyId, privacy: .public): \(error.localizedDescription)")
        }
    }

    /// Toggles the user's reaction (emoji) on a story. Fire-and-forget:
    /// the optimistic UI in the viewer already flipped the like badge.
    func react(storyId: String, emoji: String) async {
        let body = ReactionRequest(emoji: emoji)
        do {
            let _: APIResponse<AnyCodable> = try await api.post(
                endpoint: "/posts/\(storyId)/like",
                body: body
            )
        } catch {
            Self.logger.error("Failed to react on story \(storyId, privacy: .public) with emoji: \(error.localizedDescription)")
        }
    }

    // MARK: - Wire shapes

    /// Encodable body for `POST /posts/:id/comments`. Encodes `effectFlags`
    /// and `parentId` only when present so the gateway can treat absent
    /// fields as defaults (root comment, no effects).
    private struct StoryCommentBody: Encodable {
        let content: String
        let originalLanguage: String
        let effectFlags: Int?
        let parentId: String?

        enum CodingKeys: String, CodingKey {
            case content, originalLanguage, effectFlags, parentId
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(content, forKey: .content)
            try container.encode(originalLanguage, forKey: .originalLanguage)
            try container.encodeIfPresent(effectFlags, forKey: .effectFlags)
            try container.encodeIfPresent(parentId, forKey: .parentId)
        }
    }

}
