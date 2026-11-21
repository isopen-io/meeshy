/// Le vocabulaire fixe des glyphes de la fiche (brief § 4 de la planche `profil-vue-finale`) qu'aucun catalogue
/// d'opérations ne porte : même idée, même glyphe, sur ma fiche comme sur celle d'un autre (#19674).
public nonisolated enum ProfileGlyph {
    /// « Sans contact » (`contactless-payment` de la planche) : les ondes dans leur cercle.
    public static let contactless = "wave.3.right.circle"
    /// « Écoute en ce moment » (`music-notes`).
    public static let listening = "music.note"
}
