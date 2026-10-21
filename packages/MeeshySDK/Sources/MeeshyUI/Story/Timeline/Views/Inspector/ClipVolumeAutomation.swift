import SwiftUI
import MeeshySDK

/// Automation du volume : pose d'un point au playhead et liste des points
/// posés. C'est la SEULE surface d'édition de la courbe — la piste ne fait
/// que 52 pt et ses gestes servent déjà au déplacement et au rognage.
struct ClipVolumeAutomation: View {
    /// Points déjà triés par instant (`ClipInspector.sortedVolumePoints`).
    let points: [ClipInspector.ClipSnapshot.VolumePoint]
    let playheadTime: Float
    let volume: Float
    let onAddVolumePoint: (Float) -> Void
    let onRemoveVolumePoint: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            Button {
                onAddVolumePoint(volume)
            } label: {
                Label(
                    String(format: String(localized: "story.timeline.inspector.volume.addPoint",
                                          defaultValue: "Point de volume à %@",
                                          bundle: .module),
                           ClipInspector.formatTime(seconds: playheadTime)),
                    systemImage: "plus.circle"
                )
                .font(.caption.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .tint(MeeshyColors.warning)
            .accessibilityHint(String(localized: "story.timeline.inspector.volume.addPoint.hint",
                                      defaultValue: "Fige le volume courant à la position de lecture",
                                      bundle: .module))

            if points.isEmpty {
                Text(String(localized: "story.timeline.inspector.volume.automation.caption",
                            defaultValue: "Sans point, le volume reste constant sur toute la durée du clip.",
                            bundle: .module))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(points) { point in
                    HStack(spacing: MeeshySpacing.sm) {
                        Text(ClipInspector.formatTime(seconds: point.absoluteTime))
                            .font(.system(.caption2, design: .monospaced))
                            .monospacedDigit()
                        Text(ClipInspector.formatGain(point.volume))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(MeeshyColors.warning)
                        Spacer(minLength: 0)
                        Button {
                            onRemoveVolumePoint(point.id)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .contentShape(Rectangle().inset(by: -8))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "story.timeline.inspector.volume.removePoint",
                                                   defaultValue: "Retirer ce point de volume",
                                                   bundle: .module))
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .padding(.top, MeeshySpacing.xs)
    }
}
