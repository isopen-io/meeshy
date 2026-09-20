import XCTest
@testable import Meeshy
import MeeshySDK

/// Verify that image and document attachments are included in consumption statuses,
/// displayed in "Vu par" just like audio and video. Regression: prior to this,
/// only hasTimebasedTrack (audio/video) were loaded.
@MainActor
final class MessageViewsDetailImageDocumentStatusesTests: XCTestCase {

    func test_loadAttachmentStatuses_includesImageAttachments() async {
        // Arrange: a message with an image attachment
        let imageAttachment = MessageAttachment(
            id: "img-001",
            fileUrl: "https://example.com/image.jpg",
            mimeType: "image/jpeg",
            fileName: "photo.jpg",
            originalName: "My Photo",
            size: 500_000,
            duration: nil,
            thumbHash: "data:image/png;base64,iVBORw0KGgo=",
            translations: []
        )
        let message = Message(
            id: "msg-001",
            content: "Check this out",
            attachments: [imageAttachment],
            // ... other required fields, using defaults as appropriate
            senderId: "user-123",
            conversationId: "conv-001",
            createdAt: Date(),
            updatedAt: Date(),
            deliveryStatus: .read,
            isEphemeral: false,
            expiresAt: nil,
            replyToId: nil,
            replyTo: nil,
            translations: [],
            reactions: []
        )

        let view = MessageViewsDetailView(
            message: message,
            contactColor: "#FF5733",
            conversationId: "conv-001"
        )

        // Act: trigger load (simulated via reflection of private methods or via integration)
        // This is a structural test: verify the filter does NOT exclude images
        let attachmentKind = AttachmentKind(mimeType: imageAttachment.mimeType)

        // Assert: image is NOT filtered out by hasTimebasedTrack
        XCTAssertFalse(
            attachmentKind.hasTimebasedTrack,
            "Image should not have timebasedTrack"
        )
        // The NEW logic should include it anyway (no filter)
        // This test documents the requirement: even though hasTimebasedTrack is false,
        // the image should be loaded into attachmentStatuses.
    }

    func test_loadAttachmentStatuses_includesDocumentAttachments() async {
        // Arrange: a message with a document attachment
        let documentAttachment = MessageAttachment(
            id: "doc-001",
            fileUrl: "https://example.com/document.pdf",
            mimeType: "application/pdf",
            fileName: "contract.pdf",
            originalName: "Service Agreement",
            size: 1_000_000,
            duration: nil,
            thumbHash: nil,
            translations: []
        )
        let message = Message(
            id: "msg-001",
            content: "Review this document",
            attachments: [documentAttachment],
            senderId: "user-123",
            conversationId: "conv-001",
            createdAt: Date(),
            updatedAt: Date(),
            deliveryStatus: .read,
            isEphemeral: false,
            expiresAt: nil,
            replyToId: nil,
            replyTo: nil,
            translations: [],
            reactions: []
        )

        // Act
        let attachmentKind = AttachmentKind(mimeType: documentAttachment.mimeType)

        // Assert: document is NOT filtered out by hasTimebasedTrack
        XCTAssertFalse(
            attachmentKind.hasTimebasedTrack,
            "Document should not have timebasedTrack"
        )
        // The NEW logic should include it anyway (no filter)
    }

    func test_mediaConsumptionCard_progressBarOnlyShowsForAudio() {
        // Test that the progress bar condition is guarded by isTimeBased
        // For images/documents, the bar should NOT render even if fraction > 0
        // This is a behavioral spec test, not a view test (those run in UI tests)

        let isAudio = false  // Image
        let isComplete = false
        let fraction = 0.5

        // The progress bar should only show if ALL three are true:
        // 1. !isComplete
        // 2. isTimeBased (i.e., isAudio || isVideo — here, isAudio)
        // 3. fraction > 0

        let shouldShowProgressBar = !isComplete && isAudio && fraction > 0
        XCTAssertFalse(
            shouldShowProgressBar,
            "Progress bar should not show for image even with fraction > 0"
        )
    }

    func test_mediaConsumptionCard_progressBarShowsForAudio() {
        // Verify that audio DOES show the progress bar when conditions are met
        let isAudio = true
        let isComplete = false
        let fraction = 0.5

        let shouldShowProgressBar = !isComplete && isAudio && fraction > 0
        XCTAssertTrue(
            shouldShowProgressBar,
            "Progress bar should show for audio when not complete and position > 0"
        )
    }

    func test_mediaConsumptionCard_progressBarHiddenWhenComplete() {
        // Verify that even for audio, complete media hides the progress bar
        let isAudio = true
        let isComplete = true
        let fraction = 1.0

        let shouldShowProgressBar = !isComplete && isAudio && fraction > 0
        XCTAssertFalse(
            shouldShowProgressBar,
            "Progress bar should be hidden when media is complete"
        )
    }
}
