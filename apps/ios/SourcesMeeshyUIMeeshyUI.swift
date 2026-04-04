import SwiftUI
import MeeshySDK

/// MeeshyUI - UI components for Meeshy platform
///
/// This module provides reusable SwiftUI components that implement the Meeshy design system
/// and can be used in any application that integrates with the Meeshy platform.

// MARK: - Avatar Views

public struct MeeshyAvatarView: View {
    let url: String?
    let name: String
    let size: CGFloat
    
    public init(url: String?, name: String, size: CGFloat = 40) {
        self.url = url
        self.name = name
        self.size = size
    }
    
    public var body: some View {
        ZStack {
            Circle()
                .fill(Color.blue.gradient)
            
            if let url = url {
                AsyncImage(url: URL(string: url)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Text(initials)
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(.white)
                }
            } else {
                Text(initials)
                    .font(.system(size: size * 0.4, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
    
    private var initials: String {
        let components = name.split(separator: " ")
        if components.count >= 2 {
            return String(components[0].prefix(1) + components[1].prefix(1)).uppercased()
        } else {
            return String(name.prefix(2)).uppercased()
        }
    }
}

// MARK: - Conversation List Components

public struct MeeshyConversationRow: View {
    let conversation: MeeshyConversation
    let onTap: () -> Void
    
    public init(conversation: MeeshyConversation, onTap: @escaping () -> Void) {
        self.conversation = conversation
        self.onTap = onTap
    }
    
    public var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                MeeshyAvatarView(
                    url: nil,
                    name: conversation.title,
                    size: 56
                )
                
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(conversation.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        
                        Spacer()
                        
                        if let lastMessageAt = conversation.lastMessageAt {
                            Text(lastMessageAt, style: .relative)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    
                    HStack {
                        if let preview = conversation.lastMessagePreview {
                            Text(preview)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        
                        Spacer()
                        
                        if conversation.unreadCount > 0 {
                            Text("\(conversation.unreadCount)")
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.blue, in: Capsule())
                        }
                    }
                    
                    if !conversation.tags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) {
                                ForEach(conversation.tags) { tag in
                                    MeeshyTagView(tag: tag)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }
}

public struct MeeshyTagView: View {
    let tag: MeeshyConversationTag
    
    public init(tag: MeeshyConversationTag) {
        self.tag = tag
    }
    
    public var body: some View {
        Text(tag.name)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.2), in: Capsule())
            .foregroundStyle(color)
    }
    
    private var color: Color {
        Color(hex: tag.color) ?? .blue
    }
}

// MARK: - Message Components

public struct MeeshyMessageBubble: View {
    let message: MeeshyMessage
    let isFromCurrentUser: Bool
    
    public init(message: MeeshyMessage, isFromCurrentUser: Bool) {
        self.message = message
        self.isFromCurrentUser = isFromCurrentUser
    }
    
    public var body: some View {
        HStack {
            if isFromCurrentUser {
                Spacer()
            }
            
            VStack(alignment: isFromCurrentUser ? .trailing : .leading, spacing: 4) {
                if !isFromCurrentUser, let senderName = message.senderName {
                    Text(senderName)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
                
                if let content = message.content {
                    Text(content)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            isFromCurrentUser ? Color.blue : Color(.systemGray5),
                            in: RoundedRectangle(cornerRadius: 16)
                        )
                        .foregroundStyle(isFromCurrentUser ? .white : .primary)
                }
                
                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            
            if !isFromCurrentUser {
                Spacer()
            }
        }
    }
}

// MARK: - Theme Components

public struct MeeshyThemeIcon: View {
    let theme: ConversationTheme
    let size: CGFloat
    
    public init(theme: ConversationTheme, size: CGFloat = 20) {
        self.theme = theme
        self.size = size
    }
    
    public var body: some View {
        Image(systemName: iconName)
            .font(.system(size: size))
            .foregroundStyle(themeColor)
    }
    
    private var iconName: String {
        switch theme {
        case .general: return "bubble.left.and.bubble.right"
        case .social: return "person.2"
        case .work: return "briefcase"
        case .tech: return "laptopcomputer"
        case .gaming: return "gamecontroller"
        case .music: return "music.note"
        case .food: return "fork.knife"
        case .travel: return "airplane"
        case .sports: return "sportscourt"
        case .education: return "book"
        }
    }
    
    private var themeColor: Color {
        switch theme {
        case .general: return .gray
        case .social: return .purple
        case .work: return .blue
        case .tech: return .cyan
        case .gaming: return .orange
        case .music: return .pink
        case .food: return .green
        case .travel: return .teal
        case .sports: return .red
        case .education: return .indigo
        }
    }
}

// MARK: - Utilities

extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            return nil
        }
        
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

public enum MeeshyUI {
    /// UI module version
    public static let version = "1.0.0"
    
    /// UI module name
    public static let name = "MeeshyUI"
}
