# Iteration 182 — `CommentReactionHandler` : le garde de visibilité `_canUserViewPost` est du code mort (jamais appelé) → fuite de confidentialité + écriture non autorisée sur commentaires de posts privés

## Protocole (démarrage)
`main` @ `61d9881` (derniers merges : #2094 android/calls dark-frame, #2075
android/status unreacted, itér. 181 = #2057 gateway/device-locale bounded cache).
Branche `claude/brave-archimedes-9dtosz` réinitialisée sur `origin/main`. Ce
cycle prend **182**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared/web). Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur la surface socket gateway — la famille de handlers
de réactions sociales (`CommentReactionHandler`, `PostReactionHandler`,
`AttachmentReactionHandler`) est l'ajout serveur récent le plus directement
testable. Prérequis de test CI reproduits localement (`prisma generate` +
`shared build`) : `deviceLocale.test.ts` 17/17 vert → harnais confirmé.

## Current state
`services/gateway/src/socketio/handlers/CommentReactionHandler.ts` gère les
réactions emoji sur les commentaires de posts via 3 handlers socket publics :
`handleAddReaction` (72), `handleRemoveReaction` (172), `handleRequestSync` (262).

Le fichier **importe** le garde de visibilité et **déclare** un wrapper privé :

```ts
import { canUserViewPost } from '../../services/posts/postVisibility.js';   // ligne 29
// ...
private async _canUserViewPost(                                            // ligne 358
  post: { authorId; visibility; visibilityUserIds },
  userId: string
): Promise<boolean> {
  return canUserViewPost(this.prisma, post, userId);
}
```

**Mais ni `_canUserViewPost` ni `canUserViewPost` ne sont jamais appelés** dans
les trois handlers (confirmé par grep : les seules occurrences sont l'import
ligne 29, la déclaration ligne 358 et la délégation interne ligne 366). Le garde
est du **code mort** : écrit puis jamais branché.

Preuve corroborante : le fichier de test `CommentReactionHandler.test.ts` **mocke
déjà** `canUserViewPost` (lignes 51-53, `mockResolvedValue(true)`) — un « mock
mort » qui reflète le code mort, signe que le garde était bien prévu comme
frontière d'autorisation du handler.

Le sibling `PostReactionHandler.handleJoinPost` (397-401) applique exactement ce
garde : `findUnique` du post → `canUserViewPost` → `Forbidden` si refusé.
`CommentReactionHandler` est le seul de la famille à importer/déclarer le garde
puis à le laisser tomber, **et il n'a pas de garde de jonction propre** (il ne
fait qu'émettre vers `ROOMS.post(...)`, la jonction étant gérée dans
`PostReactionHandler`) — donc rien dans son flux n'applique la visibilité.

## Problems identified
1. **Fuite de confidentialité (lecture) — `handleRequestSync`.** Un utilisateur
   enregistré U **non autorisé** à voir un post P (P en `FRIENDS`/`ONLY`/`PRIVATE`
   et U n'est ni auteur, ni ami, ni dans `visibilityUserIds`) peut émettre
   `comment:request-sync` avec un `commentId` d'un commentaire de P. Le handler
   appelle `getCommentReactions` qui renvoie l'agrégation complète **incluant
   l'identité de chaque réacteur** (`CommentReactionService.getCommentReactions`
   → `userIds.push(reaction.userId)`, `users: agg.userIds.map(...)`). U énumère
   ainsi qui a interagi sur un commentaire d'un post privé.
2. **Écriture non autorisée — `handleAddReaction` / `handleRemoveReaction`.** Le
   même U peut ajouter/retirer une réaction sur un commentaire de P.
   `CommentReactionService.addReaction` ne valide que l'existence du commentaire
   (aucune vérification de `visibility` nulle part dans le service). U écrit donc
   dans les données d'un post qu'il n'a pas le droit de voir.
