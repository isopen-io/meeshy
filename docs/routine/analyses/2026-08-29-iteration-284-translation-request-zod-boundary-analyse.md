# Itération 284 — `translation:request` valide sa frontière socket par Zod (parité douze familles)

## État actuel

Le handler `translation:request` (`CLIENT_EVENTS.REQUEST_TRANSLATION`) était le
DERNIER site d'écoute Socket.IO du gateway à lire une charge cliente sans passer
par la frontière Zod partagée. Enregistré inline dans `MeeshySocketIOManager`
(pas délégué à une classe de handler), il déléguait à `_handleTranslationRequest`,
typé `(data: { messageId: string; targetLanguage: string })` — une simple
annotation TypeScript, **aucun contrôle d'exécution**.

`data.messageId` filait directement dans `prisma.message.findUnique({ where: { id:
data.messageId } })` (colonne ObjectId), et `data.targetLanguage` dans
`translationService.getTranslation(...)`.

Les DOUZE familles de handlers délégués (Message, Reaction, AttachmentReaction,
CommentReaction, PostReaction, Location, Conversation, Status, Auth, AdminAgent…)
valident déjà par `validateSocketEvent(<ZodSchema>, data)` ; les 19 événements
d'appel de `CallEventsHandler` aussi. `translation:request` divergeait seul.

## Problèmes identifiés

1. **Charge cliente non-ObjectId jusque dans une requête Prisma.** Un `messageId`
   non-ObjectId (chaîne lisible, `undefined`, nombre, objet) atteignait la
   colonne ObjectId : `Malformed ObjectID` (moteur) ou
   `PrismaClientValidationError` (client généré), avalé par le `catch` du site
   d'appel en une erreur opaque `'Failed to get translation'` — le client ne
   sait pas que sa charge était malformée. C'est exactement la classe de bug que
   `SocketMessageSendSchema` prévient déjà pour ses références de transfert
   (`forwardedFromId`, `copyAttachmentsFromMessageId` : « validated as ObjectIds
   so malformed strings are rejected at the schema boundary before reaching the
   DB query »).

2. **Incohérence de contrat.** Un schéma approprié existait déjà
   (`SocketTranslationRequestSchema`, `validation/socket-event-schemas.ts:125`),
   exporté avec son type inféré `SocketTranslationRequestData`, et **simplement
   pas câblé** à ce site — `MeeshySocketIOManager` n'importait ni
   `socket-event-schemas` ni `validateSocketEvent`.

3. **Annotation de wrapper mensongère.** Le wrapper `.on` annotait
   `(data: { messageId: string; targetLanguage: string })`, redéclarant en pire
   le contrat typé `RequestTranslationData` que `typed-socket.ts` fournit déjà.

## Causes racines

Le handler a été écrit inline dans le manager avant l'extraction de la frontière
Zod partagée, et n'a jamais été porté quand les douze familles déléguées
l'ont adoptée (itérations 280-281, `AttachmentReactionHandler` puis
`LocationHandler`). Le suivi « la douzième famille » (leçon cycle 107) énumérait
les familles DÉLÉGUÉES ; ce site n'est pas délégué, donc invisible à cette
énumération — retrouvé par un balayage exhaustif des sites `socket.on(` du
gateway (candidat #1 du sous-agent d'exploration).

## Impact métier

Bouton « traduire ce message » : une charge malformée (bug client, version
divergente, appel forgé) recevait une erreur opaque au lieu d'un refus net de
validation. Surface d'appel Prisma non gardée exploitable pour du bruit
(exceptions moteur) par tout socket authentifié.

## Impact technique

Un site de désérialisation non gardé sur une colonne ObjectId. Dimension
**Sécurité** (garde de frontière fail-closed) et **Cohérence** (parité de
positionnement : même geste ⇒ même garde sur les treize familles socket).

## Évaluation du risque

Faible. Le schéma existait déjà et est éprouvé ; les clients réels envoient de
vrais ObjectIds (24 hex), donc le trafic nominal est inchangé. Seules les charges
malformées changent de comportement (refus explicite au lieu d'erreur opaque).

## Améliorations proposées (livrées)

- Importer `validateSocketEvent` / `isValidationFailure` et
  `SocketTranslationRequestSchema` dans `MeeshySocketIOManager`.
- Valider en tête de `_handleTranslationRequest`, AVANT toute requête ; sur échec,
  `socket.emit(SERVER_EVENTS.ERROR, { message: validation.error })` (préfixe
  unifié `'Validation failed: …'`) et retour. Signature passée à `data: unknown`.
- Consommer les valeurs validées (`messageId`, `targetLanguage`) partout dans le
  handler.
- Retirer l'annotation mensongère du wrapper `.on` (inférée en
  `RequestTranslationData`).

## Bénéfices attendus

Frontière fail-closed sur les treize familles socket, sans exception. Erreur de
validation lisible côté client. Aucune requête Prisma sur charge malformée.

## Complexité d'implémentation

Triviale : 2 imports, 1 bloc de validation, renommage de références,
alignement des fixtures de test (ObjectIds valides via le helper `convId`
existant) + 3 nouveaux témoins de frontière.

## Critères de validation

- `tsc --noEmit` gateway : 0 erreur. ✅
- `MeeshySocketIOManager.test.ts` : 416/416. ✅
- `src/socketio` (54 suites) : 1705/1705. ✅
- Nouveaux témoins prouvent le refus (aucun `findUnique`, aucun `getTranslation`)
  sur `messageId` non-ObjectId, `targetLanguage` absent, charge non-objet. ✅
