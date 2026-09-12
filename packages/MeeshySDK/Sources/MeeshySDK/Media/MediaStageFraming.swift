import CoreGraphics

/// **La loi de cadrage de la LECTURE : les couloirs d'abord, le cadre ensuite.**
///
/// Un média ne se lit pas bord à bord sous un chrome flottant. Il se pose dans
/// un cadre arrondi centré, et le plateau qui l'entoure — deux couloirs, haut
/// et bas — porte tout ce qui n'est pas lui : la porte de sortie et le menu en
/// haut, le rail des autres médias en bas.
///
/// ## Pourquoi les couloirs sont réservés EN PREMIER
///
/// Parce que c'est ce qui rend l'équilibre indépendant du ratio. Une vidéo 16:9
/// et une scène 9:16 gardent exactement les mêmes couloirs ; seul le cadre
/// change de taille entre elles. Dimensionner d'abord le média et donner le
/// reste aux contrôles produirait l'inverse — un rail qui rétrécit quand le
/// média grandit, et qui finit par sortir de l'écran sur un 9:16.
///
/// ## Pourquoi DEUX cotes et non une
///
/// Le cadre et le média ne sont le même objet que lorsque le ratio remplit le
/// cadre. Dès que le plancher de hauteur mord — une 16:9 ne fait que 206 pt de
/// haut en pleine largeur — le cadre reste à 330 pt et le média flotte dedans,
/// sur son hors-champ habillé. Un solveur qui ne rendrait qu'une taille
/// obligerait chaque hôte à recalculer l'autre, donc à réimplémenter la règle.
///
/// Le plancher se DÉRIVE : il vaut trois fois la hauteur de l'overlay posé sur
/// le cadre, pour que celui-ci n'en couvre jamais plus du tiers. Il est passé en
/// entrée plutôt que codé ici — c'est l'hôte qui connaît son overlay, comme
/// c'est lui qui connaît la hauteur réelle de son rail.
///
/// ## Placement
///
/// Dans `MeeshySDK` et non `MeeshyUI`, pour la raison que `StoryLetterboxFill`
/// documente déjà : `MeeshyUI` compile sous `defaultIsolation: MainActor`, donc
/// la conformance `Equatable` d'un type qui y naît est isolée au `MainActor` et
/// une suite non isolée ne peut plus comparer ses valeurs. Un moteur de règles
/// sans état est un atome — donc du SDK core (tableau de placement du
/// `packages/MeeshySDK/CLAUDE.md`).
public nonisolated enum MediaStageFraming {

    /// Les deux états de la lecture. `.full` n'est pas « le cadre en plus
    /// grand » : c'est l'écran entier, coins droits, couloirs ignorés.
    public enum Presentation: Equatable, Sendable { case carded, full }

    /// Ce que le plateau réserve AVANT que le cadre ne prenne le reste.
    ///
    /// Chaque valeur vient de l'hôte, aucune n'est écrite ici : la hauteur du
    /// rail est celle que la pellicule réserve réellement
    /// (`FilmstripMetrics.reservedHeight`), et la recopier ferait dériver le
    /// cadre le jour où une vignette change de taille.
    public struct Corridors: Equatable, Sendable {
        public let safeTop: CGFloat
        public let top: CGFloat
        public let rail: CGFloat
        public let safeBottom: CGFloat
        /// Marge latérale de chaque côté, ET jeu vertical entre le cadre et le rail.
        public let gutter: CGFloat

        public init(safeTop: CGFloat, top: CGFloat, rail: CGFloat,
                    safeBottom: CGFloat, gutter: CGFloat) {
            self.safeTop = safeTop
            self.top = top
            self.rail = rail
            self.safeBottom = safeBottom
            self.gutter = gutter
        }

        var reservedHeight: CGFloat { safeTop + top + rail + safeBottom + gutter }
    }

    public struct Input: Equatable, Sendable {
        public let viewport: CGSize
        /// largeur / hauteur. `<= 0` ⇒ le solveur rend des zéros plutôt que de
        /// diviser par zéro — un média dont les dimensions manquent existe.
        public let mediaRatio: CGFloat
        public let corridors: Corridors
        public let presentation: Presentation
        public let cardedCornerRadius: CGFloat
        public let minimumFrameHeight: CGFloat

        public init(viewport: CGSize,
                    mediaRatio: CGFloat,
                    corridors: Corridors,
                    presentation: Presentation,
                    cardedCornerRadius: CGFloat,
                    minimumFrameHeight: CGFloat) {
            self.viewport = viewport
            self.mediaRatio = mediaRatio
            self.corridors = corridors
            self.presentation = presentation
            self.cardedCornerRadius = cardedCornerRadius
            self.minimumFrameHeight = minimumFrameHeight
        }
    }

    public struct Result: Equatable, Sendable {
        /// Le cadre arrondi — ce qui se peint, et ce que l'overlay habille.
        public let frame: CGSize
        /// Le média DANS ce cadre. Égal au cadre quand le ratio le remplit.
        public let media: CGSize
        public let cornerRadius: CGFloat

        public init(frame: CGSize, media: CGSize, cornerRadius: CGFloat) {
            self.frame = frame
            self.media = media
            self.cornerRadius = cornerRadius
        }

        /// **Y a-t-il du hors-champ à habiller ?**
        ///
        /// La question se pose dans les DEUX états, et c'est tout l'intérêt de
        /// la poser ici : le plein cadre fabrique le sien, même pour un média
        /// qui remplissait sa carte. Une 4:5 remplit un cadre de 366 pt de
        /// large et flotte dans 844 pt de haut une fois l'écran pris.
        public var letterboxes: Bool {
            guard frame.width > 0, frame.height > 0 else { return false }
            return media.width < frame.width - 0.5 || media.height < frame.height - 0.5
        }

        static let zero = Result(frame: .zero, media: .zero, cornerRadius: 0)
    }

    public static func resolve(_ input: Input) -> Result {
        guard input.mediaRatio > 0,
              input.viewport.width > 0,
              input.viewport.height > 0 else { return .zero }

        switch input.presentation {
        case .full:
            return Result(frame: input.viewport,
                          media: aspectFit(ratio: input.mediaRatio, in: input.viewport),
                          cornerRadius: 0)

        case .carded:
            let regionWidth = max(0, input.viewport.width - 2 * max(0, input.corridors.gutter))
            let regionHeight = max(0, input.viewport.height - input.corridors.reservedHeight)
            guard regionWidth > 0, regionHeight > 0 else { return .zero }

            let media = aspectFit(ratio: input.mediaRatio,
                                  in: CGSize(width: regionWidth, height: regionHeight))

            // Le plancher est un MINIMUM, jamais un maximum : il ne rabote aucun
            // cadre haut, et il reste borné par la zone libre — un plancher plus
            // grand que l'écran pousserait le rail dehors.
            let flooredHeight = min(max(media.height, input.minimumFrameHeight), regionHeight)

            return Result(frame: CGSize(width: media.width, height: flooredHeight),
                          media: media,
                          cornerRadius: input.cardedCornerRadius)
        }
    }

    /// **Ajuste au ratio puis centre — jamais de rognage, jamais d'étirement.**
    ///
    /// Conséquence à ne pas perdre de vue : en plein écran, même une scène 9:16
    /// laisse des bandes. L'écran d'un iPhone 16 Pro est en 0,462, plus ÉTROIT
    /// que le 0,5625 d'une scène — elle s'y arrête donc à 693 pt de haut. « Plein
    /// cadre » nomme le CADRE qui prend l'écran, pas le média qui le remplirait.
    private static func aspectFit(ratio: CGFloat, in box: CGSize) -> CGSize {
        let height = box.height
        let width = height * ratio
        guard width > box.width else { return CGSize(width: width, height: height) }
        return CGSize(width: box.width, height: box.width / ratio)
    }
}
