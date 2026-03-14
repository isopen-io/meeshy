import XCTest
@testable import MeeshyUI

final class AvatarContextTests: XCTestCase {

    // MARK: - Size

    func test_size_storyTray_returns44() {
        XCTAssertEqual(AvatarContext.storyTray.size, 44)
    }

    func test_size_storyViewer_returns44() {
        XCTAssertEqual(AvatarContext.storyViewer.size, 44)
    }

    func test_size_feedComposer_returns36() {
        XCTAssertEqual(AvatarContext.feedComposer.size, 36)
    }

    func test_size_postAuthor_returns44() {
        XCTAssertEqual(AvatarContext.postAuthor.size, 44)
    }

    func test_size_postComment_returns28() {
        XCTAssertEqual(AvatarContext.postComment.size, 28)
    }

    func test_size_postReaction_returns20() {
        XCTAssertEqual(AvatarContext.postReaction.size, 20)
    }

    func test_size_messageBubble_returns32() {
        XCTAssertEqual(AvatarContext.messageBubble.size, 32)
    }

    func test_size_typingIndicator_returns24() {
        XCTAssertEqual(AvatarContext.typingIndicator.size, 24)
    }

    func test_size_conversationList_returns52() {
        XCTAssertEqual(AvatarContext.conversationList.size, 52)
    }

    func test_size_conversationHeaderCollapsed_returns44() {
        XCTAssertEqual(AvatarContext.conversationHeaderCollapsed.size, 44)
    }

    func test_size_conversationHeaderExpanded_returns44() {
        XCTAssertEqual(AvatarContext.conversationHeaderExpanded.size, 44)
    }

    func test_size_conversationHeaderStacked_returns28() {
        XCTAssertEqual(AvatarContext.conversationHeaderStacked.size, 28)
    }

    func test_size_recentParticipant_returns20() {
        XCTAssertEqual(AvatarContext.recentParticipant.size, 20)
    }

    func test_size_profileBanner_returns90() {
        XCTAssertEqual(AvatarContext.profileBanner.size, 90)
    }

    func test_size_profileEdit_returns80() {
        XCTAssertEqual(AvatarContext.profileEdit.size, 80)
    }

    func test_size_profileSheet_returns80() {
        XCTAssertEqual(AvatarContext.profileSheet.size, 80)
    }

    func test_size_userListItem_returns44() {
        XCTAssertEqual(AvatarContext.userListItem.size, 44)
    }

    func test_size_notification_returns44() {
        XCTAssertEqual(AvatarContext.notification.size, 44)
    }

    func test_size_custom_returnsProvidedValue() {
        XCTAssertEqual(AvatarContext.custom(100).size, 100)
        XCTAssertEqual(AvatarContext.custom(15).size, 15)
    }

    // MARK: - showsStoryRing

    func test_showsStoryRing_trueForStoryTray() {
        XCTAssertTrue(AvatarContext.storyTray.showsStoryRing)
    }

    func test_showsStoryRing_trueForConversationList() {
        XCTAssertTrue(AvatarContext.conversationList.showsStoryRing)
    }

    func test_showsStoryRing_trueForMessageBubble() {
        XCTAssertTrue(AvatarContext.messageBubble.showsStoryRing)
    }

    func test_showsStoryRing_trueForRecentParticipant() {
        XCTAssertTrue(AvatarContext.recentParticipant.showsStoryRing)
    }

    func test_showsStoryRing_trueForCustom() {
        XCTAssertTrue(AvatarContext.custom(50).showsStoryRing)
    }

    func test_showsStoryRing_falseForStoryViewer() {
        XCTAssertFalse(AvatarContext.storyViewer.showsStoryRing)
    }

    func test_showsStoryRing_falseForPostComment() {
        XCTAssertFalse(AvatarContext.postComment.showsStoryRing)
    }

    func test_showsStoryRing_falseForPostReaction() {
        XCTAssertFalse(AvatarContext.postReaction.showsStoryRing)
    }

    func test_showsStoryRing_falseForTypingIndicator() {
        XCTAssertFalse(AvatarContext.typingIndicator.showsStoryRing)
    }

    func test_showsStoryRing_falseForProfileEdit() {
        XCTAssertFalse(AvatarContext.profileEdit.showsStoryRing)
    }

    // MARK: - showsMoodBadge

    func test_showsMoodBadge_trueForMessageBubble() {
        XCTAssertTrue(AvatarContext.messageBubble.showsMoodBadge)
    }

