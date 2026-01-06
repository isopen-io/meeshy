//
//  ImageEditorView.swift
//  Meeshy
//
//  Modern image preview and editing view before sending
//  Features:
//  - Full screen hero image with zoom/pan
//  - Horizontal thumbnail carousel
//  - Floating edit button overlay
//  - Glassmorphism UI design
//  - Filters, adjustments, crop, rotation
//
//  iOS 16+
//

import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Modern Image Editor View

struct ImageEditorView: View {
    // MARK: - Properties

    let images: [UIImage]
    let onConfirm: ([UIImage]) -> Void
    let onCancel: () -> Void
    var onRetake: (() -> Void)?

    @State private var currentIndex = 0
    @State private var editedImages: [UIImage]
    @State private var editStates: [ImageEditState]

    // Edit mode
    @State private var isEditing = false
    @State private var editMode: EditMode = .none

    // Zoom/Pan state
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    // UI state
    @State private var showDeleteConfirm = false
    @State private var deleteIndex: Int?

    // Crop overlay state
    @State private var cropRect: CGRect = .zero
    @State private var imageDisplayRect: CGRect = .zero
    @State private var isCropInitialized = false

    @Environment(\.dismiss) private var dismiss
    @Namespace private var thumbnailNamespace

    // MARK: - Init

    init(
        images: [UIImage],
        onConfirm: @escaping ([UIImage]) -> Void,
        onCancel: @escaping () -> Void,
        onRetake: (() -> Void)? = nil
    ) {
        self.images = images
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        self.onRetake = onRetake
        self._editedImages = State(initialValue: images)
        self._editStates = State(initialValue: images.map { _ in ImageEditState() })
    }

    // Single image convenience init
    init(
        image: UIImage,
        onConfirm: @escaping (UIImage) -> Void,
        onCancel: @escaping () -> Void,
        onRetake: (() -> Void)? = nil
    ) {
        self.images = [image]
        self.onConfirm = { images in
            if let first = images.first {
                onConfirm(first)
            }
        }
        self.onCancel = onCancel
        self.onRetake = onRetake
        self._editedImages = State(initialValue: [image])
        self._editStates = State(initialValue: [ImageEditState()])
    }

