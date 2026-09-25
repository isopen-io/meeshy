## Leçon 337 — un FLAKE de charge et un défaut SENSIBLE à la charge ont le même symptôme ; seul le second gate les sépare

**Contexte (2026-08-30, boucle d'intégration, #4420).** Le gate gateway complet, lancé sur un
arbre, rend **24 suites rouges** en 4 254 s. Le dépôt a une règle pour ça, et elle est juste :
« ensembles d'échec DISJOINTS sur un code identique = flake prouvé » — les suites passent en
isolation, la machine était saturée, on relance.

Relancé sur le MÊME code, le gate rend **2 suites rouges** en 635 s. Vingt-deux avaient bien été
des flakes de charge. **Les deux dernières aussi passaient en isolation**, et c'est là que la règle
cesse de s'appliquer : elles étaient rouges aux DEUX passes.

### Ce qu'elles disaient

```
● POST /topics › returns 400 with "Slug déjà existant" on P2002 error
    Received: "keywordPatterns: motif refusé — \bfilm\b → [BACKTRACKING_BUDGET]
               Motif non certifié : la sonde a été interrompue par un motif voisin"
```

`\bfilm\b` n'a aucun retour arrière. Le motif le plus sain qu'on puisse écrire était refusé sous
le code d'un motif dangereux — **et ce n'était pas un artefact de test : c'était le comportement
SERVI.** Un administrateur sur une machine chargée se voyait refuser ses mots-clés, avec un message
l'envoyant réécrire un motif qui n'avait rien.

### La cause, et pourquoi elle était invisible

`runOffLoop` armait son délai maximal **à la création du `Worker`** :

```ts
worker = new Worker(WORKER_SOURCE, { eval: true, workerData: job });
await new Promise((resolve) => {
  const timer = setTimeout(() => { settle(); }, budgetMs);   // ← court AVANT que le fil existe
```

`DEFAULT_PROBE_BUDGET_MS = 250` était donc un budget **démarrage + exécution**, alors qu'il est
écrit, documenté et testé comme un budget d'exécution. Mesuré : lever un isolate V8 en `eval: true`
coûte 29-37 ms au repos, bien davantage sous charge. Quand le démarrage mangeait les 250 ms, aucun
motif n'avait été annoncé — `counts` vide, `started` à `null` — et la boucle de verdict refusait
tout le monde.

> **Le discriminant n'est pas « la suite passe-t-elle en isolation ? » — les deux familles y
> passent.** C'est **« le même ensemble tombe-t-il à la seconde passe ? »**. Un flake se déplace ;
> un défaut sensible à la charge revient à la même adresse. Relancer le gate n'est donc pas une
> concession au bruit, c'est la MESURE qui sépare les deux.

### Trois corollaires, tous payés dans ce lot

**1. Un champ de service qui DÉCLARE une indisponibilité doit être atteignable pour toutes ses
causes.** Le module distinguait déjà « nous n'avons rien mesuré » (`unsupported` →
`UNSUPPORTED_RUNTIME`, fail-closed, doc-comment à l'appui). Ce chemin ne couvrait que l'échec
**synchrone** de `new Worker` ; un démarrage simplement LENT tombait dans l'autre branche et
accusait le motif. Le sens de la panne était juste, la VÉRITÉ du refus ne l'était pas — et c'est
elle que l'opérateur lit.

**2. Un budget qui borne une SESSION punit un membre pour ses voisins.** Le correctif ne s'est pas
arrêté à séparer démarrage et exécution : le délai d'exécution se **réarme à chaque message** du
fil, donc il mesure l'ABSENCE DE PROGRÈS. Un motif sain avance et n'est jamais interrompu ; un
motif en retour arrière se tait après son annonce, et c'est ce silence-là qu'on veut mesurer. La
formulation d'origine punissait un motif pour le temps qu'avaient pris ses voisins **alors qu'ils
l'avaient pris honnêtement**.

**3. Un témoin ne peut pas toujours être une DURÉE, et s'en apercevoir fait partie du travail.**
Le premier témoin écrit pour ce lot exigeait qu'un budget de 20 ms suffise à certifier un motif
sain, en pariant que le démarrage dépasse 20 ms. Il a mesuré 11 ms et n'a pas rougi. Le défaut ne
se manifeste que lorsque la naissance dépasse le budget — ce qui dépend de la charge et **ne se
reproduit pas à volonté**. Ce qui se prouve, et qui suffit à interdire le retour du défaut, est que
les deux délais sont SÉPARÉS : sous `startupBudgetMs: 0`, le module rendait `[]` là où il rend
`['UNSUPPORTED_RUNTIME']`. **Quand un témoin de durée ne rougit pas, la réponse n'est pas de
choisir un autre seuil — c'est de trouver la propriété STRUCTURELLE dont la durée n'était qu'un
symptôme.**

Sites : `services/gateway/src/utils/safe-regex.ts` (`DEFAULT_STARTUP_BUDGET_MS`, `OffLoopBudgets`,
`relancer`), témoin dans `__tests__/unit/routes/admin/agent-topics-safe-regex.test.ts`.
Gate après correctif : 1028 suites, 21 628 tests, exit 0.
