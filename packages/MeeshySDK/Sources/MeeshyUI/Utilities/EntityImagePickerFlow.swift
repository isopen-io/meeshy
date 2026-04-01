import SwiftUI
import PhotosUI

extension UIImage: @retroactive Identifiable {
    public var id: ObjectIdentifier { ObjectIdentifier(self) }
}

struct EntityImagePickerFlow: ViewModifier {
    @Binding var pickerItem: PhotosPickerItem?
    let context: MediaPreviewContext
    let accentColor: String
    let maxSizeKB: Int
    let onCompressed: (Data) -> Void

    @State private var imageForEditor: UIImage?

    func body(content: Content) -> some View {
        content
            .onChange(of: pickerItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    guard let data = try? await newItem.loadTransferable(type: Data.self),
                          let image = UIImage(data: data) else { return }
                    await MainActor.run { imageForEditor = image }
                }
            }
            .fullScreenCover(item: $imageForEditor) { image in
                MeeshyImagePreviewView(
                    image: image,
                    context: context,
                    accentColor: accentColor,
                    onAccept: { edited in
                        imageForEditor = nil
                        let compressed = ImageCompressor.compress(edited, maxSizeKB: maxSizeKB)
                        onCompressed(compressed)
                    },
                    onCancel: {
                        imageForEditor = nil
                        pickerItem = nil
                    }
                )
            }
    }
}

public extension View {
    func entityImagePickerFlow(
        pickerItem: Binding<PhotosPickerItem?>,
        context: MediaPreviewContext,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        maxSizeKB: Int,
        onCompressed: @escaping (Data) -> Void
    ) -> some View {
        modifier(EntityImagePickerFlow(
            pickerItem: pickerItem,
            context: context,
            accentColor: accentColor,
            maxSizeKB: maxSizeKB,
            onCompressed: onCompressed
        ))
    }
}
