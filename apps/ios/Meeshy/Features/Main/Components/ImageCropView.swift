import SwiftUI
import MeeshyUI

struct ImageCropView: View {
    let image: UIImage
    let onAccept: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var rotation: Angle = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .scaleEffect(scale)
                .offset(offset)
                .rotationEffect(rotation)
                .gesture(
                    MagnifyGesture()
                        .onChanged { value in scale = value.magnification }
                        .onEnded { _ in
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                scale = max(min(scale, 4), 1)
                            }
                        }
                )
                .gesture(
                    DragGesture()
                        .onChanged { value in offset = value.translation }
                        .onEnded { value in
                            if abs(value.translation.height) > 200 {
                                dismiss()
                            } else {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    offset = .zero
                                }
                            }
                        }
                )

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Text("Annuler")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(.white.opacity(0.2)))
                    }

                    Spacer()

                    Button {
                        withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                            rotation += .degrees(90)
                        }
                    } label: {
                        Image(systemName: "rotate.right")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(.white.opacity(0.2)))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                Spacer()

                Button {
                    onAccept(image)
                    HapticFeedback.success()
                    dismiss()
                } label: {
                    Text("Utiliser la photo")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                        startPoint: .leading, endPoint: .trailing
                                    )
                                )
                                .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: 8, y: 4)
                        )
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
        }
    }
}
