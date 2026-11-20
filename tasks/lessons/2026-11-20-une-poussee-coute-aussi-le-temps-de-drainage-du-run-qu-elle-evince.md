## Une poussée ne coûte pas seulement le verdict en vol : elle coûte le temps de DRAINAGE du run qu'elle évince (#19939)

*2026-11-20, #19939.*

### Le motif

La leçon du 2026-11-18 dit qu'une poussée sous `cancel-in-progress` **annule** le
verdict en vol. Celle du 2026-11-19 ajoute que `queued` ne veut pas dire
*survivant*, et qu'il faut relever les JOBS. Les deux portent sur le run
ÉVINCÉ. Voici la face qui manquait, mesurée ce matin sur le run évinçant :

| horodatage | fait |
|---|---|
| 05:54 | poussée de `a5a447a2b0` — évince le run 44680722348 (`eefc83b2aa`) |
| 05:57:01 | `workflow_dispatch` sur `a5a447a2b0` → run 44684393879, statut **`pending`** |
| 05:57:02 | les jobs du run évincé passent en `cancelled` |
| 06:14:20 | le run évincé **se termine** (son agrégateur « Verdict CI » a dû être planifié, démarré, et conclu) |
| 06:14:21 | les jobs du run évinçant sont **créés** — une seconde après |

**Dix-sept minutes de `total_count: 0` jobs**, pendant lesquelles le relevé des
jobs — l'instrument que la leçon du 2026-11-19 prescrit — rend exactement la
même chose qu'une pénurie de runners.

### La règle

Un groupe de concurrence (`ci-${{ github.ref }}`) n'est pas libéré par
l'ANNULATION des jobs du run précédent, mais par la **complétion du run**. Un
run annulé doit encore planifier et exécuter ses jobs d'agrégation — ici
« Verdict CI », qui a attendu un runner dix-sept minutes pour conclure `failure`
sur un SHA que personne n'attendait plus.

> **Le coût d'une poussée pendant un run n'est pas « un verdict perdu », c'est
> « un verdict perdu PLUS le temps de drainage de ce qu'elle évince ».** Et ce
> temps-là est invisible : le run évinçant existe, son `status` est `pending`,
> et il n'a aucun job à montrer.

### Ce que ça change, concrètement

- **`pending` + zéro job ≠ pénurie de runners.** Avant de l'annoncer comme telle
  — je l'ai fait —, regarder si un run PRÉCÉDENT du même groupe de concurrence
  est encore `in_progress`. Si oui, le temps d'attente est connu et borné : il
  finira quand l'autre finira.
- **La règle d'ÉTAT reste la bonne** (« après un dispatch, la branche est GELÉE
  jusqu'au verdict »), et ceci en double le prix : rompre le gel ne décale pas le
  verdict de quelques minutes, il le décale du drainage complet.
- **Un verdict rouge sur un SHA qui n'est plus la tête n'appelle aucun
  commentaire de PR** : il est arrivé à 06:14 pour un arbre abandonné à 05:54.
  La première question devant une alerte reste « ce SHA est-il la tête ? ».

### Le corollaire d'instrument

Les deux leçons précédentes sont justes et ne pouvaient pas répondre ici : elles
enseignent à mesurer les JOBS plutôt que le `status`, et le relevé des jobs du
run NEUF est vide pour deux raisons indiscernables. **La mesure qui tranche
porte sur un AUTRE objet que celui qu'on observe** — le run précédent, pas le
sien.

## Et ANNULER un run évincé fabrique une fausse alerte, par le même mécanisme

Ce qui précède dit ce qu'une poussée coûte. Le geste de RANGEMENT coûte aussi,
et dans l'autre sens. Le même jour, après avoir poussé une résolution de
conflit sur une branche, j'ai annulé le run devenu obsolète pour libérer la
file — le geste propre, celui que cette leçon recommande.

L'annulation a produit, en quelques secondes, une notification d'ÉCHEC sur la
PR :

```
{"check":"Verdict CI","conclusion":"failure","head_sha":"6f7b73fc…"}
```

Relevé sur le run annulé : **17 jobs `cancelled`, 1 `failure`** — et ce 1 est
l'AGRÉGATEUR, rouge faute de résumé à agréger. C'est exactement la forme des
fausses alertes que cette leçon décrit pour les runs évincés ; ce qui est
neuf, c'est que **le geste censé les éviter la déclenche**.

> **Annuler un run obsolète n'est pas gratuit : on échange du temps de file
> contre une fausse alerte qui coûte un tour de triage.** L'arbitrage reste bon
> — la file est partagée, l'alerte ne l'est pas — mais il se prend en SACHANT
> que l'alerte viendra, et elle se reconnaît par la question que cette leçon
> pose déjà : *ce SHA est-il la TÊTE ?*

Corollaire d'instrument, et c'est lui qui fait gagner le tour de triage : **un
agrégateur qui conclut rouge sur des jobs `cancelled` ne dit rien du code.**
Avant d'ouvrir un log, lire le `conclusion` du RUN (`cancelled`) et non celui
du seul check qui a notifié — le check dit « failure » là où le run dit
« annulé », et c'est le run qui a raison.
