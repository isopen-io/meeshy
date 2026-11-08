import Combine
import SwiftUI

// MARK: - L'écoute d'une personne, en direct, sur son avatar (#16755)
//
// Ce qu'écoute un Proche ou un Sang vit côté app (socket, rattrapage, échéance). Le SDK reçoit une SOURCE opaque — pour
// une personne, le flux de son bandeau tel que servi — et la peint sur l'avatar. Sans source, rien ne s'ajoute.

/// Ce que l'app fournit : pour un identifiant, le bandeau courant puis chacun de ses changements (`nil` : rien).
public struct AvatarListeningSource {
    public let band: @MainActor (_ userId: String) -> AnyPublisher<AvatarListening?, Never>

    public init(band: @escaping @MainActor (_ userId: String) -> AnyPublisher<AvatarListening?, Never>) {
        self.band = band
    }
}

/// Le bandeau d'UNE personne, abonné à sa source : il ne se réabonne qu'au changement de personne, jamais à chaque
/// rendu de l'hôte.
public struct AvatarListeningLive: View {
    let userId: String
    let avatarSize: CGFloat
    let source: AvatarListeningSource

    @State private var band: AvatarListening?

    public init(userId: String, avatarSize: CGFloat, source: AvatarListeningSource) {
        self.userId = userId
        self.avatarSize = avatarSize
        self.source = source
    }

    public var body: some View {
        ZStack {
            if let band {
                AvatarListeningBand(listening: band, avatarSize: avatarSize)
            }
        }
        .animation(.easeOut(duration: 0.2), value: band)
        .task(id: userId) {
            band = nil
            for await value in source.band(userId).values {
                band = value
            }
        }
    }
}

/// L'écoute posée sur un avatar, d'après la source de l'environnement : rien sans source, ni pour un avatar qui ne la
/// montre pas (`userId` nil ou vide). Une liste, une fiche, un en-tête la posent de la même façon (#16733).
public struct AvatarListeningOverlay: View {
    let userId: String?
    let avatarSize: CGFloat
    @Environment(\.avatarListeningSource) private var source

    public init(userId: String?, avatarSize: CGFloat) {
        self.userId = userId
        self.avatarSize = avatarSize
    }

    public var body: some View {
        if let source, let userId, !userId.isEmpty {
            AvatarListeningLive(userId: userId, avatarSize: avatarSize, source: source)
        }
    }
}

/// L'écoute posée sur l'avatar d'une fiche.
struct ProfileAvatarListening: View {
    let userId: String?

    var body: some View {
        AvatarListeningOverlay(userId: userId, avatarSize: AvatarContext.profileSheet.size)
    }
}

private struct AvatarListeningSourceKey: EnvironmentKey {
    static let defaultValue: AvatarListeningSource? = nil
}

public extension EnvironmentValues {
    /// La source des écoutes servies ; `nil` : aucun bandeau.
    var avatarListeningSource: AvatarListeningSource? {
        get { self[AvatarListeningSourceKey.self] }
        set { self[AvatarListeningSourceKey.self] = newValue }
    }
}
