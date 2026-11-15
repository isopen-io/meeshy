import XCTest
import MeeshySDK
@testable import Meeshy

/// **LE TEXTE D'UN STICKER VOYAGE AVEC SON IMAGE** (retour porteur 2026-09-14 :
/// « les images construites avec le sticker doivent avoir le texte attaché à
/// l'image en légende et alt »).
///
/// Un sticker envoyé en conversation part comme un PNG
/// (`StickerSendPipeline`), et la pièce jointe posée par `sendStickerImage`
/// laissait `alt` et `caption` VIDES — alors que les deux champs existent sur
/// `MeeshyMessageAttachment` et que le texte est là, dans le `MessageSticker`
/// que le même appel transporte.
///
/// > Le texte n'était pas absent : il n'était pas RELIÉ. C'est la troisième
/// > fois aujourd'hui — une donnée présente, des champs prêts, et personne
/// > entre les deux.
///
/// Ce que cela coûtait : un lecteur d'écran annonçait « image », un aperçu de
/// notification ne montrait rien, et une recherche dans le fil ne pouvait pas
/// retrouver un sticker par son texte.
final class StickerAltTextTests: XCTestCase {

    // MARK: - Le gabarit : l'ordre vient du CATALOGUE, jamais du dictionnaire

    func test_unGabarit_rendSesValeursDansLOrdreDuCatalogue() {
        // `MessageSticker.slots` est un DICTIONNAIRE — son ordre d'itération
        // n'est pas garanti et change d'une exécution à l'autre. L'ordre
        // d'affichage, lui, est celui de `StickerTemplate.slots`, un TABLEAU.
        // Lire le dictionnaire tel quel donnerait une légende dont les mots
        // changent de place entre deux lancements, pour la même image.
        guard let gabarit = StickerTemplateCatalog.all.first(where: { $0.slots.count >= 2 }) else {
            return XCTFail("Le catalogue doit porter au moins un gabarit à deux emplacements.")
        }
        var valeurs: [String: String] = [:]
        for (i, slot) in gabarit.slots.enumerated() { valeurs[slot.name] = "V\(i)" }

        let texte = StickerAltText.describe(MessageSticker(templateId: gabarit.id, slots: valeurs, emoji: gabarit.fallbackEmoji))

        let attendu = gabarit.slots.enumerated().map { "V\($0.offset)" }.joined(separator: " ")
        XCTAssertEqual(texte, attendu, "les valeurs doivent suivre l'ordre du gabarit")
    }

    func test_unEmplacementVide_neLaissePasDeBlancDansLaLegende() {
        guard let gabarit = StickerTemplateCatalog.all.first(where: { $0.slots.count >= 2 }) else { return }
        var valeurs: [String: String] = [:]
        valeurs[gabarit.slots[0].name] = "Seul"
        // le second emplacement reste absent

        let texte = StickerAltText.describe(MessageSticker(templateId: gabarit.id, slots: valeurs, emoji: gabarit.fallbackEmoji))

        XCTAssertEqual(texte, "Seul", "un emplacement non rempli ne doit produire ni espace double ni séparateur orphelin")
    }

    /// **Un gabarit que CE binaire ne connaît pas** — publié par une version
    /// plus récente. La légende ne peut pas suivre un ordre qu'elle ignore ;
    /// elle prend alors les clés TRIÉES, ce qui est arbitraire mais STABLE.
    /// L'alternative — l'ordre du dictionnaire — donnerait deux légendes
    /// différentes pour la même image.
    func test_unGabaritInconnu_rendUnOrdreStable_jamaisCeluiDuDictionnaire() {
        let inconnu = MessageSticker(templateId: "template-du-futur",
                                     slots: ["z": "dernier", "a": "premier", "m": "milieu"],
                                     emoji: "✨")
        let premier = StickerAltText.describe(inconnu)
        for _ in 0..<12 {
            XCTAssertEqual(StickerAltText.describe(inconnu), premier, "la légende doit être stable d'un appel à l'autre")
        }
        XCTAssertEqual(premier, "premier milieu dernier", "à défaut de l'ordre du gabarit, les clés triées")
    }

    // MARK: - L'emoji

    func test_unStickerEmoji_rendSonGlyphe() {
        XCTAssertEqual(StickerAltText.describe(MessageSticker.emoji("🎉")), "🎉")
    }

    func test_unGabaritSansAucuneValeur_retombeSurSonEmojiDeRepli() {
        // Le gabarit est posé mais aucun emplacement n'est rempli : l'image
        // montre alors son décor seul. L'emoji de repli est ce que le lecteur
        // ancien verrait — c'est donc la description la plus fidèle.
        let vide = MessageSticker(templateId: "template-du-futur", slots: [:], emoji: "📍")
        XCTAssertEqual(StickerAltText.describe(vide), "📍")
    }

    // MARK: - Rien à décrire

    func test_unStickerSansTexteNiEmoji_neDecritRIEN_jamaisUneChaineVide() {
        // `nil`, jamais `""` : une chaîne vide posée en `alt` ANNONCE une
        // description qui n'existe pas, et un lecteur d'écran la lit comme un
        // champ présent mais muet. L'absence doit rester une absence.
        XCTAssertNil(StickerAltText.describe(MessageSticker()))
        XCTAssertNil(StickerAltText.describe(MessageSticker(templateId: "", slots: [:], emoji: "")))
    }

    func test_lesValeursSontNettoyees_pasDeBlancsParasites() {
        let sale = MessageSticker(templateId: "template-du-futur", slots: ["a": "  Bonjour  ", "b": "\n"], emoji: "👋")
        XCTAssertEqual(StickerAltText.describe(sale), "Bonjour")
    }
}
