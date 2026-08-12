# Iteration 185 — `compareFullNames` (gateway) : `normalizeName` réduit tout nom non-latin à une chaîne vide → récupération de compte cassée (faux négatif) + collision sur token latin partagé (faux positif)

## Protocole (démarrage)
`main` @ `3ec4d1c` (derniers merges : #2213 android/auth password checklist,
#2196 ios/a11y — itération **184**, alignement helpers d'affichage de langue web
sur la SSOT `languages.ts`). Branche `claude/brave-archimedes-0gfitu`
réinitialisée sur `origin/main`. Ce cycle prend **185**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install` ;
Prisma client régénéré (`packages/shared`, `--generator client`) ; `dist` shared
rebuild. Harnais validé ce cycle : `services/gateway` jest (ts-jest, node env).
Sélection : revue Priorité 1 « Sécurité / correctness » appliquée au chemin de
récupération de compte (`PhoneTransferService`), dont la comparaison d'identité
diverge silencieusement de la surface d'entrée réellement autorisée.

## Current state
`services/gateway/src/utils/name-similarity.ts` expose `compareFullNames(a, b)`
→ `'exact' | 'similar' | 'different'`. Le cœur est `normalizeName` :

```ts
function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')   // ← ligne 24 : ne conserve QUE l'ASCII [a-z0-9]
    .replace(/\s+/g, ' ')
    .trim();
}
```

Consommateur : `PhoneTransferService.checkPhoneOwnership`
(`services/gateway/src/services/PhoneTransferService.ts:163-186`) alimente
`compareFullNames` avec les `firstName`/`lastName` **stockés** et décide de la
récupération : `recoverySuggested: dormant && (nameSimilarity === 'exact' ||
nameSimilarity === 'similar')`.

La validation d'inscription autorise **tout** caractère lettre Unicode :
`AuthSchemas.register` → `/^(?=.*\p{L})[\p{L}\s'.-]+$/u`
(`packages/shared/utils/validation.ts`). Des `firstName`/`lastName` cyrilliques,
arabes, CJK, grecs, devanagari sont donc des valeurs stockées valides.

## Problems identified
La classe `[^a-z0-9]+` ne garde que l'ASCII. `NFD` + strip `\p{M}` replie
correctement les accents latins (`José` → `jose`), mais un script non-latin n'a
**aucune** décomposition ASCII → le token entier est remplacé par des espaces et
`normalizeName` retourne `''`.

1. **Faux négatif (récupération refusée au propriétaire légitime).**
   `compareFullNames({firstName:'Иван', lastName:'Петров'}, {même})` →
   `normalizeName` retourne `''` des deux côtés → `!sortedA || !sortedB` →
   **`'different'`** au lieu de `'exact'`. Le propriétaire d'un compte dormant à
   nom non-latin ne se voit **jamais** proposer la récupération de son propre
   compte.
2. **Faux positif (récupération proposée à un tiers) — sécurité.**
   `compareFullNames({firstName:'Jean', lastName:'Петров'}, {firstName:'Jean',
   lastName:'Иванов'})` → les deux côtés se réduisent à `'jean'` (les surnoms
   cyrilliques distincts sont effacés) → `sortedA === sortedB` → **`'exact'`**.
   Deux personnes différentes ne partageant qu'un prénom latin sont classées
   identiques → `recoverySuggested` déclenché à tort.
3. **Régression de test invisible.** `name-similarity.test.ts` ne couvrait que
   des noms latins (`Jean Dupont`, `José≡Jose`) et un seul cas vide **avec un
   côté déjà vide** — jamais deux noms non-latins identiques (qui se réduisent
   tous deux à `''`), ni le token latin partagé masquant des surnoms non-latins
   distincts.

## Root causes
Classe de caractères ASCII-only (`[^a-z0-9]`) posée avant que la surface
d'entrée réelle (`\p{L}` autorisé à l'inscription) ne soit prise en compte.
L'algorithme de repliement d'accents (NFD + `\p{M}`) donne l'illusion d'un
support i18n, mais la dernière classe annule tout ce qui n'est pas latin.

## Business impact
Meeshy est une plateforme multilingue par conception (Prisme Linguistique). Une
part significative de la base d'utilisateurs a des noms non-latins. Pour eux, la
récupération de compte sur transfert de numéro est soit **impossible**
(faux négatif) soit **ouverte à un homonyme partiel** (faux positif) — un
défaut de correctness ET de sécurité sur un flux sensible.

## Technical impact
Divergence silencieuse entre la surface d'entrée validée (`\p{L}`) et la
normalisation de comparaison (`[a-z0-9]`). Miroir du même anti-pattern présent
ailleurs (`routes/anonymous.ts` génère des handles dégénérés `"_437"` pour noms
non-latins — hors périmètre de ce cycle, noté ci-dessous).

## Risk assessment
Très faible. Changement mécanique d'une classe de caractères
(`[^a-z0-9]+/g` → `[^\p{L}\p{N}]+/gu`). Le repliement d'accents latins reste
intact (NFD + `\p{M}` inchangés) ; tous les cas latins existants passent
toujours. Aucune dépendance de comportement sur l'effacement des non-latins
(le seul appelant gate uniquement `exact`/`similar`).

## Proposed improvements
`normalizeName` : `.replace(/[^a-z0-9]+/g, ' ')` → `.replace(/[^\p{L}\p{N}]+/gu, ' ')`.
Les lettres/chiffres Unicode survivent ; ponctuation, symboles et séparateurs
sont toujours normalisés en espace. Docstring ajoutée expliquant le lien avec la
surface `\p{L}` de l'inscription.

## Expected benefits
- `Иван Петров` ≡ `Иван Петров` → `'exact'` (récupération correctement proposée).
- `Jean Петров` vs `Jean Иванов` → n'est plus `'exact'` (faux positif éliminé).
- `José ≡ Jose` reste `'exact'` (repliement d'accents préservé).

## Implementation complexity
Triviale : une classe de caractères + docstring + 3 cas de test.

## Validation criteria
- 3 nouveaux tests RED avant fix (Cyrillique exact, CJK/Arabe exact, token latin
  partagé ≠ exact), GREEN après.
- Les 10 tests existants restent verts (aucune régression latine).
- `services/gateway` jest suite `name-similarity` : 13/13.

## Statut : COMPLETED

## Future improvements (hors périmètre, corroborations du même root cause)
- `services/gateway/src/routes/anonymous.ts:45-48` : `replace(/[^a-z]/g,'')`
  génère un handle dégénéré `"_<suffix>"` pour noms non-latins. Nécessite un
  choix produit (translittération vs handle numérique) → itération future.
- `services/gateway/src/utils/call-session-response.ts:69` : fallback
  `p.participantId` dans le champ `userId` (mauvais id opaque quand
  `participant.userId` absent) — candidat runner-up, à confirmer.
