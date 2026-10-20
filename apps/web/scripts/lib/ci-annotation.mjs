/**
 * UN CONSTAT EN DÉFAUT SE LIT SANS LE JOURNAL (#11088).
 *
 * Le job « Peaux web » enchaîne une quarantaine de gates dans un journal de
 * ~14 000 lignes ; l'API n'en rend que les 5 000 dernières, et la ligne ECHEC
 * d'un gate du milieu n'y figure plus. Sous GitHub Actions, chaque constat part
 * AUSSI en annotation `::error`, que la page des vérifications et l'API des
 * annotations montrent sans le journal. Le texte du constat ne change pas.
 */

const escapeData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export const ciErrorAnnotation = (gate, message) => `::error title=${gate}::${escapeData(message)}`;

export function reportFailures({
  gate,
  failures,
  bullet,
  env = process.env,
  error = console.error,
  log = console.log,
}) {
  for (const failure of failures) {
    error(`    ${bullet} ${failure}`);
    if (env.GITHUB_ACTIONS) log(ciErrorAnnotation(gate, failure));
  }
}
