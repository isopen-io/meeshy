# Iteration 123 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `b4b5a8a1`, working tree propre. Branche `claude/brave-archimedes-6oyyo0` (re)créée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **122** → ce cycle prend **123**.

PR ouvertes au démarrage (toutes disjointes de la cible) : #1596/#1592/#1588/#1585 (gateway realtime
`notification:new` delivery), #1593 (translator segmentation `is_list_item`), #1590 (shared
`time-remaining`), + bumps dependabot (#1549 vitest, #1542 next, #1539/#1536/#1532 pip translator).
Cible retenue **strictement disjointe** : gateway `utils/sanitize.ts`.

## Revue d'ingénierie (constat de démarrage)
Le backlog de l'itération 122 avait explicitement flaggé **F87** comme divergence non traitée entre les
deux sanitizers d'objets du gateway. Revue adversariale ciblée confirme qu'il ne s'agit pas d'une simple
divergence cosmétique mais d'un **vecteur de prototype pollution objet-local réel**.

## Cible : F87 — `sanitizeMongoQuery` laisse fuiter des clés attaquant via `__proto__` (prototype pollution)

### Current state
`services/gateway/src/utils/sanitize.ts` — `sanitizeMongoQuery` ne bloquait QUE les opérateurs Mongo
(`$…`) :
```ts
for (const [key, value] of Object.entries(obj)) {
  if (key.startsWith('$')) continue;
  sanitized[key] = typeof value === 'object' && value !== null
    ? this.sanitizeMongoQuery(value) : value;
}
```
Son jumeau `sanitizeJSON` (même fichier) bloque en plus les clés dangereuses de pollution de prototype :
```ts
if (key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype') continue;
```

### Problems identified / Root cause
`JSON.parse('{"__proto__": {...}}')` produit une **vraie clé propre** `__proto__` (contrairement à un
littéral d'objet où `__proto__` invoque l'accesseur). Lors de la reconstruction,
`sanitized['__proto__'] = value` **ne crée pas une propriété propre** : il passe par le *setter*
`__proto__` hérité de `Object.prototype` et **réassigne le prototype** de l'objet `sanitized`. Preuve
runtime (payload `{ "__proto__": { "isAdmin": true }, "username": "x" }`) :
- `sanitized.isAdmin` → **`true`** (résolu via la chaîne de prototype)
- `Object.getPrototypeOf(sanitized) === Object.prototype` → **`false`**

De plus les clés `constructor` / `prototype` passaient telles quelles.

### Business / Technical impact
`sanitizeMongoQuery` est une primitive de sécurité publique (whitelistée, testée) destinée à assainir
`request.query` / `request.body` avant usage en filtre Mongo. Tout futur call-site qui l'appliquerait à
une entrée attaquant héritait silencieusement de clés forgées (`isAdmin`, `role`, …) via le prototype de
l'objet retourné — contournant potentiellement un `if (query.isAdmin)` en aval. Pas de pollution du
`Object.prototype` **global** (la réassignation est objet-locale), donc pas de compromission
cross-requête, mais la garantie « objet assaini » du contrat est fausse. Divergence de modèle de menace
avec `sanitizeJSON` sur le même fichier = dette et piège de maintenance.

### Risk assessment
Très faible pour la correction. Le durcissement est purement additif : on retire des clés qui n'ont
aucune sémantique légitime dans une query Mongo. Les 12 cas existants (opérateurs `$…`, imbrication,
tableaux) restent inchangés (vérifié : `$ne`/`$gt` toujours strippés, champs légitimes préservés).
Aucune route de production n'appelle actuellement `sanitizeMongoQuery` (grep), donc zéro risque de
régression fonctionnelle en prod ; le gain est la fiabilisation de la primitive + parité avec le jumeau.

### Proposed improvements (implémenté ce cycle)
Aligner le garde de clés dangereuses de `sanitizeMongoQuery` sur celui de `sanitizeJSON` :
```ts
if (key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype') continue;
```
Les deux sanitizers partagent désormais le même modèle de menace (opérateurs Mongo + vecteurs de
prototype pollution). Commentaire explicite ajouté pour figer l'invariant « à garder en lockstep ».

### Expected benefits
- Primitive de sécurité correcte : l'objet retourné a toujours `Object.prototype` comme prototype et
  ne contient jamais de clé forgée héritée.
- Parité `sanitizeMongoQuery` ⇄ `sanitizeJSON` (un seul modèle de menace, maintenance simplifiée).

### Implementation complexity
Triviale : un garde de clé étendu + 4 tests de non-régression sécurité.

### Validation criteria
- [x] `src/__tests__/unit/utils/sanitize.test.ts` : **195/195** (dont 4 nouveaux :
      `__proto__` non-fuite + prototype intact, `constructor`/`prototype` strippés, `__proto__` imbriqué,
      non-pollution du `Object.prototype` global).
- [x] Non-régression : les 12 cas Mongo existants (`$ne`, `$gt`, `$regex`, `$where`, `$or`, `$in`,
      `$elemMatch`, imbrication profonde, tableaux, champs légitimes) inchangés.
- [x] `tsc --noEmit` gateway : zéro erreur sur `sanitize.ts` (après build `@meeshy/shared`).

### Leçon (à retenir)
Reconstruire un objet clé-par-clé avec `out[key] = …` n'est PAS sûr contre la prototype pollution :
si `key === '__proto__'` (cas fréquent après `JSON.parse`), l'affectation réassigne le *prototype* au
lieu de créer une propriété propre. Tout sanitizer/merge/clone qui itère `Object.entries` DOIT exclure
`__proto__`/`constructor`/`prototype` — pas seulement les opérateurs métier.

## Future improvements (backlog, non traité ce cycle)
- **F88 (MINOR)** : `truncateFilename` peut dépasser `maxLength` de 1 pour `maxLength < 4` (non atteint
  par les call sites, tous ≥ 32) — clamp/guard purement défensif.
- **F89 (LOW, à investiguer)** : envisager de mutualiser le garde de clés dangereuses de `sanitizeJSON`
  et `sanitizeMongoQuery` dans un helper privé `isDangerousKey(key)` pour empêcher toute future
  divergence des deux modèles de menace (refactor DRY, sans changement de comportement).
