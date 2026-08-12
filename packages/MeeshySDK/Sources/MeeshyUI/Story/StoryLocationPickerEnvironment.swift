import SwiftUI
import MeeshySDK

/// Fabrique du sélecteur de lieu, **injectée par l'app**.
///
/// Le picker (`LocationPickerView`) est app-side par nature : MapKit,
/// CoreLocation, `MediaPermissionCoordinator` et catalogue `bundle: .main` —
/// c'est de l'orchestration UX produit, pas un atome (SDK purity, cf.
/// `packages/MeeshySDK/CLAUDE.md`). Le composer de story, lui, vit au SDK : il
/// expose donc ce point d'injection et se contente de présenter ce que l'app
/// fournit.
///
/// Absent (`nil`) = aucun picker disponible → le chip « Lieu » n'est PAS rendu.
/// Un chip qui ouvre le vide est pire que pas de chip.
public struct StoryLocationPickerProvider {
    public typealias Make = @MainActor (@escaping (SharedPlace) -> Void) -> AnyView

    private let make: Make

    public init(make: @escaping Make) {
        self.make = make
    }

    public func makeView(onSelect: @escaping (SharedPlace) -> Void) -> AnyView {
        make(onSelect)
    }
}

public struct StoryLocationPickerKey: EnvironmentKey {
    public static let defaultValue: StoryLocationPickerProvider? = nil
}

extension EnvironmentValues {
    public var storyLocationPicker: StoryLocationPickerProvider? {
        get { self[StoryLocationPickerKey.self] }
        set { self[StoryLocationPickerKey.self] = newValue }
    }
}
