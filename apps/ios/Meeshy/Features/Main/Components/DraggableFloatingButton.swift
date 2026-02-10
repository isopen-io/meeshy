import SwiftUI

// MARK: - Button Position (stored as normalized 0-1 values)
struct ButtonPosition: Equatable {
    var x: CGFloat  // 0 = left edge, 1 = right edge
    var y: CGFloat  // 0 = top, 1 = bottom

    static let topLeft = ButtonPosition(x: 0, y: 0)
    static let topRight = ButtonPosition(x: 1, y: 0)
    static let bottomLeft = ButtonPosition(x: 0, y: 1)
    static let bottomRight = ButtonPosition(x: 1, y: 1)

    var isLeft: Bool { x < 0.5 }
    var isTop: Bool { y < 0.5 }
}

// MARK: - Legacy ButtonCorner (for compatibility)
enum ButtonCorner: String, CaseIterable {
    case topLeft = "topLeft"
    case topRight = "topRight"
    case bottomLeft = "bottomLeft"
    case bottomRight = "bottomRight"

    var isTop: Bool {
        self == .topLeft || self == .topRight
    }

    var isLeft: Bool {
        self == .topLeft || self == .bottomLeft
    }

    var position: ButtonPosition {
        switch self {
        case .topLeft: return .topLeft
        case .topRight: return .topRight
        case .bottomLeft: return .bottomLeft
        case .bottomRight: return .bottomRight
        }
    }
}

// MARK: - Free Position Floating Buttons Container
struct FreeFloatingButtonsContainer<LeftContent: View, RightContent: View>: View {
    // Position stored as "x,y" string for AppStorage compatibility
    @Binding var leftPositionRaw: String
    @Binding var rightPositionRaw: String

    let leftContent: LeftContent
    let rightContent: RightContent
    let onLeftTap: () -> Void
    let onRightTap: () -> Void
    var onLeftLongPress: (() -> Void)? = nil
    var isSearchBarVisible: Bool = true

    private let buttonSize: CGFloat = 52
    private let minEdgePadding: CGFloat = 20      // Minimum distance from edges
    private let topSafeZone: CGFloat = 50         // Extra space for status bar
    private let bottomSafeZoneWithSearch: CGFloat = 110  // Above search bar
    private let bottomSafeZoneNoSearch: CGFloat = 50

    init(
        leftPosition: Binding<String>,
        rightPosition: Binding<String>,
        onLeftTap: @escaping () -> Void,
        onRightTap: @escaping () -> Void,
        onLeftLongPress: (() -> Void)? = nil,
        isSearchBarVisible: Bool = true,
        @ViewBuilder leftContent: () -> LeftContent,
        @ViewBuilder rightContent: () -> RightContent
    ) {
        self._leftPositionRaw = leftPosition
        self._rightPositionRaw = rightPosition
        self.onLeftTap = onLeftTap
        self.onRightTap = onRightTap
        self.onLeftLongPress = onLeftLongPress
        self.isSearchBarVisible = isSearchBarVisible
        self.leftContent = leftContent()
        self.rightContent = rightContent()
    }

    private var currentBottomSafeZone: CGFloat {
        isSearchBarVisible ? bottomSafeZoneWithSearch : bottomSafeZoneNoSearch
    }

    private func parsePosition(_ raw: String, default defaultPos: ButtonPosition) -> ButtonPosition {
        let parts = raw.split(separator: ",")
        guard parts.count == 2,
              let x = Double(parts[0]),
              let y = Double(parts[1]) else {
            return defaultPos
        }
        return ButtonPosition(x: CGFloat(x), y: CGFloat(y))
    }

