import { compacte } from '@/app/enveloppe/feuille';

import { avisDEcran } from './atomes-feuille';

/**
 * LA FEUILLE DU COMPOSER (`/composer`, #4966) — et elle est COURTE, parce que
 * l'essentiel est déjà écrit.
 *
 * **LE VOCABULAIRE DE FORMULAIRE DE LA ZONE VIT DANS `FEUILLE_DES_REGLAGES`** —
 * `.champ`, `.choix`, `.rangee`, les titres de section, la phrase d'aide. Le
 * composer sert donc `class="reglages composer"` : la première classe apporte
 * la forme, la seconde ce qui lui est propre. Redéclarer `.champ input` ici en
 * aurait fait DEUX définitions du même contrôle sur deux écrans qu'un tap
 * sépare — la jumelle que le § 3.2 interdit, et qui diverge au premier changement
 * de rayon.
 *
 * LE PRIX EST DIT : le composer paie quelques règles qu'il ne rend pas
 * (`.rangee .rang` des rangs de langue, `.retirer` des appareils). Mesuré à une
 * centaine d'octets gzip sur un document que le plafond par route
 * (20 Ko) ne serre pas — contre deux vérités sur ce qu'est un champ, qui elles
 * ne se mesurent qu'au moment où elles divergent.
 *
 * CE QUI LUI EST PROPRE, ET RIEN D'AUTRE :
 *
 * 1. **Les onglets de format sont des LIENS**, pas des boutons : sans
 *    JavaScript, changer de format est un changement d'ADRESSE (`?format=`),
 *    donc une navigation. `aria-current="page"` dit lequel est servi — la même
 *    convention que la puce de filtre de la galerie.
 * 2. **La grille d'humeurs est un groupe de RADIOS.** Un seul emoji est choisi,
 *    et c'est exactement ce qu'un `radiogroup` annonce au clavier et au lecteur
 *    d'écran. L'emoji lui-même est le libellé VISIBLE ; son nom accessible est
 *    le mot que la copie lui donne, sans quoi un lecteur d'écran annoncerait
 *    « emoji » dix fois.
 * 3. **Le radio lui-même porte `.hors-ecran`**, la classe du socle — jamais une
 *    seconde règle de masquage écrite ici. C'est le SEUL idiome que la charte
 *    règle 1 excepte de l'interdit des pixels littéraux, et il est excepté
 *    PAR SON NOM : le recopier sous un autre sélecteur serait à la fois un
 *    pixel écrit à la main et une deuxième façon de masquer un nœud.
 * 4. **L'action de publication est PLEINE LARGEUR et haute** (`--action-height`,
 *    56 px) : c'est le geste de l'écran, et la directive du porteur le veut
 *    gros.
 * 5. **LA TUILE « + AJOUTER » EST UN `<label>`, SON `<input type="file">` PORTE
 *    `.hors-ecran`** (#5390) — le MÊME idiome que le radio d'humeur ci-dessus :
 *    la cible tactile est le `<label>` entier (≥ 44 px de large et de haut),
 *    pas le contrôle natif qu'un navigateur dessinerait en simple bouton
 *    « Choisir un fichier ». `.alerte` du bloc médias n'a rien à redéclarer :
 *    c'est la MÊME règle globale (`app/enveloppe/feuille.ts`) que celle du
 *    refus serveur (`erreur`) — deux occasions, une seule apparence.
 * 6. **LA TUILE VIT DANS LA GRILLE DES APERÇUS, EN DERNIER** (revue #5390) —
 *    `cible/composer.png` montre une vignette et la tuile pointillée CÔTE À
 *    CÔTE, de même taille : une seule grille, `li.tuile-ajouter` en queue.
 * 7. **LE FOCUS SE VOIT SUR LE LABEL, PAS SUR L'INPUT CLIPPÉ** (revue #5390) —
 *    l'anneau global du socle (`:focus-visible`, règle 15) se pose bien sur
 *    l'`<input class="hors-ecran">`, sur un rectangle d'UN pixel : invisible.
 *    `:has(input:focus-visible)` le reporte sur le label VISIBLE — le même
 *    idiome, aux mêmes jetons, que `social-feuille.ts` (`parRang`). Il
 *    couvre AUSSI les humeurs, qui portaient la même cécité.
 * 8. **LE NOM DE FICHIER PREND LA PASTILLE OPAQUE DE `.etiquette`**
 *    (`fil-feuille.ts`, le libellé posé sur une pièce jointe) — un voile
 *    translucide encré `--color-on-primary` (#ffffff en clair) sur
 *    `--color-bg-sunken` (#e6e9f2 en clair) rendait le nom ILLISIBLE dans le
 *    schéma clair, sur un plan qui n'est de toute façon pas celui du texte.
 * 9. **LE BOUTON « RETIRER » (#5390, revue — défaut 1) REPREND LA MÊME
 *    PASTILLE OPAQUE**, jamais un voile translucide : le même raisonnement
 *    que la règle 8 s'applique — une icône encrée sur un fond translucide
 *    perd son contraste dès que la photo dessous est claire. Cible `44px`
 *    (`--target-min`) posée en HAUT-DROITE de la vignette, le `.nom` restant
 *    en BAS — les deux pastilles ne se chevauchent jamais.
 * 10. **LE REPLI `mediaAlt` (#5390, revue — défaut 3) NE REDÉCLARE RIEN DE
 *     `.champ`** — ses dix lignes sont le MÊME `<p class="champ">` que
 *     `champDuTexte`/`champDeLAudience`, stylé une seule fois par
 *     `reglages-feuille.ts`. Seuls `<details class="medias-alt">` et son
 *     `<summary>` sont propres à cet écran : un disclosure natif, sans
 *     triangle personnalisé — la charte ne demande pas de le redessiner.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1).
 */
