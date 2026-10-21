import UIKit
import UIKit.UIGestureRecognizerSubclass

// MARK: - Rules

public nonisolated enum SwipeRowRules {
    /// Un côté balayé porte au plus trois actions (directive porteur 2026-10-14, #10579).
    public static let maxActionsPerSide = 3

    public static func capped<Action>(_ actions: [Action]) -> [Action] {
        Array(actions.prefix(maxActionsPerSide))
    }

    /// Un toucher referme la ligne ouverte dès qu'il tombe hors d'elle. Un cadre
    /// pas encore mesuré (`.null`) ne contient aucun point : il referme.
    public static func closesOpenRow(touchAt point: CGPoint, openRowFrame: CGRect) -> Bool {
        !openRowFrame.contains(point)
    }
}

// MARK: - Coordinator

/// Une seule ligne balayée reste ouverte à la fois, et elle revient en place dès
/// qu'on touche ailleurs. État tenu HORS de SwiftUI : ouvrir ou refermer une ligne
/// ne ré-évalue aucune autre ligne de la liste.
public final class SwipeRowCoordinator {
    public static let shared = SwipeRowCoordinator()

    private var openRowID: UUID?
    private var closeOpenRowAction: (() -> Void)?
    private var openRowFrame: CGRect = .null
    private var touchObserver: OutsideTouchObserver?

    nonisolated deinit {}

    public var hasOpenRow: Bool { openRowID != nil }

    func rowDidOpen(_ id: UUID, close: @escaping () -> Void) {
        if let current = openRowID, current != id { closeOpenRowAction?() }
        openRowID = id
        closeOpenRowAction = close
        openRowFrame = .null
        installTouchObserver()
    }

    func rowFrameDidChange(_ id: UUID, frame: CGRect) {
        guard openRowID == id else { return }
        openRowFrame = frame
    }

    func rowDidClose(_ id: UUID) {
        guard openRowID == id else { return }
        forget()
    }

    public func closeOpenRow() {
        let close = closeOpenRowAction
        forget()
        close?()
    }

    func touchBegan(at point: CGPoint) {
        guard hasOpenRow, SwipeRowRules.closesOpenRow(touchAt: point, openRowFrame: openRowFrame) else { return }
        closeOpenRow()
    }

    private func forget() {
        openRowID = nil
        closeOpenRowAction = nil
        openRowFrame = .null
        removeTouchObserver()
    }

    private func installTouchObserver() {
        guard touchObserver == nil, let window = WindowMetrics.activeWindow else { return }
        let observer = OutsideTouchObserver { [weak self] point in self?.touchBegan(at: point) }
        window.addGestureRecognizer(observer)
        touchObserver = observer
    }

    private func removeTouchObserver() {
        guard let observer = touchObserver else { return }
        observer.view?.removeGestureRecognizer(observer)
        touchObserver = nil
    }
}

// MARK: - Touch observer

/// Observe le début de chaque toucher de la fenêtre puis échoue aussitôt : il ne
/// retient, n'annule ni ne retarde aucun toucher destiné aux vues.
private final class OutsideTouchObserver: UIGestureRecognizer {
    private let onTouch: (CGPoint) -> Void

    init(onTouch: @escaping (CGPoint) -> Void) {
        self.onTouch = onTouch
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    nonisolated deinit {}

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if let touch = touches.first { onTouch(touch.location(in: nil)) }
        state = .failed
    }
}