    func test_showsMoodBadge_trueForProfileBanner() {
        XCTAssertTrue(AvatarContext.profileBanner.showsMoodBadge)
    }

    func test_showsMoodBadge_trueForRecentParticipant() {
        XCTAssertTrue(AvatarContext.recentParticipant.showsMoodBadge)
    }

    func test_showsMoodBadge_falseForPostComment() {
        XCTAssertFalse(AvatarContext.postComment.showsMoodBadge)
    }

    func test_showsMoodBadge_falseForUserListItem() {
        XCTAssertFalse(AvatarContext.userListItem.showsMoodBadge)
    }

    func test_showsMoodBadge_falseForNotification() {
        XCTAssertFalse(AvatarContext.notification.showsMoodBadge)
    }

    // MARK: - showsOnlineDot

    func test_showsOnlineDot_trueForConversationList() {
        XCTAssertTrue(AvatarContext.conversationList.showsOnlineDot)
    }

    func test_showsOnlineDot_trueForUserListItem() {
        XCTAssertTrue(AvatarContext.userListItem.showsOnlineDot)
    }

    func test_showsOnlineDot_trueForRecentParticipant() {
        XCTAssertTrue(AvatarContext.recentParticipant.showsOnlineDot)
    }

    func test_showsOnlineDot_falseForNotification() {
        XCTAssertFalse(AvatarContext.notification.showsOnlineDot)
    }

    func test_showsOnlineDot_falseForStoryViewer() {
        XCTAssertFalse(AvatarContext.storyViewer.showsOnlineDot)
    }

    // MARK: - isTappable

    func test_isTappable_falseForPostReaction() {
        XCTAssertFalse(AvatarContext.postReaction.isTappable)
    }

    func test_isTappable_falseForTypingIndicator() {
        XCTAssertFalse(AvatarContext.typingIndicator.isTappable)
    }

    func test_isTappable_trueForConversationList() {
        XCTAssertTrue(AvatarContext.conversationList.isTappable)
    }

    // MARK: - defaultPulse

    func test_defaultPulse_trueForMessageBubble() {
        XCTAssertTrue(AvatarContext.messageBubble.defaultPulse)
    }

    func test_defaultPulse_trueForProfileBanner() {
        XCTAssertTrue(AvatarContext.profileBanner.defaultPulse)
    }

    func test_defaultPulse_falseForConversationList() {
        XCTAssertFalse(AvatarContext.conversationList.defaultPulse)
    }

    func test_defaultPulse_falseForStoryTray() {
        XCTAssertFalse(AvatarContext.storyTray.defaultPulse)
    }

    // MARK: - shadowRadius

    func test_shadowRadius_zeroForPostReaction() {
        XCTAssertEqual(AvatarContext.postReaction.shadowRadius, 0)
    }

    func test_shadowRadius_fourForMessageBubble() {
        XCTAssertEqual(AvatarContext.messageBubble.shadowRadius, 4)
    }

    func test_shadowRadius_eightForConversationList() {
        XCTAssertEqual(AvatarContext.conversationList.shadowRadius, 8)
    }

    func test_shadowRadius_twelveForProfileBanner() {
        XCTAssertEqual(AvatarContext.profileBanner.shadowRadius, 12)
    }

    // MARK: - Derived Metrics (storyTray)

    func test_ringSize_storyTray_isSizePlus6() {
        XCTAssertEqual(AvatarContext.storyTray.ringSize, 50) // 44 + 6
    }

    func test_initialFont_storyTray_isSizeTimes038() {
        XCTAssertEqual(AvatarContext.storyTray.initialFont, 44 * 0.38, accuracy: 0.01)
    }

    func test_ringWidth_storyTray_is07() {
        XCTAssertEqual(AvatarContext.storyTray.ringWidth, 0.7)
    }

    func test_ringWidth_nonStoryTray_useSizeThreshold() {
        XCTAssertEqual(AvatarContext.messageBubble.ringWidth, 1.5) // 32 <= 32
        XCTAssertEqual(AvatarContext.conversationList.ringWidth, 2.5) // 52 > 32
    }

    func test_badgeSize_storyTray() {
        XCTAssertEqual(AvatarContext.storyTray.badgeSize, 44 * 0.42, accuracy: 0.01)
    }

    func test_onlineDotSize_storyTray() {
        XCTAssertEqual(AvatarContext.storyTray.onlineDotSize, 44 * 0.26, accuracy: 0.01)
    }
}
