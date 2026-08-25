import Foundation
import MeeshySDK

// MARK: - L'intention

/// **Ce que l'auteur republie, composé UNE seule fois.**
///
/// Républier était NEUF appels réseau écrits neuf fois — le fil, les réels, le
/// détail, le profil, la racine, la vue de fil, deux fois le viewer de story et
/// l'ancrage d'un mood. Tous appelaient `PostService.repost` en direct, en
/// ligne, sans jeton d'idempotence : hors ligne le geste était JETÉ (un toast,
/// et rien), et en ligne rien ne retenait un second envoi — ni jeton sur la
/// requête, ni verrou sur la cible. Le kind `.repostPost`, sa charge
/// `RepostPostPayload` et son
/// `dispatchRepostPost` existaient déjà, complets et testés — **personne
/// n'enfilait**.
///
/// Ce type est la moitié « intention » de la réponse ; `RepostPublisher` en est
/// la moitié « écrivain ». Deux types parce que deux questions : QUOI part
/// (ici, une valeur pure, comparable, transportable) et PAR OÙ (là, une
/// décision qui dépend du réseau et possède la file).
///
/// ## Trois règles gravées ici
///
/// 1. **Aucune valeur par défaut sur les fabriques.** Un défaut fait
///    disparaître un champ d'un site d'appel sans casser la moindre
///    compilation — c'est par là qu'un mood hors ligne a perdu sa source et sa
///    voix. Chaque geste DÉCLARE tout ce qu'il republie, `nil` compris.
///    Patron identique à `PublishIntent`, posé au même endroit par la tâche 7.3.
/// 2. **L'init est PRIVÉ.** On n'entre dans ce type que par un geste NOMMÉ. Un
///    dixième site de republication ne peut donc pas se composer une intention
///    à sa façon : il doit d'abord dire QUEL GESTE il publie.
/// 3. **Le jeton naît avec l'INTENTION, pas avec l'envoi.** C'est ce qui rend
///    le REJEU inoffensif : la file rejoue la même ligne, donc le même jeton, et
///    `withMutationOutcome` (tâche 7.1b, `replayCost: 'diverges'`) resert le
///    résultat au lieu de republier. Un jeton dérivé du CONTENU ferait
///    l'inverse — deux republications volontaires du même post passeraient pour
///    un rejeu, et la seconde ne partirait jamais.
///
///    **Ce jeton ne couvre QUE le rejeu, et c'est structurel.** Chaque tap
///    construit une intention NEUVE au site d'appel, donc un jeton neuf : deux
///    TAPS sont deux gestes que le gateway ne peut, par construction, pas
///    rapprocher. Le double tap est un défaut DISTINCT du rejeu, et il se
///    retient ailleurs — règle 4.
/// 4. **Le double tap se retient PAR CIBLE — deux fois, parce que l'envoi a
///    DEUX chemins.** EN LIGNE : `RepostInFlightRegistry`, revendiquée puis
///    relâchée par `RepostPublisher.publish`. Tant qu'une republication du même
///    `postId` n'est pas retombée, la suivante ne part pas et rend
///    `.alreadyInFlight`. Le verrou est PROCESSUS-large et non par instance
///    parce que les sites d'appel construisent un publieur NEUF à chaque tap
///    (`RepostPublisher(postService:)` dans `ReelsViewModel`, `FeedViewModel`,
///    `ProfileUserPostsList`, `StatusViewModel`) : un verrou porté par
///    l'instance ne retiendrait rien.
///
///    **HORS LIGNE, ce verrou ne retient RIEN, et c'est structurel.** `publish`
///    relâche au RETOUR d'`envoyer` ; or hors ligne `envoyer` se termine dès
///    qu'`offlineQueue.enqueue` a rendu la main, pas quand la republication
///    aboutit. Le verrou tombe donc avant que le doigt ne se relève. Ce qui
///    retient là est l'idempotence PAR CIBLE DANS LA FILE :
///    `OfflineQueueing.hasUnsentRow(kind:anchor:)`, interrogée AVANT d'enfiler,
///    le tap avalé rendant `.alreadyQueued`. Elle est plus forte que le verrou,
///    parce qu'elle survit à la mort de l'app entre les deux taps.
///
///    **Ni l'un ni l'autre ne porte sur l'HISTORIQUE.** Le verrou se relâche à
///    la retombée du vol ; la file ne compte que les lignes `.pending`,
///    `.inflight` et `.failed` — une republication ABOUTIE a quitté la table.
///    Republier, supprimer, republier reste donc possible : exactement le geste
///    qu'un jeton dérivé du CONTENU rendrait impossible.
///
///    **Ce qu'aucun des deux ne couvre, et c'est voulu** : une ligne
///    `.exhausted`, sur laquelle le flusher a renoncé, ne retient plus rien —
///    un tap neuf grave une ligne neuve plutôt que de laisser le bouton inerte
///    jusqu'à ce que l'auteur vide sa pastille de synchro.
nonisolated struct RepostIntent: Equatable, Sendable {

    /// Le jeton d'ENVOI (`cmid_<uuid>`), envoyé en `X-Client-Mutation-Id`.
    let clientMutationId: String
    /// L'identifiant de la SOURCE — déjà replié sur sa racine par
    /// `RepostTargeting` chez les appelants qui repostent une carte de liste.
    let postId: String
    /// Le format CIBLE. `nil` = la carte a disparu du modèle entre le tap et
    /// l'envoi ; en ligne le filet du gateway (`?? PostType.POST`) tranche,
    /// hors ligne l'écrivain REFUSE plutôt que d'inventer — voir
    /// `RepostRefusal.unknownTargetTypeOffline`.
    let targetType: PostType?
    /// Le commentaire de citation. `nil` pour un repartage sec.
    let content: String?
    /// Décide côté serveur où s'enracinent les réactions (`reactionRootId`) :
    /// une citation les garde, un repartage sec les renvoie sur l'original.
    /// Ce n'est donc pas un doublon de `content != nil`.
    let isQuote: Bool
    /// Audience choisie par le reposteur. `nil` ⇒ le serveur hérite de celle de
    /// l'original. Une valeur plus LARGE que l'original est refusée par un 403
    /// `REPOST_AUDIENCE_WIDENING` — un échec TERMINAL, jamais un rejeu.
    let visibility: String?

    private init(
        clientMutationId: String,
        postId: String,
        targetType: PostType?,
        content: String?,
        isQuote: Bool,
        visibility: String?
    ) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.targetType = targetType
        self.content = content
        self.isQuote = isQuote
        self.visibility = visibility
    }

    /// Le geste « **je repartage cette carte** », sans un mot ajouté.
    static func simple(
        postId: String,
        targetType: PostType?,
        visibility: String?
    ) -> RepostIntent {
        RepostIntent(
            clientMutationId: ClientMutationId.generate(),
            postId: postId,
            targetType: targetType,
            content: nil,
            isQuote: false,
            visibility: visibility
        )
    }

    /// Le geste « **je repartage en CITANT** » — depuis une surface qui recueille
    /// vraiment un commentaire.
    ///
    /// Un commentaire vide ou blanc n'est PAS une citation : c'est la règle que
    /// trois des quatre sites de citation appliquaient déjà, chacun de son côté
    /// et avec sa propre écriture. Elle vit ici désormais, une fois.
    static func quoted(
        postId: String,
        targetType: PostType?,
        comment: String?,
        visibility: String?
    ) -> RepostIntent {
        let ebarbe = comment?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cite = !(ebarbe?.isEmpty ?? true)
        return RepostIntent(
            clientMutationId: ClientMutationId.generate(),
            postId: postId,
            targetType: targetType,
            content: cite ? ebarbe : nil,
            isQuote: cite,
            visibility: visibility
        )
    }

    /// Le geste « **je repartage en CITANT** » d'une surface qui DÉCLARE la
    /// citation sans recueillir de commentaire — l'alerte « Citer » de la
    /// feuille de détail, qui n'a aucun champ de saisie.
    ///
    /// Ce geste existe pour rester FIDÈLE, pas par élégance. Le normaliser en
    /// repartage sec serait un changement de PRODUIT : côté serveur, `isQuote`
    /// décide où s'enracinent les réactions. La dette — une citation sans champ
    /// de citation — est donc NOMMÉE ici plutôt que corrigée à l'aveugle par un
    /// lot qui ne possède pas cette surface.
    static func declaredQuote(
        postId: String,
        targetType: PostType?,
        visibility: String?
    ) -> RepostIntent {
        RepostIntent(
            clientMutationId: ClientMutationId.generate(),
            postId: postId,
            targetType: targetType,
            content: nil,
            isQuote: true,
            visibility: visibility
        )
    }
}

