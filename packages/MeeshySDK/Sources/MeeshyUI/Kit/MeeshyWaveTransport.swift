import SwiftUI

/// **K35 `transport`** : relire autre chose qu'un son — un trajet, une chronologie.
/// Un disque lecture / pause (K02), la piste du kit (K05) et ses repères, l'heure
/// courante en chasse fixe, dans une capsule de verre (K01).
///
/// Agnostique : l'hôte tient la position (0…1), dit s'il joue, nomme les deux
/// gestes et donne l'heure à afficher. Glisser la piste met en pause : l'hôte le
/// reçoit par `onEditingChanged(true)`. Les repères sont décoratifs ; la valeur
/// dite de la piste est l'heure courante.
public struct MeeshyWaveTransport: View {
    private let trackLabel: String
    @Binding private var position: Double
    private let isPlaying: Bool
    private let playLabel: String
    private let pauseLabel: String
    private let timeText: String
    private let markers: [Double]
    private let tint: Color?
    private let tone: MeeshyGlassTone?
    private let onToggle: () -> Void
    private let onEditingChanged: ((Bool) -> Void)?

    @Environment(\.layoutDirection) private var layoutDirection

    public init(_ trackLabel: String,
                position: Binding<Double>,
                isPlaying: Bool,
                playLabel: String,
                pauseLabel: String,
                timeText: String,
                markers: [Double] = [],
                tint: Color? = nil,
                tone: MeeshyGlassTone? = nil,
                onToggle: @escaping () -> Void,
                onEditingChanged: ((Bool) -> Void)? = nil) {
        self.trackLabel = trackLabel
        _position = position
        self.isPlaying = isPlaying
        self.playLabel = playLabel
        self.pauseLabel = pauseLabel
        self.timeText = timeText
        self.markers = MeeshyWaveTransportRecipe.markers(markers)
        self.tint = tint
        self.tone = tone
        self.onToggle = onToggle
        self.onEditingChanged = onEditingChanged
    }

    public var body: some View {
        HStack(spacing: CGFloat(MeeshyWaveTransportRecipe.gap)) {
            MeeshyGlassButton(systemImage: MeeshyWaveTransportRecipe.glyph(isPlaying: isPlaying),
                              label: MeeshyWaveTransportRecipe.toggleLabel(isPlaying: isPlaying, play: playLabel,
                                                                           pause: pauseLabel),
                              kind: .active, size: .s44, tint: tint, action: onToggle)
            ZStack {
                markerLayer
                MeeshySliderTrack(trackLabel, value: $position, in: 0...1, valueText: timeText, tint: tint,
                                  onEditingChanged: onEditingChanged)
            }
            Text(verbatim: timeText)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold, design: .monospaced))
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
                .accessibilityHidden(true)
        }
        .padding(.leading, CGFloat(MeeshyWaveTransportRecipe.leadingInset))
        .padding(.trailing, CGFloat(MeeshyWaveTransportRecipe.trailingInset))
        .padding(.vertical, CGFloat(MeeshyWaveTransportRecipe.verticalInset))
        .meeshyGlass(in: Capsule(), tone: tone)
    }

    private var markerLayer: some View {
        GeometryReader { proxy in
            let width = Double(proxy.size.width)
            let isRTL = layoutDirection == .rightToLeft
            ForEach(markers, id: \.self) { fraction in
                Capsule()
                    .fill(.tertiary)
                    .frame(width: CGFloat(MeeshyWaveTransportRecipe.markerWidth),
                           height: CGFloat(MeeshyWaveTransportRecipe.markerHeight))
                    .position(x: CGFloat(MeeshyWaveTransportRecipe.markerCenter(
                                  fraction: fraction, width: width,
                                  inset: Double(MeeshyLabeledSliderRecipe.thumbInset), isRightToLeft: isRTL)),
                              y: proxy.size.height / 2)
            }
            .environment(\.layoutDirection, .leftToRight)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// **K35 `indicator`** : l'onde seule, sans lecture ni durée. Elle bat pendant que
/// l'hôte joue (`isLive`), se fige sous « Réduire les animations », et se tait pour
/// le lecteur d'écran sauf si l'hôte la nomme.
public struct MeeshyWaveIndicator: View {
    private let samples: [Float]
    private let bars: Int
    private let isLive: Bool
    private let label: String?
    private let tint: Color?

    public init(samples: [Float] = [],
                bars: Int = MeeshyWaveIndicatorRecipe.defaultBars,
                isLive: Bool,
                label: String? = nil,
                tint: Color? = nil) {
        self.samples = samples
        self.bars = MeeshyWaveIndicatorRecipe.bars(bars)
        self.isLive = isLive
        self.label = label
        self.tint = tint
    }

    public var body: some View {
        MeeshyWaveBars(samples: samples.isEmpty ? MeeshyWaveIndicatorRecipe.equalizerLevels(bars: bars) : samples,
                       progress: 1, isLive: isLive, tint: tint, height: MeeshyWaveIndicatorRecipe.height)
            .frame(width: CGFloat(MeeshyWaveIndicatorRecipe.width(bars: bars)))
            .modifier(MeeshyWaveIndicatorAccessibility(label: label))
    }
}

private struct MeeshyWaveIndicatorAccessibility: ViewModifier {
    let label: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let label {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(label))
        } else {
            content.accessibilityHidden(true)
        }
    }
}
