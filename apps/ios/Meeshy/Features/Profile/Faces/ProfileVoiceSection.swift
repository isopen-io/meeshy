import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que l'édition règle dans « Ma voix » (planche `Moi-Edition`, #19512) : le brouillon « public », et la porte de
/// l'enregistrement.
struct ProfileVoiceEditing {
    let isPublic: Binding<Bool>
    let onRecord: () -> Void
}

/// « Ma voix » sur la Vitrine (planche `Main`) : le titre, la pastille qui dit si l'échantillon est public, et le lecteur
/// d'onde du kit (K35) qui LIT vraiment `voiceSampleUrl`. Le lecteur ne joue rien lui-même : cette vue tient le moteur
/// (`AudioPlaybackManager`, inscrit au coordinateur pour qu'un seul son joue à la fois) et l'arrête en quittant l'écran.
/// En édition, l'interrupteur « Rendre mon échantillon public » (K06) et « Réenregistrer » suivent le lecteur.
struct ProfileVoiceSection: View {
    let sample: ProfileVoiceSample
    let accentColor: String
    var editing: ProfileVoiceEditing?

    @StateObject private var player = AudioPlaybackManager(registerWithCoordinator: true)

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileVoiceCopy.title, lead: { EmptyView() }, accessory: {
                MeeshyBadge(.label(isPublic ? ProfileVoiceCopy.publicBadge : ProfileVoiceCopy.privateBadge),
                            leading: .systemImage(isPublic ? "globe" : "lock"))
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
            if let editing {
                editControls(editing)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.voice")
        .onDisappear { player.stop() }
    }

    /// Le brouillon en édition, ce que je tiens sinon.
    private var isPublic: Bool {
        editing?.isPublic.wrappedValue ?? sample.isPublic
    }

    @ViewBuilder
    private func editControls(_ editing: ProfileVoiceEditing) -> some View {
        MeeshyToggleRow(ProfileVoiceCopy.publicToggle, subtitle: ProfileVoiceCopy.publicToggleHint,
                        accessory: .toggle(isOn: editing.isPublic.wrappedValue), tint: Color(hex: accentColor),
                        action: { editing.isPublic.wrappedValue.toggle() })
            .accessibilityIdentifier("profile.voice.public")
        MeeshyButton(ProfileVoiceCopy.rerecord, systemImage: "mic", kind: .tinted, size: .s44,
                     tint: Color(hex: accentColor), action: { editing.onRecord() })
            .accessibilityIdentifier("profile.voice.rerecord")
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

    static var publicToggle: String {
        String(localized: "profile.vitrine.voice.publicToggle", defaultValue: "Rendre mon échantillon public", bundle: .main)
    }

    static var publicToggleHint: String {
        String(localized: "profile.vitrine.voice.publicToggle.hint",
               defaultValue: "Tout le monde peut l'écouter sur ta vitrine.", bundle: .main)
    }

    static var rerecord: String {
        String(localized: "profile.vitrine.voice.rerecord", defaultValue: "Réenregistrer", bundle: .main)
    }

    static var record: String {
        String(localized: "profile.vitrine.voice.record", defaultValue: "Enregistrer ma voix", bundle: .main)
    }
}

/// « Ma voix » en édition, sans échantillon servi : le titre et de quoi en enregistrer un (#19512).
struct ProfileVoiceRecordPrompt: View {
    let accentColor: String
    let onRecord: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileVoiceCopy.title)
            MeeshyButton(ProfileVoiceCopy.record, systemImage: "mic", kind: .tinted, size: .s44,
                         tint: Color(hex: accentColor), action: { onRecord() })
                .accessibilityIdentifier("profile.voice.record")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
