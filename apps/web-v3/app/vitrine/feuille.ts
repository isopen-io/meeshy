/**
 * La feuille de la VITRINE.
 *
 * Séparée du socle pour la raison que la conception donne à toute séparation de
 * feuille : le socle est vrai de TOUT écran, ceci n'est vrai que de celui-ci.
 * Une feuille unique aurait fait payer à l'écran d'un lien mort — le premier
 * contact d'un visiteur, gaté à DEUX requêtes — la mise en page d'une page
 * qu'il ne verra jamais.
 *
 * DEUX RÈGLES REPRISES DE LA FEUILLE VOISINE, ET PAS PAR IMITATION.
 *
 * Aucune COULEUR n'est écrite : le § 3.2 corollaire 2 interdit la seconde table
 * de jetons, et c'est ce qui rend cette page juste dans les deux schémas sans
 * une ligne de plus. L'ESPACEMENT, lui, est en pixels littéraux — il n'existe
 * aucun jeton `--space-*` dans la table servie, et en inventer un ici serait
 * précisément la seconde table que le corollaire refuse.
 */
const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();

export const FEUILLE_DE_LA_VITRINE = compacte(`
.enveloppe{max-width:960px;margin:0 auto;padding:22px 22px 64px}
.marque{display:flex;align-items:center;gap:10px;font-weight:var(--font-weight-semibold);font-size:var(--text-lg);letter-spacing:-.01em}
.marque .jeton{width:26px;height:26px;border-radius:var(--radius-pill);background:var(--color-primary);display:inline-block}
.heros{padding:56px 0 8px}
.heros h1{margin:0 0 18px;font-size:var(--text-4xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.heros h1 em{font-style:normal;color:var(--color-primary)}
.accroche{margin:0;max-width:560px;font-size:var(--text-md);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
nav.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:var(--radius-xl);font-weight:var(--font-weight-semibold);text-decoration:none;border:1px solid transparent}
.cta.principal{background:var(--color-primary);color:var(--color-on-primary)}
.cta.secondaire{color:var(--color-text);border-color:var(--color-border-interactive)}
.demonstration{margin:44px 0 0;border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);background:var(--color-surface);padding:20px}
.demonstration .intitule{margin:0 0 14px;font-size:var(--text-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-subtle)}
.demonstration ul{margin:0;padding:0;list-style:none}
.demonstration li{padding:12px 0;border-bottom:1px solid var(--color-neutral-900)}
.demonstration li:last-child{border-bottom:0}
.demonstration .dit{margin:0;font-size:var(--text-md);line-height:var(--leading-tight)}
.demonstration .langue{margin:4px 0 0;font-size:var(--text-xs);color:var(--color-text-subtle)}
.demonstration .servie .dit{color:var(--color-text)}
.demonstration .servie .langue{color:var(--color-primary)}
.demonstration .note{margin:14px 0 0;font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
.piliers{display:grid;gap:14px;margin:44px 0 0;padding:0;list-style:none;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.piliers li{border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);padding:18px;background:var(--color-surface)}
.piliers h2{margin:0 0 8px;font-size:var(--text-base);font-weight:var(--font-weight-semibold)}
.piliers p{margin:0;font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
.pied{margin-top:56px;padding-top:20px;border-top:1px solid var(--color-neutral-900);font-size:var(--text-xs);color:var(--color-text-subtle);display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between}
.pied a{color:inherit}
`);
