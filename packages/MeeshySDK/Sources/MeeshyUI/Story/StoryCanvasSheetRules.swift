import SwiftUI

// MARK: - Règles pures du cadrage du canvas d'édition
//
// Ne lisent que leurs entrées : aucune dépendance au composer. Les deux
// `static` de `StoryComposerView` ci-dessous restent l'adresse que les témoins
// et le composer unifié connaissent ; ils délèguent.

enum StoryCanvasSheetRules {
    /// Résolution pure de `canvasIsCarded`, extraite en `static` — même
    /// pattern que `resolveShouldShowEmptyStateLargePicker`. `effectiveBandIsHidden`
    /// lit l'état RÉSOLU (`ComposerChromeContext.isBandHidden`, S1), jamais
    /// l'état BRUT de `bandStateMachine.state` : sur les 6 chemins d'ouverture
    /// Timeline (`BandStateMachineTests.openTimeline*`) la machine peut rester
    /// `.hidden` tandis que `isTimelineVisible` force le panneau via l'override
    /// d'`effectiveBandState` — lire l'état brut ici referait carder le canvas
    /// par coïncidence (le terme `timelineActive` séparé compensait déjà ce
    /// trou côté `canvasIsCarded`, mais PAS côté `presentedSheetHeight`, cf.
    /// `resolvePresentedSheetHeight`). Plus besoin de ce terme redondant une
    /// fois l'état résolu passé directement à `StoryCanvasFraming.isCarded`
    /// (paramètre `timelineActive` gardé à son défaut `false`).
    static func isCarded(
        isTextEditing: Bool,
        effectiveBandIsHidden: Bool,
        drawingActive: Bool,
        presentedSystemSheetFraction: CGFloat?
    ) -> Bool {
        // L'édition texte garde le canvas plein écran, sheet système comprise.
        guard !isTextEditing else { return false }
        if StoryCanvasFraming.isCarded(
            bandPresent: !effectiveBandIsHidden,
            drawingActive: drawingActive,
            textActive: false
        ) {
            return true
        }
        return presentedSystemSheetFraction != nil
    }

    /// Résolution pure de `presentedSheetHeight`, extraite en `static` — même
    /// pattern que `resolveCanvasIsCarded`. AVANT le fix S4, le bloc de
    /// réserve mesurée restait derrière l'état BRUT
    /// (`bandStateMachine.state != .hidden`), sans le filet redondant qui
    /// sauvait `canvasIsCarded` : sur les 6 chemins d'ouverture Timeline la
    /// machine reste `.hidden` pendant que `effectiveBandIsHidden` (résolu)
    /// est `false`, donc cette fonction retournait `0` alors que
    /// `canvasIsCarded == true` — le canvas cardait à une taille trop grande,
    /// ses contrôles bas passant SOUS le panneau Timeline réellement rendu
    /// (~392-406pt, bug §0 du rapport terrain 2026-07-30).
    static func presentedSheetHeight(
        canvasIsCarded: Bool,
        effectiveBandIsHidden: Bool,
        measuredBandTopY: CGFloat,
        measuredBottomBandHeight: CGFloat,
        composerBandHeight: CGFloat,
        presentedSystemSheetFraction: CGFloat?,
        composerScreenHeight: CGFloat,
        /// **Ce que l'HÔTE occupe en bas** (#4361) — sa zone de saisie de
        /// description. Défaut `0` : un appelant qui l'ignore obtient le
        /// comportement d'avant, exactement.
        ///
        /// Elle entre par un `max`, comme les deux autres termes, et pour la
        /// même raison : ces réserves ne s'ADDITIONNENT pas. Band et saisie
        /// occupent le même bas d'écran ; les sommer ferait remonter le canvas
        /// deux fois trop haut le jour où les deux coexistent.
        hostBottomReservation: CGFloat = 0
    ) -> CGFloat {
        // La réserve de l'hôte vaut MÊME hors cardage : elle ne décrit pas un
        // panneau de l'atelier mais une zone que le meuble a réellement peinte
        // par-dessus. La retenir derrière `canvasIsCarded` laisserait la saisie
        // recouvrir un canvas plein écran — le défaut qu'on corrige.
        guard canvasIsCarded else { return min(composerScreenHeight * 0.85, max(0, hostBottomReservation)) }
        var height: CGFloat = 0
        if !effectiveBandIsHidden {
            // Réserve = distance du HAUT RÉEL de la band (coord globales,
            // `measuredBandTopY`) au bas de l'écran → le canvas se rétracte
            // EXACTEMENT jusqu'au haut visuellement rendu de la band, jamais
            // recouvert/tronqué (bug 2026-07-20 : la hauteur de layout
            // sous-estimait quand le contenu débordait son `.frame` ou restait
            // stale après resize). Fallback layout tant que `minY` pas encore
            // mesuré (premier frame).
            // `.greatestFiniteMagnitude` (sentinelle « band repliée ») EST fini,
            // donc `isFinite` ne suffit pas : on teste `< composerScreenHeight`
            // (un vrai haut de band est toujours dans l'écran).
            let hasBandTop = measuredBandTopY.isFinite && measuredBandTopY < composerScreenHeight
            let byTop = hasBandTop
                ? max(0, composerScreenHeight - measuredBandTopY)
                : max(composerBandHeight, measuredBottomBandHeight)
            height = max(height, byTop)
        }
        if let fraction = presentedSystemSheetFraction {
            height = max(height, composerScreenHeight * fraction)
        }
        height = max(height, max(0, hostBottomReservation))
        // Plafond de SÉCURITÉ (0.85 H) : jamais atteint par une band réaliste
        // (max ~60 % avec `composerBandMaxHeight`), il ne fait qu'empêcher un
        // `measuredBandTopY` transitoire aberrant (0 au montage) d'écraser le
        // canvas à néant. Le cap 0.70 précédent, lui, TRONQUAIT une band > 70 %.
        return min(composerScreenHeight * 0.85, height)
    }

