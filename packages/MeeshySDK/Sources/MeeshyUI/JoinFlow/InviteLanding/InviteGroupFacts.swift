import SwiftUI
import MeeshySDK

/// Combien de personnes, combien de langues, et lesquelles.
struct InviteGroupFacts: View {
    let stats: ShareLinkStats
    let shares: [LanguageShare]
    let isDark: Bool

    private var languageCount: Int {
        max(stats.languageCount, shares.count)
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.smPlus) {
                tile(value: stats.totalParticipants, label: InviteLandingCopy.peopleLabel(stats.totalParticipants))
                tile(value: languageCount, label: InviteLandingCopy.languagesLabel(languageCount))
            }
            if !shares.isEmpty {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    InviteSectionTitle(text: InviteLandingCopy.spokenTitle, isDark: isDark)
                    LanguageShareBar(shares: shares, isDark: isDark)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(MeeshySpacing.lg)
                .inviteCardSurface(isDark: isDark)
            }
        }
    }

    private func tile(value: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(value.formatted())
                .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .heavy, design: .rounded))
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.lg)
        .inviteCardSurface(isDark: isDark)
        .accessibilityElement(children: .combine)
    }
}

/// « En anonyme, tu pourras » : les droits d'un invité sans compte, ce qui
/// lui sera demandé, les langues acceptées, la validité et les places.
struct InviteGuestTermsCard: View {
    let info: ShareLinkInfo
    let now: Date
    let isDark: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            InviteSectionTitle(text: InviteLandingCopy.termsTitle, isDark: isDark)
            InviteRightRow(label: InviteLandingCopy.rightMessages, allowed: info.guestRights.messages, isDark: isDark)
            InviteRightRow(label: InviteLandingCopy.rightImages, allowed: info.guestRights.images, isDark: isDark)
            InviteRightRow(label: InviteLandingCopy.rightHistory, allowed: info.guestRights.history, isDark: isDark)
            InviteRightRow(label: InviteLandingCopy.rightFiles, allowed: info.guestRights.files, isDark: isDark)
            Rectangle()
                .fill(isDark ? MeeshyColors.indigo800.opacity(0.55) : MeeshyColors.indigo100)
                .frame(height: 1)
                .padding(.vertical, MeeshySpacing.xxs)
                .accessibilityHidden(true)
            fact(InviteLandingCopy.askedLabel, InviteLandingCopy.fieldList(info.requestedFields))
            fact(InviteLandingCopy.languagesAcceptedLabel, InviteLandingCopy.languageList(info.allowedLanguages))
            fact(
                InviteLandingCopy.validityLabel,
                "\(InviteLandingCopy.validity(daysLeft: info.daysLeft(now: now))) · \(InviteLandingCopy.places(remaining: info.remainingPlaces, of: info.maxUses))"
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.lg)
        .inviteCardSurface(isDark: isDark)
    }

    private func fact(_ label: String, _ value: String) -> some View {
        (Text(label).bold().foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
            + Text(verbatim: " \(value)"))
            .font(MeeshyFont.relative(MeeshyFont.labelSize))
            .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral600)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Une ligne de droit : coche verte si accordé, croix rouge sinon. Le libellé
/// VoiceOver dit l'état en toutes lettres — la couleur seule ne suffit pas.
public struct InviteRightRow: View {
    let label: String
    let allowed: Bool
    let isDark: Bool

    public init(label: String, allowed: Bool, isDark: Bool) {
        self.label = label
        self.allowed = allowed
        self.isDark = isDark
    }

    public var body: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Image(systemName: allowed ? "checkmark" : "xmark")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .heavy))
                .foregroundColor(allowed ? MeeshyColors.successDeep : MeeshyColors.errorStrong)
                .frame(width: 20)
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(allowed
                                 ? (isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                                 : (isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500))
                .strikethrough(!allowed, color: isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral400)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(allowed ? InviteLandingCopy.allowed(label) : InviteLandingCopy.denied(label))
    }
}
