/**
 * L'ÉLU DE FOCAL AU TOUCHER (#8536, directive porteur 2026-09-28) — extrait
 * de `check-reading-mode.mjs`, HORS BUDGET de taille (« on extrait d'abord, on
 * ajoute ensuite ») ; même dispositif que `lib/check-river-menu.mjs` : ce
 * module reçoit LE compteur de défauts (`expect`) et les poses de contexte de
 * son hôte (`setScheme`, `preferFocal`), il n'en fabrique aucun.
 *
 * CE QU'IL MESURE, sur l'élu réel d'une scène armée par un geste soutenu :
 *
 *   1. SEUL LE CONTENU GRANDIT — le bloc `[data-loupe]` porte une échelle
 *      nette (> ×1,15) ; l'avatar d'identité garde ses 26 px et la capsule du
 *      tampon sa hauteur de chip : ils ne sont PAS sous la loupe.
 *   2. LE VERRE RESPIRE — l'encre du contenu grossi ne touche ni l'identité
 *      au-dessus ni la bande basse au-dessous.
 *   3. CHAQUE CONTRÔLE AGIT AU PREMIER GESTE, au CLIC comme au TOUCHER
 *      (`locator.tap()`, contexte tactile) — drapeau ⇒ la langue lue change,
 *      capsule de réaction ⇒ son compte bascule, tampon ⇒ la fiche du message
 *      s'ouvre —, et aucun ne déplace l'élection.
 */
import { pageÀInstantFigé } from './instant.mjs';
import { scrollRowIntoView } from './scroll-row.mjs';
import { awaitCondition } from './await-fact.mjs';

/** `IDENTITY_AVATAR_SIZE` / `FOCUS_CHIP_HEIGHT` (`src/lib/reading-mode/metrics.ts`). */
const IDENTITY_AVATAR_SIZE = 26;
const FOCUS_CHIP_HEIGHT = 24;
/** L'air minimal constaté entre le contenu grossi et ses voisins de verre. */
const MIN_AIR = 6;

/** La rangée ciblée : `RIVER_REACTION_WITNESS_ID` du Salon Rivière — traduite ET réagie (`fixtures-river.ts`). */
const CONVERSATION = 'c-salon-riviere';
const TARGET = 'riv-18';

/**
 * POSE LA CIBLE SUR LA LIGNE DE FOCUS avant d'armer la scène : près du bas
 * du fil, cette ligne descend vers le bord (`election.ts::focusLine`), et une
 * rangée seulement CENTRÉE laisserait l'élection à sa voisine. Défilement
 * PROGRAMMÉ (aucune intention ouverte) : la scène l'ignore.
 */
const electTarget = async (page, target = TARGET) => {
  await scrollRowIntoView(page, target);
  await page.evaluate((id) => {
    const main = document.querySelector('main');
    const row = main?.querySelector(`[data-row="${id}"]`);
    if (!main || !row) return;
    for (let i = 0; i < 8; i += 1) {
      const box = main.getBoundingClientRect();
      const center = (box.top + box.bottom) / 2;
      const travel = box.bottom - center;
      const offset = main.scrollHeight - main.clientHeight - main.scrollTop;
      const focusY = box.bottom - travel * Math.min(1, Math.max(0, offset / travel));
      const r = row.getBoundingClientRect();
      main.scrollTop += (r.top + r.height / 2 - focusY) / 2;
    }
  }, target);
  await page.waitForTimeout(50);
  for (let i = 0; i < 42; i += 1) {
    await page.mouse.wheel(0, i % 2 === 0 ? -3 : 3);
    await page.waitForTimeout(100);
  }
};


const electedId = (page) =>
  page.evaluate(() => document.querySelector('main li [data-elected="true"]')?.closest('[data-row]')?.getAttribute('data-row') ?? null);

const geometryOf = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('main li [data-elected="true"]');
    if (row === null) return null;
    const loupe = row.querySelector('[data-loupe]');
    const matrix = loupe === null ? 'none' : getComputedStyle(loupe).transform;
    const m = /matrix\(([-0-9.e]+)/.exec(matrix);
    const text = [...(loupe?.querySelectorAll('p') ?? [])].find((p) => (p.textContent ?? '').trim() !== '');
    const box = (el) => (el === null || el === undefined ? null : el.getBoundingClientRect());
    const avatar = box(row.querySelector('.focus-identity .avatar-root'));
    const identity = box(row.querySelector('.focus-identity'));
    const stamp = box(row.querySelector('.focus-stamp'));
    const strip = box(row.querySelector('.focus-strip'));
    const content = box(loupe);
    const ink = box(text);
    const band = strip ?? stamp;
    return {
      contentScale: m === null ? 1 : Number(m[1]),
      avatarWidth: avatar?.width ?? null,
      stampHeight: stamp?.height ?? null,
      airAbove: identity === null || content === null ? null : content.top - identity.bottom,
      airBelow: band === null || ink === null ? null : band.top - ink.bottom,
    };
  });

