import CoreGraphics

// MARK: - LA ZONE DE COMMENTAIRES D'UNE STORY SUIT LE COMPOSEUR (#9893)
//
// Demande porteur du 2026-10-10 : composeur visible, la liste des commentaires
// MONTE et prend plus de place ; clavier ouvert, elle monte ENCORE et occupe
// l'espace libre au-dessus du composeur et du clavier ; replié en bulle, elle
// redescend.
//
// La liste réservait jusqu'ici une constante (92 pt, 142 pt avec la bannière
// de réponse) et plafonnait à 42 % puis 62 % de la fenêtre, sans rien savoir
// du repli : elle passait sous la bulle, et clavier ouvert elle laissait vide
// la moitié haute de l'écran. La loi se calcule sur la plaque MESURÉE et sur la
// hauteur du clavier ; la vue ne fait que lui poser la question.
//
// `nonisolated` : la cible app compile en `defaultIsolation MainActor`, le
// bundle de tests non (cf. `StoryComposerFold`).

nonisolated enum StoryCommentsZone {

    /// Ce que le composeur occupe en bas du lecteur.
    enum ComposerState: Equatable, Sendable {
        /// Aucun composeur : sa propre story, ou chrome caché.
        case absent
        /// Replié : il ne reste que la bulle de réouverture.
        case folded
        /// Déplié, clavier fermé.
        case expanded
        /// Déplié, clavier (ou panneau d'émojis) ouvert.
        case typing
    }

    struct Metrics: Equatable, Sendable {
        /// Hauteur de la fenêtre (`DeviceLayout.windowSize`).
        var windowHeight: CGFloat
        /// Zone sûre basse RÉELLE (lue sur la fenêtre par le parent).
        var safeBottom: CGFloat
        /// Bande haute que la liste ne recouvre jamais : barres + auteur.
        var topReserved: CGFloat
        /// Hauteur MESURÉE de ce que le composeur montre : la plaque dépliée,
        /// ou la bulle repliée. `nil` avant la première mesure.
        var composerHeight: CGFloat?
        /// Ce qui soulève le composeur : clavier, ou panneau d'émojis (zone
        /// sûre comprise). 0 quand rien ne le soulève.
        var keyboardHeight: CGFloat
    }

    /// Ce que la CARTE sait du composeur — tout sauf la zone sûre, que le
    /// lecteur lit déjà pour la liste (`windowBottomInset`) : la carte n'ajoute
    /// aucune lecture de la fenêtre.
    struct ComposerReading: Equatable, Sendable {
        var state: ComposerState
        var composerHeight: CGFloat?
        var keyboardHeight: CGFloat
        var windowHeight: CGFloat
        var topReserved: CGFloat

        func frame(safeBottom: CGFloat) -> Frame {
            StoryCommentsZone.frame(for: state, metrics: Metrics(
                windowHeight: windowHeight, safeBottom: safeBottom, topReserved: topReserved,
                composerHeight: composerHeight, keyboardHeight: keyboardHeight))
        }
    }

    /// Où se pose la liste, en points depuis le bas du canvas.
    struct Frame: Equatable, Sendable {
        static let unplaced = Frame(bottomInset: 0, maxHeight: 0)

        /// Bord bas de la liste.
        var bottomInset: CGFloat
        /// Hauteur maximale de la liste au-dessus de ce bord.
        var maxHeight: CGFloat
        /// Bord haut que la liste peut atteindre.
        var topEdge: CGFloat { bottomInset + maxHeight }
    }

    /// Respiration au-dessus de la zone sûre, clavier fermé — celle du
    /// composeur (`composerBottomPadding`).
    static let breathing: CGFloat = 20
    /// Écart entre la bulle repliée et le dernier commentaire.
    static let bubbleGap: CGFloat = 8
    static let fallbackPlateHeight: CGFloat = 92
    static let fallbackBubbleHeight: CGFloat = 44
    /// Part de la fenêtre que la liste peut prendre sans composeur déplié :
    /// la story reste visible et manipulable au-dessus.
    static let restingFraction: CGFloat = 0.42
    /// Composeur déplié : la liste prend plus de place.
    static let composingFraction: CGFloat = 0.56

    /// Le repli prime sur le clavier : le chevron replie AVANT que le clavier
    /// ait fini de descendre, et la bulle descend avec lui.
    static func state(hasComposer: Bool, isShown: Bool,
                      presentation: StoryComposerFold.Presentation,
                      keyboardHeight: CGFloat) -> ComposerState {
        guard hasComposer, isShown else { return .absent }
        guard presentation == .expanded else { return .folded }
        return keyboardHeight > 0 ? .typing : .expanded
    }

    /// - Replié : la liste s'arrête au-dessus de la bulle, sans la recouvrir.
    /// - Déplié : elle « émerge » du milieu de la plaque (spec 2026-05-28).
    /// - Clavier ouvert : elle occupe tout l'espace libre jusqu'à l'en-tête.
    ///
    /// Le bas suit le clavier point pour point, donc la liste monte et descend
    /// avec lui, sur sa courbe, sans saut.
    static func frame(for state: ComposerState, metrics: Metrics) -> Frame {
        let floor = metrics.keyboardHeight > 0 ? metrics.keyboardHeight : metrics.safeBottom + breathing
        let bottom: CGFloat
        let fraction: CGFloat?
        switch state {
        case .absent:
            bottom = metrics.safeBottom + breathing
            fraction = restingFraction
        case .folded:
            bottom = floor + (metrics.composerHeight ?? fallbackBubbleHeight) + bubbleGap
            fraction = restingFraction
        case .expanded:
            bottom = floor + (metrics.composerHeight ?? fallbackPlateHeight) / 2
            fraction = composingFraction
        case .typing:
            bottom = floor + (metrics.composerHeight ?? fallbackPlateHeight) / 2
            fraction = nil
        }
        let room = max(0, metrics.windowHeight - metrics.topReserved - bottom)
        let height = fraction.map { min($0 * metrics.windowHeight, room) } ?? room
        return Frame(bottomInset: bottom, maxHeight: height)
    }
}
