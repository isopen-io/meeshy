## Leçon 270 — la protection gardait le CORPS, pas le FIL : un correctif peut être juste et ne couvrir que la moitié qu'on observait (2026-08-24, cycle 123)

**Le constat.** Le cycle 122 a fait descendre le Prisme jusqu'au corps AFFICHÉ de la bannière et
l'a gardé : un aperçu PROTÉGÉ (éphémère / vue unique / flouté / chiffré) est un placeholder, la
traduction ne le remplace pas, sous peine de relâcher exactement le texte que la protection
masque. Cette garde est juste, elle a son témoin, et le témoin est vert.

À côté d'elle, dans la MÊME méthode, une seconde descente alimentait
`data.translatedContent` / `data.translatedLanguage` — **sans aucune garde**. Pour un message à
vue unique, la charge remise à APNs portait donc, en clair, la traduction du texte que la
bannière refusait d'afficher ; puis `createNotification` la persistait dans la ligne
`Notification`. Mesuré sur les trois éventails (message, réponse, mention).

Et la fuite est ATTEIGNABLE, pas théorique : le pipeline de traduction n'a aucun gate sur
`isViewOnce` / `isBlurred` / `expiresAt` (`MessageTranslationService.handleNewMessage` ne
connaît pas ces champs, et `messagePostSaveEffects` ne les lui passe même pas), et les entrées
produites portent `isEncrypted: false` — rien ne les écartait donc en amont non plus.

> **Le cycle 122 a posé la bonne question et l'a posée à un seul champ.** « Qui AFFICHE ce que le
> résolveur élit ? » a produit un correctif qui atteint le lecteur ; elle ne dit rien de ce que
> la même charge transporte À CÔTÉ. La question complète est triple, et chaque cycle en a
> découvert un tiers : **élit-il le bon rang (121) ? qui affiche ce qu'il élit (122) ? que
> transporte-t-il à côté de ce qu'il affiche (123) ?**

**Pourquoi le témoin du cycle 122 ne pouvait pas le voir.** Il assertait `push.body` — le bon
champ pour la moitié qu'il gardait. C'est la leçon 266 retournée : là, le champ observé
(`translatedContent`) rendait inobservable une règle sur ce qu'on SERT ; ici, le champ observé
(`body`) rend inobservable une règle sur ce qu'on REFUSE de servir. **Un témoin de
confidentialité doit asserter sur la charge ENTIÈRE remise au transport, pas sur le champ que la
protection était censée modifier** — une protection se prouve par ce qui n'est nulle part, et
« nulle part » ne se vérifie pas champ par champ.

### La cause : deux résolutions parallèles ne restent jamais d'accord

Le défaut n'était pas un oubli de garde, c'était une DUPLICATION. Chaque éventail descendait le
Prisme deux fois — une pour le corps, une pour les champs du fil — et il a suffi qu'une seule
des deux reçoive la condition de substitution. Toute garde ajoutée à l'une aurait manqué
l'autre, indéfiniment.

Le correctif est structurel : **UNE descente par destinataire, dont le corps servi et les champs
du fil sont deux PROJECTIONS** (`servedPreview` et `servedTranslationFields`, la seconde prenant
la traduction DÉJÀ ÉLUE plutôt qu'une source). Ce que le fil transporte décrit désormais, par
construction, ce que la bannière affiche.

> **Quand deux valeurs doivent rester d'accord, la question n'est pas « les a-t-on gardées
> pareil ? » mais « peuvent-elles être calculées deux fois ? ».** Une seule des deux finira par
> recevoir un correctif que l'autre n'aura pas — et ce sera celle qu'un témoin observe.

### Corollaire — un booléen ne peut pas dire une troisième forme

`previewIsMessageContent` (cycle 122) était juste pour deux formes d'aperçu et faux pour la
troisième : la transcription d'un vocal n'est pas « non substituable », elle est substituable par
une AUTRE carte (`MessageAttachment.translations`). Le booléen la rangeait donc avec le
placeholder de protection, et c'est ce qui a laissé la bannière d'un VOCAL hors du Prisme —
absence assumée et nommée par le cycle 122, close ici.

Ajouter une source À CÔTÉ du booléen aurait créé deux knobs capables de se contredire. Le type
SOMME (`PreviewPrismBasis` : `message-content` | `protected-placeholder` | `transcript` + source)
les rend exclusifs par construction, et il NOMME ce que l'aperçu est plutôt que ce qu'on a le
droit d'en faire.

> **Quand un booléen doit accueillir un troisième cas, le cas est presque toujours le signe que
> le booléen répondait à la mauvaise question.** « Peut-on substituer ? » est une conséquence ;
> « qu'est-ce que ce texte ? » est la donnée, et elle a autant de formes que le domaine.

### Corollaire — le second verrou n'est pas redondant quand il garde un secret

`previewPrismSource` refuse toute source quand `notificationLocKey` est présent, EN PLUS de la
base déclarée par l'éventail. Les deux disent la même chose au cas nominal — et un appelant qui
composerait un placeholder de protection sans déclarer sa base perd alors une traduction, jamais
le secret. **Une garde de confidentialité échoue en montrant moins**, et c'est la seule famille
où la redondance se justifie sans discussion.

### Le suivi, MESURÉ

- `prePersistMessage` (NSE iOS) lit `userInfo["content"]`, clé absente du payload push : le
  message pré-enregistré au démarrage à froid a un corps VIDE jusqu'à la synchro REST. Défaut
  DISTINCT du Prisme, hérité du cycle 122 et toujours ouvert — Swift, non exerçable ici.
- La bannière d'un vocal descend `MessageAttachment.translations` ; les PISTES AUDIO traduites
  (`url` sur la même entrée) ne sont pas attachées à la notification, qui joint toujours le
  fichier original. Absence nommée, non instruite.
