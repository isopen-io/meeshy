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
                layout: CallFrameLayout(arrangement: .split, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#C6FF00", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0A0F0A", "#030503"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#C6FF00", opacity: 0.12),
                border: CallFrameBorder(kind: .brackets, color: "#C6FF00", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crosshair, color: "#C6FF00", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#C6FF0014", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#C6FF00", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#C6FF00", size: .s, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#0A0F0A", fill: "#C6FF00"),
                title: CallFrameTitle(source: .names, font: .futuristic, color: "#C6FF00", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#FFFFFF", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF4A", width: 0.004), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil), background: .solid(color: "#17191C"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF4A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#7CFF4A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#7CFF4A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hud_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hud_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "futuriste.hud.comite",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#C6FF00", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0A0F0A", "#030503"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#C6FF00", opacity: 0.12),
                border: CallFrameBorder(kind: .brackets, color: "#C6FF00", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crosshair, color: "#C6FF00", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#C6FF0014", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#C6FF00", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#C6FF00", size: .s, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#0A0F0A", fill: "#C6FF00"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#C6FF00", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF4A", width: 0.004), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil), background: .solid(color: "#17191C"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF4A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#7CFF4A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#7CFF4A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hud_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hud_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "futuriste.hud.groupe",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.02, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#C6FF00", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0A0F0A", "#030503"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#C6FF00", opacity: 0.12),
                border: CallFrameBorder(kind: .brackets, color: "#C6FF00", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crosshair, color: "#C6FF00", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#C6FF0014", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#C6FF00", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#C6FF00", size: .s, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#0A0F0A", fill: "#C6FF00"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#C6FF00", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF4A", width: 0.004), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil), background: .solid(color: "#17191C"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF4A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#7CFF4A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#7CFF4A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hud_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hud_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "futuriste.hud.tablee",
            motif: "futuriste.hud",
            mood: .futuriste,
            name: "HUD",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.015, top: 0.13, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#C6FF00", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0A0F0A", "#030503"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#C6FF00", opacity: 0.12),
                border: CallFrameBorder(kind: .brackets, color: "#C6FF00", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crosshair, color: "#C6FF00", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#C6FF0014", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#C6FF00", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#C6FF00", size: .s, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .list, font: .futuristic, color: "#C6FF00", fill: nil),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#C6FF00", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF4A", width: 0.004), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil), background: .solid(color: "#17191C"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF4A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#7CFF4A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#7CFF4A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hud_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hud_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "futuriste.hologramme.duo",
            motif: "futuriste.hologramme",
            mood: .futuriste,
            name: "Hologramme",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#00F0FF", width: 0.006), double: false, glow: "#FF00E5AA", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#5B13C9", light: "#7DFBFF")),
                background: .radial(colors: ["#3A0A6B", "#14002B", "#05000F"]),
                pattern: CallFramePattern(kind: .scanlines, color: "#00F0FF", opacity: 0.1),
                border: CallFrameBorder(kind: .neon, color: "#FF00E5", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .glitch, color: "#FF00E5", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FF00E5", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#00F0FF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#00F0FF", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .caption, font: .neon, color: "#FF7AF5", fill: nil),
                title: CallFrameTitle(source: .names, font: .futuristic, color: "#00F0FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .neon, color: "#FF7AF5", place: .top, size: .s, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#36E3FF", width: 0.006), double: false, glow: "#FF4FD8AA", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1B0A3F", light: "#9BF3FF")), background: .radial(colors: ["#1A0A3A", "#05020F"]), ornaments: [CallFrameOrnament(kind: .glitch, color: "#36E3FF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#5AF0FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hologramme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hologramme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "futuriste.hologramme.comite",
            motif: "futuriste.hologramme",
            mood: .futuriste,
            name: "Hologramme",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.1, stroke: CallFrameStroke(color: "#00F0FF", width: 0.006), double: false, glow: "#FF00E5AA", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#5B13C9", light: "#7DFBFF")),
                background: .radial(colors: ["#3A0A6B", "#14002B", "#05000F"]),
                pattern: CallFramePattern(kind: .scanlines, color: "#00F0FF", opacity: 0.1),
                border: CallFrameBorder(kind: .neon, color: "#FF00E5", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .glitch, color: "#FF00E5", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FF00E5", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#00F0FF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#00F0FF", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .caption, font: .neon, color: "#FF7AF5", fill: nil),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#00F0FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#36E3FF", width: 0.006), double: false, glow: "#FF4FD8AA", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1B0A3F", light: "#9BF3FF")), background: .radial(colors: ["#1A0A3A", "#05020F"]), ornaments: [CallFrameOrnament(kind: .glitch, color: "#36E3FF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#5AF0FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hologramme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hologramme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "futuriste.hologramme.groupe",
            motif: "futuriste.hologramme",
            mood: .futuriste,
            name: "Hologramme",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.02, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#00F0FF", width: 0.005), double: false, glow: "#FF00E588", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#5B13C9", light: "#7DFBFF")),
                background: .radial(colors: ["#3A0A6B", "#14002B", "#05000F"]),
                pattern: CallFramePattern(kind: .scanlines, color: "#00F0FF", opacity: 0.1),
                border: CallFrameBorder(kind: .neon, color: "#FF00E5", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .glitch, color: "#FF00E5", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FF00E5", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#00F0FF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#00F0FF", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .badge, font: .neon, color: "#00F0FF", fill: "#14002BCC"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#00F0FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#36E3FF", width: 0.006), double: false, glow: "#FF4FD8AA", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1B0A3F", light: "#9BF3FF")), background: .radial(colors: ["#1A0A3A", "#05020F"]), ornaments: [CallFrameOrnament(kind: .glitch, color: "#36E3FF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#5AF0FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_hologramme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_hologramme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "futuriste.orbite.duo",
            motif: "futuriste.orbite",
            mood: .futuriste,
            name: "Orbite",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.05, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFD08A", width: 0.008), double: false, glow: "#FF5E7EAA", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#07051F", "#2B0B57", "#9C1F6E", "#FF5E5B", "#FFB347"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.3),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#FFD08A", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFD08A", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#FFFFFF", fill: "#2B0B57CC"),
                title: CallFrameTitle(source: .names, font: .brush, color: "#FFD08A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#FFB8D9", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F2C86A", width: 0.008), double: false, glow: "#F2C86A88", shadow: true, card: nil, tilt: .none, tone: .warm, duotone: nil), background: .radial(colors: ["#1B1140", "#03020A"]), ornaments: [CallFrameOrnament(kind: .orbits, color: "#F2C86A", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#FFFFFF", fill: "#1B1140CC"), title: CallFrameTitle(source: .group, font: .brush, color: "#FFE3A1", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_orbite_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_orbite_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "futuriste.orbite.comite",
            motif: "futuriste.orbite",
            mood: .futuriste,
            name: "Orbite",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFD08A", width: 0.008), double: false, glow: "#FF5E7EAA", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#07051F", "#2B0B57", "#9C1F6E", "#FF5E5B", "#FFB347"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.3),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#FFD08A", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFD08A", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#FFFFFF", fill: "#2B0B57CC"),
                title: CallFrameTitle(source: .group, font: .brush, color: "#FFD08A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F2C86A", width: 0.008), double: false, glow: "#F2C86A88", shadow: true, card: nil, tilt: .none, tone: .warm, duotone: nil), background: .radial(colors: ["#1B1140", "#03020A"]), ornaments: [CallFrameOrnament(kind: .orbits, color: "#F2C86A", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#FFFFFF", fill: "#1B1140CC"), title: CallFrameTitle(source: .group, font: .brush, color: "#FFE3A1", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_orbite_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_orbite_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "futuriste.orbite.groupe",
            motif: "futuriste.orbite",
            mood: .futuriste,
            name: "Orbite",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFD08A", width: 0.008), double: false, glow: "#FF5E7EAA", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#07051F", "#2B0B57", "#9C1F6E", "#FF5E5B", "#FFB347"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.3),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#FFD08A", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFD08A", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#FFFFFF", fill: "#2B0B57CC"),
                title: CallFrameTitle(source: .group, font: .brush, color: "#FFD08A", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F2C86A", width: 0.008), double: false, glow: "#F2C86A88", shadow: true, card: nil, tilt: .none, tone: .warm, duotone: nil), background: .radial(colors: ["#1B1140", "#03020A"]), ornaments: [CallFrameOrnament(kind: .orbits, color: "#F2C86A", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .handle, style: .badge, font: .futuristic, color: "#FFFFFF", fill: "#1B1140CC"), title: CallFrameTitle(source: .group, font: .brush, color: "#FFE3A1", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/futuriste_orbite_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/futuriste_orbite_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
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
            ),
            surfaces: [.capture]
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
            ),
            surfaces: [.capture]
        )
    ]
}
