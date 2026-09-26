import SwiftUI
import MeeshySDK
import MeeshyUI

/// La carte d'une URL Meeshy de conversation dans une bulle (#8099).
///
/// Cache d'abord : une carte déjà vue s'affiche dès la première image ; le
/// squelette n'apparaît que sur cache vide. Tant que le serveur ne sert pas la
/// carte (route absente, lien inconnu, panne), la bulle retombe sur l'aperçu
/// de lien générique d'avant — aucune régression.
struct ConversationLinkCard: View {
    let target: ConversationCardTarget
    let urlString: String
    let fallbackAccent: String
    let isDark: Bool

    @StateObject private var model: ConversationLinkCardViewModel
    @State private var confirmsLeave = false

    init(target: ConversationCardTarget, urlString: String, fallbackAccent: String, isDark: Bool) {
        self.target = target
        self.urlString = urlString
        self.fallbackAccent = fallbackAccent
        self.isDark = isDark
        _model = StateObject(wrappedValue: ConversationLinkCardViewModel(target: target))
    }

    var body: some View {
        content
            .task(id: target) { await model.load() }
            .confirmationDialog(ConversationLinkCardCopy.leaveConfirmTitle,
                                isPresented: $confirmsLeave,
                                titleVisibility: .visible) {
                Button(ConversationLinkCardCopy.leave, role: .destructive) {
                    Task { await model.leave() }
                }
                Button(ConversationLinkCardCopy.cancel, role: .cancel) {}
            } message: {
                Text(ConversationLinkCardCopy.leaveConfirmMessage)
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .unavailable:
            LinkPreviewCard(urlString: urlString, accentColor: fallbackAccent, isDark: isDark)
        case .loading:
            ConversationLinkCardSkeleton(accentHex: fallbackAccent, isDark: isDark)
        case .privateConversation:
            ConversationLinkCardNotice(icon: "lock.fill",
                                       title: ConversationLinkCardCopy.privateTitle,
                                       hint: ConversationLinkCardCopy.privateHint,
                                       isDark: isDark)
        case .card(let card):
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ConversationLinkCardBody(card: card, isDark: isDark)
                    .equatable()
                ConversationLinkCardActionsRow(
                    actions: model.actions,
                    isExpired: card.isLinkExpired,
                    pending: model.pending,
                    errorMessage: model.errorMessage,
                    accentHex: ConversationLinkCardBody.accentHex(for: card),
                    isDark: isDark,
                    onJoin: { Task { await model.join() } },
                    onJoinAnonymously: { model.joinAnonymously() },
                    onLeave: { confirmsLeave = true },
                    onOpen: { model.open() }
                )
            }
            .padding(MeeshySpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(isDark ? MeeshyColors.indigo950.opacity(0.55) : Color.white.opacity(0.85))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isDark ? MeeshyColors.indigo800.opacity(0.6) : MeeshyColors.indigo100, lineWidth: 1)
            )
            .accessibilityIdentifier("conversation-link-card")
        }
    }
}

// MARK: - Squelette (cache vide seulement)

struct ConversationLinkCardSkeleton: View {
    let accentHex: String
    let isDark: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: accentHex).opacity(0.25))
                .frame(height: 72)
            RoundedRectangle(cornerRadius: 4).fill(placeholder).frame(width: 140, height: 14)
            RoundedRectangle(cornerRadius: 4).fill(placeholder).frame(height: 10)
            RoundedRectangle(cornerRadius: 10).fill(placeholder).frame(height: 44)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.sm)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo950.opacity(0.55) : Color.white.opacity(0.85))
        )
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ConversationLinkCardCopy.loading)
    }

    private var placeholder: Color {
        isDark ? MeeshyColors.indigo800.opacity(0.6) : MeeshyColors.indigo100
    }
}

// MARK: - Carte neutre (conversation privée)

struct ConversationLinkCardNotice: View, Equatable {
    let icon: String
    let title: String
    let hint: String
    let isDark: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(18, weight: .semibold))
                .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
                .frame(width: 40, height: 40)
                .background(Circle().fill(isDark ? MeeshyColors.indigo900 : MeeshyColors.indigo50))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                Text(hint)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.neutral500)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.md)
        .frame(minHeight: 64)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo950.opacity(0.55) : Color.white.opacity(0.85))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(isDark ? MeeshyColors.indigo800.opacity(0.6) : MeeshyColors.indigo100, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("conversation-link-card-notice")
    }
}
