import SwiftUI

// MARK: - Les dessins du jeu, portés tels qu'ils sont écrits (#9380)
//
// Les contours de la planche `docs/product/jeu-meeshy-conception.html` (écu,
// flamme, coupe, laurier…) sont des chemins SVG. Les recopier en `addCurve` à la
// main ferait deux sources du même dessin — qui divergeraient à la première
// retouche. `GameSVGPath` lit la même chaîne `d="…"` : M L H V C S Q A Z, en
// absolu ou en relatif. Les arcs deviennent des cubiques (≤ 90° chacune), sans
// jamais passer par `addArc`, dont le sens horaire est inversé dans le repère
// retourné de SwiftUI.

enum GameSVGPath {

    static func make(_ d: String) -> Path {
        var parser = Parser(Array(d.unicodeScalars))
        return parser.parse()
    }

    private struct Parser {
        let scalars: [Unicode.Scalar]
        var index = 0
        var path = Path()
        var current = CGPoint.zero
        var subpathStart = CGPoint.zero
        var lastCubicControl: CGPoint?
        var lastQuadControl: CGPoint?

        init(_ scalars: [Unicode.Scalar]) {
            self.scalars = scalars
        }

        mutating func parse() -> Path {
            var command: Character?
            while true {
                skipSeparators()
                guard index < scalars.count else { break }
                let scalar = scalars[index]
                if scalar.properties.isAlphabetic {
                    command = Character(scalar)
                    index += 1
                    if command == "Z" || command == "z" {
                        path.closeSubpath()
                        current = subpathStart
                        lastCubicControl = nil
                        lastQuadControl = nil
                        command = nil
                    }
                    continue
                }
                guard let active = command else { break }
                guard run(active) else { break }
                // Les paires qui suivent un `M` sont des `L` implicites (SVG 9.3.3).
                if active == "M" { command = "L" } else if active == "m" { command = "l" }
            }
            return path
        }

        private mutating func skipSeparators() {
            while index < scalars.count, scalars[index] == " " || scalars[index] == "," || scalars[index] == "\n" || scalars[index] == "\t" {
                index += 1
            }
        }

        private mutating func number() -> CGFloat? {
            skipSeparators()
            let start = index
            var seenDot = false
            var seenExponent = false
            if index < scalars.count, scalars[index] == "-" || scalars[index] == "+" { index += 1 }
            while index < scalars.count {
                let s = scalars[index]
                if s.value >= 48, s.value <= 57 {
                    index += 1
                } else if s == ".", !seenDot, !seenExponent {
                    seenDot = true
                    index += 1
                } else if (s == "e" || s == "E"), !seenExponent, index > start {
                    seenExponent = true
                    index += 1
                    if index < scalars.count, scalars[index] == "-" || scalars[index] == "+" { index += 1 }
                } else {
                    break
                }
            }
            guard index > start else { return nil }
            let text = String(String.UnicodeScalarView(scalars[start..<index]))
            return Double(text).map { CGFloat($0) }
        }

        private mutating func flag() -> Bool? {
            skipSeparators()
            guard index < scalars.count, scalars[index] == "0" || scalars[index] == "1" else { return nil }
            defer { index += 1 }
            return scalars[index] == "1"
        }

        private mutating func numbers(_ count: Int) -> [CGFloat]? {
            var values: [CGFloat] = []
            for _ in 0..<count {
                guard let value = number() else { return nil }
                values.append(value)
            }
            return values
        }

