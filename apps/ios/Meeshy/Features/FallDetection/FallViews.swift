import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le glyphe « chute détectée » d'une personne (#18748) — feuille Equatable : elle ne reçoit que l'état servi. Hors
/// épisode, la vue n'existe pas.
struct FallStateGlyph: View, Equatable {
    let state: FallState
    let size: CGFloat

    var body: some View {
        Image(systemName: FallDetectionWording.stateIconName)
            .resizable()
            .scaledToFit()
            .foregroundStyle(MeeshyColors.error)
            .padding(size * 0.16)
            .frame(width: size, height: size)
            .background(Circle().fill(Color.black.opacity(0.55)))
            .accessibilityElement()
            .accessibilityLabel(FallDetectionWording.spoken(state))
    }
}

/// La chute d'une personne, vivante : la valeur du cache tout de suite, puis chacun de ses changements ; un épisode
/// dont `expiresAt` est passé tombe à la minute suivante.
enum FallLiveState {
    /// Hors de tout acteur : `.values` demande hors du fil principal ; un maillon isolé au MainActor y piégerait l'app.
    nonisolated static func stream(
        of userId: String,
        in states: AnyPublisher<[String: FallState], Never>,
        ticks: AnyPublisher<Date, Never>
    ) -> AnyPublisher<FallState?, Never> {
        states.combineLatest(ticks.prepend(Date()))
            .map { @Sendable pair in pair.0[userId].flatMap { $0.isExpired(at: pair.1) ? nil : $0 } }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    static func stream(of userId: String) -> AnyPublisher<FallState?, Never> {
        stream(
            of: userId,
            in: FallStateStore.shared.$states.eraseToAnyPublisher(),
            ticks: Timer.publish(every: 60, on: .main, in: .common).autoconnect().eraseToAnyPublisher()
        )
    }
}

/// Le glyphe posé au coin bas-droit d'un avatar d'en-tête (la batterie tient le haut-gauche, l'injoignable le
/// bas-gauche, l'inactivité le haut-droit) : rien hors épisode.
struct AvatarFallOverlay: ViewModifier {
    let userId: String?
    let avatarSize: CGFloat

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottomTrailing) {
            if let userId, !userId.isEmpty {
                FallLiveGlyph(userId: userId, avatarSize: avatarSize)
                    .offset(x: avatarSize * 0.08, y: avatarSize * 0.04)
                    .allowsHitTesting(false)
            }
        }
    }
}

private struct FallLiveGlyph: View {
    let userId: String
    let avatarSize: CGFloat
    @State private var state: FallState?

    var body: some View {
        Group {
            if let state {
                FallStateGlyph(state: state, size: max(12, avatarSize * 0.32)).equatable()
            }
        }
        .task(id: userId) {
            state = nil
            for await next in FallLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}

/// Le détail d'une personne (fiche d'une conversation directe, profil) : « Chute détectée à 16:42 », la dernière
/// batterie et l'accès à la dernière position, seulement s'ils sont servis. Feuille Equatable.
struct FallDetailCard: View, Equatable {
    let state: FallState
    let now: Date
    let isDark: Bool

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            FallStateGlyph(state: state, size: 22).equatable()
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(FallDetectionWording.headline(state, now: now))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isDark ? Color.white : Color.primary)
                if let battery = FallDetectionWording.battery(state) {
                    Text(battery)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let url = FallDetectionWording.mapsURL(for: state) {
                    Link(destination: url) {
                        Label(FallDetectionWording.lastPosition, systemImage: "map")
                            .font(.footnote.weight(.semibold))
                            .frame(minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .foregroundStyle(MeeshyColors.error)
                    .accessibilityIdentifier("fall.detail.position")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.error.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("fall.detail")
    }
}

/// Le détail vivant d'une personne : rien hors épisode, le cache tout de suite, puis chaque changement.
struct FallDetailSection: View {
    let userId: String
    @State private var state: FallState?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let state {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    FallDetailCard(state: state, now: context.date, isDark: colorScheme == .dark).equatable()
                }
            }
        }
        .task(id: userId) {
            state = nil
            for await next in FallLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}

/// La bannière de l'ÉMETTEUR, app ouverte pendant un épisode qu'il a rapporté : « Une chute a été détectée — tout va
/// bien ? » et « Je vais bien ». Feuille sans singleton : elle ne reçoit que la réponse à donner. Une réponse qui
/// n'est pas partie se dit, et le bouton se réarme pour réessayer.
struct OwnFallBanner: View {
    let answer: @MainActor () async -> Bool
    @State private var isAnswering = false

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: FallDetectionWording.stateIconName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(MeeshyColors.error)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(FallDetectionWording.ownBannerTitle)
                    .font(.subheadline.weight(.semibold))
                Text(FallDetectionWording.ownBannerSubtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                isAnswering = true
                Task {
                    let sent = await answer()
                    isAnswering = false
                    if !sent { FeedbackToastManager.shared.showError(FallDetectionWording.imOkFailed) }
                }
            } label: {
                Text(FallDetectionWording.imOk)
                    .font(.subheadline.weight(.bold))
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .padding(.horizontal, MeeshySpacing.md)
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.success)
            .disabled(isAnswering)
            .accessibilityIdentifier("fall.own.ok")
        }
        .padding(MeeshySpacing.md)
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("fall.own.banner")
    }
}

/// Pose la bannière de l'émetteur en haut de l'app. Aucun `@ObservedObject` sur le centre (un overlay racine
/// re-rendrait toute l'app à chaque publication) : l'instant de l'épisode arrive en valeur, et la bannière TOMBE
/// d'elle-même à la fin de l'épisode (`episodeTtl`), sans attendre une autre publication.
struct OwnFallBannerOverlay: ViewModifier {
    let episodes: AnyPublisher<Date?, Never>
    let answer: @MainActor () async -> Bool
    @State private var detectedAt: Date?
    @State private var expired = false

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let expiresAt = OwnFallEpisode.expiry(of: detectedAt), !expired {
                    OwnFallBanner(answer: answer)
                        .padding(.top, MeeshySpacing.sm)
                        .task(id: expiresAt) {
                            do { try await Task.sleep(for: .seconds(max(0, expiresAt.timeIntervalSinceNow))) } catch { return }
                            expired = true
                        }
                }
            }
            .onReceive(episodes) { next in
                detectedAt = next
                expired = OwnFallEpisode.expiry(of: next).map { $0 <= Date() } ?? false
            }
    }
}

extension OwnFallBannerOverlay {
    /// Le câblage de production : l'épisode du centre, et sa réponse.
    static let live = OwnFallBannerOverlay(
        episodes: FallDetectionCenter.shared.$ownEpisodeDetectedAt.eraseToAnyPublisher(),
        answer: { await FallDetectionCenter.shared.answerOk() }
    )
}

/// La fin d'un épisode rapporté : `detectedAt + episodeTtl`, `nil` hors épisode.
enum OwnFallEpisode {
    static func expiry(of detectedAt: Date?) -> Date? {
        detectedAt.map { $0.addingTimeInterval(FallDetectionContract.episodeTtl) }
    }
}
