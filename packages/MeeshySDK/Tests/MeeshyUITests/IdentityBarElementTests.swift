import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class IdentityBarElementTests: XCTestCase {

    func test_element_name_hasStableId() {
        let a = IdentityBarElement.name
        let b = IdentityBarElement.name
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "name")
    }

    func test_element_username_hasStableId() {
        let a = IdentityBarElement.username("alice")
        let b = IdentityBarElement.username("alice")
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "username:alice")

        let c = IdentityBarElement.username("bob")
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_time_hasStableId() {
        let a = IdentityBarElement.time("14:30")
        let b = IdentityBarElement.time("14:30")
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "time:14:30")

        let c = IdentityBarElement.time("09:15")
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_roleBadge_hasStableId() {
        let a = IdentityBarElement.roleBadge(.admin)
        let b = IdentityBarElement.roleBadge(.admin)
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "role:admin")

        let c = IdentityBarElement.roleBadge(.moderator)
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_delivery_hasStableId() {
        let a = IdentityBarElement.delivery(.sent)
        let b = IdentityBarElement.delivery(.sent)
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "delivery:sent")

        let c = IdentityBarElement.delivery(.read)
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_element_text_hasStableId() {
        let a = IdentityBarElement.text("Hello")
        let b = IdentityBarElement.text("Hello")
        XCTAssertEqual(a.id, b.id)
        XCTAssertEqual(a.id, "text:Hello")

        let c = IdentityBarElement.text("World")
        XCTAssertNotEqual(a.id, c.id)
    }

    func test_avatarConfig_initDefaults() {
        let config = AvatarConfig(accentColor: "#6366F1")
        XCTAssertNil(config.url)
        XCTAssertEqual(config.accentColor, "#6366F1")
        XCTAssertNil(config.moodEmoji)
        XCTAssertEqual(config.presenceState, .offline)
        XCTAssertNil(config.onTap)
        XCTAssertNil(config.contextMenuItems)
    }
}

// MARK: - UserIdentityBar Layout Tests

final class UserIdentityBarLayoutTests: XCTestCase {

    func test_barWithNameOnly_doesNotCrash() {
        let bar = UserIdentityBar(name: "Alice", leadingPrimary: [.name])
        XCTAssertNotNil(bar.body)
    }

    func test_barWithAvatarOnly_doesNotCrash() {
        let bar = UserIdentityBar(avatar: AvatarConfig(accentColor: "FF0000"))
        XCTAssertNotNil(bar.body)
    }

