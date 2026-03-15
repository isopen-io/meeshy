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
    public let context: AvatarContext
    public let moodEmoji: String?
    public let presenceState: PresenceState
    public let onTap: (() -> Void)?
    public let contextMenuItems: [AvatarContextMenuItem]?

    public init(
        url: String? = nil,
        accentColor: String,
        context: AvatarContext = .messageBubble,
        moodEmoji: String? = nil,
        presenceState: PresenceState = .offline,
        onTap: (() -> Void)? = nil,
        contextMenuItems: [AvatarContextMenuItem]? = nil
    ) {
        self.url = url
        self.accentColor = accentColor
        self.context = context
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
    public let tintColor: Color?

    @ObservedObject private var theme = ThemeManager.shared

    public init(
        avatar: AvatarConfig? = nil,
        name: String? = nil,
        leadingPrimary: [IdentityBarElement] = [],
        trailingPrimary: [IdentityBarElement] = [],
        leadingSecondary: [IdentityBarElement] = [],
        trailingSecondary: [IdentityBarElement] = [],
        tintColor: Color? = nil
    ) {
        // avatar or name required for identity contexts; metaRow preset has neither
        self.avatar = avatar
        self.name = name
        self.leadingPrimary = leadingPrimary
        self.trailingPrimary = trailingPrimary
        self.leadingSecondary = leadingSecondary
        self.trailingSecondary = trailingSecondary
        self.tintColor = tintColor
    }

    public var body: some View {
        HStack(spacing: 8) {
            if let avatar {
                MeeshyAvatar(
                    name: name ?? "",
                    context: avatar.context,
                    accentColor: avatar.accentColor,
                    avatarURL: avatar.url,
                    moodEmoji: avatar.moodEmoji,
                    presenceState: avatar.presenceState,
                    enablePulse: false,
                    onTap: avatar.onTap,
                    contextMenuItems: avatar.contextMenuItems
                )
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    ForEach(leadingPrimary) { element in
                        renderElement(element)
                    }
                    Spacer(minLength: 4)
                    ForEach(trailingPrimary) { element in
                        renderElement(element)
                    }
                }

                if !leadingSecondary.isEmpty || !trailingSecondary.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(leadingSecondary) { element in
                            renderElement(element)
                        }
                        Spacer(minLength: 4)
                        ForEach(trailingSecondary) { element in
                            renderElement(element)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Element Rendering

    @ViewBuilder
    private func renderElement(_ element: IdentityBarElement) -> some View {
        switch element {
        case .name:
            if let name {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }

        case .username(let value):
            Text(value)
                .font(.system(size: 11))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)

        case .roleBadge(let role):
            if role != .member {
                Label {
                    Text(role.displayName)
                        .font(.system(size: 11))
                } icon: {
                    Image(systemName: role.icon)
                        .font(.system(size: 11))
                }
                .foregroundColor(roleBadgeColor(for: role))
            }

        case .time(let value):
            Text(value)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(tintColor ?? theme.textSecondary)

        case .delivery(let status):
            deliveryView(for: status)

        case .flags(let codes, let active, let onTap):
            flagsView(codes: codes, active: active, onTap: onTap)

        case .translateButton(let action):
            Image(systemName: "translate")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(Color(hex: "4ECDC4"))
                .onTapGesture { action() }
                .accessibilityLabel("Traduction disponible")

        case .presence(let state):
            if state != .offline {
                HStack(spacing: 4) {
                    Circle()
                        .fill(state == .online ? Color(hex: "2ECC71") : Color(hex: "F39C12"))
                        .frame(width: 6, height: 6)
                    Text(state == .online ? "En ligne" : "Absent")
                        .font(.system(size: 11))
                        .foregroundColor(state == .online ? Color(hex: "2ECC71") : Color(hex: "F39C12"))
                }
            }

        case .memberSince(let value):
            Text(value)
                .font(.system(size: 11))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)

        case .actionButton(let label, let action):
            Button(action: action) {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo500)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(MeeshyColors.indigo500.opacity(0.15))
                    )
            }
            .buttonStyle(.plain)

        case .actionMenu(let label, let items):
            Menu {
                ForEach(items) { item in
                    Button(role: item.role) {
                        item.action()
                    } label: {
                        if let icon = item.icon {
                            Label(item.label, systemImage: icon)
                        } else {
                            Text(item.label)
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(label)
                        .font(.system(size: 12, weight: .medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo500)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(MeeshyColors.indigo500.opacity(0.15))
                )
            }

        case .text(let value):
            Text(value)
                .font(.system(size: 11))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
        }
    }

    // MARK: - Role Badge Color

    private func roleBadgeColor(for role: MemberRole) -> Color {
        switch role {
        case .creator: return MeeshyColors.warning
        case .admin: return MeeshyColors.indigo500
        case .moderator: return MeeshyColors.indigo400
        case .member: return .clear
        }
    }

    // MARK: - Delivery View

    @ViewBuilder
    private func deliveryView(for status: MeeshyMessage.DeliveryStatus) -> some View {
        let secondaryColor = tintColor ?? theme.textSecondary
        switch status {
        case .sending:
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundColor(secondaryColor)
        case .sent:
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(secondaryColor)
        case .delivered:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .semibold))
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .semibold))
                    .offset(x: 4)
            }
            .foregroundColor(secondaryColor)
            .frame(width: 16)
        case .read:
            ZStack(alignment: .leading) {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .semibold))
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .semibold))
                    .offset(x: 4)
            }
            .foregroundColor(tintColor != nil ? tintColor! : MeeshyColors.readReceipt)
            .frame(width: 16)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 10))
                .foregroundColor(MeeshyColors.error)
        }
    }

    // MARK: - Flags View

    @ViewBuilder
    private func flagsView(codes: [String], active: String?, onTap: ((String) -> Void)?) -> some View {
        HStack(spacing: 2) {
            ForEach(codes, id: \.self) { code in
                let display = LanguageDisplay.from(code: code)
                let isActive = code == active
                VStack(spacing: 1) {
                    Text(display?.flag ?? code.uppercased())
                        .font(.system(size: isActive ? 12 : 10))
                        .scaleEffect(isActive ? 1.05 : 1.0)
                        .animation(.easeInOut(duration: 0.2), value: isActive)

                    if isActive {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                            .frame(width: 10, height: 1.5)
                    }
                }
                .onTapGesture {
                    onTap?(code)
                }
            }
        }
    }
}

