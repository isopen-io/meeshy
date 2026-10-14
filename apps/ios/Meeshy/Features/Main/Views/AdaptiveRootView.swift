import SwiftUI

/// Où en est la navigation, tenu AU-DESSUS des deux racines.
///
/// `AdaptiveRootView` démonte une racine et monte l'autre dès que la classe de taille bascule : une fenêtre d'iPad
/// glissée en Slide Over ou réduite au tiers de l'écran, puis rendue à sa largeur. Chaque racine possède son
/// `Router` et son état ; sans ce relais, la bascule ramenait à l'accueil la personne qui lisait un fil.
///
/// Chaque racine y RECOPIE sa navigation à chaque changement, et la relit à son montage. La recopie est continue
/// plutôt que faite au démontage : SwiftUI ne garantit pas que la racine sortante disparaisse avant que l'entrante
/// n'apparaisse.
@MainActor
final class RootNavigationHandoff {
    // Même garde que `Router` : une deinit synthétisée isolée plante au démontage hors d'une tâche (iOS 26.1).
    nonisolated deinit {}

    private(set) var routes: [Route] = []

    func record(_ routes: [Route]) { self.routes = routes }

    /// La pile que l'iPhone reçoit de l'iPad : le fil, puis la route qui le recouvre (`iPadRightColumn`).
    nonisolated static func stack(conversation: Conversation?, panelRoute: Route?) -> [Route] {
        (conversation.map { [Route.conversation($0)] } ?? []) + (panelRoute.map { [$0] } ?? [])
    }

    /// Ce que l'iPad reçoit de la pile de l'iPhone.
    struct TabletPlacement: Equatable {
        /// Le dernier fil de la pile : l'iPad n'en tient qu'un.
        var conversation: Conversation?
        /// Les routes empilées APRÈS ce fil, dans l'ordre — celles d'avant sont sous lui, et l'iPad n'a pas de
        /// dessous.
        var panelRoutes: [Route]
    }

    nonisolated static func tabletPlacement(of routes: [Route]) -> TabletPlacement {
        var conversation: Conversation?
        var panelRoutes: [Route] = []
        for route in routes {
            if case .conversation(let opened) = route {
                conversation = opened
                panelRoutes = []
            } else {
                panelRoutes.append(route)
            }
        }
        return TabletPlacement(conversation: conversation, panelRoutes: panelRoutes)
    }
}

private struct RootNavigationHandoffKey: EnvironmentKey {
    static let defaultValue: RootNavigationHandoff? = nil
}

extension EnvironmentValues {
    /// `nil` hors de `AdaptiveRootView` (aperçus, tests) : une racine montée seule n'a personne à qui passer le relais.
    var rootNavigationHandoff: RootNavigationHandoff? {
        get { self[RootNavigationHandoffKey.self] }
        set { self[RootNavigationHandoffKey.self] = newValue }
    }
}

struct AdaptiveRootView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var navigationHandoff = RootNavigationHandoff()

    var body: some View {
        Group {
            if sizeClass == .regular {
                iPadRootView()
            } else {
                RootView()
            }
        }
        .environment(\.rootNavigationHandoff, navigationHandoff)
        // Force-init the shared `ConversationAudioCoordinator` on root mount.
        // Without this, the engine is built lazily on the first audio tap,
        // which means the `@Published var isPlaying` published edge that
        // gates the background lifecycle never reaches its subscriber until
        // a message audio actually starts. Pre-mounting keeps the rest of
        // the app — including the background lifecycle bridge — in sync.
        //
        // Phase 8: also activate the MPNowPlayingInfoCenter +
        // MPRemoteCommandCenter bridge so lock screen, control center,
        // AirPods and CarPlay can surface metadata + controls.
        .task {
            let coord = ConversationAudioCoordinator.shared
            coord.activateNowPlayingBridge()
            // #9783 — le même lecteur alimente l'îlot dynamique.
            VoicePlaybackLiveActivityCoordinator.shared.bind(coord)
        }
        // B4 — The mini-player overlay used to live HERE but the tap-body
        // handler had no access to the `Router` (instantiated inside
        // `RootView` / `iPadRootView`, scopes below this one). The overlay
        // is now mounted in those views directly so the tap routes to the
        // active conversation. Keeping this comment as the canonical
        // landing pad for the next dev wondering "why isn't the mini-player
        // here too?".
    }
}
