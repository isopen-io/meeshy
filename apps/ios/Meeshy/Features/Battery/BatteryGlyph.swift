import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'icône d'état de la batterie d'une personne (#14147) — feuille Equatable : elle ne reçoit que la phase et le
/// niveau servis. Pas d'état hors épisode : la vue n'existe alors pas.
struct BatteryGlyph: View, Equatable {
    let state: BatteryReaderState
    let size: CGFloat

    var body: some View {
        Image(systemName: BatteryAnnouncementWording.iconName(for: state))
            .resizable()
            .scaledToFit()
            .symbolRenderingMode(.palette)
            .foregroundStyle(Self.tint(for: state), Color.white.opacity(0.9))
            .padding(.horizontal, size * 0.18)
            .frame(width: size * 1.35, height: size * 0.62)
            .frame(height: size)
            .background(Capsule().fill(Color.black.opacity(0.55)))
            .accessibilityElement()
            .accessibilityLabel(BatteryAnnouncementWording.spoken(state))
    }

    static func tint(for state: BatteryReaderState) -> Color {
        switch state.phase {
        case .charging: return MeeshyColors.success
        case .critical, .off: return MeeshyColors.error
        case .low: return MeeshyColors.warning
        }
    }
}

/// L'état d'une personne, vivant : la valeur du cache tout de suite, puis chacun de ses changements.
enum BatteryLiveState {
    /// Hors de tout acteur (#17042) : `.values` demande hors du fil principal ; un maillon isolé au MainActor y
    /// piégerait l'app.
    nonisolated static func stream(
        of userId: String,
        in states: AnyPublisher<[String: BatteryReaderState], Never>
    ) -> AnyPublisher<BatteryReaderState?, Never> {
        states
            .map { @Sendable all in all[userId].flatMap { $0.isExpired(at: Date()) ? nil : $0 } }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    static func stream(of userId: String) -> AnyPublisher<BatteryReaderState?, Never> {
        stream(of: userId, in: BatteryStateStore.shared.$states.eraseToAnyPublisher())
    }
}

/// L'icône posée sur un avatar ou dans l'en-tête : rien hors épisode, l'icône dès que le cache la connaît.
struct BatteryLiveGlyph: View {
    let userId: String?
    let avatarSize: CGFloat
    @State private var state: BatteryReaderState?

    var body: some View {
        Group {
            if let state {
                BatteryGlyph(state: state, size: max(12, avatarSize * 0.3)).equatable()
            }
        }
        .task(id: userId) {
            state = nil
            guard let userId, !userId.isEmpty else { return }
            for await next in BatteryLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}

/// L'icône posée au coin haut d'un avatar, en élément à part pour que l'avatar garde son libellé.
struct AvatarBatteryOverlay: ViewModifier {
    let userId: String?
    let avatarSize: CGFloat

    func body(content: Content) -> some View {
        content.overlay(alignment: .topLeading) {
            if userId != nil {
                BatteryLiveGlyph(userId: userId, avatarSize: avatarSize)
                    .offset(x: -avatarSize * 0.08, y: -avatarSize * 0.04)
                    .allowsHitTesting(false)
            }
        }
    }
}
