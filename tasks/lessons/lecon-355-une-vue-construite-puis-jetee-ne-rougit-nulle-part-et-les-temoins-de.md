## Leçon 355 — Une vue CONSTRUITE puis JETÉE ne rougit nulle part, et les témoins de sa feature restent verts

**Le fait.** `MeeshyComposerHost.sceneMentionStrip` rend `AnyView?`. Son corps montait
`ComposerMentionStrip` dans un `if let` — **sans `return`**. Dans un accesseur à corps
MULTIPLE, une expression nue n'est pas la valeur rendue : le `return nil` du bas gagnait
toujours. La bande de suggestions `@` d'un texte de scène, livrée la veille par
`bb3f3deafb` avec ses témoins, **n'a jamais pu paraître sur aucun chemin**.

**Pourquoi ça survit à une livraison complète.** Le défaut est silencieux de trois façons,
et chacune neutralise un garde-fou DIFFÉRENT — c'est leur conjonction qui le rend cher,
pas l'une d'elles :

| garde-fou | pourquoi il ne voit rien |
|---|---|
| le compilateur | il le DIT (`result of 'AnyView' initializer is unused`) — et un avertissement dans un build vert, parmi des centaines, ne se lit pas |
| les témoins de la feature | ils éprouvent le contrôleur, la requête active, le filtrage des suggestions : tout ce qui **nourrit** la bande. Aucun ne demande si elle est **montée** |
| l'œil, au simulateur | une bande absente ressemble à une bande qui n'a rien à dire — c'est exactement ce que la loi 8 prescrit par ailleurs |

> **La question qu'un témoin de feature ne pose jamais est « la vue que je viens de nourrir
> est-elle MONTÉE ? »** C'est la loi 8 de `BOUCLE.md` — « un effet déclaré doit être monté »,
> écrite pour les overlays du canvas (`EffectOverlayMountingSourceGuardTests`) — portée aux
> accesseurs de vue OPTIONNELLE. La forme est la même : le plan de lecture est juste, le
> code compile, et rien n'atteint le pixel.

**La parade.** `OptionalViewReturnGuardTests` : dans tout accesseur `var … : AnyView? {`,
une ligne dont le contenu commence par `AnyView(` sans `return` est un rouge. Syntaxique,
et c'est voulu — elle n'a pas besoin de savoir ce que la vue fait, seulement qu'on ne la
laisse pas tomber.

**Deux précautions de garde, apprises ailleurs et appliquées ici.**
- La garde a été vérifiée **ROUGE sur le contenu pré-correctif** (`git show HEAD:<chemin>`,
  rejoué en Python), jamais seulement verte après. Une garde positive peut naître déjà morte.
- Elle porte un **fusible de population** : elle compte les accesseurs trouvés et les
  `return AnyView(` reconnus. Un découpage de blocs qui cesserait de rendre les corps la
  rendrait verte en ne regardant rien.

**Le découpage compte les accolades depuis l'ouverture de l'accesseur**, jamais une
expression régulière sur tout le fichier : la garde voisine `RiverTypingIndicatorTests` a
été trouvée le même jour en train d'accuser un site INNOCENT, parce que son extracteur
prenait `firstIndex(of: "(")` sur le reste du fichier et attrapait, depuis une ANNOTATION
DE TYPE, la parenthèse d'un appel quatre-vingt-dix lignes plus bas. Une garde qui accuse
un innocent se fait désactiver plutôt que corriger — c'est son mode de panne le plus cher.
