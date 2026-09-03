import Foundation
import MeeshySDK

/// **Ce qu'une citation MONTRE — une règle, trois peaux** (#4946).
///
/// Une même citation se lisait de trois façons : deux lignes d'aperçu dans la
/// bulle, UNE dans la rangée plate, UNE dans le bandeau du composeur ; aucune
/// des trois ne disait « Auteur : », et aucune n'annonçait les dimensions, la
/// durée ou la taille du média cité — que la passerelle sert pourtant et que
/// `ReplyReference` transporte depuis #4945. Trois implémentations SwiftUI
/// indépendantes, trois jeux de constantes locales : la divergence était
/// STRUCTURELLE, pas accidentelle.
///
/// Ce type est le site UNIQUE de cette orthographe. Les peaux le consomment,
/// aucune ne réécrit son budget de lignes ni son séparateur.
///
/// **`nonisolated` par déclaration.** La règle est pure — aucune lecture de
/// store, aucun singleton, aucune vue — donc elle reste appelable depuis un
/// `Task.detached` comme depuis le rendu, et ses suites n'ont pas à devenir
/// `@MainActor` pour la juger (la cible de test est `nonisolated`, cf.
/// `project.yml`).
///
/// **La PROTECTION est portée par les projections `for:`, jamais par les
/// peaux.** `detailsLabel(for:)` et `thumbHash(for:)` refusent d'un seul
/// endroit ce qu'un média à vue unique / flouté / chiffré ne doit pas
/// livrer — le flou ThumbHash EST une image, et des dimensions décrivent le
/// secret par la bande. La leçon 275 du dépôt appliquée à la citation : « une
/// protection de contenu se mesure sur tout ce que la charge TRANSPORTE,
/// jamais sur sa seule chaîne. »
///
/// Gardes de source : `BubbleQuotedReplyThumbHashGuardTests`.
/// Gardes d'exécution : `QuotedReplyPresentationTests`.
nonisolated enum QuotedReplyPresentation {

    /// La peau qui rend la citation. Elle ne change QUE le budget de lignes :
    /// le titre, les détails et la protection sont les mêmes partout — c'est
    /// tout l'objet de ce type.
    enum Skin: String, CaseIterable, Sendable {
        /// `BubbleQuotedReply` — la peau que voit TOUT LE MONDE (programme
        /// bêta éteint ⇒ `readingModes` OFF ⇒ `.bubbles`).
        case bubble
        /// `FocalQuotedReplyView` — la rangée plate, plus dense.
        case focal
        /// Le bandeau de réponse au-dessus du composeur.
        case composer
    }

    /// Le titre tient TOUJOURS sur une ligne : c'est une identité, pas un
    /// texte. Nommé plutôt qu'écrit dans chaque appel pour que la garde de
    /// source puisse exiger qu'aucune peau ne porte de littéral.
    static let titleLineLimit = 1

    /// Le séparateur des faits d'un média : « 1024×768 · 0:42 · 1,2 Mo ».
    /// Espaces INSÉCABLES autour du point médian — un retour à la ligne juste
    /// avant un « · » orphelin est la seule façon de rendre cette ligne
    /// illisible.
    static let detailsSeparator = "\u{00A0}\u{00B7}\u{00A0}"

    /// Le budget de lignes de l'APERÇU, par peau. La bulle en offre trois (la
    /// citation y est la seule chose à lire avant le message) ; la rangée
    /// plate et le bandeau en offrent deux — jamais UNE, qui coupait la
    /// moitié des citations à mi-phrase.
    static func previewLineLimit(for skin: Skin) -> Int {
        switch skin {
        case .bubble: return 3
        case .focal, .composer: return 2
        }
    }

    /// « Alice : » — le nom de l'auteur cité suivi du deux-points, avec
    /// l'espace INSÉCABLE que l'usage français impose devant lui (sans elle,
    /// le « : » part seul en début de ligne dès que la citation se replie).
    ///
    /// Un nom VIDE ne produit pas un « : » orphelin : la peau a déjà retombé
    /// sur son propre libellé (« Humeur », « Vous ») avant d'appeler ici, et
    /// s'il ne reste rien, il ne reste rien.
    ///
    /// **Aucune clé de catalogue ici, et c'est délibéré.** Le seul contenu
    /// traduisible de cette chaîne est le NOM, qui ne se traduit pas ; le
    /// reste est de la PONCTUATION — que `LocalizedStringKeyLiteralGuardTests`
    /// range explicitement hors de la prose. Une clé neuve aurait de plus fait
    /// rougir deux cliquets du dépôt (`test_untranslatedKeyBacklogDoesNotGrow`,
    /// plafond ZÉRO, et `FrenchDefaultValueRatchetTests`) tant que ses sept
    /// traductions ne sont pas au catalogue — c'est-à-dire au prix d'une CI
    /// rouge pour un espace insécable.
    ///
    /// Corollaire assumé : l'espace insécable est posée dans les sept locales,
    /// alors que l'usage anglais colle le deux-points au nom. La rendre
    /// sensible à la locale demande une entrée de catalogue ; c'est un lot
    /// séparé, pas une ligne de plus ici.
    static func title(author: String) -> String {
        guard !author.isEmpty else { return "" }
        return author + "\u{00A0}:"
    }

    /// La ligne de détails d'un média cité — « 1024×768 · 0:42 · 1,2 Mo ».
    ///
    /// Chaque segment ABSENT est omis, et un ZÉRO n'est pas un fait :
    /// `MeeshyMessageAttachment.fileSize` vaut `0` pour « inconnu » (les deux
    /// sites de conversion posent `apiAtt.fileSize ?? 0`), une durée nulle est
    /// une durée manquante. Aucune ligne quand rien n'est connu : une ligne
    /// vide pousserait la citation d'un cran sans rien dire.
    ///
    /// **Le genre décide de ce qui a un SENS.** Un document n'a pas de pixels
    /// — la passerelle peut en servir, ils ne veulent rien dire : on annonce
    /// ses PAGES, à partir de DEUX (cf. `pagesLabel`). C'est la seule chose que
    /// `mimeType` sert ici, et la raison pour laquelle il est demandé.
    ///
    /// `locale` est un paramètre — jamais `.current` en dur — pour la raison
    /// devenue idiomatique depuis 234i : sans elle, une suite jugerait la
    /// locale du SIMULATEUR, verte en local et rouge en CI.
    static func detailsLabel(
        mimeType: String?,
        width: Int?,
        height: Int?,
        durationMs: Int?,
        fileSize: Int?,
        pageCount: Int?,
        locale: Locale = .current
    ) -> String? {
        let kind = attachmentKind(of: mimeType)
        var segments: [String] = []

        if kind?.isMedia ?? true,
           let width, let height, width > 0, height > 0 {
            segments.append("\(dimension(width, locale: locale))\u{00D7}\(dimension(height, locale: locale))")
        }
        if let durationMs, durationMs > 0 {
            segments.append(LocalizedNumber.duration(seconds: durationMs / 1000, locale: locale))
        }
        if let pageCount, pageCount > 1 {
            segments.append(pagesLabel(pageCount, locale: locale))
        }
        if let fileSize, fileSize > 0 {
            segments.append(Int64(fileSize).formatted(.byteCount(style: .file).locale(locale)))
        }

        guard !segments.isEmpty else { return nil }
        return segments.joined(separator: detailsSeparator)
    }

    /// La même ligne, depuis la citation elle-même — la forme que les trois
    /// peaux appellent.
    ///
    /// **Un média PROTÉGÉ n'annonce rien.** Dimensions, durée et taille
    /// décrivent un contenu que le lecteur n'a pas le droit de voir ; les
    /// servir, c'est décrire le secret par la bande. Le refus vit ICI, une
    /// fois, plutôt que dans trois peaux qui l'oublieraient chacune à leur
    /// tour — le bandeau du composeur venait justement de l'oublier.
    ///
    /// `attachmentMimeType` d'abord (le fait, servi depuis #4945), puis
    /// `attachmentType` en repli : ce dernier porte tantôt le MIME brut
    /// (chemin cache, `MessagePersistenceActor`), tantôt le rawValue court
    /// (bulle optimiste) — `attachmentKind(of:)` décode les deux.
    static func detailsLabel(for reference: ReplyReference, locale: Locale = .current) -> String? {
        guard !reference.quotedMediaIsProtected else { return nil }
        return detailsLabel(
            mimeType: reference.attachmentMimeType ?? reference.attachmentType,
            width: reference.attachmentWidth,
            height: reference.attachmentHeight,
            durationMs: reference.attachmentDurationMs,
            fileSize: reference.attachmentFileSize,
            pageCount: reference.attachmentPageCount,
            locale: locale
        )
    }

    /// Le ThumbHash à servir à `CachedAsyncImage` — le flou instantané qui
    /// remplace le carré de couleur unie le temps du réseau (Cache-First :
    /// aucune surface vide quand une donnée est déjà là).
    ///
    /// **`nil` pour un média protégé : un flou EST une image.** Le rendre
    /// montrerait le contenu à vue unique, en moins net, à tout le fil et à
    /// chaque relecture. Une chaîne VIDE vaut absence — `UIImage.fromThumbHash`
    /// échouerait en silence à chaque rendu.
    static func thumbHash(for reference: ReplyReference) -> String? {
        guard !reference.quotedMediaIsProtected,
              let hash = reference.attachmentThumbHash,
              !hash.isEmpty
        else { return nil }
        return hash
    }

    /// Ce que la citation ANNONCE après le nom de l'auteur : son aperçu, puis
    /// les détails du média quand il y en a — « Photo, 800×600, 0:05 ».
    ///
    /// Une virgule et une espace, aucune parole traduisible : la ponctuation
    /// suffit à faire la pause que VoiceOver marque, et rien ici n'est à
    /// traduire (les DEUX moitiés le sont déjà, chacune chez elle).
    ///
    /// **Le point médian ne se DIT pas.** `detailsSeparator` est une ponctuation
    /// VISUELLE : lue à voix haute, elle fait entendre « point » entre chaque
    /// fait — le défaut exact que `MetaSeparator` a soldé sur vingt-huit
    /// surfaces du dépôt, ici sous sa forme de CHAÎNE, que la garde de source
    /// de ce composant ne peut pas voir. La virgule le remplace : même pause,
    /// sans le mot.
    static func spokenPreview(preview: String, details: String?) -> String {
        let spokenDetails = details?.replacingOccurrences(of: detailsSeparator, with: ", ")
        // Type ANNOTÉ : le littéral mêle un `String` et un `String?`, et sans
        // l'annotation l'inféreur doit choisir entre deux `compactMap`.
        let parts: [String?] = [preview, spokenDetails]
        return parts
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    // MARK: - Détails

    /// Le genre du média cité, décodé par la source de vérité partagée. Passe
    /// par `BubbleQuotedReply.resolveAttachmentKind`, seul décodeur du dépôt à
    /// accepter les DEUX formes que `attachmentType` prend selon le
    /// constructeur (rawValue court, MIME brut) — jamais une jumelle écrite
    /// ici.
    private static func attachmentKind(of type: String?) -> AttachmentKind? {
        BubbleQuotedReply.resolveAttachmentKind(type)
    }

    /// Une dimension en pixels ne se GROUPE pas : « 1 024×768 » n'est pas une
    /// taille d'image, c'est une faute de frappe. Le système de CHIFFRES,
    /// lui, reste celui du lecteur (arabo-indiens en arabe) — c'est la règle
    /// de `LocalizedNumber`, appliquée sans son groupement.
    private static func dimension(_ value: Int, locale: Locale) -> String {
        value.formatted(.number.grouping(.never).locale(locale))
    }

    /// « 12 pages » — le compte de pages d'un document cité.
    ///
    /// **La clé est celle que le dépôt porte déjà** (`feed.post.detail.pages`,
    /// traduite dans les sept locales, employée mot pour mot sous cette forme
    /// par `FeedPostCard+Media` et `PostDetailView`). Zéro clé neuve : une clé
    /// de plus rendrait le FRANÇAIS dans les six autres langues jusqu'à ce
    /// qu'un lot édite le catalogue, et ferait rougir le cliquet à plafond
    /// ZÉRO d'ici là.
    ///
    /// Elle n'a pas de singulier, et l'appelant n'en demande pas : la ligne
    /// n'annonce le compte qu'à partir de DEUX pages. « 1 page » n'apprend
    /// rien que le glyphe de document ne dise déjà, et « 1 pages » serait une
    /// faute — le pluriel se paierait en clé neuve, pour un cas sans valeur.
    private static func pagesLabel(_ count: Int, locale: Locale) -> String {
        let value = LocalizedNumber.exact(count, locale: locale)
        let word = String(localized: "feed.post.detail.pages", defaultValue: "pages", bundle: .main)
        return "\(value) \(word)"
    }
}
