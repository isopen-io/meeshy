import SwiftUI
import MeeshyUI

/// **LES DÉCLINAISONS D'UN CADRE, DANS SA VIGNETTE** (#12685) — sur le cadre choisi, un glissement
/// vertical passe d'une déclinaison à l'autre (sa version de base, sa version « Relief »…). Le
/// défilement par pages du système suit le doigt et s'annule tant qu'il n'a pas franchi la page
/// (directive des gestes progressifs) ; gauche/droite reste au carrousel. Des points sur le bord
/// disent combien de déclinaisons, et laquelle est posée.
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
            CallModeThumbnail(image: thumbnail(selected), symbol: symbol, isSelected: isSelected)
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
