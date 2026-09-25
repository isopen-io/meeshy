## 2026-08-07 (2) — Un test qui construit lui-même le DOM peut construire un DOM qui n'existe pas

Le suivi de lecture exact du web n'observait aucune bulle montée après l'ouverture de la
conversation : `MutationObserver` rapporte la RACINE de chaque mutation, or la liste
enveloppe chaque bulle dans un `<div key>` sans `id`. La condition `node.id.startsWith('message-')`
ne pouvait jamais matcher en production — mais elle matchait dans les tests, qui inséraient
la bulle en nœud DIRECT.

**Leçons :**
1. **Un test qui fabrique son propre DOM doit fabriquer celui du composant réel.** Le test
   « observes a bubble mounted later by the virtualizer » passait sur `addedNodes: [bubble]`,
   forme que `messages-display.tsx` ne produit jamais (il insère `<div key><BubbleMessage/></div>`).
   Règle : avant d'écrire un fixture DOM, ouvrir le composant qui rend l'arbre et copier sa
   forme — wrappers compris. Variante DOM de la leçon 2026-08-03 #2.
2. **`MutationObserver` rapporte la racine de la mutation, pas les nœuds qui vous intéressent.**
   Tout `addedNodes/removedNodes` qui cherche un descendant doit descendre (`querySelectorAll`
   sur le nœud, plus le test du nœud lui-même). Le pendant `querySelectorAll` du montage
   descendait, lui — l'incohérence entre les deux chemins d'un même hook était le signal.
3. **Un observateur branché au mauvais niveau produit deux symptômes OPPOSÉS, pas un.** Ici :
   aucune lecture rapportée pour les messages arrivés après coup ET des messages jamais
   affichés déclarés lus (pas de `disappeared` au démontage). Voir un seul des deux
   symptômes et le corriger localement aurait manqué la racine.
