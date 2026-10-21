import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les deux boutons flottants (Flux à gauche, Menu à droite) et l'échelle du
/// menu, sortis de `RootView.swift` (cohésion du fichier). La racine garde ce
/// qu'elle OBSERVE — profondeur de la pile, réels, onboarding, compteur de
/// notifications — et décide de monter ou non ce chrome ; il reçoit en
/// `Binding` ce qu'il écrit (`showFeed`, `showMenu`, positions persistées,
/// géométrie mesurée) et pousse ses routes par `onPush`. Les deux positions
/// restent des `@AppStorage` de la racine : seul le conteneur du SDK, à la fin
/// d'un glisser, les écrit (garde `FeedButtonAnchorTests`).
struct RootFloatingChrome: View {
    @Binding var showFeed: Bool
    @Binding var showMenu: Bool
    @Binding var feedButtonPosition: String
    @Binding var menuButtonPosition: String
    @Binding var floatingGeometry: FloatingButtonGeometry?
    let unreadCount: Int
    let onPush: (Route) -> Void

    var body: some View {
        ZStack {
            draggableFloatingButtons

            if showMenu {
                Color.clear
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }
                    }
                    .zIndex(99)
            }

            menuLadder
        }
    }

    // MARK: - Draggable Floating Buttons (Free Position)
    private var draggableFloatingButtons: some View {
        FreeFloatingButtonsContainer(
            leftPosition: $feedButtonPosition,
            rightPosition: $menuButtonPosition,
            leftA11yLabel: String(localized: "a11y.floating.feed", defaultValue: "Flux", bundle: .main),
            rightA11yLabel: String(localized: "a11y.floating.menu", defaultValue: "Menu", bundle: .main),
            onLeftTap: {
                HapticFeedback.light()
                // Le tap ouvre l'overlay Feed (sa vocation : l'icône est le Feed).
                // L'ouverture des Reels n'est PLUS déclenchée ici — elle se fait
                // désormais via le bouton Réels du header « Meeshy Feed ».
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showFeed.toggle()
                }
            },
            onRightTap: {
                HapticFeedback.light()
                // Le bouton porte l'avatar de l'utilisateur. 1er tap = déplie le
                // menu ; 2e tap (menu déjà ouvert) = ouvre la page profil dans les
                // réglages et referme le menu, comme n'importe quel autre item.
                if showMenu {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu = false
                    }
                    onPush(.profile)
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu.toggle()
                    }
                }
            },
            onLeftLongPress: {
                HapticFeedback.medium()
                // Long-press : les Réels, en plein écran, sans graine — le lecteur
                // va chercher sa page. Le tap garde le Flux ; les deux gestes du
                // même bouton mènent donc aux deux formes du même contenu.
                //
                // `presentFresh()` a été écrite POUR ce geste (sa documentation dit
                // « long-press launch »), et l'ancrage du liquid reveal se calcule
                // depuis la position de CE bouton — cf. `FeedButtonAnchor` et ses
                // tests. Le rebranchement rend au geste l'infrastructure qui
                // l'attendait.
                //
                // Le bouton Réels du header « Meeshy Feed » RESTE en place : un
                // appui long n'est pas découvrable et ne peut pas être le seul
                // accès à une section entière.
                ReelsPresenter.shared.presentFresh()
            },
            onRightLongPress: {
                // Long-press sur l'avatar = raccourci direct vers la page profil
                // (sans passer par le menu). Les réglages restent accessibles via
                // le dernier item du menu (roue dentée).
                HapticFeedback.medium()
                if showMenu {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showMenu = false
                    }
                }
                onPush(.profile)
            },
            // L'appui long lance les Réels : un geste que rien ne signale à l'écran
            // doit au moins être annoncé à VoiceOver, sinon il n'existe pas pour qui
            // ne peut pas le découvrir par tâtonnement.
            leftA11yHint: String(localized: "a11y.floating.feed.hint", defaultValue: "Ouvre le flux d'actualité", bundle: .main),
            rightA11yHint: String(localized: "a11y.floating.menu.hint", defaultValue: "Ouvre le menu de navigation", bundle: .main),
            rightA11yValue: unreadCount > 0
                ? String(format: String(localized: "a11y.floating.menu.notifications-value", defaultValue: "%d notifications en attente", bundle: .main), unreadCount)
                : nil,
            rightA11yActionName: String(localized: "a11y.floating.menu.profile-action", defaultValue: "Modifier le profil", bundle: .main),
            leftContent: {
                // Feed button content
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.error, MeeshyColors.indigo300],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    if showFeed {
                        // Animated logo when feed is open (with breathing effect)
                        AnimatedLogoView(color: .white, lineWidth: 3, continuous: true)
                            .frame(width: MeeshySpacing.xxl + MeeshySpacing.xs, height: MeeshySpacing.xxl + MeeshySpacing.xs)
                    } else {
                        Image(systemName: "square.stack.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.xl, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
            },
            rightContent: {
                // Menu button content — porte l'avatar de l'utilisateur (ou ses
                // initiales) à l'intérieur de l'anneau dégradé. L'anneau vire au
                // rouge quand le menu est ouvert ; le badge de notifications reste.
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: showMenu ? [MeeshyColors.error, MeeshyColors.indigo300] : [MeeshyColors.indigo600, MeeshyColors.indigo300],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    MeeshyAvatar(
                        name: getUserDisplayName(AuthManager.shared.currentUser, fallback: "M"),
                        context: .custom(38),
                        avatarURL: AuthManager.shared.currentUser?.avatar, thumbHash: AuthManager.shared.currentUser?.avatarThumbHash,
                        ring: AuthManager.shared.currentUser?.profileDecor?.avatarRing
                    )
                    .allowsHitTesting(false)

                    // Badge
                    if !showMenu && unreadCount > 0 {
                        NotificationBadge(count: unreadCount)
                            .accessibilityLabel(UnreadCountLabel.notifications(unreadCount))
                    }
                }
            }
        )
        .onPreferenceChange(FloatingButtonGeometryKey.self) { measured in
            if let measured, measured.isMeasured { floatingGeometry = measured }
        }
        .zIndex(100)
    }

    // MARK: - Menu Ladder (positioned relative to menu button)
    private var menuLadder: some View {
        GeometryReader { proxy in
            let frame = proxy.frame(in: .global)
            let geometry = floatingGeometry
                ?? FloatingButtonGeometry.measured(container: frame, safeRegion: frame, reported: proxy.safeAreaInsets)
            let globalCenter = geometry.layout(feedStorage: feedButtonPosition, menuStorage: menuButtonPosition).menu
            let menuCenter = CGPoint(x: globalCenter.x - frame.minX, y: globalCenter.y - frame.minY)
            let halfButton = FloatingButtonGeometry.buttonSize / 2
            let menuItemSize: CGFloat = 46
            let menuSpacing: CGFloat = MeeshySpacing.md
            let ladderExtent = CGFloat(RootMenuLadderEntry.allCases.count) * (menuItemSize + menuSpacing)
            let expandDown = geometry.menuOpensDownward(from: globalCenter, ladderExtent: ladderExtent)
            let menuX = menuCenter.x
            let menuStartY = expandDown
                ? menuCenter.y + halfButton + menuSpacing + menuItemSize / 2
                : menuCenter.y - halfButton - menuSpacing - menuItemSize / 2

            // Contenu de l'échelle : `RootMenuLadderEntry` (descripteurs purs).
            ForEach(Array(RootMenuLadderEntry.allCases.enumerated()), id: \.offset) { index, entry in
                let yOffset = expandDown
                    ? CGFloat(index) * (menuItemSize + menuSpacing)
                    : -CGFloat(index) * (menuItemSize + menuSpacing)

                let itemY = menuStartY + yOffset

                ThemedActionButton(
                    icon: entry.icon,
                    color: entry.colorHex,
                    label: entry.label,
                    hint: String(localized: "a11y.menu.item.hint", defaultValue: "Ouvrir cette section", bundle: .main),
                    badge: menuBadgeCount(entry.badge),
                    // L'échelle est montée EN PERMANENCE (opacité 0, zIndex −1
                    // menu fermé) pour que le ressort d'ouverture parte d'un
                    // état existant : le glow/pulse ne doit vivre que menu
                    // OUVERT — six ombres re-rasterisées par frame en continu
                    // derrière la liste, sinon (audit chauffe 2026-08-26).
                    isGlowEnabled: showMenu,
                    action: { openMenuEntry(entry) }
                )
                .position(x: menuX, y: itemY)
                .menuAnimation(showMenu: showMenu, delay: Double(index) * 0.04)
            }
        }
        .ignoresSafeArea()
        .zIndex(showMenu ? 151 : -1)
        .allowsHitTesting(showMenu)
    }

    private func menuBadgeCount(_ badge: RootMenuBadge?) -> Int {
        switch badge {
        case .unreadNotifications: return unreadCount
        case .pendingFriendRequests: return FriendshipCache.shared.pendingReceivedCount
        case nil: return 0
        }
    }

    private func openMenuEntry(_ entry: RootMenuLadderEntry) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showMenu = false }
        onPush(entry.route)
    }
}

// MARK: - Menu Animation Modifier
extension View {
    func menuAnimation(showMenu: Bool, delay: Double) -> some View {
        self
            .scaleEffect(showMenu ? 1 : 0.3)
            .opacity(showMenu ? 1 : 0)
            .rotationEffect(.degrees(showMenu ? 0 : -30))
            .animation(
                .spring(response: showMenu ? 0.4 : 0.25, dampingFraction: 0.65)
                    .delay(showMenu ? delay : 0),
                value: showMenu
            )
    }
}
