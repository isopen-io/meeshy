/**
 * LE RÉSEAU D'UNE PAGE, TEL QUE `waitForValueSettled` LE LIT (`settle-value.mjs`,
 * option `network`) — sorti de `check-phone-frame.mjs` pour être éprouvé seul
 * (`document-network.test.ts`).
 *
 * #12600 — le réseau de la page entre dans la stabilité : sans la fenêtre fixe de
 * 500 ms de `networkidle`, payée à chacun des ~740 relevés du cadre téléphone.
 * `network()` rend `undefined` tant qu'une requête est en vol, sinon une
 * empreinte (le nombre de requêtes parties) : deux lectures ne concluent que si
 * aucune n'est partie entre elles. `network.enVol()` nomme ce qui retient le
 * réseau, pour le diagnostic d'un échec.
 *
 * #12783 — LE RÉSEAU QUI COMPTE EST CELUI DU DOCUMENT COURANT. Progression recharge
 * UN onglet d'adresse en adresse, et une requête du document qu'on quitte (le
 * préchargement d'un chunk, interrompu par la navigation) peut ne recevoir ni
 * `requestfinished` ni `requestfailed`. Mesuré en CI (Chromium 156, run
 * 40144550505) : les MÊMES huit chunks `call-*` du document précédent « en vol »
 * sur les six dernières pages, peintes et lisibles, que le témoin déclarait vides
 * parce que le réseau ne se calmait plus jamais — le compte d'avant (partis −
 * revenus, sur la vie de l'onglet) restait empoisonné jusqu'à la fin de la tâche.
 * Le relevé fait ce que fait `networkidle` de Playwright (`_onClearLifecycle`) :
 * quand un NOUVEAU document s'installe dans le cadre principal, il oublie ce que
 * l'ancien avait en vol et ne garde que la requête du document. Une navigation
 * dans le même document (`pushState`) n'a pas de requête de navigation : elle
 * n'efface rien. */
export const documentNetwork = (page) => {
  let partis = 0;
  let documentEnCours = null;
  const enVol = new Set();
  page.on('request', (request) => {
    partis += 1;
    enVol.add(request);
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentEnCours = request;
  });
  page.on('requestfinished', (request) => enVol.delete(request));
  page.on('requestfailed', (request) => enVol.delete(request));
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame() || documentEnCours === null) return;
    for (const request of enVol) if (request !== documentEnCours) enVol.delete(request);
    documentEnCours = null;
  });
  const network = () => (enVol.size === 0 ? String(partis) : undefined);
  /* Ce que le réseau retenait quand l'attente a buté : sans lui, « rien de peint » ne dit pas si la page attendait un chunk. */
  network.enVol = () => [...enVol].map((request) => new URL(request.url()).pathname);
  return network;
};
