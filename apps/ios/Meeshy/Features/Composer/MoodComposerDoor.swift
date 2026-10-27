import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La PORTE du mood** — le seul site qui monte le meuble pour ce format.
///
/// Elle existe parce que quatre feuilles présentent le composer de mood
/// (`RootView`, `iPadRootView`, `RootViewComponents`, `ConversationListView`) et
/// que TROIS choses leur sont communes sans appartenir ni à la surface ni au
/// meuble :
///
/// 1. **la reprise hors-ligne** — `recoverUnsentStatus()` interroge la file
///    durable, et `supersedeRecoveredStatus(clientMutationId:)` remplace la
///    ligne bloquée au lieu de la doubler. L'outbox et le `StatusViewModel` sont
///    des choses qu'une PRÉSENTATION ne connaît pas : les écrire dans la surface
///    en ferait un second chemin de publication ;
/// 2. **l'envoi**, et il est DOUBLE depuis le lot 4.7 — `setStatus(...)` pour le
///    MIROIR (chemin 2, `POST /posts` type `STATUS` + `repostOfId`, celui que le
///    mood emprunte depuis toujours) et `anchorStatusAsPost(...)` pour l'ANCRAGE
///    (chemin 1, `POST /posts/:id/repost`, le seul qui instantanie les octets
///    d'une source éphémère). La porte AIGUILLE sur le format du brouillon ;
///    elle ne devine pas. Le meuble ne publie pas davantage qu'avant : il tend un
///    `ComposerDocumentDraft` à la fermeture que ce site lui donne ;
/// 3. **les douze arguments du canal de SCÈNE**, qui n'ont aucun objet ici.
///
/// **Écrite UNE fois, et c'est le fond de l'affaire.** Les quatre feuilles
/// auraient chacune pu porter ces trois choses : ce sont quatre copies d'un même
/// geste, donc quatre contrats à faire diverger — le motif que ce dépôt a déjà
/// payé ailleurs. Elles ne gardent que ce qui leur appartient vraiment : leur
/// état de présentation, leurs detents, et la graine quand elles en ont une.
///
/// **Ce qu'elle ne fait PAS** : elle ne connaît ni la surface, ni les zones du
/// socle, ni le gate de matière. Elle donne une graine, reçoit un brouillon,
/// répond `true` ou `false`. Un refus laisse le composer ouvert — jeter ce que
/// l'auteur vient d'écrire est le seul geste qu'aucune garde de source ne
/// pourrait rattraper.
///
/// **Ses DEUX branches ne disent PAS leurs échecs de la même façon, et
/// l'asymétrie est assumée** — il faut la lire au mot près pour que la session
/// suivante ne croie pas la dette refermée des deux côtés :
///
/// - **l'ANCRAGE parle.** `StatusViewModel.anchorStatusAsPost` rend un `Bool` et
///   affiche `feed.repost.error` ; un 403 `REPOST_AUDIENCE_WIDENING`, une
///   coupure réseau ou un HORS-LIGNE laisse donc le composer OUVERT, avec sa
///   saisie, son emoji, son audience et ses mentions. Le hors-ligne est refusé
///   d'entrée, sans attendre le délai d'expiration d'`URLSession` — cet envoi
///   n'a aucune file où retomber, et faire patienter l'auteur pour le même
///   refus n'aurait rien gardé de plus ;
/// - **le MIROIR se tait.** `publishMood` rend `true` une fois `setStatus`
///   revenue, parce que `setStatus` ne rend rien — elle avale l'erreur réseau
///   dans un `catch` qui se contente d'un toast. Un gateway qui répond 500
///   referme ce chemin-là et perd la composition, exactement comme l'écran
///   historique le faisait. **DETTE consignée, non refermée par ce lot** : sa
///   levée commence par faire rendre un résultat à `setStatus`.
///
/// Le contraste avec `DocumentComposerDoor` — la porte jumelle — dit la règle
/// générale : une porte ne peut pas remonter un échec que son publieur ne lui
/// dit pas. `createPost` répond (`publishSuccess` / `publishError`),
/// `anchorStatusAsPost` répond, `setStatus` se tait. Contourner ce silence ici —
/// lire l'outbox, appeler le service — serait le second chemin d'envoi que
/// `test_laPorte_neTouchePasLesServicesDirectement` interdit.
struct MoodComposerDoor: View {

    /// La porte au sens de la table : `.moodChip` pour une création,
    /// `.repost(ofPostId:sourceFormat: .status)` pour une republication. C'est
    /// elle qui porte l'identifiant republié — la graine ci-dessous ne le
    /// double pas.
    let intent: ComposerIntent

