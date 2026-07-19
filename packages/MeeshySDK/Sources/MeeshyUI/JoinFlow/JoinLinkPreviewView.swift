import SwiftUI
import Combine
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
    private var accent: Color { MeeshyColors.indigo400 }

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
                    MeeshyColors.indigo500.opacity(0.4),
                    MeeshyColors.indigo400.opacity(0.3),
                    theme.backgroundPrimary
                ],
                startPoint: .topLeading,
                endPoint: .bottom
            )
            .frame(height: 160)

            HStack(alignment: .bottom, spacing: MeeshySpacing.md) {
                conversationAvatar

                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(linkInfo.conversation.title ?? String(localized: "joinFlow.preview.defaultTitle", defaultValue: "Conversation", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(2)

                    HStack(spacing: MeeshySpacing.xs + 2) {
                        Image(systemName: conversationTypeIcon)
                            .font(MeeshyFont.relative(11, weight: .semibold))
                            .foregroundColor(accent)
                        Text(conversationTypeLabel)
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.bottom, MeeshySpacing.lg)
        }
    }

    private var conversationAvatar: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 60, height: 60)

            Text(avatarInitials)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: MeeshyShadow.medium.radius, x: 0, y: 4)
    }

    // MARK: - Details

    private var conversationDetails: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            if let name = linkInfo.name, !name.isEmpty {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "link")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(accent)
                    Text(name)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
            }

            if let desc = linkInfo.description, !desc.isEmpty {
                Text(desc)
                    .font(MeeshyFont.relative(14))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(4)
            }

            HStack(spacing: MeeshySpacing.xs + 2) {
                Image(systemName: "person.fill")
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
                Text("Invite par \(linkInfo.creator.name)")
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }

            if let expiresAt = linkInfo.expiresAt {
                HStack(spacing: MeeshySpacing.xs + 2) {
                    Image(systemName: "clock")
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(MeeshyColors.warning)
                    Text("Expire \(relativeDate(expiresAt))")
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(MeeshyColors.warning)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
    }

    // MARK: - Stats

    private var statsSection: some View {
        HStack(spacing: 0) {
            statItem(
                icon: "person.2.fill",
                value: "\(linkInfo.stats.totalParticipants)",
                label: String(localized: "joinFlow.preview.participants", defaultValue: "Participants", bundle: .module)
            )

            Divider()
                .frame(height: 30)
                .background(theme.textMuted.opacity(0.2))

            statItem(
                icon: "globe",
                value: "\(linkInfo.stats.languageCount)",
                label: linkInfo.stats.languageCount == 1 ? String(localized: "joinFlow.preview.languageSingular", defaultValue: "Langue", bundle: .module) : String(localized: "joinFlow.preview.languagePlural", defaultValue: "Langues", bundle: .module)
            )

            Divider()
                .frame(height: 30)
                .background(theme.textMuted.opacity(0.2))

            statItem(
                icon: "person.fill.checkmark",
                value: "\(linkInfo.stats.memberCount)",
                label: String(localized: "joinFlow.preview.members", defaultValue: "Membres", bundle: .module)
            )
        }
        .padding(.vertical, MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.xl)
    }

    private func statItem(icon: String, value: String, label: String) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(accent)
                Text(value)
                    .font(MeeshyFont.relative(18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            Text(label)
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Requirements

    private var requirementsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if linkInfo.requireAccount || linkInfo.requireNickname || linkInfo.requireEmail || linkInfo.requireBirthday {
                Text(String(localized: "joinFlow.preview.requiredInfo", defaultValue: "Informations requises", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .padding(.bottom, MeeshySpacing.xs)

                if linkInfo.requireAccount {
                    requirementBadge(icon: "person.crop.circle", text: String(localized: "joinFlow.preview.accountRequired", defaultValue: "Compte requis", bundle: .module), color: "FF6B6B")
                }
                if linkInfo.requireNickname {
                    requirementBadge(icon: "at", text: String(localized: "joinFlow.preview.usernameRequired", defaultValue: "Nom d'utilisateur", bundle: .module), color: "F8B500")
                }
                if linkInfo.requireEmail {
                    requirementBadge(icon: "envelope.fill", text: String(localized: "joinFlow.preview.emailRequired", defaultValue: "Adresse email", bundle: .module), color: "3498DB")
                }
                if linkInfo.requireBirthday {
                    requirementBadge(icon: "gift.fill", text: String(localized: "joinFlow.preview.birthdayRequired", defaultValue: "Date de naissance", bundle: .module), color: "9B59B6")
                }
            }

            if !linkInfo.allowedLanguages.isEmpty {
                HStack(spacing: MeeshySpacing.xs + 2) {
                    Image(systemName: "globe")
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)
                    Text("Langues: \(linkInfo.allowedLanguages.joined(separator: ", "))")
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.xl)
    }

    private func requirementBadge(icon: String, text: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(text)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(Color(hex: color).opacity(isDark ? 0.12 : 0.08))
        )
    }

    // MARK: - Join Button

    private var joinButton: some View {
        VStack(spacing: MeeshySpacing.md) {
            if linkInfo.requireAccount {
                Text(String(localized: "joinFlow.preview.accountRequiredMessage", defaultValue: "Un compte Meeshy est requis pour rejoindre cette conversation", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xl)
            } else {
                Button(action: onJoin) {
                    HStack(spacing: MeeshySpacing.sm + 2) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(MeeshyFont.relative(18))
                        Text(String(localized: "joinFlow.preview.joinButton", defaultValue: "Rejoindre la conversation", bundle: .module))
                            .font(MeeshyFont.relative(16, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.lg)
                    .background(MeeshyColors.brandGradient)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                    .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: MeeshyShadow.strong.radius, x: 0, y: 6)
                }
                .padding(.horizontal, MeeshySpacing.xl)
            }

            if let maxUses = linkInfo.maxUses {
                Text("\(linkInfo.currentUses)/\(maxUses) utilisations")
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.top, MeeshySpacing.xxl + MeeshySpacing.xs)
        .padding(.bottom, MeeshySpacing.xxxl)
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
        case "direct": return String(localized: "joinFlow.preview.typeDirect", defaultValue: "Conversation privee", bundle: .module)
        case "group": return String(localized: "joinFlow.preview.typeGroup", defaultValue: "Groupe", bundle: .module)
        case "public": return String(localized: "joinFlow.preview.typePublic", defaultValue: "Public", bundle: .module)
        case "global": return String(localized: "joinFlow.preview.typeGlobal", defaultValue: "Global", bundle: .module)
        case "community": return String(localized: "joinFlow.preview.typeCommunity", defaultValue: "Communaute", bundle: .module)
        case "channel": return String(localized: "joinFlow.preview.typeChannel", defaultValue: "Canal", bundle: .module)
        default: return linkInfo.conversation.type.capitalized
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let interval = date.timeIntervalSince(Date())
        if interval <= 0 { return String(localized: "joinFlow.preview.expired", defaultValue: "expire", bundle: .module) }
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