export const FEUILLE_DU_COMPOSER = compacte(`
.composer .onglets{display:flex;justify-content:center;gap:var(--space-2);margin:0;padding:0;list-style:none}
.composer .onglets a{display:inline-flex;align-items:center;gap:var(--space-2);min-height:var(--target-min);padding:0 var(--space-4);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);text-decoration:none;color:var(--color-text-muted);font-weight:var(--font-weight-medium)}
.composer .onglets a svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.composer .onglets a[aria-current="page"]{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-on-primary)}

.composer .humeurs{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3);margin:0;padding:0;border:0}
.composer .humeurs legend{padding:0;font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.composer .humeurs label{display:grid;place-items:center;min-width:var(--target-min);min-height:var(--target-min);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:var(--color-surface);font-size:var(--text-xl);cursor:pointer}
.composer .humeurs label:has(input:checked){border-width:var(--stroke-strong);border-color:var(--color-primary);background:var(--color-tint-primary)}

.composer .medias{display:flex;flex-direction:column;gap:var(--space-3)}
.composer .medias .aide{display:block;color:var(--color-text-muted);font-size:var(--text-sm)}
.composer .apercus{display:grid;grid-template-columns:repeat(auto-fill,minmax(7rem,1fr));gap:var(--space-2);margin:0;padding:0;list-style:none}
.composer .apercus li{position:relative;aspect-ratio:1;border-radius:var(--radius-lg)}
.composer .apercus li:not(.tuile-ajouter){overflow:hidden;background:var(--color-bg-sunken)}
.composer .apercus li img,.composer .apercus li video{width:100%;height:100%;object-fit:cover}
.composer .apercus li .nom{position:absolute;inset:auto var(--space-2) var(--space-2);margin:0;padding:0 var(--space-2);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:var(--color-surface);color:var(--color-text);font-size:var(--text-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.composer .apercus li .retirer-media{position:absolute;top:var(--space-2);right:var(--space-2);display:grid;place-items:center;width:var(--target-min);height:var(--target-min);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:var(--color-surface);color:var(--color-text);cursor:pointer}
.composer .apercus li .retirer-media svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.composer .apercus li .retirer-media:focus-visible{outline:var(--stroke-focus) solid var(--color-focus);outline-offset:var(--stroke-strong)}
.composer .ajouter{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-1);width:100%;height:100%;min-width:var(--target-min);min-height:var(--target-min);border:var(--stroke-strong) dashed var(--color-border-interactive);border-radius:var(--radius-lg);color:var(--color-text-muted);cursor:pointer}
.composer .ajouter svg{width:var(--glyph-large);height:var(--glyph-large)}
.composer .humeurs label:has(input:focus-visible),.composer .ajouter:has(input:focus-visible){outline:var(--stroke-focus) solid var(--color-focus);outline-offset:var(--stroke-strong)}

.composer .medias-alt{margin-top:var(--space-3)}
.composer .medias-alt summary{min-height:var(--target-min);display:flex;align-items:center;font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-text-muted);cursor:pointer}
.composer .medias-alt .champ{margin-top:var(--space-2)}

${avisDEcran('.composer')}
.composer .publier{width:100%}
`);