    // MARK: - Body

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                // Main content
                VStack(spacing: 0) {
                    // Hero image area
                    heroImageArea(geometry: geometry)

                    // Thumbnail carousel (when multiple images and not editing)
                    if editedImages.count > 1 {
                        thumbnailCarousel
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Edit controls (when editing)
                    if isEditing {
                        editControlsPanel
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Action bar
                    actionBar
                }

                // Floating header overlay - respects safe area for notch/Dynamic Island
                VStack(spacing: 0) {
                    // Safe area spacer
                    Color.clear
                        .frame(height: geometry.safeAreaInsets.top)
                    floatingHeader
                    Spacer()
                }
                .ignoresSafeArea(.container, edges: .top)

                // Floating edit button (when not editing)
                if !isEditing && !editedImages.isEmpty {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            floatingEditButton
                                .padding(.trailing, 20)
                                .padding(.bottom, editedImages.count > 1 ? 180 : 100)
                        }
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isEditing)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: editMode)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: currentIndex)
        .onAppear {
            if images.isEmpty || editedImages.isEmpty {
                mediaLogger.warn("[ImageEditorView] Dismissed due to empty images array")
                onCancel()
            }
        }
        .confirmationDialog("Supprimer cette image ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) {
                if let index = deleteIndex {
                    deleteImage(at: index)
                }
            }
            Button("Annuler", role: .cancel) {}
        }
    }

    // MARK: - Floating Header

    private var floatingHeader: some View {
        HStack {
            // Close button
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if isEditing {
                    resetCurrentImageEdits()
                    isEditing = false
                    editMode = .none
                } else {
                    onCancel()
                }
            } label: {
                Image(systemName: isEditing ? "xmark" : "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
                    )
            }

            Spacer()

            // Page indicator
            if editedImages.count > 1 && !isEditing {
                Text("\(currentIndex + 1) / \(editedImages.count)")
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(.ultraThinMaterial)
                            .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
                    )
            }

            Spacer()

            // Done button (when editing)
            if isEditing {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    applyCurrentEdits()
                    isEditing = false
                    editMode = .none
                } label: {
                    Text("OK")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(Color.yellow)
                                .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
                        )
                }
            } else {
                // Invisible spacer for balance
                Color.clear.frame(width: 36, height: 36)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Hero Image Area

    private func heroImageArea(geometry: GeometryProxy) -> some View {
        let imageHeight = geometry.size.height - (editedImages.count > 1 ? 180 : 100) - (isEditing ? 180 : 0)
        let imageSize = CGSize(width: geometry.size.width, height: imageHeight)

        return ZStack {
            if editedImages.isEmpty {
                // Placeholder
                VStack(spacing: 12) {
                    Image(systemName: "photo.badge.exclamationmark")
                        .font(.system(size: 60))
                        .foregroundColor(.gray.opacity(0.5))
                    Text("Aucune image")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.gray.opacity(0.7))
                }
            } else {
                // Image with crop overlay when in crop mode
                if editMode == .crop {
                    cropableImageView(
                        editedImages[safe: currentIndex] ?? editedImages[0],
                        size: imageSize
                    )
                } else {
                    // Zoomable image for other modes
                    zoomableImage(
                        editedImages[safe: currentIndex] ?? editedImages[0],
                        size: imageSize
                    )
                }
            }

            // Vignette overlay (only when not cropping)
            if editMode != .crop {
                LinearGradient(
                    colors: [
                        Color.black.opacity(0.4),
                        Color.clear,
                        Color.clear,
                        Color.black.opacity(0.3)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Cropable Image View

    private func cropableImageView(_ image: UIImage, size: CGSize) -> some View {
        let displayRect = calculateDisplayRect(for: image, in: size)

        return ZStack {
            // Background image (dimmed)
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: displayRect.width, height: displayRect.height)
                .position(x: size.width / 2, y: size.height / 2)
                .opacity(0.3)

            // Crop overlay
            CropOverlayView(
                cropRect: $cropRect,
                imageDisplayRect: displayRect,
                aspectRatio: editStates[safe: currentIndex]?.cropRatio,
                image: image
            )
            .frame(width: size.width, height: size.height)
            .onAppear {
                initializeCropRect(displayRect: displayRect)
            }
            .onChange(of: editStates[safe: currentIndex]?.cropRatio) { _, newRatio in
                adjustCropForRatio(newRatio, displayRect: displayRect)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func calculateDisplayRect(for image: UIImage, in size: CGSize) -> CGRect {
        let imageAspect = image.size.width / image.size.height
        let containerAspect = size.width / size.height

        let displaySize: CGSize
        if imageAspect > containerAspect {
            // Image is wider - fit to width
            displaySize = CGSize(width: size.width, height: size.width / imageAspect)
        } else {
            // Image is taller - fit to height
            displaySize = CGSize(width: size.height * imageAspect, height: size.height)
        }

        let offsetX = (size.width - displaySize.width) / 2
        let offsetY = (size.height - displaySize.height) / 2

        return CGRect(x: offsetX, y: offsetY, width: displaySize.width, height: displaySize.height)
    }

    // MARK: - Crop Initialization

    private func initializeCropRect(displayRect: CGRect) {
        guard !isCropInitialized || cropRect == .zero else { return }

        // Initialize crop rect to match the image display area
        let ratio = editStates[safe: currentIndex]?.cropRatio
        if let ratio = ratio {
            // Calculate crop rect with aspect ratio
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
            // Free crop - use 90% of display rect
            cropRect = displayRect.insetBy(dx: displayRect.width * 0.05, dy: displayRect.height * 0.05)
        }

        imageDisplayRect = displayRect
        isCropInitialized = true
    }

    private func adjustCropForRatio(_ ratio: Double?, displayRect: CGRect) {
        guard let ratio = ratio else {
            // Free mode - keep current rect or expand to display rect
            if cropRect.width < 50 || cropRect.height < 50 {
                cropRect = displayRect.insetBy(dx: displayRect.width * 0.05, dy: displayRect.height * 0.05)
            }
            return
        }

        // Adjust crop rect to match new ratio while keeping center
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
        )

        // Clamp to display rect bounds
        cropRect = cropRect.intersection(displayRect)
    }

    private func zoomableImage(_ image: UIImage, size: CGSize) -> some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnificationGesture()
                    .onChanged { value in
                        let delta = value / lastScale
                        lastScale = value
                        scale = min(max(scale * delta, 1), 5)
                    }
                    .onEnded { _ in
                        lastScale = 1.0
                        if scale < 1 {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                scale = 1
                                offset = .zero
                            }
                        }
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        if scale > 1 {
                            offset = CGSize(
                                width: lastOffset.width + value.translation.width,
                                height: lastOffset.height + value.translation.height
                            )
                        }
                    }
                    .onEnded { _ in
                        lastOffset = offset
                    }
            )
            .onTapGesture(count: 2) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    if scale > 1 {
                        scale = 1
                        offset = .zero
                        lastOffset = .zero
                    } else {
                        scale = 2.5
                    }
                }
            }
            .frame(width: size.width, height: size.height)
            .clipped()
    }

    // MARK: - Floating Edit Button

    private var floatingEditButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                isEditing = true
                editMode = .filter
            }
        } label: {
            ZStack {
                // Glow effect
                Circle()
                    .fill(Color.yellow.opacity(0.3))
                    .frame(width: 64, height: 64)
                    .blur(radius: 8)

                // Main button
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 56, height: 56)
                    .overlay(
                        Circle()
                            .stroke(Color.yellow.opacity(0.5), lineWidth: 2)
                    )
                    .shadow(color: .black.opacity(0.3), radius: 12, y: 6)

                // Icon
                Image(systemName: "pencil")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.yellow)
            }
        }
    }

    // MARK: - Thumbnail Carousel

    private var thumbnailCarousel: some View {
        VStack(spacing: 0) {
            // Separator line
            Rectangle()
                .fill(Color.white.opacity(0.1))
                .frame(height: 1)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(0..<editedImages.count, id: \.self) { index in
                            thumbnailItem(at: index)
                                .id(index)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                }
                .onChange(of: currentIndex) { _, newIndex in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        proxy.scrollTo(newIndex, anchor: .center)
                    }
                    // Reset crop state when changing images
                    resetCropState()
                }
            }
        }
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
        )
    }

    private func thumbnailItem(at index: Int) -> some View {
        let isSelected = index == currentIndex

        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            resetZoom()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                currentIndex = index
            }
        } label: {
            ZStack {
                if let image = editedImages[safe: index] {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                // Selection indicator
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? Color.yellow : Color.clear, lineWidth: 3)
                    .frame(width: 64, height: 64)

                // Delete badge (long press shows)
                if editedImages.count > 1 {
                    VStack {
                        HStack {
                            Spacer()
                            Button {
                                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                                deleteIndex = index
                                showDeleteConfirm = true
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(.white)
                                    .background(Circle().fill(Color.black.opacity(0.6)))
                            }
                            .offset(x: 6, y: -6)
                        }
                        Spacer()
                    }
                    .frame(width: 64, height: 64)
                }
            }
            .scaleEffect(isSelected ? 1.1 : 1.0)
            .shadow(color: isSelected ? .yellow.opacity(0.3) : .clear, radius: 8, y: 2)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Edit Controls Panel

    private var editControlsPanel: some View {
        VStack(spacing: 0) {
            // Separator
            Rectangle()
                .fill(Color.white.opacity(0.1))
                .frame(height: 1)

            // Mode tabs
            editModeTabs

            // Mode-specific controls
            Group {
                switch editMode {
                case .none:
                    EmptyView()
                case .filter:
                    filterSelector
                case .adjust:
                    adjustmentControls
                case .crop:
                    cropControls
                }
            }
            .frame(height: 120)
        }
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
        )
    }

    // MARK: - Edit Mode Tabs

    private var editModeTabs: some View {
        HStack(spacing: 0) {
            editModeTab(icon: "wand.and.stars", title: "Filtres", mode: .filter)
            editModeTab(icon: "slider.horizontal.3", title: "Ajuster", mode: .adjust)
            editModeTab(icon: "crop", title: "Recadrer", mode: .crop)

            // Rotate button (instant action)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                rotateCurrentImage()
            } label: {
                VStack(spacing: 6) {
                    Image(systemName: "rotate.right")
                        .font(.system(size: 20))
                    Text("Rotation")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(.white.opacity(0.8))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
        }
        .padding(.top, 4)
    }

    private func editModeTab(icon: String, title: String, mode: EditMode) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            // Reset crop state when switching away from crop mode
            if editMode == .crop && mode != .crop {
                resetCropState()
            }
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                editMode = mode
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(title)
                    .font(.system(size: 11, weight: .medium))
            }
            .foregroundColor(editMode == mode ? .yellow : .white.opacity(0.7))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                editMode == mode ?
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.yellow.opacity(0.15))
                    .padding(.horizontal, 8)
                : nil
            )
        }
    }

    // MARK: - Filter Selector

    @ViewBuilder
    private var filterSelector: some View {
        if isCurrentIndexValid {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(ImageFilter.allCases, id: \.self) { filter in
                        ModernFilterThumbnail(
                            image: images[currentIndex],
                            filter: filter,
                            isSelected: editStates[currentIndex].filter == filter
                        ) {
                            guard self.isCurrentIndexValid else { return }
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            editStates[currentIndex].filter = filter
                            applyFilterPreview()
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
    }

    // MARK: - Adjustment Controls

    @ViewBuilder
    private var adjustmentControls: some View {
        if isCurrentIndexValid {
            VStack(spacing: 14) {
                ModernAdjustmentSlider(
                    icon: "sun.max.fill",
                    title: "Luminosité",
                    value: $editStates[currentIndex].brightness,
                    range: -1...1,
                    defaultValue: 0
                ) {
                    applyAdjustmentsPreview()
                }

                ModernAdjustmentSlider(
                    icon: "circle.lefthalf.filled",
                    title: "Contraste",
                    value: $editStates[currentIndex].contrast,
                    range: 0.5...1.5,
                    defaultValue: 1
                ) {
                    applyAdjustmentsPreview()
                }

                ModernAdjustmentSlider(
                    icon: "drop.fill",
                    title: "Saturation",
                    value: $editStates[currentIndex].saturation,
                    range: 0...2,
                    defaultValue: 1
                ) {
                    applyAdjustmentsPreview()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Crop Controls

    @ViewBuilder
    private var cropControls: some View {
        if isCurrentIndexValid {
            VStack(spacing: 16) {
                Text("Sélectionnez un ratio")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.6))

                HStack(spacing: 16) {
                    ModernCropRatioButton(title: "Libre", ratio: nil, isSelected: editStates[currentIndex].cropRatio == nil) {
                        guard self.isCurrentIndexValid else { return }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        editStates[currentIndex].cropRatio = nil
                    }
                    ModernCropRatioButton(title: "1:1", ratio: 1.0, isSelected: editStates[currentIndex].cropRatio == 1.0) {
                        guard self.isCurrentIndexValid else { return }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        editStates[currentIndex].cropRatio = 1.0
                    }
                    ModernCropRatioButton(title: "4:3", ratio: 4.0/3.0, isSelected: editStates[currentIndex].cropRatio == 4.0/3.0) {
                        guard self.isCurrentIndexValid else { return }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        editStates[currentIndex].cropRatio = 4.0/3.0
                    }
                    ModernCropRatioButton(title: "16:9", ratio: 16.0/9.0, isSelected: editStates[currentIndex].cropRatio == 16.0/9.0) {
                        guard self.isCurrentIndexValid else { return }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        editStates[currentIndex].cropRatio = 16.0/9.0
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
        }
    }

    // MARK: - Action Bar

    private var actionBar: some View {
        HStack(spacing: 12) {
            // Retake button
            if let onRetake = onRetake, !isEditing {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onRetake()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Reprendre")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(.ultraThinMaterial)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                            )
                    )
                }
            }

            // Confirm button
            if !isEditing {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onConfirm(editedImages)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 16, weight: .bold))
                        Text(editedImages.count > 1 ? "Ajouter \(editedImages.count)" : "Ajouter")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.yellow)
                            .shadow(color: .yellow.opacity(0.3), radius: 12, y: 4)
                    )
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
        )
    }

    // MARK: - Safe Index Access

    private var isCurrentIndexValid: Bool {
        currentIndex >= 0 && currentIndex < editedImages.count && currentIndex < editStates.count && currentIndex < images.count
    }

    // MARK: - Helper Methods

    private func resetCurrentImageEdits() {
        guard isCurrentIndexValid else { return }
        editStates[currentIndex] = ImageEditState()
        editedImages[currentIndex] = images[currentIndex]
        resetZoom()
        resetCropState()
    }

    private func resetZoom() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            scale = 1
            offset = .zero
            lastOffset = .zero
        }
    }

    private func applyCurrentEdits() {
        guard isCurrentIndexValid else { return }
        let state = editStates[currentIndex]
        var result = images[currentIndex]

        // Apply crop if we have a valid crop rect
        if editMode == .crop && cropRect.width > 0 && cropRect.height > 0 && imageDisplayRect.width > 0 {
            result = applyCrop(to: result)
        }

        if state.filter != .original {
            result = ImageProcessor.applyFilter(to: result, filter: state.filter)
        }

        if state.brightness != 0 || state.contrast != 1 || state.saturation != 1 {
            result = ImageProcessor.applyAdjustments(
                to: result,
                brightness: state.brightness,
                contrast: state.contrast,
                saturation: state.saturation
            )
        }

        if state.rotation != 0 {
            result = ImageProcessor.rotate(result, degrees: state.rotation)
        }

        editedImages[currentIndex] = result

        // Reset crop state after applying
        resetCropState()
    }

    private func applyCrop(to image: UIImage) -> UIImage {
        // Convert display coordinates to image coordinates
        let scaleX = image.size.width / imageDisplayRect.width
        let scaleY = image.size.height / imageDisplayRect.height

        // Calculate crop rect in image coordinates
        let imageCropRect = CGRect(
            x: (cropRect.minX - imageDisplayRect.minX) * scaleX,
            y: (cropRect.minY - imageDisplayRect.minY) * scaleY,
            width: cropRect.width * scaleX,
            height: cropRect.height * scaleY
        )

        // Ensure crop rect is within image bounds
        let clampedRect = imageCropRect.intersection(CGRect(origin: .zero, size: image.size))

        guard clampedRect.width > 0, clampedRect.height > 0 else { return image }

        // Perform the crop
        guard let cgImage = image.cgImage?.cropping(to: clampedRect) else { return image }

        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }

    private func resetCropState() {
        cropRect = .zero
        imageDisplayRect = .zero
        isCropInitialized = false
    }

    private func applyFilterPreview() {
        guard isCurrentIndexValid else { return }
        let state = editStates[currentIndex]
        var result = images[currentIndex]

        if state.filter != .original {
            result = ImageProcessor.applyFilter(to: result, filter: state.filter)
        }

        if state.brightness != 0 || state.contrast != 1 || state.saturation != 1 {
            result = ImageProcessor.applyAdjustments(
                to: result,
                brightness: state.brightness,
                contrast: state.contrast,
                saturation: state.saturation
            )
        }

        if state.rotation != 0 {
            result = ImageProcessor.rotate(result, degrees: state.rotation)
        }

        editedImages[currentIndex] = result
    }

    private func applyAdjustmentsPreview() {
        guard isCurrentIndexValid else { return }
        let state = editStates[currentIndex]
        var result = images[currentIndex]

        if state.filter != .original {
            result = ImageProcessor.applyFilter(to: result, filter: state.filter)
        }

        result = ImageProcessor.applyAdjustments(
            to: result,
            brightness: state.brightness,
            contrast: state.contrast,
            saturation: state.saturation
        )

        if state.rotation != 0 {
            result = ImageProcessor.rotate(result, degrees: state.rotation)
        }

        editedImages[currentIndex] = result
    }

    private func rotateCurrentImage() {
        guard isCurrentIndexValid else { return }

        editStates[currentIndex].rotation = (editStates[currentIndex].rotation + 90) % 360

        let rotated = ImageProcessor.rotate(editedImages[currentIndex], degrees: 90)
        editedImages[currentIndex] = rotated
    }

    private func deleteImage(at index: Int) {
        guard editedImages.count > 1 else { return }

        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            editedImages.remove(at: index)
            editStates.remove(at: index)

            if currentIndex >= editedImages.count {
                currentIndex = editedImages.count - 1
            }
        }
    }
}

