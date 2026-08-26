import SwiftUI

/// Interrupteur d'extraction de son — opt-in de l'auteur sur SON post :
/// autoriser d'autres personnes à réutiliser la bande-son des vidéos de CE
/// post/réel dans leurs propres publications.
///
/// Formulé à l'ENDROIT et nomme la CONSÉQUENCE, pas le champ technique — même
/// patron que `ClipInspector.duckingToggle` (libellé positif + légende qui dit
/// ce qui se passe si on active). Défaut CONSERVATEUR tenu par
/// `MediaAccessibilityStore.allowsSoundExtraction()` (`false`) : cette vue ne
/// fait qu'afficher/relayer l'état, elle ne choisit pas le défaut. UN SEUL
/// interrupteur pour tout le post (`Post.allowSoundExtraction`,
/// `schema.prisma:3125`), jamais un par média — voir
/// `ComposerToolPanelHost.mediaPanel`, son unique point de montage.
struct SoundExtractionToggle: View {
    let isOn: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Toggle(isOn: Binding(get: { isOn }, set: { onChange($0) })) {
                Text(String(localized: "story.media.soundExtraction.label", defaultValue: "Autoriser la reprise du son", bundle: .module))
                    .font(.system(size: 12, weight: .medium))
            }
            .toggleStyle(.switch)
            .tint(MeeshyColors.indigo500)
            .accessibilityHint(String(localized: "story.media.soundExtraction.a11yHint", defaultValue: "D'autres personnes pourront réutiliser la bande-son des vidéos de ce post dans leurs propres publications.", bundle: .module))

            Text(String(localized: "story.media.soundExtraction.caption", defaultValue: "D'autres personnes pourront réutiliser la bande-son des vidéos de ce post.", bundle: .module))
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
