import Foundation

/// **Ce que le réveil silencieux doit AVOIR ÉCRIT avant de rendre la main**
/// (#3945, même classe de défaut que #3894).
///
/// ## Le défaut, et pourquoi le budget de 25 s ne le couvrait pas
///
/// `didReceiveRemoteNotification` ouvre une tâche d'arrière-plan pour obtenir
/// ~25 s, puis appelle `state.finish()` dès que son `TaskGroup` se termine.
/// `finish()` **rend** ce budget : il termine la tâche d'arrière-plan ET le
/// `completionHandler`, ce qui autorise iOS à suspendre le processus
/// immédiatement.
///
/// Or `syncNow()` et `ensureMessages(force:)` écrivent par le chemin standard de
/// `GRDBCacheStore` : la mutation touche L1 tout de suite, et SQLite seulement
/// après un **débounce de 2 s**. Entre le retour du `TaskGroup` et ce débounce,
/// rien ne retient le processus — le budget de 25 s est un PLAFOND, pas une
/// attente, et le rendre tôt ne laisse pas les 2 s s'écouler.
///
/// La perte est silencieuse et fréquente : chaque message reçu app fermée, pas
/// seulement les révocations. C'est ce qui distingue ce chemin de celui de
/// #3894 — même défaut, surface bien plus large.
///
/// ## La règle
///
/// Le flush prend une part du budget RESTANT, jamais un délai fixe : un délai
/// fixe serait faux dans les deux sens — trop long quand iOS n'accorde que
/// quelques secondes (le flush serait coupé au milieu, et `flushAll(deadline:)`
/// laisse alors des stores sales), trop court quand le budget est entier.
nonisolated enum SilentPushDurability {

    /// Ce qu'on garde pour `finish()` lui-même. Rendre la main est peu coûteux,
    /// mais le faire APRÈS la deadline du flush signifierait qu'on a laissé le
    /// flush manger tout le budget et qu'iOS nous a coupés pendant, pas après.
    static let safetyMargin: TimeInterval = 1

    /// Le flush ne DOIT pas devenir une seconde raison de tenir le processus
    /// éveillé. Cinq secondes couvrent très largement le drain des stores
    /// touchés par un push (messages, conversations, notifications) ; au-delà,
    /// c'est un problème de volume à traiter ailleurs, pas à financer ici.
    static let cap: TimeInterval = 5

    /// La deadline remise à `CacheCoordinator.flushAll(deadline:)`.
    ///
    /// `backgroundTimeRemaining` vaut `.greatestFiniteMagnitude` hors tâche
    /// d'arrière-plan (et pendant les premières millisecondes qui suivent
    /// `beginBackgroundTask`). Ce n'est pas « du temps infini » : c'est
    /// « la question n'a pas de sens ici ». On sert alors le plafond, qui est le
    /// seul nombre défendable — pas l'infini, qui ferait du flush une attente
    /// sans borne sur un chemin qui doit rendre la main.
    static func flushDeadline(now: Date, backgroundTimeRemaining: TimeInterval) -> Date {
        guard backgroundTimeRemaining.isFinite else { return now.addingTimeInterval(cap) }
        let usable = max(0, backgroundTimeRemaining - safetyMargin)
        return now.addingTimeInterval(min(usable, cap))
    }
}
