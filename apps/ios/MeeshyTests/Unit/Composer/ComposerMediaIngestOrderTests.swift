import XCTest
@testable import Meeshy

/// **#4879 — une photo ajoutée par le rail de la scène n'y arrivait jamais.**
///
/// Reproduit deux fois au simulateur iPhone 16 Pro : rail gauche → porte média →
/// une photo → `Add`. Le canvas reste noir. La photo est pourtant bien INGÉRÉE
/// — basculer vers Post la montre dans la bande « Attached media » —, et elle
/// APPARAÎT sur la scène après un aller-retour Story → Post → Story.
///
/// ## La cause : un drapeau consommé APRÈS l'observateur qui le lit
///
/// `syncPostMediaIntoSlides` est branchée sur `documentLocalMedia` et choisit la
/// porte du média en lisant `railPosedMediaURLs` :
///
/// ```swift
/// let porte: ComposerMediaDoor =
///     railPosedMediaURLs.contains(media.sourceURL) ? .sceneRail : .documentRow
/// ```
///
/// Les quatre sites d'ingestion écrivaient dans `documentLocalMedia` PUIS
/// appelaient `consumeRailPosing`. Au moment où l'observateur tournait,
/// l'ensemble était encore VIDE : le média était classé « rangée du document »,
/// donc rangé dans une slide à lui au lieu d'être posé sur la scène courante.
///
/// Et le verdict est DÉFINITIF — la boucle ne considère que les médias dont
/// `mediaRoleByURL[url] == nil`. Un rôle mal attribué ne se rejoue jamais.
///
/// > **Un drapeau consommé après l'observateur qui le lit ne vaut rien**, et il
/// > échoue du côté silencieux : pas d'erreur, pas de log, un média correctement
/// > ingéré rangé au mauvais endroit.
///
/// ## Pourquoi un témoin de SOURCE, et pourquoi sur le COMPTE
///
/// L'état vit en `@State` d'une vue SwiftUI : l'ordre réel ne s'observe pas sans
/// monter le meuble. Ce qui se garde, en revanche, est la propriété qui rend
/// l'erreur IMPOSSIBLE — un seul écrivain, qui marque avant d'écrire. Quatre
/// sites écrivaient ; un cinquième aurait rejoué le défaut sans qu'aucun témoin
/// ne tombe.
final class ComposerMediaIngestOrderTests: XCTestCase {

    private func intakeSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Intake.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Un seul écrivain.** C'est la moitié qui empêche le défaut de revenir :
    /// tant que quatre sites écrivent, l'ordre est une discipline ; avec un
    /// seul, c'est une propriété.
    func test_uneSeuleEcriture_dansLaListeMediaDuDocument() throws {
        let code = try intakeSource()
        let ecritures = code.components(separatedBy: "documentLocalMedia.append").count - 1
        XCTAssertEqual(ecritures, 1,
                       "Les portes d'ingestion passent par `ingestIntoDocument` — quatre "
                       + "écrivains, c'était quatre occasions de marquer trop tard (#4879).")
    }

    /// **Le marquage PRÉCÈDE l'écriture.** L'assertion porte sur les POSITIONS,
    /// pas sur la présence des deux appels : les avoir tous les deux est
    /// exactement ce que faisait le code fautif.
    func test_leDrapeauDuRail_estMarqueAVANT_lEcriture() throws {
        let code = try intakeSource()
        guard let marquage = code.range(of: "consumeRailPosing(medias.map"),
              let ecriture = code.range(of: "documentLocalMedia.append") else {
            return XCTFail("Le site unique d'ingestion a changé de forme.")
        }
        XCTAssertLessThan(marquage.lowerBound, ecriture.lowerBound,
                          "L'observateur de `documentLocalMedia` LIT `railPosedMediaURLs` : "
                          + "le marquer après l'écriture le laisse vide au moment du verdict.")
    }

    /// **Une seule notification, pas une par média.** La boucle d'origine
    /// appelait `append` par item, donc rejouait l'observateur à chaque passe
    /// avec un ensemble différent — la place d'un média dépendait de son RANG
    /// dans la sélection.
    func test_lesMedias_arriventEnUNE_fois() throws {
        let code = try intakeSource()
        XCTAssertTrue(code.contains("documentLocalMedia.append(contentsOf: medias)"),
                      "Un `append` par média rejoue la dérivation autant de fois qu'il y "
                      + "a de fichiers, chaque fois sur un état différent.")
    }

    /// Les quatre portes passent par le site unique — la photothèque, les deux
    /// branches de la caméra, l'importateur de fichiers.
    func test_lesQuatrePortes_passentParLeSiteUnique() throws {
        let code = try intakeSource()
        let appels = code.components(separatedBy: "ingestIntoDocument(").count - 1
        XCTAssertGreaterThanOrEqual(appels, 5,
                                    "Quatre appels (photothèque, photo caméra, vidéo caméra, "
                                    + "fichiers) plus la déclaration — une porte qui écrirait "
                                    + "en direct rouvrirait #4879.")
    }
}
