## Leçon 108 — une page PLEINE n'est jamais une preuve de fin ; demander plus que le plafond détruit la preuve (2026-08-11, routine messaging, cycle 78)

`deltaSyncCore` (iOS) demandait `limit=500` à une route plafonnée à 100. On lit ça comme de
l'hygiène — « le serveur cappe, tant pis ». C'en est l'inverse : **la seule façon de savoir
qu'une page a été coupée est de la comparer au plafond, et demander plus que le plafond rend
cette comparaison impossible**. Une page à 100 devenait indistinguable d'une fenêtre épuisée.

Trois règles à reprendre partout où un curseur pagine :

1. **Demander EXACTEMENT le plafond serveur** — ou mieux, **lire ce que le serveur ANNONCE**.
   La version retenue sur `main` (PR #2863) fait `pagination?.hasMore ?? (count >= limit)` : le
   comptage n'est que le repli. Une preuve déclarée par la source bat une preuve déduite ; ne
   déduire que lorsque la source se tait.
2. **Sur une page qui laisse du reste, NE PAS AVANCER LE CURSEUR** — puis escalader. L'ordre est
   le contenu du correctif : une escalade partant d'un curseur déjà trop haut hérite du trou
   qu'elle existe pour fermer. Et c'est parce que le curseur n'a pas bougé qu'une escalade
   ÉCHOUÉE (offline) laisse la fenêtre entière rejouable au lieu d'un trou définitif.
3. **Si on choisit de paginer plutôt que d'escalader, reprendre au max de la page est FAUX.**
   La coupure peut tomber au milieu d'un groupe partageant la même valeur de curseur ; une borne
   stricte `gt` posée sur le max enjambe les survivantes du groupe. Le seul curseur sûr est la
   plus haute valeur STRICTEMENT inférieure au max de la page. Et il reste un cas qu'aucun
   curseur ne franchit — toute la page à une seule valeur — où l'escalade est la seule réponse.

Distinction qui vaut au-delà de ce cas : **une borne de fréquence sur un entretien PÉRIODIQUE ne
doit jamais throttler une RÉPARATION.** `fullReconcileInterval` (24 h) borne la purge des
fantômes ; il n'a rien à dire à un `fullSync` que le delta vient de réclamer parce qu'il sait sa
fenêtre incomplète.

Côté test : une pagination ne se teste pas contre un mock qui rend la MÊME page à chaque appel —
la boucle passe au vert quoi qu'elle fasse. Il faut une file de réponses.
