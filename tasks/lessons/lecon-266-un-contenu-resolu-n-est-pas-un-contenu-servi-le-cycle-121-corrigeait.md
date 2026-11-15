## Leçon 266 — un contenu RÉSOLU n'est pas un contenu SERVI : le cycle 121 corrigeait un champ que personne ne lit (2026-08-24, cycle 122)

**Le constat.** Le cycle 121 a trouvé la quatrième famille de résolveurs du Prisme (la bannière
de notification, côté serveur), corrigé son rang, et déposé la traduction élue dans
`context.translatedContent` — d'où elle repart sur le fil APNs/FCM. Le cycle 122 a posé la
question suivante : **qui lit ce champ ?** Réponse mesurée, sur les quatre consommateurs
possibles : personne. Ni `MeeshyNotificationExtension` (aucune occurrence), ni l'application
iOS, ni Android, ni `firebase-messaging-sw.js`. Le seul texte que les trois plateformes rendent
est `payload.body`, et il restait composé depuis `params.messagePreview` — l'ORIGINAL.

Autrement dit : le symptôme que le cycle 121 nommait dans son propre titre — deux textes pour
un même message, la bannière dans la langue de l'expéditeur pendant que la ligne de liste est
traduite — **survivait intact, une couche plus bas.** Le rang était juste, le champ bien rempli,
et l'écran inchangé.

> **La question à poser à tout résolveur n'est pas « élit-il le bon rang ? » mais « qui AFFICHE
> ce qu'il élit ? »** Un correctif dont la valeur n'atteint aucun lecteur n'a corrigé personne,
> et il est plus difficile à voir qu'un correctif absent : il a un diff, des témoins verts, et
> un journal qui décrit exactement le bon défaut.

**Pourquoi le cycle 121 ne pouvait pas le voir avec ses propres témoins.** Ils assertaient sur
`payload.data.translatedContent` — « la charge REMISE à APNs », ce qui est la bonne famille
d'assertion (la valeur SERVIE, pas un calcul intermédiaire) et le bon champ *si l'on suppose
qu'il est lu*. La supposition était le défaut, pas l'assertion. C'est la forme « fixture » de la
leçon 261 déplacée d'un cran : le harnais est bon, l'assertion est juste, et **c'est le CHOIX DU
CHAMP OBSERVÉ qui rend la règle inobservable.** Le témoin de la 122 est le même appel, sur
`payload.body`.

> **Corollaire d'outillage : avant d'asserter sur un champ de transport, mesurer qui le
> consomme.** Un `grep` du nom du champ dans les trois clients coûte une minute et distingue un
> champ SERVI d'un champ TRANSPORTÉ. C'est le jumeau exact de la leçon « une preuve
> TRANSPORTÉE n'est pas une preuve VÉRIFIÉE » (X3DH, cycle 96) : là, une signature traversait
> cinq couches sans que personne l'ouvre ; ici, une traduction traverse le fil sans que personne
> l'affiche. Même forme, autre sous-système — **un champ présent à chaque étape se lit comme un
> champ traité.**

### Corollaire — le suivi mesuré du cycle précédent était bon, et il n'était pas le plus urgent

Le cycle 121 laissait un suivi MESURÉ (leçon 107, pas hérité) : les éventails RÉPONSE et MENTION
n'appliquaient aucun Prisme. C'était vrai, vérifié en ouvrant les deux méthodes, et
effectivement corrigé ici. Mais le défaut le plus cher n'était pas dans la liste des suivis — il
était sous le correctif lui-même. **Un suivi mesuré borne ce qu'on savait ne pas avoir fait ; il
ne dit rien de ce qu'on croyait avoir fait.** Reprendre un suivi est le bon réflexe ; commencer
par vérifier que le cycle précédent a produit un EFFET l'est davantage.

### Corollaire — un filtre de substitution appartient au site qui sait ce que l'aperçu MONTRE

Substituer la traduction dans le corps a une précondition que le résolveur ne peut pas
connaître : `Message.translations` ne traduit que `Message.content`. Deux aperçus n'en sont pas :

- un aperçu **PROTÉGÉ** (éphémère / vue unique / flouté / chiffré) est un placeholder — y
  substituer la traduction relâcherait exactement le texte que la protection masque. C'est le
  mode d'échec du CORRECTIF, pas du défaut ;
- la **transcription d'un vocal** est un autre texte, dont les traductions vivent sur
  `MessageAttachment.translations`. La substituer afficherait un contenu sans rapport avec
  l'audio.

