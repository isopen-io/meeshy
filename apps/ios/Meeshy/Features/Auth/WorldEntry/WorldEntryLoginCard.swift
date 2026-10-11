import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// L'entrée World Wide que l'écran de connexion propose — ou ne propose pas.
///
/// La carte n'existe que si `GET /world` sert une entrée ouverte : un
/// `WORLD_UNAVAILABLE` (404) la retire, une panne réseau garde la dernière
/// entrée servie (le serveur reste juge à la jonction). La dernière entrée est
/// gardée en mémoire : l'écran remonté la montre avant le réseau.
@MainActor
final class WorldEntryCardModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée isolée (SE-0466) — voir
    // `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    @Published private(set) var entry: WorldEntry?

    private static var lastServed: WorldEntry?
    private let world: WorldEntryProviding

    init(world: WorldEntryProviding = WorldService.shared) {
        self.world = world
        self.entry = Self.lastServed
    }

    func refresh() async {
        do {
            let served = try await world.fetchWorldEntry()
            Self.lastServed = served
            entry = served
        } catch MeeshyError.server(let status, _) where status == 404 {
            Self.lastServed = nil
            entry = nil
        } catch {
            return
        }
    }
}

/// La carte « Entrer dans World Wide » en tête de l'écran de connexion
/// (planche « Login ») : sans compte, son nom et sa langue suffisent. Sous
/// elle, « ou avec votre compte » introduit les portes habituelles.
struct WorldEntryLoginCard: View {
    let entry: WorldEntry
    let isDark: Bool
    let onEnter: () -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            Button {
                HapticFeedback.light()
                onEnter()
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: "globe")
                        .font(MeeshyFont.relative(MeeshyFont.title3Size))
                        .foregroundColor(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(MeeshyColors.indigo500))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(WorldGuestEntryCopy.enterTitle(entry.title))
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .heavy))
                            .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                        Text(WorldGuestEntryCopy.cardSubtitle)
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo700)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo400)
                        .accessibilityHidden(true)
                }
                .padding(MeeshySpacing.mdPlus)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.indigo500.opacity(0.30), MeeshyColors.indigo500.opacity(0.12)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .strokeBorder(MeeshyColors.indigo500.opacity(0.40), lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)

            HStack(spacing: MeeshySpacing.smPlus) {
                divider
                Text(WorldGuestEntryCopy.withAccountDivider)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(MeeshyColors.indigo300.opacity(0.7))
                    .layoutPriority(1)
                divider
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(isDark ? Color.white.opacity(0.12) : MeeshyColors.indigo200)
            .frame(height: 0.5)
            .accessibilityHidden(true)
    }
}
