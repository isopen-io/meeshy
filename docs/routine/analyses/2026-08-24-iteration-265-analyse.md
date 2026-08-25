# Itération 265 — Analyse : `decodeCursor` validait la VÉRACITÉ, jamais le TYPE

## État courant

`services/gateway/src/utils/keyset-cursor.ts` est la source UNIQUE du curseur
keyset `(createdAt, id)` de toutes les listes antichronologiques du gateway
(feed de posts, commentaires, inbox de notifications). `decodeCursor(cursor)`
décode une chaîne `base64url` fournie par le client — un **paramètre de requête**
— en `CursorData | null`.

Forme antérieure du garde :

```ts
const data = JSON.parse(json);
if (data.createdAt && data.id) return data;
return null;
```

## Problèmes identifiés

1. **Aucune vérification de TYPE.** Le garde ne teste que la VÉRACITÉ des deux
   champs. Une charge dont `id` est un objet (`{ "$lt": "" }`) ou dont `createdAt`
   est un nombre passe le test.
2. **Aucune vérification que `createdAt` est DATABLE.** `createdAt: 'not-a-date'`
   est une chaîne truthy — acceptée — puis `new Date('not-a-date')` produit
   `Invalid Date`.
3. **Renvoi de `data` tel quel.** Toute clé excédentaire attaquant-contrôlée
   voyageait vers les consommateurs en aval.

## Causes racines

Le contrat de `decodeCursor` est « chaîne opaque → curseur **sûr** | null ».
Le garde d'origine confondait « les champs existent » avec « les champs ont la
forme que le consommateur suppose ». C'est la forme, à une frontière de
désérialisation, du motif récurrent du dépôt : *une entrée malformée doit valoir
le repli neutre (`null`, reprise depuis le début), jamais une exception un étage
plus bas.*

## Impact métier

Le curseur invalide n'atteint aucun client légitime (les trois clients
n'émettent que des curseurs produits par `encodeCursor`). Mais un appelant
malveillant ou un client buggé peut fabriquer le sien : `keysetBeforeClause`
remet alors la valeur à Prisma sous `{ createdAt: { lt: <Invalid Date> } }` ou
`{ id: { lt: <objet> } }` — une `PrismaClientValidationError` (ou
`Malformed ObjectID` côté moteur) → **HTTP 500** sur une entrée entièrement
contrôlée par l'appelant. Robustesse / surface de déni de service.

## Impact technique

Défaut latent transformé en chemin borné. Aucune valeur de retour légitime ne
change (round-trip `encodeCursor`→`decodeCursor` inchangé). Le durcissement est
purement additif au garde.

## Évaluation du risque

**Faible.** Un seul module, une seule fonction feuille. Onze sites l'appellent
tous derrière `cursor ? decodeCursor(cursor) : null` et traitent déjà `null`
comme « pas de curseur ». Le seul changement de comportement observable est
qu'une entrée malformée rend désormais `null` (reprise en tête) au lieu de
propager une exception — strictement une amélioration.

## Améliorations proposées (livrées)

- Vérifier `typeof createdAt === 'string' && typeof id === 'string'` et que
  `data` est un objet non-nul.
- Rejeter un `createdAt` qui ne se parse pas en date valide.
- Reconstruire `{ createdAt, id }` plutôt que renvoyer `data`, pour ne jamais
  laisser filer une clé excédentaire.

## Bénéfices attendus

- Un curseur malformé ne peut plus produire de 500.
- La sortie de `decodeCursor` est un `CursorData` strict, sans clé parasite.
- Le contrat « chaîne opaque → curseur sûr | null » est désormais tenu.

## Complexité d'implémentation

Triviale — un seul bloc de garde étendu, aucun nouveau module.

## Critères de validation

- [x] RED : 5 gardes de type/date/reconstruction tombent sur `main`.
- [x] GREEN : `types.test.ts` → 71/71.
- [x] Round-trip et consommateurs inchangés : `PostFeedService` +
      `PostCommentService` → 129/129.
- [x] `tsc --noEmit` gateway → 0 erreur.
- [x] Full gateway suite → 861/861 suites, 19574/19574 tests, exit 0.
- [ ] Commit + push.
