import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationInfoSheet.swift` (budget de taille) : la rangée d'un
// membre dans l'onglet Membres, son squelette de chargement, et les petits
// helpers (badge de rôle, date d'arrivée) qu'elle est seule à employer. Les
// résolveurs d'humeur viennent de l'environnement, relus ici.

struct ConversationInfoMemberRow: View {
    let participant: PaginatedParticipant
    let conversationId: String

    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver

    private var theme: ThemeManager { ThemeManager.shared }
    private var presenceManager: PresenceManager { PresenceManager.shared }

    var body: some View {
        let color = DynamicColorGenerator.colorForName(participant.name)
        let presence = presenceManager.resolvedState(userId: participant.userId, isOnline: participant.isOnline, lastActiveAt: participant.lastActiveAt)

        return HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: participant.name,
                context: .userListItem,
                accentColor: color,
                avatarURL: participant.avatar,
                moodEmoji: participant.userId.flatMap { moodEmojiResolver?($0) },
                presenceState: presence,
                isHere: presenceManager.here(userId: participant.viewingKey, conversationId: conversationId),
                // LE CONTOUR DU MEMBRE (#10713) — l'avatar le pose dans son empreinte (#10946).
                ring: participant.avatarRing,
                onMoodTap: participant.userId.flatMap { moodTapResolver?($0) }
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Text(participant.name)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let role = participant.conversationRole,
                       role.lowercased() != "member" {
                        Text(roleBadgeLabel(role))
                            .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.xs)
                            .padding(.vertical, 1)
                            .background(
                                Capsule().fill(roleBadgeColor(role))
                            )
                    }
                }

                if let username = participant.username {
                    Text("@\(username)")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let joinedAt = participant.joinedAt {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(String(localized: "conversation.info.member.since", defaultValue: "Depuis", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Text(shortDate(joinedAt))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private func roleBadgeLabel(_ role: String) -> String {
        switch role.lowercased() {
        case "admin", "creator": return String(localized: "conversation.role.admin", defaultValue: "Admin", bundle: .main)
        case "moderator": return String(localized: "conversation.role.moderator", defaultValue: "Modo", bundle: .main)
        default: return role.capitalized
        }
    }

    private func roleBadgeColor(_ role: String) -> Color {
        switch role.lowercased() {
        case "admin", "creator": return MeeshyColors.error
        case "moderator": return MeeshyColors.warning
        default: return MeeshyColors.info
        }
    }

    private func shortDate(_ date: Date) -> String {
        let isSameYear = Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
        if isSameYear {
            return date.formatted(.dateTime.day().month(.abbreviated))
        } else {
            return date.formatted(.dateTime.day().month(.abbreviated).year(.twoDigits))
        }
    }
}

struct ConversationInfoMemberSkeletonRow: View {
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Circle()
                .fill(theme.textMuted.opacity(MeeshyOpacity.light))
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                    .fill(theme.textMuted.opacity(MeeshyOpacity.light))
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(MeeshyOpacity.subtle))
                    .frame(width: 80, height: 10)
            }

            Spacer()
        }
        .shimmer()
    }
}
