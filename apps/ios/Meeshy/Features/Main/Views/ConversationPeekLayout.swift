import CoreGraphics

/// Les deux crans du menu d'appui long d'une conversation (#17242) : au repos
/// le menu est COMPACT (poignée + tête Épingler · Sourdine · Lu) et la carte
/// d'aperçu prend la plus grande part de l'écran ; tiré vers le haut, il est
/// ÉTENDU et montre toutes ses actions, la carte se réduisant d'autant.
nonisolated enum ConversationPeekDetent: Equatable, Sendable {
    case compact
    case expanded

    var progress: CGFloat { self == .compact ? 0 : 1 }

    var toggled: ConversationPeekDetent { self == .compact ? .expanded : .compact }

    /// Le cran d'ouverture : ÉTENDU quand toutes les actions doivent être
    /// atteignables sans le geste (lecteur d'écran, Réduire les animations).
    static func opening(prefersAllActions: Bool) -> ConversationPeekDetent {
        prefersAllActions ? .expanded : .compact
    }
}

/// Ce qu'un glissement sur la CARTE pilote : le cran du menu, ou le morph de
/// la carte en pastille qu'on dépose sur une section (glisser vers le bas
/// depuis le cran compact — le geste historique du menu custom).
nonisolated enum ConversationPeekCardRoute: Equatable, Sendable {
    case detent
    case chipMorph

    static func resolve(startDetent: ConversationPeekDetent, translation: CGFloat) -> ConversationPeekCardRoute {
        startDetent == .compact && translation > 0 ? .chipMorph : .detent
    }
}

/// Glisser la carte vers le BAS depuis le cran compact (#17258) : la carte
/// suit le doigt et se résorbe en pastille ; lâchée au-delà de 79 % de la
/// course (position PROJETÉE, la vélocité comprise), l'aperçu se ferme ;
/// en deçà — ou ramenée vers le haut avant le lâcher — elle revient en place.
/// Une fois la pastille VERROUILLÉE (course entière), le lâcher la dépose.
nonisolated enum ConversationPeekPullDown {
    static let morphDistance: CGFloat = 140
    static let dismissDistance: CGFloat = 110

    enum Release: Equatable, Sendable {
        case restore
        case dismiss
        case drop
    }

    static func progress(translation: CGFloat) -> CGFloat {
        min(1, max(0, translation / morphDistance))
    }

    static func release(predictedEndTranslation: CGFloat, isLatched: Bool) -> Release {
        if isLatched { return .drop }
        return predictedEndTranslation >= dismissDistance ? .dismiss : .restore
    }
}

/// La loi de dimensionnement de l'aperçu d'appui long (#17242), pure : une
/// progression 0 → 1 pilote les DEUX hauteurs (menu qui grandit, carte qui se
/// réduit d'autant), et la levée du doigt conclut vers le cran le plus proche
/// de la position projetée (seuil à mi-course, la vélocité comprise).
nonisolated struct ConversationPeekLayout: Equatable, Sendable {
    static let sideMargin: CGFloat = 12
    static let maximumWidth: CGFloat = 560
    static let spacing: CGFloat = 12
    /// La carte réduite garde quelques messages lisibles (elle n'a pas d'en-tête).
    static let minimumCardHeight: CGFloat = 150
    static let settleThreshold: CGFloat = 0.5
    /// Le voile reste VISIBLE au-dessus de la carte (#17258) : une bande qu'on
    /// voit et qu'on touche pour fermer, jamais une marge de quelques points.
    static let veilBandFraction: CGFloat = 0.1
    static let minimumVeilBand: CGFloat = 56
    static let maximumVeilBand: CGFloat = 120

    /// La bande de voile laissée au-dessus de la carte, pour une hauteur offerte.
    static func veilBand(forHeight height: CGFloat) -> CGFloat {
        min(maximumVeilBand, max(minimumVeilBand, height * veilBandFraction))
    }

    /// La hauteur offerte à la carte, à l'espacement et au menu réunis.
    let availableHeight: CGFloat
    let availableWidth: CGFloat
    /// Poignée + tête compacte du catalogue, mesurées.
    let compactMenuHeight: CGFloat
    /// Poignée + tout le contenu du panneau affiché, mesurés.
    let naturalMenuHeight: CGFloat

    var cardWidth: CGFloat {
        max(0, min(Self.maximumWidth, availableWidth - 2 * Self.sideMargin))
    }

    /// Le menu étendu montre tout son contenu, sans jamais réduire la carte
    /// sous quelques messages lisibles ; au-delà, son contenu défile.
    var expandedMenuHeight: CGFloat {
        let ceiling = availableHeight - Self.spacing - Self.minimumCardHeight
        return max(compactMenuHeight, min(naturalMenuHeight, ceiling))
    }

    var menuOverflows: Bool { naturalMenuHeight > expandedMenuHeight + 0.5 }

    /// La course du geste, en points : ce que le menu gagne de compact à étendu.
    var travel: CGFloat { max(0, expandedMenuHeight - compactMenuHeight) }

    func menuHeight(progress: CGFloat) -> CGFloat {
        compactMenuHeight + Self.clamped(progress) * travel
    }

    func cardHeight(progress: CGFloat) -> CGFloat {
        max(0, availableHeight - Self.spacing - menuHeight(progress: progress))
    }

    /// La progression sous le doigt : tirer vers le HAUT (translation
    /// négative) étend, vers le bas replie ; revenir au point de départ
    /// restaure le cran d'où le geste est parti.
    func progress(from start: ConversationPeekDetent, translation: CGFloat) -> CGFloat {
        guard travel > 0 else { return start.progress }
        return Self.clamped(start.progress - translation / travel)
    }

    /// Le cran conclu au lâcher, depuis la position PROJETÉE (la vélocité y
    /// est déjà) : au-delà de la mi-course, étendu ; en deçà, compact.
    func settle(from start: ConversationPeekDetent, predictedEndTranslation: CGFloat) -> ConversationPeekDetent {
        guard travel > 0 else { return start }
        let projected = progress(from: start, translation: predictedEndTranslation)
        return projected >= Self.settleThreshold ? .expanded : .compact
    }

    private static func clamped(_ value: CGFloat) -> CGFloat {
        min(1, max(0, value))
    }
}
