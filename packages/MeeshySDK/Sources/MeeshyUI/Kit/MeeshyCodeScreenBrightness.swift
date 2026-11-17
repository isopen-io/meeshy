import SwiftUI
#if canImport(UIKit)
import UIKit

/// La luminosité poussée au maximum tant que le code est à l'écran, rendue à sa
/// valeur d'avant en partant et en passant en arrière-plan, repoussée au retour.
/// L'écran se lit sur la fenêtre de la vue ; la comptabilité est UNIQUE
/// (`MeeshyBrightnessLedger`), pour que deux cartes ne se rendent pas l'une
/// l'autre une valeur d'avant fausse.
struct MeeshyCodeScreenBrightness: UIViewRepresentable {
    let isActive: Bool

    func makeUIView(context: Context) -> BrightnessProbe {
        let probe = BrightnessProbe()
        probe.isActive = isActive
        return probe
    }

    func updateUIView(_ uiView: BrightnessProbe, context: Context) {
        uiView.isActive = isActive
        uiView.applyIfNeeded()
    }

    static func dismantleUIView(_ uiView: BrightnessProbe, coordinator: ()) {
        uiView.releaseIfHeld()
    }

    final class BrightnessProbe: UIView {
        var isActive = false
        private let lease = UUID()
        private var holds = false

        override func didMoveToWindow() {
            super.didMoveToWindow()
            applyIfNeeded()
        }

        func applyIfNeeded() {
            guard isActive, let target = window?.windowScene?.screen else { return releaseIfHeld() }
            guard !holds else { return }
            holds = true
            MeeshyCodeBrightnessLeases.acquire(lease, on: target)
        }

        func releaseIfHeld() {
            guard holds else { return }
            holds = false
            MeeshyCodeBrightnessLeases.release(lease)
        }
    }
}

/// Le seul site qui écrit la luminosité de l'écran : il tient la comptabilité et
/// écoute le cycle de l'application dès la première carte, pour toute la vie du
/// processus (deux observateurs), afin que l'état « en arrière-plan » reste juste
/// même quand la dernière carte part pendant l'arrière-plan.
@MainActor
enum MeeshyCodeBrightnessLeases {
    private static var ledger = MeeshyBrightnessLedger()
    private static weak var screen: UIScreen?
    private static var observers: [NSObjectProtocol] = []

    static func acquire(_ lease: UUID, on target: UIScreen) {
        if ledger.holders.isEmpty { screen = target }
        apply(ledger.acquire(lease, current: Double(target.brightness)))
        observeLifecycle()
    }

    static func release(_ lease: UUID) {
        apply(ledger.release(lease))
        if ledger.holders.isEmpty { screen = nil }
    }

    private static func apply(_ value: Double?) {
        guard let value, let screen else { return }
        screen.brightness = CGFloat(value)
    }

    private static func observeLifecycle() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { apply(ledger.suspend()) }
            },
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated {
                    apply(ledger.resume(current: screen.map { Double($0.brightness) } ?? MeeshyBrightnessLedger.boosted))
                }
            },
        ]
    }
}
#else
struct MeeshyCodeScreenBrightness: View {
    let isActive: Bool
    var body: some View { EmptyView() }
}
#endif
