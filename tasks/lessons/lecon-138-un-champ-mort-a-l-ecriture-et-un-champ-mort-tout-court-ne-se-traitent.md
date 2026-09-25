## Leçon 138 — Un champ mort à l'ÉCRITURE et un champ mort tout court ne se traitent pas pareil

Suite directe de la leçon 137. Compter les écrivains d'un champ ne suffit pas à décider de son
sort : **zéro écrivain n'implique pas zéro lecteur**, et c'est le lecteur qui décide du geste.

Trois colonnes voisines de `Message`, déclarées au même endroit, dans le même bloc de commentaire,
partageant exactement le même défaut d'écriture (`updateMessageComputedStatus` est un no-op assumé
depuis le passage aux curseurs) :

| Champ | Écrivains | Lecteurs clients | Geste |
|---|---|---|---|
| `receivedByAllAt` | 0 | **0** — aucun décodeur sur les 4 plateformes | RETIRÉ, déclarations comprises |
| `deliveredToAllAt` | 0 | iOS, Android, SDK (`DeliveryStatusResolver`) | **CALCULÉ** à la lecture |
| `readByAllAt` | 0 | idem — `!= null` y vaut « tous ont lu » | **CALCULÉ** à la lecture |

La note de suivi laissée par le cycle précédent disait « ils sortent ENSEMBLE, avec leurs
déclarations, ou pas du tout ». Les retirer ensemble aurait cassé trois décodeurs pour supprimer un
défaut qui se répare. **Le tri ne se fait pas sur la déclaration — qui les rassemble — mais sur la
CONSOMMATION, qui les sépare.**

**Le symptôme à reconnaître** : quand un champ mort à l'écriture a de vrais lecteurs, la branche
qui le teste est morte elle aussi, silencieusement, chez chaque client. `if readByAllAt != nil ||
readCount >= recipientCount` : la première moitié de la condition n'a jamais été vraie depuis le
passage aux curseurs, et rien ne l'a signalé parce que la seconde couvrait tous les cas. Un champ
sans écrivain ne casse pas ses lecteurs — **il les fait tourner à vide.**

**Corollaire, appliqué dans le même lot** : ne pas ajouter de garde défensive qu'aucun test ne peut
rougir. `totalMembers > 0 && count >= totalMembers` semblait prudent ; la mutation-proof l'a
démentie — `totalMembers` ne vaut zéro que si l'ensemble des destinataires évalués est vide, auquel
cas les maxima sont `null` de toute façon. Une garde qui survit à sa propre mutation est du code
mort qu'on vient d'écrire. La supprimer, et écrire à sa place le commentaire qui explique
pourquoi elle n'est pas nécessaire.
