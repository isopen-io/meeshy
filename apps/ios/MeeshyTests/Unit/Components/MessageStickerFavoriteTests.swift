import XCTest
import MeeshySDK
@testable import Meeshy
@testable import MeeshyUI

/// **Épingler la décoration d'un message-sticker** (directive porteur
/// 2026-09-05 : « permettre de pouvoir ajouter dans favoris par long-press sur
/// les stickers dans les composers ET messages »).
@MainActor
final class MessageStickerFavoriteTests: XCTestCase {

    private func store() -> StickerUsageStore {
        StickerUsageStore(defaults: UserDefaults(suiteName: "test.\(UUID().uuidString)")!)
    }

    // MARK: - Le pont entre les deux modèles

    /// **LE témoin du lot.** Un gabarit porte AUSSI un emoji de repli ; lire
    /// l'emoji en premier épinglerait « 📍 » là où l'auteur a envoyé une carte
    /// postale — le repli servi à la place de la chose, alors que la chose est
    /// disponible.
    ///
    /// C'est le même piège que le RENDU, où `FocalRow` documente que le bloc
    /// sticker doit passer avant l'emoji-only. La mémoire a le même ordre à
    /// tenir, et rien ne l'aurait rappelé au second site.
    func test_unGabaritAvecReplyEmoji_epingleLeGABARIT() {
        let sticker = MessageSticker(templateId: "location.postcard",
                                     slots: ["place.name": "Paris"],
                                     emoji: "📍")
        let entree = MessageStickerFavorite.entry(for: sticker)
        XCTAssertEqual(entree?.kind, .template)
        XCTAssertEqual(entree?.value, "location.postcard")
    }

    func test_unStickerEmoji_epingleLEmoji() {
        let entree = MessageStickerFavorite.entry(for: MessageSticker(emoji: "🎬"))
        XCTAssertEqual(entree?.kind, .emoji)
        XCTAssertEqual(entree?.value, "🎬")
    }

    /// **Un message SANS sticker ne rend rien** — c'est ce `nil` qui retire
    /// l'entrée du menu, jamais un grisé (loi 4).
    func test_unMessageSansSticker_neRendRien() {
        XCTAssertNil(MessageStickerFavorite.entry(for: nil))
        XCTAssertNil(MessageStickerFavorite.state(for: nil))
    }

    /// **Un `templateId` VIDE n'est pas un gabarit.** Le contrat le dit — « nil
    /// ou vide = sticker emoji » — et une chaîne vide passée telle quelle
    /// aurait épinglé une entrée que le catalogue ne peut pas résoudre : un
    /// favori définitivement invisible, sans erreur.
    func test_unTemplateIdVide_retombeSurLEmoji() {
        let entree = MessageStickerFavorite.entry(for: MessageSticker(templateId: "", emoji: "🔥"))
        XCTAssertEqual(entree?.kind, .emoji)
        XCTAssertEqual(entree?.value, "🔥")
    }

    /// …et sans emoji non plus, il n'y a RIEN à retenir. Épingler une entrée
    /// vide remplirait les favoris d'une case que rien ne peut dessiner.
    func test_unStickerSansRien_neRendRien() {
        XCTAssertNil(MessageStickerFavorite.entry(for: MessageSticker()))
    }

    // MARK: - L'état servi au menu

    func test_lEtat_suitLeMagasin() {
        let magasin = store()
        let sticker = MessageSticker(emoji: "⭐️")
        XCTAssertEqual(MessageStickerFavorite.state(for: sticker, in: magasin), false)
        MessageStickerFavorite.toggle(for: sticker, in: magasin)
        XCTAssertEqual(MessageStickerFavorite.state(for: sticker, in: magasin), true)
        MessageStickerFavorite.toggle(for: sticker, in: magasin)
        XCTAssertEqual(MessageStickerFavorite.state(for: sticker, in: magasin), false)
    }

    /// **Basculer sans décoration ne touche à rien.** Le geste ne peut pas être
    /// offert dans ce cas ; ce no-op est la ceinture de la règle qui l'en
    /// empêche, pas un second chemin.
    func test_basculerSansDecoration_neTouchePasAuMagasin() {
        let magasin = store()
        MessageStickerFavorite.toggle(for: nil, in: magasin)
        XCTAssertEqual(magasin.favorites, [])
    }
}

/// **L'entrée de menu que la règle sert** — l'autre moitié : une règle juste
/// dont le menu ne porte pas l'entrée n'a rien livré.
@MainActor
final class MessageStickerMenuEntryTests: XCTestCase {

    private func contexte(sticker: Bool?) -> MessageMenuContext {
        MessageMenuContext(isMine: true, canEdit: true, canDelete: true,
                           hasText: true, hasMedia: false, hasTimebasedMedia: false,
                           isPinned: false, isStarred: false, isEdited: false,
                           hasEditRevisions: false, stickerFavorite: sticker)
    }

    private func actions(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
    }

    /// **Un message ORDINAIRE n'offre pas l'entrée.** Le tri-état est là pour
    /// ça : « pas un sticker » et « sticker non épinglé » gouvernent deux
    /// issues, et deux booléens auraient laissé représentable un quatrième
    /// état qui n'existe pas.
    func test_unMessageOrdinaire_nOffrePasLEntree() {
        let items = actions(contexte(sticker: nil))
        XCTAssertFalse(items.contains(.pinSticker))
        XCTAssertFalse(items.contains(.unpinSticker))
    }

    func test_unStickerNonEpingle_offreEpingler() {
        let items = actions(contexte(sticker: false))
        XCTAssertTrue(items.contains(.pinSticker))
        XCTAssertFalse(items.contains(.unpinSticker))
    }

    func test_unStickerEpingle_offreRetirer() {
        let items = actions(contexte(sticker: true))
        XCTAssertTrue(items.contains(.unpinSticker))
        XCTAssertFalse(items.contains(.pinSticker))
    }

    /// **L'entrée voisine le favori du MESSAGE sans le remplacer.** Les deux
    /// désignent des objets différents — le message reste dans sa conversation,
    /// la décoration part dans la palette — et un lot qui confondrait les deux
    /// ferait disparaître l'un en croyant déplacer l'autre.
    func test_lesDeuxFavoris_coexistent() {
        let items = actions(contexte(sticker: false))
        XCTAssertTrue(items.contains(.star), "le favori du MESSAGE reste offert")
        XCTAssertTrue(items.contains(.pinSticker), "…et celui de la DÉCORATION s'y ajoute")
    }
}
