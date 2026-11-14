import SwiftUI
import MeeshySDK
import MeeshyUI

// Loi 17.2 · 17.10 (#18207) — le verre de la pilule morphe par une TRANSFORMATION seule, miroir
// d'Android (`CallMorphingControlsGlass`, #18411) et du web (`createPillGlass`). La mise en page
// prend d'un coup sa forme finale ; le verre est une couche à lui, dessinée à sa taille posée et
// vue, à chaque image, comme une échelle de l'ancienne ancrée à son bord du bas
// (`CallGlassMorphClock`). Ce que la mise en page a déplacé dedans glisse par une translation
// (`CallGlassFollow`). Rien ne tourne au repos : l'horloge ne bat que pendant un mouvement.
// « Réduire les animations » : ni échelle ni glissement, l'ancien verre se fond dans le nouveau.

/// Le verre qui morphe derrière le contenu de la pilule, et la découpe qui le suit : le contenu
/// garde ses proportions, seul le verre (et la découpe de ce qu'il laisse voir) change d'échelle.
struct CallMorphingGlass<S: Shape, Glass: View>: ViewModifier {
    let shape: S
    let reduceMotion: Bool
    @ViewBuilder let glass: () -> Glass

    @State private var clock = CallGlassMorphClock()

    func body(content: Content) -> some View {
        TimelineView(CallGlassMotionTimer.schedule(running: clock.isRunning)) { context in
            content.clipShape(CallGlassMorphClip(shape: shape, clock: clock, date: context.date, reduceMotion: reduceMotion))
        }
        .background(alignment: .bottom) {
            CallGlassMorphLayer(clock: clock, reduceMotion: reduceMotion) { frame in
                ZStack(alignment: .bottom) {
                    if frame.ghostAlpha > 0 {
                        glass()
                            .scaleEffect(x: frame.ghostScaleX, y: frame.ghostScaleY, anchor: .bottom)
                            .opacity(frame.ghostAlpha)
                    }
                    glass()
                        .scaleEffect(x: frame.scaleX, y: frame.scaleY, anchor: .bottom)
                        .opacity(frame.alpha)
                }
            }
        }
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
            clock = clock.measured(size, at: Date(), reduceMotion: reduceMotion)
        }
        .task(id: clock.startedAt) {
            guard clock.isRunning else { return }
            guard await cancellableSleep(for: CallGlassMotionTimer.settle(after: clock.duration)), !Task.isCancelled else { return }
            clock = clock.settled(at: Date())
        }
    }
}

/// La couche du verre : posée à la taille de la pilule sans jamais
/// s'animer, elle lit l'image du morphisme à chaque battement de l'horloge. La taille juste posée
/// et pas encore enregistrée montre déjà l'ancienne : la première image est juste.
private struct CallGlassMorphLayer<Layer: View>: View {
    let clock: CallGlassMorphClock
    let reduceMotion: Bool
    @ViewBuilder let layer: (CallGlassMorphFrame) -> Layer

    var body: some View {
        GeometryReader { proxy in
            TimelineView(CallGlassMotionTimer.schedule(running: clock.isRunning)) { context in
                layer(clock.frame(laidOut: proxy.size, at: context.date, reduceMotion: reduceMotion))
                    .frame(width: proxy.size.width, height: proxy.size.height, alignment: .bottom)
            }
        }
        .transaction { $0.animation = nil }
        .accessibilityHidden(true)
    }
}

/// La découpe du contenu : la forme du verre à l'image du morphisme (et, en fondu, celle qu'il
/// quitte), si bien qu'une rangée qui part reste visible tant que le verre la contient. Un chemin,
/// jamais un masque hors écran : le verre des boutons garde sa matière.
nonisolated private struct CallGlassMorphClip<S: Shape>: Shape {
    let shape: S
    let clock: CallGlassMorphClock
    let date: Date
    let reduceMotion: Bool

    func path(in rect: CGRect) -> Path {
        let frame = clock.frame(laidOut: rect.size, at: date, reduceMotion: reduceMotion)
        var path = scaled(frame.scaleX, frame.scaleY, in: rect)
        if frame.ghostAlpha > 0 { path.addPath(scaled(frame.ghostScaleX, frame.ghostScaleY, in: rect)) }
        return path
    }

    private func scaled(_ x: CGFloat, _ y: CGFloat, in rect: CGRect) -> Path {
        let anchor = CGPoint(x: rect.midX, y: rect.maxY)
        let transform = CGAffineTransform(translationX: anchor.x, y: anchor.y)
            .scaledBy(x: x, y: y)
            .translatedBy(x: -anchor.x, y: -anchor.y)
        return shape.path(in: rect).applying(transform)
    }
}

/// Le repère du verre : ce qui le suit se mesure depuis le centre de son bord du bas, d'où il
/// grandit (Android `CallGlassAnchor`). iOS 16 n'a pas de quoi lire ce repère : rien n'y glisse.
struct CallGlassSpace: ViewModifier {
    nonisolated static let name = "meeshy.call.pill.glass"

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.coordinateSpace(.named(Self.name))
        } else {
            content
        }
    }
}

/// Ce que la mise en page déplace dans le verre (les boutons de la rangée de base, les
/// sous-titres) : il repart de là où on le voyait par une translation, et rejoint sa place.
/// « Réduire les animations » : il paraît à sa place par un fondu court.
struct CallGlassFollow: ViewModifier {
    let reduceMotion: Bool

    @State private var clock = CallGlassFollowClock()

    func body(content: Content) -> some View {
        TimelineView(CallGlassMotionTimer.schedule(running: clock.isRunning)) { context in
            let shift = clock.shift(at: context.date)
            content
                .offset(x: shift.width, y: shift.height)
                .opacity(clock.opacity(at: context.date))
        }
        .onGeometryChange(for: CGPoint?.self) { proxy in
            guard #available(iOS 17.0, *), let glass = proxy.bounds(of: .named(CallGlassSpace.name)) else { return nil }
            return CGPoint(x: proxy.size.width / 2 - glass.midX, y: -glass.maxY)
        } action: { point in
            guard let point else { return }
            clock = clock.placed(point, at: Date(), reduceMotion: reduceMotion)
        }
        .task(id: clock.startedAt) {
            guard clock.isRunning else { return }
            guard await cancellableSleep(for: CallGlassMotionTimer.settle(after: clock.duration)), !Task.isCancelled else { return }
            clock = clock.settled(at: Date())
        }
    }
}

/// L'horloge d'un mouvement : elle bat à chaque image pendant qu'il court, et s'arrête juste après
/// sa fin, une image de marge. Au repos, rien ne bat.
enum CallGlassMotionTimer {
    static func schedule(running: Bool) -> AnimationTimelineSchedule {
        AnimationTimelineSchedule(minimumInterval: nil, paused: !running)
    }

    nonisolated static func settle(after duration: TimeInterval) -> Duration {
        .milliseconds(Int((duration * 1000).rounded(.up)) + 17)
    }
}
