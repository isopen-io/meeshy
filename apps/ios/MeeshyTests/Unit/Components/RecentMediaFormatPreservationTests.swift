import XCTest
import UIKit
import UniformTypeIdentifiers
@testable import Meeshy

/// **Un GIF tapé dans la bande de récents doit ARRIVER en GIF** (#4985).
///
/// Mesure du 2026-09-03 : un GIF animé de 240×240 (6 448 o) envoyé en
/// commentaire **par la bande de médias récents** est arrivé au lecteur en JPEG
/// 240×240 fixe (4 404 o). Le chemin VOISIN — le picker système — avait été
/// corrigé la veille (#4925) et préservait déjà le format.
///
/// > **Deux entrées pour le même geste, deux fidélités.** Depuis l'écran, rien
/// > ne distingue « j'ai tapé la vignette » de « j'ai ouvert la photothèque » ;
/// > seul le code les distinguait, et il le faisait au détriment de l'une.
///
/// La cause n'était PAS une compression : `RecentMediaPick.image` portait une
/// `UIImage`, c'est-à-dire un bitmap déjà aplati. Les images 2 à N d'un GIF
/// n'existaient plus à ce point du chemin — **aucune correction en aval ne
/// pouvait les rendre**, et c'est ce qui rend ce défaut invisible à toute
/// garde posée sur l'écriture du fichier.
final class RecentMediaFormatPreservationTests: XCTestCase {

    // MARK: - La règle, une fois

    func test_lesTroisFormatsPreserves_gardentLeurExtension() {
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "image/gif"), "gif")
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "image/png"), "png")
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "image/webp"), "webp")
    }

    /// **Le HEIC retombe sur `jpg`, et c'est une DÉCISION**, pas un oubli :
    /// `MediaCompressor.compressImageData` le transcode délibérément (« most web
    /// clients cannot decode HEIC inline »). Le préserver servirait au web un
    /// format qu'il ne rend pas.
    func test_leJPEGetLeHEIC_retombentSurJPG() {
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "image/jpeg"), "jpg")
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "image/heic"), "jpg")
    }

    /// La direction de l'erreur est choisie : un format inconnu se comporte
    /// comme hier, donc aucune régression sur ce que la table ignore.
    func test_unMimeInconnu_retombeSurJPG() {
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "image/avif"), "jpg")
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: ""), "jpg")
        XCTAssertEqual(PreservedImageFormat.fileExtension(forMimeType: "n'importe quoi"), "jpg")
    }

    // MARK: - La MÊME règle, posée sur l'UTI — la porte qui évite de charger

    func test_lUTIdUnAssetAPreserver_ouvreLaPorte() {
        XCTAssertTrue(PreservedImageFormat.preservesOriginalBytes(assetUTI: UTType.gif.identifier))
        XCTAssertTrue(PreservedImageFormat.preservesOriginalBytes(assetUTI: UTType.png.identifier))
        XCTAssertTrue(PreservedImageFormat.preservesOriginalBytes(assetUTI: UTType.webP.identifier))
    }

    /// **C'est ce test qui rend la porte rentable.** Un JPEG et un HEIC forment
    /// la quasi-totalité d'une pellicule ; les faire remonter depuis la
    /// photothèque coûterait plusieurs mégaoctets par vignette tapée, pour les
    /// jeter aussitôt.
    func test_unJPEGouUnHEIC_neFontPasCharger() {
        XCTAssertFalse(PreservedImageFormat.preservesOriginalBytes(assetUTI: UTType.jpeg.identifier))
        XCTAssertFalse(PreservedImageFormat.preservesOriginalBytes(assetUTI: UTType.heic.identifier))
    }

    func test_unUTIinconnu_neFaitPasCharger() {
        XCTAssertFalse(PreservedImageFormat.preservesOriginalBytes(assetUTI: "me.meeshy.pas-un-type"))
        XCTAssertFalse(PreservedImageFormat.preservesOriginalBytes(assetUTI: ""))
    }

    /// **Le témoin anti-divergence.** Les deux questions — « comment nommer ces
    /// octets » et « faut-il aller les chercher » — sont deux projections d'UNE
    /// règle. Elles avaient chacune leur table jusqu'à #4985, et une table qui
    /// se dédouble diverge au premier format ajouté : un format préservé à
    /// l'écriture mais fermé à la porte serait un GIF que plus rien ne va
    /// chercher, donc un GIF figé — le défaut même que ce lot ferme.
    func test_lesDeuxQuestions_neDivergentPas() {
        for ext in PreservedImageFormat.fileExtensions {
            guard let uti = UTType(filenameExtension: ext)?.identifier else {
                XCTFail("aucun UTI système pour « \(ext) »")
                continue
            }
            XCTAssertTrue(PreservedImageFormat.preservesOriginalBytes(assetUTI: uti),
                          "« \(ext) » est préservé à l'écriture mais la porte ne le fait pas charger : "
                          + "les octets d'origine n'arriveraient jamais jusqu'à elle.")
        }
    }

    // MARK: - Ce que la bande ÉCRIT

    private func gifBytes() -> Data {
        Data(Array("GIF89a".utf8) + [UInt8](repeating: 0, count: 16))
    }

    private func preview() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
    }

    func test_unGIF_partAvecSesOctetsDorigine_pasAvecSonApercu() async {
        let payload = await CommentComposerStaging.recentImagePayload(
            preview: preview(), originalData: gifBytes())

        XCTAssertEqual(payload?.fileExtension, "gif")
        XCTAssertEqual(payload?.data, gifBytes(),
                       "l'aperçu bitmap ne porte qu'UNE image : le servir ici tue l'animation "
                       + "avant tout site capable de la rattraper.")
    }

    /// **Ce lot ne renégocie pas la compression** (critère 3 de #4985). Des
    /// octets qui ne méritent pas d'être préservés retombent sur l'aperçu
    /// ré-encodé en JPEG 0.9 — le comportement d'hier, à l'octet près.
    func test_desOctetsNonPreserves_retombentSurLApercuReencode() async {
        let jpegSource = Data([0xFF, 0xD8, 0xFF, 0xE0] + [UInt8](repeating: 0, count: 16))
        let payload = await CommentComposerStaging.recentImagePayload(
            preview: preview(), originalData: jpegSource)

        XCTAssertEqual(payload?.fileExtension, "jpg")
        XCTAssertNotEqual(payload?.data, jpegSource)
    }

    func test_sansOctetsDorigine_leCheminDhierEstIntact() async {
        let payload = await CommentComposerStaging.recentImagePayload(
            preview: preview(), originalData: nil)

        XCTAssertEqual(payload?.fileExtension, "jpg")
        XCTAssertNotNil(payload?.data)
    }
}

