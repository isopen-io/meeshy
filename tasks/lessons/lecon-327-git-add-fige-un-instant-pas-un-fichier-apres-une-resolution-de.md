## Leçon 327 — `git add` fige un INSTANT, pas un fichier : après une résolution de conflit, `git diff` doit être vide avant de committer

**Contexte.** Le 2026-08-30T00:20Z, résolution d'un conflit de fusion sur
`user-deletions.ts` : je prends le côté de la session voisine, `git add` le fichier,
puis je continue à l'éditer — dédoublonnage d'un import que la fusion automatique
avait laissé en double, réconciliation d'un doc-comment que la version retenue
contredisait, deux assertions de témoin retournées. **Aucune de ces trois
corrections n'a été restagée.** Le commit de fusion a capturé l'index d'avant, et
`dev` a porté pendant quelques minutes un fichier avec le même helper importé deux
fois : `tsc` cassé pour toutes les sessions.

**Pourquoi tous les signaux étaient verts.** `npx tsc --noEmit` : 0 erreur. La suite
complète : **992 suites / 21 241 tests verts**. La garde des alias : verte. Ils
mesuraient tous l'ARBRE DE TRAVAIL, jamais le COMMIT — et l'arbre, lui, était
correct. C'est ce qui rend ce piège méchant : il ne produit aucun signal rouge du
côté où l'on regarde.

> **Un gate mesure ce qui est sur le disque ; une CI mesure ce qui est dans le
> commit. Tant que l'index diverge des deux, un lot peut être vert partout et
> cassé quand même.**

**Le mode de défaillance en une phrase.** `git add` photographie un fichier À CET
INSTANT. Éditer après avoir stagé produit un commit qui ne ressemble ni à ce qu'on
a résolu, ni à ce qu'on a testé. Le cas de la résolution de conflit y est
particulièrement exposé, parce que `git add` y a un second rôle — *marquer le
conflit résolu* — et qu'on le tape donc tôt, par réflexe, avant d'avoir fini.

**La vérification, mécanique et suffisante.** Juste avant tout `git commit` qui
conclut une fusion :

```bash
git diff --stat     # DOIT être vide : rien de modifié-non-stagé
git diff --cached --stat   # ce qui part réellement
```

Un `git diff` non vide à ce moment-là est un commit qui ment. La règle vaut
au-delà des fusions, mais c'est là qu'elle se paie.

**Ce que le signal disait, et que j'ai mal lu.** Le hook de fin de tour répétait
« uncommitted changes » à chaque tour. Je l'avais lu comme le rappel habituel
« le lot n'est pas fini » — il signalait un écart RÉEL entre l'arbre et le commit.
**Un avertissement qu'on a l'habitude d'écarter cesse d'être lu ; quand il devient
vrai, il ne prévient plus personne.** La parade n'est pas de le lire plus
attentivement, c'est de vérifier soi-même à l'endroit fixe où l'écart se produit.

**Récupération.** Immédiate et sans casse : les corrections existaient déjà dans
l'arbre, validées par la suite complète. Un commit de plus, poussé dans la minute.
La leçon n'est pas dans la réparation — elle est dans les quelques minutes pendant
lesquelles une branche partagée n'a pas compilé sans que rien ne le dise.
