## Une expression régulière sur un `where` ne voit ni la PORTÉE ni la POLARITÉ (cycle 195, #20100)

Les deux discriminants du cliquet des audiences lisaient le texte ENTIER du
`where`. L'audit adversarial a mesuré ce que ça leur coûtait, **dans les deux
sens**, et chaque sens a sa propre forme de dégât :

**Faux VERT.** `spellsTheLaw` cherchait `bannedAt: null` n'importe où. Donc
`{ isActive: true, NOT: { bannedAt: null } }` — une audience composée
EXCLUSIVEMENT de bannis — était déclarée conforme à la loi qui existe pour les
exclure, et `OR: [{ bannedAt: null }, { role: 'creator' }]` laissait passer un
créateur banni. #20091 avait fermé la polarité d'une troisième orthographe
(`bannedAt: { not: null }`) en croyant fermer la classe.

**Disparition SILENCIEUSE.** `namesAParticularMember` n'admettait `{ not: … }`
que sous la forme `{ not: null }`. Hors de vue : `{ notIn: … }`,
`NOT: { userId }`, `{ not: { in: … } }`, les opérateurs de PLAGE — un curseur de
pagination `{ gt: … }` faisait passer une audience entière pour une porte — et
toute clé *commençant* par `id`/`userId` faute de frontière de mot
(`idempotencyKey:`). Quatre audiences réelles en sont sorties, dont l'éventail de
« X a rejoint » et l'élection du successeur d'un créateur, où un banni-mais-actif
est éligible.

> **La portée (à quel NIVEAU la clause est-elle posée ?) et la polarité (dans
> quel SENS ?) sont exactement les deux choses qu'une expression régulière ne
> peut pas voir — et les deux qui décident du verdict.** Un `where` n'est pas une
> chaîne, c'est un arbre ; le lire comme une chaîne rend un verdict sur la
> présence d'un MOT.

Remède, et il tient en trois décisions :

1. **Les paires de PREMIER NIVEAU**, pas le texte. Un petit parcours à
   profondeur suffit, et il rend les deux discriminants lisibles.
2. **Les combinateurs se traversent, `NOT` non.** `AND` et `OR` habillent une
   clause sans changer son niveau — et l'idiome que le dépôt PRESCRIT pour
   désigner un lecteur sous ses deux colonnes (`OR: [{ id: clé }, { userId: clé }]`)
   vit précisément là. La traversée s'arrête avant les filtres de RELATION : un
   `userId` dans `conversation: { participants: { some: … } }` ne désigne pas le
   membre lu, et l'y lire transformerait une audience en porte — l'erreur
   inverse, aussi coûteuse.
3. **La garde se reconnaît par une LISTE BLANCHE de formes**, jamais par son
   mot-clé. C'est le bon sens d'erreur, et le fichier l'écrivait déjà de son
   autre discriminant : « un cliquet qui sur-signale coûte une relecture ; un
   cliquet qui se trompe sur un site juste coûte sa crédibilité ».

### Corollaire : une propriété énoncée en général, implémentée en particulier

« Aucune forme négative ne SÉLECTIONNE » est vrai, et c'était écrit comme une
propriété générale dans la décision ET dans le `CLAUDE.md`. Le code n'en couvrait
qu'une orthographe. **Une règle énoncée plus largement que son implémentation ne
se relit pas comme un écart : elle se relit comme la règle.** La question à poser
à toute propriété générale écrite à côté d'un prédicat est *combien de formes la
propriété admet-elle, et combien le prédicat en reconnaît-il ?* — et elle se
répond en plantant les autres formes dans le balayage pour voir ce qu'il en dit.
