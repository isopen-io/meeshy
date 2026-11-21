## Un correctif dont la seule sortie est un bouton qui n'existe pas n'a réparé personne (cycle 186, #19865)

*2026-11-19. Mesuré sur la file d'envoi du web : le correctif « évident » était juste,
complet, testable — et seul, il ne changeait RIEN pour l'utilisateur.*

**Le défaut.** Un envoi dont le téléversement a réussi et dont le `POST …/messages` a
échoué garde `upload.attachmentIds` dans une file DURABLE (IndexedDB), et la règle « aucune
régénération au renvoi » les réutilise tels quels. Passé 24 h, le balayage des orphelines a
supprimé la ligne et les octets : la passerelle refuse par `404 ATTACHMENT_NOT_FOUND`, et
rien côté web ne remet la clé à l'absence. L'entrée ne pouvait plus JAMAIS aboutir, alors
que `upload.files` porte encore le `File`.

**Le correctif évident, et ce qu'il lui manquait.** Oublier les ids au refus nommé, pour
que la reprise re-téléverse. Écrit, prouvé par mutation, vert. Puis cette mesure :

```ts
isPermanentFailure({ status: 404 })  // → true
```

`outcomeOf` classe tout 4xx hors 408/425/429 comme PERMANENT, et `isPermanentFailure`
gouverne — seule — l'existence du bouton « Réessayer » de la bande d'envoi. **Il n'y avait
donc aucun bouton.** L'entrée réparée attendait un geste que le produit n'offrait pas, dans
une file que `flush` ne rejoue pas non plus (`neverReachedServer` ne retient que le statut
0). Le correctif aurait été mergé, vert, avec son témoin — et le symptôme aurait survécu
intact.

> **C'est la question du cycle 122 (« qui AFFICHE ce que tu élis ? ») posée d'une
> AFFORDANCE au lieu d'un texte.** Un correctif qui rétablit la possibilité d'une action
> n'a rien rétabli tant que le contrôle qui la déclenche n'existe pas. Et une affordance
> absente est plus discrète qu'un texte faux : il n'y a rien à lire, donc rien qui
> détonne — on vérifie que l'état est réparé, pas qu'un chemin mène à lui.

**La forme générale, à poser au moment du correctif :** *par quel geste cette réparation
atteint-elle l'utilisateur, et ce geste est-il offert ?* Trois sorties possibles, à
énumérer plutôt qu'à supposer — un rejeu AUTOMATIQUE (ici : non, le drain filtre sur le
statut), un CONTRÔLE (ici : gouverné par un prédicat qui disait non), un prochain passage
(ici : aucun). Si les trois répondent non, le lot n'est pas fini.

### Corollaire : les deux moitiés se livrent ensemble, et il faut dire pourquoi elles divergent

`outcomeOf` reste INCHANGÉ — ses vingt appelants décident de rollbacks optimistes sur des
404 qui, eux, sont définitifs. Seul `isPermanentFailure` consulte désormais le code, et la
divergence est HONNÊTE parce que les deux ne posent pas la même question :

| la question | la réponse |
|---|---|
| ce MÊME appel, rejoué À L'IDENTIQUE, peut-il aboutir ? | non — il redemanderait la pièce supprimée |
| cette ENTRÉE offre-t-elle encore un espoir de partir ? | oui — le client vient de l'avoir réparée |

Une divergence entre deux prédicats voisins se DOCUMENTE au site, sinon le prochain lot la
lira comme une incohérence et « l'alignera ».

### Corollaire : une file durable ne mémorise que ce qu'elle peut REFAIRE

La cause racine n'est pas le refus mal lu, c'est le CHOIX de ce qu'on persiste. Le web
gardait un **identifiant serveur** — une poignée dont il ne gouverne pas la durée de vie —
dans une file qui, par construction, vit plus longtemps que lui. iOS et Android persistent
les OCTETS ou un chemin local (`OutboxDispatcher+Messages.swift`, `MediaSenders.kt`) et se
réparent donc **sans rien apprendre du refus**.

> Deux horloges, et aucune ne connaît l'autre : celle de la file (un onglet, un
> redémarrage, des jours) et celle du balayage serveur (24 h). Quand ce qu'on mémorise
> expire sous une horloge qu'on ne lit pas, il faut soit mémoriser ce qui ne périme pas,
> soit savoir OUBLIER — jamais faire confiance à la poignée. C'est la leçon des « deux
> horloges » de `services/gateway/CLAUDE.md` (§ *Une règle appliquée à l'ÉCRITURE n'est pas
> appliquée*), transposée à une file CLIENTE.

### Et la jumelle a été ouverte, puis mesurée SAINE — pour deux raisons de conception

`unsentComments` (`lib/comments/unsent-comments.ts`) a exactement la même forme : une file
qui porte « le corps déjà composé, ses `attachmentIds` compris — rien ne remonte une
seconde fois », sur des `PostMedia` que `sweepPendingPostMedia` balaie **aussi à 24 h**.
Elle n'est pourtant pas atteinte, et ce n'est pas de la chance : (1) elle est en MÉMOIRE
seule, donc la fenêtre de 24 h n'est atteignable que par un onglet laissé ouvert un jour
entier, et (2) sur un refus définitif elle REND le texte et les pièces au brouillon — un
chemin de réparation qui existait déjà. `talkie-voice-copy.ts` téléverse et envoie d'un
seul geste, sans rien mémoriser.

> **Une jumelle se mesure, elle ne se déduit pas de sa forme.** Les trois sites écrivent la
> même phrase dans leur doc-comment ; un seul porte le défaut, et la différence est dans ce
> qu'ils font APRÈS l'échec — pas dans ce qu'ils mémorisent.

