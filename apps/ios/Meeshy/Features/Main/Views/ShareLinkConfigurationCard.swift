import SwiftUI
import MeeshySDK
import MeeshyUI

/// La configuration du lien, EN LECTURE (#7797) : droits des invités sans
/// compte, conditions d'entrée, limites, langues autorisées. « Modifier »
/// descend au formulaire, qui édite exactement ces champs.
struct ShareLinkConfigurationCard: View {
    let link: MyShareLink
    let isDark: Bool
    let onEdit: () -> Void

    private var settings: ShareLinkSettings { link.settings }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack {
                title(ShareLinkDetailCopy.configuration)
                Spacer()
                Button(ShareLinkDetailCopy.edit, action: onEdit)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
                    .meeshyTapTarget()
            }

            subtitle(ShareLinkDetailCopy.guestRights)
            InviteRightRow(label: InviteLandingCopy.rightMessages, allowed: settings.guestRights.messages, isDark: isDark)
            InviteRightRow(label: ShareLinkDetailCopy.historyRight, allowed: settings.guestRights.history, isDark: isDark)
            InviteRightRow(label: InviteLandingCopy.rightImages, allowed: settings.guestRights.images, isDark: isDark)
            InviteRightRow(label: InviteLandingCopy.rightFiles, allowed: settings.guestRights.files, isDark: isDark)

            subtitle(ShareLinkDetailCopy.entryConditions)
            row(ShareLinkDetailCopy.meeshyAccount, settings.requireAccount ? ShareLinkDetailCopy.required : ShareLinkDetailCopy.optional)
            row(ShareLinkDetailCopy.askedOnArrival, ShareLinkDetailCopy.askedFields(settings))

            subtitle(ShareLinkDetailCopy.limits)
            row(ShareLinkDetailCopy.uses, ShareLinkDetailCopy.usesValue(current: link.currentUses, max: settings.maxUses))
            row(ShareLinkDetailCopy.concurrent, ShareLinkDetailCopy.concurrentValue(settings.maxConcurrentUsers))
            row(ShareLinkDetailCopy.expires, ShareLinkDetailCopy.expiryValue(settings.expiresAt))

            subtitle(ShareLinkDetailCopy.allowedLanguages)
            Text(ShareLinkDetailCopy.languages(settings.allowedLanguages))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.lg)
        .inviteCardSurface(isDark: isDark)
    }

    private func title(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
            .kerning(1.1)
            .textCase(.uppercase)
            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .accessibilityAddTraits(.isHeader)
    }

    private func subtitle(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
            .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
            .padding(.top, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.md) {
            Text(label)
                .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral600)
            Spacer(minLength: MeeshySpacing.sm)
            Text(value)
                .fontWeight(.semibold)
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .multilineTextAlignment(.trailing)
        }
        .font(MeeshyFont.relative(MeeshyFont.bodySize))
        .accessibilityElement(children: .combine)
    }
}
