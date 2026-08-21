# Contraintes d'entrée d'un participant sans compte (2026-08-21)

Spec : `docs/superpowers/specs/2026-08-21-anonymous-participant-constraints-design.md`
Branche : `feat/anonymous-participant-constraints`

## Lot 1 — La fiche en lecture

- [ ] 1.1 `services/participantRights.ts` : extraire `resolveParticipantRights` (`rights ?? permissions`) ; `auth.ts` devient appelant
- [ ] 1.2 Types partagés : `ParticipantEntryCapabilities`, `ParticipantEntryLink`
- [ ] 1.3 Route profile : `entryCapabilities` (cercle 1) + `entryLink` (cercle 2, `viewerHostsTheRoom`)
- [ ] 1.4 Web : `ParticipantProfileProvider` + `openParticipantProfile()`
- [ ] 1.5 Web : sections capacités / lien dans `ParticipantProfileCard`
- [ ] 1.6 Web : câbler `MessageNameDate`, `MessageBubble`, `MessageReplyPreview`, `conversation-participants`, `FocalIdentityHeader`, migrer le tiroir
- [ ] 1.7 iOS : `ConversationParticipantProfile` + deux sections dans `ParticipantProfileSheet`
- [ ] 1.8 iOS : câbler les surfaces + catalogue 7 langues
- [ ] 1.9 Gate lot 1 : gateway + web + iOS verts

## Lot 2 — Droits figés et pilotables

- [ ] 2.1 Schéma : `canViewHistory` sur `ParticipantPermissions` (`@default(true)`) et `AnonymousRightsOverride` (nullable)
- [ ] 2.2 Join anonyme : poser `canViewHistory` depuis `shareLink.allowViewHistory`
- [ ] 2.3 `historyFloorFor` : droit figé prime, lien en repli quand le champ est ABSENT (legacy)
- [ ] 2.4 `PATCH /conversations/:id/participants/:participantId/rights` (admin/modérateur, anonymes seuls)
- [ ] 2.5 Événement `participant:rights-updated` (conversation + room personnelle)
- [ ] 2.6 Web : interrupteurs d'édition pour les hôtes + écoute socket
- [ ] 2.7 iOS : idem
- [ ] 2.8 Gate lot 2 : gateway + web + iOS verts

## Revue
