# Profil : la vue finale (proposition à valider)

> **Proposition du 2026-11-16, à valider par le porteur (#18857).** Le profil se lit en trois faces — Vitrine, Liens, Actions — sur iOS, Android et web, et il est fait du kit. Tant qu'elle n'est pas validée, cette proposition ne remplace ni la spec en vigueur de la fiche (`docs/superpowers/specs/2026-11-15-reglages-et-fiche-profil-reorganises-design.md`, #18590), ni la loi d'accès des cercles (`packages/shared/utils/relation-access.ts`), qui reste l'autorité de ce que chaque niveau voit.

- Sources des planches (une par vue, balisage HTML à jetons) : [`profil-vue-finale/src/`](profil-vue-finale/src/)
- Captures : [`profil-vue-finale/vues/`](profil-vue-finale/vues/). Elles se régénèrent, aucune n'est posée à la main : `node docs/product/profil-vue-finale/brief/build.mjs` puis `NODE_PATH=$(npm root -g) node docs/product/profil-vue-finale/brief/vues.cjs`.
- Brief commun (doctrine, personnages, kit, décisions de cohérence et de nommage) : [`profil-vue-finale/brief/BRIEF.md`](profil-vue-finale/brief/BRIEF.md)
- Plan du kit (nouveaux, évolutions, hors kit) : [`profil-vue-finale/brief/plan-kit.json`](profil-vue-finale/brief/plan-kit.json)
- Cadrage du canevas : [`profil-vue-finale/canvas.json`](profil-vue-finale/canvas.json)
- Développement : [`.claude/workflows/meeshy-profil-vue-finale.md`](../../.claude/workflows/meeshy-profil-vue-finale.md)

**Conformité = disposition, hiérarchie, états et gestes.** Les polices, rayons et teintes viennent du design system de chaque plateforme (`MeeshyColors.swift`, `packages/design-tokens/ios.css`). Les personnages et les chiffres des planches sont des exemples.

## Les lois

1. **Un profil a trois faces.** Vitrine : qui je suis. Liens : ce qui amène vers moi. Actions : ce que je peux faire. Chacune se reconnaît à sa forme : la Vitrine est immersive (bannière vivante, couleur d'accent de la personne), les Liens sont des billets à encoches aux adresses en chasse fixe, les Actions sont des boutons ronds de verre libellés.
2. **La page publique n'est pas une autre page.** C'est la Vitrine au cercle Public. « Voir comme » rend ma Vitrine telle que la voit chaque cercle (Public, Communauté, Connaissance, Ami, Proche, Sang).
3. **La fiche d'un autre est le profil d'une relation.** Ce qu'elle montre et permet dépend du cercle commun, qui est le plus bas des deux niveaux accordés. La pilule de relation le dit ; « Notre cercle » montre ce qui manque pour monter.
4. **Ce qui est fermé se voit, verrouillé.** Une capacité que mon cercle n'ouvre pas s'affiche en rangée fantôme avec le cercle qui l'ouvre. Elle ne porte jamais la donnée protégée, ni un champ voisin.
5. **Le sélecteur de faces est en bas, dans la zone du pouce.** Verre liquide sur iOS, barre tonale sur Android. Sur le web large, les trois faces de MA fiche sont trois colonnes ; pour la fiche d'un autre, voir #18845. Une feuille, un écran poussé, une carte plein écran et un état sans fiche n'ont pas de sélecteur.
6. **La carte est une action, pas un onglet.** L'avatar se détache de la fiche et devient l'épingle ; la fiche devient une feuille basse.
7. **Rien n'apparaît : tout vient de quelque part.** Chaque mouvement sort de la table K26, dure au plus 600 ms, n'anime que la transformation et l'opacité, et se réduit à un fondu sous « Réduire les animations ».
8. **Cache d'abord.** Un squelette seulement si le cache est vide ; hors ligne, la fiche se lit et les actions réseau se mettent en file ; une erreur a toujours « Réessayer » ; un état vide a toujours une sortie.
9. **Privé et inexistant se confondent.** Un profil introuvable et un profil qui ne m'est pas visible rendent le même écran.
10. **La présence obéit à sa loi, sans exception nouvelle** (`presence-visibility.ts`) : rien sous Ami, « en ligne » ou rien pour un Ami, détaillée dès Proche.
11. **Aucune régression de feature.** Ce que la fiche actuelle sait faire se garde, rangé dans la face qui lui revient.
12. **Tout est fait du kit.** Aucun composant ne se dessine sur place dans un écran.

## Le kit

13 composants existants réemployés (K01–K25), 33 évolutions de composants, 30 composants nouveaux proposés (K26–K55), 13 familles laissées hors kit. Le détail est dans le brief (§ 9 et § 10) et dans `plan-kit.json` ; chaque composant nouveau a sa planche-fiche `src/Kit-K<nn>-<Nom>.dc.html` (rôle, anatomie, variantes, états, mouvement, API, jumeaux à extraire, témoins).

| Proposés par le profil | Révélés par l'inventaire des écrans |
|---|---|
| K26 `MeeshyMotion` · K27 `MeeshyLivingBanner` · K28 `MeeshyCollapsingHero` · K29 `MeeshyAvatarMorph` · K30 `MeeshyTicket` · K31 `MeeshyCodeCard` · K32 `MeeshyLabeledAction` · K33 `MeeshyCircleScale` · K34 `MeeshyFigures` · K35 `MeeshyWavePlayer` · K36 `MeeshyMapPin` · K37 `MeeshyLockedRow` · K38 `MeeshyStateBlock` · K39 `MeeshyPersonRow` | K40 `MeeshyButton` · K41 `MeeshyBadge` · K42 `MeeshyMeter` · K43 `MeeshyGroupCard` · K44 `MeeshySectionHeader` · K45 `MeeshyMedallion` · K46 `MeeshyNote` · K47 `MeeshyChoiceTiles` · K48 `MeeshyAvatarGroup` · K49 `MeeshyMediaGrid` · K50 `MeeshyChart` · K51 `MeeshyTranslationMark` · K52 `MeeshyReorderList` · K53 `MeeshyStepper` · K54 `MeeshyMapTrace` · K55 `MeeshyKeyHint` |

Les numéros et les noms d'API des évolutions sont des propositions, à confirmer au premier lot de kit.

## Ce que la planche propose de nouveau

Lien et QR de profil sur iOS et web · adresse courte `meeshy.me/@pseudo` · « Mes adresses » · aperçu de lien par personne · « Voir comme » · amis, communautés et médias en commun · couleur d'accent choisie · ville affichée · carte des visiteurs d'un lien · carte de tous mes proches · position Sang et mode fantôme côté client · envoyer le profil depuis iOS · partage sans contact.

## Décisions ouvertes

- #18844 : l'icône de la présence, du temps restant d'un partage et de l'envoi d'un contenu.
- #18845 : sur le web large, la fiche d'un autre garde-t-elle un sélecteur de faces.

## Les vues

### Moi · les trois faces

| Vue | Source | Capture |
|---|---|---|
| Ma vitrine · iOS | [`Main.dc.html`](profil-vue-finale/src/Main.dc.html) | [`Main.jpg`](profil-vue-finale/vues/Main.jpg) |
| Voir comme · par cercle | [`Moi-Apercu.dc.html`](profil-vue-finale/src/Moi-Apercu.dc.html) | [`Moi-Apercu.jpg`](profil-vue-finale/vues/Moi-Apercu.jpg) |
| Ma vitrine en édition | [`Moi-Edition.dc.html`](profil-vue-finale/src/Moi-Edition.dc.html) | [`Moi-Edition.jpg`](profil-vue-finale/vues/Moi-Edition.jpg) |
| Mes liens · la face Liens | [`Moi-Liens.dc.html`](profil-vue-finale/src/Moi-Liens.dc.html) | [`Moi-Liens.jpg`](profil-vue-finale/vues/Moi-Liens.jpg) |
| Mes actions · la face Actions | [`Moi-Actions.dc.html`](profil-vue-finale/src/Moi-Actions.dc.html) | [`Moi-Actions.jpg`](profil-vue-finale/vues/Moi-Actions.jpg) |
| Prototype · les trois faces et la carte | [`Prototype.dc.html`](profil-vue-finale/src/Prototype.dc.html) | [`Prototype.jpg`](profil-vue-finale/vues/Prototype.jpg) |

### Liens · tout ce qui amène vers moi

| Vue | Source | Capture |
|---|---|---|
| Détail d'un lien de suivi | [`Lien-Detail.dc.html`](profil-vue-finale/src/Lien-Detail.dc.html) | [`Lien-Detail.jpg`](profil-vue-finale/vues/Lien-Detail.jpg) |
| Créer un lien | [`Lien-Creer.dc.html`](profil-vue-finale/src/Lien-Creer.dc.html) | [`Lien-Creer.jpg`](profil-vue-finale/vues/Lien-Creer.jpg) |
| Créer un lien de suivi · cibles et UTM | [`Lien-Suivi-Creer.dc.html`](profil-vue-finale/src/Lien-Suivi-Creer.dc.html) | [`Lien-Suivi-Creer.jpg`](profil-vue-finale/vues/Lien-Suivi-Creer.jpg) |
| Lien de partage · arrivées | [`Lien-Partage.dc.html`](profil-vue-finale/src/Lien-Partage.dc.html) | [`Lien-Partage.jpg`](profil-vue-finale/vues/Lien-Partage.jpg) |
| Détail d'un lien de communauté | [`Lien-Communaute.dc.html`](profil-vue-finale/src/Lien-Communaute.dc.html) | [`Lien-Communaute.jpg`](profil-vue-finale/vues/Lien-Communaute.jpg) |
| Parrainage | [`Parrainage.dc.html`](profil-vue-finale/src/Parrainage.dc.html) | [`Parrainage.jpg`](profil-vue-finale/vues/Parrainage.jpg) |
| Mes adresses | [`Mes-Adresses.dc.html`](profil-vue-finale/src/Mes-Adresses.dc.html) | [`Mes-Adresses.jpg`](profil-vue-finale/vues/Mes-Adresses.jpg) |
| Ma carte de profil · QR et sans contact | [`Carte-Profil.dc.html`](profil-vue-finale/src/Carte-Profil.dc.html) | [`Carte-Profil.jpg`](profil-vue-finale/vues/Carte-Profil.jpg) |
| Partage sans contact · le parcours | [`Sans-Contact.dc.html`](profil-vue-finale/src/Sans-Contact.dc.html) | [`Sans-Contact.jpg`](profil-vue-finale/vues/Sans-Contact.jpg) |

### L'autre · les trois faces

| Vue | Source | Capture |
|---|---|---|
| Vitrine d'un Proche | [`Autre-Vitrine.dc.html`](profil-vue-finale/src/Autre-Vitrine.dc.html) | [`Autre-Vitrine.jpg`](profil-vue-finale/vues/Autre-Vitrine.jpg) |
| Ses publications | [`Autre-Publications.dc.html`](profil-vue-finale/src/Autre-Publications.dc.html) | [`Autre-Publications.jpg`](profil-vue-finale/vues/Autre-Publications.jpg) |
| En commun | [`Autre-Commun.dc.html`](profil-vue-finale/src/Autre-Commun.dc.html) | [`Autre-Commun.jpg`](profil-vue-finale/vues/Autre-Commun.jpg) |
| Ses liens | [`Autre-Liens.dc.html`](profil-vue-finale/src/Autre-Liens.dc.html) | [`Autre-Liens.jpg`](profil-vue-finale/vues/Autre-Liens.jpg) |
| Actions sur un Proche | [`Autre-Actions.dc.html`](profil-vue-finale/src/Autre-Actions.dc.html) | [`Autre-Actions.jpg`](profil-vue-finale/vues/Autre-Actions.jpg) |
| Notre cercle | [`Autre-Cercle.dc.html`](profil-vue-finale/src/Autre-Cercle.dc.html) | [`Autre-Cercle.jpg`](profil-vue-finale/vues/Autre-Cercle.jpg) |
| Fiche d'un inconnu · cercle Public | [`Autre-Inconnu.dc.html`](profil-vue-finale/src/Autre-Inconnu.dc.html) | [`Autre-Inconnu.jpg`](profil-vue-finale/vues/Autre-Inconnu.jpg) |

### La carte

| Vue | Source | Capture |
|---|---|---|
| Léo sur la carte | [`Carte-Personne.dc.html`](profil-vue-finale/src/Carte-Personne.dc.html) | [`Carte-Personne.jpg`](profil-vue-finale/vues/Carte-Personne.jpg) |
| Tous mes proches sur la carte | [`Carte-Proches.dc.html`](profil-vue-finale/src/Carte-Proches.dc.html) | [`Carte-Proches.jpg`](profil-vue-finale/vues/Carte-Proches.jpg) |
| Partager ma position | [`Carte-Partage.dc.html`](profil-vue-finale/src/Carte-Partage.dc.html) | [`Carte-Partage.jpg`](profil-vue-finale/vues/Carte-Partage.jpg) |
| Position Sang · historique et fantôme | [`Carte-Sang.dc.html`](profil-vue-finale/src/Carte-Sang.dc.html) | [`Carte-Sang.jpg`](profil-vue-finale/vues/Carte-Sang.jpg) |

### États et garde-fous

| Vue | Source | Capture |
|---|---|---|
| Premier chargement · cache vide | [`Etat-Chargement.dc.html`](profil-vue-finale/src/Etat-Chargement.dc.html) | [`Etat-Chargement.jpg`](profil-vue-finale/vues/Etat-Chargement.jpg) |
| États vides | [`Etat-Vide.dc.html`](profil-vue-finale/src/Etat-Vide.dc.html) | [`Etat-Vide.jpg`](profil-vue-finale/vues/Etat-Vide.jpg) |
| Erreurs et refus | [`Etat-Erreur.dc.html`](profil-vue-finale/src/Etat-Erreur.dc.html) | [`Etat-Erreur.jpg`](profil-vue-finale/vues/Etat-Erreur.jpg) |
| Hors ligne · le cache répond | [`Etat-HorsLigne.dc.html`](profil-vue-finale/src/Etat-HorsLigne.dc.html) | [`Etat-HorsLigne.jpg`](profil-vue-finale/vues/Etat-HorsLigne.jpg) |
| Personne bloquée | [`Etat-Bloque.dc.html`](profil-vue-finale/src/Etat-Bloque.dc.html) | [`Etat-Bloque.jpg`](profil-vue-finale/vues/Etat-Bloque.jpg) |
| Profil introuvable ou privé | [`Etat-Introuvable.dc.html`](profil-vue-finale/src/Etat-Introuvable.dc.html) | [`Etat-Introuvable.jpg`](profil-vue-finale/vues/Etat-Introuvable.jpg) |
| Demande de connexion | [`Etat-Demande.dc.html`](profil-vue-finale/src/Etat-Demande.dc.html) | [`Etat-Demande.jpg`](profil-vue-finale/vues/Etat-Demande.jpg) |
| Signaler ou bloquer | [`Signaler.dc.html`](profil-vue-finale/src/Signaler.dc.html) | [`Signaler.jpg`](profil-vue-finale/vues/Signaler.jpg) |

### Android · Material 3 Expressive

| Vue | Source | Capture |
|---|---|---|
| Android · vitrine | [`Android-Vitrine.dc.html`](profil-vue-finale/src/Android-Vitrine.dc.html) | [`Android-Vitrine.jpg`](profil-vue-finale/vues/Android-Vitrine.jpg) |
| Android · ma vitrine et « Voir comme » | [`Android-Moi.dc.html`](profil-vue-finale/src/Android-Moi.dc.html) | [`Android-Moi.jpg`](profil-vue-finale/vues/Android-Moi.jpg) |
| Android · liens | [`Android-Liens.dc.html`](profil-vue-finale/src/Android-Liens.dc.html) | [`Android-Liens.jpg`](profil-vue-finale/vues/Android-Liens.jpg) |
| Android · actions | [`Android-Actions.dc.html`](profil-vue-finale/src/Android-Actions.dc.html) | [`Android-Actions.jpg`](profil-vue-finale/vues/Android-Actions.jpg) |
| Android · carte | [`Android-Carte.dc.html`](profil-vue-finale/src/Android-Carte.dc.html) | [`Android-Carte.jpg`](profil-vue-finale/vues/Android-Carte.jpg) |
| Android · feuilles et états | [`Android-Feuilles.dc.html`](profil-vue-finale/src/Android-Feuilles.dc.html) | [`Android-Feuilles.jpg`](profil-vue-finale/vues/Android-Feuilles.jpg) |

### Web · page publique et grand écran

| Vue | Source | Capture |
|---|---|---|
| Web · page publique sur téléphone | [`Web-Public-Mobile.dc.html`](profil-vue-finale/src/Web-Public-Mobile.dc.html) | [`Web-Public-Mobile.jpg`](profil-vue-finale/vues/Web-Public-Mobile.jpg) |
| Web · page publique | [`Web-Public.dc.html`](profil-vue-finale/src/Web-Public.dc.html) | [`Web-Public.jpg`](profil-vue-finale/vues/Web-Public.jpg) |
| Web · mon profil, trois faces côte à côte | [`Web-Moi.dc.html`](profil-vue-finale/src/Web-Moi.dc.html) | [`Web-Moi.jpg`](profil-vue-finale/vues/Web-Moi.jpg) |
| Web · profil d'un Proche | [`Web-Autre.dc.html`](profil-vue-finale/src/Web-Autre.dc.html) | [`Web-Autre.jpg`](profil-vue-finale/vues/Web-Autre.jpg) |
| Web · un lien en grand | [`Web-Lien.dc.html`](profil-vue-finale/src/Web-Lien.dc.html) | [`Web-Lien.jpg`](profil-vue-finale/vues/Web-Lien.jpg) |
| Web · états et carte des proches | [`Web-Etats.dc.html`](profil-vue-finale/src/Web-Etats.dc.html) | [`Web-Etats.jpg`](profil-vue-finale/vues/Web-Etats.jpg) |
| Aperçu du lien de profil | [`Apercu-Lien.dc.html`](profil-vue-finale/src/Apercu-Lien.dc.html) | [`Apercu-Lien.jpg`](profil-vue-finale/vues/Apercu-Lien.jpg) |

### Grands écrans et hors de l'app

| Vue | Source | Capture |
|---|---|---|
| iPad · fiche et carte côte à côte | [`iPad-Split.dc.html`](profil-vue-finale/src/iPad-Split.dc.html) | [`iPad-Split.jpg`](profil-vue-finale/vues/iPad-Split.jpg) |
| Hors de l'app · écran verrouillé, widgets, tuiles | [`Hors-App.dc.html`](profil-vue-finale/src/Hors-App.dc.html) | [`Hors-App.jpg`](profil-vue-finale/vues/Hors-App.jpg) |

### Système · icônes, boutons, mouvement, matériel

| Vue | Source | Capture |
|---|---|---|
| Système · toutes les icônes | [`Sys-Icones.dc.html`](profil-vue-finale/src/Sys-Icones.dc.html) | [`Sys-Icones.jpg`](profil-vue-finale/vues/Sys-Icones.jpg) |
| Système · boutons et composants | [`Sys-Boutons.dc.html`](profil-vue-finale/src/Sys-Boutons.dc.html) | [`Sys-Boutons.jpg`](profil-vue-finale/vues/Sys-Boutons.jpg) |
| Système · mouvement et morphisme | [`Sys-Mouvement.dc.html`](profil-vue-finale/src/Sys-Mouvement.dc.html) | [`Sys-Mouvement.jpg`](profil-vue-finale/vues/Sys-Mouvement.jpg) |
| Système · matériel par plateforme | [`Sys-Materiel.dc.html`](profil-vue-finale/src/Sys-Materiel.dc.html) | [`Sys-Materiel.jpg`](profil-vue-finale/vues/Sys-Materiel.jpg) |
| Système · matrice des fonctions | [`Sys-Matrice.dc.html`](profil-vue-finale/src/Sys-Matrice.dc.html) | [`Sys-Matrice.jpg`](profil-vue-finale/vues/Sys-Matrice.jpg) |

### Kit · la carte, le réemploi, les évolutions, l'adoption

| Vue | Source | Capture |
|---|---|---|
| Kit · la carte du kit | [`Kit-Carte.dc.html`](profil-vue-finale/src/Kit-Carte.dc.html) | [`Kit-Carte.jpg`](profil-vue-finale/vues/Kit-Carte.jpg) |
| Kit · ce qu'on réemploie (K01–K25) | [`Kit-Reemploi.dc.html`](profil-vue-finale/src/Kit-Reemploi.dc.html) | [`Kit-Reemploi.jpg`](profil-vue-finale/vues/Kit-Reemploi.jpg) |
| Kit · évolutions et hors kit | [`Kit-Evolutions.dc.html`](profil-vue-finale/src/Kit-Evolutions.dc.html) | [`Kit-Evolutions.jpg`](profil-vue-finale/vues/Kit-Evolutions.jpg) |
| Kit · adoption et ordre de construction | [`Kit-Adoption.dc.html`](profil-vue-finale/src/Kit-Adoption.dc.html) | [`Kit-Adoption.jpg`](profil-vue-finale/vues/Kit-Adoption.jpg) |

### Kit · les composants apportés par le profil (K26 à K39)

| Vue | Source | Capture |
|---|---|---|
| K26 · MeeshyMotion | [`Kit-K26-MeeshyMotion.dc.html`](profil-vue-finale/src/Kit-K26-MeeshyMotion.dc.html) | — |
| K27 · MeeshyLivingBanner | [`Kit-K27-MeeshyLivingBanner.dc.html`](profil-vue-finale/src/Kit-K27-MeeshyLivingBanner.dc.html) | — |
| K28 · MeeshyCollapsingHero | [`Kit-K28-MeeshyCollapsingHero.dc.html`](profil-vue-finale/src/Kit-K28-MeeshyCollapsingHero.dc.html) | — |
| K29 · MeeshyAvatarMorph | [`Kit-K29-MeeshyAvatarMorph.dc.html`](profil-vue-finale/src/Kit-K29-MeeshyAvatarMorph.dc.html) | — |
| K30 · MeeshyTicket | [`Kit-K30-MeeshyTicket.dc.html`](profil-vue-finale/src/Kit-K30-MeeshyTicket.dc.html) | — |
| K31 · MeeshyCodeCard | [`Kit-K31-MeeshyCodeCard.dc.html`](profil-vue-finale/src/Kit-K31-MeeshyCodeCard.dc.html) | — |
| K32 · MeeshyLabeledAction | [`Kit-K32-MeeshyLabeledAction.dc.html`](profil-vue-finale/src/Kit-K32-MeeshyLabeledAction.dc.html) | — |
| K33 · MeeshyCircleScale | [`Kit-K33-MeeshyCircleScale.dc.html`](profil-vue-finale/src/Kit-K33-MeeshyCircleScale.dc.html) | — |
| K34 · MeeshyFigures | [`Kit-K34-MeeshyFigures.dc.html`](profil-vue-finale/src/Kit-K34-MeeshyFigures.dc.html) | — |
| K35 · MeeshyWavePlayer | [`Kit-K35-MeeshyWavePlayer.dc.html`](profil-vue-finale/src/Kit-K35-MeeshyWavePlayer.dc.html) | — |
| K36 · MeeshyMapPin | [`Kit-K36-MeeshyMapPin.dc.html`](profil-vue-finale/src/Kit-K36-MeeshyMapPin.dc.html) | — |
| K37 · MeeshyLockedRow | [`Kit-K37-MeeshyLockedRow.dc.html`](profil-vue-finale/src/Kit-K37-MeeshyLockedRow.dc.html) | — |
| K38 · MeeshyStateBlock | [`Kit-K38-MeeshyStateBlock.dc.html`](profil-vue-finale/src/Kit-K38-MeeshyStateBlock.dc.html) | — |
| K39 · MeeshyPersonRow | [`Kit-K39-MeeshyPersonRow.dc.html`](profil-vue-finale/src/Kit-K39-MeeshyPersonRow.dc.html) | — |

### Kit · les composants révélés par l'inventaire (K40 à K55)

| Vue | Source | Capture |
|---|---|---|
| K40 · MeeshyButton | [`Kit-K40-MeeshyButton.dc.html`](profil-vue-finale/src/Kit-K40-MeeshyButton.dc.html) | — |
| K41 · MeeshyBadge | [`Kit-K41-MeeshyBadge.dc.html`](profil-vue-finale/src/Kit-K41-MeeshyBadge.dc.html) | — |
| K42 · MeeshyMeter | [`Kit-K42-MeeshyMeter.dc.html`](profil-vue-finale/src/Kit-K42-MeeshyMeter.dc.html) | — |
| K43 · MeeshyGroupCard | [`Kit-K43-MeeshyGroupCard.dc.html`](profil-vue-finale/src/Kit-K43-MeeshyGroupCard.dc.html) | — |
| K44 · MeeshySectionHeader | [`Kit-K44-MeeshySectionHeader.dc.html`](profil-vue-finale/src/Kit-K44-MeeshySectionHeader.dc.html) | — |
| K45 · MeeshyMedallion | [`Kit-K45-MeeshyMedallion.dc.html`](profil-vue-finale/src/Kit-K45-MeeshyMedallion.dc.html) | — |
| K46 · MeeshyNote | [`Kit-K46-MeeshyNote.dc.html`](profil-vue-finale/src/Kit-K46-MeeshyNote.dc.html) | — |
| K47 · MeeshyChoiceTiles | [`Kit-K47-MeeshyChoiceTiles.dc.html`](profil-vue-finale/src/Kit-K47-MeeshyChoiceTiles.dc.html) | — |
| K48 · MeeshyAvatarGroup | [`Kit-K48-MeeshyAvatarGroup.dc.html`](profil-vue-finale/src/Kit-K48-MeeshyAvatarGroup.dc.html) | — |
| K49 · MeeshyMediaGrid | [`Kit-K49-MeeshyMediaGrid.dc.html`](profil-vue-finale/src/Kit-K49-MeeshyMediaGrid.dc.html) | — |
| K50 · MeeshyChart | [`Kit-K50-MeeshyChart.dc.html`](profil-vue-finale/src/Kit-K50-MeeshyChart.dc.html) | — |
| K51 · MeeshyTranslationMark | [`Kit-K51-MeeshyTranslationMark.dc.html`](profil-vue-finale/src/Kit-K51-MeeshyTranslationMark.dc.html) | — |
| K52 · MeeshyReorderList | [`Kit-K52-MeeshyReorderList.dc.html`](profil-vue-finale/src/Kit-K52-MeeshyReorderList.dc.html) | — |
| K53 · MeeshyStepper | [`Kit-K53-MeeshyStepper.dc.html`](profil-vue-finale/src/Kit-K53-MeeshyStepper.dc.html) | — |
| K54 · MeeshyMapTrace | [`Kit-K54-MeeshyMapTrace.dc.html`](profil-vue-finale/src/Kit-K54-MeeshyMapTrace.dc.html) | — |
| K55 · MeeshyKeyHint | [`Kit-K55-MeeshyKeyHint.dc.html`](profil-vue-finale/src/Kit-K55-MeeshyKeyHint.dc.html) | — |
