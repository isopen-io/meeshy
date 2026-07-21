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
        parentId: String? = nil,
        attachmentIds: [String]? = nil,
        mobileTranscription: MobileTranscriptionPayload? = nil
    ) async {
        let body = StoryCommentBody(
            content: content,
            originalLanguage: originalLanguage,
            effectFlags: effectFlags,
            parentId: parentId,
            attachmentIds: (attachmentIds?.isEmpty == false) ? attachmentIds : nil,
            mobileTranscription: mobileTranscription
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

    /// Fetches the list of viewers (with their optional reaction emoji)
    /// for a story. Unlike the 3 fire-and-forget methods above, this one
    /// returns data the view layer actually renders — the silent-swallow
    /// pattern would just give the user an empty viewer list with no
    /// recourse, so we surface the error to the caller via the optional
    /// return. A `nil` result means "couldn't load — keep the previous
    /// list / show empty state"; an empty array means "loaded, no one
    /// has seen this story yet".
    func loadViewers(storyId: String) async -> [StoryViewerSnapshot]? {
        do {
            let response: APIResponse<StoryViewersWireResponse> = try await api.request(
                endpoint: "/posts/\(storyId)/interactions",
                method: "GET",
                body: nil,
                queryItems: nil
            )
            return response.data.viewers.map { wire in
                StoryViewerSnapshot(
                    id: wire.id,
                    username: wire.username,
                    displayName: wire.displayName ?? wire.username,
                    avatarUrl: wire.avatarUrl,
                    viewedAt: wire.viewedAt ?? Date(),
                    reactionEmoji: wire.reaction
                )
            }
        } catch {
            Self.logger.error("Failed to load viewers for story \(storyId, privacy: .public): \(error.localizedDescription)")
            return nil
        }
    }

    /// Toggles the user's reaction (emoji) on a story. Unlike the other
    /// fire-and-forget methods above, this one THROWS on failure — the
    /// optimistic UI in the viewer already flipped the like badge and
    /// bumped the counter (`StoryViewerView.triggerStoryReaction`), and
    /// the caller (`sendReaction` in `StoryViewerView+Content.swift`)
    /// needs to know when to roll that back. The concrete reproducible
    /// case is the gateway's 409 `REACTION_LIMIT_REACHED` conflict (the
    /// user changes emoji faster than the optimistic guard catches it),
    /// but any failure must roll back — not just that one code.
    func react(storyId: String, emoji: String) async throws {
        let body = ReactionRequest(emoji: emoji)
        do {
            let _: APIResponse<AnyCodable> = try await api.post(
                endpoint: "/posts/\(storyId)/like",
                body: body
            )
        } catch {
            Self.logger.error("Failed to react on story \(storyId, privacy: .public) with emoji: \(error.localizedDescription)")
            throw error
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
        /// IDs de PostMedia pré-uploadés (uploadContext=comment) — un seul média
        /// par commentaire (le gateway borne à 1). Omis quand vide.
        let attachmentIds: [String]?
        let mobileTranscription: MobileTranscriptionPayload?

        enum CodingKeys: String, CodingKey {
            case content, originalLanguage, effectFlags, parentId, attachmentIds, mobileTranscription
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(content, forKey: .content)
            try container.encode(originalLanguage, forKey: .originalLanguage)
            try container.encodeIfPresent(effectFlags, forKey: .effectFlags)
            try container.encodeIfPresent(parentId, forKey: .parentId)
            try container.encodeIfPresent(attachmentIds, forKey: .attachmentIds)
            try container.encodeIfPresent(mobileTranscription, forKey: .mobileTranscription)
        }
    }

}

/// View-layer snapshot of a single story viewer. Doesn't try to be a
/// rich domain type — just the fields `StoryViewersSheet` needs.
/// `StoryViewerItem` (in `StoryViewerView+Content.swift`) is mapped
/// from this struct at the view boundary so the existing rendering
/// code keeps working without churn.
struct StoryViewerSnapshot: Equatable, Identifiable {
    let id: String
    let username: String
    let displayName: String
    let avatarUrl: String?
    let viewedAt: Date
    let reactionEmoji: String?
}

/// Wire shape returned by `GET /posts/{id}/interactions`.
///
/// Left `internal` (rather than `private`) so the test bundle can
/// declare matching stubs via `MockAPIClientForApp.stub`. Views MUST
/// NOT use this type directly — consume `StoryViewerSnapshot` instead.
/// (The view boundary is enforced by convention, not by access level,
/// because Swift doesn't have a "test-only public" visibility.)
struct StoryViewersWireResponse: Decodable {
    struct Viewer: Decodable {
        let id: String
        let username: String
        let displayName: String?
        let avatarUrl: String?
        let viewedAt: Date?
        let reaction: String?
    }
    let viewers: [Viewer]
}
