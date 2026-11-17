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

    // MARK: - Les deux textes ne se confondent JAMAIS

    // MARK: - Brouillon

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
}
