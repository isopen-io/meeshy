import { join } from 'node:path';

import { contrastOf } from './contrast.mjs';
import { scrollRowIntoView } from './scroll-row.mjs';

/**
 * L'IDENTITÉ DE RANGÉE PORTE `role="article"` + SON LIBELLÉ (#5935) — extrait
 * de `check-reading-mode.mjs` (hors budget de taille, 1 200 lignes, `CLAUDE.md`
 * § Code Style : « on extrait d'abord, on ajoute ensuite »). Même dispositif
 * que `lib/check-river-menu.mjs`/`lib/check-summary.mjs` : ce module reçoit
 * LE compteur de défauts (`expect`) et LA pose de schéma (`setScheme`), il
 * n'en fabrique aucun.
 *
 * CE QU'IL MESURE, sur `/c/c-deploiement`, dans les DEUX schémas :
 *
 *   a. CHAQUE `[data-row]` porte `role="article"` et un `aria-label` non
 *      vide ; pour une rangée en tête de groupe (`[data-identity]`), le nom
 *      de l'auteur ET le texte SERVI (le `<p>` de la rangée) sont CONTENUS
 *      dans le libellé — sauf pour « Vous » (message à soi) : le NOM y est
 *      délibérément ABSENT du libellé (`composeMessageLabel`,
 *      `message-a11y-label.ts`, port de `MessageAccessibilityLabelComposer
 *      .swift:36-93` — « pour un message à soi, l'accusé est présent et le
 *      nom absent »), ce n'est donc jamais une assertion à porter sur CE nom.
 *
 *      **UN SEUL LIBELLÉ, PAS DEUX (revue #5935, défauts majeurs 1/4).**
 *      `role="article"` + `aria-label` ne réduit PAS le sous-arbre : un
 *      lecteur d'écran annonçait le libellé composé PUIS relisait le nom, le
 *      texte et l'heure (arbre AX réel, CDP `Accessibility.getFullAXTree` :
 *      `[article]` PUIS `[StaticText]`/`[paragraph]`/`[time]`, aucun
 *      `ignored`). `[data-identity]`, le `<p>` du texte servi et `.focal-meta`
 *      (heure + accusé) portent désormais `aria-hidden` (`focal-row.tsx`) —
 *      ce module vérifie qu'ils y sont TOUJOURS, aux DEUX schémas, sur une
 *      rangée ordinaire : la garde `role !== 'presentation'` d'un lecteur
 *      d'écran suit `aria-hidden`, jamais `role="article"` seul.
 *
 *   b. Un témoin de RANG ≠ 1 (CLAUDE.md racine, leçon 261) : cliquer la
 *      pastille du Prisme sur `m1` (original anglais, traduction française)
 *      change le texte SERVI (`p[lang]`) — et le libellé de LA MÊME rangée
 *      SUIT ce changement, puisque les deux sont composés depuis la même
 *      base servie (`rowServed`, `thread-modes.tsx`).
 *
 *   c. La pastille de présence n'est rendue QUE quand la présence est
 *      SERVIE, et elle porte la BONNE couleur — `m1` (Amina, en ligne) rend
 *      `[data-presence="online"]` peinte en `PRESENCE_HEX.success`, `m4`
 *      (Kwame) `[data-presence="away"]` en `PRESENCE_HEX.warning`. On
 *      interroge l'ANCRE, jamais le NOMBRE d'enfants de `.avatar-root` : la
 *      première rédaction comptait « 2 = dégradé + pastille », ce que
 *      l'anneau de story et le badge d'humeur (D-32 §4, déjà annoncés)
 *      auraient fait passer à 3 — un ROUGE disant « présence absente » là où
 *      la présence est là.
 *
 *      **LA MOITIÉ « NON SERVIE » EST DÉSORMAIS MESURABLE (revue #5935,
 *      défaut majeur 3).** `m5b` (Bruno, `offline` depuis deux heures,
 *      `fixtures-base.ts`) est un message RÉELLEMENT servi par
 *      `/c/c-deploiement` — avant ce lot, AUCUN message servi par AUCUNE
 *      conversation de fixtures n'avait de sender `offline` (voir D-32 §5,
 *      qui documentait cette absence comme un SUIVI). `presenceOf(bruno)`
 *      rend `'offline'`, et `Avatar` ne pose ALORS aucun `[data-presence]`
 *      (« offline = pas de pastille sur les avatars ») : ce module vérifie
 *      l'ABSENCE de l'ancre, pas seulement sa présence sur les cas en ligne.
 *
 *   d. LA LIGNE D'IDENTITÉ (`[data-identity]`) — DEUX mesures, pas une :
 *
 *      d1. hauteur uniforme (régression CSS grossière) : au moins 34 px sur
 *          TOUTES les têtes de groupe rendues, à moins de 0,5 px d'écart
 *          entre elles.
 *
 *      d2. FALSIFIABILITÉ (revue #5935, défaut majeur 5) — d1 comparait
 *          `[data-identity].getBoundingClientRect().height` au `min-height`
 *          que `focal-row.tsx` vient LUI-MÊME d'écrire en style inline : ce
 *          nœud ne CONTIENT pas l'avatar (`identityContainsAvatar: false`,
 *          mesuré), qui vit dans une gouttière FRÈRE — d1 ne peut donc PAR
 *          CONSTRUCTION jamais rougir, quoi qu'on retire de la pastille de
 *          présence (falsifié : supprimer TOUS les `[data-presence]` du DOM
 *          laisse les six hauteurs mesurées identiques, `34,34,34,34,34,34`
 *          avant ET après). d2 mesure autre chose : l'EXTENSION RÉELLE de la
 *          gouttière (`.avatar-root` + sa pastille de présence, qui déborde
 *          À 45° sur son bord — `avatar.tsx`) et vérifie qu'elle TIENT dans
 *          `AVATAR_FRAME` (34).
 *
 *          **CORRECTIF (revue #5935, défaut majeur 1) — le débord mesuré par
 *          `getBoundingClientRect()` seul est mathématiquement MORT.** La
 *          pastille se pose à `offset = size × 0,8536 − dot / 2` avec
 *          `dot = size × 0,26` : son bord bas vaut toujours
 *          `size × 0,9836 < size`, donc `dotBottom <= avatarBox.height` QUEL
 *          QUE SOIT l'état de présence — mesuré : `22,00 px` pastille posée
 *          OU absente, aux DEUX schémas, sur les 16 assertions. La boîte de
 *          layout d'un élément IGNORE son `box-shadow` (l'anneau `0 0 0 2px`
 *          d'`avatar.tsx`) : ce module lit donc le SPREAD de l'anneau via
 *          `getComputedStyle(dot).boxShadow` et l'ajoute au bord bas — c'est
 *          l'anneau, visuellement rendu, qui déborde réellement de la boîte
 *          (`22,00 px` sans pastille contre `23,64 px` AVEC, à `AVATAR_SIZE`
 *          = 22 : mesuré, PAS déduit). Cette mesure-là PEUT rougir sur le
 *          discriminant ANNONCÉ, sans toucher `AVATAR_SIZE` : élargir le
 *          facteur d'offset au-delà de ~0,78 (ou grossir l'anneau) pousse
 *          `dotBottom` au-delà de `AVATAR_FRAME` — ce que la version SANS
 *          anneau ne pouvait par construction jamais faire. Elle reste
 *          également sensible à un `AVATAR_SIZE` agrandi sans `AVATAR_FRAME`
 *          assorti (le terme `avatarBox.height` du `Math.max`), ce que d1 ne
 *          peut pas faire, par construction de `focal-row.tsx`.
 *
 *   e. « SANS COMPTE » — `m6b` (`anonymousGuest`, `type: 'anonymous'`,
 *      `fixtures-base.ts`) est le PREMIER participant `anonymous` du
 *      corpus (revue #5935, défaut majeur 3) : le glyphe `mask-happy`
 *      (`GlyphSvg`, `role="img"`) précède le nom dans le DOM, et son
 *      information ENTRE dans le libellé composé (« Sans compte » avant le
 *      nom, `message-a11y-label.ts`) puisque `[data-identity]` est
 *      désormais `aria-hidden` (point a ci-dessus).
 *
 *   f. LA COULEUR DU NOM DE SOI TIENT AA (revue #5935, défaut majeur 2,
 *      SOLDÉ) — `m2` (le viewer, « Vous ») porte `--color-self-name-ink`
 *      (indigo700 clair / indigo200 sombre, `generate-from-ios.mjs`),
 *      jamais `--ios-indigo-500` servi tel quel (mesuré 4,47:1 / 4,45:1,
 *      sous la barre AA 4,5:1 sur cette ligne de 13 px). Ce module mesure le
 *      contraste RÉEL (`lib/contrast.mjs`) plutôt que de relire le nom du
 *      jeton — une régression qui repeindrait `--color-ios-ink` (encre
 *      PARTAGÉE, qui tient AA mais rend la tête d'un message à soi
 *      indiscernable) doit rester INVISIBLE à ce gate tant qu'elle tient AA
 *      ; c'est `focal-row.test.tsx` qui garde le jeton NOMMÉ.
 *
 *   g. Capture regardée par le développeur (outil Read), jamais par ce
 *      script.
 */
