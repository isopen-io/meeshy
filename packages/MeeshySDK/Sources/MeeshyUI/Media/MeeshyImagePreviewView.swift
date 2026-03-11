import SwiftUI

// MARK: - Meeshy Image Preview View

public struct MeeshyImagePreviewView: View {
    let image: UIImage
    let context: MediaPreviewContext
    let accentColor: String
    let onAccept: (UIImage) -> Void
    let onCancel: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @State private var editedImage: UIImage?
    @State private var showEditor = false

    private var displayImage: UIImage { editedImage ?? image }

    private var accentGradient: LinearGradient {
        LinearGradient(
            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.85)],
            startPoint: .leading, endPoint: .trailing
        )
    }

    public init(
        image: UIImage,
        context: MediaPreviewContext,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        onAccept: @escaping (UIImage) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.image = image
        self.context = context
        self.accentColor = accentColor
        self.onAccept = onAccept
        self.onCancel = onCancel
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                navigationBar
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                Spacer()

                contextPreview

                Spacer()

                bottomActions
                    .padding(.horizontal, 20)
                    .padding(.bottom, 34)
            }
        }
        .fullScreenCover(isPresented: $showEditor) {
            MeeshyImageEditorView(
                image: displayImage,
                initialCropRatio: context.preferredCropRatio,
                accentColor: accentColor,
                onAccept: { edited in
                    editedImage = edited
                    showEditor = false
                },
                onCancel: {
                    showEditor = false
                }
            )
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            Button {
                onCancel?()
                dismiss()
            } label: {
                Text("Annuler")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(.white.opacity(0.2)))
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: context.contextIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(context.contextLabel)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(Color(hex: accentColor))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color(hex: accentColor).opacity(0.15))
            )

            Spacer()

            Button {
                onAccept(displayImage)
                HapticFeedback.success()
                dismiss()
            } label: {
                Text("OK")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(accentGradient)
                    )
            }
        }
    }

    // MARK: - Context Preview

    @ViewBuilder
    private var contextPreview: some View {
        switch context {
        case .story:
            Image(uiImage: displayImage)
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

        case .post:
            VStack(spacing: 0) {
                Image(uiImage: displayImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 16)

                HStack {
                    Text("Ajouter une l\u{00E9}gende...")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.3))
                    Spacer()
                }
                .padding(16)
            }

        case .message:
            Image(uiImage: displayImage)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 20)

        case .avatar:
            Image(uiImage: displayImage)
                .resizable()
                .scaledToFill()
                .frame(width: 120, height: 120)
                .clipShape(Circle())

        case .banner:
            Image(uiImage: displayImage)
                .resizable()
                .scaledToFill()
                .frame(height: 200)
                .clipped()
        }
    }

    // MARK: - Bottom Actions

    private var bottomActions: some View {
        HStack(spacing: 16) {
            Button {
                showEditor = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "pencil")
                        .font(.system(size: 14, weight: .semibold))
                    Text("\u{00C9}diter")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.white.opacity(0.12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(.white.opacity(0.15), lineWidth: 0.5)
                        )
                )
            }

            Button {
                onAccept(displayImage)
                HapticFeedback.success()
                dismiss()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                    Text("Utiliser")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(accentGradient)
                        .shadow(color: Color(hex: accentColor).opacity(0.45), radius: 10, y: 4)
                )
            }
        }
    }
}
