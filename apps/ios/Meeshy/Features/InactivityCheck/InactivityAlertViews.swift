import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le glyphe « sans activité » d'une personne (#18738) — feuille Equatable : elle ne reçoit que l'état servi. Pas
/// d'alerte : la vue n'existe alors pas.
struct InactivityAlertGlyph: View, Equatable {
    let state: InactivityAlertState
    let size: CGFloat

    var body: some View {
        Image(systemName: "person.fill.questionmark")
            .resizable()
            .scaledToFit()
            .foregroundStyle(MeeshyColors.error)
            .padding(size * 0.16)
            .frame(width: size, height: size)
            .background(Circle().fill(Color.black.opacity(0.55)))
            .accessibilityElement()
            .accessibilityLabel(InactivityCheckWording.spoken(state))
    }
}

/// L'alerte d'une personne, vivante : la valeur du cache tout de suite, puis chacun de ses changements.
enum InactivityAlertLiveState {
    /// Hors de tout acteur : `.values` demande hors du fil principal ; un maillon isolé au MainActor y piégerait l'app.
    nonisolated static func stream(
        of userId: String,
        in states: AnyPublisher<[String: InactivityAlertState], Never>
    ) -> AnyPublisher<InactivityAlertState?, Never> {
        states
            .map { @Sendable all in all[userId].flatMap { $0.isExpired(at: Date()) ? nil : $0 } }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    static func stream(of userId: String) -> AnyPublisher<InactivityAlertState?, Never> {
        stream(of: userId, in: InactivityAlertStateStore.shared.$states.eraseToAnyPublisher())
    }
}

/// Le glyphe posé au coin haut-droit d'un avatar d'en-tête (la batterie tient le haut-gauche, l'injoignable le
/// bas-gauche) : rien quand la personne va bien.
struct AvatarInactivityOverlay: ViewModifier {
    let userId: String?
    let avatarSize: CGFloat

    func body(content: Content) -> some View {
        content.overlay(alignment: .topTrailing) {
            if let userId, !userId.isEmpty {
                InactivityLiveGlyph(userId: userId, avatarSize: avatarSize)
                    .offset(x: avatarSize * 0.08, y: -avatarSize * 0.04)
                    .allowsHitTesting(false)
            }
        }
    }
}

private struct InactivityLiveGlyph: View {
    let userId: String
    let avatarSize: CGFloat
    @State private var state: InactivityAlertState?

    var body: some View {
        Group {
            if let state {
                InactivityAlertGlyph(state: state, size: max(12, avatarSize * 0.32)).equatable()
            }
        }
        .task(id: userId) {
            state = nil
            for await next in InactivityAlertLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}

/// Le détail d'une personne (fiche d'une conversation directe, profil) : « Aucune activité depuis 8:00 », la dernière
/// batterie et l'accès à la dernière position, seulement s'ils sont servis. Feuille Equatable.
struct InactivityAlertDetailCard: View, Equatable {
    let state: InactivityAlertState
    let now: Date
    let isDark: Bool
    let onOpenPosition: (URL) -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.state == rhs.state && lhs.now == rhs.now && lhs.isDark == rhs.isDark
    }

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            InactivityAlertGlyph(state: state, size: 22).equatable()
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(InactivityCheckWording.headline(state, now: now))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isDark ? Color.white : Color.primary)
                if let battery = InactivityCheckWording.battery(state) {
                    Text(battery)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let url = InactivityCheckWording.mapsURL(for: state) {
                    Button { onOpenPosition(url) } label: {
                        Label(InactivityCheckWording.lastPosition, systemImage: "map")
                            .font(.footnote.weight(.semibold))
                            .frame(minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(MeeshyColors.error)
                    .accessibilityIdentifier("inactivity.detail.position")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.error.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("inactivity.detail")
    }
}

/// Le détail vivant d'une personne : rien quand elle va bien, le cache tout de suite, puis chaque changement. Le libellé
/// de l'heure se rafraîchit chaque minute (le jour s'y ajoute passé minuit).
struct InactivityAlertDetailSection: View {
    let userId: String
    @State private var state: InactivityAlertState?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    var body: some View {
        Group {
            if let state {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    InactivityAlertDetailCard(state: state, now: context.date, isDark: colorScheme == .dark,
                                              onOpenPosition: { openURL($0) }).equatable()
                }
            }
        }
        .task(id: userId) {
            state = nil
            for await next in InactivityAlertLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}
