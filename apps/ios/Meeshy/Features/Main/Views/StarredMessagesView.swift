import SwiftUI
import MeeshySDK
import MeeshyUI

/// Dedicated list of messages the user has starred across every conversation.
/// Mirrors WhatsApp's "Starred Messages" screen: each row is self-contained
/// (sender, content preview, source conversation chip, star toggle) so the
/// page works even when the source conversation is archived or offline.
struct StarredMessagesView: View {
    @StateObject private var store = StarredMessagesStore.shared
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var router: Router

    var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            if store.snapshots.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(store.snapshots) { snapshot in
                            StarredRow(snapshot: snapshot, isDark: theme.mode.isDark)
                                .onTapGesture {
                                    navigate(to: snapshot)
                                }
                                .contextMenu {
                                    Button(role: .destructive) {
                                        store.remove(messageId: snapshot.id)
                                    } label: {
                                        Label(String(localized: "starred.messages.remove", defaultValue: "Retirer des favoris", bundle: .main), systemImage: "star.slash")
                                    }
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityAddTraits(.isButton)
                                .accessibilityHint(String(localized: "starred.messages.row.hint", defaultValue: "Ouvre la conversation", bundle: .main))
                                .accessibilityAction { navigate(to: snapshot) }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
        .navigationTitle(String(localized: "starred.messages.title", defaultValue: "Messages favoris", bundle: .main))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !store.snapshots.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) {
                            store.clearAll()
                        } label: {
                            Label(String(localized: "starred.messages.remove_all", defaultValue: "Tout retirer", bundle: .main), systemImage: "star.slash.fill")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel(String(localized: "starred.messages.more_options", defaultValue: "Plus d'options", bundle: .main))
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "star.circle")
                .font(.system(size: 56, weight: .regular))
                .foregroundStyle(MeeshyColors.indigo400)
                .accessibilityHidden(true)
            Text(String(localized: "starred.messages.empty.title", defaultValue: "Aucun message favori", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
            Text(String(localized: "starred.messages.empty.subtitle", defaultValue: "Appuyez longuement sur un message et choisissez \"Ajouter aux favoris\" pour le retrouver ici.", bundle: .main))
                .font(MeeshyFont.relative(13))
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }

    private func navigate(to snapshot: StarredMessageSnapshot) {
        // Delegate to Router's existing highlight-in-conversation flow so the
        // starred row behaves exactly like a tapped notification / search hit.
        router.pendingHighlightMessageId = snapshot.id
        NotificationCenter.default.post(
            name: Notification.Name("navigateToConversationById"),
            object: snapshot.conversationId
        )
        dismiss()
    }
}

private struct StarredRow: View {
    let snapshot: StarredMessageSnapshot
    let isDark: Bool

    private var accent: Color {
        if let hex = snapshot.conversationAccentColor { return Color(hex: hex) }
        return MeeshyColors.indigo500
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(accent)
                .frame(width: 3)
                .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .font(MeeshyFont.relative(10, weight: .bold))
                        .foregroundStyle(MeeshyColors.warning)
                    Text(snapshot.senderName ?? String(localized: "starred.messages.unknown_user", defaultValue: "Utilisateur", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundStyle(accent)
                    Spacer(minLength: 4)
                    Text(snapshot.sentAt.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                        .font(MeeshyFont.relative(11))
                        .foregroundStyle(isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo700.opacity(0.6))
                }

                Text(snapshot.contentPreview)
                    .font(MeeshyFont.relative(14))
                    .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)

                if let conversationName = snapshot.conversationName {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(MeeshyFont.relative(9, weight: .semibold))
                        Text(conversationName)
                            .font(MeeshyFont.relative(11, weight: .medium))
                    }
                    .foregroundStyle(accent.opacity(0.85))
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo950.opacity(0.4) : MeeshyColors.indigo50)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(accent.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
}