    var body: some View {
        GeometryReader { geometry in
            let safeArea = geometry.safeAreaInsets
            let size = geometry.size

            ZStack {
                // Left button (Feed)
                FreeFloatingButton(
                    position: Binding(
                        get: { parsePosition(leftPositionRaw, default: .topLeft) },
                        set: { leftPositionRaw = "\($0.x),\($0.y)" }
                    ),
                    screenSize: size,
                    safeArea: safeArea,
                    buttonSize: buttonSize,
                    minEdgePadding: minEdgePadding,
                    topSafeZone: topSafeZone,
                    bottomSafeZone: currentBottomSafeZone,
                    snapToEdges: true,
                    onTap: onLeftTap,
                    onLongPress: onLeftLongPress
                ) {
                    leftContent
                }

                // Right button (Menu)
                FreeFloatingButton(
                    position: Binding(
                        get: { parsePosition(rightPositionRaw, default: .topRight) },
                        set: { rightPositionRaw = "\($0.x),\($0.y)" }
                    ),
                    screenSize: size,
                    safeArea: safeArea,
                    buttonSize: buttonSize,
                    minEdgePadding: minEdgePadding,
                    topSafeZone: topSafeZone,
                    bottomSafeZone: currentBottomSafeZone,
                    snapToEdges: true,
                    onTap: onRightTap
                ) {
                    rightContent
                }
            }
        }
        .ignoresSafeArea()
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isSearchBarVisible)
    }
}

// MARK: - Free Floating Button
struct FreeFloatingButton<Content: View>: View {
    @Binding var position: ButtonPosition
    let screenSize: CGSize
    let safeArea: EdgeInsets
    let buttonSize: CGFloat
    let minEdgePadding: CGFloat
    let topSafeZone: CGFloat
    let bottomSafeZone: CGFloat
    let snapToEdges: Bool
    let onTap: () -> Void
    var onLongPress: (() -> Void)? = nil
    let content: Content

    @State private var dragOffset: CGSize = .zero
    @State private var isDragging = false

    init(
        position: Binding<ButtonPosition>,
        screenSize: CGSize,
        safeArea: EdgeInsets,
        buttonSize: CGFloat,
        minEdgePadding: CGFloat,
        topSafeZone: CGFloat,
        bottomSafeZone: CGFloat,
        snapToEdges: Bool = true,
        onTap: @escaping () -> Void,
        onLongPress: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self._position = position
        self.screenSize = screenSize
        self.safeArea = safeArea
        self.buttonSize = buttonSize
        self.minEdgePadding = minEdgePadding
        self.topSafeZone = topSafeZone
        self.bottomSafeZone = bottomSafeZone
        self.snapToEdges = snapToEdges
        self.onTap = onTap
        self.onLongPress = onLongPress
        self.content = content()
    }

    // Calculate the usable area bounds
    private var bounds: (minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat) {
        let halfButton = buttonSize / 2
        let minX = safeArea.leading + minEdgePadding + halfButton
        let maxX = screenSize.width - safeArea.trailing - minEdgePadding - halfButton
        let minY = safeArea.top + topSafeZone + halfButton
        let maxY = screenSize.height - safeArea.bottom - bottomSafeZone - halfButton
        return (minX, maxX, minY, maxY)
    }

    // Convert normalized position to screen coordinates
    private func screenPosition(for pos: ButtonPosition) -> CGPoint {
        let b = bounds
        let x = b.minX + (b.maxX - b.minX) * pos.x
        let y = b.minY + (b.maxY - b.minY) * pos.y
        return CGPoint(x: x, y: y)
    }

    // Convert screen coordinates to normalized position
    private func normalizedPosition(from point: CGPoint) -> ButtonPosition {
        let b = bounds
        let rangeX = b.maxX - b.minX
        let rangeY = b.maxY - b.minY

        var x = rangeX > 0 ? (point.x - b.minX) / rangeX : 0.5
        var y = rangeY > 0 ? (point.y - b.minY) / rangeY : 0.5

        // Clamp to valid range
        x = max(0, min(1, x))
        y = max(0, min(1, y))

        // Snap to left/right edges if enabled
        if snapToEdges {
            x = x < 0.5 ? 0 : 1
        }

        return ButtonPosition(x: x, y: y)
    }

