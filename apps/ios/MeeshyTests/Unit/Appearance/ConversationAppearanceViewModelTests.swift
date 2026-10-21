import XCTest
import MeeshySDK
@testable import Meeshy

/// #10631 — le sélecteur est OPTIMISTE : le choix s'applique au toucher, le réseau
/// confirme, un refus rétablit l'état d'avant.
@MainActor
final class ConversationAppearanceViewModelTests: XCTestCase {

    private struct Refused: Error {}

    private func makeViewModel(id: String = UUID().uuidString, initial: ConversationAppearance? = nil, service: MockPreferenceService = MockPreferenceService()) -> (ConversationAppearanceViewModel, MockPreferenceService) {
        let suite = UserDefaults(suiteName: "appearance-vm-\(UUID().uuidString)")!
        return (ConversationAppearanceViewModel(conversationId: id, initial: initial, service: service, photoMemory: ConversationBackgroundPhotoMemory(defaults: suite)), service)
    }

    private func waitUntil(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<200 where !condition() { try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    func test_selectDesign_appliesAtOnce_andWritesTheAppearance() async {
        let (viewModel, service) = makeViewModel()
        viewModel.selectDesign(pack: "heritages", design: "zellige")

        XCTAssertEqual(viewModel.appearance.background, .design(pack: "heritages", design: "zellige"))
        await waitUntil { service.updateConversationPreferencesCallCount == 1 }
        XCTAssertEqual(service.lastUpdateConversationPreferencesRequest?.appearance?.background, .design(pack: "heritages", design: "zellige"))
        XCTAssertEqual(ConversationAppearanceChange.latest(for: viewModel.conversationId)?.background, .design(pack: "heritages", design: "zellige"))
    }

    func test_refusal_restoresThePreviousAppearance_andSaysSo() async {
        let service = MockPreferenceService()
        service.updateConversationPreferencesResult = .failure(Refused())
        let previous = ConversationAppearance(background: .solid(color: "sable"))
        let (viewModel, _) = makeViewModel(initial: previous, service: service)

        viewModel.selectSolid(color: "azur")
        XCTAssertEqual(viewModel.appearance.background, .solid(color: "azur"), "le choix est optimiste")

        await waitUntil { viewModel.errorMessage != nil }
        XCTAssertEqual(viewModel.appearance, previous)
        XCTAssertNotNil(viewModel.errorMessage)
        XCTAssertEqual(ConversationAppearanceChange.latest(for: viewModel.conversationId), previous, "le fond ouvert revient aussi en arrière")
    }

    func test_choosingTheSameThingTwice_doesNotWrite() async {
        let (viewModel, service) = makeViewModel(initial: ConversationAppearance(background: .solid(color: "azur")))
        viewModel.selectSolid(color: "azur")
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(service.updateConversationPreferencesCallCount, 0)
    }

    func test_setAccent_keepsTheBackground_andNilMeansAutomatic() {
        let (viewModel, _) = makeViewModel(initial: ConversationAppearance(background: .solid(color: "azur"), accent: "corail"))
        viewModel.setAccent("lagon")
        XCTAssertEqual(viewModel.appearance.accent, "lagon")
        XCTAssertEqual(viewModel.appearance.background, .solid(color: "azur"))
        viewModel.setAccent(nil)
        XCTAssertNil(viewModel.appearance.accent)
    }

    func test_photoVeil_snapsToFiveHundredths_andIsCapped() {
        let (viewModel, _) = makeViewModel(initial: ConversationAppearance(background: .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.3, blur: 4)))
        viewModel.setPhotoVeil(0.47)
        XCTAssertEqual(viewModel.currentPhotoSettings?.veil ?? 0, 0.45, accuracy: 1e-9)
        viewModel.setPhotoVeil(5)
        XCTAssertEqual(viewModel.currentPhotoSettings?.veil ?? 0, 0.8, accuracy: 1e-9)
        viewModel.setPhotoBlur(99)
        XCTAssertEqual(viewModel.currentPhotoSettings?.blur, 24)
    }

    func test_photoVeil_onTheSameStep_doesNotWriteAgain() async {
        let (viewModel, service) = makeViewModel(initial: ConversationAppearance(background: .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.3, blur: 4)))
        // Un curseur rendu à sa place (retour arrière, écho) renvoie la valeur qu'il porte déjà, à l'arrondi près.
        viewModel.setPhotoVeil(0.30000000000000004)
        viewModel.setPhotoVeil(0.31)
        viewModel.setPhotoBlur(4)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(service.updateConversationPreferencesCallCount, 0)
        XCTAssertEqual(viewModel.currentPhotoSettings?.veil, 0.3)
    }

    func test_veilAndBlur_areIgnoredWhenTheBackgroundIsNotAPhoto() {
        let (viewModel, service) = makeViewModel()
        viewModel.setPhotoVeil(0.5)
        viewModel.setPhotoBlur(5)
        XCTAssertEqual(viewModel.appearance, .default)
        XCTAssertEqual(service.updateConversationPreferencesCallCount, 0)
    }

    func test_reset_returnsToSignature_andAdoptDoesNotWrite() async {
        let (viewModel, service) = makeViewModel(initial: ConversationAppearance(background: .solid(color: "azur"), accent: "corail"))
        viewModel.reset()
        XCTAssertEqual(viewModel.appearance, .default)
        await waitUntil { service.updateConversationPreferencesCallCount == 1 }

        viewModel.adopt(ConversationAppearance(background: .solid(color: "olive")))
        XCTAssertEqual(viewModel.appearance.background, .solid(color: "olive"))
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(service.updateConversationPreferencesCallCount, 1, "l'écho d'un autre appareil ne se réécrit pas")
    }

    func test_selectPhoto_remembersItsSourceOnThisDevice() {
        let suite = UserDefaults(suiteName: "appearance-vm-\(UUID().uuidString)")!
        let memory = ConversationBackgroundPhotoMemory(defaults: suite)
        let viewModel = ConversationAppearanceViewModel(conversationId: UUID().uuidString, initial: nil, service: MockPreferenceService(), photoMemory: memory)
        let photo = ConversationBackgroundPhoto(thumbnailUrl: "t", fullUrl: "f", thumbHash: nil)
        viewModel.selectPhoto(attachmentId: "64b7f0c2a1b2c3d4e5f60718", photo: photo)
        XCTAssertEqual(memory.photo(for: "64b7f0c2a1b2c3d4e5f60718"), photo)
        XCTAssertEqual(viewModel.currentPhotoSettings?.veil ?? 0, 0.3, accuracy: 1e-9)
    }

    func test_setAccent_repaintsTheListRowInTheStore_withoutWaitingForTheEcho() async {
        let id = "conv-accent-\(UUID().uuidString)"
        await ConversationStore.shared.hydrate(MeeshyConversation(id: id, identifier: id, type: .group))
        let (viewModel, _) = makeViewModel(id: id)

        viewModel.setAccent("corail")

        var row = await ConversationStore.shared.conversation(id: id)
        for _ in 0..<200 where row?.userState.appearance?.accent != "corail" {
            try? await Task.sleep(nanoseconds: 10_000_000)
            row = await ConversationStore.shared.conversation(id: id)
        }
        XCTAssertEqual(row?.displayPalette(scheme: .light).primary, "E0604E")
    }
}
