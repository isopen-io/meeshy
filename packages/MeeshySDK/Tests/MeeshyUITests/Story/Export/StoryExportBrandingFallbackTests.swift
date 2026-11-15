import XCTest
@testable import MeeshyUI

/// Un emballage de marque qui lève ne livre plus une story nue SANS TRACE
/// (#14488) : la story part entière, l'échec est rapporté une fois.
@MainActor
final class StoryExportBrandingFallbackTests: XCTestCase {

    private var reported: [StoryExportBrandingFailure] = []
    private var previousReporter: ((StoryExportBrandingFailure) -> Void)?

    override func setUp() async throws {
        try await super.setUp()
        previousReporter = StoryExportBrandingFallback.reporter
        reported = []
        StoryExportBrandingFallback.reporter = { [weak self] in self?.reported.append($0) }
    }

    override func tearDown() async throws {
        StoryExportBrandingFallback.reporter = previousReporter
        try await super.tearDown()
    }

    private static let avFoundationDomain = "AVFoundationErrorDomain"
    private let bare = URL(fileURLWithPath: "/tmp/bare-story.mp4")
    private let branded = URL(fileURLWithPath: "/tmp/branded-story.mp4")

    func test_deliver_whenTheWrapThrows_deliversTheBareStoryAndReportsTheFailure() async {
        let cause = NSError(domain: Self.avFoundationDomain, code: -11800,
                            userInfo: [NSLocalizedDescriptionKey: "The operation could not be completed"])

        let outcome = await StoryExportBrandingFallback.deliver(bareStory: bare, path: .shareOrSave, slideId: "slide-1") {
            throw cause
        }

        XCTAssertEqual(outcome, .bare(bare))
        XCTAssertEqual(reported.count, 1, "un échec de l'emballage ne passe plus en silence")
        XCTAssertEqual(reported.first?.path, .shareOrSave)
        XCTAssertEqual(reported.first?.slideId, "slide-1")
        XCTAssertEqual(reported.first?.errorDomain, Self.avFoundationDomain)
        XCTAssertEqual(reported.first?.errorCode, -11800)
    }

    func test_deliver_reportsTheEncoderCauseCarriedByABrandingError() async {
        let cause = NSError(domain: Self.avFoundationDomain, code: -11800)

        _ = await StoryExportBrandingFallback.deliver(bareStory: bare, path: .timeline, slideId: "slide-2") {
            throw StoryExportBranding.BrandingError.encodingFailed(cause)
        }

        XCTAssertEqual(reported.map(\.path), [.timeline])
        XCTAssertEqual(reported.first?.errorCode, -11800, "l'erreur d'encodage sous-jacente est celle qui se compte")
    }

    func test_deliver_whenTheWrapSucceeds_deliversTheBrandedStoryAndReportsNothing() async {
        let outcome = await StoryExportBrandingFallback.deliver(bareStory: bare, path: .shareOrSave, slideId: "slide-3") {
            branded
        }

        XCTAssertEqual(outcome, .branded(branded))
        XCTAssertEqual(outcome.url, branded)
        XCTAssertTrue(reported.isEmpty)
    }

    func test_deliver_whenTheExportIsCancelled_reportsNothing() async {
        let outcome = await StoryExportBrandingFallback.deliver(bareStory: bare, path: .shareOrSave, slideId: "slide-4") {
            throw CancellationError()
        }

        XCTAssertEqual(outcome.url, bare)
        XCTAssertTrue(reported.isEmpty, "une annulation n'est pas un défaut de la marque")
    }
}
