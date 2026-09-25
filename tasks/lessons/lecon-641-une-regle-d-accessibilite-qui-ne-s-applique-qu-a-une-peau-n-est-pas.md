## Leçon 641 — une règle d'accessibilité qui ne s'applique qu'à UNE peau n'est pas une règle, c'est un accident ; et un témoin qui ne joue qu'une peau ne peut pas le voir

2026-09-20, #7142 (`thread-modes-reveal-label.test.tsx`, web-v2). Le lot devait alimenter une phase de révélation jusqu'au nom accessible d'une rangée. Son témoin a été écrit sur les DEUX peaux du fil — Focal et Bulles — parce que le mécanisme de remontée est unique et que les deux hôtes devaient le prouver. **Il est tombé sur la peau Bulles pour une raison qui n'était pas dans l'issue** : le texte peint y restait dans l'arbre d'accessibilité, alors qu'il en est retiré sur la rangée plate.

**Le défaut n'était pas celui du lot, et il était plus large.** `plainTextHidden` (#7032, réponse au défaut majeur 1/4 de la revue #5935) masque la prose non interactive parce que le texte servi est DÉJÀ dans `aria-label={rowLabel}`. Il n'avait jamais été porté sur `bubble.tsx`. Mesuré sur un message **sans aucune protection** :

```
focal   : libellé porte le texte = true | DOM expose le texte = false
bubbles : libellé porte le texte = true | DOM expose le texte = TRUE
```

La peau Bulles prononçait donc son texte **deux fois**, pour TOUT message, depuis toujours. Aucun gate ne le voyait : `rich-text-surfaces.test.tsx` testait bien les deux surfaces, mais il attendait de la bulle la forme SANS masque — c'est-à-dire qu'il **gardait le défaut** au lieu de l'attraper. Un témoin qui encode l'état des lieux d'une surface ne peut pas dire que cette surface diverge d'une autre : il faut que la même assertion soit posée sur les deux.

**Pourquoi le corriger DANS ce lot et non après.** Alimenter la phase rend le libellé porteur du texte sur une rangée révélée. Le critère de l'issue — « le libellé OU le DOM, jamais les deux, jamais aucun » — serait donc devenu VRAI sur Focal et FAUX sur Bulles, au moment même où le lot prétendait le livrer. Reporter aurait signifié livrer un critère à moitié, sur la moitié qu'on ne regardait pas.

**Le préalable de l'issue, lui, s'est révélé plus petit que son cadrage.** Elle demandait de mesurer avant de lever l'état : « un re-rendu par tic de brouillard ». Le brouillard ne tic pas — `FOG_DURATION_MS` est une DURÉE consommée par un `setTimeout`, jamais un `setInterval`, et le seul tic d'une seconde du chemin appartient à un composant `memo` qui ne remonte pas. Trois changements d'état par révélation, ≈ 1,1 ms pour vingt rangées visibles, moins de 7 % du budget d'une image. **Une objection de performance formulée en prose se vérifie avant d'être contournée** : ici, la contourner aurait coûté un registre hors rendu pour économiser 1,1 ms.

> **Quand une loi vaut pour N surfaces, l'assertion doit être posée N fois, par la MÊME table.** Une table de cas (`describe.each(PEAUX)`) fait tomber la divergence au premier passage ; N témoins écrits séparément encodent chacun l'état de SA surface, et la divergence devient invisible — pire, elle devient *gardée*. Corollaire : un témoin qui ne joue qu'une peau ne prouve rien sur la cohérence entre peaux, et c'est précisément la dimension 6 qu'on croit couvrir en l'écrivant.
