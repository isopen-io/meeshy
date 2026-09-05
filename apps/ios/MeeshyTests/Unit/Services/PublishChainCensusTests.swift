import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le recensement de la chaîne de publication** (#5196).
///
/// ## Pourquoi ce fichier existe
///
/// Un post peut partir par DEUX voies, et elles ne portent pas la même chose :
///
/// | voie | corps | quand |
/// |---|---|---|
/// | EN LIGNE | `CreatePostRequest` (SDK) | `PostService.create` |
/// | DURABLE | `CreatePostBody` (app) | `FeedViewModel.publish` → `OutboxDispatcher` — **tout post du meuble**, en ligne comme hors ligne |
///
/// Les deux frappent le MÊME schéma serveur (`CreatePostSchema` — il n'y a
/// qu'un contrat, pas deux). Un champ présent dans l'un et absent de l'autre
/// n'est donc jamais une différence de contrat. C'est **soit une PERTE** —
/// silencieuse, le dépôt l'a payée sept fois : ni le compilateur, ni le schéma,
/// ni le serveur ne la signalent, puisque le serveur publie sans le champ —
/// **soit une CAPACITÉ qu'aucune porte du meuble n'offre**. Les deux se
/// corrigent différemment, et `absentsDeLaVoieDurable` porte la distinction.
///
/// `CreatePostBody` porte lui-même le diagnostic :
///
/// > *« Ce type est un INVENTAIRE recopié à la main : rien n'y signale un champ
/// > absent — ni le compilateur, ni le schéma, ni le serveur, qui publie sans
/// > lui. »*
///
/// **Sept champs ont déjà été perdus à ce mètre.** Cinq sont réparés et portent
/// chacun leur commentaire disant pourquoi ils manquaient : `location`,
/// `discoverabilityPrecision`, `repostOfId`, `mobileTranscription`,
/// `storyEffects` (#4756), auxquels s'ajoute `mediaCaption` (#5142). Chaque
/// réparation a coûté une mesure à l'écran, parce que rien d'autre ne pouvait
/// la déclencher.
///
/// ## La forme retenue, et pourquoi c'est celle-là
///
/// Ce n'est **pas** un douzième témoin champ par champ. Il y en a déjà onze dans
/// `OutboxDispatcherCreatePostEncodingTests`, et ils n'ont attrapé aucune des
/// sept pertes : un témoin par champ ne peut, par construction, rien dire du
/// champ auquel personne n'a pensé.
///
/// C'est un **RECENSEMENT par réflexion** — `Mirror` sur une instance, la
/// définition de Swift lui-même pour « propriété stockée ». La même règle
/// qu'emploient déjà `SceneObjectFieldCensusTests` et
/// `CanvasV3ExhaustivityTests` sur les modèles d'objet : une seconde convention
/// en aurait fait deux.
///
/// > **Un inventaire humain se maintient à la main ; un recensement se maintient
/// > tout seul.** Le § 6 bis du modèle du composer a tiré cette leçon pour la
/// > CHARGE d'un objet et l'a appliquée en faisant RÉPANDRE les cinq branches du
/// > convertisseur passerelle. La chaîne de publication est la même forme, un
/// > étage plus haut, et personne ne l'y avait portée.
///
/// Détail : `docs/product/meeshy-composer-modele.md` § 6 bis-2.
final class PublishChainCensusTests: XCTestCase {

    // MARK: - Les inventaires, par réflexion

    private func champs<T>(_ instance: T) -> Set<String> {
        Set(Mirror(reflecting: instance).children.compactMap(\.label))
    }

    /// La voie EN LIGNE. Tous ses paramètres ont un défaut : l'instance nue
    /// suffit à énumérer ses champs.
    private func voieEnLigne() -> CreatePostRequest { CreatePostRequest() }

    /// La voie DURABLE. Son `init` mémberwise n'a **aucun** défaut — et c'est
    /// délibéré (règle 1 de `PublishIntent` : chaque site DÉCLARE ce qu'il
    /// publie). L'énumération les nomme donc tous, ce qui est exactement ce
    /// qu'on veut d'un recensement.
    private func voieDurable() -> CreatePostBody {
        CreatePostBody(
            content: nil, mediaIds: nil, visibility: "PUBLIC",
            originalLanguage: nil, type: nil, moodEmoji: nil,
            audioUrl: nil, audioDuration: nil, visibilityUserIds: nil,
            location: nil, mentions: nil, discoverabilityPrecision: nil,
            repostOfId: nil, mobileTranscription: nil, storyEffects: nil,
            mediaCaption: nil
        )
    }

    /// **Renommages à la traversée.** Un champ peut voyager sous un autre nom
    /// d'un maillon à l'autre — le recensement doit le SAVOIR, sinon il compte
    /// une perte là où il n'y a qu'un alias.
    ///
    /// Vide entre les deux corps : ils partagent le vocabulaire du fil. Le seul
    /// renommage connu de la chaîne est en AMONT — `CreatePostPayload
    /// .attachmentIds` devient `mediaIds` au dispatch, un renommage INTERNE au
    /// client, documenté sur `OutboxDispatcher`. Il n'entre donc pas ici.
    private static let alias: [String: String] = [:]

    /// **Les champs du contrat que la voie DURABLE n'atteint pas** — et ils n'y
    /// manquent pas pour la même raison, ce qui change le correctif de chacun.
    ///
    /// **Réécrit le 2026-09-05, après `a372e2484e`.** Cette table s'appelait
    /// `sansTransportNiProducteur`, et le nom est devenu FAUX pour la moitié de
    /// son contenu le jour où le meuble a gagné une porte de texte alternatif.
    /// Le verdict n'a pas changé ; sa RAISON, si.
    ///
    /// | champ | producteur atteignable depuis le meuble | pourquoi il n'atteint pas la file |
    /// |---|---|---|
    /// | `mediaAlt` | **oui désormais** — `MediaEditTool.altText` (`ComposerObjectEditorRail`), monté par `MeeshyComposerHost+Portals` | il alimente `publishStoryInBackground` → **`PostService.createCanvasPost(mediaAlt:)`**, le publieur DIRECT ; et `ComposerDocumentDraft` (16 champs) n'a aucun champ d'alternative, donc la voie durable n'a rien à transporter |
    /// | `allowSoundExtraction` | non — `SoundExtractionToggle`, monté par `ComposerToolPanelHost` → `ComposerBottomBand`, **l'ATELIER seul** | aucune porte ne l'écrit sur cette voie |
    ///
    /// > **Une justification de garde se périme comme un compte.** L'ancienne
    /// > disait « rien ne peut écrire ces deux champs » ; c'est resté vrai pour
    /// > `allowSoundExtraction` et c'est devenu faux pour `mediaAlt` sans que ce
    /// > fichier bouge — le verdict identique masquait le changement. Ce qui a
    /// > sauvé la table n'est pas un témoin : c'est d'avoir relu le commit
    /// > voisin qui ouvrait la porte.
    ///
    /// **`mediaAlt` est donc à UN pas d'être une PERTE.** Il a maintenant un
    /// producteur et un transport — sur l'autre voie. Le jour où un post du
    /// meuble portant des médias part par la file en portant une description,
    /// le champ tombera, et ce sera silencieux comme les sept précédents.
    ///
    /// **Ce n'est pas une exemption pour autant.** Une exemption dirait « ce
    /// champ n'a pas à traverser » ; celui-ci l'aura à traverser dès que la
    /// voie durable saura porter une alternative — et `mediaAlt` porte alors le
    /// TEXTE ALTERNATIF d'accessibilité de chaque média, la dimension 5. La
    /// liste est ÉPINGLÉE : aucun champ NEUF ne peut la rejoindre en silence, et
    /// en retirer un exige de passer ici. C'est l'interruption qui fait le
    /// travail, pas le nombre.
    ///
    /// Suivi : #5196 · le recensement face au CONTRAT : #5239.
    private static let absentsDeLaVoieDurable: Set<String> = [
        "mediaAlt",
        "allowSoundExtraction",
    ]

    private func manquantsSurLaVoieDurable() -> Set<String> {
        let durable = champs(voieDurable())
        return champs(voieEnLigne())
            .subtracting(durable)
            .subtracting(Self.alias.keys.filter { durable.contains(Self.alias[$0]!) })
    }

    // MARK: - Le témoin qui compte

    /// **Aucun champ NEUF ne manque à la voie durable.**
    ///
    /// C'est le témoin qui aurait attrapé les sept pertes, et le seul qui puisse
    /// attraper la huitième : il ne connaît aucun champ en particulier.
    func test_aucunChampNeuf_neManqueALaVoieDurable() {
        let nouveaux = manquantsSurLaVoieDurable()
            .subtracting(Self.absentsDeLaVoieDurable)

        XCTAssertTrue(
            nouveaux.isEmpty,
            """
            \(nouveaux.sorted().joined(separator: ", ")) : ce champ existe sur la voie EN LIGNE \
            (`CreatePostRequest`) et pas sur la voie DURABLE (`CreatePostBody`) — celle que prend \
            TOUT post du meuble. Les deux frappent le MÊME schéma serveur : ce n'est donc pas une \
            différence de contrat.

            DEUX questions, dans cet ordre, et elles n'ont pas le même correctif :

            1. Un site atteignable depuis le meuble peut-il ÉCRIRE ce champ ? Si non, le porter \
               seul fabriquerait un champ INERTE — il faut d'abord une PORTE. Inscris-le alors \
               dans `absentsDeLaVoieDurable` avec son producteur et l'endroit où il est monté.
            2. Si oui, c'est une PERTE, et elle est silencieuse : ni le compilateur, ni le schéma, \
               ni le serveur ne la signalent. Porte le champ sur les quatre maillons — \
               `PublishIntent` → `OfflineQueue.enqueuePostMedia` → `CreatePostPayload` → \
               `CreatePostBody`.

            Une exemption est une DÉCISION, jamais un constat.
            """
        )
    }

    /// **La liste des champs ABSENTS de la voie durable est EXACTE.**
    ///
    /// Le pendant du témoin ci-dessus, et il tombe dans l'autre sens : réparer
    /// un champ rend ce témoin rouge, ce qui oblige à venir retirer son nom —
    /// et donc à relire la RAISON inscrite en face, qui est ce qui se périme
    /// le plus vite dans cette table.
    /// C'est voulu — une liste de défauts qu'on peut vider sans la relire
    /// redevient un inventaire à tenir à la main, exactement ce que ce fichier
    /// existe pour supprimer.
    func test_laListeDesAbsentsDeLaVoieDurable_estExacte() {
        XCTAssertEqual(
            manquantsSurLaVoieDurable(), Self.absentsDeLaVoieDurable,
            """
            La liste épinglée ne décrit plus la réalité. Si un champ a été RÉPARÉ — porte OUVERTE \
            et transport posé —, retirer son nom de `absentsDeLaVoieDurable` (et fermer sa part \
            de #5196). S'il a été AJOUTÉ, lire le \
            message du témoin voisin avant d'y toucher.
            """
        )
    }

    /// **Le recensement des deux corps est le compte réel.**
    ///
    /// Ce témoin ne compare rien : il INTERROMPT. Un champ ajouté à l'un des
    /// deux corps le fait rougir en nommant le nouveau compte, et la question
    /// qu'il pose est celle que les sept pertes n'ont jamais eu l'occasion de
    /// se voir poser : *ce champ traverse-t-il l'autre voie ?*
    func test_leRecensementDesDeuxCorps_estLeCompteReel() {
        XCTAssertEqual(champs(voieEnLigne()).count, 18,
                       "`CreatePostRequest` (voie EN LIGNE) a changé de taille — ce champ neuf "
                       + "traverse-t-il la voie DURABLE ?")
        XCTAssertEqual(champs(voieDurable()).count, 16,
                       "`CreatePostBody` (voie DURABLE) a changé de taille — ce champ neuf "
                       + "vient-il des quatre maillons amont, ou naît-il ici ?")
    }
}
