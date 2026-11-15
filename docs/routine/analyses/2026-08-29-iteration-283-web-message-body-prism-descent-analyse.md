# Itération 283 — le CORPS du message web descend le Prisme ordonné (rangs 1→4), plus seulement le rang 1

Jumelle web de `usePostTranslation` (posts/commentaires), `resolveAutoLanguage`
(audio) et `resolveLastMessagePreview` (aperçu de liste). La famille restée au
rang 1 était la plus importante : le **corps du message** dans le fil de chat.

## État actuel

`MessagesDisplay` (`apps/web/components/common/messages-display.tsx`) calcule la
langue d'affichage de chaque bulle (`currentDisplayLanguage`, consommée par
`BubbleMessage` → `useMessageDisplay`) via `getPreferredDisplayLanguage`. Cette
fonction ne consultait que **le rang 1** (`userLanguage`) :

```ts
if (message.originalLanguage === userLanguage) return message.originalLanguage;
const userLanguageTranslation = translationsArray.find(
  (t) => (t.language || t.targetLanguage) === userLanguage
);
if (userLanguageTranslation) return userLanguage;
return message.originalLanguage || 'fr';           // repli : l'ORIGINAL
```

L'effet réactif « une nouvelle traduction est arrivée » (lignes 302-340) avait
la même forme : il ne basculait la bulle que vers `userLanguage`.

Le prisme ORDONNÉ complet (`usedLanguages`, sortie de
`getUserLanguagePreferences` → `resolveUserLanguagesOrdered`, rangs 1→4 dont la
locale appareil) était pourtant **déjà en portée** comme prop `usedLanguages`,
threadé jusqu'ici depuis `bubble-stream-page` et `ConversationMessages` — et
jamais lu par le résolveur.

## Problèmes identifiés

1. **Violation du Prisme #3 (« la langue d'origine concourt à son RANG, jamais
   comme court-circuit »).** Une traduction existant à un rang 2/3/4 était
   ignorée. Cas nominal : lecteur `systemLanguage='fr'` (rang 1),
   `deviceLocale='en'` (rang 4, navigateur anglais — cas courant) ; message
   `originalLanguage='es'` ; seule une traduction **anglaise** existe. Le rang 1
   `fr` n'ayant pas de traduction, l'ancien code repliait sur l'**original
   espagnol** — alors que le `CLAUDE.md` exige exactement l'inverse (« la locale
   anglaise n'intervient que si aucune traduction française n'est disponible ET
   qu'une traduction anglaise existe »). iOS (`APIPost.resolveTranslation`) et
   Android (`LanguageResolver.preferredTranslation`) servaient déjà l'anglais :
   **le web divergeait de ses deux jumeaux sur la surface la plus lue.**

2. **Comparaison brute `===`, pas la SSOT `normalizeLanguageForDedup`.** Une
   traduction keyée `en-US` (ou une préférence `en-US`) ne matchait jamais une
   préférence `en` : le message était réputé « sans traduction préférée » et
   repliait sur l'original. Même classe que celle contre laquelle le résolveur
   partagé a été durci.

## Causes racines

Le résolveur d'affichage du corps a été écrit avant l'extraction de la SSOT du
Prisme de contenu (`resolvePrismTranslation`) et n'a jamais été porté quand les
trois autres familles web l'ont adoptée (cycles 120-123). L'énumération des
« familles à descendre » couvrait aperçu de liste, audio, posts/commentaires —
jamais le corps du message, précisément parce qu'il « marchait » pour le cas
rang-1 le plus fréquent (lecteur monolingue dont la langue = langue de la
plupart des messages). Le défaut n'apparaît qu'au rang ≥ 2, qui devient le cas
NOMINAL dès que la locale appareil (rang 4) diffère de la langue applicative.

## Impact métier / technique

Un utilisateur multilingue — ou simplement francophone sur un navigateur anglais
— voyait dans le fil des messages en langue étrangère alors qu'une traduction
d'un de ses rangs inférieurs existait, servie par ses autres appareils (iOS,
Android). Friction linguistique visible sur le contenu central du produit,
contredisant le principe de « transparence » du Prisme. Classe « cette règle
gouverne-t-elle un autre TYPE DE CONTENU, et qui le résout ? » du `CLAUDE.md`.

