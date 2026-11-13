import SwiftUI
import PhotosUI

extension UIImage: @retroactive Identifiable {
    public var id: ObjectIdentifier { ObjectIdentifier(self) }
}

/// **Une image d'identité à retoucher** (#17251) : l'image choisie, son format,
/// et les deux seules issues — « Terminé » rend l'image retouchée, annuler ne
/// rend rien.
public struct EntityImageEditRequest {
    public let image: UIImage
    public let format: EntityImageFormat
    public let accentColor: String
    public let onDone: (UIImage) -> Void
    public let onCancel: () -> Void
}

/// L'éditeur que l'APP fournit — la retouche de la capture caméra : le SDK ne
/// le connaît pas, il le reçoit par l'environnement.
public typealias EntityImageEditing = @MainActor (EntityImageEditRequest) -> AnyView

private struct EntityImageEditorKey: EnvironmentKey {
    static let defaultValue: EntityImageEditing? = nil
}

extension EnvironmentValues {
    /// L'éditeur des images d'identité ; `nil` ⇒ l'image choisie part recadrée au centre.
    public var entityImageEditor: EntityImageEditing? {
        get { self[EntityImageEditorKey.self] }
        set { self[EntityImageEditorKey.self] = newValue }
    }
}

struct EntityImagePickerFlow: ViewModifier {
    @Binding var pickerItem: PhotosPickerItem?
    let format: EntityImageFormat
    let accentColor: String
    let maxSizeKB: Int
    let onCompressed: (Data) -> Void

    @Environment(\.entityImageEditor) private var editor
    @State private var imageForEditor: UIImage?

    func body(content: Content) -> some View {
        content
            .adaptiveOnChange(of: pickerItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    guard let data = try? await PickedMedia.loadImageData(newItem),
                          let image = UIImage(data: data) else { return }
                    await MainActor.run { receive(image) }
                }
            }
            .fullScreenCover(item: $imageForEditor) { image in
                if let editor {
                    editor(EntityImageEditRequest(image: image, format: format, accentColor: accentColor,
                                                  onDone: { finish(.edited($0)) },
                                                  onCancel: { finish(.cancelled) }))
                }
            }
    }

    private func receive(_ image: UIImage) {
        switch EntityImageDelivery.route(hasEditor: editor != nil) {
        case .edit: imageForEditor = image
        case .direct: finish(.edited(image))
        }
    }

    private func finish(_ outcome: EntityImageEditOutcome) {
        imageForEditor = nil
        pickerItem = nil
        Task {
            guard let data = await EntityImageDelivery.data(for: outcome, format: format, maxSizeKB: maxSizeKB) else { return }
            onCompressed(data)
        }
    }
}

public extension View {
    func entityImagePickerFlow(
        pickerItem: Binding<PhotosPickerItem?>,
        format: EntityImageFormat,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        maxSizeKB: Int,
        onCompressed: @escaping (Data) -> Void
    ) -> some View {
        modifier(EntityImagePickerFlow(
            pickerItem: pickerItem,
            format: format,
            accentColor: accentColor,
            maxSizeKB: maxSizeKB,
            onCompressed: onCompressed
        ))
    }
}
