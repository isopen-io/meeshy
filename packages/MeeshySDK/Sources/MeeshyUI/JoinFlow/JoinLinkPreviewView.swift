import SwiftUI
import MeeshySDK

public struct JoinLinkPreviewView: View {
    let linkInfo: ShareLinkInfo
    let onJoin: () -> Void

    @ObservedObject private var theme = ThemeManager.shared

    public init(linkInfo: ShareLinkInfo, onJoin: @escaping () -> Void) {
        self.linkInfo = linkInfo
        self.onJoin = onJoin
    }

    private var isDark: Bool { theme.mode.isDark }
    private var accent: Color { Color(hex: "4ECDC4") }

    public var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                conversationBanner
                conversationDetails
                statsSection
                requirementsSection
                joinButton
            }
        }
    }

    // MARK: - Banner

    private var conversationBanner: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [
                    Color(hex: "B24BF3").opacity(0.4),
                    Color(hex: "4ECDC4").opacity(0.3),
                    isDark ? Color(hex: "0a0a14") : Color(hex: "FAF8F5")
                ],
                startPoint: .topLeading,
                endPoint: .bottom
            )
            .frame(height: 160)

            HStack(alignment: .bottom, spacing: 14) {
                conversationAvatar

                VStack(alignment: .leading, spacing: 4) {
                    Text(linkInfo.conversation.title ?? "Conversation")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(2)

                    HStack(spacing: 6) {
                        Image(systemName: conversationTypeIcon)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(accent)
                        Text(conversationTypeLabel)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
    }

    private var conversationAvatar: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color(hex: "B24BF3"), Color(hex: "4ECDC4")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 60, height: 60)

            Text(avatarInitials)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: Color(hex: "B24BF3").opacity(0.3), radius: 8, x: 0, y: 4)
    }

    // MARK: - Details

    private var conversationDetails: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let name = linkInfo.name, !name.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "link")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(accent)
                    Text(name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
            }

            if let desc = linkInfo.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(4)
            }

            HStack(spacing: 6) {
                Image(systemName: "person.fill")
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
                Text("Invite par \(linkInfo.creator.name)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }

            if let expiresAt = linkInfo.expiresAt {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "F8B500"))
                    Text("Expire \(relativeDate(expiresAt))")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "F8B500"))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    // MARK: - Stats

    private var statsSection: some View {
        HStack(spacing: 0) {
            statItem(
                icon: "person.2.fill",
                value: "\(linkInfo.stats.totalParticipants)",
                label: "Participants"
            )

            Divider()
                .frame(height: 30)
                .background(theme.textMuted.opacity(0.2))

            statItem(
                icon: "globe",
                value: "\(linkInfo.stats.languageCount)",
                label: linkInfo.stats.languageCount == 1 ? "Langue" : "Langues"
            )

            Divider()
                .frame(height: 30)
                .background(theme.textMuted.opacity(0.2))

            statItem(
                icon: "person.fill.checkmark",
                value: "\(linkInfo.stats.memberCount)",
                label: "Membres"
            )
        }
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private func statItem(icon: String, value: String, label: String) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(accent)
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Requirements

    private var requirementsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if linkInfo.requireAccount || linkInfo.requireNickname || linkInfo.requireEmail || linkInfo.requireBirthday {
                Text("Informations requises")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .padding(.bottom, 4)

                if linkInfo.requireAccount {
                    requirementBadge(icon: "person.crop.circle", text: "Compte requis", color: "FF6B6B")
                }
                if linkInfo.requireNickname {
                    requirementBadge(icon: "at", text: "Nom d'utilisateur", color: "F8B500")
                }
                if linkInfo.requireEmail {
                    requirementBadge(icon: "envelope.fill", text: "Adresse email", color: "3498DB")
                }
                if linkInfo.requireBirthday {
                    requirementBadge(icon: "gift.fill", text: "Date de naissance", color: "9B59B6")
                }
            }

            if !linkInfo.allowedLanguages.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "globe")
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                    Text("Langues: \(linkInfo.allowedLanguages.joined(separator: ", "))")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private func requirementBadge(icon: String, text: String, color: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(hex: color).opacity(isDark ? 0.12 : 0.08))
        )
    }

    // MARK: - Join Button

    private var joinButton: some View {
        VStack(spacing: 12) {
            if linkInfo.requireAccount {
                Text("Un compte Meeshy est requis pour rejoindre cette conversation")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            } else {
                Button(action: onJoin) {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 18))
                        Text("Rejoindre la conversation")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "B24BF3"), Color(hex: "4ECDC4")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(16)
                    .shadow(color: Color(hex: "B24BF3").opacity(0.3), radius: 12, x: 0, y: 6)
                }
                .padding(.horizontal, 20)
            }

            if let maxUses = linkInfo.maxUses {
                Text("\(linkInfo.currentUses)/\(maxUses) utilisations")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.top, 28)
        .padding(.bottom, 32)
    }

    // MARK: - Helpers

    private var avatarInitials: String {
        let title = linkInfo.conversation.title ?? ""
        let words = title.split(separator: " ")
        if words.count >= 2 {
            return String(words[0].prefix(1) + words[1].prefix(1)).uppercased()
        }
        return String(title.prefix(2)).uppercased()
    }

    private var conversationTypeIcon: String {
        switch linkInfo.conversation.type.lowercased() {
        case "direct": return "person.fill"
        case "group": return "person.3.fill"
        case "public", "global": return "globe"
        case "community": return "building.2.fill"
        case "channel": return "megaphone.fill"
        default: return "bubble.left.and.bubble.right.fill"
        }
    }

    private var conversationTypeLabel: String {
        switch linkInfo.conversation.type.lowercased() {
        case "direct": return "Conversation privee"
        case "group": return "Groupe"
        case "public": return "Public"
        case "global": return "Global"
        case "community": return "Communaute"
        case "channel": return "Canal"
        default: return linkInfo.conversation.type.capitalized
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let interval = date.timeIntervalSince(Date())
        if interval <= 0 { return "expire" }
        let hours = Int(interval / 3600)
        if hours < 1 { return "dans \(Int(interval / 60))min" }
        if hours < 24 { return "dans \(hours)h" }
        let days = hours / 24
        if days < 7 { return "dans \(days)j" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd MMM"
        return "le \(formatter.string(from: date))"
    }
}
