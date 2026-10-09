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
    /// L'heure et les points des rangées (#9571) : le même tick les révèle.
    var metaReveal: LentilleRowMetaReveal = .shared

    var body: some View {
        Color.clear
            .allowsHitTesting(false)
            .adaptiveOnChange(of: relay.offset) { _, offset in
                scene.noteScroll(offset: LentilleFocusBand.offsetFromTop(relayOffset: offset))
                metaReveal.noteScroll()
            }
            .onAppear { metaReveal.armOpening() }
    }
}

// MARK: - L'heure et les points de la liste ne paraissent qu'au défilement (#9571)

/// Directive porteur 2026-10-07 : « les points de conversation ne doivent
/// s'afficher que pendant le défilement ; après cela le point et la date du
/// dernier message disparaissent, comme dans une conversation ». Au repos, une
/// rangée ne montre ni l'heure ni les points ; un défilement les révèle, ils
/// s'effacent `ScrollTimePillLaw.lingerMs` après le dernier tick — le délai et
/// le fondu (0,18 s) de la pilule de jour du fil. À l'ouverture de la liste,
/// ils se montrent une fois, le temps d'une même fenêtre, dès que la première
/// rangée est là.
///
/// `isRevealed` ne change que DEUX fois par session de défilement, jamais par
/// tick, et n'est lu que par la feuille qui s'efface (`LentilleRowMetaFade`) :
/// aucune rangée ne se re-rend au rythme du défilement.
@MainActor
final class LentilleRowMetaReveal: ObservableObject {
    nonisolated deinit {}

    static let shared = LentilleRowMetaReveal()

    static let fadeDuration: Double = 0.18
    static var lingerSeconds: Double { ScrollTimePillLaw.lingerMs / 1000 }

    @Published private(set) var isRevealed = false
    private var openingArmed = false
    private var hideWork: DispatchWorkItem?

    init() {}

    /// Un tick de défilement : révèle (une fois) et réarme l'effacement.
    func noteScroll() {
        openingArmed = false
        reveal()
    }

    /// La liste s'ouvre : la prochaine rangée posée révélera la méta une fois.
    func armOpening() {
        openingArmed = true
    }

    /// Une rangée vient de se poser : la première après l'ouverture révèle.
    func noteRowShown() {
        guard openingArmed else { return }
        openingArmed = false
        reveal()
    }

    func hide() {
        hideWork?.cancel()
        hideWork = nil
        guard isRevealed else { return }
        isRevealed = false
    }

    private func reveal() {
        if !isRevealed { isRevealed = true }
        hideWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.hide() }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.lingerSeconds, execute: work)
    }
}

/// La SEULE vue qui observe `LentilleRowMetaReveal` : l'heure et la marque de
/// points d'une rangée. Opacité seule — la place reste réservée, aucune rangée
/// ne se remet en page. Ce qui s'efface est VISUEL : la rangée dit l'heure et
/// les points à VoiceOver dans sa propre phrase. « Réduire les animations » :
/// même visibilité, sans fondu.
struct LentilleRowMetaFade<Content: View>: View {
    var alwaysVisible: Bool = false
    @ObservedObject var reveal: LentilleRowMetaReveal = .shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .opacity(alwaysVisible || reveal.isRevealed ? 1 : 0)
            .animation(reduceMotion ? nil : .easeInOut(duration: LentilleRowMetaReveal.fadeDuration),
                       value: reveal.isRevealed)
            .onAppear { reveal.noteRowShown() }
    }
}
