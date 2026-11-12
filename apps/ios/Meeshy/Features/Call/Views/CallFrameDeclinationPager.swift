import SwiftUI
import MeeshyUI

/// **LES DÉCLINAISONS D'UN CADRE, DANS SA VIGNETTE** (#12685) — sur le cadre choisi, un glissement
/// vertical passe d'une déclinaison à l'autre (sa version de base, sa version « Relief »…). Le
/// défilement par pages du système suit le doigt et s'annule tant qu'il n'a pas franchi la page
/// (directive des gestes progressifs) ; gauche/droite reste au carrousel. Des points sur le bord
/// disent combien de déclinaisons, et laquelle est posée. Sous iOS 16, que le défilement par pages
/// ignore, un glissement vertical lu par `CallFrameDeclinationSwipe` fait le même geste.
struct CallFrameDeclinationPager: View {
    let ids: [String]
    let selected: String
    let isSelected: Bool
    let symbol: String
    let thumbnail: (String) -> CGImage?
    let onSelect: (String) -> Void

    var body: some View {
        ZStack(alignment: .trailing) {
            pages
            CallFrameDeclinationDots(count: ids.count, index: ids.firstIndex(of: selected) ?? 0)
                .padding(.trailing, MeeshySpacing.xxs)
        }
    }

    @ViewBuilder
    private var pages: some View {
        if #available(iOS 17.0, *) {
            CallFrameDeclinationPages(ids: ids, selected: selected, isSelected: isSelected, symbol: symbol, thumbnail: thumbnail, onSelect: onSelect)
        } else {
            CallFrameDeclinationDragPages(ids: ids, selected: selected, isSelected: isSelected, symbol: symbol, thumbnail: thumbnail, onSelect: onSelect)
        }
    }
}

/// **LA LOI DU GLISSEMENT VERTICAL** (#12685, C1.6) — pure : l'axe se lit au premier mouvement
/// (l'horizontal reste au carrousel), la page suit le doigt d'une page au plus et résiste aux
/// bords, et ne change qu'au franchissement d'un seuil ou d'un élan. Glisser vers le haut amène
/// la déclinaison suivante, comme le défilement par pages du chemin iOS 17.
enum CallFrameDeclinationSwipe {
    static let minimumDistance: CGFloat = 8
    private static let commitShare: CGFloat = 0.3
    private static let momentumShare: CGFloat = 0.6
    private static let edgeResistance: CGFloat = 0.3

    static func isVertical(_ translation: CGSize) -> Bool {
        abs(translation.height) > abs(translation.width)
    }

    static func followedOffset(index: Int, count: Int, translation: CGFloat, height: CGFloat) -> CGFloat {
        let hasNeighbour = translation < 0 ? index < count - 1 : index > 0
        guard hasNeighbour else { return translation * edgeResistance }
        return min(max(translation, -height), height)
    }

    static func target(index: Int, count: Int, translation: CGFloat, predictedEnd: CGFloat, height: CGFloat) -> Int {
        let commits = abs(translation) >= height * commitShare || abs(predictedEnd) >= height * momentumShare
        guard commits, translation != 0 else { return index }
        let next = index + (translation < 0 ? 1 : -1)
        return (0 ..< count).contains(next) ? next : index
    }
}

/// Chemin iOS 16 : trois pages au plus (la précédente, la posée, la suivante) portées par un
/// décalage — transformation seule, aucune image perdue pendant le geste. « Réduire les
/// animations » remplace le glissement par un fondu court.
private struct CallFrameDeclinationDragPages: View {
    let ids: [String]
    let selected: String
    let isSelected: Bool
    let symbol: String
    let thumbnail: (String) -> CGImage?
    let onSelect: (String) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drag: CGFloat = 0
    @State private var isVerticalDrag: Bool?

    private var index: Int { ids.firstIndex(of: selected) ?? 0 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if reduceMotion {
                    page(selected, size: geo.size).transition(.opacity).id(selected)
                } else {
                    ForEach(window, id: \.self) { id in
                        page(id, size: geo.size).offset(y: CGFloat(position(of: id) - index) * geo.size.height + drag)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
            .animation(reduceMotion ? .easeInOut(duration: 0.15) : .easeInOut(duration: 0.25), value: selected)
            .simultaneousGesture(swipe(height: geo.size.height))
        }
    }

    private func position(of id: String) -> Int { ids.firstIndex(of: id) ?? index }

    private var window: [String] {
        ids.indices.filter { abs($0 - index) <= 1 }.map { ids[$0] }
    }

    private func page(_ id: String, size: CGSize) -> some View {
        CallModeThumbnail(image: thumbnail(id), symbol: symbol, isSelected: isSelected)
            .frame(width: size.width, height: size.height)
    }

    private func swipe(height: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: CallFrameDeclinationSwipe.minimumDistance)
            .onChanged { value in
                if isVerticalDrag == nil { isVerticalDrag = CallFrameDeclinationSwipe.isVertical(value.translation) }
                guard isVerticalDrag == true, !reduceMotion else { return }
                drag = CallFrameDeclinationSwipe.followedOffset(index: index, count: ids.count, translation: value.translation.height, height: height)
            }
            .onEnded { value in
                defer { isVerticalDrag = nil }
                guard isVerticalDrag == true else { return }
                let next = CallFrameDeclinationSwipe.target(index: index, count: ids.count, translation: value.translation.height,
                                                            predictedEnd: value.predictedEndTranslation.height, height: height)
                if next != index { HapticFeedback.light() }
                withAnimation(reduceMotion ? nil : .interactiveSpring(response: 0.3, dampingFraction: 0.85)) {
                    drag = 0
                    if next != index { onSelect(ids[next]) }
                }
            }
    }
}

@available(iOS 17.0, *)
private struct CallFrameDeclinationPages: View {
    let ids: [String]
    let selected: String
    let isSelected: Bool
    let symbol: String
    let thumbnail: (String) -> CGImage?
    let onSelect: (String) -> Void

    @State private var position: String?

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(ids, id: \.self) { id in
                        CallModeThumbnail(image: thumbnail(id), symbol: symbol, isSelected: isSelected)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .id(id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $position)
        }
        .onAppear { position = selected }
        .onChange(of: selected) { _, newValue in
            guard position != newValue else { return }
            position = newValue
        }
        .onChange(of: position) { _, newValue in
            guard let newValue, newValue != selected else { return }
            HapticFeedback.light()
            onSelect(newValue)
        }
    }
}

private struct CallFrameDeclinationDots: View {
    let count: Int
    let index: Int

    var body: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            ForEach(0 ..< count, id: \.self) { dot in
                Circle()
                    .fill(Color.white.opacity(dot == index ? 1 : MeeshyOpacity.medium))
                    .frame(width: 4, height: 4)
            }
        }
        .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 1)
        .accessibilityHidden(true)
    }
}
