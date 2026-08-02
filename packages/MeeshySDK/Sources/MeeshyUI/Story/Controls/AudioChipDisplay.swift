import SwiftUI

/// Contenu de la chip audio, à droite de la note (reader ET preview).
///
/// Directive user 2026-08-02 : un son EMPRUNTÉ à la bibliothèque s'annonce —
/// façon crédit — par un défilement « titre · @pseudo » ; sans titre, le
/// @pseudo défile seul. La PREMIÈRE publication d'un son garde la sinusoïde,
/// même si la capture a versé ce son à la bibliothèque ensuite : le
/// discriminant est `soundId` (l'emprunt), jamais l'existence du son en
/// bibliothèque.
public nonisolated enum AudioChipDisplay: Equatable, Sendable {
    case waveform
    case marquee(text: String)

    public static func resolve(soundId: String?, title: String?, authorUsername: String?) -> AudioChipDisplay {
        guard soundId != nil else { return .waveform }
        let cleanTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let author = authorUsername?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .drop(while: { $0 == "@" })
        let authorTag = (author?.isEmpty == false) ? "@\(author!)" : nil
        switch (cleanTitle?.isEmpty == false ? cleanTitle : nil, authorTag) {
        case let (t?, a?): return .marquee(text: "\(t) · \(a)")
        case let (nil, a?): return .marquee(text: a)
        case let (t?, nil): return .marquee(text: t)
        case (nil, nil):   return .waveform
        }
    }
}

/// Défilement horizontal continu (crédit d'un son de bibliothèque), à la
/// place de la sinusoïde. Boucle sans couture : le texte est dupliqué et
/// l'offset repart quand une copie est entièrement sortie du cadre.
struct AudioChipMarquee: View {
    let text: String
    let paused: Bool

    @State private var textWidth: CGFloat = 0
    @State private var offset: CGFloat = 0

    private let gap: CGFloat = 24
    private let speed: CGFloat = 28   // points / seconde

    var body: some View {
        GeometryReader { geo in
            let fits = textWidth > 0 && textWidth <= geo.size.width
            Group {
                if fits {
                    label.frame(width: geo.size.width, alignment: .center)
                } else {
                    HStack(spacing: gap) {
                        label
                        label.accessibilityHidden(true)
                    }
                    .offset(x: offset)
                    .frame(width: geo.size.width, alignment: .leading)
                    .clipped()
                }
            }
            .adaptiveOnChange(of: textWidth) { _, width in
                restartScroll(width: width, fits: width <= geo.size.width)
            }
            .onAppear {
                restartScroll(width: textWidth, fits: fits)
            }
        }
        .frame(height: 18)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    private var label: some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(paused ? 0.5 : 0.92))
            .lineLimit(1)
            .fixedSize()
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: MarqueeWidthKey.self, value: g.size.width)
                }
            )
            .onPreferenceChange(MarqueeWidthKey.self) { textWidth = $0 }
    }

    private func restartScroll(width: CGFloat, fits: Bool) {
        guard width > 0, !fits, !paused else { offset = 0; return }
        let distance = width + gap
        offset = 0
        withAnimation(.linear(duration: distance / speed).repeatForever(autoreverses: false)) {
            offset = -distance
        }
    }
}

private struct MarqueeWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
