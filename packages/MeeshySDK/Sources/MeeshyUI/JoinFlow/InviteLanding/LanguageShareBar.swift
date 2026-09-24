import SwiftUI
import MeeshySDK

/// Une barre de proportions par langue, et sa légende — chaque langue écrite
/// dans SA langue (« 한국어 », « العربية »). Partagée par la page
/// d'invitation (#7795) et la fiche du lien (#7797).
///
/// Une légende ne montre un pourcentage que si la part est MESURÉE : l'aperçu
/// public ne sert que la liste des langues parlées, et une barre à parts
/// égales qui afficherait « 25 % » affirmerait un décompte que personne n'a
/// fait.
public struct LanguageShareBar: View {
    let shares: [LanguageShare]
    let isDark: Bool

    private static let maxSegments = 6

    public init(shares: [LanguageShare], isDark: Bool) {
        self.shares = shares
        self.isDark = isDark
    }

    private var visible: [LanguageShare] {
        guard shares.count > Self.maxSegments else { return shares }
        let head = Array(shares.prefix(Self.maxSegments - 1))
        let rest = shares.dropFirst(Self.maxSegments - 1).reduce(0) { $0 + $1.fraction }
        let measured = shares.allSatisfy(\.isMeasured)
        return head + [LanguageShare(code: "", fraction: rest, isMeasured: measured)]
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            bar
            legend
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var bar: some View {
        GeometryReader { proxy in
            let spacing: CGFloat = 2
            let usable = max(0, proxy.size.width - spacing * CGFloat(max(0, visible.count - 1)))
            HStack(spacing: spacing) {
                ForEach(Array(visible.enumerated()), id: \.offset) { _, share in
                    Rectangle()
                        .fill(color(for: share))
                        .frame(width: max(2, usable * share.fraction))
                }
            }
        }
        .frame(height: 10)
        .clipShape(Capsule())
    }

    private var legend: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: MeeshySpacing.md, alignment: .leading)],
                  alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(Array(visible.enumerated()), id: \.offset) { _, share in
                HStack(spacing: 6) {
                    Circle().fill(color(for: share)).frame(width: 8, height: 8)
                    Text(verbatim: label(for: share))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
        }
    }

    private func name(for share: LanguageShare) -> String {
        share.code.isEmpty ? "…" : LanguageData.autonym(for: share.code)
    }

    private func label(for share: LanguageShare) -> String {
        guard share.isMeasured else { return name(for: share) }
        return "\(name(for: share)) \(share.percent.formatted(.percent))"
    }

    private func color(for share: LanguageShare) -> Color {
        share.code.isEmpty ? MeeshyColors.neutral400 : Color(hex: LanguageData.colorHex(for: share.code))
    }

    private var accessibilitySummary: String {
        visible.map(label(for:)).joined(separator: ", ")
    }
}
