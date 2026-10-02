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
