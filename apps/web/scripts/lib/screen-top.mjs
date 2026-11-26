/**
 * LE HAUT RÉSERVÉ DE L'ÉCRAN, TEL QUE LA COQUILLE LE SERT (#9942) — partagé
 * par les gates qui posent un chrome sous l'encoche (`check-floating-clearance
 * .mjs`, `check-feed-column.mjs`).
 *
 * Sur les hubs, la bannière du joueur entre dans le bandeau du haut APRÈS le
 * premier rendu, et la coquille reporte sa hauteur dans `--top-band`, que
 * l'arbre ajoute à `--safe-top` (`app.css`, `[data-top-band-host]`). Un relevé
 * pris avant ce report lit `bande = 0` et un couloir à 126 : les deux valeurs
 * s'accordent, et l'état « bannière » se confond avec l'état « Jeu masqué ».
 * D'où les deux états joués l'un contre l'autre, et un verdict qui exige, dans
 * chacun, ce qui le DISTINGUE de l'autre.
 */

/** Les deux états du bandeau. `masque` pose « Jeu masqué » sur l'appareil. */
export const BANDEAUX = [
  { nom: 'bannière', masque: false },
  { nom: 'Jeu masqué', masque: true },
];

/** Pose l'état sur un contexte neuf, avant le premier script de la page. */
export const poseBandeau = (context, bandeau) =>
  bandeau.masque
    ? context.addInitScript(() => {
        localStorage.setItem('meeshy.game.prefs', JSON.stringify({ hidden: true, celebrations: true }));
      })
    : Promise.resolve();

/**
 * LE BANDEAU EST ASSIS — la place de la bannière, si elle est ouverte, est
 * peinte, et la réserve couvre le bandeau. Une bannière jamais peinte ferme sa
 * visite en 30 s (`PLAYER_BANNER_HOLD_MS`) et rend sa place : l'attente est
 * bornée.
 */
export const topBandSettled = (page) =>
  page.waitForFunction(
    () => {
      const band = document.querySelector('[data-top-bars]');
      if (band === null) return true;
      const height = Math.ceil(band.getBoundingClientRect().height);
      const awaitsPlayer = (band.getAttribute('data-top-band') ?? '').split(' ').includes('player') && height === 0;
      if (awaitsPlayer) return false;
      const host = document.querySelector('[data-top-band-host]');
      const reserved = host === null ? 0 : Number.parseFloat(getComputedStyle(host).getPropertyValue('--top-band')) || 0;
      return height === 0 ? reserved === 0 : reserved >= height;
    },
    undefined,
    { timeout: 45_000 },
  );

/**
 * LE HAUT RÉSERVÉ PAR SONDE — un nœud `fixed` posé à `top: var(--safe-top)`
 * DANS l'arbre de la coquille lit la cote que tout écran `pt-safe` lit, sans
 * en recopier la formule. Rend `null` quand la page n'a pas de bandeau.
 */
export const screenTop = (page) =>
  page.evaluate(() => {
    const band = document.querySelector('[data-top-bars]');
    if (band === null) return null;
    const host = document.querySelector('[data-top-band-host]');
    const arbre = host ?? band.parentElement ?? document.body;
    const sonde = (top) => {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;left:0;width:0;height:0;top:${top}`;
      arbre.appendChild(el);
      const y = el.getBoundingClientRect().top;
      el.remove();
      return y;
    };
    const joueur = band.querySelector('[data-player-slot="shown"]');
    return {
      occupants: (band.getAttribute('data-top-band') ?? '').split(' ').filter((o) => o !== ''),
      bandeauBas: band.getBoundingClientRect().bottom,
      joueurPeint: joueur === null ? 0 : joueur.getBoundingClientRect().height,
      bande: host === null ? 0 : Number.parseFloat(getComputedStyle(host).getPropertyValue('--top-band')) || 0,
      encoche: sonde('env(safe-area-inset-top, 0px)'),
      hautReserve: sonde('var(--safe-top)'),
    };
  });

/**
 * LE VERDICT D'UN ÉTAT — pur, donc témoigné hors navigateur. « bannière » :
 * le joueur occupe le bandeau, il est PEINT, `--top-band` le réserve et le
 * haut réservé le COUVRE. « Jeu masqué » : le bandeau est VIDE, rien n'est
 * réservé, le haut réservé est l'encoche nue. Un relevé absent rougit.
 */
export const bandeauVerdict = (bandeau, mesure) => {
  if (mesure === null) return [`${bandeau.nom} : aucun bandeau du haut dans la page — rien n'a été mesuré`];
  const joue = mesure.occupants.includes('player');
  if (!bandeau.masque) {
    return [
      joue ? null : `${bandeau.nom} : le joueur n'est pas parmi les occupants du bandeau (${JSON.stringify(mesure.occupants)})`,
      mesure.joueurPeint > 0 ? null : `${bandeau.nom} : la bannière du joueur n'est pas peinte (hauteur ${mesure.joueurPeint})`,
      mesure.bande > 0 ? null : `${bandeau.nom} : --top-band ne réserve rien (${mesure.bande})`,
      mesure.hautReserve + 0.5 >= mesure.bandeauBas
        ? null
        : `${bandeau.nom} : le haut réservé (${mesure.hautReserve}) ne couvre pas le bandeau (bas ${mesure.bandeauBas})`,
    ].filter((e) => e !== null);
  }
  return [
    joue ? `${bandeau.nom} : le joueur occupe encore le bandeau (occupants ${JSON.stringify(mesure.occupants)})` : null,
    mesure.joueurPeint === 0 ? null : `${bandeau.nom} : une bannière du joueur est peinte (hauteur ${mesure.joueurPeint})`,
    mesure.bande === 0 ? null : `${bandeau.nom} : --top-band réserve encore ${mesure.bande}`,
    Math.abs(mesure.hautReserve - mesure.encoche) <= 0.5
      ? null
      : `${bandeau.nom} : le haut réservé (${mesure.hautReserve}) n'est pas l'encoche nue (${mesure.encoche})`,
  ].filter((e) => e !== null);
};
