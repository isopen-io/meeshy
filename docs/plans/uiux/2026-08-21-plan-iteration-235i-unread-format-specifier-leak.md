# Plan — Iteration-235i : le spécificateur de format sort de l'annonce VoiceOver

**Analyse** : `docs/analyses/uiux/2026-08-21-iteration-235i-unread-format-specifier-leak.md`
**Base** : `main` HEAD `c886b8b5` · **Branche** : `claude/intelligent-noether-z3vjqg` (re-lancée fraîche après merge de 234i)

## Thèse

234i nommait `unit.unread` comme suite (« 1 non lus »). En instruisant la
**famille** des compteurs de non-lus plutôt que le seul site nommé, un défaut
d'une autre nature est apparu : `accessibility.unread_messages` était appelée
**sans `String(format:)`** alors que sa valeur porte `%lld` dans les 7 locales.
VoiceOver énonçait le spécificateur brut sur chaque rangée non lue de l'écran
d'accueil.

## Étapes

1. **Retirer la valeur, pas la réparer.** Le compte vit déjà dans le libellé
   via `accessibility.unread_count` — seule clé `variations.plural` de la
   famille, et appelée correctement. Lui passer son argument produirait une
   annonce juste mais **redondante** ; `accessibilityValue` est d'ailleurs
   réservé à l'ÉTAT, pas à une donnée que le nom porte (HIG).
2. **Les deux rangées** — `LentilleConversationRow` dérive son libellé de
   `ThemedConversationRow`, elle héritait donc du compte correct ET recopiait
   la valeur cassée.
3. **Clé morte retirée du catalogue** (sinon `test_everyAppCatalogIdentifierKeyIsReferencedInCode`
   rougit — geste de 230i pour `forward.this-conversation`).
4. **Suite neuve** : régression du spécificateur sur 6 effectifs, garde que
   l'information n'a pas été perdue, conditionnalité du segment, garde de
   source sur les 2 fichiers.
5. **pbxproj** : 4 entrées.

## Pièges traités

| Piège | Traitement |
|---|---|
| Assertions dépendantes de la locale | Assertions sur le **nombre** et l'**absence de spécificateur** — vraies dans les 7 langues (le simulateur CI est en anglais) |
| Garde de source rougissant sur son propre commentaire | Elle cherche la forme **citée** `"…"`, les fichiers ne mentionnant la clé qu'en prose |
| Sérialisation du catalogue | Round-trip prouvé octet pour octet **avant** édition (leçon 234i) → diff = 47 lignes, exactement l'entrée retirée |
| Suite non exécutée par la CI | `[run test]` au sujet du commit (doctrine corrigée en 234i) |

## Empreinte

| Catégorie | Delta |
|---|---|
| Fichiers prod | 2 (−4 lignes de code, +12 de commentaire) |
| Suite de test | 1 neuve (4 tests) |
| Clés i18n | −1 morte retirée, **0 neuve** |
| Changement visuel / logique / réseau / SDK | 0 |

## Gate

CI `Build app + tests unitaires` (le nom qui atteste que la suite a tourné).
