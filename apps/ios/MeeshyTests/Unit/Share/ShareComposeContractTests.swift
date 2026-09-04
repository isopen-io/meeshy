import XCTest
@testable import Meeshy

/// **Les deux miroirs de la fiche de COMPOSITION s'accordent** — vue `2a`
/// (#5056).
///
/// L'extension de partage tourne **sans dépendance SDK** : elle et l'app ne
/// peuvent pas partager un type. Le contrat est donc écrit DEUX fois
/// (`ShareComposeHandoff` côté extension, `ShareComposeHandoffConsumer.Handoff`
/// côté app) et ce fichier est le seul endroit où les deux se rencontrent : il
/// compile les deux et vérifie qu'un JSON écrit par l'un se relit par l'autre.
///
/// > **Deux types qui décrivent la même chose divergent en SILENCE.** Rien ne
/// > compile en rouge quand l'un gagne un champ ; c'est au premier partage réel
/// > que la pièce disparaît, et le défaut passe alors pour une erreur de
/// > l'utilisateur. Un test de contrat est la seule chose qui rougisse.
///
/// C'est le décalque de `SharePendingSendContractTests`, qui tient le même rôle
/// pour la fiche d'ENVOI.
final class ShareComposeContractTests: XCTestCase {

    private let photo = ShareStagedMedia(
        relPath: "cid_00000000-0000-4000-8000-000000000000/0.jpg",
        ext: "jpg", mime: "image/jpeg", bytes: 2048
    )

    private func reference() -> ShareComposeHandoff {
        ShareComposeHandoff(
            shareId: "cid_00000000-0000-4000-8000-000000000000",
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            text: "bonjour",
            media: [photo]
        )
    }

    // MARK: - 1 · Le JSON de l'extension se relit côté app

    func test_laFicheEcriteParLExtension_seRelitParLApp() throws {
        let donnees = try JSONEncoder.meeshyShareCompose.encode(reference())
        let relue = try JSONDecoder.meeshyShareCompose.decode(
            ShareComposeHandoffConsumer.Handoff.self, from: donnees)

        XCTAssertEqual(relue.version, ShareComposeHandoff.currentVersion)
        XCTAssertEqual(relue.shareId, "cid_00000000-0000-4000-8000-000000000000")
        XCTAssertEqual(relue.createdAt, Date(timeIntervalSince1970: 1_785_000_000))
        XCTAssertEqual(relue.text, "bonjour")
        XCTAssertEqual(relue.media.count, 1)
        XCTAssertEqual(relue.media.first?.relPath, photo.relPath)
        XCTAssertEqual(relue.media.first?.mime, photo.mime)
        XCTAssertEqual(relue.media.first?.bytes, photo.bytes)
        XCTAssertEqual(relue.media.first?.ext, photo.ext)
    }

    /// **Un partage de TEXTE seul** — `text` non-`nil`, `media` vide. La forme
    /// est légitime (une page Safari sans image) et son absence de média est
    /// justement ce que le consommateur lit pour semer une graine de texte.
    func test_unPartageDeTexteSeul_traverse() throws {
        let fiche = ShareComposeHandoff(
            shareId: "s1", createdAt: Date(timeIntervalSince1970: 0),
            text: "https://exemple.fr", media: [])
        let relue = try JSONDecoder.meeshyShareCompose.decode(
            ShareComposeHandoffConsumer.Handoff.self,
            from: try JSONEncoder.meeshyShareCompose.encode(fiche))
        XCTAssertEqual(relue.text, "https://exemple.fr")
        XCTAssertTrue(relue.media.isEmpty)
    }

    /// **Un partage de FICHIERS seuls** — `text` à `nil`. La jumelle du cas
    /// ci-dessus, et celle qui attrape un miroir qui aurait rendu le champ non
    /// optionnel : le décodage lèverait, et la pièce serait perdue.
    func test_unPartageSansTexte_traverse() throws {
        let fiche = ShareComposeHandoff(
            shareId: "s2", createdAt: Date(timeIntervalSince1970: 0),
            text: nil, media: [photo])
        let relue = try JSONDecoder.meeshyShareCompose.decode(
            ShareComposeHandoffConsumer.Handoff.self,
            from: try JSONEncoder.meeshyShareCompose.encode(fiche))
        XCTAssertNil(relue.text)
        XCTAssertEqual(relue.media.count, 1)
    }

    // MARK: - 2 · Les constantes de chemin sont les MÊMES

    /// Deux répertoires différents, et l'app balaierait un dossier vide pendant
    /// que l'extension remplirait l'autre — sans une erreur nulle part.
    func test_lesDeuxCotes_nommentLeMemeEndroit() {
        XCTAssertEqual(ShareComposeHandoff.appGroupIdentifier,
                       ShareComposeHandoffConsumer.appGroupIdentifier)
        XCTAssertEqual(ShareComposeHandoff.directoryName,
                       ShareComposeHandoffConsumer.directoryName)
        XCTAssertEqual(ShareComposeHandoff.currentVersion,
                       ShareComposeHandoffConsumer.currentVersion)
    }

    /// Le dossier des MÉDIAS est celui que l'extension a déjà rempli pour
    /// l'envoi : la composition ne recopie rien, elle réutilise le staging.
    func test_lesMedias_viennentDuStagingDeLExtension() {
        XCTAssertEqual(ShareComposeHandoffConsumer.mediaDirectoryName,
                       ShareMediaStaging.directoryName,
                       "La fiche de composition décrit les fichiers que `ShareMediaStaging` a "
                           + "copiés. Deux dossiers feraient chercher l'app là où il n'y a rien.")
    }

    // MARK: - 3 · L'orthographe du lien est partagée

    /// L'extension COMPOSE le lien, l'app le LIT. Deux écritures divergeraient
    /// au premier renommage, et la divergence serait silencieuse : l'app ne
    /// reconnaîtrait plus le lien, l'extension continuerait de l'ouvrir, et la
    /// pièce n'arriverait qu'au balayage suivant — le défaut passerait pour de
    /// la lenteur.
    func test_leLienComposeParLExtension_estReconnuParLApp() throws {
        let fiche = reference()
        let lien = try XCTUnwrap(fiche.openURL)
        XCTAssertEqual(ShareComposeLink.shareId(from: lien), fiche.shareId)
    }

    /// **Un lien SANS identifiant n'est pas reconnu**, et c'est délibéré : le
    /// tenter « au mieux » en reprenant la fiche la plus ancienne ouvrirait la
    /// mauvaise pièce sur deux partages rapides — un défaut qui a l'air d'un
    /// bug de contenu, pas de routage.
    func test_unLienSansIdentifiant_nEstPasReconnu() {
        XCTAssertNil(ShareComposeLink.shareId(from: URL(string: "meeshy://compose-share")!))
        XCTAssertNil(ShareComposeLink.shareId(from: URL(string: "meeshy://compose-share?id=")!))
    }

    /// Et un lien d'une AUTRE destination ne l'est pas non plus — sinon
    /// `onOpenURL` avalerait des liens de navigation.
    func test_unLienDUneAutreDestination_nEstPasReconnu() {
        XCTAssertNil(ShareComposeLink.shareId(from: URL(string: "meeshy://post/42")!))
        XCTAssertNil(ShareComposeLink.shareId(from: URL(string: "https://meeshy.me/compose-share?id=x")!))
    }
}
