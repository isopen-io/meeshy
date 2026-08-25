# Itération 264 — Analyse

## Priorité
Priorité 1 (dette exposée par un cycle récent). Candidat nommé explicitement en
« Future improvements » de l'itération 263 (`2026-08-24-iteration-263-analyse.md`).

## Current state
Le garde-fou du plafond de réactions (« max 5 réactions différentes par personne
sur un objet ») est appliqué VERBATIM dans **cinq** services voisins du gateway :

| Service | Ligne |
|---|---|
| `ReactionService` (message) | 168 |
| `PostReactionService` (post / story / statut) | 136 |
| `CommentReactionService` (commentaire, chemin socket) | 137 |
| `AttachmentReactionService` (pièce jointe) | 57 |
| `PostCommentService.likeComment` (commentaire, fallback REST) | 589 |

Chacun écrit rigoureusement le même bloc :

```ts
if (!isReactionAllowed(existingReactionCount)) {
  throw new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED');
}
```

Le prédicat pur (`isReactionAllowed`) et le message (`REACTION_LIMIT_REACHED_MESSAGE`)
ont déjà une source unique dans `@meeshy/shared/utils/reaction-limit`. Ce qui reste
dupliqué est le **couplage prédicat → jet** : le choix de `ConflictError`, du code
`'REACTION_LIMIT_REACHED'`, et l'ordre des deux. Cinq copies synchronisées à la main.

## Problems identified
- **Duplication du site de décision.** Le prédicat est partagé mais la RÉACTION au
  prédicat (le `throw`, le type d'erreur, le code) est recopiée 5×. Le code
  `'REACTION_LIMIT_REACHED'` est une chaîne magique répétée cinq fois ; le choix de
  `ConflictError` (plutôt qu'`Error` nue, ce dont dépend le tri REST 409/500) est
  reproduit à la main partout.
- **Dérive possible.** Un sixième objet réagissable (déjà anticipé par la carte des
  modèles) recopiera le bloc ; une évolution du code d'erreur devra toucher 5 fichiers.

## Root cause
`packages/shared` ne peut pas porter le `throw` : `ConflictError` est un type
GATEWAY (`services/gateway/src/errors/custom-errors.ts`). Le shared expose donc le
prédicat pur, et chaque service a dû recomposer la traduction « prédicat faux ⇒
409 ». Il manque le maillon gateway qui relie le prédicat partagé au jet partagé.

## Business / technical impact
- **Technique.** Faible sévérité fonctionnelle (comportement correct partout), mais
  dette de maintenabilité classée « miroir exact de `assertValidObjectId` » par
  l'itération 263. Homogénéité : le dépôt a DÉJÀ résolu la même forme pour les
  ObjectId (`utils/object-id.ts`) — ce garde manque à l'appel.
- **Produit.** Aucun changement de comportement visible.

## Risk assessment
- **Très faible.** Refactor behavior-preserving pur : même type d'erreur, même code,
  même message, même prédicat. Les 5 sites conservent leur commentaire de contexte
  (routage 409) — seule la ligne du `if/throw` est remplacée par un appel.
- **Rollback :** revert du commit unique.

## Proposed improvements (implémenté)
1. **Créer `services/gateway/src/utils/reaction-limit-guard.ts`** exportant
   `assertReactionAllowed(existingReactionCount: number): void`, qui consomme le
   prédicat + le message partagés et jette `ConflictError(msg, 'REACTION_LIMIT_REACHED')`.
   Miroir exact de `utils/object-id.ts` (le prédicat vit en shared, le jet vit au
   gateway).
2. **Remplacer les 5 blocs `if (!isReactionAllowed(...)) { throw ... }`** par
   `assertReactionAllowed(existingReactionCount);`.
3. **Nettoyer les imports** : chaque service n'importe plus `isReactionAllowed` ni
   `REACTION_LIMIT_REACHED_MESSAGE` (sauf usage résiduel — vérifié : aucun),
   et `ConflictError` reste importé s'il sert ailleurs dans le fichier.

## Expected benefits
- Le couplage « plafond atteint ⇒ 409 REACTION_LIMIT_REACHED » a un domicile unique.
- Un sixième objet réagissable appelle une fonction au lieu de recopier un bloc.
- Le code magique `'REACTION_LIMIT_REACHED'` disparaît des services.

## Implementation complexity
**Faible.** 1 fichier neuf (feuille), 5 fichiers de service (remplacement d'un bloc
+ ménage d'imports), 1 fichier de test neuf.

## Validation criteria
- [x] RED prouvé : test du garde échoue avant que le module existe
      (`Cannot find module '../reaction-limit-guard'`).
- [x] GREEN : `reaction-limit-guard.test.ts` 4/4 (does-not-throw < 5, throws à 5,
      throws > 5, code + statusCode + message corrects).
- [x] Les 5 services : `tsc --noEmit` (gateway) 0 erreur.
- [x] Suites de réaction existantes inchangées : 13 suites / 340 tests verts
      (`reaction-limit-guard`, `ReactionService`, `PostReactionService`,
      `CommentReactionService`, `AttachmentReactionService`, `PostCommentService`).
- [ ] CI verte sur la PR.
# Itération 264 — Analyse : `decodeCursor` validait la VÉRACITÉ, jamais le TYPE

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
