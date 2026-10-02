import Combine
import SwiftUI
import UIKit
import MeeshyUI

/// **La vue d'appel vit dans SA fenêtre, au-dessus de toute présentation (#8725).**
///
/// Elle était un `.fullScreenCover` posé sur la racine. UIKit ne présente
/// qu'UN contrôleur modal par présentateur : dès que la racine présentait déjà
/// quelque chose — viewer de story, composer, feuille du flux qui porte les
/// réels, galerie image / vidéo / audio d'une conversation — la couverture
/// d'appel n'avait nulle part où se poser (« already presenting »). L'appel
/// sonnait sans vue : on ne pouvait ni décrocher, ni refuser, ni le voir.
///
/// Une `UIWindow` dédiée ne dépend d'AUCUNE présentation : elle se pose sur la
/// scène par-dessus la fenêtre principale, quel que soit ce que celle-ci
/// présente aujourd'hui ou présentera demain — aucun écran n'a à la câbler.
/// Réduire l'appel la retire : l'écran d'en dessous n'a jamais été démonté ni
/// recouvert d'un modal, il reprend la main tel quel.
enum CallWindowPresentation {
    /// La vue d'appel plein écran se montre-t-elle ? La même règle que la
    /// couverture qu'elle remplace : un appel vivant (ou son panneau de fin) en
    /// mode plein écran. Réduit (`.pip`, `.bubble`) ⇒ la fenêtre se retire.
    static func isVisible(callState: CallState, displayMode: CallDisplayMode) -> Bool {
        CallState.shouldPresentFullScreenCover(callState: callState, displayMode: displayMode)
    }

    /// Au-dessus de la fenêtre principale ET de tout ce qu'elle présente, sous
    /// les alertes système.
    static let windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue - 1)
}

/// Ce que le présentateur demande à UIKit — une couture pour que le témoin
/// joue la montée et le retrait sans scène réelle.
@MainActor
protocol CallWindowHosting: AnyObject {
    /// `false` quand aucune scène n'est au premier plan (appel qui sonne
    /// pendant que l'app est en arrière-plan) : la montée se rejoue à
    /// l'activation de la scène.
    func show(_ manager: CallManager) -> Bool
    func hide()
}

/// Suit la pile d'appel et monte / retire la fenêtre selon
/// `CallWindowPresentation.isVisible`. Ne construit JAMAIS la pile : il lit
/// `CallManagerHost` (#7955), dont `manager` reste `nil` hors appel.
@MainActor
final class CallWindowPresenter {
    nonisolated deinit {}
    static let shared = CallWindowPresenter()

    private let hosting: CallWindowHosting
    private let viewing: ConversationViewingReporting
    private var subscription: AnyCancellable?
    private var activation: AnyCancellable?
    private weak var pendingManager: CallManager?
    private(set) var isShowing = false

    /// `viewing` : l'écran d'appel en grand fait quitter la conversation
    /// (#9065) ; réduit, l'utilisateur y revient s'il l'a sous les yeux.
    init(
        hosting: CallWindowHosting = CallOverlayWindowHost(),
        viewing: ConversationViewingReporting = ConversationViewingReporter.shared
    ) {
        self.hosting = hosting
        self.viewing = viewing
    }

    var isBound: Bool { subscription != nil }

    /// Idempotent : les deux racines (iPhone, iPad) le demandent au montage.
    func bind(host: CallManagerHost = .shared) {
        guard subscription == nil else { return }
        subscription = host.$manager
            .map { manager -> AnyPublisher<(CallManager, Bool)?, Never> in
                guard let manager else { return Just(nil).eraseToAnyPublisher() }
                return manager.$callState
                    .combineLatest(manager.$displayMode)
                    .map { (manager, CallWindowPresentation.isVisible(callState: $0, displayMode: $1)) }
                    .eraseToAnyPublisher()
            }
            .switchToLatest()
            // `@Published` émet en `willSet` : un saut de boucle laisse la pile
            // porter la nouvelle valeur quand la vue d'appel la lira.
            .receive(on: DispatchQueue.main)
            .sink { [weak self] update in
                self?.apply(manager: update?.0, visible: update?.1 ?? false)
            }
        activation = NotificationCenter.default
            .publisher(for: UIScene.didActivateNotification)
            .sink { [weak self] _ in self?.retryPendingShow() }
    }

    func retryPendingShow() {
        guard let manager = pendingManager else { return }
        apply(manager: manager, visible: true)
    }

    func apply(manager: CallManager?, visible: Bool) {
        viewing.setCallScreenShown(manager != nil && visible)
        guard let manager, visible else {
            pendingManager = nil
            guard isShowing else { return }
            isShowing = false
            hosting.hide()
            return
        }
        guard !isShowing else { return }
        isShowing = hosting.show(manager)
        pendingManager = isShowing ? nil : manager
    }
}

/// La fenêtre réelle. Créée à la montée, relâchée au retrait : hors appel,
/// aucune vue d'appel ne reste en mémoire.
@MainActor
final class CallOverlayWindowHost: CallWindowHosting {
    nonisolated deinit {}
    private var window: UIWindow?
    private weak var previousKeyWindow: UIWindow?

