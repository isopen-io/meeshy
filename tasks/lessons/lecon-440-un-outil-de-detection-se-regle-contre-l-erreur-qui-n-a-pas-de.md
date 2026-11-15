## Leçon 440 — Un outil de détection se règle contre l'erreur qui n'a PAS de vérificateur

**Le fait (2026-09-02, #4853).** En extrayant 309 lignes de `PostDetailView.swift`,
j'ai balayé mécaniquement les membres privés dont le bloc dépendait, et ouvert les
sept trouvés. Deux erreurs opposées ont suivi, et elles n'ont pas coûté la même
chose :

| erreur | qui l'attrape | coût réel |
|---|---|---|
| **faux négatif** — `DetailMediaAuthor`, type privé que mon motif `private (func\|var\|let)` ne pouvait pas voir | le **compilateur**, immédiatement | un cycle de build, ~2 min |
| **faux positif** — `accentColor`, ouvert alors que ses deux occurrences étaient des ÉTIQUETTES d'argument (`accentColor: repost.authorColor`) | **rien** | l'encapsulation reste élargie, sans terme |

> **Le compilateur est un vérificateur GRATUIT des faux négatifs, et il n'existe
> aucun vérificateur des faux positifs.** Ouvrir un membre qui n'en avait pas
> besoin ne produit ni erreur, ni avertissement, ni test rouge : le défaut
> s'installe et personne ne le rencontrera jamais.

**Ce que ça retourne.** « Ratisser large pour ne rien manquer » est le bon réglage
quand les deux erreurs coûtent pareil — et le MAUVAIS dès qu'un vérificateur
gratuit existe d'un seul côté. Ici il fallait régler contre les faux POSITIFS,
c'est-à-dire accepter de manquer une dépendance et laisser le compilateur la
rendre.

**Le geste, généralisé** (formulation d'une session voisine, qui a vu plus loin
que le cas) :

> Avant de régler n'importe quel outil de détection — balayage, garde, linter,
> heuristique — demander : **laquelle de mes deux erreurs a déjà un
> vérificateur ?** Ici le compilateur ; ailleurs un test, un gate, un utilisateur
> qui râle. **On règle contre celle qui n'en a pas.**

**Corollaire pour nos gardes de source, dont ce dépôt écrit beaucoup** : une garde
trop STRICTE rougit et se fait corriger le jour même ; une garde trop LÂCHE passe
au vert pour toujours. C'est le même déséquilibre, et il justifie de préférer
systématiquement la garde qui risque de rougir à tort. Voisine directe de la
§ « les gardes NÉGATIVES meurent en silence » : une garde qui ne peut plus
rougir a exactement le profil de coût du faux positif d'ici — invisible et
définitive.

**Et le détail technique qui a produit le faux positif, parce qu'il se rejouera** :
dans un type, un membre s'atteint par `self` IMPLICITE, donc **sans point**.
Mesuré sur ce lot : **0 dépendance sur 7** était atteinte par `.nom`. Un filtre
« ne compter que `\.nom\b` ou `\bnom\s*\(` » — proposé de bonne foi pour réduire
les faux positifs — en aurait trouvé 2 sur 7. Ce qui marche : **effacer les
positions d'étiquette (`nom:` précédé de `(` ou `,`) AVANT de chercher le nom
nu.** Il isole le seul faux positif et garde les six vraies.

Dernière chose, sur la confiance qu'on accorde à un balayage : j'avais écrit qu'il
« retrouve seul ce qui avait été trouvé à la main ». C'était vrai et **ça ne
prouvait rien** — je lui avais donné un fichier où j'avais déjà appliqué la
correction. Un outil ne se valide pas sur un cas qu'on a préparé pour lui. Même
famille que le témoin qui doit TOMBER avant le correctif.
