# Iteration 234 — `transcriptionSegmentSchema` acceptait `endMs < startMs` (invariant temporel manquant)

## Protocole (démarrage)
`main` @ `4b6f6342` (dernier commit : `feat(android): conversation-row tag chips with "+N" overflow (#3232)`).
Branche `claude/brave-archimedes-3q4yy5` alignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts`, puis
`npx prisma generate --generator client` dans `packages/shared`. Suite vitest partagée verte au
départ (`attachment-validators` : 37/37 ; suite complète : 2314/2314).

**Audit anti-doublon** (13 PRs ouvertes au départ) : les PRs jcnm en vol portent les itérations
222→232 (séquences `$`, focal quote, ZMQ audio dedup, parité langue TS↔Swift, pickers iOS) + PRs
Dependabot + une PR Jules iOS. **Aucune PR ouverte ne touche
`packages/shared/utils/attachment-validators.ts`** — zéro chevauchement de fichier. La cible est
explicitement listée comme candidat non-retenu (#3) dans les « Améliorations futures » de
l'itération 233.

## Sélection : **Priorité 1 — durcissement de contrat sur une feature récente (validation Zod au JSON boundary)**

`attachment-validators.ts` est la frontière de confiance unique qui valide les payloads de
transcription/traduction d'attachements avant persistance. `transcriptionSegmentSchema` y modélise
un **segment temporel** (`startMs`, `endMs`). C'est du code de validation récent, exactement la
classe « feature récemment développée » que la stratégie priorise.

## Current state (avant correctif)

```ts
export const transcriptionSegmentSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  ...
});
```

Les deux bornes sont contraintes `nonnegative`, mais **aucune relation entre elles** n'est vérifiée.
Un segment `{ startMs: 100, endMs: 50 }` — un intervalle temporel qui se termine AVANT de commencer —
passe la validation.

## Problems identified

1. **Invariant temporel absent.** `endMs >= startMs` est une propriété définitionnelle d'un segment
   de temps ; sa violation décrit une donnée corrompue. La sanité numérique était affirmée
   verticalement (chaque borne `>= 0`) mais pas relationnellement (borne haute `>=` borne basse).
2. **Incohérence de rigueur au sein du MÊME schéma.** Le schéma rejette déjà `startMs: -1` et
   `endMs: -1` (`nonnegative`) ; il laissait pourtant passer `endMs < startMs`, qui est le même
   registre de garantie (« ces millisecondes ont un sens »).

## Root causes
- Le schéma a été écrit champ-par-champ (validation locale à chaque clé) sans clause `.refine`
  cross-field. Zod n'exprime une contrainte inter-champs que via `.refine`/`.superRefine`, absente
  du fichier jusqu'ici.

## Business impact
- Faible en 5.101.x : les segments alimentent l'affichage de transcription (Prisme Linguistique).
  Un segment inversé produirait un affichage/tri temporel incohérent, mais le translator (Whisper)
  émet en pratique des timestamps monotones. Le gain est **défensif** : fermer la porte avant qu'un
  backend futur / un bug de diarisation n'y fasse passer une donnée corrompue.

## Technical impact
- Aucun comportement observable ne change pour les données valides existantes. `endMs === startMs`
  (segment de durée nulle) reste accepté — la borne est `>=`, pas `>`.
- Blast radius **identique en nature** à la contrainte `nonnegative` préexistante :
  `parseAttachmentTranscription` utilise `safeParse` et renvoie un `ParseResult` doux
  (`{ ok: false, code: 'INVALID_TRANSCRIPTION' }`) — il ne throw jamais. Le pipeline audio dégrade
  gracieusement comme déjà pour un timestamp négatif.

## Risk assessment
- **Négligeable.** Recherche exhaustive : aucune référence externe à `transcriptionSegmentSchema`
  au-delà de sa définition (usages = `z.array(transcriptionSegmentSchema)` uniquement — compatible
  avec le `ZodEffects` que `.refine` produit). Aucun consommateur n'appelle `.extend()`/`.shape`/
  `.merge()`/`.pick()` dessus. Aucun fixture de test (shared ou gateway) ne pose `endMs < startMs`.
  `z.infer<typeof transcriptionSegmentSchema>` inchangé (le refine préserve le type).

## Proposed improvements
- Envelopper l'objet dans `.refine((s) => s.endMs >= s.startMs, { path: ['endMs'] })`.

## Expected benefits
- Contrat de segment temporel complet et interne-cohérent ; rejet défensif des données corrompues
  au JSON boundary, gracieusement (safeParse).

## Implementation complexity
- Triviale. Une clause `.refine`, deux tests (rejet `endMs < startMs`, acceptation durée nulle).

## Validation criteria
- [x] Test RED prouvant l'acceptation actuelle de `endMs < startMs`.
- [x] Test GREEN après refine (39/39 sur `attachment-validators`).
- [x] Test de non-régression : durée nulle acceptée (garde anti-sur-durcissement).
- [x] Suite shared complète verte (2314/2314).
- [x] `tsc --project` (strict) : build propre, type inféré inchangé.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)
- **Parité Pydantic (translator).** Le modèle Python côté `services/translator` qui émet ces segments
  gagnerait la même garantie `end_ms >= start_ms` en amont. Non testable dans cet environnement
  (pas de toolchain Python garantie) — candidat pour une itération ciblée translator.
- **Monotonie inter-segments.** Un tableau `segments` pourrait aussi vérifier que
  `segments[i].startMs >= segments[i-1].startMs` (ordre chronologique). Contrainte de collection,
  plus lourde, à peser séparément (certains diariseurs entrelacent les locuteurs).
- **Reprise des candidats 233 non retenus** : (#2) markdown attachments routés vers le viewer texte
  (arbitrage produit requis) ; dette de type `deletedConversationIds` sur les pages du cache infini.
