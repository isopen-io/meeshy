# Iteration 58 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 57 (« Source unique des initiales — famille contacts », mergée dans `main` : PR #1181 /
`d627b28`). Restait **F26c-c(c)** : la **dernière** dérivation `.slice(0, 2)` d'initiale d'identité
dans `apps/web`, sur la page profil `app/u/[id]/page.tsx`.

## Constat — `app/u/[id]/page.tsx:346`

```tsx
<AvatarFallback ...>
  {getUserDisplayName(user).slice(0, 2).toUpperCase()}
</AvatarFallback>
```

Même incohérence que la famille contacts : `.slice(0, 2)` rend les 2 premiers **caractères d'un mot**
(« Jo » pour « John Doe ») au lieu des vraies initiales (« JD »). C'est le grand avatar (h-24 w-24)
de la fiche profil — visible et incohérent avec le reste du produit qui utilise `getUserInitials`.

## Décision iter 58 — lot « Source unique des initiales — page profil — F26c-c(c) »

| Cible | Avant | Après |
|-------|-------|-------|
| `app/u/[id]/page.tsx:346` | `getUserDisplayName(user).slice(0, 2).toUpperCase()` | `getUserInitials(user)` |

Import ajouté : `import { getUserInitials } from '@/lib/avatar-utils';`. La fonction locale
`getUserDisplayName` (l.251, délègue au canonique) **reste** — elle sert le titre du layout (l.319)
et le nom affiché (l.363) ; seule la dérivation d'initiale change.

### Garanties de non-régression
- **Aucun test** ne rend `app/u/[id]/page.tsx` (pas de contrat verrouillé).
- `tsc --noEmit` : `getUserInitials(user)` compile sans erreur sur le fichier touché.
- Changement **borné et bénéfique** : vraies initiales cohérentes avec tout le produit.

## Bilan du cluster initiales
Avec iter 55 (MemberSelectionStep), 56 (admin/users), 57 (famille contacts) et 58 (page profil),
**toutes** les dérivations manuelles d'initiale d'**identité utilisateur** dans `apps/web`
(`charAt(0)` et `.slice(0,2)`) délèguent désormais à la source unique `getUserInitials`. Il ne reste
que des initiales **hors périmètre user** (nom de conversation, creator de lien) — intentions
distinctes, consignées F26c-e.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-e | `DetailsHeader` initiale de **nom de conversation** (pas User) ; `conversation-links-section` creator via `firstName?.charAt(0)` | FAIBLE | Hors cluster user-initials ; nom de conversation ≠ User |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Cluster **initiales d'identité utilisateur** entièrement clos dans `apps/web` : plus aucune
réimplémentation locale (`charAt(0)`/`.slice(0,2)`) — une seule source (`getUserInitials`), initiales
cohérentes avec le nom affiché partout. Prochain grain : F26c-e (initiales de nom de conversation via
un canonique string dédié) ou nouveau domaine hors initiales (slug/url, sanitize, date-relative,
validateurs téléphone F25b).