async function checkOne({ browser, BASE, setScheme, preferFocal, expect, touch }) {
  const how = touch ? 'au toucher' : 'au clic';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch });
  await setScheme(context, 'dark');
  await preferFocal(context);
  const page = await pageÀInstantFigé(context);
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  await electTarget(page);

  const elected = await electedId(page);
  expect(elected === TARGET, `[${how}] le geste soutenu élit la rangée visée « ${TARGET} » (élue : « ${elected} »)`);
  if (elected !== TARGET) {
    await context.close();
    return;
  }

  if (!touch) {
    const g = await geometryOf(page);
    expect(g !== null && g.contentScale > 1.15, `seul le CONTENU de l'élue grossit, et nettement (×${g?.contentScale})`);
    expect(
      g !== null && g.avatarWidth !== null && Math.abs(g.avatarWidth - IDENTITY_AVATAR_SIZE) < 0.5,
      `l'avatar d'identité de l'élue garde sa taille d'origine, ${IDENTITY_AVATAR_SIZE} px (${g?.avatarWidth})`,
    );
    expect(
      g !== null && g.stampHeight !== null && Math.abs(g.stampHeight - FOCUS_CHIP_HEIGHT) < 0.5,
      `le tampon de l'élue garde sa hauteur de chip d'origine, ${FOCUS_CHIP_HEIGHT} px (${g?.stampHeight})`,
    );
    expect(
      g !== null && g.airAbove !== null && g.airAbove >= MIN_AIR,
      `le contenu grossi ne touche pas l'identité : au moins ${MIN_AIR} px d'air au-dessus (${g?.airAbove})`,
    );
    expect(
      g !== null && g.airBelow !== null && g.airBelow >= MIN_AIR,
      `le contenu grossi ne touche pas la bande basse : au moins ${MIN_AIR} px d'air au-dessous (${g?.airBelow})`,
    );
  }

  /* LA CAUSE DU « RIEN NE SE PASSE » (#8536) : `overflow-x: clip` posé sur
     la rangée élue rognait AUSSI son test d'impact vertical — tout ce que la
     loupe poussait sous le bas de la rangée (la bande, le tampon) restait
     peint mais ne recevait plus le doigt ; l'ancien témoin, qui ne sondait
     que le CENTRE des boutons, tombait sur la moitié encore atteignable. On
     sonde donc toute la surface de chaque contrôle, coins compris. */
  const unreachable = await page.evaluate(() => {
    const row = document.querySelector('main li [data-elected="true"]');
    const controls = [...(row?.querySelectorAll('.focus-strip button, button.focus-stamp') ?? [])];
    return controls.flatMap((control) => {
      const r = control.getBoundingClientRect();
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 2, r.top + 2],
        [r.right - 2, r.top + 2],
        [r.left + 2, r.bottom - 2],
        [r.right - 2, r.bottom - 2],
      ];
      return points
        .filter(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit === null || (hit !== control && !control.contains(hit));
        })
        .map(([x, y]) => `${control.getAttribute('aria-label') ?? control.textContent?.trim()}@${Math.round(x)},${Math.round(y)}`);
    });
  });
  expect(unreachable.length === 0, `[${how}] chaque contrôle de l'élue reçoit le doigt sur TOUTE sa surface (${unreachable.join(' · ')})`);
  expect(
    await page.evaluate(() => {
      const main = document.querySelector('main');
      return main !== null && main.scrollWidth <= main.clientWidth;
    }),
    `[${how}] le contenu grossi de l'élue n'ouvre aucun défilement horizontal`,
  );

  const row = page.locator('main li [data-elected="true"]');
  /* Un contrôle ABSENT est un échec dit, jamais une attente de 30 s. La scène
     retombe 4,5 s après le dernier défilement compté : sous charge, trois
     gestes d'affilée pouvaient la voir s'aplatir avant le troisième. Deux
     crans de molette de sens opposés la gardent armée sans déplacer l'élue
     (hystérésis de 95 px) — le contrôle, lui, reçoit UN SEUL geste. Le
     verdict s'ATTEND (`awaitCondition`), jamais après un délai fixe. */
  const act = async (locator, what) => {
    if ((await locator.count()) === 0) {
      expect(false, `[${how}] l'élue porte ${what}`);
      return false;
    }
    await page.mouse.wheel(0, -3);
    await page.mouse.wheel(0, 3);
    await (touch ? locator.tap() : locator.click());
    return true;
  };

  const LANG = '[data-loupe] p[lang]';
  const langOf = () => row.evaluate((el, sel) => el.querySelector(sel)?.getAttribute('lang') ?? null, LANG);
  const before = await langOf();
  const flagged = await act(row.locator('.focus-strip button[data-prism-flag][aria-pressed="false"]').first(), 'un drapeau sur sa bande');
  const langChanged =
    flagged &&
    (await awaitCondition(
      page,
      ({ sel, previous }) => {
        const lang = document.querySelector(`main li [data-elected="true"] ${sel}`)?.getAttribute('lang') ?? null;
        return lang !== null && lang !== previous;
      },
      { sel: LANG, previous: before },
    ));
  expect(langChanged, `[${how}] toucher un drapeau de l'élue change la langue lue au premier geste (${before} → ${await langOf()})`);
  expect((await electedId(page)) === TARGET, `[${how}] le drapeau ne déplace pas l'élection`);

  const COUNT = '.focus-strip button[aria-label*="👍"] .tabular-nums';
  const countOf = () => row.evaluate((el, sel) => el.querySelector(sel)?.textContent ?? null, COUNT);
  const countBefore = await countOf();
  const reacted = await act(row.locator('.focus-strip button[aria-label*="👍"]').first(), 'une capsule 👍 qui se touche');
  const countChanged =
    reacted &&
    (await awaitCondition(
      page,
      ({ sel, previous }) => {
        const count = document.querySelector(`main li [data-elected="true"] ${sel}`)?.textContent ?? null;
        return count !== null && count !== previous;
      },
      { sel: COUNT, previous: countBefore },
    ));
  expect(countChanged, `[${how}] toucher la capsule 👍 de l'élue bascule la réaction au premier geste (${countBefore} → ${await countOf()})`);
  expect((await electedId(page)) === TARGET, `[${how}] la capsule ne déplace pas l'élection`);

  const stamped = await act(row.locator('button.focus-stamp'), 'un tampon qui se touche');
  const sheetOpen = stamped && (await awaitCondition(page, () => document.querySelector('dialog[open]') !== null));
  expect(sheetOpen, `[${how}] toucher la date de l'élue ouvre la fiche du message au premier geste`);

  await context.close();
}

