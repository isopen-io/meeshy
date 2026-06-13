import SwiftUI

// MARK: - Adaptive vertical paging

/// Vertical, page-snapping container — the TikTok / Reels gesture: swipe up for
/// the next item, down for the previous. Companion to `AdaptiveHorizontalPager`.
///
/// iOS 17+ uses `ScrollView(.vertical)` + `LazyVStack` + `containerRelativeFrame`
/// + `scrollTargetBehavior(.paging)` + `scrollPosition(id:)`, so only the visible
/// page (and its immediate neighbours) is instantiated — important when each page
/// owns a video surface.
///
/// iOS 16 has no `scrollTargetBehavior`, so it falls back to a page-style
/// `TabView` rotated 90° (each page counter-rotated), the standard technique for
/// vertical paging on that release. The `TabView` fallback instantiates every
/// page eagerly; callers must therefore gate heavy per-page content (video
/// players) on an `isActive` flag derived from `currentPageID`.
///
/// `currentPageID` is a two-way binding to the `id` of the visible page,
/// matching the call sites' `@State currentPageID: String?`.
public struct AdaptiveVerticalPager<Item: Identifiable, Page: View>: View
where Item.ID == String {
    private let items: [Item]
    @Binding private var currentPageID: String?
    private let page: (Int, Item) -> Page

    /// - Parameters:
    ///   - items: pages to display, in order.
    ///   - currentPageID: two-way binding to the visible page's `id`.
    ///   - page: builds a page from its index and item. Each page fills the
    ///     container in both axes.
    public init(
        items: [Item],
        currentPageID: Binding<String?>,
        @ViewBuilder page: @escaping (Int, Item) -> Page
    ) {
        self.items = items
        self._currentPageID = currentPageID
        self.page = page
    }

    public var body: some View {
        if #available(iOS 17.0, *) {
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        page(index, item)
                            .containerRelativeFrame(.horizontal)
                            .containerRelativeFrame(.vertical)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentPageID)
            .ignoresSafeArea()
        } else {
            GeometryReader { proxy in
                TabView(selection: $currentPageID) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        page(index, item)
                            .frame(width: proxy.size.width, height: proxy.size.height)
                            .rotationEffect(.degrees(-90))
                            .tag(item.id as String?)
                    }
                }
                .frame(width: proxy.size.height, height: proxy.size.width)
                .rotationEffect(.degrees(90), anchor: .topLeading)
                .offset(x: proxy.size.width)
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .ignoresSafeArea()
        }
    }
}
