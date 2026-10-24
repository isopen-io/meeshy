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
                layout: CallFrameLayout(arrangement: .split, margin: 0.05, gap: 0.035, top: 0.12, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#0A0A10"),
                pattern: CallFramePattern(kind: .scanlines, color: "#000000", opacity: 0.5),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF3EA5", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .glitch, color: "#E8E8F0", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#F5F5F5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .grain, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#F5F5F5", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .caption, font: .typewriter, color: "#E8E8F0", fill: nil),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#FFB000", place: .bottom, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .names, font: .typewriter, color: "#E8E8F0", place: .bottom, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#E7DECB", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil), background: .solid(color: "#0B0D11"), ornaments: [CallFrameOrnament(kind: .glitch, color: "#AFC3D3", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF3B30", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#FFB000", place: .bottom, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_vhs_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_vhs_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "glauque.vhs.comite",
            motif: "glauque.vhs",
            mood: .glauque,
            name: "VHS",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.025, top: 0.13, bottom: 0.13),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#0A0A10"),
                pattern: CallFramePattern(kind: .scanlines, color: "#000000", opacity: 0.5),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF3EA5", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .glitch, color: "#E8E8F0", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#F5F5F5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .grain, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#F5F5F5", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .caption, font: .typewriter, color: "#E8E8F0", fill: nil),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#FFB000", place: .bottom, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#E7DECB", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil), background: .solid(color: "#0B0D11"), ornaments: [CallFrameOrnament(kind: .glitch, color: "#AFC3D3", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF3B30", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#FFB000", place: .bottom, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_vhs_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_vhs_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "glauque.vhs.groupe",
            motif: "glauque.vhs",
            mood: .glauque,
            name: "VHS",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.04, gap: 0.02, top: 0.12, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#0A0A10"),
                pattern: CallFramePattern(kind: .scanlines, color: "#000000", opacity: 0.5),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FF3EA5", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .glitch, color: "#E8E8F0", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#F5F5F5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .grain, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#F5F5F5", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .plate, font: .typewriter, color: "#E8E8F0", fill: "#0A0A10B3"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#FFB000", place: .bottom, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#E7DECB", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil), background: .solid(color: "#0B0D11"), ornaments: [CallFrameOrnament(kind: .glitch, color: "#AFC3D3", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF3B30", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#FFB000", place: .bottom, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_vhs_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_vhs_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.18)]))]
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.duo",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.05, gap: 0.015, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")),
                background: .solid(color: "#050A05"),
                pattern: CallFramePattern(kind: .scanlines, color: "#7CFF6B", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#7CFF6B", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#9DFF8A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#7CFF6B10", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#7CFF6B", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .typewriter, color: "#9DFF8A", fill: "#021A05CC"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .names, font: .typewriter, color: "#7CFF6B", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")), background: .solid(color: "#061009"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF2A1A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_videosurveillance_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_videosurveillance_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.comite",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.015, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")),
                background: .solid(color: "#050A05"),
                pattern: CallFramePattern(kind: .scanlines, color: "#7CFF6B", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#7CFF6B", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#9DFF8A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#7CFF6B10", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#7CFF6B", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .typewriter, color: "#9DFF8A", fill: "#021A05CC"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")), background: .solid(color: "#061009"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF2A1A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_videosurveillance_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_videosurveillance_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.groupe",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.04, gap: 0.012, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")),
                background: .solid(color: "#050A05"),
                pattern: CallFramePattern(kind: .scanlines, color: "#7CFF6B", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#7CFF6B", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .rec, color: "#9DFF8A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#7CFF6B10", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#7CFF6B", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .typewriter, color: "#9DFF8A", fill: "#021A05CC"),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")), background: .solid(color: "#061009"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF2A1A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_videosurveillance_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_videosurveillance_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "glauque.videosurveillance.tablee",
            motif: "glauque.videosurveillance",
            mood: .glauque,
            name: "Vidéosurveillance",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.04, gap: 0.01, top: 0.11, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")),
                background: .solid(color: "#050A05"),
                pattern: CallFramePattern(kind: .scanlines, color: "#7CFF6B", opacity: 0.08),
                border: CallFrameBorder(kind: .brackets, color: "#7CFF6B", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .rec, color: "#9DFF8A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#7CFF6B10", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#7CFF6B", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .list, font: .typewriter, color: "#9DFF8A", fill: nil),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#7CFF6B", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#021A05", light: "#9DFF8A")), background: .solid(color: "#061009"), ornaments: [CallFrameOrnament(kind: .crosshair, color: "#7CFF6B", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .rec, color: "#FF2A1A", density: .low, layer: .front, motion: .loop)], title: CallFrameTitle(source: .date, font: .typewriter, color: "#9DFF8A", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_videosurveillance_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_videosurveillance_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
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
            ),
            surfaces: [.capture, .live]
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
            ),
            surfaces: [.capture, .live]
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
            ),
            surfaces: [.capture, .live]
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
            ),
            surfaces: [.capture]
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
            ),
            surfaces: [.capture]
        ),
        CallFrameDesign(
            id: "glauque.prison.duo",
            motif: "glauque.prison",
            mood: .glauque,
            name: "Prison",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.07, gap: 0.035, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#16181B", width: 0.008), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .linear(colors: ["#C9CDD2", "#A9AFB6"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#16181B", opacity: 0.3),
                border: CallFrameBorder(kind: .brackets, color: "#16181B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FFFFFF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FF7A1A", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .plate, font: .typewriter, color: "#111111", fill: "#FF7A1A"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#16181B", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#16181B", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2E3338", width: 0.01), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .noir, duotone: nil), background: .linear(colors: ["#9EA2A6", "#53585E"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)], title: CallFrameTitle(source: .group, font: .poster, color: "#F4F4F2", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#F4F4F2", place: .top, size: .s, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_prison_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_prison_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "glauque.prison.comite",
            motif: "glauque.prison",
            mood: .glauque,
            name: "Prison",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.03, top: 0.15, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#16181B", width: 0.008), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .linear(colors: ["#C9CDD2", "#A9AFB6"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#16181B", opacity: 0.3),
                border: CallFrameBorder(kind: .brackets, color: "#16181B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FFFFFF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FF7A1A", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .plate, font: .typewriter, color: "#111111", fill: "#FF7A1A"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#16181B", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#16181B", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2E3338", width: 0.01), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .noir, duotone: nil), background: .linear(colors: ["#9EA2A6", "#53585E"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)], title: CallFrameTitle(source: .group, font: .poster, color: "#F4F4F2", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#F4F4F2", place: .top, size: .s, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_prison_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_prison_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "glauque.prison.groupe",
            motif: "glauque.prison",
            mood: .glauque,
            name: "Prison",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#16181B", width: 0.008), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .linear(colors: ["#C9CDD2", "#A9AFB6"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#16181B", opacity: 0.3),
                border: CallFrameBorder(kind: .brackets, color: "#16181B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FFFFFF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FF7A1A", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .plate, font: .typewriter, color: "#111111", fill: "#FF7A1A"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#16181B", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#16181B", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2E3338", width: 0.01), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .noir, duotone: nil), background: .linear(colors: ["#9EA2A6", "#53585E"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)], title: CallFrameTitle(source: .group, font: .poster, color: "#F4F4F2", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#F4F4F2", place: .top, size: .s, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_prison_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_prison_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        ),
        CallFrameDesign(
            id: "glauque.prison.tablee",
            motif: "glauque.prison",
            mood: .glauque,
            name: "Prison",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#16181B", width: 0.008), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .linear(colors: ["#C9CDD2", "#A9AFB6"], angle: 0.0),
                pattern: CallFramePattern(kind: .grid, color: "#16181B", opacity: 0.3),
                border: CallFrameBorder(kind: .brackets, color: "#16181B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#FFFFFF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FF7A1A", size: .s, font: StoryTextStyle.typewriter),
                names: CallFrameNames(show: .name, style: .list, font: .typewriter, color: "#16181B", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#16181B", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#16181B", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live],
            styles: [CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#2E3338", width: 0.01), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .noir, duotone: nil), background: .linear(colors: ["#9EA2A6", "#53585E"], angle: 0.0), ornaments: [CallFrameOrnament(kind: .scanlines, color: "#16181B1A", density: .low, layer: .front, motion: .loop), CallFrameOrnament(kind: .vignette, color: "#0B0C0E", density: .mid, layer: .back)], title: CallFrameTitle(source: .group, font: .poster, color: "#F4F4F2", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#F4F4F2", place: .top, size: .s, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper), scene: [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/glauque_prison_back.webp", preset: nil, color: nil, amount: nil, maxParticles: nil), CallFrameSceneLayer(id: "moulure", kind: .image, depth: .front, src: "assets/call-frames/glauque_prison_front.webp", preset: nil, color: nil, amount: nil, maxParticles: nil, slice: 0.17)]))]
        )
    ]
}
