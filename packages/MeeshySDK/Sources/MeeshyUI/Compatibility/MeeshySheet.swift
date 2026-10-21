import SwiftUI

public nonisolated enum MeeshySheetWidth: Sendable, Equatable {
    case automatic
    case wide

    public static func usesPageSizing(
        hostSizeClass: UserInterfaceSizeClass?,
        inSheetSizeClass: UserInterfaceSizeClass?,
        pageSizingAvailable: Bool
    ) -> Bool {
        guard pageSizingAvailable else { return false }
        guard let resolved = hostSizeClass ?? inSheetSizeClass else { return true }
        return resolved == .regular
    }

    public func requestsPageSizing(
        hostSizeClass: UserInterfaceSizeClass?,
        inSheetSizeClass: UserInterfaceSizeClass?,
        pageSizingAvailable: Bool
    ) -> Bool {
        switch self {
        case .automatic:
            return false
        case .wide:
            return Self.usesPageSizing(
                hostSizeClass: hostSizeClass,
                inSheetSizeClass: inSheetSizeClass,
                pageSizingAvailable: pageSizingAvailable
            )
        }
    }
}

private struct MeeshySheetHostSizeClassKey: EnvironmentKey {
    static let defaultValue: UserInterfaceSizeClass? = nil
}

extension EnvironmentValues {
    var meeshySheetHostSizeClass: UserInterfaceSizeClass? {
        get { self[MeeshySheetHostSizeClassKey.self] }
        set { self[MeeshySheetHostSizeClassKey.self] = newValue }
    }
}

private struct MeeshySheetBody<Content: View>: View {
    let hostSizeClass: UserInterfaceSizeClass?
    let width: MeeshySheetWidth
    let content: Content

    var body: some View {
        content
            .modifier(AdaptiveWideSheetModifier(width: width))
            .environment(\.meeshySheetHostSizeClass, hostSizeClass)
    }
}

private struct MeeshySheetModifier<SheetContent: View>: ViewModifier {
    @Environment(\.horizontalSizeClass) private var hostSizeClass
    @Binding var isPresented: Bool
    let width: MeeshySheetWidth
    let onDismiss: (() -> Void)?
    let sheetContent: () -> SheetContent

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented, onDismiss: onDismiss) {
            MeeshySheetBody(hostSizeClass: hostSizeClass, width: width, content: sheetContent())
        }
    }
}

private struct MeeshyItemSheetModifier<Item: Identifiable, SheetContent: View>: ViewModifier {
    @Environment(\.horizontalSizeClass) private var hostSizeClass
    @Binding var item: Item?
    let width: MeeshySheetWidth
    let onDismiss: (() -> Void)?
    let sheetContent: (Item) -> SheetContent

    func body(content: Content) -> some View {
        content.sheet(item: $item, onDismiss: onDismiss) { presented in
            MeeshySheetBody(hostSizeClass: hostSizeClass, width: width, content: sheetContent(presented))
        }
    }
}

public extension View {
    func meeshySheet<Content: View>(
        isPresented: Binding<Bool>,
        width: MeeshySheetWidth = .automatic,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        modifier(MeeshySheetModifier(isPresented: isPresented, width: width, onDismiss: onDismiss, sheetContent: content))
    }

    func meeshySheet<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        width: MeeshySheetWidth = .automatic,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        modifier(MeeshyItemSheetModifier(item: item, width: width, onDismiss: onDismiss, sheetContent: content))
    }
}