3. **Post autoritatif ambigu.** Les payloads add/remove portent un `postId`
   **fourni par le client**. Faire confiance à ce `postId` pour le garde
   permettrait une attaque de substitution (annoncer un `postId` public tout en
   ciblant le `commentId` d'un post privé). Le post autoritatif doit être résolu
   depuis le `commentId` (relation `PostComment.post`), jamais depuis le client.

## Root cause
Le garde a été écrit (import + wrapper privé + mock de test) mais l'étape de
câblage dans les trois handlers a été omise — un « TODO invisible » : le code
compile, les tests passent (le mock renvoie `true`), et l'absence d'appel ne
déclenche aucune alerte statique. La frontière d'autorisation reste donc ouverte.

## Business / Technical impact
- **Sécurité / confidentialité** : fuite de l'identité des réacteurs sur des
  posts privés (stories `FRIENDS`/`ONLY`) + écriture non autorisée. Frontière de
  confiance socket non gardée sur une fonctionnalité sociale récente.
- **Cohérence** : divergence avec `PostReactionHandler` (gardé) et
  `AttachmentReactionHandler` (garde IDOR explicite) — la famille de handlers doit
  appliquer la même règle « on n'interagit qu'avec le contenu qu'on peut voir ».
- **Dette** : code mort + mock mort qui masquent l'intention et donnent une
  fausse impression de protection à la relecture.

## Risk assessment
Faible. Le correctif **ajoute** une garde (défense en profondeur) sans modifier
les chemins nominaux : un utilisateur autorisé (auteur, ami, PUBLIC, membre de
`visibilityUserIds`) voit `canUserViewPost → true` et le flux est identique à
aujourd'hui. Le seul changement de comportement observable concerne un
utilisateur **non autorisé**, qui reçoit désormais `Forbidden` au lieu de
réussir — c'est précisément la correction voulue. Aucune signature publique
modifiée. Le garde résout le post depuis le `commentId` (autoritatif) et traite
un commentaire dont le post est supprimé/introuvable comme non visible (parité
`PostReactionHandler` qui rejette `deletedAt !== null`).

Décision de portée : **les trois handlers sont gardés** (add, remove, sync), pas
seulement add/sync. La frontière d'autorisation « interagir ⊆ voir » doit être
cohérente ; un garde partiel laisserait `remove` spammable sur des posts privés
et rendrait le handler incohérent. L'effet de bord théorique (un réacteur ayant
perdu l'accès au post ne peut plus retirer sa réaction) est négligeable — il ne
voit de toute façon plus le commentaire côté client — et acceptable au regard de
la cohérence de la frontière.

## Proposed improvements / Correctif (TDD)
- **RED** : +N tests (`CommentReactionHandler.test.ts`) — pour chacun des trois
  handlers : (a) refus `Forbidden` quand `canUserViewPost → false`, sans appel au
  service de réaction ; (b) refus `Comment not found` quand le post du commentaire
  est absent/supprimé. + mise à jour de `makePrisma` pour que
  `postComment.findUnique` renvoie un `post` par défaut (visible), sinon les
  happy-paths existants échoueraient sur le nouveau garde.
- **GREEN** : 1 helper privé `_assertCommentPostViewable(commentId, userId)` qui
  résout `PostComment.post` (`authorId, visibility, visibilityUserIds, deletedAt`)
  depuis le `commentId`, rejette post absent/supprimé (`Comment not found`) puis
  délègue à `_canUserViewPost` (`Forbidden` si refusé). Branché dans les trois
  handlers après le rate-limit, avant l'appel service — mirror strict de
  `PostReactionHandler.handleJoinPost`. `_canUserViewPost` cesse d'être du code
  mort (il est désormais l'unique point d'appel du garde).

## Expected benefits
- Fermeture d'une fuite de confidentialité + d'une écriture non autorisée sur une
  fonctionnalité sociale récente (Priorité 1).
- Frontière d'autorisation « interagir ⊆ voir » homogène dans toute la famille
  de handlers de réactions.
- Suppression du code mort / mock mort : l'intention devient exécutable et
  couverte par des tests de refus.

## Implementation complexity
Faible — 1 helper privé + 3 points d'appel dans un seul fichier déjà couvert par
tests, réutilisant un garde (`canUserViewPost`) et un wrapper (`_canUserViewPost`)
déjà présents.

## Validation criteria
- `services/gateway` : `CommentReactionHandler.test.ts` vert (nouveaux tests de
  refus + tous les préexistants inchangés).
- `tsc --noEmit` (`type-check`) : 0 nouvelle erreur sur les lignes touchées.

## Backlog (candidats consignés pour une itération future)
- **PostReactionHandler add/sync non gardés** (candidat #2 de la revue) :
  `handleAddReaction` (127) et `handleRequestSync` (311) ne gardent pas la
  visibilité ; seul `handleJoinPost` (397) le fait. À la différence de
  `CommentReactionHandler`, aucun code mort n'y signale une intention abandonnée —
  possible que le contrat produit garde volontairement la *souscription* (join)
  plutôt que l'*action*. À trancher par une analyse dédiée avant modification.
- **Recherche in-conversation : cap dur à 200 sur `translationCandidates`**
  (`routes/conversations/messages.ts:2581-2601`) : les hits en traduction seule
  plus anciens que les 200 plus récents ne remontent pas et ne sont pas reflétés
  dans le curseur. Correctif = modèle de pagination, pas un one-liner — hors
  périmètre d'un cycle ciblé.
