import CoreGraphics
import MeeshyUI

/// **LE PLATEAU EST LA SCÈNE** (#6760, directive porteur 2026-09-15).
///
/// > « les details de l'auteur et les actions doivent être aligné sur le
/// > plateau ! C'est le plateau entier qui prend le tumbHash de la scene ! Ce
/// > qui est construit se pose donc sur la plateau au milieu et le plateau est
/// > la scene ! Il faut reprendre la même logique dans le reader de story et des
/// > scenes de poste en ouvert plein écran même sur les pieces jointes de
/// > conversation ! »
///
/// ## Ce que la loi tranche
///
/// Le plateau et le média sont DEUX cadres, et le dépôt les confondait selon la
/// surface. Mesuré sur la capture du porteur — une pièce 900 × 3 600 dans la
/// galerie de conversation : le ThumbHash habillait bien le plateau entier et le
/// média y était bien centré, mais la colonne d'actions était posée sur le bord
/// du MÉDIA (x ≈ 615 pour un média finissant à 622), quand le plateau s'arrête
/// à 690.
///
/// **Conséquence : la position du chrome dépendait de la forme du fichier.** Une
/// pièce haute et étroite ramenait les actions vers le centre, une pièce large
/// les repoussait — sur le même écran, au même endroit du produit. Le repère
/// que l'utilisateur apprend bougeait à chaque média, ce que la dimension 6
/// (même geste, même place) interdit.
///
/// ## Pourquoi une loi et pas un correctif par surface
///
/// Quatre surfaces portent le même plateau — pièces jointes de conversation,
/// scènes de post en plein écran, reader de story, galerie de commentaires. Une
/// règle qu'il faut retaper à chaque site est une règle qu'un site finira par ne
/// pas avoir : c'est le constat qui a fait naître
/// `serializeConversationParticipant` côté passerelle, et il vaut mot pour mot
/// ici.
///
/// Pure et `nonisolated` : elle s'éprouve sans monter d'écran.
nonisolated enum StageChromeAlignment {

    /// **Le cadre où le chrome se pose — celui du PLATEAU.**
    ///
    /// `media` est pris en paramètre alors qu'il n'est pas lu, et c'est
    /// délibéré : la signature est le lieu où la règle se dit. Un appelant qui
    /// tient les deux cadres sous les yeux ne peut pas croire que le second est
    /// celui qui décide, et le témoin d'INVARIANCE (deux médias, un seul chrome)
    /// ne pourrait pas s'écrire sans lui.
    static func chromeBounds(stage: CGRect, media: CGRect) -> CGRect {
        _ = media
        return stage
    }

    /// **Où le média se pose : au MILIEU du plateau, sur les DEUX axes.**
    ///
    /// Pas de `max(0, …)` : un média plus GRAND que le plateau déborde
    /// symétriquement et se fait clipper par le cadre. Borner à zéro le
    /// collerait en haut et rendrait le hors-champ asymétrique — le défaut que
    /// #6717 a mesuré sur la scène, une bande de fond visible en haut et rien en
    /// bas.
    /// **L'alignement vertical du plateau : TOUJOURS centré** (#6760).
    ///
    /// ## Deux directives, et la postérieure gagne
    ///
    /// Le reader de story décidait seul, par un ternaire sur le rapport :
    /// `.center` en paysage (directive porteur 2026-07-13, « la position des
    /// vidéos landscape doit être au centre ») et `.top` en PORTRAIT (directive
    /// porteur 2026-07-04, « la carte se place DIRECTEMENT sous la ligne
    /// d'expiration ») — c'est-à-dire dans le cas NOMINAL.
    ///
    /// La directive du **2026-09-15** les supplante : « Ce qui est construit se
    /// pose donc sur la plateau au milieu et le plateau est la scene ! Il faut
    /// reprendre la même logique dans le reader de story ».
    ///
    /// **Ce bloc de commentaire EST la garde de cette valeur.** Une valeur posée
    /// sur directive porteur ne peut pas avoir de témoin qui la justifie — un
    /// témoin fige ce qu'elle vaut, jamais pourquoi. Sans les trois dates
    /// ci-dessus, le prochain lecteur qui retrouvera la directive de juillet
    /// « re-corrigera » ce centrage en croyant réparer une régression.
    ///
    /// Le paramètre `canvasRatio` est pris et non lu, pour la même raison que
    /// `media` dans `chromeBounds` : la signature est le lieu où la règle se
    /// dit, et le témoin du rang PORTRAIT — le seul qui puisse tomber, le
    /// paysage rendant déjà `.center` sous l'ancienne règle — ne pourrait pas
    /// s'écrire sans lui.
    static func verticalAlignment(canvasRatio: CGFloat) -> StoryCanvasFraming.VerticalAlignment {
        _ = canvasRatio
        return .center
    }

    static func mediaOrigin(stage: CGRect, mediaSize: CGSize) -> CGPoint {
        CGPoint(x: stage.midX - mediaSize.width / 2,
                y: stage.midY - mediaSize.height / 2)
    }
}
