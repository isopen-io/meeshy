import AVFoundation
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Allumer le flash se VOIT : un éclair frappe le viseur** (#17463).
///
/// Un tracé de foudre se dessine en 250 ms depuis le haut du viseur, sous la
/// capsule du flash, avec une lueur chaude ; quand il touche, l'image blanchit
/// 120 ms, sans jamais cesser d'être lisible. Éteindre ne joue rien. Sous Reduce
/// Motion il ne reste que l'icône et l'annonce VoiceOver ; en filmant, rien.
///
/// La loi est pure : quand l'éclair joue, et ce que montre chaque image en
/// fonction du seul temps écoulé. La vue n'a qu'un état, l'instant de la frappe.
nonisolated enum ComposerFlashStrike {

    struct Outcome: Equatable, Sendable {
        let strikes: Bool
        let haptic: Bool
        let announces: Bool

        static let silent = Outcome(strikes: false, haptic: false, announces: false)
    }

    /// Une image de l'éclair, chaque valeur entre 0 et 1.
    struct Frame: Equatable, Sendable {
        let drawn: Double
        let boltOpacity: Double
        let glow: Double
        let whitening: Double
    }

    static let drawDuration: TimeInterval = 0.25
    static let lifetime: TimeInterval = 0.5
    static let whiteningPeak: Double = 0.32

    private static let holdUntil: TimeInterval = 0.3
    private static let whiteningStart: TimeInterval = 0.2
    private static let whiteningTop: TimeInterval = 0.23
    private static let whiteningEnd: TimeInterval = 0.32

    /// On ALLUME — vers « activé » ou « auto », depuis un autre mode.
    static func outcome(from old: AVCaptureDevice.FlashMode, to new: AVCaptureDevice.FlashMode,
                        reduceMotion: Bool, recording: Bool) -> Outcome {
        guard !recording, new != .off, new != old else { return .silent }
        guard !reduceMotion else { return Outcome(strikes: false, haptic: false, announces: true) }
        return Outcome(strikes: true, haptic: true, announces: true)
    }

    static func plays(from old: AVCaptureDevice.FlashMode, to new: AVCaptureDevice.FlashMode,
                      reduceMotion: Bool, recording: Bool) -> Bool {
        outcome(from: old, to: new, reduceMotion: reduceMotion, recording: recording).strikes
    }

    static func frame(at elapsed: TimeInterval) -> Frame {
        let t = elapsed.isFinite ? max(0, elapsed) : 0
        let draw = min(t / drawDuration, 1)
        let drawn = 1 - pow(1 - draw, 3)
        let boltOpacity = t <= holdUntil ? 1 : max(0, 1 - (t - holdUntil) / (lifetime - holdUntil))
        let glow = t <= drawDuration ? draw * draw : max(0, 1 - (t - drawDuration) / (lifetime - drawDuration))
        return Frame(drawn: drawn, boltOpacity: boltOpacity, glow: glow, whitening: whitening(at: t))
    }

    private static func whitening(at t: TimeInterval) -> Double {
        guard t > whiteningStart, t < whiteningEnd else { return 0 }
        guard t > whiteningTop else { return whiteningPeak * (t - whiteningStart) / (whiteningTop - whiteningStart) }
        return whiteningPeak * (whiteningEnd - t) / (whiteningEnd - whiteningTop)
    }

    // MARK: - Le tracé

    private static let trunk: [CGPoint] = [
        CGPoint(x: 0.62, y: 0.00), CGPoint(x: 0.38, y: 0.30), CGPoint(x: 0.58, y: 0.36),
        CGPoint(x: 0.30, y: 0.68), CGPoint(x: 0.52, y: 0.72), CGPoint(x: 0.36, y: 1.00)
    ]
    private static let fork: [CGPoint] = [
        CGPoint(x: 0.58, y: 0.36), CGPoint(x: 0.80, y: 0.52), CGPoint(x: 0.72, y: 0.64)
    ]

    /// Le cadre de l'éclair : 40 % de la hauteur, centré, sous la capsule du haut.
    private static func box(in size: CGSize) -> CGRect {
        let hauteur = size.height * 0.4
        let largeur = min(hauteur * 0.42, size.width * 0.8)
        return CGRect(x: (size.width - largeur) / 2, y: size.height * 0.08, width: largeur, height: hauteur)
    }

    private static func path(_ points: [CGPoint], in size: CGSize) -> Path {
        guard size.width > 0, size.height > 0, let premier = points.first else { return Path() }
        let cadre = box(in: size)
        func place(_ p: CGPoint) -> CGPoint {
            CGPoint(x: cadre.minX + p.x * cadre.width, y: cadre.minY + p.y * cadre.height)
        }
        var trace = Path()
        trace.move(to: place(premier))
        points.dropFirst().forEach { trace.addLine(to: place($0)) }
        return trace
    }

    static func boltPath(in size: CGSize) -> Path { path(trunk, in: size) }

    static func forkPath(in size: CGSize) -> Path { path(fork, in: size) }

    /// La branche part quand le tronc l'a dépassée, et finit avec lui.
    static func forkDrawn(_ drawn: Double) -> Double {
        min(max((drawn - 0.4) / 0.6, 0), 1)
    }
}

/// **Une image de l'éclair**, peinte dans un `Canvas` : aucun état, aucun
/// `@Published` — l'horloge vient de dehors.
struct ComposerFlashStrikeCanvas: View {
    let elapsed: TimeInterval
    var rendersAsynchronously = true

    private static let warm = MeeshyColors.warning

    var body: some View {
        Canvas(rendersAsynchronously: rendersAsynchronously) { contexte, taille in
            Self.paint(ComposerFlashStrike.frame(at: elapsed), in: &contexte, size: taille)
        }
    }

    private static func paint(_ image: ComposerFlashStrike.Frame, in contexte: inout GraphicsContext, size: CGSize) {
        if image.whitening > 0 {
            contexte.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(image.whitening)))
        }
        guard image.drawn > 0, image.boltOpacity > 0 else { return }
        let tronc = ComposerFlashStrike.boltPath(in: size).trimmedPath(from: 0, to: image.drawn)
        let branche = ComposerFlashStrike.forkPath(in: size)
            .trimmedPath(from: 0, to: ComposerFlashStrike.forkDrawn(image.drawn))
        stroke(tronc, scale: 1, image: image, in: &contexte)
        stroke(branche, scale: 0.6, image: image, in: &contexte)
        flare(at: tronc.currentPoint, image: image, in: &contexte)
    }

    /// Trois traits superposés : un halo chaud, une lueur, un cœur blanc.
    private static func stroke(_ trace: Path, scale: CGFloat, image: ComposerFlashStrike.Frame,
                               in contexte: inout GraphicsContext) {
        guard !trace.isEmpty else { return }
        let couches: [(width: CGFloat, color: Color, opacity: Double)] = [
            (16, warm, 0.16 * image.glow),
            (7, warm, 0.4 * image.glow),
            (2.5, .white, 1)
        ]
        couches.forEach { couche in
            contexte.stroke(trace, with: .color(couche.color.opacity(couche.opacity * image.boltOpacity)),
                            style: StrokeStyle(lineWidth: couche.width * scale, lineCap: .round, lineJoin: .round))
        }
    }

    /// L'impact : une tache de lumière à la pointe de l'éclair.
    private static func flare(at point: CGPoint?, image: ComposerFlashStrike.Frame,
                              in contexte: inout GraphicsContext) {
        guard let point, image.glow > 0 else { return }
        let rayon = 46 * image.glow
        let disque = Path(ellipseIn: CGRect(x: point.x - rayon, y: point.y - rayon, width: rayon * 2, height: rayon * 2))
        let degrade = Gradient(colors: [.white.opacity(0.85 * image.boltOpacity),
                                        warm.opacity(0.35 * image.boltOpacity), .clear])
        contexte.fill(disque, with: .radialGradient(degrade, center: point, startRadius: 0, endRadius: rayon))
    }
}

