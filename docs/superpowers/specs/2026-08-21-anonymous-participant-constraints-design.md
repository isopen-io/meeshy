# Contraintes d'entrée d'un participant sans compte — fiche et pilotage

*2026-08-21*

## Problème

Un visiteur entré par lien de partage n'a pas de page `/u/`. Les surfaces de
conversation le traitent pourtant comme un inscrit : `MessageBubble`,
`MessageReplyPreview`, `conversation-participants`, `FocalIdentityHeader`
pointent vers `/u/${username}` sans garde d'anonymat, et `MessageNameDate` rend
un `<span>` inerte — un nom qu'on ne peut pas interroger.

La fiche qui devrait les accueillir existe déjà
(`GET /conversations/:id/participants/:participantId/profile`, `ParticipantProfileCard`
web, `ParticipantProfileSheet` iOS) mais n'est branchée que sur le tiroir des
participants, et n'énonce du lien d'entrée que son *nom*. Ce que la personne a
le droit de faire dans la salle — écrire, joindre un fichier, voir l'avant — est
invisible à tous, y compris à l'hôte qui l'a configuré.

## Ce que le code impose au design

**`Participant.permissions` est un instantané figé au join** (`anonymous.ts:400`),
et c'est lui qui régit l'envoi à l'exécution — `auth.ts:426-434` résout
`anonymousSession.rights ?? permissions`, sans jamais relire le lien. Une fiche
qui recopierait `shareLink.allow*` mentirait dès que l'hôte a modifié son lien
après coup.

**`allowViewHistory` suit un régime opposé** : relu en direct sur le lien par
`historyFloorFor` (`services/shareLinkHistoryFloor.ts`), pour les trois surfaces
de lecture (messages, `/sync`, galerie).

**`AnonymousRightsOverride` est du code mort** : le type existe
(`schema.prisma:62`), `auth.ts:429` le lit et le fait primer — aucun écrivain
n'existe dans le dépôt. La surcharge par participant est câblée côté lecture
depuis toujours ; il ne manque que la route qui l'écrit.

**Ni `ParticipantPermissions` ni `AnonymousRightsOverride` ne portent
`canViewHistory`.**

## Décisions

1. **Périmètre** : les participants anonymes (`Participant.type === 'anonymous'`).
   Discriminant existant : `isAnonymousSender()` (`packages/shared/utils/sender-identity.ts`).

2. **Deux cercles**, prolongeant la doctrine déjà appliquée à `email` / `birthday` :
   - *capacités* (ce que la personne peut faire) → **tout membre** ;
   - *réglages du lien* (quotas, expiration, exigences, pays/langues) → **admins
     et modérateurs**.
   `allowedIpRanges` n'est **jamais** exposé : configuration de sécurité, aucun usage UI.

3. **`canViewHistory` est figé au join**, comme les autres capacités : la
   personne est entrée sous les conditions du moment. Il est affiché à tous.

4. **L'hôte pilote les droits du participant, plus ceux du lien.** Figer
   `canViewHistory` retire à l'hôte le levier « je décoche sur le lien et
   l'historique se ferme pour tous ». Son remplaçant est la surcharge par
   participant. Les deux arrivent dans le même lot : à aucun moment l'hôte n'est
   sans levier.

5. **Un droit non touché par l'hôte reste `null` dans la surcharge**, donc suit la
   valeur du join. La surcharge est un delta, jamais une copie.

## Lot 1 — La fiche en lecture

### Résolution des droits, énoncée une fois

`auth.ts:426-434` porte aujourd'hui la seule expression de `rights ?? permissions`.
La fiche en a besoin, le plancher d'historique en aura besoin au lot 2 : trois
lecteurs de la même règle divergeraient. Extraction dans
`services/gateway/src/services/participantRights.ts` :

```ts
export function resolveParticipantRights(participant: {
  permissions: ParticipantPermissions;
  anonymousSession?: { rights?: AnonymousRightsOverride | null } | null;
}): ResolvedParticipantRights
```

`auth.ts` devient un appelant. Aucun changement de comportement.

### Contrat

`GET /conversations/:id/participants/:participantId/profile` gagne deux blocs.
`shareLinkName` est conservé (compatibilité).

```
entryCapabilities   cercle 1 — tout membre ; null si le participant n'est pas anonyme
  canSendMessages, canSendFiles, canSendImages, canSendVideos,
  canSendAudios, canSendLocations, canSendLinks, canViewHistory

entryLink           cercle 2 — admins/modérateurs ; null sinon
  name, isActive, expiresAt, maxUses, currentUses,
  requireNickname, requireEmail, requireBirthday,
  allowedCountries, allowedLanguages
```

