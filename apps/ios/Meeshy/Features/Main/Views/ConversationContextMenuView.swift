import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Menu Category Descriptor

/// Descripteur immuable d'une catégorie utilisateur pour le sous-menu « Déplacer vers ».
/// Découplé de tout modèle de conversation — l'appelant projette ses catégories vers ce type.
struct ConversationMenuCategory: Identifiable, Equatable {
    let id: String
    let name: String
    let icon: String
}

// MARK: - Conversation Context Menu (custom, icon-drawing)

/// Menu contextuel custom pour une ligne de la liste de conversations.
///
/// Sur iOS 26 le `.contextMenu` natif n'affiche pas les icônes SF ; ce menu les
/// dessine lui-même (comme `MessageActionsMenu`) et cascade root → favorite / move /
/// more via un `enum Panel` local. Entièrement self-contained : aucun couplage à
/// `ConversationListView`, `ConversationViewModel`, `ConversationLockManager` ou
/// `BlockService` — tout l'état et toutes les actions passent par des paramètres et
/// des callbacks. L'appelant est responsable de la fermeture réelle (`onDismiss`).
struct ConversationContextMenuView: View {
    let accentHex: String
    // État
    let isPinned: Bool
    let isMuted: Bool
    let hasUnread: Bool
    let currentReaction: String?
    let categories: [ConversationMenuCategory]
    let currentSectionId: String?
    let canInvite: Bool
    let isLocked: Bool
    let isArchived: Bool
    let isBlockableDM: Bool
    let isBlocked: Bool
    /// Renommable = conversation de groupe/communauté (pas un DM).
    let canRename: Bool
    // Callbacks — chacun = action ; la fermeture est faite par l'appelant via onDismiss
    let onPin: () -> Void
    let onMute: () -> Void
    let onMarkReadToggle: () -> Void
    let onDetails: () -> Void
    let onRename: () -> Void
    let onSetFavorite: (String) -> Void
    let onRemoveFavorite: () -> Void
    let onMove: (String) -> Void
    let onInvite: () -> Void
    let onLock: () -> Void
    let onArchive: () -> Void
    let onBlock: () -> Void
    let onDelete: () -> Void
    let onDismiss: () -> Void

    private enum Panel { case root, favorite, move, more }

    @State private var panel: Panel = .root