        /// Exécute UNE série de paramètres de la commande `command` ; `false` si
        /// la chaîne est mal formée (on s'arrête, on ne devine pas).
        private mutating func run(_ command: Character) -> Bool {
            let relative = command.isLowercase
            let origin = relative ? current : .zero
            switch command {
            case "M", "m":
                guard let v = numbers(2) else { return false }
                let point = CGPoint(x: origin.x + v[0], y: origin.y + v[1])
                path.move(to: point)
                current = point
                subpathStart = point
                resetControls()
                return true
            case "L", "l":
                guard let v = numbers(2) else { return false }
                return line(to: CGPoint(x: origin.x + v[0], y: origin.y + v[1]))
            case "H", "h":
                guard let x = number() else { return false }
                return line(to: CGPoint(x: (relative ? current.x : 0) + x, y: current.y))
            case "V", "v":
                guard let y = number() else { return false }
                return line(to: CGPoint(x: current.x, y: (relative ? current.y : 0) + y))
            case "C", "c":
                guard let v = numbers(6) else { return false }
                return cubic(CGPoint(x: origin.x + v[0], y: origin.y + v[1]),
                             CGPoint(x: origin.x + v[2], y: origin.y + v[3]),
                             CGPoint(x: origin.x + v[4], y: origin.y + v[5]))
            case "S", "s":
                guard let v = numbers(4) else { return false }
                let reflected = lastCubicControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                return cubic(reflected,
                             CGPoint(x: origin.x + v[0], y: origin.y + v[1]),
                             CGPoint(x: origin.x + v[2], y: origin.y + v[3]))
            case "Q", "q":
                guard let v = numbers(4) else { return false }
                let control = CGPoint(x: origin.x + v[0], y: origin.y + v[1])
                let end = CGPoint(x: origin.x + v[2], y: origin.y + v[3])
                path.addQuadCurve(to: end, control: control)
                current = end
                lastQuadControl = control
                lastCubicControl = nil
                return true
            case "A", "a":
                guard let radii = numbers(3), let large = flag(), let sweep = flag(), let end = numbers(2) else { return false }
                let target = CGPoint(x: origin.x + end[0], y: origin.y + end[1])
                addArc(from: current, radiusX: radii[0], radiusY: radii[1], rotationDegrees: radii[2],
                       large: large, sweep: sweep, to: target)
                current = target
                resetControls()
                return true
            default:
                return false
            }
        }

        private mutating func resetControls() {
            lastCubicControl = nil
            lastQuadControl = nil
        }

        private mutating func line(to point: CGPoint) -> Bool {
            path.addLine(to: point)
            current = point
            resetControls()
            return true
        }

        private mutating func cubic(_ c1: CGPoint, _ c2: CGPoint, _ end: CGPoint) -> Bool {
            path.addCurve(to: end, control1: c1, control2: c2)
            current = end
            lastCubicControl = c2
            lastQuadControl = nil
            return true
        }

        /// Arc elliptique de l'annexe F.6 de SVG, découpé en cubiques de 90° au plus.
        private mutating func addArc(from p0: CGPoint, radiusX: CGFloat, radiusY: CGFloat, rotationDegrees: CGFloat,
                                     large: Bool, sweep: Bool, to p1: CGPoint) {
            var rx = abs(radiusX)
            var ry = abs(radiusY)
            guard p0 != p1 else { return }
            guard rx > 0, ry > 0 else {
                path.addLine(to: p1)
                return
            }
            let phi = rotationDegrees * .pi / 180
            let cosPhi = cos(phi)
            let sinPhi = sin(phi)
            let dx = (p0.x - p1.x) / 2
            let dy = (p0.y - p1.y) / 2
            let x1 = cosPhi * dx + sinPhi * dy
            let y1 = -sinPhi * dx + cosPhi * dy

            let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
            if lambda > 1 {
                let scale = lambda.squareRoot()
                rx *= scale
                ry *= scale
            }
            let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
            let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
            let sign: CGFloat = large == sweep ? -1 : 1
            let coefficient = denominator == 0 ? 0 : sign * max(0, numerator / denominator).squareRoot()
            let cxp = coefficient * (rx * y1 / ry)
            let cyp = coefficient * (-(ry * x1) / rx)
            let cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2
            let cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2

            func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
                atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            }
            let theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
            var delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
            if !sweep && delta > 0 { delta -= 2 * .pi }
            if sweep && delta < 0 { delta += 2 * .pi }

            let segments = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
            let step = delta / CGFloat(segments)
            let handle = 4.0 / 3.0 * tan(step / 4)

            func point(_ theta: CGFloat) -> CGPoint {
                CGPoint(x: cx + rx * cos(theta) * cosPhi - ry * sin(theta) * sinPhi,
                        y: cy + rx * cos(theta) * sinPhi + ry * sin(theta) * cosPhi)
            }
            func derivative(_ theta: CGFloat) -> CGPoint {
                CGPoint(x: -rx * sin(theta) * cosPhi - ry * cos(theta) * sinPhi,
                        y: -rx * sin(theta) * sinPhi + ry * cos(theta) * cosPhi)
            }
            for segment in 0..<segments {
                let a = theta1 + CGFloat(segment) * step
                let b = a + step
                let start = point(a)
                let end = segment == segments - 1 ? p1 : point(b)
                let da = derivative(a)
                let db = derivative(b)
                path.addCurve(
                    to: end,
                    control1: CGPoint(x: start.x + handle * da.x, y: start.y + handle * da.y),
                    control2: CGPoint(x: end.x - handle * db.x, y: end.y - handle * db.y)
                )
            }
        }
    }
}
