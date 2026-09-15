import Foundation

/// **Un champ de valeur RENDU INDIRECT** (#6213 bis) — la valeur vit sur le
/// tas, le champ ne pèse plus que huit octets.
///
/// ## Ce qu'il ferme
///
/// L'app plantait à l'ouverture de toute conversation, d'un `signal 11` dont
/// `CrashStackDumper` a fini par dire la nature exacte : l'adresse fautive
/// tombait **sous le plancher de la pile principale** (1008 Ko) — page de
/// garde, débordement franc, jamais un pointeur fou.
///
/// Le palmarès des cadres, apparié par adresse de retour, désignait le tronc
/// de `ConversationView` ; et la mesure des TYPES a dit pourquoi :
///
///     ConversationView = 15 088 octets
///       ├─ overlayState   7 088   ← six `Message?` EN LIGNE
///       ├─ composerState  3 897   ← un `Message?` + deux `ComposerSeedTarget?`
///       ├─ scrollState    1 040
///       └─ conversationOverride ~992
///
/// **Une vue SwiftUI est un type VALEUR, et chaque closure de son `body` la
/// capture en la COPIANT.** Une vue de 15 Ko rend donc chaque cadre de pile
/// proportionnellement énorme — `messageListLayer`, qui forme une dizaine de
/// closures, en réclamait à lui seul près de 490 Ko. Ce n'est pas la
/// profondeur de la pile qui débordait : c'est sa LARGEUR.
///
/// `Message` pèse ~1,1 Ko. Six copies dormaient dans `overlayState` pour
/// n'en servir qu'une à la fois : une feuille de détail, un menu, un partage
/// ne s'ouvrent jamais ensemble.
///
/// ## Pourquoi un wrapper plutôt qu'une classe d'état
///
/// Passer `ConversationOverlayState` en `final class` aurait marché — et
/// touché ses 119 sites d'usage, ses neuf liaisons `$overlayState`, et la
/// sémantique de valeur dont dépendent les `onChange` de SwiftUI. Ce wrapper
/// ne change AUCUN site : `overlayState.shareMessage` se lit et s'écrit
/// exactement pareil. Seule la disposition mémoire change.
///
/// La sémantique de VALEUR est préservée par copie à l'écriture
/// (`isKnownUniquelyReferenced`) : deux copies de la structure qui divergent
/// ne partagent plus leur boîte, donc `oldValue != newValue` reste vrai là où
/// SwiftUI le teste.
@propertyWrapper
struct Indirect<Value> {

    private final class Box {
        /* DEINIT NON ISOLÉE, OBLIGATOIRE (#6226, crash mesuré).
           Ce dépôt compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
           (SE-0466) : une classe non marquée `nonisolated` est @MainActor, et
           sa deinit SYNTHÉTISÉE l'est aussi. Libérée hors d'une tâche — au
           démontage d'une vue, dans un test XCTest synchrone — elle
           double-libère :

               POINTER_BEING_FREED_WAS_NOT_ALLOCATED
               Indirect.Box.__deallocating_deinit
                 ← swift_task_deinitOnExecutorMainActorBackDeploy

           Le processus de test a AVORTÉ après que le témoin soit passé au vert
           — c'est la signature de ce défaut : il tue au démontage, pas à
           l'exécution. `ConversationComposerTextModel` porte la même ligne et
           la même explication, à trois fichiers d'ici. La garde
           `MainActorDeinitSourceGuardTests` existe pour ça ; cette classe
           IMBRIQUÉE lui avait échappé. */
        nonisolated deinit {}

        var value: Value
        init(_ value: Value) { self.value = value }
    }

    private var box: Box

    init(wrappedValue: Value) { box = Box(wrappedValue) }

    var wrappedValue: Value {
        get { box.value }
        set {
            /* COPIE À L'ÉCRITURE — sans elle, deux copies de la structure
               hôte partageraient la même boîte et une écriture sur l'une
               modifierait l'autre. La structure cesserait d'être une valeur,
               et SwiftUI, qui compare l'ancienne à la nouvelle pour décider
               d'un `onChange`, ne verrait plus jamais de changement. */
            if isKnownUniquelyReferenced(&box) {
                box.value = newValue
            } else {
                box = Box(newValue)
            }
        }
    }
}

extension Indirect: Equatable where Value: Equatable {
    static func == (lhs: Indirect<Value>, rhs: Indirect<Value>) -> Bool {
        lhs.wrappedValue == rhs.wrappedValue
    }
}
