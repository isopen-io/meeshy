import Foundation

/// La carte `[langue: contenu]` d'un message pour la ligne de liste, commune au message reçu (`APIMessage`) et au
/// message relu en cache (survivant d'une suppression).
enum PreviewTranslationCard {
    /// `[langue: contenu]` du message, prêt pour le Prisme de la ligne de liste.
    /// Les codes sont minusculés — `resolvedLastMessagePreview` résout en
    /// minuscules et une clé « FR » ne serait jamais trouvée.
    ///
    /// **Jumeau socket de `buildLastMessagePreviewTranslations`** (gateway,
    /// `routes/conversations/utils/last-message-preview.ts`), qui sert la MÊME
    /// carte par REST. Les deux chemins alimentent une seule ligne de liste :
    /// toute exclusion présente d'un côté et absente de l'autre fait dépendre
    /// le texte affiché du transport qui l'a apporté. Les quatre exclusions et
    /// le plafond sont donc repris ici tels quels.
    ///
    /// 1. **Hors prisme du lecteur** — le résolveur n'affiche qu'UNE valeur ;
    ///    garder les N langues de la conversation n'alourdit que le cache.
    /// 2. **Langue d'origine** — elle EST déjà `lastMessagePreview`. La facette
    ///    socket transporte `lastMessageOriginalLanguage`, donc le résolveur
    ///    sert toujours l'original à SON rang (règle #3 du Prisme) sans avoir
    ///    besoin de la clé.
    /// 3. **Traduction chiffrée** — `translatedContent` est alors un
    ///    cryptogramme et la clé de déchiffrement ne transite pas par ce
    ///    chemin : la poser afficherait du base64 dans la liste, là où le même
    ///    message servi par REST retombe correctement sur l'original. C'est la
    ///    seule des quatre qui change le texte affiché.
    /// 4. **Texte inexploitable** — une entrée vide ou blanche ne décrit aucun
    ///    aperçu.
    ///
    /// Rend `nil` — jamais `[:]` — quand il ne reste rien, l'état que le
    /// résolveur distingue pour retomber sur l'original.
    static func make(
        from apiMessage: APIMessage,
        viewerLanguages: [String]
    ) -> [String: String]? {
        guard let translations = apiMessage.translations, !translations.isEmpty else { return nil }
        return make(
            candidates: translations.filter { $0.isEncrypted != true }
                .map { (language: $0.targetLanguage, text: $0.translatedContent) },
            originalLanguage: apiMessage.originalLanguage,
            viewerLanguages: viewerLanguages
        )
    }

    /// Le cœur de la carte, commun au message reçu (`APIMessage`) et au message relu en cache (survivant d'une
    /// suppression). Les candidats sont déjà débarrassés des traductions chiffrées (exclusion 3).
    static func make(
        candidates: [(language: String, text: String)],
        originalLanguage: String?,
        viewerLanguages: [String]
    ) -> [String: String]? {
        guard !candidates.isEmpty else { return nil }
        let wanted = viewerLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        guard !wanted.isEmpty else { return nil }
        let original = originalLanguage?.lowercased()

        var out: [String: String] = [:]
        for target in wanted {
            if let original, target == original { continue }
            if out[target] != nil { continue }
            // `last(where:)` conserve la règle « la dernière entrée gagne » du
            // `uniquingKeysWith` d'origine, pour un payload qui répéterait une
            // langue.
            guard let match = candidates.last(where: { $0.language.lowercased() == target }) else { continue }
            guard !match.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            out[target] = match.text.meeshyPreviewTruncated
        }

        return out.isEmpty ? nil : out
    }
}
