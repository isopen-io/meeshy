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
    private let onMajorityPage: ((String) -> Void)?

    /// - Parameters:
    ///   - items: pages to display, in order.
    ///   - currentPageID: two-way binding to the visible page's `id`.
    ///   - onMajorityPage: appelé PENDANT le défilement, dès qu'une page
    ///     passe plus de la moitié de la zone visible (`VerticalPagerMajority`,
    ///     #9837) — sans attendre que le paging se pose, contrairement à
    ///     `currentPageID`. iOS 17+ ; sous iOS 16, seul `currentPageID` parle.
    ///   - page: builds a page from its index and item. Each page fills the
    ///     container in both axes.
    public init(
        items: [Item],
        currentPageID: Binding<String?>,
        onMajorityPage: ((String) -> Void)? = nil,
        @ViewBuilder page: @escaping (Int, Item) -> Page
    ) {
        self.items = items
        self._currentPageID = currentPageID
        self.onMajorityPage = onMajorityPage
        self.page = page
    }

    public var body: some View {
        if #available(iOS 17.0, *) {
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        majorityReporting(
                            page(index, item)
                                .containerRelativeFrame(.horizontal)
                                .containerRelativeFrame(.vertical),
                            id: item.id
                        )
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

    /// Signale la page qui devient majoritairement visible. Sans consommateur,
    /// la page est rendue nue : aucune mesure n'est payée par les autres pagers.
    @available(iOS 17.0, *)
    @ViewBuilder
    private func majorityReporting<Content: View>(_ content: Content, id: String) -> some View {
        if let onMajorityPage {
            content.onGeometryChange(for: Bool.self) { proxy in
                VerticalPagerMajority.isMajorityVisible(
                    pageHeight: proxy.size.height,
                    viewport: proxy.bounds(of: .scrollView(axis: .vertical))
                )
            } action: { isMajority in
                if isMajority { onMajorityPage(id) }
            }
        } else {
            content
        }
    }
}
