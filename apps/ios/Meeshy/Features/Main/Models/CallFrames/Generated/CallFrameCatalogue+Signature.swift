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
                layout: CallFrameLayout(arrangement: .split, margin: 0.07, gap: 0.035, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.12, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: false, glow: "#FF7AB6AA", shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF5FA2", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FFD3E8", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .handle, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#2A0E5CCC"),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .bubble, color: "#FFD3E8", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.1), ornaments: [CallFrameOrnament(kind: .bokeh, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_aurore_back.webp", preset: nil, color: nil, amount: 0.55, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_aurore_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.aurore.comite",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: false, glow: "#FF7AB6AA", shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF5FA2", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FFD3E8", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .handle, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#2A0E5CCC"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.1), ornaments: [CallFrameOrnament(kind: .bokeh, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_aurore_back.webp", preset: nil, color: nil, amount: 0.55, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_aurore_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.aurore.groupe",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.02, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.01), double: false, glow: "#FF7AB6AA", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF5FA2", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FFD3E8", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .handle, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#2A0E5CCC"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.1), ornaments: [CallFrameOrnament(kind: .bokeh, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_aurore_back.webp", preset: nil, color: nil, amount: 0.55, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_aurore_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.aurore.tablee",
            motif: "signature.aurore",
            mood: .signature,
            name: "Aurore",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.13, bottom: 0.09),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.18, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.008), double: false, glow: "#FF7AB688", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .accent,
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF5FA2", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FFD3E8", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .handle, style: .list, font: .bubble, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.1), ornaments: [CallFrameOrnament(kind: .bokeh, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_aurore_back.webp", preset: nil, color: nil, amount: 0.55, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_aurore_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.prisme.duo",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.1, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.016), double: true, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDEBFF", "#E2D4FF", "#FFD1EA", "#FFF1BF"], angle: 135.0),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#8B5CF6", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#38BDF8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#4C1D95", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#FFFFFF", fill: "#4C1D95D9"),
                title: CallFrameTitle(source: .names, font: .futuristic, color: "#4C1D95", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.08, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: true, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .linear(colors: ["#E6F6FF", "#F3E9FF", "#FFE6F3"], angle: 135.0), ornaments: [CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#3B1A7A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_prisme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_prisme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.prisme.comite",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.08, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.014), double: true, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDEBFF", "#E2D4FF", "#FFD1EA", "#FFF1BF"], angle: 135.0),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#8B5CF6", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#38BDF8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#4C1D95", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#FFFFFF", fill: "#4C1D95D9"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#4C1D95", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.08, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: true, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .linear(colors: ["#E6F6FF", "#F3E9FF", "#FFE6F3"], angle: 135.0), ornaments: [CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#3B1A7A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_prisme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_prisme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.prisme.groupe",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.08, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDEBFF", "#E2D4FF", "#FFD1EA", "#FFF1BF"], angle: 135.0),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#8B5CF6", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#38BDF8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#4C1D95", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .plate, font: .futuristic, color: "#FFFFFF", fill: "#4C1D95D9"),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#4C1D95", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.08, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: true, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .linear(colors: ["#E6F6FF", "#F3E9FF", "#FFE6F3"], angle: 135.0), ornaments: [CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#3B1A7A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_prisme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_prisme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.prisme.tablee",
            motif: "signature.prisme",
            mood: .signature,
            name: "Prisme",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.13, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.1, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.01), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDEBFF", "#E2D4FF", "#FFD1EA", "#FFF1BF"], angle: 135.0),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#8B5CF6", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#38BDF8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#4C1D95", size: .m, font: StoryTextStyle.futuristic),
                names: CallFrameNames(show: .handle, style: .list, font: .futuristic, color: "#4C1D95", fill: nil),
                title: CallFrameTitle(source: .group, font: .futuristic, color: "#4C1D95", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .futuristic, color: "#7C3AED", place: .bottom, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.08, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.012), double: true, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .linear(colors: ["#E6F6FF", "#F3E9FF", "#FFE6F3"], angle: 135.0), ornaments: [CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .futuristic, color: "#3B1A7A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_prisme_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_prisme_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.bulle.duo",
            motif: "signature.bulle",
            mood: .signature,
            name: "Bulle",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.07, gap: 0.04, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.022), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFB3DE", "#FF6FB5", "#B5179E"]),
                pattern: CallFramePattern(kind: .dots, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bubbles, color: "#FFFFFF", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .hearts, color: "#FFE3F1", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#B5179E", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .bubble, color: "#FFE3F1", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.02), double: false, glow: "#B59CFFAA", shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .radial(colors: ["#6E4BFF", "#3B2A8C", "#1A1240"]), ornaments: [CallFrameOrnament(kind: .bubbles, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .hearts, color: "#FFB3E6", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#4C2BB5", fill: "#FFFFFF"), title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_bulle_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_bulle_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.bulle.comite",
            motif: "signature.bulle",
            mood: .signature,
            name: "Bulle",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.022), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFB3DE", "#FF6FB5", "#B5179E"]),
                pattern: CallFramePattern(kind: .dots, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bubbles, color: "#FFFFFF", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .hearts, color: "#FFE3F1", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#B5179E", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.02), double: false, glow: "#B59CFFAA", shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .radial(colors: ["#6E4BFF", "#3B2A8C", "#1A1240"]), ornaments: [CallFrameOrnament(kind: .bubbles, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .hearts, color: "#FFB3E6", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#4C2BB5", fill: "#FFFFFF"), title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_bulle_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_bulle_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "signature.bulle.groupe",
            motif: "signature.bulle",
            mood: .signature,
            name: "Bulle",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.06, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.016), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFB3DE", "#FF6FB5", "#B5179E"]),
                pattern: CallFramePattern(kind: .dots, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bubbles, color: "#FFFFFF", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .hearts, color: "#FFE3F1", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#B5179E", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.02), double: false, glow: "#B59CFFAA", shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil), background: .radial(colors: ["#6E4BFF", "#3B2A8C", "#1A1240"]), ornaments: [CallFrameOrnament(kind: .bubbles, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .hearts, color: "#FFB3E6", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#4C2BB5", fill: "#FFFFFF"), title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/signature_bulle_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/signature_bulle_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
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
            ),
            surfaces: [.capture, .live]
        )
    ]
}
