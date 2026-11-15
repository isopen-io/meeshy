## Leçon 565 — Retirer une feuille morte ne TUE pas la fonction d'en dessous : elle la rend VISIBLE

2026-09-10, iOS (#6016). Après avoir retiré dix-huit fonctions du composer
inline du fil, la garde d'atteignabilité en a nommé une DIX-NEUVIÈME —
`FeedViewModel.supersedeRecoveredPost`, dont la seule citation vivait dans
`publishPostWithAttachments` que je venais de supprimer. Le réflexe est de se
croire responsable : « je viens de l'orpheliner, je dois la retirer aussi ».

C'était faux, et la mesure le disait. Son garde d'entrée est
`if let cmid = recoveredPostCmid`, et le seul site posant `recoveredPostCmid`
à une valeur non nulle était `recoverStuckPostDraftIfNeeded` — **déjà inscrite
dans l'allowlist de cette même garde, donc attestée sans appelant.** La
branche ne pouvait jamais s'ouvrir. Elle était morte depuis le MÊME commit que
celle que je venais de retirer ; ma suppression n'a fait que déplacer la
mesure d'un cran dans l'arbre.

> **Une garde d'atteignabilité par RÉFÉRENCE attrape la feuille, pas
> l'arbre** — son propre doc-comment le dit. Le corollaire pratique n'y était
> pas : chaque retrait fait donc DESCENDRE la mesure d'un cran, et ce qui
> apparaît au cran suivant a la même ancienneté que ce qu'on vient de
> retirer. Ne pas dater une mort d'après le commit qui l'a révélée.

Ce qui l'établit, dans les deux sens, c'est de suivre l'ÉTAT plutôt que
l'appel : qui écrit la variable que le garde d'entrée lit ? Si le seul
écrivain est lui-même mort, la fonction l'était avant qu'on y touche.

Même famille que la garde qui ne cherche que `func` : dans le même lot,
`feedPendingAttachmentsRow` — 44 lignes de SwiftUI, une seule occurrence dans
tout le dépôt, sa déclaration — était INVISIBLE à la mesure parce que c'est
une `var`. Elle portait à elle seule trois des fonctions signalées. **La
racine d'un arbre mort n'a pas nécessairement la forme que la garde sait
lire.**
