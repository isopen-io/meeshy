// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let futuristeFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "futuriste.hud.duo",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.07, gap: 0.03, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#22D3EE", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .solid(color: "#05060F"),
                pattern: CallFramePattern(kind: .grid, color: "#22D3EE", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#22D3EE", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .scanlines, color: "#22D3EE1A", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#22D3EE", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#22D3EE", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#05060F", fill: "#22D3EECC"),
                title: CallFrameTitle(source: .names, font: .futuristic, color: "#22D3EE", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#E879F9", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.hud.comite",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.025, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#22D3EE", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .solid(color: "#05060F"),
                pattern: CallFramePattern(kind: .grid, color: "#22D3EE", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#22D3EE", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .scanlines, color: "#22D3EE1A", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#22D3EE", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#22D3EE", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#05060F", fill: "#22D3EECC"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#22D3EE", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#E879F9", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.hud.groupe",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.02, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#22D3EE", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .solid(color: "#05060F"),
                pattern: CallFramePattern(kind: .grid, color: "#22D3EE", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#22D3EE", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .scanlines, color: "#22D3EE1A", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#22D3EE", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#22D3EE", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#05060F", fill: "#22D3EECC"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#22D3EE", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#E879F9", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.hud.tablee",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.012, top: 0.12, bottom: 0.06),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#22D3EE", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .solid(color: "#05060F"),
                pattern: CallFramePattern(kind: .grid, color: "#22D3EE", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#22D3EE", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .scanlines, color: "#22D3EE1A", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#22D3EE", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#22D3EE", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#05060F", fill: "#22D3EECC"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#22D3EE", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#E879F9", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.hologramme.duo",
            motif: "futuriste.hologramme",
            mood: .futuriste,
            name: "Hologramme",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: nil, double: false, glow: "#E879F9", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0B3A", light: "#7FF3FF")),
                background: .radial(colors: ["#1A1040", "#05060F"]),
                pattern: CallFramePattern(kind: .scanlines, color: "#22D3EE", opacity: 0.1),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#22D3EE33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .glitch, color: "#E879F980", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E6FBFF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#E879F9", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .name, style: .caption, font: .neon, color: "#E879F9", fill: nil),
                title: CallFrameTitle(source: .names, font: .neon, color: "#22D3EE", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "futuriste.hologramme.comite",
            motif: "futuriste.hologramme",
            mood: .futuriste,
            name: "Hologramme",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.07, gap: 0.03, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: nil, double: false, glow: "#E879F9", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0B3A", light: "#7FF3FF")),
                background: .radial(colors: ["#1A1040", "#05060F"]),
                pattern: CallFramePattern(kind: .scanlines, color: "#22D3EE", opacity: 0.1),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#22D3EE33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .glitch, color: "#E879F980", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E6FBFF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#E879F9", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .name, style: .caption, font: .neon, color: "#E879F9", fill: nil),
                title: CallFrameTitle(source: .group, font: .neon, color: "#22D3EE", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "futuriste.hologramme.groupe",
            motif: "futuriste.hologramme",
            mood: .futuriste,
            name: "Hologramme",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.06, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: nil, double: false, glow: "#E879F9", shadow: false, card: nil, tilt: .gentle, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0B3A", light: "#7FF3FF")),
                background: .radial(colors: ["#1A1040", "#05060F"]),
                pattern: CallFramePattern(kind: .scanlines, color: "#22D3EE", opacity: 0.1),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#22D3EE33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .glitch, color: "#E879F980", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E6FBFF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#E879F9", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .name, style: .badge, font: .neon, color: "#E6FBFF", fill: "#05060FCC"),
                title: CallFrameTitle(source: .group, font: .neon, color: "#22D3EE", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "futuriste.orbite.duo",
            motif: "futuriste.orbite",
            mood: .futuriste,
            name: "Orbite",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#E879F9", width: 0.006), double: false, glow: "#22D3EE", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#05060F", "#0B1026", "#1B0B2E"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#E6FBFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#22D3EE66", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#E6FBFF99", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E6FBFF", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .caption, font: .futuristic, color: "#E6FBFF", fill: nil),
                title: CallFrameTitle(source: .names, font: .futuristic, color: "#E6FBFF", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#22D3EE", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.orbite.comite",
            motif: "futuriste.orbite",
            mood: .futuriste,
            name: "Orbite",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#E879F9", width: 0.006), double: false, glow: "#22D3EE", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#05060F", "#0B1026", "#1B0B2E"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#E6FBFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#22D3EE66", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#E6FBFF99", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E6FBFF", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#E6FBFF", fill: "#05060FCC"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#E6FBFF", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#22D3EE", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.orbite.groupe",
            motif: "futuriste.orbite",
            mood: .futuriste,
            name: "Orbite",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.06, gap: 0.025, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#E879F9", width: 0.006), double: false, glow: "#22D3EE", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#05060F", "#0B1026", "#1B0B2E"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#E6FBFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#22D3EE66", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#E6FBFF99", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E6FBFF", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#E6FBFF", fill: "#05060FCC"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#E6FBFF", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#22D3EE", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "futuriste.essaim.groupe",
            motif: "futuriste.essaim",
            mood: .futuriste,
            name: "Essaim",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.015, top: 0.14, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#22D3EE", width: 0.005), double: false, glow: "#E879F999", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#05060F", light: "#F5C2FF")),
                background: .linear(colors: ["#0B1026", "#05060F"], angle: 160.0),
                pattern: CallFramePattern(kind: .circuit, color: "#22D3EE", opacity: 0.12),
                border: CallFrameBorder(kind: .neon, color: "#E879F9", width: 0.005, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .scanlines, color: "#E879F914", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#E879F9", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .list, font: .futuristic, color: "#E6FBFF", fill: nil),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#E879F9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "futuriste.essaim.tablee",
            motif: "futuriste.essaim",
            mood: .futuriste,
            name: "Essaim",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.01, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#22D3EE", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#05060F", light: "#F5C2FF")),
                background: .linear(colors: ["#0B1026", "#05060F"], angle: 160.0),
                pattern: CallFramePattern(kind: .circuit, color: "#22D3EE", opacity: 0.12),
                border: CallFrameBorder(kind: .neon, color: "#E879F9", width: 0.005, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .scanlines, color: "#E879F914", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#E879F9", size: .m, font: nil),
                names: CallFrameNames(show: .none, style: .list, font: .futuristic, color: "#E6FBFF", fill: nil),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#E879F9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        )
    ]
}
