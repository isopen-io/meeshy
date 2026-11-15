## Leçon 105 — la variante « plausible et plus complète » d'une garde se teste contre la FEATURE qu'elle pourrait éteindre

Le cycle a proposé, par-dessus la version retenue, un cliquet sur le compteur de non-lus :
« le delta peut toujours BAISSER le badge, il ne peut le MONTER que s'il apporte un
`lastMessageAt` plus récent ». Le raisonnement tenait, le cas visé était réel (instantané
serveur antérieur à un `mark-as-read` en vol), et la règle avait ses cinq témoins verts.

Elle était fausse, et c'est un témoin PRÉEXISTANT de l'autre session — « the delta is
server truth » — qui l'a fait tomber, pas une relecture.

1. **Transposer une règle d'une plateforme à l'autre demande de transposer aussi son
   INTERRUPTEUR.** iOS clampe sur `userState.lastReadAt` ; `markAsUnread` marche
   précisément parce qu'il EFFACE cette frontière, ce qui désarme le clamp et rend la main
   au serveur. Une transposition basée sur `unreadCount` + `lastMessageAt` reproduit la
   condition mais PAS son moyen de désarmement — donc elle éteint silencieusement le
   « marquer comme non lu » cross-device, une feature qu'aucun témoin du cycle ne
   regardait. **Avant d'écrire une garde qui refuse une valeur serveur, chercher quelle
   ACTION UTILISATEUR produit légitimement cette valeur.**
2. **Comparer les coûts des deux erreurs, pas seulement leurs probabilités.** Un badge
   rallumé une seconde et réparé par le `conversation:unread-updated` suivant est un faux
   transitoire auto-réparant ; un mark-as-unread jamais affiché est un faux PERMANENT.
   Une garde n'est justifiée que si le mal qu'elle empêche survit plus longtemps que celui
   qu'elle cause.
3. **Une garde se coupe à la portée qu'on peut PROUVER.** La moitié « conversation
   ouverte » est démontrable sans frontière locale (l'écran la montre, le handler socket
   la clampe déjà) et a été conservée. La moitié « conversation fermée » demande de faire
   voyager la frontière de lecture jusqu'au modèle web : chantier de contrat, documenté et
   laissé ouvert, pas approximé par un proxy.

---
