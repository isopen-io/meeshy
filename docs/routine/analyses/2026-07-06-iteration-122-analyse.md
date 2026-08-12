# Iteration 122 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `a9a6008e`, working tree propre. Branche `claude/brave-archimedes-ag0uwk` (re)créée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **121** → ce cycle prend **122**.

PR ouvertes au démarrage (disjointes de la cible) : #1579 (calls fanout), #1580 (android @-mention),
#1581 (gateway socketio cached translation), + bumps dependabot. Cible retenue **strictement disjointe**.

## Revue d'ingénierie (constat de démarrage)
Le socle gateway/shared est extrêmement mature (121 itérations de polissage). Revue adversariale
ciblée des helpers purs (`bounded-cache`, `circuitBreaker`, `SequenceService`, `emitWithSeq`, `sync.ts`
keyset pagination, `calendar-date`, `format-number`, `initials`, `truncate`, `etag`) : la plupart des
edge cases classiques (rollover de palier, day-diff insensible au DST, éviction FIFO+TTL, keyset
`(updatedAt,id)` sans trou/doublon) sont déjà traités et commentés. **Un** écart normatif concret a été
identifié dans la conformité HTTP.

## Cible : conformité RFC 7232 §3.2 — `ifNoneMatchMatches` ignore la comparaison FAIBLE des validateurs

### Current state (régression de perf silencieuse derrière un proxy)
`services/gateway/src/utils/etag.ts` — `ifNoneMatchMatches` faisait une comparaison **exacte de chaîne** :
```ts
return values.includes('*') || values.includes(etag);
```
Or `computeETag` émet toujours un ETag **fort** (`"<sha256>"`), et l'itération récente a généralisé le
conditional-GET (ETag + 304) à ~200 endpoints GET via le hook `conditionalGetOnSend` — l'objectif étant
d'économiser la bande passante (« ne pas rapatrier de données inutilement »).

### Problems / Root cause
RFC 7232 §3.2 impose la **fonction de comparaison FAIBLE** pour `If-None-Match` : le flag `W/` (weak
validator) doit être **ignoré des deux côtés**, seule l'opaque-tag compte. Tout intermédiaire
transformant (CDN, proxy compressant gzip/br) est **censé affaiblir** un ETag fort en `W/"…"` sur le
chemin retour (la transformation invalide l'équivalence octet-à-octet que garantit un ETag fort). Le
client ré-émet alors `W/"…"` dans `If-None-Match` ; la comparaison exacte échoue (`W/"abc" ≠ "abc"`).

### Business / Technical impact
Derrière un tel déploiement (cas courant en prod : Traefik + CDN), **chaque** conditional-GET renvoie le
corps 200 complet au lieu d'un 304 header-only → l'optimisation de bande passante récemment livrée est
**silencieusement annulée**. Aucune donnée n'est corrompue (fail-safe : on renvoie le contenu frais),
mais la régression est invisible (ni erreur, ni test). Surface : les ~200 GET JSON du gateway.

### Risk assessment
Très faible. La comparaison faible est **toujours** correcte ici : tous les appelants
(`sendWithETag`, `conditionalGetOnSend`, `/sync`) l'utilisent pour `If-None-Match` sur des GET
idempotents (la comparaison forte n'est requise que pour `If-Range`, non concerné). Aucun chemin ne
régresse : un `If-None-Match: "abc"` (fort, direct-to-origin) matche exactement comme avant.

### Proposed improvements (implémenté ce cycle)
Comparaison faible dans `ifNoneMatchMatches` : on retire un préfixe `W/` de gauche des deux côtés avant
d'égaliser les opaque-tags, `*` reste géré en court-circuit.
```ts
if (values.includes('*')) return true;
const opaqueTag = (v: string): string => v.replace(/^W\//, '');
const target = opaqueTag(etag);
return values.some((v) => opaqueTag(v) === target);
```

### Validation criteria
- [x] `src/utils/__tests__/etag.test.ts` + `src/__tests__/unit/utils/etag.test.ts` : **39/39**
      (dont 8 nouveaux cas faibles : `W/"abc"` seul, en liste, mixte fort/faible, array, non-match).
- [x] Contrats conditional-GET (`async-send-contract`, `download-onsend-double-send`) : **4/4** (no reg).
- [x] `/sync` (autre consommateur d'`ifNoneMatchMatches`) : **16/16** (no reg).

### Leçon (à retenir)
Un ETag **fort** n'est jamais garanti de revenir tel quel : tout proxy transformant l'affaiblit en `W/`.
Toute comparaison `If-None-Match` doit être **faible** (RFC 7232 §3.2) — la comparaison exacte casse le
conditional-GET en prod sans lever la moindre erreur.

## Future improvements (backlog, non traité ce cycle)
- **F87 (LOW)** : `SecuritySanitizer.sanitizeMongoQuery` (`utils/sanitize.ts`) est plus permissif que son
  jumeau `sanitizeJSON` (ne filtre pas `constructor`/`__proto__`). Pas d'exploitation prototype globale
  réelle (réassignation locale) et les `$`-opérateurs restent bloqués, mais les deux sanitizers divergent
  sur le même modèle de menace — unifier sur le même garde de clés dangereuses.
- **F88 (MINOR)** : `truncateFilename` peut dépasser `maxLength` de 1 pour `maxLength < 4` (non atteint par
  les call sites, tous ≥ 32) — clamp/guard purement défensif.
