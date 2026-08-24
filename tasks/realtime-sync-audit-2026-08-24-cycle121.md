# Cycle 121 — la bannière de notification ne descendait que le rang 1 du Prisme

Date : 2026-08-24 · Branche : `claude/keen-hamilton-ab2yzz`

## 1. Comment le site a été trouvé

Pas par balayage. En **instanciant** la question de la leçon 261 sur un type de
contenu que les trois recensements précédents ne nommaient pas :

> « Le Prisme s'applique à TOUT le contenu (§ Cohérence). Et le texte poussé dans
> une **notification**, qui le résout ? »

Les cycles 118 (aperçu de liste), 119 (audio) et 120 (posts/commentaires) ont
chacun trouvé leur famille de la même façon. Les trois ont balayé les **clients**,
parce que leurs familles y vivaient en trois exemplaires. Celle-ci n'y était pas :
elle est résolue **une fois, côté passerelle, pour les trois clients**.

## 2. Le défaut

`services/gateway/src/services/notifications/NotificationService.ts`,
`createMessageNotification` :

```ts
const recipientLang = await this.resolveRecipientLang(params.recipientUserId);
const matchedTranslation = translationsJson
  ? Object.entries(translationsJson).find(([lang, t]) =>
      lang.toLowerCase() === recipientLang.toLowerCase() && …)
  : undefined;
```

`resolveUserLanguage` rend **une** langue — la plus haute renseignée, donc le
rang 1 dans le cas nominal. L'appariement est EXACT sur cette seule langue.

Conséquence : une traduction disponible au rang 2, 3 ou 4 du prisme du
destinataire n'était jamais poussée. La bannière servait l'**original** pendant
que la ligne de liste de la même application — servie par
`resolveLastMessagePreview`, qui descend depuis le cycle 118 — affichait la
traduction. Deux textes pour un même message, sur le même écran, à quelques
secondes d'intervalle.

**Mécanique, pas marginal.** La locale appareil entre au rang 4 (règle 2 du
Prisme) : tout lecteur dont l'appareil n'est pas dans sa langue applicative —
cas nominal — a un prisme d'au moins deux langues.

## 3. Ce qui rendait le site crédible

Il portait le bon vocabulaire : il nommait le Prisme, et citait correctement la
règle #1 (« pas de fallback `translations.first` : aucune correspondance = le
contenu est déjà dans la langue du destinataire »). Seule la **cardinalité**
était fausse.

> Les deux règles ne se gardent pas mutuellement. #1 interdit de servir une
> traduction quelconque ; #3 oblige à DESCENDRE. Un site peut respecter la
> première à la lettre en violant la seconde — et c'est ce qui ressemble le plus
> à du code correct.

Le tell lisible : `resolveUserLanguage` rend un `string`, sa voisine
`resolveUserLanguagesOrdered` rend la liste.

## 4. Le correctif, en deux temps

### 4.1 La descente devient UNE fonction (`packages/shared`)

Le consommateur push a besoin de plus qu'un texte : il pousse `translatedContent`
**et** `translatedLanguage` côte à côte sur le fil APNs. `resolveLastMessagePreview`
ne rend qu'un texte — l'écrire chez lui aurait produit une **cinquième** boucle de
descente, la copie exacte dont les cycles 118-120 sont la facture.

```ts
resolvePrismTranslation({ translations, originalLanguage, preferredLanguages })
  → { language, text } | null      // null ⇒ servir l'original
```

`resolveLastMessagePreview` en devient une **projection**. Un témoin gèle
l'équivalence des deux formes sur quatre cas (rang 1, rang 2, origine à son rang,
aucune correspondance) — sans lui, rien n'interdirait à la refonte d'avoir changé
la ligne de liste des trois clients au passage.

La clé rendue est celle **stockée**, pas sa forme canonique : la comparaison se
normalise, la valeur rendue non (corollaire du cycle 119 — `translatedLanguage`
repart sur le fil et sert de clé à un lecteur qui rapproche par égalité stricte).

### 4.2 La passerelle sépare deux résolutions qui portaient le même nom

`recipientLang` servait DEUX choses :

| rôle | ce qu'il faut | pourquoi |
|---|---|---|
| **CADRAGE** — « Alice vous a envoyé une photo » | une langue, le rang 1 | c'est l'interface du lecteur |
| **CONTENU** — le texte du message | la liste ORDONNÉE | le contenu n'a pas de langue d'interface, il a des traductions |

`resolveRecipientPrism` rend `{ lang, ordered }` depuis **une** lecture. Les
confondre coûte dans les deux sens : remplacer naïvement `resolveUserLanguage`
par `resolveUserLanguagesOrdered` aurait localisé la bannière en portugais pour un
lecteur dont l'application est en allemand. Un témoin garde la séparation —
contenu servi au rang 4, cadrage resté au rang 1.

`originalLanguage` entre dans la relecture vivante : la langue d'origine concourt
à son propre RANG (règle #3).

Le filtre des traductions chiffrées (jamais poussées) **précède** la descente au
lieu de l'interrompre : une entrée chiffrée n'est pas une raison de priver le
lecteur du rang suivant.

## 5. Les témoins

`services/gateway/src/__tests__/unit/services/notifications/messageNotificationPrism.test.ts`
— 9 témoins, tous sur la charge **remise à APNs** (`pushService.sendToUser`),
jamais sur un calcul intermédiaire.

Rouge prouvé : **5 échecs / 9** avant correctif.

Les **4 déjà verts ne sont pas du remplissage** : ils gardent le mode d'échec du
CORRECTIF, pas celui du défaut. Une descente naïve (« prendre la première
traduction disponible ») servirait « Bonjour » là où le message est déjà écrit
dans la langue de rang 2 du lecteur. Un lot qui n'écrit que les témoins rouges
contre l'état antérieur livre un correctif dont le propre mode d'échec n'est
gardé par rien.

Le double `user.findUnique` répond **selon l'id demandé** : expéditeur et
destinataire sont deux lectures distinctes dans cette méthode, et un double qui
rend le même profil aux deux ferait résoudre le prisme du destinataire depuis les
préférences de l'expéditeur.

## 6. Suivi — MESURÉ, pas hérité (leçon 107)

Deux des trois éventails de `messageNotificationFanOut` n'appliquent **aucun**
Prisme :

| éventail | site | ce qu'il pose |
|---|---|---|
| réponse | `createReplyNotification:3268` | `content: params.messagePreview` — l'original |
| mention | `createMentionNotification:1703` | `content: params.messagePreview` — l'original |

Ni l'un ni l'autre ne pousse `translatedContent` / `translatedLanguage`. Vérifié
en ouvrant les deux méthodes, pas déduit de la forme du lot.

Défaut **DISTINCT** de celui de ce cycle — absence du Prisme, pas un mauvais
rang. Non absorbé ici délibérément : deux éventails aux sémantiques de garde
différentes dans le même lot, c'est le demi-correctif que le cycle 120
recommande d'éviter. **Corriger le résolveur pour tous, câbler les surfaces une
par une** — le résolveur est partagé et juste, il ne manque que la liste en
entrée.

## 7. Gates

| gate | résultat |
|---|---|
| `packages/shared` — vitest | 107 fichiers / 2568 témoins verts |
| `packages/shared` — `tsc --noEmit` | 0 erreur |
| `services/gateway` — `tsc --noEmit` | 0 erreur |
| `services/gateway` — suite notifications | 16 suites / 194 témoins verts |
| `services/gateway` — suite COMPLÈTE (bun) | **845 suites / 19 336 témoins verts** |
