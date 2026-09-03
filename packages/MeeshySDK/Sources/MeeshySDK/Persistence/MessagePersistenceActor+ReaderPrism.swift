import Foundation

// Extrait de `MessagePersistenceActor.swift` (2 329 lignes, hors budget
// 1000-1200 — un fichier hors budget est interdit d'ajout). Le lot #4945
// fait descendre le Prisme du lecteur jusqu'à la citation gravée par le
// chemin SOCKET : on extrait d'abord, on ajoute ensuite. Responsabilité tenue
// ici : dire QUEL prisme un appelant remet à `bufferIncomingAPIMessages` — et
// rien d'autre.

extension MessagePersistenceActor {
    /// Le prisme ORDONNÉ du lecteur, à résoudre AU MOMENT DE LA MISE EN FILE,
    /// jamais dans la boucle d'écriture.
    ///
    /// C'est LE site qui manquait : `ConversationSyncEngine.apiMessagePersistor`
    /// (relais global de `message:new`, `ensureMessages` poussé par une
    /// notification, pagination) et le gestionnaire de socket de la
    /// conversation ouverte convergent tous deux sur le puits bufferisé sans
    /// transporter de prisme, et le défaut `[]` servait alors l'ORIGINAL — une
    /// citation en anglais sur le fil temps réel, en français au rechargement
    /// REST.
    ///
    /// **Elle ne doit PAS être appelée depuis le processeur du `writeStream`.**
    /// Elle lit `AuthManager` sur le MainActor ; posée dans la boucle SÉRIELLE
    /// d'écriture, elle faisait attendre CHAQUE lot ingéré que le fil de RENDU
    /// soit libre — c'est-à-dire précisément pendant un défilement ou une
    /// animation de clavier — et les `reconcileBatch` / `batchDeliveryUpdate`
    /// en file derrière lui attendaient avec. La persistance dépendait alors du
    /// fil qu'elle est censée décharger. Le prisme voyage donc DANS
    /// l'opération (`case upsertAPIMessages(_, preferredLanguages:)`), résolu
    /// par un producteur qui, lui, est déjà sur le MainActor ou hors du chemin
    /// chaud.
    ///
    /// **UNE descente, la même que la bulle.** `ReaderPrism.resolve(for:)` est
    /// ce que `ConversationLanguagePreferences.resolved` sert à l'affichage et
    /// ce que le chemin REST grave. Ce site lisait `preferredContentLanguages`,
    /// qui diverge exactement là où rien ne le teste — locale appareil absente
    /// du serveur, aucune langue configurée — et le MÊME message cité se
    /// gravait sous deux textes selon le chemin qui l'avait ingéré : un
    /// changement de ligne, et un reconfigure, rejoués à chaque ouverture pour
    /// un contenu identique. Lue sur le MainActor où vit `AuthManager` ; sans
    /// session, la locale de l'appareil seule (rang 4).
    ///
    /// `nonisolated` : elle ne lit rien de l'actor.
    nonisolated public static func readerPrism() async -> [String] {
        await MainActor.run { ReaderPrism.resolve(for: AuthManager.shared.currentUser) }
    }
}
