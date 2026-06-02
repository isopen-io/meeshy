import Foundation
import CoreGraphics

/// Géométrie largeur-variable en triangle-strip le long de la centerline (2 sommets décalés
/// par width-point — pas d'empilement de disques). Partagé live (`MeeshyStrokeCanvas`) +
/// baked (`StoryStrokeRasterizer`). Cache par stroke pour que les traits figés ne soient pas
/// re-tessellés à chaque frame.
///
/// Les sommets sont en espace design (1080×1920, cf. `StoryDrawingStroke`) ; le rendu applique
/// sa propre transform design→render. Le builder ne projette rien.
public final class VariableWidthStrokeBuilder {
    public struct Geometry: Equatable, Sendable { public let vertices: [CGPoint] }

    private var cache: [Int: Geometry] = [:]
    public private(set) var cacheHits = 0
    public init() {}

    public func geometry(for stroke: StoryDrawingStroke) -> Geometry {
        let key = cacheKey(for: stroke)
        if let cached = cache[key] { cacheHits += 1; return cached }
        let geo = Self.tessellate(StrokePathBuilder.renderWidthPoints(for: stroke))
        cache[key] = geo
        return geo
    }

    static func tessellate(_ wps: [StrokePathBuilder.StrokeWidthPoint]) -> Geometry {
        guard wps.count >= 1 else { return Geometry(vertices: []) }
        var verts: [CGPoint] = []; verts.reserveCapacity(wps.count * 2)
        for i in wps.indices {
            let p = wps[i].point, half = wps[i].width / 2
            let t = Self.tangent(at: i, in: wps)
            let n = CGPoint(x: -t.y, y: t.x)
            verts.append(CGPoint(x: p.x + n.x * half, y: p.y + n.y * half))   // left
            verts.append(CGPoint(x: p.x - n.x * half, y: p.y - n.y * half))   // right
        }
        return Geometry(vertices: verts)
    }

    private static func tangent(at i: Int, in wps: [StrokePathBuilder.StrokeWidthPoint]) -> CGPoint {
        let prev = wps[max(0, i - 1)].point, next = wps[min(wps.count - 1, i + 1)].point
        let dx = next.x - prev.x, dy = next.y - prev.y
        let len = max(hypot(dx, dy), 0.0001)
        return CGPoint(x: dx / len, y: dy / len)
    }

    private func cacheKey(for stroke: StoryDrawingStroke) -> Int {
        var h = Hasher()
        for pt in stroke.points { h.combine(pt.x); h.combine(pt.y); h.combine(pt.pressure) }
        h.combine(stroke.width); h.combine(stroke.smoothing); h.combine(stroke.tool); h.combine(stroke.captureVersion)
        return h.finalize()
    }
}
