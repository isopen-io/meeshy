## Leçon 220 — un effet qui « fait comme `cleanup()` » doit vider EXACTEMENT les mêmes refs que `cleanup()`, sauf exception nommée et justifiée (2026-08-17, routine calling, cycle 141)

**Le constat.** `use-webrtc-p2p.ts` a DEUX resets globaux de l'état de connexion : `cleanup()`
(fin d'appel/unmount, vide 11 refs/states) et l'effet `userId`-change (promotion anonyme→
authentifié, refresh de session, vide seulement 6 des 11 — ferme bien tous les `WebRTCService`
comme `cleanup()`, mais oublie `connectedPeersRef`, `stalledPeersRef`, `isReconnecting` et
`reconnectAttemptRef`, les 4 refs dédiées au signal de reconnexion mid-call). Le miroir SCOPÉ par
participant, `removeParticipant`, avait déjà reçu ce même correctif pour ces 4 refs — documenté par
son propre commentaire (« Audit web-calls 2026-08-15 ») — mais l'effet `userId`-change, qui fait le
même genre de reset pour TOUS les participants à la fois, n'avait jamais reçu le traitement
symétrique alors qu'il partage la même exposition.

**Le tell.** Un commentaire qui décrit un geste comme « recreate/reset like X » (ici : « Recreate
WebRTC services when userId changes », visuellement un mini-`cleanup()`) sans énumérer explicitement
CHAQUE ref que X vide est une promesse non vérifiée. Le nombre de refs vidées par les DEUX sites
doit être compté et comparé — pas seulement leur intention lue.

**La règle.** Quand un second site du code affirme « je fais le même genre de nettoyage que le site
A » (par un commentaire, un nom de fonction, ou simplement la ressemblance du code), lister TOUTES
les refs/states que A vide, puis vérifier UNE PAR UNE leur présence au site B. Une absence n'est
acceptable que si elle est justifiée par une différence de scope réelle — jamais silencieuse. Ici,
`negotiationIdsRef` est l'exception légitime : `cleanup()` le vide parce que l'appel est VRAIMENT
fini, alors que l'effet `userId`-change ne doit PAS le vider parce que l'appel CONTINUE et que le
pair distant a déjà mémorisé notre high-water mark de négociation — le vider ferait paraître notre
prochain signal plus ancien que ce qu'il a déjà vu, et le pair le droppperait comme périmé (le même
bug documenté à la Leçon sur l'interop iOS, `negotiationIdsRef`'s propre commentaire de
déclaration). Une exception délibérée et documentée n'est pas un oubli ; une absence non expliquée
l'est toujours.

**Le corollaire des Vagues 137-139.** C'est la même classe de défaut que
`clearBufferedOffer`/`clearBufferedOfferFor` (nettoyer un scope trop LARGE) vue depuis l'angle
inverse : ici, ce n'est pas la CIBLE du nettoyage qui est trop large, c'est sa COUVERTURE qui est
trop étroite. Les deux bugs naissent du même geste manqué — énumérer chaque état dérivé qu'un
"reset" doit couvrir, plutôt que faire confiance à la ressemblance de surface entre deux sites qui
prétendent faire la même chose.
