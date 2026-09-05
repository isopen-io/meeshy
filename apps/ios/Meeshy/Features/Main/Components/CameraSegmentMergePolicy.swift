import AVFoundation
import CoreMedia

// MARK: - La politique de fusion des segments (#4099, vue 4b)

/// **Le format d'un segment, réduit à ce qui décide d'un ré-encodage.**
///
/// Deux segments se concatènent sans ré-encoder si et seulement si le lecteur
/// peut lire les deux pistes comme une seule : même codec, mêmes dimensions.
/// Rien d'autre n'entre dans la décision — ni la durée, ni l'ordre, ni le
/// nombre.
nonisolated struct SegmentVideoFormat: Equatable, Sendable {
    let codec: FourCharCode
    let width: Int32
    let height: Int32

    init(codec: FourCharCode, width: Int32, height: Int32) {
        self.codec = codec
        self.width = width
        self.height = height
    }

    /// Lu depuis la description de format de la piste vidéo d'un segment.
    init(formatDescription: CMFormatDescription) {
        let dimensions = CMVideoFormatDescriptionGetDimensions(formatDescription)
        self.codec = CMFormatDescriptionGetMediaSubType(formatDescription)
        self.width = dimensions.width
        self.height = dimensions.height
    }
}

/// **Valider une prise CONCATÈNE des pistes déjà encodées.**
///
/// La vue `4b` de `MeeshyComposerMobile.dc.html` ne décrit pas une
/// optimisation, elle décrit le CONTRAT de la prise en segments :
///
/// > « Chaque segment est déjà un fichier. Supprimer le dernier segment
/// > supprime un fichier, il ne rejoue rien ; valider concatène des pistes
/// > **déjà encodées**, ce qui rend la sortie **quasi instantanée quelle que
/// > soit la durée**. »
///
/// C'est la seconde moitié qui était perdue. `mergeSegments` exportait en
/// `AVAssetExportPresetHighestQuality` — un RÉ-ENCODAGE complet, dont le coût
/// croît avec la durée totale. Une prise de trois minutes payait donc trois
/// minutes de transcodage à la validation, là où la planche promet l'instant.
/// Le budget de la vue `4e` (« écriture matérielle en cours → fichier final »)
/// n'est atteignable que par le passthrough.
///
/// **Pourquoi ce n'est pas un simple changement de constante.**
/// `AVAssetExportPresetPassthrough` ÉCHOUE — il rend `nil` — quand les pistes
/// ne sont pas homogènes, et le dépôt produit précisément des segments
/// hétérogènes : `switchCamera()` pendant l'enregistrement clôt un segment et
/// en ouvre un sur l'autre caméra, dont les dimensions diffèrent (grand angle
/// arrière vs frontale). Poser le passthrough sans condition aurait échangé un
/// export lent contre une prise PERDUE — un défaut pire que celui qu'on
/// corrige, et invisible en test tant qu'on ne bascule pas de caméra.
///
/// > La forme juste n'est donc pas « passthrough » mais « passthrough dès que
/// > c'est possible, ré-encodage quand il faut » — et la condition se LIT dans
/// > les segments, elle ne se suppose pas.
///
/// Le cas nominal de la vue `4b` — plusieurs `MAINTENIR` successifs sur la
/// même caméra — est homogène par construction : c'est lui qui gagne l'instant
/// promis. Le cas mixte reste correct, en payant ce qu'il coûte.
nonisolated enum CameraSegmentMergePolicy {

    /// Le preset d'export pour un lot de segments, décidé par leurs formats.
    ///
    /// - `formats` : un format par segment, dans l'ordre de la prise. Un
    ///   segment dont la piste vidéo est illisible n'y figure pas — et son
    ///   absence penche vers le ré-encodage, parce qu'on ne peut pas affirmer
    ///   une homogénéité qu'on n'a pas mesurée.
    /// - `readableSegmentCount` : combien de segments ont livré un format. Un
    ///   écart avec `formats.count` signifie qu'on ignore quelque chose.
    static func preset(formats: [SegmentVideoFormat], readableSegmentCount: Int) -> String {
        guard formats.count == readableSegmentCount,
              let first = formats.first,
              formats.allSatisfy({ $0 == first })
        else { return AVAssetExportPresetHighestQuality }
        return AVAssetExportPresetPassthrough
    }
}
