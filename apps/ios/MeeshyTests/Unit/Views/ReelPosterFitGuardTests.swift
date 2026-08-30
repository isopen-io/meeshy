import XCTest

/// **Le poster du réel plein écran est CADRÉ, sinon le fond ThumbHash est invisible.**
///
/// Directive porteur 2026-08-30 : « le réel en plein écran a en fond une image
/// SANS FLOU, ou alors n'utilise pas le hash comme fond ».
///
/// Le fond flou (`ReelImageBackdrop`, thumbHash décodé localement, flou 60pt)
/// était bien monté sous le poster. Ce qui manquait était une CONTRAINTE de
/// taille sur le poster : `contentMode: .fit` est passé à `ReelPoster`, qui
/// pose ensuite `.frame(maxWidth: .infinity, maxHeight: .infinity)` sur un
/// `ProgressiveCachedImage` sans ratio intrinsèque avant chargement. Le poster
/// prenait donc toute la surface et recouvrait le fond flou par le thumbnail
/// NET — d'où « une image sans flou en fond ».
///
/// Le chemin IMAGE du même fichier (`ReelImageView`) n'avait pas ce défaut : il
/// calcule `fittedSize(in:)` et pose une frame explicite. La correction porte
/// la même règle au chemin VIDÉO.
///
/// ## Pourquoi une garde de SOURCE et pas un test de rendu
///
/// La propriété à tenir est « le poster ne s'étend pas librement », que seul un
/// instantané de rendu mesurerait vraiment. Ce qu'on peut garder à peu de frais,
/// c'est la PRÉSENCE de la contrainte : le jour où quelqu'un retire la frame
/// explicite, le fond redevient invisible sans qu'aucun test ne rougisse.
final class ReelPosterFitGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_lecteurPleinEcran_cadreSonPosterSurLaBoiteDuMedia() throws {
        let src = try source()

        // Le calcul de boîte existe, et il porte le même repli 9:16 que le
        // chemin image — deux ratios différents feraient diverger poster et
        // image sur un média sans dimensions.
        XCTAssertTrue(src.contains("private func posterFit(in container: CGSize) -> CGSize"),
                      "le lecteur vidéo doit calculer la boîte de son poster")

        // Et il est APPLIQUÉ. C'est l'assertion qui compte : le calcul seul,
        // non branché, laisserait le défaut intact tout en ayant l'air corrigé.
        XCTAssertTrue(src.contains(".frame(width: posterFit(in: geo.size).width, height: posterFit(in: geo.size).height)"),
                      "la boîte calculée doit CADRER le poster, pas seulement exister")
    }

    func test_leFondFlouEstMonteSousLePoster() throws {
        let src = try source()
        guard let fond = src.range(of: "ReelImageBackdrop(media: media).equatable()"),
              let poster = src.range(of: "ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor, contentMode: .fit)")
        else { return XCTFail("fond flou ou poster absent du lecteur plein écran") }

        // L'ORDRE dans le ZStack décide de qui est dessous. Inversé, le fond
        // masquerait le poster — le défaut symétrique de celui qu'on corrige.
        XCTAssertLessThan(fond.lowerBound, poster.lowerBound,
                          "le fond ThumbHash doit être monté AVANT le poster dans le ZStack")
    }

    func test_leFondNeChargeJamaisLeThumbnail() throws {
        let src = try source()
        guard let debut = src.range(of: "private struct ReelImageBackdrop"),
              let fin = src.range(of: "private struct", range: debut.upperBound..<src.endIndex)
        else { return XCTFail("ReelImageBackdrop introuvable") }
        let corps = String(src[debut.lowerBound..<fin.lowerBound])

        XCTAssertTrue(corps.contains("UIImage.fromThumbHash"),
                      "le fond se décode depuis le thumbHash")
        XCTAssertFalse(corps.contains("thumbnailUrl"),
                       "le fond ne doit JAMAIS charger le thumbnail — un thumbnail net qui apparaît dans un fond flou se lit comme un bogue")
    }
}
