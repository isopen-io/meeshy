import XCTest
import MeeshySDK
@testable import Meeshy

/// #16418 — chaque indicateur de consentement vocal mène à la configuration de
/// la voix, par UNE loi de destination.
@MainActor
final class VoiceSetupDestinationTests: XCTestCase {

    private func state(consent: Bool, transcription: Bool = true) -> VoiceSetupState {
        VoiceSetupState(voiceConsentGranted: consent, transcriptionEnabled: transcription)
    }

    // MARK: - Ce qui manque, lu dans le refus de la passerelle

    func test_gap_transcriptionRefusal_isTranscription() {
        XCTAssertEqual(VoiceSetupGap(consentCode: "AUDIO_TRANSCRIPTION_NOT_ENABLED"), .transcription)
    }

    func test_gap_translationOrCloningRefusal_isVoice() {
        XCTAssertEqual(VoiceSetupGap(consentCode: "AUDIO_TRANSLATION_NOT_ENABLED"), .voice)
        XCTAssertEqual(VoiceSetupGap(consentCode: "VOICE_CLONING_NOT_ENABLED"), .voice)
        XCTAssertEqual(VoiceSetupGap(consentCode: nil), .voice)
    }

    // MARK: - La loi

    func test_resolve_withoutVoiceConsent_opensTheWizard() {
        XCTAssertEqual(VoiceSetupDestination.resolve(.voice, state: state(consent: false)), .createProfile)
    }

    func test_resolve_withoutVoiceConsent_transcriptionGap_stillOpensTheWizardFirst() {
        XCTAssertEqual(VoiceSetupDestination.resolve(.transcription, state: state(consent: false, transcription: false)), .createProfile)
    }

    func test_resolve_withVoiceConsent_opensTheProfileManagement() {
        XCTAssertEqual(VoiceSetupDestination.resolve(.voice, state: state(consent: true)), .manageProfile)
    }

    func test_resolve_withVoiceConsent_transcriptionGap_opensTranscription() {
        XCTAssertEqual(VoiceSetupDestination.resolve(.transcription, state: state(consent: true, transcription: false)), .transcription)
    }

    // MARK: - Les Réglages ouvrent la destination d'eux-mêmes

    func test_destination_focusesTheSettingThatOpensItsSheet() {
        XCTAssertEqual(VoiceSetupDestination.manageProfile.settingsFocus.opensSheet, .voiceProfileManage)
        XCTAssertEqual(VoiceSetupDestination.createProfile.settingsFocus.opensSheet, .voiceProfileWizard)
        XCTAssertNil(VoiceSetupDestination.transcription.settingsFocus.opensSheet)
    }

    func test_transcriptionFocus_anchorsTheTranscriptionSection() {
        XCTAssertEqual(SettingsFocus.transcription.settingsAnchor, "settings.section.transcription")
        XCTAssertFalse(SettingsFocus.transcription.opensSecurity)
        XCTAssertEqual(SettingsFocus.voiceProfileCreation.settingsAnchor, SettingsFocus.voiceProfile.settingsAnchor)
    }

    func test_launcher_requestsTheResolvedFocus_thenOpensSettings() {
        let focus = SettingsFocusRequest()
        var opened = 0

        VoiceSetupLauncher.open(.voice, state: state(consent: false), focus: focus) { opened += 1 }

        XCTAssertEqual(focus.pending, .voiceProfileCreation)
        XCTAssertEqual(opened, 1)
    }

    // MARK: - La gestion sans profil passe à l'assistant

    func test_manageView_opensWizard_onlyWhenRequestedAndLoadedWithoutProfile() {
        XCTAssertTrue(VoiceProfileManageView.opensWizard(requested: true, profile: nil, loadError: nil))
        XCTAssertFalse(VoiceProfileManageView.opensWizard(requested: false, profile: nil, loadError: nil))
        XCTAssertFalse(VoiceProfileManageView.opensWizard(requested: true, profile: nil, loadError: "offline"))
    }

    // MARK: - L'erreur de la vue Langue dit ce qui manque

    func test_audioFailure_consentRefusal_carriesItsGap() {
        let refusal = AttachmentConsentError(code: "AUDIO_TRANSCRIPTION_NOT_ENABLED", message: "Activez la transcription", requiredConsents: [])

        let failure = ConversationTranslationRequestFailure.audio(messageId: "m", language: "en", error: refusal)

        XCTAssertEqual(failure.consentGap, .transcription)
        XCTAssertEqual(failure.message, "Activez la transcription")
        XCTAssertEqual(failure.kind, .audio)
    }

    func test_audioFailure_otherError_isNotTouchable() {
        let failure = ConversationTranslationRequestFailure.audio(
            messageId: "m", language: "en", error: NSError(domain: "net", code: -1009)
        )

        XCTAssertNil(failure.consentGap)
    }

    // MARK: - Chaque indicateur passe par la loi (gardes de source)

    func test_indicators_routeThroughTheLauncher() throws {
        let notice = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/MessageListViewController+MessageCellHandlers.swift")
        XCTAssertTrue(notice.contains("VoiceSetupLauncher.open(.voice)"))
        let popup = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift")
        XCTAssertTrue(popup.contains("onConfigure: { VoiceSetupLauncher.open(.voice)"))
        let language = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift")
        XCTAssertTrue(language.contains("VoiceSetupDestination.resolve(gap"))
    }
}
