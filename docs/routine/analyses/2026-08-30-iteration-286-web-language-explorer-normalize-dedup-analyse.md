# Itération 286 — l'explorateur de langues web déduplique par le Prisme (`normalizeLanguageForDedup`), plus par comparaison brute

Sixième surface web de contenu à rejoindre la SSOT de langue, mais d'une classe
DIFFÉRENTE des cycles 120-123/283/284 : pas un résolveur d'AFFICHAGE (« quelle
traduction servir »), mais l'EXPLORATEUR — `LanguageSelectionMessageView`, la vue
« voir toutes les langues / traduire vers une autre » qui matérialise le principe
d'EXPLORATION du Prisme (« l'utilisateur peut à tout moment voir l'original ou
explorer d'autres langues »). Elle comparait les codes de langue **bruts** là où
tout le reste du dépôt compare par `normalizeLanguageForDedup`.

## État actuel

`LanguageSelectionMessageView` construit trois dérivés depuis
`message.translations` :

1. `translationsByLanguage` — regroupe les traductions par langue, **clé brute**
   (`translation.language || translation.targetLanguage`).
2. `availableVersions` — original + une entrée par langue traduite ; exclut
   l'original par `lang !== originalLang` (**comparaison brute**).
3. `missingLanguages` — `SUPPORTED_LANGUAGES.filter(l => !existingLangs.has(l.code))`
   où `existingLangs = new Set(availableVersions.map(v => v.language))`
   (**appartenance brute**).

Aucun des trois n'appelait `normalizeLanguageForDedup`, la SSOT partagée que
`use-message-display`, `use-stream-translation`, `focal-row-utils` et
`resolvePrismTranslation` consomment déjà pour comparer deux langues.

## Problèmes identifiés

