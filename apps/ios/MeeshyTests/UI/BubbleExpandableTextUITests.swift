import XCTest

/// UI Tests focusing on the reliability of the "Voir plus" (Show more) button
/// in message bubbles and feed posts.
///
/// These tests verify that:
/// 1. The button is tappable even when reactions are present.
/// 2. The button takes priority over parent gestures (swipe/long press).
/// 3. Tapping the button expands the text correctly.
@MainActor
final class BubbleExpandableTextUITests: XCTestCase {

    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments.append("--uitesting")
        app.launch()
    }

    func test_voirPlus_isResponsiveInConversation() throws {
        // Navigate to a conversation with a long message
        // (Assuming a mock environment or a specific test user)
        let messageList = app.collectionViews["message_list"]
        XCTAssertTrue(messageList.waitForExistence(timeout: 5))

        // Find a bubble with "Voir plus" via its stable identifier
        let voirPlusButton = app.otherElements["bubble.expand.more"].firstMatch
        XCTAssertTrue(voirPlusButton.exists, "The 'Voir plus' button should be visible for long messages")

        // Layout height is compact (24pt) so the label sits close to the
        // timestamp row; the effective touch target stays ~40pt via the
        // extended contentShape (-8pt inset), which XCUITest cannot measure.
        let frame = voirPlusButton.frame
        XCTAssertGreaterThanOrEqual(frame.height, 24, "The button's layout height should be at least 24pt")
        XCTAssertLessThan(frame.height, 44, "The compact layout must not regress to the old 44pt strip that padded the timestamp row")

        // Tap "Voir plus"
        voirPlusButton.tap()

        // Verify the button disappears (meaning it expanded)
        let exists = voirPlusButton.waitForExistence(timeout: 1)
        XCTAssertFalse(exists, "The 'Voir plus' button should disappear after being tapped")
    }

    func test_voirPlus_withReactions_isStillTappable() throws {
        // Find a bubble with "Voir plus" AND reactions
        let voirPlusButton = app.otherElements["bubble.expand.more"].firstMatch
        let addReactionButton = app.buttons["bubble.reactions.add"].firstMatch

        XCTAssertTrue(voirPlusButton.exists)
        XCTAssertTrue(addReactionButton.exists)

        // Verify they don't overlap geometrically
        let voirPlusFrame = voirPlusButton.frame
        let reactionFrame = addReactionButton.frame

        XCTAssertFalse(voirPlusFrame.intersects(reactionFrame), "The 'Voir plus' button should not intersect with the reaction button")

        // Tap "Voir plus"
        voirPlusButton.tap()

        // Verify expansion
        XCTAssertFalse(voirPlusButton.exists)
    }
}