// MARK: - Image Edit State

struct ImageEditState {
    var filter: ImageFilter = .original
    var brightness: Double = 0
    var contrast: Double = 1
    var saturation: Double = 1
    var rotation: Int = 0
    var cropRatio: Double? = nil
    var cropRect: CGRect? = nil
}

// MARK: - Image Processor

enum ImageProcessor {
    private static let context = CIContext(options: [.useSoftwareRenderer: false])

    static func applyFilter(to image: UIImage, filter: ImageFilter) -> UIImage {
        return MediaFilterProcessor.applyFilter(to: image, filter: filter)
    }

    static func applyAdjustments(
        to image: UIImage,
        brightness: Double,
        contrast: Double,
        saturation: Double
    ) -> UIImage {
        guard let ciImage = CIImage(image: image) else { return image }

        let filter = CIFilter(name: "CIColorControls")!
        filter.setValue(ciImage, forKey: kCIInputImageKey)
        filter.setValue(brightness, forKey: kCIInputBrightnessKey)
        filter.setValue(contrast, forKey: kCIInputContrastKey)
        filter.setValue(saturation, forKey: kCIInputSaturationKey)

        guard let output = filter.outputImage,
              let cgImage = context.createCGImage(output, from: output.extent) else {
            return image
        }

        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }

