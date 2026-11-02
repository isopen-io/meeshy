// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

/// Les douze ambiances, dans l'ordre du catalogue web (`FRAME_MOODS`) — un fichier par ambiance,
/// chacun sous le budget de taille des sources.
nonisolated extension CallFrameCatalogue {
    static let generated: [CallFrameDesign] = [
        signatureFrames,
        distingueFrames,
        elegantFrames,
        jovialFrames,
        deconnecteFrames,
        corporateFrames,
        fantastiqueFrames,
        futuristeFrames,
        glauqueFrames,
        horsNormeFrames,
        morbideFrames,
        feeriqueFrames
    ].flatMap { $0 }
}
