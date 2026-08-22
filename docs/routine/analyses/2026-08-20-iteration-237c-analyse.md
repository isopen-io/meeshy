# Iteration 237 — Le mode de lecture Focal regroupait la première bulle d'un arrivant avec son propre avis système

## Protocole (démarrage)
`main` @ `1f74d5f2` (dernier commit : `feat(android/conversations): row mood badge wires
peer's ephemeral status emoji (parity iOS) (#3246)`). Branche
`claude/brave-archimedes-f8kc15` alignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3861 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite web
`focal-row-utils` verte au départ (22 tests) ; suites Focal complètes vertes (14 suites).

**Audit anti-doublon** (4 PRs ouvertes au départ) : #3245 (convertisseur v1→v3 timing objet),
#3243 (refactor `endMs>=startMs` source unique), #3242 (écoute continue socket `endMs`), #3241
(iOS « Membres »). **Aucune PR ouverte ne touche
`apps/web/components/conversations/focal/focal-row-utils.ts`** — zéro chevauchement de fichier.

## Sélection : **Priorité 1 — jumeau non corrigé d'un défaut récemment réparé (2026-08-20)**

Le commit `368b936f` (2026-08-20, « un message système n'est pas une prise de parole ») a extrait
un résolveur pur `apps/web/utils/message-grouping.ts` et corrigé le regroupement des bulles de la
liste simple ET virtualisée (`messages-display.tsx`) : **un message SYSTÈME forme toujours son
propre groupe**. La cause : l'avis d'arrivée est écrit avec l'arrivant pour AUTEUR
(`packages/shared/utils/join-notice.ts`), si bien que comparer les seuls `senderId` groupait la
première vraie bulle du nouveau venu avec l'annonce de sa propre arrivée — la bulle perdait alors
avatar, nom et horodatage d'un coup.

Ce correctif a été posé sur la vue Bulles **uniquement**. Le mode de lecture **Focal**
(`FocalThread`, monté par `apps/web/components/conversations/ConversationMessages.tsx:635`) porte
sa PROPRE loi de regroupement, `isFirstInFocalGroup` (`focal-row-utils.ts:178`), qui n'a jamais
reçu la correction. C'est exactement la classe « jumeau de contrat portant le même défaut de
naissance » que les itérations 235/236 ont priorisée.

## Current state (avant correctif)

```ts
export function isFirstInFocalGroup(
  current: Pick<Message, 'senderId'>,
  previous: Pick<Message, 'senderId'> | null | undefined
): boolean {
  if (!previous) return true;
  return previous.senderId !== current.senderId;
}
```

`FocalRow` ne monte `FocalIdentityHeader` (pastille + nom + heure de tête de groupe) que lorsque
`isFirstInFocalGroup` est vrai (`FocalRow.tsx:159` : `density === 'script' || isFirstInFocalGroup(...)`).
Séquence réelle en conversation de groupe :

| rang | message | `messageSource` | `senderId` | `isFirstInFocalGroup` (avant) |
|------|---------|-----------------|-----------|-------------------------------|
| n | avis d'arrivée de Bob | `system` | `bob` | `true` (auteur ≠ précédent) |
| n+1 | **première vraie bulle de Bob** | `user` | `bob` | **`false`** ← bug |

La bulle n+1 est donc rendue comme une continuation de l'avis système de Bob et perd ses trois
marqueurs d'identité. Le mode Focal ne s'offre qu'aux conversations de groupe (`resolveCapabilities`,
≥ 5 participants actifs, jamais `direct`) — précisément là où des arrivées par lien surviennent
en permanence.

## Problèmes identifiés
- **Défaut de justesse d'affichage** : perte d'identité (avatar/nom/heure) sur la première bulle
  de tout arrivant, dans le mode Focal.
- **Duplication de règle** : deux lois de regroupement coexistaient (`message-grouping.ts` corrigée,
  `isFirstInFocalGroup` non corrigée) — violation directe de « Single Source of Truth ».

## Root cause
La correction 2026-08-20 a été appliquée à la loi de la vue Bulles sans propager au jumeau Focal,
extrait plus tôt et laissé en comparaison `senderId`-seul.

## Business impact
Un nouvel arrivant (surtout un visiteur anonyme arrivé par lien, cas le plus fréquent) voit sa
première prise de parole affichée sans identité en mode Focal — bulle orpheline, illisible quant à
qui parle. Dégrade la première impression sur exactement le flux d'onboarding le plus exposé.

## Technical impact
Aucun changement de contrat réseau ni de schéma. Un seul fichier source web modifié + son test.
Le mode Focal converge sur la MÊME loi que la vue Bulles.

## Risk assessment
Très faible. La fonction est pure ; le changement N'AJOUTE que des ouvertures de groupe (jamais
n'en retire) ; le court-circuit `density === 'script'` reste intact ; la branche « même auteur
enchaîne » demeure. Aucun consommateur iOS/Android (`focal-row-utils.ts` est un util web du mode
de lecture Focal ; le jumeau iOS/Android éventuel du mode Rivière passe par la loi partagée
`river-lanes.ts`, hors périmètre — voir « Améliorations futures »).

## Proposed improvement (retenu)
Faire **déléguer** `isFirstInFocalGroup` au résolveur canonique `message-grouping.ts` (déclaré UNE
SEULE FOIS), via un simple adaptateur de forme (`senderId` plat → `sender.id`). La règle « un
message système forme son propre groupe » cesse d'exister en deux exemplaires.

## Expected benefits
- Identité restaurée sur la première bulle d'un arrivant en mode Focal.
- Une seule loi de regroupement pour la vue Bulles ET le mode Focal.

## Implementation complexity
Triviale : un fichier source (délégation + import), un fichier de test (2 cas système ajoutés,
3 cas existants complétés du champ `messageSource` désormais requis par la signature).

## Validation criteria
- RED prouvé : avec l'ancien corps, `isFirstInFocalGroup({senderId:'u1',source:'user'},
  {senderId:'u1',source:'system'})` retourne `false` ; le nouveau test l'exige à `true`.
- `focal-row-utils.test.ts` : 24/24 (22 + 2).
- Suites Focal complètes : 14 suites / 145 tests verts.
- `tsc` : 0 erreur dans `focal-row-utils.ts` et son test (le dépôt porte 1266 erreurs `tsc`
  préexistantes hors périmètre — `tsc --noEmit` web n'est pas le gate CI).

## Améliorations futures (hors périmètre)
1. **Loi partagée `river-lanes.ts` (`isGroupHead`).** Le mode Rivière consomme
   `packages/shared/utils/river-lanes.ts`, dont `isGroupHead` compare `senderId` + jour SANS notion
   de message système. `RiverMessageInput` ne porte AUCUN drapeau système : la correction y exige
   d'étendre le type d'entrée ET de mettre à jour le miroir iOS `MessageListViewController.isFirstInGroup`
   (la loi se déclare « règle d'iOS mot pour mot »). Changement cross-plateforme à peser séparément,
   avec toolchain iOS accessible.
2. **Monotonie de collection** (rappel des itérations 234/236) : `transcriptionSegmentSchema[]`,
   `KeyframeSchema.time[]`.
