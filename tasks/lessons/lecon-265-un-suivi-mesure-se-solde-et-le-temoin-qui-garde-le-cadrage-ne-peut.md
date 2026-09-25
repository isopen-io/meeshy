## Leçon 265 — un suivi MESURÉ se solde ; et le témoin qui garde le cadrage ne peut pas s'écrire sur un champ non persisté (2026-08-24, cycle 122)

**Le constat.** Le cycle 121 avait laissé un suivi mesuré, pas hérité : deux des trois
éventails de `messageNotificationFanOut` n'appliquaient **aucun** Prisme.
`createReplyNotification` et `createMentionNotification` posaient
`content: params.messagePreview` — l'original — et ne poussaient ni `translatedContent` ni
`translatedLanguage`. Une bannière de réponse ou de mention arrivait donc toujours dans la
langue de l'expéditeur, pendant que celle d'un message simple — même conversation, même
seconde, même destinataire — servait la traduction depuis le cycle 121.

Défaut DISTINCT de celui du cycle 121, et c'est ce qui justifiait de ne pas l'absorber alors :
là-bas un mauvais RANG, ici l'ABSENCE de la descente. Deux sémantiques de garde différentes
dans un même lot, c'est le demi-correctif que le cycle 120 recommande d'éviter.

> **Un suivi mesuré se solde au cycle suivant, et se solde en ENTIER.** Le mérite du
> cycle 121 n'est pas d'avoir nommé le reste à faire — c'est de l'avoir mesuré en ouvrant les
> deux méthodes plutôt qu'en déduisant de la forme du lot. C'est ce qui a rendu le cycle 122
> mécanique : rien à re-diagnostiquer, seulement à câbler.

### Le geste : corriger le RÉSOLVEUR pour tous, câbler les surfaces une par une (cycle 120)

La descente est extraite en `prismTranslationContext(source, preferredLanguages)`, alimentée
par `pushableTranslations` (le filtre de servabilité) et `loadMessagePrismSource` (la
relecture). `createMessageNotification` — qui portait la seule descente correcte — en devient
un consommateur comme les deux autres, sa source venant de la relecture vivante qui lui sert
déjà de gate d'éligibilité : **aucune lecture de plus sur le chemin le plus chaud.**

C'est le corollaire de la leçon 264 appliqué en préventif : quand un nouveau consommateur a
besoin de ce que rend un résolveur existant, l'issue par défaut est de réécrire la boucle, et
c'est ainsi que naissent les familles divergentes. Trois éventails, une descente.

### Corollaire — une source qui ne dépend pas du LECTEUR se relit une fois, la DESCENTE reste par lecteur

