import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **La flèche du socle publie DEPUIS LA PORTE DU TRAY** (#4751).
///
/// La porte du tray servait `onPublishDocument: { _ in false }` — un refus
/// inconditionnel, honnête tant que `.cameraReady` routait toujours vers la
/// scène. Depuis que cette ouverture monte le meuble, l'auteur qui bascule
/// l'éventail sur « Post » sans rien poser sur la scène atteint le SOCLE, dont
/// la flèche appelait ce refus.
///
/// > Une règle de routage qui ouvre un chemin doit livrer ce que ce chemin
/// > promet. Un correctif qui déplace l'auteur vers un écran mieux dessiné et
/// > l'y laisse devant un bouton inerte a échangé un défaut visible contre un
/// > défaut MUET.
///
/// Ces témoins mesurent le COMPORTEMENT — ce qui part dans la file — et non la
/// présence d'un appel : `MeeshyComposerHostGuardTests` garde le câblage, ici on
/// garde ce qu'il produit.
final class ComposerDocumentTrayPublishTests: XCTestCase {

    private func brouillon(
        format: ComposerFormat = .post,
        text: String? = "un billet écrit depuis le tray",
        localMedia: [ComposerDocumentMedia] = [],
        repostOfId: String? = nil
    ) -> ComposerDocumentDraft {
        ComposerDocumentDraft(
            format: format,
            text: text,
            emoji: nil,
            visibility: .public,
            visibilityUserIds: nil,
            mentions: nil,
            repostOfId: repostOfId,
            audioUrl: nil,
            localMedia: localMedia,
            location: nil,
            discoverabilityPrecision: nil,
            originalLanguage: "fr",
            forcePlainPost: false,
            mobileTranscription: nil
        )
    }

    /// **LE témoin.** Un post composé depuis le tray part dans la file durable.
    func test_unPostDuTray_partDansLaFileDurable() async {
        let file = MockOfflineQueue()

        let accepte = await ComposerDocumentDurablePublisher.publish(
            brouillon(), queue: file, isOffline: false)

        XCTAssertTrue(accepte, "la flèche doit ACCEPTER : sinon le composer reste ouvert sur un envoi réussi")
        XCTAssertEqual(file.enqueuePostMediaCalls.count, 1,
                       "un envoi, une entrée de file — ni zéro (flèche inerte) ni deux (doublon)")
        XCTAssertEqual(file.enqueuePostMediaCalls.first?.content, "un billet écrit depuis le tray")
    }

    /// Le format CHOISI voyage jusqu'au fil. Sans lui, basculer l'éventail sur
    /// « Post » publierait le type déduit des médias — donc un POST pour une
    /// story et l'inverse — un choix qui a l'air de marcher.
    func test_leFormatChoisi_voyageJusquALaFile() async {
        let file = MockOfflineQueue()
        _ = await ComposerDocumentDurablePublisher.publish(
            brouillon(format: .post), queue: file, isOffline: false)

        XCTAssertEqual(file.enqueuePostMediaCalls.first?.type, ComposerFormat.post.postType.rawValue,
                       "un post doit partir sous son propre type")
    }

    /// **Un RÉEL sans matière est refusé, et c'est juste.**
    ///
    /// Ce témoin a d'abord été écrit à l'envers — il attendait qu'un `.reel`
    /// texte-seul parte sous le type `"REEL"`. Rien n'est parti, et c'est le
    /// témoin qui avait tort : un réel EST une vidéo, et
    /// `ComposerDocumentSendPlan` le refuse faute de matière. Le publieur
    /// délègue cette règle au lieu de la réécrire, ce qui est exactement ce
    /// qu'on veut vérifier ici.
    ///
    /// > Un témoin écrit pour prouver qu'un chemin marche peut prouver qu'il
    /// > refuse — et si le refus est juste, c'est l'attente qu'il faut
    /// > corriger, jamais le code qu'elle accuse.
    ///
    /// Ce que ce témoin ne dit PAS : ce qu'il advient d'un réel AVEC sa vidéo
    /// depuis les autres portes. Le pair a inscrit #4755 là-dessus — les deux
    /// publieurs restants le refusent, l'un par un toast, l'autre en silence —
    /// et c'est antérieur à ce lot.
    func test_unReelSansMatiere_estRefuse_carUnReelEstUneVideo() async {
        let file = MockOfflineQueue()

        let accepte = await ComposerDocumentDurablePublisher.publish(
            brouillon(format: .reel), queue: file, isOffline: false)

        XCTAssertFalse(accepte)
        XCTAssertTrue(file.enqueuePostMediaCalls.isEmpty,
                      "rien ne doit partir : un réel sans vidéo n'est pas un réel")
    }

    /// **Le refus reste un refus.** La règle d'envoi est partagée avec la porte
    /// du fil ; ce site ne la contourne pas. Une citation n'a pas de chemin
    /// durable — la laisser passer publierait un post ordinaire et perdrait
    /// l'ancrage, sans erreur.
    func test_uneCitation_estREFUSEE_etRienNePart() async {
        let file = MockOfflineQueue()

        let accepte = await ComposerDocumentDurablePublisher.publish(
            brouillon(repostOfId: "post-source"), queue: file, isOffline: false)

        XCTAssertFalse(accepte)
        XCTAssertTrue(file.enqueuePostMediaCalls.isEmpty,
                      "un refus qui enfile quand même publierait ce qu'il vient de refuser")
    }

    /// Un texte VIDE ne part pas non plus — et c'est le plan qui le dit, pas une
    /// seconde normalisation écrite ici.
    func test_unBrouillonVide_neProduitAucunEnvoi() async {
        let file = MockOfflineQueue()

        let accepte = await ComposerDocumentDurablePublisher.publish(
            brouillon(text: nil), queue: file, isOffline: false)

        XCTAssertFalse(accepte)
        XCTAssertTrue(file.enqueuePostMediaCalls.isEmpty)
    }

    /// **Un échec d'enfilage REFUSE.** Rendre `true` fermerait le composer sur
    /// une publication qui n'a pas eu lieu — et l'auteur perdrait ce qu'il vient
    /// d'écrire en croyant l'avoir envoyé.
    func test_unEchecDeFile_refuse_plutotQueDeFermerLeComposer() async {
        let file = MockOfflineQueue()
        file.enqueuePostMediaError = NSError(domain: "test", code: 1)

        let accepte = await ComposerDocumentDurablePublisher.publish(
            brouillon(), queue: file, isOffline: false)

        XCTAssertFalse(accepte, "un envoi qui échoue ne doit pas avoir l'air d'avoir réussi")
    }

    /// **Hors ligne, l'envoi part QUAND MÊME** : c'est ce que « file durable »
    /// veut dire, et c'est la dimension 9 (hors-ligne) du produit. Un refus ici
    /// laisserait l'auteur bloqué dans le métro avec un billet qu'il ne peut pas
    /// envoyer, alors que la file existe exactement pour ce cas.
    func test_horsLigne_leTexteParTQuandMeme() async {
        let file = MockOfflineQueue()

        let accepte = await ComposerDocumentDurablePublisher.publish(
            brouillon(), queue: file, isOffline: true)

        XCTAssertTrue(accepte)
        XCTAssertEqual(file.enqueuePostMediaCalls.count, 1)
    }
}
