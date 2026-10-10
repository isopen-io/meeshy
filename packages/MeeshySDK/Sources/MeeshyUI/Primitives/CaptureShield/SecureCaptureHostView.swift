import SwiftUI
import UIKit

/// Le contrôleur qui héberge le contenu protégé. Il signale chaque
/// changement de sa taille idéale pour que la mise en page SwiftUI qui le
/// contient le remesure.
final class SecureCaptureHostingController: UIHostingController<AnyView> {
    nonisolated deinit {}

    var onIdealSizeChange: (@MainActor () -> Void)?

    override var preferredContentSize: CGSize {
        didSet {
            guard preferredContentSize != oldValue else { return }
            onIdealSizeChange?()
        }
    }
}

/// **L'hôte UIKit du bouclier** (#9574) : il pose le contenu SwiftUI dans la
/// toile sécurisée, et seulement là.
///
/// - Rien n'est affiché avant d'être dans une fenêtre : la toile se pose au
///   premier `didMoveToWindow`, le contenu ensuite.
/// - Sous un autre bouclier (cellule protégée qui contient une citation
///   protégée), il réutilise la toile de son ancêtre au lieu d'en créer une.
/// - Toile introuvable : le contenu n'est JAMAIS monté, le refus remonte à
///   l'hôte SwiftUI (`onRefused`, qui rend le placeholder) et se signale.
/// - Le contrôleur hébergé est rattaché au plus proche contrôleur de la
///   chaîne de répondeurs : les feuilles et plein écrans présentés depuis le
///   contenu partent d'un contrôleur attaché.
final class SecureCaptureHostView: UIView {
    nonisolated deinit {}

    enum Placement: Equatable {
        case detached
        case secured
        case inherited
        case refused
    }

    let hosting: SecureCaptureHostingController
    private let secureLayer: any SecureCaptureLayerProviding
    private(set) var secureCanvas: SecureCaptureCanvas?
    private(set) var placement: Placement = .detached
    private var isCounted = false

    var onIdealSizeChange: (@MainActor () -> Void)?
    var onRefused: (@MainActor () -> Void)?

    init(layer: any SecureCaptureLayerProviding, root: AnyView) {
        self.secureLayer = layer
        hosting = SecureCaptureHostingController(rootView: root)
        hosting.sizingOptions = [.preferredContentSize]
        hosting.view.backgroundColor = .clear
        hosting.view.clipsToBounds = false
        super.init(frame: .zero)
        backgroundColor = .clear
        clipsToBounds = false
        hosting.onIdealSizeChange = { [weak self] in
            self?.invalidateIntrinsicContentSize()
            self?.onIdealSizeChange?()
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    var isSecure: Bool { placement == .secured || placement == .inherited }

    func update(root: AnyView) {
        hosting.rootView = root
    }

    func fittingSize(width: CGFloat?, height: CGFloat?) -> CGSize {
        guard placement != .refused else { return .zero }
        return hosting.sizeThatFits(in: CGSize(width: Self.bounded(width), height: Self.bounded(height)))
    }

    private static func bounded(_ dimension: CGFloat?) -> CGFloat {
        guard let dimension, dimension.isFinite else { return .greatestFiniteMagnitude }
        return dimension
    }

    // MARK: - Fenêtre

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else {
            detachFromParentController()
            uncount()
            return
        }
        place()
        guard isSecure else { return }
        attachToParentController()
        count()
    }

    private func place() {
        if insideSecureAncestor {
            secureCanvas?.container.removeFromSuperview()
            mount(in: self)
            placement = .inherited
            return
        }
        guard let canvas = secureCanvas ?? secureLayer.makeCanvas() else {
            hosting.view.removeFromSuperview()
            placement = .refused
            CaptureShieldDiagnostics.reportUnavailable()
            onRefused?()
            return
        }
        secureCanvas = canvas
        if canvas.container.superview !== self {
            canvas.container.frame = bounds
            canvas.container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(canvas.container)
        }
        mount(in: canvas.canvas)
        placement = .secured
    }

    private var insideSecureAncestor: Bool {
        var ancestor = superview
        while let view = ancestor {
            if (view as? SecureCaptureHostView)?.isSecure == true { return true }
            ancestor = view.superview
        }
        return false
    }

    private func mount(in container: UIView) {
        guard hosting.view.superview !== container else { return }
        hosting.view.removeFromSuperview()
        hosting.view.frame = container.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(hosting.view)
        accessibilityElements = [hosting.view as Any]
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        secureCanvas?.container.frame = bounds
        guard let container = hosting.view.superview else { return }
        hosting.view.frame = container.bounds
    }

    // MARK: - Toucher

    /// Le toucher va au contenu, jamais au champ de saisie qui porte la toile.
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isSecure, isUserInteractionEnabled, !isHidden, alpha > 0.01,
              let hosted = hosting.view, hosted.superview != nil else { return nil }
        return hosted.hitTest(convert(point, to: hosted), with: event)
    }

    // MARK: - Contrôleur parent

    private func attachToParentController() {
        guard hosting.parent == nil, let parent = nearestViewController else { return }
        parent.addChild(hosting)
        hosting.didMove(toParent: parent)
    }

    private func detachFromParentController() {
        guard hosting.parent != nil else { return }
        hosting.willMove(toParent: nil)
        hosting.removeFromParent()
    }

    private var nearestViewController: UIViewController? {
        var responder = next
        while let current = responder {
            if let controller = current as? UIViewController { return controller }
            responder = current.next
        }
        return nil
    }

    // MARK: - Compte des contenus visibles

    private func count() {
        guard !isCounted else { return }
        isCounted = true
        SecureCaptureRegistry.enter()
    }

    private func uncount() {
        guard isCounted else { return }
        isCounted = false
        SecureCaptureRegistry.leave()
    }

    func dismantle() {
        detachFromParentController()
        uncount()
    }
}
