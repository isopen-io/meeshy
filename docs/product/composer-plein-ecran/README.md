# Composer plein écran — la maquette de référence (directive porteur 2026-09-27, #8281)

La scène occupe tout l'écran ; les contrôles flottent dessus. La MÊME scène sert à
éditer une image de conversation et à composer une story statique ou animée depuis
n'importe quel média.

| planche | fichier | ce qu'elle montre |
|---|---|---|
| Web mobile + coque Android | `Main.dc.html` | le prototype jouable (sources → composer → envoi) |
| iOS | `iOS.dc.html` | le menu « Publier comme » ouvert |
| Web bureau | `Web.dc.html` | le menu ouvert, photo en format propre |
| iPad (et la même app lancée sur Mac) | `iPad.dc.html` | le panneau Cadre |

`canvas.json` place les quatre planches ; les fichiers s'ouvrent dans un canevas
de design (format `.dc.html`).

## Les règles que la maquette fixe

1. **Le type se choisit à l'ENVOI, pas avant.** Aucun sélecteur de type en haut de
   l'écran. La capsule est scindée : `[↑ Publier la story | ^]`.
2. **La flèche CHOISIT, elle ne publie jamais.** Choisir « Post · Mosaïque » dans
   le menu arme ce choix et renomme la partie principale (« Publier le post ») ;
   seul l'appui sur Publier envoie. Une coche marque l'entrée armée.
3. **Sans geste sur la flèche, on publie ce que la capsule nomme** — le format de
   la porte. Un choix que le menu n'offre plus (slide retirée, format grisé)
   retombe sur ce format.
4. **Chaque média garde son format.** Une photo 4:3 ou paysage n'est pas rognée en
   9:16 : le panneau Cadre choisit Ajuster ou Remplir, et le fond (flou, noir,
   blanc, indigo, sable).
5. **Le même style, exactement, sur iOS, web mobile, tablette et navigateur.**
   iPad est la cible tablette ; il n'existe pas de version Mac à part.

## Ce que la maquette remplace

Elle supersède la géographie « aucun contrôle sur la scène, rails dans les
couloirs » (#4561, #4633 ; `apps/ios/CLAUDE.md` § 1) et la vue `1b` « scène
incrustée » de `MeeshyComposerDesign`. Le portage se fait par lots, chacun sous
son issue ; l'état vit dans les issues, jamais dans ce dossier.