    /// Cadre de la carte canvas : marges haute et basse, alignement vertical et
    /// ratio, résolus par `StoryCanvasFraming.resolve`.
    static func framing(
        viewport: CGSize,
        safeAreaTop: CGFloat,
        safeAreaBottom: CGFloat,
        chromeAtTop: Bool,
        presentedSheetHeight: CGFloat,
        canvasRatio: CGFloat,
        isCarded: Bool,
        headerRowHeight: CGFloat,
        sheetGap: CGFloat
    ) -> StoryCanvasFraming.Result {
        // BUG-4 (C-DIR4) : ne réserver la hauteur du header QUE s'il est
        // visible. Depuis C-DIR2 le header est masqué pendant l'édition —
        // garder ses 59 pt réservés faisait démarrer la carte cardée sous
        // un header FANTÔME (bande noire en haut, perçue « canvas coupé »,
        // capture user). Header caché → la carte monte sous la status bar.
        // L'édition texte ne carde plus le canvas : il n'y a donc plus rien
        // à réserver pour sa rangée haute, qui flotte par-dessus.
        // **`+ headerRowHeight` au #4124.** Le `max(safeTop, 59)` réservait la
        // ZONE SÛRE, pas la rangée : la barre haute FLOTTE au-dessus du
        // canvas, si bien qu'elle ne prélevait aucune hauteur — invisible
        // tant que le canvas était plein écran et que le chrome se posait
        // dessus par-dessus. Cardée, la carte démarrait 10 pt sous la barre,
        // mesuré à l'écran : le ✕ et le chip de type se posaient sur la
        // composition. Même raison que le plancher bas, à l'autre bout.
        let headerInset = chromeAtTop
            ? max(safeAreaTop, 59) + headerRowHeight + 12
            : safeAreaTop + 12
        // Marge basse minimale même sheet repliée → la carte reste détachée du bas du
        // viewport (et de la poignée), sinon elle touchait quasi le bord en collapse.
        //
        // **Le plancher passe de 16 à `bottomOverlayClearance` au #4124**, et
        // c'est le rail de FABs qui l'impose : il FLOTTE au-dessus du canvas,
        // donc il ne prélève aucune hauteur — tant que le repos ne cardait
        // pas, il flottait sur un canvas plein écran et personne ne s'en
        // plaignait. La carte cardée, elle, doit passer AU-DESSUS de lui,
        // sinon les six outils se posent sur la composition et la scène n'a
        // « pas d'espace en bas », à rebours de la directive.
        //
        // La MÊME constante que le bandeau de reprise de brouillon : deux
        // littéraux jumeaux finissent par diverger.
        let bottomInset = max(presentedSheetHeight, ComposerControlMetrics.bottomOverlayClearance)
            + max(safeAreaBottom, 0)
            + sheetGap
        // « L'import de l'image de fond impose le cadre et forme du Canvas » :
        // un fond paysage bascule le ratio en 16:9 (`currentCanvasRatio`), sinon
        // le canvas reste vertical 9:16 par défaut.
        return StoryCanvasFraming.resolve(.init(
            viewport: viewport,
            headerInset: headerInset,
            bottomInset: bottomInset,
            // Marge latérale : la carte canvas reste toujours détachée des bords du
            // viewport (spec user 2026-06-02 « une marge suffisante pour être distingué
            // du viewport »). Le DESSIN n'est plus concerné : il ne carde plus
            // (mode immersif 2026-07-11, canvas plein écran).
            sideInset: 14,
            state: isCarded ? .carded : .free,
            cardedCornerRadius: 22,
            // Carte PAYSAGE (16:9, courte) : `.bottom` — collée juste au-dessus
            // du sheet d'édition, elle « remonte » avec lui quand il grandit
            // (user 2026-07-20), letterbox flou (cf. `StoryCanvasLetterbox`) au-dessus.
            // Le sheet est plafonné (`presentedSheetHeight` → `maxSheetKeeping…`)
            // pour que la carte reste ENTIÈREMENT visible, jamais rognée.
            // PORTRAIT (9:16) : remplit la région → `.center` (aucun mou).
            //
            // **`presentedSheetHeight > 0` est ajouté au #4124**, et c'est la
            // condition que la règle de 2026-07-20 sous-entendait sans
            // pouvoir la dire : « remonter AVEC le sheet » n'a de sens que
            // s'il y en a un. Tant que le repos ne cardait pas, la question
            // ne se posait jamais — il n'y avait pas de carte au repos. Elle
            // se pose maintenant, et sans cette condition une carte paysage
            // se collerait en bas d'un écran vide, tout le mou en haut, à
            // rebours de « la scène au CENTRE ».
            verticalAlignment: canvasRatio > 1 && presentedSheetHeight > 0 ? .bottom : .center,
            canvasRatio: canvasRatio))
    }
}

