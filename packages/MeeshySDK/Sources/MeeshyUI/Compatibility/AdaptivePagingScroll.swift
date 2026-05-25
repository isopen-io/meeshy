import SwiftUI

// MARK: - Adaptive horizontal paging

/// Horizontal, page-snapping container.
///
/// iOS 17+ reproduces the existing `ScrollView(.horizontal)` + `LazyHStack` +
/// `containerRelativeFrame` + `scrollTargetBehavior(.paging)` + `scrollPosition`
/// stack verbatim — no rendering change on current OS versions.
///
/// iOS 16 falls back to a page-style `TabView`, which provides equivalent
/// snap paging and a bidirectional selection binding. Note that the `TabView`
/// fallback instantiates every page eagerly (no lazy loading, unlike the iOS 17
/// `LazyHStack`) — acceptable for the bounded media sets this is used with.
///
/// `currentPageID` is a two-way binding to the `id` of the visible page,
/// matching the call sites' `@State currentPageID: String?`.
public struct AdaptiveHorizontalPager<Item: Identifiable, Page: View>: View
where Item.ID == String {
    private let items: [Item]
    @Binding private var currentPageID: String?
    private let fillVertical: Bool
    private let carouselTransition: Bool
    private let page: (Int, Item) -> Page

    /// - Parameters:
    ///   - items: pages to display, in order.
    ///   - currentPageID: two-way binding to the visible page's `id`.
    ///   - fillVertical: when `true`, each page also fills the container
    ///     vertically (fullscreen pagers); when `false`, the caller fixes the
    ///     height (e.g. an in-bubble carousel).
    ///   - carouselTransition: when `true`, applies the scale/opacity/blur
    ///     scroll transition to non-centered pages (iOS 17 only).
    ///   - page: builds a page from its index and item.
    public init(
        items: [Item],
        currentPageID: Binding<String?>,
        fillVertical: Bool = true,
        carouselTransition: Bool = false,
        @ViewBuilder page: @escaping (Int, Item) -> Page
    ) {
        self.items = items
        self._currentPageID = currentPageID
        self.fillVertical = fillVertical
        self.carouselTransition = carouselTransition
        self.page = page
    }

    public var body: some View {
        if #available(iOS 17.0, *) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        modernPage(index: index, item: item)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentPageID)
        } else {
            TabView(selection: $currentPageID) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    page(index, item)
                        .tag(item.id as String?)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
    }

    @available(iOS 17.0, *)
    @ViewBuilder
    private func modernPage(index: Int, item: Item) -> some View {
        if fillVertical {
            page(index, item)
                .containerRelativeFrame(.horizontal)
                .containerRelativeFrame(.vertical)
        } else {
            page(index, item)
                .containerRelativeFrame(.horizontal)
                .adaptiveCarouselScrollTransition(enabled: carouselTransition)
        }
    }
}

// MARK: - Adaptive carousel scroll transition

public extension View {
    /// iOS 17+ applies the carousel scroll transition (non-centered pages
    /// shrink, fade and blur slightly). iOS 16: no-op — the transition is
    /// purely decorative and its absence does not affect paging.
    @ViewBuilder
    func adaptiveCarouselScrollTransition(enabled: Bool = true) -> some View {
        if enabled, #available(iOS 17.0, *) {
            scrollTransition(.animated(.spring(response: 0.4, dampingFraction: 0.86))) { content, phase in
                content
                    .scaleEffect(
                        x: phase.isIdentity ? 1 : 0.94,
                        y: phase.isIdentity ? 1 : 0.94
                    )
                    .opacity(phase.isIdentity ? 1 : 0.6)
                    .blur(radius: phase.isIdentity ? 0 : 1.5)
            }
        } else {
            self
        }
    }
}
