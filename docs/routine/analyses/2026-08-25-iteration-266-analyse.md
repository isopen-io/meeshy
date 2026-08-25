# Itération 266 — Analyse : `isPrivateIp` ne connaissait QUE l'IPv4, et laissait une adresse interne IPv6 partir vers un TIERS

## État courant

`services/gateway/src/services/GeoIPService.ts` capture la géolocalisation d'une
adresse IP via le service TIERS `ip-api.com` (palier gratuit, 45 requêtes/min).
`lookupGeoIp(ip)` court-circuite l'appel externe pour les adresses privées :

```ts
if (isPrivateIp(ip)) {
  return { ip, /* … */ location: 'Local', /* … */ };
}
// sinon : fetch('http://ip-api.com/json/${ip}')
```

`isPrivateIp` est donc la **porte** qui décide si une adresse INTERNE est
envoyée à un tiers.

Forme antérieure du garde :

```ts
function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  return false;
}
```

## Problèmes identifiés

1. **Aucune reconnaissance de l'IPv6.** Une adresse IPv6 privée franchit le
   garde comme si elle était publique :
   - loopback `::1`, non spécifiée `::` ;
   - **ULA** `fc00::/7` (`fc…` / `fd…`) — l'équivalent IPv6 du `10.0.0.0/8` ;
   - **link-local** `fe80::/10` (`fe80`–`febf`).
2. **Aucune reconnaissance des adresses IPv4-mappées** `::ffff:a.b.c.d`. Une
   adresse privée mappée (`::ffff:192.168.1.1`) n'est reconnue par aucune des
   branches IPv4 (qui testent `startsWith('192.168.')`).
3. `extractIpFromRequest` NE normalise que `::1` et `::ffff:127.0.0.1` vers
   `127.0.0.1` — les autres formes IPv6 privées arrivent intactes à
   `lookupGeoIp` (et tout appelant direct de `lookupGeoIp` contourne la
   normalisation).

## Causes racines

Le contrat de `isPrivateIp` est « adresse INTERNE → ne pas sortir ». Le garde
d'origine a été écrit pour un monde IPv4 et n'a jamais été confronté aux
familles IPv6, aujourd'hui livrées par défaut par la plupart des hébergeurs et
équilibreurs de charge. C'est la forme, à une frontière de confidentialité, de
la règle du dépôt : *une protection se mesure sur tout ce que la charge
TRANSPORTE* — ici, l'ensemble des formes d'adresse, pas la seule qu'on avait en
tête en l'écrivant. Jumelle directe de l'itération 260 (`isIpInRange` admettait
des IP hors plage) et 261 (le littéral ObjectId recopié).

## Impact métier

Une adresse IPv6 interne (ULA d'un réseau privé, link-local, ou IPv4-mappée
privée derrière un proxy émettant du `X-Forwarded-For` IPv6) envoyée à
`ip-api.com` :

- **Fuite de confidentialité** : la topologie du réseau interne (adresse IPv6)
  part vers un service tiers, dans l'URL de requête, potentiellement journalisée
  et indexée côté fournisseur.
- **Budget de débit gaspillé** : chaque appel consomme le quota de 45/min pour
  une résolution qui ne peut que rendre `fail` (ip-api ne géolocalise pas une
  adresse privée), au détriment des vraies adresses publiques à géolocaliser.

## Impact technique

Défaut latent transformé en chemin borné. Aucune valeur de retour légitime ne
change : toute adresse PUBLIQUE (IPv4 ou IPv4-mappée publique `::ffff:8.8.8.8`)
continue de passer par l'API. Le durcissement est purement additif au garde.

## Évaluation du risque

**Faible.** Une seule fonction feuille, un seul consommateur (`lookupGeoIp`, dans
le même fichier). La récursion sur l'IPv4-mappée est bornée (une seule
réécriture : `::ffff:` retiré, le reste ne rematche pas le motif mappé). Le seul
changement observable est qu'une adresse INTERNE de plus rend désormais le
placeholder `Local` (aucun `fetch`) au lieu d'un appel externe voué à l'échec —
strictement une amélioration.

## Améliorations proposées (livrées)

- Reconnaître les IPv4-mappées `::ffff:a.b.c.d` en re-vérifiant l'IPv4 embarquée.
- Reconnaître les familles IPv6 privées : loopback `::1`, unspecified `::`,
  ULA `fc00::/7`, link-local `fe80::/10` (insensible à la casse).
- Extraire `isPrivateIpv4` / `isPrivateIpv6` pour la lisibilité ; ajouter le
  `radix 10` au `parseInt` du second octet.

## Bénéfices attendus

- Aucune adresse interne IPv6 ne peut plus atteindre le service tiers.
- Le budget de débit d'`ip-api.com` n'est plus consommé par des lookups privés
  voués à l'échec.
- Le contrat « adresse interne → ne pas sortir » est désormais tenu pour les
  deux familles d'adresse.

## Complexité d'implémentation

Triviale — une fonction feuille scindée en deux, aucun nouveau module, aucun
nouveau consommateur.

## Critères de validation

- [x] RED : 9 gardes IPv6/IPv4-mappée-privée tombent sur `main`
      (`lookupGeoIp` rend `null`, un `fetch` réel est tenté).
- [x] GREEN : `GeoIPService.lookup.test.ts` → 23/23, dont le témoin de
      non-régression « une IPv4-mappée PUBLIQUE passe toujours par l'API ».
- [x] Toutes les suites `GeoIPService.*` → 73/73.
- [x] `tsc --noEmit` gateway → 0 erreur.
- [x] Suites consommatrices (services, auth, jobs) → vertes.
- [ ] Commit + push.
