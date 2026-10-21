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
    let isLocked: Bool
    let isArchived: Bool
    /// Faux pour Global d'un mineur, rangée d'office aux archives (#9929).
    var canToggleArchive = true
    let isBlockableDM: Bool
    let isBlocked: Bool
    /// Les verdicts de la loi partagée (`ConversationActionPolicy`, #11215) —
    /// les MÊMES que lit le menu natif : jamais déduits ici du type.
    let capabilities: ConversationRowMenuCapabilities
    /// Les gestes de chaque entrée, partagés avec le menu natif ; la fermeture
    /// est faite par l'appelant via `onDismiss`.
    let actions: ConversationRowMenuActions
    /// I-075 — force le mode Focal pour CETTE ouverture SEULE (override
    /// éphémère, jamais persistant : n'écrit ni la préférence de mode ni
    /// aucune préférence bêta). Voir `onOpenFocalBetaPreview` au site
    /// d'appel (`ConversationListView+Overlays.swift`) pour le câblage réel
    /// (`router.pendingForcedReadingMode` + `onSelect`).
    let onOpenFocalBetaPreview: () -> Void
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
        .padding(.vertical, MeeshySpacing.xsPlus)
        .frame(width: 260)
        // Liquid Glass natif iOS 26 (`.regular` pur, sans teinte ni ombre
        // manuelle) pour matcher le rendu système ; fallback material < 26.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous))
        .animation(.easeInOut(duration: 0.2), value: panel)
        .accessibilityElement(children: .contain)
        // Toutes les entrées, sous-panneaux compris, en actions NOMMÉES
        // (#11215) : elles complètent l'action « Ouvrir le menu » de la rangée,
        // et VoiceOver atteint Quitter, Signaler ou l'administration sans
        // naviguer d'un panneau à l'autre.
        .accessibilityActions {
            ForEach(accessibilityEntries.map { entry in
                        AsyncRenderRow(id: entry.id, content: Button(entry.label) { entry.perform() })
                    },
                    content: asyncRenderRowContent)
        }
    }

    // MARK: - Root Panel

    private var rootPanel: some View {
        VStack(spacing: 0) {
            actionRow(
                icon: isPinned ? "pin.slash.fill" : "pin.fill",
                label: isPinned
                    ? String(localized: "context.unpin", defaultValue: "Désépingler", bundle: .main)
                    : String(localized: "context.pin", defaultValue: "Épingler", bundle: .main)
            ) { actions.onPin(); onDismiss() }

            separator

            actionRow(
                icon: isMuted ? "bell.fill" : "bell.slash.fill",
                label: isMuted
                    ? String(localized: "context.unmute", defaultValue: "Réactiver les notifications", bundle: .main)
                    : String(localized: "context.mute", defaultValue: "Mettre en silence", bundle: .main)
            ) { actions.onMute(); onDismiss() }

            divider

            actionRow(
                icon: hasUnread ? "envelope.open.fill" : "envelope.badge.fill",
                label: hasUnread
                    ? String(localized: "context.mark_read", defaultValue: "Marquer comme lu", bundle: .main)
                    : String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu", bundle: .main)
            ) { actions.onMarkReadToggle(); onDismiss() }

            separator

            actionRow(
                icon: "info.circle.fill",
                label: String(localized: "context.details", defaultValue: "Détails", bundle: .main)
            ) { actions.onDetails(); onDismiss() }

            if capabilities.rename {
                separator
                actionRow(
                    icon: "pencil",
                    label: String(localized: "context.rename", defaultValue: "Renommer", bundle: .main)
                ) { actions.onRename(); onDismiss() }
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

            departureRows
        }
    }

    /// Quitter, puis Supprimer ou Masquer — les entrées qui RETIRENT, en dernier.
    @ViewBuilder
    private var departureRows: some View {
        if capabilities.leave || capabilities.removal != nil {
            divider
        }

        if capabilities.leave {
            actionRow(
                icon: Self.leaveIcon,
                label: Self.leaveLabel,
                isDestructive: true
            ) { actions.onLeave(); onDismiss() }
        }

        if let removal = capabilities.removal {
            if capabilities.leave { separator }
            actionRow(
                icon: Self.removalIcon(removal),
                label: Self.removalLabel(removal),
                isDestructive: true
            ) { actions.onDelete(); onDismiss() }
        }
    }

    // MARK: - Favorite Panel

    private var favoritePanel: some View {
        VStack(spacing: 0) {
            backHeader(String(localized: "context.favorite", defaultValue: "Favori", bundle: .main))

            divider

            HStack(spacing: MeeshySpacing.xsPlus) {
                ForEach(Self.favoriteEmojis, id: \.self) { emoji in
                    Button {
                        HapticFeedback.light()
                        actions.onSetFavorite(emoji)
                        onDismiss()
                    } label: {
                        Text(emoji)
                            .font(MeeshyFont.relative(MeeshyFont.titleSize))
                            .frame(maxWidth: .infinity, minHeight: rowMinHeight)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(MenuRowHighlightButtonStyle())
                    .accessibilityLabel(emoji)
                    .accessibilityAddTraits(.isButton)
                }
            }
            .padding(.horizontal, MeeshySpacing.md)

            if currentReaction != nil {
                divider
                actionRow(
                    icon: "star.slash",
                    label: String(localized: "context.remove_favorite", defaultValue: "Retirer le favori", bundle: .main),
                    isDestructive: true
                ) { actions.onRemoveFavorite(); onDismiss() }
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
                ) { actions.onMove(category.id); onDismiss() }
                if index < categories.count - 1 {
                    separator
                }
            }

            divider

            actionRow(
                icon: "tray.fill",
                label: String(localized: "context.my_conversations", defaultValue: "Mes conversations", bundle: .main),
                showsCheckmark: currentSectionId == nil || currentSectionId == ""
            ) { actions.onMove(""); onDismiss() }
        }
    }

    // MARK: - More Panel

    private var morePanel: some View {
        VStack(spacing: 0) {
            backHeader(String(localized: "context.more_options", defaultValue: "Plus d'options", bundle: .main))

            divider

            if capabilities.invite {
                actionRow(
                    icon: "person.badge.plus",
                    label: String(localized: "context.invite_friends", defaultValue: "Inviter mes amis", bundle: .main)
                ) { actions.onInvite(); onDismiss() }
                separator
            }

            actionRow(
                icon: isLocked ? "lock.open.fill" : "lock.fill",
                label: isLocked
                    ? String(localized: "context.unlock", defaultValue: "Déverrouiller", bundle: .main)
                    : String(localized: "context.lock", defaultValue: "Verrouiller", bundle: .main)
            ) { actions.onLock(); onDismiss() }

            separator

            if canToggleArchive {
                actionRow(
                    icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
                    label: isArchived
                        ? String(localized: "context.unarchive", defaultValue: "Désarchiver", bundle: .main)
                        : String(localized: "context.archive", defaultValue: "Archiver", bundle: .main)
                ) { actions.onArchive(); onDismiss() }
            }

            if isBlockableDM {
                divider
                actionRow(
                    icon: isBlocked ? "hand.raised.slash.fill" : "hand.raised.fill",
                    label: isBlocked
                        ? String(localized: "context.unblock", defaultValue: "Débloquer", bundle: .main)
                        : String(localized: "context.block", defaultValue: "Bloquer", bundle: .main),
                    isDestructive: !isBlocked
                ) { actions.onBlock(); onDismiss() }
            }

            if capabilities.report || capabilities.adminOpen {
                divider
            }

            if capabilities.report {
                actionRow(icon: Self.reportIcon, label: Self.reportLabel) { actions.onReport(); onDismiss() }
            }

            if capabilities.adminOpen {
                if capabilities.report { separator }
                actionRow(icon: Self.adminOpenIcon, label: Self.adminOpenLabel) { actions.onOpenAdmin(); onDismiss() }
            }

            // RETRAIT FOCAL iOS (2026-08-18) : l'item « Focal (bêta) »
            // (I-075) est retiré avec le mode — Script est le mode nominal.
            // Le paramètre `onOpenFocalBetaPreview` reste dans l'API (site
            // d'appel inchangé) mais n'est plus jamais monté.
        }
    }

    // MARK: - VoiceOver — les entrées en actions nommées (#11215)

    /// Les entrées du menu, à plat, dans l'ordre où elles se lisent : chacune
    /// fait ce que fait sa rangée visible, puis ferme le menu.
    var accessibilityEntries: [ConversationMenuAccessibilityEntry] {
        let pin = isPinned
            ? String(localized: "context.unpin", defaultValue: "Désépingler", bundle: .main)
            : String(localized: "context.pin", defaultValue: "Épingler", bundle: .main)
        let mute = isMuted
            ? String(localized: "context.unmute", defaultValue: "Réactiver les notifications", bundle: .main)
            : String(localized: "context.mute", defaultValue: "Mettre en silence", bundle: .main)
        let read = hasUnread
            ? String(localized: "context.mark_read", defaultValue: "Marquer comme lu", bundle: .main)
            : String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu", bundle: .main)
        let lock = isLocked
            ? String(localized: "context.unlock", defaultValue: "Déverrouiller", bundle: .main)
            : String(localized: "context.lock", defaultValue: "Verrouiller", bundle: .main)
        let archive = isArchived
            ? String(localized: "context.unarchive", defaultValue: "Désarchiver", bundle: .main)
            : String(localized: "context.archive", defaultValue: "Archiver", bundle: .main)
        let block = isBlocked
            ? String(localized: "context.unblock", defaultValue: "Débloquer", bundle: .main)
            : String(localized: "context.block", defaultValue: "Bloquer", bundle: .main)
        let entries: [ConversationMenuAccessibilityEntry?] = [
            entry("pin", pin, actions.onPin),
            entry("mute", mute, actions.onMute),
            entry("read", read, actions.onMarkReadToggle),
            entry("details", String(localized: "context.details", defaultValue: "Détails", bundle: .main), actions.onDetails),
            entry("rename", String(localized: "context.rename", defaultValue: "Renommer", bundle: .main), actions.onRename, when: capabilities.rename),
            entry("invite", String(localized: "context.invite_friends", defaultValue: "Inviter mes amis", bundle: .main), actions.onInvite, when: capabilities.invite),
            entry("lock", lock, actions.onLock),
            entry("archive", archive, actions.onArchive, when: canToggleArchive),
            entry("block", block, actions.onBlock, when: isBlockableDM),
            entry("report", Self.reportLabel, actions.onReport, when: capabilities.report),
            entry("adminOpen", Self.adminOpenLabel, actions.onOpenAdmin, when: capabilities.adminOpen),
            entry("leave", Self.leaveLabel, actions.onLeave, when: capabilities.leave),
            entry("removal", Self.removalLabel(capabilities.removal ?? .delete), actions.onDelete, when: capabilities.removal != nil)
        ]
        return entries.compactMap { $0 }
    }

    /// Une entrée qui fait ce que fait sa rangée visible, puis ferme le menu.
    private func entry(
        _ id: String,
        _ label: String,
        _ action: @escaping () -> Void,
        when shown: Bool = true
    ) -> ConversationMenuAccessibilityEntry? {
        guard shown else { return nil }
        let close = onDismiss
        return ConversationMenuAccessibilityEntry(id: id, label: label, perform: { action(); close() })
    }

    // MARK: - Libellés partagés avec le menu natif

    static let leaveIcon = "rectangle.portrait.and.arrow.right"
    static let reportIcon = "exclamationmark.bubble"
    static let adminOpenIcon = "checkmark.shield"

    static var leaveLabel: String {
        String(localized: "context.leave_group", defaultValue: "Quitter le groupe", bundle: .main)
    }

    static var reportLabel: String {
        String(localized: "context.report", defaultValue: "Signaler", bundle: .main)
    }

    static var adminOpenLabel: String {
        String(localized: "context.admin_open", defaultValue: "Ouvrir dans l'administration", bundle: .main)
    }

    static func removalIcon(_ removal: ConversationRowMenuCapabilities.Removal) -> String {
        switch removal {
        case .delete: return "trash"
        case .hide: return "eye.slash"
        }
    }

    static func removalLabel(_ removal: ConversationRowMenuCapabilities.Removal) -> String {
        switch removal {
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .hide: return String(localized: "context.hide_chat", defaultValue: "Masquer la discussion", bundle: .main)
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
            HStack(spacing: MeeshySpacing.mdPlus) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: iconColumnWidth)
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize))
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if showsCheckmark {
                    Image(systemName: "checkmark")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                }
                if showsChevron {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .opacity(0.4)
                }
            }
            .foregroundStyle(tint)
            .padding(.horizontal, MeeshySpacing.lg)
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
            HStack(spacing: MeeshySpacing.smPlus) {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: iconColumnWidth)
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                Spacer(minLength: 0)
            }
            .foregroundStyle(accent)
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: rowMinHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuRowHighlightButtonStyle())
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
    }

    private var separator: some View {
        Divider().overlay(accent.opacity(MeeshyOpacity.subtle)).padding(.leading, 52)
    }

    private var divider: some View {
        Divider().overlay(accent.opacity(MeeshyOpacity.light))
    }
}

