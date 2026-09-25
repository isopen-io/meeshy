## Leçon 452 — Un document qui dit ce que la passerelle PORTE sans citer l'émetteur fait écrire un bouchon qui le porte — et un témoin vert par vacuité

**Le fait (2026-09-02, revue croisée de `rights`, #4523).** La conception
(§ 12.3), le critère de fin, trois doc-commentaires et le spec affirmaient
« les droits sont RELUS à chaque battement — l'hôte a pu les changer ». Le
bouchon faisait ce que le document disait : son battement servait un objet
MUTABLE que le spec changeait à la main, et le témoin « un droit retiré se voit
au battement suivant » était vert. La passerelle, elle, rend au battement
l'INSTANTANÉ pris au join (`participantConversationPayload`,
`link-admission.ts:566-575` : `participant.permissions` +
`shareLink.allowViewHistory`), que `services/participantRights.ts:6-13`
déclare noir sur blanc ne suivre ni le lien ni le delta posé par l'hôte. Le
changement de l'hôte voyage par un ÉVÉNEMENT — `participant:rights-updated`,
poussé sur la room de conversation et, en charge complète, sur la room
personnelle de l'invité (`participants-writes.ts:403-425`, room rejointe par
`AuthHandler.ts:381`) — que personne n'écoutait (`grep rights participate.ts`
: rien). En production : bandeau « Écrire et répondre », composeur ouvert,
droit retiré.

> **Une affirmation sur ce qu'une route PORTE se relit dans son ÉMETTEUR,
> jamais dans le document qui la répète — et la question suivante est : « par
> quel AUTRE canal la passerelle dit-elle ce changement ? ».** Un bouchon
> écrit d'après le document copie la réponse que le document imagine (leçon
> 422 en amont : la loi n'était même pas connue) ; un événement que la
> passerelle pousse et que personne n'écoute est la forme « la donnée
> arrive, personne ne la consomme » (leçon 421) côté socket.

Trois voisines du même lot, de la forme « le serveur sert quelque chose que
le document ne sert pas » : un battement 410 (état G) faisait rendre ZÉRO
message et quatre verdicts REFUSÉS que rien n'avait relus, alors que la liste
ne lit pas `isActive` et que la reconnaissance NOMME l'occupant
(`currentUser`) ; un droit rendu après un chargement fermé ne rouvrait rien,
parce que le serveur ne servait aucun `<form>` à révéler (le symétrique de la
raison cachée qu'il servait déjà) ; et une page d'historique gardait la
teinte « neuve » parce que le PEINTRE la posait — peindre n'est pas signaler.
La question qui attrape les trois : **ce que le document affiche dans cet
état est-il ce que la passerelle a SERVI — ni plus (un verdict fabriqué), ni
moins (une liste non demandée, un formulaire non servi) ?** Sites :
`apps/web-v3/lib/realtime/droits-peinture.ts` › `droitsDuChangement`,
`app/(public)/chat/[lien]/route.ts` › `occupantDeLaPlace`,
`app/connecte/fil-vue.ts` › `Composeur.cause`, `e2e/visual/lib/bouchon-fil.ts`
› `PlaceDeLInvite` / `porteDeLHote`.
---
