import SwiftUI
import MeeshyUI

struct ImageEditView: View {
    let image: UIImage
    let onAccept: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    @StateObject private var engine = ImageFilterEngine()

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var rotation: Angle = .zero
    @State private var activeTab: EditTab = .crop
    @State private var filterThumbnails: [ImageFilter: UIImage] = [:]
    @State private var previewImage: UIImage?
    @State private var debounceTask: Task<Void, Never>?

    private enum EditTab: String, CaseIterable {
        case crop, filters, adjustments, effects

        var label: String {
            switch self {
            case .crop: return "Crop"
            case .filters: return "Filtres"
            case .adjustments: return "Ajust."
            case .effects: return "FX"
            }
        }

        var icon: String {
            switch self {
            case .crop: return "crop"
            case .filters: return "camera.filters"
            case .adjustments: return "slider.horizontal.3"
            case .effects: return "sparkles"
            }
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                headerBar
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                Spacer()

                imagePreview

                Spacer()

                tabBar

                toolPanel
                    .frame(height: 140)

                acceptButton
                    .padding(.horizontal, 20)
                    .padding(.bottom, 30)
                    .padding(.top, 8)
            }
        }
        .task {
            await loadThumbnails()
        }
        .onChange(of: engine.activeFilter) { _ in debouncedUpdatePreview() }
        .onChange(of: engine.brightness) { _ in debouncedUpdatePreview() }
        .onChange(of: engine.contrast) { _ in debouncedUpdatePreview() }
        .onChange(of: engine.saturation) { _ in debouncedUpdatePreview() }
        .onChange(of: engine.sharpness) { _ in debouncedUpdatePreview() }
        .onChange(of: engine.vignetteIntensity) { _ in debouncedUpdatePreview() }
        .onChange(of: engine.activeEffect) { _ in debouncedUpdatePreview() }
    }

    // MARK: - Header

    private var headerBar: some View {
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
    }

    // MARK: - Image Preview

    private var imagePreview: some View {
        Image(uiImage: previewImage ?? image)
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
            .padding(.horizontal, 16)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(EditTab.allCases, id: \.rawValue) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        activeTab = tab
                    }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 14))
                        Text(tab.label)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(activeTab == tab ? Color(hex: "08D9D6") : .white.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
            }
        }
        .padding(.horizontal, 8)
    }

    // MARK: - Tool Panel

    @ViewBuilder
    private var toolPanel: some View {
        switch activeTab {
        case .crop:
            cropPanel
        case .filters:
            filtersPanel
        case .adjustments:
            adjustmentsPanel
        case .effects:
            effectsPanel
        }
    }

    // MARK: - Crop Panel

    private var cropPanel: some View {
        VStack(spacing: 12) {
            Text("Pincez pour zoomer, glissez pour d\u{00E9}placer")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.5))

            HStack(spacing: 20) {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        scale = 1.0
                        offset = .zero
                        rotation = .zero
                    }
                } label: {
                    Label("R\u{00E9}initialiser", systemImage: "arrow.counterclockwise")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "4ECDC4"))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Filters Panel

    private var filtersPanel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(ImageFilter.allCases) { filter in
                    filterThumbnailCell(filter)
                }
            }
            .padding(.horizontal, 16)
        }
        .frame(maxHeight: .infinity)
    }

    private func filterThumbnailCell(_ filter: ImageFilter) -> some View {
        let isSelected = engine.activeFilter == filter
        return Button {
            engine.activeFilter = filter
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Group {
                    if let thumb = filterThumbnails[filter] {
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle()
                            .fill(.white.opacity(0.1))
                            .overlay(ProgressView().tint(.white))
                    }
                }
                .frame(width: 68, height: 68)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isSelected ? Color(hex: "08D9D6") : .clear, lineWidth: 2)
                )

                Text(filter.displayName)
                    .font(.system(size: 10))
                    .foregroundColor(isSelected ? Color(hex: "08D9D6") : .white.opacity(0.7))
            }
        }
    }

    // MARK: - Adjustments Panel

    private var adjustmentsPanel: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 10) {
                adjustmentRow(icon: "sun.max.fill", label: "Luminosit\u{00E9}", value: $engine.brightness, range: -0.5...0.5)
                adjustmentRow(icon: "circle.lefthalf.filled", label: "Contraste", value: $engine.contrast, range: 0.5...2.0)
                adjustmentRow(icon: "drop.fill", label: "Saturation", value: $engine.saturation, range: 0...2.0)
                adjustmentRow(icon: "sparkle", label: "Nettet\u{00E9}", value: $engine.sharpness, range: 0...1.0)
                adjustmentRow(icon: "camera.filters", label: "Vignette", value: $engine.vignetteIntensity, range: 0...2.0)

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        engine.brightness = 0
                        engine.contrast = 1
                        engine.saturation = 1
                        engine.sharpness = 0
                        engine.vignetteIntensity = 0
                    }
                } label: {
                    Text("R\u{00E9}initialiser")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "4ECDC4"))
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    private func adjustmentRow(icon: String, label: String, value: Binding<Float>, range: ClosedRange<Float>) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.6))
                .frame(width: 20)

            Text(label)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.8))
                .frame(width: 65, alignment: .leading)

            Slider(value: value, in: range)
                .tint(Color(hex: "4ECDC4"))

            Text(String(format: "%.1f", value.wrappedValue))
                .font(.system(size: 11).monospacedDigit())
                .foregroundColor(.white.opacity(0.5))
                .frame(width: 32)
        }
    }

    // MARK: - Effects Panel

    private var effectsPanel: some View {
        let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(ImageEffect.allCases) { effect in
                effectCell(effect)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxHeight: .infinity)
    }

    private func effectCell(_ effect: ImageEffect) -> some View {
        let isSelected = engine.activeEffect == effect
        return Button {
            engine.activeEffect = engine.activeEffect == effect ? .none : effect
            HapticFeedback.light()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: effect.iconName)
                    .font(.system(size: 18))
                Text(effect.displayName)
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(isSelected ? Color(hex: "08D9D6") : .white.opacity(0.7))
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(.white.opacity(isSelected ? 0.12 : 0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? Color(hex: "08D9D6") : .clear, lineWidth: 1.5)
            )
        }
    }

    // MARK: - Accept Button

    private var acceptButton: some View {
        Button {
            let finalImage = renderFinalImage()
            onAccept(finalImage)
            HapticFeedback.success()
            dismiss()
        } label: {
            Text("Utiliser")
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
    }

    // MARK: - Logic

    private func loadThumbnails() async {
        let src = image
        let thumbs = await Task.detached(priority: .userInitiated) {
            await ImageFilterEngine().generateThumbnails(from: src)
        }.value
        filterThumbnails = thumbs
    }

    private func debouncedUpdatePreview() {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 100_000_000)
            guard !Task.isCancelled else { return }
            let src = image
            let edited = engine.applyEdits(to: src)
            previewImage = edited
        }
    }

    private func renderFinalImage() -> UIImage {
        let rotated = applyRotation(to: image, angle: rotation)
        return engine.applyEdits(to: rotated)
    }

    private func applyRotation(to source: UIImage, angle: Angle) -> UIImage {
        let degrees = angle.degrees.truncatingRemainder(dividingBy: 360)
        guard abs(degrees) > 0.01 else { return source }

        let radians = CGFloat(degrees * .pi / 180)
        let size = source.size
        let rotatedRect = CGRect(origin: .zero, size: size)
            .applying(CGAffineTransform(rotationAngle: radians))
        let newSize = CGSize(width: abs(rotatedRect.width), height: abs(rotatedRect.height))

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { ctx in
            ctx.cgContext.translateBy(x: newSize.width / 2, y: newSize.height / 2)
            ctx.cgContext.rotate(by: radians)
            source.draw(in: CGRect(x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height))
        }
    }
}
