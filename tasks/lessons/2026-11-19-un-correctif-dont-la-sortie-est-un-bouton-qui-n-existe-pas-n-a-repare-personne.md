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

### Le témoin qui ne pouvait pas tomber, attrapé par sa propre mutation

La boucle sur les sept langues comparait `sendFailureReasonIn(refused, l)` à
`translate(l, clé)`. Une clé absente d'une langue rend `undefined` **des deux côtés** :
mutation appliquée (clé retirée de l'allemand), témoin VERT. Il assert désormais aussi la
LONGUEUR de la phrase servie, et tombe. La parité des sept catalogues reste gardée chez
elle (`satisfies InterfaceCatalog`, `i18n-catalog.test.ts`, qui tombe aussi sur la même
mutation) : un témoin de lot ne la double pas, il garde seulement qu'une phrase est bien
SERVIE.
