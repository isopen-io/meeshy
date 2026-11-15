/**
 * LE PARSEUR STRICT DES SOURCES SWIFT DU THÈME, partagé par les deux cibles :
 * `generate-from-ios.mjs` (ios.css, le web) et `generate-android-from-ios.mjs`
 * (MeeshyPaletteGenerated.kt, Android).
 *
 * Une seule lecture de `MeeshyColors.swift` et de `DesignTokens.swift` pour
 * toutes les cibles : deux parseurs liraient la même source avec deux
 * tolérances, c'est-à-dire deux tables qui peuvent diverger en silence.
 *
 * Le parseur est DÉLIBÉRÉMENT STRICT : toute déclaration d'une forme qu'il ne
 * connaît pas appelle `echoue` au lieu d'être sautée.
 */

/**
 * Les constantes déclarées en `Color(hex: "AABBCC")`, dans l'ordre du fichier :
 * c'est la table que la cible Android reproduit une à une.
 */
export const parseHexConstants = (swiftCouleurs) =>
  [...swiftCouleurs.matchAll(/^\s*public static let (\w+)\s*=\s*Color\(hex:\s*"([0-9A-Fa-f]{6})"\)\s*$/gm)].map(
    (m) => [m[1], m[2].toUpperCase()],
  );

/**
 * Rend `{ constantes, fonctions }` : les constantes résolues (hex, alias,
 * opacités) et les fonctions `nom(isDark:)` en `{ dark, light }`.
 */
