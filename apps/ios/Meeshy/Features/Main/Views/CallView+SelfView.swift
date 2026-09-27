import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// La vignette perso (PiP in-app) : déplaçable, aimantée aux coins, et la
// tuile « vidéo en pause ». Sortie de `CallView.swift` (#8276).

extension CallView {
    // MARK: - Picture-in-Picture (§7.2)

    /// The four anchor corners a PiP can snap to.
    enum PiPCorner: CaseIterable {
        case topLeading, topTrailing, bottomLeading, bottomTrailing
    }

    private static let pipSize = CGSize(width: 100, height: 140)

    /// Resting center for the PiP in a given container, accounting for device
    /// safe area insets (landscape notch/Dynamic Island cutouts) plus fixed
    /// clearances for the minimize chevron/badge (top) and control bar (bottom).
    func pipCenter(_ corner: PiPCorner, in container: CGSize, safeArea: EdgeInsets = .init()) -> CGPoint {
        let halfW = Self.pipSize.width / 2
        let halfH = Self.pipSize.height / 2
        let margin: CGFloat = 16
        let topInset = safeArea.top + QualityThresholds.pipTopClearance
        let bottomInset = safeArea.bottom + QualityThresholds.pipBottomClearance
        let leadingX = safeArea.leading + margin + halfW
        let trailingX = container.width - safeArea.trailing - margin - halfW
        let topY = topInset + halfH
        let bottomY = container.height - bottomInset - halfH
        switch corner {
        case .topLeading: return CGPoint(x: leadingX, y: topY)
        case .topTrailing: return CGPoint(x: trailingX, y: topY)
        case .bottomLeading: return CGPoint(x: leadingX, y: bottomY)
        case .bottomTrailing: return CGPoint(x: trailingX, y: bottomY)
        }
    }

    /// Nearest corner to a point — used to snap on drag end.
    private func nearestCorner(to point: CGPoint, in container: CGSize, safeArea: EdgeInsets = .init()) -> PiPCorner {
        PiPCorner.allCases.min(by: { a, b in
            let ca = pipCenter(a, in: container, safeArea: safeArea)
            let cb = pipCenter(b, in: container, safeArea: safeArea)
            return hypot(point.x - ca.x, point.y - ca.y) < hypot(point.x - cb.x, point.y - cb.y)
        }) ?? .topTrailing
    }

    var pipView: some View {
        GeometryReader { geo in
            let base = pipCenter(pipCorner, in: geo.size, safeArea: geo.safeAreaInsets)
            // §7.2 — the PiP shows the SECONDARY stream (the opposite of the
            // primary). Swap flips both with one tap.
            videoStream(local: !effectiveSwapStreams, contentMode: .scaleAspectFill)
                .frame(width: Self.pipSize.width, height: Self.pipSize.height)
                // #8441 — la vignette montre MON image : la pincer zoome la
                // caméra envoyée, deux touches rendent 1×.
                .callCameraZoom(isEnabled: !effectiveSwapStreams)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                .position(x: base.x + pipDragOffset.width, y: base.y + pipDragOffset.height)
                .gesture(
                    DragGesture()
                        .onChanged { pipDragOffset = $0.translation }
                        .onEnded { value in
                            let dropped = CGPoint(x: base.x + value.translation.width,
                                                  y: base.y + value.translation.height)
                            let corner = nearestCorner(to: dropped, in: geo.size, safeArea: geo.safeAreaInsets)
                            withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.75)) {
                                pipCorner = corner
                                pipDragOffset = .zero
                            }
                            HapticFeedback.light()
                        }
                )
                // §7.2 — tap PiP = swap which stream is full-screen (FaceTime).
                // Retourner et Effets ont quitté la vignette pour le rail
                // « mon image » (#8394) : la vignette ne fait plus que se
                // déplacer et permuter.
                .onTapGesture {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.8)) {
                        swapStreams.toggle()
                    }
                    HapticFeedback.light()
                }
                .accessibilityLabel(String(localized: "call.pip.swap", defaultValue: "Permuter les vidéos", bundle: .main))
                .accessibilityHint(String(localized: "call.pip.swap.hint", defaultValue: "Touchez pour échanger la petite et la grande vidéo ; faites glisser pour déplacer", bundle: .main))

            if !effectiveSwapStreams {
                CallCameraZoomAccessibilityElement()
                    .frame(width: Self.pipSize.width, height: Self.zoomAccessibilityHeight)
                    .position(
                        x: base.x + pipDragOffset.width,
                        y: base.y + pipDragOffset.height + (Self.pipSize.height - Self.zoomAccessibilityHeight) / 2
                    )
            }
        }
    }

    /// Bande basse de la vignette tenue par l'élément VoiceOver du zoom (44 pt).
    private static let zoomAccessibilityHeight: CGFloat = 44

    /// True when the survival layer has auto-dropped our outbound video while the
    /// user still wants the camera on (distinct from a deliberate camera-off).
    var videoAutoPaused: Bool {
        callManager.isVideoSuspended && callManager.isVideoEnabled
    }

    /// Survival self-tile: the local user's avatar with a discreet "video paused
    /// · auto-resume" overlay ON TOP, shown where the PiP normally sits when the
    /// adaptive controller has dropped our outbound video to audio-only.
    var localVideoSuspendedTile: some View {
        GeometryReader { geo in
            let base = pipCenter(pipCorner, in: geo.size, safeArea: geo.safeAreaInsets)
            videoSuspendedTileBody
                .frame(width: Self.pipSize.width, height: Self.pipSize.height)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(MeeshyColors.warning.opacity(0.7), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                .position(x: base.x, y: base.y)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "call.video.suspended", defaultValue: "Vidéo en pause", bundle: .main))
                .accessibilityHint(String(localized: "call.video.suspended.hint", defaultValue: "Connexion faible, la vidéo reprendra automatiquement", bundle: .main))
        }
    }

    private var videoSuspendedTileBody: some View {
        // Local user's initial (the suspended camera is OURS).
        let localName = AuthManager.shared.currentUser?.displayName
            ?? AuthManager.shared.currentUser?.username
            ?? "?"
        let initial = String(localName.prefix(1)).uppercased()
        return ZStack {
            Color.black.opacity(0.55)
            // Avatar behind…
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                Text(initial)
                    // Doctrine 86i : initiale d'avatar dans un cercle fixe 56×56 → figée.
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .opacity(0.45)
            // …"video paused" affordance on top.
            VStack(spacing: 6) {
                Image(systemName: "video.slash.fill")
                    .font(MeeshyFont.relative(18, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .accessibilityHidden(true)
                Text(String(localized: "call.video.suspended", defaultValue: "Vidéo en pause", bundle: .main))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.white)
                Text(String(localized: "call.video.suspended.short", defaultValue: "Reprise auto", bundle: .main))
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.7))
            }
        }
    }
}
