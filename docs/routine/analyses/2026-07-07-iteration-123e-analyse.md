# Iteration 123 — Analyse (2026-07-07)

## Protocole (démarrage)
`main` @ `4f330fbd` (post-merge #1603 android typing roster), working tree propre. Branche
`claude/brave-archimedes-y0uomh` recréée depuis `origin/main`. Numérotation : docs `main` jusqu'à
**122** → ce cycle prend **123**.

PR ouvertes au démarrage : bumps dependabot + PR fonctionnelles disjointes (android chat, calls).
Cible retenue **strictement disjointe** de toutes.

## Revue d'ingénierie (constat de démarrage)
Le socle gateway/shared est extrêmement mature (122 itérations). Le backlog de l'itération 122
listait explicitement **F87** comme prochaine cible non traitée. Revue adversariale ciblée du module
de sécurité `services/gateway/src/utils/sanitize.ts` : les deux sanitizers structurels
(`sanitizeJSON`, `sanitizeMongoQuery`) gardent le **même modèle de menace** (injection NoSQL +
prototype pollution sur données non fiables) mais **divergent** sur le garde de clés dangereuses.

## Cible : F87 — `sanitizeMongoQuery` viole le garde de clés dangereuses (SSOT sécurité)

### Current state (divergence latente)
`sanitizeJSON` (l.81-112) bloque : `$`-préfixe **ET** `__`-préfixe **ET** `constructor`/`prototype`.
`sanitizeMongoQuery` (l.227-250) ne bloque **que** `$`-préfixe :
```ts
if (key.startsWith('$')) { continue; }        // laisse passer __proto__, constructor, prototype
...
sanitized[key] = ... ;                          // sanitized['__proto__'] = value → pollue le proto
```
Or la docstring de `sanitizeMongoQuery` la vend comme middleware pour `request.query` **et**
`request.body` — la surface **la plus exposée** (toutes les requêtes) — tout en étant le sanitizer
le **plus faible**.

### Problems identified
1. **[LATENT-EXPLOITABLE] Prototype pollution du résultat.** Vecteur réel : Fastify parse
   `request.body` via `JSON.parse`, qui produit une clé `__proto__` **own enumerable** (contrairement
   à un littéral objet). Démonstration empirique (`node -e`) :
   ```
   JSON.parse('{"__proto__":{"isAdmin":true},"name":"test"}')
   → sanitized['__proto__'] = {isAdmin:true}
   → result.isAdmin === true          // la propriété injectée SURVIT via la chaîne de proto
   ```
   Le proto **global** n'est pas pollué (réassignation locale), mais l'objet **retourné** échappe à la
   sanitisation : si ce résultat alimente un contrôle d'autorisation ou est spread dans un filtre
   Prisma/Mongo, `isAdmin`/opérateurs injectés redeviennent lisibles.
2. **[SSOT] Deux gardes divergents pour un modèle de menace unique.** Le même changement de threat
   model doit se refléter aux deux endroits — la divergence est une dette de cohérence de sécurité.

### Root cause
Historiquement, `sanitizeMongoQuery` (garde `$` seul) et `sanitizeJSON` (garde renforcé après un
durcissement prototype-pollution) ont évolué séparément — pas de source unique pour « clé dangereuse ».

### Business / Technical impact
- **Business** : latent (aucun call site runtime aujourd'hui) mais la docstring invite explicitement à
  câbler `sanitizeMongoQuery` en middleware — le jour où c'est fait, le trou devient live sur 100 % du
  trafic entrant. Correctif préventif à coût nul.
- **Technical** : convergence des sanitizers sur un garde unique → un seul point à faire évoluer,
  élimine la classe de bug « j'ai durci un sanitizer, oublié l'autre ».

### Risk assessment
Très faible. Le garde renforcé est un **sur-ensemble strict** de l'ancien (`$` reste bloqué) ; il ajoute
uniquement `__`/`constructor`/`prototype`, jamais des filtres légitimes (aucun paramètre de requête
utilisateur légitime ne commence par `__` ou ne s'appelle `constructor`). `sanitizeJSON` conserve son
comportement **exact** (le garde extrait est verbatim son ancien test). Zéro call site runtime impacté.

### Proposed improvements (implémenté ce cycle)
Extraction d'un SSOT `SecuritySanitizer.isDangerousKey(key)` (privé statique) :
```ts
private static isDangerousKey(key: string): boolean {
  return key.startsWith('__') || key.startsWith('$')
      || key === 'constructor' || key === 'prototype';
}
```
Appliqué dans **les deux** sanitizers (`sanitizeJSON` + `sanitizeMongoQuery`).

### Expected benefits
- Ferme le vecteur prototype-pollution sur le sanitizer le plus exposé.
- Un garde unique = cohérence de sécurité + évolutivité (un seul point de vérité).

### Implementation complexity
Triviale (1 helper privé + 2 remplacements de condition).

### Validation criteria
- [x] `src/__tests__/unit/utils/sanitize.test.ts` : **195/195** (dont **4 nouveaux** cas
      `sanitizeMongoQuery` — `__proto__`, `constructor`, `prototype`, `__proto__` imbriqué, tous via le
      vecteur réaliste `JSON.parse`). RED confirmé avant fix (4 échecs), GREEN après.
- [x] `src/__tests__/unit/services/admin/user-sanitization.service.test.ts` : **20/20** (no reg).
- [x] `tsc --noEmit` gateway : aucune erreur liée à `sanitize`.

### Leçon (à retenir)
Deux fonctions qui gardent le **même** modèle de menace doivent partager **un seul** garde. Un objet
issu de `JSON.parse` porte une clé `__proto__` **own enumerable** — `target[key] = value` pollue alors
le proto du résultat ; toute copie clé-à-clé de données non fiables doit filtrer `__proto__`/
`constructor`/`prototype` **avant** l'affectation.

## Future improvements (backlog, non traité ce cycle)
- **F88 (MINOR)** : `truncateFilename` peut dépasser `maxLength` de 1 pour `maxLength < 4` (non atteint
  par les call sites, tous ≥ 32) — clamp/guard purement défensif.
