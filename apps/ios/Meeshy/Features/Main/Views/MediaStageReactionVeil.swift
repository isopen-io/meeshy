import CoreGraphics
import MeeshySDK

// MARK: - CE QUE LA RANGÉE DE RÉACTIONS EFFACE — ET CE QU'ELLE NE TOUCHE PAS
//
// **Directive porteur 2026-09-16** (#6789) : « Lorsqu'on affiche les reactions,
// les autres controlleurs doivent disparaitre. »
//
// Elle SUPPLANTE la précision du 2026-09-11 (#6084, « les réactions doivent
// apparaître par-dessus tous les autres contrôleurs »), et il faut le dire ici :
// la première demandait un RANG, celle-ci demande une ABSENCE. Le rang avait été
// obtenu en montant la rangée en dernier enfant du `ZStack` racine — ce qui reste
// juste et reste en place ; ce qui change est que tout le reste s'en va.
//
// ## La distinction qui porte tout le lot : le CHROME s'efface, la GÉOMÉTRIE ne
// bouge pas
//
// Le dépôt avait déjà un interrupteur qui retire le plateau — `StagePresentation`
// et son `showsPlateau`. Le réemployer aurait été une faute, et d'un genre qu'un
// témoin de comportement n'attrape pas : cet état-là commande AUSSI les cotes
// (`MediaGalleryStage.topInset` / `bottomInset` tombent à zéro en plein cadre,
// et c'est délibéré — voir leur doc). Le média aurait donc GRANDI à l'ouverture
// de la rangée, puis rétréci au choix de l'émoji : la pièce qu'on vise bouge
// sous le doigt exactement pendant qu'on la vise.
//
// D'où deux fonctions et non une. `showsChrome` répond « qu'est-ce qui est
// PEINT ? » ; `geometryPresentation` répond « qu'est-ce qui est RÉSERVÉ ? » — et
// prend `pickerOpen` SANS LE LIRE, pour que la signature dise la règle et que le
// témoin d'invariance puisse l'éprouver. C'est l'idiome déjà posé par
// `StageChromeAlignment.chromeBounds(stage:media:)` (#6760).
//
// `nonisolated` : le target app compile en `defaultIsolation MainActor` et le
// bundle de tests est nonisolated — sans ce modificateur la loi est inappelable
// depuis XCTest (échec de COMPILE, cf. `AttachmentReactionOffer`).
nonisolated enum MediaStageReactionVeil {

    /// **Ce que l'écran PEINT du plateau.**
    ///
    /// Deux façons de n'avoir aucun chrome, et elles ne se confondent pas : le
    /// plein cadre l'a RENDU (il a repris sa place), la rangée ouverte le VOILE
    /// (sa place reste réservée). La conjonction dit les deux d'un coup, et c'est
    /// le seul endroit du visualiseur où la question se pose.
    ///
    /// - Parameters:
    ///   - presentation: l'état d'immersion (#6142).
    ///   - pickerOpen: la rangée d'émojis est-elle montée.
    static func showsChrome(presentation: StagePresentation, pickerOpen: Bool) -> Bool {
        presentation.showsPlateau && !pickerOpen
    }

    /// **L'état que le SOLVEUR reçoit — celui que la rangée ne change pas.**
    ///
    /// `pickerOpen` est pris et n'est pas lu, délibérément. Un voile qui
    /// libérerait la place du chrome ferait grandir le média au moment précis où
    /// l'utilisateur vise un émoji dessus ; et une règle qui se contente de NE
    /// PAS appeler la géométrie ne se teste pas. Ici elle s'éprouve :
    /// `geometryPresentation(p, pickerOpen: true) == geometryPresentation(p, pickerOpen: false)`
    /// pour tout `p`.
    static func geometryPresentation(_ presentation: StagePresentation,
                                     pickerOpen: Bool) -> StagePresentation {
        _ = pickerOpen
        return presentation
    }

    /// **La marge basse de la rangée : la gouttière du plateau, et rien d'autre.**
    ///
    /// Elle valait `rail + transport + 8` jusqu'au 2026-09-16 (#6161, #6162),
    /// pour ne pas couvrir les deux bandes qui servent à PARCOURIR — le rail
    /// parcourt la série, la bande de transport parcourt le média. La raison
    /// s'est évaporée avec la directive : la même ouverture qui monte la rangée
    /// efface les deux bandes, et une marge qui les éviterait laisserait
    /// désormais une centaine de points de vide sous les émojis.
    ///
    /// Ce qui reste — la gouttière — se lit sur les couloirs eux-mêmes plutôt
    /// que sur une constante : c'est la MÊME table que le cadre et le rail
    /// lisent, et deux écritures du même jeu vertical finiraient par diverger.
    /// La fonction est ainsi INVARIANTE au rail et au transport sans être
    /// aveugle à son argument, ce qui est exactement la règle à éprouver.
    ///
    /// La rangée respecte la zone sûre par sa couche (`reactionLayer` ne
    /// l'ignore pas), donc `safeBottom` n'entre pas dans cette somme.
    static func rowBottomInset(corridors: MediaStageFraming.Corridors) -> CGFloat {
        corridors.gutter
    }
}
