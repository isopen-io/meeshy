## Un motif de test est une affirmation sur le MOTIF, jamais sur le dépôt (cycle 192, #20050)

Mon commit annonçait, en toutes lettres : « Gates : 34 suites / 603 témoins
verts autour de la loi ; `tsc --noEmit` à 0 ; cliquets de taille verts ». Les
trois chiffres étaient VRAIS. Le lot cassait pourtant **deux suites**, dont un
cliquet de SÉCURITÉ, et c'est l'audit adversarial qui les a trouvées.

Les deux étaient hors du motif :

```bash
bun run test -- --testPathPatterns "(live-audience|liveAudience|translationReaders|…)"
```

J'avais composé ce motif à partir des fichiers que je TOUCHAIS et des lois que
je connaissais autour d'eux. Les deux suites cassées ne portent ni le nom de ces
fichiers ni celui de ces lois : l'une garde une distinction de source
(`conversation-audience-living-participation`), l'autre atteste un enfilage hors
ligne (`AttachmentReactionHandler`). Elles ne pouvaient pas être dans un motif
dérivé de ce que je croyais être le périmètre — **par construction, un motif
mesure ce qu'on savait déjà chercher.**

> C'est la leçon 261 appliquée à une COMMANDE au lieu d'une liste de sites : un
> motif de test porte deux affirmations — « ces suites passent » (vérifiable) et
> « ce sont les suites que ce lot peut casser » (presque jamais vérifiée, et
> fausse dès que le lot déplace une abstraction).

### La règle

**La suite COMPLÈTE avant toute PR, et avant toute fusion.** Un motif sert
pendant la boucle rouge-vert, où il fait gagner des minutes ; il ne sert pas de
preuve. Sur ce dépôt, la suite complète du gateway coûte quelques minutes et
2 963 suites.

Et le rapport se lit en NOMMANT ce qui reste rouge : six suites de ce dépôt
échouent dans un conteneur sans `heif-convert` ni support AVIF de `sharp`
(`ExifStrip.*`, `*heif-conversion`, `avif-variants`). Les connaître par leur nom
est ce qui permet de dire « ces six-là sont environnementales » sans que la
phrase serve de tapis à autre chose.

### Pourquoi le réflexe inverse est tentant

Un motif qui rend 34 suites vertes en trois secondes DONNE l'impression d'une
mesure plus fine qu'une suite complète — on a choisi les suites pertinentes,
donc on a réfléchi. C'est l'inverse : la suite complète ne demande aucun
jugement, et c'est précisément ce qui la rend fiable. **Là où une mesure dépend
de ce que j'ai anticipé, elle ne peut pas me contredire.**
