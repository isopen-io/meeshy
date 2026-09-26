## Leçon 45 — présence : le court-circuit modérateur batch bypassait la désactivation, divergeant du chemin single-target (2026-07-08, routine messaging, iter 144)

`PresenceVisibilityService` a DEUX chemins qui doivent rendre le même verdict (SSOT = helper pur
`resolvePresenceVisibility`, `packages/shared/utils/presence-visibility.ts`) : `resolveForTarget` (profil unique)
et `resolveForTargets` (batch, consommé par `/users/presence` + recherche). Le helper pur place
`targetIsDeactivated || isBlockedEitherWay → HIDDEN` **avant** le check de privilège `isSelf || isGlobalModerator`
(invariant design §8 : « Compte désactivé → présence masquée **en amont** »).

`resolveForTarget` respecte l'invariant : `if (target.deactivatedAt) return HIDDEN;` est la TOUTE PREMIÈRE ligne,
donc un modérateur regardant un compte désactivé voit HIDDEN. Mais `resolveForTargets` court-circuitait les
modérateurs AVANT même de charger `deactivatedAt` :
```ts
if (viewer && isGlobalModerator(viewer.role)) {
  for (const id of uniqueIds) result.set(id, FULL);   // désactivés → FULL, fuite
  return result;
}
const targetRows = await prisma.user.findMany({ ... select: { deactivatedAt: true } }); // trop tard
```
**Scénario de fuite** : un modérateur parcourant une LISTE de présence voyait `showOnline/showLastSeen = true`
pour un compte désactivé, alors que la vue PROFIL unique du même compte masquait correctement (last-seen d'un
compte désactivé exposé). Divergence directe entre les deux chemins d'un même SSOT.

**Fix** : remonter le fetch `deactivatedAt` (un seul `findMany` batché, pas une requête par-id) AVANT le
court-circuit modérateur, et y masquer les cibles désactivées : `result.set(id, deactivated.has(id) ? HIDDEN : FULL)`.
Aligne le batch sur `resolveForTarget` et sur le helper pur. Le check block-pour-modérateur reste inchangé
(les deux chemins concordent déjà — `resolveForTarget` retourne FULL avant le check block pour un modérateur ;
§4.2 « pas de requête » l'assume ; pas de divergence interne, donc hors scope de ce correctif conservateur).
Test RED ajouté : `resolveForTargets(moderator, [désactivé]) → HIDDEN` (échouait FULL avant, vert après ;
16/16 suite service + 49/49 sur 6 suites présence + 22/22 communities members).

**Règle réutilisable** : quand deux méthodes d'un même service (unique vs batch) doivent partager un SSOT, un
court-circuit « fast-path » (privilège, cache, rôle) placé AVANT de charger un flag de garde (désactivation,
blocage, suppression) va bypasser ce flag sur ce seul chemin. Signature du bug : la méthode single-target teste
le flag en PREMIER, mais la méthode batch teste le privilège en premier et ne charge le flag qu'ensuite. Vérifier
que TOUT fast-path d'un chemin batch charge et honore les mêmes gardes « en amont » que son jumeau single-target —
sinon la liste fuite ce que le détail masque.
