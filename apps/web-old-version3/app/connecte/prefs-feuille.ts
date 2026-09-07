import { compacte } from '@/app/enveloppe/feuille';

import { avisDEcran, commutateurDEcran } from './atomes-feuille';

/**
 * LA FEUILLE DE `/notifications/preferences` — ce que `cible/notifPrefs.png`
 * dessine, et rien de plus (spécification § 4 étape 3).
 *
 * ELLE S'AJOUTE au chrome, à la feuille connectée et à celle du FIL : comme
 * `notifs-feuille.ts`, l'écran emprunte à ce dernier son en-tête
 * (`.fil-tete`) — même en-tête, même geste de retour, un seul vocabulaire
 * pour deux écrans que le lecteur enchaîne.
 *
 * LE COMMUTATEUR NE BOUGE PAS PAR TRANSFORMATION : la piste change de
 * `justify-content` (flex-start / flex-end) selon `aria-checked`, jamais par
 * une transition géométrique — la charte règle 24 n'autorise que la couleur.
 * Le pouce SAUTE d'un bord à l'autre, instantanément ; seule la couleur de la
 * piste transite.
 *
 * Aucune COULEUR et aucun PIXEL littéral ne sont écrits (charte règle 1).
 * Témoin : `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_PREFS = compacte(`
.prefs-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto;padding-bottom:var(--space-9)}
.prefs-ecran>.fil-tete{flex:none}

${avisDEcran('.prefs-ecran')}
.prefs-ecran .echec{display:flex;align-items:center;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4);color:var(--color-danger)}
.prefs-ecran .echec svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}

.groupe-prefs{margin:var(--space-5) var(--space-4) 0}
.groupe-prefs:first-of-type{margin-top:var(--space-4)}
.groupe-prefs h2{margin:0 0 var(--space-2);font-size:var(--text-xs);font-weight:var(--font-weight-semibold);letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-muted)}

${commutateurDEcran('.bascules')}

.fenetre-edition{padding:0 var(--space-4) var(--space-3);border-top:var(--stroke-hair) solid var(--color-border-interactive)}
.fenetre-edition summary{padding:var(--space-3) 0;min-height:var(--target-min);display:flex;align-items:center;font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-primary);cursor:pointer}
.fenetre-edition form{display:flex;flex-direction:column;gap:var(--space-3);padding-bottom:var(--space-3)}
.fenetre-edition .champ{display:flex;flex-direction:column;gap:var(--space-1)}
.fenetre-edition label{font-size:var(--text-sm);color:var(--color-text-muted)}
.fenetre-edition input,.fenetre-edition select{min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text);font:inherit}

.bascules form.bascule-push{margin:0}
.commutateur:disabled{opacity:.5;cursor:not-allowed}
.push-detail{padding:0 var(--space-4) var(--space-3);border-top:var(--stroke-hair) solid var(--color-border-interactive)}
.push-detail summary{padding:var(--space-3) 0;min-height:var(--target-min);display:flex;align-items:center;font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-primary);cursor:pointer}
.push-detail p{margin:0 0 var(--space-3);font-size:var(--text-sm);color:var(--color-text-muted)}
`);
