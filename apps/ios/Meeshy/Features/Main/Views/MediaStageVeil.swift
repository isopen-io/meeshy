import CoreGraphics
import MeeshySDK

// MARK: - CE QU'UNE OUVERTURE EFFACE — ET CE QU'ELLE NE TOUCHE PAS
//
// **Directive porteur 2026-09-16** (#6789) : « Lorsqu'on affiche les reactions,
// les autres controlleurs doivent disparaitre. »
// **Élargie le même jour** (#6817) : « Le fait de répondre à un attachement /
// scène doit faire comme pour les réactions : faire disparaître les décorateurs
// et autres. »
//
// La première directive SUPPLANTAIT la précision du 2026-09-11 (#6084, « les
// réactions doivent apparaître par-dessus tous les autres contrôleurs ») : la
// première demandait un RANG, celle-ci demande une ABSENCE. Le rang avait été
// obtenu en montant la rangée en dernier enfant du `ZStack` racine — ce qui
// reste juste et reste en place ; ce qui change est que tout le reste s'en va.
//
// **La seconde directive a retiré le mot « réaction » de la loi**, et c'est
// pourquoi le type ne le porte plus. Deux surfaces montent au-dessus de la
// scène pour qu'on lui PARLE — la traînée d'émojis et la barre de réponse —, et
// elles demandent la même chose : le silence autour. Ce qui les réunit n'est pas
// ce qu'elles font, c'est ce qu'elles exigent de la scène.
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
// sous le doigt exactement pendant qu'on la vise. Pour la barre de réponse,
// l'effet serait pire encore — le média changerait de taille à chaque fois que
// le clavier monte et descend, pendant qu'on écrit à son sujet.
//
// D'où deux fonctions et non une. `showsChrome` répond « qu'est-ce qui est
// PEINT ? » ; `geometryPresentation` répond « qu'est-ce qui est RÉSERVÉ ? » — et
// prend les ouvertures SANS LES LIRE, pour que la signature dise la règle et que
// le témoin d'invariance puisse l'éprouver. C'est l'idiome déjà posé par
// `StageChromeAlignment.chromeBounds(stage:media:)` (#6760).
//
// `nonisolated` : le target app compile en `defaultIsolation MainActor` et le
// bundle de tests est nonisolated — sans ce modificateur la loi est inappelable
// depuis XCTest (échec de COMPILE, cf. `AttachmentReactionOffer`).
nonisolated enum MediaStageVeil {

    /// **Ce qui est MONTÉ au-dessus de la scène** — un seul argument, et non
    /// deux booléens voisins.
    ///
    /// La forme est le garde-fou : `showsChrome(presentation:pickerOpen:replyOpen:)`
    /// aurait posé deux drapeaux adjacents du même type, donc interchangeables en
    /// silence à l'appel. Ici chaque ouverture se nomme sur place, et la
    /// troisième — s'il en vient une — s'ajoute au TYPE, pas à la signature de
    /// chaque loi qui le prend.
    struct Overlays: Equatable {

        /// La traînée d'émojis du plein écran (#6084).
        let reactionRow: Bool

        /// La barre de saisie qui cite la pièce sans quitter le visualiseur
        /// (#6165).
        let replyBar: Bool

        /// Rien n'est monté : la scène est seule, le plateau peut se peindre.
        static let closed = Overlays(reactionRow: false, replyBar: false)

        /// **La règle est la DISJONCTION, et elle vit ici.**
        ///
        /// La composer chez l'hôte (`reactionBarOpen || replyTarget != nil`)
        /// aurait déplacé la loi dans un `body` — injouable en XCTest, et
        /// silencieusement oubliable par la troisième ouverture.
        var isOpen: Bool { reactionRow || replyBar }
    }

    /// **Ce que l'écran PEINT du plateau.**
    ///
    /// Deux façons de n'avoir aucun chrome, et elles ne se confondent pas : le
    /// plein cadre l'a RENDU (il a repris sa place), une ouverture le VOILE (sa
    /// place reste réservée). La conjonction dit les deux d'un coup, et c'est le
    /// seul endroit du visualiseur où la question se pose.
    ///
    /// - Parameters:
    ///   - presentation: l'état d'immersion (#6142).
    ///   - overlays: ce qui est monté au-dessus de la scène.
    static func showsChrome(presentation: StagePresentation, overlays: Overlays) -> Bool {
        presentation.showsPlateau && !overlays.isOpen
    }

    /// **L'état que le SOLVEUR reçoit — celui qu'aucune ouverture ne change.**
    ///
    /// `overlays` est pris et n'est pas lu, délibérément. Un voile qui libérerait
    /// la place du chrome ferait grandir le média au moment précis où
    /// l'utilisateur vise un émoji dessus, ou écrit à son sujet ; et une règle
    /// qui se contente de NE PAS appeler la géométrie ne se teste pas. Ici elle
    /// s'éprouve :
    /// `geometryPresentation(p, overlays: x) == geometryPresentation(p, overlays: .closed)`
    /// pour tout `p` et tout `x`.
    static func geometryPresentation(_ presentation: StagePresentation,
                                     overlays: Overlays) -> StagePresentation {
        _ = overlays
        return presentation
    }

    /// **La marge basse de la rangée d'émojis : la gouttière du plateau, et rien
    /// d'autre.**
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
    /// **La barre de réponse n'entre pas dans cette somme** : elle suit le
    /// clavier, et son inset est une autre question, tenue par
    /// `MediaReplyKeyboardInset` (#6751). Deux surfaces peuvent exiger le même
    /// silence sans se poser au même endroit.
    ///
    /// La rangée respecte la zone sûre par sa couche (`reactionLayer` ne
    /// l'ignore pas), donc `safeBottom` n'entre pas dans cette somme.
    static func rowBottomInset(corridors: MediaStageFraming.Corridors) -> CGFloat {
        corridors.gutter
    }
}
