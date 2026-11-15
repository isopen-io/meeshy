import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Un post de PHOTOS sans légende doit pouvoir partir.**
///
/// Mesuré au simulateur le 2026-08-31 par une session voisine, en cherchant à
/// publier deux images : le composer accepte les photos, en peint les vignettes
/// en haut de l'écran — et « Publier » ne fait RIEN. Le bouton est
/// `.disabled`, donc le tap ne produit même pas d'erreur.
///
/// La cause : `ComposerDocumentPublishGate.canPublish` n'acceptait, pour un
/// document, qu'un **repost** ou un **texte non vide**. Les pièces jointes ne
/// figuraient pas dans la question. Or publier une photo sans un mot est le cas
/// nominal d'un réseau social — pas un cas limite.
///
/// **Ce qui rend ce défaut coûteux, c'est son silence.** L'écran montre la
/// matière (les vignettes sont là), donc l'auteur croit avoir composé ; le
/// bouton est peint, donc il croit pouvoir partir. Rien ne dit que la seule
/// chose qui manque est du TEXTE. C'est la loi 4 prise à l'envers : le contrôle
/// est là, sans effet, et sans raison affichée.
final class ComposerDocumentPublishMatterTests: XCTestCase {

    private func canPublish(text: String = "",
                            hasMedia: Bool = false,
                            hasLocation: Bool = false) -> Bool {
        ComposerDocumentPublishGate.canPublish(
            surface: .document,
            emoji: nil,
            text: text,
            visibility: .public,
            visibilityUserIds: [],
            isPublishing: false,
            repostOfId: nil,
            hasMedia: hasMedia,
            hasLocation: hasLocation
        )
    }

    /// **Le cas mesuré.**
    func test_deuxPhotosSansLegende_peuventPartir() {
        XCTAssertTrue(canPublish(text: "", hasMedia: true))
    }

    /// Un lieu seul est une publication en soi — « je suis ici » n'a pas besoin
    /// d'un mot pour être un post.
    func test_unLieuSeul_peutPartir() {
        XCTAssertTrue(canPublish(text: "", hasLocation: true))
    }

    /// **Le fusible.** Une porte qui dirait toujours oui laisserait partir un
    /// brouillon VIDE — et c'est ce que la porte existe d'abord pour refuser.
    func test_unBrouillonEntierementVide_estToujoursREFUSE() {
        XCTAssertFalse(canPublish(text: "   \n  "))
    }

    func test_leTexteSeul_partTOUJOURS() {
        XCTAssertTrue(canPublish(text: "Bonjour"))
    }

    /// Les gardes qui PRÉCÈDENT la matière ne sont pas contournées par elle :
    /// un envoi en cours refuse, et une audience incomplète aussi.
    func test_laMatiereNeContournePasLesGardesAmont() {
        XCTAssertFalse(ComposerDocumentPublishGate.canPublish(
            surface: .document, emoji: nil, text: "", visibility: .public,
            visibilityUserIds: [], isPublishing: true, repostOfId: nil, hasMedia: true))

        XCTAssertFalse(ComposerDocumentPublishGate.canPublish(
            surface: .document, emoji: nil, text: "", visibility: .only,
            visibilityUserIds: [], isPublishing: false, repostOfId: nil, hasMedia: true))
    }

    /// Le défaut des nouveaux paramètres est FERMÉ : un appelant qui ne se
    /// prononce pas obtient le comportement d'avant, jamais une porte ouverte.
    func test_leDefautDesNouveauxParametres_estFERME() {
        XCTAssertFalse(ComposerDocumentPublishGate.canPublish(
            surface: .document, emoji: nil, text: "", visibility: .public,
            visibilityUserIds: [], isPublishing: false, repostOfId: nil))
    }
}
