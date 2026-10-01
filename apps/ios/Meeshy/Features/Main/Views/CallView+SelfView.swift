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

    private static let pipMargin: CGFloat = 16

    /// Resting center for the PiP in a given container, accounting for device
    /// safe area insets (landscape notch/Dynamic Island cutouts) plus fixed
    /// clearances for the minimize chevron/badge (top) and control bar (bottom).
    func pipCenter(_ corner: PiPCorner, in container: CGSize, size: CGSize = CallSelfTileScale.standard.size, safeArea: EdgeInsets = .init()) -> CGPoint {
        let halfW = size.width / 2
        let halfH = size.height / 2
        let margin = Self.pipMargin
        let topInset = safeArea.top + QualityThresholds.pipTopClearance
        let bottomInset = safeArea.bottom + QualityThresholds.pipBottomClearance
        let leadingX = safeArea.leading + margin + halfW
        let trailingX = container.width - safeArea.trailing - margin - halfW
        let topY = topInset + halfH
        let bottomY = container.height - bottomInset - halfH
        let anchor: CGPoint
        switch corner {
        case .topLeading: anchor = CGPoint(x: leadingX, y: topY)
        case .topTrailing: anchor = CGPoint(x: trailingX, y: topY)
        case .bottomLeading: anchor = CGPoint(x: leadingX, y: bottomY)
        case .bottomTrailing: anchor = CGPoint(x: trailingX, y: bottomY)
        }
        // #8747 — au repos, une rangée de commandes tient entre la vignette
        // et l'en-tête comme entre elle et la pilule.
        return CallSelfTileControlsPlacement.restingCenter(anchor, tileSize: size, bounds: selfTileControlsBounds(in: container, safeArea: safeArea))
    }

    /// #8577 — la taille de la vignette : son palier, suivi du pincement en
    /// cours, et bornée à la zone sûre de l'écran.
    func pipTileSize(in container: CGSize, safeArea: EdgeInsets) -> CGSize {
        let available = CGSize(
            width: container.width - safeArea.leading - safeArea.trailing - 2 * Self.pipMargin,
            height: container.height - safeArea.top - safeArea.bottom
                - QualityThresholds.pipTopClearance - QualityThresholds.pipBottomClearance
        )
        return CallSelfTileScale.fitted(CallSelfTileScale.liveSize(pinch: selfTilePinch, from: selfTileScale), in: available)
    }

    /// Nearest corner to a point — used to snap on drag end.
    private func nearestCorner(to point: CGPoint, in container: CGSize, safeArea: EdgeInsets = .init()) -> PiPCorner {
        let size = pipTileSize(in: container, safeArea: safeArea)
        return PiPCorner.allCases.min(by: { a, b in
            let ca = pipCenter(a, in: container, size: size, safeArea: safeArea)
            let cb = pipCenter(b, in: container, size: size, safeArea: safeArea)
            return hypot(point.x - ca.x, point.y - ca.y) < hypot(point.x - cb.x, point.y - cb.y)
        }) ?? .topTrailing
    }

    var pipView: some View {
        GeometryReader { geo in
            let size = pipTileSize(in: geo.size, safeArea: geo.safeAreaInsets)
            let base = pipCenter(pipCorner, in: geo.size, size: size, safeArea: geo.safeAreaInsets)
            ZStack {
                // §7.2 — the PiP shows the SECONDARY stream (the opposite of the
                // primary). Swap flips both with one tap.
                videoStream(local: !effectiveSwapStreams, contentMode: .scaleAspectFill)
                    .frame(width: size.width, height: size.height)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                            .stroke(Color.white.opacity(MeeshyOpacity.medium), lineWidth: 1)
                    )
                    .overlay(alignment: .topTrailing) { selfTileZoomSlot(tileSize: size) }
                    .shadow(color: .black.opacity(MeeshyOpacity.medium), radius: 8, y: 4)
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
                    .simultaneousGesture(selfTilePinchGesture)
                    // §7.2 — tap PiP = swap which stream is full-screen (FaceTime).
                    // #8747 — les commandes de ma caméra vivent AUTOUR de la
                    // vignette : la toucher ne fait que permuter.
                    .onTapGesture {
                        withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.8)) {
                            swapStreams.toggle()
                        }
                        HapticFeedback.light()
                    }
                    .accessibilityLabel(String(localized: "call.pip.swap", defaultValue: "Permuter les vidéos", bundle: .main))
                    .accessibilityHint(String(localized: "call.pip.swap.hint", defaultValue: "Touchez pour échanger la petite et la grande vidéo ; faites glisser pour déplacer", bundle: .main))
                    .accessibilityValue(CallSelfTileCopy.sizeName(selfTileScale))
                    .accessibilityAdjustableAction { direction in
                        switch direction {
                        case .increment: settleSelfTile(on: selfTileScale.larger)
                        case .decrement: settleSelfTile(on: selfTileScale.smaller)
                        @unknown default: return
                        }
                    }
                // #8747 — Effets · Écran au-dessus, Retourner · Caméra en
                // dessous : ils suivent le glissé et le pincement.
                selfTileControlRows(
                    tile: CGRect(x: base.x - size.width / 2, y: base.y - size.height / 2, width: size.width, height: size.height),
                    container: geo.size,
                    safeArea: geo.safeAreaInsets,
                    dragOffset: pipDragOffset
                )
            }
        }
        .onAppear { selfTileScale = selfTileMemory.scale(for: callManager.currentCallId) }
    }

    /// #8577 — pincer la vignette la fait changer de palier x1 · x2 · x3 : elle
    /// suit les doigts, puis s'accroche au palier le plus proche.
    private var selfTilePinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { selfTilePinch = $0 }
            .onEnded { value in
                settleSelfTile(on: CallSelfTileScale.selfTileScale(fromPinch: value, from: selfTileScale))
            }
    }

    private func settleSelfTile(on scale: CallSelfTileScale) {
        let changed = scale != selfTileScale
        withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.8)) {
            selfTileScale = scale
            selfTilePinch = 1
        }
        guard changed else { return }
        HapticFeedback.light()
        selfTileMemory.remember(scale, for: callManager.currentCallId)
    }

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
            let size = pipTileSize(in: geo.size, safeArea: geo.safeAreaInsets)
            let base = pipCenter(pipCorner, in: geo.size, size: size, safeArea: geo.safeAreaInsets)
            videoSuspendedTileBody
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .stroke(MeeshyColors.warning.opacity(MeeshyOpacity.heavy), lineWidth: 1)
                )
                .shadow(color: .black.opacity(MeeshyOpacity.medium), radius: 8, y: 4)
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
            Color.black.opacity(MeeshyOpacity.strong)
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
            .opacity(MeeshyOpacity.strong)
            // …"video paused" affordance on top.
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "video.slash.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .accessibilityHidden(true)
                Text(String(localized: "call.video.suspended", defaultValue: "Vidéo en pause", bundle: .main))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.white)
                Text(String(localized: "call.video.suspended.short", defaultValue: "Reprise auto", bundle: .main))
                    .font(.caption2)
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
            }
        }
    }
}

enum CallSelfTileCopy {
    static func sizeName(_ scale: CallSelfTileScale) -> String {
        switch scale {
        case .x1: return String(localized: "call.pip.size.small", defaultValue: "Petite vignette", bundle: .main)
        case .x2: return String(localized: "call.pip.size.medium", defaultValue: "Vignette moyenne", bundle: .main)
        case .x3: return String(localized: "call.pip.size.large", defaultValue: "Grande vignette", bundle: .main)
        }
    }
}
