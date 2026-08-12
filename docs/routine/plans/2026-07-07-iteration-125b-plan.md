# Iteration 125 — Plan d'implémentation (2026-07-07)

## Objectifs
Corriger le filtrage par région des alternatives dans `LanguageCapabilitiesService` :
tautologie `cap.region == cap.region` + shadowing de variable sur `require_stt`, et commentaire
trompeur + shadowing sur `require_voice_cloning`.

## Modules affectés
- `services/translator/src/services/language_capabilities.py` (source, 2 blocs)
- `services/translator/tests/test_32_language_capabilities.py` (3 nouveaux tests)

## Phases
1. **RED** — ajouter `test_stt_alternatives_prefer_same_region` (+ fallback + garde VC). Confirmer l'échec
   du test région (retourne des langues européennes). ✅
2. **GREEN** — `require_stt` : renommer boucle + même-région-préféré-avec-fallback ; `require_voice_cloning` :
   corriger commentaire + renommer boucle. ✅
3. **REFACTOR** — n/a (fix minimal, code déjà propre après renommage).
4. **VALIDATION** — suite complète 110/110, syntax check, absence de callers impactés. ✅

## Dépendances
Aucune. Fichier isolé, aucun caller ne dépend du contenu/ordre des `available_alternatives`.

## Risques estimés
Très faibles. `available_alternatives` = indice d'erreur non structurant. Fallback préserve le contrat
(jamais de liste vide). VC : aucun changement de comportement.

## Rollback
`git revert` du commit unique. Aucune migration, aucun état persistant.

## Critères de validation
- [x] RED prouvé (test région échoue avant fix)
- [x] GREEN (110/110 après fix)
- [x] Fallback couvert (région sans sibling → alternatives non vides)
- [x] Contrat VC garanti (alternatives clonables)
- [x] Aucun caller externe impacté

## Statut : COMPLET

## Progress tracking
- Analyse : `docs/routine/analyses/2026-07-07-iteration-125-analyse.md`
- Branche : `claude/brave-archimedes-auzati`

## Future improvements
- Tri de pertinence secondaire (proximité linguistique) des alternatives STT si le set STT-less grandit.
</content>