Le seul site qui sait laquelle des trois formes l'aperçu porte est l'ÉVENTAIL, qui l'a composée.
D'où un paramètre explicite (`previewIsMessageContent`) plutôt qu'une devinette côté résolveur.

> **Quand une transformation dépend de ce qu'une valeur SIGNIFIE et non de ce qu'elle VAUT,
> le prédicat remonte au site qui l'a construite.** Un résolveur qui essaie de deviner
> (« est-ce que ça ressemble à un placeholder ? ») se trompera sur le premier texte qui
> ressemble aux deux.

### Corollaire — la correction ne dépend pas du câblage de l'appelant, seule l'ÉCONOMIE en dépend

Le lot de mentions lit la carte de traductions UNE fois pour N destinataires et la passe à
chaque descente ; `createMentionNotification` la relit quand elle n'est pas fournie. Les deux
chemins servent le même texte. C'est la forme correcte d'une optimisation à une frontière
publique : **un appelant qui oublie le paramètre perd une requête, jamais le Prisme.** L'inverse
— un paramètre dont l'absence désactive la règle — est un demi-correctif qui se présente comme
une optimisation, et un témoin le gèle ici (`le Prisme s'applique SANS câblage de l'appelant`).

### Le suivi, MESURÉ

- **La bannière d'un VOCAL reste dans la langue de l'expéditeur.** Sa transcription a ses
  propres traductions (`MessageAttachment.translations`, `packages/shared/types/audio-transcription.ts:207`)
  qu'aucun éventail ne descend — c'est la raison même du `previewIsMessageContent: false` de ce
  lot, donc une absence ASSUMÉE et nommée, pas un oubli.
- **`prePersistMessage` (NSE iOS) pré-enregistre un corps VIDE.** Il lit `userInfo["content"]`,
  une clé que le payload push ne porte pas — vérifié à la source : `PushNotificationService:785`
  pose `notification.payload = { ...payload.data }`, et `data` n'a pas de clé `content`. Défaut
  DISTINCT du Prisme (le message pré-enregistré au démarrage à froid est sans texte jusqu'à la
  synchro REST), relevé en instruisant le risque de régression de ce lot — donc mesuré, pas
  déduit.


### Corollaire de MERGE — deux cycles parallèles, et c'est le témoin de l'autre qui a trouvé mon bug

Une session parallèle a soldé le même suivi (Prisme réponse/mention) et atterri sur `main`
pendant ce lot, jusqu'au même nom de fichier de témoins. Trois choses en sont sorties, et aucune
n'aurait existé sans la confrontation :

1. **Son témoin de CADRAGE a fait tomber mon correctif.** Il exerce un message SANS texte,
   porteur d'une image : le corps se compose alors des seuls badges localisés (« 📷 Foto »). Ma
   substitution y injectait la traduction — pour un `Message.content` VIDE, dont aucune entrée de
   `Message.translations` n'est la source. **Un aperçu vide n'a rien à substituer**, et c'est
   exactement le genre de cas qu'un lot écrit seul ne se donne pas.
2. **Deux de ses témoins GELAIENT l'inverse de ce lot** — « le corps original reste le corps » —
   sur deux prémisses : « le client choisit » (faux, mesuré : personne ne lit le champ) et
   « écraser le corps priverait la NSE de son repli sous le budget APNs » (inversé : la
   dégradation coupe `translatedContent` AVANT le corps, donc porter la traduction dans le corps
   est ce qui la fait SURVIVRE). Ces témoins sont INVERSÉS avec les deux prémisses écrites en
   clair, jamais supprimés.
3. **Sa correction d'un témoin du cycle 121 qui ne pouvait pas tomber s'appliquait à MES propres
   témoins** : `expect(notification.lang ?? 'de').toBe('de')` lit `undefined` — `lang` n'est pas
   persisté — puis assert son propre repli. J'avais recopié ce patron dans six témoins neufs.

> **Devant un lot parallèle qui vise la même cible, la question n'est pas « lequel garder ? »
> mais « que sait chacun que l'autre ignore ? »** Un `--ours` aurait perdu le bug de l'aperçu
> vide et gardé six témoins incapables de tomber ; un `--theirs` aurait regelé la prémisse que ce
> cycle a mesurée fausse. Le seul geste qui ne perd rien est de prendre la base de l'autre et d'y
> RÉ-APPLIQUER son propre delta — ce qui force à relire chaque désaccord un par un.

---
---
