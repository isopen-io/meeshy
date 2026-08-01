import Foundation

/// Entrées BRUTES du chrome du composer, réunies en une valeur pure.
///
/// L'ancienne politique prenait 6 paramètres dont un à valeur par défaut ; elle
/// était appelée à deux endroits avec des arguments DIFFÉRENTS — le header
/// passait l'état brut du band, les FABs son état effectif — tout en
/// documentant « les MÊMES conditions ». C'était la seconde vérité du chrome.
/// Un contexte unique, construit à un seul endroit
/// (`StoryComposerView+Chrome.swift`), rend la divergence inexprimable : aucune
/// signature ne permet plus d'omettre un terme.
public nonisolated struct ComposerChromeContext: Equatable, Sendable {
    /// État BRUT de `BandStateMachine` — jamais lu directement par les
    /// consommateurs, qui passent par `effectiveBandState`.
    public let machineState: BandState
    public let isChromeHidden: Bool
    public let isTextEditing: Bool
    public let isDrawingActive: Bool
    public let isDrawingImmersive: Bool
    public let isViewportZoomed: Bool
    public let isTimelineVisible: Bool
    /// La slide COURANTE est une page blanche d'auteur (S5) : aucun contenu sur
    /// CETTE slide, mode création, aucun bandeau de reprise en attente. SLIDE-scoped
    /// et non composer-wide : une 2ᵉ slide fraîche derrière une 1ʳᵉ remplie a
    /// exactement l'apparence de l'écran d'ouverture, donc exactement les mêmes
    /// affordances — sinon le même geste au même pixel changerait de sens sans
    /// aucun signal. Composé par `ComposerChromePolicy.isBlankAuthoringSlide`.
    public let isBlankAuthoringSlide: Bool
    /// Le bandeau de reprise de brouillon est posé. Il n'est plus MODAL (S5) : le
    /// canvas reste interactif derrière, et toute interaction avec lui range le
    /// bandeau — d'où la nécessité de le voir depuis la politique du tap.
    public let isDraftResumePresented: Bool

    public init(
        machineState: BandState,
        isChromeHidden: Bool,
        isTextEditing: Bool,
        isDrawingActive: Bool,
        isDrawingImmersive: Bool,
        isViewportZoomed: Bool,
        isTimelineVisible: Bool,
        isBlankAuthoringSlide: Bool = false,
        isDraftResumePresented: Bool = false
    ) {
        self.machineState = machineState
        self.isChromeHidden = isChromeHidden
        self.isTextEditing = isTextEditing
        self.isDrawingActive = isDrawingActive
        self.isDrawingImmersive = isDrawingImmersive
        self.isViewportZoomed = isViewportZoomed
        self.isTimelineVisible = isTimelineVisible
        self.isBlankAuthoringSlide = isBlankAuthoringSlide
        self.isDraftResumePresented = isDraftResumePresented
    }

    /// État RÉELLEMENT affiché du band — ex-`ComposerControlsLayer.
    /// resolveEffectiveBandState`, déplacé ici parce que la politique de chrome,
    /// le carding du canvas et l'ouverture du band doivent lire la MÊME
    /// résolution. Ordre de priorité inchangé : dessin liste > dessin immersif >
    /// timeline > machine.
    ///
    /// Mode dessin LISTE : band forcé sur la liste des traits tant qu'on n'est
    /// pas immersif. `isDrawingImmersive` masque le band entièrement, priorité
    /// absolue. Timeline : force son panneau UNIQUEMENT quand la machine est
    /// `.hidden` — si un autre outil est déjà ouvert (chip de switch), on ne
    /// réécrase pas ce choix.
    public var effectiveBandState: BandState {
        if isDrawingActive, !isDrawingImmersive, machineState == .hidden {
            return .toolPanel(.drawing)
        }
        if isDrawingImmersive { return .hidden }
        if isTimelineVisible, machineState == .hidden {
            return .toolPanel(.timeline)
        }
        return machineState
    }

    public var isBandHidden: Bool { effectiveBandState == .hidden }

    /// Outil dont le panneau est EFFECTIVEMENT ouvert. `nil` quand le band est
    /// replié ou affiche un panneau de format.
    public var activeBandTool: StoryToolMode? {
        if case .toolPanel(let tool) = effectiveBandState { return tool }
        return nil
    }
}

/// Issue d'un tap sur le fond du canvas — cinq cas, aucun implicite.
public nonisolated enum ComposerBackgroundTapAction: Equatable, Sendable {
    /// Un éditeur possède le canvas (texte inline, dessin, zoom, timeline).
    case ignore
    /// Bandeau de reprise de brouillon posé : le canvas le RANGE (S5). Le
    /// brouillon n'est pas jeté — seul « Recommencer » le jette.
    case dismissDraftResume
    /// Page blanche d'auteur, chrome plein : toute la surface du canvas est le
    /// bouton « écrire » (S5). Plus généreux qu'un bouton, sans coût de hauteur.
    case startTextComposition
    /// Rien d'ouvert : masquer / révéler le chrome (critère D4).
    case toggleChrome
    /// Un panneau est ouvert : « tap hors zone » le ferme (standard SOTA).
    case dismissPanel
}

