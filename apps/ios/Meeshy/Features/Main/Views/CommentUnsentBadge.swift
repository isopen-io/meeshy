import SwiftUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **UN COMMENTAIRE QUI N'EST PAS PARTI SE VOIT, ET SE RELANCE** (#9743).
//
// Quand la file renonçait, la ligne optimiste était retirée : le commentaire
// — et ses pièces — disparaissait sous un toast. Il reste désormais à
// l'écran, marqué, relançable d'un toucher ; et il se relit depuis la FILE,
// donc il survit à la fermeture de la feuille et au redémarrage de l'app.

/// Les règles, sans état.
enum CommentUnsent {

    /// Une ligne qui porte encore son identifiant CLIENT n'a pas été
    /// remplacée par celle du serveur.
    static func isLocal(_ commentId: String) -> Bool {
        commentId.hasPrefix("cmid_")
    }

    /// La ligne optimiste d'un commentaire relu depuis la file : même
    /// identifiant que celle qui avait été posée à l'envoi, mêmes pièces —
    /// lues dans le dossier durable.
    static func row(for unsent: UnsentComment, author: MeeshyUser?) -> FeedComment {
        let payload = unsent.payload
        return FeedComment(
            id: payload.clientMutationId,
            author: author?.displayName ?? author?.username ?? "",
            authorId: author?.id ?? "",
            authorUsername: author?.username,
            authorAvatarURL: author?.avatar,
            content: payload.content, timestamp: unsent.createdAt,
            likes: 0, replies: 0, parentId: payload.parentCommentId,
            effectFlags: payload.effectFlags ?? 0,
            originalLanguage: payload.originalLanguage,
            media: unsent.localMediaURLs.map(media(at:)),
            location: payload.location
        )
    }

    /// Les commentaires relus de la file, ajoutés à une liste qui ne les a
    /// pas déjà — les plus récents en tête, comme à l'envoi.
    static func merging(_ unsent: [FeedComment], into comments: [FeedComment]) -> [FeedComment] {
        let known = Set(comments.map(\.id))
        return unsent.filter { !known.contains($0.id) }.reversed() + comments
    }

    private static func media(at url: URL) -> FeedMedia {
        let type = UTType(filenameExtension: url.pathExtension)
        let kind: FeedMediaType = type?.conforms(to: .audio) == true ? .audio
            : (type?.conforms(to: .movie) == true ? .video : .image)
        return FeedMedia(type: kind, url: url.absoluteString)
    }
}

/// La marque d'un commentaire que la file a abandonné. Montée sur les seules
/// lignes qui portent encore leur identifiant client ; elle lit l'état de SA
/// ligne dans la file et ne s'abonne à aucun singleton observable.
struct CommentUnsentBadge: View {
    let commentId: String
    let accentColor: String

    @State private var isFailed = false
    /// La raison servie par le registre des limites du jour — lue UNE fois,
    /// à la bascule : la relire dans le corps la consommerait à chaque rendu.
    @State private var reason: String?
    @State private var isDiscarded = false
    @State private var round = 0

    var body: some View {
        Group {
            if isDiscarded {
                EmptyView()
            } else if isFailed {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundColor(MeeshyColors.error)
                        .accessibilityHidden(true)
                    Text(reason ?? String(localized: "feed.comments.send_error", defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main))
                        .foregroundColor(MeeshyColors.error)
                        .lineLimit(2)
                    Button(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main), action: retry)
                        .foregroundColor(Color(hex: accentColor))
                    Button(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), action: discard)
                        .foregroundColor(MeeshyColors.error)
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.plain)
                .padding(.top, MeeshySpacing.xxs)
            }
        }
        .task(id: round) { await watch() }
    }

    /// L'état se lit d'abord dans la ligne (un commentaire abandonné avant
    /// l'ouverture de l'écran), puis se suit au fil de la file.
    private func watch() async {
        if let unsent = await OfflineQueue.shared.unsentComment(clientMutationId: commentId), unsent.isFailed {
            markFailed()
        }
        let outcomes = await OfflineQueue.shared.outcomeStream(for: commentId)
        for await outcome in outcomes {
            if case .exhausted = outcome { markFailed() }
        }
    }

    private func markFailed() {
        guard !isFailed else { return }
        reason = DailyGestureLimitNotice.exhaustedText(clientMutationId: commentId)
        isFailed = true
    }

    private func retry() {
        HapticFeedback.light()
        isFailed = false
        Task {
            do {
                try await OfflineQueue.shared.retryByClientMessageId(commentId)
                round += 1
            } catch {
                isFailed = true
            }
        }
    }

    private func discard() {
        HapticFeedback.light()
        isDiscarded = true
        Task {
            await OfflineQueue.shared.cancelCreateComment(clientMutationId: commentId)
            NotificationCenter.default.post(name: .commentUnsentDiscarded, object: commentId)
        }
    }
}

extension Notification.Name {
    /// Un commentaire non envoyé vient d'être abandonné par son auteur :
    /// l'hôte retire sa ligne. L'objet est l'identifiant client.
    static let commentUnsentDiscarded = Notification.Name("comment.unsent.discarded")
}

extension View {
    /// Branche un hôte de commentaires sur ce qui n'est pas parti : `restore`
    /// à l'ouverture, `discard` quand l'auteur renonce à une ligne.
    func unsentComments(restore: @escaping @MainActor () async -> Void,
                        discard: @escaping @MainActor (String) -> Void) -> some View {
        task { await restore() }
            .onReceive(NotificationCenter.default.publisher(for: .commentUnsentDiscarded)) { note in
                guard let commentId = note.object as? String else { return }
                discard(commentId)
            }
    }
}
