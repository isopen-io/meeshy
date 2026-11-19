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
