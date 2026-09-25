## Leçon 508 — Un contrôle qui LIT une liste devient aveugle le jour où la liste se met à se CALCULER

**Le fait.** `scripts/check-v3-pipeline.mjs` porte l'invariant « toute suite e2e de la v3 est
LANCÉE », né de la leçon payée deux fois avant lui (« un instrument déclaré n'est pas un instrument
lancé »). Il répartit les suites entre les deux projets Playwright et vérifie qu'un job de `ci.yml`
atteint chacune. Pour cela il lit `SUITES_DE_PAGE` dans `playwright.config.ts`, par un
`matchAll(/([A-Za-z0-9._-]+\.spec\.ts)/g)` sur le corps du littéral.

Entre-temps, `playwright.config.ts` s'est amélioré : `SUITES_QUI_IMPORTENT_LA_LOI` a cessé d'être
une énumération et RELÈVE désormais ses suites sur le disque (leçon 477, « ne pas tirer d'une liste
de FAITS ce qu'une RÈGLE peut dire »). La déclaration est devenue :

```ts
const SUITES_DE_PAGE = [...SUITES_QUI_IMPORTENT_LA_LOI, '**/v3-lifecycle.spec.ts', '**/v3-cibles.spec.ts'];
```

Le `matchAll` n'y voit **que les deux littéraux**. La garde a donc cru que le projet `pages` ne
contenait que ces deux suites, et que `chaines` — son complément — ramassait tout le reste. Mesuré
le 2026-09-04 : `pages` en contenait **onze**, `ci.yml` en nommait **trois**, et **huit suites
n'étaient lancées par aucun job**. Elles portaient les critères de fin de huit issues fermées.

Le vert de la garde n'était pas une erreur d'arithmétique : c'était une lecture qui avait cessé
d'être vraie sans que rien ne le signale.

> **Une amélioration en amont peut aveugler un contrôle en aval sans faire rougir personne.** Quand
> un garde lit la source d'un autre fichier, il contracte une dépendance à la FORME de cette
> source — et cette forme n'a aucune raison de rester stable, surtout si elle s'améliore. La
> question à poser à tout contrôle qui lit du code : **que fait-il quand ce qu'il lit devient
> illisible ? S'il continue à conclure, il ment.**

**Le correctif tient en deux moitiés, et la seconde est la vraie.**

1. *La garde ne devine plus.* Elle DÉTECTE le `...` — le signe que la liste est calculée — et cesse
   alors de répartir les suites entre les deux projets. Elle ne reconstruit surtout PAS le critère
   de `playwright.config.ts` : ce serait la jumelle qui diverge au premier raffinement, c'est-à-dire
   le défaut d'origine réinstallé un cran plus bas. Quand la frontière lui est illisible, la seule
   couverture qu'elle sait prouver est celle des DEUX projets lancés en entier.
2. *`ci.yml` lance un PROJET, pas une énumération.* Trois étapes nommant trois suites sont devenues
   une étape lançant `test:pages`. C'est la seule forme qui fasse entrer d'office la suite écrite
   demain — et la seule dont la justesse ne dépende pas de ce que la garde arrive à lire.

**Preuve de non-vacuité, rejouée.** La garde corrigée, opposée à l'ancien `ci.yml`, rend
**24 défauts** et nomme les huit suites orphelines. Opposée au `ci.yml` corrigé : **40 invariants
tenus**.

Sites : `scripts/check-v3-pipeline.mjs` (`everyV3SuiteIsLaunched`), `.github/workflows/ci.yml`
(étape « Gate pages »), `apps/web-v3/playwright.config.ts` (la liste calculée, inchangée — c'est
elle qui a raison). Issue #5093.
