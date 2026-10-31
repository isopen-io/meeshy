import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **Le menu ⋯ de la scène** (#13839) — le témoin INVERSE de
/// `ComposerRailGeographyByFormatTests`, qui rangeait lieu, hashtag et mention
/// au rail gauche en Story et en bas ailleurs (#4893).
///
/// La directive du 2026-10-30 ne laisse sur la scène que six boutons ; tout ce
/// qui n'y est pas vit ici, dans l'ordre de la spec iOS § 4, et une entrée n'est
/// servie que si elle a un effet (loi 4).
final class ComposerMoreMenuPolicyTests: XCTestCase {

    private func contexte(addsSlides: Bool = true,
                          backgroundMedia: ComposerSceneEffects.Background? = nil,
                          doors: [ComposerRailDoor] = [.mention, .hashtag, .place, .background],
                          overflow: [ComposerOverflowEntry] = []) -> ComposerMoreMenuPolicy.Context {
        ComposerMoreMenuPolicy.Context(addsSlides: addsSlides,
                                       backgroundMedia: backgroundMedia,
                                       offeredDoors: doors,
                                       overflow: overflow)
    }

    func test_entries_storyVideSansFond_ordreDeLaSpec() {
        XCTAssertEqual(ComposerMoreMenuPolicy.entries(contexte()),
                       [.addSlide, .background, .animation, .slideDuration, .legend,
                        .mention, .hashtags, .place])
    }

    func test_entries_avecUnFondImage_transitionsEffetVisuelEtCadrage_remplacentLaPalette() {
        let entrees = ComposerMoreMenuPolicy.entries(contexte(backgroundMedia: .image,
                                                              doors: [.mention, .hashtag, .place]))
        XCTAssertFalse(entrees.contains(.background), "la porte Fond tombe quand le fond est un média")
        XCTAssertEqual(Array(entrees.prefix(5)),
                       [.addSlide, .transitions, .visualEffect, .backgroundFraming, .animation])
    }

    func test_entries_avecUnFondVideo_pasDEffetVisuel() {
        let entrees = ComposerMoreMenuPolicy.entries(contexte(backgroundMedia: .video, doors: []))
        XCTAssertTrue(entrees.contains(.transitions))
        XCTAssertTrue(entrees.contains(.backgroundFraming))
        XCTAssertFalse(entrees.contains(.visualEffect),
                       "ComposerSceneEffects ne sert pas l'effet visuel sur une vidéo")
    }

    /// Republier et modifier une story publiée n'ajoutent pas de diapo.
    func test_entries_routeSansDiapo_pasDAjout() {
        XCTAssertFalse(ComposerMoreMenuPolicy.entries(contexte(addsSlides: false)).contains(.addSlide))
    }

    func test_entries_unePorteNonOfferte_nAPasDEntree() {
        let entrees = ComposerMoreMenuPolicy.entries(contexte(doors: [.background]))
        XCTAssertFalse(entrees.contains(.mention))
        XCTAssertFalse(entrees.contains(.hashtags))
        XCTAssertFalse(entrees.contains(.place))
    }

    /// Les entrées d'export et d'effacement restent celles de
    /// `ComposerOverflowPolicy` — une seule règle, lue ici, jamais recopiée.
    func test_entries_reprendLaPolitiqueDuDebordement_aLaFin_toutEffacerEnDernier() {
        let debordement = ComposerOverflowPolicy.entries(hasBackground: true, hasMedia: true, hasText: true,
                                                         hasLocation: false, hasScene: true,
                                                         backgroundPickerIsReachable: true)
        let entrees = ComposerMoreMenuPolicy.entries(contexte(overflow: debordement))
        XCTAssertEqual(Array(entrees.suffix(5)),
                       [.preview, .removeBackground, .saveToPhotos, .share, .clearAll])
        XCTAssertEqual(entrees.last, .clearAll, "la seule entrée destructrice ferme la liste")
    }

    func test_entries_laPaletteInatteignable_reparaitParChoisirUnFond() {
        let debordement = ComposerOverflowPolicy.entries(hasBackground: false, hasMedia: false, hasText: false,
                                                         hasLocation: false, hasScene: false,
                                                         backgroundPickerIsReachable: false)
        XCTAssertTrue(ComposerMoreMenuPolicy.entries(contexte(overflow: debordement)).contains(.pickBackground))
    }

    func test_entries_aucuneEntreeEnDouble() {
        let debordement = ComposerOverflowPolicy.entries(hasBackground: true, hasMedia: true, hasText: true,
                                                         hasLocation: true, hasScene: true,
                                                         backgroundPickerIsReachable: false)
        let entrees = ComposerMoreMenuPolicy.entries(contexte(backgroundMedia: .image,
                                                              overflow: debordement))
        XCTAssertEqual(entrees.count, Set(entrees).count)
    }

    func test_chaqueEntree_aUnLibelleEtUnGlyphe() {
        for entree in ComposerMoreMenuEntry.allCases {
            XCTAssertFalse(ComposerMoreMenuCopy.label(entree).isEmpty, "\(entree)")
            XCTAssertFalse(ComposerMoreMenuCopy.icon(entree).isEmpty, "\(entree)")
        }
    }

    /// Le vocabulaire du relevé : « Enregistrer » ne disait pas où, « Transférer »
    /// ne disait pas vers où, « Retirer le fond » ne disait pas lequel.
    func test_libelles_disentOuVaLExport() {
        XCTAssertNotEqual(ComposerMoreMenuCopy.label(.saveToPhotos), ComposerOverflowCopy.label(.saveToPhotos))
        XCTAssertNotEqual(ComposerMoreMenuCopy.label(.share), ComposerOverflowCopy.label(.share))
        XCTAssertNotEqual(ComposerMoreMenuCopy.label(.removeBackground),
                          ComposerOverflowCopy.label(.removeBackground))
    }

    func test_entree_seuleToutEffacerEstDestructrice() {
        for entree in ComposerMoreMenuEntry.allCases {
            XCTAssertEqual(entree.isDestructive, entree == .clearAll, "\(entree)")
        }
    }

    // MARK: - La durée de la diapo

    func test_slideDurationChoices_bornesEtOrdre() {
        XCTAssertEqual(ComposerMoreMenuPolicy.slideDurationChoices, [5, 10, 15, 30, 60])
    }

    /// La coche dit la durée RÉELLE : une diapo de 7 s ou de 5 min n'est ni
    /// « 5 s » ni « 1 min ». Sa durée paraît, cochée, à son rang.
    func test_durationMenu_uneDureeHorsDesChoix_paraitCocheeASonRang() {
        let sept = ComposerMoreMenuPolicy.durationMenu(current: 7.3)
        XCTAssertEqual(sept.choices, [5, 7, 10, 15, 30, 60])
        XCTAssertEqual(sept.selected, 7)
        let longue = ComposerMoreMenuPolicy.durationMenu(current: 300)
        XCTAssertEqual(longue.choices, [5, 10, 15, 30, 60, 300])
        XCTAssertEqual(longue.selected, 300)
    }

    func test_durationMenu_uneDureeDuMenu_cocheeSansDoublon() {
        let dix = ComposerMoreMenuPolicy.durationMenu(current: 10.2)
        XCTAssertEqual(dix.choices, ComposerMoreMenuPolicy.slideDurationChoices)
        XCTAssertEqual(dix.selected, 10)
    }

    // MARK: - Tout effacer

    /// « Tout effacer » demande confirmation partout où il est servi : le ⋯ de
    /// la scène ET celui du document (#13839).
    func test_overflow_seulToutEffacerDemandeConfirmation() {
        for entree in ComposerOverflowEntry.allCases {
            XCTAssertEqual(entree.asksConfirmation, entree == .clearAll, "\(entree)")
        }
    }

}