    static func rotate(_ image: UIImage, degrees: Int) -> UIImage {
        let radians = CGFloat(degrees) * .pi / 180

        var newSize = CGRect(origin: .zero, size: image.size)
            .applying(CGAffineTransform(rotationAngle: radians))
            .size

        newSize.width = floor(newSize.width)
        newSize.height = floor(newSize.height)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        let rotated = renderer.image { context in
            let transform = CGAffineTransform(translationX: newSize.width / 2, y: newSize.height / 2)
                .rotated(by: radians)
                .translatedBy(x: -image.size.width / 2, y: -image.size.height / 2)

            context.cgContext.concatenate(transform)
            image.draw(at: .zero)
        }

        return rotated
    }

    static func crop(_ image: UIImage, to rect: CGRect) -> UIImage {
        guard let cgImage = image.cgImage?.cropping(to: rect) else {
            return image
        }
        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }
}

// MARK: - Supporting Types

enum EditMode {
    case none
    case filter
    case adjust
    case crop
}

// MARK: - Modern Filter Thumbnail

struct ModernFilterThumbnail: View {
    let image: UIImage
    let filter: ImageFilter
    let isSelected: Bool
    let action: () -> Void

    @State private var filteredImage: UIImage?

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    if let filtered = filteredImage {
                        Image(uiImage: filtered)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    if isSelected {
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.yellow, lineWidth: 3)
                            .frame(width: 72, height: 72)

                        // Checkmark
                        VStack {
                            HStack {
                                Spacer()
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(.yellow)
                                    .background(Circle().fill(Color.black))
                            }
                            Spacer()
                        }
                        .frame(width: 72, height: 72)
                        .offset(x: 4, y: -4)
                    }
                }
                .shadow(color: isSelected ? .yellow.opacity(0.3) : .black.opacity(0.2), radius: 6, y: 3)

                Text(filter.rawValue)
                    .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? .yellow : .white.opacity(0.8))
            }
        }
        .scaleEffect(isSelected ? 1.05 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isSelected)
        .task {
            if filter != .original {
                let thumbnail = await generateThumbnail()
                filteredImage = ImageProcessor.applyFilter(to: thumbnail, filter: filter)
            }
        }
    }

    private func generateThumbnail() async -> UIImage {
        let maxSize: CGFloat = 144
        let scale = min(maxSize / image.size.width, maxSize / image.size.height, 1.0)
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}

