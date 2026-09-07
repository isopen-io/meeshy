/**
 * LE CONTRASTE WCAG d'un texte sur ce qui est RÉELLEMENT peint derrière lui.
 *
 * Extrait de `check-reading-mode.mjs` (#5566) pour servir aussi
 * `check-list-actions.mjs` (#5559 revue-correction, défaut 1) — SOURCE
 * UNIQUE : deux gates qui recopieraient cette formule divergeraient à la
 * première correction de l'un des deux, silencieusement.
 *
 * Les fonds des surfaces sont parfois semi-transparents
 * (`rgba(255,255,255,0.15)`), donc lire `background-color` seul ne dit rien.
 * On compose les fonds des ancêtres jusqu'au premier opaque, puis on compose
 * la couleur du texte par-dessus (son alpha propre × l'opacité CSS de
 * l'élément — une rangée en sourdine qui ne fond QUE son chrome pose
 * `opacity: 1` sur le texte, donc ce second facteur reste neutre pour lui).
 * Sans cette composition, du blanc à 100 % sur du blanc à 15 % sur du blanc
 * passe pour un contraste de 21:1.
 *
 * Rend `null` quand l'élément est absent — l'appelant décide si c'est un
 * échec ou un cas hors périmètre, jamais cette fonction.
 */
export const contrastOf = (page, selector) =>
  page.evaluate((sel) => {
    const parse = (value) => {
      const n = (value.match(/[\d.]+/g) ?? []).map(Number);
      return n.length >= 3 ? { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 } : null;
    };
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    const luminance = (c) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const backdropOf = (el) => {
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) layers.push(bg);
        if (bg && bg.a === 1) break;
      }
      return layers.reduceRight((under, layer) => over(layer, under), { r: 255, g: 255, b: 255, a: 1 });
    };
    const el = document.querySelector(sel);
    if (!el) return null;
    const backdrop = backdropOf(el);
    const raw = parse(getComputedStyle(el).color);
    if (!raw) return null;
    const opacity = Number(getComputedStyle(el).opacity);
    const text = over({ ...raw, a: raw.a * (Number.isNaN(opacity) ? 1 : opacity) }, backdrop);
    const [a, b] = [luminance(text), luminance(backdrop)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  }, selector);
