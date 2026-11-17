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

/// Ce qu'un glissement sur la CARTE pilote : vers le HAUT, le cran du menu ;
/// vers le BAS, le morph de la carte en pastille qu'on dépose sur une section,
/// quel que soit le cran — le menu reste tel qu'il était, et revient intact
/// si la carte est relâchée avant de décrocher.
nonisolated enum ConversationPeekCardRoute: Equatable, Sendable {
    case detent
    case chipMorph

    static func resolve(startDetent: ConversationPeekDetent, translation: CGFloat) -> ConversationPeekCardRoute {
        translation > 0 ? .chipMorph : .detent
    }
}

/// Glisser la carte vers le BAS depuis le cran compact (#17258, #18724) : la
/// carte RÉSISTE et se comprime vers la forme d'une rangée tant qu'elle tient ;
/// tirée franchement — la course entière, ou lancée —, elle DÉCROCHE en ligne
/// déplaçable qu'on dépose sur une section. Lâchée avant de décrocher au-delà
/// de 79 % de la course (position PROJETÉE, la vélocité comprise), l'aperçu se
/// ferme ; en deçà — ou ramenée vers le haut avant le lâcher — elle revient.
nonisolated enum ConversationPeekPullDown {
    static let morphDistance: CGFloat = 140
    static let dismissDistance: CGFloat = 110

    /// La traction qui décroche : la carte est devenue ligne au même point.
    static let detachDistance: CGFloat = morphDistance
    /// Une main qui lance franchement vers le bas, en points par seconde,
    /// décroche avant la course entière : elle a dit « déplace ».
    static let detachVelocity: CGFloat = 900
    /// En deçà, même rapide, ce n'est qu'un tremblement : rien ne décroche.
    static let flingFloor: CGFloat = 40
    /// La portée de l'élastique : la carte qui tient ne descend jamais plus
    /// bas, quelle que soit la course du doigt.
    static let elasticReach: CGFloat = 120
    /// La hauteur d'une rangée de la liste quand la ligne pressée est inconnue
    /// (rotor VoiceOver) : la carte se comprime encore vers une forme de ligne.
    static let fallbackRowHeight: CGFloat = 72
    /// La part de vitesse qu'iOS 16, sans vitesse servie, projette dans la fin
    /// prédite d'un glissement (décélération normale d'un défilement).
    static let predictionHorizon: CGFloat = 0.5

    enum Release: Equatable, Sendable {
        case restore
        case dismiss
        case drop
    }

    /// Où en est la traction : la carte TIENT (et se comprime d'autant) ou elle
    /// a DÉCROCHÉ — définitivement, le doigt pouvant remonter viser une section.
    enum Stage: Equatable, Sendable {
        case holding(CGFloat)
        case detached

        /// La compression vers la ligne : 1 dès que la carte a décroché.
        var progress: CGFloat {
            switch self {
            case .holding(let progress): return progress
            case .detached: return 1
            }
        }
    }

    static func progress(translation: CGFloat) -> CGFloat {
        min(1, max(0, translation / morphDistance))
    }

    static func stage(translation: CGFloat, velocity: CGFloat, isLatched: Bool = false) -> Stage {
        let flung = velocity >= detachVelocity && translation >= flingFloor
        guard isLatched || translation >= detachDistance || flung else {
            return .holding(progress(translation: translation))
        }
        return .detached
    }

    /// Le décrochage se joue à la PREMIÈRE étape détachée, jamais aux
    /// suivantes : c'est elle qui porte l'haptique, et une seule fois par geste.
    static func latches(wasLatched: Bool, stage: Stage) -> Bool {
        !wasLatched && stage == .detached
    }

    /// Le déplacement de la carte qui tient : `d · k / (k + d)`, croissant,
    /// chaque point de traction rendant moins que le précédent, borné par la
    /// portée de l'élastique — on tire fort avant que ça décroche.
    static func elasticTranslation(_ translation: CGFloat) -> CGFloat {
        guard translation > 0 else { return 0 }
        return translation * elasticReach / (elasticReach + translation)
    }

    /// Le décalage peint : élastique tant que la carte tient, le doigt un pour
    /// un une fois décrochée — l'écart entre les deux est le saut de la ligne.
    static func cardOffset(translation: CGFloat, isLatched: Bool) -> CGFloat {
        isLatched ? translation : elasticTranslation(translation)
    }

    /// La vitesse verticale qu'iOS 16 ne sert pas, retrouvée dans la fin prédite.
    static func velocity(translation: CGFloat, predictedEndTranslation: CGFloat) -> CGFloat {
        (predictedEndTranslation - translation) / predictionHorizon
    }

    /// La taille de la ligne visée : celle de la rangée pressée, sinon une
    /// rangée de la liste à la largeur de la carte.
    static func rowSize(source: CGRect?, cardWidth: CGFloat) -> CGSize {
        source?.size ?? CGSize(width: cardWidth, height: fallbackRowHeight)
    }

    /// La ligne vers laquelle la carte se comprime : SOUS le doigt qui tire
    /// (`grabY`, dans la carte au repos), gardée dans la carte ; sans doigt
    /// connu, à son pied. Décrochée, elle saute donc sous le doigt, pas à côté.
    static func rowFrame(size: CGSize, in card: CGRect, grabY: CGFloat? = nil) -> CGRect {
        let bottom = card.maxY - size.height
        let top = grabY.map { min(bottom, max(card.minY, $0 - size.height / 2)) } ?? bottom
        return CGRect(x: card.midX - size.width / 2, y: top, width: size.width, height: size.height)
    }

    /// Le point saisi, dans la carte AU REPOS : le cadre mesuré (`slot`) porte
    /// le décalage du geste (`shift`), qu'on retire pour que la ligne visée ne
    /// glisse pas dans la carte pendant qu'elle descend.
    static func grabY(_ grab: CGPoint?, slot: CGRect, shift: CGPoint) -> CGFloat? {
        grab.map { $0.y - (slot.minY - shift.y) }
    }

    /// Le cadre de la carte comprimée : 0 ⇒ la carte, 1 ⇒ la ligne. Le
    /// morphisme de naissance, rejoué à l'envers, borné comme lui.
    static func compressed(_ card: CGRect, toward row: CGRect, detach: CGFloat) -> CGRect {
        ConversationPreviewMorph.frame(progress: 1 - ConversationPreviewMorph.clamped(detach), from: row, to: card)
    }

    /// Le cadre rendu de la carte : celui de la naissance, comprimé par la
    /// traction. Le cadre et l'aperçu qu'il porte le lisent tous deux.
    static func cardFrame(morph: CGFloat, detach: CGFloat, from: CGRect, to: CGRect, row: CGRect) -> CGRect {
        compressed(ConversationPreviewMorph.frame(progress: morph, from: from, to: to), toward: row, detach: detach)
    }

    /// Le décalage qui centre l'aperçu, mis en page à sa largeur de repos,
    /// dans le cadre du moment : plus large pendant la naissance (la rangée
    /// déborde la carte), plus étroit pendant la compression.
    static func previewInset(frameWidth: CGFloat, restWidth: CGFloat) -> CGFloat {
        (frameWidth - restWidth) / 2
    }

    /// La progression qui choisit la face peinte : celle du morphisme de
    /// naissance, rabattue par la traction — la face de la rangée (avatar,
    /// titre) revient quand la carte redevient ligne.
    static func faceProgress(morph: CGFloat, detach: CGFloat) -> CGFloat {
        min(ConversationPreviewMorph.clamped(morph), 1 - ConversationPreviewMorph.clamped(detach))
    }

    /// Une ligne décrochée qu'on JETTE vers le bas (lâchée à la vitesse qui
    /// décroche) ferme l'aperçu, comme le coup vers le bas de #17258 : un coup
    /// rapide ne dépose jamais la conversation sur l'en-tête qu'il traverse.
    static func release(predictedEndTranslation: CGFloat, isLatched: Bool, velocity: CGFloat = 0) -> Release {
        if isLatched { return velocity >= detachVelocity ? .dismiss : .drop }
        return predictedEndTranslation >= dismissDistance ? .dismiss : .restore
    }
}