/// **La surimpression de l'éclair**, montée sur le viseur : elle écoute le mode
/// du flash et ne s'insère dans l'arbre que le temps d'une frappe. Elle ne prend
/// aucun toucher et VoiceOver ne la voit pas — l'annonce dit l'état.
struct ComposerFlashStrikeLayer: View {
    let flash: AVCaptureDevice.FlashMode
    let recording: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var struckAt: Date?

    var body: some View {
        ZStack {
            if let debut = struckAt {
                TimelineView(.animation) { horloge in
                    ComposerFlashStrikeCanvas(elapsed: horloge.date.timeIntervalSince(debut))
                }
                .task(id: debut) { @MainActor in
                    guard await cancellableSleep(for: .seconds(ComposerFlashStrike.lifetime)),
                          struckAt == debut else { return }
                    struckAt = nil
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .ignoresSafeArea()
        .adaptiveOnChange(of: flash) { avant, mode in
            react(from: avant, to: mode)
        }
    }

    private func react(from avant: AVCaptureDevice.FlashMode, to mode: AVCaptureDevice.FlashMode) {
        let issue = ComposerFlashStrike.outcome(from: avant, to: mode, reduceMotion: reduceMotion, recording: recording)
        if issue.strikes { struckAt = Date() }
        if issue.haptic { HapticFeedback.rigid() }
        if issue.announces {
            UIAccessibility.post(notification: .announcement, argument: ComposerCameraFlash.label(for: mode))
        }
    }
}