    /// Ce que l'appelant SÈME. `nil` ⇒ composition fraîche, et c'est cette
    /// absence — et elle seule — qui autorise la reprise hors-ligne : l'écran
    /// historique posait la même condition (`initialEmoji == nil, initialText ==
    /// nil, viaUsername == nil`), pour la même raison. Préremplir une
    /// republication avec un mood bloqué en file écraserait la source qu'on
    /// venait de choisir.
    ///
    /// Sans valeur par défaut : un `nil` implicite ferait disparaître la graine
    /// d'un site de republication sans casser la moindre compilation, et la
    /// republication deviendrait un mood neuf — silencieusement.
    let seed: ComposerMoodSeed?

    /// Le modèle du mood, **sans `@ObservedObject`**. La porte n'affiche rien
    /// qui en dépende : elle l'utilise pour interroger la file et pour envoyer.
    /// L'observer ferait re-rendre le composer entier à chaque `status:created`
    /// reçu par la socket, pendant que l'auteur tape.
    let viewModel: StatusViewModel

    @Environment(\.dismiss) private var dismiss

    /// Ce que la file durable a rendu. Il arrive APRÈS la première image — la
    /// reprise est asynchrone —, ce qui est exactement pourquoi son adoption
    /// passe par `ComposerMoodSeeding` : elle ne doit rien écraser de ce que
    /// l'auteur a posé entre-temps.
    @State private var recoveredSeed: ComposerMoodSeed?

    /// La ligne de file à SUPPLANTER au renvoi. Sans elle, réémettre un mood
    /// bloqué le publierait DEUX fois à la reconnexion.
    @State private var recoveredCmid: String?

    /// **La graine EFFECTIVE** — celle que le meuble adopte, et rien d'autre.
    ///
    /// Elle est NOMMÉE plutôt qu'écrite deux fois, parce qu'elle a deux
    /// lecteurs depuis le lot 4.7 : le montage du meuble, et l'ANCRAGE, qui
    /// mesure contre elle ce que l'auteur a AJOUTÉ. Deux écritures de
    /// `seed ?? recoveredSeed` seraient deux occasions d'en corriger une seule —
    /// et le défaut serait muet : l'ancrage déclarerait une citation dont le
    /// texte est celui de la source.
    ///
    /// L'ordre du `??` n'est pas commutatif : la graine de la PORTE prime, et la
    /// reprise hors-ligne ne peut de toute façon pas coexister avec elle
    /// (`recoverStuckMoodIfComposingFresh` s'ouvre sur `guard seed == nil`).
    private var graine: ComposerMoodSeed? { seed ?? recoveredSeed }

