import SwiftUI
import UIKit
import XCTest
@testable import Meeshy

@MainActor
final class RootScopeSwitchTests: XCTestCase {

    final class Scope: ObservableObject {
        nonisolated deinit {}
    }

    final class Recorder {
        var factoryCalls = 0
        var compactIdentifiers: [ObjectIdentifier] = []
        var regularIdentifiers: [ObjectIdentifier] = []
    }

    final class SizeDriver: ObservableObject {
        nonisolated deinit {}
        @Published var value: UserInterfaceSizeClass?
        init(_ value: UserInterfaceSizeClass?) { self.value = value }
    }

    struct Harness: View {
        @ObservedObject var driver: SizeDriver
        let recorder: Recorder

        var body: some View {
            RootScopeSwitch(
                makeScope: { () -> Scope in
                    recorder.factoryCalls += 1
                    return Scope()
                },
                compact: { scope in
                    Color.clear.onAppear { recorder.compactIdentifiers.append(ObjectIdentifier(scope)) }
                },
                regular: { scope in
                    Color.clear.onAppear { recorder.regularIdentifiers.append(ObjectIdentifier(scope)) }
                }
            )
            .environment(\.horizontalSizeClass, driver.value)
        }
    }

    private func pump(until condition: () -> Bool, bound: TimeInterval = 10) {
        let deadline = Date().addingTimeInterval(bound)
        while !condition(), Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.02))
        }
    }

    func test_crossingTheSizeClass_neverRecreatesTheScope() {
        let recorder = Recorder()
        let driver = SizeDriver(.compact)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
        window.rootViewController = UIHostingController(rootView: Harness(driver: driver, recorder: recorder))
        window.isHidden = false
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }

        pump { recorder.compactIdentifiers.count >= 1 }
        driver.value = .regular
        pump { recorder.regularIdentifiers.count >= 1 }
        let regularMounted = recorder.regularIdentifiers.count
        driver.value = .compact
        pump { recorder.compactIdentifiers.count >= 2 }

        XCTAssertGreaterThanOrEqual(regularMounted, 1)
        XCTAssertEqual(recorder.factoryCalls, 1)
        let all = Set(recorder.compactIdentifiers + recorder.regularIdentifiers)
        XCTAssertEqual(all.count, 1)
    }
}