// MARK: - Les deux échecs TERMINAUX, nommés

/// **Ce qu'un refus de republication VEUT DIRE**, et surtout : se rejoue-t-il ?
///
/// Deux refus sont DÉFINITIFS et doivent le rester — les rejouer boucle sans
/// fin sur un serveur qui répondra toujours la même chose :
/// - **404** : la source a disparu pendant l'attente (une story a expiré, un
///   post a été supprimé). Rejouer ne ramènera jamais un contenu effacé ;
/// - **403 `REPOST_AUDIENCE_WIDENING`** : l'audience demandée est plus LARGE
///   que celle de l'original. Le serveur la refuse par principe, pas par
///   accident de réseau.
///
/// Tout le reste — coupure, 5xx, 429 — est TRANSITOIRE : la ligne reste en
/// file et repart au retour du réseau. C'est toute la valeur de la file
/// durable, et confondre les deux familles la détruirait dans un sens comme
/// dans l'autre (jeter un geste au premier tunnel, ou boucler éternellement sur
/// une story expirée).
///
/// **La forme lue est `MeeshyError`, et c'est mesuré.** `APIClient` lance
/// `MeeshyError` sur ses vingt-cinq chemins d'erreur, et `APIError` sur aucun.
/// Le viewer de story mappait pourtant ses deux refus nommés contre
/// `APIError.serverError(code, _)` — deux branches MORTES, sous un
/// doc-comment qui affirmait « that's the shape `APIClient` throws ». Les deux
/// toasts « La story n'est plus disponible » et « Cette story ne peut pas être
/// repartagée » n'étaient donc jamais montrés. La classification vit ici, une
/// fois, pour que ce diagnostic ne se refasse pas neuf fois.
///
/// Côté FILE, la terminaison est déjà tenue par
/// `OutboxFlusher.isPermanentServerRejection` (400, 403, 404, 410, 413, 422),
/// qui ne branche jamais sur le kind : ce type ne le double pas, il donne au
/// chemin EN LIGNE le même verdict, et un nom à dire à l'auteur.
nonisolated enum RepostFailure: Equatable, Sendable {

    /// 404 — la source a disparu pendant l'attente.
    case sourceGone
    /// 403 — l'audience demandée élargit celle de l'original.
    case audienceWidening
    /// Transitoire : réseau, 5xx, 429, décodage.
    case other

    /// La ligne quitte la file et l'auteur est prévenu — jamais une boucle de
    /// rejeu.
    var isTerminal: Bool {
        switch self {
        case .sourceGone, .audienceWidening: return true
        case .other: return false
        }
    }

    static func classify(_ error: Error) -> RepostFailure {
        // 403 est surfacé par `APIClient` comme `.forbidden` (accès refusé à
        // CETTE ressource, la session restant valide), jamais comme
        // `.server(403, _)` : ne lire que la seconde forme laisserait la moitié
        // des refus d'audience boucler en silence.
        if case MeeshyError.forbidden = error { return .audienceWidening }
        if case let MeeshyError.server(statusCode, _) = error {
            if statusCode == 404 { return .sourceGone }
            if statusCode == 403 { return .audienceWidening }
        }
        return .other
    }
}

