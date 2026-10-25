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

/// Menu contextuel custom pour une ligne de la liste de conversations — le
/// chemin de repli < iOS 26 du menu natif.
///
/// Il dessine le MÊME catalogue que le menu natif (`ConversationMenuCatalog`,
/// #11230) : la tête compacte Épingler · Sourdine · Lu en trois tuiles, puis
/// les groupes du catalogue dans son ordre, et cascade root → favorite / move /
/// more via un `enum Panel` local. Entièrement self-contained : tout l'état
/// passe par le catalogue et les paramètres, toutes les actions par
/// `ConversationRowMenuActions`. L'appelant est responsable de la fermeture
/// réelle (`onDismiss`).
struct ConversationContextMenuView: View {
    let accentHex: String
    /// Ce que le menu offre, dans l'ordre où il l'offre — le catalogue que le
    /// menu natif parcourt aussi : jamais une liste réécrite ici.
    let catalog: ConversationMenuCatalog
    // Contenu des sous-panneaux
    let currentReaction: String?
    let categories: [ConversationMenuCategory]
    let currentSectionId: String?
    /// Les gestes de chaque entrée, partagés avec le menu natif ; la fermeture
    /// est faite par l'appelant via `onDismiss`.
    let actions: ConversationRowMenuActions
    /// Le sous-menu « Mode de lecture », monté quand le catalogue l'offre.
    var readingModeMenu: LentilleReadingModeSubmenu? = nil
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
        // Toutes les entrées, favoris et destinations de « Déplacer vers »
        // compris, en actions NOMMÉES (#11215) : elles complètent l'action
        // « Ouvrir le menu » de la rangée. Chaque rangée visible reste un
        // bouton focalisable ; ces actions vivent sur le CONTENEUR, et leur
        // annonce depuis un enfant focalisé se recette sur appareil.
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
            // LA séquence de groupes du catalogue, la même que le menu natif
            // parcourt : aucun groupe ne s'énumère ici à la main.
            ForEach(catalog.groups) { group in
                switch group.section {
                case .header: headerTiles(group.entries)
                case .more:
                    divider
                    actionRow(
                        icon: ConversationMenuCatalog.moreSymbol,
                        label: ConversationMenuCatalog.moreLabel,
                        showsChevron: true
                    ) { navigate(to: .more) }
                case .reach, .organize, .departure: entryRows(group.entries)
                }
            }
        }
    }

    /// La tête compacte : Épingler, Sourdine et Lu côte à côte, comme le
    /// `ControlGroup` du menu natif.
    private func headerTiles(_ entries: [ConversationMenuEntry]) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(entries, id: \.self) { entry in
                Button {
                    select(entry)
                } label: {
                    VStack(spacing: MeeshySpacing.xs) {
                        Image(systemName: entry.symbol)
                            .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                            .symbolRenderingMode(.hierarchical)
                        Text(entry.label)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(accent)
                    .frame(maxWidth: .infinity, minHeight: rowMinHeight)
                    .padding(.vertical, MeeshySpacing.xs)
                    .contentShape(Rectangle())
                }
                .buttonStyle(MenuRowHighlightButtonStyle())
                .accessibilityLabel(entry.label)
                .accessibilityAddTraits(.isButton)
            }
        }
        .padding(.horizontal, MeeshySpacing.sm)
    }

    /// Les entrées que ce menu DESSINE : celles du catalogue, moins « Mode de
    /// lecture » quand aucun sous-menu n'est monté — jamais une rangée vide.
    func drawnEntries(_ entries: [ConversationMenuEntry]) -> [ConversationMenuEntry] {
        entries.filter { $0 != .readingMode || readingModeMenu != nil }
    }

    /// Un groupe du catalogue, ouvert par un trait plein, ses entrées séparées
    /// par un trait fin.
    @ViewBuilder
    private func entryRows(_ entries: [ConversationMenuEntry]) -> some View {
        let drawn = drawnEntries(entries)
        if !drawn.isEmpty {
            divider
        }
        ForEach(Array(drawn.enumerated()), id: \.element) { index, entry in
            if index > 0 { separator }
            entryRow(entry)
        }
    }

    @ViewBuilder
    private func entryRow(_ entry: ConversationMenuEntry) -> some View {
        if entry == .readingMode, let readingModeMenu {
            // Le sous-menu porte sa liste de modes ; son étiquette prend la
            // colonne d'icône et les marges des autres rangées, et le choix
            // ferme le menu (`onSelected`, câblé par la liste).
            readingModeMenu
                .labelStyle(MenuRowLabelStyle(iconColumnWidth: iconColumnWidth))
                .foregroundStyle(accent)
                .tint(accent)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(maxWidth: .infinity, minHeight: rowMinHeight, alignment: .leading)
                .contentShape(Rectangle())
        } else {
            actionRow(
                icon: entry.displayedSymbol(hasFavorite: currentReaction != nil),
                label: entry.label,
                isDestructive: entry.isDestructive,
                showsChevron: entry.opensSubmenu
            ) { select(entry) }
        }
    }

    /// Le toucher d'une entrée : un sous-menu s'ouvre, une action agit puis
    /// ferme le menu.
    private func select(_ entry: ConversationMenuEntry) {
        switch entry {
        case .favorite: navigate(to: .favorite)
        case .move: navigate(to: .move)
        default:
            ConversationRowMenuActions.feel(entry)
            actions.perform(entry)
            onDismiss()
        }
    }

    // MARK: - Favorite Panel

    private var favoritePanel: some View {
        VStack(spacing: 0) {
            backHeader(ConversationMenuEntry.favorite.label)

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
                ) { HapticFeedback.light(); actions.onRemoveFavorite(); onDismiss() }
            }
        }
    }

    // MARK: - Move Panel

    private var movePanel: some View {
        VStack(spacing: 0) {
            backHeader(ConversationMenuEntry.move.label)

            divider

            ForEach(Array(categories.enumerated()), id: \.element.id) { index, category in
                actionRow(
                    icon: category.icon,
                    label: category.name,
                    showsCheckmark: category.id == currentSectionId
                ) { HapticFeedback.light(); actions.onMove(category.id); onDismiss() }
                if index < categories.count - 1 {
                    separator
                }
            }

            divider

            actionRow(
                icon: "tray.fill",
                label: Self.inboxLabel,
                showsCheckmark: currentSectionId == nil || currentSectionId == ""
            ) { HapticFeedback.light(); actions.onMove(""); onDismiss() }
        }
    }

    // MARK: - More Panel

    private var morePanel: some View {
        VStack(spacing: 0) {
            backHeader(ConversationMenuCatalog.moreLabel)
            ForEach(Array(drawnEntries(catalog.more).enumerated()), id: \.element) { index, entry in
                if index == 0 { divider } else { separator }
                entryRow(entry)
            }
        }
    }

    // MARK: - VoiceOver — les entrées en actions nommées (#11215)

    /// Les entrées du menu, à plat, dans l'ordre du catalogue : chacune fait ce
    /// que fait sa rangée visible, puis ferme le menu. Les sous-menus y sont
    /// dépliés — chaque favori, chaque destination de « Déplacer vers ».
    var accessibilityEntries: [ConversationMenuAccessibilityEntry] {
        catalog.entries.flatMap { entry -> [ConversationMenuAccessibilityEntry] in
            switch entry {
            case .favorite: return favoriteEntries
            case .move: return moveEntries
            case .readingMode: return readingModeEntries
            default: return [self.entry(entry.rawValue, entry.label, { actions.perform(entry) })]
            }
        }
    }

    /// Le sous-menu « Mode de lecture », à plat : chaque mode qu'on peut
    /// choisir. Rien sans sous-menu monté — comme la rangée visible.
    private var readingModeEntries: [ConversationMenuAccessibilityEntry] {
        guard let readingModeMenu else { return [] }
        return readingModeMenu.selectableModes.map { mode in
            entry("readingMode.\(mode.id.rawValue)", Self.readingModeLabel(mode.title), { readingModeMenu.select(mode.id) })
        }
    }

    /// Le sous-panneau « Favori », à plat : les huit emojis, puis le retrait.
    private var favoriteEntries: [ConversationMenuAccessibilityEntry] {
        let removal: [ConversationMenuAccessibilityEntry] = currentReaction == nil ? [] : [
            entry("removeFavorite", String(localized: "context.remove_favorite", defaultValue: "Retirer le favori", bundle: .main), actions.onRemoveFavorite)
        ]
        return Self.favoriteEmojis.map { emoji in
            entry("favorite.\(emoji)", Self.favoriteLabel(emoji), { actions.onSetFavorite(emoji) })
        } + removal
    }

    /// Le sous-panneau « Déplacer vers », à plat : chaque section, puis « Mes conversations ».
    private var moveEntries: [ConversationMenuAccessibilityEntry] {
        categories.map { category in
            entry("move.\(category.id)", Self.moveLabel(category.name), { actions.onMove(category.id) })
        } + [
            entry("move.inbox", Self.moveLabel(Self.inboxLabel), { actions.onMove("") })
        ]
    }

    /// Une entrée qui fait ce que fait sa rangée visible, puis ferme le menu.
    private func entry(
        _ id: String,
        _ label: String,
        _ action: @escaping () -> Void
    ) -> ConversationMenuAccessibilityEntry {
        let close = onDismiss
        return ConversationMenuAccessibilityEntry(id: id, label: label, perform: { action(); close() })
    }

    // MARK: - Libellés des sous-panneaux

    static var inboxLabel: String {
        String(localized: "context.my_conversations", defaultValue: "Mes conversations", bundle: .main)
    }

    static func favoriteLabel(_ emoji: String) -> String {
        String(format: String(localized: "context.favorite_named", defaultValue: "Favori %@", bundle: .main), emoji)
    }

    /// « Mode de lecture, Focal » — deux libellés déjà traduits, sans clé de plus.
    static func readingModeLabel(_ mode: String) -> String {
        "\(ConversationMenuEntry.readingMode.label), \(mode)"
    }

    static func moveLabel(_ destination: String) -> String {
        String(format: String(localized: "context.move_to_named", defaultValue: "Déplacer vers %@", bundle: .main), destination)
    }

    /// Le libellé et le symbole de l'entrée qui retire — ceux du catalogue,
    /// relus par la confirmation de suppression.
    static func removalIcon(_ removal: ConversationRowMenuCapabilities.Removal) -> String {
        removalEntry(removal).symbol
    }

    static func removalLabel(_ removal: ConversationRowMenuCapabilities.Removal) -> String {
        removalEntry(removal).label
    }

    private static func removalEntry(_ removal: ConversationRowMenuCapabilities.Removal) -> ConversationMenuEntry {
        switch removal {
        case .delete: return .delete
        case .hide: return .hide
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
/// jamais l'effet. `perform(_:)` (`ConversationMenuCatalog.swift`) relie
/// chaque entrée du catalogue à SA closure.
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
    let onDetach: () -> Void
    let onSearch: () -> Void
    let onCall: () -> Void
    let onVideoCall: () -> Void
    let onGroupSettings: () -> Void
    /// « Gérer les membres » (#12631) : la fiche de la conversation, sur ses membres.
    let onManageMembers: () -> Void
}

// MARK: - Entrée VoiceOver

/// Une entrée du menu exposée à VoiceOver comme action nommée (#11215).
struct ConversationMenuAccessibilityEntry: Identifiable {
    let id: String
    let label: String
    let perform: () -> Void
}

// MARK: - Étiquette de rangée pour un sous-menu monté dans le menu custom

/// L'étiquette d'un `Menu` posé parmi les rangées du menu custom : même colonne
/// d'icône, même typographie, même chevron que `actionRow`.
private struct MenuRowLabelStyle: LabelStyle {
    let iconColumnWidth: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            configuration.icon
                .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                .symbolRenderingMode(.hierarchical)
                .frame(width: iconColumnWidth)
            configuration.title
                .font(MeeshyFont.relative(MeeshyFont.calloutSize))
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            Image(systemName: "chevron.forward")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .opacity(0.4)
        }
    }
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
