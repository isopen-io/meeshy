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

    /// **L'UNITÉ du type, jamais son fichier.**
    ///
    /// La propriété gardée — « le poster du chemin VIDÉO est cadré » — porte
    /// sur `ReelVideoView`, pas sur un chemin d'accès. La découpe #4628 a sorti
    /// le cluster vidéo vers `ReelsPlayerView+Video.swift` : la garde a rougi
    /// en annonçant la disparition d'un code qui n'avait pas bougé d'une ligne.
    ///
    /// Un fichier ajouté à cette liste est le geste attendu d'une prochaine
    /// découpe ; l'oublier fait rougir la garde — le bon sens de panne.
    private static let unitFiles = [
        "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
        "Meeshy/Features/Main/Views/ReelsPlayerView+Video.swift",
    ]

    private func source() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try Self.unitFiles
            .map { try String(contentsOf: root.appendingPathComponent($0), encoding: .utf8) }
            .joined(separator: "\n")
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
        // Ni le MODIFICATEUR ni le voisin ne délimitent le type. L'ancienne
        // forme cherchait `private struct ReelImageBackdrop` et s'arrêtait au
        // `private struct` SUIVANT : la découpe #4628 a fait passer la vue en
        // `internal` (`ReelVideoView`, désormais dans un autre fichier, la
        // monte) et l'a séparée de son voisin — deux façons pour la garde de
        // ne plus rien trouver alors que le code gardé n'avait pas bougé.
        guard let corps = Self.corpsDuType("ReelImageBackdrop", dans: src) else {
            return XCTFail("ReelImageBackdrop introuvable")
        }

        XCTAssertTrue(corps.contains("UIImage.fromThumbHash"),
                      "le fond se décode depuis le thumbHash")
        XCTAssertFalse(corps.contains("thumbnailUrl"),
                       "le fond ne doit JAMAIS charger le thumbnail — un thumbnail net qui apparaît dans un fond flou se lit comme un bogue")
    }

    /// Le corps d'un type, délimité par ÉQUILIBRAGE d'accolades — insensible
    /// au niveau d'accès et à ce qui le suit dans le fichier.
    private static func corpsDuType(_ nom: String, dans source: String) -> String? {
        guard let debut = source.range(of: "struct \(nom)") else { return nil }
        var profondeur = 0
        var index = debut.upperBound
        var ouverte = false
        while index < source.endIndex {
            let caractere = source[index]
            if caractere == "{" { profondeur += 1; ouverte = true }
            if caractere == "}" {
                profondeur -= 1
                if ouverte && profondeur == 0 {
                    return String(source[debut.lowerBound...index])
                }
            }
            index = source.index(after: index)
        }
        return nil
    }
}
