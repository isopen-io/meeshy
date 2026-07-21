# Iteration 186 — `generateNickname` (gateway/anonymous) : nom non-latin → handle dégénéré `_437` + accent latin supprimé (`José` → `jos`)

## Protocole (démarrage)
`main` @ `c74c273` (derniers merges : #2218 android/auth device-locale inference,
#2215 gateway/auth Unicode name normalization — itération **185** qui a corrigé le
même root cause dans `name-similarity.ts`). Branche
`claude/brave-archimedes-1b05qn` réinitialisée sur `origin/main`. Ce cycle prend **186**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances installées via `bun install`. Harnais
validé ce cycle : `services/gateway` jest (ts-jest, node env) — 29 suites utils /
918 tests verts, dont la nouvelle suite `anonymous-nickname`.

Sélection : suite directe de la section « Future improvements » de l'itération 185,
qui a explicitement noté `routes/anonymous.ts:45-48` comme corroboration du même
anti-pattern ASCII-only. L'essaim iOS `laughing-thompson` (≥ 20 PR ouvertes,
#2204→#2217) est entièrement iOS/Swift → aucune collision avec ce périmètre gateway.

## Current state
`services/gateway/src/routes/anonymous.ts` générait, quand un participant anonyme
rejoint une conversation **sans fournir de username**, un handle automatique :

```ts
function generateNickname(firstName: string, lastName: string): string {
  const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');       // ← ASCII-only
  const lastNameInitials = lastName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${cleanFirstName}_${lastNameInitials}${randomSuffix}`;
}
```

Consommateurs (`anonymous.ts`) : jonction anonyme (`username = … : generateNickname(...)`),
et deux boucles de suggestion d'un username libre (`suggestedUsername = generateNickname(...)`).
Le handle devient l'**unique identifiant visible** du participant s'il n'a pas de username.

Contrainte système : `SecuritySanitizer.sanitizeUsername` ne conserve que
`[a-zA-Z0-9_.-]` — les usernames sont **ASCII par contrat partout** (préserver
l'Unicode serait re-stripé en aval, contrairement à `name-similarity` qui compare
des noms `\p{L}`).

## Problems identified
La classe `[^a-z]` supprime tout ce qui n'est pas ASCII **sans repliement
préalable des accents** :

1. **Handle dégénéré pour tout nom non-latin.** `generateNickname('Иван', 'Петров')`
   → `cleanFirstName = ''`, `lastNameInitials = ''` → **`'_437'`**. Cyrillique,
   arabe, CJK, grec, devanagari (tous valides à l'inscription `\p{L}`) produisent
   un username commençant par `_`, indistinct, quasi-vide. Deux personnes non-latines
   distinctes ne diffèrent que par le suffixe aléatoire → collisions probables et
   handle non mémorisable.
2. **Accent latin supprimé au lieu d'être replié.** `generateNickname('José', 'Nlomé')`
   → **`'jos_nl437'`** : le `é` est retiré (pas folié en `e`). `Renée` → `rene`,
   `François` → `franois`. Les noms latins accentués (français, portugais, espagnol —
   langues de première classe du produit) sont mutilés.

## Root causes
Même root cause que l'itération 185 (`name-similarity.normalizeName`) : classe de
caractères ASCII-only appliquée **sans** l'étape de repliement `NFD` + strip `\p{M}`,
et **sans** garantie de non-dégénérescence quand le nom ne contient aucun ASCII.
185 a corrigé la comparaison ; ce cycle corrige la génération.

## Business impact
Meeshy est multilingue par conception (Prisme Linguistique). Une part significative
des participants anonymes ont des noms accentués ou non-latins. Pour eux, le handle
auto-généré est soit mutilé (`franois`) soit dégénéré (`_437`) — dégradation
d'identité visible sur un flux d'entrée grand public (rejoindre une conversation via
lien partagé), première impression du produit.

## Technical impact
Divergence entre la surface d'entrée (`firstName`/`lastName` en `\p{L}`) et la
dérivation du handle (`[a-z]`). Handles à faible entropie (`_###`) pour toute une
classe d'utilisateurs → risque accru de collision dans les boucles
`suggestedUsername` (qui n'ajoutent qu'un `counter`).

## Risk assessment
Très faible. Fonction pure extraite dans `utils/anonymous-nickname.ts` (miroir
structurel de `name-similarity.ts`), signature inchangée `(string, string) => string`.
Les noms latins simples restent **identiques bit-à-bit** (`Jean Dupont` → `jean_du###`).
Seuls changent : accents latins (mieux : `jose` au lieu de `jos`) et noms non-latins
(base neutre `user` au lieu de vide). Aucun consommateur ne dépend du préfixe vide.

## Proposed improvements
1. **Extraction** de `generateNickname` vers `services/gateway/src/utils/anonymous-nickname.ts`
   (testabilité unitaire, cohérence avec `name-similarity.ts`).
2. **Repliement d'accents** : `asciiFold = toLowerCase → NFD → strip \p{M} → strip [^a-z]`
   (mêmes 2 premières étapes que `name-similarity.normalizeName`).
3. **Garantie de non-dégénérescence** : `base = asciiFold(firstName) || 'user'`.
   Le handle ne commence jamais par `_` et n'est jamais vide.

## Expected benefits
- `José Nlomé` → `jose_nl###` (accent replié, plus `jos_nl###`).
- `Иван Петров` / `太郎 山田` / `محمد علي` → `user_###` (plus `_###`).
- `Jean Dupont` → `jean_du###` (inchangé — parité comportementale latine).

## Implementation complexity
Triviale : 1 fichier util neuf (fonction pure), 1 import + suppression du helper
local dans `anonymous.ts`, 1 suite de tests (8 cas).

## Validation criteria
- RED démontré : l'ancienne logique produit `jos_nl000` / `_000` (échoue les regex neuves).
- GREEN : suite `anonymous-nickname` 8/8.
- Non-régression : `src/__tests__/unit/utils/` 29 suites / 918 tests verts.
- Type-check isolé du util (es2022) : 0 erreur.

## Statut : COMPLETED

## Future improvements (hors périmètre)
- `services/gateway/src/utils/call-session-response.ts:69` : fallback
  `p.participantId` dans le champ `userId` (id opaque potentiellement erroné quand
  `participant.userId` absent) — candidat déjà noté en 185, nécessite de tracer
  si le cas « les deux userId absents » est réellement atteignable.
- Boucles `suggestedUsername` (`anonymous.ts:330,377`) : `${nickname}${counter}`
  régénère un **suffixe aléatoire neuf** à chaque itération (le `counter` ne
  désambiguïse pas le même base) — la déduplication est probabiliste, pas
  déterministe. Amélioration possible : figer la base et n'incrémenter que le compteur.
