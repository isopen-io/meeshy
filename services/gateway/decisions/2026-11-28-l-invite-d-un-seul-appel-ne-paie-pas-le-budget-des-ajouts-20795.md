## 2026-11-28 : L'invité d'un seul appel (`legacy-guest`) ne paie pas le budget des ajouts ; un refus vers un compte non ajoutable le paie, à l'appel comme à la route (#20795)

**Contexte.** Depuis #20740, faire sonner quelqu'un dans un appel du salon d'une communauté PRIVÉE
paie le budget des ajouts sans accord (`utils/community-addition-budget.ts`), parce que l'invitation
l'y fait ENTRER (`callInvitationRoute` → `admit-member`, porte `admitConversationMember`). L'audit de
#20740 a laissé deux questions : l'invité `legacy-guest`, et le refus gratuit.

**Décision 1 — `legacy-guest` ne paie pas : il n'entre nulle part.** Un ANCIEN membre du salon,
invité par un simple membre (sous MODERATOR), devient l'invité de CET appel seulement
(`callEntryForInvitee` → `guest-only`). Il ne reçoit qu'une participation INACTIVE
(`resolveInvitedGuestParticipantId`, `role: 'call-guest'`, aucun droit), ne relit ni le salon ni la
communauté, et aucune ligne `CommunityMember` ne s'écrit. Le budget compte des ENTRÉES sans accord
dans une communauté ; la sonnerie d'un appel n'en est pas une. Ce qui la borne est déjà écrit :
l'amitié acceptée exigée, l'appel en cours, le plafond de participants (sonneries comprises),
`SOCKET_RATE_LIMITS.CALL_INVITE`, l'échéance de l'invitation. Si un jour cet invité DÉCROCHE vers
une ligne active, c'est la porte d'admission qui le fait entrer, et elle paie.

**Décision 2 — un refus vers un compte non ajoutable se paie, sous la loi des routes (#20703).**
`authorizeCallInvitation` refusait gratuitement (`PERMISSION_DENIED` / `NOT_A_CONTACT`) une personne
bloquée avec un présent, désactivée ou bannie du salon, pendant qu'une personne ajoutable à seau
plein rendait `RATE_LIMITED` : la différence faisait de l'appel un sondage gratuit des comptes
ajoutables d'une communauté privée. Dans le salon d'une communauté privée, la tentative coûte
désormais ce que `planSalonEntry` coûterait : un refus d'AUTORISATION (l'inviteur ne peut faire
entrer personne, `invite-forbidden`) ne coûte rien ; une personne qui serait entrée coûte une unité
(`not-addable`, comme un identifiant sans compte à la route) ; un membre déjà actif n'entre pas et
ne coûte rien. Ne paient pas non plus : un salon fermé aux nouveaux membres (refusé gratuitement de
toute façon), et un ancien membre qui ne serait revenu qu'en invité de CET appel (`guest-only`,
décision 1 — accordé ou refusé, il ne coûte rien). Le seau de l'ACTEUR épuisé rend `RATE_LIMITED`,
quelle que soit la raison du refus. Limite assumée, mesurée par l'audit du lot : seul l'acteur est
débité sur un refus, donc quand c'est le seau de la CIBLE (ou de la paire) qui est plein, une cible
ajoutable rend `RATE_LIMITED` par l'admission et une cible bloquée `PERMISSION_DENIED` — ce que les
codes distinguaient déjà avant ce lot (#19650) ; l'oracle sur le blocage est TAXÉ, il n'est pas
fermé.

**Décision 3 — l'accusé dit quand réessayer.** `CallControlAck` porte `retryAfter` (secondes,
optionnel) sur un `RATE_LIMITED` dont le serveur connaît l'échéance. Ajout rétrocompatible : un
client qui ne le lit pas reste juste. Aucun client ne le lit encore (mesuré : web `call-decode.ts`,
iOS `MessageSocketManager+CallControls.swift`, Android `CallControlsSocket.kt`) : #20802.

**Décision 4 — un débit que Redis n'a pas compté ne se rend pas.** `consume` rend `null` sur une
panne (fail-open, #19812) ; le rendu armé par ce geste décrémentait quand Redis revenait, sur des
clés que d'autres gestes avaient comptées entre-temps. Chaque seau retient s'il a été PRIS, et seul
celui-là se rend.
