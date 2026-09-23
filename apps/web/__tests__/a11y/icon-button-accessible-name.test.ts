/**
 * Un bouton qui ne porte QU'UNE ICÔNE n'a pas de nom accessible : un lecteur
 * d'écran annonce « bouton », et rien d'autre. Sur `CategorySelector`, valider
 * un renommage et l'annuler s'annonçaient donc à l'identique.
 *
 * Mesuré avant ce cliquet : 48 `<Button>` dans ce cas, 33 sous `components/`
 * et 15 sous `app/`, répartis sur 22 fichiers.
 *
 * RÈGLE DE DÉCISION, et elle n'est pas un détail — le chiffre a été faux deux
 * fois avant d'être juste (99, puis 90, puis 48) :
 *
 *   - un élément AUTO-FERMANT est une icône : il disparaît ;
 *   - tout autre élément GARDE SON CONTENU.
 *
 * Sans la seconde moitié, `<Share2 /><span>{t('share')}</span>` compte comme un
 * bouton anonyme alors qu'il porte son texte ; et sans un dépouillement des
 * commentaires JSX, on retrouve les commentaires au lieu des défauts.
 *
 * LIMITE, nommée avec sa taille : ce balayage ne lit que les `<Button>` du
 * design system. Les `<button>` NATIFS — 359 occurrences sous `components/`
 * au moment où ce cliquet est posé — sont un lot distinct, et ils ont leur
 * propre issue. Une limite tue redevient un angle mort ; celle-ci est écrite.
 *
 * Quand ce cliquet tombe, la réparation est un `aria-label={t(…)}` — jamais une
 * ligne d'inventaire. Il n'y a pas de bouton-icône anonyme légitime.
 */

import fs from 'fs';
import path from 'path';

const RACINES = ['components', 'app'].map((r) => path.join(__dirname, '../..', r));

const PORTE_UN_NOM = /\b(aria-label|aria-labelledby|title)\s*=/;

type Site = { readonly fichier: string; readonly ligne: number; readonly enfants: string };

/** Les `<Button>…</Button>` d'un source, avec leur balise ouvrante et leurs enfants. */
function boutons(src: string): ReadonlyArray<{ debut: number; balise: string; enfants: string }> {
  const trouves: { debut: number; balise: string; enfants: string }[] = [];
  const ouvertures = [...src.matchAll(/<Button\b/g)];

  for (const ouverture of ouvertures) {
    // fin de la balise ouvrante : le premier `>` hors accolades JSX
    let i = ouverture.index! + ouverture[0].length;
    let accolades = 0;
    let autoFermante = false;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') accolades += 1;
      else if (c === '}') accolades -= 1;
      else if (accolades === 0 && c === '>') break;
      else if (accolades === 0 && c === '/' && src[i + 1] === '>') { autoFermante = true; break; }
      i += 1;
    }
    if (autoFermante) continue; // `<Button … />` n'a aucun enfant : autre défaut

    const balise = src.slice(ouverture.index!, i + 1);

    // enfants jusqu'au `</Button>` APPAIRÉ. On retient l'INDEX de la fermeture,
    // jamais la position du curseur après elle : la soustraire ensuite rognait
    // huit caractères de la fin, invisible tant que ce sont des espaces.
    let j = i + 1;
    let imbrication = 1;
    let fermeture = src.length;
    while (j < src.length && imbrication > 0) {
      if (src.startsWith('<Button', j)) imbrication += 1;
      else if (src.startsWith('</Button>', j)) {
        imbrication -= 1;
        if (imbrication === 0) { fermeture = j; break; }
      }
      j += 1;
    }
    trouves.push({ debut: ouverture.index!, balise, enfants: src.slice(i + 1, fermeture) });
  }
  return trouves;
}

/** Les enfants peuvent-ils donner un nom accessible au bouton ? */
function enfantsNomment(enfants: string): boolean {
  let s = enfants.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  let avant: string | null = null;
  while (avant !== s) {
    avant = s;
    s = s.replace(/<[A-Za-z][\w.]*\b(?:[^<>{}]|\{[^{}]*\})*?\/>/g, '');          // icônes
    s = s.replace(/<\/?[A-Za-z][\w.]*\b(?:[^<>{}]|\{[^{}]*\})*?>/g, '');         // autres balises, contenu gardé
  }
  return /[A-Za-zÀ-ÿ0-9]/.test(s);
}

function fichiersTsx(racine: string): string[] {
  if (!fs.existsSync(racine)) return [];
  return fs.readdirSync(racine, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(racine, e.name);
    if (e.isDirectory()) return fichiersTsx(p);
    return e.isFile() && e.name.endsWith('.tsx') ? [p] : [];
  });
}

function balayer(): Site[] {
  return RACINES.flatMap(fichiersTsx).flatMap((fichier) => {
    const src = fs.readFileSync(fichier, 'utf8');
    return boutons(src)
      .filter(({ balise, enfants }) => !PORTE_UN_NOM.test(balise) && !enfantsNomment(enfants))
      .filter(({ enfants }) => enfants.trim().length > 0)
      .map(({ debut, enfants }) => ({
        fichier: path.relative(path.join(__dirname, '../..'), fichier),
        ligne: src.slice(0, debut).split('\n').length,
        enfants: enfants.replace(/\s+/g, ' ').trim().slice(0, 60),
      }));
  });
}

describe("Un bouton-icône dit ce qu'il fait à qui ne le voit pas", () => {
  it('aucun <Button> réduit à ses icônes ne part sans nom accessible', () => {
    const anonymes = balayer().map((s) => `${s.fichier}:${s.ligne}  ${s.enfants}`);
    expect(anonymes).toEqual([]);
  });

  /**
   * Une garde négative dont le balayage ne lit RIEN reste verte pour toujours.
   * Celle-ci prouve qu'elle voit le dépôt, puis qu'elle sait distinguer les
   * trois formes sur lesquelles les deux premières versions se sont trompées.
   */
  it('balaie le dépôt, et tranche les trois formes qui l\'ont fait mentir', () => {
    const fichiers = RACINES.flatMap(fichiersTsx);
    expect(fichiers.length).toBeGreaterThan(300);

    const [icone] = boutons('<Button onClick={x}><Copy className="h-3 w-3" /></Button>');
    expect(enfantsNomment(icone.enfants)).toBe(false);

    // 1. un ternaire au premier niveau porte du texte
    const [ternaire] = boutons("<Button><>{loading ? 'Test…' : 'Lancer'}</></Button>");
    expect(enfantsNomment(ternaire.enfants)).toBe(true);

    // 2. un `<span>` garde SON contenu quand sa balise disparaît
    const [span] = boutons("<Button><Share2 className=\"h-4\" /><span>{t('share')}</span></Button>");
    expect(enfantsNomment(span.enfants)).toBe(true);

    // 3. un commentaire JSX ne nomme rien
    const [commente] = boutons('<Button>{/* fermer */}<X className="h-4" /></Button>');
    expect(enfantsNomment(commente.enfants)).toBe(false);
  });
});