    func show(_ manager: CallManager) -> Bool {
        guard window == nil else { return true }
        guard let scene = DeviceLayout.activeWindowScene else { return false }
        let main = DeviceLayout.activeWindow
        previousKeyWindow = main
        // Un clavier ouvert dans l'écran d'en dessous (réponse à une story,
        // composer) vit dans une fenêtre système PLUS HAUTE que la nôtre : il
        // recouvrirait les boutons Décrocher / Refuser.
        main?.endEditing(true)

        let controller = UIHostingController(rootView: CallView(callManager: manager, mesh: .shared))
        controller.view.backgroundColor = .clear
        let overlay = UIWindow(windowScene: scene)
        overlay.windowLevel = CallWindowPresentation.windowLevel
        overlay.overrideUserInterfaceStyle = main?.overrideUserInterfaceStyle ?? .unspecified
        overlay.rootViewController = controller
        overlay.accessibilityViewIsModal = true
        window = overlay

        let animated = !UIAccessibility.isReduceMotionEnabled
        overlay.alpha = animated ? 0 : 1
        overlay.makeKeyAndVisible()
        guard animated else { return true }
        UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseOut]) { overlay.alpha = 1 }
        return true
    }

    func hide() {
        guard let overlay = window else { return }
        window = nil
        let restoreKey = previousKeyWindow
        previousKeyWindow = nil
        let finish = { [weak self] in
            overlay.isHidden = true
            overlay.rootViewController = nil
            // Un appel remonté pendant le fondu possède déjà sa fenêtre : lui
            // reprendre le statut de fenêtre clé la rendrait sourde au clavier.
            guard self?.window == nil else { return }
            restoreKey?.makeKey()
        }
        guard !UIAccessibility.isReduceMotionEnabled else { return finish() }
        UIView.animate(withDuration: 0.18, delay: 0, options: [.curveEaseIn]) {
            overlay.alpha = 0
        } completion: { _ in finish() }
    }
}

// MARK: - Le point de retour d'un appel réduit (#8739)

/// **Un appel réduit reste atteignable par-dessus tout plein écran (#8739).**
///
/// Réduit, l'appel retombait sur la pastille et la bulle montées dans la
/// racine : un viewer de story, une visionneuse image / vidéo ou le composer —
/// des présentations modales de la fenêtre principale — les recouvraient.
/// L'appel continuait, mais on ne pouvait y revenir qu'en fermant le plein
/// écran. La bulle vit désormais dans une fenêtre PASSE-PLAT au-dessus de la
/// fenêtre principale : elle ne capte que les touches posées sur elle, ne
/// devient jamais fenêtre clé, et la pastille couverte se replie en bulle.
enum CallReturnPoint {
    /// La fenêtre existe tant qu'un appel vivant est réduit.
    static func isWindowNeeded(callState: CallState, displayMode: CallDisplayMode) -> Bool {
        callState.isActive && displayMode != .fullScreen
    }

    /// La bulle se montre en mode bulle, et en mode pastille quand un plein
    /// écran recouvre la pastille. Jamais pendant le PiP système, qui est
    /// lui-même le point de retour.
    static func showsBubble(
        displayMode: CallDisplayMode,
        callState: CallState,
        isSystemPiPActive: Bool,
        isMainScreenCovered: Bool
    ) -> Bool {
        guard callState.isActive, !isSystemPiPActive else { return false }
        switch displayMode {
        case .bubble: return true
        case .pip: return isMainScreenCovered
        case .fullScreen: return false
        }
    }

    /// Une présentation modale de la racine recouvre la pastille ; une alerte
    /// ne la recouvre pas.
    static func isCovered(root: UIViewController?) -> Bool {
        guard let presented = root?.presentedViewController else { return false }
        return !(presented is UIAlertController)
    }

    /// Au-dessus de la fenêtre principale et de ses présentations, sous la
    /// vue d'appel plein écran.
    static let windowLevel = UIWindow.Level(rawValue: CallWindowPresentation.windowLevel.rawValue - 1)
}

/// Fenêtre passe-plat : seules les touches posées dans `interactiveFrame` lui
/// reviennent, toutes les autres descendent à l'app. Elle ne devient jamais
/// fenêtre clé : le clavier et le focus restent sur l'app.
final class CallPassthroughWindow: UIWindow {
    nonisolated deinit {}
    var interactiveFrame: CGRect = .zero

    override var canBecomeKey: Bool { false }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard interactiveFrame.contains(point) else { return nil }
        return super.hitTest(point, with: event)
    }
}

/// Le cadre touchable de la bulle, remonté par la mise en page — jamais lu
/// sur une fenêtre pendant le rendu (#8772).
struct CallReturnPointFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        guard !next.isEmpty else { return }
        value = next
    }
}

/// Ce que l'écran de l'app montre en dessous : un plein écran recouvre-t-il
/// la pastille ?
@MainActor
final class CallScreenCoverage: ObservableObject {
    nonisolated deinit {}
    @Published private(set) var isMainScreenCovered = false

