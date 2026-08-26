# Analyse — Itération 246 : la dédup des traductions du hook web keyait par code brut

## Current state

`apps/web/hooks/use-message-translations.ts` construit, dans
`processMessageWithTranslations`, une `Map<string, BubbleTranslation>`
(`translationsMap`) pour dédupliquer les traductions d'un message par langue.
Le classement de qualité y était déjà correct (premium > medium > basic, la
récence ne départageant que les ex æquo — itérations antérieures), MAIS la
**clé** de la map était le code de langue **verbatim** :

```ts
const existingTranslation = translationsMap.get(language ?? '');
// …
translationsMap.set(language ?? '', translation);
```

Les comparaisons d'affichage aval (`processMessageWithTranslations`,
`getPreferredLanguageContent`, `shouldRequestTranslation`) avaient déjà été
canonicalisées via le helper `sameLanguage`/`normalizeLanguageForDedup`
(itération 244/244b). Ce site — la **clé de dédup interne** — était le dernier
point du fichier à comparer des codes bruts. C'est exactement la « Future
improvement #1 » listée dans `2026-08-22-iteration-244b-analyse.md`.

## Problems identified

Un message peut porter deux `MessageTranslation` visant la **même** langue avec
des codes verbatim distincts : `fr` (bare) et `fr-FR` (région-tagué), ou `fr`
et `FR` (casse). Keyée par code brut, la map les traite comme **deux langues** :

1. **Le classement qualité est court-circuité.** `fr` (basic) et `fr-FR`
   (premium) restent deux entrées : le `shouldReplace` ne les compare jamais.
   Le tableau `translations` contient les deux, et le `.find(t =>
   sameLanguage(t.language, 'fr'))` d'affichage renvoie la **première insérée**
   — potentiellement la basic — alors qu'une premium existe. Le lecteur reçoit
   la traduction de moindre qualité. Régression directe de la garantie
   « qualité d'abord » posée par les itérations précédentes.
2. **Entrée dupliquée dans `translations`.** Deux `BubbleTranslation` pour la
   même langue traversent jusqu'à l'UI (sélecteur de langue, exploration du
   Prisme) — une langue apparaît deux fois.

## Root causes

Le dépôt possède la SSOT de canonicalisation `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`), déjà consommée aux points de
comparaison du hook depuis l'itération 244. La clé de la map, plus ancienne,
n'y avait jamais été routée : la canonicalisation s'arrêtait aux comparaisons
d'affichage et laissait la déduplication elle-même sur des codes bruts — le
point où la fuite `fr` vs `fr-FR` naît réellement.

## Business impact

- Contenu servi en qualité inférieure (basic au lieu de premium) dès que le
  backend émet des codes région-tagués pour une même cible — perte de qualité
  perçue de traduction, sans erreur ni trace.
- Doublon de langue dans les affichages d'exploration linguistique.

## Technical impact

Surface minimale : une clé locale dans une seule fonction. Aucun schéma, aucun
contrat wire, aucune signature publique modifiée. La valeur `language` stockée
dans chaque `BubbleTranslation` reste **verbatim** (le code du gagnant) — seule
la clé de regroupement est canonicalisée ; les comparaisons aval passent déjà
par `sameLanguage`, donc rien en aval ne dépend de la forme de la clé.

## Risk assessment

Faible. `normalizeLanguageForDedup` est idempotente sur les codes canoniques
(`fr` → `fr`) : les messages dont toutes les traductions portent déjà des codes
canoniques distincts sont inchangés. Seuls les cas région-tagués/casse-mixte de
même langue changent de résultat, dans le sens attendu (fusion + qualité
gagnante). `normalizeLanguageForDedup('')` renvoie `''` — parité exacte avec
l'ancien `language ?? ''` pour les traductions sans code.

## Proposed improvements (implemented)

Introduction d'une variable locale `dedupKey = normalizeLanguageForDedup(language
?? '')`, utilisée pour `translationsMap.get(dedupKey)` et
`translationsMap.set(dedupKey, translation)`. La valeur `language` du
`BubbleTranslation` reste inchangée (code verbatim du gagnant).

## Expected benefits

- Une seule entrée par langue réelle, quel que soit le tag région/casse.
- La qualité gagne toujours : une premium `fr-FR` l'emporte sur une basic `fr`,
  indépendamment de l'ordre d'arrivée.
- Zéro doublon de langue dans les affichages d'exploration.

## Implementation complexity

Triviale : une variable locale + deux substitutions dans la même boucle.

## Validation criteria

- 2 témoins RED posés d'abord (fr+fr-FR ⇒ 1 entrée premium ; fr-FR+FR ordre
  inverse ⇒ 1 entrée premium), verts après le fix.
- Suite complète du hook 52/52 verte ; voisine
  (`message-translation.service`) 18/18 verte (70/70 combiné).
- `tsc --noEmit` : zéro erreur dans le fichier touché.

## Future improvements

- Audit des consommateurs web restants de codes de langue bruts hors de ce
  hook (les revues du 22/08 ne signalaient plus ce fichier après 244b ; ce
  correctif ferme le dernier site interne connu).
- Miroir potentiel côté iOS/Android si une map de dédup équivalente y key par
  code brut — non vérifié dans cette itération (périmètre web).
