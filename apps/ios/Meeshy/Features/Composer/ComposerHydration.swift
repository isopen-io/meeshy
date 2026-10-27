import MeeshySDK
import MeeshyUI

/// **Comment le meuble hydrate son atelier quand le contenu EXISTE DÉJÀ** —
/// l'édition d'une story publiée et sa republication (#5053).
///
/// ## Le manque que ce type comble, et pourquoi il était nommé sans être fermé
///
/// `ComposerIntent` connaissait `.edit` et `.repost` depuis longtemps : la table
/// des portes leur donne un profil, un éventail de formats, un plafond. Mais
/// elle les ROUTAIT vers l'atelier nu (`routesToLegacy: .repostComposer` /
/// `.storyEdit`), et le commentaire de `ComposerIntent` disait exactement
/// pourquoi — trois manques, énumérés :
///
/// 1. « le meuble n'a aucune graine `StoryItem` (son `init` n'en prend pas) » ;
/// 2. « son canal de scène ne porte pas `repostOfId` » ;
/// 3. « il ne passe ni `allowedVisibilities` ni `initialVisibilityUserIds` à
///    l'atelier, si bien que le plafond d'audience du repost tomberait EN
///    SILENCE ».
///
/// Le deuxième n'en était pas un : `onPublishAllInBackground` est une FERMETURE
/// fournie par la porte, qui capture l'identifiant de la source — c'est ce que
/// faisait déjà le cover de `StoryViewerView`. Une signature qui ne nomme pas
/// une valeur ne l'empêche pas de voyager. Restaient le premier et le
/// troisième ; ce type les ferme ENSEMBLE, et c'est délibéré : ils sont deux
/// faces d'une même chose. Une hydratation dit à la fois **quel contenu**
/// l'atelier reprend et **quelle audience** ce contenu autorise. Les avoir
/// séparés en deux paramètres du meuble aurait permis d'en passer un sans
/// l'autre — c'est-à-dire de republier sans plafond, silencieusement.
///
/// ## Pourquoi une hydratation et non un ViewModel injecté
///
/// La porte pourrait construire le `StoryComposerViewModel` et le remettre au
/// meuble. C'est ce que faisaient les covers historiques, et c'est ce que le
/// doc-comment de `MeeshyComposerHost.init` interdit en toutes lettres : le
/// meuble fait ADOPTER son brouillon au ViewModel qu'il construit
/// (`adoptDraft(id:)`), et un ViewModel venu d'ailleurs s'autosauvegarderait
/// sous un identifiant neuf pendant que le brouillon repris resterait intact à
/// côté. **Un seul site construit, donc un seul site adopte.** L'hydratation
/// décrit ce qu'il faut construire ; elle ne construit pas.
///
/// Elle reste `nonisolated` : les trois propriétés ci-dessous sont pures, donc
/// jugeables sans monter une vue ni toucher au main actor.
enum ComposerHydration {

    /// Une story publiée qu'on rouvre pour la MODIFIER.
    ///
    /// **Ce cas porte le ViewModel, et pas la story — c'est la seule asymétrie
    /// de ce type, et elle est motivée.** Le publieur d'une édition RELIT le
    /// ViewModel hydraté : `editingPostId`, `editingOriginalMediaIds`,
    /// `editingOriginalBackgroundMediaId`, `editingHydratedBackgroundImage` et
    /// `editingKnowsDeclaredReferences` gouvernent la mise à jour, et la
    /// dernière décide si l'on PRÉSERVE les références déclarées ou si on les
    /// révoque — un `mentions: []` envoyé par ignorance retirerait des
    /// références que l'auteur n'a jamais vues. La porte doit donc garder une
    /// prise sur l'objet ; lui faire construire une story que le meuble
    /// hydraterait de son côté lui ôterait cette prise.
    ///
    /// **L'invariant du meuble tient quand même**, et c'est ce qui rend
    /// l'asymétrie acceptable : ce qu'il interdit est de construire un SECOND
    /// ViewModel à côté de celui de la porte — le doublon qui laisse le composer
    /// s'autosauvegarder sous un identifiant neuf pendant que le brouillon
    /// repris reste intact à côté. Ici il n'en construit aucun : il adopte celui
    /// qu'on lui remet, et lui applique `adoptDraft(id:)` comme aux autres. Un
    /// seul objet, un seul site d'adoption.
    ///
    /// La republication ci-dessous n'a pas ce besoin — son publieur ne relit
    /// rien du ViewModel, il capture l'identifiant de la source —, donc elle
    /// laisse le meuble construire. Chaque cas donne ce qu'il doit, pas ce que
    /// l'autre donne.
    case editingStory(StoryComposerViewModel)

