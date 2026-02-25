import SwiftUI
import MeeshyUI

// MARK: - Crop Ratio

enum CropRatio: Equatable {
    case square
    case ratio4x3
    case ratio16x9
    case free

    var aspectRatio: Double? {
        switch self {
        case .square: return 1.0
        case .ratio4x3: return 4.0 / 3.0
        case .ratio16x9: return 16.0 / 9.0
        case .free: return nil
        }
    }

    var label: String {
        switch self {
        case .square: return "1:1"
        case .ratio4x3: return "4:3"
        case .ratio16x9: return "16:9"
        case .free: return "Libre"
        }
    }
}

// MARK: - Image Edit View

struct ImageEditView: View {
    let image: UIImage
    let initialCropRatio: CropRatio?
    let onAccept: (UIImage) -> Void
    let onCancel: (() -> Void)?

    @Environment(\.dismiss) private var dismiss

    @StateObject private var engine = ImageFilterEngine()

    @State private var croppedImage: UIImage
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var rotation: Angle = .zero
    @State private var activeTab: EditTab = .crop
    @State private var filterThumbnails: [ImageFilter: UIImage] = [:]
    @State private var previewImage: UIImage?
    @State private var debounceTask: Task<Void, Never>?

    // Crop state
    @State private var cropRect: CGRect = .zero
    @State private var imageDisplayRect: CGRect = .zero
    @State private var isCropInitialized = false
    @State private var selectedCropRatio: CropRatio = .free

