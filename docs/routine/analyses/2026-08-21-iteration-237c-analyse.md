# Iteration 237 — `formatTimeRemaining` fuyait `"NaNm"`/`"Infinityh"` à l'écran sur un `expiresAt` absent (garde `Number.isFinite` manquante)

## Protocole (démarrage)
`main` @ `ea1c4263` (dernier commit : `test(web): le montage du test Prisme origin-locale devient
relatif…`). Branche `claude/brave-archimedes-l8w8oo` alignée sur `origin/main` (0 avance / 0 retard)
au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3861 paquets), puis
`npx prisma generate --generator client` dans `packages/shared`. Suite
`packages/shared/__tests__/utils/time-remaining.test.ts` verte au départ (6 tests).

**Audit anti-doublon** (10 PRs ouvertes au départ, toutes jcnm : #3242→#3258 — invariants
`endMs≥startMs`, `chunk()`, `MyMentionsQuerySchema`, primitives de rôle, Focal grouping, converter
v1→v3, iOS pickers/VoiceOver, Android lock). **Aucune PR ouverte ne touche
`packages/shared/utils/time-remaining.ts`** — zéro chevauchement de fichier. Cible non listée dans
les « améliorations futures » des itérations récentes : c'est une découverte de cette passe.

## Sélection : **Priorité 1 — durcissement de contrat sur une loi partagée récente (rendu client d'un compte à rebours)**

`formatTimeRemaining` (introduite iter 59) est la source UNIQUE du formatage « temps restant avant
expiration » consommée par trois sites web de production : `v2/StatusBar.tsx` (badge d'expiration de
statut), `v2/StoryViewer.tsx` (overlay story), `lib/story-transforms.ts`. C'est du code récent, à
une frontière de rendu où l'entrée vient d'un timestamp potentiellement absent — exactement la classe
« feature récemment développée » que la stratégie priorise.

## Current state (avant correctif)

```ts
export function formatTimeRemaining(targetMs: number, nowMs: number): string | null {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return null;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return `${hours}h${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`;
  return `${Math.max(1, minutes)}m`;
}
```

Les trois appelants passent `new Date(x.expiresAt).getTime()` comme `targetMs`. Or :

- `new Date(undefined).getTime()` → **`NaN`** (champ `expiresAt` absent / payload partiel).
- `new Date('malformé').getTime()` → **`NaN`**.

Avec `targetMs = NaN` : `diffMs = NaN`, `NaN <= 0` est **`false`** (la garde de sortie ne se
déclenche PAS), `minutes = Math.floor(NaN) = NaN`, `hours >= 1` est `false`, la fonction retourne
`` `${Math.max(1, NaN)}m` `` = **`"NaNm"`**. Sur `targetMs = Infinity` → **`"Infinityh"`**.

Reproduction (avant correctif) :
```
formatTimeRemaining(new Date('nope').getTime(), now) => "NaNm"
formatTimeRemaining(Infinity, now)                    => "Infinityh"
```

## Problems identified

1. **Chaîne visible à l'écran (`"NaNm"` / `"Infinityh"`).** `StatusBar.tsx:40` fait
   `formatTimeRemaining(...) ?? 'Expire'` — mais comme la fonction retourne une CHAÎNE (non `null`),
   le repli `?? 'Expire'` est court-circuité et l'utilisateur voit littéralement `NaNm`. Idem sur
   l'overlay `StoryViewer` et `story-transforms`.
2. **Incohérence avec ses deux jumelles.** `formatClock` (`duration-format.ts`) ramène tout non-fini
   à `0` (`Number.isFinite ? … : 0`) ; `isExpired` (`apps/web/utils/time-remaining.ts`) documente
   « une date invalide (`NaN`) → `false` ». Seule `formatTimeRemaining`, la troisième loi du même
   domaine `expiresAt`, ne portait aucune garde de finitude.

## Root causes
- La garde de sortie `diffMs <= 0` a été pensée comme couvrant « le zéro et le passé », mais `NaN`
  n'est ni `<= 0` ni `> 0` : il traverse toute comparaison en `false`. L'arithmétique en aval
  propage alors le `NaN`/`Infinity` jusqu'au template littéral, sans jamais retomber sur le repli
  `null` prévu pour « pas de compte à rebours ».

## Business impact
- **Visible utilisateur.** Un statut ou une story dont le `expiresAt` est absent (payload partiel,
  entité sans expiration, réponse tronquée) affiche `NaNm` dans le badge d'expiration au lieu du
  repli propre `Expire` / rien — un artefact de développeur qui fuit en production.

## Technical impact
- Nul en runtime hors chemin d'entrée invalide. Le correctif est purement additif (une garde en
  tête), le type de retour `string | null` est inchangé, les 6 comportements existants intacts.

## Risk assessment
- **Très faible.** Un `if` en tête qui n'intercepte QUE les entrées non finies (aujourd'hui rendues
  en `"NaNm"`, un état déjà cassé). Aucun chemin fini n'est modifié. Rollback = revert d'un commit.

## Proposed improvements
- Ajouter `if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;` en tête de
  `formatTimeRemaining`, alignant la loi sur la garde `Number.isFinite` de `formatClock` et sur la
  sémantique « date invalide → pas de compte à rebours » de `isExpired`.

## Expected benefits
- Un `expiresAt` absent/malformé retombe silencieusement sur le repli des appelants (`Expire` pour
  `StatusBar`, rien pour `StoryViewer`/`story-transforms`) — jamais `"NaNm"`.
- Trois lois du domaine `expiresAt` désormais cohérentes sur le traitement du non-fini.

## Implementation complexity
- **Triviale.** 1 ligne de garde + doc, 1 test (4 assertions non finies). 2 fichiers.

## Validation criteria
- [x] RED prouvé : `formatTimeRemaining(NaN, NOW)` renvoyait `"NaNm"` (test rouge confirmé).
- [x] GREEN : `time-remaining.test.ts` 7/7 (6 existants + 1 non-fini à 4 assertions).
- [x] Suite shared vitest : **2329/2329** verts (96 fichiers) — aucune régression.
- [x] `tsc --noEmit` propre sur `packages/shared`.
- [x] `bun run build` (shared) propre.
- [ ] CI verte sur la branche (gate lint/bun réel).