    /// Une story qu'on REPUBLIE. `authorHandle` alimente le badge
    /// d'attribution VERROUILLÉ — le republieur ne peut pas le retirer.
    case repostingStory(StoryItem, authorHandle: String)

    /// La story SOURCE d'une republication — `nil` pour une édition, dont le
    /// contenu vit dans le ViewModel et non dans un `StoryItem` à part.
    var repostSource: StoryItem? {
        switch self {
        case .editingStory: return nil
        case .repostingStory(let story, _): return story
        }
    }

    /// **Le plafond d'audience — la loi 10 rendue par le TYPE et non par la
    /// mémoire de l'appelant.**
    ///
    /// `nil` ⇒ aucun plafond, tous les choix restent offerts. C'est le cas de
    /// l'ÉDITION : on ne restreint pas l'auteur sur son propre contenu.
    ///
    /// Une republication, elle, plafonne à `StoryRepostAudience.allowed` — même
    /// audience que l'original ou plus restreinte, jamais plus large. Le
    /// serveur refuse l'élargissement de son côté (403
    /// `REPOST_AUDIENCE_WIDENING`) ; ce plafond n'est qu'une affordance, mais
    /// une affordance dont l'absence transforme un refus serveur en échec
    /// inexpliqué au moment de publier.
    var allowedVisibilities: [PostVisibility]? {
        switch self {
        case .editingStory:
            return nil
        case .repostingStory(let story, _):
            return StoryRepostAudience.allowed(fromRawValue: story.visibility)
        }
    }

    /// L'audience de DÉPART.
    ///
    /// **La republication part de l'audience de sa source**, pas du dernier
    /// choix mémorisé : republier une story privée en la voyant ouverte sur
    /// « Amis » serait l'invitation à une faute que le serveur refuserait
    /// ensuite. Elle retombe sur `.private` — le plus restrictif — quand la
    /// source n'en déclare pas, par la même prudence que
    /// `StoryRepostAudience.allowed(fromRawValue:)`.
    ///
    /// **L'ÉDITION rend `nil`, et ce n'est pas un oubli** : le ViewModel hydraté
    /// porte `editingInitialVisibility`, que `StoryComposerView.init` réassigne
    /// en PRIORITÉ ABSOLUE — après le paramètre injecté, explicitement. En
    /// poser un ici ferait deux sources pour une même valeur, dont la seconde
    /// gagne toujours : celle qu'on aurait écrite serait morte, et l'écrire
    /// donnerait à croire qu'elle décide.
    var initialVisibility: String? {
        switch self {
        case .editingStory:
            return nil
        case .repostingStory(let story, _):
            return story.visibility ?? PostVisibility.private.rawValue
        }
    }

    /// Les destinataires nommés d'une audience `ONLY`/`EXCEPT`. Vide quand la
    /// source n'en porte pas — jamais `nil` : une liste absente et une liste
    /// vide veulent dire la même chose ici, et l'atelier attend un tableau.
    var initialVisibilityUserIds: [String] {
        switch self {
        case .editingStory:
            return []
        case .repostingStory(let story, _):
            return story.visibilityUserIds ?? []
        }
    }
}