// MARK: - Modern Adjustment Slider

struct ModernAdjustmentSlider: View {
    let icon: String
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let defaultValue: Double
    let onChange: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(.yellow)
                .frame(width: 24)

            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
                .frame(width: 70, alignment: .leading)

            Slider(value: $value, in: range)
                .tint(.yellow)
                .onChange(of: value) { _, _ in
                    onChange()
                }

            // Reset button
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    value = defaultValue
                }
                onChange()
            } label: {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 14))
                    .foregroundColor(value != defaultValue ? .yellow : .white.opacity(0.3))
            }
            .disabled(value == defaultValue)
        }
    }
}

// MARK: - Modern Crop Ratio Button

struct ModernCropRatioButton: View {
    let title: String
    let ratio: Double?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .black : .white.opacity(0.8))
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(isSelected ? Color.yellow : Color.white.opacity(0.1))
                )
        }
        .scaleEffect(isSelected ? 1.05 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: isSelected)
    }
}

// MARK: - Crop Overlay View

struct CropOverlayView: View {
    @Binding var cropRect: CGRect
    let imageDisplayRect: CGRect
    let aspectRatio: Double?
    let image: UIImage

    // Handle size and hit area
    private let handleSize: CGFloat = 24
    private let handleHitArea: CGFloat = 44
    private let minCropSize: CGFloat = 60