/// Le refus que l'ÉCRIVAIN oppose lui-même, avant tout réseau.
nonisolated enum RepostRefusal: Error, Equatable, Sendable {

    /// **Hors ligne ET format de la source inconnu.**
    ///
    /// `RepostTargeting` rend `targetType: nil` quand la carte a quitté le
    /// modèle entre le tap et l'envoi. En ligne, le filet du gateway
    /// (`?? PostType.POST`) tranche et la conséquence est immédiate. Dans la
    /// FILE, écrire `"POST"` à la place d'un format inconnu serait la
    /// transformation silencieuse que la loi 5 interdit — et elle survivrait à
    /// un kill de l'app, gravée dans un payload persisté que personne ne
    /// relira. Un geste refusé, dit à l'auteur, vaut mieux qu'une story
    /// changée en post permanent trois heures plus tard.
    case unknownTargetTypeOffline
}

/// Par où la republication est partie — ou pourquoi elle n'est pas partie.
nonisolated enum RepostOutcome: Equatable, Sendable {
    /// Envoyée sur le réseau, avec son `X-Client-Mutation-Id`.
    case sent
    /// Écrite dans la file durable : elle survit au hors-ligne ET au kill.
    case queued
    /// **Rien n'est parti** : une republication de la MÊME cible est encore EN
    /// VOL, et ce second tap a été avalé (`RepostInFlightRegistry`).
    ///
    /// Ce n'est NI un succès NI un échec, et c'est pourquoi `publish` le rend
    /// plutôt que de lever : lever ferait tomber les huit sites dans leur
    /// `catch`, où ils annulent leur état optimiste et disent une erreur — pour
    /// un geste dont le premier exemplaire est en train d'aboutir. L'appelant
    /// garde donc son état tel quel : le vol en cours le confirmera.
    case alreadyInFlight
    /// **Rien de neuf n'a été gravé** : une ligne `.repostPost` visant la MÊME
    /// cible attend déjà dans la file durable, et ce second tap a été avalé.
    ///
    /// Distinct de `.alreadyInFlight`, et pas par élégance : le vol EN LIGNE
    /// dure le temps d'une requête et se confirmera tout seul, tandis qu'une
    /// ligne en file attend le retour du réseau — parfois des heures, parfois
    /// un redémarrage de l'app. Les confondre ferait dire à l'appelant « c'est
    /// en train de partir » d'un geste qui attend.
    ///
    /// Comme `.alreadyInFlight`, ce n'est NI un succès NI un échec : l'appelant
    /// garde son état optimiste, la ligne déjà gravée l'honorera.
    case alreadyQueued
}

