import { compacte } from '@/app/enveloppe/feuille';

/**
 * La feuille PROPRE à la vitrine — ce que la page d'accueil ajoute au chrome.
 *
 * Le chrome lui-même (gouttière, marque, actions, titre de section, pied) vit
 * dans `app/enveloppe/feuille.ts` depuis que les cinq pages institutionnelles le
 * partagent : il appartient au SITE, pas à cet écran.
 *
 * Ce qui reste ici ne sert qu'à l'accueil : le héros, la grille des atouts, le
 * bloc de mission et l'appel final.
 *
 * CE QUE LA CHARTE Y A CHANGÉ (conception § 12.5, directive du 2026-09-01) —
 * « les pages EXISTANTES de la v3 sont TERNES : il faut les STYLISER, sans les
 * alourdir » :
 *
 * 1. **Le héros est une CARTE** posée sur le voile `--color-tint-primary`
 *    (règle 11, qui l'autorise pour la vitrine et pour elle seule). C'est le
 *    seul plan de couleur de l'écran, et il ne coûte pas un octet de plus : un
 *    `color-mix` sur deux jetons déjà servis.
 * 2. **Les deux appels à l'action s'EMPILENT** (règle 4) : 56 px puis 52 px,
 *    pleine largeur, `--space-3` entre eux. Ils partageaient une ligne, ce qui
 *    les rendait étroits — donc durs à viser — sur un téléphone de 360 px.
 * 3. **Chaque atout porte sa TUILE** (règle 12, `home › Mes liens` : un glyphe
 *    sur `--color-tint-primary`). Neuf cartes de texte pur se lisaient comme une
 *    liste de courses ; la tuile donne à chacune son point d'entrée.
 * 4. **Les espacements viennent des neuf pas de la table** (règles 1 et 8) :
 *    `--space-7` entre deux sections, `--space-6` dans une carte, `--space-3`
 *    entre deux actions. Ils étaient en pixels littéraux (64, 72, 26, 20, 18,
 *    14…), c'est-à-dire une échelle inventée par écran.
 * 5. **L'accent ne peint plus que `h1 em`** (règle 13). Le badge et la devise de
 *    la mission le prenaient aussi : trois accents sur un même écran, dont deux
 *    sur des mots qu'on ne clique pas — exactement l'inflation que la règle
 *    interdit. Le badge garde son glyphe et son contour ; la devise garde ses
 *    petites capitales.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (§ 3.2 corollaire 2, charte
 * règle 1). Témoin : `__tests__/charte.test.ts`.
 */
export const FEUILLE_DE_LA_VITRINE = compacte(`
.heros{margin-top:var(--space-6);padding:var(--space-4);border-radius:var(--radius-lg);background:var(--color-tint-primary)}
.badge{display:inline-flex;align-items:center;gap:var(--space-2);margin:0 0 var(--space-5);padding:var(--space-2) var(--space-4);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.badge svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.heros h1{margin:0 0 var(--space-4);font-size:var(--text-4xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.heros h1 em{font-style:normal;color:var(--color-primary)}
.accroche{margin:0 0 var(--space-6);max-width:var(--measure);color:var(--color-text-muted)}
.actions{display:flex;flex-direction:column;gap:var(--space-3)}

.atouts{margin-top:var(--space-7)}
.atouts .sous{margin:0 0 var(--space-5);max-width:var(--measure);color:var(--color-text-muted)}
.atouts ul{display:grid;gap:var(--space-3);margin:0;padding:0;list-style:none}
.atouts li{display:flex;align-items:flex-start;gap:var(--space-4);padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
.atouts .tuile{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--space-7);height:var(--space-7);border-radius:var(--radius-md);background:var(--color-tint-primary)}
.atouts .tuile svg{width:var(--glyph);height:var(--glyph)}
.atouts h3{margin:0 0 var(--space-1);font-size:var(--text-base);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.atouts p{margin:0;font-size:var(--text-base);color:var(--color-text-muted)}

.mission{margin-top:var(--space-7);padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
.mission p{margin:0;max-width:var(--measure);color:var(--color-text-muted)}
.mission .devise{margin-top:var(--space-4);color:var(--color-text);font-weight:var(--font-weight-medium);font-size:var(--text-sm);letter-spacing:.06em;text-transform:uppercase}

.appel{margin-top:var(--space-7);padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface);text-align:center}
.appel p{margin:0 auto var(--space-5);max-width:var(--measure);color:var(--color-text-muted)}

@media (min-width:600px){
.atouts ul{grid-template-columns:1fr 1fr}
.actions{flex-direction:row;flex-wrap:wrap}
}
`);
