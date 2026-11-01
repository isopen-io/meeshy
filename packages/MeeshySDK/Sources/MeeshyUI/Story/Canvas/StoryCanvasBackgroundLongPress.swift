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
/// ## La SÉLECTION, ni un menu ni l'éditeur (#13974, grammaire d'édition)
///
/// > Décision porteur : une option d'édition n'a que trois places —
/// > le rail du bas remplacé, des rails superposés par niveaux, une feuille
/// > basse —, jamais un menu flottant.
///
/// L'appui long sur le fond fait donc ce que fait le toucher : il le
/// SÉLECTIONNE, et l'hôte pose le niveau « Fond » (Modifier · Remplacer ·
/// Mettre sur la scène · Retirer). Le menu flottant de #5041 et #8717 est
/// parti ; « Mettre sur la scène » y garde le seul chemin qui fait SORTIR un
/// média du plan de fond.
///
/// ## Pourquoi l'hôte est un FAIT de la règle
///
/// Router vers une sélection que personne ne reçoit rendrait l'appui long
/// **muet** — strictement pire que le viseur. La règle prend donc ce fait et
/// retombe sur le viseur tant que l'hôte ne sélectionne pas le fond. C'est le motif que le canvas emploie déjà à côté :
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

    /// La scène porte un fond et l'hôte sait le sélectionner : son niveau
    /// « Fond » prend le rail.
    case selectBackground(String)

    /// Rien à éditer — ou personne pour l'offrir. Le geste appartient au viseur
    /// (#4036).
    case openViewfinder

    /// - `backgroundMediaObjectId` : l'identifiant du média de fond, ou `nil`
    ///   quand la slide n'en porte pas (couleur, dégradé, scène neuve).
    /// - `hostSelectsBackground` : l'hôte a-t-il câblé la sélection du fond ?
    ///   Tant qu'il ne l'a pas, le geste retourne au viseur plutôt que de ne
    ///   rien faire.
    static func outcome(backgroundMediaObjectId: String?,
                        hostSelectsBackground: Bool) -> StoryCanvasBackgroundLongPress {
        guard hostSelectsBackground,
              let backgroundMediaObjectId,
              !backgroundMediaObjectId.isEmpty else {
            return .openViewfinder
        }
        return .selectBackground(backgroundMediaObjectId)
    }

    /// **Le toucher et l'appui long du fond s'excluent** (#13974) : un appui
    /// long reconnu fait échouer le toucher du même geste, un toucher reconnu
    /// empêche l'appui long. Sans cette règle, le toucher partait au
    /// relâchement et désélectionnait le fond que l'appui long venait de
    /// sélectionner.
    static func excludesEachOther(_ a: AnyObject, _ b: AnyObject, tap: AnyObject?, longPress: AnyObject?) -> Bool {
        guard let tap, let longPress else { return false }
        return (a === tap && b === longPress) || (a === longPress && b === tap)
    }
}
