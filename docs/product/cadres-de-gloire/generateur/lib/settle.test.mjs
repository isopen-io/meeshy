// Témoin de la règle de lib/page.mjs § settle et showPhoto (#12801) : AUCUNE CAPTURE NE PART AVANT QUE LA PHOTO SOIT PEINTE.
// La photo des cibles est posée par `show` APRÈS le chargement de la page ; `page.screenshot` ne l'attend pas. En CI,
// une photo arrivée en retard sortait absente d'un des deux rendus d'une cible, déclarée alors instable
// (« INSTABLE : poses-pied.message.webp — deux rendus Chromium diffèrent ») sans que le cadre ait changé.
// Le témoin retarde la photo d'une seconde et demie — bien plus que la latence d'une capture — et exige qu'elle soit
// sur l'image (lue par le navigateur lui-même : le job des témoins n'installe pas sharp). Usage : node --test lib/settle.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { FIXTURE } from './fixture.mjs';
import { launch } from './launch.mjs';
import { H, openPage, shoot, showPhoto, showSvg, W } from './page.mjs';

const FRAME = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g data-layer="root"><rect data-layer="photo" width="${W}" height="${H}" fill="none"/></g></svg>`;
const PHOTO = 'http://photo.cible.test/photo.jpg';
const DELAY_MS = 1500;

test('la photo posée après le chargement est sur la capture, même quand elle arrive en retard', async () => {
  const browser = await launch();
  const handle = await openPage(browser);
  try {
    await handle.page.route(`${PHOTO}*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      await route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(FIXTURE) });
    });
    await showSvg(handle, FRAME, { fonts: 'exact' });
    await showPhoto(handle, { kinds: [], photo: { href: PHOTO, box: [0, 0, W, H] } });
    const png = (await shoot(handle)).toString('base64');
    const alpha = await handle.page.evaluate(async (b64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(image.width >> 1, image.height >> 1, 1, 1).data[3];
    }, png);
    assert.equal(alpha, 255, 'le centre de la capture est opaque : la photo y est peinte');
  } finally {
    await handle.dispose();
    await browser.close();
  }
});
