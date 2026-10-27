// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

/// Les ambiances que le carrousel d'appel ouvre d'office (#12683), dans leur ordre, et leurs cadres vedettes.
nonisolated extension CallFrameCatalogue {
    static let spotlight: [CallFrameSpotlight] = [
        CallFrameSpotlight(mood: .signature, featured: ["signature.aurore", "signature.prisme", "signature.bulle"]),
        CallFrameSpotlight(mood: .jovial, featured: ["jovial.fete", "jovial.ballons", "jovial.grimaces"]),
        CallFrameSpotlight(mood: .feerique, featured: ["feerique.lucioles", "feerique.clair-de-lune", "feerique.coeur-de-rose"]),
        CallFrameSpotlight(mood: .futuriste, featured: ["futuriste.hologramme", "futuriste.hud", "futuriste.orbite"]),
        CallFrameSpotlight(mood: .horsNorme, featured: ["hors-norme.pop-art", "hors-norme.collage", "hors-norme.tete-d-affiche"]),
        CallFrameSpotlight(mood: .glauque, featured: ["glauque.vhs", "glauque.prison", "glauque.videosurveillance"]),
        CallFrameSpotlight(mood: .morbide, featured: ["morbide.tombe", "morbide.memento", "morbide.crypte", "morbide.faire-part"])
    ]
}
