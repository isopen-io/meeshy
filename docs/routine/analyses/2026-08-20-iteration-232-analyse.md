# Iteration 232 — Rang Focal : couleur d'identité par auteur + langue réellement servie

## Protocole (démarrage)
`main` @ `0a8a1624` (dernier commit : feat — les liens de partage créés pointent sur `/chat`).
Branche `claude/brave-archimedes-1dkv3w` alignée sur `origin/main` (0 commit d'écart au démarrage).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité CI : `bun install --ignore-scripts` (le postinstall `grpc-tools`
échoue derrière le proxy sortant, cf. CLAUDE.md), puis `cd packages/shared && npx prisma generate
--generator client && bun run build` (le web mappe `@meeshy/shared/*` → `dist`).

### Audit anti-doublon (13 PRs ouvertes au démarrage)
Campagne « $-sequences » très active — **#3218/#3220** (DOUBLON `EmailService`, replaceLiteral vs inline),
**#3222** (web video-calls i18n), **#3225** (parité TS↔Swift language-reduction), **#3227**
(`ZmqMessageHandler` audio dedup), **#3217** (modernisation iOS Date/Concurrency/tokens — 100 % Swift),
**#3223/#3228** (iOS/Android), dependabot (#3138–#3164). **Zone volontairement évitée** : tout ce qui
touche `String.prototype.replace`/`$`-sequence, `EmailService`/`TrackingLinkService`/`MessagingService`,
`ZmqMessageHandler`, la parité language-map, l'UI d'appel vidéo, et toute la surface iOS/Android.
Vérifié fichier par fichier : **aucune PR ouverte ne touche
`apps/web/components/conversations/focal/focal-row-utils.ts`.** Zéro chevauchement.

## Sélection : **Priorité 1 — correctness sur le rang Focal (feature `/chat` récemment développée)**

Le rang Focal du fil partagé `/chat` (WF-110/111/112) est une feature récente. Un balayage de ses
utilitaires PURS (`focal-row-utils.ts`) révèle **deux bugs de justesse indépendants**, tous deux dans
des fonctions déjà pourvues d'un fichier de test voisin.

## Current state (avant correctif)

### Bug 1 — `resolveFocalAuthorAccent` rend la MÊME couleur pour TOUS les auteurs

```ts
export function resolveFocalAuthorAccent(displayName: string): string {
  return conversationAccentPalette({ name: displayName, type: 'direct' }).accent;
}
```

`conversationAccentPalette` **ignore délibérément son champ `name`** — c'est explicite dans la SSOT
qu'elle appelle (`conversation-colors.ts` : « `name` … N'INTERVIENT PAS dans le calcul » ; miroir de
`DynamicColorGenerator.colorFor(context:)` qui ne lit que `type`/`language`/`theme`). Ici `type` est
figé à `'direct'` et `language`/`theme` sont absents → **les entrées sont CONSTANTES à chaque appel**.
Prouvé : `resolveFocalAuthorAccent('Alice')`, `('Bob')`, `('Zorro')` rendent tous **`#7BB0A6`**.

Or l'unique raison d'être de la fonction (docstring §3.6 `senderColorHex`, §3.11 `colorFromAuthor` ;
consommateur `FocalQuotedReply.tsx` : « filet 2,5 pt couleur de l'auteur cité », « 39 couleurs
vibrantes possibles ») est une couleur d'IDENTITÉ propre à chaque auteur. Le filet gauche de toute
citation était donc **uniforme**, quel que soit l'auteur cité — l'inverse du contrat.

La bonne SSOT existe **dans le même fichier partagé** : `colorForName(name)` — hash DJB2 → palette de
39 couleurs vibrantes, exactement ce que l'iOS applique aux noms d'expéditeur
(`MessagePersistenceActor` → `DynamicColorGenerator.colorForName(senderName)`). La docstring de l'ancien
code affirmait à tort qu'« aucun utilitaire de couleur PAR UTILISATEUR n'existe » (le grep cité avait
manqué `colorForName`).

### Bug 2 — `resolveFocalMessageDisplay` nomme la mauvaise langue servie quand deux traductions partagent le texte

```ts
const served = Object.entries(record).find(([, value]) => value === text)?.[0];
return { text, language: served ?? message.originalLanguage };
```