extension StoryComposerView {
    static func resolveCanvasIsCarded(
        isTextEditing: Bool,
        effectiveBandIsHidden: Bool,
        drawingActive: Bool,
        presentedSystemSheetFraction: CGFloat?
    ) -> Bool {
        StoryCanvasSheetRules.isCarded(
            isTextEditing: isTextEditing,
            effectiveBandIsHidden: effectiveBandIsHidden,
            drawingActive: drawingActive,
            presentedSystemSheetFraction: presentedSystemSheetFraction
        )
    }

    static func resolvePresentedSheetHeight(
        canvasIsCarded: Bool,
        effectiveBandIsHidden: Bool,
        measuredBandTopY: CGFloat,
        measuredBottomBandHeight: CGFloat,
        composerBandHeight: CGFloat,
        presentedSystemSheetFraction: CGFloat?,
        composerScreenHeight: CGFloat,
        hostBottomReservation: CGFloat = 0
    ) -> CGFloat {
        StoryCanvasSheetRules.presentedSheetHeight(
            canvasIsCarded: canvasIsCarded,
            effectiveBandIsHidden: effectiveBandIsHidden,
            measuredBandTopY: measuredBandTopY,
            measuredBottomBandHeight: measuredBottomBandHeight,
            composerBandHeight: composerBandHeight,
            presentedSystemSheetFraction: presentedSystemSheetFraction,
            composerScreenHeight: composerScreenHeight,
            hostBottomReservation: hostBottomReservation
        )
    }
}
