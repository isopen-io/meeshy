import SwiftUI

// MARK: - Button Position (stored as normalized 0-1 values)
public struct ButtonPosition: Equatable, Sendable {
    public var x: CGFloat
    public var y: CGFloat

    public init(x: CGFloat, y: CGFloat) {
        self.x = x; self.y = y
    }

    public static let topLeft = ButtonPosition(x: 0, y: 0)
    public static let topRight = ButtonPosition(x: 1, y: 0)
    public static let bottomLeft = ButtonPosition(x: 0, y: 1)
    public static let bottomRight = ButtonPosition(x: 1, y: 1)

    public var isLeft: Bool { x < 0.5 }
    public var isTop: Bool { y < 0.5 }
}

// MARK: - Bandes réservées d'avant #9679

/// Les bandes que les boutons flottants ne pouvaient pas mordre avant #9679 :
/// 246 pt en haut (encoche majorée + en-tête étendu + bande de stories, la zone
/// sûre lue étant NULLE sous `.ignoresSafeArea()`) et 110 pt en bas.
///
/// Elles ne bornent plus rien : la plage est désormais la zone sûre réelle
/// (`FloatingButtonGeometry`). Elles servent à RELIRE une position persistée
/// sous l'ancienne forme `x,y` — dont les positions par défaut — à l'endroit
/// exact où l'ancienne géométrie la posait : le Flux et le Menu par défaut
/// restent sous la bande de stories (#9363), et une position choisie avant la
/// mise à jour ne saute pas ailleurs.
public enum FloatingButtonSafeZone {
    /// La plus haute encoche du parc pris en charge (Dynamic Island).
    nonisolated public static var maxTopInset: CGFloat { 62 }

    /// La bande de stories posée SOUS l'en-tête étendu, au repos (#9363) —
    /// la plus haute des bandes de l'app (le tray du flux, 120 pt) ; l'app
    /// vérifie qu'aucune ne la dépasse (`FeedButtonAnchorTests`).
    nonisolated public static var storyBand: CGFloat { 120 }

    /// Encoche + barre de titre étendue + bande de stories.
    nonisolated public static var top: CGFloat {
        maxTopInset + CollapsibleHeaderMetrics.expandedHeight + storyBand
    }

    /// La bande du bas, barre de recherche visible (l'état au repos).
    nonisolated public static var legacyBottom: CGFloat { 110 }
}

// MARK: - Legacy ButtonCorner (for compatibility)
public enum ButtonCorner: String, CaseIterable {
    case topLeft = "topLeft"
    case topRight = "topRight"
    case bottomLeft = "bottomLeft"
    case bottomRight = "bottomRight"

    public var isTop: Bool {
        self == .topLeft || self == .topRight
    }

    public var isLeft: Bool {
        self == .topLeft || self == .bottomLeft
    }

    public var position: ButtonPosition {
        switch self {
        case .topLeft: return .topLeft
        case .topRight: return .topRight
        case .bottomLeft: return .bottomLeft
        case .bottomRight: return .bottomRight
        }
    }
}

// MARK: - Free Position Floating Buttons Container

/// Les deux boutons flottants, posables à n'importe quelle hauteur, contre le
/// bord gauche ou droit (#9679). Toute la géométrie vient de
/// `FloatingButtonGeometry` ; le conteneur la remonte par
/// `FloatingButtonGeometryKey` pour l'échelle du menu et l'ancre des réels.
public struct FreeFloatingButtonsContainer<LeftContent: View, RightContent: View>: View {
    @Binding public var leftPositionRaw: String
    @Binding public var rightPositionRaw: String

    public let leftContent: LeftContent
    public let rightContent: RightContent
    public let onLeftTap: () -> Void
    public let onRightTap: () -> Void
    public var onLeftLongPress: (() -> Void)? = nil
    public var onRightLongPress: (() -> Void)? = nil
    public var leftA11yLabel: String
    public var leftA11yHint: String? = nil
    public var leftA11yValue: String? = nil
    public var leftA11yActionName: String? = nil
    public var rightA11yLabel: String
    public var rightA11yHint: String? = nil
    public var rightA11yValue: String? = nil
    public var rightA11yActionName: String? = nil