La langue servie était récupérée par **correspondance de VALEUR** — la PREMIÈRE entrée (ordre
d'insertion) dont la valeur égale le texte résolu. Quand deux traductions portent le même texte, elle
attribue la mauvaise langue. Entrée prouvée RED : message `es` « Hola », traductions
`[{pt:'Olá'},{gl:'Olá'}]`, lecteur `['gl']` → `resolveLastMessagePreview` sert bien l'entrée `gl`
(« Olá »), mais la recherche par valeur renvoie **`pt`** (première insérée) → la méta annonce « affiché
en portugais » alors que le galicien a été servi.

## Problems identified
1. **Filet de citation Focal sans identité (bug visible).** Toutes les citations affichent le même
   filet coloré ; l'auteur cité n'est plus distingué par la couleur, contredisant le contrat §WS-3 et
   divergeant du comportement iOS (parité cross-plateforme rompue).
2. **Méta de langue servie fausse sur collision de texte (bug de justesse).** `FocalMetaRow` peut
   annoncer « affiché en X » avec la mauvaise langue quand deux traductions ont un texte identique.
3. **Recherche par valeur fragile (dette).** Dériver la langue servie d'une égalité de texte est
   intrinsèquement ambigu ; la loi partagée `resolveLastMessagePreview` résout par ORDRE DE PRIORITÉ,
   pas par valeur — la dérivation aurait dû lire le même ordre.

## Root causes
- **Bug 1** : mauvaise SSOT choisie. `conversationAccentPalette` est une couleur de CONVERSATION
  (type/langue/thème), pas d'utilisateur ; appliquée à un nom, elle est constante. `colorForName` — la
  SSOT de couleur PAR NOM, déjà gelée et utilisée par iOS — avait été manquée à la rédaction.
- **Bug 2** : la langue servie était « lue » par correspondance de valeur au lieu de mirer l'ordre de
  priorité du Prisme. Le cas dégénéré (deux traductions au texte identique) était invisible tant que
  les valeurs restaient distinctes.

## Business impact
- Perte d'un signal d'identité visuelle sur chaque citation du fil `/chat` (feature de partage, forte
  visibilité produit). Divergence perçue avec l'app iOS.
- Attribution linguistique erronée dans la méta Focal sur collision de texte (faible fréquence, mais
  100 % faux quand elle survient) — touche la fidélité du Prisme Linguistique, cœur du produit.

## Technical impact
- **Bug 1** : one-liner vers une SSOT existante déjà testée (`colorForName`) — supprime une couleur
  constante, restaure 39 couleurs d'identité, aligne le web sur iOS. Format inchangé (`#RRGGBB`).
- **Bug 2** : la dérivation lit désormais l'ORDRE DE PRIORITÉ (première langue préférée présente dans
  le dictionnaire), strictement identique à la loi que `resolveLastMessagePreview` applique — la langue
  rendue est PROVABLEMENT celle réellement servie (voir Risk assessment). Élimine la recherche par
  valeur fragile.
- Zéro changement de signature, de format de retour, de contrat, de schéma. Aucun consommateur touché
  (`FocalQuotedReply`, `FocalRow`, `FocalMetaRow` reçoivent les mêmes types).

## Risk assessment
**Très faible.**
- **Bug 1** : seul le cas « plusieurs auteurs » change (de couleur constante à couleur par nom). La
  détermination et le format `#RRGGBB` sont préservés. La docstring du consommateur (« 39 couleurs
  vibrantes ») devient enfin exacte.
- **Bug 2** — non-régression prouvée par construction : en atteignant la dérivation de langue, le texte
  est une VRAIE traduction (`text !== content`, garde en amont). `resolveLastMessagePreview` a alors
  rendu `record[L]` où `L` = première langue préférée présente dans le dictionnaire ET non
  court-circuitée par `lang === original`. `focalServedLanguage` renvoie la première langue préférée
  présente dans le dictionnaire. Si une langue `M` avant `L` était présente : soit `M === original`
  (alors `resolveLastMessagePreview` court-circuite vers `preview`, `text === content`, garde en amont
  → dérivation jamais atteinte), soit `M !== original` (alors `L = M` par définition). Dans tout cas
  ATTEIGNABLE, `focalServedLanguage` rend exactement `L`. Pour des valeurs distinctes, résultat
  identique à l'ancien ; seule la collision de texte change (de faux à correct).

## Proposed improvements (implémenté)
1. `resolveFocalAuthorAccent` → `colorForName(displayName)` ; import `colorForName` (retrait de
   `conversationAccentPalette`, plus utilisé). Docstring corrigée (SSOT par nom + parité iOS).
2. `resolveFocalMessageDisplay` : recherche par valeur → `focalServedLanguage(record,
   preferredLanguages)`, qui lit l'ordre de priorité du Prisme (même filtrage : chaîne non vide,
   minusculée ; casse d'origine du `targetLanguage` préservée).

## Expected benefits
- Filet de citation à la couleur d'identité de l'auteur cité, aligné iOS. Méta de langue servie exacte
  même sur collision de texte. Suppression d'une recherche par valeur fragile.

## Implementation complexity
Faible : 1 fichier source (2 fonctions + 1 helper interne + 2 docstrings), 1 fichier de test
(imports + 2 describe : accent réécrit, `resolveFocalMessageDisplay` nouvellement couvert).

## Validation criteria
- **RED prouvé** (code non corrigé) : 3 échecs — parité `colorForName` (rend `#7BB0A6`), deux auteurs
  distincts (tous `#7BB0A6`), langue servie `pt` au lieu de `gl`.
- **GREEN** : `focal-row-utils.test.ts` 22/22 ; dossier `components/conversations/focal` 132/132 ;
  `tsc --noEmit` — zéro **nouvelle** erreur sur les fichiers changés (backlog web préexistant
  indépendant).

## Future Considerations
- **Candidat orthogonal non traité (noté)** : `apps/web/lib/conversations/infinite-cache.ts`
  (`rebuildInfiniteConversationPages`) lève un `TypeError` sur `old.pages === []` (accès
  `pages[pages.length-1]` = `pages[-1]`). Les deux appelants ne gardent que `!old`, pas la longueur.
  Zone sensible (cache infinite, cf. `apps/web/CLAUDE.md`) → itération dédiée à faible périmètre.
- **Contraste AA du filet cité** : `FocalQuotedReply` garde volontairement l'accent BRUT pour le filet
  (non textuel, hors WCAG 1.4.3) et passe le NOM par `resolveBridgeTintColor` — inchangé, correct.
