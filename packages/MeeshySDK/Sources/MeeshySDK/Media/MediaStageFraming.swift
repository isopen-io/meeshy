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
/// La séparation joue aussi sur l'autre axe (#6692) : une image très haute (1:4)
/// ne fait que 151 pt de large en pleine hauteur. Le cadre reste alors au
/// plancher de LARGEUR, et le média flotte entre deux bandes latérales — sans
/// quoi l'auteur, sa date et la colonne d'actions posés sur le cadre s'y
/// écrasaient.
///
/// Les deux planchers se DÉRIVENT. La hauteur vaut trois fois celle de l'overlay
/// posé sur le cadre, pour que celui-ci n'en couvre jamais plus du tiers ; la
/// largeur, ce que la colonne d'actions posée sur le cadre exige. Ils sont
/// passés en entrée plutôt que codés ici — c'est l'hôte qui connaît son overlay
/// et sa colonne, comme c'est lui qui connaît la hauteur réelle de son rail.
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
    /// cadre le jour où une vignette change de taille. La bande de transport
    /// suit la même règle : c'est l'hôte qui sait si son lot porte une durée.
    public struct Corridors: Equatable, Sendable {
        public let safeTop: CGFloat
        public let top: CGFloat
        public let rail: CGFloat
        /// **La bande de progression, juste au-dessus du rail** (#6162).
        ///
        /// Elle est une réserve du PLATEAU, au même titre que le rail : la
        /// progression d'une vidéo commande le temps, pas le cadrage, et la
        /// poser SUR le média couvrait l'image qu'on est venu regarder.
        ///
        /// **Elle se réserve pour le LOT, jamais pour la page ouverte.** Une
        /// bande qui n'existerait que sur les médias à durée ferait changer le
        /// cadre de taille en glissant d'une vidéo vers une image — un cadre qui
        /// saute pendant le geste coûte plus cher que la hauteur d'une bande.
        /// C'est l'hôte qui tranche (il connaît son lot) ; le solveur
        /// se contente d'en prendre la hauteur, et de n'en prendre aucune dès
        /// que les couloirs disparaissent.
        public let transport: CGFloat
        public let safeBottom: CGFloat
        /// Marge latérale de chaque côté, ET jeu vertical entre le cadre et le rail.
        public let gutter: CGFloat

        public init(safeTop: CGFloat, top: CGFloat, rail: CGFloat, transport: CGFloat,
                    safeBottom: CGFloat, gutter: CGFloat) {
            self.safeTop = safeTop
            self.top = top
            self.rail = rail
            self.transport = transport
            self.safeBottom = safeBottom
            self.gutter = gutter
        }

        /// Ce que les couloirs prennent à la hauteur AVANT que le cadre ne
        /// prenne le reste. Publique parce que l'hôte doit poser SES bandes sur
        /// la même arithmétique : recomposer la somme dans une vue, c'est
        /// écrire la loi une seconde fois — et la voir dériver d'une gouttière.
        public var reservedHeight: CGFloat {
            safeTop + top + rail + transport + safeBottom + gutter
        }
    }

    /// **CE QU'ON CADRE — un contenu, ou une surface de COMPOSITION** (#6806,
    /// directive porteur 2026-09-16 : « il faut pas afficher une troisieme
    /// couche en plein plein écran, mais juste agrandir le canvas à sa taille
    /// total du viewport »).
    ///
    /// La distinction n'est pas une nuance de présentation, c'est une
    /// différence de NATURE, et c'est elle qui explique pourquoi la conversation
    /// « se passe bien » là où les scènes de post, les réels et les stories ne
    /// se passaient pas bien :
    ///
    /// | sujet | ce que c'est | en plein cadre |
    /// |---|---|---|
    /// | `content` | une pièce jointe — elle EST le contenu | AJUSTÉE, jamais rognée ; son hors-champ est habillé (#6143) |
    /// | `scene` | une surface de composition 9:16 | elle PREND le viewport ; ce qui dépasse est rogné |
    ///
    /// Ajuster une pièce jointe est juste : rogner une photo retirerait ce que
    /// l'expéditeur a envoyé. Ajuster une SCÈNE peint une surface que personne
    /// n'a composée — le sol du visualiseur au-dessus et au-dessous, le
    /// hors-champ du canvas au milieu, le média dedans : les TROIS couches que
    /// la directive refuse.
    public enum Subject: Equatable, Sendable {
        /// Une pièce jointe, une image, une vidéo — le contenu lui-même.
        case content
        /// Une scène : le canvas d'un post, d'un réel ou d'une story.
        case scene
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
        /// **Le jumeau du plancher de hauteur, sur l'autre axe** (#6692).
        ///
        /// Ce qui se pose sur le cadre a une largeur autant qu'une hauteur. Sans
        /// lui, une image très haute gardait la seule largeur de son média
        /// ajusté, et tout ce qui s'y posait s'y écrasait. Même contrat que la
        /// hauteur : un minimum jamais un maximum, borné par la zone libre, sans
        /// effet en plein cadre — et une valeur que l'HÔTE dérive de son chrome.
        public let minimumFrameWidth: CGFloat

        /// **Ce qu'on cadre** (#6806). Par DÉFAUT `.content` : tous les
        /// appelants d'avant la directive cadrent une pièce jointe, et un
        /// défaut qui change leur comportement en silence serait le pire des
        /// ajouts. Seules les pages de SCÈNE le déclarent.
        public let subject: Subject

        public init(viewport: CGSize,
                    mediaRatio: CGFloat,
                    corridors: Corridors,
                    presentation: Presentation,
                    cardedCornerRadius: CGFloat,
                    minimumFrameHeight: CGFloat,
                    minimumFrameWidth: CGFloat,
                    subject: Subject = .content) {
            self.subject = subject
            self.viewport = viewport
            self.mediaRatio = mediaRatio
            self.corridors = corridors
            self.presentation = presentation
            self.cardedCornerRadius = cardedCornerRadius
            self.minimumFrameHeight = minimumFrameHeight
            self.minimumFrameWidth = minimumFrameWidth
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
            // **Une SCÈNE prend le viewport ENTIER** (#6806). Elle n'est pas un
            // contenu qu'on préserve, c'est la surface sur laquelle l'auteur a
            // composé : l'ajuster fabriquerait un hors-champ que personne n'a
            // composé, et avec lui la troisième couche que la directive refuse.
            // Une pièce jointe, elle, reste AJUSTÉE — rogner une photo
            // retirerait ce que l'expéditeur a envoyé.
            // **Une scène PREND le cadre, elle ne le DÉBORDE pas.** Rendre une
            // taille plus grande que le cadre a été essayé et mesuré au
            // simulateur le 2026-09-16 : tout l'aval de ce solveur suppose
            // `media <= frame` (c'est le contrat « jamais de rognage » que
            // `aspectFit` porte depuis l'origine), et une page qui reçoit un
            // média plus grand que son cadre le pose en haut à gauche au lieu de
            // le centrer. Le rognage appartient au CANVAS, qui sait ce qu'il
            // compose ; le solveur lui remet l'écran entier et s'arrête là.
            let media = input.subject == .scene
                ? input.viewport
                : aspectFit(ratio: input.mediaRatio, in: input.viewport)
            return Result(frame: input.viewport, media: media, cornerRadius: 0)

        case .carded:
            let regionWidth = max(0, input.viewport.width - 2 * max(0, input.corridors.gutter))
            let regionHeight = max(0, input.viewport.height - input.corridors.reservedHeight)
            guard regionWidth > 0, regionHeight > 0 else { return .zero }

            let media = aspectFit(ratio: input.mediaRatio,
                                  in: CGSize(width: regionWidth, height: regionHeight))

            // Les deux planchers ne touchent que le CADRE : le média garde sa
            // taille ajustée et flotte dedans, sur son hors-champ habillé.
            let frame = CGSize(
                width: floored(media.width, minimum: input.minimumFrameWidth, bound: regionWidth),
                height: floored(media.height, minimum: input.minimumFrameHeight, bound: regionHeight)
            )

            return Result(frame: frame, media: media, cornerRadius: input.cardedCornerRadius)
        }
    }

    /// **Un plancher est un MINIMUM, jamais un maximum** — et il reste borné par
    /// la zone libre.
    ///
    /// Il ne rabote aucun cadre plus grand que lui, et un plancher plus grand que
    /// l'écran ne gagne jamais : en hauteur il pousserait le rail dehors, en
    /// largeur il mordrait sur les gouttières. Une seule écriture pour les deux
    /// axes (#6692) : deux `min(max(…))` recopiés côte à côte seraient deux
    /// règles qui se ressemblent, jusqu'au jour où l'une bouge.
    private static func floored(_ value: CGFloat, minimum: CGFloat, bound: CGFloat) -> CGFloat {
        min(max(value, minimum), bound)
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
