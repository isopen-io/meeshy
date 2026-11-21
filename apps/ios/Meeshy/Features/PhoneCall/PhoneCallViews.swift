import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le glyphe « en appel » d'une personne (#18753) — feuille Equatable : l'état servi et l'instant, rien d'autre. Hors
/// appel la vue n'existe pas. Jamais d'interlocuteur.
struct PhoneCallGlyph: View, Equatable {
    let state: PhoneCallState
    let size: CGFloat
    let now: Date

    var body: some View {
        Image(systemName: PhoneCallWording.stateIconName)
            .resizable()
            .scaledToFit()
            .foregroundStyle(MeeshyColors.success)
            .padding(size * 0.2)
            .frame(width: size, height: size)
            .background(Circle().fill(Color.black.opacity(0.55)))
            .accessibilityElement()
            .accessibilityLabel(PhoneCallWording.headline(state, now: now))
    }
}

/// L'état d'une personne, vivant : la valeur du cache tout de suite, puis chacun de ses changements.
enum PhoneCallLiveState {
    /// Hors de tout acteur (#17042) : `.values` demande hors du fil principal ; un maillon isolé au MainActor y
    /// piégerait l'app.
    nonisolated static func stream(
        of userId: String,
        in states: AnyPublisher<[String: PhoneCallState], Never>
    ) -> AnyPublisher<PhoneCallState?, Never> {
        states
            .map { @Sendable all in all[userId].flatMap { $0.isExpired(at: Date()) ? nil : $0 } }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    static func stream(of userId: String) -> AnyPublisher<PhoneCallState?, Never> {
        stream(of: userId, in: PhoneCallStateStore.shared.$states.eraseToAnyPublisher())
    }
}

/// Le glyphe posé au coin bas-droit d'un avatar d'en-tête (la batterie tient le haut-gauche, l'injoignable le
/// bas-gauche, l'inactivité le haut-droit), en élément à part pour que l'avatar garde son libellé. Il disparaît de
/// lui-même à `expiresAt`, même sans `phone-call:ended`.
struct AvatarPhoneCallOverlay: ViewModifier {
    let userId: String?
    let avatarSize: CGFloat

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottomTrailing) {
            if let userId, !userId.isEmpty {
                PhoneCallLiveGlyph(userId: userId, avatarSize: avatarSize)
                    .offset(x: avatarSize * 0.08, y: avatarSize * 0.04)
                    .allowsHitTesting(false)
            }
        }
    }
}

private struct PhoneCallLiveGlyph: View {
    let userId: String
    let avatarSize: CGFloat
    @State private var state: PhoneCallState?

    var body: some View {
        Group {
            if let state {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    if !state.isExpired(at: context.date) {
                        PhoneCallGlyph(state: state, size: max(12, avatarSize * 0.32), now: context.date).equatable()
                    }
                }
            }
        }
        .task(id: userId) {
            state = nil
            for await next in PhoneCallLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}

/// Le détail d'une personne (fiche d'une conversation directe, profil) : « En appel depuis 12 min ». Feuille Equatable.
struct PhoneCallDetailCard: View, Equatable {
    let state: PhoneCallState
    let now: Date
    let isDark: Bool

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            PhoneCallGlyph(state: state, size: 22, now: now).equatable()
                .accessibilityHidden(true)
            Text(PhoneCallWording.headline(state, now: now))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isDark ? Color.white : Color.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.success.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("phoneCall.detail")
    }
}

/// Le détail vivant d'une personne : rien hors appel, le cache tout de suite, puis chaque changement. Le libellé se
/// rafraîchit chaque minute, et l'état s'efface de lui-même passé `expiresAt`.
struct PhoneCallDetailSection: View {
    let userId: String
    @State private var state: PhoneCallState?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let state {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    if !state.isExpired(at: context.date) {
                        PhoneCallDetailCard(state: state, now: context.date, isDark: colorScheme == .dark).equatable()
                    }
                }
            }
        }
        .task(id: userId) {
            state = nil
            for await next in PhoneCallLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}
