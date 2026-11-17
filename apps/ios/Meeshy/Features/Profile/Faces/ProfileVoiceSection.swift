import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Ma voix » sur la Vitrine (planche `Main`) : le titre, la pastille qui dit si l'échantillon est public, et le lecteur
/// d'onde du kit (K35) qui LIT vraiment `voiceSampleUrl`. Le lecteur ne joue rien lui-même : cette vue tient le moteur
/// (`AudioPlaybackManager`, inscrit au coordinateur pour qu'un seul son joue à la fois) et l'arrête en quittant l'écran.
struct ProfileVoiceSection: View {
    let sample: ProfileVoiceSample
    let accentColor: String

    @StateObject private var player = AudioPlaybackManager(registerWithCoordinator: true)

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileVoiceCopy.title, lead: { EmptyView() }, accessory: {
                MeeshyBadge(.label(sample.isPublic ? ProfileVoiceCopy.publicBadge : ProfileVoiceCopy.privateBadge),
                            leading: .systemImage(sample.isPublic ? "globe" : "lock"))
            })
            MeeshyWavePlayer(
                label: ProfileVoiceCopy.playerLabel,
                progress: player.progress,
                isPlaying: player.isPlaying,
                duration: sample.shownDuration(playerDuration: player.duration),
                tint: Color(hex: accentColor),
                phase: ProfileVoiceSample.phase(isLoading: player.isLoading),
                onToggle: { toggle() },
                onScrub: scrub
            )
            .padding(.vertical, MeeshySpacing.sm)
            .padding(.horizontal, MeeshySpacing.md)
            .background(ProfileSectionCard(tintHex: accentColor))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.voice")
        .onDisappear { player.stop() }
    }

    /// Le glissement n'existe qu'une fois l'échantillon chargé.
    private var scrub: ((Double) -> Void)? {
        guard sample.acceptsScrub(loadedURL: player.currentUrl) else { return nil }
        return { fraction in player.seek(to: fraction) }
    }

    private func toggle() {
        switch sample.toggle(loadedURL: player.currentUrl) {
        case .start(let url): player.play(urlString: url)
        case .pauseOrResume: player.togglePlayPause()
        }
    }
}

/// Les mots de « Ma voix ».
nonisolated enum ProfileVoiceCopy {

    static var title: String {
        String(localized: "profile.vitrine.voice.title", defaultValue: "Ma voix", bundle: .main)
    }

    /// Le nom du son, que le lecteur complète en « Lire … » / « Mettre en pause … ».
    static var playerLabel: String {
        String(localized: "profile.vitrine.voice.player", defaultValue: "l'échantillon de ma voix", bundle: .main)
    }

    static var publicBadge: String {
        String(localized: "profile.vitrine.voice.public", defaultValue: "Publique", bundle: .main)
    }

    static var privateBadge: String {
        String(localized: "profile.vitrine.voice.private", defaultValue: "Privée", bundle: .main)
    }
}
