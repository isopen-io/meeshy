import SwiftUI
import MeeshySDK
import MeeshyUI

/// « En appel » sur la fiche d'un Sang (#18753) : MON partage avec lui — « Montrer quand je suis en appel ». Accordé
/// par défaut entre Sangs et dans l'équipe, retirable ; posé tout de suite, rendu à l'échec.
@MainActor
final class ProfilePhoneCallViewModel: ObservableObject {

    let userId: String
    @Published private(set) var settings: PhoneCallPersonSettings?
    @Published var notice: String?

    private let service: PhoneCallServiceProviding

    nonisolated deinit {}

    init(userId: String, service: PhoneCallServiceProviding) {
        self.userId = userId
        self.service = service
    }

    func load() async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        settings = served
    }

    func setShared(_ shared: Bool) async {
        let previous = settings
        settings = PhoneCallPersonSettings(userId: userId, isShared: shared)
        do {
            settings = try await service.updatePersonSettings(userId: userId, isShared: shared)
        } catch {
            settings = previous
            notice = PhoneCallWording.saveFailed
        }
    }
}

struct ProfilePhoneCallRow: View {
    @StateObject private var viewModel: ProfilePhoneCallViewModel
    let tint: Color

    init(userId: String, tint: Color = MeeshyColors.indigo500) {
        _viewModel = StateObject(wrappedValue: ProfilePhoneCallViewModel(
            userId: userId, service: PhoneCallService.shared
        ))
        self.tint = tint
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if let settings = viewModel.settings {
                MeeshyToggleRow(PhoneCallWording.shareTitle, systemImage: PhoneCallWording.stateIconName,
                                accessory: .toggle(isOn: settings.isShared), tint: tint) {
                    Task { await viewModel.setShared(!settings.isShared) }
                }
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
                .accessibilityHint(PhoneCallWording.shareFootnote)
                .accessibilityIdentifier("phoneCall.share.person")
            }
        }
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }
}