    func test_barWithAllZones_doesNotCrash() {
        let bar = UserIdentityBar(
            avatar: AvatarConfig(accentColor: "6366F1"),
            name: "Alice",
            leadingPrimary: [.name, .roleBadge(.admin)],
            trailingPrimary: [.time("19:47"), .delivery(.read)],
            leadingSecondary: [.username("@alice")],
            trailingSecondary: [.text("info")]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithEmptySecondaryZones_hidesSecondLine() {
        let bar = UserIdentityBar(name: "Alice", leadingPrimary: [.name], trailingPrimary: [.time("19:47")])
        XCTAssertTrue(bar.leadingSecondary.isEmpty)
        XCTAssertTrue(bar.trailingSecondary.isEmpty)
    }

    func test_barWithAllDeliveryStatuses_doesNotCrash() {
        let statuses: [MeeshyMessage.DeliveryStatus] = [.sending, .sent, .delivered, .read, .failed]
        for status in statuses {
            let bar = UserIdentityBar(name: "Bob", leadingPrimary: [.delivery(status)])
            XCTAssertNotNil(bar.body)
        }
    }

    func test_barWithPresenceStates_doesNotCrash() {
        let states: [PresenceState] = [.online, .away, .offline]
        for state in states {
            let bar = UserIdentityBar(name: "Eve", leadingSecondary: [.presence(state)])
            XCTAssertNotNil(bar.body)
        }
    }

    func test_barWithFlags_doesNotCrash() {
        let bar = UserIdentityBar(
            name: "Alice",
            leadingPrimary: [.flags(["fr", "en", "es"], active: "fr", onTap: nil)]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithTranslateButton_doesNotCrash() {
        let bar = UserIdentityBar(
            name: "Alice",
            trailingPrimary: [.translateButton(action: {})]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithActionButton_doesNotCrash() {
        let bar = UserIdentityBar(
            name: "Alice",
            trailingSecondary: [.actionButton("Follow", action: {})]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithActionMenu_doesNotCrash() {
        let items = [
            ActionMenuItem(label: "Edit", icon: "pencil", action: {}),
            ActionMenuItem(label: "Delete", icon: "trash", role: .destructive, action: {})
        ]
        let bar = UserIdentityBar(
            name: "Alice",
            trailingSecondary: [.actionMenu("Options", items: items)]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithMemberRole_doesNotCrash() {
        let bar = UserIdentityBar(
            name: "Alice",
            leadingPrimary: [.name, .roleBadge(.member)]
        )
        XCTAssertNotNil(bar.body)
    }

    func test_barWithMemberSince_doesNotCrash() {
        let bar = UserIdentityBar(
            name: "Alice",
            leadingSecondary: [.memberSince("Mars 2026")]
        )
        XCTAssertNotNil(bar.body)
    }
}

// MARK: - UserIdentityBar Preset Tests

final class UserIdentityBarPresetTests: XCTestCase {

    func test_messageBubblePreset_populatesAllZones() {
        let bar = UserIdentityBar.messageBubble(
            name: "Alice", username: "@alice", avatarURL: nil, accentColor: "FF0000",
            role: .admin, time: "19:47", delivery: .read, flags: ["fr", "en"],
            activeFlag: "fr", onFlagTap: nil, onTranslateTap: nil,
            presenceState: .online, moodEmoji: nil, onAvatarTap: nil
        )
        XCTAssertNotNil(bar.avatar)
        XCTAssertEqual(bar.name, "Alice")
        XCTAssertEqual(bar.leadingPrimary.count, 2)
        XCTAssertEqual(bar.trailingPrimary.count, 2)
        XCTAssertEqual(bar.leadingSecondary.count, 1)
        XCTAssertEqual(bar.trailingSecondary.count, 1)
    }

    func test_messageBubblePreset_noRole_omitsRoleBadge() {
        let bar = UserIdentityBar.messageBubble(
            name: "Alice", username: nil, avatarURL: nil, accentColor: "FF0000",
            role: nil, time: "19:47", delivery: nil, flags: [],
            activeFlag: nil, onFlagTap: nil, onTranslateTap: nil,
            presenceState: .offline, moodEmoji: nil, onAvatarTap: nil
        )
        XCTAssertEqual(bar.leadingPrimary.count, 1)
        XCTAssertEqual(bar.trailingPrimary.count, 1)
        XCTAssertTrue(bar.leadingSecondary.isEmpty)
        XCTAssertTrue(bar.trailingSecondary.isEmpty)
    }

    func test_commentPreset_populatesCorrectly() {
        let bar = UserIdentityBar.comment(
            name: "Bob", username: "@bob", avatarURL: "https://example.com/bob.jpg",
            accentColor: "00FF00", role: .moderator, time: "il y a 2h",
            flags: ["en"], activeFlag: nil, onFlagTap: nil, onTranslateTap: { },
            onAvatarTap: nil
        )
        XCTAssertNotNil(bar.avatar)
        XCTAssertEqual(bar.leadingPrimary.count, 2)
        XCTAssertEqual(bar.trailingPrimary.count, 1)
        XCTAssertEqual(bar.leadingSecondary.count, 1)
        XCTAssertEqual(bar.trailingSecondary.count, 2)
    }

    func test_listingPreset_withAction() {
        let bar = UserIdentityBar.listing(
            name: "Charlie", username: "@charlie", avatarURL: nil, accentColor: "0000FF",
            role: nil, actionLabel: "Ajouter", onAction: { }, statusText: "En ligne",
            onAvatarTap: nil
        )
        XCTAssertEqual(bar.trailingPrimary.count, 1)
        XCTAssertEqual(bar.trailingSecondary.count, 1)
    }

    func test_listingPreset_noAction_noStatus() {
        let bar = UserIdentityBar.listing(
            name: "Charlie", username: nil, avatarURL: nil, accentColor: "0000FF",
            role: nil, actionLabel: nil, onAction: nil, statusText: nil, onAvatarTap: nil
        )
        XCTAssertTrue(bar.trailingPrimary.isEmpty)
        XCTAssertTrue(bar.trailingSecondary.isEmpty)
        XCTAssertTrue(bar.leadingSecondary.isEmpty)
    }
}
