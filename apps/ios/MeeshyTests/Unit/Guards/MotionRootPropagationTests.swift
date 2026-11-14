import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// #18354 — **la racine du mouvement coupe les animations explicites qui la
/// traversent**, sous l'une OU l'autre moitié de « Réduire les animations »,
/// et laisse passer le fondu réduit qu'un site a demandé.
///
/// La mesure se prend dans une vraie fenêtre clé : hors fenêtre,
/// `UIHostingController` ne matérialise pas sa hiérarchie, et une transaction
/// qui n'atteint aucune vue ne s'enregistre nulle part — vert par omission.
@MainActor
final class MotionRootPropagationTests: XCTestCase {

    private final class TransactionLog {
        var animations: [Animation?] = []
    }

    @MainActor
    private final class Probe: ObservableObject {
        @Published var expanded = false
    }

    private struct ProbeView: View {
        @ObservedObject var probe: Probe
        let log: TransactionLog

        var body: some View {
            Rectangle()
                .frame(width: probe.expanded ? 120 : 60, height: 20)
                .transaction { log.animations.append($0.animation) }
        }
    }

    private var window: UIWindow?

    override func tearDown() async throws {
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
        try await super.tearDown()
    }

    private func received(
        systemReduce: Bool,
        userForced: Bool,
        change: (Probe) -> Void,
        line: UInt = #line
    ) throws -> Animation? {
        let probe = Probe()
        let log = TransactionLog()
        let root = ProbeView(probe: probe, log: log)
            .meeshyMotionRoot()
            .environment(\.meeshyForceReduceMotion, userForced)
            .environment(\._accessibilityReduceMotion, systemReduce)
        let host = UIHostingController(rootView: root)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 200, height: 200))
        window.rootViewController = host
        window.makeKeyAndVisible()
        self.window = window
        settle(host)
        log.animations.removeAll()

        change(probe)
        settle(host)

        let last = try XCTUnwrap(log.animations.last, "la transaction n'a atteint aucune vue", line: line)
        return last
    }

    private func settle(_ host: UIViewController) {
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        host.view.layoutIfNeeded()
    }

    func test_withAnimation_underSystemReduce_reachesTheViewWithoutAnimation() throws {
        let animation = try received(systemReduce: true, userForced: false) { probe in
            withAnimation(.spring) { probe.expanded = true }
        }
        XCTAssertNil(animation)
    }

    func test_withAnimation_withoutReduce_reachesTheViewAnimated() throws {
        let animation = try received(systemReduce: false, userForced: false) { probe in
            withAnimation(.spring) { probe.expanded = true }
        }
        XCTAssertNotNil(animation)
    }

    func test_withAnimation_underInAppReduceOnly_reachesTheViewWithoutAnimation() throws {
        let animation = try received(systemReduce: false, userForced: true) { probe in
            withAnimation(.spring) { probe.expanded = true }
        }
        XCTAssertNil(animation)
    }

    func test_reducedVariant_underReduce_crossesTheRoot() throws {
        guard #available(iOS 17, *) else { throw XCTSkip("iOS 16 n'a pas de clé de transaction") }
        let animation = try received(systemReduce: true, userForced: false) { probe in
            meeshyWithAnimation(.spring, reduced: MeeshyMotion.reducedFade, reduceMotion: true) {
                probe.expanded = true
            }
        }
        XCTAssertEqual(animation, MeeshyMotion.reducedFade)
    }
}
