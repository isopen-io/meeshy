# Refonte de la liste des conversations (peau Lentille) — 2026-08-22

Branche : `feat/conversation-list-revamp` · worktree `../v2_meeshy-liste-conv`

## Décisions produit actées

| Sujet | Décision |
|---|---|
| Périmètre | Peau **Lentille** uniquement (`LentilleConversationRow`, `StoriesVivantsRail`, `LentilleFocusCard`). Exception : la remise à zéro des non-lus se vérifie dans **toutes** les versions de la vue. |
| Catégorie | Sur la **carte de focus magnifiée**, coin haut-gauche, tapable → sous-menu « Déplacer vers… » déjà écrit. Assume le revirement du 2026-08-22. |
| Effectif | **En bas à droite du cadre** de la rangée. Lecteur autorisé (admin de groupe OU plateforme ADMIN/BIGBOSS/**MODERATOR**) → entier **sans plafond**. Sinon plafond **199** → « 199+ ». Décision serveur. |
| Date | **Dans la bulle** d'aperçu, en bas à droite (comme l'heure d'une bulle de message). |
| Synchro | Icône ⟳ **retirée** de la rangée, renvoi automatique conservé. La **pastille rouge de non-lus** prend sa place. |
| Non-lus | Remise à zéro **dès l'ouverture**, en réutilisant le cache + la base locale existants. Aucun nouveau chemin de données. |

Tranché sans question (conventions du dépôt) : pas d'effectif sur un DM (`type != .direct`) ; preview de story en cercle recadré comme le tray ; anneau vu/non-vu rebranché ; mood et point de présence restent exclusifs (`MeeshyAvatar`).

## Lots

### Lot 1 — Droit de voir l'effectif exact (serveur)
- [ ] RED `packages/shared/__tests__/member-visibility.test.ts` : MODERATOR et admin de groupe voient l'entier ; membre simple plafonné à 199 → « 199+ »
- [ ] `packages/shared/utils/member-visibility.ts` : le droit combine platformRole (ADMIN|BIGBOSS|MODERATOR) **et** rôle de conversation (creator|admin)
- [ ] 4 sites gateway : `conversations/core.ts:953,1219`, `search.ts:326`, `participants.ts:324`
- [ ] 5 fanouts socket : `participants.ts:1060,1276`, `leave.ts:180`, `ban.ts:136,274`
- [ ] Schémas : le champ traverse `api-schemas.ts` (1204 **et** 1385) — sinon strippé en silence

### Lot 2 — Rangée : bulle, date dedans, effectif, pastille non-lus
- [ ] RED : la date n'est plus sur la ligne de titre ; elle est portée par la bulle, dans les 7 branches d'aperçu
- [ ] RED : `RelativeTimestampText` reste le seul porteur de la date (garde anti-régression)
- [ ] Bulle d'aperçu (fond, rayon, teinte clair/sombre) — cote dans `LentilleMetrics` + miroir `lentille-tokens.json`
- [ ] Effectif en bas à droite du cadre
- [ ] Pastille rouge de non-lus à la place de ⟳ ; retrait de l'icône de synchro
- [ ] `renderFingerprint` replie `memberCount` + `unreadCount` (sinon gel silencieux)

### Lot 3 — Trail de stories : preview + mood animé
- [ ] `LentilleRailEntry` gagne `previewURL`, `moodEmoji`, `hasUnviewed`
- [ ] Mapping dans `lentilleRailEntries` / `lentilleRailSelfEntry` — résolveur **partagé** avec le tray (pas de 3e implémentation)
- [ ] Badge mood animé, gardé reduce-motion

### Lot 4 — Catégorie sur la carte de focus
- [ ] `notchChip` haut-gauche + hit-testing local ré-armé
- [ ] Toucher → sous-menu « Déplacer vers… » existant, call site unique de `moveToSection`
- [ ] Rien affiché si la conversation n'a pas de catégorie
- [ ] `renderFingerprint` replie `sectionId`

### Lot 5 — Remise à zéro des non-lus (toutes versions de la vue)
- [ ] Auditer : Lentille, Themed, carte focal, web
- [ ] Vérifier la remise à zéro à l'ouverture sur chaque chemin (cache + GRDB)

### Lot 6 — Alignements et espacements
- [ ] Rangs 8 pt / squelette 16 pt / header 16 pt → une seule constante
- [ ] Bandes de section pleine largeur (`x=0 w=402`) vs rangs (`x=8 w=386`)
- [ ] Bouton flottant « Flux » posé sur l'avatar d'un rang
- [ ] Barre de recherche flottante qui coupe un rang
- [ ] Trail collée au 1er header (0 pt)
- [ ] Section rendue vide (2 headers empilés)
- [ ] Carte focal qui recouvre la trail
- [ ] Format de date « 1mois » (espace manquant)

## Vérification
`./apps/ios/meeshy.sh test` complet + passe simulateur clair/sombre, DM/groupe, avec/sans non-lus.

## Revue
_(à remplir)_