    public init(
        leftPosition: Binding<String>,
        rightPosition: Binding<String>,
        leftA11yLabel: String,
        rightA11yLabel: String,
        onLeftTap: @escaping () -> Void,
        onRightTap: @escaping () -> Void,
        onLeftLongPress: (() -> Void)? = nil,
        onRightLongPress: (() -> Void)? = nil,
        leftA11yHint: String? = nil,
        leftA11yValue: String? = nil,
        leftA11yActionName: String? = nil,
        rightA11yHint: String? = nil,
        rightA11yValue: String? = nil,
        rightA11yActionName: String? = nil,
        @ViewBuilder leftContent: () -> LeftContent,
        @ViewBuilder rightContent: () -> RightContent
    ) {
        self._leftPositionRaw = leftPosition
        self._rightPositionRaw = rightPosition
        self.onLeftTap = onLeftTap
        self.onRightTap = onRightTap
        self.onLeftLongPress = onLeftLongPress
        self.onRightLongPress = onRightLongPress
        self.leftA11yLabel = leftA11yLabel
        self.leftA11yHint = leftA11yHint
        self.leftA11yValue = leftA11yValue
        self.leftA11yActionName = leftA11yActionName
        self.rightA11yLabel = rightA11yLabel
        self.rightA11yHint = rightA11yHint
        self.rightA11yValue = rightA11yValue
        self.rightA11yActionName = rightA11yActionName
        self.leftContent = leftContent()
        self.rightContent = rightContent()
    }

    public var body: some View {
        FloatingButtonsSafeAreaReader { geometry in
            if geometry.isMeasured {
                buttons(in: geometry)
            }
        }
    }

    private func buttons(in geometry: FloatingButtonGeometry) -> some View {
        let layout = geometry.layout(feedStorage: leftPositionRaw, menuStorage: rightPositionRaw)
        return ZStack {
            FreeFloatingButton(
                center: geometry.local(layout.feed),
                buttonSize: FloatingButtonGeometry.buttonSize,
                onDragEnded: { translation in
                    guard let stored = geometry.storage(afterDragFrom: layout.feed, translation: translation, avoiding: layout.menu) else { return }
                    leftPositionRaw = stored
                },
                onTap: onLeftTap,
                onLongPress: onLeftLongPress,
                a11yLabel: leftA11yLabel,
                a11yHint: leftA11yHint,
                a11yValue: leftA11yValue,
                a11yActionName: leftA11yActionName
            ) {
                leftContent
            }

            FreeFloatingButton(
                center: geometry.local(layout.menu),
                buttonSize: FloatingButtonGeometry.buttonSize,
                onDragEnded: { translation in
                    guard let stored = geometry.storage(afterDragFrom: layout.menu, translation: translation, avoiding: layout.feed) else { return }
                    rightPositionRaw = stored
                },
                onTap: onRightTap,
                onLongPress: onRightLongPress,
                a11yLabel: rightA11yLabel,
                a11yHint: rightA11yHint,
                a11yValue: rightA11yValue,
                a11yActionName: rightA11yActionName
            ) {
                rightContent
            }
        }
        .preference(key: FloatingButtonGeometryKey.self, value: geometry)
    }
}

// MARK: - Free Floating Button

/// Un disque flottant posé en `center` (repère du conteneur qui le dessine). Il suit
/// le doigt image par image pendant le glisser ; à la levée, `onDragEnded`
/// reçoit la course, et la géométrie décide s'il y a quelque chose à écrire
/// (`FloatingButtonGeometry.storage(afterDragFrom:…)`).
public struct FreeFloatingButton<Content: View>: View {
    public let center: CGPoint
    public let buttonSize: CGFloat
    public let onDragEnded: (CGSize) -> Void
    public let onTap: () -> Void
    public var onLongPress: (() -> Void)? = nil
    public var a11yLabel: String? = nil
    public var a11yHint: String? = nil
    public var a11yValue: String? = nil
    public var a11yActionName: String? = nil
    public let content: Content

    @State private var dragOffset: CGSize = .zero
    @State private var isDragging = false

