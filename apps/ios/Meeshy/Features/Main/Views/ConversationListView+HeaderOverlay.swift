import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Header Overlay
// Extracted into a dedicated View struct so the deeply-nested collapsible
// header no longer composes into ConversationListView.body's type. That
// monolithic type was the root cause of a Swift type-metadata instantiation
// crash at launch on low-memory devices (iPhone XR / iOS 17.6).
struct ConversationListHeaderOverlay: View {
    /// SEUL abonné au relay d'offset : chaque tick de scroll re-rend ce
    /// header (voulu — il collapse en suivant le doigt) et RIEN d'autre.
    /// L'ancien `let scrollOffset: CGFloat` forçait le parent à porter
    /// l'offset dans un @State et ré-exécutait tout son body (~99 rows
    /// reconstruites + diff Equatable) à ~120 Hz pendant le scroll.
    @ObservedObject var scrollRelay: ScrollOffsetRelay
    let iPadFeedAction: (() -> Void)?
    let iPadNotificationCount: Int
    let onNotificationsTap: (() -> Void)?
    let onSettingsTap: (() -> Void)?
    let onNewConversation: (() -> Void)?
    @Binding var showShareLinkSheet: Bool
    /// Compact story trail injected into the header's TITLE slot: une fois la
    /// liste scrollée, on ne lit plus « Meeshy Chats » mais la trail, à gauche
    /// des boutons d'actions (directive user 2026-08-13). Reçoit l'offset de
    /// scroll vivant depuis la passe de rendu de ce header.
    var titleAccessory: ((CGFloat) -> AnyView)? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        CollapsibleHeader(
            title: "Meeshy Chats",
            scrollOffset: scrollRelay.offset,
            showBackButton: false,
            titleColor: theme.textPrimary,
            backArrowColor: MeeshyColors.indigo500,
            backgroundColor: theme.backgroundPrimary,
            leading: {
                if let iPadFeedAction {
                    Button {
                        HapticFeedback.light()
                        iPadFeedAction()
                    } label: {
                        HStack(spacing: MeeshySpacing.xs) {
                            Image(systemName: "square.stack.fill")
                                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                                .accessibilityHidden(true)
                            Text(String(localized: "conversation.list.feed", defaultValue: "Flux", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        }
                        .foregroundStyle(
                            LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                        )
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xs)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.indigo100.opacity(theme.mode.isDark ? 0.15 : 1))
                        )
                    }
                }
            },
            titleView: {
                Text(verbatim: "Meeshy Chats")
                    .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                    )
                    // Volet latéral iPad : chip Feed + 4 actions laissent ~110 pt
                    // au titre, qui tronquait en « Mee. » — rétrécir plutôt.
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .accessibilityAddTraits(.isHeader)
            },
            trailing: {
                // Volet gauche iPad étroit (Split View, petite fenêtre Stage
                // Manager, colonne à 30 %) : la rangée d'actions débordait de la
                // colonne. Elle se resserre avant de déborder.
                ViewThatFits(in: .horizontal) {
                    headerActions(spacing: MeeshySpacing.md)
                    headerActions(spacing: MeeshySpacing.xs)
                }
                // Loi commune `ScrollMotion` : une vue en mouvement ne montre
                // pas ses boutons d'action. Le titre, la trail compacte et le
                // verre du header restent — seuls les glyphes d'action
                // s'effacent le temps du défilement.
                .hiddenWhileScrolling()
            },
            // Adapte la closure paramétrée à la slot sans-argument du
            // CollapsibleHeader : l'offset capturé ici est celui du render
            // courant du header (seul abonné au relay), donc toujours frais.
            titleAccessory: titleAccessory.map { build in
                let offset = scrollRelay.offset
                return { build(offset) }
            }
        )
        // Ce header est le SEUL abonné au relay : il se re-rend à chaque tick
        // de scroll, donc l'offset qu'il publie ici est vivant. Le
        // `ScrollView` SwiftUI n'expose pas de phase de défilement avant
        // iOS 17 — l'apaisement se déduit du silence de l'offset.
        .scrollMotionActive(offset: scrollRelay.offset)
    }
}