// MARK: - Factory Presets

extension UserIdentityBar {

    public static func messageBubble(
        name: String,
        username: String?,
        avatarURL: String?,
        accentColor: String,
        role: MemberRole?,
        time: String,
        delivery: MeeshyMessage.DeliveryStatus?,
        flags: [String],
        activeFlag: String?,
        onFlagTap: ((String) -> Void)?,
        onTranslateTap: (() -> Void)?,
        presenceState: PresenceState = .offline,
        moodEmoji: String? = nil,
        onAvatarTap: (() -> Void)?
    ) -> UserIdentityBar {
        var leading1: [IdentityBarElement] = [.name]
        if let role, role != .member {
            leading1.append(.roleBadge(role))
        }
        if !flags.isEmpty || onTranslateTap != nil {
            leading1.append(.text("·"))
        }
        if !flags.isEmpty {
            leading1.append(.flags(flags, active: activeFlag, onTap: onFlagTap))
        }
        if let onTranslateTap {
            leading1.append(.translateButton(action: onTranslateTap))
        }

        var trailing1: [IdentityBarElement] = [.time(time)]
        if let delivery {
            trailing1.append(.delivery(delivery))
        }

        var leading2: [IdentityBarElement] = []
        if let username {
            leading2.append(.username(username))
        }

        let trailing2: [IdentityBarElement] = []

        var contextMenuItems: [AvatarContextMenuItem]?
        if let onAvatarTap {
            contextMenuItems = [
                AvatarContextMenuItem(label: "Voir le profil", icon: "person.circle", action: onAvatarTap)
            ]
        }

        let avatarConfig = AvatarConfig(
            url: avatarURL,
            accentColor: accentColor,
            context: .messageBubble,
            moodEmoji: moodEmoji,
            presenceState: presenceState,
            contextMenuItems: contextMenuItems
        )

        return UserIdentityBar(
            avatar: avatarConfig,
            name: name,
            leadingPrimary: leading1,
            trailingPrimary: trailing1,
            leadingSecondary: leading2,
            trailingSecondary: trailing2
        )
    }