    func update(_ isCovered: Bool) {
        guard isCovered != isMainScreenCovered else { return }
        isMainScreenCovered = isCovered
    }
}

@MainActor
final class CallReturnPointFrameSink {
    nonisolated deinit {}
    private weak var window: CallPassthroughWindow?

    init(window: CallPassthroughWindow?) {
        self.window = window
    }

    func update(_ frame: CGRect) {
        window?.interactiveFrame = frame
    }
}

struct CallReturnPointRoot: View {
    @ObservedObject var callManager: CallManager
    @ObservedObject var coverage: CallScreenCoverage
    let frameSink: CallReturnPointFrameSink

    var body: some View {
        CallBubbleView(callManager: callManager, isMainScreenCovered: coverage.isMainScreenCovered)
            .onPreferenceChange(CallReturnPointFrameKey.self) { frameSink.update($0) }
    }
}

@MainActor
protocol CallReturnPointHosting: AnyObject {
    func show(_ manager: CallManager, coverage: CallScreenCoverage) -> Bool
    func hide()
}

/// Monte la fenêtre passe-plat tant qu'un appel est réduit. Le recouvrement
/// de la pastille se relit à la cadence de `coveragePollInterval` : un
/// plein écran SwiftUI ne prévient pas l'écran qu'il recouvre (#9052).
@MainActor
final class CallReturnPointPresenter {
    nonisolated deinit {}
    static let shared = CallReturnPointPresenter()
    static let coveragePollInterval: TimeInterval = 0.3

    let coverage: CallScreenCoverage
    private let hosting: CallReturnPointHosting
    private let probe: @MainActor () -> Bool
    private var subscription: AnyCancellable?
    private var activation: AnyCancellable?
    private var polling: AnyCancellable?
    private weak var pendingManager: CallManager?
    private(set) var isShowing = false

    init(
        hosting: CallReturnPointHosting = CallReturnPointWindowHost(),
        coverage: CallScreenCoverage = CallScreenCoverage(),
        probe: @escaping @MainActor () -> Bool = {
            CallReturnPoint.isCovered(root: DeviceLayout.measurementWindow?.rootViewController)
        }
    ) {
        self.hosting = hosting
        self.coverage = coverage
        self.probe = probe
    }

    var isBound: Bool { subscription != nil }

    func bind(host: CallManagerHost = .shared) {
        guard subscription == nil else { return }
        subscription = host.$manager
            .map { manager -> AnyPublisher<(CallManager, Bool)?, Never> in
                guard let manager else { return Just(nil).eraseToAnyPublisher() }
                return manager.$callState
                    .combineLatest(manager.$displayMode)
                    .map { (manager, CallReturnPoint.isWindowNeeded(callState: $0, displayMode: $1)) }
                    .eraseToAnyPublisher()
            }
            .switchToLatest()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] update in
                self?.apply(manager: update?.0, needed: update?.1 ?? false)
            }
        activation = NotificationCenter.default
            .publisher(for: UIScene.didActivateNotification)
            .sink { [weak self] _ in self?.retryPendingShow() }
    }

    func retryPendingShow() {
        guard let manager = pendingManager else { return }
        apply(manager: manager, needed: true)
    }

    func apply(manager: CallManager?, needed: Bool) {
        guard let manager, needed else {
            pendingManager = nil
            guard isShowing else { return }
            isShowing = false
            polling = nil
            coverage.update(false)
            hosting.hide()
            return
        }
        guard !isShowing else { return }
        isShowing = hosting.show(manager, coverage: coverage)
        pendingManager = isShowing ? nil : manager
        guard isShowing else { return }
        refreshCoverage()
        polling = Timer.publish(every: Self.coveragePollInterval, tolerance: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.refreshCoverage() }
    }

    func refreshCoverage() {
        coverage.update(probe())
    }
}

@MainActor
final class CallReturnPointWindowHost: CallReturnPointHosting {
    nonisolated deinit {}
    private var window: CallPassthroughWindow?

    func show(_ manager: CallManager, coverage: CallScreenCoverage) -> Bool {
        guard window == nil else { return true }
        guard let scene = DeviceLayout.activeWindowScene else { return false }
        let overlay = CallPassthroughWindow(windowScene: scene)
        let root = CallReturnPointRoot(
            callManager: manager,
            coverage: coverage,
            frameSink: CallReturnPointFrameSink(window: overlay)
        )
        let controller = UIHostingController(rootView: root)
        controller.view.backgroundColor = .clear
        overlay.windowLevel = CallReturnPoint.windowLevel
        overlay.overrideUserInterfaceStyle = DeviceLayout.measurementWindow?.overrideUserInterfaceStyle ?? .unspecified
        overlay.rootViewController = controller
        overlay.isHidden = false
        window = overlay
        return true
    }

    func hide() {
        guard let overlay = window else { return }
        window = nil
        overlay.isHidden = true
        overlay.rootViewController = nil
    }
}
