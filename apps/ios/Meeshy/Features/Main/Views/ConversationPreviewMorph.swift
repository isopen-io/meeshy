import CoreGraphics

/// L'aperçu d'appui long d'une conversation NAÎT de la ligne pressée (#18722).
///
/// L'œil ne doit voir qu'UNE ligne qui se transforme : la carte part du cadre
/// de la rangée (position, largeur, hauteur, rayon) et s'étend jusqu'à son
/// cadre de repos ; la rangée, elle, se vide le temps de l'aperçu. Une seule
/// progression animée pilote le cadre, le rayon et les deux faces — la loi ne
/// connaît ni vue ni ressort, et chaque valeur rendue se dérive d'elle, ce qui
/// laisse SwiftUI l'interpoler image par image sans recomposer la liste.
///
/// Bornée : le dépassement d'un ressort ne déforme jamais la carte au-delà de
/// ses deux cadres, et ne la fait jamais passer sous la ligne au retour.
nonisolated enum ConversationPreviewMorph {

    /// Le menu attend que la carte soit presque posée : avant, il volerait
    /// l'attention à la ligne qui se transforme.
    static let menuThreshold: CGFloat = 0.8

    /// La mi-course : la face de la rangée a fini de s'effacer, l'aperçu
    /// commence à se fondre dedans. Les deux ne se superposent jamais en plein.
    static let handoff: CGFloat = 0.5

    /// La course du menu qui monte depuis le bas de la carte, en points.
    static let menuRiseDistance: CGFloat = 40

    /// Les calques que la carte porte pendant le morphisme.
    enum Layer: Equatable, Sendable {
        /// Le contenu de la rangée (avatar, titre, dernier message) — ce que
        /// l'œil reconnaît au départ.
        case rowFace
        /// L'aperçu complet, les derniers messages — ce que la carte devient.
        case preview
        /// Le fond de la carte et son ombre : la rangée de la liste n'en a
        /// pas, la carte s'en couvre en se soulevant.
        case surface
    }

    /// Comment l'aperçu se retire.
    enum Exit: Equatable, Sendable {
        /// La carte redevient la ligne : morphisme inverse jusqu'à son cadre.
        case morphToRow
        /// La carte fond sur place : pastille relâchée sous le doigt, traction
        /// au-delà de la fermeture, Réduire les animations, ligne inconnue.
        case fadeInPlace
    }

    static func clamped(_ progress: CGFloat) -> CGFloat {
        min(1, max(0, progress))
    }

    /// Le cadre de la carte : 0 ⇒ celui de la rangée, 1 ⇒ celui de l'aperçu.
    static func frame(progress: CGFloat, from: CGRect, to: CGRect) -> CGRect {
        let t = clamped(progress)
        return CGRect(
            x: interpolate(from.minX, to.minX, t),
            y: interpolate(from.minY, to.minY, t),
            width: interpolate(from.width, to.width, t),
            height: interpolate(from.height, to.height, t)
        )
    }

    /// Le rayon des coins : celui de la rangée qui s'ouvre jusqu'à celui de la carte.
    static func cornerRadius(progress: CGFloat, from: CGFloat, to: CGFloat) -> CGFloat {
        interpolate(from, to, clamped(progress))
    }

    /// L'opacité d'un calque : la rangée s'efface sur la première moitié
    /// pendant que le fond de la carte s'y pose, l'aperçu se fond sur la seconde.
    static func opacity(of layer: Layer, progress: CGFloat) -> Double {
        let t = clamped(progress)
        switch layer {
        case .rowFace:
            return Double(1 - min(1, t / handoff))
        case .surface:
            return Double(min(1, t / handoff))
        case .preview:
            return Double(max(0, t - handoff) / (1 - handoff))
        }
    }

    /// Le menu se montre-t-il ? Seulement au seuil, jamais pendant que la
    /// ligne se transforme encore.
    static func showsMenu(progress: CGFloat) -> Bool {
        progress >= menuThreshold
    }

    /// Ce que le menu a déjà parcouru de son apparition : nul avant le seuil,
    /// entier quand la carte est posée.
    static func menuReveal(progress: CGFloat) -> CGFloat {
        clamped((progress - menuThreshold) / (1 - menuThreshold))
    }

    /// Le décalage du menu sous sa place : il monte depuis le bas de la carte ;
    /// sous Réduire les animations, il apparaît à sa place.
    static func menuRise(progress: CGFloat, reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : (1 - menuReveal(progress: progress)) * menuRiseDistance
    }

    /// La carte part-elle de la ligne ? Il faut la connaître (le rotor
    /// VoiceOver n'en donne pas) et que le mouvement soit permis.
    static func morphsFromRow(hasSource: Bool, reduceMotion: Bool) -> Bool {
        hasSource && !reduceMotion
    }

    /// La progression d'où l'entrée part : la ligne, ou la carte au repos qui
    /// apparaîtra en fondu.
    static func startProgress(hasSource: Bool, reduceMotion: Bool) -> CGFloat {
        morphsFromRow(hasSource: hasSource, reduceMotion: reduceMotion) ? 0 : 1
    }

    /// Le cadre de la rangée exprimé dans l'espace de la carte, qui ne se
    /// mesure que dans le sien.
    static func sourceInSlot(_ source: CGRect?, slot: CGRect) -> CGRect? {
        source?.offsetBy(dx: -slot.minX, dy: -slot.minY)
    }

    /// Tant que la carte n'a pas atteint l'aperçu, elle EST la ligne : opaque
    /// dès qu'elle s'y pose et jusqu'à ce qu'elle y revienne. Posée au repos
    /// (montage, fondu), elle n'apparaît qu'avec l'entrée et fond au retrait.
    static func cardOpacity(isAppeared: Bool, progress: CGFloat) -> Double {
        (isAppeared || progress < 1) ? 1 : 0
    }

    /// Le retrait : la carte redevient la ligne quand elle peut la rejoindre
    /// sans aller-retour ; sinon elle fond sur place.
    static func exit(hasSource: Bool, reduceMotion: Bool, chipLatched: Bool, pulledPastDismiss: Bool) -> Exit {
        guard morphsFromRow(hasSource: hasSource, reduceMotion: reduceMotion),
              !chipLatched, !pulledPastDismiss
        else { return .fadeInPlace }
        return .morphToRow
    }

    /// La rangée pressée se vide le temps de l'aperçu ; les autres restent.
    static func sourceRowOpacity(conversationId: String, concealedId: String?) -> Double {
        conversationId == concealedId ? 0 : 1
    }

    private static func interpolate(_ start: CGFloat, _ end: CGFloat, _ t: CGFloat) -> CGFloat {
        start + (end - start) * t
    }
}