    public static func comment(
        name: String,
        username: String?,
        avatarURL: String?,
        accentColor: String,
        role: MemberRole?,
        time: String,
        flags: [String],
        activeFlag: String?,
        onFlagTap: ((String) -> Void)?,
        onTranslateTap: (() -> Void)?,
        onAvatarTap: (() -> Void)?
    ) -> UserIdentityBar {
        var leading1: [IdentityBarElement] = [.name]
        if let role, role != .member {
            leading1.append(.roleBadge(role))
        }

        let trailing1: [IdentityBarElement] = [.time(time)]

        var leading2: [IdentityBarElement] = []
        if let username {
            leading2.append(.username(username))
        }

        var trailing2: [IdentityBarElement] = []
        if !flags.isEmpty {
            trailing2.append(.flags(flags, active: activeFlag, onTap: onFlagTap))
        }
        if let onTranslateTap {
            trailing2.append(.translateButton(action: onTranslateTap))
        }

        var contextMenuItems: [AvatarContextMenuItem]?
        if let onAvatarTap {
            contextMenuItems = [
                AvatarContextMenuItem(label: "Voir le profil", icon: "person.circle", action: onAvatarTap)
            ]
        }

        let avatarConfig = AvatarConfig(
            url: avatarURL,
            accentColor: accentColor,
            context: .postComment,
            presenceState: .offline,
            contextMenuItems: contextMenuItems
        )

        return UserIdentityBar(
            avatar: avatarConfig,
            name: name,
            leadingPrimary: leading1,
            trailingPrimary: trailing1,
            leadingSecondary: leading2,
            trailingSecondary: trailing2
        )
    }

    public static func listing(
        name: String,
        username: String?,
        avatarURL: String?,
        accentColor: String,
        role: MemberRole?,
        actionLabel: String?,
        onAction: (() -> Void)?,
        statusText: String?,
        onAvatarTap: (() -> Void)?
    ) -> UserIdentityBar {
        var leading1: [IdentityBarElement] = [.name]
        if let role, role != .member {
            leading1.append(.roleBadge(role))
        }

        var trailing1: [IdentityBarElement] = []
        if let actionLabel, let onAction {
            trailing1.append(.actionButton(actionLabel, action: onAction))
        }

        var leading2: [IdentityBarElement] = []
        if let username {
            leading2.append(.username(username))
        }

        var trailing2: [IdentityBarElement] = []
        if let statusText {
            trailing2.append(.text(statusText))
        }

        var contextMenuItems: [AvatarContextMenuItem]?
        if let onAvatarTap {
            contextMenuItems = [
                AvatarContextMenuItem(label: "Voir le profil", icon: "person.circle", action: onAvatarTap)
            ]
        }

        let avatarConfig = AvatarConfig(
            url: avatarURL,
            accentColor: accentColor,
            context: .userListItem,
            presenceState: .offline,
            contextMenuItems: contextMenuItems
        )

        return UserIdentityBar(
            avatar: avatarConfig,
            name: name,
            leadingPrimary: leading1,
            trailingPrimary: trailing1,
            leadingSecondary: leading2,
            trailingSecondary: trailing2
        )
    }

    public static func metaRow(
        time: String,
        delivery: MeeshyMessage.DeliveryStatus?,
        flags: [String],
        activeFlag: String?,
        onFlagTap: ((String) -> Void)?,
        onTranslateTap: (() -> Void)?,
        isMe: Bool = false
    ) -> UserIdentityBar {
        var leading1: [IdentityBarElement] = []
        if !flags.isEmpty {
            leading1.append(.flags(flags, active: activeFlag, onTap: onFlagTap))
        }
        if let onTranslateTap {
            leading1.append(.translateButton(action: onTranslateTap))
        }

        var trailing1: [IdentityBarElement] = [.time(time)]
        if let delivery {
            trailing1.append(.delivery(delivery))
        }

        return UserIdentityBar(
            leadingPrimary: leading1,
            trailingPrimary: trailing1,
            tintColor: isMe ? .white.opacity(0.7) : nil
        )
    }
}