### Trois témoins qui ne pouvaient pas tomber — et le troisième a résisté à sa première réparation

L'audit adversarial du lot a rendu VERTES trois mutations de production. Les
deux premières ont une cause commune, et elle mérite d'être dite :

| mutation restée verte | ce qu'elle casse |
|---|---|
| `forgetUploadedIds` ignore son `clientMessageId` | le refus d'un envoi fait oublier les ids de **l'envoi voisin** de la même conversation |
| le prédicat ne regarde que le CODE, pas le statut | un futur 403 portant le même mot ferait oublier des ids |
| l'oubli déplacé APRÈS `markFailed` | un arrêt brutal entre les deux `set` persiste « en échec » avec l'id mort |

> **Aucun de mes scénarios n'avait deux entrées dans une conversation.** Un
> défaut se raconte au singulier — « un envoi dont la pièce a été balayée » —
> et le témoin qu'on en tire hérite de ce singulier. La question à poser à un
> geste qui prend une CLÉ est : *mon témoin contient-il seulement ce que cette
> clé désigne ?* S'il n'y a qu'une ligne, la clé n'est pas exercée.

Et la troisième porte une leçon de plus. Mon premier témoin de l'ORDRE
assertait sur ce que la file avait ÉCRIT sur l'appareil — il est resté **VERT**
sous l'inversion, parce que les deux `set` publient l'un après l'autre et que
la dernière écriture gagne : l'état final est le même dans les deux ordres.

> **Ce que garantit un ORDRE n'est pas l'état FINAL — c'est chacun des états
> PUBLIÉS en chemin.** Un témoin qui lit l'arrivée ne peut pas voir un ordre ;
> il faut relever la SÉQUENCE et affirmer sur l'invariant (« aucun état publié
> ne porte *en échec* avec les ids morts »). Même famille que la leçon du cycle
> 185, versée le même jour :
> `2026-11-19-un-commentaire-qui-promet-un-ordre-est-une-affirmation.md`.

### Le témoin qui ne pouvait pas tomber, attrapé par sa propre mutation

La boucle sur les sept langues comparait `sendFailureReasonIn(refused, l)` à
`translate(l, clé)`. Une clé absente d'une langue rend `undefined` **des deux côtés** :
mutation appliquée (clé retirée de l'allemand), témoin VERT. Il assert désormais aussi la
LONGUEUR de la phrase servie, et tombe. La parité des sept catalogues reste gardée chez
elle (`satisfies InterfaceCatalog`, `i18n-catalog.test.ts`, qui tombe aussi sur la même
mutation) : un témoin de lot ne la double pas, il garde seulement qu'une phrase est bien
SERVIE.

### Et un CONTRÔLE qui réutilise l'artefact suspect confirme n'importe quoi

À la seconde fusion de `dev`, la suite web a rendu un rouge NEUF, dans un écran
que ce lot ne touche pas (la première page du Jeu, `#19840`, fusionné dans `dev`
une heure plus tôt). Pour savoir s'il venait de ma fusion, j'ai monté un
worktree sur `origin/dev` seul et rejoué le témoin : **rouge là aussi**. J'allais
rapporter « `dev` est rouge ».

Le worktree n'avait pas de dépendances : je lui avais lié celles du dépôt
principal. `@meeshy/shared` s'y résout par `dist/`, et ce `dist/` datait d'avant
le lot du Jeu. **Les deux mesures partageaient le même artefact périmé** — mon
contrôle ne contrôlait rien. `bun run build` dans `packages/shared`, et les deux
arbres passent au vert.

> **Un contrôle n'est un contrôle que s'il ne partage pas la cause suspecte avec
> le cas mesuré.** Un `node_modules` lié, un cache, un `dist/` d'un paquet
> d'espace de travail : tout ce qu'on « fait gagner du temps » en le partageant
> est exactement ce qui rend les deux mesures DÉPENDANTES. Et le coût n'est pas
> le temps perdu — c'est que j'allais accuser le travail de quelqu'un d'autre,
> avec une mesure à l'appui.

Corollaire sur les suites web de ce dépôt : `apps/web` lit `@meeshy/shared`
par son `dist/`, jamais par ses sources. Une suite locale rejouée après une
fusion qui touche `packages/shared` mesure l'ANCIEN paquet tant que
`packages/shared && bun run build` n'a pas tourné — la CI, elle, le reconstruit
à chaque job (`Build shared package (bun)`), et c'est pourquoi elle était verte
pendant que le poste était rouge.

### Le run de PR qui est SAUTÉ annule quand même le `workflow_dispatch` lancé pour le remplacer

Suite directe de la leçon du cycle 181 (#19755) — « pousser sur la branche
ANNULE le verdict en vol ». Elle disait de ne pas pousser PENDANT un run ; elle
ne disait pas ce qui suit, et il coûte une heure et demie :

```
21:08:31  workflow_dispatch   → run 30714 (le vrai verdict)
21:08:33  pull_request        → run 30715, conclusion SKIPPED
21:12:43  run 30714           → CANCELLED
```

**La CI des PR est gelée : le run de PR ne fait RIEN — et il gagne quand même
le groupe de concurrence.** Deux secondes d'écart ont suffi : dispatcher juste
après la poussée, c'est armer son propre annulateur.

> L'ordre juste est : **pousser → attendre que le run de PR soit CRÉÉ et
> conclu (il l'est en quelques secondes, puisqu'il saute) → dispatcher.**
> Dispatcher d'abord paraît plus rapide et ne l'est jamais : le run utile meurt
> avant son premier job, et le seul signe est un « Verdict CI » rouge qui ne dit
> pas sa cause.
