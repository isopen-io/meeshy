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

export const launchChromium = () =>
  chromium.launch(existsSync(CANDIDATE) ? { executablePath: CANDIDATE } : {});