`createMentionNotificationsBatch` appelle `createMentionNotification` par mentionné. Une
relecture du message par destinataire aurait multiplié une lecture IDENTIQUE par la taille de
l'éventail. La source (`translations` + `originalLanguage`) est une propriété du MESSAGE ; le
prisme est une propriété du LECTEUR. Séparer les deux dans le type (`MessagePrismSource`)
rend la factorisation évidente et le paramètre optionnel (`prismSource`) suit le patron déjà
présent dans le fichier (`senderProfile`, « identité d'acteur déjà résolue »).

> **Avant de factoriser une lecture dans un éventail, demander de QUOI elle est une propriété.**
> Ce qui appartient au sujet se lit une fois ; ce qui appartient au destinataire se lit par
> destinataire. Les confondre coûte dans les deux sens : N lectures identiques, ou un prisme
> unique appliqué à tout le monde.

### Corollaire — un enrichissement fail-OPEN, un gate fail-closed : ce n'est pas la même lecture

`createMessageNotification` relit le message comme **gate d'éligibilité** — un message
volatilisé, supprimé ou expiré ANNULE la bannière, et c'est juste : la relecture y protège
contre une fuite de contenu. Pour la mention et la réponse, l'échéance vient de l'appelant
(`messageExpiresAt`) et la relecture n'est qu'un ENRICHISSEMENT. Elle échoue donc OUVERT :
lecture en défaut ⇒ source vide ⇒ bannière sans traduction, jamais bannière supprimée. Même
arbitrage que `loadNotificationPrefs` et `filterMutedRecipients`, et pour la même raison — la
traduction est un confort, l'annonce du message une obligation de livraison.

> **Copier une relecture d'un site à l'autre importe son mode d'ÉCHEC avec elle.** La question
> à poser avant de réutiliser une lecture n'est pas « lit-elle les bons champs ? » mais
> **« que doit-il se passer quand elle tombe, ICI ? »**. Le même `findUnique` était fail-closed
> chez son auteur et devait être fail-open chez son emprunteur.

### Le point de méthode — un témoin de CADRAGE ne peut pas s'écrire sur un champ non persisté

Le cycle 121 avait posé le témoin qui sépare les deux résolutions (le CADRAGE reste au rang 1,
seul le CONTENU descend) sous cette forme :

```ts
expect((notification as any)?.lang ?? 'de').toBe('de');
```

`Notification.lang` **n'est pas persisté** — il ne pilote que le rendu du titre/sous-titre à
l'intérieur de `createNotification`, et n'apparaît pas dans les données écrites. Le témoin
lisait donc `undefined`, puis assertait son propre repli. **Il ne pouvait pas tomber**, et le
mesurer l'a confirmé : sous une mutation qui fusionne délibérément les deux résolutions, il
restait vert.

Le cadrage s'observe sur la valeur SERVIE, comme le reste du harnais l'exige déjà pour le
contenu :

| éventail | où le cadrage est observable |
|---|---|
| `new_message` | le CORPS localisé — donc uniquement sur un message porteur de pièce jointe (`📷 Foto` en allemand contre `📷 Photo` en français) ; sur un texte nu, le corps EST l'extrait et ne porte aucune langue |
| `user_mentioned` | le SOUS-TITRE poussé (`hat dich erwähnt`) |
| `message_reply` | **nulle part aujourd'hui** — ni titre localisé, ni sous-titre, et le corps est l'extrait brut |

Les deux premiers témoins sont écrits et TOMBENT sous la mutation. Le troisième n'existe pas,
et le dire est la seule issue honnête : `lang` y est passé pour la correction et l'économie
d'une lecture, pas pour un effet mesurable — l'annoncer comme un correctif de cadrage aurait
été une affirmation invérifiable.

> **Un témoin de séparation entre deux résolutions doit exercer un cas où elles DIFFÈRENT sur
> une valeur qui SORT.** La forme « fixture » de la leçon 261 a ici sa troisième arête : après
> le prisme trop court (rang 1 seul) et la carte vide (aucune traduction à trouver), le champ
> INTERNE — l'assertion est juste, le harnais bon, mais la valeur observée ne franchit jamais
> la frontière, donc rien ne peut la contredire. Le tell : `?? valeur_attendue` dans un
> `expect`. Un repli qui vaut exactement ce qu'on assert transforme le témoin en tautologie.

### Ce que le lot n'a PAS ouvert, vérifié plutôt que supposé

Embarquer une traduction dans une notification arme un piège connu : à l'édition du message,
`Message.translations` est purgée et la traduction embarquée décrit l'ANCIEN texte — que le
Prisme affiche EN PRIORITÉ. `reproduceEditedMessageNotifications` purge déjà
`translatedContent`/`translatedLanguage`, et sa boucle est type-agnostique : `user_mentioned`
et `message_reply` figurent dans `PREVIEW_METADATA_KEY`, donc les deux types nouvellement
porteurs étaient couverts avant d'être porteurs. Son témoin, lui, n'exerçait que
`new_message` — il est étendu aux trois dans le même lot.

> **Rendre une donnée présente là où elle ne l'était pas oblige à relire ce qui l'INVALIDE,
> pas seulement ce qui la produit.** C'est la règle du cycle 84 (« le lot qui rend une donnée
> visible décide dans le même lot si elle a le droit de l'être ») dans sa variante temporelle :
> ici la donnée avait le droit d'exister, la question était de savoir qui la périme.

### Le suivi, MESURÉ

Deux autres producteurs ont été OUVERTS avant d'être écartés, et leurs raisons ne sont pas les
mêmes :

- **`EmailService`** n'a aucune voie qui compose un extrait de message. Ses lanes sont
  transactionnelles (vérification d'adresse, réinitialisation de mot de passe, alerte de
  connexion). Rien à descendre.
- **`createReactionNotification`** porte bien un extrait du message
  (`metadata.messageContent`), et le Prisme n'a pourtant rien à y faire : son destinataire est
  `messageAuthorId`, **l'AUTEUR du message**. Le texte est déjà dans la langue dans laquelle il
  l'a écrit. Ce n'est pas une omission, c'est un cas où la question ne se pose pas.

> Le second est le plus instructif : **un site qui porte du contenu et n'applique pas le Prisme
> n'est pas nécessairement un défaut.** Le discriminant de la leçon 264 — « qui connaît les
> préférences du lecteur au moment où le contenu est composé ? » — se double d'un second :
> **le lecteur est-il l'AUTEUR ?** Si oui, l'original EST sa langue, et une descente n'aurait
> rien à trouver. Ranger ce site dans « reste à câbler » aurait fabriqué une dette imaginaire,
> exactement comme le suivi hérité du cycle 107.

La quatrième famille est donc close côté serveur. Les surfaces WEB restées au rang 1
(commentaires, stories, status — cf. le suivi du cycle 120) sont le reste à câbler, et elles
sont CORRECTES, seulement pas encore rang-conscientes.
