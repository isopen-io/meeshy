## Un double ad-hoc ment aussi par ce qu'il REFUSE

**Date** : 2026-11-21. **Lot** : #20209 (cycle 204 de la routine temps réel).
**Jumelle de** : « un double Prisma qui rend `[]` rend tout témoin de contenu
trivialement vert » et « un double ment aussi par ce qu'il ACCEPTE ».

**Le constat**

`salons-actifs-19541.test.ts` montait la vraie route sur un vrai Fastify, avec
un double écrit à la main dont le cœur était :

```ts
const matchesRow = (row, filter) =>
  Object.entries(filter).every(([k, v]) => row[k] === v);
```

Une égalité STRICTE, clé par clé. Elle ne sait exprimer **aucune** forme de la
loi du dépôt — ni `OR`, ni `{ isSet: false }`, ni `AND`. Devant
`...PARTICIPATION_VIVANTE`, elle évalue `row['OR'] === [...]`, donc
`undefined === [...]`, donc **false** : le resserrement faisait disparaître
TOUTES les lignes, et quatre témoins rougissaient sur un correctif juste.

**La règle**

> Le dépôt sait qu'un double ment par ce qu'il RÉPOND (`[]` rend tout vert) et
> par ce qu'il ACCEPTE (un argument impossible que la production refuserait).
> **Il mente aussi par ce qu'il REFUSE** — et cette forme est la plus
> retorse, parce qu'elle ne produit pas un faux VERT : elle produit un faux
> ROUGE, sur le correctif, au moment où on le livre. Son auteur conclut que le
> correctif est mauvais.

Un faux vert se découvre tôt ou tard par un incident. **Un faux rouge se
découvre en abandonnant le correctif** — et personne n'écrit un journal pour
dire « j'ai renoncé parce qu'un test s'y opposait ».

**Le remède, et c'est une règle de dépôt, pas un goût**

La sémantique d'un `where` a UN exemplaire : `matchesMongoWhere`
(`__tests__/helpers/mongo-where.ts`). Elle traverse les filtres de relation
(`some` / `every` / `none`), implémente `isSet`, et sait qu'un champ **ABSENT
n'est pas un champ à `null`** — ce dont la garde `bannedAt` dépend entièrement.
Toute égalité de `where` écrite à la main dans un test est une jumelle libre de
diverger de la loi qu'elle prétend exercer.

**Le second défaut du même témoin, et il était PIRE**

Son nom promettait « ne sert ni le salon quitté ou **banni** ». Sa fixture
disait :

```ts
// le lecteur l'a quitté (ou en a été banni : même écriture, `isActive: false`)
```

Vrai du chemin NOMINAL depuis #19688 ; **faux des lignes héritées d'avant
#10436**, celles pour lesquelles la loi existe. Le témoin modélisait le salon
QUITTÉ et l'appelait banni.

> **Un témoin qui NOMME un état dans son intitulé affirme qu'il le modélise.**
> Celui-ci a tenu une porte ouverte en déclarant la garder, et son nom est
> précisément ce qui a dissuadé de la relire. Devant un témoin dont le titre
> couvre deux cas, vérifier qu'il y a bien **deux fixtures**.

**Et la famille de la cause**

Le lot est né d'un critère de ROUGE qui a échoué : #20155 exigeait qu'un seul
balayage nomme #20104, #20135 et #20136. Ils relèvent de **trois genres
différents** de « porte keyée sur l'appelant » (clause / prédicat / propriété),
auxquels ce lot a ajouté un quatrième (filtre de relation).

> **Un critère de fin est une affirmation comme une autre** : « sa preuve de
> ROUGE doit nommer les trois » supposait qu'ils étaient de la même espèce. On
> l'apprend en essayant de le tenir, pas en le relisant.

**Détail**

`tasks/realtime-sync-audit-2026-11-21-cycle204-20209.md`.
