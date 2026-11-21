import SwiftUI
import MeeshySDK
import MeeshyUI

/// La chute détectée sur la fiche d'un Sang (#18748) : MON partage avec lui — « Prévenir si ma montre détecte une
/// chute ». Accordé par défaut entre Sangs une fois mon accord donné, retirable ; posé tout de suite, rendu à l'échec.
@MainActor
final class ProfileFallViewModel: ObservableObject {

    let userId: String
    @Published private(set) var settings: FallPersonSettings?
    @Published var notice: String?

    private let service: FallDetectionServiceProviding

    nonisolated deinit {}

    init(userId: String, service: FallDetectionServiceProviding) {
        self.userId = userId
        self.service = service
    }

    func load() async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        settings = served
    }

    func setShared(_ shared: Bool) async {
        let previous = settings
        settings = FallPersonSettings(userId: userId, isShared: shared)
        do {
            settings = try await service.updatePersonSettings(userId: userId, isShared: shared)
        } catch {
            settings = previous
            notice = FallDetectionWording.saveFailed
        }
    }
}

struct ProfileFallRow: View {
    @StateObject private var viewModel: ProfileFallViewModel
    let tint: Color

    init(userId: String, tint: Color = MeeshyColors.indigo500) {
        _viewModel = StateObject(wrappedValue: ProfileFallViewModel(
            userId: userId, service: FallDetectionService.shared
        ))
        self.tint = tint
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if let settings = viewModel.settings {
                MeeshyToggleRow(FallDetectionWording.shareTitle, systemImage: FallDetectionWording.stateIconName,
                                accessory: .toggle(isOn: settings.isShared), tint: tint) {
                    Task { await viewModel.setShared(!settings.isShared) }
                }
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
                .accessibilityHint(FallDetectionWording.shareFootnote)
                .accessibilityIdentifier("fall.share.person")
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
