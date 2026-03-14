import SwiftUI
import MeeshySDK

// MARK: - IdentityBarElement

public enum IdentityBarElement: Identifiable {
    case name
    case username(String)
    case roleBadge(MemberRole)
    case time(String)
    case delivery(MeeshyMessage.DeliveryStatus)
    case flags([String], active: String?, onTap: ((String) -> Void)?)
    case translateButton(action: () -> Void)
    case presence(PresenceState)
    case memberSince(String)
    case actionButton(String, action: () -> Void)
    case actionMenu(String, items: [ActionMenuItem])
    case text(String)

    public var id: String {
        switch self {
        case .name: return "name"
        case .username(let value): return "username:\(value)"
        case .roleBadge(let role): return "role:\(role.rawValue)"
        case .time(let value): return "time:\(value)"
        case .delivery(let status): return "delivery:\(status.rawValue)"
        case .flags(let codes, _, _): return "flags:\(codes.joined(separator: ","))"
        case .translateButton: return "translate"
        case .presence(let state): return "presence:\(String(describing: state))"
        case .memberSince(let value): return "memberSince:\(value)"
        case .actionButton(let label, _): return "action:\(label)"
        case .actionMenu(let label, _): return "menu:\(label)"
        case .text(let value): return "text:\(value)"
        }
    }
}

// MARK: - ActionMenuItem

public struct ActionMenuItem: Identifiable {
    public let id = UUID()
    public let label: String
    public let icon: String?
    public let role: ButtonRole?
    public let action: () -> Void

    public init(label: String, icon: String? = nil, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.label = label
        self.icon = icon
        self.role = role
        self.action = action
    }
}

// MARK: - AvatarConfig

public struct AvatarConfig {
    public let url: String?
    public let accentColor: String
    public let mode: AvatarMode
    public let moodEmoji: String?
    public let presenceState: PresenceState
    public let onTap: (() -> Void)?
    public let contextMenuItems: [AvatarContextMenuItem]?

    public init(
        url: String? = nil,
        accentColor: String,
        mode: AvatarMode = .messageBubble,
        moodEmoji: String? = nil,
        presenceState: PresenceState = .offline,
        onTap: (() -> Void)? = nil,
        contextMenuItems: [AvatarContextMenuItem]? = nil
    ) {
        self.url = url
        self.accentColor = accentColor
        self.mode = mode
        self.moodEmoji = moodEmoji
        self.presenceState = presenceState
        self.onTap = onTap
        self.contextMenuItems = contextMenuItems
    }
}

// MARK: - UserIdentityBar

public struct UserIdentityBar: View {
    public let avatar: AvatarConfig?
    public let name: String?
    public let leadingPrimary: [IdentityBarElement]
    public let trailingPrimary: [IdentityBarElement]
    public let leadingSecondary: [IdentityBarElement]
    public let trailingSecondary: [IdentityBarElement]

    @ObservedObject private var theme = ThemeManager.shared

    public init(
        avatar: AvatarConfig? = nil,
        name: String? = nil,
        leadingPrimary: [IdentityBarElement] = [],
        trailingPrimary: [IdentityBarElement] = [],
        leadingSecondary: [IdentityBarElement] = [],
        trailingSecondary: [IdentityBarElement] = []
    ) {
        assert(avatar != nil || name != nil, "UserIdentityBar requires at least avatar or name")
        self.avatar = avatar
        self.name = name
        self.leadingPrimary = leadingPrimary
        self.trailingPrimary = trailingPrimary
        self.leadingSecondary = leadingSecondary
        self.trailingSecondary = trailingSecondary
    }

    public var body: some View {
        EmptyView()
    }
}