// MARK: - Le verrou « en vol »

/// **Les cibles dont une republication est PARTIE et n'est pas retombée.**
///
/// Le jeton d'idempotence (règle 3) rend le REJEU inoffensif, et rien d'autre :
/// deux TAPS construisent deux intentions, donc deux jetons, que
/// `withMutationOutcome` ne peut par construction pas rapprocher. Le seul
/// endroit qui SAIT qu'un vol est en cours est l'écrivain — c'est donc ici que
/// le double tap se retient EN LIGNE, et non dans le header.
///
/// **Un acteur PROCESSUS-large, et non un champ de `RepostPublisher`.** Les
/// sites d'appel construisent un publieur NEUF à chaque tap
/// (`RepostPublisher(postService:)` chez `ReelsViewModel`, `FeedViewModel`,
/// `ProfileUserPostsList`, `StatusViewModel` ; `.shared` chez les vues) : un
/// verrou porté par l'instance ne retiendrait rien du tout.
///
/// **Par CIBLE, jamais global.** Repartager une carte pendant qu'une autre est
/// en vol est un geste parfaitement normal — un verrou unique le refuserait.
///
/// **Il se relâche à la RETOMBÉE du vol, jamais plus tard.** Republier,
/// supprimer, republier reste faisable : c'est exactement le geste légitime
/// qu'un jeton dérivé du CONTENU rendrait impossible, le gateway rendant déjà
/// 410 sur le rejeu d'un repost supprimé.
///
/// **Sa BORNE : le chemin HORS LIGNE, qu'il ne couvre PAS.** Là, le vol
/// s'achève à l'enfilage — `publish` relâche donc la cible avant que le second
/// tap n'arrive, et ce registre le laisse passer. Ce qui retient un doublon
/// hors ligne est l'idempotence par cible DANS LA FILE
/// (`OfflineQueueing.hasUnsentRow(kind:anchor:)`, interrogée par
/// `RepostPublisher.envoyer`), qui survit de surcroît à la mort de l'app entre
/// les deux taps — ce qu'un registre de processus ne peut pas faire.
///
/// Ce verrou ne REMPLACE pas les gardes que six des huit sites tiennent déjà
/// pour leur propre bouton (`postRepostInFlightIds`, `isRepostInFlight`,
/// `repostInFlight`) : celles-là gouvernent un PIXEL — griser la puce, ne pas
/// recompter le delta optimiste. Celui-ci gouverne l'ENVOI EN LIGNE, pour les
/// huit ; l'envoi HORS LIGNE, lui, est gouverné par la file elle-même.
actor RepostInFlightRegistry {

    static let shared = RepostInFlightRegistry()

    private var ciblesEnVol: Set<String> = []

    /// Revendique `postId`. Rend `false` quand une republication de cette cible
    /// est déjà partie et n'est pas encore retombée.
    func claim(_ postId: String) -> Bool {
        ciblesEnVol.insert(postId).inserted
    }

    func release(_ postId: String) {
        ciblesEnVol.remove(postId)
    }
}

