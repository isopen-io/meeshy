import Foundation
import MeeshySDK
import os

/// Centralizes the fire-and-forget POSTs that `StoryViewerView+Canvas`,
/// `+Sidebar`, and `+Content` used to make directly against
/// `APIClient.shared`. Before this extraction each call site looked like:
///
/// ```swift
/// let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
///     PostsEndpoint.byPostIdTranslate(postId: story.id),
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let api: APIClientProviding
    /// Le rail de la story pose l'anneau du cœur sur « Commentaires » quand le lecteur
    /// a commenté (directive porteur 2026-10-01) ; la passerelle ne le sert pas.
    private let participation: StoryViewerParticipationRecording
    private static let logger = Logger(subsystem: "me.meeshy.app", category: "story.interaction")

    init(api: APIClientProviding = APIClient.shared,
         participation: StoryViewerParticipationRecording? = nil) {
        self.api = api
        self.participation = participation ?? StoryViewerParticipationStore.shared
    }

    /// Requests a server-side translation of the story (title + slide
    /// texts) into `targetLanguage`. Used by the per-story language
    /// picker (sidebar + canvas). Fire-and-forget: the actual translated
    /// payload arrives via the social socket, not via the response of
    /// this POST.
    /// `force` rejoue une langue DÉJÀ traduite — ce que demande le bouton
    /// « Retraduire » de la feuille des langues. Sans lui, la gateway sortait
    /// aussitôt sur ses gardes de cache et le bouton ne faisait rien.
    func requestTranslation(storyId: String, targetLanguage: String, force: Bool = false) async {
        let body = StoryTranslationRequestBody(targetLanguage: targetLanguage, force: force ? true : nil)
        do {
            let _: APIResponse<AnyCodable> = try await api.post(
                PostsEndpoint.byPostIdTranslate(postId: storyId),
                body: body
            )
        } catch {
            Self.logger.error("Failed to request translation for story \(storyId, privacy: .public) → \(targetLanguage, privacy: .public): \(error.localizedDescription)")
        }
    }

    /// Corps de `POST /posts/:id/translate`. `force` est omis quand il est faux :
    /// la route le lit comme optionnel, inutile de l'envoyer pour rien.
    private struct StoryTranslationRequestBody: Encodable {
        let targetLanguage: String
        let force: Bool?
    }

    /// Le lecteur vient de commenter cette story : sa participation se note
    /// AU DÉPART, comme la ligne optimiste — un envoi qui échoue part en file,
    /// le commentaire reste le sien.
    ///
    /// La création elle-même passe par `CommentPublisher`, le seul chemin
    /// réseau d'un commentaire (#9743) : il lie la requête au compte de
    /// l'auteur.
    func noteComment(storyId: String) {
        participation.note(.commented, storyId: storyId)
    }

    /// Fetches the list of viewers (with what each of them did on it —
    /// reactions, comments, replies, reposts, shares, bookmark, #9727)
    /// for a story, a post or a reel (`storyId` is any post id). Unlike the 3 fire-and-forget methods above, this one
    /// returns data the view layer actually renders — the silent-swallow
    /// pattern would just give the user an empty viewer list with no
    /// recourse, so we surface the error to the caller via the optional
    /// return. A `nil` result means "couldn't load — keep the previous
    /// list / show empty state"; an empty array means "loaded, no one
    /// has seen this story yet".
    func loadViewers(storyId: String) async -> [StoryViewerSnapshot]? {
        guard case .loaded(let snapshots) = await loadViewerList(postId: storyId) else { return nil }
        return snapshots
    }

    /// Ce que la liste des vues rend (#9727) : ses lignes, un REFUS — 403, la
    /// liste n'est pas pour ce lecteur (l'auteur d'un post ou d'un réel n'en
    /// voit que les nombres, décision porteur 2026-10-09) — ou une panne. Le
    /// refus se distingue de la panne : la feuille le DIT, au lieu de se
    /// montrer vide comme si personne n'avait rien vu.
    func loadViewerList(postId: String) async -> ViewerListOutcome {
        do {
            let response: APIResponse<StoryViewersWireResponse> = try await api.request(
                PostsEndpoint.byPostIdInteractions(postId: postId),
                method: "GET",
                body: nil,
                queryItems: nil
            )
            return .loaded(response.data.viewers.map { wire in
                StoryViewerSnapshot(
                    id: wire.id,
                    username: wire.username,
                    displayName: wire.displayName ?? wire.username,
                    avatarUrl: wire.avatarUrl,
                    viewedAt: wire.viewedAt ?? Date(),
                    reactionEmoji: wire.engagement.latestReaction ?? wire.reaction,
                    engagement: wire.engagement
                )
            })
        } catch {
            Self.logger.error("Failed to load viewers for \(postId, privacy: .public): \(error.localizedDescription)")
            return .failed
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
                PostsEndpoint.byPostIdLike(postId: storyId),
                body: body
            )
        } catch {
            Self.logger.error("Failed to react on story \(storyId, privacy: .public) with emoji: \(error.localizedDescription)")
            throw error
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
    /// Ce que la personne a fait sur ce contenu (#9727) — réactions,
    /// commentaires, réponses, republications, partages, favori.
    let engagement: PostViewerEngagement
}

/// Wire shape returned by `GET /posts/{id}/interactions`.
///
/// Left `internal` (rather than `private`) so the test bundle can
/// declare matching stubs via `MockAPIClientForApp.stub`. Views MUST
/// NOT use this type directly — consume `StoryViewerSnapshot` instead.
/// (The view boundary is enforced by convention, not by access level,
/// because Swift doesn't have a "test-only public" visibility.)
///
/// Story, post ou réel : la même route, la même forme (#9727). Chaque ligne
/// porte, à côté de l'identité, ce que la personne a fait sur ce contenu —
/// décodé par `PostViewerEngagement` depuis la MÊME ligne, tolérant à tout
/// champ absent (un serveur d'avant #9727 ne sert que `reaction`).
struct StoryViewersWireResponse: Decodable {
    struct Viewer: Decodable {
        let id: String
        let username: String
        let displayName: String?
        let avatarUrl: String?
        let viewedAt: Date?
        let reaction: String?
        let engagement: PostViewerEngagement

        private enum CodingKeys: String, CodingKey {
            case id, username, displayName, avatarUrl, viewedAt, reaction
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(String.self, forKey: .id)
            username = try container.decode(String.self, forKey: .username)
            displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
            avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
            viewedAt = try container.decodeIfPresent(Date.self, forKey: .viewedAt)
            reaction = try container.decodeIfPresent(String.self, forKey: .reaction)
            engagement = try PostViewerEngagement(from: decoder)
        }
    }
    let viewers: [Viewer]
}

/// L'issue d'une lecture de la liste des vues (#9727) — voir `loadViewerList`.
enum ViewerListOutcome {
    case loaded([StoryViewerSnapshot])
    case forbidden
    case failed
}
