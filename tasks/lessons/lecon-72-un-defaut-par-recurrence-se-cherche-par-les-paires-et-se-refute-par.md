## Leçon 72 — Un défaut par récurrence se cherche par les paires, et se réfute par ses faux positifs (2026-08-10, routine messaging, cycle 51)

La piste héritée du cycle 50 était juste, et la leçon 18 imposait quand même de la réfuter d'abord.
La réfutation n'a pas consisté à revérifier que le défaut existe — ça, un `grep` le montre en dix
secondes — mais à chercher **le cas qui rendrait le correctif faux**. Trois candidats, cherchés
nommément avant la première ligne de code :

1. une notification dont la clé de filtre désigne un AUTRE objet que celui qu'elle concerne
   (`post_repost` porte `context.postId = originalPostId` et le repost dans `metadata.repostId` — il
   allait dans le bon sens, mais rien ne le garantissait a priori) ;
2. une notification ancrée sur l'objet supprimé dont la cible vivante est ailleurs ;
3. une notification créée PAR le retrait, qui serait emportée par lui.

Aucun n'existait, et c'est ce constat — pas le diagnostic — qui a autorisé un filtre sans
distinction par `type`. **Le coût de la réfutation est le prix du filtre large** : sans elle, la
seule écriture prudente aurait été une liste de types en dur, c'est-à-dire une quatrième chose à
tenir à jour de mémoire.

Contrepartie à retenir : au cycle 18, la même démarche avait au contraire INVALIDÉ le correctif
suggéré. Les deux issues sont normales ; ce qui ne l'est pas, c'est de sauter l'étape parce que la
piste vient d'un cycle qui, lui, avait raison sur le défaut.