// MARK: - L'écrivain UNIQUE

/// **Le seul endroit du dépôt qui republie.**
///
/// Il tient les deux moitiés de la tâche 7.5 :
/// - **un écrivain** : `PostService.repost` n'a plus qu'un appelant applicatif,
///   et une garde de source le vérifie (`RepostIntentTests`) ;
/// - **il survit au réseau** : hors ligne, le geste s'écrit dans l'outbox GRDB
///   sous le kind `.repostPost` au lieu d'être jeté avec un toast — UNE fois
///   par cible : `RepostPublisher` INTERROGE la file (`hasUnsentRow`) et
///   refuse lui-même d'en graver une seconde tant que la première n'est pas
///   partie. La file répond, elle ne décide pas — cf. `OfflineQueue`.
///
/// **`nonisolated`** : l'app compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION =
/// MainActor`, et cet écrivain est construit par des vues comme par des
/// modèles, puis appelé depuis des `Task` qui n'ont pas tous la même
/// isolation. Le clouer au main actor le rendrait intransportable — même
/// raison que pour `PublishIntent` et `CreatePostBody`.
///
/// **Il ne possède AUCUN état optimiste**, et c'est délibéré : les neuf sites
/// gardent chacun leur liste, leur compteur et leur rollback, qui diffèrent.
/// Un seul écrivain du CORPS, pas un seul propriétaire de la liste — la même
/// frontière que la tâche 7.7 a tenue pour l'édition.
nonisolated struct RepostPublisher: Sendable {

    /// Pour les surfaces qui n'injectent rien (les vues). Les modèles
    /// construisent le leur avec le service qu'on leur a injecté, sans quoi
    /// leurs doubles de test cesseraient d'observer l'envoi.
    static let shared = RepostPublisher()

    private let postService: PostServiceProviding
    private let offlineQueue: OfflineQueueing
    private let isOffline: @Sendable () -> Bool

    init(
        postService: PostServiceProviding = PostService.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        isOffline: @escaping @Sendable () -> Bool = { NetworkMonitor.shared.isOffline }
    ) {
        self.postService = postService
        self.offlineQueue = offlineQueue
        self.isOffline = isOffline
    }

    /// Un second tap sur une cible ENCORE EN VOL ne part pas : il rend
    /// `.alreadyInFlight` sans toucher ni le réseau ni la file. Voir
    /// `RepostInFlightRegistry` pour ce que ce verrou couvre — et ce que le
    /// jeton d'idempotence, lui, ne pouvait pas couvrir.
    ///
    /// **Ce verrou s'arrête au bord du hors-ligne**, où le vol s'achève à
    /// l'enfilage : un second tap y est retenu par `envoyer(_:)`, qui demande
    /// à la file si une ligne non partie vise déjà cette cible et renonce
    /// lui-même à en graver une seconde, en rendant `.alreadyQueued`.
    /// Voir `envoyer(_:)`.
    ///
    /// - Throws: `RepostRefusal` pour un refus décidé ici, ou l'erreur du
    ///   réseau telle quelle — les appelants la nomment par
    ///   `RepostFailure.classify(_:)` pour choisir leur message.
    @discardableResult
    func publish(_ intent: RepostIntent) async throws -> RepostOutcome {
        guard await RepostInFlightRegistry.shared.claim(intent.postId) else { return .alreadyInFlight }
        // `defer` ne peut pas `await`, et relâcher depuis un `Task` détaché
        // ferait survivre le verrou à son vol d'un délai que personne ne
        // borne : le tap SUIVANT, légitime, y tomberait. Les deux sorties
        // relâchent donc explicitement.
        do {
            let issue = try await envoyer(intent)
            await RepostInFlightRegistry.shared.release(intent.postId)
            return issue
        } catch {
            await RepostInFlightRegistry.shared.release(intent.postId)
            throw error
        }
    }

    private func envoyer(_ intent: RepostIntent) async throws -> RepostOutcome {
        guard isOffline() else {
            _ = try await postService.repost(
                postId: intent.postId,
                targetType: intent.targetType,
                content: intent.content,
                isQuote: intent.isQuote,
                visibility: intent.visibility,
                clientMutationId: intent.clientMutationId
            )
            return .sent
        }

        // **La BORNE du verrou « en vol », refermée ici.** `publish` a bien
        // revendiqué la cible, mais il relâche au RETOUR d'`envoyer` — et hors
        // ligne ce retour a lieu dès que la ligne est gravée, pas quand la
        // republication aboutit. Le verrou tombe donc en une milliseconde et
        // le tap suivant le revendique librement : deux lignes, deux `cmid`,
        // deux reposts au flush.
        //
        // Ce que la file rend est plus fort qu'un verrou de processus : il
        // survit à la mort de l'app entre les deux taps. Et il ne porte QUE
        // sur les lignes en attente — jamais sur l'historique : une
        // republication ABOUTIE a quitté la table, si bien que republier,
        // supprimer, republier reste faisable. C'est exactement le geste
        // qu'un `clientMutationId` dérivé du CONTENU rendrait impossible, le
        // gateway rendant 410 sur le rejeu d'un repost supprimé.
        //
        // La question précède la loi 5 à dessein : quand une ligne attend
        // déjà pour cette cible, il n'y a plus rien à graver, donc plus rien
        // à refuser.
        if await offlineQueue.hasUnsentRow(kind: .repostPost, anchor: intent.postId) {
            return .alreadyQueued
        }

        // Loi 5 — « le repost miroite ». Le format voyage EXPLICITEMENT ou ne
        // voyage pas : `RepostPostPayload.targetType` n'est pas optionnel, et
        // le remplir d'un `POST` inventé graverait dans un magasin persisté
        // exactement ce que le repli serveur produit par accident.
        guard let targetType = intent.targetType else {
            throw RepostRefusal.unknownTargetTypeOffline
        }

        try await offlineQueue.enqueue(
            .repostPost,
            payload: RepostPostPayload(
                clientMutationId: intent.clientMutationId,
                postId: intent.postId,
                targetType: targetType.rawValue,
                content: intent.content,
                isQuote: intent.isQuote,
                visibility: intent.visibility
            ),
            // La ligne se range sous la SOURCE : c'est le seul identifiant qui
            // existe déjà à l'enfilage, et celui que la pastille de synchro sait
            // ouvrir (`OutboxUIItem.mapRepostPost` → `.post(id:)`). Le repost,
            // lui, n'a pas encore d'identité.
            conversationId: intent.postId
        )
        return .queued
    }
}
