## Un déclencheur remplacé par son sur-ensemble doit contenir l'ancien DANS LE CODE, pas seulement dans le modèle (2026-11-22, #20341, cycle 218)

*Mesuré le 2026-11-22 (#20341, cycle 218), sur `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreSocketBridge.swift` et `.../Sockets/MessageSocketManager.swift`.*

### Le fait

Le correctif de #20341 remplace un déclencheur par son sur-ensemble : le
rattrapage écoutait `didReconnect` (les reconnexions) et devait écouter TOUTE
connexion, la première comprise. Le raisonnement est juste au niveau du
modèle — **une reconnexion EST une connexion**, donc `didConnect ⊃
didReconnect` — et il est faux au niveau du code.

`MessageSocketManager.handleTransportConnected` fait DEUX choses dans DEUX
`Task { @MainActor }` distincts : il émet `didReconnect` (via
`handleConnectionEstablished`, `if wasReconnect`) et il pose
`isConnected = true`. Le front montant qu'on dérive de `$isConnected` avec
`removeDuplicates()` suppose donc que `isConnected` était `false` juste avant.
Un `.connect` re-émis sans `.disconnect` préalable ne satisfait pas cette
supposition : le front est MANGÉ par `removeDuplicates()` pendant que
`didReconnect` part normalement.

**Remplacer l'un par l'autre aurait donc fait PERDRE un cas que l'ancien
déclencheur couvrait** — une régression introduite par un correctif, sous un
raisonnement d'inclusion parfaitement valide.

### Pourquoi ça ne se voit pas

La relation d'inclusion se vérifie spontanément sur les NOMS et sur
l'intention (« reconnexion » ⊂ « connexion »), jamais sur les chemins qui
produisent les deux signaux. Et les deux signaux étaient ici produits par la
MÊME fonction, à trois lignes d'écart — ce qui rend la conclusion encore plus
crédible : on les a vus naître ensemble, donc on les croit couplés. Ils ne le
sont pas : l'un est un `send()` conditionné par un drapeau d'historique,
l'autre une AFFECTATION dont la propagation dépend de la valeur précédente.

### La règle

**Devant un élargissement de déclencheur, ne pas demander « le neuf
contient-il l'ancien ? » (question de modèle) mais « l'ancien signal est-il
DÉRIVABLE du neuf, pour chaque chemin qui l'émet ? » (question de code).** Si
la réponse est non, ou incertaine, FUSIONNER les deux sources plutôt que
substituer : la fusion ne peut que rattraper plus, et son seul coût est un
doublon, qui se coalesce.

Corollaire de forme : un doublon de déclencheur se coalesce par un `debounce`,
pas par une garde d'état écrite à la main — le dépôt a déjà le motif
(`OutboxRetryScheduler.startObservingMutationEnqueued`, « une rafale ne
déclenche qu'un seul flush groupé »), et le réécrire fabriquerait une jumelle.

### Le témoin

Il ne s'écrit pas sur le déclencheur mais sur l'ÉTAT qui le gouverne : les deux
fonctions pures `onConnect(storeHydrated:)` / `onFirstHydration(socketConnected:)`
sont éprouvées dans les DEUX ordres d'arrivée, et le cliquet exige que leur
union soit `allCases` et leur intersection vide. C'est ce qui attrape un geste
oublié ou joué deux fois sans nommer aucun geste — donc y compris le quatrième,
qu'un lot futur ajoutera.

### Famille

Même famille que « une porte de TYPE garde le sortant ; seule l'exécution garde
l'entrant » (`services/gateway/CLAUDE.md`) : une symétrie LEXICALE ou
conceptuelle y avait été transposée sans ré-instruire le mécanisme, trois
cycles de suite. Ici la symétrie est une inclusion d'ensembles, et elle est
vraie — c'est sa RÉALISATION dans le code qui ne l'est pas.