/// Ce qu'il faut EFFACER pour fermer le panneau actif, plus le contexte qui en
/// résulte. Extrait en valeur pour que la sortie de panneau soit testable de
/// bout en bout : la vue n'en est qu'un applicateur trivial, et vérifier que le
/// code est ÉCRIT (grep) ne prouve pas qu'il PRODUIT le bon état.
public nonisolated struct ComposerDismissOutcome: Equatable, Sendable {
    public let clearActiveTool: Bool
    public let clearTimeline: Bool
    public let clearSelection: Bool
    public let resultingContext: ComposerChromeContext
}

/// Règle UNIQUE de visibilité du chrome plein du composer (C-DIR2, directive
/// user 2026-07-04) : le header (X / strip / visibilité / preview / Publier / ⋯)
/// et la colonne annuler/rétablir apparaissent sous les MÊMES conditions que la
/// colonne de FABs — canvas plein écran, aucun panneau ouvert, aucune édition en
/// cours, pas de zoom viewport. Pendant l'édition, le chrome est inutile : on
/// n'affiche que ce qui sert à l'instant t.
public nonisolated enum ComposerChromePolicy {

    public static func fullChromeVisible(_ ctx: ComposerChromeContext) -> Bool {
        // Les trois derniers termes restent explicites malgré `isBandHidden` : le
        // dessin immersif force le band à `.hidden` tout en devant garder le
        // chrome masqué — les supprimer réintroduirait le header pendant le tracé.
        !ctx.isChromeHidden
            && ctx.isBandHidden
            && !ctx.isTextEditing
            && !ctx.isDrawingActive
            && !ctx.isViewportZoomed
            && !ctx.isTimelineVisible
    }

    /// La slide REGARDÉE est une page blanche d'auteur : c'est ce prédicat, et
    /// jamais `composerHasContent` (composer-wide, qui répond « y a-t-il de quoi
    /// publier » et reste vrai dès qu'une AUTRE slide porte du contenu), qui arme
    /// les amorces et le tap-pour-écrire. Volontairement SANS terme `activeTool == nil` :
    /// `addText()` pose `activeTool = .text` et `exitTextEditingMode()` ne le
    /// remet jamais à `nil`, si bien qu'une saisie annulée sur une page redevenue
    /// blanche ferait disparaître les amorces À JAMAIS. Les états où un outil est
    /// réellement en cours sont déjà couverts par `fullChromeVisible`.
    public static func isBlankAuthoringSlide(
        currentSlideIsEmpty: Bool,
        isEditingExistingStory: Bool,
        isDraftResumePresented: Bool
    ) -> Bool {
        currentSlideIsEmpty && !isEditingExistingStory && !isDraftResumePresented
    }

    /// Les trois amorces (indice « Touchez pour écrire », Caméra, dernière photo)
    /// ne vivent QUE sur une page blanche au repos.
    ///
    /// `isPartialSystemSheetPresented` reste un terme à part : la sheet
    /// « Transitions » s'ouvre depuis l'overflow SANS ouvrir le band, donc
    /// `fullChromeVisible` y reste vrai et les amorces dépasseraient au-dessus du
    /// bord de la sheet (le « fantôme » que l'ancien picker documentait déjà).
    public static func offersContentStarters(
        _ ctx: ComposerChromeContext,
        isPartialSystemSheetPresented: Bool
    ) -> Bool {
        ctx.isBlankAuthoringSlide
            && fullChromeVisible(ctx)
            && !isPartialSystemSheetPresented
    }

    /// Le bandeau de reprise n'appartient qu'au canvas AU REPOS — même règle que
    /// les amorces, et pour la même raison géométrique : posé en overlay bas, il
    /// se retrouverait AU-DESSUS du panneau d'outil qui vient de s'ouvrir (band
    /// déployée ≈ 300 pt depuis le bas).
    ///
    /// Le tap sur le canvas le range déjà (`.dismissDraftResume`), mais ce n'est
    /// pas le seul geste d'authoring : taper un FAB, ouvrir le panneau Média,
    /// insérer une photo ou entrer en édition texte en sont aussi. Cette règle
    /// les couvre tous d'un seul terme — « le chrome plein n'est plus visible ».
    /// Ranger n'est toujours pas jeter : le brouillon reste en magasin tant que
    /// rien de réel ne le supplante (`mayOverwriteStoredDraft`).
    public static func rangesDraftResumeBanner(_ ctx: ComposerChromeContext) -> Bool {
        ctx.isDraftResumePresented && !fullChromeVisible(ctx)
    }

    /// Le tap sur le fond n'est émis que si le hit-test du canvas n'a trouvé
    /// AUCUN élément (`StoryCanvasUIView+Gestures`) : aucune désélection n'est
    /// perdue par ce routage.
    ///
    /// Ordre NON commutatif — chaque garde protège la suivante :
    /// éditeurs > bandeau brouillon > panneau ouvert > page blanche > immersion.
    public static func backgroundTapAction(_ ctx: ComposerChromeContext) -> ComposerBackgroundTapAction {
        // Un éditeur possède le canvas : le tap lui appartient (fin d'édition
        // texte, désélection d'un trait, recentrage sous zoom, scrub timeline).
        if ctx.isTextEditing || ctx.isDrawingActive || ctx.isDrawingImmersive
            || ctx.isViewportZoomed || ctx.isTimelineVisible {
            return .ignore
        }
        // Bandeau de reprise posé : le canvas est interactif derrière lui, et
        // c'est justement cette interaction qui le range. Rien n'est jeté.
        if ctx.isDraftResumePresented { return .dismissDraftResume }
        // Panneau ouvert (état EFFECTIF : le dessin liste et la timeline forcent
        // un panneau alors que la machine reste `.hidden`) : le fermer d'abord —
        // jamais créer un texte par-dessus.
        if !ctx.isBandHidden { return .dismissPanel }
        // Page blanche + chrome plein : écrire. Chrome MASQUÉ = surface nue
        // voulue → on la restaure d'abord (D4, aucun cul-de-sac).
        if ctx.isBlankAuthoringSlide, !ctx.isChromeHidden { return .startTextComposition }
        return .toggleChrome
    }

    /// Fermeture du panneau actif, QUEL QUE SOIT le chemin. Les trois effacements
    /// sont indispensables : sans eux `effectiveBandState` re-forcerait aussitôt
    /// le panneau (c'est ainsi que le chevron « Retour » du panneau DESSIN était
    /// un no-op visuel). Le contexte résultant rend le chrome de façon
    /// inconditionnelle — une sortie de panneau ne laisse JAMAIS l'écran nu.
    public static func dismissing(_ ctx: ComposerChromeContext) -> ComposerDismissOutcome {
        let clearSelection: Bool
        if case .formatPanel = ctx.machineState { clearSelection = true } else { clearSelection = false }
        let clearActiveTool = ctx.isDrawingActive
        let clearTimeline = ctx.isTimelineVisible
        // Depuis S5 il n'y a plus de picker d'état vide à faire réapparaître : la
        // barre d'outils standard est montée EN PERMANENCE, donc la poignée de
        // restauration du chrome existe toujours dans l'arbre. Le seul état qui
        // survit à la sortie de panneau est la blancheur de la slide — elle
        // décide du retour des amorces, pas d'un changement de branche d'arbre.
        //
        // Le bandeau de reprise, lui, a été rangé à l'OUVERTURE du panneau
        // (`rangesDraftResumeBanner`, appliqué par `rangeDraftResumeBannerIfNeeded`
        // dès que le chrome plein disparaît) : le reporter posé décrirait un état
        // que la vue n'atteint jamais. Ranger n'est pas jeter — le brouillon reste
        // en magasin et la même offre revient à l'ouverture suivante.
        return ComposerDismissOutcome(
            clearActiveTool: clearActiveTool,
            clearTimeline: clearTimeline,
            clearSelection: clearSelection,
            resultingContext: ComposerChromeContext(
                machineState: .hidden,
                isChromeHidden: false,
                isTextEditing: ctx.isTextEditing,
                isDrawingActive: false,
                isDrawingImmersive: false,
                isViewportZoomed: ctx.isViewportZoomed,
                isTimelineVisible: false,
                isBlankAuthoringSlide: ctx.isBlankAuthoringSlide,
                isDraftResumePresented: false
            )
        )
    }

    /// Les chips « Arrière-plan » / « Premier plan » pilotent la MANIPULATION du
    /// canvas, pas le chrome : les assujettir à `fullChromeVisible` les retirerait
    /// dans leur état d'usage — panneau « Fond » ouvert, ou viewport zoomé sur le
    /// média d'arrière-plan. Le canvas reste hit-testable dans ces deux états
    /// (`canvasComposerLayer` ne coupe le hit-testing que pour le tracé immersif,
    /// `.allowsHitTesting(!isImmersiveDrawingSurface)`).
    ///
    /// Les chips ne sont montés que là où ils ont une FONCTION :
    /// `StoryCanvasUIView.resolveManipulationLayer(for:override:)` ne laisse
    /// l'override changer le résultat que si les DEUX couches portent du contenu ;
    /// avec une seule couche peuplée, l'auto-dérivation gagne et les chips sont
    /// décoratifs. Ils réapparaissent dès qu'un fond et un élément de premier plan
    /// coexistent — aucune affordance n'est retirée.
    public static func layerIndicatorVisible(
        _ ctx: ComposerChromeContext,
        hasBackgroundContent: Bool,
        hasForegroundContent: Bool
    ) -> Bool {
        hasBackgroundContent
            && hasForegroundContent
            && !ctx.isTextEditing
            && !ctx.isDrawingImmersive
            && !ctx.isChromeHidden
    }
}