## Évaluation du risque

Faible. Le correctif DÉLÈGUE à `resolvePrismTranslation` (SSOT testée, partagée
par les trois jumelles) au lieu de réécrire la boucle ; il ne touche qu'un
fichier de production. Le fixture de test `usedLanguages: ['en','fr','es']` avec
`userLanguage: 'fr'` était **structurellement invalide** (en production rang 1 =
`usedLanguages[0]` = `userLanguage`, les deux dérivant de la même config) ;
corrigé en `['fr','en','es']`, toutes les assertions existantes restent vertes
avec la sémantique CORRECTE du Prisme.

## Améliorations proposées (implémentées)

- `getPreferredDisplayLanguage` descend `usedLanguages` (mémoïsé sur ses
  primitives jointes pour neutraliser le churn d'identité du prop) via
  `resolvePrismTranslation`, rendant la langue STOCKÉE gagnante (comparée ensuite
  par `sameLanguage` normalisé dans `useMessageDisplay`) ou l'original.
- L'effet réactif utilise le MÊME résolveur et une comparaison normalisée
  (`sameLanguage`) : bascule vers une traduction de rang quelconque à son
  arrivée, jamais un retour forcé à l'original.
- `buildTranslationRecord` : adaptation de la seule FORME (tableau
  `{ language|targetLanguage, content|translatedContent }` → `Record<lang,text>`),
  aucune recopie d'ordre ni de normalisation.
- Repli `[userLanguage]` quand `usedLanguages` est vide (chemin
  `SharedConversationPreview`, prisme mono-rang de l'invité).

## Bénéfices attendus

Le corps du message web sert la même langue qu'iOS et Android pour le même
lecteur ; une traduction de rang 2/3/4 est enfin honorée ; les codes
région-tagués matchent leur rang. Quatrième famille web alignée sur la SSOT.

## Complexité

Faible : un fichier de production, un fichier de tests, délégation à une SSOT
existante.

## Critères de validation (atteints)

- **RED prouvé** en rebranchant l'ancien résolveur rang-1-only : 3 des 5 témoins
  neufs tombent (descente rang 2, normalisation `en-US`, bascule après-coup) ;
  les 2 ancres de régression (préférence rang 1, original à son rang) restent
  vertes des deux côtés — elles n'ISOLENT pas le défaut, elles le bornent.
- **GREEN** : `MessagesDisplay.test.tsx` 42/42 ; suites `components/common`
  14/14 (359 tests) ; suites conversations/lentille/focal/`use-message-display`
  40/40 (365 tests). Aucune régression.
- `tsc --noEmit` : les 8 erreurs mentionnant le fichier sont sur des lignes
  PRÉ-EXISTANTES hors de mes trois hunks (displayMessages memo, init effect,
  render — code non modifié) ; mon code neuf n'ajoute aucune erreur.
- ⚠️ `eslint` ne se charge pas localement (incompatibilité eslint@10 /
  `eslint-plugin-react` `resolveBasedir` dans le store bun isolé) — gate réel =
  CI `next lint`.

## Dimensions (roadmap treize dimensions)

**6 · Cohérence de positionnement** (mûre : le web rejoint iOS/Android) —
**11 · Maintenabilité** (mûre : une SSOT de descente, plus de boucle réécrite) —
**12 · Simplicité d'usage** (mûre : la friction linguistique disparaît sans
action de l'utilisateur) — **13 · Complétude** (mûre : quatrième et dernière
famille web de contenu à descendre le prisme).

## Suivi (hors périmètre)

- Aucun cliquet ne garde « toute surface web de contenu descend le prisme
  ordonné » ; un tel garde exigerait une liste de résolveurs nommés. Issue de
  MÉTHODE, notée ici, pas incluse.
- `use-message-translations.ts` exporte deux résolveurs rang-1-only
  (`processMessageWithTranslations`, `getPreferredLanguageContent`) sans
  consommateur vivant (vérifié) — code mort latent à supprimer ou folder, lot de
  maintenabilité distinct.
