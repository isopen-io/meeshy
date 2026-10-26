## 2026-10-26 : The message list is the UIKit exception to a SwiftUI app (#13141)

**Context.** The app is SwiftUI (decision 2025-01 "Architecture - MVVM strict", custom ZStack navigation). `MessageListViewController` (UIKit, 25 files `MessageListViewController*.swift`, 4 798 lines, cohesion budget entry `Meeshy::MessageListViewController`) was recorded nowhere as an exception.

**Origin.** Spec `docs/superpowers/specs/2026-05-04-ios-persistence-statemachine-design.md`, section "Message List : UICollectionView hybrid", introduced by `d08492d452` (2026-05-04). Measured problem F3: `LazyVStack` without recycling cost 3 to 12 ms per frame during fast scroll.

**Decision.** The conversation timeline is the ONE UIKit screen core, for scroll performance:
- `UICollectionView` with a compositional layout (`MessageListLayout`) and a diffable data source (`MessageListSection`, `MessageListItem`);
- cell reuse, inverted list and stable content offset while older pages are inserted;
- prefetching.

The rest stays SwiftUI:
- the list is hosted by `MessageListView` (`UIViewControllerRepresentable`) inside the SwiftUI conversation screen;
- each bubble is SwiftUI, rendered in `MessageListCell` through `UIHostingConfiguration`;
- composer, header and overlays are SwiftUI.

**Rules.**
- The controller holds no message state. It reads `MessageStore`, the GRDB window (see decision 2026-10-26 on the canonical message store), and receives immutable values from `ConversationViewModel` at cell-configuration time.
- New bubble content is SwiftUI in the cell, never a new UIKit view. UIKit code in the controller is limited to what SwiftUI cannot do at this cost: collection layout, snapshots, scroll and offset control, display link, visibility tracking.
- Any other UIKit screen needs its own decision. Thin `UIViewRepresentable` / `UIViewControllerRepresentable` bridges to system components (camera, document picker, share sheet, AV players) are not screens and need none.
- The cohesion budget of `Meeshy::MessageListViewController` only goes down (`apps/ios/scripts/check_cohesion_budget.sh`).

**Duplication found.** None: the controller is the only `UICollectionViewDiffableDataSource` host of the app (with its own `MessageListCell`, `MessageListLayout`, `DiffableTypes`), and no SwiftUI twin of the timeline exists.

No product code changes with this decision.
