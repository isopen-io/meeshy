import Foundation
import MeeshySDK

/// **Les surfaces SOCIALES qui jouent un audio** (#4926).
///
/// Elle existe pour une raison précise, et c'est la leçon 261 : *une garde qui
/// nomme UN fichier prouve que ce fichier applique la règle, jamais que ce sont
/// les seuls fichiers où elle s'applique.* `FocalMatrixWiringGuardTests` gardait
/// déjà « la vue doit résoudre la langue de piste par la MÊME loi que le VM » —
/// pour `AudioMediaView`, c'est-à-dire pour la CONVERSATION. Cinq surfaces
/// sociales jouaient un audio sans jamais appeler la loi, et aucune garde ne
/// pouvait rougir : elles n'étaient nommées nulle part.
///
/// Ce type est la liste FERMÉE de ces surfaces. Une sixième ne compile pas tant
/// qu'elle n'est pas déclarée ici, et le témoin de câblage exige un chemin de
/// fichier pour chaque cas — c'est le cliquet qui manquait.
nonisolated enum SocialAudioSurface: String, CaseIterable, Equatable {
    /// La carte d'un post audio dans le fil.
    case feedPostCard
    /// Le détail d'un post audio.
    case postDetail
    /// Un commentaire audio — sous un post, une story ou un réel.
    case comment
    /// Le réel, dont la piste jouée peut être un audio traduit.
    case reel
    /// Le plein écran audio, qui porte en plus la liste des puces de langue.
    case audioFullscreen

    /// **La piste sonore d'une republication LEGACY** — `RepostContent.audioUrl`,
    /// une URL nue héritée des anciennes stories.
    ///
    /// Elle est déclarée ICI plutôt qu'omise, et c'est délibéré : une surface
    /// absente d'une énumération est invisible, une surface déclarée est
    /// auditable. Le témoin de câblage vérifie l'affirmation ci-dessous au lieu
    /// de la croire.
    case repostLegacyAudio

    /// **Cette surface TRANSPORTE-t-elle des pistes traduites ?**
    ///
    /// C'est la loi 4 appliquée à une garde : *une porte non servie est ABSENTE,
    /// jamais grisée.* Exiger l'élection d'une surface qui ne transporte AUCUNE
    /// piste produirait un appel qui rend toujours `nil` — du code qui a l'air
    /// d'une couverture et n'en est pas. Pire : le jour où cette surface
    /// gagnerait des pistes, l'appel étant déjà là, plus rien ne rougirait.
    ///
    /// `repostLegacyAudio` ne porte qu'un `audioUrl` : pas de `FeedMedia`, donc
    /// pas de `transcription`, donc pas de `translatedAudios`. Il n'y a rien à
    /// élire, et le témoin vérifie que c'est TOUJOURS vrai — le jour où ce
    /// chemin gagne un média, la garde tombe et réclame son élection.
    ///
    /// `switch` exhaustif : une septième surface ne compile pas tant qu'elle
    /// n'a pas répondu.
    var carriesTranslatedTracks: Bool {
        switch self {
        case .feedPostCard, .postDetail, .comment, .reel, .audioFullscreen:
            return true
        case .repostLegacyAudio:
            return false
        }
    }
}

