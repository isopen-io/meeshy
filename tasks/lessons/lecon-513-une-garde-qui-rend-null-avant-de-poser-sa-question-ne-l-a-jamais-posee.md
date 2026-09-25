## Leçon 513 — Une garde qui rend `null` avant de poser sa question ne l'a jamais posée

**Ce qui s'est passé.** La loi de la bannière compose le CORPS d'une notification de conversation
ainsi :

```ts
const contenu = nonVide(notification.content);
if (cadrage === 'conversation') {
  if (!contenu) return null;                       // ← ici
  const piecesJointes = …;
  return conventions.apercuDeMessage(contenu, piecesJointes);
}
```

`apercuDeMessage` est la convention par laquelle chaque client compose « 📷 Photo », « 📎 Fichier ».
Elle n'était JAMAIS appelée sur le cas nominal d'une photo : **un message envoyé sans légende**. Le
`if (!contenu) return null` sortait avant de regarder les pièces jointes. La bannière d'une photo
n'affichait donc que le nom de l'expéditeur — et le web existant vivait avec ce défaut depuis
l'origine, la loi partagée l'ayant repris tel quel.

**La règle.** *Un `return` anticipé sur l'absence d'UNE source est un jugement sur TOUTES les
sources.* La question était « ce message a-t-il quelque chose à montrer ? » et le code demandait
« ce message a-t-il du TEXTE ? ». Les deux coïncident tant qu'aucun message n'est fait d'autre
chose que de texte — c'est-à-dire jamais, dans une messagerie qui porte des photos.

**Comment le trouver.** Le témoin qui l'a attrapé ne visait pas ce cas : il vérifiait que la liaison
v3 apportait bien le marqueur de pièce jointe, avec un contenu VIDE parce que c'était le cas le plus
court à écrire. **Un témoin écrit sur la valeur la plus dégénérée du champ voisin trouve les gardes
qui ont sorti trop tôt** — et la question à poser à tout retour anticipé est : *que RESTAIT-il à
regarder après ce `return` ?*

**La forme générale.** C'est la famille des cycles 123-125 (« que transporte la charge À CÔTÉ du
texte que je viens de garder ? ») avec le signe inversé : là, une garde laissait partir plus qu'elle
n'autorisait ; ici, elle retenait plus qu'elle ne le devait. Dans les deux cas le défaut est dans ce
que la garde NE REGARDE PAS, et dans les deux cas il est écrit à côté d'elle, par la même main.

Sites : `packages/shared/utils/notification-banner.ts` (`buildNotificationBannerBody`, la branche
`conversation`), `apps/web/__tests__/utils/notification-banner.test.ts` § « annonce la pièce jointe
d'un message envoyé sans légende », `apps/web-v3/__tests__/banniere-notification.test.ts` § « une
pièce jointe qui n'est pas une image se marque en fichier ». Issue #4454.