Au lot 1, `canViewHistory` est lu sur le lien (comportement inchangé). Au lot 2 il
passe par la résolution figée, sans changer la forme du contrat.

L'arbitrage du second cercle réutilise `viewerHostsTheRoom`, déjà calculé dans la
route : aucune logique d'autorisation nouvelle.

### Web

Un `ParticipantProfileProvider`, monté une fois par conversation, porte le
`ParticipantProfileDialog` et expose `openParticipantProfile(participantId)`.
Chaque surface consomme le contexte au lieu de gérer son propre état.

Surfaces câblées : `MessageNameDate`, `MessageBubble` (nom + avatar),
`MessageReplyPreview`, `conversation-participants`, `FocalIdentityHeader`, et
`conversation-participants-drawer` qui migre vers le contexte.

Après ce lot, **aucune surface conversation n'émet de lien `/u/` pour un anonyme.**

### iOS

`ConversationParticipantProfile` gagne les deux blocs. `ParticipantProfileSheet`
gagne deux sections ; celle du lien n'est rendue que si `entryLink != nil`. Les
surfaces bulles / Focal / liste ouvrent la feuille. Le vocabulaire des contraintes
existe dans `ShareLinkModels.swift` et sert de référence de nommage.

Gardes iOS : catalogue 7 langues, aucune clé morte, `==` manuel sur les nouveaux
types `Equatable`.

## Lot 2 — Droits figés et pilotables

### Schéma

`canViewHistory: Boolean @default(true)` sur `ParticipantPermissions` ;
`canViewHistory: Boolean?` sur `AnonymousRightsOverride`. Le join anonyme le pose
depuis `shareLink.allowViewHistory` (`anonymous.ts:400`).

### Plancher d'historique

`historyFloorFor` accepte la valeur résolue et la fait primer ; le lien ne sert
plus que de repli :

```
droit figé connu (booléen)  → il décide
droit figé ABSENT           → lien en direct (comportement actuel)
```

Le repli n'est pas une précaution de style : les participants créés avant ce lot
n'ont pas le champ, et sur MongoDB un champ **absent** ne matche ni `null` ni
`NOT null` (piège documenté dans `packages/shared/CLAUDE.md`). Aucune migration
de données n'est requise, et aucun visiteur existant ne voit son accès changer.

Les trois appelants (`messages.ts`, `/sync`, galerie) héritent de la règle sans
la réécrire ; leurs `select` chargent `permissions` et `anonymousSession.rights`.

### Mutation

`PATCH /conversations/:id/participants/:participantId/rights`, réservée
admin/modérateur, sur le patron de `/participants/:userId/role`
(`participants.ts:1064`). Corps : sous-ensemble des 8 droits. Écrit
`anonymousSession.rights` — premier écrivain du type. Refuse un participant non
anonyme (`400`).

Émet `participant:rights-updated` (patron : `participant:role-updated`, déjà au
contrat) vers la room de conversation et la room personnelle du participant, pour
que l'intéressé voie ses droits changer sans recharger.

### UI d'édition

Dans la fiche, visible aux hôtes seulement : les capacités deviennent des
interrupteurs. Un droit remis à sa valeur d'origine efface son entrée de la
surcharge plutôt que d'y écrire la même valeur — la surcharge reste un delta.

## Tests

**Gateway** — membre ordinaire : `entryLink` nul, `entryCapabilities` présent ·
hôte : les deux · participant inscrit : les deux nuls · `rights` divergent de
`permissions` : c'est `rights` qui sort · plancher : droit figé absent → lien en
direct, droit figé présent → il décide · `PATCH` par un membre ordinaire : 403 ·
`PATCH` sur un inscrit : 400 · surcharge partielle : les droits non nommés
restent intacts.

**Web** — un expéditeur anonyme n'émet aucun `<a href="/u/…">` sur aucune
surface ; le clic ouvre la fiche ; la section lien est absente pour un membre
ordinaire.

**iOS** — décodage des deux blocs, dont leur absence ; feuille rendue sans la
section lien quand `entryLink` est nul.

## Hors périmètre

Le feed social et les commentaires : un anonyme n'y existe pas. Les participants
`type === 'bot'` : pas de lien d'entrée, donc pas de contraintes à énoncer.
