# Iteration 237 — `formatFileSize` rendait « 512 undefined » / « NaN undefined » sur les entrées sous-octet, négatives ou non finies

## Protocole (démarrage)
`main` @ `ddffa665` (dernier commit : `Merge pull request #3272 from
isopen-io/claude/keen-hamilton-k0hlhu`). Branche `claude/brave-archimedes-1wk6ow`
alignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), puis `npx prisma generate --generator client` + `bun run build`
dans `packages/shared`. Baseline vérifiée verte : `services/gateway`
`call-schemas.test.ts` (78/78), `packages/shared` suite complète (98 fichiers /
2358 tests) au départ.

**Audit anti-doublon** (16 PRs ouvertes au départ, toutes de `jcnm` — itérations
antérieures). Fichiers couverts par les PRs ouvertes : call-schemas /
transcription segments / invariant `endMs>=startMs` (#3242/#3243/#3245),
présence, contrats de canaux Socket.IO, primitives de rôle, `MyMentions`,
`chunk()`, formatage `expiresAt` « NaNm » (#3259), parsing `@handle` (#3262),
`encryptedMessage.iv` (#3266), `resolveRiverLaneAt` (#3270), web `VideoStream`
remove-participant (#3274), mode Focal, `createPeerConnection`, convertisseur
v1→v3. **Aucune PR ouverte ne touche `packages/shared/types/attachment.ts`**
(dernier commit dessus : `ecb1638b`, sans rapport) — zéro chevauchement de
fichier.

## Sélection : **Priorité 2 — helper SSOT déclaré dont un cas-limite d'entrée n'est pas gardé**

Sweep systématique de la surface TS (helpers purs de `packages/shared`, schémas
Zod du gateway, utils/hooks web) à la recherche d'un défaut de justesse net,
vérifiable, hors des 16 zones en vol. La surface est exceptionnellement
entretenue — presque chaque helper pur est une SSOT documentée avec un test
miroir et un garde d'entrée défensif. Le seul défaut de code non ambigu trouvé :
`formatFileSize`.

## Current state (avant correctif)

`formatFileSize` (`packages/shared/types/attachment.ts:794`) est déclarée
« Source unique de vérité pour la conversion octets → chaîne lisible
(B/KB/MB/GB/TB) dans tout le monorepo ». Forme avant correctif :

```ts
export function formatFileSize(bytes: number, options?: FormatFileSizeOptions): string {
  if (bytes === 0) return '0 B';
  const decimals = options?.decimals ?? 2;
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, FILE_SIZE_UNITS.length - 1);   // borne HAUTE seulement
  return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(decimals))} ${FILE_SIZE_UNITS[sizeIndex]}`;
}
```

`FILE_SIZE_UNITS = ['B','KB','MB','GB','TB']`. Le `Math.min(i, len-1)` plafonne
l'index par le haut (correctement : au-delà de 1024 TB, l'unité reste TB — testé)
mais **jamais par le bas**. Deux classes d'entrées cassent :

1. **Sous-octet positif** (`0 < bytes < 1`). `Math.log(0.5)/Math.log(1024) ≈
   -0.099` → `i = Math.floor(...) = -1` → `sizeIndex = min(-1, 4) = -1`.
   `FILE_SIZE_UNITS[-1] === undefined` et `Math.pow(1024, -1) = 1/1024` GONFLE la
   valeur : `0.5 / (1/1024) = 512`. Résultat : **`"512 undefined"`**.

2. **Négatif / non fini** (`bytes < 0`, `NaN`, `±Infinity`). `Math.log` d'un
   négatif ou de `NaN` vaut `NaN` → `i = NaN` → `sizeIndex = min(NaN, 4) = NaN` →
   `FILE_SIZE_UNITS[NaN] === undefined`, `bytes / Math.pow(k, NaN) = NaN`.
   Résultat : **`"NaN undefined"`**.

Seul `bytes === 0` était gardé.

## Problems identified
- La chaîne littérale `"512 undefined"` / `"NaN undefined"` peut s'afficher
  telle quelle à l'écran (le mot anglais `undefined` visible dans une UI FR).
- Une SSOT dont un pan de son domaine d'entrée n'est pas défini n'est pas une
  vraie source de vérité : chaque appelant devrait se demander s'il doit
  pré-garder, exactement la duplication que la SSOT existe pour supprimer.

## Root causes
Le clamp d'index n'a jamais borné le bas de la plage (`Math.max(i, 0)` absent) et
aucun garde ne rejetait les entrées hors domaine (`< 0`, non finies), alors que
le formatteur JUMEAU `formatClock` (`packages/shared/utils/duration-format.ts`)
documente et applique déjà exactement ce contrat : *« Les entrées négatives ou
non finies sont ramenées à zéro »* (`Number.isFinite(totalSeconds) ?
Math.max(0, totalSeconds) : 0`). Divergence de robustesse entre deux formatteurs
sœurs du même package.

## Business impact
**Faible aujourd'hui, latent.** Traçage des 30+ appelants (`grep formatFileSize(`
sur `apps/web` + `services`) : tous passent un décompte d'octets ENTIER réel
(`attachment.fileSize`, `file.size`, `audioBlob.size`), et `0` est court-circuité
en amont. Aucun chemin utilisateur ne produit `0 < bytes < 1` ni un négatif
aujourd'hui. Le défaut est un durcissement de SSOT, pas un symptôme live — mais
une future source d'octets fractionnaires (débit moyen, estimation, delta) ou une
valeur corrompue afficherait `undefined` sans filet.

## Technical impact
Correction purement locale (une fonction, 2 lignes de logique), zéro changement
d'API, zéro impact sur les 30+ sites d'appel (mêmes sorties pour toute entrée
entière ≥ 1 et pour `0`). Aligne la robustesse sur le formatteur jumeau
`formatClock`.

## Risk assessment
**Très faible.** Aucune signature modifiée. Les 13 assertions existantes de
`formatFileSize` (0, 1, 512, 1023, 1024, 1536, 1 Mo…1024 To, décimales) restent
vertes à l'identique. Le garde `bytes <= 0` préserve `formatFileSize(0) === '0 B'`
(0 ≤ 0). Couverture globale `packages/shared` inchangée au-dessus des seuils.

## Proposed improvements (implémenté)
1. Garde d'entrée en tête : `if (!Number.isFinite(bytes) || bytes <= 0) return
   '0 B';` — remplace le `bytes === 0` seul, absorbe 0/négatif/non-fini.
2. Clamp d'index BAS + haut : `Math.min(Math.max(i, 0), FILE_SIZE_UNITS.length - 1)`.

## Expected benefits
- Plus jamais de littéral `undefined`/`NaN` rendu à l'écran depuis cette SSOT.
- Contrat de robustesse homogène entre `formatFileSize` et `formatClock`.

## Implementation complexity
Triviale — 2 lignes de logique + 2 cas de test (TDD RED→GREEN vérifié).

## Validation criteria
- RED confirmé : `formatFileSize(0.5)` → `"512 undefined"`, `formatFileSize(-1)`
  → `"NaN undefined"` avant correctif.
- GREEN : `formatFileSize(0.5) === '0.5 B'`, `formatFileSize(0.001) === '0 B'`,
  `formatFileSize(-1|-1024|NaN|±Infinity) === '0 B'`.
- `packages/shared` suite complète verte (98 fichiers / 2360 tests après ajout).
- `bun run build` (tsc) vert ; `vitest run --coverage` au-dessus des seuils
  (branches 95.23 ≥ 94, functions 98.59 ≥ 93, lines 99.19 ≥ 98, statements
  98.76 ≥ 98).

## Améliorations futures (hors périmètre)
- **Parité `formatFileSizeI18n`** (`utils/notification-strings.ts:585`) : divergence
  DÉLIBÉRÉE de règles (tiers compacts localisés, décimales KB à 0) — documentée,
  PAS un bug. À NE PAS toucher sauf décision produit d'unifier.
- **`playbackStretch` Zod** (`services/gateway/src/validation/messages-schemas.ts:33`)
  sans invariant `endMs > startMs` — sans impact (le consommateur
  `playback-trace.ts::isUsable()` le garde déjà) ET famille `endMs>=startMs` sur
  liste d'évitement (PRs #3242/#3243 en vol). À NE PAS reprendre.
- Candidats des itérations 233→236 non retenus (inchangés) : markdown attachments
  vers le viewer texte (arbitrage produit) ; dépouillement des 24 fabriques
  `jest.mock('@meeshy/shared', …)` mortes ; `timeRangeMsSchema` partagé (couvert
  par PR #3243 en vol).