/**
 * UN FLOU SUR L'ÉLU SE LÈVE D'UN TOUCHER (#8536 : « permettre au toucher
 * d'afficher directement le contenu flouté […] et permettre de voir l'image
 * en plein écran avant que le flou ne revienne ») — la grille floutée du
 * corpus des médias (`MEDIA_BLURRED_GRID_WITNESS_ID`, `fixtures-media-grid.ts` ;
 * `media-8`, en tête du fil, ne peut pas atteindre la ligne de focus), ÉLUE puis
 * touché : un toucher le révèle à sa place, sous la loupe ; le toucher
 * suivant, sur l'image révélée, l'ouvre en plein écran. Le retour du flou
 * après la fenêtre est la loi pure (`rearmReveal`, `protection.test.ts`) et
 * le témoin horloger de `check-protection-states.mjs`.
 */
async function checkBlurredElected({ browser, BASE, setScheme, expect }) {
  const conversation = 'c-medias';
  const target = 'media-8g';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await setScheme(context, 'dark');
  await context.addInitScript((id) => {
    try {
      localStorage.setItem(`meeshy.reading-mode.u_u-viewer.${id}`, 'focal');
    } catch {
      /* navigation privée : le sous-test verra Script, et le dira. */
    }
  }, conversation);
  const page = await pageÀInstantFigé(context);
  await page.goto(`${BASE}/c/${conversation}`, { waitUntil: 'load' });
  await page.waitForSelector('main li');
  await page.waitForTimeout(400);
  await electTarget(page, target);
  const elected = await electedId(page);
  expect(elected === target, `[flou] le geste soutenu élit le média flouté « ${target} » (élue : « ${elected} »)`);
  if (elected !== target) {
    await context.close();
    return;
  }
  const row = page.locator('main li [data-elected="true"]');
  const veil = row.locator('[data-loupe] [data-protected="hidden"] button').first();
  const veiled = (await veil.count()) > 0;
  expect(veiled, '[flou] le média flouté de l’élue est voilé, sous la loupe');
  if (veiled) await veil.tap();
  const revealed =
    veiled &&
    (await awaitCondition(page, () => {
      const zone = document.querySelector('main li [data-elected="true"] [data-loupe] [data-protected="revealed"]');
      return [...(zone?.querySelectorAll('img') ?? [])].some((img) => !(img.getAttribute('src') ?? '').startsWith('data:image/svg'));
    }));
  expect(revealed, '[flou] UN toucher révèle l’image floutée de l’élue à sa place, en clair');
  const tile = row.locator('[data-loupe] [data-protected="revealed"] button').first();
  const tiled = revealed && (await tile.count()) > 0;
  if (tiled) await tile.tap();
  expect(
    tiled && (await awaitCondition(page, () => document.querySelector('[role="dialog"]') !== null)),
    '[flou] le toucher suivant, sur l’image révélée, l’ouvre en plein écran',
  );
  await context.close();
}

export async function checkFocalElectedControls(host) {
  await checkOne({ ...host, touch: false });
  await checkOne({ ...host, touch: true });
  await checkBlurredElected(host);
}
