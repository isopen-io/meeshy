## Un agrégateur qui n'a rien exécuté conclut VERT par absence d'échec

*2026-11-13, cycle 153. Trouvé en vérifiant pourquoi un `check_suite.completed`
annonçait un succès sur une PR dont je savais les dix-sept jobs sautés.*

### Le fait

`scripts/ci/pr-verte.mjs` — « UNE PR EST-ELLE VERTE ? **Un seul outil pour tous
les fusionneurs** » (#12559) — rendait **vert** sur la charge réelle d'une PR
sous `PR_CI_GEL` :

```
$ node scripts/ci/pr-verte.mjs --rest charge.json
PR @ 4d84f482e9 : vert — 18 checks        EXIT=0
#  charge : 17 jobs `skipped`, 1 `success` (« Verdict CI »)
```

Et ce `success` n'avait **exécuté aucune étape** : les trois étapes du job
portaient le gel, son `if: always()` de job le faisait démarrer, et un job sans
étape exécutée conclut `success` **par absence d'échec**.

### La forme générale

> **Un job conclut vert quand rien n'a échoué — y compris quand rien n'a
> tourné.** « Vert » et « rien à signaler » sont le même symbole, et seul le
> contexte les sépare.

Et le symbole suivant l'est aussi : `SKIPPED` veut dire deux choses
incompatibles, selon qui l'a posé.

| qui saute | ce que `skipped` veut dire | feu vert ? |
|---|---|---|
| un job ORDINAIRE, par zone touchée (`changes`) | « rien à faire sur ce diff » | **oui** |
| le même job, par un GEL de CI | « on n'a pas vérifié » | **non** |

L'oracle lisait `SKIPPED` comme vert — **juste** pour la première ligne, qui est
le cas nominal du dépôt. Le gel a réemployé le même mécanisme pour dire
l'inverse, et rien ne pouvait distinguer les deux.

### Les trois questions à poser à un gate

1. **Ce check peut-il rougir dans l'état où je l'interroge ?** Sous le gel,
   l'unique étape capable de rendre un verdict était gelée avec les autres :
   l'agrégateur ne POUVAIT pas rougir. *Un témoin qui ne peut pas tomber n'est
   pas un témoin* — la règle du dépôt, appliquée à un job de CI.
2. **Ce vert dit-il « j'ai vérifié et tout va bien » ou « je n'ai rien à
   dire » ?** Le second se déguise en premier, gratuitement.
3. **Le symbole que je lis a-t-il UN sens, ou plusieurs selon son émetteur ?**
   S'il en a plusieurs, la garde doit porter sur l'ÉMETTEUR, pas sur le symbole.

### Le correctif, et pourquoi il a deux moitiés

**La première piste écrite dans l'issue était fausse**, et je ne l'avais pas
exécutée avant de la proposer : « que le gel retire `Verdict CI` du SHA de
tête ». Mesuré, un job sauté par un `if` **produit quand même un check run** à
ce nom, de conclusion `skipped` — donc vert. La piste aurait produit un gel
toujours vert **en ayant l'air d'une garde**, ce qui est pire que le défaut.

> **Un raisonnement est une AFFIRMATION, au même titre qu'un compte ou un tri —
> y compris celui qui propose un correctif, et surtout dans l'issue qui reproche
> à un gate de conclure sans rien avoir exercé.**

La forme juste tient en deux moitiés dont l'ordre compte :

1. **L'oracle exige que l'agrégateur ait CONCLU** (`SUCCESS`, pas seulement
   non-rouge). `SKIPPED` / `NEUTRAL` sur lui ⇒ *en cours*. Ferme le trou
   **structurellement**, quelle que soit la façon dont le gel est écrit — y
   compris les façons que personne n'a encore écrites. **Le gel était un
   révélateur, pas la cause.**
2. **Le gel passe des ÉTAPES au JOB.** N'est une garde que GRÂCE au point 1 :
   posé seul, il ne change rien, comme la mesure ci-dessus le montre.

### Le corollaire de manœuvre

**Deux `workflow_dispatch` sur la même ref ne sont pas deux preuves.**
`concurrency: cancel-in-progress` fait annuler le premier par le second, et une
annulation se lit ROUGE. Sous une file saturée l'effet arrive trois quarts
d'heure plus tard, donc le rouge ne ressemble plus au geste qui l'a causé : j'ai
cru à un échec de code avant d'ouvrir la liste des jobs (dix-neuf `cancelled`,
zéro `failure`). **Ouvrir les JOBS avant de qualifier un rouge de run.**

### Le second corollaire, sur la mesure

**Une suite longue lancée en arrière-plan mesure l'arbre tel qu'il est quand
chaque fichier est LU, pas tel qu'il était au lancement.** J'ai commité une
extraction pendant que la suite complète tournait : elle a rendu un rouge dans
ma propre zone, qui n'existait pas. Relancée sur un arbre gelé, la suite visée
passe 46/46. **Un rouge apparu après une telle course se revérifie sur un arbre
gelé avant d'être cru — dans les deux sens.**
