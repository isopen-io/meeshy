import SwiftUI
import MeeshySDK
import MeeshyUI

// #17341 — la capsule de droite de l'en-tête : vidéo « nom donné · durée », audio le
// réseau dégradé seul, groupe « nom · nombre · durée » (`CallHeaderCapsuleRule`).
// Une vue à elle, hors du type `CallView` : elle ne lit que ce qu'on lui remet.

extension CallView {
    @ViewBuilder
    var durationChip: some View {
        if let capsule = headerCapsule {
            CallHeaderCapsuleChip(
                capsule: capsule,
                signalStrength: signalStrength,
                isRemoteQualityDegraded: callManager.isRemoteQualityDegraded,
                isReconnecting: isCallReconnecting,
                videoDurationBadgeAccessibilityLabel: videoDurationBadgeAccessibilityLabel,
                callManager: callManager,
                showQualityDetail: $showQualityDetail
            )
        }
    }

    private var isCallReconnecting: Bool {
        if case .reconnecting = callManager.callState { return true }
        return false
    }
}

struct CallHeaderCapsuleChip: View {
    let capsule: CallHeaderCapsule
    let signalStrength: CallSignalStrength
    let isRemoteQualityDegraded: Bool
    let isReconnecting: Bool
    let videoDurationBadgeAccessibilityLabel: String
    /// Lu sous `CallDurationClock`, jamais observé : la durée se redessine à chaque
    /// seconde sans que la capsule ne se réévalue au moindre changement de l'appel.
    let callManager: CallManager
    @Binding var showQualityDetail: Bool

    var body: some View {
        Group {
            if capsule.showsDuration {
                CallDurationClock { chipContent() }
            } else {
                chipContent()
            }
        }
        .callQualityDetailTrigger(isPresented: $showQualityDetail)
    }

    private func chipContent() -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if capsule.showsDuration {
                TransientCallSignalGlyph(strength: signalStrength)
            } else {
                CallSignalGlyph(strength: signalStrength)
            }
            chipIdentity
            if capsule.showsDuration {
                Text(callManager.formattedDuration)
                    .font(.caption2.weight(.medium).monospacedDigit())
                    .foregroundStyle(Color.white)
                    .fixedSize()
            }
            chipWarnings
        }
        // Un seul élément VoiceOver : la phrase de `videoDurationBadgeAccessibilityLabel`.
        .accessibilityElement(children: .ignore)
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.xs)
        // Verre adaptatif à fond sombre (#8394) : lisible sur un flux clair.
        // #17323 — la capsule s'ouvre au toucher (détail de la qualité) :
        // un verre interactif, comme les boutons voisins.
        .modifier(CallInteractiveChromeCapsule())
        .clipShape(Capsule())
        .frame(height: 44)
        .accessibilityLabel(videoDurationBadgeAccessibilityLabel)
        .accessibilityValue(capsule.showsDuration ? callManager.spokenDuration : "")
        .accessibilityAddTraits(.updatesFrequently)
    }

    @ViewBuilder
    private var chipIdentity: some View {
        if let title = capsule.title {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.white)
                .lineLimit(1)
                .truncationMode(.tail)
            chipSeparator
        }
        if let count = capsule.participantCount {
            Image(systemName: "person.2.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color.white)
            Text(count, format: .number)
                .font(.caption2.weight(.medium).monospacedDigit())
                .foregroundStyle(Color.white)
                .fixedSize()
            chipSeparator
        }
    }

    /// En audio, la reconnexion a déjà sa pill sous l'avatar : la capsule ne la répète pas.
    @ViewBuilder
    private var chipWarnings: some View {
        if capsule.showsNetwork && isRemoteQualityDegraded {
            Image(systemName: "wifi.exclamationmark")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(MeeshyColors.warning)
        }
        if capsule.showsDuration && isReconnecting {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
        }
    }

    private var chipSeparator: some View {
        MetaSeparator()
            .font(.caption2.weight(.medium))
            .foregroundStyle(Color.white.opacity(MeeshyOpacity.heavy))
    }
}
