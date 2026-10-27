// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let jovialFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "jovial.fete.duo",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.035), double: false, glow: nil, shadow: true, card: nil, tilt: .wild, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFE45E", "#FF9F43", "#FF3D7F"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#7B2FF7", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .confetti, color: "#00D4FF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .ribbon, color: "#7B2FF7", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#7B2FF7", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFE08A", width: 0.026), double: false, glow: "#FFD24A88", shadow: true, card: nil, tilt: .wild, tone: .color, duotone: nil), background: .radial(colors: ["#FF4F9A", "#B5176B", "#5E0C3A"]), ornaments: [CallFrameOrnament(kind: .confetti, color: "#FFE08A", density: .mid, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFF1B8", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_fete_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_fete_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "jovial.fete.comite",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.035, top: 0.17, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.03), double: false, glow: nil, shadow: true, card: nil, tilt: .wild, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFE45E", "#FF9F43", "#FF3D7F"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#7B2FF7", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .confetti, color: "#00D4FF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .ribbon, color: "#7B2FF7", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#7B2FF7"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFE08A", width: 0.026), double: false, glow: "#FFD24A88", shadow: true, card: nil, tilt: .wild, tone: .color, duotone: nil), background: .radial(colors: ["#FF4F9A", "#B5176B", "#5E0C3A"]), ornaments: [CallFrameOrnament(kind: .confetti, color: "#FFE08A", density: .mid, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFF1B8", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_fete_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_fete_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "jovial.fete.groupe",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.05, gap: 0.025, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.12, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.025), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFE45E", "#FF9F43", "#FF3D7F"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#7B2FF7", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#00D4FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .ribbon, color: "#7B2FF7", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#7B2FF7"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFE08A", width: 0.026), double: false, glow: "#FFD24A88", shadow: true, card: nil, tilt: .wild, tone: .color, duotone: nil), background: .radial(colors: ["#FF4F9A", "#B5176B", "#5E0C3A"]), ornaments: [CallFrameOrnament(kind: .confetti, color: "#FFE08A", density: .mid, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFF1B8", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_fete_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_fete_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "jovial.fete.tablee",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.14, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.018), double: false, glow: nil, shadow: false, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .radial(colors: ["#FFE45E", "#FF9F43", "#FF3D7F"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFFFFF", opacity: 0.2),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#7B2FF7", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .confetti, color: "#00D4FF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .ribbon, color: "#7B2FF7", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .s, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .none, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#7B2FF7"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFE08A", width: 0.026), double: false, glow: "#FFD24A88", shadow: true, card: nil, tilt: .wild, tone: .color, duotone: nil), background: .radial(colors: ["#FF4F9A", "#B5176B", "#5E0C3A"]), ornaments: [CallFrameOrnament(kind: .confetti, color: "#FFE08A", density: .mid, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .bubble, color: "#FFF1B8", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_fete_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_fete_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "jovial.fanfare.duo",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.04, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .ticket, radius: 0.08, stroke: CallFrameStroke(color: "#073B4C", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .ribbon, font: .cartoon, color: "#FFD166", fill: "#073B4C"),
                title: CallFrameTitle(source: .names, font: .cartoon, color: "#073B4C", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .brush, color: "#B5294E", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "jovial.fanfare.comite",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .ticket, radius: 0.08, stroke: CallFrameStroke(color: "#073B4C", width: 0.012), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .badge, font: .cartoon, color: "#FFD166", fill: "#073B4C"),
                title: CallFrameTitle(source: .group, font: .cartoon, color: "#073B4C", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "jovial.fanfare.groupe",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.02, top: 0.15, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#073B4C", width: 0.01), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .list, font: .cartoon, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .group, font: .cartoon, color: "#073B4C", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "jovial.fanfare.tablee",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .ticket, radius: 0.06, stroke: CallFrameStroke(color: "#073B4C", width: 0.008), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .list, font: .cartoon, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .group, font: .cartoon, color: "#073B4C", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "jovial.ballons.duo",
            motif: "jovial.ballons",
            mood: .jovial,
            name: "Ballons",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.07, gap: 0.04, top: 0.17, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.028), double: false, glow: "#FFFFFFB0", shadow: false, card: nil, tilt: .wild, tone: .color, duotone: nil),
                background: .linear(colors: ["#9BB8FF", "#C8B6FF", "#FFC8F0", "#FFE0B8"], angle: 0.0),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .balloons, color: "#FF4D8D", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#FFD23F", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#3DDCFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#FFFFFF", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .brush, color: "#3A0CA3", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .brush, color: "#3A0CA3", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .bubble, color: "#FF4D8D", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(background: .linear(colors: ["#BFE4FF", "#FFD6E8"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .balloons, color: "#FF5C8A", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .brush, color: "#2E1E8A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_ballons_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_ballons_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "jovial.ballons.comite",
            motif: "jovial.ballons",
            mood: .jovial,
            name: "Ballons",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.024), double: false, glow: "#FFFFFFB0", shadow: false, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .linear(colors: ["#9BB8FF", "#C8B6FF", "#FFC8F0", "#FFE0B8"], angle: 0.0),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .balloons, color: "#FF4D8D", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#FFD23F", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#3DDCFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#FFFFFF", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .brush, color: "#3A0CA3", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .brush, color: "#3A0CA3", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(background: .linear(colors: ["#BFE4FF", "#FFD6E8"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .balloons, color: "#FF5C8A", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .brush, color: "#2E1E8A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_ballons_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_ballons_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "jovial.ballons.groupe",
            motif: "jovial.ballons",
            mood: .jovial,
            name: "Ballons",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.022), double: false, glow: nil, shadow: false, card: nil, tilt: .wild, tone: .color, duotone: nil),
                background: .linear(colors: ["#9BB8FF", "#C8B6FF", "#FFC8F0", "#FFE0B8"], angle: 0.0),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .balloons, color: "#FF4D8D", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#FFD23F", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .balloons, color: "#3DDCFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#FFFFFF", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#3A0CA3"),
                title: CallFrameTitle(source: .group, font: .brush, color: "#3A0CA3", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(background: .linear(colors: ["#BFE4FF", "#FFD6E8"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .balloons, color: "#FF5C8A", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .group, font: .brush, color: "#2E1E8A", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: nil), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_ballons_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_ballons_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.16)]))]
        ),
        CallFrameDesign(
            id: "jovial.grimaces.duo",
            motif: "jovial.grimaces",
            mood: .jovial,
            name: "Grimaces",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.05, top: 0.13, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.17), tilt: .wild, tone: .color, duotone: nil),
                background: .solid(color: "#FFE600"),
                pattern: CallFramePattern(kind: .checker, color: "#000000", opacity: 0.07),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#FF4FA3", density: .low, layer: .front),
                    CallFrameOrnament(kind: .lightning, color: "#FF2E93", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#000000", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#000000", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .caption, font: .tag, color: "#111111", fill: nil),
                title: CallFrameTitle(source: .names, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#FFFFFF", place: .bottom, size: .m, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.17), tilt: .wild, tone: .color, duotone: nil), background: .solid(color: "#FFD93B"), ornaments: [CallFrameOrnament(kind: .lightning, color: "#FF4FA3", density: .low, layer: .back, motion: .loop), CallFrameOrnament(kind: .stars, color: "#FFFFFF", density: .low, layer: .front, motion: .loop)], names: CallFrameNames(show: .handle, style: .caption, font: .tag, color: "#111111", fill: nil), title: CallFrameTitle(source: .names, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/jovial_grimaces_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/jovial_grimaces_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        )
    ]
}
