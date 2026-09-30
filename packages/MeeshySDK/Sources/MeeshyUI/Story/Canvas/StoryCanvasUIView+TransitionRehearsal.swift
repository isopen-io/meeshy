import UIKit
import QuartzCore
import MeeshySDK

// MARK: - La répétition des transitions en composition (#8792)
//
// > Directive porteur 2026-09-30 : « lors du choix la scène doit être mise à
// > jour en direct en recommençant l'ouverture sélectionnée ainsi que la
// > fermeture ! »
//
// Aucun moteur neuf : la répétition appelle les DEUX fonctions que la lecture
// appelle — `StoryRenderer.applyOpening` (animation autonome, comme au passage
// edit → play) et `StoryRenderer.applyClosing` (instantané piloté par une tête,
// comme au tick de lecture). Ce que l'auteur voit en composant est donc
// exactement ce que le lecteur jouera. Seule l'HORLOGE est propre à la
// répétition : ouverture, une courte pause sur la scène entière, fermeture,
// puis retour à l'état neutre de l'édition.

/// **Le plan d'une répétition** — pur, sans horloge ni calque.
public nonisolated struct StoryTransitionRehearsal: Equatable, Sendable {

    public enum Phase: Equatable, Sendable {
        case opening
        case hold
        case closing(progress: Double)
        case finished
    }

    public let opening: StoryTransitionEffect?
    public let closing: StoryTransitionEffect?

    /// La scène entière, montrée entre l'entrée et la sortie : sans elle, une
    /// fermeture enchaînée sur une ouverture se lirait comme un seul geste.
    public static let hold: Double = 0.6

    public init(opening: StoryTransitionEffect?, closing: StoryTransitionEffect?) {
        self.opening = opening
        self.closing = closing
    }

    public var isEmpty: Bool { opening == nil && closing == nil }

    private var transition: Double { StoryRenderer.slideTransitionDuration }

    public var closingStart: Double { (opening == nil ? 0 : transition) + Self.hold }

    public var totalDuration: Double { closingStart + (closing == nil ? 0 : transition) }

    public func phase(at elapsed: Double) -> Phase {
        if opening != nil, elapsed < transition { return .opening }
        if elapsed < closingStart { return .hold }
        guard closing != nil, elapsed < totalDuration else { return .finished }
        return .closing(progress: min(1, (elapsed - closingStart) / transition))
    }
}

/// L'état d'une répétition EN COURS sur un canvas : son plan, son horloge et le
/// masque que le calque racine portait avant elle.
final class StoryCanvasTransitionRehearsalRun {
    nonisolated deinit {}
    let plan: StoryTransitionRehearsal
    let link: CADisplayLink
    let maskBefore: CALayer?
    /// Posé au PREMIER tick, jamais à l'appel : un choix qui recuit le fond
    /// occupe le fil principal le temps d'une image, et une horloge partie
    /// avant aurait déjà consommé l'ouverture quand l'écran la montre.
    var startedAt: CFTimeInterval?

    init(plan: StoryTransitionRehearsal, link: CADisplayLink, maskBefore: CALayer?) {
        self.plan = plan
        self.link = link
        self.maskBefore = maskBefore
    }
}

extension StoryCanvasUIView {

    /// **Rejoue l'ouverture puis la fermeture** sur le canvas d'édition. Une
    /// répétition en cours est interrompue et reprise de zéro : choisir un autre
    /// effet pendant qu'elle joue montre le NOUVEAU choix, jamais la fin de
    /// l'ancien. No-op hors `.edit` — le lecteur joue les siennes lui-même.
    public func rehearseSlideTransitions(opening: StoryTransitionEffect?,
                                         closing: StoryTransitionEffect?) {
        guard mode == .edit else { return }
        endTransitionRehearsal()
        let plan = StoryTransitionRehearsal(opening: opening, closing: closing)
        guard !plan.isEmpty else { return }
        noteEditInteraction()
        let maskBefore = rootLayer.mask
        StoryRenderer.applyOpening(opening, rootLayer: rootLayer, elapsed: 0)
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            self?.advanceTransitionRehearsal(at: link.targetTimestamp)
        }
        transitionRehearsal = StoryCanvasTransitionRehearsalRun(plan: plan, link: link,
                                                               maskBefore: maskBefore)
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
    }

    /// Rend le calque racine à l'état neutre de l'édition — opacité, transformée,
    /// masque d'avant la répétition — et arrête son horloge.
    public func endTransitionRehearsal() {
        guard let run = transitionRehearsal else { return }
        transitionRehearsal = nil
        run.link.invalidate()
        StoryRenderer.resetClosing(rootLayer: rootLayer)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        rootLayer.mask = run.maskBefore
        CATransaction.commit()
    }

    private func advanceTransitionRehearsal(at timestamp: CFTimeInterval) {
        guard let run = transitionRehearsal else { return }
        let depart = run.startedAt ?? timestamp
        run.startedAt = depart
        switch run.plan.phase(at: timestamp - depart) {
        case .opening, .hold:
            break
        case .closing(let progress):
            let duree = StoryRenderer.slideTransitionDuration
            StoryRenderer.applyClosing(run.plan.closing, rootLayer: rootLayer,
                                       elapsed: progress * duree, totalDuration: duree)
        case .finished:
            endTransitionRehearsal()
        }
    }
}

extension StoryCanvasTimelineBridge {

    /// Le relais du meuble vers le canvas de la scène (#8792) — même pont que la
    /// frise, pour la même raison : pousser dans la vue sans réévaluer le corps
    /// SwiftUI du composer.
    public func rehearseTransitions(opening: StoryTransitionEffect?, closing: StoryTransitionEffect?) {
        canvas?.rehearseSlideTransitions(opening: opening, closing: closing)
    }
}
