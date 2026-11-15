import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le glyphe « téléphone injoignable » d'une personne (#18737) — feuille Equatable : elle ne reçoit que l'état servi.
/// Pas d'état quand le téléphone répond : la vue n'existe alors pas.
struct PhoneReachabilityGlyph: View, Equatable {
    let state: PhoneReachabilityState
    let size: CGFloat

    var body: some View {
        Image(systemName: "iphone.slash")
            .resizable()
            .scaledToFit()
            .foregroundStyle(MeeshyColors.warning)
            .padding(size * 0.16)
            .frame(width: size, height: size)
            .background(Circle().fill(Color.black.opacity(0.55)))
            .accessibilityElement()
            .accessibilityLabel(PhoneReachabilityWording.spoken(state))
    }
}

/// L'état d'une personne, vivant : la valeur du cache tout de suite, puis chacun de ses changements.
enum PhoneReachabilityLiveState {
    /// Hors de tout acteur (#17042) : `.values` demande hors du fil principal ; un maillon isolé au MainActor y
    /// piégerait l'app.
    nonisolated static func stream(
        of userId: String,
        in states: AnyPublisher<[String: PhoneReachabilityState], Never>
    ) -> AnyPublisher<PhoneReachabilityState?, Never> {
        states
            .map { @Sendable all in all[userId].flatMap { $0.isExpired(at: Date()) ? nil : $0 } }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    static func stream(of userId: String) -> AnyPublisher<PhoneReachabilityState?, Never> {
        stream(of: userId, in: PhoneReachabilityStateStore.shared.$states.eraseToAnyPublisher())
    }
}

/// Le glyphe posé sur un avatar ou dans l'en-tête : rien quand le téléphone répond, le glyphe dès que le cache le
/// connaît.
struct PhoneReachabilityLiveGlyph: View {
    let userId: String?
    let avatarSize: CGFloat
    @State private var state: PhoneReachabilityState?

    var body: some View {
        Group {
            if let state {
                PhoneReachabilityGlyph(state: state, size: max(12, avatarSize * 0.32)).equatable()
            }
        }
        .task(id: userId) {
            state = nil
            guard let userId, !userId.isEmpty else { return }
            for await next in PhoneReachabilityLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}

/// Le glyphe posé au coin bas-gauche d'un avatar (le haut-gauche porte la batterie), en élément à part pour que
/// l'avatar garde son libellé.
struct AvatarPhoneReachabilityOverlay: ViewModifier {
    let userId: String?
    let avatarSize: CGFloat

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottomLeading) {
            if userId != nil {
                PhoneReachabilityLiveGlyph(userId: userId, avatarSize: avatarSize)
                    .offset(x: -avatarSize * 0.08, y: avatarSize * 0.04)
                    .allowsHitTesting(false)
            }
        }
    }
}

/// Le détail d'une personne (fiche d'une conversation directe, profil) : « Téléphone injoignable depuis 14:10 » et la
/// cause probable. Feuille Equatable : l'état servi et l'instant de rendu, rien d'autre.
struct PhoneReachabilityDetailCard: View, Equatable {
    let state: PhoneReachabilityState
    let now: Date
    let isDark: Bool

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            PhoneReachabilityGlyph(state: state, size: 22).equatable()
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(PhoneReachabilityWording.headline(state, now: now))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isDark ? Color.white : Color.primary)
                if let cause = PhoneReachabilityWording.cause(state.cause) {
                    Text(cause)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.warning.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("phoneReachability.detail")
    }
}

/// Le détail vivant d'une personne : rien quand son téléphone répond, le cache tout de suite, puis chaque changement.
/// Le libellé de l'heure se rafraîchit chaque minute (le jour s'y ajoute passé minuit).
struct PhoneReachabilityDetailSection: View {
    let userId: String
    @State private var state: PhoneReachabilityState?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let state {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    PhoneReachabilityDetailCard(state: state, now: context.date, isDark: colorScheme == .dark).equatable()
                }
            }
        }
        .task(id: userId) {
            state = nil
            for await next in PhoneReachabilityLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}
