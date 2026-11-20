# Une audience trop large derrière une égalité EXACTE devient une panne ou une fuite, jamais rien

*2026-11-20, cycle 194, #20091.*

## Le fait

`E2EEEnvelopeRelay.directoryOf` — l'annuaire des appareils qui REÇOIVENT
l'enveloppe chiffrée — lisait `isActive` NU, donc admettait l'état legacy
`isActive: true, bannedAt ≠ null`. Et `compareDeviceSets` (Sesame) exige une
correspondance **EXACTE** entre ce que l'émetteur adresse et l'annuaire.

| ce que l'émetteur adresse | conséquence |
|---|---|
| les membres que les portes d'accès lui servent (sans le banni) | **409 `DEVICES_MISMATCH` à CHAQUE envoi** — le chiffrement est mort dans ce fil |
| l'annuaire tel qu'il est servi (le banni compris) | admis : le banni reçoit le chiffré sur chacun de ses appareils non retirés |

Aucune des deux branches n'est bénigne, et laquelle survient ne dépend pas de la
passerelle : elle dépend de la liste que le CLIENT a utilisée pour composer son
envoi.

## La règle

On raisonne d'ordinaire sur une audience trop large comme sur une dégradation
d'un cran : « quelqu'un reçoit ce qu'il ne devrait pas ». **Derrière un
prédicat d'ÉGALITÉ, il n'y a pas de dégradation d'un cran** — il y a deux
issues, et la plus probable est celle qui ressemble le moins à un défaut de
confidentialité : une panne totale.

> Devant une liste qui alimente une comparaison EXACTE (`isDeviceSetExact`, un
> `===` de longueur, une signature sur l'ensemble), la question n'est pas
> « cette liste est-elle trop large ? » mais **« que fait le site d'en face
> quand elle ne correspond pas ? »**. S'il refuse, une audience trop large est
> une panne ; s'il accepte, c'est une fuite. On ne sait pas laquelle sans
> l'ouvrir.

## Le corollaire de mesure

Le témoin l'a dit plus fort que le raisonnement : ajouter **une** ligne
banni-mais-actif à la fixture du relais fait tomber **9 témoins sur 11** — tous
les envois nominaux, pas seulement ceux qui parlaient du banni.

> Un ROUGE beaucoup plus large que prévu n'est pas un harnais cassé : c'est
> l'instrument qui dit que le défaut n'est pas où on le cherchait. Je cherchais
> une fuite ; la mesure a montré une panne, et la fuite avec.

## Et la jumelle qu'il faut ouvrir AVANT de resserrer

Resserrer un annuaire soumis à égalité exacte déplace la panne de l'autre
côté si la liste que le client lit ne vient pas de la même loi. Avant le
correctif, j'ai vérifié d'où le client tient sa liste : de la participation
servie par les portes d'accès, qui épellent toutes `PARTICIPATION_VIVANTE`.
C'est ce qui rend le resserrement juste — et pas seulement plus prudent.
