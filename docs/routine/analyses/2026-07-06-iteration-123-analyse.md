# Iteration 123 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `e19cd6f6`, working tree propre. Branche `claude/brave-archimedes-cm4hnp` recréée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **122** → ce cycle prend **123**.

PR ouvertes au démarrage (disjointes de la cible) : #1585 (gateway realtime `notification:new`
routing), #1584 (android quoted-reply scroll), + bumps dependabot (#1532/#1536/#1539/#1542/#1549).
Cible retenue **strictement disjointe**.

## Revue d'ingénierie (constat de démarrage)
Reprise du backlog documenté en fin d'itération 122 : **F87 (LOW)** — divergence de garde entre les deux
sanitizers de `services/gateway/src/utils/sanitize.ts` qui protègent **le même modèle de menace**
(NoSQL operator injection + prototype pollution). Vérification adversariale du reste des utils déjà
couverte par les itérations 118-122 (etag, bounded-cache, circuitBreaker, keyset pagination…) — aucun
nouvel écart réel non traité au-dessus de F87.

## Cible : F87 — `sanitizeMongoQuery` plus permissif que `sanitizeJSON` (garde divergente)

### Current state (avant fix)
`SecuritySanitizer.sanitizeJSON` (métadonnées de notification, **reachable** via
`NotificationService.ts:659`) bloquait les clés dangereuses :
```ts
if (key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype') continue;
```
`SecuritySanitizer.sanitizeMongoQuery` — son jumeau documenté comme middleware de `request.query` /
`request.body` (voir JSDoc + `XSS_PROTECTION_REPORT.md`) — ne bloquait **que** les opérateurs `$` :
```ts
if (key.startsWith('$')) continue;   // laisse passer __proto__ / constructor / prototype
```

### Problems identified
1. **Divergence sur un modèle de menace identique.** Les deux fonctions existent pour neutraliser des
   objets JSON hostiles avant usage MongoDB/objet. `sanitizeJSON` durcit contre la prototype pollution,
   `sanitizeMongoQuery` non — alors que c'est précisément la fonction destinée à assainir
   `request.query`/`request.body` (surface d'entrée la plus exposée).
2. **`__proto__` / `constructor` / `prototype` traversent `sanitizeMongoQuery`.** Un corps
   `JSON.parse('{"__proto__":{"isAdmin":true}}')` expose `__proto__` comme clé énumérable propre ;
   `sanitized['__proto__'] = value` réassigne le prototype de l'objet retourné (pollution locale de la
   chaîne de prototype du résultat) — un footgun classique juste avant une requête Mongo/merge.

### Root cause
`sanitizeMongoQuery` a été écrite plus tard, focalisée uniquement sur le vecteur opérateur-`$`, sans
rétro-porter le garde prototype-pollution que `sanitizeJSON` possédait déjà. Deux implémentations
inline du même contrat de « clé dangereuse » → dérive inévitable (violation SSOT,
`packages/shared`/`gateway` §Single Source of Truth).

### Business / Technical impact
Reachability **actuelle** : `sanitizeMongoQuery` n'est pas encore câblée en middleware live (seule
`sanitizeJSON` l'est, via NotificationService) — l'impact production immédiat est donc **nul**. Mais la
fonction est **documentée et prête à câbler** comme garde de `request.query`/`request.body` ; la câbler
telle quelle aurait introduit un garde plus faible que son jumeau. Durcir maintenant = defense-in-depth
sans dette latente. Impact technique : suppression d'une divergence de garde de sécurité et d'une
double définition du prédicat « clé dangereuse ».

### Risk assessment
Très faible. On **élargit** l'ensemble de clés bloquées de `sanitizeMongoQuery` (surset strict :
`$*` + `__*` + `constructor`/`prototype`) — aucun blocage retiré. Les noms de champ MongoDB légitimes de
l'app ne commencent jamais par `__`/`$` et ne sont jamais `constructor`/`prototype`. `sanitizeJSON`
conserve un comportement **identique** (même prédicat extrait verbatim, couvert par ses tests existants
`__proto__`/`__customKey__`/`constructor`/`prototype`).

## Proposed improvements (implémenté ce cycle)
Extraction d'un prédicat privé unique `SecuritySanitizer.isDangerousKey(key)` — **source de vérité
unique** consommée par `sanitizeJSON` **et** `sanitizeMongoQuery` :
```ts
private static isDangerousKey(key: string): boolean {
  return key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype';
}
```

## Expected benefits
- `sanitizeMongoQuery` durcie contre la prototype pollution (parité avec `sanitizeJSON`).
- Un seul prédicat « clé dangereuse » → plus de dérive possible entre les deux sanitizers (SSOT).
- Aucun régression : `sanitizeJSON` inchangée sémantiquement.

## Implementation complexity
Triviale — 1 fichier de production (extraction + 2 call sites), 1 fichier de test (5 cas ajoutés).

## Validation criteria
- [x] `src/__tests__/unit/utils/sanitize.test.ts` : **196/196** (191 existants + 5 nouveaux :
      `__proto__`, `constructor`, `prototype`, `__`-prefix générique, prototype-pollution imbriquée
      dans un objet sans opérateur).
- [x] `user-sanitization.service.test.ts` (consommateur admin) : **20/20** (no reg).
- [x] `tsc --noEmit` : aucune nouvelle erreur sur `sanitize.ts` (seule l'erreur pré-existante de
      résolution `@meeshy/shared` — dist non buildé en environnement — subsiste, sans lien avec le diff).

## Leçon (à retenir)
Deux fonctions de sécurité qui partagent le **même modèle de menace** doivent partager le **même
prédicat de garde**. Une garde recopiée inline diverge silencieusement (ici : le jumeau destiné à la
surface d'entrée la plus exposée était le plus faible). Extraire le prédicat rend la parité structurelle.

## Future improvements (backlog, non traité ce cycle)
- **F88 (MINOR)** : `truncateFilename` peut dépasser `maxLength` de 1 pour `maxLength < 4` (non atteint —
  tous les call sites ≥ 32) — clamp défensif.
- **F86 (LOW)** : `use-message-translations.ts` dedup ignorant le timestamp — intention produit à confirmer.
- Antérieurs reportés : F69, F74, F75, F78, F80, F81, F82b.
- **Suivi F87** : lorsqu'on câblera `sanitizeMongoQuery` en middleware `request.query`/`request.body`,
  la garde prototype-pollution est désormais en place — pas de durcissement supplémentaire requis.