    // Drag state
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
            // Darkened area outside crop rect
            GeometryReader { geo in
                Path { path in
                    // Full rect
                    path.addRect(CGRect(origin: .zero, size: geo.size))
                    // Cut out crop rect (inverted)
                    path.addRect(cropRect)
                }
                .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
            }
            .allowsHitTesting(false)

            // Cropped image preview
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

            // Crop frame with grid
            CropFrameView(rect: cropRect)

            // Drag handles
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

    // MARK: - Crop Handles

    private var cropHandles: some View {
        ZStack {
            // Corner handles
            cornerHandle(at: .topLeft)
            cornerHandle(at: .topRight)
            cornerHandle(at: .bottomLeft)
            cornerHandle(at: .bottomRight)

            // Edge handles (only for free aspect ratio)
            if aspectRatio == nil {
                edgeHandle(at: .top)
                edgeHandle(at: .bottom)
                edgeHandle(at: .left)
                edgeHandle(at: .right)
            }
        }
    }

    private func cornerHandle(at handle: CropHandle) -> some View {
        let position: CGPoint
        switch handle {
        case .topLeft: position = CGPoint(x: cropRect.minX, y: cropRect.minY)
        case .topRight: position = CGPoint(x: cropRect.maxX, y: cropRect.minY)
        case .bottomLeft: position = CGPoint(x: cropRect.minX, y: cropRect.maxY)
        case .bottomRight: position = CGPoint(x: cropRect.maxX, y: cropRect.maxY)
        default: position = .zero
        }

        return ZStack {
            // Hit area (invisible)
            Color.clear
                .frame(width: handleHitArea, height: handleHitArea)

            // Visual handle (L-shaped corner)
            CornerHandleShape(corner: handle)
                .stroke(Color.white, lineWidth: 3)
                .frame(width: handleSize, height: handleSize)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .position(position)
    }

    private func edgeHandle(at handle: CropHandle) -> some View {
        let position: CGPoint
        switch handle {
        case .top: position = CGPoint(x: cropRect.midX, y: cropRect.minY)
        case .bottom: position = CGPoint(x: cropRect.midX, y: cropRect.maxY)
        case .left: position = CGPoint(x: cropRect.minX, y: cropRect.midY)
        case .right: position = CGPoint(x: cropRect.maxX, y: cropRect.midY)
        default: position = .zero
        }

        let isHorizontal = handle == .top || handle == .bottom

        return ZStack {
            Color.clear
                .frame(width: handleHitArea, height: handleHitArea)

            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white)
                .frame(width: isHorizontal ? 30 : 4, height: isHorizontal ? 4 : 30)
                .shadow(color: .black.opacity(0.5), radius: 2)
        }
        .position(position)
    }

