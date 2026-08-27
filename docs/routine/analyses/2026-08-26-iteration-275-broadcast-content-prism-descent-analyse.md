# Itération 275 — Le CONTENU d'une diffusion admin descend le Prisme ORDONNÉ (5e famille de résolveurs)

## État actuel

Le Prisme Linguistique gouverne « quelle traduction servir » à un destinataire
NOMMÉ, en parcourant ses langues DANS L'ORDRE (`systemLanguage` >
`regionalLanguage` > `customDestinationLanguage` > `deviceLocale` > original) et
en servant la PREMIÈRE qui porte une traduction. SSOT unique :
`resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`),
qui rend `{ language, text } | null` — `null` ⇒ servir l'original.

Les familles de résolveurs déjà conformes (aperçu de liste, audio, posts /
commentaires, bannière de notification, e-mails de cadrage) descendent toutes le
prisme ORDONNÉ. Le canal de **diffusion admin** (`AdminBroadcast`) a DEUX voix —
e-mail (`BroadcastSenderJob`) et in-app (`BroadcastInAppSenderJob`) — et sert un
CONTENU réel : le sujet et le corps traduits (`translatedSubjects` /
`translatedBodies`, keyés par langue).

## Problèmes identifiés

`localizedBroadcastText` (`jobs/broadcast-recipients.ts:47`) résout le contenu
**rang-1 seulement** :

```ts
return translated[params.lang] || translated[params.sourceLanguage] || params.original;
```

où `params.lang = recipientLanguage(user, 'en')` — c'est-à-dire la seule langue
de TÊTE renseignée du prisme. Le résolveur regarde exactement UNE langue, puis la
langue source, puis l'original. **Il ne descend jamais aux rangs 2 à 4 du prisme
ordonné du lecteur.**

C'est précisément l'anti-patron « rang-1 seulement au lieu de parcourir le prisme
ordonné » que le dépôt combat de cycle en cycle (règle #3 du Prisme, cycle 120 :
« un résolveur parcourt les langues DANS L'ORDRE ; la première servie gagne »).
Et c'est une réimplémentation locale de la résolution, que le `CLAUDE.md` du
gateway interdit explicitement (« NEVER reimplement the priority order locally »).

Contraste : la bannière de message est correctement câblée —
`createMessageNotification` tire `resolveRecipientPrism(...).ordered` et le passe
à `resolvePrismTranslation(...)`, parcourant chaque rang. Les deux surfaces
« contenu → destinataire nommé » ont divergé : l'une descend le prisme, celle de
la diffusion non.

Le commentaire de `broadcast-sender.ts:89-93` appelle pourtant ce site « la
DESCENTE » — il surestime ce que le code fait, le trou exact « un commentaire est
une AFFIRMATION » (cycle 94).

## Causes racines

La langue joue DEUX rôles à ce site, et un seul a été traité au cycle 125 :

- **CADRAGE** (l'interface : chrome de l'e-mail, `lang` de la notification) — doit
  être « le rang le plus haut RENSEIGNÉ » = `recipientLanguage(user, 'en')`. ✅
  corrigé au cycle 125.
- **CONTENU** (le sujet/corps servi) — doit descendre le prisme ORDONNÉ. ❌ resté
  rang-1.

Le cycle 125 a fait passer la langue de cadrage par la SSOT, et comme cette même
langue servait aussi de CLÉ de contenu, il a eu l'air de traiter les deux. Les
témoins qu'il a posés (`recipient-framing-language.jobs.test.ts`) n'emploient que
des lecteurs à UN SEUL rang renseigné (rang-2-seul, rang-4-seul) : dans ce cas
`recipientLanguage` (rang 1) et `recipientLanguages()[0]` (premier de l'ordre)
sont la MÊME valeur, donc cadrage == contenu et le défaut rang-1 ne se manifeste
jamais. **Un témoin de RANG s'écrit sur un rang AUTRE que le premier** (leçon
261) — ici il fallait un lecteur à PLUSIEURS rangs dont le premier n'a pas de
traduction.

## Impact métier

Un destinataire dont la langue de tête n'a pas de traduction, mais dont un rang
inférieur EN a une disponible, reçoit le sujet/corps dans la langue de l'AUTEUR
(source) au lieu de sa langue de rang inférieur. Sur un produit dont le Prisme
promet que « l'utilisateur consomme tout le contenu dans sa langue configurée »,
une annonce système part alors dans la mauvaise langue — l'e-mail ET la
notification in-app.

Cas concret : lecteur `systemLanguage` vide, `regionalLanguage='de'`,
`customDestinationLanguage='fr'` (prisme ordonné `['de','fr']`). Une traduction
`fr` existe (un autre destinataire a `systemLanguage='fr'`) mais pas de `de`.
`recipientLanguage` rend `'de'` ; `localizedBroadcastText` ne trouve pas
`translated['de']`, saute directement à source/original, et sert la langue
SOURCE — alors que le rang 2 `fr` du lecteur a une traduction disponible. Le
Prisme impose de servir `fr`.

## Impact technique

Contenu : deux fichiers de jobs + un helper pur. Aucune migration, aucun champ,
aucun changement de contrat de fil. Rétro-compatible avec les témoins existants
(les lecteurs à un seul rang y rendent le même verdict).

## Évaluation du risque

- Correctif : **FAIBLE** — le helper route désormais par la SSOT
  `resolvePrismTranslation` (déjà éprouvée par toutes les autres familles) au lieu
  d'un `||` local ; les deux callers passent `recipientLanguages(user)` pour le
  CONTENU en gardant `recipientLanguage(user, 'en')` pour le CADRAGE. Zéro
  changement de coût (aucune traduction supplémentaire produite).
- Aucune régression : `resolvePrismTranslation` rend `null` (⇒ original) quand la
  langue de tête EST la source ou qu'aucun rang n'a de traduction — subsume
  proprement l'ancien repli `translated[sourceLanguage] || original` (l'original
  EST écrit en `sourceLanguage`).

