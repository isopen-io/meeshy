import SwiftUI
import UIKit
import MeeshyUI

/// **Le fil iPhone ne se détruit plus quand on le quitte** (#16676, #16779).
///
/// Il était monté par `if showFeed { ThemedFeedOverlay() }`, et `showFeed`
/// retombe dès qu'un écran s'empile (hashtag, lieu, conversation, réglages,
/// notification, lien profond) ou que le bouton du fil le referme. L'hôte
/// possède son `FeedViewModel` : le masquer jetait la liste chargée, ses pages,
/// l'état des cœurs ET la position de défilement — au retour, le fil repartait
/// du cache, en haut.
///
/// Une fois ouvert, le fil RESTE monté : masqué, il est invisible, ne reçoit
/// plus aucun toucher et sort de l'arbre d'accessibilité ; il retrouve sa place
/// exacte à sa réapparition. Une alerte mémoire le libère s'il est caché —
/// c'est le seul cas où le revoir repart du cache.
struct RetainedFeedHost<Content: View>: View {
    let isShown: Bool
    @ViewBuilder let content: () -> Content

    @State private var isRetained = false

    var body: some View {
        ZStack {
            if FeedRetention.isMounted(isShown: isShown, isRetained: isRetained) {
                content()
                    .opacity(isShown ? 1 : 0)
                    .scaleEffect(isShown ? 1 : FeedRetention.hiddenScale)
                    .offset(y: isShown ? 0 : FeedRetention.hiddenDrop)
                    .allowsHitTesting(isShown)
                    .accessibilityHidden(!isShown)
                    .environment(\.feedIsShown, isShown)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .adaptiveOnChange(of: isShown, initial: true) { _, shown in
            isRetained = FeedRetention.retains(wasRetained: isRetained, isShown: shown)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            isRetained = FeedRetention.retainsAfterMemoryWarning(isShown: isShown)
        }
    }
}

/// Les lois du fil retenu — pures, pour qu'un témoin les lise sans SwiftUI.
nonisolated enum FeedRetention {
    /// Ce qu'un fil masqué garde de sa disparition animée : un léger retrait
    /// vers le bas, comme l'ancienne transition de sortie.
    static let hiddenScale: CGFloat = 0.95
    static let hiddenDrop: CGFloat = 48

    /// La profondeur à partir de laquelle on LIT le fil plutôt que sa tête :
    /// au-delà, un post qui arrive en tête attend (`FeedHeadHold`) au lieu de
    /// pousser vers le bas le post en lecture.
    static let headHoldDepth: CGFloat = 160

    static func isMounted(isShown: Bool, isRetained: Bool) -> Bool {
        isShown || isRetained
    }

    /// Ouvert une fois, retenu jusqu'à une alerte mémoire.
    static func retains(wasRetained: Bool, isShown: Bool) -> Bool {
        wasRetained || isShown
    }

    /// Un fil à l'écran ne se libère jamais ; un fil caché, oui.
    static func retainsAfterMemoryWarning(isShown: Bool) -> Bool {
        isShown
    }

    /// `offset` est celui que le fil relaie à son en-tête : le `minY` de la
    /// sentinelle, négatif vers le bas. Un fil caché tient toujours sa tête.
    static func holdsHead(offset: CGFloat, isShown: Bool) -> Bool {
        !isShown || offset < -headHoldDepth
    }
}

private struct FeedIsShownKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    /// Le fil retenu est-il à l'écran (#16676) ? `true` hors de `RetainedFeedHost`.
    var feedIsShown: Bool {
        get { self[FeedIsShownKey.self] }
        set { self[FeedIsShownKey.self] = newValue }
    }
}

/// Ce que le fil fait quand il se cache sans se démonter, et la sonde qui dit
/// s'il faut tenir sa tête (#16676). Posé UNE fois sur l'hôte du fil.
struct FeedRetentionHooks: ViewModifier {
    @Environment(\.feedIsShown) private var isShown
    let relay: ScrollOffsetRelay
    let onHidden: () -> Void
    let onHoldingHead: (Bool) -> Void

    func body(content: Content) -> some View {
        content
            .background(FeedHeadHoldProbe(relay: relay, isShown: isShown, onHoldingHead: onHoldingHead))
            .adaptiveOnChange(of: isShown) { _, shown in
                if !shown { onHidden() }
            }
    }
}

/// Seule cette sonde observe le défilement : elle ne se peint pas, et ne
/// prévient l'hôte qu'au franchissement de la profondeur de lecture.
private struct FeedHeadHoldProbe: View {
    @ObservedObject var relay: ScrollOffsetRelay
    let isShown: Bool
    let onHoldingHead: (Bool) -> Void

    var body: some View {
        Color.clear
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .adaptiveOnChange(of: FeedRetention.holdsHead(offset: relay.offset, isShown: isShown), initial: true) { _, holds in
                onHoldingHead(holds)
            }
    }
}
