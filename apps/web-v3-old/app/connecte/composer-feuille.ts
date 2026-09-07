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

${avisDEcran('.composer')}
.composer .publier{width:100%}
`);
