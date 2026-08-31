# Plan — Itération 288 : `ZmqRequestSender` canonicalise ses cibles de traduction

## Objectifs
Router la déduplication des `targetLanguages` de `sendTranslationRequest` vers la
SSOT locale `canonicalLanguage` (région strippée), pour aligner le jeu ENVOYÉ au
translator sur le jeu d'ATTENTE (déjà canonique) — fin de la divergence de la
Leçon 282 au point d'étranglement du texte.

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (lignes 85, 121)
- `services/gateway/src/__tests__/unit/services/ZmqRequestSender.test.ts` (témoin région)

## Phases
1. **RED** — ajouter un témoin sur `['fr-FR','fr','en-US']` attendant `['fr','en']`.
   Prouver qu'il échoue contre `.toLowerCase()` (`['fr-fr','fr','en-us']`).
2. **GREEN** — ligne 85 : `.map(l => l.toLowerCase())` → `.map(canonicalLanguage)`.
   Ligne 121 : retirer le `.map(canonicalLanguage)` redondant.
3. **REFACTOR** — vérifier que les trois témoins de dédup existants passent intacts.
4. **VALIDATION** — suite `ZmqRequestSender` verte, `tsc --noEmit` EXIT=0.

## Dépendances
Aucune. `canonicalLanguage` et `normalizeLanguageCode` déjà présents/importés.

## Risques estimés
Très faible. Convergence stricte : une cible invalide devient valide, des
variantes s'effondrent. Aucun code réel ne produit une nouvelle cible. Chemins
audio inchangés (région = voix, Leçon 282).

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant modifié.

## Critères de validation
- Le nouveau témoin RED→GREEN.
- Trois témoins de dédup existants intacts.
- `bunx jest ZmqRequestSender` vert.
- `tsc --noEmit` gateway EXIT=0.

## Statut
Implémenté dans le même commit que le gate.

## Améliorations futures
- `admin/broadcasts.ts` : `targetLanguages` dérivés d'un `groupBy(['systemLanguage'])`
  verbatim, persistés et servis sans canonicalisation (candidat #1 du balayage,
  défaut PERSISTÉ distinct de celui-ci). Prochaine itération.
- `admin/languages.ts` : stat `usersByLanguage` re-keyée sur `systemLanguage`
  verbatim (variantes comptées séparément) — affichage seul, priorité moindre.