    var body: some View {
        MeeshyComposerHost(
            intent: intent,
            // Le mood ne lit pas cette valeur : sa mémoire d'audience est
            // celle du FORMAT status (loi 10), tenue par la surface sous
            // `ComposerAudienceMemory.statusKey`, et le meuble la relit lui-même
            // à la construction. Une seconde clé posée ici en ferait une seconde
            // mémoire à faire diverger. Le paramètre reste obligatoire pour la
            // SCÈNE, que cette porte ne monte jamais.
            initialVisibility: PostVisibility.public.rawValue,
            // Le canal de la SCÈNE, sans objet ici : `.moodGrid` et
            // `.keyboardOnContent` + `.status` routent tous deux vers la surface
            // du mood, jamais vers l'atelier. Écrit en toutes lettres plutôt que
            // rendu optionnel — un défaut le ferait disparaître des sites qui,
            // eux, montent vraiment une scène.
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _, _ in false },
            onPublishDocument: { draft in await publish(draft) },
            // `moodSeed:` vient APRÈS `onPublishDocument:`, et ce n'est pas un
            // goût de mise en page : Swift n'autorise aucun réordonnancement
            // d'arguments, et cette ligne a d'abord été écrite en 3e position —
            // une erreur DURE de compilation qu'aucune garde n'attrapait, parce
            // que toutes cherchaient la PRÉSENCE du libellé, jamais son RANG.
            // `test_chaqueSiteDeMontage_presenteSesLibellesDansLOrdreDeLInit`
            // tient désormais l'ordre, pour le jour où un paramètre s'insérera
            // au milieu de cet `init` (lot 5.5, collision déclarée).
            moodSeed: graine,
            // La porte du mood ne sème AUCUN média : elle n'atteint que la
            // surface du mood, qui n'a ni canvas ni pièce jointe. Écrit en
            // toutes lettres parce que le paramètre n'a pas de défaut — un
            // défaut l'aurait fait disparaître de la porte du média reçu, qui
            // aurait alors ouvert un atelier VIDE sous une entrée de menu
            // promettant une photo posée.
            mediaSeed: nil,
            onPreview: { _, _, _, _, _ in },
            onDismiss: { dismiss() }
        )
        .task { await recoverStuckMoodIfComposingFresh() }
    }

    /// La reprise, mot pour mot celle de l'écran historique — y compris sa
    /// condition d'entrée et la restauration de `visibilityUserIds`, sans quoi
    /// un mood `ONLY`/`EXCEPT` repartirait avec une liste vide que le gateway
    /// rejette.
    private func recoverStuckMoodIfComposingFresh() async {
        guard seed == nil, recoveredSeed == nil else { return }
        guard let draft = await viewModel.recoverUnsentStatus() else { return }

        recoveredSeed = ComposerMoodSeed(
            emoji: draft.moodEmoji,
            text: draft.content,
            visibility: PostVisibility(rawValue: draft.visibility),
            visibilityUserIds: draft.visibilityUserIds
        )
        recoveredCmid = draft.clientMutationId
    }

    /// **L'ENVOI — un AIGUILLAGE sur le format, depuis le lot 4.7.**
    ///
    /// Il fut un refus : `guard draft.format == .status`. Ce refus était juste
    /// tant qu'aucun écran ne peignait l'éventail sous le mood — l'ANCRAGE en
    /// post part par `POST /posts/:id/repost`, un chemin que cette porte ne
    /// possédait pas, et supposer plutôt que refuser aurait publié un ancrage
    /// sous le type STATUS, c'est-à-dire un post qui expire en une heure.
    ///
    /// L'éventail descend désormais sous les deux surfaces sans atelier
    /// (`ComposerFormatFanPlacement`), et la porte a gagné son second chemin.
    /// **L'ordre n'était pas négociable** : livrer l'éventail avant le publieur
    /// aurait armé une flèche qui, pressée, n'aurait RIEN fait — « le pire des
    /// deux mondes, puisqu'il aurait eu l'air de marcher ».
    ///
    /// Les DEUX formats que cette porte ne sait pas publier restent REFUSÉS, et
    /// le `switch` est exhaustif : un cinquième format casse la compilation ici
    /// avant de pouvoir être avalé par un `default`.
    private func publish(_ draft: ComposerDocumentDraft) async -> Bool {
        switch draft.format {
        case .status: return await publishMood(draft)
        case .post: return await anchor(draft)
        case .story, .reel: return false
        }
    }

    /// **Le MIROIR** — republier un mood en mood. Corps inchangé depuis le lot
    /// 4.6, y compris son avalement d'échec : `setStatus` ne rend rien, donc
    /// cette branche rend `true` même quand le gateway a répondu 500. Dette
    /// CONSIGNÉE du lot 4.5, dont la levée commence par faire rendre un résultat
    /// à `setStatus` — l'asymétrie avec `anchor` ci-dessous est assumée, pas
    /// oubliée.
    private func publishMood(_ draft: ComposerDocumentDraft) async -> Bool {
        guard let emoji = draft.emoji else { return false }

        HapticFeedback.success()

        // Supplanter AVANT d'envoyer, comme l'écran historique : l'inverse
        // laisserait la ligne bloquée partir à la reconnexion, en double.
        if let cmid = recoveredCmid {
            await viewModel.supersedeRecoveredStatus(clientMutationId: cmid)
            recoveredCmid = nil
        }

        await viewModel.setStatus(
            emoji: emoji,
            content: draft.text,
            visibility: draft.visibility.rawValue,
            visibilityUserIds: draft.visibilityUserIds,
            audioUrl: draft.audioUrl,
            repostOfId: draft.repostOfId,
            mentions: draft.mentions
        )
        return true
    }

    /// **L'ANCRAGE** — sortir une humeur de l'éphémère (loi 5).
    ///
    /// Trois choses qu'il ne fait PAS, et chacune serait une régression :
    ///
    /// 1. **il ne SUPPLANTE aucune ligne de file.** `supersedeRecoveredStatus`
    ///    annule une ligne d'outbox de type STATUS ; un ancrage n'en enfile
    ///    aucune, et l'appeler ici détruirait un mood bloqué que l'auteur n'a
    ///    pas renvoyé. Preuve structurelle, en plus de la règle :
    ///    `recoverStuckMoodIfComposingFresh` s'ouvre sur `guard seed == nil`, et
    ///    les deux sites de republication passent une graine non nulle —
    ///    `recoveredCmid` est donc TOUJOURS `nil` sous une republication ;
    /// 2. **il ne FERME pas.** La sortie appartient au meuble, qui la
    ///    conditionne à l'acceptation. Un `dismiss()` posé ici court-circuiterait
    ///    ce gate et jetterait la saisie sur un 403
    ///    `REPOST_AUDIENCE_WIDENING` ;
    /// 3. **il ne DIT pas l'échec une seconde fois.** `anchorStatusAsPost`
    ///    affiche déjà `feed.repost.error` ; un toast de plus ici en ferait deux
    ///    pour un seul refus.
    ///
    /// **Il n'est pas DURABLE hors ligne**, et ce n'est pas un oubli : cet
    /// ancrage n'ENFILE rien — il appelle le modèle, qui appelle le réseau —,
    /// ce que `ComposerDocumentSendPath.quotedRepost.isDurable` déclare déjà. Le
    /// refus est alors DIT et la saisie gardée, jamais un envoi silencieusement
    /// perdu ; `StatusViewModel.anchorStatusAsPost` le rend immédiatement sur un
    /// `isOffline()`, sans attendre le délai d'expiration d'`URLSession`.
    ///
    /// **La dette nommée ici a été payée À MOITIÉ au lot 7.5 — lire les deux
    /// moitiés avant de la reprendre.** Elle disait « ce qui manque n'est pas le
    /// KIND mais un ÉCRIVAIN ». L'écrivain existe (`RepostPublisher`) et
    /// l'ancrage passe désormais par lui : il porte son `X-Client-Mutation-Id`,
    /// donc le REJEU d'un même envoi cesse de republier. Deux TAPS restent deux
    /// gestes, donc deux jetons, qu'aucun `MutationLog` ne rapproche : ce sont
    /// le verrou « en vol » par CIBLE de l'écrivain (`RepostInFlightRegistry`)
    /// et le drapeau `isPublishingDocument` du meuble qui les retiennent.
    ///
    /// **Ce qui reste est la DURABILITÉ, et elle a changé de propriétaire.**
    /// L'écrivain sait enfiler ; c'est cette porte-ci qui refuse avant de
    /// l'atteindre, parce que `ComposerDocumentSendPath.quotedRepost.isDurable`
    /// vaut `false` et que `ComposerDocumentSendPlan` en fait un refus. Rendre
    /// l'ancrage durable sans RETOURNER cette table poserait un meuble qui
    /// DÉCLARE non durable un chemin qui l'est. Les deux se lèvent ensemble, par
    /// le lot qui possède la surface document — plus par la file.
    ///
    /// Le `guard` sur la source n'est pas une redite du gate de la flèche : le
    /// gate garde l'ARMEMENT, celui-ci garde l'ENVOI, et un ancrage sans source
    /// appellerait `POST /posts//repost`.
    ///
    /// **Le commentaire transmis est ce que l'auteur a AJOUTÉ**, jamais ce que
    /// la porte a semé : `ComposerAnchorComment.authored` tient la règle et son
    /// doc-comment dit ce qu'un écho coûterait. Passer `draft.text` tel quel —
    /// l'écriture évidente, et celle qui fut livrée — déclarait une citation que
    /// personne n'avait écrite sur le cas NOMINAL, une humeur ayant une phrase.
    ///
    /// **TROIS choses composées sous le mood ne SURVIVENT pas à la bascule vers
    /// l'ancrage**, et c'est structurel à l'endpoint, pas un oubli de ce site :
    ///
    /// 1. **l'emoji.** `PostService.repostPost` recopie INCONDITIONNELLEMENT le
    ///    `moodEmoji` de l'ORIGINAL dans son instantané. Changer d'emoji dans la
    ///    grille puis publier sous « Post » ne change donc rien au post produit ;
    /// 2. **les références.** `ComposerDocumentDraft.document` pose
    ///    `mentions: nil`, et `PostService.repost` n'a aucun paramètre de
    ///    mentions — une mention composée sous le mood disparaît sans un mot ;
    /// 3. **l'attribution à l'écran.** Le bandeau « Status de @X » et le titre
    ///    de republication vivent dans `ComposerMoodSurface` ; la surface
    ///    document n'en peint aucun. L'ancrage reste EXPLICITE — l'auteur a
    ///    touché le chip « Post », qui est marqué — mais sa SOURCE n'est plus
    ///    rappelée à l'écran une fois la bascule faite.
    ///
    /// Les deux premières se lèvent en changeant de chemin (`POST /posts` avec
    /// `repostOfId`, qui accepte `moodEmoji` et `mentions`) — au prix de
    /// l'instantané des octets, ce qui est un arbitrage produit et non une
    /// correction. La troisième se lève en portant `viaUsername` jusqu'à la
    /// surface document ; elle n'exige AUCUNE clé neuve
    /// (`ComposerMoodCopy.repostVia` et `status.composer.title.repost` sont
    /// traduites), seulement une mesure de contraste de plus.
    private func anchor(_ draft: ComposerDocumentDraft) async -> Bool {
        guard let source = draft.repostOfId else { return false }

        let accepte = await viewModel.anchorStatusAsPost(
            sourceStatusId: source,
            content: ComposerAnchorComment.authored(
                draftText: draft.text,
                seededText: graine?.text
            ),
            visibility: draft.visibility.rawValue
        )
        guard accepte else { return false }

        HapticFeedback.success()
        return true
    }
}
