## Leçon 517 — `git add -A` puis un correctif, c'est un commit qui ne compile pas

**Ce qui s'est passé.** Fusion de `dev` dans une branche de lot, treize conflits
résolus. J'ai fait `git add -A` pour marquer les résolutions, puis lancé `tsc` :
il a rendu un DIX-QUATORZIÈME désalignement, dans un fichier NEUF de ma branche
donc jamais en conflit — `__tests__/banniere-servie.test.ts` ignorait un actif
que `dev` venait d'ajouter. Je l'ai corrigé, vérifié `tsc` vert, lancé la suite
entière, le build, les gates. Tout vert. J'ai committé.

**Le correctif n'était pas dans le commit.** `git add -A` était passé AVANT le
`sed`. Pendant une fusion, `git commit` sans `-a` valide L'INDEX — et l'index
portait la version fautive. Le message de commit affirmait « Corrigé » ; l'arbre
versionné, lui, ne compilait pas. La CI tournait déjà dessus.

**La règle.** *Pendant une fusion, tout correctif postérieur au `git add` doit
être RE-ajouté, et la preuve se prend sur l'INDEX, pas sur l'arbre de travail.*
`git stash && tsc && git stash pop` répond exactement à la question qu'on croit
avoir posée : « est-ce que CE QUE JE M'APPRÊTE À COMMITER compile ? » — la
commande qu'on lance d'ordinaire répond à une autre, « est-ce que ce que j'ai
sous la main compile ? », et les deux divergent dès qu'on corrige après avoir
ajouté.

**Pourquoi c'est particulièrement traître ici.** Une fusion invite au
`git add -A` précoce : c'est le geste qui déclare les conflits résolus, et il
tombe naturellement AVANT les vérifications. Tout ce qu'on corrige ensuite —
et une fusion en fait corriger — atterrit hors de l'index sans qu'aucun signal
ne le dise. `git status` l'affiche, mais on ne le relit pas : on vient de voir
treize gates verts.

**Ce qui l'a attrapé.** Pas moi : le hook de fin de session qui refuse un arbre
sale. Sans lui, un merge non compilable partait en CI avec un message de commit
qui affirmait le contraire.

Sites : `apps/web-v3/__tests__/banniere-servie.test.ts` (l'actif manquant),
`apps/web-v3/budgets-mesures.json` (la mesure des modules, réécrite par
`--mesure` après le même `git add`). Fusion `1becc7e4d7`.
