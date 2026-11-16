import CoreGraphics
import MeeshyUI

/// L'aperçu d'appui long d'une conversation NAÎT de la ligne pressée (#18722).
///
/// L'œil ne doit voir qu'UNE ligne qui se transforme : la carte part du cadre
/// de la rangée (position, largeur, hauteur, rayon) et s'étend jusqu'à son
/// cadre de repos ; la rangée, elle, se vide le temps de l'aperçu. Une seule
/// progression animée pilote le cadre, le rayon et les deux faces — la loi ne
/// connaît ni vue ni ressort, et chaque valeur rendue se dérive d'elle, ce qui
/// laisse SwiftUI l'interpoler image par image sans recomposer la liste.
///
/// Le cadre laisse passer le léger dépassement du ressort de fin
/// (`PreviewSettleSpring`, retour porteur, #18722) : c'est le rebond
/// qu'on voit. Il reste borné, et le retour ne passe jamais sous la ligne.
nonisolated enum ConversationPreviewMorph {

    /// Le menu attend que la carte soit presque posée : avant, il volerait
    /// l'attention à la ligne qui se transforme.
    static let menuThreshold: CGFloat = 0.8

    /// La mi-course : le fond de la carte est entièrement posé.
    static let handoff: CGFloat = 0.5

    /// Le fondu enchaîné des deux faces : la rangée cède à l'aperçu sur cette
    /// plage, et leurs opacités se complètent — la carte n'est jamais vide.
    static let crossfadeStart: CGFloat = 0.25
    static let crossfadeEnd: CGFloat = 0.75

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

    /// Le cadre de la carte : 0 ⇒ celui de la rangée, 1 ⇒ celui de l'aperçu,
    /// un peu au-delà pendant le rebond de fin.
    static func frame(progress: CGFloat, from: CGRect, to: CGRect) -> CGRect {
        let t = PreviewSettleSpring.bounded(progress)
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

    /// L'opacité d'un calque : le fond de la carte se pose sur la première
    /// moitié ; la rangée et l'aperçu s'échangent en fondu enchaîné au milieu
    /// de la course, sans jamais laisser la carte vide.
    static func opacity(of layer: Layer, progress: CGFloat) -> Double {
        let t = clamped(progress)
        let crossfade = clamped((t - crossfadeStart) / (crossfadeEnd - crossfadeStart))
        switch layer {
        case .rowFace:
            return Double(1 - crossfade)
        case .surface:
            return Double(min(1, t / handoff))
        case .preview:
            return Double(crossfade)
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
    /// sans aller-retour ; sinon elle fond sur place. Une pastille relâchée
    /// loin de tout en-tête de section regagne sa ligne en ressort.
    static func exit(
        hasSource: Bool, reduceMotion: Bool, chipLatched: Bool, pulledPastDismiss: Bool,
        chipReturnsToSlot: Bool = false
    ) -> Exit {
        guard morphsFromRow(hasSource: hasSource, reduceMotion: reduceMotion) else { return .fadeInPlace }
        if chipLatched { return chipReturnsToSlot ? .morphToRow : .fadeInPlace }
        return pulledPastDismiss ? .fadeInPlace : .morphToRow
    }

    /// La carte regagne-t-elle sa place en se retirant ? Oui quand elle
    /// redevient la ligne, ou quand une fermeture ordinaire la fait fondre ;
    /// tirée au-delà de la fermeture ou décrochée, elle fond SOUS LE DOIGT —
    /// la faire remonter pendant le fondu serait un aller-retour parasite.
    static func returnsHome(after exit: Exit, chipLatched: Bool, pulledPastDismiss: Bool) -> Bool {
        exit == .morphToRow || (!chipLatched && !pulledPastDismiss)
    }

    /// La rangée pressée se vide le temps de l'aperçu ; les autres restent.
    static func sourceRowOpacity(conversationId: String, concealedId: String?) -> Double {
        conversationId == concealedId ? 0 : 1
    }

    private static func interpolate(_ start: CGFloat, _ end: CGFloat, _ t: CGFloat) -> CGFloat {
        start + (end - start) * t
    }
}