    // Dynamic Type : hauteur de row et colonne d'icône scalées avec la taille
    // de texte préférée — même convention que `MessageActionsMenu` et que les
    // rows des menus contextuels système.
    @ScaledMetric(relativeTo: .body) private var rowMinHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .body) private var iconColumnWidth: CGFloat = 24

    private var accent: Color { Color(hex: accentHex) }

    private static let favoriteEmojis = ["⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡"]

    var body: some View {
        VStack(spacing: 0) {
            switch panel {
            case .root: rootPanel
            case .favorite: favoritePanel
            case .move: movePanel
            case .more: morePanel
            }
        }
        .padding(.vertical, 6)
        .frame(width: 260)
        // Liquid Glass natif iOS 26 (`.regular` pur, sans teinte ni ombre
        // manuelle) pour matcher le rendu système ; fallback material < 26.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .animation(.easeInOut(duration: 0.2), value: panel)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Root Panel

    private var rootPanel: some View {
        VStack(spacing: 0) {
            actionRow(
                icon: isPinned ? "pin.slash.fill" : "pin.fill",
                label: isPinned
                    ? String(localized: "context.unpin", defaultValue: "Désépingler", bundle: .main)
                    : String(localized: "context.pin", defaultValue: "Épingler", bundle: .main)
            ) { onPin(); onDismiss() }

            separator

            actionRow(
                icon: isMuted ? "bell.fill" : "bell.slash.fill",
                label: isMuted
                    ? String(localized: "context.unmute", defaultValue: "Réactiver les notifications", bundle: .main)
                    : String(localized: "context.mute", defaultValue: "Mettre en silence", bundle: .main)
            ) { onMute(); onDismiss() }

            divider

            actionRow(
                icon: hasUnread ? "envelope.open.fill" : "envelope.badge.fill",
                label: hasUnread
                    ? String(localized: "context.mark_read", defaultValue: "Marquer comme lu", bundle: .main)
                    : String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu", bundle: .main)
            ) { onMarkReadToggle(); onDismiss() }

            separator

            actionRow(
                icon: "info.circle.fill",
                label: String(localized: "context.details", defaultValue: "Détails", bundle: .main)
            ) { onDetails(); onDismiss() }

            if canRename {
                separator
                actionRow(
                    icon: "pencil",
                    label: String(localized: "context.rename", defaultValue: "Renommer", bundle: .main)
                ) { onRename(); onDismiss() }
            }

            separator

            actionRow(
                icon: currentReaction != nil ? "star.fill" : "star",
                label: String(localized: "context.favorite", defaultValue: "Favori", bundle: .main),
                showsChevron: true
            ) { navigate(to: .favorite) }

            separator

            actionRow(
                icon: "folder.fill",
                label: String(localized: "context.move_to", defaultValue: "Déplacer vers...", bundle: .main),
                showsChevron: true
            ) { navigate(to: .move) }

            separator

            actionRow(
                icon: "ellipsis",
                label: String(localized: "context.more_options", defaultValue: "Plus d'options", bundle: .main),
                showsChevron: true
            ) { navigate(to: .more) }

            divider

            actionRow(
                icon: "trash",
                label: String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main),
                isDestructive: true
            ) { onDelete(); onDismiss() }
        }
    }

    // MARK: - Favorite Panel

    private var favoritePanel: some View {
        VStack(spacing: 0) {
            backHeader(String(localized: "context.favorite", defaultValue: "Favori", bundle: .main))

            divider

            HStack(spacing: 6) {
                ForEach(Self.favoriteEmojis, id: \.self) { emoji in
                    Button {
                        HapticFeedback.light()
                        onSetFavorite(emoji)
                        onDismiss()
                    } label: {
                        Text(emoji)
                            .font(MeeshyFont.relative(22))
                            .frame(maxWidth: .infinity, minHeight: rowMinHeight)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(MenuRowHighlightButtonStyle())
                    .accessibilityLabel(emoji)
                    .accessibilityAddTraits(.isButton)
                }
            }
            .padding(.horizontal, 12)

            if currentReaction != nil {
                divider
                actionRow(
                    icon: "star.slash",
                    label: String(localized: "context.remove_favorite", defaultValue: "Retirer le favori", bundle: .main),
                    isDestructive: true
                ) { onRemoveFavorite(); onDismiss() }
            }
        }
    }

    // MARK: - Move Panel

    private var movePanel: some View {
        VStack(spacing: 0) {
            backHeader(String(localized: "context.move_to", defaultValue: "Déplacer vers...", bundle: .main))

            divider

            ForEach(Array(categories.enumerated()), id: \.element.id) { index, category in
                actionRow(
                    icon: category.icon,
                    label: category.name,
                    showsCheckmark: category.id == currentSectionId
                ) { onMove(category.id); onDismiss() }
                if index < categories.count - 1 {
                    separator
                }
            }

            divider

            actionRow(
                icon: "tray.fill",
                label: String(localized: "context.my_conversations", defaultValue: "Mes conversations", bundle: .main),
                showsCheckmark: currentSectionId == nil || currentSectionId == ""
            ) { onMove(""); onDismiss() }
        }
    }

    // MARK: - More Panel

    private var morePanel: some View {
        VStack(spacing: 0) {
            backHeader(String(localized: "context.more_options", defaultValue: "Plus d'options", bundle: .main))

            divider

            if canInvite {
                actionRow(
                    icon: "person.badge.plus",
                    label: String(localized: "context.invite_friends", defaultValue: "Inviter mes amis", bundle: .main)
                ) { onInvite(); onDismiss() }
                separator
            }

            actionRow(
                icon: isLocked ? "lock.open.fill" : "lock.fill",
                label: isLocked
                    ? String(localized: "context.unlock", defaultValue: "Déverrouiller", bundle: .main)
                    : String(localized: "context.lock", defaultValue: "Verrouiller", bundle: .main)
            ) { onLock(); onDismiss() }

            separator

            actionRow(
                icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
                label: isArchived
                    ? String(localized: "context.unarchive", defaultValue: "Désarchiver", bundle: .main)
                    : String(localized: "context.archive", defaultValue: "Archiver", bundle: .main)
            ) { onArchive(); onDismiss() }

            if isBlockableDM {
                divider
                actionRow(
                    icon: isBlocked ? "hand.raised.slash.fill" : "hand.raised.fill",
                    label: isBlocked
                        ? String(localized: "context.unblock", defaultValue: "Débloquer", bundle: .main)
                        : String(localized: "context.block", defaultValue: "Bloquer", bundle: .main),
                    isDestructive: !isBlocked
                ) { onBlock(); onDismiss() }
            }
        }
    }

    // MARK: - Building Blocks

    private func navigate(to destination: Panel) {
        HapticFeedback.light()
        withAnimation(.easeInOut(duration: 0.2)) { panel = destination }
    }

    private func actionRow(
        icon: String,
        label: String,
        isDestructive: Bool = false,
        showsChevron: Bool = false,
        showsCheckmark: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        let tint = isDestructive ? MeeshyColors.error : accent
        return Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: iconColumnWidth)
                Text(label)
                    .font(MeeshyFont.relative(16))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if showsCheckmark {
                    Image(systemName: "checkmark")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .opacity(0.4)
                }
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 16)
            .frame(minHeight: rowMinHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowHighlightButtonStyle())
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isButton)
    }

    private func backHeader(_ title: String) -> some View {
        Button {
            navigate(to: .root)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "chevron.left")
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: iconColumnWidth)
                Text(title)
                    .font(MeeshyFont.relative(16, weight: .semibold))
                Spacer(minLength: 0)
            }
            .foregroundStyle(accent)
            .padding(.horizontal, 16)
            .frame(minHeight: rowMinHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowHighlightButtonStyle())
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
    }

    private var separator: some View {
        Divider().overlay(accent.opacity(0.08)).padding(.leading, 52)
    }

    private var divider: some View {
        Divider().overlay(accent.opacity(0.12))
    }
}

// MARK: - Row Highlight (parité menus système)

/// Highlight de la row sous le doigt — les menus contextuels système (UIMenu,
/// Liquid Glass iOS 26 compris) surlignent la ligne pressée ; `.plain` ne
/// donnait aucun feedback. `Color.primary` suit automatiquement dark/light,
/// comme le highlight natif.
private struct MenuRowHighlightButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.primary.opacity(0.08) : Color.clear)
    }
}
