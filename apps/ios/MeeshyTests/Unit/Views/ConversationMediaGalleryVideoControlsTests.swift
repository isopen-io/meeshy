import XCTest
@testable import Meeshy

/// Source-guards du lifting Liquid Glass de la galerie média (spec
/// 2026-07-11) : un seul contrôleur play (fini le bouton poster empilé sur
/// le play/pause du transport quand la vidéo est en pause), chrome glass.
@MainActor
final class ConversationMediaGalleryVideoControlsTests: XCTestCase {

    /// **L'UNITÉ, jamais le fichier seul** — `ConversationMediaGalleryView` a été
    /// DÉCOUPÉ au #4014 (1259 lignes ⇒ vue / `+Rules` / `+Pages`), et une garde
    /// qui adresse un fichier survit mal à une découpe : elle cesse de trouver
    /// ce qu'elle garde, sans que rien ne dise que c'est un déménagement et non
    /// une suppression.
    ///
    /// `AppSourceGuard.unit` résout l'unité par GLOB (`Type+*.swift`), jamais
    /// par liste : un `+Overlays.swift` ajouté demain y entre sans que personne
    /// ait à s'en souvenir.
    private func gallerySource() throws -> String {
        try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
    }

    func test_galleryVideoPage_postersButton_gatedOnPlayerAttached_notPlaying() throws {
        // Double contrôleur (bug) : gaté sur `!isPlayerActive`, le bouton
        // poster 64pt réapparaissait PENDANT LA PAUSE, empilé sur le
        // play/pause du transport partagé. Le poster ne doit exister que
        // tant que le player n'est pas attaché à cette URL.
        let source = try gallerySource()
        guard source.range(of: "if !isPlayerAttached {\n                playOrDownloadButton") != nil else {
            XCTFail(
                "GalleryVideoPage must gate playOrDownloadButton on !isPlayerAttached " +
                "(not !isPlayerActive) so the paused state shows ONLY the shared transport controls."
            )
            return
        }
    }

    /// **Le chrome du couloir haut est en Liquid Glass.**
    ///
    /// ## Ce témoin mesurait une FENÊTRE D'OCTETS, et il a fini par le payer
    ///
    /// Il découpait 2 600 caractères à partir de `controlsOverlay` et y comptait
    /// trois `.adaptiveGlass(` — « X, compteur et save ». Deux de ces trois
    /// contrôles n'existent plus : le compteur « n / N » est parti au #6144
    /// (directive porteur) et la flèche d'enregistrement est devenue une entrée
    /// du menu ⋯ au #6145. Le témoin restait vert parce que sa fenêtre DÉBORDAIT
    /// sur les déclarations suivantes du fichier, où la colonne d'actions porte
    /// ses propres cercles de verre.
    ///
    /// > **Une garde qui découpe au caractère ne mesure pas ce qu'elle nomme.**
    /// > Elle est verte tant que le voisinage veut bien fournir le compte, et
    /// > elle rougit au premier commentaire ajouté — c'est exactement ce que le
    /// > #6162 a produit. Le témoin lit désormais le CORPS de la déclaration, et
    /// > suit le second contrôle jusqu'au fichier où il vit réellement.
    func test_controlsOverlay_chrome_usesAdaptiveGlass() throws {
        let source = try gallerySource()
        guard let body = declarationBody("private var controlsOverlay", in: source),
              let glyphe = declarationBody("private var overflowGlyph: some View {", in: source)
        else {
            XCTFail("controlsOverlay ou overflowGlyph introuvable"); return
        }
        XCTAssertFalse(
            body.contains("xmark.circle.fill"),
            "Le X doit être un glyphe xmark dans un cercle .adaptiveGlass, pas le xmark.circle.fill plein."
        )
        XCTAssertTrue(
            body.contains(".adaptiveGlass("),
            "Le X du couloir haut porte sa surface .adaptiveGlass."
        )
        // Le ⋯ porte sa surface sur son GLYPHE (`overflowGlyph`), pas sur le
        // `Menu` qui l'ouvre — le verre habille un cercle de 40 pt, et le menu
        // n'est qu'un présentateur. Suivre le contrôle jusqu'à la déclaration
        // qui le PEINT, c'est la même remonte que celle des gardes de muet :
        // s'arrêter au nom qui l'ouvre, c'est mesurer une indirection.
        XCTAssertTrue(
            glyphe.contains(".adaptiveGlass("),
            "Et le ⋯, qui a remplacé la flèche d'enregistrement au #6145, porte la sienne — "
            + "les deux occupants du couloir haut sont en verre, pas un seul."
        )
        XCTAssertFalse(
            body.contains("Circle().fill(Color.white.opacity(0.2))"),
            "Plus de cercle blanc opaque 0.2 : chrome Liquid Glass uniquement."
        )
    }

    /// Le corps d'une déclaration, accolades équilibrées — jamais un nombre de
    /// caractères, qui fait dépendre le verdict de la longueur des commentaires.
    private func declarationBody(_ ancre: String, in code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    func test_galleryVideoPage_posterButton_usesAdaptiveGlass() throws {
        let source = try gallerySource()
        guard let start = source.range(of: "private var playOrDownloadButton") else {
            XCTFail("playOrDownloadButton not found"); return
        }
        let end = source.index(start.lowerBound, offsetBy: 1400, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[start.lowerBound..<end])
        XCTAssertTrue(
            body.contains(".adaptiveGlassProminent(in: Circle()"),
            "Le bouton poster doit être en Liquid Glass prominent teinté accent " +
            "(remplace le duo ultraThinMaterial + fill accent)."
        )
    }
}
