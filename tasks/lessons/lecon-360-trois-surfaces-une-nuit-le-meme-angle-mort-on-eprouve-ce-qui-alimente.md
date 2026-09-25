## Leçon 360 — Trois surfaces, une nuit, le même angle mort : on éprouve ce qui ALIMENTE et ce qui DÉCIDE, jamais ce qui est POSÉ

*(Sa jumelle d'échelle est la [leçon 361](#leçon-361) : la question « est-ce POSÉ ? » a une
couche au-dessus d'elle — « quelle SURFACE est posée ? ».)*

**Le fait.** Le 2026-08-31, trois features du composer sans aucun rapport entre elles ont
été livrées avec leurs témoins au vert et n'atteignaient l'écran d'aucune façon. Les trois
défauts sont différents ; leur FORME est la même.

| surface | la règle | le défaut | ce qui l'aurait attrapé |
|---|---|---|---|
| bande de mentions `@` | juste | la vue était **construite puis jetée** (`if let` sans `return` dans un accesseur `AnyView?`) | une garde syntaxique sur les accesseurs de vue optionnelle |
| letterbox ThumbHash | juste, 16 témoins | sa **seule source n'existe qu'à la publication** — inerte pendant toute la composition | une suite qui monte le `CALayer` et demande s'il a des pixels |
| rangée de jetons `1c` | juste, 15 témoins | la **condition de montage ne pouvait pas devenir vraie** (`toolOptions == nil` sur un panneau passé inconditionnellement) | une règle `isServed(…)` posée sur ce qui SAIT, éprouvable sans vue |

> **Un témoin de feature interroge presque toujours deux choses — ce qui alimente la vue et
> ce qui la décide — et presque jamais la troisième : ce qui la POSE.** Les trois questions
> sont indépendantes, et la troisième est la seule dont l'échec ressemble à un
> fonctionnement normal : une bande absente ressemble à une bande qui n'a rien à dire, ce
> que la loi 8 prescrit par ailleurs.

**Les trois questions, dans l'ordre où il faut les poser** (elles prolongent les quatre du
Prisme — bon rang ? qui l'affiche ? que transporte-t-il à côté ? a-t-il le droit d'être
là ?) :

1. **Qui l'ALIMENTE, et à quel MOMENT du cycle de vie ?** Une source née après un jalon
   (publication, upload, synchro) est absente de tout ce qui précède — et un test unitaire
   ne le voit jamais, puisqu'il fournit la donnée lui-même.
2. **Qui la DÉCIDE ?** La règle, éprouvée hors de toute vue.
3. **Qui la POSE, et cette condition peut-elle seulement devenir vraie ?** C'est ici que
   `toolOptions == nil` a échoué — le sous-cas le plus vicieux étant **une condition dont
   l'input est une valeur toujours présente**. Une vue qui existe toujours ne témoigne de
   rien.

**Corollaire de forme.** Une condition de montage écrite dans un `body` n'est interrogeable
par aucun témoin. Sortie en règle — `isServed(toolIsOpen:chips:)` — elle le devient, et sa
SIGNATURE dit ce qu'elle interroge : c'est en écrivant `toolIsOpen: Bool` plutôt que
`toolOptions: AnyView?` qu'on s'aperçoit qu'on n'avait pas la bonne source.

**Corollaire de méthode.** Aucune de ces trois n'a été trouvée par un gate ; les trois l'ont
été **en regardant l'écran**. La loi 5 (« la fin se prouve, capture à l'appui ») n'est pas
une formalité de clôture : c'est le seul instrument qui pose la troisième question.
