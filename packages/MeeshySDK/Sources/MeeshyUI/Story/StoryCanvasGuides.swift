import SwiftUI
import MeeshySDK

// MARK: - Safe Zone
//
// La safe zone represente la region utile du canvas 9:16 — celle qui restera
// visible quand la story sera consommee, sans etre masquee par les overlays UI
// du reader (header avec nom/avatar/date en haut, barre d'action et reply en bas).
//
// Toutes les valeurs sont normalisees sur le canvas 9:16 et restent identiques
// quel que soit le viewport (iPhone, iPad, web). Le rendu visuel du canvas
// s'adapte tout seul via `StoryCanvasReaderView.canvasSize(fitting:)`.

public enum StorySafeZone {
    /// Marge superieure : header reader (avatar + nom + heure + close button).
    public static let topInset: CGFloat = 0.12
    /// Marge inferieure : barre d'action + reply field + safe area home indicator.
    public static let bottomInset: CGFloat = 0.18
    /// Marge laterale : bord arrondi du canvas + padding visuel.
    public static let horizontalInset: CGFloat = 0.04

    /// Renvoie un rectangle normalise (0-1) representant la safe zone interne.
    public static var normalizedRect: CGRect {
        CGRect(
            x: horizontalInset,
            y: topInset,
            width: 1.0 - 2 * horizontalInset,
            height: 1.0 - topInset - bottomInset
        )
    }

    /// Vrai si la bbox normalisee `rect` (en coords 0-1) sort de la safe zone.
    public static func isOutOfBounds(_ rect: CGRect) -> Bool {
        let safe = normalizedRect
        return rect.minX < safe.minX
            || rect.minY < safe.minY
            || rect.maxX > safe.maxX
            || rect.maxY > safe.maxY
    }
}

// MARK: - Alignment Snap

public enum StoryAlignmentSnap {
    /// Tolerance normalisee : si la position est dans cette zone autour d'une
    /// cible (centre, tiers, edge safe-zone), on snap dessus. ~0.015 = ~6pt
    /// sur un canvas de 393pt de large.
    public static let snapTolerance: CGFloat = 0.015

    /// Cibles de snap horizontales (axe X) en coords normalisees 0-1.
    public static var horizontalTargets: [CGFloat] {
        [
            StorySafeZone.normalizedRect.minX,        // bord gauche safe zone
            1.0 / 3.0,                                 // tiers gauche
            0.5,                                        // centre
            2.0 / 3.0,                                 // tiers droit
            StorySafeZone.normalizedRect.maxX         // bord droit safe zone
        ]
    }

    /// Cibles de snap verticales (axe Y) en coords normalisees 0-1.
    public static var verticalTargets: [CGFloat] {
        [
            StorySafeZone.normalizedRect.minY,        // bord haut safe zone
            1.0 / 3.0,                                 // tiers haut
            0.5,                                        // centre
            2.0 / 3.0,                                 // tiers bas
            StorySafeZone.normalizedRect.maxY         // bord bas safe zone
        ]
    }

    /// Renvoie la cible la plus proche si dans la zone de snap, sinon `nil`.
    public static func snappedX(for x: CGFloat) -> CGFloat? {
        horizontalTargets.first { abs($0 - x) <= snapTolerance }
    }

    public static func snappedY(for y: CGFloat) -> CGFloat? {
        verticalTargets.first { abs($0 - y) <= snapTolerance }
    }

    /// Applique le snap sur les deux axes. Utilise pendant le drag pour rendre
    /// le placement precis sans bloquer l'utilisateur (snap doux).
    public static func apply(to point: CGPoint) -> CGPoint {
        CGPoint(
            x: snappedX(for: point.x) ?? point.x,
            y: snappedY(for: point.y) ?? point.y
        )
    }
}

// MARK: - Safe Zone Overlay

/// Rectangle en pointilles affiche pendant l'edition pour montrer la zone qui
/// restera visible apres l'ajout des overlays UI du reader. Subtil par defaut,
/// se renforce quand un element est en cours de drag.
struct SafeZoneOverlay: View {
    let canvasSize: CGSize
    let isDragging: Bool

