## Un run `cancelled` dont TOUS les jobs sont verts — la conclusion du RUN n'est pas le verdict (2026-11-28, #20711)

Preuve CI du lot, par `workflow_dispatch` (la CI des PR étant gelée) :

```
run 46104623595 : completed / cancelled
```

Et les jobs de ce même run, tous ceux qui ne sont pas `skipped` :

```
26 × SUCCESS — dont Verdict CI, Tests · gateway · tranche 1/3, 2/3, 3/3,
Tests · gateway · couverture fusionnée, Tests · shared, Tests · agent,
Tests · web, les 4 tranches Playwright, Android coque, et les 5 du traducteur
```

**Aucun job n'a échoué ni été annulé. Seule l'ENVELOPPE du run porte
`cancelled`**, et la cause est dans le fichier :

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/dev' && github.ref != 'refs/heads/main' }}
```

Un `workflow_dispatch` plus récent sur la MÊME branche partage le groupe et
annule le précédent. Ici il est arrivé **après** que les 26 jobs aient conclu :
le run n'a donc rien perdu, et sa conclusion dit pourtant `cancelled`.

> **Lire `.conclusion` du run aurait rapporté un ROUGE sur une exécution où rien
> n'a échoué.** C'est l'inverse exact du piège de #18045 — où `SKIPPED` comptait
> VERT — et les deux ont la même racine : **la conclusion d'un run est un
> agrégat, pas une observation.** Elle mélange « un job a échoué », « un job a
> été annulé », « le run a été annulé après coup » et « il n'y avait rien à
> faire », sous quatre mots dont deux se ressemblent.

La règle, dans les deux sens :

| ce qu'on veut savoir | où le lire |
|---|---|
| « ce lot casse-t-il quelque chose ? » | les JOBS, un par un, en écartant `skipped` |
| « cette exécution a-t-elle été complète ? » | la présence des jobs ATTENDUS, pas la conclusion |

Et `skipped` ne se compte ni vert ni rouge : sur ce dépôt, `vars.PR_CI_GEL`
rend **dix-huit** jobs `skipped` sur toute PR, `Verdict CI` compris. Une PR sans
aucun rouge n'a donc rien fait tourner du tout.

Corollaire de manœuvre, payé deux fois dans le même lot : **tout commit poussé
pendant qu'un dispatch tourne annule son envelope**, et un dispatch sur une tête
dépassée ne prouve rien de la tête actuelle (directive #18654). Donc —

1. **committer TOUT** (code, journaux, décisions, leçons) **avant** de lancer le
   dispatch ; j'ai poussé deux fichiers de leçons après le mien, et il a fallu
   recommencer ;
2. sur une branche que **plusieurs sessions** écrivent, l'annulation peut venir
   d'ailleurs : ne pas la lire comme un échec, et ne pas relancer sans avoir
   d'abord vérifié que son propre travail est toujours CONTENU dans la tête
   (`git merge-base --is-ancestor`), fichier par fichier si besoin.

Détail : `tasks/realtime-sync-audit-2026-11-28-20711.md`, PR #20777.
