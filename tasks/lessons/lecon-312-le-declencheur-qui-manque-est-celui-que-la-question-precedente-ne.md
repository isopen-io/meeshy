## Leçon 312 — le déclencheur qui manque est celui que la question précédente ne cherchait pas, et un abonné mort fait croire que le canal est branché (2026-08-28, cycle 133)

Le cycle 132 a établi qu'une synchronisation sur un déclencheur ÉPHÉMÈRE seul ne
rattrape rien. Son suivi mesuré demandait de poser la même question aux deux
autres clients. Le web porte ses deux déclencheurs sur la clé mesurée — mais pas
sur le jumeau que sa messagerie rend, ce qu'a trouvé la leçon 311 en parallèle de
celle-ci. **Et iOS porte la SYMÉTRIQUE, qui ne se voit pas avec la même
question.**

`UserPreferencesManager` n'avait que des déclencheurs de CYCLE DE VIE — ouverture
de session, retour au premier plan (lui-même étranglé à 5 min) — et aucune
diffusion. Un réglage changé sur un autre appareil n'atteignait donc pas l'iPhone
tant qu'il restait au premier plan, et un aller-retour dans les cinq minutes
suivantes était sauté par l'étranglement. Sur le bloc `notification`, miroité dans
l'App Group que lit la NSE, « périmé » s'entend littéralement : le téléphone
continue de sonner.

> Une synchronisation a besoin des DEUX déclencheurs, et ils ne répondent pas à la
> même question : le pérenne rattrape **ce qu'on a manqué en étant absent**, le vif
> converge **pendant qu'on est là**. Un balayage qui cherche « à quoi manque le
> vif ? » certifie sain tout site à qui manque le pérenne, et réciproquement. La
> question se pose donc dans les deux sens, ou elle ne mesure qu'une moitié.

### Un étranglement est correct pour son déclencheur et faux comme politique

`minSyncInterval` (5 min) garde `observeForeground` : rouvrir l'app n'est la
preuve de rien, donc on retient. Une diffusion est la preuve que quelque chose a
bougé. **Appliquer à une PREUVE la retenue qu'on réserve à un SOUPÇON** est ce qui
transforme une garde raisonnable en unique politique de fraîcheur — et l'unique
politique était, ici, celle qui ne savait rien.

### Un abonné qui filtre sur un champ que son publisher ne porte plus

La diffusion arrivait pourtant : décodée, publiée, et **abonnée** — par un seul
sink, dont le `guard let convId = event.conversationId else { return }` ne pouvait
plus passer. La scission de l'union en deux publishers avait envoyé toute charge
portant un `conversationId` vers l'autre publisher ; le plat ne porte plus que le
scope catégorie.

> Le publisher avait donc **zéro abonné effectif** : le scope qu'il porte n'avait
> pas de lecteur, et le scope que son abonné attendait ne lui était plus livré. Et
> c'est le sink MORT qui rendait le trou invisible — devant « qui écoute cet
> événement ? », on trouve un abonné et on s'arrête. **La question juste n'est pas
> « ce canal a-t-il un abonné ? » mais « cet abonné peut-il s'exécuter sur ce que
> ce canal porte AUJOURD'HUI ? »**

Le discriminant est bon marché : quand un événement est scindé, RELIRE les gardes
d'entrée de ses abonnés — elles décrivent la charge d'AVANT, et un `guard` qui ne
passe jamais est indiscernable, à la lecture, d'un `guard` qui protège.

### Un témoin qui fabrique sa charge prouve un chemin que le fil ne peut pas emprunter

Trois témoins gardaient ce sink vert. Ils construisaient à la main un
`UserPreferencesUpdatedEvent(category: "conversation", conversationId: "conv1")`
— une forme que le décodeur de production ne peut pas produire sur ce publisher.
Même famille que la note web sur `bridge: undefined` (« un payload construit à la
main porte la clé ; sur le fil la question ne se pose pas »), et même remède :
**un témoin de bout de fil s'ancre sur une charge que l'émetteur émet vraiment**,
pas sur une charge que le type permet d'écrire.

Corollaire de forme, appliqué au remplacement : une assertion NÉGATIVE (« cet
événement ne déplace pas la ligne ») passe pour toutes les mauvaises raisons —
sujet mal câblé, harnais muet. On l'écrit donc avec sa moitié POSITIVE dans le
même témoin (« et la même ligne suit bien le store »), qui prouve que le sujet
était vivant pendant qu'on mesurait son silence.

### Ce que le veto n'a PAS eu à réinventer

Le gateway renvoie au compte ÉMETTEUR la diffusion déclenchée par son propre
PATCH : le nouveau déclencheur court donc contre l'écriture locale qu'il double —
la course exacte du cycle 132. iOS avait déjà le veto qu'il fallait
(`pendingCategories` / `shouldApplyRemote`), posé pour la même raison sur un autre
déclencheur. **Avant d'écrire une garde, chercher si le site en tient déjà une pour
la même question sur un déclencheur voisin** : la trouver change le lot d'un ajout
de mécanisme en un ajout de témoin.

Détail : `tasks/realtime-sync-audit-2026-08-28-cycle133-bis.md`, issue #4201.
