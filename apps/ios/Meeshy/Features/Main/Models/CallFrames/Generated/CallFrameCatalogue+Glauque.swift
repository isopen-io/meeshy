// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let glauqueFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "glauque.vhs.duo",
            motif: "glauque.vhs",
            mood: .glauque,
            name: "VHS",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.05, gap: 0.02, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#0D0D10"),
                pattern: CallFramePattern(kind: .scanlines, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .glitch, color: "#3FE0D080", density: .low, layer: .back),
                    CallFrameOrnament(kind: .grain, color: "#FFFFFF33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#D9D4C0", size: .s, font: StoryTextStyle.retro),
                names: CallFrameNames(show: .name, style: .caption, font: .typewriter, color: "#D9D4C0", fill: nil),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#D9D4C0", place: .bottom, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .names, font: .typewriter, color: "#C8C27A", place: .bottom, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.vhs.comite",
            motif: "glauque.vhs",
            mood: .glauque,
            name: "VHS",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#0D0D10"),
                pattern: CallFramePattern(kind: .scanlines, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .glitch, color: "#3FE0D080", density: .low, layer: .back),
                    CallFrameOrnament(kind: .grain, color: "#FFFFFF33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#D9D4C0", size: .s, font: StoryTextStyle.retro),
                names: CallFrameNames(show: .name, style: .caption, font: .typewriter, color: "#D9D4C0", fill: nil),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#D9D4C0", place: .bottom, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .group, font: .typewriter, color: "#C8C27A", place: .bottom, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.vhs.groupe",
            motif: "glauque.vhs",
            mood: .glauque,
            name: "VHS",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.05, gap: 0.015, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#0D0D10"),
                pattern: CallFramePattern(kind: .scanlines, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .glitch, color: "#3FE0D080", density: .low, layer: .back),
                    CallFrameOrnament(kind: .grain, color: "#FFFFFF33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#D9D4C0", size: .s, font: StoryTextStyle.retro),
                names: CallFrameNames(show: .name, style: .plate, font: .typewriter, color: "#D9D4C0", fill: "#0D0D10CC"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#D9D4C0", place: .bottom, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .group, font: .typewriter, color: "#C8C27A", place: .bottom, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.duo",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.04, gap: 0.01, top: 0.08, bottom: 0.06),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2C3A28", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#0A1208", light: "#A8D08D")),
                background: .solid(color: "#0C0F0B"),
                pattern: CallFramePattern(kind: .scanlines, color: "#9FB88A", opacity: 0.12),
                border: CallFrameBorder(kind: .hairline, color: "#2C3A28", width: 0.003, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000B3", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#9FB88A", density: .low, layer: .front),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#9FB88A", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .typewriter, color: "#B5E3A0", fill: "#0C0F0BD9"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#B5E3A0", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.comite",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.04, gap: 0.008, top: 0.08, bottom: 0.06),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2C3A28", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#0A1208", light: "#A8D08D")),
                background: .solid(color: "#0C0F0B"),
                pattern: CallFramePattern(kind: .scanlines, color: "#9FB88A", opacity: 0.12),
                border: CallFrameBorder(kind: .hairline, color: "#2C3A28", width: 0.003, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000B3", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#9FB88A", density: .low, layer: .front),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#9FB88A", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .typewriter, color: "#B5E3A0", fill: "#0C0F0BD9"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#B5E3A0", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.groupe",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.035, gap: 0.006, top: 0.08, bottom: 0.06),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2C3A28", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#0A1208", light: "#A8D08D")),
                background: .solid(color: "#0C0F0B"),
                pattern: CallFramePattern(kind: .scanlines, color: "#9FB88A", opacity: 0.12),
                border: CallFrameBorder(kind: .hairline, color: "#2C3A28", width: 0.003, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000B3", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#9FB88A", density: .low, layer: .front),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#9FB88A", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .typewriter, color: "#B5E3A0", fill: "#0C0F0BD9"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#B5E3A0", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.tablee",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.03, gap: 0.005, top: 0.07, bottom: 0.05),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2C3A28", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#0A1208", light: "#A8D08D")),
                background: .solid(color: "#0C0F0B"),
                pattern: CallFramePattern(kind: .scanlines, color: "#9FB88A", opacity: 0.12),
                border: CallFrameBorder(kind: .hairline, color: "#2C3A28", width: 0.003, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000B3", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .rec, color: "#D7263D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#9FB88A", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .typewriter, color: "#B5E3A0", fill: "#0C0F0BD9"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#B5E3A0", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "glauque.sous-sol.duo",
            motif: "glauque.sous-sol",
            mood: .glauque,
            name: "Sous-sol",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.08, gap: 0.03, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#C9C3A6", pad: 0.04, foot: 0.14), tilt: .gentle, tone: .faded, duotone: nil),
                background: .linear(colors: ["#1E2319", "#0A0B08"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#C8C27A", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .drips, color: "#3D4A2E", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .cobwebs, color: "#9A968059", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000CC", density: .high, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#9A9680", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .note, color: "#2A2418", fill: "#C9C3A6"),
                title: CallFrameTitle(source: .names, font: .retro, color: "#C8C27A", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#9A9680", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.sous-sol.comite",
            motif: "glauque.sous-sol",
            mood: .glauque,
            name: "Sous-sol",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.07, gap: 0.03, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#C9C3A6", pad: 0.04, foot: 0.14), tilt: .wild, tone: .faded, duotone: nil),
                background: .linear(colors: ["#1E2319", "#0A0B08"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#C8C27A", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .drips, color: "#3D4A2E", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .cobwebs, color: "#9A968059", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000CC", density: .high, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#9A9680", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .note, color: "#2A2418", fill: "#C9C3A6"),
                title: CallFrameTitle(source: .group, font: .retro, color: "#C8C27A", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#9A9680", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.sous-sol.groupe",
            motif: "glauque.sous-sol",
            mood: .glauque,
            name: "Sous-sol",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.02, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#C9C3A6", pad: 0.04, foot: 0.14), tilt: .wild, tone: .faded, duotone: nil),
                background: .linear(colors: ["#1E2319", "#0A0B08"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#C8C27A", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .drips, color: "#3D4A2E", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .cobwebs, color: "#9A968059", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000CC", density: .high, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#9A9680", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .note, color: "#2A2418", fill: "#C9C3A6"),
                title: CallFrameTitle(source: .group, font: .retro, color: "#C8C27A", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#9A9680", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.disparus.comite",
            motif: "glauque.disparus",
            mood: .glauque,
            name: "Disparus",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.08, gap: 0.04, top: 0.2, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#1A1A1A", width: 0.005), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .linear(colors: ["#D9D4C0", "#B8B19A"], angle: 0.0),
                pattern: CallFramePattern(kind: .halftone, color: "#1A1A1A", opacity: 0.1),
                border: CallFrameBorder(kind: .torn, color: "#0C0F0B", width: 0.02, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#C8C27AB3", density: .low, layer: .front),
                    CallFrameOrnament(kind: .grain, color: "#1A1A1A40", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#1A1A1A1F", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .both, style: .caption, font: .typewriter, color: "#1A1A1A", fill: nil),
                title: CallFrameTitle(source: .group, font: .retro, color: "#1A1A1A", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#6B4A2B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "glauque.disparus.groupe",
            motif: "glauque.disparus",
            mood: .glauque,
            name: "Disparus",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#1A1A1A", width: 0.005), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .linear(colors: ["#D9D4C0", "#B8B19A"], angle: 0.0),
                pattern: CallFramePattern(kind: .halftone, color: "#1A1A1A", opacity: 0.1),
                border: CallFrameBorder(kind: .torn, color: "#0C0F0B", width: 0.02, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#C8C27AB3", density: .low, layer: .front),
                    CallFrameOrnament(kind: .grain, color: "#1A1A1A40", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#1A1A1A1F", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .both, style: .caption, font: .typewriter, color: "#1A1A1A", fill: nil),
                title: CallFrameTitle(source: .group, font: .retro, color: "#1A1A1A", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#6B4A2B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        )
    ]
}
