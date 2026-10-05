// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let signatureFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "signature.aurore.duo",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.06, gap: 0.03, top: 0.12, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.12, stroke: CallFrameStroke(color: "#FFFFFF66", width: 0.006), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E0E7FF40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#FFFFFF2E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .l, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .caption, font: .bubble, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.aurore.comite",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.06, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFFB3", width: 0.008), double: false, glow: "#C7D2FEAA", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E0E7FF40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#FFFFFF2E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .l, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#1E1B4BCC"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.aurore.groupe",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF80", width: 0.005), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E0E7FF40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#FFFFFF2E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .l, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#1E1B4BCC"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.aurore.tablee",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.04, gap: 0.015, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF80", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E0E7FF40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#FFFFFF2E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .l, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .none, style: .badge, font: .bubble, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.prisme.duo",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.06, gap: 0.02, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.006), double: false, glow: "#22D3EE88", shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .linear(colors: ["#312E81", "#4338CA", "#6366F1", "#0E7490"], angle: 135.0),
                pattern: CallFramePattern(kind: .stripes, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF1F", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E0E7FF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFFFFF", size: .l, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .bold, color: "#FFFFFF", fill: "#1E1B4BB3"),
                title: CallFrameTitle(source: .names, font: .bold, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .bold, color: "#E0E7FF", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "signature.prisme.comite",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.06, gap: 0.025, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#FFFFFFCC", width: 0.004), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .linear(colors: ["#312E81", "#4338CA", "#6366F1", "#0E7490"], angle: 135.0),
                pattern: CallFramePattern(kind: .stripes, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF1F", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E0E7FF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFFFFF", size: .l, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .bold, color: "#FFFFFF", fill: "#1E1B4BB3"),
                title: CallFrameTitle(source: .group, font: .bold, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .bold, color: "#E0E7FF", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "signature.prisme.groupe",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.05, gap: 0.015, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#FFFFFFCC", width: 0.004), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .linear(colors: ["#312E81", "#4338CA", "#6366F1", "#0E7490"], angle: 135.0),
                pattern: CallFramePattern(kind: .stripes, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF1F", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E0E7FF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFFFFF", size: .l, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .bold, color: "#FFFFFF", fill: "#312E81CC"),
                title: CallFrameTitle(source: .group, font: .bold, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .bold, color: "#E0E7FF", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "signature.prisme.tablee",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.04, gap: 0.012, top: 0.1, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#FFFFFFCC", width: 0.004), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .linear(colors: ["#312E81", "#4338CA", "#6366F1", "#0E7490"], angle: 135.0),
                pattern: CallFramePattern(kind: .stripes, color: "#FFFFFF", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF1F", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E0E7FF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFFFFF", size: .l, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .bold, color: "#FFFFFF", fill: "#312E81CC"),
                title: CallFrameTitle(source: .group, font: .bold, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .none, font: .bold, color: "#FFFFFF", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "signature.bulle.duo",
            motif: "signature.bulle",
            mood: .signature,
            name: "Bulle",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.06, gap: 0.02, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.22, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.03, foot: 0.03), tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#1E1B4B"),
                pattern: CallFramePattern(kind: .dots, color: "#6366F1", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bubbles, color: "#818CF8", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .both, style: .bubble, font: .bubble, color: "#1E1B4B", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.bulle.comite",
            motif: "signature.bulle",
            mood: .signature,
            name: "Bulle",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.06, gap: 0.03, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.22, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.03, foot: 0.03), tilt: .gentle, tone: .color, duotone: nil),
                background: .solid(color: "#1E1B4B"),
                pattern: CallFramePattern(kind: .dots, color: "#6366F1", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bubbles, color: "#818CF8", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .handle, style: .bubble, font: .bubble, color: "#1E1B4B", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.bulle.groupe",
            motif: "signature.bulle",
            mood: .signature,
            name: "Bulle",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.2, stroke: CallFrameStroke(color: "#818CF8", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#1E1B4B"),
                pattern: CallFramePattern(kind: .dots, color: "#6366F1", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bubbles, color: "#818CF8", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .handle, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#6366F1"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "signature.echo.duo",
            motif: "signature.echo",
            mood: .signature,
            name: "Écho",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.05, top: 0.2, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#C7D2FE", width: 0.006), double: false, glow: "#818CF8CC", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#4338CA", "#1E1B4B", "#0F0D2E"]),
                pattern: CallFramePattern(kind: .waves, color: "#818CF8", opacity: 0.14),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#A5B4FC55", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .watermark, color: "#FFFFFF1F", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .caption, font: .bold, color: "#E0E7FF", fill: nil),
                title: CallFrameTitle(source: .brand, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .bubble, color: "#C7D2FECC", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        )
    ]
}
