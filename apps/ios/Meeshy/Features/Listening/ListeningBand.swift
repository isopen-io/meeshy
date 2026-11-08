import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le texte du bandeau (#16755, iso web `listening-band.ts`) : la CATÉGORIE pour un Proche, « titre · origine » pour un
/// Sang. Ce détail est ce que la passerelle a servi ; un titre absent n'est jamais deviné.
nonisolated enum ListeningBandText {

    static func glyph(_ category: NowPlayingCategory) -> String {
        switch category {
        case .music: return "🎵"
        case .video: return "🎬"
        case .browsing: return "🧭"
        }
    }

    static func categoryLabel(_ category: NowPlayingCategory) -> String {
        switch category {
        case .music:
            return String(localized: "listening.category.music", defaultValue: "Écoute de la musique", bundle: .main)
        case .video:
            return String(localized: "listening.category.video", defaultValue: "Regarde une vidéo", bundle: .main)
        case .browsing:
            return String(localized: "listening.category.browsing", defaultValue: "Navigue", bundle: .main)
        }
    }

    static func band(for entry: ListeningEntry?) -> AvatarListening? {
        guard let entry else { return nil }
        let text = entry.title.map { title in entry.source.map { "\(title) · \($0)" } ?? title }
            ?? categoryLabel(entry.category)
        let spoken = String(
            format: String(localized: "listening.spoken", defaultValue: "En ce moment : %@", bundle: .main), text
        )
        return AvatarListening(glyph: glyph(entry.category), text: text, spoken: spoken)
    }
}

extension ListeningCenter {
    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = ListeningCenter(
        viewerId: { AuthManager.shared.currentUser?.id },
        snapshot: { try await RelationsService.shared.nowPlaying() },
        connected: MessageSocketManager.shared.$isConnected.eraseToAnyPublisher()
    )

    /// Dès l'ouverture de l'app : les écoutes servies arrivent à tout moment, pas seulement quand un avatar s'affiche.
    static func start() {
        _ = shared
    }

    /// Le bandeau d'UNE personne puis chacun de ses changements — rien de plus fin que l'écoute de cette personne.
    ///
    /// Le SDK lit ce flux depuis une tâche hors du MainActor : la demande y exécute les étapes, qui ne doivent donc
    /// hériter d'aucune isolation (#17069).
    func band(for userId: String) -> AnyPublisher<AvatarListening?, Never> {
        $byUser
            .map { @Sendable entries in entries[userId] }
            .removeDuplicates()
            .map { @Sendable entry in ListeningBandText.band(for: entry) }
            .eraseToAnyPublisher()
    }

    /// Ce que le SDK reçoit pour peindre le bandeau (fiche d'une personne).
    var source: AvatarListeningSource {
        AvatarListeningSource { [weak self] userId in
            self?.band(for: userId) ?? Just<AvatarListening?>(nil).eraseToAnyPublisher()
        }
    }
}

/// L'avatar du pair d'un direct dans l'en-tête : sa porte (VoiceOver), puis ce qu'il écoute posé par-dessus, en
/// élément à part pour que l'avatar garde son libellé.
struct HeaderPeerListening: ViewModifier {
    let door: HeaderAvatarDoorAccessibility
    let userId: String?
    let avatarSize: CGFloat

    func body(content: Content) -> some View {
        content
            .modifier(door)
            .overlay {
                if let userId, !userId.isEmpty {
                    AvatarListeningLive(userId: userId, avatarSize: avatarSize, source: ListeningCenter.shared.source)
                }
            }
    }
}
