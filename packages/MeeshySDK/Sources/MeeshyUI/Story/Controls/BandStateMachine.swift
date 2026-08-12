import Foundation

// MARK: - Category & ElementKind

public nonisolated enum BandCategory: Equatable, Sendable {
    case media, son, text, drawing, filters, timeline, texture
}

public nonisolated enum BandElementKind: Equatable, Sendable {
    case text, media
}

// MARK: - BandState

public nonisolated enum BandState: Equatable, Sendable {
    case hidden
    case toolPanel(StoryToolMode)
    case formatPanel(BandElementKind, elementId: String)

    public var activeCategory: BandCategory? {
        switch self {
        case .hidden, .formatPanel: return nil
        case .toolPanel(let t): return t.bandCategory
        }
    }

    /// Whether the bottom band can be dragged via its grabber to resize and
    /// collapse to a handle (canvas-full) — for ANY tool panel, not just drawing.
    /// Historically only `.drawing` was resizable; the user wants the retract
    /// handle on every editing tool (2026-06-02). The format sub-panel and the
    /// hidden state keep their non-resizable behaviour.
    public var allowsCollapsibleDrawer: Bool {
        switch self {
        case .toolPanel: return true
        case .hidden, .formatPanel: return false
        }
    }
}

// MARK: - StoryToolMode.bandCategory

nonisolated extension StoryToolMode {
    /// Bridges the existing `StoryToolMode` enum to `BandCategory` for the new layer.
    public var bandCategory: BandCategory {
        switch self {
        case .media: return .media
        case .texture: return .texture
        case .audio: return .son
        case .drawing: return .drawing
        case .text: return .text
        case .filters: return .filters
        case .timeline: return .timeline
        }
    }

    /// Helper to convert category back to a default tool mode.
    public static func from(category: BandCategory) -> StoryToolMode {
        switch category {
        case .media: return .media
        case .texture: return .texture
        case .son: return .audio
        case .text: return .text
        case .drawing: return .drawing
        case .filters: return .filters
        case .timeline: return .timeline
        }
    }
}

// MARK: - BandStateMachine

public nonisolated struct BandStateMachine: Equatable, Sendable {
    public private(set) var state: BandState = .hidden

    /// Masquage VOLONTAIRE du chrome (swipe-down sur la barre d'outils, tap sur
    /// le fond du canvas au repos) : le seul état où l'écran est nu PAR DÉCISION
    /// de l'utilisateur, toujours réversible d'un tap. Vit ICI et non plus dans
    /// un `@State` de la vue pour que l'invariant
    ///
    ///     INV-1 : isChromeHidden == true ⟹ state == .hidden
    ///
    /// soit fermé par construction : c'est sa violation qui produisait un
    /// composer sans « Fermer » ni « Publier » après un « Retour » (bug terrain
    /// 2026-07-31 — le drapeau de la vue et l'état de la machine ne se parlaient
    /// pas, et « Retour » ne touchait que le second).
    public private(set) var isChromeHidden: Bool = false

    public init() {}

    public mutating func tapFAB(_ category: BandCategory) {
        switch state {
        case .hidden:
            open(.toolPanel(StoryToolMode.from(category: category)))
        case .toolPanel(let tool):
            if tool.bandCategory == category {
                open(.hidden)
            } else {
                open(.toolPanel(StoryToolMode.from(category: category)))
            }
        case .formatPanel:
            // Format panel takes precedence — tap on FAB does not interrupt it.
            break
        }
    }

    public mutating func swipeUpOnFAB(_ category: BandCategory) {
        // Force open (idempotent on same category).
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            open(.toolPanel(StoryToolMode.from(category: category)))
        }
    }

    public mutating func openFormatPanel(_ kind: BandElementKind, id: String) {
        open(.formatPanel(kind, elementId: id))
    }

    public mutating func tapTile(_ tool: StoryToolMode) {
        switch state {
        case .formatPanel:
            break  // formatPanel takes precedence
        default:
            open(.toolPanel(tool))
        }
    }

    public mutating func closeFormatPanel() {
        guard case .formatPanel = state else { return }
        closeAnyPanel()
    }

    public mutating func backFromToolPanel() {
        guard case .toolPanel = state else { return }
        closeAnyPanel()
    }

    public mutating func reset() {
        open(.hidden)
    }

    /// Intention UNIQUE d'ouverture de la Timeline — les 6 sites d'entrée (FAB
    /// tap/swipe-up, chip de switch `onTapTile`, tuile empty-state, bouton
    /// menu ⋯, bouton « Voir dans la Timeline » des lignes média/texte du
    /// panel) appellent tous CETTE fonction plutôt que de flipper
    /// `isTimelineVisible` chacun de son côté. Avant elle, chaque site
    /// exécutait une combinaison différente de mutations — le bouton
    /// média/texte (`onShowInTimeline`) ne touchait QUE le flag ViewModel,
    /// jamais la machine, si bien que depuis un panneau déjà ouvert
    /// (`.toolPanel(.media)`/`.toolPanel(.text)`) la garde
    /// `machineState == .hidden` d'`effectiveBandState` ne se déclenchait
    /// JAMAIS : le tap était un clic mort (challenge S4, attaque bloquante
    /// confirmée). `tapTile` porte déjà la priorité `.formatPanel` et
    /// l'idempotence ; `showChrome()` est répété ici avec la même
    /// justification que dans `dismissActiveBandPanel`
    /// (`StoryComposerView+Chrome.swift`) — l'ouvreur porte lui aussi le
    /// contrat « jamais d'écran nu », même si `tapTile`/`open()` le respecte
    /// déjà sur tous les chemins réels.
    public mutating func openTimeline(isTimelineVisible: inout Bool) {
        isTimelineVisible = true
        tapTile(.timeline)
        showChrome()
    }

    // MARK: - Sortie canonique

    /// Transition UNIQUE « fermer ce qui est ouvert », partagée par les quatre
    /// chemins de sortie (chevron « Retour », swipe-down sur le band, grabber
    /// tiré sous le minimum, tap sur le fond du canvas).
    ///
    /// Le chrome est rendu INCONDITIONNELLEMENT, y compris depuis `.hidden` :
    /// les overrides ViewModel (timeline, dessin) ouvrent un panneau EFFECTIF
    /// sans faire transiter la machine, donc « préserver un masquage volontaire »
    /// quand l'état brut est déjà `.hidden` rejouait l'écran nu depuis la tuile
    /// Timeline d'un composer vierge. Parité exacte avec l'ancien
    /// `areFabsVisible = true` inconditionnel du grabber.
    public mutating func closeAnyPanel() {
        state = .hidden
        isChromeHidden = false
    }

    // MARK: - Chrome

    /// Masquage volontaire — REFUSÉ tant qu'un panneau est ouvert (INV-1). Sans
    /// cette garde, quitter le panneau découvrait un écran sans aucune commande.
    public mutating func hideChrome() {
        guard state == .hidden else { return }
        isChromeHidden = true
    }

    public mutating func showChrome() {
        isChromeHidden = false
    }

    public mutating func toggleChrome() {
        isChromeHidden ? showChrome() : hideChrome()
    }

    /// Toute transition OUVRANTE efface le masquage volontaire : un panneau qui
    /// s'ouvre implique que l'utilisateur veut de nouveau voir ses commandes.
    private mutating func open(_ next: BandState) {
        state = next
        isChromeHidden = false
    }
}
