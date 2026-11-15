import SwiftUI
import XCTest
@testable import MeeshyUI

final class MeeshySheetSizingTests: XCTestCase {

    func test_pageSizing_followsThePresentersSizeClass() {
        XCTAssertTrue(MeeshySheetWidth.usesPageSizing(hostSizeClass: .regular, inSheetSizeClass: .compact, pageSizingAvailable: true))
        XCTAssertFalse(MeeshySheetWidth.usesPageSizing(hostSizeClass: .compact, inSheetSizeClass: .regular, pageSizingAvailable: true))
    }

    func test_pageSizing_fallsBackToTheSheetSizeClass_whenThePresenterIsUnknown() {
        XCTAssertTrue(MeeshySheetWidth.usesPageSizing(hostSizeClass: nil, inSheetSizeClass: .regular, pageSizingAvailable: true))
        XCTAssertFalse(MeeshySheetWidth.usesPageSizing(hostSizeClass: nil, inSheetSizeClass: .compact, pageSizingAvailable: true))
        XCTAssertTrue(MeeshySheetWidth.usesPageSizing(hostSizeClass: nil, inSheetSizeClass: nil, pageSizingAvailable: true))
    }

    func test_pageSizing_isNeverRequested_whenTheOSLacksIt() {
        XCTAssertFalse(MeeshySheetWidth.usesPageSizing(hostSizeClass: .regular, inSheetSizeClass: .regular, pageSizingAvailable: false))
    }

    func test_automaticWidth_neverRequestsPage() {
        XCTAssertFalse(MeeshySheetWidth.automatic.requestsPageSizing(hostSizeClass: .regular, inSheetSizeClass: .regular, pageSizingAvailable: true))
        XCTAssertTrue(MeeshySheetWidth.wide.requestsPageSizing(hostSizeClass: .regular, inSheetSizeClass: .regular, pageSizingAvailable: true))
    }

    func test_adaptiveWideSheet_doesNotAskTheDeviceIdiom() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Compatibility/AdaptiveSheetSizing.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(code.isEmpty)
        XCTAssertFalse(code.contains("userInterfaceIdiom"))
    }
}
