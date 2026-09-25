## Un rôle n'est une autorité que dans un conteneur qui a une HIÉRARCHIE (2026-08-17, cycle 56)

**Contexte** : `PUT /conversations/:id` posait deux gardes, toutes deux sur
l'identité de l'appelant — appartenance de rôle `creator`|`admin`|`moderator`, et
refus des champs de permissions à un `moderator` — et **aucune sur le type du
conteneur** ; la route n'ouvrait pas la ligne `Conversation` avant de l'écrire.
Or `POST /conversations` crée un `direct` avec deux rôles distincts, `creator`
pour qui a ouvert le fil et `member` pour l'autre. L'asymétrie nomme un **ordre
d'arrivée**, pas une hiérarchie — un tête-à-tête n'a pas d'administrateur — mais
la garde d'appartenance la lisait comme une autorité.

Tant que `isAnnouncementChannel` n'était appliqué par personne, cela n'écrivait
qu'un champ mort. Le câblage du cycle 31 — juste, et au bon endroit
(`MessagingService.handleMessage`, point de convergence des trois transports) —
l'a rendu effectif : l'initiateur d'un DM pouvait dès lors faire **taire son
pair** (`member` rang 1 sous un plancher `admin` rang 3) sur REST, socket texte
et socket pièces jointes à la fois, et sans recours — ce même PUT répond 403 à un
`member`. Le site qui écrit le champ n'avait pas changé ; seule son effectivité
l'avait fait.

**Décision** : deux gardes, à deux portées, dont aucune ne subsume l'autre.

- **La règle** — `conversationWriteAdmission.WRITE_HIERARCHY_FREE_TYPES` nomme les
  types de conteneur SANS hiérarchie d'écriture : `global` et `direct`.
  `requiredWriteRank` y rend `0` et n'interroge personne. C'est le geste qui
  guérit les conteneurs déjà marqués en base, dont aucune route ne rendra jamais
  compte. La dispense porte sur le RANG, jamais sur l'existence : l'état terminal
  est tranché avant, donc un tête-à-tête clos reste refusé.
- **L'autorité** — la route refuse `defaultWriteRole`, `isAnnouncementChannel` et
  `slowModeSeconds` sur un `direct`. Le type arrive par la relation du `findFirst`
  d'appartenance déjà émis, donc sans requête supplémentaire. Un type inconnu
  reste permissif, idiome documenté du module : la garde qui protège le pair est
  la règle, qui lit le type sur la ligne autoritaire de conversation.

**Alternatives rejetées** :
- **La règle seule.** La route persisterait le réglage et diffuserait un
  `conversation:updated` portant un drapeau que plus rien n'applique — un
  événement qui MENT aux clients sur l'état du conteneur, dont ils tirent leur UI.
- **La route seule.** Les tête-à-tête déjà marqués resteraient muets pour leur
  pair, sans qu'aucune requête ne puisse les rouvrir.
- **Refuser les HUIT champs du corps sur un `direct`.** `title`, `description`,
  `avatar`, `banner` et `autoTranslateEnabled` ne décrivent aucune hiérarchie.
  Les écritures cosmétiques sur un DM sont mortes (web résout le nom et l'avatar
  du pair) mais les interdire relève d'une décision sur ce que
  `Conversation.title` SIGNIFIE pour un `direct`, à côté du `customName` de
  préférences — pas d'un correctif d'autorisation.
- **Un garde générique « ce type accepte-t-il un réglage de police ? » ouvert aux
  préférences de communauté et aux droits de lien.** C'est la bonne forme, et
  elle demande d'inventorier ces deux familles d'abord ; piste n°7 du cycle 57.

**Tests** : 9 neufs — 4 sur la règle (2 dispenses, 2 bornes : un DM clos reste
refusé, un groupe garde sa hiérarchie), 5 sur la route (3 champs refusés en
`it.each`, 2 bornes : les champs cosmétiques passent encore sur un DM, un groupe
devient encore canal d'annonces). 4 mutations, deux dans chaque sens — retirer
`direct` de l'ensemble : 2 rouges ; y ajouter `group` : 10 rouges ; neutraliser
la garde de route : 3 rouges ; l'étendre à tous les champs : 1 rouge. Les
sur-dosages sont ce qui prouve que les témoins tiennent des bornes et pas
seulement une direction. Gate complet : 740 suites / 17 937 tests verts,
`tsc --noEmit` 0 erreur, `conversationWriteAdmission.ts` à 100 %.

---
