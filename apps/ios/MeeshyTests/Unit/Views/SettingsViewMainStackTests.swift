import XCTest
import SwiftUI
import Darwin
import MeeshySDK
@testable import Meeshy

/// Ouvrir les réglages plantait l'app sur iPhone en build Debug (SIGSEGV, #13961) :
/// le rendu de `SettingsView` descendait à plus de 1 Mio sur le fil principal, et
/// le fil principal d'un iPhone n'a que 1 Mio de pile. Le simulateur ne plante pas,
/// son fil principal hérite des 8 Mio du Mac : il faut donc MESURER la profondeur,
/// jamais se contenter de « ça s'ouvre au simulateur ».
@MainActor
final class SettingsViewMainStackTests: XCTestCase {

    private static let iPhoneMainThreadStack = 1 << 20
    private static let budget = iPhoneMainThreadStack / 2

    func test_settingsFirstRender_fitsInHalfOfTheIPhoneMainThreadStack() {
        let peak = MainStackHighWaterMark.measure {
            let host = UIHostingController(rootView: SettingsView().environmentObject(AuthManager.shared))
            let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
            window.rootViewController = host
            window.makeKeyAndVisible()
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.3))
            window.isHidden = true
        }

        XCTAssertLessThan(
            peak, Self.budget,
            "Le premier rendu des réglages descend à \(peak / 1024) Kio sur le fil principal ; un iPhone n'en a que \(Self.iPhoneMainThreadStack / 1024)."
        )
    }
}

/// La profondeur maximale atteinte par le fil principal pendant `work` : la pile libre
/// sous le cadre courant est remplie d'un motif, puis on cherche l'octet le plus bas
/// que le travail a réécrit.
private enum MainStackHighWaterMark {
    private static let pattern: UInt8 = 0xA5
    private static let margin: UInt = 64 * 1024

    static func measure(_ work: () -> Void) -> Int {
        let thread = pthread_self()
        let top = UInt(bitPattern: pthread_get_stackaddr_np(thread))
        let bottom = top - UInt(pthread_get_stacksize_np(thread)) + margin
        var marker: UInt8 = 0
        let here = withUnsafeMutablePointer(to: &marker) { UInt(bitPattern: $0) }
        let end = here - margin
        let length = Int(end - bottom)
        guard let region = UnsafeMutableRawPointer(bitPattern: bottom) else { return 0 }
        memset(region, Int32(pattern), length)

        work()

        let bytes = region.assumingMemoryBound(to: UInt8.self)
        let firstTouched = (0..<length).first { bytes[$0] != pattern } ?? length
        return Int(top - (bottom + UInt(firstTouched)))
    }
}
