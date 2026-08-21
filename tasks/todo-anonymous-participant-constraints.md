# Contraintes d'entrée d'un participant sans compte (2026-08-21)

Spec : `docs/superpowers/specs/2026-08-21-anonymous-participant-constraints-design.md`
Branche : `feat/anonymous-participant-constraints`

## Lot 1 — La fiche en lecture

- [x] 1.1 `services/participantRights.ts` : `resolveParticipantRights` extrait de `auth.ts`
- [x] 1.2 Types partagés : `ParticipantEntryCapabilities`, `ParticipantEntryLink`
- [x] 1.3 Route profile : `entryCapabilities` (cercle 1) + `entryLink` (cercle 2)
- [x] 1.4 Web : `ParticipantProfileProvider` + contexte séparé du dialogue
- [x] 1.5 Web : sections capacités / lien dans `ParticipantProfileCard`
- [x] 1.6 Web : `MessageNameDate`, `MessageReplyPreview`, `conversation-participants`, `FocalIdentityHeader`, tiroir migré
- [x] 1.7 iOS : `ConversationParticipantProfile` + deux sections dans la feuille
- [x] 1.8 iOS : routage `ProfileSheetUser` → fiche, catalogue 7 langues
- [x] 1.9 Gate lot 1 : gateway, web, iOS verts

## Lot 2 — Droits figés et pilotables

- [x] 2.1 Schéma : `canViewHistory` sur `ParticipantPermissions` et `AnonymousRightsOverride`
- [x] 2.2 Join anonyme : `canViewHistory` figé depuis `shareLink.allowViewHistory`
- [x] 2.3 `historyFloorFor` : droit figé prime, lien en repli quand le champ est ABSENT
- [x] 2.4 `PATCH …/participants/:participantId/rights` (hôtes, anonymes seuls, delta)
- [x] 2.5 `participant:rights-updated` → room conversation + room personnelle
- [x] 2.6 Web : interrupteurs + mutation optimiste + écoute socket
- [x] 2.7 iOS : interrupteurs + écoute socket
- [x] 2.8 Gate lot 2

## Revue

**Écarts corrigés au passage** (trouvés, pas cherchés) :
- `MessageBubble` v2 liait `/u/{pseudo}` pour un anonyme — `isAnonymous` était affiché mais jamais consulté.
- `conversation-participants` dédoublonnait sur `userId`, ce qui écartait **tous** les anonymes en silence : sa branche `isAnonymous` était écrite et jamais rendue.
- `ProfileSheetUser.from(message:)` recopiait un `Participant.id` dans `userId` — la feuille de profil iOS partait chercher un compte inexistant.
- `AnonymousRightsOverride` : type lu par `auth.ts` depuis toujours, sans aucun écrivain. La route `PATCH …/rights` est son premier.

**Décisions notables** :
- `canViewHistory` ABSENT ⇒ repli sur le lien, jamais « faux ». Sur MongoDB un champ absent ne matche ni `null` ni `NOT null` ; le lire comme un refus aurait fermé l'historique à toute la population existante sans qu'aucune requête ne le signale. Aucune migration de données requise.
- Le figeage et son levier de remplacement (`PATCH …/rights`) sont livrés ensemble : à aucun moment l'hôte n'est sans contrôle.
- Vocabulaire des refus aligné sur `bubble.joinNotice.rule.*`, déjà au catalogue.

**Gates, sur l'état FUSIONNÉ avec `origin/main` (7f1de533f, lots B + F inclus)** :
- gateway : 804/804 suites, 18797/18797 tests
- web : 741/742 suites, 13876/13898 tests
- iOS : les 4 phases vertes (3685 SDK · 3148 UI · 3005 isolées · 4169 contenu)

Unique rouge, étranger à ce lot : `LentilleRow.live-time` suppose que la machine tourne en UTC — il attend `"23:59"` et reçoit `"01:59"` en UTC+2. **Prouvé** : `TZ=UTC bun run test -- --testPathPatterns=LentilleRow.live-time` passe. Invisible en CI, qui tourne en UTC. Correctif suggéré (hors périmètre) : figer le fuseau dans le test.

**Deux régressions introduites puis corrigées ici**, l'une et l'autre invisibles au build :
- `MessageSocketProviding` étendu ⇒ les deux `MockMessageSocket` ne conformaient plus. Le build de l'app restait VERT ; seul le bundle de tests ne compilait pas (exit 65).
- `FocalNoBubbleSourceGuardTests` (§5.1) interdit tout signal d'identité brut hors du résolveur et de `Focal/Core/` ; construire le `ProfileSheetUser` dans `Row/` y introduisait le jeton `isAnonymous`. Vérifié par simulation de la garde : verte sur `main`, rouge avec le diff, 33 fichiers balayés. La construction est descendue dans `FocalRowInput` (Core), la rangée ne fait plus que transmettre.

**Reste ouvert** : le handle de l'avis d'arrivée (`bubble-join-notice-handle`) a son propre rendu, hors chaîne d'identité — il n'ouvre pas la fiche. Signalé par la session 6240 ; à câbler si la surface est jugée nécessaire.
