import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le contenu de la carte, sans ses boutons : la CITATION de l'invitation
/// (lien de partage) puis la carte du groupe — bannière, avatar en
/// chevauchement, titre, description courte, statistiques. Feuille
/// `Equatable` : elle ne se réévalue que si la carte change.
struct ConversationLinkCardBody: View, Equatable {
    let card: ConversationCard
    let isDark: Bool

    private static let bannerHeight: CGFloat = 76
    private static let avatarSide: CGFloat = 52

    /// Accent déterministe de la conversation. Le serveur ne sert ni la langue
    /// ni le thème qui composent `accentColor` : l'identité stable la plus
    /// proche est l'identifiant, sinon le titre.
    static func accentHex(for card: ConversationCard) -> String {
        DynamicColorGenerator.colorForName(card.conversationId ?? card.link?.identifier ?? card.title)
    }

    private var accent: Color { Color(hex: Self.accentHex(for: card)) }

    private var title: String {
        let raw = card.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? ConversationLinkCardCopy.privateTitle : raw
    }

    private var initials: String {
        let words = title.split(whereSeparator: \.isWhitespace).prefix(2)
        return words.compactMap(\.first).map { String($0).uppercased() }.joined()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if card.kind == .shareLink, let inviter = card.inviter {
                ConversationInviteQuote(inviter: inviter, message: card.inviteMessage, accent: accent, isDark: isDark)
            }
            groupCard
                .saturation(card.isLinkExpired ? 0 : 1)
                .opacity(card.isLinkExpired ? 0.6 : 1)
        }
    }

    private var groupCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            banner
            identity
            if let description = card.description?.trimmingCharacters(in: .whitespacesAndNewlines), !description.isEmpty {
                Text(description)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo950.opacity(0.8))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, MeeshySpacing.sm)
            }
            if !card.isLinkExpired {
                ConversationCardStatsRow(stats: card.stats, accent: accent, isDark: isDark)
                    .padding(.horizontal, MeeshySpacing.sm)
            }
        }
        .padding(.bottom, MeeshySpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo900.opacity(0.45) : MeeshyColors.indigo50.opacity(0.6))
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var banner: some View {
        Color.clear
            .frame(height: Self.bannerHeight)
            .frame(maxWidth: .infinity)
            .overlay(
                CachedAsyncImage(url: card.bannerUrl, showsStatusOverlays: false) { gradient }
                    .scaledToFill()
            )
            .clipped()
            .accessibilityHidden(true)
    }

    private var gradient: LinearGradient {
        LinearGradient(colors: [accent, accent.opacity(0.55)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 4) {
            avatar
                .padding(.top, -Self.avatarSide * 0.5)
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .heavy, design: .rounded))
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.sm)
    }

    private var avatar: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(gradient)
            .overlay(
                CachedAsyncImage(url: card.avatarUrl,
                                 targetSize: CGSize(width: Self.avatarSide, height: Self.avatarSide),
                                 showsStatusOverlays: false) {
                    Text(verbatim: initials)
                        .font(MeeshyFont.relative(18, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                }
                .scaledToFill()
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isDark ? MeeshyColors.indigo950 : Color.white, lineWidth: 3)
            )
            .frame(width: Self.avatarSide, height: Self.avatarSide)
            .accessibilityHidden(true)
    }

    private var accessibilityText: String {
        var parts = [ConversationLinkCardCopy.cardLabel(title)]
        if let description = card.description, !description.isEmpty { parts.append(description) }
        if card.isLinkExpired {
            parts.append(ConversationLinkCardCopy.expiredTitle)
        } else {
            parts.append(ConversationLinkCardCopy.members(card.stats.memberCount))
            if let messages = card.stats.messageCount { parts.append(ConversationLinkCardCopy.messages(messages)) }
            if !card.stats.languages.isEmpty {
                let names = card.stats.languages.map { LanguageDisplay.from(code: $0)?.name ?? $0.uppercased() }
                parts.append(ConversationLinkCardCopy.languages(names.joined(separator: ", ")))
            }
        }
        return parts.joined(separator: ". ")
    }
}

