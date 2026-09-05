import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Le crédit d'une republication** (directive porteur 2026-09-01).
///
/// > « Lorsqu'on republie une story, on doit afficher le chip de crédit
/// > uniquement si la story originale était publique. […] On n'a plus besoin de
/// > ce chip en bas si la story n'était pas publique ou communautaire — lors de
/// > l'affichage on a quand même déjà un indicateur de republication ! »
@MainActor
final class StoryRepostCreditTests: XCTestCase {

    private func story(visibility: String?) -> StoryItem {
        StoryItem(id: "s1", content: "", media: [],
                  createdAt: Date(timeIntervalSince1970: 0),
                  visibility: visibility)
    }

    // MARK: - La décision

    func test_uneStoryPUBLIQUE_méritteSonCrédit() {
        XCTAssertTrue(StoryRepostCredit.isDue(for: story(visibility: "PUBLIC")))
        XCTAssertNotNil(StoryRepostCredit.badge(for: story(visibility: "PUBLIC"),
                                                authorHandle: "belva"))
    }

    /// **LE témoin de la directive.** Une pastille posée sur le canvas est une
    /// SIGNATURE : elle nomme un auteur devant tous ceux qui verront la
    /// republication. Sur une story qui n'était pas adressée à tous, elle
    /// l'expose à un public que son original n'avait pas.
    func test_uneStoryNONPUBLIQUE_nEnMériteAUCUN() {
        for restreinte in ["PRIVATE", "FRIENDS", "COMMUNITY", "CUSTOM", "ONLY"] {
            XCTAssertFalse(StoryRepostCredit.isDue(for: story(visibility: restreinte)),
                           "« \(restreinte) » n'est pas une audience publique")
            XCTAssertNil(StoryRepostCredit.badge(for: story(visibility: restreinte),
                                                 authorHandle: "belva"),
                         "aucune pastille pour « \(restreinte) »")
        }
    }

    /// **Fail-closed.** Une visibilité ABSENTE n'est pas une permission de
    /// nommer : l'ignorance de l'audience se lit comme une restriction, jamais
    /// comme un feu vert.
    func test_uneVisibilitéINCONNUE_nAccordeAucunCrédit() {
        XCTAssertFalse(StoryRepostCredit.isDue(for: story(visibility: nil)))
        XCTAssertNil(StoryRepostCredit.badge(for: story(visibility: nil), authorHandle: "belva"))
    }

    /// La casse du serveur ne décide pas de la règle — `isPublic` normalise.
    func test_laCasseDeLaVisibilité_neChangeRien() {
        XCTAssertTrue(StoryRepostCredit.isDue(for: story(visibility: "public")))
    }

    /// Un crédit sans nom ne crédite personne — il poserait une capsule vide au
    /// bas de la scène.
    func test_unHandleVIDE_neProduitAucunePastille() {
        XCTAssertNil(StoryRepostCredit.badge(for: story(visibility: "PUBLIC"), authorHandle: "   "))
    }

    // MARK: - Sa forme

    /// La pastille reste VERROUILLÉE : le verrou est ce qui garantit qu'un
    /// republieur ne peut pas retirer l'attribution. Il n'interdit pas de la
    /// DÉPLACER — aucun geste ne le consulte, et la directive le demande.
    func test_laPastille_resteVerrouilléeContreLeRetrait() {
        let badge = StoryRepostCredit.badge(for: story(visibility: "PUBLIC"), authorHandle: "belva")
        XCTAssertEqual(badge?.isLocked, true)
    }

    /// **La forme que la directive appelle « à revoir ».** L'aplat indigo
    /// opaque (`textBg: "6366F1"`) laisse la place au verre, qui prend la
    /// couleur de ce qu'il recouvre ; la boîte à coins mous devient une
    /// capsule.
    func test_laPastille_estDeVERRE_enCapsule_etNonUnAplat() {
        let badge = StoryRepostCredit.badge(for: story(visibility: "PUBLIC"), authorHandle: "belva")
        XCTAssertNil(badge?.textBg, "l'aplat opaque a disparu")
        XCTAssertEqual(badge?.frameShape, "pill")
        guard case .glass = badge?.backgroundStyle else {
            return XCTFail("le fond de la pastille doit être du verre")
        }
    }

    /// **Une signature illisible n'attribue rien.** Elle mesurait 14 px de
    /// design quand un texte d'auteur en mesure 96 — environ 5 pt à l'écran.
    func test_laPastille_estLISIBLE_sansDisputerLaVedette() {
        let badge = StoryRepostCredit.badge(for: story(visibility: "PUBLIC"), authorHandle: "belva")
        XCTAssertGreaterThanOrEqual(badge?.fontSize ?? 0, 32)
        XCTAssertLessThan(badge?.fontSize ?? .infinity, 96)
    }

    /// Le libellé passe par le catalogue — il était écrit en français DANS le
    /// code, donc identique dans les sept langues.
    func test_leLibellé_vientDuCatalogue_etPorteLeHandle() {
        XCTAssertTrue(StoryRepostCredit.label(handle: "belva").contains("belva"))
        XCTAssertFalse(StoryRepostCredit.label(handle: "belva").contains("%@"),
                       "le gabarit doit être RENSEIGNÉ, pas rendu tel quel")
    }

    // MARK: - Le retrait des crédits hérités

    /// **Inconditionnel, et c'est le cas neuf.** Republier une republication
    /// PUBLIQUE vers une audience restreinte garderait sinon la signature qu'on
    /// vient de juger indue — un cas que l'ancien code ne pouvait pas produire,
    /// puisqu'il ajoutait toujours.
    func test_lesCréditsHérités_sontRetirés_mêmeQuandAucunNouveauNEstDû() {
        let herite = StoryRepostCredit.badge(for: story(visibility: "PUBLIC"), authorHandle: "racine")
        let auteur = StoryTextObject(text: "mon texte à moi")
        let restant = StoryRepostCredit.stripped(from: [herite!, auteur])
        XCTAssertEqual(restant.map(\.text), ["mon texte à moi"],
                       "le crédit hérité part, le texte de l'auteur reste")
    }

    func test_leRetrait_neToucheJamaisLeTexteDeLAuteur() {
        let textes = [StoryTextObject(text: "un"), StoryTextObject(text: "deux")]
        XCTAssertEqual(StoryRepostCredit.stripped(from: textes).count, 2)
    }
}
