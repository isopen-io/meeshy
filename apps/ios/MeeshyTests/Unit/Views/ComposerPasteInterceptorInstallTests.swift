import XCTest
import UIKit
@testable import Meeshy

@MainActor
final class ComposerPasteInterceptorInstallTests: XCTestCase {
    func test_install_twiceOnSameTextView_doesNotThrowAndKeepsAttachableTypesOnce() {
        let textView = UITextView()
        let coordinator = ComposerPasteInterceptor.Coordinator(limit: 5, onIngest: { _ in })
        coordinator.install(on: textView)
        coordinator.install(on: textView)
        let ids = textView.pasteConfiguration?.acceptableTypeIdentifiers ?? []
        for type in ComposerPasteInterceptor.Coordinator.attachableTypes {
            XCTAssertEqual(ids.filter { $0 == type }.count, 1)
        }
    }

    func test_configurationMerging_existingConfiguration_returnsNewInstanceWithoutMutatingIt() {
        let existing = UIPasteConfiguration(acceptableTypeIdentifiers: ["public.plain-text"])
        let merged = ComposerPasteInterceptor.Coordinator.configuration(merging: existing)
        XCTAssertFalse(merged === existing)
        XCTAssertEqual(existing.acceptableTypeIdentifiers, ["public.plain-text"])
        XCTAssertTrue(merged.acceptableTypeIdentifiers.contains("public.plain-text"))
        XCTAssertTrue(merged.acceptableTypeIdentifiers.contains("public.image"))
    }
}
