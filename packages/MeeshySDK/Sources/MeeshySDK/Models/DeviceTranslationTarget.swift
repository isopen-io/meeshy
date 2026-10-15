import Foundation

// MARK: - LA LANGUE QUE L'APPAREIL CALCULE (#9899)
//
// Miroir Swift de `deviceTranslationTarget`
// (`apps/web/src/lib/device-translation/target.ts`) : la même descente que
// `PrismTranslationResolver`, lue à l'envers. Au lieu de dire quel rang est
// SERVI, elle dit quels rangs PLUS HAUTS l'appareil peut encore servir.
//
// Normalisation : `MeeshyUser.normalizeLanguageForDedup` — le miroir Swift de
// `normalizeLanguageForDedup` que le jumeau TypeScript emploie. Elle est
// TOTALE (jamais `nil`), région-aveugle (`pt-BR` → `pt`, `en_US` → `en`) et
// garde les codes ISO 639-3 supportés (`bas`). Les langues rendues sont donc
// celles que le serveur écrit dans `MessageTranslation.targetLanguage`, et que
// la passerelle exige des traductions partagées.

/// Un couple (langue de départ, langue d'arrivée) que le moteur de l'appareil
/// sait traduire, l'un et l'autre normalisés.
public struct DeviceTranslationPair: Equatable, Hashable, Sendable {
    public let source: String
    public let target: String

    public init(source: String, target: String) {
        self.source = source
        self.target = target
    }
}

/// Les rangs du Prisme qu'il reste à servir pour un message : la langue de
/// départ, et les langues d'arrivée à essayer DANS L'ORDRE du lecteur.
public struct DeviceTranslationCandidates: Equatable, Sendable {
    public let source: String
    public let targets: [String]

    public init(source: String, targets: [String]) {
        self.source = source
        self.targets = targets
    }
}

public enum DeviceTranslationTarget {

    /// Les langues d'arrivée à essayer pour un message, ou `nil` quand il n'y a
    /// rien à calculer.
    ///
    /// Le prisme se parcourt dans l'ordre. Un rang déjà servi — par une
    /// traduction ou parce que le message est écrit dans cette langue — arrête
    /// la descente : calculer une langue moins préférée ne changerait rien à ce
    /// que le lecteur voit. Sans langue d'origine connue, rien n'est calculé :
    /// un moteur à qui l'on ment sur la source traduit mal.
    public static func candidates(
        preferredLanguages: [String],
        originalLanguage: String?,
        translatedLanguages: [String]
    ) -> DeviceTranslationCandidates? {
        guard let original = originalLanguage, !isBlank(original) else { return nil }
        let source = MeeshyUser.normalizeLanguageForDedup(original)
        let served = Set(translatedLanguages.map { MeeshyUser.normalizeLanguageForDedup($0) })
        var targets: [String] = []
        for rank in preferredLanguages where !isBlank(rank) {
            let target = MeeshyUser.normalizeLanguageForDedup(rank)
            if target == source || served.contains(target) { break }
            if !targets.contains(target) { targets.append(target) }
        }
        return targets.isEmpty ? nil : DeviceTranslationCandidates(source: source, targets: targets)
    }

    /// Le premier rang que l'appareil sait traduire. Un rang que le moteur ne
    /// sait pas traduire est sauté, comme le serveur saute une langue sans
    /// traduction.
    public static func resolve(
        preferredLanguages: [String],
        originalLanguage: String?,
        translatedLanguages: [String],
        canTranslate: (_ source: String, _ target: String) -> Bool
    ) -> DeviceTranslationPair? {
        guard let descent = candidates(
            preferredLanguages: preferredLanguages,
            originalLanguage: originalLanguage,
            translatedLanguages: translatedLanguages
        ) else { return nil }
        return descent.targets
            .first { canTranslate(descent.source, $0) }
            .map { DeviceTranslationPair(source: descent.source, target: $0) }
    }

    /// Le rang du lecteur qui porte `target`, ÉCRIT comme il l'a configuré.
    ///
    /// La passerelle exige des langues normalisées (`pt`), mais les surfaces
    /// qui affichent comparent le `targetLanguage` d'une traduction au rang tel
    /// que le lecteur l'a saisi, sans casse (`pt-BR`). Une traduction posée sous
    /// la seule forme normalisée ne s'afficherait jamais pour ce lecteur : elle
    /// prend donc l'orthographe de SON rang. Sans rang qui la porte, la forme
    /// normalisée.
    public static func readerSpelling(of target: String, in preferredLanguages: [String]) -> String {
        preferredLanguages.first { !isBlank($0) && MeeshyUser.normalizeLanguageForDedup($0) == target } ?? target
    }

    private static func isBlank(_ code: String) -> Bool {
        code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