    init(
        image: UIImage,
        initialCropRatio: CropRatio? = nil,
        onAccept: @escaping (UIImage) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.image = image
        self.initialCropRatio = initialCropRatio
        self.onAccept = onAccept
        self.onCancel = onCancel
        self._croppedImage = State(initialValue: image)
        self._selectedCropRatio = State(initialValue: initialCropRatio ?? .free)
    }

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
        GeometryReader { geometry in
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 0) {
                    headerBar
                        .padding(.horizontal, 16)
                        .padding(.top, 12)

                    Spacer()

                    if activeTab == .crop {
                        cropImagePreview(geometry: geometry)
                    } else {
                        imagePreview
                    }

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
        }
        .task {
            await loadThumbnails()
        }
        .onChange(of: engine.activeFilter) { _, _ in debouncedUpdatePreview() }
        .onChange(of: engine.brightness) { _, _ in debouncedUpdatePreview() }
        .onChange(of: engine.contrast) { _, _ in debouncedUpdatePreview() }
        .onChange(of: engine.saturation) { _, _ in debouncedUpdatePreview() }
        .onChange(of: engine.sharpness) { _, _ in debouncedUpdatePreview() }
        .onChange(of: engine.vignetteIntensity) { _, _ in debouncedUpdatePreview() }
        .onChange(of: engine.activeEffect) { _, _ in debouncedUpdatePreview() }
    }

    // MARK: - Header

    private var headerBar: some View {
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

            Button {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                    rotation += .degrees(90)
                }
                debouncedUpdatePreview()
            } label: {
                Image(systemName: "rotate.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(.white.opacity(0.2)))
            }
        }
    }

    // MARK: - Image Preview (non-crop tabs)

    private var imagePreview: some View {
        Image(uiImage: previewImage ?? croppedImage)
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
                            onCancel?()
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

    // MARK: - Crop Image Preview

    private func cropImagePreview(geometry: GeometryProxy) -> some View {
        let availableHeight = geometry.size.height - 300
        let size = CGSize(width: geometry.size.width - 32, height: max(availableHeight, 200))
        let displayRect = calculateDisplayRect(for: croppedImage, in: size)

        return ZStack {
            Image(uiImage: croppedImage)
                .resizable()
                .scaledToFit()
                .frame(width: displayRect.width, height: displayRect.height)
                .position(x: size.width / 2, y: size.height / 2)
                .opacity(0.3)

            CropOverlayView(
                cropRect: $cropRect,
                imageDisplayRect: displayRect,
                aspectRatio: selectedCropRatio.aspectRatio,
                image: croppedImage
            )
            .frame(width: size.width, height: size.height)
            .onAppear {
                initializeCropRect(displayRect: displayRect)
            }
            .onChange(of: selectedCropRatio) { _, _ in
                adjustCropForRatio(selectedCropRatio.aspectRatio, displayRect: displayRect)
            }
        }
        .frame(width: size.width, height: size.height)
        .padding(.horizontal, 16)
    }

    private func calculateDisplayRect(for img: UIImage, in size: CGSize) -> CGRect {
        let imageAspect = img.size.width / img.size.height
        let containerAspect = size.width / size.height

        let displaySize: CGSize
        if imageAspect > containerAspect {
            displaySize = CGSize(width: size.width, height: size.width / imageAspect)
        } else {
            displaySize = CGSize(width: size.height * imageAspect, height: size.height)
        }

        return CGRect(
            x: (size.width - displaySize.width) / 2,
            y: (size.height - displaySize.height) / 2,
            width: displaySize.width,
            height: displaySize.height
        )
    }

    // MARK: - Crop Initialization

    private func initializeCropRect(displayRect: CGRect) {
        guard !isCropInitialized || cropRect == .zero else { return }

        if let ratio = selectedCropRatio.aspectRatio {
            let maxWidth = displayRect.width * 0.9
            let maxHeight = displayRect.height * 0.9
            let cropWidth: CGFloat
            let cropHeight: CGFloat

            if maxWidth / ratio <= maxHeight {
                cropWidth = maxWidth
                cropHeight = maxWidth / ratio
            } else {
                cropHeight = maxHeight
                cropWidth = maxHeight * ratio
            }

            cropRect = CGRect(
                x: displayRect.midX - cropWidth / 2,
                y: displayRect.midY - cropHeight / 2,
                width: cropWidth,
                height: cropHeight
            )
        } else {
            cropRect = displayRect.insetBy(dx: displayRect.width * 0.05, dy: displayRect.height * 0.05)
        }

        imageDisplayRect = displayRect
        isCropInitialized = true
    }

    private func adjustCropForRatio(_ ratio: Double?, displayRect: CGRect) {
        guard let ratio else {
            if cropRect.width < 50 || cropRect.height < 50 {
                cropRect = displayRect.insetBy(dx: displayRect.width * 0.05, dy: displayRect.height * 0.05)
            }
            return
        }

        let centerX = cropRect.midX
        let centerY = cropRect.midY
        let maxWidth = min(cropRect.width, displayRect.width * 0.9)
        let maxHeight = min(cropRect.height, displayRect.height * 0.9)

        let cropWidth: CGFloat
        let cropHeight: CGFloat

        if maxWidth / ratio <= maxHeight {
            cropWidth = maxWidth
            cropHeight = maxWidth / ratio
        } else {
            cropHeight = maxHeight
            cropWidth = maxHeight * ratio
        }

        cropRect = CGRect(
            x: centerX - cropWidth / 2,
            y: centerY - cropHeight / 2,
            width: cropWidth,
            height: cropHeight
        ).intersection(displayRect)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(EditTab.allCases, id: \.rawValue) { tab in
                Button {
                    if activeTab == .crop && tab != .crop {
                        applyCrop()
                    }
                    withAnimation(.easeInOut(duration: 0.2)) {
                        activeTab = tab
                    }
                    if tab == .crop {
                        resetCropState()
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
        VStack(spacing: 16) {
            Text("Faites glisser les poignees pour recadrer")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.5))

            HStack(spacing: 12) {
                ForEach([CropRatio.free, .square, .ratio4x3, .ratio16x9], id: \.label) { ratio in
                    CropRatioButton(
                        title: ratio.label,
                        isSelected: selectedCropRatio == ratio
                    ) {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                            selectedCropRatio = ratio
                        }
                    }
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
                adjustmentRow(icon: "sun.max.fill", label: "Luminosite", value: $engine.brightness, range: -0.5...0.5)
                adjustmentRow(icon: "circle.lefthalf.filled", label: "Contraste", value: $engine.contrast, range: 0.5...2.0)
                adjustmentRow(icon: "drop.fill", label: "Saturation", value: $engine.saturation, range: 0...2.0)
                adjustmentRow(icon: "sparkle", label: "Nettete", value: $engine.sharpness, range: 0...1.0)
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
                    Text("Reinitialiser")
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
            if activeTab == .crop {
                applyCrop()
            }
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

    // MARK: - Crop Logic

    private func applyCrop() {
        guard cropRect.width > 0, cropRect.height > 0, imageDisplayRect.width > 0 else { return }

        let scaleX = croppedImage.size.width / imageDisplayRect.width
        let scaleY = croppedImage.size.height / imageDisplayRect.height

        let imageCropRect = CGRect(
            x: (cropRect.minX - imageDisplayRect.minX) * scaleX,
            y: (cropRect.minY - imageDisplayRect.minY) * scaleY,
            width: cropRect.width * scaleX,
            height: cropRect.height * scaleY
        )

        let clampedRect = imageCropRect.intersection(CGRect(origin: .zero, size: croppedImage.size))
        guard clampedRect.width > 0, clampedRect.height > 0,
              let cgImage = croppedImage.cgImage?.cropping(to: clampedRect) else { return }

        croppedImage = UIImage(cgImage: cgImage, scale: croppedImage.scale, orientation: croppedImage.imageOrientation)
        resetCropState()
        debouncedUpdatePreview()
    }

    private func resetCropState() {
        cropRect = .zero
        imageDisplayRect = .zero
        isCropInitialized = false
    }

    // MARK: - Render Logic

    private func loadThumbnails() async {
        let src = croppedImage
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
            let src = croppedImage
            let rotated = applyRotation(to: src, angle: rotation)
            let edited = engine.applyEdits(to: rotated)
            previewImage = edited
        }
    }

    private func renderFinalImage() -> UIImage {
        let rotated = applyRotation(to: croppedImage, angle: rotation)
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

// MARK: - Crop Overlay View

private struct CropOverlayView: View {
    @Binding var cropRect: CGRect
    let imageDisplayRect: CGRect
    let aspectRatio: Double?
    let image: UIImage

    private let handleSize: CGFloat = 24
    private let handleHitArea: CGFloat = 44
    private let minCropSize: CGFloat = 60

    @State private var isDragging = false
    @State private var activeHandle: CropHandle = .none

    enum CropHandle {
        case none
        case topLeft, topRight, bottomLeft, bottomRight
        case top, bottom, left, right
        case center
    }

    var body: some View {
        ZStack {
            GeometryReader { geo in
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: geo.size))
                    path.addRect(cropRect)
                }
                .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
            }
            .allowsHitTesting(false)

            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: imageDisplayRect.width, height: imageDisplayRect.height)
                .position(x: imageDisplayRect.midX, y: imageDisplayRect.midY)
                .mask(
                    Rectangle()
                        .frame(width: cropRect.width, height: cropRect.height)
                        .position(x: cropRect.midX, y: cropRect.midY)
                )

            CropFrameView(rect: cropRect)
            cropHandles
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if !isDragging {
                        activeHandle = detectHandle(at: value.startLocation)
                        isDragging = true
                    }
                    updateCropRect(with: value.translation, handle: activeHandle)
                }
                .onEnded { _ in
                    isDragging = false
                    activeHandle = .none
                    constrainCropRect()
                }
        )
    }

    private var cropHandles: some View {
        ZStack {
            cornerHandle(at: .topLeft)
            cornerHandle(at: .topRight)
            cornerHandle(at: .bottomLeft)
            cornerHandle(at: .bottomRight)

            if aspectRatio == nil {
                edgeHandle(at: .top)
                edgeHandle(at: .bottom)
                edgeHandle(at: .left)
                edgeHandle(at: .right)
            }
        }
    }

    private func cornerHandle(at handle: CropHandle) -> some View {
        let position: CGPoint = switch handle {
        case .topLeft: CGPoint(x: cropRect.minX, y: cropRect.minY)
        case .topRight: CGPoint(x: cropRect.maxX, y: cropRect.minY)
        case .bottomLeft: CGPoint(x: cropRect.minX, y: cropRect.maxY)
        case .bottomRight: CGPoint(x: cropRect.maxX, y: cropRect.maxY)
        default: .zero
        }

        return ZStack {
            Color.clear.frame(width: handleHitArea, height: handleHitArea)
            CornerHandleShape(corner: handle)
                .stroke(Color.white, lineWidth: 3)
                .frame(width: handleSize, height: handleSize)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .position(position)
    }

    private func edgeHandle(at handle: CropHandle) -> some View {
        let position: CGPoint = switch handle {
        case .top: CGPoint(x: cropRect.midX, y: cropRect.minY)
        case .bottom: CGPoint(x: cropRect.midX, y: cropRect.maxY)
        case .left: CGPoint(x: cropRect.minX, y: cropRect.midY)
        case .right: CGPoint(x: cropRect.maxX, y: cropRect.midY)
        default: .zero
        }

        let isHorizontal = handle == .top || handle == .bottom

        return ZStack {
            Color.clear.frame(width: handleHitArea, height: handleHitArea)
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white)
                .frame(width: isHorizontal ? 30 : 4, height: isHorizontal ? 4 : 30)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .position(position)
    }

    private func detectHandle(at point: CGPoint) -> CropHandle {
        let threshold = handleHitArea / 2

        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.minY)) < threshold { return .topLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.minY)) < threshold { return .topRight }
        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.maxY)) < threshold { return .bottomLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.maxY)) < threshold { return .bottomRight }

        if aspectRatio == nil {
            if abs(point.y - cropRect.minY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .top }
            if abs(point.y - cropRect.maxY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .bottom }
            if abs(point.x - cropRect.minX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .left }
            if abs(point.x - cropRect.maxX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .right }
        }

        if cropRect.contains(point) { return .center }
        return .none
    }

    private func distance(from p1: CGPoint, to p2: CGPoint) -> CGFloat {
        sqrt(pow(p1.x - p2.x, 2) + pow(p1.y - p2.y, 2))
    }

    private func updateCropRect(with translation: CGSize, handle: CropHandle) {
        var newRect = cropRect

        switch handle {
        case .none:
            return
        case .center:
            newRect.origin.x += translation.width
            newRect.origin.y += translation.height
        case .topLeft:
            if let ratio = aspectRatio {
                let diagonal = min(translation.width, translation.height)
                newRect.origin.x += diagonal
                newRect.origin.y += diagonal / ratio
                newRect.size.width -= diagonal
                newRect.size.height -= diagonal / ratio
            } else {
                newRect.origin.x += translation.width
                newRect.origin.y += translation.height
                newRect.size.width -= translation.width
                newRect.size.height -= translation.height
            }
        case .topRight:
            if let ratio = aspectRatio {
                let change = max(translation.width, -translation.height)
                newRect.origin.y -= change / ratio
                newRect.size.width += change
                newRect.size.height += change / ratio
            } else {
                newRect.origin.y += translation.height
                newRect.size.width += translation.width
                newRect.size.height -= translation.height
            }
        case .bottomLeft:
            if let ratio = aspectRatio {
                let change = max(-translation.width, translation.height)
                newRect.origin.x -= change
                newRect.size.width += change
                newRect.size.height += change / ratio
            } else {
                newRect.origin.x += translation.width
                newRect.size.width -= translation.width
                newRect.size.height += translation.height
            }
        case .bottomRight:
            if let ratio = aspectRatio {
                let change = max(translation.width, translation.height)
                newRect.size.width += change
                newRect.size.height += change / ratio
            } else {
                newRect.size.width += translation.width
                newRect.size.height += translation.height
            }
        case .top:
            newRect.origin.y += translation.height
            newRect.size.height -= translation.height
        case .bottom:
            newRect.size.height += translation.height
        case .left:
            newRect.origin.x += translation.width
            newRect.size.width -= translation.width
        case .right:
            newRect.size.width += translation.width
        }

        if newRect.width >= minCropSize && newRect.height >= minCropSize {
            cropRect = newRect
        }
    }

    private func constrainCropRect() {
        var constrained = cropRect
        constrained.size.width = max(minCropSize, min(constrained.width, imageDisplayRect.width))
        constrained.size.height = max(minCropSize, min(constrained.height, imageDisplayRect.height))
        constrained.origin.x = max(imageDisplayRect.minX, min(constrained.origin.x, imageDisplayRect.maxX - constrained.width))
        constrained.origin.y = max(imageDisplayRect.minY, min(constrained.origin.y, imageDisplayRect.maxY - constrained.height))

        withAnimation(.easeOut(duration: 0.2)) {
            cropRect = constrained
        }
    }
}

