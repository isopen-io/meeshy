# Iteration 231 — Pipeline audio ZMQ : valider AVANT de consommer le slot de déduplication

## Protocole (démarrage)
`main` @ `7d23ec0f` (dernier commit : feat android — live sentiment emoji in the chat composer, #3224).
Branche `claude/brave-archimedes-y7lw3q` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité CI : `bun install --ignore-scripts`, puis
`cd packages/shared && npx prisma generate --generator client && bun run build`.

PRs ouvertes au démarrage — **audit anti-doublon** (12 PRs). Campagne « $-sequences » en cours
(#3218/#3220/#3222 gateway/web, #3225 parité TS↔Swift). **Zone volontairement évitée.** Aucune PR
ouverte ne touche `services/gateway/src/services/zmq-translation/ZmqMessageHandler.ts`. Zéro
chevauchement de fichier.

## Sélection : **Priorité 1 — correctness sur le pipeline audio récent (asymétrie de garde entre handlers sœurs)**

Un balayage du service `ZmqMessageHandler` révèle une **asymétrie de garde** entre deux handlers
sœurs qui partagent le même `Set<string> processedResults` de déduplication et la même hypothèse de
transport (ZMQ SUB = at-least-once) :

- `handleTranslationCompleted` (L229-281) **valide AVANT** de consommer le slot, avec un invariant
  documenté (L238-256) : une frame malformée ne doit PAS marquer `resultKey` comme traité, sinon le
  retry VALIDE (même `taskId`) serait droppé par le guard `has(resultKey)`.
- `handleAudioProcessCompleted` (L304-369) fait **l'INVERSE** : il stampe le slot (L311) **avant toute
  validation** — et ne validait `messageId` **nulle part**.

## Current state (avant correctif)

```ts
// ZmqMessageHandler.ts:306-315 (avant)
const resultKey = `audio_${event.taskId}`;
if (this.processedResults.has(resultKey)) { ...; return; }
this.processedResults.add(resultKey);      // <-- slot consommé EN PREMIER
if (this.processedResults.size > 1000) { ... }
// ...aucune validation de messageId en aval...
```

L'événement est injecté via `as unknown as AudioProcessCompletedEvent` (L131) — donc **donnée externe
non fiable** : le type statique `messageId: string` ne garantit rien au runtime.

## Problems identified

1. **Perte silencieuse d'une re-livraison audio VALIDE.** ZMQ SUB est at-least-once (hypothèse posée
   par le commentaire du handler de traduction). Si le translator livre d'abord une frame
   `audio_process_completed` incomplète (`messageId` absent/vide), la première livraison stampe
   `audio_${taskId}`. Quand le translator re-livre une frame **complète et valide** sous le **même
   `taskId`**, le guard `has(resultKey)` (L307) la **drop en silence** — le message ne reçoit jamais
   sa transcription ni ses audios traduits. Symptôme muet, exactement le mode d'échec contre lequel le
   handler de traduction a été durci.
2. **Incohérence de garde entre pipelines sœurs.** Deux handlers partageant le même Set de dédup et la
   même hypothèse de transport appliquent des politiques opposées de « valider vs. stamper » — dette
   de cohérence et piège pour toute évolution future.

## Root causes
- La règle « valider AVANT de consommer le slot at-least-once » a été établie et documentée sur le
  chemin de traduction (invariant L238-256) mais **jamais propagée** au chemin audio adjacent, plus
  récent.
- Le type déclaré `messageId: string` masquait le besoin de validation runtime, alors que la frame est
  castée depuis du JSON externe (`as unknown as`).

## Business impact
- Perte silencieuse de transcription + audios traduits pour un message dès qu'un retry translator
  suit une première frame incomplète. Le Prisme Linguistique est violé (contenu audio jamais traduit),
  sans aucune trace d'erreur exploitable côté produit. Le pipeline audio est un cœur différenciant.

## Technical impact
- Aligne le handler audio sur l'invariant déjà prouvé du handler de traduction. Une seule méthode, un
  seul fichier. Zéro nouvelle dépendance, zéro changement de contrat/type/schéma, zéro changement de
  chemin de lecture. Le format d'événement émis est inchangé pour toute frame valide.

## Risk assessment
**Très faible.**
- Le seul comportement qui change concerne les frames SANS `messageId` : auparavant émises + slot
  consommé → désormais rejetées sans consommer le slot (exactement la sémantique du handler de
  traduction). Toute frame valide (`messageId` présent) est strictement inchangée — non-régression
  prouvée par les 196 tests zmq-translation verts.
- Aucun consommateur en aval ne peut rien faire d'une frame sans `messageId` (rien à attacher).

## Proposed improvements
1. `handleAudioProcessCompleted` : insérer `if (!event.messageId) { log.error; return; }` **entre** le
   guard `has(resultKey)` et le `add(resultKey)` — valider avant de stamper.
2. Commentaire d'invariant en miroir de celui du handler de traduction (SSOT de la règle).

## Expected benefits
- Une re-livraison audio valide survit toujours à une première frame incomplète ; parité de garde
  totale entre les deux handlers sœurs.

## Implementation complexity
Très faible : +1 garde, +1 bloc de commentaire, +2 tests RED→GREEN (garde `messageId` vide ;
survie de la re-livraison valide sous même `taskId`).

## Validation criteria
- RED prouvé : 2 tests échouent (la frame malformée émet ET consomme le slot, droppant la re-livraison
  valide).
- GREEN : 131/131 sur `ZmqMessageHandler`, 196/196 sur l'ensemble `zmq-translation`, `tsc --noEmit` = 0.

## Future Considerations
- **Extraire la politique de dédup at-least-once** dans un helper partagé
  (`stampIfValid(resultKey, validate)`) pour que les deux handlers — et tout futur handler consommant
  `processedResults` — ne puissent plus diverger sur l'ordre « valider vs. stamper ». Candidat
  refactor à faible risque une fois la campagne `$-sequences` retombée.
- **Audit des autres handlers** consommant `processedResults` (voice API, progressive) pour confirmer
  qu'aucun ne stampe avant validation d'un champ requis en aval.
