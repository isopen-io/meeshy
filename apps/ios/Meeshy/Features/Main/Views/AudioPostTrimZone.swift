import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Rognage

/// **La zone de rognage** — montée dès qu'une piste existe, quelle que soit
/// sa provenance : un enregistrement, un fichier, un son de bibliothèque.
struct AudioPostTrimZone: View {
    let acquisition: AudioTrackAcquisition
    let recordedURL: URL?
    let recordedDuration: TimeInterval
    @Binding var trimRange: ClosedRange<TimeInterval>
    let onRetry: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    @ViewBuilder
    var body: some View {
        // **Ce que la zone rend est une DÉCISION, prise ailleurs** (#4667) :
        // quatre cas exclusifs, éprouvables sans monter l'écran. Les conditions
        // écrites dans un `@ViewBuilder` ne s'interrogent qu'à la garde de
        // source, et une garde de source ne dit pas ce que l'auteur VOIT.
        switch AudioTrimSection.resolve(acquisition: acquisition,
                                        hasLocalTrack: recordedURL != nil,
                                        duration: recordedDuration) {
        case .hidden:
            EmptyView()
        case .loading:
            trimPlaceholder {
                HStack(spacing: MeeshySpacing.sm) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: MeeshyColors.indigo500))
                    Text(String(localized: "composer.audio.trim.loading",
                                defaultValue: "Chargement du son…", bundle: .main))
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                }
            }
        case .failed:
            trimPlaceholder {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(String(localized: "composer.audio.trim.load-failed",
                                defaultValue: "Le son n'a pas pu être chargé.", bundle: .main))
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(String(localized: "common.retry",
                                  defaultValue: "Réessayer", bundle: .main)) {
                        onRetry()
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
                }
            }
        case .trimmer:
            VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                trimHeader
                if let url = recordedURL {
                    MeeshyAudioTrimmer(
                        url: url,
                        duration: recordedDuration,
                        range: $trimRange,
                        tint: MeeshyColors.indigo500
                    )
                }
            }
        }
    }

    private var trimHeader: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: "scissors")
                .font(.caption.weight(.semibold))
                .accessibilityHidden(true)
            Text(String(localized: "composer.audio.trim.title",
                        defaultValue: "Rogner", bundle: .main))
                .font(.caption.weight(.semibold))
            Spacer()
            if acquisition == .direct {
                Text(Self.rangeLabel(trimRange))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(theme.textMuted)
            }
        }
        .foregroundStyle(theme.textSecondary)
    }

    /// **L'attente et l'échec occupent la MÊME place que les poignées.** Une
    /// zone qui apparaît d'un coup pousse tout ce qui la suit ; en réservant sa
    /// hauteur, le placement et le panneau de contenu ne sautent pas quand la
    /// piste arrive.
    @ViewBuilder
    private func trimPlaceholder<Contenu: View>(@ViewBuilder _ contenu: () -> Contenu) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            trimHeader
            contenu()
                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                .padding(.horizontal, MeeshySpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
                        .fill(theme.surface(tint: "C7D2FE"))
                )
        }
    }

    /// « 0:03 → 0:41 » — l'intervalle MONTRÉ.
    ///
    /// `LocalizedNumber.duration` et non un `String(format:)` : un format sans
    /// locale grave les chiffres LATINS, et un lecteur arabophone y lirait des
    /// chiffres qui ne sont pas les siens. VoiceOver, lui, lit la valeur PARLÉE
    /// que portent les poignées du composant — jamais cette horloge.
    private static func rangeLabel(_ range: ClosedRange<TimeInterval>) -> String {
        let debut = LocalizedNumber.duration(seconds: range.lowerBound)
        let fin = LocalizedNumber.duration(seconds: range.upperBound)
        return "\(debut) → \(fin)"
    }
}