    // MARK: - Handle Detection

    private func detectHandle(at point: CGPoint) -> CropHandle {
        let threshold: CGFloat = handleHitArea / 2

        // Check corners first (priority)
        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.minY)) < threshold { return .topLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.minY)) < threshold { return .topRight }
        if distance(from: point, to: CGPoint(x: cropRect.minX, y: cropRect.maxY)) < threshold { return .bottomLeft }
        if distance(from: point, to: CGPoint(x: cropRect.maxX, y: cropRect.maxY)) < threshold { return .bottomRight }

        // Check edges (only for free ratio)
        if aspectRatio == nil {
            if abs(point.y - cropRect.minY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .top }
            if abs(point.y - cropRect.maxY) < threshold && point.x > cropRect.minX && point.x < cropRect.maxX { return .bottom }
            if abs(point.x - cropRect.minX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .left }
            if abs(point.x - cropRect.maxX) < threshold && point.y > cropRect.minY && point.y < cropRect.maxY { return .right }
        }

        // Check if inside crop rect (move)
        if cropRect.contains(point) { return .center }

        return .none
    }

    private func distance(from p1: CGPoint, to p2: CGPoint) -> CGFloat {
        sqrt(pow(p1.x - p2.x, 2) + pow(p1.y - p2.y, 2))
    }

    // MARK: - Crop Rect Updates

    private func updateCropRect(with translation: CGSize, handle: CropHandle) {
        var newRect = cropRect

        switch handle {
        case .none:
            return

        case .center:
            // Move entire rect
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

        // Enforce minimum size
        if newRect.width >= minCropSize && newRect.height >= minCropSize {
            cropRect = newRect
        }
    }

    private func constrainCropRect() {
        // Ensure crop rect stays within image bounds
        var constrained = cropRect

        // Clamp size
        constrained.size.width = max(minCropSize, min(constrained.width, imageDisplayRect.width))
        constrained.size.height = max(minCropSize, min(constrained.height, imageDisplayRect.height))

        // Clamp position
        constrained.origin.x = max(imageDisplayRect.minX, min(constrained.origin.x, imageDisplayRect.maxX - constrained.width))
        constrained.origin.y = max(imageDisplayRect.minY, min(constrained.origin.y, imageDisplayRect.maxY - constrained.height))

        withAnimation(.easeOut(duration: 0.2)) {
            cropRect = constrained
        }
    }
}

