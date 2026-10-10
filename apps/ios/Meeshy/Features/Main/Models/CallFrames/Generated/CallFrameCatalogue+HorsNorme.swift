// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let horsNormeFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "hors-norme.pop-art.duo",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.06, gap: 0.03, top: 0.13, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1C3FFF", light: "#FFE600")),
                background: .solid(color: "#FF2E2E"),
                pattern: CallFramePattern(kind: .halftone, color: "#FFE600", opacity: 0.28),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.018),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFE60024", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightning, color: "#111111", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .handle, style: .bubble, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#FFE600", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "hors-norme.pop-art.comite",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.13, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#FF2E2E", light: "#FFE600")),
                background: .solid(color: "#1C3FFF"),
                pattern: CallFramePattern(kind: .halftone, color: "#FFFFFF", opacity: 0.18),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.018),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF1A", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightning, color: "#FFE600", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .handle, style: .bubble, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFE600", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "hors-norme.pop-art.groupe",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.045, gap: 0.018, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1C3FFF", light: "#FF2E2E")),
                background: .solid(color: "#FFE600"),
                pattern: CallFramePattern(kind: .halftone, color: "#FF2E2E", opacity: 0.22),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.018),
                ornaments: [
                    CallFrameOrnament(kind: .lightning, color: "#1C3FFF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#111111", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .handle, style: .badge, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#1C3FFF", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "hors-norme.pop-art.tablee",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.04, gap: 0.012, top: 0.11, bottom: 0.07),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.01), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1C3FFF", light: "#FFE600")),
                background: .solid(color: "#FF2E2E"),
                pattern: CallFramePattern(kind: .halftone, color: "#FFE600", opacity: 0.28),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.018),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFE60024", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightning, color: "#111111", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .none, style: .badge, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFE600", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "hors-norme.collage.duo",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.04, foot: 0.04), tilt: .wild, tone: .color, duotone: nil),
                background: .solid(color: "#F2EDE4"),
                pattern: CallFramePattern(kind: .checker, color: "#111111", opacity: 0.05),
                border: CallFrameBorder(kind: .torn, color: "#111111", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#1111111F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#FFE600B3", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#111111", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .handle, style: .tag, font: .tag, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .tag, color: "#FF2E2E", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#111111", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.collage.comite",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.06, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.04, foot: 0.04), tilt: .gentle, tone: .color, duotone: nil),
                background: .solid(color: "#F2EDE4"),
                pattern: CallFramePattern(kind: .checker, color: "#111111", opacity: 0.05),
                border: CallFrameBorder(kind: .torn, color: "#111111", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#1111111F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#FF2E2EB3", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .confetti, color: "#1C3FFF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#111111", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .both, style: .tag, font: .tag, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .tag, color: "#FF2E2E", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#111111", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.collage.groupe",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.05, gap: 0.025, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.05), tilt: .wild, tone: .color, duotone: nil),
                background: .solid(color: "#F2EDE4"),
                pattern: CallFramePattern(kind: .checker, color: "#111111", opacity: 0.05),
                border: CallFrameBorder(kind: .torn, color: "#111111", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#1111111F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#FFE600B3", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#111111", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .handle, style: .tag, font: .tag, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .tag, color: "#FF2E2E", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#111111", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.collage.tablee",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.045, gap: 0.02, top: 0.13, bottom: 0.09),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.05), tilt: .gentle, tone: .color, duotone: nil),
                background: .solid(color: "#F2EDE4"),
                pattern: CallFramePattern(kind: .checker, color: "#111111", opacity: 0.05),
                border: CallFrameBorder(kind: .torn, color: "#111111", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#1111111F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#FFE600B3", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#111111", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .none, style: .tag, font: .tag, color: "#111111", fill: nil),
                title: CallFrameTitle(source: .group, font: .tag, color: "#FF2E2E", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#111111", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.duo",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.035, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#B3122E", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#3A1B5E", "#120A22", "#07040E"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#1D4ED833", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .plate, font: .poster, color: "#F5E6C4", fill: "#0E0B1AD9"),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.comite",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .diamond, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#1D4ED8", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#12306B", "#0A1330", "#05070F"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .high, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E0A93B", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .plate, font: .poster, color: "#F5E6C4", fill: "#0E0B1AD9"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.groupe",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.02, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#0F8A5F", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#0D4A3A", "#082620", "#030C0A"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#1D4ED833", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .badge, font: .poster, color: "#F5E6C4", fill: "#0E0B1AD9"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.tablee",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.015, top: 0.15, bottom: 0.09),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#E0A93B", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#5A1020", "#2A0710", "#0C0206"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#1D4ED833", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .poster, color: "#F5E6C4", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.tete-d-affiche.comite",
            motif: "hors-norme.tete-d-affiche",
            mood: .horsNorme,
            name: "Tête d’affiche",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .star, radius: nil, stroke: CallFrameStroke(color: "#F5C84B", width: 0.01), double: false, glow: "#FF3E8A", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#5A0F3C", "#1E0616", "#0A0208"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FF3E8A", opacity: 0.12),
                border: CallFrameBorder(kind: .bulbs, color: "#F5C84B", width: 0.02, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .sparkles, color: "#F5C84B", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .bokeh, color: "#FF3E8A40", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .handle, style: .badge, font: .poster, color: "#1E0616", fill: "#F5C84B"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#F5C84B", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .brand, font: .cartoon, color: "#FFD1E4", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.tete-d-affiche.groupe",
            motif: "hors-norme.tete-d-affiche",
            mood: .horsNorme,
            name: "Tête d’affiche",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.022, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .star, radius: nil, stroke: CallFrameStroke(color: "#F5C84B", width: 0.01), double: false, glow: "#FF3E8A", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#5A0F3C", "#1E0616", "#0A0208"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FF3E8A", opacity: 0.12),
                border: CallFrameBorder(kind: .bulbs, color: "#F5C84B", width: 0.02, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .sparkles, color: "#F5C84B", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .bokeh, color: "#FF3E8A40", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .handle, style: .badge, font: .poster, color: "#1E0616", fill: "#F5C84B"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#F5C84B", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .brand, font: .cartoon, color: "#FFD1E4", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "hors-norme.tete-d-affiche.tablee",
            motif: "hors-norme.tete-d-affiche",
            mood: .horsNorme,
            name: "Tête d’affiche",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.015, top: 0.15, bottom: 0.09),
                slot: CallFrameSlotStyle(shape: .star, radius: nil, stroke: CallFrameStroke(color: "#F5C84B", width: 0.007), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#5A0F3C", "#1E0616", "#0A0208"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FF3E8A", opacity: 0.12),
                border: CallFrameBorder(kind: .bulbs, color: "#F5C84B", width: 0.02, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .sparkles, color: "#F5C84B", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .bokeh, color: "#FF3E8A40", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .none, style: .badge, font: .poster, color: "#1E0616", fill: "#F5C84B"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#F5C84B", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .brand, font: .cartoon, color: "#FFD1E4", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        )
    ]
}
