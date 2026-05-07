import XCTest
import SwiftUI
import SnapshotTesting
@testable import MeeshyUI

/// Centralized snapshot harness for the Timeline UI test target.
///
/// Conventions enforced :
/// 1. Reference devices : iPhone 16 Pro (390x844pt, portrait) and iPad Pro 11"
///    landscape (1194x834pt). All Phase 3 snapshots are recorded on one of
///    these two sizes — never on `.fixed(width:height:)` magic numbers
///    scattered across files.
/// 2. Snapshots are stored in `__Snapshots__/` next to the calling test file.
///    `Package.swift` excludes that directory from the SwiftPM source list so
///    the PNGs do not pollute the build graph.
/// 3. Every UI snapshot is captured TWICE — once in `.light`, once in `.dark`
///    color scheme — via `assertLightDarkSnapshot`. Helpers below derive the
///    snapshot name from the test name + scheme suffix.
/// 4. First run uses `record: true` once per developer machine to populate the
///    baseline; CI runs it with `record: false` so any drift fails the build.
///    The team-wide rule is : commits MUST land with `record: false` (review
///    rejects baselines recorded on the wrong machine without inspection).
enum SnapshotHelpers {

    enum Device: Sendable, Equatable {
        case iPhone16Pro
        case iPadPro11Landscape
    }

    static func deviceSize(for device: Device) -> CGSize {
        switch device {
        case .iPhone16Pro:        return CGSize(width: 390, height: 844)
        case .iPadPro11Landscape: return CGSize(width: 1194, height: 834)
        }
    }

    /// Resolves `__Snapshots__/` adjacent to the test file at `testFile` (use
    /// `#filePath`). Falls back to `(NSTemporaryDirectory)/__Snapshots__` when
    /// the path lookup fails, ensuring the helper never crashes the suite.
    static func snapshotDirectory(testFile: StaticString) -> String {
        let pathString = "\(testFile)"
        guard let lastSlash = pathString.lastIndex(of: "/") else {
            return NSTemporaryDirectory() + "__Snapshots__"
        }
        let directory = String(pathString[..<lastSlash])
        return directory + "/__Snapshots__"
    }

    /// Wrap a SwiftUI view in a fixed-size hosting controller suitable for
    /// `swift-snapshot-testing` `.image` strategy. The view is forced to fill
    /// the device frame and the color scheme is injected via environment.
    @MainActor
    static func host<V: View>(
        _ view: V,
        on device: Device,
        colorScheme: ColorScheme
    ) -> some View {
        let size = deviceSize(for: device)
        return view
            .environment(\.colorScheme, colorScheme)
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .background(colorScheme == .dark ? Color.black : Color.white)
    }

    /// Single-scheme snapshot — used by the light/dark wrapper below.
    @MainActor
    static func assertSnapshot<V: View>(
        of view: V,
        device: Device = .iPhone16Pro,
        colorScheme: ColorScheme,
        named name: String,
        record: Bool = false,
        file: StaticString = #filePath,
        testName: String = #function,
        line: UInt = #line
    ) {
        let hosted = host(view, on: device, colorScheme: colorScheme)
        let size = deviceSize(for: device)
        SnapshotTesting.assertSnapshot(
            of: hosted,
            as: .image(layout: .fixed(width: size.width, height: size.height)),
            named: name,
            record: record,
            file: file,
            testName: testName,
            line: line
        )
    }

    /// Light + Dark double-snapshot helper. Each call emits two PNGs with the
    /// suffixes `-light` / `-dark`. Use this from every Task 39-45 test so
    /// both color schemes are covered without duplicating boilerplate.
    @MainActor
    static func assertLightDarkSnapshot<V: View>(
        of view: V,
        device: Device = .iPhone16Pro,
        named baseName: String,
        record: Bool = false,
        file: StaticString = #filePath,
        testName: String = #function,
        line: UInt = #line
    ) {
        for scheme in [ColorScheme.light, ColorScheme.dark] {
            let suffix = (scheme == .light) ? "light" : "dark"
            assertSnapshot(
                of: view,
                device: device,
                colorScheme: scheme,
                named: "\(baseName)-\(suffix)",
                record: record,
                file: file,
                testName: testName,
                line: line
            )
        }
    }
}