    public init(
        center: CGPoint,
        buttonSize: CGFloat,
        onDragEnded: @escaping (CGSize) -> Void,
        onTap: @escaping () -> Void,
        onLongPress: (() -> Void)? = nil,
        a11yLabel: String? = nil,
        a11yHint: String? = nil,
        a11yValue: String? = nil,
        a11yActionName: String? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.center = center
        self.buttonSize = buttonSize
        self.onDragEnded = onDragEnded
        self.onTap = onTap
        self.onLongPress = onLongPress
        self.a11yLabel = a11yLabel
        self.a11yHint = a11yHint
        self.a11yValue = a11yValue
        self.a11yActionName = a11yActionName
        self.content = content()
    }

    public var body: some View {
        content
            .frame(width: buttonSize, height: buttonSize)
            .background(
                Circle()
                    .fill(.ultraThinMaterial)
                    .shadow(color: Color.black.opacity(MeeshyOpacity.medium), radius: 10, x: 0, y: 5)
            )
            .overlay(
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(MeeshyOpacity.medium), Color.white.opacity(MeeshyOpacity.subtle)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1.5
                    )
            )
            .scaleEffect(isDragging ? 1.15 : 1.0)
            .position(x: center.x + dragOffset.width, y: center.y + dragOffset.height)
            .gesture(dragGesture)
            .simultaneousGesture(tapGesture)
            .simultaneousGesture(longPressGesture)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isDragging)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: center)
            .floatingButtonAccessibility(
                label: a11yLabel,
                hint: a11yHint,
                value: a11yValue,
                actionName: a11yActionName,
                onTap: onTap,
                onLongPress: onLongPress
            )
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: FloatingButtonGeometry.dragThreshold)
            .onChanged { value in
                isDragging = true
                dragOffset = value.translation
            }
            .onEnded { value in
                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                    onDragEnded(value.translation)
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

// MARK: - Floating Button Accessibility

private extension View {
    /// Makes a gesture-driven floating button reachable by assistive technologies.
    ///
    /// The floating buttons activate via `.simultaneousGesture(TapGesture)` rather than a
    /// `Button`, so VoiceOver cannot trigger them on its own — the explicit
    /// `accessibilityAction(.default)` wires double-tap activation, and `.isButton`
    /// announces the element as a button. Treatment is opt-in: callers that pass no label
    /// keep the previous behaviour untouched.
    @ViewBuilder
    func floatingButtonAccessibility(
        label: String?,
        hint: String?,
        value: String?,
        actionName: String?,
        onTap: @escaping () -> Void,
        onLongPress: (() -> Void)?
    ) -> some View {
        if let label {
            let base = self
                .accessibilityElement(children: .ignore)
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel(label)
                .accessibilityValue(value ?? "")
                .accessibilityHint(hint ?? "")
                .accessibilityAction { onTap() }
            if let actionName, let onLongPress {
                base.accessibilityAction(named: Text(actionName)) { onLongPress() }
            } else {
                base
            }
        } else {
            self
        }
    }
}

// MARK: - Legacy Container (for backward compatibility)
public struct FloatingButtonsContainer<LeftContent: View, RightContent: View>: View {
    @Binding public var leftCorner: ButtonCorner
    @Binding public var rightCorner: ButtonCorner
    public let leftContent: LeftContent
    public let rightContent: RightContent
    public let onLeftTap: () -> Void
    public let onRightTap: () -> Void
    public var onLeftLongPress: (() -> Void)? = nil
    public var onRightLongPress: (() -> Void)? = nil
    public var isSearchBarVisible: Bool = true
    public var leftA11yLabel: String
    public var leftA11yHint: String? = nil
    public var leftA11yValue: String? = nil
    public var leftA11yActionName: String? = nil
    public var rightA11yLabel: String
    public var rightA11yHint: String? = nil
    public var rightA11yValue: String? = nil
    public var rightA11yActionName: String? = nil

    private let buttonSize: CGFloat = 52
    private let horizontalPadding: CGFloat = 44
    private let topPadding: CGFloat = 44
    private let bottomPaddingWithSearch: CGFloat = 100
    private let bottomPaddingNoSearch: CGFloat = 44

    public init(
        leftCorner: Binding<ButtonCorner>,
        rightCorner: Binding<ButtonCorner>,
        leftA11yLabel: String,
        rightA11yLabel: String,
        onLeftTap: @escaping () -> Void,
        onRightTap: @escaping () -> Void,
        onLeftLongPress: (() -> Void)? = nil,
        onRightLongPress: (() -> Void)? = nil,
        isSearchBarVisible: Bool = true,
        leftA11yHint: String? = nil,
        leftA11yValue: String? = nil,
        leftA11yActionName: String? = nil,
        rightA11yHint: String? = nil,
        rightA11yValue: String? = nil,
        rightA11yActionName: String? = nil,
        @ViewBuilder leftContent: () -> LeftContent,
        @ViewBuilder rightContent: () -> RightContent
    ) {
        self._leftCorner = leftCorner
        self._rightCorner = rightCorner
        self.onLeftTap = onLeftTap
        self.onRightTap = onRightTap
        self.onLeftLongPress = onLeftLongPress
        self.onRightLongPress = onRightLongPress
        self.isSearchBarVisible = isSearchBarVisible
        self.leftA11yLabel = leftA11yLabel
        self.leftA11yHint = leftA11yHint
        self.leftA11yValue = leftA11yValue
        self.leftA11yActionName = leftA11yActionName
        self.rightA11yLabel = rightA11yLabel
        self.rightA11yHint = rightA11yHint
        self.rightA11yValue = rightA11yValue
        self.rightA11yActionName = rightA11yActionName
        self.leftContent = leftContent()
        self.rightContent = rightContent()
    }

    private var currentBottomPadding: CGFloat {
        isSearchBarVisible ? bottomPaddingWithSearch : bottomPaddingNoSearch
    }

    public var body: some View {
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
                    onLongPress: onLeftLongPress,
                    a11yLabel: leftA11yLabel,
                    a11yHint: leftA11yHint,
                    a11yValue: leftA11yValue,
                    a11yActionName: leftA11yActionName
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
                    onTap: onRightTap,
                    onLongPress: onRightLongPress,
                    a11yLabel: rightA11yLabel,
                    a11yHint: rightA11yHint,
                    a11yValue: rightA11yValue,
                    a11yActionName: rightA11yActionName
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
public struct LegacyFloatingButton<Content: View>: View {
    @Binding public var corner: ButtonCorner
    public let screenSize: CGSize
    public let safeArea: EdgeInsets
    public let buttonSize: CGFloat
    public let horizontalPadding: CGFloat
    public let topPadding: CGFloat
    public let bottomPadding: CGFloat
    public let onTap: () -> Void
    public var onLongPress: (() -> Void)? = nil
    public var a11yLabel: String? = nil
    public var a11yHint: String? = nil
    public var a11yValue: String? = nil
    public var a11yActionName: String? = nil
    public let content: Content

    @State private var dragOffset: CGSize = .zero
    @State private var isDragging = false

    public init(
        corner: Binding<ButtonCorner>,
        screenSize: CGSize,
        safeArea: EdgeInsets,
        buttonSize: CGFloat,
        horizontalPadding: CGFloat,
        topPadding: CGFloat,
        bottomPadding: CGFloat,
        onTap: @escaping () -> Void,
        onLongPress: (() -> Void)? = nil,
        a11yLabel: String? = nil,
        a11yHint: String? = nil,
        a11yValue: String? = nil,
        a11yActionName: String? = nil,
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
        self.a11yLabel = a11yLabel
        self.a11yHint = a11yHint
        self.a11yValue = a11yValue
        self.a11yActionName = a11yActionName
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

    public var body: some View {
        let pos = position(for: corner)

        content
            .frame(width: buttonSize, height: buttonSize)
            .background(
                Circle()
                    .fill(.ultraThinMaterial)
                    .shadow(color: Color.black.opacity(MeeshyOpacity.medium), radius: 10, x: 0, y: 5)
            )
            .overlay(
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color.white.opacity(MeeshyOpacity.medium), Color.white.opacity(MeeshyOpacity.subtle)],
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
            .floatingButtonAccessibility(
                label: a11yLabel,
                hint: a11yHint,
                value: a11yValue,
                actionName: a11yActionName,
                onTap: onTap,
                onLongPress: onLongPress
            )
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
public struct NotificationBadge: View {
    public let count: Int
    @State private var isPulsing = false
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    // MARK: - Trame (exposée pour les tests)

    public static let height: CGFloat = 18
    /// Largeur plancher égale à la hauteur : à un chiffre, la pastille reste un
    /// CERCLE. C'est ce qui la distingue d'une étiquette.
    public static let minimumSize: CGFloat = height
    /// De quoi loger trois glyphes (« 99+ ») sans rogner le texte.
    public static let horizontalPadding: CGFloat = 6
    /// Pas de gras : sur deux chiffres blancs dans un disque rouge saturé il
    /// n'ajoute aucune lisibilité, il empâte les glyphes et fait baver le
    /// compteur sur le bord. Le repère visuel est la pastille, pas la graisse.
    public static let fontWeight: Font.Weight = .semibold

    /// Texte du compteur. Au-delà de 99 on annonce « 99+ » — et non `min(count,
    /// 99)`, qui affichait « 99 » : un nombre FAUX présenté comme exact.
    public static func displayed(_ count: Int) -> String {
        guard count > 0 else { return "" }
        return count >= 100 ? "99+" : "\(count)"
    }

    public init(count: Int) {
        self.count = count
    }

    public var body: some View {
        if count > 0 {
            Text(Self.displayed(count))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: Self.fontWeight))
                .foregroundColor(.white)
                .lineLimit(1)
                // Ni `minimumScaleFactor`, ni cadre carré figé : la pastille
                // s'ÉLARGIT. L'ancien 18×18 forçait « 71 » à rétrécir et aurait
                // rendu « 99+ » illisible — on tronquait la donnée, ou sa
                // lisibilité, pour protéger la mise en page.
                .padding(.horizontal, Self.horizontalPadding)
                .frame(minWidth: Self.minimumSize, minHeight: Self.height)
                .background(
                    Capsule()
                        .fill(MeeshyColors.error)
                        .shadow(color: MeeshyColors.error.opacity(MeeshyOpacity.strong), radius: 3)
                )
                // Halo pulsant en capsule et non en cercle : à trois glyphes un
                // cercle centré déborderait des extrémités. `scaleEffect`
                // reproduit l'ancienne respiration 18 → 28 à toute largeur.
                .background(
                    Capsule()
                        .fill(MeeshyColors.error.opacity(0.4))
                        .scaleEffect(isPulsing ? 1.55 : 1.0)
                )
                .offset(x: 16, y: -16)
                // Halo d'ANNONCE, plus jamais un pulse sans fin : ce badge vit
                // dans le chrome FLOTTANT du root (zIndex 100), au-dessus de la
                // liste de conversations ET de chaque fil ouvert — un
                // `repeatForever` y tournait en continu pour tout utilisateur
                // ayant ≥ 1 notification non lue, c'est-à-dire l'état NOMINAL
                // (audit chauffe 2026-08-26, même famille que le glow invisible
                // de l'échelle de menu). Le halo respire quelques cycles à
                // l'apparition et à CHAQUE changement de compteur (`task(id:)`
                // rejoue l'annonce quand une notification arrive), puis se pose
                // au repos — l'intention (« du non-lu t'attend ») reste portée
                // par la pastille elle-même, en permanence.
                .task(id: count) {
                    // Reduce Motion (system or in-app): the halo stays static —
                    // the badge keeps its intention, it loses its movement.
                    guard !MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced) else { return }
                    withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                        isPulsing = true
                    }
                    try? await Task.sleep(for: .seconds(Self.announcementPulseDuration))
                    guard !Task.isCancelled else { return }
                    // Retour au repos ANIMÉ (une respiration de sortie) — un
                    // arrêt sec au milieu d'un cycle claquerait visuellement.
                    withAnimation(.easeInOut(duration: 1.2)) {
                        isPulsing = false
                    }
                }
                .onDisappear {
                    withTransaction(Transaction(animation: nil)) {
                        isPulsing = false
                    }
                }
        }
    }

    /// Durée de la fenêtre d'annonce du halo (~2,5 respirations à 1,2 s le
    /// demi-cycle) avant le retour au repos.
    public static let announcementPulseDuration: TimeInterval = 6
}