    var body: some View {
        let pos = screenPosition(for: position)

        content
            .frame(width: buttonSize, height: buttonSize)
            .background(
                Circle()
                    .fill(.ultraThinMaterial)
                    .shadow(color: Color.black.opacity(0.35), radius: 10, x: 0, y: 5)
            )
            .overlay(
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(0.35), Color.white.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1.5
                    )
            )
            .scaleEffect(isDragging ? 1.15 : 1.0)
            .position(x: pos.x + dragOffset.width, y: pos.y + dragOffset.height)
            .gesture(dragGesture(from: pos))
            .simultaneousGesture(tapGesture)
            .simultaneousGesture(longPressGesture)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isDragging)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: position)
    }

    private func dragGesture(from startPos: CGPoint) -> some Gesture {
        DragGesture()
            .onChanged { value in
                isDragging = true
                dragOffset = value.translation
            }
            .onEnded { value in
                let endPoint = CGPoint(
                    x: startPos.x + value.translation.width,
                    y: startPos.y + value.translation.height
                )
                let newPosition = normalizedPosition(from: endPoint)

                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                    position = newPosition
                    dragOffset = .zero
                    isDragging = false
                }

                HapticFeedback.light()
            }
    }

    private var tapGesture: some Gesture {
        TapGesture()
            .onEnded {
                HapticFeedback.light()
                onTap()
            }
    }

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.5)
            .onEnded { _ in
                HapticFeedback.medium()
                onLongPress?()
            }
    }
}

// MARK: - Legacy Container (for backward compatibility)
struct FloatingButtonsContainer<LeftContent: View, RightContent: View>: View {
    @Binding var leftCorner: ButtonCorner
    @Binding var rightCorner: ButtonCorner
    let leftContent: LeftContent
    let rightContent: RightContent
    let onLeftTap: () -> Void
    let onRightTap: () -> Void
    var onLeftLongPress: (() -> Void)? = nil
    var isSearchBarVisible: Bool = true

    private let buttonSize: CGFloat = 52
    private let horizontalPadding: CGFloat = 44
    private let topPadding: CGFloat = 44
    private let bottomPaddingWithSearch: CGFloat = 100
    private let bottomPaddingNoSearch: CGFloat = 44

    init(
        leftCorner: Binding<ButtonCorner>,
        rightCorner: Binding<ButtonCorner>,
        onLeftTap: @escaping () -> Void,
        onRightTap: @escaping () -> Void,
        onLeftLongPress: (() -> Void)? = nil,
        isSearchBarVisible: Bool = true,
        @ViewBuilder leftContent: () -> LeftContent,
        @ViewBuilder rightContent: () -> RightContent
    ) {
        self._leftCorner = leftCorner
        self._rightCorner = rightCorner
        self.onLeftTap = onLeftTap
        self.onRightTap = onRightTap
        self.onLeftLongPress = onLeftLongPress
        self.isSearchBarVisible = isSearchBarVisible
        self.leftContent = leftContent()
        self.rightContent = rightContent()
    }

    private var currentBottomPadding: CGFloat {
        isSearchBarVisible ? bottomPaddingWithSearch : bottomPaddingNoSearch
    }

    var body: some View {
        GeometryReader { geometry in
            let safeArea = geometry.safeAreaInsets
            let size = geometry.size

            ZStack {
                LegacyFloatingButton(
                    corner: $leftCorner,
                    screenSize: size,
                    safeArea: safeArea,
                    buttonSize: buttonSize,
                    horizontalPadding: horizontalPadding,
                    topPadding: topPadding,
                    bottomPadding: currentBottomPadding,
                    onTap: onLeftTap,
                    onLongPress: onLeftLongPress
                ) {
                    leftContent
                }

                LegacyFloatingButton(
                    corner: $rightCorner,
                    screenSize: size,
                    safeArea: safeArea,
                    buttonSize: buttonSize,
                    horizontalPadding: horizontalPadding,
                    topPadding: topPadding,
                    bottomPadding: currentBottomPadding,
                    onTap: onRightTap
                ) {
                    rightContent
                }
            }
        }
        .ignoresSafeArea()
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isSearchBarVisible)
    }
}

// MARK: - Legacy Floating Button
struct LegacyFloatingButton<Content: View>: View {
    @Binding var corner: ButtonCorner
    let screenSize: CGSize
    let safeArea: EdgeInsets
    let buttonSize: CGFloat
    let horizontalPadding: CGFloat
    let topPadding: CGFloat
    let bottomPadding: CGFloat
    let onTap: () -> Void
    var onLongPress: (() -> Void)? = nil
    let content: Content

