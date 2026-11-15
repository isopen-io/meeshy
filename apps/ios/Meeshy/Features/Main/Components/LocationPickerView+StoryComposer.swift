import SwiftUI
import Combine
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

// MARK: - Injection dans le composer de story (SDK)

extension View {
    /// Fournit au composer de story (`StoryComposerView`, côté SDK) la fabrique
    /// de CE picker. Le composer expose un point d'injection plutôt qu'un import
    /// direct : `LocationPickerView` dépend de MapKit, CoreLocation et de
    /// `MediaPermissionCoordinator` — de l'orchestration UX produit, donc
    /// app-side (SDK purity). Sans cet appel, le chip « Lieu » du panneau Texte
    /// n'est pas rendu.
    func storyLocationPickerProvided(
        accentColor: String = MeeshyColors.brandPrimaryHex
    ) -> some View {
        environment(\.storyLocationPicker, StoryLocationPickerProvider { onSelect in
            AnyView(LocationPickerView(accentColor: accentColor, onSelect: onSelect))
        })
    }
}
