# Plan Iteration-199i — ConversationPreferencesTab : section « My display » → accent de conversation

**Branche de travail** : `claude/laughing-thompson-9alos2`
**Base** : `main` HEAD `81d9c6b` (resync ; #2210 Android mergé, hors scope)
**Piste** : iOS (`i`)

## Objectif

Faire adopter à la section « My display » de `ConversationPreferencesTab` la
**couleur d'accent de la conversation** (`accentColor`, déjà en portée) au lieu du
hex brut off-brand `A855F7` (Tailwind purple-500) codé en dur — application de
l'accent-color doctrine (règle impérative : les vues conversation ne hardcodent
jamais de couleur). Défaut explicitement différé par la PR #2199.

## Étapes

1. [x] Resync branche depuis `origin/main` (HEAD `81d9c6b`).
2. [x] Vérifier contention : `search_pull_requests ConversationPreferencesTab` →
   0 PR modifiant le fichier (#2199 le cite en note seulement). Numéro **199i**
   > plus haut en vol (198i #2209).
3. [x] Vérifier absence de test référençant la vue → 0.
4. [x] l.159 `color: "A855F7"` → `color: accentColor`.
5. [x] l.166 `Color(hex: "A855F7")` → `accent` ; l.168 `.opacity(0.12)` idem.
6. [x] l.214 `iconColor: "A855F7"` → `iconColor: accentColor`.
7. [x] `grep A855F7` → 0 restant.
8. [x] Analyse + plan + tracking.
9. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes

- 1 fichier, 4 lignes, 0 logique, 0 clé i18n neuve, 0 SDK, 0 test neuf.
- Changement visuel **assumé** (violet fixe → accent de conversation) =
  consolidation de marque délibérée (précédent 186i), alignée doctrine.
- Périmètre restreint à la section « My display » (incrémental) ; autres sections
  différées (voir analyse § Reste).
- APIs `Color(hex:)` / `settingsSection` inchangées → pas de garde de disponibilité.
- Auteur en conteneur Linux → build/VoiceOver validés en CI.