// ============================================================================
// MARK: - Les quatre jointures
// ============================================================================

/// **Qui passe les octets au suivant ?** (#4985)
///
/// La règle ci-dessus peut être parfaite et la bande continuer d'aplatir : il
/// suffit qu'un maillon ne la CONSULTE pas. Et le mode de panne est muet — des
/// octets manquants ne lèvent aucune erreur, ils produisent une image FIXE. La
/// leçon est celle de #3956, sur une chaîne plus courte : **chaque jointure se
/// coupe sans qu'aucun test de maillon ne rougisse.**
///
/// Ces gardes lisent la source commentaires retirés : une doctrine qui cite la
/// ligne cherchée ne doit pas passer pour la ligne.
final class RecentMediaChainGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: path)
    }

    /// **Jointure 1 — la bande VA CHERCHER les octets.**
    ///
    /// `requestImage` rend un bitmap : c'est là que l'animation mourait. Il
    /// faut une seconde requête, `requestImageDataAndOrientation`, et elle doit
    /// être gardée par la règle — sans la garde, chaque vignette tapée ferait
    /// remonter plusieurs mégaoctets pour les jeter.
    func test_laBande_demandeLesOctetsQuandLaPorteSouvre() throws {
        let strip = try source("Meeshy/Features/Main/Components/RecentMediaStrip.swift")

        XCTAssertTrue(strip.contains("requestImageDataAndOrientation("),
                      "sans les octets d'origine, une UIImage ne peut porter qu'UNE image d'un GIF.")
        XCTAssertTrue(strip.contains("PreservedImageFormat.preservesOriginalBytes("),
                      "la porte doit gouverner la requête : sinon on charge toute une pellicule pour rien.")
    }

    /// **Jointure 2 — le TYPE transporte les octets.** Sans le canal, les deux
    /// hôtes ne peuvent rien préserver, quelle que soit leur bonne volonté.
    func test_lePick_porteLesOctetsDorigine() throws {
        let strip = try source("Meeshy/Features/Main/Components/RecentMediaStrip.swift")

        XCTAssertTrue(strip.contains("case image(UIImage, originalData: Data?)"),
                      "le canal est le lot : un pick sans octets rend les deux hôtes impuissants.")
    }

    /// **Jointure 3 — l'hôte COMMENTAIRE écrit sans ré-encoder.**
    ///
    /// C'est le site exact de la mesure : `image.jpegData(compressionQuality:)`
    /// suivi d'un fichier `.jpg` écrit en dur. Le staging partagé avec la
    /// photothèque est ce qui empêche les deux entrées de rediverger.
    func test_lHoteCommentaire_passeParLeStagingPartage() throws {
        let sheet = try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
        let ingest = sheet.components(separatedBy: "func ingestCommentRecentMedia")

        XCTAssertEqual(ingest.count, 2, "l'ingestion de la bande doit rester un site unique.")
        let body = ingest.last?.prefix(600) ?? ""
        XCTAssertTrue(body.contains("CommentComposerStaging.recentImageAttachment("),
                      "l'ingestion doit emprunter le staging de la photothèque, pas le sien.")
        XCTAssertFalse(body.contains("jpegData("),
                       "ré-encoder ici aplatit le GIF que la jointure 1 vient d'aller chercher.")
    }

    /// **Jointure 4 — l'hôte CONVERSATION choisit la bonne préparation.**
    ///
    /// `prepareImage` prend une `UIImage` : l'emprunter avec des octets en main
    /// jetterait ce qu'on vient de charger. `prepareImageData` passe par
    /// `MediaCompressor.compressImageData`, qui laisse un GIF intact.
    func test_lHoteConversation_prefereLaPreparationParOctets() throws {
        let handlers = try source("Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift")
        let recent = handlers.components(separatedBy: "func handleRecentImage")

        XCTAssertEqual(recent.count, 2, "le routage de la bande doit rester un site unique.")
        XCTAssertTrue((recent.last?.prefix(500) ?? "").contains("prepareImageData("),
                      "avec des octets en main, prepareImage(UIImage) rejetterait l'animation.")
    }
}
