import Foundation
import MeeshySDK

/// #17329 — l'en-tête de l'appel, de gauche à droite : Réduire · Image dans l'image ·
/// Conversation. Ce fichier tient les RÈGLES (quels boutons, que dit la capsule de
/// droite) ; `CallView+Header` ne fait que les dessiner.

enum CallHeaderAction: Hashable, Sendable {
    case minimize
    case pictureInPicture
    case conversation
}

struct CallHeaderContext: Equatable, Sendable {
    let canActivateSystemPiP: Bool
    let isSystemPiPActive: Bool
    let hasConversation: Bool
}

enum CallHeaderRule {
    /// Image dans l'image n'est offerte que si l'appel y est éligible, ou pour en
    /// sortir ; Conversation que si elle est connue (un appel réveillé par un push
    /// VoIP sans `conversationId` n'a pas de porte vers elle).
    static func actions(_ context: CallHeaderContext) -> [CallHeaderAction] {
        let pictureInPicture: [CallHeaderAction] = context.canActivateSystemPiP || context.isSystemPiPActive ? [.pictureInPicture] : []
        let conversation: [CallHeaderAction] = context.hasConversation ? [.conversation] : []
        return [.minimize] + pictureInPicture + conversation
    }
}

// MARK: - #17341 — la capsule de droite

enum CallHeaderCapsuleLayout: Equatable, Sendable {
    case audio
    case video
    case group
}

struct CallHeaderCapsuleInput: Equatable, Sendable {
    let layout: CallHeaderCapsuleLayout
    let isEstablished: Bool
    let isNetworkDegraded: Bool
    let givenName: String?
    let displayName: String?
    let groupName: String?
    let participantCount: Int
    /// P15.4 — l'écran du correspondant tient la scène du duo.
    var receivesScreen: Bool = false
}

struct CallHeaderCapsule: Equatable, Sendable {
    let title: String?
    let participantCount: Int?
    let showsDuration: Bool
    let showsNetwork: Bool
    /// P15.4 — `title` est alors le NOM de qui partage : la capsule dit « Écran de X ».
    var isReceivedScreen: Bool = false
}

enum CallHeaderCapsuleRule {
    /// Vidéo : le nom que j'ai donné à la personne (sinon son nom d'affichage) et la
    /// durée. Audio : le nom et la durée sont déjà sous l'avatar, la capsule n'existe
    /// que pour le réseau dégradé. Groupe : le nom du groupe, le nombre et la durée.
    /// Le réseau n'apparaît jamais que dégradé. P15.4 — en duo vidéo, un écran reçu prend
    /// la place du nom et de la durée : la capsule annonce l'écran de la personne.
    static func resolve(_ input: CallHeaderCapsuleInput) -> CallHeaderCapsule? {
        guard input.isEstablished else { return nil }
        switch input.layout {
        case .audio:
            guard input.isNetworkDegraded else { return nil }
            return CallHeaderCapsule(title: nil, participantCount: nil, showsDuration: false, showsNetwork: true)
        case .video:
            let title = CallFrameTextsRule.meaningful(input.givenName) ?? CallFrameTextsRule.meaningful(input.displayName)
            return CallHeaderCapsule(
                title: title,
                participantCount: nil,
                showsDuration: !input.receivesScreen,
                showsNetwork: input.isNetworkDegraded,
                isReceivedScreen: input.receivesScreen
            )
        case .group:
            return CallHeaderCapsule(
                title: CallFrameTextsRule.meaningful(input.groupName),
                participantCount: input.participantCount > 0 ? input.participantCount : nil,
                showsDuration: true,
                showsNetwork: input.isNetworkDegraded
            )
        }
    }
}

/// Les noms que la conversation en cache donne à la capsule : le surnom de la
/// personne en duo, le nom du groupe en groupe (son nom personnalisé, sinon son
/// titre, sinon celui que le maillage connaît — `CallFrameTextsRule`).
struct CallHeaderNames: Equatable, Sendable {
    let givenName: String?
    let groupName: String?

    static func resolve(conversation: MeeshyConversation?, knownGroupTitle: String?) -> CallHeaderNames {
        guard let conversation else {
            return CallHeaderNames(givenName: nil, groupName: CallFrameTextsRule.meaningful(knownGroupTitle))
        }
        let customName = CallFrameTextsRule.meaningful(conversation.userState.customName)
        guard CallFrameTextsRule.isGroup(conversation.type) else {
            return CallHeaderNames(givenName: customName, groupName: nil)
        }
        let groupName = customName ?? CallFrameTextsRule.meaningful(conversation.title) ?? CallFrameTextsRule.meaningful(knownGroupTitle)
        return CallHeaderNames(givenName: nil, groupName: groupName)
    }
}