// MARK: - Crop Frame View

struct CropFrameView: View {
    let rect: CGRect

    var body: some View {
        ZStack {
            // Frame border
            Rectangle()
                .stroke(Color.white, lineWidth: 1.5)
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .shadow(color: .black.opacity(0.3), radius: 2)

            // Grid lines (rule of thirds)
            GridLinesView()
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
        }
    }
}

struct GridLinesView: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Vertical lines
                Path { path in
                    path.move(to: CGPoint(x: geo.size.width / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width / 3, y: geo.size.height))
                    path.move(to: CGPoint(x: geo.size.width * 2 / 3, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width * 2 / 3, y: geo.size.height))
                }
                .stroke(Color.white.opacity(0.5), lineWidth: 0.5)

                // Horizontal lines
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

struct CornerHandleShape: Shape {
    let corner: CropOverlayView.CropHandle

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let length: CGFloat = rect.width * 0.6

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

// MARK: - Safe Array Access

fileprivate extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Preview

#Preview("Single Image") {
    ImageEditorView(
        image: UIImage(systemName: "photo.fill")!,
        onConfirm: { _ in },
        onCancel: {}
    )
}

#Preview("Multiple Images") {
    ImageEditorView(
        images: [
            UIImage(systemName: "photo.fill")!,
            UIImage(systemName: "photo.on.rectangle")!,
            UIImage(systemName: "photo.stack")!
        ],
        onConfirm: { _ in },
        onCancel: {}
    )
}
