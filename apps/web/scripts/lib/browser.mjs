import { existsSync } from 'node:fs';

import { chromium } from '@playwright/test';

/**
 * LE LANCEMENT DE CHROMIUM, ÉCRIT UNE FOIS.
 *
 * Le binaire n'est pas au même endroit partout, et un chemin en dur rend un
 * témoin ininstallable ailleurs que sur la machine qui l'a écrit. Trois
 * sources, dans cet ordre : la variable d'environnement (qui tranche), le
 * conteneur de développement s'il porte le binaire, puis la résolution de
 * Playwright lui-même — celle qui vaut en intégration continue, après
 * `playwright install chromium`.
 *
 * POURQUOI CE FICHIER EXISTE. Chaque témoin réécrivait ces trois lignes, et
 * elles avaient déjà divergé : deux portaient la garde `existsSync`, deux
 * codaient un chemin en dur. Le sixième témoin a codé en dur `/opt/pw-browsers/chromium`
 * — juste dans le bac à sable où il est né, faux en CI, et le gate a rendu
 * « Failed to launch chromium because executable doesn't exist ». Un défaut
 * qui ne pouvait PAS se voir localement, puisque le chemin local était bon.
 *
 * C'est la forme la plus banale de la règle du dépôt : une chose écrite à
 * plusieurs endroits finit par être écrite de plusieurs façons, et c'est
 * l'endroit qu'on ne teste pas qui porte la mauvaise.
 */
const CANDIDATE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * ET LE DIAGNOSTIC D'UN GATE QUI EXPIRE, ÉCRIT UNE FOIS AUSSI (#6971).
 *
 * Les dix-huit gates de peau collectent tous les erreurs de page
 * (`page.on('pageerror', …)`) et les LISENT tous à la dernière ligne de leur
 * boucle — de 50 à 280 lignes plus loin. Entre les deux, un `waitForSelector`
 * qui expire lève, l'exception saute par-dessus la lecture, remonte au
 * `finally` et tue le processus : le journal d'intégration continue ne montre
 * que « Timeout 10000ms exceeded », et les erreurs de page qui l'EXPLIQUENT
 * sont jetées alors qu'elles étaient en mémoire au moment où elles servaient.
 *
 * Mesuré sur le run `35303238441` : `[data-link-submit]` jamais visible sur
 * `/links/share/new`, et rien pour trancher entre « l'écran a levé » et « le
 * chunk était lent » — le même gate rendant 268 témoins verts en local. Il a
 * fallu remonter trois commits et rejouer le gate pour conclure au flottement.
 *
 * La collecte vit donc ICI, au point d'entrée que les trente-huit gates
 * partagent, et non dans chaque boucle : c'est la règle que ce fichier énonce
 * déjà pour le chemin du binaire — une chose écrite à plusieurs endroits finit
 * par être écrite de plusieurs façons. Chaque page ouverte par un gate est
 * surveillée sans qu'il ait une ligne à changer, et toute sortie par exception
 * imprime l'URL, les erreurs de page et les erreurs de console de CHAQUE page.
 *
 * Le verdict ne change pas : un vrai défaut reste rouge. C'est la CAUSE qui
 * devient lisible.
 */
const watched = [];

/** Surveille une page : son URL, ses erreurs de page, ses erreurs de console. */
export const watchPage = (page) => {
  const entry = { page, errors: [], consoleErrors: [] };
  page.on('pageerror', (error) => entry.errors.push(String(error?.message ?? error)));
  page.on('console', (message) => {
    if (message.type() === 'error') entry.consoleErrors.push(message.text());
  });
  return entry;
};

/**
 * Le rapport des pages surveillées. **Une absence d'erreur est une
 * INFORMATION** — elle dit « l'écran n'a pas levé, cherche ailleurs » — donc
 * elle s'écrit, au lieu de laisser un silence qu'on lira comme un oubli.
 */
export const pageDiagnostics = (entries) => {
  if (entries.length === 0) return '';
  const lines = ['', '  ── diagnostic des pages ouvertes ──'];
  for (const { page, errors, consoleErrors } of entries) {
    let url = 'url indisponible';
    try {
      url = page.url();
    } catch {
      /* la page est déjà fermée : son URL n'est plus interrogeable */
    }
    lines.push(`    page ${url}`);
    if (errors.length === 0) lines.push('      aucune erreur de page');
    else for (const error of errors) lines.push(`      erreur de page · ${error}`);
    for (const text of consoleErrors) lines.push(`      console (erreur) · ${text}`);
  }
  return lines.join('\n');
};

/** Imprime le diagnostic de tout ce qui a été ouvert depuis le lancement. */
export const reportOpenPages = () => {
  const report = pageDiagnostics(watched);
  if (report !== '') console.error(report);
};

/**
 * Enveloppe le navigateur pour que CHAQUE page créée soit surveillée — que le
 * gate passe par `browser.newPage()` ou par `browser.newContext().newPage()`.
 */
const surveil = (target, keys) =>
  new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key, object);
      if (typeof value !== 'function') return value;
      // Les méthodes non interceptées sont LIÉES à la cible : appelées avec le
      // proxy pour `this`, celles de Playwright lèvent sur leurs champs privés
      // (`Cannot read private member #…`) — l'enveloppe casserait `close()`.
      if (!keys.includes(key)) return value.bind(object);
      return async (...args) => {
        const made = await value.apply(object, args);
        if (key === 'newPage') {
          watched.push(watchPage(made));
          return made;
        }
        return surveil(made, ['newPage']);
      };
    },
  });

/** `options` passe au lancement (ex. `args` des faux micro et caméra du gate des appels, #8046). */
export const launchChromium = async (options = {}) => {
  const browser = await chromium.launch({ ...(existsSync(CANDIDATE) ? { executablePath: CANDIDATE } : {}), ...options });
  for (const signal of ['uncaughtException', 'unhandledRejection']) {
    process.on(signal, (cause) => {
      console.error(`\n  ${signal} : ${cause instanceof Error ? cause.message : String(cause)}`);
      reportOpenPages();
      process.exit(1);
    });
  }
  return surveil(browser, ['newPage', 'newContext']);
};