// MARK: - Crop Frame View

private struct CropFrameView: View {
    let rect: CGRect

    var body: some View {
        ZStack {
            Rectangle()
                .stroke(Color.white, lineWidth: 1.5)
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .shadow(color: .black.opacity(0.3), radius: 2)

            GridLinesView()
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
        }
    }
}

// MARK: - Grid Lines View

private struct GridLinesView: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: geo.size.width / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width / 3, y: geo.size.height))
                    path.move(to: CGPoint(x: geo.size.width * 2 / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width * 2 / 3, y: geo.size.height))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: 0.5)

                Path { path in
                    path.move(to: CGPoint(x: 0, y: geo.size.height / 3))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height / 3))
                    path.move(to: CGPoint(x: 0, y: geo.size.height * 2 / 3))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height * 2 / 3))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: 0.5)
            }
        }
    }
}

// MARK: - Corner Handle Shape

private struct CornerHandleShape: Shape {
    let corner: CropOverlayView.CropHandle

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length = rect.width * 0.6

        switch corner {
        case .topLeft:
            path.move(to: CGPoint(x: 0, y: length))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: length, y: 0))
        case .topRight:
            path.move(to: CGPoint(x: rect.width - length, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: 0))
            path.addLine(to: CGPoint(x: rect.width, y: length))
        case .bottomLeft:
            path.move(to: CGPoint(x: 0, y: rect.height - length))
            path.addLine(to: CGPoint(x: 0, y: rect.height))
            path.addLine(to: CGPoint(x: length, y: rect.height))
        case .bottomRight:
            path.move(to: CGPoint(x: rect.width, y: rect.height - length))
            path.addLine(to: CGPoint(x: rect.width, y: rect.height))
            path.addLine(to: CGPoint(x: rect.width - length, y: rect.height))
        default:
            break
        }

        return path
    }
}

// MARK: - Crop Ratio Button

private struct CropRatioButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .black : .white.opacity(0.8))
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(isSelected ? Color(hex: "08D9D6") : Color.white.opacity(0.1))
                )
        }
        .scaleEffect(isSelected ? 1.05 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isSelected)
    }
}