## Améliorations proposées

1. `localizedBroadcastText` prend `preferredLanguages: readonly string[]` (le
   prisme ORDONNÉ) au lieu de `lang: string`, et route par
   `resolvePrismTranslation({ translations, originalLanguage: sourceLanguage,
   preferredLanguages })`, repli sur l'original — jamais sur une traduction
   quelconque (règle #1 du Prisme).
2. `BroadcastSenderJob` et `BroadcastInAppSenderJob` passent
   `recipientLanguages(user)` au CONTENU, `recipientLanguage(user, 'en')` restant
   la langue de CADRAGE (paramètre `language` de l'e-mail, `lang` de la
   notification).

## Bénéfices attendus

- La 5e famille de résolveurs rejoint le prisme ORDONNÉ — plus aucune surface
  « contenu → destinataire nommé » ne résout au rang 1.
- Une source de résolution de moins réécrite à la main (maintenabilité,
  dimension #11).
- Témoins de descente qui exercent VRAIMENT un rang autre que le premier (le trou
  de couverture du cycle 125 refermé).

## Complexité d'implémentation

Faible. ~1 helper reprofilé + 2 sites d'appel + 1 fichier de test.

## Suivi ouvert (dimension #13 — Complétude, HORS PÉRIMÈTRE de ce lot)

`routes/admin/broadcasts.ts` choisit les langues à TRADUIRE via
`groupBy(['systemLanguage'])` — donc seul le rang 1 de l'audience est traduit.
Un destinataire dont le seul rang renseigné est inférieur (regional / custom /
deviceLocale) et qu'aucun autre membre ne porte en `systemLanguage` n'aura JAMAIS
sa langue produite : la descente (ce lot) ne peut servir que ce qui EXISTE. Fixer
la SÉLECTION des langues-cibles (union du prisme ordonné de l'audience) change le
VOLUME de traduction (coût opérationnel) et touche une route admin qui porte par
ailleurs un `where`-builder jumeau divergent de `buildBroadcastRecipientFilter` —
c'est un lot à part entière, à ouvrir en issue. Ce lot-ci livre la DESCENTE, qui
apporte déjà de la valeur dès qu'une langue de rang inférieur figure dans le jeu
traduit (cas nominal : `fr`/`en`/`es` sont des `systemLanguage` fréquents).

## Critères de validation

- Nouveau témoin RED : lecteur multi-rangs (rang 1 sans traduction, rang 2 avec)
  ⇒ le sujet/corps servi est celui du rang 2, sur les DEUX canaux ; rouge sur le
  code rang-1 actuel, vert après.
- Anti-régression : les témoins de cadrage du cycle 125 restent verts.
- `localizedBroadcastText` pur : descend l'ordre, repli original (jamais une
  traduction hors prisme), `null`/absence gérés.
- Suite `broadcast-sender` + `broadcast-inapp-sender` + `recipient-framing-language`
  vertes ; `tsc` gateway sans erreur.
