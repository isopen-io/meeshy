# Iteration 174 — `getTranslationFromJSON` : recherche de langue casse-sensible (incohérence intra-module)

## Protocole (démarrage)
`main` @ `e0027ae` (dernier merge : PR #1899 — android/media ThumbHash encoder).
Branche `claude/brave-archimedes-k4xzr9` alignée sur `origin/main` (0/0).
Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript (web/gateway/shared). Ce cycle prend **174**.

Cible retenue par revue de cohérence de la couche utilitaire pure :
`services/gateway/src/utils/translation-transformer.ts` — le pont
JSON MongoDB ↔ API array du **Prisme Linguistique**.

## État actuel
Le module `translation-transformer.ts` expose deux fonctions de lecture des
traductions stockées dans `Message.translations` (objet JSON keyé par langue) :

- `transformTranslationsToArray(messageId, json, { languages })` — sérialise
  tout ou un sous-ensemble de langues. Le filtrage `languages` est **insensible
  à la casse** (`.toLowerCase()`, lignes 48-53), et le comportement est
  explicitement documenté dans la JSDoc (« Comparaison insensible à la casse »).
- `getTranslationFromJSON(messageId, json, targetLanguage)` — récupère **une**
  traduction. Le lookup reposait sur un accès direct `translations[targetLanguage]`,
  donc **strictement casse-sensible**.

## Problème identifié
Deux fonctions du **même module**, servant le même modèle de données, avaient
des sémantiques de correspondance de langue **divergentes**. Une clé stockée
`FR`, `pt-BR` ou `ZH-Hant` était trouvée par `transformTranslationsToArray('fr')`
mais **ratée** par `getTranslationFromJSON('fr')`, qui retournait `undefined`.

## Cause racine
`getTranslationFromJSON` déléguait la résolution à l'indexation d'objet native
(`translations[targetLanguage]`), qui exige une égalité de clé **byte-exacte**.
Aucune normalisation de casse n'était appliquée, contrairement à la fonction
sœur du module. L'intention de conception (matching de langue tolérant à la
casse) n'était donc exprimée qu'à moitié.

## Impact business
Régression silencieuse du **Prisme Linguistique** : si une traduction est
stockée sous une casse différente de celle demandée (variantes régionales
`pt-BR`/`zh-Hant`, ou codes normalisés en majuscules par un producteur amont),
la règle critique #1 du Prisme se déclencherait à tort — « pas de traduction →
afficher l'original » — alors qu'**une traduction existe bel et bien**.
L'utilisateur verrait le contenu original au lieu de sa langue préférée.

## Impact technique
- Incohérence de contrat sur une API **exportée** publiquement du module.
- Piège latent pour tout futur appelant (0 appelant production aujourd'hui —
  d'où la classification LOW, mais la surface publique justifie la correction
  préventive plutôt que le report indéfini).

## Évaluation du risque
**Très faible.** Périmètre = un fichier + son test. Le chemin exact-match reste
prioritaire (fast path inchangé, aucun coût pour le cas courant) ; le repli
casse-insensible n'entre en jeu que lorsque l'accès direct échoue. Aucun
appelant production affecté négativement — le comportement ne fait
qu'**élargir** l'ensemble des correspondances trouvées.

## Amélioration proposée (implémentée)
Aligner `getTranslationFromJSON` sur `transformTranslationsToArray` :
1. Tentative d'accès direct `translations[targetLanguage]` (fast path, casse
   exacte privilégiée — garantit le déterminisme si deux clés ne diffèrent que
   par la casse).
2. Repli : balayage `Object.entries(...).find(lang.toLowerCase() === target)`.
3. `undefined` uniquement si aucune des deux stratégies ne matche.

## Bénéfices attendus
- **Cohérence** : sémantique de langue unifiée dans tout le module.
- **Robustesse Prisme** : plus de faux « original » sur variantes de casse.
- **Zéro régression** : fast path exact-match préservé, invariant de préférence
  exact-vs-sibling verrouillé par test.

## Complexité d'implémentation
Triviale — 8 lignes de logique, 4 tests ajoutés (3 RED→GREEN + 1 invariant).

## Critères de validation
- `translation-transformer.test.ts` : 26/26 verts (22 existants + 4 nouveaux).
- RED confirmé : les 3 tests de casse échouent sur le code d'origine.
- `tsc --noEmit` : aucune erreur référençant `translation-transformer`.

## Notes
- Candidats connexes toujours reportés (0 appelant / décision produit) :
  `sanitizeFileName` overlong sans extension (F69), `parseMessageLinks` (traité
  iter-173).
