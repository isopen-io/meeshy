import XCTest
import MeeshySDK
@testable import Meeshy

/// #18589 — les Réglages en deux strates : en haut ce qui se touche souvent,
/// sous un pli « Annexes » ce qu'on ouvre une fois par an, et en pied la
/// session puis la suppression du compte. La loi est une VALEUR : l'écran se
/// compose depuis elle, et ces témoins la lisent sans monter de vue.
@MainActor
final class SettingsLayoutTests: XCTestCase {

    private var destinations: [SettingsDestination] {
        SettingsLayout.blocks.flatMap(\.destinations)
    }

    private func voiceState(consent: Bool) -> VoiceSetupState {
        VoiceSetupState(voiceConsentGranted: consent, transcriptionEnabled: true)
    }

    // MARK: - Une information vit à un endroit

    func test_blocks_eachDestination_appearsExactlyOnce() {
        XCTAssertEqual(destinations.count, Set(destinations).count)
    }

    func test_blocks_everyDeclaredDestination_hasAPlace() {
        XCTAssertEqual(Set(destinations), Set(SettingsDestination.allCases))
    }

    func test_blocks_identifiers_areUnique_soEachAnchorDesignatesOneBlock() {
        let ids = SettingsLayout.blocks.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count)
    }

    // MARK: - Les strates

    func test_blocks_lifePrecedesAnnex_whichPrecedesFooter() {
        let strata = SettingsLayout.blocks.map(\.stratum)
        XCTAssertEqual(strata, strata.sorted(), "vie, puis annexe, puis pied : \(strata)")
        XCTAssertEqual(Set(strata), Set(SettingsStratum.allCases))
    }

    func test_blocks_life_areAccountNotificationsAppearanceVoiceTranscriptionMedia() {
        XCTAssertEqual(SettingsLayout.blocks(in: .life).map(\.id),
                       [.account, .notifications, .appearance, .voice, .transcription, .media])
    }

    func test_blocks_annex_areInterfaceFeaturesDataHelpAbout() {
        XCTAssertEqual(SettingsLayout.blocks(in: .annex).map(\.id),
                       [.interfaceFeatures, .dataStorage, .help, .about])
    }

    func test_blocks_footer_isTheSessionThenAccountDeletionAlone() {
        XCTAssertEqual(SettingsLayout.blocks(in: .footer).map(\.destinations),
                       [[.switchAccount, .logout], [.deleteAccount]])
    }

    func test_deleteAccount_isTheLastDestination() {
        XCTAssertEqual(destinations.last, .deleteAccount)
        XCTAssertFalse(SettingsLayout.block(containing: .privacy)?.destinations.contains(.deleteAccount) ?? true,
                       "la suppression du compte a quitté le bloc Compte")
    }

    // MARK: - Ce qui a quitté les Réglages

    func test_destinations_noStatisticToolVersionOrQuickNotificationRowRemains() {
        let names = Set(SettingsDestination.allCases.map(\.rawValue))
        for retired in ["stats", "progression", "starred", "bookmarks", "affiliate", "version",
                        "sounds", "vibrations", "moreOptions", "myPacks"] {
            XCTAssertFalse(names.contains(retired), "\(retired) ne vit plus dans les Réglages")
        }
    }

    func test_notifications_isASingleRow_thatOpensTheSheet() {
        XCTAssertEqual(SettingsLayout.block(containing: .notifications)?.destinations, [.notifications])
        XCTAssertEqual(SettingsDestination.notifications.presentation, .sheet(.notifications))
    }

    func test_shop_livesInAppearance_andMediaDownloadInMedia() {
        XCTAssertEqual(SettingsLayout.block(containing: .shop)?.id, .appearance)
        XCTAssertEqual(SettingsLayout.block(containing: .mediaDownload)?.destinations, [.mediaDownload])
        XCTAssertEqual(SettingsDestination.shop.presentation, .shop)
    }

    func test_interfaceFeatures_carryTheThreeTogglesInTheirOrder() {
        XCTAssertEqual(SettingsLayout.block(containing: .lentilleList)?.destinations,
                       [.lentilleList, .readingModes, .riviereMode])
    }

    func test_voice_isASingleRow() {
        XCTAssertEqual(SettingsLayout.block(containing: .voiceProfile)?.destinations, [.voiceProfile])
    }

    // MARK: - Un contrôle existe s'il a un effet

    func test_presentation_eachSheet_hasExactlyOneDoor() {
        let sheets = SettingsDestination.allCases.compactMap { destination -> SettingsSheet? in
            guard case .sheet(let sheet) = destination.presentation else { return nil }
            return sheet
        }
        XCTAssertEqual(sheets.count, Set(sheets).count, "deux rangées ouvrent la même feuille : \(sheets)")
    }

    func test_presentation_everyRowThatOpensASheet_hasItsRowContent() {
        for destination in SettingsDestination.allCases {
            guard case .sheet = destination.presentation,
                  SettingsLayout.block(containing: destination)?.stratum != .footer else { continue }
            XCTAssertNotNil(SettingsRowContent.of(destination, voice: voiceState(consent: true)),
                            "\(destination) ouvre une feuille sans rangée qui la nomme")
        }
    }

    func test_presentation_inlineControls_areTheTogglesAndPickers() {
        let controls = SettingsDestination.allCases.filter { $0.presentation == .control }
        XCTAssertEqual(Set(controls), [.theme, .interfaceLanguage, .transcriptionMine, .transcriptionAuto,
                                       .lentilleList, .readingModes, .riviereMode])
    }

    func test_rowContent_opensTheSheetItsDestinationDeclares() {
        for destination in SettingsDestination.allCases {
            guard case .sheet(let sheet) = destination.presentation,
                  let row = SettingsRowContent.of(destination, voice: voiceState(consent: true)) else { continue }
            XCTAssertEqual(row.sheet, sheet, "la rangée \(destination) nomme une feuille et en ouvrirait une autre")
        }
    }

    func test_settingsView_everyRowActs_throughItsDestinationPresentation() throws {
        let settings = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Settings/Views/SettingsView.swift"))
        XCTAssertTrue(settings.contains("switch destination.presentation"), "l'écran exécute la loi au lieu de la recopier")
        for door in ["open(.switchAccount)", "open(.logout)", "open(.deleteAccount)", "open(.shop)", "open(destination)"] {
            XCTAssertTrue(settings.contains(door), "\(door) : la rangée passe par sa présentation déclarée")
        }
        for copied in ["presentedSheet = .accountSwitcher", "presentedSheet = .deleteAccount", "presentedSheet = content.sheet"] {
            XCTAssertFalse(settings.contains(copied), "\(copied) recopie la loi à côté d'elle")
        }
    }

    // MARK: - La rangée de la voix dit ce qu'elle ouvre

    func test_voiceRow_withoutConsent_createsTheProfileInTheWizard() {
        let row = SettingsRowContent.of(.voiceProfile, voice: voiceState(consent: false))
        XCTAssertEqual(row?.sheet, .voiceProfileWizard)
        XCTAssertEqual(row?.icon, "plus.circle.fill")
    }

    func test_voiceRow_withConsent_managesTheProfile() {
        let row = SettingsRowContent.of(.voiceProfile, voice: voiceState(consent: true))
        XCTAssertEqual(row?.sheet, .voiceProfileManage(opensWizardWhenEmpty: false))
        XCTAssertEqual(row?.icon, "waveform.circle.fill")
    }

    func test_voiceRow_titlesDiffer_soTheLabelSaysWhichSheetOpens() {
        let create = SettingsRowContent.of(.voiceProfile, voice: voiceState(consent: false))?.title
        let manage = SettingsRowContent.of(.voiceProfile, voice: voiceState(consent: true))?.title
        XCTAssertNotNil(create)
        XCTAssertNotEqual(create, manage)
    }

    // MARK: - Le pli des annexes

    func test_unfoldsAnnex_onlyForAnAnnexDestination() {
        XCTAssertTrue(SettingsLayout.unfoldsAnnex(toReach: .storage))
        XCTAssertTrue(SettingsLayout.unfoldsAnnex(toReach: .readingModes))
        XCTAssertFalse(SettingsLayout.unfoldsAnnex(toReach: .privacy))
        XCTAssertFalse(SettingsLayout.unfoldsAnnex(toReach: .deleteAccount))
    }

    func test_annexSummary_namesTheFourFoldedBlocks() {
        XCTAssertEqual(SettingsLayout.annexSummary,
                       SettingsLayout.blocks(in: .annex).compactMap(\.id.title).joined(separator: " · "))
        XCTAssertEqual(SettingsLayout.blocks(in: .annex).compactMap(\.id.title).count, 4)
    }

    func test_blockAnchors_areDistinct_andKeepTheInviteAnchors() {
        let anchors = SettingsLayout.blocks.map(\.id.anchor)
        XCTAssertEqual(anchors.count, Set(anchors).count)
        XCTAssertEqual(SettingsBlockID.account.anchor, "settings.section.account")
        XCTAssertEqual(SettingsBlockID.voice.anchor, "settings.section.voice")
        XCTAssertEqual(SettingsBlockID.transcription.anchor, "settings.section.transcription")
    }
}