/// **La piste servie d'un audio SOCIAL — la projection de la loi du fil vers le
/// feed** (#4926).
///
/// ## Ce que ce type ajoute, et ce qu'il ne refait pas
///
/// Il ne résout RIEN lui-même : `AudioTrackLanguageResolver` est la loi, et le
/// témoin `test_laProjection_neReecritPasLaLoi` interdit qu'une boucle « pour
/// aller plus vite » vienne s'écrire ici. C'est la RÉÉCRITURE, pas l'appel
/// manquant, qui a produit trois familles de Prisme divergentes en trois cycles
/// (§ Prisme du `CLAUDE.md` racine).
///
/// Ce qu'il ajoute tient en trois choses, dont aucune n'existait :
///
/// 1. **La lecture du prisme du LECTEUR** — `ConversationLanguagePreferences`
///    sur l'utilisateur courant. Sans elle, les cinq surfaces recopiaient la
///    même ligne, ou, comme mesuré le 2026-09-02, ne la recopiaient pas du tout.
/// 2. **La sentinelle du plein écran.** `AudioFullscreenView` porte son état en
///    `String` avec `"orig"` pour « piste originale », là où la loi rend
///    `String?`. Cette conversion était écrite en dur —
///    `@State private var selectedLanguage: String = "orig"` — et rien ne la
///    recalculait : c'ÉTAIT le défaut, pas un détail de représentation.
/// 3. **La liste des surfaces** (`SocialAudioSurface`), qui donne au témoin de
///    quoi tomber quand une sixième naît.
///
/// ## La règle qu'elle ne doit pas casser
///
/// > **La piste est élue par la langue du TEXTE SERVI, jamais par une descente
/// > indépendante** (§ cycle 128 du `CLAUDE.md` racine).
///
/// Sur ces surfaces, le texte servi EST la transcription, et
/// `AudioPlayerView.initialTranscriptionLanguage` amorce les deux d'un seul
/// paramètre — c'est ce qui rend la règle structurelle ici plutôt que promise :
/// il n'y a qu'une valeur, donc il ne peut pas y avoir deux descentes.
nonisolated enum SocialAudioTrack {

    /// La valeur que `AudioFullscreenView` emploie pour « piste originale ».
    /// Déclarée ici parce que c'est ici qu'on la produit ; la vue ne doit plus
    /// l'écrire en littéral.
    static let originalSentinel = "orig"

    /// La langue de la piste servie — `nil` ⇒ l'ORIGINAL.
    ///
    /// `nil` n'est pas un échec : c'est le verdict juste quand aucune langue du
    /// prisme n'est servie par une piste, ou quand la langue d'origine gagne à
    /// son rang. Ne JAMAIS y substituer `translatedAudios.first` — règle 1 du
    /// Prisme.
    static func language(
        manualOverride: String? = nil,
        originalLanguage: String,
        preferredLanguages: [String],
        translatedAudios: [MessageTranslatedAudio]
    ) -> String? {
        AudioTrackLanguageResolver.resolve(
            manualOverride: manualOverride,
            originalLanguage: originalLanguage,
            preferredLanguages: preferredLanguages,
            translatedAudios: translatedAudios
        )
    }

    /// **La langue d'ORIGINE d'un audio social — et ce n'est PAS celle de son
    /// porteur.**
    ///
    /// La tentation est d'écrire `post.originalLanguage`, et c'est ce que fait
    /// `AudioFullscreenItem.fromFeed(originalLanguage:)`. C'est faux d'un cran :
    /// `FeedPost.originalLanguage` est la langue du TEXTE du post, et rien
    /// n'oblige un vocal espagnol à voyager sous une légende espagnole. La
    /// langue que la règle 3 du Prisme fait concourir à son rang est celle de
    /// la PISTE, pas celle de la prose qui l'accompagne.
    ///
    /// `MessageTranscription.language` est cette langue-là : ce que Whisper a
    /// DÉTECTÉ dans l'audio. Elle prime donc, et le porteur n'est qu'un repli —
    /// utile parce qu'une transcription peut manquer (audio non encore
    /// transcrit), auquel cas il n'y a de toute façon aucune piste traduite et
    /// l'élection rend `nil`.
    ///
    /// > **Cette règle n'est pas neuve : elle est écrite, juste, et appliquée à
    /// > UN seul endroit** — `ReelPageView.metaOriginalLanguage`
    /// > (`ReelsPlayerView.swift`), qui fait exactement
    /// > `audioMedia.transcription?.language ?? reel.originalLanguage`. Le réel
    /// > est le PRÉCÉDENT, pas le retardataire ; ce lot ne l'invente pas, il le
    /// > sort de la vue où il était enfermé pour que les quatre autres surfaces
    /// > y aient accès. Une bonne règle écrite dans un corps de vue est une
    /// > règle que personne d'autre ne peut appliquer.
    ///
    /// **Le repli est INATTEIGNABLE dans le cas nominal, et c'est un invariant de
    /// PIPELINE — pas un invariant de type.** Sans transcription il n'y a pas de
    /// piste traduite (les pistes sont le produit de transcription → traduction
    /// → TTS), et `AudioTrackLanguageResolver` sort sur « aucune piste » AVANT
    /// de regarder la langue d'origine. Mais `FeedMedia.transcription` et
    /// `FeedMedia.translatedAudios` sont deux champs INDÉPENDANTS du fil : une
    /// projection partielle rouvrirait la fenêtre. Dans cette fenêtre, `""`
    /// rendrait le même verdict que le porteur — le repli n'est donc jamais
    /// pire que son absence, et la direction de l'erreur reste réparable d'un
    /// tap sur la puce de langue. Épinglé par
    /// `test_sansPisteTraduite_laLangueDorigine_nAaucunEffet`.
    ///
    /// La chaîne VIDE en dernier ressort n'est pas un repli fabriqué : elle dit
    /// « aucune langue d'origine connue », et `AudioTrackLanguageResolver` la
    /// traite exactement comme telle — elle ne matche aucun rang du prisme,
    /// donc l'origine ne gagne nulle part, donc la première piste servie gagne.
    /// C'est le comportement juste : sans savoir dans quelle langue on parle, on
    /// ne peut pas décider que le lecteur la comprend déjà.
    static func originalLanguage(
        transcription: MessageTranscription?,
        carrier: String?
    ) -> String {
        for candidat in [transcription?.language, carrier] {
            let propre = (candidat ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !propre.isEmpty { return propre }
        }
        return ""
    }

    /// La même élection, dans la forme que le plein écran manipule.
    static func fullscreenSelection(
        manualOverride: String? = nil,
        originalLanguage: String,
        preferredLanguages: [String],
        translatedAudios: [MessageTranslatedAudio]
    ) -> String {
        language(
            manualOverride: manualOverride,
            originalLanguage: originalLanguage,
            preferredLanguages: preferredLanguages,
            translatedAudios: translatedAudios
        ) ?? originalSentinel
    }
}

extension SocialAudioTrack {

    /// **Le prisme du LECTEUR**, lu là où le fil le lit déjà
    /// (`ThemedMessageBubble` : `ConversationLanguagePreferences(user:).resolved`).
    ///
    /// Le nom du type dit « Conversation » et c'est un reste d'histoire : ce
    /// qu'il calcule est l'ordre `systemLanguage > regionalLanguage >
    /// customDestinationLanguage > deviceLocale`, qui n'a rien de propre au fil.
    /// En introduire une seconde lecture ici ferait diverger deux prismes pour
    /// un seul lecteur.
    @MainActor
    static func readerLanguages() -> [String] {
        ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved
    }

    /// L'élection prête à poser sur `AudioPlayerView.initialTranscriptionLanguage`,
    /// pour une surface sociale qui n'a pas d'autre source que l'utilisateur
    /// courant.
    @MainActor
    static func servedLanguage(
        originalLanguage: String,
        translatedAudios: [MessageTranslatedAudio]
    ) -> String? {
        language(
            originalLanguage: originalLanguage,
            preferredLanguages: readerLanguages(),
            translatedAudios: translatedAudios
        )
    }
}
