# Itération 289 — `buildCursorPaginationMeta` : `nextCursor` suit `hasMore`, plus `resultCount > 0`

Hors de la campagne « une source de vérité par langue » (saturée, ~15 PR
ouvertes) : un balayage des helpers PURS du gateway a trouvé une **jumelle
divergente** de la loi de curseur, dans le fichier même qui la porte deux fois
correctement.

## État actuel (avant ce lot)

`services/gateway/src/utils/pagination.ts`, `buildCursorPaginationMeta` :

```ts
export function buildCursorPaginationMeta(
  limit: number,
  resultCount: number,
  lastItemId: string | null
): CursorPaginationMeta {
  return {
    limit,
    hasMore: resultCount === limit,
    nextCursor: resultCount > 0 ? lastItemId : null
  };
}
```

Cette fonction compose la méta `cursorPagination` d'une liste paginée en base
(`?cursor=<lastId>&limit=<n>`). Elle est servie aux clients par
`GET /conversations` (`routes/conversations/core-list.ts:869`) et `GET /links`
(`routes/links/user.ts:626`).

## Problème identifié

`nextCursor` est conditionné à `resultCount > 0`, alors que la présence d'un
curseur doit l'être à l'existence d'une PAGE SUIVANTE (`hasMore`). Sur une page
finale PARTIELLE (`resultCount` entre 1 et `lim- 1`), la fonction rend une méta
**contradictoire** :

| appel | `hasMore` | `nextCursor` (avant) | correct |
|---|---|---|---|
| `buildCursorPaginationMeta(20, 20, 'abc')` (page pleine) | `true` | `'abc'` | `'abc'` ✓ |
| `buildCursorPaginationMeta(20, 5, 'abc')` (page finale partielle) | `false` | **`'abc'`** | `null` |
| `buildCursorPaginationMeta(20, 0, null)` (page vide) | `false` | `null` | `null` ✓ |

Un client qui pilote sa pagination sur `nextCursor` — façon normale de consommer
une API keyset — ne termine jamais sur une dernière page partielle : il émet une
requête `?cursor=abc` de plus, qui se résout en keyset sur une page VIDE. C'est
exactement l'aller-retour gaspillé que la loi canonique proscrit
(`utils/cursor-pagination.ts`, `cursorPage` : « un curseur rendu sur une page
finale invite le client à un aller-retour qui ne peut rien rapporter »,
`nextCursor: hasMore && derniere ? … : null`).

C'est aussi une **jumelle divergente DANS LE MÊME FICHIER** : la sœur
`sliceByIdCursor` (`pagination.ts:90`) rend correctement
`nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null`. Deux helpers de
curseur du même fichier appliquaient donc deux contrats.

## Cause racine

`buildCursorPaginationMeta` (helper de curseur le PLUS ANCIEN, itér. 33) n'a
jamais été réconcilié avec la règle que `sliceByIdCursor` puis le `cursorPage`
canonique (#4175) énoncent : `nextCursor` se dérive de `hasMore`, jamais du seul
compte de résultats. Dimension 11 (maintenabilité — « aucune jumelle
divergente ») et dimension 2 (performance / efficacité réseau).

## Impact métier

Un aller-retour réseau gaspillé à chaque fois qu'une liste `?cursor=` de
conversations ou de liens se termine sur une page partielle — c'est-à-dire le cas
NOMINAL de fin de pagination. Requête serveur + fan-out Prisma inutiles, latence
perçue d'un « charger plus » qui ne rapporte rien. Aucun risque de correction
d'affichage : les consommateurs web pilotent leur bouton « charger plus » sur
`hasMore` (déjà correct), pas sur la présence de `nextCursor`.

## Impact technique

Surface minimale : une fonction pure, trois lignes. Aucun schéma, aucune requête,
aucune frontière réseau. La page PLEINE (`resultCount === limit`) et la page VIDE
sont inchangées ; seule la page finale partielle change (`nextCursor` passe de
`lastItemId` à `null`).

## Évaluation du risque

Très faible. Le comportement ne change que sur la page finale partielle, dans le
sens qui SUPPRIME une contradiction (`hasMore: false` cohabitait avec un curseur
non nul). `hasMore` est inchangé — la sémantique dont dépend le web. Aucun
consommateur correct ne peut dépendre d'un `nextCursor` servi alors que
`hasMore` est faux.

## Améliorations proposées (implémentées)

- `buildCursorPaginationMeta` dérive `nextCursor` de `hasMore` (une seule
  variable locale `hasMore`), doc-comment ajouté (raison + référence aux deux
  sœurs conformes).
- Trois témoins ajoutés (`__tests__/unit/utils/pagination.test.ts`,
  `describe('buildCursorPaginationMeta')`) : page pleine (curseur servi), page
  finale partielle (`nextCursor` null), page vide.
- Un témoin de route corrigé (`links-user.test.ts`) qui encodait
  INCIDEMMENT l'ancien comportement (un lien unique — page finale partielle —
  attendait un curseur non nul) ; son intention réelle (SÉLECTION DE FORME :
  `cursorPagination` seul, `pagination` absent) est préservée et documentée.

## Critères de validation

- RED prouvé : le témoin « page finale partielle » échoue contre l'implémentation
  verbatim (`nextCursor: 'abc'` reçu au lieu de `null`) ; les témoins page
  pleine / page vide passent déjà (fix comportement-préservant hors page finale).
- GREEN : 18/18 sur `pagination.test.ts`.
- Régression : `conversation-core` + `messages-routes` (426/426), `links-user`
  (36/36), `attachment-search` + `conversation-wire-fields`, `conversations.bridge`
  + `conversation-receipts` (44/44) — tous verts.
- `tsc --noEmit` du gateway : EXIT=0.
