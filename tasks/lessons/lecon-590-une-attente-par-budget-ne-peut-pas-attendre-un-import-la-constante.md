## Leçon 590 — Une attente par BUDGET ne peut pas attendre un `import()` : la constante mesure la machine, jamais le produit

**Mesuré le 2026-09-12, #6187** (rouge observé sur la PR #6167, `apps/web-v2`).

Un témoin rougit sur le runner — **1 fail sur 2 095** — dans un job dont le diff
ne touchait rien de ce que le témoin traverse. En local, la MÊME fusion passait
**3 fois sur 3**. La tentation est de classer « flake » et de relancer ; c'était
un défaut de témoin, et il se nomme.

`Composer` monte son panneau en différé :

```tsx
const ComposerTray = lazy(() => import('./composer-tray'));
```

Le témoin l'attendait par un BUDGET :

```tsx
// la forme fautive
const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
};
```

> **Un tour de macro-tâche plus cinq de micro-tâches est une CONSTANTE ; la
> résolution d'un module est un TRAVAIL.** Aucune constante ne borne un travail
> dont la durée dépend de la contention. Le témoin ne mesurait donc pas le
> produit — il mesurait la machine, et rendait un verdict différent selon qui
> d'autre tournait dessus.

Le doc-comment de la forme fautive **avouait le mécanisme** (« laisse l'`import()`
de `./composer-tray` résoudre ») sans en tirer la conséquence. C'est
[[reference_grep_the_confessions_a_doc_comment_names_its_own_gap]] appliqué à une
attente : un commentaire qui nomme une asynchronie et un code qui l'attend par
une constante sont en contradiction, et la contradiction est lisible à l'œil.

### La signature qui l'identifie en trente secondes

Deux assertions CONSÉCUTIVES, la première verte et la seconde rouge :

```tsx
expect(el.querySelector('[aria-label="Fermer le menu des pièces jointes"]')).not.toBeNull();  // PASSE
expect(el.querySelector('[role="group"][aria-label="Types de pièces jointes"]')).not.toBeNull(); // ÉCHOUE
```

Elles n'ont pas la même DÉPENDANCE : la première porte sur un attribut rendu par
le composant PARENT (état local, synchrone), la seconde sur un contenu du module
DIFFÉRÉ. **Une seule attente couvrait deux natures.** Devant un rouge de cette
forme, demander de chaque assertion : *de quoi dépend-elle, et l'attente qui la
précède borne-t-elle bien ÇA ?*

Le trio de mesures qui écarte définitivement « le diff est coupable » :

| mesure | verdict |
|---|---|
| rouge en CI, 3/3 vert en local sur la MÊME fusion | ce n'est pas le diff |
| aucun fichier du diff dans la chaîne d'imports du témoin | ce n'est pas le diff, prouvé |
| durée d'un run local **de 12 s à 32 s** selon la charge | c'est la contention |

La troisième ligne est la preuve POSITIVE, et elle vaut mieux que les deux
négatives : le même travail varie d'un facteur 2,7 pendant que l'attente reste
une constante. **Quand un gate rougit par intermittence, mesurer la VARIANCE de
sa durée avant de mesurer son code.**

### La correction : borner en TEMPS, pas en tours

```tsx
const ATTENTE_MAX_MS = 2000;
const flush = async (condition?: () => boolean): Promise<void> => {
  const limite = Date.now() + ATTENTE_MAX_MS;
  for (;;) {
    await act(async () => { /* … un tour … */ });
    if (condition === undefined || condition() || Date.now() >= limite) return;
  }
};
```

Sans prédicat, l'attente courte d'une mise à jour déjà montée reste ce qu'elle
était (dix sites) ; avec prédicat, la boucle attend la CONDITION (sept sites).

### Le corollaire qui vaut pour tout `waitFor`

Attendre la condition qu'on va ensuite ASSERTER **n'est pas** un vert par
construction — mais il faut le PROUVER, sinon la critique est juste :

- **contre-épreuve** — la forme fautive rejouée (`role="group"` retiré du groupe
  des types) rend **2 rouges / 29 verts** ;
- **la DURÉE est la signature arithmétique** — la suite passe de **3,07 s à
  16,33 s**, soit sept boucles épuisant chacune leur borne de 2 s. C'est la
  preuve que la boucle TOURNE, et non qu'un raccourci la court-circuite ;
- **coût nul en nominal** — une sonde instrumentée compte **1 tour** sur les sept
  sites (`SONDE tours=1 satisfait=true` ×7). La borne n'allonge aucun run vert.

> **Une boucle d'attente se prouve par sa DURÉE autant que par son verdict.** Un
> `waitFor` dont on ne sait pas combien de tours il consomme est indistinguable
> d'un `waitFor` qui rend la main au premier tour parce que son prédicat est
> toujours vrai — c'est-à-dire d'un témoin mort. Instrumenter le compteur une
> fois, l'écrire dans le commit, le retirer.

Voisins : [[reference_a_pixel_witness_must_await_the_paint_not_the_load]] (la
même loi sur la PEINTURE : attendre l'état, jamais `complete`) ·
[[reference_a_red_on_both_sides_of_the_diff_also_measures_the_machine]] ·
[[reference_a_green_on_both_sides_of_the_diff_measures_the_machine]] · leçon 589
(un budget qui NOMME un chunk ne le garantit pas — ici un budget qui NOMME une
attente ne la borne pas : deux faces d'une même erreur, croire qu'écrire une
intention la réalise).

---
