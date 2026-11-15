import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le socle de la scène : sa graine d'audience et ce qu'il peint.**
///
/// L'audience choisie au socle part telle quelle avec la publication : depuis le
/// #15629, le meuble publie lui-même sous ses deux surfaces, et plus aucun
/// atelier ne tient une seconde `visibility` à concilier avec la sienne.
final class ComposerSoclePublishHandoffTests: XCTestCase {

    // MARK: - La graine du socle sous la scène

    func test_laGraine_duSocle_vientDeLaPorte_quandLeFormatNaPasDeMemoire() {
        XCTAssertNil(ComposerAudienceMemory.key(for: .story))
        XCTAssertNil(ComposerAudienceMemory.key(for: .reel))
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: nil, doorRaw: PostVisibility.friends.rawValue),
            .friends
        )
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: PostVisibility.public.rawValue,
                                        doorRaw: PostVisibility.friends.rawValue),
            .public,
            "une mémoire EXISTANTE fait autorité sur la porte — c'est la loi 10"
        )
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: "n-importe-quoi",
                                        doorRaw: PostVisibility.friends.rawValue),
            .friends,
            "une mémoire illisible n'est pas une mémoire : le rang suivant sert"
        )
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: nil, doorRaw: nil), .public,
            "et le dernier repli reste public"
        )
    }

    // MARK: - #6132 · Écrire n'est pas publier

    /// **Pendant la frappe, le socle ne peint RIEN** (directive porteur
    /// 2026-09-12).
    ///
    /// > « Lorsqu'on écrit une légende, on a pas besoin de voir le bouton
    /// > publier, aperçu ou audience. »
    ///
    /// Mesuré au simulateur avant le correctif (2026-09-12, 11:17) : clavier
    /// levé pour écrire la légende, l'écran montrait EN MÊME TEMPS le socle
    /// entier, la ligne « Posez au moins un élément sur la scène pour publier »
    /// et un rail d'outils qui chevauchait « Public ». Trois étages de chrome
    /// pour un seul geste — écrire une phrase.
    ///
    /// Le témoin interroge les DEUX sens, et c'est ce qui l'empêche d'être vert
    /// par omission : sans le second cas, supprimer la règle entière (renvoyer
    /// toujours `[]`) passerait.
    func test_socleZones_pendantLaFrappe_leSoclePeintRien() {
        for surface in [ComposerSurfaceKind.document] {
            XCTAssertTrue(
                ComposerChromeOwnership.socleZones(for: surface,
                                                documentHasScene: true,
                                                writesText: true).isEmpty,
                "\(surface) : aucune zone du socle ne sert le geste d'écrire (#6132)."
            )
            XCTAssertFalse(
                ComposerChromeOwnership.socleZones(for: surface,
                                                documentHasScene: true,
                                                writesText: false).isEmpty,
                "\(surface) : hors frappe, le socle doit peindre ses zones — sinon ce témoin "
                    + "serait vert pour une règle qui ne rend jamais rien."
            )
        }
    }

    /// **Le défaut de la règle est le comportement d'AVANT.** Un appelant qui
    /// n'a pas été mis à jour ne doit rien perdre : c'est ce qui rend l'ajout du
    /// paramètre sûr sur les quatre sites qui l'ignorent.
    func test_socleZones_sansArgument_rendLeMemeResultatQueHorsFrappe() {
        for surface in [ComposerSurfaceKind.document, .mood] {
            XCTAssertEqual(
                ComposerChromeOwnership.socleZones(for: surface, documentHasScene: true),
                ComposerChromeOwnership.socleZones(for: surface, documentHasScene: true,
                                                writesText: false),
                "\(surface) : le défaut doit être « on n'écrit pas »."
            )
        }
    }

    /// **Et l'hôte doit passer par la règle, pas la recopier.** Une condition
    /// écrite dans le `body` serait invisible à ces deux témoins — c'est la
    /// mise en garde que `ComposerChromeOwnership` répète, et le mode d'apparition
    /// des règles en double exemplaire.
    func test_leMeuble_passeLaFrappeALaRegle_plutotQueDeLaTesterDansSonCorps() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let compact = code.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertGreaterThan(code.count, 500, "unité du meuble vide — la garde ne protégerait rien")
        XCTAssertTrue(compact.contains("writesText:writesText"),
                      "`paintedSocleZones` doit REMETTRE la frappe à la règle (#6132).")
        XCTAssertTrue(compact.contains("varwritesText:Bool{editsSceneDescription||editsPostContent}"),
                      "… et les deux zones d'écriture doivent passer par un terme NOMMÉ, une fois.")
    }
}