    var body: some View {
        let safe = StorySafeZone.normalizedRect
        let rect = CGRect(
            x: safe.minX * canvasSize.width,
            y: safe.minY * canvasSize.height,
            width: safe.width * canvasSize.width,
            height: safe.height * canvasSize.height
        )

        ZStack {
            // Bordure de la safe zone — pointilles indigo
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(
                    style: StrokeStyle(lineWidth: 1, dash: [4, 4])
                )
                .foregroundStyle(
                    MeeshyColors.indigo300.opacity(isDragging ? 0.7 : 0.25)
                )
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)
                .animation(.easeInOut(duration: 0.2), value: isDragging)

            // Hint visuel : "zone visible" affiche en haut quand le drag commence
            if isDragging {
                Text("Safe area")
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(MeeshyColors.indigo500.opacity(0.85))
                    )
                    .position(x: rect.midX, y: rect.minY - 10)
                    .transition(.opacity.combined(with: .scale))
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Alignment Guides Overlay

/// Lignes d'alignement qui apparaissent pendant le drag : centerlines (vertical
/// + horizontal), tiers, et bords de la safe zone — uniquement quand l'element
/// dragge est proche d'une cible (snap range).
struct AlignmentGuidesOverlay: View {
    let canvasSize: CGSize
    let dragPosition: CGPoint?  // 0-1 normalized; nil = no drag

    var body: some View {
        ZStack {
            if let pos = dragPosition {
                ForEach(activeHorizontalGuides(for: pos.x), id: \.self) { target in
                    Rectangle()
                        .fill(guideColor(targetX: target))
                        .frame(width: 1, height: canvasSize.height)
                        .position(x: target * canvasSize.width, y: canvasSize.height / 2)
                        .transition(.opacity)
                }
                ForEach(activeVerticalGuides(for: pos.y), id: \.self) { target in
                    Rectangle()
                        .fill(guideColor(targetY: target))
                        .frame(width: canvasSize.width, height: 1)
                        .position(x: canvasSize.width / 2, y: target * canvasSize.height)
                        .transition(.opacity)
                }
            }
        }
        .allowsHitTesting(false)
        .animation(.easeInOut(duration: 0.12), value: dragPosition?.x ?? 0)
        .animation(.easeInOut(duration: 0.12), value: dragPosition?.y ?? 0)
    }

    private func activeHorizontalGuides(for x: CGFloat) -> [CGFloat] {
        StoryAlignmentSnap.horizontalTargets.filter {
            abs($0 - x) <= StoryAlignmentSnap.snapTolerance
        }
    }

    private func activeVerticalGuides(for y: CGFloat) -> [CGFloat] {
        StoryAlignmentSnap.verticalTargets.filter {
            abs($0 - y) <= StoryAlignmentSnap.snapTolerance
        }
    }

    /// Centre = indigo deep + plus opaque pour distinguer l'alignement parfait
    /// du snap aux tiers ou aux bords.
    private func guideColor(targetX: CGFloat) -> Color {
        targetX == 0.5 ? MeeshyColors.indigo500.opacity(0.9)
                       : MeeshyColors.indigo300.opacity(0.6)
    }

    private func guideColor(targetY: CGFloat) -> Color {
        targetY == 0.5 ? MeeshyColors.indigo500.opacity(0.9)
                       : MeeshyColors.indigo300.opacity(0.6)
    }
}

// MARK: - Out-Of-Bounds Warning

/// Halo rouge pulse autour du canvas quand l'element en cours de drag sort
/// de la safe zone — equivalent du warning "ton contenu sera coupe" dans
/// TikTok / Instagram.
struct OutOfBoundsWarningOverlay: View {
    let canvasSize: CGSize
    let isOutOfBounds: Bool

    @State private var pulse: Bool = false

    var body: some View {
        let safe = StorySafeZone.normalizedRect
        let rect = CGRect(
            x: safe.minX * canvasSize.width,
            y: safe.minY * canvasSize.height,
            width: safe.width * canvasSize.width,
            height: safe.height * canvasSize.height
        )

        ZStack {
            if isOutOfBounds {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(
                        Color.red.opacity(pulse ? 0.9 : 0.5),
                        lineWidth: pulse ? 2.5 : 1.5
                    )
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)
                    .onAppear { pulse = true }
                    .animation(
                        .easeInOut(duration: 0.6).repeatForever(autoreverses: true),
                        value: pulse
                    )
                    .transition(.opacity)

                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text("Hors zone visible")
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(Color.red.opacity(0.9))
                        .shadow(color: .black.opacity(0.3), radius: 3)
                )
                .position(x: rect.midX, y: rect.maxY + 12)
                .transition(.opacity.combined(with: .scale))
            }
        }
        .allowsHitTesting(false)
    }
}