    @State private var dragOffset: CGSize = .zero
    @State private var isDragging = false

    init(
        corner: Binding<ButtonCorner>,
        screenSize: CGSize,
        safeArea: EdgeInsets,
        buttonSize: CGFloat,
        horizontalPadding: CGFloat,
        topPadding: CGFloat,
        bottomPadding: CGFloat,
        onTap: @escaping () -> Void,
        onLongPress: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self._corner = corner
        self.screenSize = screenSize
        self.safeArea = safeArea
        self.buttonSize = buttonSize
        self.horizontalPadding = horizontalPadding
        self.topPadding = topPadding
        self.bottomPadding = bottomPadding
        self.onTap = onTap
        self.onLongPress = onLongPress
        self.content = content()
    }

    private func position(for corner: ButtonCorner) -> CGPoint {
        let halfButton = buttonSize / 2
        let leftX = safeArea.leading + horizontalPadding + halfButton
        let rightX = screenSize.width - safeArea.trailing - horizontalPadding - halfButton
        let topY = safeArea.top + topPadding + halfButton
        let bottomY = screenSize.height - safeArea.bottom - bottomPadding - halfButton

        switch corner {
        case .topLeft: return CGPoint(x: leftX, y: topY)
        case .topRight: return CGPoint(x: rightX, y: topY)
        case .bottomLeft: return CGPoint(x: leftX, y: bottomY)
        case .bottomRight: return CGPoint(x: rightX, y: bottomY)
        }
    }

    var body: some View {
        let pos = position(for: corner)

        content
            .frame(width: buttonSize, height: buttonSize)
            .background(
                Circle()
                    .fill(.ultraThinMaterial)
                    .shadow(color: Color.black.opacity(0.35), radius: 10, x: 0, y: 5)
            )
            .overlay(
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(0.35), Color.white.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1.5
                    )
            )
            .scaleEffect(isDragging ? 1.12 : 1.0)
            .position(x: pos.x + dragOffset.width, y: pos.y + dragOffset.height)
            .gesture(dragGesture(from: pos))
            .simultaneousGesture(tapGesture)
            .simultaneousGesture(longPressGesture)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isDragging)
    }

    private func dragGesture(from startPos: CGPoint) -> some Gesture {
        DragGesture()
            .onChanged { value in
                isDragging = true
                dragOffset = value.translation
            }
            .onEnded { value in
                let endPoint = CGPoint(
                    x: startPos.x + value.translation.width,
                    y: startPos.y + value.translation.height
                )
                let newCorner = findNearestCorner(to: endPoint)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                    corner = newCorner
                    dragOffset = .zero
                    isDragging = false
                }
            }
    }

    private var tapGesture: some Gesture {
        TapGesture()
            .onEnded {
                HapticFeedback.light()
                onTap()
            }
    }

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.5)
            .onEnded { _ in
                HapticFeedback.medium()
                onLongPress?()
            }
    }

    private func findNearestCorner(to point: CGPoint) -> ButtonCorner {
        var nearest = corner
        var minDist: CGFloat = .infinity

        for c in ButtonCorner.allCases {
            let p = position(for: c)
            let dist = hypot(point.x - p.x, point.y - p.y)
            if dist < minDist {
                minDist = dist
                nearest = c
            }
        }
        return nearest
    }
}

// MARK: - Notification Badge
struct NotificationBadge: View {
    let count: Int
    @State private var isPulsing = false

    var body: some View {
        if count > 0 {
            ZStack {
                // Pulse ring behind badge
                Circle()
                    .fill(Color(hex: "FF2E63").opacity(isPulsing ? 0 : 0.4))
                    .frame(width: isPulsing ? 28 : 18, height: isPulsing ? 28 : 18)

                Text("\(min(count, 99))")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle()
                            .fill(Color(hex: "FF2E63"))
                            .shadow(color: Color(hex: "FF2E63").opacity(0.5), radius: 3)
                    )
            }
            .offset(x: 16, y: -16)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    isPulsing = true
                }
            }
        }
    }
}
