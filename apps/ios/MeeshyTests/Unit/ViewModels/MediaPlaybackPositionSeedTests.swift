import XCTest
@testable import Meeshy

/// La décision pure derrière l'amorçage du magasin de REPRISE (#3914).
///
/// ## Ce que l'ancienne règle coûtait
///
/// Elle refusait toute écriture dès qu'une position locale existait, **si
/// ancienne fût-elle**. Un appareil ayant ouvert la pièce jointe UNE fois
/// n'apprenait plus jamais ce qui s'était passé ailleurs — la synchronisation
/// multi-appareil ne servait qu'une fois par pièce jointe et par appareil.
///
/// > Une garde qui refuse TOUTE écriture pour protéger le cas où la valeur
/// > entrante est plus PETITE protège aussi le cas où elle est plus grande —
/// > c'est-à-dire exactement celui qu'on voulait servir.
///
/// La règle est désormais le MAXIMUM, et la non-régression (« une position
/// locale plus avancée n'est jamais reculée ») en est une CONSÉQUENCE, pas une
/// exception à écrire à part.
final class MediaPlaybackPositionSeedTests: XCTestCase {

    // MARK: - Ce que la règle sert

    func test_aucunePositionLocale_sèmeDepuisLeServeur() {
        XCTAssertEqual(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 4_500, localPositionSeconds: nil),
            4.5
        )
    }

    /// LE témoin de cette issue : c'est le seul cas que l'ancienne règle ratait,
    /// et il est le cas NOMINAL d'un utilisateur multi-appareils — on écoute sur
    /// le téléphone, on reprend sur l'iPad qu'on avait déjà ouvert une fois.
    func test_leServeurPlusAVANCÉ_metÀJourUnePositionLocaleDéjàPosée() {
        XCTAssertEqual(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 90_000, localPositionSeconds: 12),
            90
        )
    }

    // MARK: - Ce que la règle protège

    func test_unePositionLocalePlusAvancée_nEstJAMAISReculée() {
        XCTAssertNil(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 12_000, localPositionSeconds: 90)
        )
    }

    func test_deuxPositionsÉGALES_nÉcriventRien() {
        // Écrire la même valeur ne changerait rien et ferait battre le magasin
        // pour rien à chaque ouverture de conversation.
        XCTAssertNil(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 30_000, localPositionSeconds: 30)
        )
    }

    // MARK: - Ce qui n'est pas une position

    func test_aucunePositionServeur_nÉcritRien() {
        XCTAssertNil(
            ConversationViewModel.seedResumePositionSeconds(positionMs: nil, localPositionSeconds: nil)
        )
        XCTAssertNil(
            ConversationViewModel.seedResumePositionSeconds(positionMs: nil, localPositionSeconds: 42)
        )
    }

    func test_positionServeurNULLE_nÉcritRien() {
        XCTAssertNil(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 0, localPositionSeconds: nil)
        )
    }

    /// Contre-épreuve de forme : la règle compare des SECONDES à des
    /// millisecondes converties, jamais l'inverse. Une confusion d'unité rendrait
    /// ce cas faux sans qu'aucun autre témoin ne bouge — 5 000 ms valent 5 s, et
    /// 5 s de local doivent donc gagner contre 4 500 ms de serveur.
    func test_lesDeuxGrandeursSeComparentDansLaMÊMEUnité() {
        XCTAssertNil(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 4_500, localPositionSeconds: 5)
        )
        XCTAssertEqual(
            ConversationViewModel.seedResumePositionSeconds(positionMs: 5_500, localPositionSeconds: 5),
            5.5
        )
    }
}
