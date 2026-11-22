## Un témoin de cas limite doit d'abord amener le système là où le cas SE DISTINGUE — sinon l'état neutre absorbe la différence

*(2026-11-22, #18601, cycle 213)*

### Le fait

Le web observe désormais le curseur `_seq` et doit le faire AVANT de livrer
l'événement : le curseur suit le flux SERVEUR, donc il avance même quand la
charge ne se décode pas. Sans cette règle, un bogue d'affichage coûterait une
resynchronisation à chaque événement.

Le témoin écrit pour la garder envoyait une charge MALFORMÉE estampillée 5, puis
une charge valide estampillée 6, et attendait « aucun trou ». Il passait — sous
le code juste **comme sous la mutation qui n'observe que ce que le consommateur
sait lire**. Raison : la charge malformée étant la PREMIÈRE, le curseur restait à
`null` sous la mutation, et un 6 sans `lastSeq` est un premier événement, jamais
un trou. Les deux chemins rendaient le même verdict.

Le vecteur juste commence par un événement VALIDE (4), de sorte que le curseur
est DÉJÀ parti quand la charge malformée arrive : sous le code juste, 4 → 5
(malformée, le curseur avance) → 6 est contigu ; sous la mutation, le curseur
reste à 4 et le 6 devient un trou.

### La règle

**Un cas limite ne se distingue pas dans l'état neutre.** Avant d'exercer « ce
qui se passe quand X est anormal », amener le système dans l'état où un
traitement correct de X et un traitement fautif divergent — sinon le témoin
atteste l'état initial, pas la règle.

C'est la famille de la leçon 261 (« un témoin de RANG s'écrit sur un rang AUTRE
que le premier ») généralisée : là, c'est le rang 1 qui confondait la règle juste
et le court-circuit ; ici, c'est le curseur VIDE qui confond « j'avance toujours »
et « je n'avance que sur ce que je comprends ». Dans les deux cas, l'état neutre
est un absorbeur de différence.

### Ce qui l'attrape

Rien d'autre que la MUTATION. Le témoin était vert, nommait la bonne propriété,
et son commentaire disait juste. Seule l'exécution de la mutation qu'il prétend
garder a montré qu'il ne la gardait pas — et c'est exactement ce que le dépôt
exige d'une garde neuve (« toujours prouver le ROUGE »), y compris quand elle a
l'air évidente.
