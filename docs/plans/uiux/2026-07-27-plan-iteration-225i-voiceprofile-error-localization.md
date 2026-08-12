# Plan — Iteration 225i

**Date** : 2026-07-27
**Surface** : messages d'erreur du profil vocal + fin du défaut d'accents
**Base** : `main` HEAD `68a1a33f9` · Branche `claude/quirky-curie-2pvzn1`

## Point de départ

Piste (a) du pointeur 223i (« balayage français sans accents hors profil
vocal »). Le balayage **infirme** le pronostic : 2 valeurs fautives seulement sur
1 461 clés — le défaut était concentré, pas diffus. Il révèle en revanche un
défaut plus lourd, invisible depuis le catalogue.

## Objectifs

1. **Traduire les 8 messages d'erreur du profil vocal**, aujourd'hui des
   littéraux français bruts affichés tels quels (`VoiceProfileManageView:122`).
2. Faire pointer `PostDetailViewModel` sur la clé SSOT existante au lieu d'une
   phrase française servant de clé.
3. Solder les 2 dernières valeurs `fr` non accentuées + 4 `defaultValue`.
4. **Poser un garde-fou** : plus aucun `self.error = "…"` littéral, et un ratchet
   français sur tout le catalogue.

## Étapes

1. 8 sites `self.error = "…"` → `String(localized:defaultValue:bundle:)`.
2. 8 clés neuves × 7 locales, terminologie alignée sur l'existant.
3. `PostDetailViewModel` → `profile.posts.report.success` (0 clé neuve).
4. Accents : 2 valeurs de catalogue, 4 `defaultValue`.
5. `VoiceProfileErrorLocalizationTests` (locales, absence de littéral, ratchet).

## Non-objectifs

- Ne pas étendre le balayage `self.error` aux autres ViewModels ici — le motif
  mérite son itération, avec la garde de celle-ci comme patron.
- Ne pas toucher au SDK.
- Ne pas inclure dans le ratchet des formes ambiguës (« Supprimer », « Archive »,
  « Envoyer ») : une garde qui crie à tort finit désactivée.
