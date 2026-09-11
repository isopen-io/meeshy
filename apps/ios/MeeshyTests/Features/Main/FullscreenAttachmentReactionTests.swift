import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une pièce jointe ouverte en plein écran se réagit sur ELLE-MÊME** (#6084,
/// directive porteur 2026-09-11 : « lorsqu'on affiche une image pièce jointe en
/// plein écran, il faut pouvoir ajouter une réaction à l'attachement
/// directement »).
///
/// Trois moitiés, gardées ensemble parce qu'aucune ne vaut seule :
///  1. la LOI — à quelle pièce, sur quelle surface, offre-t-on la barre. Pure et
///     `nonisolated`, donc jouable en XCTest, contrairement à la condition qui
///     vivait dans le `body` de la tuile de grille ;
///  2. le SITE d'AFFICHAGE — que le plein écran monte bien la barre, au gabarit
///     de la story, et qu'il la demande à la LOI plutôt que de réécrire la
///     conjonction ;
///  3. le SITE de ROUTAGE — que l'émoji parte vers la PIÈCE (le rappel
///     par-image de la conversation) et jamais vers le message qui la porte.
///
/// Le point 3 est celui qui coûterait le plus cher à rater : une barre posée sur
/// une photo qui incrémenterait la réaction du MESSAGE aurait l'air de marcher,
/// et le compteur de la bulle bougerait — le défaut ne se verrait qu'en
/// comparant deux surfaces.
final class FullscreenAttachmentReactionTests: XCTestCase {

    // MARK: - Fabriques

    private func piece(id: String = "att-1",
                       viewOnce: Bool = false,
                       blurred: Bool = false,
                       encrypted: Bool = false) -> MessageAttachment {
        MessageAttachment(
            id: id,
            mimeType: "image/jpeg",
            isViewOnce: viewOnce,
            isBlurred: blurred,
            isEncrypted: encrypted
        )
    }

    // MARK: - 1 · La loi

    /// **Le critère 3 de l'issue.** Le plein écran ne montre QU'UNE pièce à la
    /// fois : « seule » n'y décrit pas une situation exceptionnelle mais le cas
    /// nominal. La règle de la grille (`!solo`, qui laisse la réaction
    /// message-level aux bulles à une seule image) n'a donc rien à y faire.
    func test_lePleinEcran_offreLaBarre_memeQuandLaPieceEstSeule() {
        XCTAssertTrue(
            AttachmentReactionOffer.offersQuickBar(
                surface: .fullscreen, attachment: piece(), hasHandler: true),
            "Une pièce seule ouverte en plein écran DOIT porter la barre — c'est le geste "
                + "que l'issue #6084 demande, et le plein écran n'a pas d'autre pièce à côté."
        )
    }

    /// **Le critère 4 — et il se lit au niveau de la PIÈCE.**
    ///
    /// `Message.isViewOnce` ne dit que la protection du porteur ; une pièce
    /// déclare la sienne (`isViewOnce` / `isBlurred` / `isEncrypted`). Poser une
    /// barre sur une vue unique inviterait à la garder à l'écran le temps de
    /// choisir un émoji — exactement ce qu'une vue unique refuse.
    func test_uneProtegee_nOffreAucuneBarre_surAucuneSurface() {
        for surface: AttachmentReactionOffer.Surface in [.fullscreen, .bubbleGrid(isSolo: false)] {
            XCTAssertFalse(
                AttachmentReactionOffer.offersQuickBar(
                    surface: surface, attachment: piece(viewOnce: true), hasHandler: true),
                "Vue unique ⇒ aucune barre (\(surface))."
            )
            XCTAssertFalse(
                AttachmentReactionOffer.offersQuickBar(
                    surface: surface, attachment: piece(blurred: true), hasHandler: true),
                "Floutée ⇒ aucune barre (\(surface))."
            )
            XCTAssertFalse(
                AttachmentReactionOffer.offersQuickBar(
                    surface: surface, attachment: piece(encrypted: true), hasHandler: true),
                "Chiffrée ⇒ aucune barre (\(surface)). Le chiffrement est la troisième "
                    + "protection que `ComposableAttachment.isProtected` déclare, et la tuile "
                    + "de grille ne la lisait PAS."
            )
        }
    }

    /// La grille garde sa règle : une bulle à UNE seule image laisse la réaction
    /// au MESSAGE (le double-tap et l'appui long y restent libres, et le simple
    /// tap n'y paie pas la fenêtre de désambiguïsation d'iOS). Ce lot n'ouvre le
    /// plein écran, pas la bulle.
    func test_laGrille_gardeSaRegle_uneImageSeuleResteAuMessage() {
        XCTAssertFalse(
            AttachmentReactionOffer.offersQuickBar(
                surface: .bubbleGrid(isSolo: true), attachment: piece(), hasHandler: true),
            "Une image SEULE dans sa bulle garde la réaction message-level."
        )
        XCTAssertTrue(
            AttachmentReactionOffer.offersQuickBar(
                surface: .bubbleGrid(isSolo: false), attachment: piece(), hasHandler: true),
            "En grille multi-images, la réaction par-image reste offerte — comportement "
                + "existant, que ce lot déplace sans le changer."
        )
    }

    /// **Loi 4 : un contrôle existe s'il a un EFFET.** Un hôte qui ne sait pas
    /// router l'émoji (post, story, commentaire — aucune réaction par média côté
    /// serveur) ne doit pas peindre une barre inerte.
    func test_sansRappel_aucuneBarre_jamaisUnControleInerte() {
        XCTAssertFalse(
            AttachmentReactionOffer.offersQuickBar(
                surface: .fullscreen, attachment: piece(), hasHandler: false))
        XCTAssertFalse(
            AttachmentReactionOffer.offersQuickBar(
                surface: .bubbleGrid(isSolo: false), attachment: piece(), hasHandler: false))
    }

    /// La protection n'est pas réécrite ici : elle est LUE au prédicat que le
    /// menu d'appui long et la citation lisent déjà. Deux écritures des trois
    /// mêmes drapeaux sont deux règles qui ont déjà commencé à diverger.
    func test_laProtection_estCelleDuPredicatPartage() throws {
        let loi = try loiSource()
        XCTAssertTrue(
            compact(loi).contains("ComposableAttachment.isProtected("),
            "La loi doit LIRE `ComposableAttachment.isProtected` — pas recopier "
                + "`isViewOnce || isBlurred || isEncrypted`."
        )
    }

    // MARK: - 2 · Le site d'affichage — le plein écran

    /// Non-vacuité : la barre existe là où les gardes suivantes regardent.
    func test_leSite_estBienLaOuLesGardesRegardent() throws {
        let code = try gallerieSource()
        XCTAssertNotNil(
            corps("private func attachmentReactionBar(", dans: code),
            "`attachmentReactionBar` introuvable dans `ConversationMediaGalleryView` — "
                + "le plein écran n'offre aucune barre de réaction (#6084, critère 1)."
        )
    }

    func test_laBarreDuPleinEcran_estAuGabaritDeLaStory() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        let plat = compact(site)

        XCTAssertTrue(plat.contains("EmojiReactionPicker("),
                      "La barre est la brique SDK partagée, pas une rangée réécrite.")
        XCTAssertTrue(plat.contains("scale:2"),
                      "Échelle 2 — le gabarit arrêté pour la story (#6083).")
        XCTAssertTrue(plat.contains("chrome:.none"),
                      "Sans fond ni contour : le média EST le fond, comme la scène d'une story.")
        XCTAssertTrue(plat.contains("scrollable:true"),
                      "À l'échelle 2 la rangée dépasse la largeur de l'écran : elle DÉFILE.")
    }

    /// La barre se DEMANDE à la loi. Une condition réécrite sur place aurait
    /// divergé de la grille au premier ajustement de l'une des deux.
    func test_laBarreDuPleinEcran_consulteLaLoi() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        let plat = compact(site)
        XCTAssertTrue(
            plat.contains("AttachmentReactionOffer.offersQuickBar(surface:.fullscreen"),
            "Le plein écran doit interroger la LOI, sur la surface `.fullscreen`."
        )
        XCTAssertTrue(
            plat.contains("hasHandler:onReactToMedia!=nil"),
            "L'absence de rappel doit RETIRER la barre — pas la griser (loi 4)."
        )
    }

    /// **Ancrée au-dessus de ses contrôles** (critère 1). La barre vit dans la
    /// couche des contrôles : elle s'efface avec eux au tap sur le média, et se
    /// pose juste au-dessus du bloc bas (auteur, légende, pellicule).
    func test_laBarre_estAncreeAuDessusDesControlesDuBas() throws {
        let code = try gallerieSource()
        guard let controles = corps("private var controlsOverlay: some View {", dans: code) else {
            return XCTFail("`controlsOverlay` introuvable")
        }
        let plat = compact(controles)
        guard let barre = plat.range(of: "attachmentReactionBar("),
              let bas = plat.range(of: "bottomOverlay") else {
            return XCTFail("La barre n'est pas montée dans la couche des contrôles — "
                           + "elle ne s'effacerait pas avec eux.")
        }
        XCTAssertLessThan(barre.lowerBound, bas.lowerBound,
                          "La barre se pose AU-DESSUS du bloc bas, pas en dessous.")
    }

    /// La grille cesse d'écrire sa propre conjonction : une seule loi, deux
    /// surfaces.
    func test_laGrille_consulteLaMemeLoi() throws {
        let code = try tuileSource()
        guard let regle = corps("private var canReactPerImage: Bool {", dans: code) else {
            return XCTFail("`canReactPerImage` introuvable")
        }
        XCTAssertTrue(
            compact(regle).contains("AttachmentReactionOffer.offersQuickBar(surface:.bubbleGrid(isSolo:solo)"),
            "La tuile de grille doit LIRE la loi — sinon les deux surfaces divergeront."
        )
    }

    // MARK: - 3 · Le site de routage — l'émoji vise la PIÈCE

    func test_lEmoji_partVersLaPiece_jamaisVersLeMessage() throws {
        let code = try gallerieSource()
        guard let site = corps("private func attachmentReactionBar(", dans: code) else {
            return XCTFail("site introuvable")
        }
        let plat = compact(site)
        XCTAssertTrue(
            plat.contains("onReact:{emojiinonReactToMedia?(att,emoji)}"),
            "L'émoji doit partir avec LA PIÈCE en main. Un rappel qui ne porterait que "
                + "l'émoji laisserait l'hôte deviner la cible — et il devinerait le message."
        )
    }

    /// **Le rappel de l'hôte de conversation route vers la réaction PAR-IMAGE**
    /// (`toggleAttachmentReaction`), celle qui existe déjà dans le fil — jamais
    /// vers `toggleReaction`, qui vise le message.
    func test_lHoteDeConversation_routeVersLaReactionParImage() throws {
        let code = try hoteSource()
        guard let relais = corps("private func reactToMedia(", dans: code) else {
            return XCTFail("`reactToMedia` introuvable dans `ConversationMediaGalleryLayer` — "
                           + "le plein écran de conversation ne route rien (#6084, critère 2).")
        }
        let plat = compact(relais)
        XCTAssertTrue(
            plat.contains("viewModel.toggleAttachmentReaction(attachmentId:attachment.id"),
            "La cible est l'ID de la PIÈCE."
        )
        XCTAssertFalse(
            plat.contains("toggleReaction(messageId:"),
            "`toggleReaction` vise le MESSAGE : l'appeler ici ferait mentir la barre."
        )

        XCTAssertTrue(
            compact(code).contains("onReactToMedia:reactToMedia"),
            "Le rappel doit être PASSÉ à la galerie — une fonction que personne ne câble "
                + "ne réagit à rien."
        )
    }

    // MARK: - Helpers

    private func iosRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Main
            .deletingLastPathComponent()  // Features
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func loiSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/AttachmentReactionOffer.swift")
    }

    private func gallerieSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
    }

    private func hoteSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/ConversationView+MediaGallery.swift")
    }

    private func tuileSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
    }

    /// COMMENTAIRES RETIRÉS : une garde qui compte des occurrences dans un
    /// fichier commenté valide la documentation, pas le code.
    private func strippedSource(at relativePath: String) throws -> String {
        let url = iosRoot().appendingPathComponent(relativePath)
        return Self.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre),
              let ouvrante = code[debut.lowerBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var resultat = ""
        var index = ouvrante
        while index < code.endIndex {
            let caractere = code[index]
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
            index = code.index(after: index)
        }
        return nil
    }

    private func compact(_ code: String) -> String {
        code.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
            .replacingOccurrences(of: "\t", with: "")
    }

    private static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if let star = pending, star == "*", character == "/" {
                    pending = nil
                    mode = .code
                    continue
                }
                pending = character == "*" ? "*" : nil
                if character == "\n" { result.append(character) }
            }
        }
        if let slash = pending, mode == .code { result.append(slash) }
        return result
    }
}
