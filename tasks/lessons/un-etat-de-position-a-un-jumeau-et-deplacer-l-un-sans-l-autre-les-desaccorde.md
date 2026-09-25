## Un état de position a un JUMEAU, et déplacer l'un sans l'autre les désaccorde (itération 266)

`DoubleRatchet.skipMessageKeys` avançait la clé de chaîne de réception
(`chainKeyReceive`) de la position courante jusqu'à `until` — mais n'écrivait la
progression que dans une variable LOCALE, jamais dans `session.messageNumberReceive`.
La clé de chaîne et le compteur décrivent la MÊME position ; les séparer suffit à
tout casser en aval. `symmetricRatchet` lit le compteur périmé pour étiqueter la
clé et poser le prochain « attendu », si bien qu'après un seul message reçu EN
AVANCE, le message ORDONNÉ suivant retombe dans la branche « en avance », re-saute
depuis un compteur périmé, et le déchiffrement GCM lève. Un accroc réseau bénin
rendait la session de réception définitivement indéchiffrable, état persisté.

> **Quand une fonction déplace un état, chercher son JUMEAU de position.** Une
> clé de chaîne a un numéro ; un curseur a une longueur ; un offset a une page.
> Le défaut ne se voit pas dans la fonction fautive — elle a l'air complète — mais
> chez le LECTEUR du jumeau resté en arrière. Le symptôme n'est pas non plus sur
> l'opération qui saute (le message en avance sort correct) : il est sur
> l'opération NOMINALE suivante, qui lit le jumeau désaccordé. Chercher le témoin
> un cran APRÈS le geste anormal.

Corollaire de méthode, hérité de l'itération 245 qui avait NOMMÉ ce défaut en
dette : **une dette différée au motif « les témoins sont hors CI » se solde
souvent sans réveiller le sous-arbre exclu.** Le code de production
`dma-interoperability/` est compilé et importable depuis `src/__tests__/unit/`,
le chemin que la CI exécute — cinq témoins `dma-*` l'empruntaient déjà. Le témoin
se pose sur le chemin qui tourne, pas sur celui qui dort ; réveiller le sous-arbre
reste un lot d'infrastructure séparé, pas un préalable au correctif.
---