export const parseColors = (swiftCouleurs, echoue) => {

  /**
   * Trois formes de constante, toutes trois porteuses de couleur :
   *   public static let nom = Color(hex: "AABBCC")   la forme nominale
   *   public static let nomHex = "AABBCC"            le jumeau CHAÎNE que Swift
   *     tient pour les API qui veulent un hexadécimal (`accentColor`, ZMQ…)
   *   public static let nom = autreNom               un alias
   *
   * La forme CHAÎNE doit être lue même si aucun jeton n'en sort : sans elle,
   * `communityAccentHex = warningHex` reste un alias non résolu et la génération
   * échoue. C'est le parseur strict qui fait son travail — il a trouvé une forme
   * que je n'avais pas prévue plutôt que de la sauter.
   */
  /**
   * Ce que le fichier déclare et qui n'est PAS une couleur : dégradés, matériaux.
   * On les recense pour pouvoir SAUTER leurs alias en connaissance de cause
   * (`primaryGradient = brandGradient`), sans pour autant sauter un alias dont
   * la cible est inconnue — celui-là reste une erreur.
   */
  const nonCouleurs = new Set(
    [...swiftCouleurs.matchAll(/public static let (\w+)\s*=\s*(?:LinearGradient|RadialGradient|Material|Angular)/g)].map(
      (m) => m[1],
    ),
  );
  for (const m of swiftCouleurs.matchAll(/public static func (\w+)\(isDark: Bool\) -> LinearGradient/g)) {
    nonCouleurs.add(m[1]);
  }

  const constantes = new Map();
  /**
   * Une QUATRIÈME forme (#8879) : `public static let nom = autre.opacity(0.5)`,
   * celle de l'échelle du chrome posé sur un média. Elle se lit comme un alias
   * dont on garde l'alpha, rendu en `color-mix(… transparent)` — la même écriture
   * que `terme()` donne à une fonction `isDark`.
   */
  const translucide = (source, alpha) =>
    `color-mix(in srgb, ${source} ${Math.round(Number(alpha) * 100)}%, transparent)`;
  for (const m of swiftCouleurs.matchAll(
    /^\s*public static let (\w+)\s*=\s*(\w+)\.opacity\(([\d.]+)\)\s*$/gm,
  )) {
    const [, name, source, alpha] = m;
    const hex = new RegExp(`public static let ${source}\\s*=\\s*Color\\(hex:\\s*"([0-9A-Fa-f]{6})"\\)`).exec(swiftCouleurs);
    if (!hex) echoue(`${name} : la source de l'opacité (${source}) n'est pas une Color(hex:) déclarée`);
    constantes.set(name, translucide(`#${hex[1].toLowerCase()}`, alpha));
  }
  for (const m of swiftCouleurs.matchAll(
    /^\s*public static let (\w+)\s*=\s*(?:Color\(hex:\s*"([0-9A-Fa-f]{6})"\)|"([0-9A-Fa-f]{6})"|(\w+))\s*$/gm,
  )) {
    const [, name, hex, hexChaine, alias] = m;
    if (hex ?? hexChaine) constantes.set(name, `#${(hex ?? hexChaine).toLowerCase()}`);
    else if (alias && nonCouleurs.has(alias)) continue; // alias de dégradé/matériau
    else if (alias && constantes.has(alias)) constantes.set(name, constantes.get(alias));
    // Un alias vers une constante non encore vue (ordre de déclaration) est
    // résolu au second tour ci-dessous.
    else if (alias) constantes.set(name, { alias });
  }
  for (const [name, value] of constantes) {
    if (typeof value === 'object') {
      const target = constantes.get(value.alias);
      if (typeof target !== 'string') echoue(`alias non résolu : ${name} -> ${value.alias}`);
      constantes.set(name, target);
    }
  }

  /**
   * Les fonctions `nom(isDark:)`. Quatre formes acceptées, et QUATRE SEULEMENT :
   *   isDark ? Color(hex: "A") : Color(hex: "B")
   *   isDark ? constante        : constante
   *   isDark ? constante.opacity(x) : constante.opacity(y)
   *   isDark ? Color.white.opacity(x) : Color.black.opacity(y)   (voiles, #8877)
   * Toute autre forme fait échouer — voir le doc-comment.
   */
  const terme = (expr, ou) => {
    const t = expr.trim();
    let m = /^Color\(hex:\s*"([0-9A-Fa-f]{6})"\)$/.exec(t);
    if (m) return `#${m[1].toLowerCase()}`;
    m = /^(\w+)$/.exec(t);
    if (m) {
      if (!constantes.has(m[1])) echoue(`${ou} référence une constante inconnue : ${m[1]}`);
      return constantes.get(m[1]);
    }
    m = /^Color\.(white|black)(?:\.opacity\(([\d.]+)\))?$/.exec(t);
    if (m) {
      return m[2] === undefined
        ? m[1]
        : `color-mix(in srgb, ${m[1]} ${Math.round(Number(m[2]) * 100)}%, transparent)`;
    }
    m = /^(\w+)\.opacity\(([\d.]+)\)$/.exec(t);
    if (m) {
      if (!constantes.has(m[1])) echoue(`${ou} référence une constante inconnue : ${m[1]}`);
      // `color-mix` avec `transparent` reproduit exactement l'alpha de SwiftUI,
      // et reste lisible dans l'inspecteur — préférable à une conversion en rgba
      // qui perdrait le nom de la couleur d'origine.
      return `color-mix(in srgb, ${constantes.get(m[1])} ${Math.round(Number(m[2]) * 100)}%, transparent)`;
    }
    echoue(`${ou} : forme non reconnue « ${t} »`);
  };

  /**
   * Coupe `a ? b : c` au deux-points de PREMIER NIVEAU.
   *
   * Une regex ne peut pas faire ça : `Color(hex: "09090B")` porte lui-même un
   * deux-points, et toute coupe naïve tombe dedans. C'est ce qui a fait échouer
   * la première version sur `backgroundPrimary` — et c'est le parseur strict qui
   * l'a signalé au lieu de rendre une table à laquelle il manquait les fonds.
   */
  const coupeLeTernaire = (body, ou) => {
    let profondeur = 0;
    let dansChaine = false;
    for (let i = 0; i < body.length; i += 1) {
      const c = body[i];
      if (c === '"') dansChaine = !dansChaine;
      else if (dansChaine) continue;
      else if (c === '(' || c === '[') profondeur += 1;
      else if (c === ')' || c === ']') profondeur -= 1;
      else if (c === ':' && profondeur === 0) return [body.slice(0, i), body.slice(i + 1)];
    }
    echoue(`${ou} : ternaire sans deux-points de premier niveau`);
  };

  const fonctions = new Map();
  for (const m of swiftCouleurs.matchAll(
    /public static func (\w+)\(isDark: Bool\) -> Color \{\s*\n\s*isDark \?([\s\S]*?)\n\s*\}/g,
  )) {
    const [, name, body] = m;
    const [dark, light] = coupeLeTernaire(body.trim(), name);
    fonctions.set(name, { dark: terme(dark, name), light: terme(light, name) });
  }

  return { constantes, fonctions };
};

/** Les blocs `enum` de `DesignTokens.swift` : `nom -> valeur` pour chaque `CGFloat`. */
export const parseTokenBlocks = (swiftJetons, echoue) => {
  const block = (name) => {
    const m = new RegExp(`public (?:nonisolated )?enum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(swiftJetons);
    if (!m) echoue(`bloc ${name} introuvable dans DesignTokens.swift`);
    const valeurs = new Map();
    for (const v of m[1].matchAll(/public static let (\w+):\s*CGFloat\s*=\s*([\d.]+)/g)) {
      valeurs.set(v[1], Number(v[2]));
    }
    return valeurs;
  };
  return {
    espaces: block('MeeshySpacing'),
    rayons: block('MeeshyRadius'),
    polices: block('MeeshyFont'),
  };
};
