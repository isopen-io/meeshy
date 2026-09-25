## Gate B (#6160) — les quatre codes de diagnostic muets restent muets ; assumer, pas tenter (2026-09-13, #6160)

**Le fait** : #6160 a mesuré, le 2026-09-12, ~3 467 occurrences des quatre
codes que `ts-jest` musèle encore sous `tsconfig.test.json`
(`diagnostics.ignoreCodes: [2322, 2339, 2345, 2740]` — `TS2307` en est sorti
par #6252, gate A livré par #6309, gate C par #6218). Il ne restait que cette
décision. Remesuré le lendemain sur `dev` (HEAD `6e34289a5b`,
`tsc -p tsconfig.test.json --noEmit --pretty false`), le compte n'a pas
stagné : **13 964** occurrences (`TS2345` 13 189, `TS2339` 521, `TS2322` 195,
`TS2740` 59) — près de quatre fois le chiffre de la veille, en une seule
journée de développement normal. `TS2345` se répartit sur **638 fichiers de
test distincts** (aucun n'en concentre plus de 5 % — le plus chargé,
`CallService.test.ts`, en porte 618/13 189) : ce n'est pas un défaut localisé,
c'est la forme structurelle du mock partiel que l'issue décrivait déjà —
`const svc = { markAsRead: jest.fn() } as unknown as NotificationService`
typechecke le double, pas l'appel qu'il reçoit.

**La décision** : **assumer, pas tenter.** Les quatre codes restent dans
`diagnostics.ignoreCodes` — indéfiniment, pas seulement le temps de cette
issue. Deux raisons, une par famille :

- `2322`/`2345`/`2740` (195 + 13 189 + 59 = 13 443 occurrences) sont
  indifférents à l'exécution — déjà établi dans l'issue et revérifié en séance
  (la comparaison a lieu quand même ; un test dont l'assertion ne tient plus
  rougit). Les fermer demanderait des fabriques de mocks TYPÉES pour
  l'ensemble du corpus de tests du gateway — pas un correctif borné, une
  réécriture de la façon dont TOUT test du service construit ses doubles.
  Rapport coût/signal mauvais : zéro panne silencieuse évitée, un chantier qui
  dépasse d'un ordre de grandeur n'importe quel autre lot de cette issue
  (13 443 contre 92 pour le gate A, 19 pour `TS2307`).
- `TS2339` (521, « propriété inexistante ») PEUT produire un vert à vide (une
  lecture `undefined` que `toBeUndefined()` / `toBeFalsy()` / `not.toBe(x)`
  laisse passer) — c'est la seule des quatre à demander un traitement, mais
  LOCAL, jamais en bloc : la règle déjà posée dans #6160 pour les 23 suites
  visées par le gate C (rejuger `TS2339` suite par suite avant réintégration,
  le démuseler ensuite pour cette suite précise) reste la procédure. Rien à
  ajouter en dehors d'elle.

**Pourquoi pas un cliquet** (la forme des gates A et C) : un cliquet
DÉCROISSANT sur ce compte rougirait à chaque mock partiel ajouté — c'est-à-dire
à peu près chaque test écrit dans ce service, vu la croissance mesurée en 24 h.
Ce ne serait pas un gate, ce serait un frein sur l'écriture de tests, contraire
à la TDD non négociable de ce dépôt (`CLAUDE.md` racine). Un cliquet CROISSANT
(jamais baisser) ne protégerait rien, puisque rien ne doit baisser. Aucune
forme de cliquet ne s'applique à un compte dont la croissance est le signe
d'une activité saine.

**Alternative rejetée** : démuseler les quatre codes et vivre avec un
typecheck des tests rouge en continu. Rejetée — un gate rouge en permanence
cesse d'être un signal ; la prochaine régression RÉELLE se noierait dans les
13 964 lignes déjà là, exactement l'inverse de ce que `TS2307` a démontré
utile à démuseler (#6252 : 19 occurrences, toutes de vrais chemins cassés).

**Conséquences** : `services/gateway/jest.config.json` et
`jest.config.temp.json` conservent `diagnostics.ignoreCodes: [2322, 2339,
2345, 2740]`. Les gates A (#6309, cliquet décroissant sur les fichiers de test
jamais chargés, hors ces quatre codes) et C (#6218, cliquet croissant sur les
suites collectées par Jest) restent les deux gardes actives de cette famille
de risque ; la procédure de réintégration suite-par-suite (rejuger `TS2339`
avant de sortir une suite de `testPathIgnorePatterns`) reste écrite dans
#6160. Avec cette décision, les quatre points du critère de fin de #6160 sont
tous livrés — l'issue peut se fermer.
