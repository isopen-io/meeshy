import UIKit

/// Enveloppe la liste du fil — et elle seule — pour y rendre `ThreadChromeFade`
/// (#6013). Les pilules de jour et d'heure vivent dans la vue du contrôleur, À
/// CÔTÉ de ce conteneur : le masque ne les touche pas.
///
/// Le masque n'existe que tant qu'une bande est posée. Mode Bulles, ou chrome
/// escamoté par le défilement en rangée plate : aucun masque, donc aucun rendu
/// hors écran pendant le geste.
final class ThreadChromeFadeContainer: UIView {

    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let fadeMask = FadeMask()
    private var fade = ThreadChromeFade.none

    init(hosting content: UIView) {
        super.init(frame: content.frame)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        content.frame = bounds
        addSubview(content)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    var topBandFrame: CGRect? { mask == nil ? nil : fadeMask.topBand.frame }
    var bottomBandFrame: CGRect? { mask == nil ? nil : fadeMask.bottomBand.frame }

    func apply(_ next: ThreadChromeFade, transition: ListInsetTransition?) {
        guard next != fade else { return }
        let previous = fade
        fade = next
        guard next != .none else {
            mask = nil
            return
        }
        if !Self.sameGeometry(previous, next) {
            layoutBands(transition: mask == nil ? nil : transition)
        }
        if mask == nil {
            guard !next.isFullyLifted else { return }
            fadeMask.lift(top: true, bottom: true)
            mask = fadeMask
        }
        animateLift(top: next.top?.isLifted ?? true, bottom: next.bottom?.isLifted ?? true)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        fadeMask.frame = bounds
    }

    private static func sameGeometry(_ lhs: ThreadChromeFade, _ rhs: ThreadChromeFade) -> Bool {
        lhs.top?.clearExtent == rhs.top?.clearExtent
            && lhs.top?.opaqueExtent == rhs.top?.opaqueExtent
            && lhs.bottom?.clearExtent == rhs.bottom?.clearExtent
            && lhs.bottom?.opaqueExtent == rhs.bottom?.opaqueExtent
    }

    private func layoutBands(transition: ListInsetTransition?) {
        fadeMask.frame = bounds
        guard let transition, window != nil else {
            fadeMask.layout(fade)
            return
        }
        UIView.animate(
            withDuration: transition.duration,
            delay: 0,
            options: [transition.curve, .beginFromCurrentState, .allowUserInteraction],
            animations: { [weak self] in
                guard let self else { return }
                self.fadeMask.layout(self.fade)
            }
        )
    }

    /// Le voile suit le chrome sur SA courbe (`EdgeHiddenChrome`) : il se lève
    /// quand le chrome s'escamote, se repose quand il revient. Levé partout, le
    /// masque part — le fil retrouve le bord de l'écran sans passe hors écran.
    private func animateLift(top: Bool, bottom: Bool) {
        guard window != nil else {
            fadeMask.lift(top: top, bottom: bottom)
            dropMaskIfFullyLifted()
            return
        }
        UIView.animate(
            withDuration: FocalMetrics.HiddenChrome.easeOut,
            delay: 0,
            options: [.curveEaseOut, .allowUserInteraction],
            animations: { [weak self] in
                self?.fadeMask.lift(top: top, bottom: bottom)
            },
            completion: { [weak self] _ in
                self?.dropMaskIfFullyLifted()
            }
        )
    }

    private func dropMaskIfFullyLifted() {
        guard fade.isFullyLifted else { return }
        mask = nil
    }

    /// Le masque : une bande par bord, épinglée à SON bord (la liste raccourcit
    /// clavier levé, la bande basse suit), et un plein entre les deux. Les
    /// cotes se recalculent à chaque passe de layout ; l'autoresizing garde les
    /// bandes à leur bord pendant un changement de taille animé.
    private final class FadeMask: UIView {

        // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
        // défaut) → double-free `pointer being freed was not allocated` (abrt)
        // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
        // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
        nonisolated deinit {}

        let topBand = Band(edge: .top)
        let bottomBand = Band(edge: .bottom)
        private let middle = UIView()
        private var fade = ThreadChromeFade.none

        override init(frame: CGRect) {
            super.init(frame: frame)
            middle.backgroundColor = .black
            middle.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            topBand.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]
            bottomBand.autoresizingMask = [.flexibleWidth, .flexibleTopMargin]
            addSubview(middle)
            addSubview(topBand)
            addSubview(bottomBand)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) {
            nil
        }

        func layout(_ next: ThreadChromeFade) {
            fade = next
            topBand.shape(next.top)
            bottomBand.shape(next.bottom)
            setNeedsLayout()
            layoutIfNeeded()
        }

        func lift(top: Bool, bottom: Bool) {
            topBand.solid.alpha = top ? 1 : 0
            bottomBand.solid.alpha = bottom ? 1 : 0
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            guard bounds.height > 0 else { return }
            let topHeight = fade.top?.opaqueExtent ?? 0
            let bottomHeight = fade.bottom?.opaqueExtent ?? 0
            topBand.frame = CGRect(x: 0, y: 0, width: bounds.width, height: topHeight)
            bottomBand.frame = CGRect(
                x: 0,
                y: bounds.height - bottomHeight,
                width: bounds.width,
                height: bottomHeight
            )
            middle.frame = CGRect(
                x: 0,
                y: topHeight,
                width: bounds.width,
                height: max(0, bounds.height - topHeight - bottomHeight)
            )
        }
    }

    /// Une bande : un dégradé transparent → plein depuis son bord, et un plein
    /// dont l'opacité LÈVE le voile (1 = le fil se lit jusqu'au bord).
    private final class Band: UIView {

        // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
        // défaut) → double-free `pointer being freed was not allocated` (abrt)
        // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
        // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
        nonisolated deinit {}

        enum Edge { case top, bottom }

        override class var layerClass: AnyClass { CAGradientLayer.self }

        let solid = UIView()

        init(edge: Edge) {
            super.init(frame: .zero)
            let gradient = layer as? CAGradientLayer
            gradient?.colors = [UIColor.clear.cgColor, UIColor.clear.cgColor, UIColor.black.cgColor]
            gradient?.startPoint = CGPoint(x: 0.5, y: edge == .top ? 0 : 1)
            gradient?.endPoint = CGPoint(x: 0.5, y: edge == .top ? 1 : 0)
            solid.backgroundColor = .black
            solid.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(solid)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) {
            nil
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            solid.frame = bounds
        }

        func shape(_ band: ThreadChromeFade.Band?) {
            guard let band, band.opaqueExtent > 0 else {
                (layer as? CAGradientLayer)?.locations = [0, 0, 0]
                return
            }
            let clear = NSNumber(value: Double(band.clearExtent / band.opaqueExtent))
            (layer as? CAGradientLayer)?.locations = [0, clear, 1]
        }
    }
}
