import QuartzCore

/// `CADisplayLink` retient FORTEMENT son target : cibler `self` rend le
/// `deinit` de l'owner inatteignable (chaîne run loop → link → owner) — la
/// classe de fuite corrigée sur StoryReaderTimerController, StoryCanvasUIView
/// et MessageListViewController (audit 2026-06-12). Ce proxy est le pattern
/// canonique pour TOUT nouveau `CADisplayLink` : le link ne retient que le
/// proxy, jamais l'owner.
///
/// Contrat d'usage : la closure DOIT capturer l'owner en `[weak self]` et
/// invalider le link quand l'owner a disparu :
///
/// ```swift
/// let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .clock) { [weak self] link in
///     guard let self else { link.invalidate(); return }
///     self.tick(link)
/// }
/// link.add(to: .main, forMode: .common)
/// ```
///
/// L'owner garde la référence au link et reste responsable de l'invalider
/// dans son teardown déterministe (deinit / onDisappear) — le proxy garantit
/// seulement que ce deinit reste atteignable et qu'un tick orphelin
/// s'auto-invalide.
@MainActor
public final class WeakDisplayLinkTarget: NSObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let onTick: (CADisplayLink) -> Void

    public init(onTick: @escaping (CADisplayLink) -> Void) {
        self.onTick = onTick
    }

    @objc public func tick(_ link: CADisplayLink) {
        onTick(link)
    }

    /// Fabrique un link ciblant un proxy frais, avec la plage de cadence
    /// déclarée à la construction (aucun défaut : tout lien d'affichage dit
    /// à quelle cadence il tire). Le caller l'ajoute au run loop lui-même.
    public static func makeLink(
        frameRateRange: CAFrameRateRange,
        onTick: @escaping (CADisplayLink) -> Void
    ) -> CADisplayLink {
        let target = WeakDisplayLinkTarget(onTick: onTick)
        let link = CADisplayLink(target: target, selector: #selector(WeakDisplayLinkTarget.tick(_:)))
        link.preferredFrameRateRange = frameRateRange
        return link
    }
}

/// Les trois plages de cadence du produit. Un site n'écrit jamais de
/// littéral : il choisit une de ces lois, ou la cadence du palier de lecture.
public extension CAFrameRateRange {
    /// Horloge (timeline, défilement lent, lecteur de story) : 30 à 60 Hz.
    static var clock: CAFrameRateRange {
        CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
    }

    /// Geste ou édition en cours : 60 à 120 Hz (ProMotion).
    static var gesture: CAFrameRateRange {
        CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
    }

    /// Cadence fixe égale à `fps` : équivalent exact de l'ancien
    /// `preferredFramesPerSecond`, quand la cadence vient d'un palier.
    static func pinned(fps: Int) -> CAFrameRateRange {
        let rate = Float(fps)
        return CAFrameRateRange(minimum: rate, maximum: rate, preferred: rate)
    }
}

extension CAFrameRateRange {
    /// **La plage des horloges VISUELLES qui n'ont pas besoin du taux plein**
    /// (#9883) : une lecture de rognage, un défilement automatique. 30…60 Hz,
    /// 60 de préférence — un écran ProMotion ne les réveille plus à 120 Hz, et
    /// le système peut descendre à 30 en économie d'énergie. Un seul endroit
    /// pour la plage : les horloges ne la recopient pas.
    public static let visualClock = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
}