// MARK: - Citation de l'invitation

/// Qui invite, puis son message, comme une citation avant le contenu : même
/// barre d'accent verticale que la réponse citée d'une bulle.
struct ConversationInviteQuote: View {
    let inviter: ConversationCardInviter
    let message: String?
    let accent: Color
    let isDark: Bool

    private var trimmedMessage: String? {
        guard let text = message?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.sm) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(accent)
                .frame(width: 3)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: MeeshySpacing.sm) {
                    MeeshyAvatar(name: inviter.displayName, context: .custom(28), avatarURL: inviter.avatarUrl,
                                 enablePulse: false, isDark: isDark)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(inviter.displayName)
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                            .foregroundColor(accent)
                            .lineLimit(1)
                        Text(ConversationLinkCardCopy.invitesYou)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let text = trimmedMessage {
                    inviteMessage(text)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("conversation-link-card-invite")
    }

    /// Le message du lien en CITATION mise en valeur (correction porteur
    /// 2026-09-29, #8726) : un grand guillemet décoratif, puis le texte. Absent,
    /// rien ne se dessine — aucune place réservée.
    private func inviteMessage(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Text(verbatim: "\u{201C}")
                .font(MeeshyFont.relative(60, weight: .black, design: .serif))
                .foregroundColor(accent.opacity(0.7))
                .frame(height: 34, alignment: .top)
                .padding(.top, -2)
                .accessibilityHidden(true)
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium).italic())
                .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(accent.opacity(isDark ? 0.16 : 0.08))
        )
        .accessibilityIdentifier("conversation-link-card-invite-message")
    }
}

// MARK: - Statistiques

struct ConversationCardStatsRow: View {
    let stats: ConversationCardStats
    let accent: Color
    let isDark: Bool

    var body: some View {
        // Les pastilles de langue cèdent la place avant les nombres : une
        // bulle étroite ou un Dynamic Type élevé garde membres et messages
        // lisibles sur une ligne.
        ViewThatFits(in: .horizontal) {
            row(languages: 4)
            row(languages: 2)
            row(languages: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(languages visible: Int) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            metric(icon: "person.2.fill", value: stats.memberCount)
            if let messages = stats.messageCount {
                metric(icon: "bubble.left.and.bubble.right.fill", value: messages)
            }
            // Pas de `ForEach` : sa fermeture hérite de l'isolation @MainActor,
            // et iOS 26 la rappelle sur `com.apple.SwiftUI.AsyncRenderer` en
            // mesurant la bulle — le contrôle d'isolation de Swift 6 y trappe
            // (`.ips` du 2026-09-29, `closure #1 in closure #1 in row`). Au plus
            // quatre pastilles, posées sans fermeture.
            let shown = Array(stats.languages.prefix(visible))
            if shown.count > 0 { languagePill(shown[0]) }
            if shown.count > 1 { languagePill(shown[1]) }
            if shown.count > 2 { languagePill(shown[2]) }
            if shown.count > 3 { languagePill(shown[3]) }
            if stats.languages.count > visible {
                Text(verbatim: "+\(stats.languages.count - visible)")
                    .font(MeeshyFont.relative(11, weight: .bold))
                    .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
                    .fixedSize()
            }
        }
    }

    private func languagePill(_ code: String) -> some View {
        Text(verbatim: code.uppercased())
            .font(MeeshyFont.relative(11, weight: .bold))
            .foregroundColor(accent)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(accent.opacity(0.14)))
            .fixedSize()
    }

    private func metric(icon: String, value: Int) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(11, weight: .semibold))
            Text(value.formatted(.number.notation(.compactName)))
                .font(MeeshyFont.relative(12, weight: .semibold))
                .monospacedDigit()
        }
        .fixedSize()
        .foregroundColor(isDark ? MeeshyColors.indigo200 : MeeshyColors.indigo700)
    }
}
