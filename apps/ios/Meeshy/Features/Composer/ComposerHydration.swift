import Foundation
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

    /// Un POST ou un RÉEL publié qu'on rouvre pour le MODIFIER (#9333).
    ///
    /// Même asymétrie que `.editingStory`, pour la même raison : la porte relit
    /// la scène du ViewModel à l'enregistrement — c'est elle qui dit quel média
    /// l'auteur a retiré. La graine porte ce que le DOCUMENT montre à côté de la
    /// scène : le texte, l'audience, la langue et le lieu de la publication.
    case editingPublication(StoryComposerViewModel, ComposerPublicationEditSeed)

    /// Un post ou un réel qu'on CITE. Le meuble construit une scène vierge ;
    /// la carte de la source s'y pose, figée, et plafonne l'audience.
    case quotingPublication(ComposerQuotedPublication)

    /// La story SOURCE d'une republication — `nil` pour une édition, dont le
    /// contenu vit dans le ViewModel et non dans un `StoryItem` à part.
    var repostSource: StoryItem? {
        switch self {
        case .editingStory, .editingPublication, .quotingPublication: return nil
        case .repostingStory(let story, _): return story
        }
    }

    /// La carte que la scène montre : la source d'une citation, ou celle qu'un
    /// repost rouvert porte déjà.
    var quotedPublication: ComposerQuotedPublication? {
        switch self {
        case .quotingPublication(let cite): return cite
        case .editingPublication(_, let graine): return graine.quoted
        case .editingStory, .repostingStory: return nil
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
        case .editingStory, .editingPublication:
            return nil
        case .repostingStory(let story, _):
            return StoryRepostAudience.allowed(fromRawValue: story.visibility)
        case .quotingPublication(let cite):
            return cite.visibility.map { StoryRepostAudience.allowed(fromRawValue: $0) }
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
    /// **L'ÉDITION part de l'audience ACTUELLE de la story** (#15629) : le
    /// ViewModel hydraté la porte (`editingInitialVisibility`), et la scène du
    /// meuble, seule à composer l'édition désormais, la lit ICI — jamais un
    /// dernier choix mémorisé.
    var initialVisibility: String? {
        switch self {
        case .editingStory(let hydrate):
            return hydrate.editingInitialVisibility
        case .editingPublication(_, let graine):
            return graine.visibility
        case .repostingStory(let story, _):
            return story.visibility ?? PostVisibility.private.rawValue
        case .quotingPublication(let cite):
            return cite.visibility
        }
    }

    /// Les destinataires nommés d'une audience `ONLY`/`EXCEPT`. Vide quand la
    /// source n'en porte pas — jamais `nil` : une liste absente et une liste
    /// vide veulent dire la même chose ici, et l'atelier attend un tableau.
    var initialVisibilityUserIds: [String] {
        switch self {
        case .editingStory(let hydrate):
            return hydrate.editingInitialVisibilityUserIds
        case .editingPublication(_, let graine):
            return graine.visibilityUserIds
        case .repostingStory(let story, _):
            return story.visibilityUserIds ?? []
        case .quotingPublication:
            return []
        }
    }

    /// **Le réel d'une publication rouverte** — `nil` hors de cette porte.
    ///
    /// La qualification du meuble ne lit que les objets de la slide courante :
    /// un réel rouvert sur deux fonds d'image n'y qualifierait pas, et
    /// s'ouvrirait en post. L'édition répond donc par la règle de l'éditeur
    /// historique, sur ce que les slides montrent encore.
    func publicationReelGate(slides: [StorySlide]) -> Bool? {
        publicationSeed?.baseline.reelIsChoosable(slides: slides)
    }

    /// L'agencement d'une publication rouverte voyage-t-il ? `nil` hors de
    /// cette porte. Le canal document le refuserait (`documentCarriesEveryMedia` :
    /// les fonds rouverts vivent dans l'atelier), alors que la modification le
    /// porte en réécrivant le canevas d'origine.
    func publicationLayoutsTravel(slides: [StorySlide]) -> Bool? {
        publicationSeed?.baseline.layoutIsEditable(slides: slides)
    }

    /// Ce que le DOCUMENT rouvre — `nil` pour toute hydratation qui n'en a pas.
    var publicationSeed: ComposerPublicationEditSeed? {
        guard case .editingPublication(_, let graine) = self else { return nil }
        return graine
    }
}

/// Les champs du document d'une publication rouverte.
nonisolated struct ComposerPublicationEditSeed: Equatable {
    let text: String
    let visibility: String
    let visibilityUserIds: [String]
    let language: String
    let location: SharedPlace?
    /// Ce que la publication ÉTAIT : la règle du réel la relit à chaque passe.
    let baseline: PostEditBaseline
    /// La source qu'un repost cite — `nil` pour une publication qui ne republie rien.
    var quoted: ComposerQuotedPublication? = nil
}

/// **Ce que le document montre à l'ouverture** : l'audience — publication
/// rouverte, plafond d'une republication ou mémoire du format —, le texte, la
/// langue et le lieu. Une seule lecture pour toutes les portes, faite hors du
/// meuble : son `init` n'a qu'à la poser.
struct ComposerDocumentOpening {
    let visibility: PostVisibility
    let visibilityUserIds: [String]
    let text: String
    let language: String
    let location: SharedPlace?

    /// **Une hydratation PLAFONNÉE gagne sur la mémoire** : republier une
    /// story privée en la voyant ouverte sur « Amis » offrirait une faute que
    /// le serveur refuserait ensuite (403 `REPOST_AUDIENCE_WIDENING`). Une
    /// publication rouverte s'ouvre sur SON audience, une story qu'on modifie
    /// aussi (`editingInitialVisibility`, liste comprise). La mémoire est donc lue
    /// seulement quand aucune hydratation n'impose d'audience, et l'audience
    /// passe toujours par le validateur commun (`selectable`, dans `seed`).
    static func of(hydration: ComposerHydration?, format: ComposerFormat, doorVisibility: String,
                   defaults: UserDefaults = .standard) -> ComposerDocumentOpening {
        let imposee = hydration?.initialVisibility
        let graine = hydration?.publicationSeed
        let liste = graine?.visibilityUserIds ?? hydration?.initialVisibilityUserIds ?? []
        return ComposerDocumentOpening(
            visibility: ComposerAudienceMemory.imposed(imposee, userIds: liste)
                ?? ComposerAudienceMemory.seed(
                    rememberedRaw: imposee == nil
                        ? ComposerAudienceMemory.key(for: format).flatMap { defaults.string(forKey: $0) }
                        : nil,
                    doorRaw: imposee ?? doorVisibility),
            visibilityUserIds: liste,
            text: graine?.text ?? "",
            language: graine?.language ?? DefaultComposerLanguage.resolve(),
            location: graine?.location
        )
    }
}
