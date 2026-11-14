import SwiftUI
import MeeshySDK
import MeeshyUI

/// Dedicated list of messages the user has starred across every conversation.
/// Mirrors WhatsApp's "Starred Messages" screen: each row is self-contained
/// (sender, content preview, source conversation chip, star toggle) so the
/// page works even when the source conversation is archived or offline.
struct StarredMessagesView: View {
    @ObservedObject private var store: StarredMessagesStore
    init(store: StarredMessagesStore = .shared) {
        self.store = store
    }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    /// Retour operant dans les trois contextes de presentation : pile iPhone,
    /// panneau droit iPad (ni pile ni modale — d'ou l'inertie historique), sheet.
    private var back: PanelBackAction {
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)
    }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.routerCommands) private var router
    @State private var openNoteID: String?

    var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            if store.snapshots.isEmpty {
                emptyState
            }

            // L'en-tête partagé remplace la barre système, masquée par la route
            // (#6481) : titre, retour en verre et menu dans le même en-tête. La
            // page passe PAR-DESSUS l'état vide, qui reste centré par ce ZStack.
            CollapsibleHeaderPage(
                title: String(localized: "starred.messages.title", defaultValue: "Messages favoris", bundle: .main),
                onBack: { back() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.brandPrimary,
                backgroundColor: theme.backgroundPrimary,
                trailing: { moreOptionsMenu },
                content: { rows }
            )
        }
    }

    private var rows: some View {
        LazyVStack(spacing: MeeshySpacing.smPlus) {
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
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
    }

    /// Le menu « Tout retirer », en disque de verre du diamètre du retour. Le
    /// disque EST le cercle : le glyphe passe d'`ellipsis.circle` à `ellipsis`,
    /// qui ne s'y dessinerait pas deux fois. Absent sur une liste vide.
    @ViewBuilder
    private var moreOptionsMenu: some View {
        if !store.snapshots.isEmpty {
            Menu {
                Button(role: .destructive) {
                    store.clearAll()
                } label: {
                    Label(String(localized: "starred.messages.remove_all", defaultValue: "Tout retirer", bundle: .main), systemImage: "star.slash.fill")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(width: CollapsibleHeaderMetrics.roundChromeDiameter, height: CollapsibleHeaderMetrics.roundChromeDiameter)
                    .adaptiveGlass(in: Circle(), interactive: true)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Circle())
            }
            .accessibilityLabel(String(localized: "starred.messages.more_options", defaultValue: "Plus d'options", bundle: .main))
        }
    }

    /// L'état vide tient en une ligne ; le geste qui remplit la liste reste appris ICI, derrière un (i)
    /// dont le nom est la question à laquelle il répond (règle 4, #18088).
    static var emptyInfoNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "starred.messages.empty.question", defaultValue: "Comment ajouter un message aux favoris ?", bundle: .main),
            text: String(localized: "starred.messages.empty.subtitle", defaultValue: "Appui long sur un message, puis « Ajouter aux favoris ».", bundle: .main)
        )
    }

    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "star.circle")
                .font(MeeshyFont.relative(40))
                .foregroundStyle(theme.textMuted)
                .accessibilityHidden(true)
            MeeshyInfoNoted(note: Self.emptyInfoNote, openNoteID: $openNoteID, tint: theme.textMuted) {
                Text(String(localized: "starred.messages.empty.title", defaultValue: "Aucun message favori", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
            }
        }
        .padding(.horizontal, MeeshySpacing.xxxl)
        .frame(maxWidth: .infinity)
    }

    private func navigate(to snapshot: StarredMessageSnapshot) {
        // Delegate to Router's existing highlight-in-conversation flow so the
        // starred row behaves exactly like a tapped notification / search hit.
        // Le highlight est SCOPÉ à la conversation cible, et la notification
        // est observée par RootView/iPadRootView (elle était sans observateur —
        // tap étoilé = no-op silencieux + highlight qui fuitait ailleurs).
        router.requestHighlight(messageId: snapshot.id, inConversation: snapshot.conversationId)
        NotificationCenter.default.post(
            name: .meeshyNavigateToConversation,
            object: snapshot.conversationId
        )
        back()
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
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(accent)
                .frame(width: 3)
                .frame(maxHeight: .infinity)

            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "star.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .bold))
                        .foregroundStyle(MeeshyColors.warning)
                    Text(snapshot.senderName ?? String(localized: "common.unknown_user", defaultValue: "Utilisateur", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(accent)
                    Spacer(minLength: 4)
                    Text(snapshot.sentAt.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundStyle(isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo700.opacity(0.6))
                }

                Text(snapshot.contentPreview)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)

                if let conversationName = snapshot.conversationName {
                    HStack(spacing: MeeshySpacing.xs) {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                        Text(conversationName)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    }
                    .foregroundStyle(accent.opacity(MeeshyOpacity.intense))
                }
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo950.opacity(0.4) : MeeshyColors.indigo50)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .stroke(accent.opacity(MeeshyOpacity.light), lineWidth: MeeshyBorder.hairline)
                )
        )
    }
}
