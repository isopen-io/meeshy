# Itération 284 — la borne de longueur d'un emoji de réaction est la SSOT côté REST (AJV), plus seulement côté Socket.IO (Zod)

Solde le second angle mort de l'itération 281. Celle-ci a fait passer les onze
sites Zod `.max()` d'un emoji de réaction/sticker sur la SSOT `EMOJI_MAX_LENGTH`
(32, calibrée pour admettre tout emoji RGI que `isValidEmoji` accepte). Son
balayage cherchait des `.max()` Zod ; les **quatre copies JSON-Schema / AJV** de
la même borne — les schémas de corps REST validés par Fastify AVANT le
gestionnaire — lui étaient structurellement invisibles et sont restées figées à
`maxLength: 10`.

## État actuel (avant correctif)

| chemin | site | borne |
|---|---|---|
| Socket.IO (Zod) | `services/gateway/src/validation/socket-event-schemas.ts:209,217` (`SocketReactionAdd/RemoveSchema`) | `EMOJI_MAX_LENGTH` (32) ✅ |
| REST (AJV) | `packages/shared/types/api-schemas.ts:2104` (`addReactionRequestSchema`, SSOT de doc API) | `10` ❌ |
| REST (AJV) | `services/gateway/src/routes/reactions.ts:93` (POST `/api/reactions`, inline) | `10` ❌ |
| REST (AJV) | `services/gateway/src/routes/conversations/messages-advanced.ts:1312` (POST reaction, inline) | `10` ❌ |
| REST (AJV) | `services/gateway/src/routes/conversations/messages-advanced.ts:1499` (DELETE reaction, inline) | `10` ❌ |

Les deux chemins portent le MÊME champ logique — un emoji de réaction sur un
message — vers le MÊME `ReactionService.addReaction`
(`messages-advanced.ts:1290` : « Reuses the existing ReactionService for
consistency with Socket.IO handlers »). Le corps REST étant validé par AJV
avant le handler, un emoji famille `👨‍👩‍👧‍👦` (11 unités UTF-16) ou couple teinté
`👩🏽‍❤️‍💋‍👨🏼` (15 unités) est **rejeté 400 au portillon sur REST** tandis que la
charge byte-identique passe sur Socket.IO.

## Problèmes identifiés

1. **Divergence de borne REST↔Socket.IO sur un champ jumeau.** Même famille que
   les itérations 280 (`attachment-reaction-zod-boundary-parity`), 281
   (`location-zod-boundary-parity`, `attachment-capturedinapp-socket-parity`) et
   282 (`customdest-langcode-max6`). L'itération 281 avait explicitement documenté
   la régression « réagir avec un emoji famille/couple/teinté échoue au
   portillon » comme un geste produit NOMINAL cassé — et l'a laissée vivante sur
   les quatre chemins REST.
2. **Un littéral au lieu de la SSOT.** La borne `10` datait de l'emoji
   mono-code-point d'avant `\p{RGI_Emoji}`. Le doc-comment de `EMOJI_MAX_LENGTH`
   (`packages/shared/types/reaction.ts:181-184`) nomme exactement ce piège :
   « une ancienne borne 10 … rejetait au portillon les emojis famille / couple /
   multi-personnes teintés ».

## Causes racines

Le balayage de l'itération 281 était lexical (`.max(` Zod). Une borne exprimée
en JSON-Schema (`maxLength:`) est une autre grammaire pour la même contrainte,
invisible à ce balayage. C'est la leçon 261 du dépôt : **une énumération de
sites porte deux affirmations — « ces sites appliquent la règle » (vérifiable)
et « ce sont les sites où la règle s'applique » (presque jamais vérifiée)** — et
la grammaire du site (Zod vs AJV) est précisément l'axe le long duquel la seconde
affirmation a lâché.

## Impact métier / technique

Un utilisateur qui réagit via REST (le chemin PRIMAIRE — le socket est le repli)
avec un emoji famille, couple, ou multi-personnes teinté reçoit un 400. Le geste
« réagir » est un chemin nominal ≤ 2 gestes (dimension 7). Défaut de cohérence de
positionnement (dimension 6 : même geste ⇒ même effet) et de complétude
(dimension 13 : un cas d'emoji manquant sur une plateforme de transport).

## Évaluation du risque

Très faible. Le correctif REMPLACE quatre littéraux par la constante SSOT déjà
importée par leurs jumeaux Zod ; il n'élargit aucune surface (32 était déjà la
borne effective côté socket, et `isValidEmoji` reste le contrôle de FORMAT en
aval). `reaction.ts` n'a aucun import (pas de cycle). L'`as const` de
`addReactionRequestSchema` conserve le littéral 32 (`EMOJI_MAX_LENGTH` est typé
`32`). Mesuré : dist rend `maxLength: 32`.

## Correctif

Quatre sites → `EMOJI_MAX_LENGTH` :
- `packages/shared/types/api-schemas.ts` (+ import `./reaction.js`)
- `services/gateway/src/routes/reactions.ts` (+ import `@meeshy/shared/types/reaction`)
- `services/gateway/src/routes/conversations/messages-advanced.ts` ×2 (+ import)

## Critères de validation (tous verts)

- `packages/shared` build ✓ ; suite complète **2711/2711** (dont 2 gardes neuves).
- Gardes neuves dans `__tests__/types/reaction.test.ts` : `addReactionRequestSchema.properties.emoji.maxLength === EMOJI_MAX_LENGTH`, et admission d'un emoji famille (11 unités). **Prouvées RED** à l'ancienne borne 10 (`11 <= 10` faux ; `10 !== 32`).
- Gateway `tsc --noEmit` : **0 erreur**.
- Suites `reactions-routes | AttachmentReactionHandler | messages-advanced` : **256/256**.

## Dimensions mûres / restantes

Mûres : 6 (cohérence), 11 (maintenabilité — une SSOT), 13 (complétude du cas
emoji sur le transport REST). Les deux gardes vivent dans le paquet `shared`
(home de la SSOT api-schemas) ; les deux schémas inline du gateway référencent
désormais la constante — une re-divergence serait un re-hardcodage visible.

## Suivi ouvert pour la prochaine itération (Priorité 1)

**Android `LanguageResolver.preferredTranslation` ne laisse pas la langue
d'origine concourir à SON RANG (violation Prisme #3).** C'est la jumelle NON
transférée du correctif web #4316 (itération 283) : `preferredTranslation`
(`apps/android/core/model/.../lang/LanguageResolver.kt:96-109`) ne prend AUCUN
paramètre `originalLanguage` ; l'original ne gagne qu'en repli terminal, jamais à
son rang. Prisme `['fr','en']`, message `fr`, traduction `en` disponible ⇒
Android affiche « Hello » au lieu du français original de rang 1. iOS
(`ConversationViewModel.preferredTranslation(for:)`) et web
(`resolvePrismTranslation`) gardent déjà le cas. Non traité ici : validation
Kotlin/Gradle indisponible dans cet environnement — à faire dans une itération
qui peut lancer `./gradlew test`. Corollaire mineur : même résolveur pour
posts/commentaires/reposts/stories Android (même correctif).
