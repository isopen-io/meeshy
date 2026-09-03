import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DES COMMENTAIRES — ce que `cible/comments.png` dessine.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL, dont
 * l'écran emprunte l'en-tête. Cinquième écran à le faire : le vocabulaire de
 * l'en-tête est le même partout où le lecteur enchaîne (dimension 6).
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **Les puces de source sont un rail qui DÉFILE**, jamais un rang qui se
 *    replie : trois puces tiennent à 390 px, mais leur libellé grandit avec la
 *    langue, et un rang qui passe à la ligne décale toute la carte sous lui.
 * 2. **La carte de la publication se distingue par son FILET, pas par son
 *    plan.** Elle porte ce qu'on commente et doit se détacher du fil ; mais
 *    `--color-surface-raised` est RÉSERVÉ à ce qui FLOTTE (règle 9 — la
 *    feuille modale, seule aujourd'hui), et une carte posée dans le flux n'y a
 *    pas droit. Elle prend donc `--color-surface` avec son filet et son
 *    espacement : les commentaires, eux, n'ont ni fond ni filet, et la
 *    hiérarchie se lit aussi bien.
 * 3. **La ligne du Prisme n'est PAS un lien décoratif.** `.prisme summary` est
 *    un cliquable — l'original s'y déplie —, donc il prend l'accent (règle 13,
 *    même emploi que « Voir l'original » du fil) et une cible pleine.
 * 4. **L'avatar est une pastille d'INITIALES**, teintée par le nom via
 *    `lib/avatar.ts` — le site unique des deux rendus. Aucune image n'est
 *    chargée : trente avatars sur une 3G rurale coûteraient plus que le fil
 *    entier.
 * 5. **« Modifier · Supprimer » n'apparaît que sur SES commentaires**, et la
 *    feuille ne le cache pas — c'est la vue qui ne le REND pas. Cacher par le
 *    style laisse le contrôle dans le document, atteignable au clavier et lu
 *    par un lecteur d'écran.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_COMMENTAIRES = compacte(`
.commentaires-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.commentaires-ecran>.fil-tete{flex:none}

.sources{display:flex;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-3);overflow-x:auto;list-style:none}
.sources li{flex:none}
.source{display:inline-flex;align-items:center;gap:var(--space-2);min-height:var(--target-min);padding:0 var(--space-4);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);font-size:var(--text-sm);color:var(--color-text-muted)}
.source svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.source[aria-current]{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-on-primary);font-weight:var(--font-weight-medium)}

.publication{display:flex;gap:var(--space-3);margin:0 var(--space-4) var(--space-5);padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface)}
.publication .vignette{display:flex;align-items:center;justify-content:center;flex:none;width:var(--space-9);height:var(--space-9);border-radius:var(--radius-lg);background:var(--color-bg-sunken);color:var(--color-text-muted)}
.publication .vignette svg{width:var(--glyph);height:var(--glyph)}
.publication .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.publication .qui{color:var(--color-text);font-weight:var(--font-weight-semibold);overflow-wrap:anywhere}
.publication .texte{color:var(--color-text-muted);overflow-wrap:anywhere}

.prisme{margin-top:var(--space-1)}
.prisme summary{display:flex;align-items:center;gap:var(--space-2);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-primary);cursor:pointer;list-style:none}
.prisme summary::-webkit-details-marker{display:none}
.prisme summary svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.prisme .original{margin:var(--space-2) 0 0;font-size:var(--text-sm);color:var(--color-text-muted);overflow-wrap:anywhere}

.commentaires{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;gap:var(--space-5);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}
.commentaire{display:flex;gap:var(--space-3)}
.commentaire .avatar{flex:none;align-self:flex-start}
.commentaire .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.commentaire .entete{display:flex;align-items:baseline;gap:var(--space-2);flex-wrap:wrap}
.commentaire .qui{color:var(--color-text);font-weight:var(--font-weight-semibold);overflow-wrap:anywhere}
.commentaire .instant{font-size:var(--text-sm);color:var(--color-text-muted)}
.commentaire .texte{color:var(--color-text);overflow-wrap:anywhere}
.commentaire .gestes{display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-1) var(--space-4);margin-top:var(--space-1)}
.commentaire .gestes .compteur{display:inline-flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm);color:var(--color-text-muted)}
.commentaire .gestes .compteur svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.commentaire .gestes .geste{min-height:var(--target-min);display:inline-flex;align-items:center;font-size:var(--text-sm);color:var(--color-text-muted)}

.commentaires-ecran>.encore{margin:0;padding:0 var(--space-4) var(--space-9);font-size:var(--text-sm);color:var(--color-text-muted)}
`);
