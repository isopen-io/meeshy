import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'hôte de la célébration — le MÊME sur les deux racines.**
///
/// `RootView` (iPhone) et `iPadRootView` montent des arbres différents ; un
/// hôte écrit deux fois diverge, et la divergence ne rougit nulle part
/// (mesuré le 2026-09-08 sur « Publier un post », dont le drapeau n'avait de
/// lecteur que côté iPhone). Il est donc écrit UNE fois et posé en une ligne
/// de chaque côté.
///
/// La révélation COUVRE le tableau de bord plutôt que de le précéder dans la
/// pile : le tap pousse `.progression` comme avant, et la célébration se pose
/// par-dessus. En la refermant, l'utilisateur est déjà arrivé — aucun geste de
/// plus que s'il n'y avait pas eu de célébration.
private struct RevealItem: Identifiable {
    let id = UUID()
    let reveal: EngagementReveal
}

struct EngagementRevealHost: ViewModifier {
    @ObservedObject var router: Router
    @State private var item: RevealItem?

    func body(content: Content) -> some View {
        content
            // `initial: true` couvre le démarrage à FROID : un tap sur une
            // notification pose le palier AVANT que cet hôte n'existe. Sans
            // lui, la célébration serait perdue précisément au moment où
            // l'utilisateur vient de l'ouvrir depuis l'écran verrouillé.
            .adaptiveOnChange(of: router.pendingEngagementReveal, initial: true) { _, _ in
                guard let palier = router.consumePendingEngagementReveal() else { return }
                item = RevealItem(reveal: palier)
            }
            .fullScreenCover(item: $item) { courant in
                AchievementRevealView(reveal: courant.reveal) { item = nil }
            }
    }
}

extension View {
    /// Pose la célébration de palier sur une racine. UNE ligne, des deux côtés.
    func engagementReveal(router: Router) -> some View {
        modifier(EngagementRevealHost(router: router))
    }
}
