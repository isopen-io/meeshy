import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #4055 — la LÉGENDE par média (`PostMedia.caption`).
///
/// La colonne existe au schéma, elle est SERVIE (`postIncludes.ts`), le
/// gateway sait la persister depuis le cycle qui a livré
/// `PostService.applyMediaCaption` — et **aucun client Swift ne l'écrivait**.
/// Un champ rendu que personne ne remplit.
///
/// Ces témoins gardent la chaîne côté SDK : collecte → brouillon → hand-off →
/// re-clé serveur. Ils sont la JUMELLE exacte de `MediaAltCollectionTests` :
/// même porteur (`PostMedia`), même clé (un id de `mediaIds`), même borne
/// (1000), même règle d'ignorance côté gateway — c'est pourquoi les deux
/// textes partagent une seule implémentation (`PostMediaText`), comme le
/// serveur les a déjà unifiés dans `applyMediaText(column:)`.
///
/// Ce que les deux ne partagent PAS, et qui justifie deux champs : `alt`
/// DÉCRIT le média pour qui ne le voit pas ; `caption` est la LÉGENDE que
/// l'auteur écrit — en profil Post, la description de la `MeeshySlide`, le
/// post gardant son propre `content`.
@MainActor
final class MediaCaptionCollectionTests: XCTestCase {

    // MARK: - Collecte

    func test_caption_defaultsToEmptyString_forUntouchedMedia() {
        let store = MediaAccessibilityStore()
        XCTAssertEqual(store.caption(for: "media-1"), "")
    }

    func test_setCaption_roundTrips() {
        let store = MediaAccessibilityStore()
        store.setCaption("Le marché de Yaoundé, 6 h", for: "media-1")
        XCTAssertEqual(store.caption(for: "media-1"), "Le marché de Yaoundé, 6 h")
    }

    /// Une chaîne vide RETIRE l'entrée — un média jamais touché et un média
    /// dont la légende a été effacée doivent produire le MÊME payload
    /// (absent), pas un `""` qui écraserait une légende serveur au prochain
    /// update.
    func test_setCaption_emptyString_clearsEntry() {
        let store = MediaAccessibilityStore()
        store.setCaption("Une légende", for: "media-1")
        store.setCaption("", for: "media-1")
        XCTAssertEqual(store.caption(for: "media-1"), "")
        XCTAssertNil(store.mediaCaptionPayload())
    }

    /// Le clamp est celui du transport (`z.string().max(1000)`), pas une
    /// préférence d'UI : collecter plus que ce que le gateway accepte
    /// produirait une requête refusée ou un texte tronqué côté serveur.
    func test_setCaption_clampsToTransportBound() {
        let store = MediaAccessibilityStore()
        store.setCaption(String(repeating: "é", count: 1500), for: "media-1")
        XCTAssertEqual(store.caption(for: "media-1").count, PostMediaText.maxLength)
    }

    // MARK: - Les deux textes ne se confondent JAMAIS

    /// Le témoin qui garde l'unification : `alt` et `caption` partagent une
    /// implémentation, ils ne partagent pas un STOCKAGE. Une régression qui
    /// les ferait écrire la même case rendrait ce témoin rouge — et c'est le
    /// seul défaut que la mutualisation puisse introduire.
    func test_altAndCaption_areStoredSeparately_forTheSameMedia() {
        let store = MediaAccessibilityStore()
        store.setAlt("Une foule dense sous des parasols", for: "media-1")
        store.setCaption("Le marché de Yaoundé, 6 h", for: "media-1")

        XCTAssertEqual(store.alt(for: "media-1"), "Une foule dense sous des parasols")
        XCTAssertEqual(store.caption(for: "media-1"), "Le marché de Yaoundé, 6 h")
        XCTAssertEqual(store.mediaAltPayload(), ["media-1": "Une foule dense sous des parasols"])
        XCTAssertEqual(store.mediaCaptionPayload(), ["media-1": "Le marché de Yaoundé, 6 h"])
    }

    /// Retirer un média emporte SES DEUX textes. Un `remove` qui n'en
    /// effacerait qu'un laisserait un id orphelin fuiter dans un payload
    /// ultérieur — exactement ce que la version alt-seule évitait déjà.
    func test_remove_clearsBothTexts() {
        let store = MediaAccessibilityStore()
        store.setAlt("alt", for: "media-1")
        store.setCaption("légende", for: "media-1")
        store.remove(mediaId: "media-1")
        XCTAssertNil(store.mediaAltPayload())
        XCTAssertNil(store.mediaCaptionPayload())
    }

    // MARK: - Brouillon

    func test_draftSnapshot_carriesCaption_andRestoreRoundTrips() {
        let store = MediaAccessibilityStore()
        store.setAlt("alt", for: "el-1")
        store.setCaption("légende", for: "el-1")

        let snapshot = store.draftSnapshot()
        XCTAssertEqual(snapshot.mediaCaption, ["el-1": "légende"])

        let reopened = MediaAccessibilityStore()
        reopened.restore(from: snapshot)
        XCTAssertEqual(reopened.caption(for: "el-1"), "légende")
        XCTAssertEqual(reopened.alt(for: "el-1"), "alt")
    }

    /// Un brouillon ÉCRIT AVANT cette feature n'a pas de clé `mediaCaption`.
    /// Il doit se relire — sans légende, pas en échouant : un décodeur strict
    /// perdrait le brouillon ENTIER, avec son texte alternatif et son choix
    /// d'extraction de son.
    func test_draftWrittenBeforeCaptions_stillDecodes() throws {
        let legacy = Data(#"{"mediaAlt":{"el-1":"alt"},"allowSoundExtraction":true}"#.utf8)
        let decoded = try JSONDecoder().decode(StoryDraftAccessibility.self, from: legacy)
        XCTAssertEqual(decoded.mediaAlt, ["el-1": "alt"])
        XCTAssertEqual(decoded.mediaCaption, [:])
        XCTAssertEqual(decoded.allowSoundExtraction, true)
    }

    // MARK: - Hand-off de publication

    func test_accessibilityHandoff_carriesCaption() {
        let store = MediaAccessibilityStore()
        store.setCaption("légende", for: "el-1")
        let handoff = StoryComposerView.accessibilityHandoff(from: store)
        XCTAssertEqual(handoff.mediaCaption, ["el-1": "légende"])
    }

    /// `isEmpty` gouverne l'écriture du brouillon : une légende SEULE doit
    /// suffire à le rendre non vide, sans quoi elle serait perdue à la
    /// fermeture d'un composer où rien d'autre n'a été saisi.
    func test_captionAlone_makesTheDraftAccessibilityNonEmpty() {
        let store = MediaAccessibilityStore()
        store.setCaption("légende", for: "el-1")
        XCTAssertFalse(store.draftSnapshot().isEmpty)
    }
}
