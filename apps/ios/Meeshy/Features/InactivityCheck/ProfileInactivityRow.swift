import SwiftUI
import MeeshySDK
import MeeshyUI

/// La vérification d'inactivité sur la fiche d'un Sang (#18738) : MON partage avec lui — « Prévenir si je ne réponds
/// pas ». Accordé par défaut entre Sangs, retirable ; posé tout de suite, rendu à l'échec.
@MainActor
final class ProfileInactivityViewModel: ObservableObject {

    let userId: String
    @Published private(set) var settings: InactivityPersonSettings?
    @Published var notice: String?

    private let service: InactivityCheckServiceProviding

    nonisolated deinit {}

    init(userId: String, service: InactivityCheckServiceProviding) {
        self.userId = userId
        self.service = service
    }

    func load() async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        settings = served
    }

    func setShared(_ shared: Bool) async {
        let previous = settings
        settings = InactivityPersonSettings(userId: userId, isShared: shared)
        do {
            settings = try await service.updatePersonSettings(userId: userId, isShared: shared)
        } catch {
            settings = previous
            notice = InactivityCheckWording.saveFailed
        }
    }
}

struct ProfileInactivityRow: View {
    @StateObject private var viewModel: ProfileInactivityViewModel
    let tint: Color

    init(userId: String, tint: Color = MeeshyColors.indigo500) {
        _viewModel = StateObject(wrappedValue: ProfileInactivityViewModel(
            userId: userId, service: InactivityCheckService.shared
        ))
        self.tint = tint
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            if let settings = viewModel.settings {
                MeeshyToggleRow(InactivityCheckWording.shareTitle, systemImage: "hand.wave",
                                accessory: .toggle(isOn: settings.isShared), tint: tint) {
                    Task { await viewModel.setShared(!settings.isShared) }
                }
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
                .accessibilityHint(InactivityCheckWording.shareFootnote)
                .accessibilityIdentifier("inactivity.share.person")
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