/// La largeur commune des menus d'appui long (#17274, #17275) : 80 % de la
/// largeur entre les marges, plafonnée. L'aperçu d'une conversation et le menu
/// d'un message la partagent : un même geste, une même taille.
nonisolated enum LongPressPeekWidth {
    static func menuWidth(availableWidth: CGFloat) -> CGFloat {
        let between = availableWidth - 2 * ConversationPeekLayout.sideMargin
        return max(0, min(ConversationPeekLayout.maximumWidth, between)) * ConversationPeekLayout.footprint
    }
}

/// La loi de dimensionnement de l'aperçu d'appui long (#17242), pure : une
/// progression 0 → 1 pilote les DEUX hauteurs (menu qui grandit, carte qui se
/// réduit d'autant), et la levée du doigt conclut vers le cran le plus proche
/// de la position projetée (seuil à mi-course, la vélocité comprise).
///
/// L'aperçu n'occupe que 80 % de ce que l'écran lui offre (#17274) : la carte
/// et le menu, plus étroits et la carte moins haute, laissent voir la liste
/// autour d'eux — un voile qu'on touche pour fermer.
nonisolated struct ConversationPeekLayout: Equatable, Sendable {
    static let sideMargin: CGFloat = 12
    static let maximumWidth: CGFloat = 560
    static let spacing: CGFloat = 12
    static let footprint: CGFloat = 0.8
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

    var cardWidth: CGFloat { LongPressPeekWidth.menuWidth(availableWidth: availableWidth) }

    /// Le menu, compact comme étendu, a la largeur de la carte, centré sous elle.
    var menuWidth: CGFloat { cardWidth }

    /// La hauteur de la carte, du menu et de leur espacement réunis : constante
    /// pendant le geste, ce que le menu gagne, la carte le perd.
    var stackHeight: CGFloat {
        let restCard = max(0, availableHeight - Self.spacing - compactMenuHeight) * Self.footprint
        return restCard + Self.spacing + compactMenuHeight
    }

    /// Ce que l'aperçu laisse au voile, au-dessus et au-dessous de lui.
    var verticalSlack: CGFloat { max(0, availableHeight - stackHeight) }

    /// Le menu étendu montre tout son contenu, sans jamais réduire la carte
    /// sous quelques messages lisibles ; au-delà, son contenu défile.
    var expandedMenuHeight: CGFloat {
        let ceiling = stackHeight - Self.spacing - Self.minimumCardHeight
        return max(compactMenuHeight, min(naturalMenuHeight, ceiling))
    }

    var menuOverflows: Bool { naturalMenuHeight > expandedMenuHeight + 0.5 }

    /// La course du geste, en points : ce que le menu gagne de compact à étendu.
    var travel: CGFloat { max(0, expandedMenuHeight - compactMenuHeight) }

    func menuHeight(progress: CGFloat) -> CGFloat {
        compactMenuHeight + Self.clamped(progress) * travel
    }

    func cardHeight(progress: CGFloat) -> CGFloat {
        max(0, stackHeight - Self.spacing - menuHeight(progress: progress))
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
