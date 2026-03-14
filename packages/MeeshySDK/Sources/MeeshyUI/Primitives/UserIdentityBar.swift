import SwiftUI
import MeeshySDK

public struct UserIdentityBar: View {
    public let name: String
    public var username: String? = nil
    public var avatarURL: String? = nil
    public var accentColor: String = ""
    public var timestamp: Date? = nil
    public var avatarMode: AvatarMode = .messageBubble
    public var presenceState: PresenceState = .offline
    public var moodEmoji: String? = nil
    public var onAvatarTap: (() -> Void)? = nil
    public var contextMenuItems: [AvatarContextMenuItem]? = nil

    public init(
        name: String,
        username: String? = nil,
        avatarURL: String? = nil,
        accentColor: String = "",
        timestamp: Date? = nil,
        avatarMode: AvatarMode = .messageBubble,
        presenceState: PresenceState = .offline,
        moodEmoji: String? = nil,
        onAvatarTap: (() -> Void)? = nil,
        contextMenuItems: [AvatarContextMenuItem]? = nil
    ) {
        self.name = name
        self.username = username
        self.avatarURL = avatarURL
        self.accentColor = accentColor
        self.timestamp = timestamp
        self.avatarMode = avatarMode
        self.presenceState = presenceState
        self.moodEmoji = moodEmoji
        self.onAvatarTap = onAvatarTap
        self.contextMenuItems = contextMenuItems
    }

    @ObservedObject private var theme = ThemeManager.shared

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    public var body: some View {
        HStack(spacing: 8) {
            MeeshyAvatar(
                name: name,
                mode: avatarMode,
                accentColor: accentColor.isEmpty ? DynamicColorGenerator.colorForName(name) : accentColor,
                avatarURL: avatarURL,
                moodEmoji: moodEmoji,
                presenceState: presenceState,
                enablePulse: false,
                onTap: onAvatarTap,
                onViewProfile: onAvatarTap,
                contextMenuItems: contextMenuItems
            )

            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username {
                    Text("@\(username)")
                        .font(.system(size: 11))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if let timestamp {
                Text(Self.timeFormatter.string(from: timestamp))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }
        }
    }
}
