import SwiftUI

/// **Une action de « Parler »** (K32) : Écrire, Appeler ou Vidéo, sur la face Actions comme dans « Avec Léo ». Hors ligne,
/// sa mention dit ce qui arrivera (« Sera envoyé », « Attend le réseau ») et un appel qui attend le réseau ne répond pas.
/// « Écrire » porte les non-lus de notre conversation (#19646), vus plafonnés et dits avec le vrai nombre.
struct ProfileTalkAction: View {
    let operation: ProfileRelationAction
    let reach: ProfileTalkReach
    var badge: ProfileWriteBadge = .empty
    let tint: Color
    let action: () -> Void

    var body: some View {
        MeeshyLabeledAction(
            title: operation.title,
            systemImage: operation.systemImage,
            value: ProfileStatesCopy.reachMention(reach),
            valueKind: reach == .queued ? .accent : .quiet,
            badge: badge.text,
            badgeLabel: badge.spoken,
            tint: tint,
            action: action
        )
        .disabled(reach == .needsNetwork)
    }
}