// MARK: - Les gestes du menu d'une rangée (#11215)

/// UNE closure par entrée du menu d'une rangée, construite une fois par la
/// liste (`ConversationRowMenuActions.make`) et appelée par les DEUX chemins
/// d'OS : le menu natif iOS 26 et ce menu custom de repli ne réécrivent plus
/// chacun la même logique. Les entrées destructives arment une confirmation,
/// jamais l'effet.
struct ConversationRowMenuActions {
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
    let onLeave: () -> Void
    let onReport: () -> Void
    let onOpenAdmin: () -> Void
}

// MARK: - Entrée VoiceOver

/// Une entrée du menu exposée à VoiceOver comme action nommée (#11215).
struct ConversationMenuAccessibilityEntry: Identifiable {
    let id: String
    let label: String
    let perform: () -> Void
}

// MARK: - Row Highlight (parité menus système)

/// Highlight de la row sous le doigt — les menus contextuels système (UIMenu,
/// Liquid Glass iOS 26 compris) surlignent la ligne pressée ; `.plain` ne
/// donnait aucun feedback. `Color.primary` suit automatiquement dark/light,
/// comme le highlight natif.
///
/// Type **interne partagé** (2026-07-14) : le menu d'appui long des MESSAGES
/// (`MessageActionsMenu`) l'applique aussi pour aligner sa liste d'actions sur
/// le design système par version d'iOS — même parité UIMenu / Liquid Glass que
/// le menu des lignes de conversation. Un seul style, deux consommateurs.
struct MenuRowHighlightButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.primary.opacity(MeeshyOpacity.subtle) : Color.clear)
    }
}
