import Foundation

/// **Ce qu'un appui long sur le FOND doit ouvrir** (#5041).
///
/// ## L'écart entre ce que le contrat DIT et ce que le code FAIT
///
/// Le rappel s'appelle `onBackgroundLongPressed`, et son doc-comment chez l'hôte
/// est sans ambiguïté :
///
/// > « **L'appui long sur une scène VIDE ouvre la caméra** (#4036, planche `2b`). »
///
/// Mais la condition qui le déclenche n'a jamais mesuré la VACUITÉ : elle
/// mesure `hitTestItem(at:) == nil`, et `hitTestItem` ne balaie que
/// `itemsContainer.sublayers` — les objets de PREMIER PLAN. Le média de fond vit
/// dans `backgroundLayer` et n'en fait pas partie.
///
/// Conséquence, mesurée : sur une slide qui porte déjà une photo en fond, l'appui
/// long ouvrait **le viseur** — proposant de reprendre une image par-dessus celle
/// qu'on voulait retoucher.
///
/// > Directive porteur 2026-09-04 : « idem longpress sur une image ou vidéo sur
/// > la scene **ou en fond de scene** pour editer en y appliquant filtre,
/// > rognage, couper etc… »
///
/// > **Un nom qui dit « vide » et une garde qui dit « aucun objet devant » ne
/// > décrivent pas le même monde.** L'écart est invisible tant qu'aucune scène
/// > ne porte de fond — c'est-à-dire tant qu'on teste le cas que la garde
/// > décrit, et jamais celui que le nom promet.
///
/// ## Un MENU, pas l'éditeur — et la raison n'est pas seulement la directive
///
/// > Directive porteur : « Lorsqu'on a une image, vidéo de fond le longpress sur
/// > le fond doit mettre le menu permettant de **supprimer, ramener en front ou
/// > encore d'editer** l'image ».
///
/// La première écriture de cette règle rendait « ouvre l'éditeur ». Elle
/// corrigeait le viseur et introduisait l'incohérence exactement inverse : sur un
/// objet de PREMIER PLAN, l'appui long ouvre déjà le menu contextuel (Supprimer /
/// Dupliquer / Modifier). Le même geste aurait donc eu deux effets selon que le
/// média est devant ou derrière — la dimension 6 prise à revers par un correctif
/// qui la réclamait.
///
/// « Ramener en avant » mérite d'être nommée : c'est l'action qui fait SORTIR un
/// média du plan de fond, et elle n'a d'équivalent nulle part ailleurs. La servir
/// n'est pas un confort, c'est le seul chemin.
///
/// Le DOUBLE-TAP, lui, continue d'aller droit à l'éditeur : c'est son sens, et
/// rien ici ne le change.
///
/// ## Pourquoi l'hôte est un FAIT de la règle
///
/// Router vers un menu que personne ne monte rendrait l'appui long **muet** —
/// strictement pire que le défaut corrigé, puisqu'il ouvrait au moins le viseur.
/// La règle prend donc ce fait et retombe sur le viseur tant que l'hôte ne sert
/// pas le menu. C'est le motif que le canvas emploie déjà à côté :
/// `canEditItem` teste `onItemDoubleTapped != nil` pour répondre à « l'hôte a-t-il
/// câblé un éditeur ? ».
///
/// > **Un correctif qui déplace un geste vers un destinataire absent ne le
/// > corrige pas, il l'éteint.** La question à poser à tout reroutage est « qui
/// > reçoit, et est-il là ? » — et la réponse doit être un FAIT que la règle lit,
/// > pas une promesse tenue ailleurs.
///
/// ## Ce qui n'est PAS retiré
///
/// Le viseur garde exactement le cas pour lequel il a été écrit (#4036) : une
/// scène qui n'a rien à éditer. Cette règle ne le déplace pas, elle lui rend sa
/// définition.
nonisolated enum StoryCanvasBackgroundLongPress: Equatable, Sendable {

    /// La scène porte un fond et l'hôte sait le présenter : supprimer, ramener
    /// en avant, éditer.
    case presentBackgroundMenu(String)

    /// Rien à éditer — ou personne pour l'offrir. Le geste appartient au viseur
    /// (#4036).
    case openViewfinder

    /// - `backgroundMediaObjectId` : l'identifiant du média de fond, ou `nil`
    ///   quand la slide n'en porte pas (couleur, dégradé, scène neuve).
    /// - `hostServesBackgroundMenu` : l'hôte a-t-il câblé le menu ? Tant qu'il ne
    ///   l'a pas, le geste retourne au viseur plutôt que de ne rien faire.
    static func outcome(backgroundMediaObjectId: String?,
                        hostServesBackgroundMenu: Bool) -> StoryCanvasBackgroundLongPress {
        guard hostServesBackgroundMenu,
              let backgroundMediaObjectId,
              !backgroundMediaObjectId.isEmpty else {
            return .openViewfinder
        }
        return .presentBackgroundMenu(backgroundMediaObjectId)
    }
}
