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
/// let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
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
    private let onTick: (CADisplayLink) -> Void

    public init(onTick: @escaping (CADisplayLink) -> Void) {
        self.onTick = onTick
    }

    @objc public func tick(_ link: CADisplayLink) {
        onTick(link)
    }

    /// Fabrique un link ciblant un proxy frais. Le caller configure
    /// `preferredFrameRateRange` et l'ajoute au run loop lui-même.
    public static func makeLink(onTick: @escaping (CADisplayLink) -> Void) -> CADisplayLink {
        let target = WeakDisplayLinkTarget(onTick: onTick)
        return CADisplayLink(target: target, selector: #selector(WeakDisplayLinkTarget.tick(_:)))
    }
}