export async function checkRowIdentityAndLabel({ browser, BASE, CAPTURES, setScheme, expect }) {
  for (const scheme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setScheme(context, scheme);
    const page = await context.newPage();
    await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
    await page.waitForSelector('main li [data-row]');
    await page.waitForTimeout(300);

    // --- a : role="article" + aria-label composé, sur CHAQUE rangée — et
    // les nœuds présentationnels (identité, texte servi, méta) sont TOUS
    // masqués, sur AU MOINS une rangée ordinaire (m1, jamais scrollée hors
    // vue à l'ouverture puisque le fil s'ouvre en bas — voir la scène plus
    // bas où `m1` est de toute façon élue à nouveau).
    const rows = await page.evaluate(() => {
      return [...document.querySelectorAll('main li [data-row]')].map((row) => {
        const identityEl = row.querySelector('[data-identity]');
        const identityText = identityEl ? (identityEl.textContent ?? '').trim() : null;
        // `[data-transcript]` (`attachment-blocks.tsx:207`) est la
        // LÉGENDE d'une pièce jointe (transcription ou, à défaut, son nom de
        // fichier) — `composeMessageLabel` ne la cite JAMAIS en clair, il
        // compte les pièces jointes (« 1 audio »). Le SEUL `<p>` que la
        // rangée pose pour le TEXTE servi est celui de `focal-row.tsx`
        // (`rendered.text ? <p lang=…> : null`), sans cet attribut.
        const paragraph = [...row.querySelectorAll('p:not([data-transcript])')].find(
          (el) => (el.textContent ?? '').trim().length > 0,
        );
        const meta = row.querySelector('.focal-meta');
        return {
          id: row.getAttribute('data-row'),
          role: row.getAttribute('role'),
          ariaLabel: (row.getAttribute('aria-label') ?? '').trim(),
          identityText,
          identityAriaHidden: identityEl ? identityEl.getAttribute('aria-hidden') : null,
          paragraphAriaHidden: paragraph ? paragraph.getAttribute('aria-hidden') : null,
          metaAriaHidden: meta ? meta.getAttribute('aria-hidden') : null,
          servedText: paragraph ? (paragraph.textContent ?? '').trim() : null,
        };
      });
    });
    expect(rows.length > 0, `au moins une rangée est rendue sur /c/c-deploiement (${scheme})`);
    for (const row of rows) {
      expect(row.role === 'article', `la rangée ${row.id} porte role="article" (${scheme})`);
      expect(row.ariaLabel.length > 0, `la rangée ${row.id} porte un aria-label non vide (${scheme})`);
      // « Vous » (message à soi) : composeMessageLabel omet délibérément le
      // nom — voir la doctrine ci-dessus.
      if (row.identityText && row.identityText !== 'Vous') {
        expect(row.ariaLabel.includes(row.identityText), `la rangée ${row.id} annonce son auteur (${scheme})`);
      }
      if (row.servedText) {
        expect(row.ariaLabel.includes(row.servedText), `la rangée ${row.id} annonce son texte servi (${scheme})`);
      }
      // UN SEUL LIBELLÉ (défauts majeurs 1/4) : les trois nœuds
      // présentationnels sont TOUS `aria-hidden` dès qu'ils sont rendus —
      // sans quoi un lecteur d'écran relirait ce que `aria-label` vient de
      // dire.
      if (row.identityText !== null) {
        expect(row.identityAriaHidden === 'true', `[data-identity] de ${row.id} est aria-hidden (${scheme})`);
      }
      if (row.servedText !== null) {
        expect(row.paragraphAriaHidden === 'true', `le <p> de texte servi de ${row.id} est aria-hidden (${scheme})`);
      }
      if (row.metaAriaHidden !== null) {
        expect(row.metaAriaHidden === 'true', `.focal-meta de ${row.id} est aria-hidden (${scheme})`);
      }
    }

    // --- b : un témoin de RANG ≠ 1 — le libellé SUIT le texte servi.
    // `m1` est la rangée la PLUS ANCIENNE d'un fil qui s'ouvre en BAS : elle
    // n'est dans le DOM que si la fenêtre virtualisée l'y tient — d'où le
    // défilement RÉEL, la même primitive que `electRow` (`lib/scroll-row.mjs`).
    await scrollRowIntoView(page, 'm1');
    const pastille = page.locator('main li [data-row="m1"] button[aria-label*="langue d’origine"]').first();
    expect((await pastille.count()) > 0, `m1 porte la pastille du Prisme (${scheme})`);
    const snapshotM1 = () =>
      page.evaluate(() => {
        const row = document.querySelector('main li [data-row="m1"]');
        const p = row
          ? [...row.querySelectorAll('p[lang]:not([data-transcript])')].find((el) => (el.textContent ?? '').trim().length > 0)
          : null;
        return {
          ariaLabel: row ? (row.getAttribute('aria-label') ?? '') : '',
          lang: p ? p.getAttribute('lang') : null,
          text: p ? (p.textContent ?? '').trim() : null,
        };
      });
    const beforeM1 = await snapshotM1();
    await pastille.click();
    await page.waitForTimeout(200);
    const afterM1 = await snapshotM1();
    expect(
      afterM1.ariaLabel !== beforeM1.ariaLabel && afterM1.text !== null && afterM1.ariaLabel.includes(afterM1.text),
      `le libellé suit le texte SERVI quand la langue imposée change (${beforeM1.lang} → ${afterM1.lang}, ${scheme})`,
    );
    await pastille.click();
    await page.waitForTimeout(200);

    // --- c : présence SERVIE ⇒ pastille (m1 en ligne, m4 « away ») ; et
    // présence NON servie (m5b, Bruno hors ligne depuis deux heures) ⇒
    // AUCUNE ancre — la moitié que D-32 §5 documentait comme injoignable
    // au navigateur, désormais mesurée (défaut majeur 3).
    for (const [id, why, state, hex] of [
      ['m1', 'Amina, en ligne', 'online', 'rgb(52, 211, 153)'],
      ['m4', 'Kwame, « away »', 'away', 'rgb(251, 191, 36)'],
    ]) {
      await scrollRowIntoView(page, id);
      const dot = await page.evaluate((rowId) => {
        const row = document.querySelector(`main li [data-row="${rowId}"]`);
        const el = row ? row.querySelector('.avatar-root [data-presence]') : null;
        return el === null ? null : { state: el.getAttribute('data-presence'), color: getComputedStyle(el).backgroundColor };
      }, id);
      expect(dot !== null && dot.state === state, `présence servie (${id}, ${why}) ⇒ pastille [data-presence="${state}"] (${scheme})`);
      expect(dot !== null && dot.color === hex, `la pastille de ${id} porte la couleur de la loi 1/3/5 (${hex}, lu ${dot === null ? 'aucune' : dot.color}, ${scheme})`);
    }
    await scrollRowIntoView(page, 'm5b');
    const brunoDot = await page.evaluate(() => {
      const row = document.querySelector('main li [data-row="m5b"]');
      return row ? row.querySelector('.avatar-root [data-presence]') : undefined;
    });
    expect(brunoDot === null, `Bruno, hors ligne (m5b) : AUCUNE ancre [data-presence] — la présence non servie ne pose aucune pastille (${scheme})`);

    // --- d : la ligne d'identité.
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('main li [data-identity]')].map((el) => el.getBoundingClientRect().height),
    );
    expect(heights.length >= 2, `au moins deux têtes de groupe sont rendues (${scheme})`);
    // d1 : hauteur uniforme (régression CSS grossière — voir d2 pour la
    // mesure FALSIFIABLE, distincte).
    expect(Math.min(...heights) >= 34, `la ligne d'identité mesure au moins 34 px (${Math.min(...heights)}, ${scheme})`);
    expect(
      Math.max(...heights) - Math.min(...heights) < 0.5,
      `la hauteur de la ligne d'identité est uniforme, pastille posée ou non (écart ${(Math.max(...heights) - Math.min(...heights)).toFixed(2)} px, ${scheme})`,
    );
    // d2 : FALSIFIABILITÉ (défaut majeur 5) — l'extension RÉELLE de la
    // gouttière (avatar + pastille en débord), jamais le `min-height` que
    // `focal-row.tsx` vient d'écrire sur `[data-identity]` lui-même.
    await scrollRowIntoView(page, 'm6b');
    const gutterExtents = await page.evaluate(() => {
      return [...document.querySelectorAll('main li [data-identity]')]
        .map((identityEl) => {
          const row = identityEl.closest('[data-message]');
          const avatarRoot = row ? row.querySelector('.avatar-root') : null;
          if (!avatarRoot) return null;
          const avatarBox = avatarRoot.getBoundingClientRect();
          const dot = avatarRoot.querySelector('[data-presence]');
          // `getBoundingClientRect()` ignore le `box-shadow` — l'anneau qui
          // ENTOURE visuellement la pastille (`avatar.tsx`, `boxShadow: '0 0
          // 0 2px …'`) n'est donc PAS dans `dot.getBoundingClientRect()`.
          // Sans lui, `dotBottom` ne peut jamais dépasser `avatarBox.height`
          // (défaut majeur 1, revue #5935) : on lit le SPREAD réel posé par
          // le navigateur et on l'ajoute au bord bas mesuré.
          let dotBottom = avatarBox.height;
          if (dot) {
            const dotBox = dot.getBoundingClientRect();
            const spreadValues = [...getComputedStyle(dot).boxShadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number.parseFloat(m[1]));
            // offsetX, offsetY, blur, spread — dans cet ordre pour un
            // box-shadow sans `inset` (`avatar.tsx` n'en pose pas).
            const ringSpread = spreadValues.length >= 4 ? spreadValues[3] : 0;
            dotBottom = dotBox.bottom - avatarBox.top + ringSpread;
          }
          return { hasDot: dot !== null, realExtent: Math.max(avatarBox.height, dotBottom) };
        })
        .filter((v) => v !== null);
    });
    expect(gutterExtents.length >= 2, `au moins deux gouttières d'avatar sont mesurées (${scheme})`);
    expect(
      gutterExtents.some((g) => g.hasDot) && gutterExtents.some((g) => !g.hasDot),
      `le corpus porte au moins UNE tête AVEC pastille et une SANS — sinon d2 ne peut pas falsifier (${scheme})`,
    );
    for (const g of gutterExtents) {
      expect(
        g.realExtent <= 34,
        `AVATAR_FRAME (34) contient réellement l'avatar et sa pastille en débord (mesuré ${g.realExtent.toFixed(2)} px, pastille ${g.hasDot ? 'posée' : 'absente'}, ${scheme})`,
      );
    }

    // --- e : « Sans compte » (m6b, `anonymousGuest`) — le glyphe précède le
    // nom, `role="img"`, et son information est portée par le libellé
    // (masquée au DOM par a ci-dessus).
    const anonymous = await page.evaluate(() => {
      const row = document.querySelector('main li [data-row="m6b"]');
      const identityEl = row ? row.querySelector('[data-identity]') : null;
      if (!identityEl) return null;
      const glyph = identityEl.querySelector('svg[aria-label="Sans compte"]');
      const nameEl = [...identityEl.querySelectorAll('span')].find((el) => (el.textContent ?? '').trim().length > 0);
      if (!glyph || !nameEl) return null;
      const glyphBox = glyph.getBoundingClientRect();
      const nameStyle = getComputedStyle(nameEl);
      return {
        role: glyph.getAttribute('role'),
        beforeName: glyph.compareDocumentPosition(nameEl) === Node.DOCUMENT_POSITION_FOLLOWING,
        glyphHeight: glyphBox.height,
        nameFontSize: Number.parseFloat(nameStyle.fontSize),
        ariaLabel: row ? (row.getAttribute('aria-label') ?? '') : '',
      };
    });
    expect(anonymous !== null, `m6b rend le glyphe « Sans compte » ET le nom (${scheme})`);
    if (anonymous !== null) {
      expect(anonymous.role === 'img', `le glyphe « Sans compte » porte role="img" (${scheme})`);
      expect(anonymous.beforeName, `le glyphe « Sans compte » précède le nom dans le DOM (${scheme})`);
      expect(
        Math.abs(anonymous.glyphHeight - anonymous.nameFontSize * 0.8) < 0.6,
        `le glyphe mesure nameSize × 0.8 (attendu ${(anonymous.nameFontSize * 0.8).toFixed(2)} px, mesuré ${anonymous.glyphHeight.toFixed(2)} px, ${scheme})`,
      );
      expect(
        anonymous.ariaLabel.startsWith('Sans compte,'),
        `le libellé composé porte « Sans compte » EN TÊTE, avant le nom (obtenu « ${anonymous.ariaLabel}», ${scheme})`,
      );
    }

    // --- f : la couleur du nom de SOI (m2, le viewer) tient AA.
    await scrollRowIntoView(page, 'm2');
    const selfNameContrast = await contrastOf(page, 'main li [data-row="m2"] [data-identity] span');
    expect(
      selfNameContrast !== null && selfNameContrast >= 4.5,
      `le nom de SOI (m2, « Vous ») tient la barre AA (4,5:1 minimum, mesuré ${selfNameContrast ?? 'aucun élément'}, ${scheme})`,
    );

    // --- g : capture, regardée hors de ce script (outil Read).
    await page.screenshot({ path: join(CAPTURES, `thread-identity-${scheme}.png`) });

    await context.close();
  }
}
