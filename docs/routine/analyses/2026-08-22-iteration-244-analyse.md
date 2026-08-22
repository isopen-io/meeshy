# Analyse — Itération 244 : le hook web des traductions comparait des codes de langue bruts

## Current state

`apps/web/hooks/use-message-translations.ts` résout l'affichage Prisme des
messages côté web (contenu affiché, `isTranslated`, `translatedFrom`, et les
demandes de traduction manquantes). Il comparait les codes de langue **verbatim**
avec `===` / `!==` à six endroits :

- `processMessageWithTranslations` : `originalLanguage !== preferredLanguage` et
  `t.language === preferredLanguage`.
- `getPreferredLanguageContent` : `message.originalLanguage === preferredLanguage`
  et `t.language === preferredLanguage`.
- `shouldRequestTranslation` : `message.originalLanguage === targetLang` et
  `t.language === targetLang`.

## Problems identified

Un code de langue sur le fil peut être région-tagué (`en-US`, `fr-FR`),
sous-tagué script (`zh-Hant`) ou en casse mixte (`EN`). La comparaison brute
traite `en-US` et `en` comme **deux langues distinctes** :

1. **Traduction non affichée** — un message d'origine `en` avec une traduction
   keyée `fr-FR` n'est jamais servi à un lecteur `fr` : `t.language === 'fr'`
   échoue, le message reste affiché en anglais (violation directe du Prisme).
2. **Demande de traduction redondante** — un message d'origine `en-US` pour un
   lecteur `en` déclenche `shouldRequestTranslation === true` :
   `'en-US' !== 'en'`. Le client demande au translator une traduction
   `en → en` inutile (CPU/GPU translator, bande passante ZMQ, latence).
3. **`translatedFrom` parasite** — `getPreferredLanguageContent` sur un message
   `fr-FR` pour un lecteur `fr` renvoie l'original mais avec `translatedFrom`
   renseigné, ce qui peut faire afficher un indicateur « traduit » sur du
   contenu natif.

## Root causes

Le dépôt possède déjà la SSOT de canonicalisation des codes verbatim —
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`),
consommée par `conversation-helpers.ts`, `consumed-language.ts`,
`user-language-preferences.ts`. Ce hook, plus ancien, ne l'utilisait pas et
comparait les codes bruts. C'est exactement la classe de défaut corrigée dans le
résolveur d'aperçu partagé aux itérations 243 (canonicalisation au point de
comparaison).

## Business impact

- Contenu affiché dans la mauvaise langue pour tout utilisateur dont la
  préférence ou l'origine du message porte un tag région/script — friction
  linguistique que le Prisme promet d'éliminer.
- Coût translator gonflé par des demandes de traduction identité (`en → en`).

## Technical impact

Faible surface, six sites de comparaison dans un seul fichier. Aucun schéma,
aucun contrat wire, aucune signature publique modifiée.

## Risk assessment

Faible. La canonicalisation est idempotente sur les codes canoniques (`fr` → `fr`)
donc les cas déjà corrects restent identiques ; seuls les codes tagués/casse-mixte
changent de résultat, dans le sens attendu. 45 témoins existants inchangés + 5
nouveaux.

## Proposed improvements (implemented)

Introduction d'un helper local `sameLanguage(a, b)` qui délègue à
`normalizeLanguageForDedup`, appliqué aux six sites de comparaison. Le helper
renvoie `false` si l'un des codes est vide (parité avec l'ancien `'' === x`).

## Expected benefits

- Le Prisme sert la traduction correcte même quand les codes sont tagués région.
- Zéro demande de traduction identité pour un original tagué déjà dans la langue
  préférée.
- Indicateur « traduit » cohérent (pas de `translatedFrom` sur du natif).

## Implementation complexity

Triviale : un helper + six substitutions ponctuelles.

## Validation criteria

- 5 témoins RED (région-tagué / casse) posés d'abord, verts après le fix.
- Suite complète du hook 50/50 verte ; suites voisines
  (`message-translation.service`, `message-formatting`) 32/32 vertes.
- `tsc --noEmit` : zéro nouvelle erreur (le fichier est propre ; 6 erreurs
  pré-existantes hors périmètre : z-index-validator, push-token, connection).

## Future improvements

- Le `Map` de déduplication interne (`translationsMap`) key encore par code brut.
  Deux traductions `fr` et `fr-FR` du même message resteraient deux entrées ;
  keyer par `normalizeLanguageForDedup` les fusionnerait. Hors périmètre ici
  (aucun impact observé — la donnée réelle porte une traduction par langue
  normalisée), à considérer si des doublons tagués apparaissent en base.
- Audit des autres consommateurs web de codes de langue bruts
  (`use-message-translations` était le dernier gros site signalé par les revues
  du 22/08).
