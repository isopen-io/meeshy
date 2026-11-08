import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le lecteur flottant d'une séance « ensemble » (#17097, iso `together-player.tsx`) : qui lit avec moi, le média, et
/// les commandes de l'APP — lecture, pause, déplacement — que `TogetherPlaybackDriver` relaie chez l'autre quand elles
/// changent l'état partagé. Quitter ferme la séance chez les deux.
struct TogetherPlayerCard: View {
    let session: TogetherSession
    let partnerName: String
    let clockOffsetMs: Double
    let onSync: (_ playing: Bool, _ positionMs: Double) -> Void
    let onLeave: () -> Void

    @StateObject private var surface = TogetherAVSurface()
    @State private var driver: TogetherPlaybackDriver?
    @State private var scrubbingMs: Double?
    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            header
            media
            if surface.phase == .ready { controls }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(.regularMaterial))
        .frame(maxWidth: 440)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.md)
        .accessibilityElement(children: .contain)
        .task(id: session.sessionId) { await start() }
        .adaptiveOnChange(of: session.playback) { _, playback in
            driver?.apply(playback, clockOffsetMs: clockOffsetMs)
        }
        .onDisappear { surface.stop() }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: session.started.media == .video ? "play.rectangle.fill" : "headphones")
                .foregroundStyle(MeeshyColors.brandPrimary)
                .accessibilityHidden(true)
            Text(TogetherWording.with(name: partnerName))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(1)
            Spacer(minLength: MeeshySpacing.sm)
            Button(action: onLeave) {
                Text(TogetherWording.leave)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            }
            .accessibilityIdentifier("together.leave")
        }
    }

    @ViewBuilder private var media: some View {
        switch surface.phase {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 60)
        case .unavailable:
            Text(TogetherWording.unavailable)
                .font(.footnote)
                .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
        case .ready:
            if session.started.media == .video, let player = surface.player {
                TogetherVideoLayer(player: player)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                    .accessibilityHidden(true)
            }
        }
    }

    private var controls: some View {
        HStack(spacing: MeeshySpacing.md) {
            Button {
                driver?.gesture(surface.playing ? .pause : .play)
            } label: {
                Image(systemName: surface.playing ? "pause.fill" : "play.fill")
                    .font(.title3)
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
            }
            .accessibilityLabel(surface.playing ? TogetherWording.pause : TogetherWording.play)
            .accessibilityIdentifier("together.playPause")
            Slider(
                value: Binding(get: { scrubbingMs ?? surface.progressMs }, set: { scrubbingMs = $0 }),
                in: 0...max(surface.durationMs, 1),
                onEditingChanged: { editing in
                    guard !editing, let target = scrubbingMs else { return }
                    scrubbingMs = nil
                    driver?.gesture(.seek(toMs: target))
                }
            )
            .tint(MeeshyColors.brandPrimary)
            .accessibilityLabel(TogetherWording.position)
        }
    }

    private func start() async {
        let driver = TogetherPlaybackDriver(surface: surface) { playing, positionMs in onSync(playing, positionMs) }
        self.driver = driver
        await surface.load(attachmentId: session.started.attachmentId)
        surface.onTick = { [weak driver] in driver?.tick() }
        driver.apply(session.playback, clockOffsetMs: clockOffsetMs)
    }
}
