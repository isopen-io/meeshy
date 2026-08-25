# Itération 266 — Plan : durcir `isPrivateIp` pour l'IPv6 et les IPv4-mappées

## Objectifs

Empêcher qu'une adresse IPv6 interne (ULA, link-local, loopback) ou une adresse
IPv4-mappée privée franchisse la porte `isPrivateIp` et parte vers le service
tiers `ip-api.com`.

## Modules affectés

- `services/gateway/src/services/GeoIPService.ts` — `isPrivateIp`
  (scindé en `isPrivateIpv4` / `isPrivateIpv6`).
- `services/gateway/src/__tests__/unit/services/GeoIPService.lookup.test.ts`
  — 9 cas RED + 1 témoin de non-régression (IPv4-mappée publique).

## Phases d'implémentation

1. **RED** — ajouter les témoins IPv6/mappée-privée + le témoin de garde
   (IPv4-mappée publique passe toujours par l'API). ✅
2. **GREEN** — reconnaître les IPv4-mappées (récursion sur l'IPv4 embarquée) et
   les familles IPv6 privées ; ajouter le `radix 10`. ✅
3. **REFACTOR** — extraction de `isPrivateIpv4` / `isPrivateIpv6` pour la
   lisibilité. ✅

## Dépendances

Aucune. Fonction feuille, un seul consommateur interne au fichier.

## Risques estimés

Minime. Le seul changement de comportement est qu'une adresse interne de plus
rend `Local` (sans `fetch`). Récursion IPv4-mappée bornée à une réécriture.

## Stratégie de rollback

Revert du commit unique — aucune migration, aucun schéma, aucun contrat de fil
touché.

## Critères de validation

- `GeoIPService.lookup.test.ts` → 23/23.
- Suites `GeoIPService.*` → 73/73.
- `tsc --noEmit` gateway → 0 erreur.
- Suites consommatrices (services, auth, jobs) → 243/243 suites, 6569 tests.

## Statut de complétion

**Livré.** RED prouvé (9 cas), GREEN complet, refactor appliqué, validations
vertes. Reste : commit + push.

## Suivi progression

- [x] RED
- [x] GREEN
- [x] REFACTOR
- [x] tsc + suites
- [ ] commit + push

## Améliorations futures

- Envisager, dans un lot dédié, de normaliser les IPv4-mappées **publiques**
  (`::ffff:8.8.8.8` → `8.8.8.8`) au niveau d'`extractIpFromRequest`, pour
  qu'`ip-api.com` reçoive une IPv4 canonique et pour dédupliquer la clé de cache
  — décision distincte, car elle touche la clé de cache et l'IP persistée.
