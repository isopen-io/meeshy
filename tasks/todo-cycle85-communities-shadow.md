# Cycle 85 — le module `routes/communities/` n'a jamais été branché

## Constat

`route-registration.ts` importe `'./routes/communities'`. Node résout LOAD_AS_FILE
avant LOAD_AS_DIRECTORY : c'est `routes/communities.ts` (64 Ko, legacy) qui sert,
et le répertoire `routes/communities/` (core, members, settings, search) est
INJOIGNABLE.

Trois scissions voisines — `users`, `voice`, `attachments` — portent toutes une
coquille de ré-export (`export { X } from './X/index'`). `communities` est la
seule à ne l'avoir jamais reçue.

Conséquence : les gates de présence posés dans `routes/communities/members.ts`,
et le témoin que le cycle 84 a écrit pour `routes/communities/search.ts`,
gouvernent du code qui ne s'exécute pas.

## Ce que sert vraiment `routes/communities.ts` (traversée du sérialiseur)

| Route | `select` | Schéma | Au fil ? |
|---|---|---|---|
| `GET /communities` | `members[].user.isOnline` | `communitySchema` sans `members` | non |
| `GET /communities/search` | idem | `members: items:{type:'object'}` nu | non (objets vides) |
| `GET /communities/:id` | idem | `communitySchema` sans `members` | non |
| `GET /communities/:id/members` | `user.isOnline`, `lastActiveAt` | `communityMemberSchema.user` = `userMinimalSchema` | **isOnline FUIT** |
| `POST /communities/:id/members` | `user.isOnline` | idem | **FUIT** |
| `POST /communities/:id/invite` | `user.isOnline` | idem | **FUIT** |
| `POST /communities/:id/join` | `user.isOnline` | idem | sert, mais la cible est le LECTEUR (self) |
| `GET /communities/:id/conversations` | `participants[].user.isOnline` | clé `members` + `user:{type:'object'}` nu | non |

`lastActiveAt` n'est pas déclaré par `userMinimalSchema` : il ne sort d'aucune
de ces portes.

## Régimes

`GET /communities/:id/members` est une porte MIXTE : le contrôle d'accès
n'interdit que les communautés PRIVÉES. Sur une communauté publique, un
non-membre liste les membres.

- lecteur membre / créateur ⇒ co-appartenance = contexte garanti ⇒ `resolvePrefsOnly`
- lecteur non-membre (communauté publique) ⇒ DÉCOUVERTE ⇒ critère STRICT (`resolveForTargets`)

`POST members` / `POST invite` : l'acteur est admin, la cible devient co-membre
⇒ `resolvePrefsOnly`.

## Lots

- [x] Lot 1 — RED : témoins de fuite sur les 3 portes, schémas RÉELS (pas de mock
      d'`api-schemas`), traversée du sérialiseur réel.
- [x] Lot 2 — l'applicateur partagé exprime les DEUX défauts d'entrée absente
      (cycle 84 §8) : `hide` (strict) et `reveal` (prefs-only).
- [x] Lot 3 — GREEN : gate des 3 portes de `routes/communities.ts`.
- [x] Lot 4 — témoin structurel de l'ombrage : toute paire `routes/X.ts` + `routes/X/`
      doit être une coquille, `communities` nommée comme divergence connue.
- [x] Lot 5 — suites gateway vertes, `tsc --noEmit`, rapport de cycle, merge.

## Hors périmètre (décision produit, pas décision d'agent)

Basculer `communities.ts` en coquille SUPPRIMERAIT quatre routes de production —
`/communities/mine`, `/communities/:id/join`, `/leave`, `/invite` — absentes du
répertoire. La consolidation est un cycle à part entière.

Les 8 collapses prefs-only recopiés à la main (cycle 84 §8) convergent au cycle 86,
l'applicateur existant désormais.
