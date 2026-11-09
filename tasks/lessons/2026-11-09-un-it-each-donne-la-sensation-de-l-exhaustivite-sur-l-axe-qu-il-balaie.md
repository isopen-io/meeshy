## 2026-11-09 — Un `it.each` donne la sensation de l'exhaustivité sur l'axe qu'il balaie, et aucune sur l'axe qu'il ignore : quatre protections × UN chemin sur trois, et la garde ne pouvait pas rougir (#17177)

Mon lot gardait une règle sur TROIS chemins (les trois éventails de notification)
et quatre formes de protection. J'ai écrit un `it.each(lifecycleProtections)` —
vue unique, flou, éphémère par échéance, éphémère par durée — et je l'ai relu
comme une couverture complète, parce qu'il **énumère**.

Il lisait `createMessageNotification.mock.calls[0][0]` : **un seul des trois
chemins.** Et le harnais des deux autres fixait `isViewOnce: false`,
`isBlurred: false`, `expiresAt: null`, `ephemeralDuration: null` — donc sur ces
deux chemins le verrou **ne pouvait pas rougir**.

MESURÉ par l'audit adversarial : remplacer la résolution par la matière brute
laissait **3 063 témoins sur 3 063 VERTS**. La même mutation, après correction du
harnais, en fait tomber **12**.

> **Un `it.each` déplace l'attention sur l'axe qu'il paramètre.** Il a la forme
> d'une matrice et n'en est qu'une ligne. La question à lui poser n'est pas
> « couvre-t-il tous les cas ? » — il le proclame — mais **« de quoi est-il
> indexé, et qu'est-ce qui ne l'est pas ? »**. Ici : indexé par la PROTECTION,
> muet sur le CHEMIN, et ma garde vivait sur l'axe muet.

Deux corollaires mesurés dans le même lot :

- **Le harnais est l'autre moitié du témoin.** Un `makeServicePrisma` qui fixe
  les drapeaux que la garde interroge est un double PARTIEL qui gèle le verdict —
  la forme exacte que mon propre lot citait pour la dénoncer. Un harnais se
  paramètre sur tout ce que la règle LIT, sinon il décide du verdict à la place
  de l'assertion.
- **Et mon récit affirmait le contraire, avec aplomb** : « les 18 témoins verts
  disent chacun pourquoi ils ne peuvent pas tomber ». C'était vrai des négatifs
  que j'avais écrits exprès, et faux de deux chemins entiers. **Écrire « ce
  témoin ne peut pas tomber, et voici pourquoi » est une affirmation à vérifier
  comme une autre** : le dire protège du doute au lieu de l'inviter.

Dernier piège, rencontré en écrivant les témoins manquants : ma première échéance
d'éphémère était un littéral daté de la veille, donc PASSÉ. `messageLiveness`
rendait `gone`, le créateur n'envoyait rien, et l'assertion « aucune enveloppe »
passait **sans que le verrou ait été exercé** — un témoin vert qui répond à une
autre question que la sienne. L'échéance se calcule relativement à `now`.

Sites : `deviceEnvelopeThreeFanOuts.test.ts` (harnais paramétré par le régime ET
la protection), `tasks/realtime-sync-audit-2026-11-08-cycle151.md` § second tour.
