import Foundation
import MeeshySDK

/// Ce que « Lui envoyer un contenu » propose (#19628, planche `Autre-Actions`) : mes publications (photos, vidéos ou
/// texte), mes réels, mes stories. Une story se propose quelle que soit son audience : elle part vers UNE personne, et
/// la passerelle rejuge qui peut l'ouvrir.
nonisolated enum ProfileSendContentKind: String, CaseIterable, Identifiable, Hashable, Sendable {
    case publication
    case reel
    case story

    var id: String { rawValue }

    var genre: ProfilePublicationGenre {
        switch self {
        case .publication: return .photos
        case .reel: return .reels
        case .story: return .stories
        }
    }

    func accepts(_ post: FeedPost) -> Bool {
        let served = ProfilePublicationGenre.of(post)
        switch self {
        case .publication: return served == .photos || served == nil
        case .reel, .story: return served == genre
        }
    }
}

/// La carte qui part : une publication ou un réel avec son lien suivi, une story avec le sien seulement si elle est
/// PUBLIQUE (`ShareCard.mintsTrackedLink`).
enum ProfileSendContent {
    static func subject(for post: FeedPost) -> ShareSubject {
        let imageURL = ProfilePublicationTiles.thumbnail(of: post)
        if post.isStory {
            return .story(id: post.id, authorName: post.author, authorId: post.authorId,
                          isPublic: (post.visibility ?? "").uppercased() == "PUBLIC", imageURL: imageURL)
        }
        return .publication(id: post.id, isReel: post.isReel, authorName: post.author, authorId: post.authorId,
                            imageURL: imageURL)
    }
}

/// L'envoi d'un de mes contenus à la personne de la fiche, vers NOTRE conversation directe : le destinataire est la
/// PERSONNE, et le chemin unique du partage (`ShareDispatching.deliver`) retrouve ou crée la directe à l'envoi, garde
/// de chiffrement comprise (fail-closed). Un envoi à la fois.
@MainActor
final class ProfileSendContentViewModel: ObservableObject {
    nonisolated deinit {}

    enum Phase: Equatable {
        case idle
        case sending
        case sent(conversationId: String)
        case failed(reason: String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published var kind: ProfileSendContentKind = .publication
    @Published var selectedId: String?

    let displayName: String
    private let recipient: ShareRecipient
    private let dispatcher: ShareDispatching

    var isSending: Bool { phase == .sending }

    init(userId: String, displayName: String, dispatcher: ShareDispatching = LiveShareDispatcher()) {
        self.displayName = displayName
        self.recipient = ShareRecipient(id: "user:\(userId)", kind: .person, conversationId: nil, userId: userId,
                                        title: displayName, detail: .direct, avatarURL: nil)
        self.dispatcher = dispatcher
    }

    func choices(from posts: [FeedPost]) -> [FeedPost] {
        posts.filter { kind.accepts($0) }
    }

    @discardableResult
    func send(_ post: FeedPost) async -> ShareDeliveryOutcome? {
        guard !isSending else { return nil }
        phase = .sending
        let subject = await linked(ProfileSendContent.subject(for: post))
        let outcome = await dispatcher.deliver(request(for: subject), to: recipient)
        switch outcome {
        case .sent(let id), .queued(let id): phase = .sent(conversationId: id)
        case .failed(let reason): phase = .failed(reason: reason)
        }
        return outcome
    }

    private func linked(_ subject: ShareSubject) async -> ShareSubject {
        guard case .card(var card) = subject, card.mintsTrackedLink,
              let link = await dispatcher.resolvedLink(for: card) else { return subject }
        card.url = link
        return .card(card)
    }

    private func request(for subject: ShareSubject) -> ShareSendRequest {
        ShareSendRequest(subject: subject, keptMessageIds: [], caption: "", captionPlacement: nil,
                         grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false)
    }
}
