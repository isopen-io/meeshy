import SwiftUI

/// Une option du choix : `id` porte la valeur, `title` le texte affiché,
/// `accessibilityLabel` remplace le titre quand celui-ci est une abréviation.
public struct MeeshySegmentedOption<ID: Hashable & Sendable>: Sendable, Identifiable {
    public let id: ID
    public let title: String
    public let accessibilityLabel: String?

    public init(id: ID, title: String, accessibilityLabel: String? = nil) {
        self.id = id
        self.title = title
        self.accessibilityLabel = accessibilityLabel
    }
}

public enum MeeshySegmentedRole: Sendable, Equatable {
    case choice
    case tabs
}

public enum MeeshySegmentedTone: Sendable, Equatable {
    case media
    case theme
}

/// Un choix exclusif entre deux à quatre options dans une même piste. Il ne porte
/// ni verre ni ombre : il se pose dans un hôte opaque ou de verre dense.
public struct MeeshySegmented<ID: Hashable & Sendable>: View {
    private let label: String
    private let selection: Binding<ID>
    private let options: [MeeshySegmentedOption<ID>]
    private let role: MeeshySegmentedRole
    private let tone: MeeshySegmentedTone
    private let pressed: ID?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Namespace private var pillSpace

    public init(
        _ label: String,
        selection: Binding<ID>,
        options: [MeeshySegmentedOption<ID>],
        role: MeeshySegmentedRole = .choice,
        tone: MeeshySegmentedTone = .media,
        pressed: ID? = nil
    ) {
        self.label = label
        self.selection = selection
        self.options = options
        self.role = role
        self.tone = tone
        self.pressed = pressed
    }

    public var body: some View {
        if MeeshySegmentedLaw.isRenderable(count: options.count) {
            track
        }
    }

    private var currentIndex: Int? {
        MeeshySegmentedLaw.currentIndex(selection: selection.wrappedValue, in: options.map(\.id))
    }

    private var isDark: Bool {
        colorScheme == .dark
    }

    private var track: some View {
        MeeshySegmentedLayout {
            ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                segment(option, index: index)
            }
        }
        .padding(MeeshySpacing.xs)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xl).fill(trackFill))
        .meeshyAnimation(MeeshyAnimation.springFast, value: currentIndex)
        .opacity(isEnabled ? 1 : 0.45)
        .accessibilityRepresentation {
            Picker(label, selection: selection) {
                ForEach(options) { option in
                    Text(option.accessibilityLabel ?? option.title).tag(option.id)
                }
            }
            .pickerStyle(.segmented)
            .disabled(!isEnabled)
        }
    }

    private func segment(_ option: MeeshySegmentedOption<ID>, index: Int) -> some View {
        let isCurrent = currentIndex == index
        return Button {
            choose(option, index: index)
        } label: {
            MeeshySegmentFace(
                title: option.title,
                ink: ink(isCurrent: isCurrent),
                pill: isCurrent ? pillFill : nil,
                pillSpace: pillSpace
            )
            .equatable()
        }
        .buttonStyle(MeeshySegmentButtonStyle(
            forcedPressed: pressed == option.id && !isCurrent,
            fill: pressedFill
        ))
        .accessibilityLabel(option.accessibilityLabel ?? option.title)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private func choose(_ option: MeeshySegmentedOption<ID>, index: Int) {
        guard MeeshySegmentedLaw.changes(from: currentIndex, to: index) else { return }
        selection.wrappedValue = option.id
        HapticFeedback.light()
    }

    private func ink(isCurrent: Bool) -> Color {
        switch (tone, isCurrent) {
        case (.media, true): return MeeshyColors.indigo950
        case (.media, false): return MeeshyColors.onMedia
        case (.theme, true): return MeeshyColors.backgroundPrimary(isDark: isDark)
        case (.theme, false): return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    private var pillFill: Color {
        switch tone {
        case .media: return MeeshyColors.onMedia
        case .theme: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    private var trackFill: Color {
        switch tone {
        case .media: return MeeshyColors.controlFill(isDark: true)
        case .theme: return MeeshyColors.controlFill(isDark: isDark)
        }
    }

    private var pressedFill: Color {
        switch tone {
        case .media: return MeeshyColors.mediaFill
        case .theme: return MeeshyColors.controlFill(isDark: isDark)
        }
    }
}

/// Le texte d'un segment et, pour le courant, la pastille qui glisse : une vue
/// feuille, égale à elle-même tant que ses paramètres ne bougent pas.
private struct MeeshySegmentFace: View, Equatable {
    let title: String
    let ink: Color
    let pill: Color?
    let pillSpace: Namespace.ID

    static func == (lhs: MeeshySegmentFace, rhs: MeeshySegmentFace) -> Bool {
        lhs.title == rhs.title && lhs.ink == rhs.ink && lhs.pill == rhs.pill
    }

    var body: some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .frame(minHeight: MeeshyControlSize.regular)
            .background {
                if let pill {
                    Capsule()
                        .fill(pill)
                        .matchedGeometryEffect(id: "pill", in: pillSpace)
                }
            }
            .contentShape(Capsule())
    }
}

private struct MeeshySegmentButtonStyle: ButtonStyle {
    let forcedPressed: Bool
    let fill: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                Capsule()
                    .fill(fill)
                    .opacity(configuration.isPressed || forcedPressed ? 1 : 0)
            }
    }
}

/// La répartition de la planche : parts égales, plancher au texte, repli en
/// rangées. Les mesures viennent des segments ; l'ordre suit la direction de lecture.
private struct MeeshySegmentedLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified) }
        let available = Double(proposal.width ?? ideal.reduce(0) { $0 + $1.width })
        let rows = MeeshySegmentedLaw.rows(widths: ideal.map { Double($0.width) }, available: available)
        let heights = rows.map { row in row.map { ideal[$0].height }.max() ?? 0 }
        let width = proposal.width ?? CGFloat(ideal.reduce(0) { $0 + Double($1.width) })
        return CGSize(width: width, height: heights.reduce(0, +))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified) }
        let widths = ideal.map { Double($0.width) }
        let rows = MeeshySegmentedLaw.rows(widths: widths, available: Double(bounds.width))
        let shares = MeeshySegmentedLaw.partition(widths: widths, available: Double(bounds.width))
        let isRTL = subviews.layoutDirection == .rightToLeft
        rows.indices.reduce(bounds.minY) { top, rowIndex in
            let row = rows[rowIndex]
            let height = row.map { ideal[$0].height }.max() ?? 0
            let start = isRTL ? bounds.maxX : bounds.minX
            row.indices.reduce(start) { x, position in
                let index = row[position]
                let share = CGFloat(shares[rowIndex][position])
                let originX = isRTL ? x - share : x
                subviews[index].place(
                    at: CGPoint(x: originX, y: top),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(width: share, height: height)
                )
                return isRTL ? x - share : x + share
            }
            return top + height
        }
    }
}
