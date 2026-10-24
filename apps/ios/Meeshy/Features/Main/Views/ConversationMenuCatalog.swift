import Foundation
import MeeshyUI

// MARK: - LE catalogue du menu d'une rangée de conversation (#11230)
//
// Le menu d'une rangée a deux chemins d'OS : le `.contextMenu` natif (iOS 26,
// Liquid Glass) et le menu custom de repli (`ConversationContextMenuView`).
// Chacun énumérait SES entrées, avec SES libellés et SES symboles, et ils
// divergeaient en silence. Ils parcourent désormais ce catalogue : la loi
// (`ConversationRowMenuCapabilities`, projection de `ConversationActionPolicy`)
// dit ce qui s'offre, le catalogue dit dans quel ordre et sous quel mot, et
// les deux chemins ne font plus que le dessiner.

/// Une entrée du menu d'une rangée — UN verbe, UN libellé, UN symbole (motif de
/// `MessageActionVerb`, #11234). Une bascule (épingler / désépingler) est deux
/// entrées : chacune dit ce que le geste FERA.
nonisolated enum ConversationMenuEntry: String, CaseIterable, Sendable {
    case pin, unpin, mute, unmute, markRead, markUnread
    case detach, search, call, videoCall
    case readingMode, details, groupSettings, rename, favorite, move
    case invite, lock, unlock, archive, unarchive, block, unblock, report, adminOpen
    case leave, delete, hide

    var label: String {
        switch self {
        case .pin: return String(localized: "context.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "context.unpin", defaultValue: "Désépingler", bundle: .main)
        case .mute: return String(localized: "context.mute", defaultValue: "Mettre en silence", bundle: .main)
        case .unmute: return String(localized: "context.unmute", defaultValue: "Réactiver les notifications", bundle: .main)
        case .markRead: return String(localized: "context.mark_read", defaultValue: "Marquer comme lu", bundle: .main)
        case .markUnread: return String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu", bundle: .main)
        case .detach: return String(localized: "window.detach.conversation", defaultValue: "Ouvrir dans une nouvelle fenêtre", bundle: .main)
        case .search: return String(localized: "context.search", defaultValue: "Rechercher", bundle: .main)
        case .call: return String(localized: "context.call", defaultValue: "Appeler", bundle: .main)
        case .videoCall: return String(localized: "context.video_call", defaultValue: "Appel vidéo", bundle: .main)
        case .readingMode: return String(localized: "lentille.mode.menu.title", defaultValue: "Mode de lecture", bundle: .main)
        case .details: return String(localized: "context.details", defaultValue: "Détails", bundle: .main)
        case .groupSettings: return String(localized: "context.group_settings", defaultValue: "Paramètres du groupe", bundle: .main)
        case .rename: return String(localized: "context.rename", defaultValue: "Renommer", bundle: .main)
        case .favorite: return String(localized: "context.favorite", defaultValue: "Favori", bundle: .main)
        case .move: return String(localized: "context.move_to", defaultValue: "Déplacer vers...", bundle: .main)
        case .invite: return String(localized: "context.invite_friends", defaultValue: "Inviter mes amis", bundle: .main)
        case .lock: return String(localized: "context.lock", defaultValue: "Verrouiller", bundle: .main)
        case .unlock: return String(localized: "context.unlock", defaultValue: "Déverrouiller", bundle: .main)
        case .archive: return String(localized: "context.archive", defaultValue: "Archiver", bundle: .main)
        case .unarchive: return String(localized: "context.unarchive", defaultValue: "Désarchiver", bundle: .main)
        case .block: return String(localized: "context.block", defaultValue: "Bloquer", bundle: .main)
        case .unblock: return String(localized: "context.unblock", defaultValue: "Débloquer", bundle: .main)
        case .report: return String(localized: "context.report", defaultValue: "Signaler", bundle: .main)
        case .adminOpen: return String(localized: "context.admin_open", defaultValue: "Ouvrir dans l'administration", bundle: .main)
        // Le titre de la confirmation de départ : un seul mot pour un seul
        // geste, groupe, conversation publique ou chaîne (#11215).
        case .leave: return String(localized: "conversation.info.leave.title", defaultValue: "Quitter la conversation", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        // « Masquer » pour un geste qui ne retire la discussion que de SA liste.
        case .hide: return String(localized: "context.hide_chat", defaultValue: "Masquer la discussion", bundle: .main)
        }
    }

    /// Nom SF Symbol.
    var symbol: String {
        switch self {
        case .pin: return "pin.fill"
        case .unpin: return "pin.slash.fill"
        case .mute: return "bell.slash.fill"
        case .unmute: return "bell.fill"
        case .markRead: return "envelope.open.fill"
        case .markUnread: return "envelope.badge.fill"
        case .detach: return "macwindow.badge.plus"
        case .search: return "magnifyingglass"
        case .call: return "phone.fill"
        case .videoCall: return "video.fill"
        case .readingMode: return "eye"
        case .details: return "info.circle.fill"
        case .groupSettings: return "gearshape.fill"
        case .rename: return "pencil"
        case .favorite: return "star"
        case .move: return "folder.fill"
        case .invite: return "person.badge.plus"
        case .lock: return "lock.fill"
        case .unlock: return "lock.open.fill"
        case .archive: return "archivebox.fill"
        case .unarchive: return "tray.and.arrow.up.fill"
        case .block: return "hand.raised.fill"
        case .unblock: return "hand.raised.slash.fill"
        case .report: return "exclamationmark.bubble"
        case .adminOpen: return "checkmark.shield"
        case .leave: return "rectangle.portrait.and.arrow.right"
        case .delete: return "trash"
        case .hide: return "eye.slash"
        }
    }

    /// Le symbole RENDU : l'étoile du favori se remplit quand un favori est posé.
    func displayedSymbol(hasFavorite: Bool) -> String {
        self == .favorite && hasFavorite ? "star.fill" : symbol
    }

    /// Les entrées qui retirent quelque chose — rendues en rouge par les deux chemins.
    var isDestructive: Bool {
        switch self {
        case .block, .leave, .delete, .hide: return true
        default: return false
        }
    }

    /// Les entrées qui ouvrent un sous-menu au lieu d'agir.
    var opensSubmenu: Bool {
        switch self {
        case .readingMode, .favorite, .move: return true
        default: return false
        }
    }

    /// Le retour haptique du geste : lourd pour ce qui retire, moyen pour ce
    /// qui change l'état de la conversation, léger pour le reste.
    var haptic: ConversationMenuHaptic {
        switch self {
        case .block, .unblock, .leave, .delete, .hide: return .heavy
        case .pin, .unpin, .call, .videoCall, .invite, .lock, .unlock, .archive, .unarchive: return .medium
        default: return .light
        }
    }
}

nonisolated enum ConversationMenuHaptic: Sendable {
    case light, medium, heavy
}

/// Les cinq sections du menu d'une rangée, dans l'ordre où elles se lisent.
nonisolated enum ConversationMenuSection: Sendable {
    case header, reach, organize, more, departure

    /// Un trait sépare la section de la précédente — sauf la tête, et ce qui
    /// la suit : le `ControlGroup` natif et les tuiles custom portent déjà
    /// leur propre séparation.
    var opensWithDivider: Bool {
        switch self {
        case .header, .reach: return false
        case .organize, .more, .departure: return true
        }
    }
}

/// Une section non vide du catalogue et ses entrées.
nonisolated struct ConversationMenuGroup: Equatable, Identifiable, Sendable {
    let section: ConversationMenuSection
    let entries: [ConversationMenuEntry]

    var id: ConversationMenuSection { section }
}

/// Le menu d'une rangée, en cinq groupes que les deux chemins posent dans le
/// même ordre :
/// - `header` — Épingler, Sourdine, Lu : la tête COMPACTE (un `ControlGroup`
///   sur le menu natif, trois tuiles sur le menu custom) ;
/// - `reach` — joindre la conversation autrement : fenêtre, recherche, appels ;
/// - `organize` — la regarder et la ranger ;
/// - `more` — « Plus d'options » ;
/// - `departure` — ce qui la retire, en dernier.
nonisolated struct ConversationMenuCatalog: Equatable, Sendable {

    /// Ce que le catalogue lit : les verdicts de la loi et l'état de la rangée.
    nonisolated struct Input: Equatable, Sendable {
        let capabilities: ConversationRowMenuCapabilities
        let isPinned: Bool
        let isMuted: Bool
        let hasUnread: Bool
        let isLocked: Bool
        let isArchived: Bool
        /// Faux pour Global d'un mineur, rangée d'office aux archives (#9929).
        let canToggleArchive: Bool
        /// `nil` : pas un direct à pair connu, donc personne à bloquer.
        let isPeerBlocked: Bool?
        /// L'appareil ouvre des fenêtres (iPad, Mac) — `DetachedWindowOpener`.
        let windowsAvailable: Bool
        /// Lentille ET modes de lecture allumés : un mode choisi ici serait
        /// ignoré à l'ouverture sinon (#6482).
        let offersReadingModes: Bool
    }

    let header: [ConversationMenuEntry]
    let reach: [ConversationMenuEntry]
    let organize: [ConversationMenuEntry]
    let more: [ConversationMenuEntry]
    let departure: [ConversationMenuEntry]

    /// LA séquence que les deux chemins d'OS parcourent : les sections non
    /// vides, dans l'ordre. Aucun chemin n'énumère ses groupes à la main, donc
    /// aucun ne peut en oublier un en silence.
    var groups: [ConversationMenuGroup] {
        [
            ConversationMenuGroup(section: .header, entries: header),
            ConversationMenuGroup(section: .reach, entries: reach),
            ConversationMenuGroup(section: .organize, entries: organize),
            ConversationMenuGroup(section: .more, entries: more),
            ConversationMenuGroup(section: .departure, entries: departure)
        ].filter { !$0.entries.isEmpty }
    }

    /// Toutes les entrées, dans l'ordre où elles se lisent.
    var entries: [ConversationMenuEntry] { groups.flatMap(\.entries) }

    static var moreLabel: String {
        String(localized: "context.more_options", defaultValue: "Plus d'options", bundle: .main)
    }

    static let moreSymbol = "ellipsis.circle.fill"

    static func make(_ input: Input) -> ConversationMenuCatalog {
        let law = input.capabilities
        return ConversationMenuCatalog(
            header: [
                input.isPinned ? .unpin : .pin,
                input.isMuted ? .unmute : .mute,
                input.hasUnread ? .markRead : .markUnread
            ],
            reach: offered([
                // Une fenêtre détachée monte le fil sans repasser par le PIN.
                (.detach, input.windowsAvailable && ConversationOpenRoute.mayDetach(isLocked: input.isLocked)),
                (.search, true),
                (.call, law.call),
                (.videoCall, law.videoCall)
            ]),
            organize: offered([
                (.readingMode, input.offersReadingModes),
                (.details, true),
                (.groupSettings, law.groupSettings),
                (.rename, law.rename),
                (.favorite, true),
                (.move, true)
            ]),
            more: offered([
                (.invite, law.invite),
                (input.isLocked ? .unlock : .lock, true),
                (input.isArchived ? .unarchive : .archive, input.canToggleArchive),
                (input.isPeerBlocked == true ? .unblock : .block, input.isPeerBlocked != nil),
                (.report, law.report),
                (.adminOpen, law.adminOpen)
            ]),
            departure: offered([
                (.leave, law.leave),
                (law.removal == .hide ? .hide : .delete, law.removal != nil)
            ])
        )
    }

    private static func offered(_ candidates: [(ConversationMenuEntry, Bool)]) -> [ConversationMenuEntry] {
        candidates.filter { $0.1 }.map { $0.0 }
    }
}

// MARK: - Un geste par entrée, le même sur les deux chemins

extension ConversationRowMenuActions {

    /// Le geste de `entry`. Les sous-menus (mode de lecture, favori, déplacer)
    /// n'agissent pas : leur chemin d'OS ouvre la liste qu'ils portent.
    func perform(_ entry: ConversationMenuEntry) {
        switch entry {
        case .pin, .unpin: onPin()
        case .mute, .unmute: onMute()
        case .markRead, .markUnread: onMarkReadToggle()
        case .detach: onDetach()
        case .search: onSearch()
        case .call: onCall()
        case .videoCall: onVideoCall()
        case .details: onDetails()
        case .groupSettings: onGroupSettings()
        case .rename: onRename()
        case .invite: onInvite()
        case .lock, .unlock: onLock()
        case .archive, .unarchive: onArchive()
        case .block, .unblock: onBlock()
        case .report: onReport()
        case .adminOpen: onOpenAdmin()
        case .leave: onLeave()
        case .delete, .hide: onDelete()
        case .readingMode, .favorite, .move: return
        }
    }

    /// Le retour haptique de l'entrée, joué avant son geste.
    static func feel(_ entry: ConversationMenuEntry) {
        switch entry.haptic {
        case .light: HapticFeedback.light()
        case .medium: HapticFeedback.medium()
        case .heavy: HapticFeedback.heavy()
        }
    }
}
