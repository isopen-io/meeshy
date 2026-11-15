import SwiftUI

public nonisolated enum AnchoredPickerPresentation: Sendable, Equatable {
    case popover
    case sheet

    public static func resolve(horizontalSizeClass: UserInterfaceSizeClass?) -> AnchoredPickerPresentation {
        horizontalSizeClass == .regular ? .popover : .sheet
    }

    public static func isPresented(
        _ requested: Bool,
        as presentation: AnchoredPickerPresentation,
        resolved: AnchoredPickerPresentation
    ) -> Bool {
        requested && presentation == resolved
    }
}

public enum AnchoredPickerMetrics {
    public static let popoverSize = CGSize(width: 360, height: 480)
}

private struct AnchoredPickerModifier<PickerContent: View>: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Binding var isPresented: Bool
    let compactDetents: Set<PresentationDetent>
    let popoverSize: CGSize
    let arrowEdge: Edge
    let pickerContent: () -> PickerContent

    private var resolved: AnchoredPickerPresentation {
        AnchoredPickerPresentation.resolve(horizontalSizeClass: sizeClass)
    }

    private func projected(as presentation: AnchoredPickerPresentation) -> Binding<Bool> {
        Binding(
            get: { AnchoredPickerPresentation.isPresented(isPresented, as: presentation, resolved: resolved) },
            set: { newValue in
                if !newValue, resolved == presentation { isPresented = false }
            }
        )
    }

    func body(content: Content) -> some View {
        content
            .popover(isPresented: projected(as: .popover), arrowEdge: arrowEdge) {
                pickerContent().frame(idealWidth: popoverSize.width, idealHeight: popoverSize.height)
            }
            .sheet(isPresented: projected(as: .sheet)) {
                pickerContent()
                    .presentationDetents(compactDetents)
                    .presentationDragIndicator(.visible)
            }
    }
}

private struct AnchoredItemPickerModifier<Item: Identifiable, PickerContent: View>: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Binding var item: Item?
    let compactDetents: Set<PresentationDetent>
    let popoverSize: CGSize
    let arrowEdge: Edge
    let pickerContent: (Item) -> PickerContent

    private var resolved: AnchoredPickerPresentation {
        AnchoredPickerPresentation.resolve(horizontalSizeClass: sizeClass)
    }

    private func projected(as presentation: AnchoredPickerPresentation) -> Binding<Item?> {
        Binding(
            get: { resolved == presentation ? item : nil },
            set: { newValue in
                if newValue == nil, resolved == presentation { item = nil }
            }
        )
    }

    func body(content: Content) -> some View {
        content
            .popover(item: projected(as: .popover), arrowEdge: arrowEdge) { presented in
                pickerContent(presented).frame(idealWidth: popoverSize.width, idealHeight: popoverSize.height)
            }
            .sheet(item: projected(as: .sheet)) { presented in
                pickerContent(presented)
                    .presentationDetents(compactDetents)
                    .presentationDragIndicator(.visible)
            }
    }
}

public extension View {
    func anchoredPicker<Content: View>(
        isPresented: Binding<Bool>,
        compactDetents: Set<PresentationDetent> = [.medium, .large],
        popoverSize: CGSize = AnchoredPickerMetrics.popoverSize,
        arrowEdge: Edge = .top,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        modifier(AnchoredPickerModifier(
            isPresented: isPresented,
            compactDetents: compactDetents,
            popoverSize: popoverSize,
            arrowEdge: arrowEdge,
            pickerContent: content
        ))
    }

    func anchoredPicker<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        compactDetents: Set<PresentationDetent> = [.medium, .large],
        popoverSize: CGSize = AnchoredPickerMetrics.popoverSize,
        arrowEdge: Edge = .top,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        modifier(AnchoredItemPickerModifier(
            item: item,
            compactDetents: compactDetents,
            popoverSize: popoverSize,
            arrowEdge: arrowEdge,
            pickerContent: content
        ))
    }
}
