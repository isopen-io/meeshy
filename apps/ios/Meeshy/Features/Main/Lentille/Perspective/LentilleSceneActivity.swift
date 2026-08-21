import SwiftUI
import MeeshyUI

/// Activité de la SCÈNE de la liste (2026-08-21, directive user : « le cadre
/// apparaît quand on scrolle, au repos il disparaît ; au bout de quelques
/// secondes sans scroller, tout se ré-aplatit naturellement »).
///
/// - `level` (0…1, PUBLIÉ, animé) : 1 pendant le défilement et
///   `FocalMetrics.Scene.restDelay` après le dernier tick, 0 au repos. Lu par
///   chaque rangée (`LentillePerspective`, qui fond sa pose vers l'identité)
///   et par l'hôte de la carte de focus (opacité). Il ne change que DEUX fois
///   par session de défilement — jamais par tick.
/// - `offset` : boîte INERTE relue par frame dans `visualEffect` (la bande
///   de focus remonte vers le haut de la liste au repos en haut — même loi
///   que l'élection) — jamais publiée : un tick ne ré-évalue aucune vue.
///
/// `nonisolated` + `@unchecked Sendable` : même patron que les registres
/// (`LentilleFocusCandidateRegistry`) — écrit sur le main thread par l'hôte,
/// lu sur le main thread par le rendu ; la closure `visualEffect` est
/// `@Sendable` et ne peut capturer qu'un type `Sendable`.
nonisolated final class LentilleSceneActivity: ObservableObject, @unchecked Sendable {

    /// Publié à la main (`willSet`) — même patron que `LentilleFocusElection` :
    /// `@Published` n'est pas permis sur une classe `nonisolated`.
    private(set) var level: CGFloat = 0 {
        willSet { objectWillChange.send() }
    }
    private(set) var offset: CGFloat = 0
    private var flattenWork: DispatchWorkItem?

    init() {}

    /// Un tick de défilement : l'offset DEPUIS LE HAUT (positif en descendant,
    /// `LentilleFocusBand.offsetFromTop(relayOffset:)`) est noté (inerte), la scène s'active
    /// si elle ne l'était pas (animation d'entrée), et le compte à rebours de
    /// l'aplatissement est réarmé.
    @MainActor
    func noteScroll(offset: CGFloat) {
        self.offset = offset
        flattenWork?.cancel()
        if level == 0 {
            withAnimation(.easeOut(duration: FocalMetrics.Scene.enterDuration)) { level = 1 }
        }
        let work = DispatchWorkItem { [weak self] in self?.flatten() }
        flattenWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + FocalMetrics.Scene.restDelay, execute: work)
    }

    /// Retour à plat, animé (`flattenDuration`).
    @MainActor
    func flatten() {
        flattenWork?.cancel()
        flattenWork = nil
        guard level != 0 else { return }
        withAnimation(.easeInOut(duration: FocalMetrics.Scene.flattenDuration)) { level = 0 }
    }

    /// Pose d'une rangée fondue vers l'identité selon le niveau de scène :
    /// `level` 0 ⇒ identité (Script), 1 ⇒ la loi telle quelle.
    nonisolated static func blend(_ result: FocalFocusCurve.Result, level: CGFloat) -> FocalFocusCurve.Result {
        let clamped = min(1, max(0, level))
        return FocalFocusCurve.Result(
            alpha: 1 - (1 - result.alpha) * clamped,
            scale: 1 - (1 - result.scale) * clamped
        )
    }
}

/// Le SEUL abonnement au relais pour la scène : un tick d'offset = une note.
/// Purement observationnel — ne rend rien, n'intercepte rien.
struct LentilleSceneActivityHost: View {

    @ObservedObject var relay: ScrollOffsetRelay
    let scene: LentilleSceneActivity

    var body: some View {
        Color.clear
            .allowsHitTesting(false)
            .adaptiveOnChange(of: relay.offset) { _, offset in
                scene.noteScroll(offset: LentilleFocusBand.offsetFromTop(relayOffset: offset))
            }
    }
}
