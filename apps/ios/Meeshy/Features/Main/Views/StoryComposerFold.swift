import CoreGraphics

// MARK: - LE COMPOSEUR DU LECTEUR DE STORY : SA PLACE, SON GESTE, SON REPLI
//
// Directive porteur 2026-09-28 (#8431) : le texte qui accompagne une story
// commence EXACTEMENT au-dessus du composeur et de sa plaque de verre ; un
// glissement vers le bas SUR le composeur lui appartient et le replie ; replié,
// il ne reste qu'un bouton centré, à l'icône de commentaire, qui le rouvre.
//
// Trois décisions PURES, jouables en XCTest — la vue qui les consulte
// (`StoryViewerView+CanvasComposerLayer.swift`) ne fait que leur poser la
// question. `nonisolated` : la cible app compile en `defaultIsolation
// MainActor`, le bundle de tests non (cf. `StoryReactionStripGesture`).

/// **Où se pose le bord BAS du texte de la story**, en points depuis le bas du
/// canvas.
///
/// Le texte s'arrêtait à `topInset + 130` — un nombre sans rapport avec le
/// composeur qu'il surplombe : selon l'appareil il flottait 30 à 40 pt trop
/// haut, et remontait au milieu de l'écran dès que la plaque changeait de
/// hauteur. Il se mesure désormais sur le bloc réellement rendu.
nonisolated enum StoryCaptionPlacement {

    /// - Parameters:
    ///   - composerBlockHeight: hauteur MESURÉE du bloc du composeur (plaque de
    ///     verre, panneau d'émojis ou bouton replié compris), `nil` quand aucun
    ///     composeur n'est monté (story de l'auteur, sans réponse en cours).
    ///   - composerBottomPadding: retrait bas du bloc (zone sûre, clavier).
    ///   - isComposerShown: le chrome est visible — caché, le bloc glisse hors
    ///     de l'écran et ne réserve plus rien.
    ///
    /// Sans composeur (sa propre story) ou chrome caché, le texte se pose au
    /// ras du bas, sur le seul retrait — il ne garde plus une « place
    /// historique » tirée du HAUT de l'écran, ≈ 135 pt trop haut (#9072).
    static func bottomInset(composerBlockHeight: CGFloat?,
                            composerBottomPadding: CGFloat,
                            isComposerShown: Bool) -> CGFloat {
        guard isComposerShown, let height = composerBlockHeight, height > 0 else { return composerBottomPadding }
        return composerBottomPadding + height
    }
}

/// **À qui appartient un glissé né SUR le composeur ?**
///
/// Le lecteur monte son drag en `.simultaneousGesture` sur un ancêtre : aucun
/// geste enfant ne peut le subordonner par priorité. Un glissement vers le bas
/// sur le composeur au repos refermait donc la STORY. Le composeur revendique
/// le glissé VERTICAL avant le réveil du lecteur (15 pt), et celui-ci cède en
/// lisant le drapeau — même mécanique que la barre de réactions (#6083).
nonisolated enum StoryComposerGesture {

    enum Owner: Equatable, Sendable {
        case composer
        case story
    }

    /// Sous les 15 pt du lecteur, au-dessus du tremblement d'un tap.
    static let verticalClaimDistance: CGFloat = 8

    /// Course verticale au-delà de laquelle le glissé bas replie le composeur.
    static let foldDistance: CGFloat = 40

    /// Le vertical DOMINE et a franchi `verticalClaimDistance` ⇒ le composeur.
    /// L'horizontal reste au lecteur : on change encore de story depuis la
    /// bande basse.
    static func owner(translation: CGSize) -> Owner {
        let dx = abs(translation.width)
        let dy = abs(translation.height)
        guard dy >= verticalClaimDistance else { return .story }
        return dy > dx ? .composer : .story
    }

    /// Un glissé VERS LE BAS, vertical, d'au moins `foldDistance`.
    static func folds(translation: CGSize) -> Bool {
        translation.height >= foldDistance && translation.height > abs(translation.width)
    }
}

/// **Ce que montre la bande basse du lecteur** : le composeur déplié, ou son
/// seul bouton de réouverture.
nonisolated enum StoryComposerFold {

    enum Presentation: Equatable, Sendable {
        case expanded
        case folded
    }

    /// Une réponse à un commentaire rouvre toujours le composeur : la bannière
    /// « Réponse à X » vit dedans, et replié elle serait invisible.
    static func presentation(userFolded: Bool, isReplying: Bool) -> Presentation {
        userFolded && !isReplying ? .folded : .expanded
    }

    /// Le bouton ⌄ de l'angle haut-droit n'existe qu'en RÉDACTION — clavier ou
    /// panneau d'émojis ouverts. Au repos, le glissement suffit.
    static func offersFoldButton(presentation: Presentation, isComposerEngaged: Bool) -> Bool {
        presentation == .expanded && isComposerEngaged
    }

    static let foldSymbol = "chevron.down"
    static let unfoldSymbol = "bubble.left.fill"
}
