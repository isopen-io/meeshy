import SwiftUI
import UIKit
import MeeshySDK

/// La carte du groupe : bannière (ou dégradé de la marque), logo en
/// chevauchement (ou initiales), nom, type et date de création, description,
/// puis l'adresse `meeshy.me/chat/<linkId>` avec Copier et Repartager.
struct InviteGroupCard: View {
    let conversation: ShareLinkConversation
    let address: ShareLinkAddress
    let isDark: Bool

    @State private var copied = false

    private static let bannerHeight: CGFloat = 112
    private static let logoSide: CGFloat = 76

    private var title: String {
        let raw = conversation.title?.trimmingCharacters(in: .whitespaces) ?? ""
        return raw.isEmpty ? InviteLandingCopy.conversationType(conversation.type) : raw
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            banner
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                identity
                description
                linkRow
                actions
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.bottom, MeeshySpacing.xl)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .inviteCardSurface(isDark: isDark, cornerRadius: 28)
        .shadow(color: MeeshyColors.indigo600.opacity(isDark ? 0 : 0.14), radius: 20, y: 10)
    }

    // MARK: - Banner

    private var banner: some View {
        Color.clear
            .frame(height: Self.bannerHeight)
            .frame(maxWidth: .infinity)
            .overlay(
                CachedAsyncImage(url: conversation.banner, showsStatusOverlays: false) { gradientBanner }
                    .scaledToFill()
            )
            .clipped()
            .accessibilityHidden(true)
    }

    private var gradientBanner: some View {
        LinearGradient(
            colors: [MeeshyColors.indigo600, MeeshyColors.purple600, MeeshyColors.purple500],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Identity

    private var identity: some View {
        HStack(alignment: .bottom, spacing: 14) {
            logo
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(MeeshyFont.relative(24, weight: .heavy, design: .rounded))
                    .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: "\(InviteLandingCopy.conversationType(conversation.type)) · \(InviteLandingCopy.createdOn(conversation.createdAt))")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.neutral500)
            }
            .padding(.bottom, MeeshySpacing.xs)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
        }
        .padding(.top, -Self.logoSide * 0.45)
    }

    private var logo: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(LinearGradient(colors: [MeeshyColors.indigo900, MeeshyColors.indigo500], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                CachedAsyncImage(url: conversation.avatar, targetSize: CGSize(width: Self.logoSide, height: Self.logoSide), showsStatusOverlays: false) {
                    Text(MeeshyAvatar.makeInitials(from: title))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                }
                .scaledToFill()
            )
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(isDark ? MeeshyColors.indigo950 : Color.white, lineWidth: 4)
            )
            .frame(width: Self.logoSide, height: Self.logoSide)
            .shadow(color: MeeshyColors.indigo900.opacity(0.25), radius: 10, y: 6)
            .accessibilityHidden(true)
    }

    // MARK: - Description

    @ViewBuilder
    private var description: some View {
        if let text = conversation.description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.bodySize))
                .foregroundColor(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo950.opacity(0.8))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Link

    private var linkRow: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "link")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
                .accessibilityHidden(true)
            Text(verbatim: address.displayString)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, design: .monospaced))
                .foregroundColor(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo900)
                .lineLimit(1)
                .truncationMode(.middle)
                .environment(\.layoutDirection, .leftToRight)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo900.opacity(0.6) : MeeshyColors.indigo50)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(InviteLandingCopy.linkLabel(address.displayString))
        .textSelection(.enabled)
    }

    private var actions: some View {
        HStack(spacing: 10) {
            Button(action: copy) {
                actionLabel(copied ? InviteLandingCopy.copied : InviteLandingCopy.copy,
                            icon: copied ? "checkmark" : "doc.on.doc")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("invite-landing-copy")

            if let url = address.url {
                ShareLink(item: url) {
                    actionLabel(InviteLandingCopy.reshare, icon: "square.and.arrow.up")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("invite-landing-reshare")
            }
        }
    }

    private func actionLabel(_ text: String, icon: String) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: icon)
                .accessibilityHidden(true)
            Text(text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
        .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700)
        .frame(maxWidth: .infinity, minHeight: 46)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .fill(isDark ? Color.clear : Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                .stroke(isDark ? MeeshyColors.indigo700 : MeeshyColors.indigo200, lineWidth: 1.5)
        )
        .contentShape(Rectangle())
    }

    private func copy() {
        UIPasteboard.general.string = address.absoluteString
        HapticFeedback.success()
        UIAccessibility.post(notification: .announcement, argument: InviteLandingCopy.linkCopiedAnnouncement)
        withAnimation(.easeOut(duration: 0.2)) { copied = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation(.easeOut(duration: 0.2)) { copied = false }
        }
    }
}
