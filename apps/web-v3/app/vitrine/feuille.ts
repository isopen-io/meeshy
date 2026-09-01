/**
 * La feuille de la VITRINE — la langue visuelle des planches v3.
 *
 * Ce qui la rend « v3 » plutôt que « legacy repeint » tient en quatre choix,
 * tous relevés sur les planches `chats` et `login` :
 *
 *   1. **Une seule teinte d'accent**, `--color-primary`, et elle ne sert qu'à
 *      ce qui est cliquable ou à ce que la phrase met en avant. Les planches
 *      n'ont pas de dégradé, pas de seconde couleur décorative.
 *   2. **Des cartes à filet fin** sur `--color-surface`, rayon `--radius-lg`,
 *      sans ombre — la profondeur vient du contraste de fond, jamais d'un
 *      `box-shadow` porté.
 *   3. **Une hiérarchie qui repose sur les jetons `--text-*`**, pas sur des
 *      tailles inventées, avec `--leading-tight` sur les titres et
 *      `--leading-relaxed` sur les corps.
 *   4. **Des libellés de section en petites capitales espacées**, comme la puce
 *      « AUTO · Focal » de la planche `chats`.
 *
 * Aucune COULEUR n'est écrite (§ 3.2 corollaire 2 : la seconde table de jetons
 * est interdite), et l'ESPACEMENT est en pixels littéraux — il n'existe aucun
 * jeton `--space-*` dans la table servie, et en inventer un ici FABRIQUERAIT
 * cette seconde table.
 */
const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();

export const FEUILLE_DE_LA_VITRINE = compacte(`
.enveloppe{max-width:1040px;margin:0 auto;padding:22px 22px 56px}
.marque{display:flex;align-items:center;gap:10px;font-weight:var(--font-weight-semibold);font-size:var(--text-lg);letter-spacing:-.01em}
.marque .jeton{width:26px;height:26px;border-radius:var(--radius-pill);background:var(--color-primary);display:inline-block}

.heros{padding:64px 0 8px;max-width:720px}
.badge{display:inline-block;margin:0 0 20px;padding:6px 14px;border-radius:var(--radius-pill);font-size:var(--text-xs);font-weight:var(--font-weight-medium);letter-spacing:.02em;color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 12%,transparent)}
.heros h1{margin:0 0 18px;font-size:var(--text-4xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.heros h1 em{font-style:normal;color:var(--color-primary)}
.accroche{margin:0;font-size:var(--text-md);line-height:var(--leading-relaxed);color:var(--color-text-muted)}
nav.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 26px;border-radius:var(--radius-xl);font-weight:var(--font-weight-semibold);text-decoration:none;border:1px solid transparent}
.cta.principal{background:var(--color-primary);color:var(--color-on-primary)}
.cta.secondaire{color:var(--color-text);border-color:var(--color-border-interactive)}

section h2{margin:0 0 8px;font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.01em}
.atouts{margin-top:72px}
.atouts .sous{margin:0 0 26px;color:var(--color-text-muted);line-height:var(--leading-relaxed)}
.atouts ul{display:grid;gap:14px;margin:0;padding:0;list-style:none;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.atouts li{border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);padding:20px;background:var(--color-surface)}
.atouts h3{margin:0 0 8px;font-size:var(--text-base);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.atouts p{margin:0;font-size:var(--text-sm);line-height:var(--leading-relaxed);color:var(--color-text-muted)}

.mission{margin-top:72px;border:1px solid var(--color-neutral-900);border-radius:var(--radius-lg);background:var(--color-surface);padding:28px}
.mission p{margin:0;line-height:var(--leading-relaxed);color:var(--color-text-muted);max-width:64ch}
.mission .devise{margin-top:18px;color:var(--color-primary);font-weight:var(--font-weight-medium);font-size:var(--text-sm);letter-spacing:.06em;text-transform:uppercase}

.appel{margin-top:72px;text-align:center}
.appel p{margin:0 auto 26px;max-width:52ch;color:var(--color-text-muted);line-height:var(--leading-relaxed)}

.pied{margin-top:72px;padding-top:22px;border-top:1px solid var(--color-neutral-900);display:flex;flex-direction:column;gap:12px;font-size:var(--text-xs);color:var(--color-text-subtle)}
.pied .devise{margin:0;color:var(--color-text-muted);font-size:var(--text-sm)}
.pied nav{display:flex;flex-wrap:wrap;gap:16px}
.pied a{color:inherit}
.pied .droits{margin:0}
`);
