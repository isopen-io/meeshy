import { FEUILLE_DU_CHOIX_DE_LANGUE } from '@/app/choix-de-langue';
import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DE LA STORY — un écran PLEIN, une scène, et rien qui bouge.
 *
 * CE QUE LA CHARTE (§ 12.5) Y IMPOSE, ET CE QU'ELLE Y INTERDIT
 *
 * 1. **Aucun DÉGRADÉ** (règle 9, témoin `charte.test.ts` : « n'écrit ni ombre
 *    hors focus, ni dégradé, ni flou de fond »). `cible/story.png` dessine une
 *    scène en dégradé violet ; la charte, arrêtée APRÈS la planche, ne
 *    l'autorise pas. La scène prend donc le plan CREUX de la table
 *    (`--color-bg-sunken`), qui joue le même rôle — détacher le contenu du
 *    reste de l'application — dans les DEUX schémas. Écart de style ASSUMÉ :
 *    « la cible fait foi sur la disposition, la charte sur le style ».
 * 2. **Un accent, cinq emplois** (règle 13) : la puce des langues, l'envoi et
 *    le cœur PRESSÉ. Le nom de l'auteur, l'heure, le texte de la story et les
 *    barres du haut restent sur l'encre — un texte peint à l'accent serait le
 *    défaut que la règle nomme.
 * 3. **Les barres de progression NE SONT PAS des contrôles** (règle 7) : une
 *    barre de 3 px ne peut pas être une cible de 44 px, et en faire un lien
 *    ferait tomber le gate des cibles. Ce sont des `<li>` qui DISENT où l'on
 *    est ; ce qui NAVIGUE est le tap — deux zones hautes, larges d'au moins
 *    une cible.
 * 4. **Le tap ne couvre pas le texte** (règle 8, « aucun élément posé ne
 *    recouvre un élément interactif », et son corollaire de lecture) : les deux
 *    zones tiennent les BORDS de la scène, la colonne centrale reste au texte —
 *    c'est ce qui laisse l'appui LONG sélectionner et copier une story au lieu
 *    de naviguer.
 * 5. **Le mouvement ne déplace rien** (règle 24) : aucune `@keyframes`, aucune
 *    transition géométrique. Une story qui « avance » toute seule demanderait
 *    un script ; il n'y en a pas, et l'avance est un GESTE.
 *
 * LA COLONNE FAIT `100dvh` et ses enfants ne rétrécissent pas — sauf la scène,
 * qui prend ce qui reste. C'est la mise en page du fil (`fil-feuille.ts`), pour
 * la même raison : le composeur doit rester dans le cadre, clavier ouvert.
 */
export const FEUILLE_DE_LA_STORY = FEUILLE_DU_CHOIX_DE_LANGUE + compacte(`
.story-ecran{display:flex;flex-direction:column;height:100dvh;max-width:var(--shell-width);margin:0 auto;background:var(--color-bg-sunken)}
.story-ecran>*{flex:none}

.segments{display:flex;gap:var(--space-1);margin:0;padding:var(--space-3) var(--space-4) 0;list-style:none}
.segments li{flex:1;height:var(--stroke-focus);border-radius:var(--radius-pill);background:var(--color-border-strong)}
.segments li[aria-current]{background:var(--color-text)}

.story-tete{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4)}
.story-tete .qui{flex:1;min-width:0}
.story-tete .nom{display:block;font-weight:var(--font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.story-tete time{display:block;font-size:var(--text-sm);color:var(--color-text-muted)}
.story-tete .fermer{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);color:var(--color-text)}
.story-tete .fermer svg{width:var(--glyph);height:var(--glyph)}


.scene{position:relative;flex:1 1 0;display:flex;align-items:center;justify-content:center;min-height:var(--row-height);padding:var(--space-5)}
.scene .texte{margin:0;max-width:var(--measure);text-align:center;font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.scene figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:var(--space-3);max-width:100%}
.scene img,.scene video,.scene audio{max-width:100%;border-radius:var(--radius-lg)}
.scene figcaption{margin:0;max-width:var(--measure);text-align:center;font-size:var(--text-lg);font-weight:var(--font-weight-medium)}

.tap{position:absolute;inset-block:0;display:block;inline-size:22%;min-inline-size:var(--target-min)}
.tap.precedente{inset-inline-start:0}
.tap.suivante{inset-inline-end:0}

.story-prisme{display:flex;align-items:center;justify-content:center;gap:var(--space-2);margin:0;padding:0 var(--space-4);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-text-muted)}
.story-prisme svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.story-prisme a{display:inline-flex;align-items:center;min-height:var(--target-min)}

.story-etat{margin:0 var(--space-4);padding:var(--space-3) var(--space-4);border-radius:var(--radius-lg);background:var(--color-tint-success);font-size:var(--text-base)}

.story-repondre{display:flex;align-items:flex-end;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4) var(--space-5)}
.story-repondre textarea{flex:1;min-width:0;min-height:var(--target-min);max-height:var(--row-height);padding:var(--space-3) var(--space-4);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:transparent;color:var(--color-text);font-family:inherit;font-size:var(--text-md);line-height:var(--leading-normal);resize:none}
.story-repondre button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--target-min);height:var(--target-min);padding:0;border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:transparent;color:var(--color-text);cursor:pointer;transition:background-color 120ms,border-color 120ms,color 120ms}
.story-repondre button svg{width:var(--glyph);height:var(--glyph)}
.story-repondre .envoyer{border-color:transparent;background:var(--color-primary);color:var(--color-on-primary)}
.story-repondre .aimer[aria-pressed=true]{border-color:var(--color-primary);color:var(--color-primary)}
`);