1. **Double comptage d'une langue déjà traduite.** Une traduction dont la clé
   stockée n'est pas la forme canonique 2-lettres — région-taguée (`pt-BR`),
   3-lettres ISO 639-2/3 (`por`, la forme canonique employée par
   `MessageTranslation.targetLanguage`), ou legacy (`iw`) — n'était pas reconnue
   comme la même langue que son code canonique (`pt`, `he`). Conséquence, sur un
   message anglais traduit en `pt-BR` :
   - `availableVersions` porte la version keyée `pt-BR` ;
   - `existingLangs = {'en', 'pt-BR'}` ; le filtre `!has('pt')` est **vrai** ⇒
     **`pt` reparaît dans les langues « à générer »**.
   - La MÊME langue s'affiche donc dans l'onglet « Available » ET dans l'onglet
     « Generate » (proposée à la traduction alors qu'elle est déjà traduite), et
     le compteur « N / M langues possibles » sur-compte le dénominateur d'une
     unité.
2. **Pas de déduplication de deux clés d'une même langue.** Deux traductions
   `pt` et `pt-BR` produisaient deux lignes « disponibles » distinctes au lieu
   d'une seule (celle de meilleure confiance).
3. **Accès de propriété sur `unknown`** (`translation.language`,
   `bestTranslation.confidence`…) dans les mémos — le paramètre de `forEach` /
   `reduce` était `unknown` (car `translations: Array<BubbleTranslation | unknown>`
   ⇒ `unknown`), et onze accès de propriété violaient `strict`. Dette de type
   comptée par le cliquet `scripts/check-type-debt.sh` (web).
4. **Erreur de type pré-existante dans le même fichier** : la prop `isTranslating`
   était destructurée sous le nom `_isTranslating`, qui ne correspond à aucune
   prop (`error TS2339`).

## Causes racines

Le composant a été écrit avant l'extraction de `normalizeLanguageForDedup` comme
SSOT et n'a jamais été porté. Le défaut restait invisible parce qu'il « marchait »
pour le cas fréquent (traductions keyées en 2-lettres canonique) ; il n'apparaît
que dès qu'une clé région-taguée / 3-lettres / legacy circule — cas nominal
puisque `MessageTranslation.targetLanguage` est justement 3-lettres pour les
langues sans ISO 639-1 (`bas`, `dua`, `ewo`…) et que la locale appareil (rang 4
du Prisme) est souvent région-taguée (`pt-BR`, `en-US`).

C'est exactement la classe « cette règle gouverne-t-elle une autre INSTANCE de
contenu, et qui la résout ? » du `CLAUDE.md` : l'énumération des surfaces de
Prisme comptait les résolveurs d'AFFICHAGE ; l'explorateur — qui ne sert pas un
texte mais liste et compte des langues — applique la même loi d'identité de
langue et personne ne l'y avait câblé.

## Impact métier / technique

Un utilisateur multilingue ouvrant « voir les langues » sur un message traduit
via une clé non canonique voyait la langue déjà traduite proposée à la
re-traduction (redondance, confusion, requête de traduction inutile s'il
cliquait), un compteur faux, et — via `getLanguageInfo('pt-BR')` — un libellé de
langue dégradé (« pt-BR » au lieu de « Portugais »). Friction directe sur la
surface même qui incarne l'EXPLORATION du Prisme.

## Évaluation du risque

Faible. Le correctif DÉLÈGUE à `normalizeLanguageForDedup` (SSOT testée, partagée
par cinq autres consommateurs web) sans réécrire la moindre boucle de langue.
Pour toute traduction déjà keyée en 2-lettres canonique (cas dominant),
`normalizeLanguageForDedup(code) === code` ⇒ comportement **identique**. La langue
servie à l'affichage n'est pas touchée (ce composant ne résout pas le texte
affiché ; il liste/compte). `onSelectLanguage(version.language)` reçoit désormais
la forme canonique (`pt`), que la résolution d'affichage normalise de toute façon
via `sameLanguage` — donc la traduction région-taguée reste correctement
sélectionnée.

## Améliorations proposées (implémentées)

- Import de `normalizeLanguageForDedup` (`@meeshy/shared/utils/language-normalize`).
- `translationsByLanguage` : clé **normalisée** ; garde d'une clé vide/non-string.
- `availableVersions` : exclusion de l'original par comparaison **normalisée**
  (`normalizeLanguageForDedup(originalLang)`).
- `missingLanguages` : ensemble des langues servies **normalisé** ET codes de
  `SUPPORTED_LANGUAGES` **normalisés** avant appartenance.
- Type local `LooseTranslation` (union des clés `BubbleTranslation` ∪
  `MessageTranslation`) remplaçant les accès sur `unknown` — −11 à la dette de
  type web, cliquet `WEB_BASELINE` resserré 1184 → **1173**.
- Correction de la prop `isTranslating` mal destructurée (`isTranslating:
  _isTranslating = false`) — l'erreur `TS2339` pré-existante disparaît.

## Bénéfices attendus

Une langue déjà traduite n'est jamais proposée à la re-traduction ; le compteur
« N / M » est juste ; deux clés d'une même langue fusionnent en une ligne ; le
libellé de langue est propre (forme canonique). Sixième surface web alignée sur
la SSOT de langue, première de la classe EXPLORATEUR.

## Complexité

Faible : un composant, quatre mémos touchés, un type local, un import, un cliquet
de type resserré, cinq tests neufs.

## Critères de validation (atteints)

- **RED prouvé** : 3 des 5 témoins neufs tombent sur le code courant (la langue
  région-taguée reparaît dans « Generate », idem pour la clé 3-lettres `por`, et
  le compteur région-tagué diverge du compteur canonique).
- **GREEN** : `LanguageSelectionMessageView.test.tsx` 46/46 ; dossier
  `__tests__/components/common/bubble-message` 183 passés / 1 sauté.
- `tsc --noEmit` : **aucune** erreur sur le fichier touché (l'erreur `TS2339`
  pré-existante est en outre supprimée).
- Cliquet de dette de type web vert au nouveau plancher 1173.

## Dimensions (roadmap treize dimensions)

**6 · Cohérence de positionnement** (mûre : l'explorateur rejoint la SSOT de
langue des cinq autres surfaces) — **11 · Maintenabilité** (mûre : une seule loi
d'identité de langue, dette de type réduite, jumelle de comparaison brute
supprimée) — **12 · Simplicité d'usage** (mûre : plus de langue proposée en
double, sans action utilisateur) — **13 · Complétude** (mûre : première surface
EXPLORATEUR à descendre la normalisation, cinq cas × formes de clé couverts).

## Suivi (hors périmètre)

- `use-message-display.ts` calcule `missingLanguages` (dead — non consommé par
  `BubbleMessageNormalView`) avec la même comparaison brute `Set.has(lang.code)` :
  soit le retirer (dead code), soit l'aligner s'il est un jour recâblé. À trancher
  au prochain passage.
- `use-stream-translation.ts` compose `userLanguages` sans la locale appareil
  (rang 4) pour un COMPTEUR de stats seulement — pas un défaut d'affichage, mais
  une divergence de rang à documenter si les stats deviennent visibles.
- Conflit de merge possible sur `WEB_BASELINE` avec la PR #4390 (itération 285,
  en vol) : résolution triviale (garder le plus petit plancher atteint).
- Toujours aucun cliquet ne garde « toute surface web comparant des langues passe
  par `normalizeLanguageForDedup` » (suivi de méthode récurrent, inchangé).
