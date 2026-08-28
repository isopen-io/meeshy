# Cycle 130 — la promesse détachée qui n'a d'autre écouteur que le process

**Issue** : [#4134](https://github.com/isopen-io/meeshy/issues/4134)
**Branche** : `claude/keen-hamilton-hxyc32`
**Base** : `a4b374ee` (cycle 129 mergé)

## 1. Ce qui a été cherché

Une classe de défaut du temps réel, pas un site. Point de départ : la règle la
plus longuement expliquée du `CLAUDE.md` du gateway — celle qui interdit une
promesse détachée sans `.catch` — et la question à lui poser : **est-elle
appliquée, ou seulement écrite ?**

## 2. Ce qui a été mesuré

**Quatorze** promesses détachées sans `.catch` dans `services/gateway/src/`
(hors tests), relevées par un balayage. Aucune n'était une panne le jour de la
mesure — tous les callees avalent leurs erreurs — donc quatorze **pièges
armés**, au sens du cycle 84.

| famille | sites | forme |
|---|---|---|
| épingle REST (`PUT`/`DELETE …/pin`) | 2 | mise en file détachée **+ émission de room non gardée** |
| réactions (`ReactionHandler`) | 4 | file ×2, notification ×2 |
| réaction de pièce jointe | 1 | file |
| réaction d'agent (`MeeshySocketIOManager`) | 1 | file |
| fenêtre de grâce d'appel (`CallEventsHandler`) | 2 | **dans un `setTimeout`** |
| heartbeat d'appel (`CallService`) | 1 | **dans un `setTimeout`** |
| ré-hydratation des appels au démarrage (`server.ts`) | 1 | au boot |
| statut de lecture (route + `MessageReadStatusService`) | 2 | IIFE asynchrone |

Deux propriétés donnent son prix à l'inventaire :

1. **La garantie appartient au SITE.** « Le callee avale ses erreurs » décrit
   l'autre bout. C'est déjà FAUX dès que le callee porte une instruction avant
   son propre `try` : `onDisconnectGraceExpired` en porte **trois**, dont un
   accès de propriété sur un paramètre. Un des commentaires du dépôt écrivait
   l'inverse comme une justification — *« `_createReactionNotification` handles
   errors internally; void to be explicit »*.
2. **Cinq des quatorze sont dans un `setTimeout`.** Aucun `try/catch` englobant
   à invoquer, et le rappel se déclenche longtemps après la requête qui l'a armé :
   le rejet n'a nulle part où être vu, et son seul effet observable est l'arrêt
   du process sous le `--unhandled-rejections=throw` par défaut de Node 22.

## 3. L'épingle — le sixième transport annoncé

Deux des quatorze sont les entrées d'épingle. Elles ne manquaient pas seulement
le `.catch` : elles avaient re-codé à la main deux des trois audiences de
`broadcastMessageMutation`, dont le doc-comment prédit — littéralement — que
« collapsing them here means a **sixth transport** cannot silently reopen it ».

Ce que la copie manuscrite perdait en plus, et c'est le défaut de comportement
du lot : **l'émission de room n'était pas gardée**. `io.to(room).emit(...)` LÈVE
quand l'adaptateur ou l'encodeur est en défaut, et l'épingle est DÉJÀ commise en
base à ce moment-là. Mesuré, en restaurant l'ancienne forme sous les nouveaux
témoins :

| ce qui arrive quand l'émission lève | avant | après |
|---|---|---|
| statut rendu par la route | **500** sur une écriture réussie | 200 |
| entrée de file hors ligne | **jamais posée** | posée |
| rejet de la file sans écouteur | **1** | 0 |

Un incident COSMÉTIQUE emportait la seule garantie DURABLE du chemin —
l'inversion exacte que le cycle 116 avait corrigée sur les deux producteurs de
`message:new`, rejouée sur un chemin que ce lot-là ne couvrait pas.

Le correctif n'est donc pas d'ajouter un `.catch` aux deux sites : c'est de les
faire passer par le helper. `MessageMutationParams` accueille `'pinned'` et
`'unpinned'`, et **le TYPE dit quelles audiences chaque mutation doit
atteindre** : `prisma` n'existe que sur `edited` et `deleted`, les deux seules
mutations qui DÉPLACENT l'aperçu de la liste. L'épingle ne touche ni l'aperçu,
ni son ordre, ni son compteur — l'en dispenser au type, plutôt que par un
drapeau lu dans le corps, évite de faire payer la passe d'aperçu à chaque
épinglage et empêche le prochain transport de la croire obligatoire.

## 4. Le cliquet

`src/__tests__/detached-promise-catch-sweep.ts` + son test, inventaire **VIDE**.
Deux choix de rédaction à reprendre :

- **le discriminant est la POSITION, pas le mot-clé.** La première rédaction
  cherchait `void` précédé de « n'importe quoi qui ne soit pas un mot » et rendait
  plus de cent faux positifs, tous des annotations de retour (`(): void {`,
  `Promise<void>`). Un balayage qui cherche un IDIOME mesure sa popularité, pas
  une propriété (cycle 107). La propriété retenue : `void` en position
  d'INSTRUCTION, donc précédé de `;`, `{`, `}` ou du début du fichier ;
- **détecter sur une source dépouillée, RAPPORTER depuis la source brute.** Les
  commentaires citent la forme fautive pour l'expliquer — le dépôt en porte cinq
  — donc la détection doit les neutraliser ; mais la clé d'inventaire doit garder
  ses littéraux, sans quoi les deux `_enqueueOfflineReactionEvent` voisins de
  `ReactionHandler` seraient indiscernables. Le dépouillement remplace chaque
  caractère par une espace de MÊME longueur, ce qui laisse les offsets alignés.

La fixture porte les deux moitiés : `unguarded.ts` (les quatre formes relevées en
production) prouve que le balayage VOIT, `guarded.ts` prouve qu'il ne prend pas
la forme juste — ni les deux `void` qui ne détachent rien — pour la fautive.

## 5. Preuves

| gate | verdict |
|---|---|
| cliquet AVANT le lot | **ROUGE** — 14 sites, 3 témoins de fixture verts |
| cliquet APRÈS le lot | VERT — inventaire vide |
| témoins d'épingle, ancienne forme restaurée | **ROUGE** — 3/3 (500, file sautée, rejet nu) |
| témoins d'épingle, forme corrigée | VERT — 20/20 |
| `tsc --noEmit` (gateway) | `EXIT=0` |
| suite gateway complète | voir le commit |

## 6. Ce que ce cycle laisse ouvert

- **Le balayage ne lit que `services/gateway/src/`.** `apps/web` et le SDK
  portent le même idiome et n'ont pas de cliquet. Ce n'est pas la même
  conséquence — un rejet nu dans un navigateur ne tue pas de process — mais c'est
  la même perte de signal.
- **Il ne voit que la forme `void`.** Un appel asynchrone dont le retour est
  simplement ignoré (`this.doWork();` sans `void` ni `await`) produit exactement
  le même rejet nu, et le balayage ne peut pas le distinguer d'un appel
  synchrone sans typeur. Le mesurer demanderait un passage TypeScript, pas un
  balayage — lot à part, à instruire avant de le promettre.
