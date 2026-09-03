/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UNE SOURCE PAR VÉRITÉ, sur le fil. La revue croisée a trouvé trois JUMELLES
 * entre ce que le serveur sert et ce que le module peint : les libellés
 * (`LIBELLES` recopiait `FIL`), la teinte de l'avatar (deux hachages), le
 * poids d'un fichier (trois arrondis). Ces témoins lisent les SOURCES et
 * refusent qu'une copie renaisse : une jumelle ne se voit pas à l'exécution
 * tant qu'elle n'a pas divergé — et c'est alors trop tard.
 */

const RACINE = join(__dirname, '..');
const source = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const PEINTRE = 'lib/realtime/fil-peinture.ts';
const COMPOSEUR = 'lib/realtime/composeur.ts';
const LIGNES = 'app/connecte/fil-lignes.ts';
const PARTICIPATION = 'lib/realtime/participate.ts';
const VUE = 'app/connecte/vue.ts';

describe('les libellés du fil', () => {
  it('viennent de lib/contenu/fil.ts — le module de participation n’en porte aucune copie', () => {
    const participation = source(PARTICIPATION);
    expect(participation).toContain("from '@/lib/contenu/fil'");
    expect(participation).not.toMatch(/const LIBELLES\b/);
    expect(participation).not.toContain("'Envoi en cours'");
    expect(participation).not.toContain("'écrit…'");
  });
});

describe('la teinte et les initiales d’un avatar', () => {
  it('ont un seul site, lib/avatar.ts, lu par le serveur et par le peintre', () => {
    [LIGNES, PEINTRE, VUE].forEach((chemin) => {
      expect(source(chemin)).toContain("from '@/lib/avatar'");
      expect(source(chemin)).not.toMatch(/const TEINTES\b/);
      expect(source(chemin)).not.toMatch(/const teinteDeLAvatar\b/);
      expect(source(chemin)).not.toMatch(/const initiales\b/);
    });
    expect(source('lib/avatar.ts')).toMatch(/export const teinteDeLAvatar\b/);
  });
});

describe('le poids d’un fichier', () => {
  it('a un seul site, lib/poids.ts, lu par la ligne servie, le peintre et le composeur', () => {
    [LIGNES, PEINTRE, COMPOSEUR].forEach((chemin) => {
      expect(source(chemin)).toContain("from '@/lib/poids'");
      expect(source(chemin)).not.toMatch(/const UNITES\b/);
      expect(source(chemin)).not.toMatch(/const poids = /);
    });
  });
});

/**
 * LA FORME D'UNE PIÈCE — `lib/api/formes.ts`, lu par la ligne servie, par le
 * peintre, par `lib/api/fil.ts` (« quel genre a une piste traduite ») et par
 * `lib/poids.ts` (« quel genre a une durée »). Déclarée `const` NON exportée
 * dans `fil-lignes.ts`, elle n'était la table que du rendu SERVI : les quatre
 * autres sites réécrivaient la règle en comparaisons littérales de genre, et le
 * même message avait deux formes selon son chemin d'arrivée (issue #4835).
 */
describe('la forme d’une pièce jointe', () => {
  const LECTEURS = [LIGNES, PEINTRE, 'lib/api/fil.ts', 'lib/poids.ts'];

  it('a un seul site, lib/api/formes.ts, lu par les quatre surfaces', () => {
    expect(source('lib/api/formes.ts')).toMatch(/export const FORME_PAR_GENRE\b/);
    LECTEURS.forEach((chemin) => {
      expect(source(chemin)).toMatch(/from '(@\/lib\/api\/formes|\.\/formes|\.\/api\/formes)'/);
    });
  });

  it('n’est réécrite nulle part en comparaisons littérales de genre', () => {
    LECTEURS.filter((chemin) => chemin !== 'lib/api/formes.ts').forEach((chemin) => {
      const code = source(chemin)
        .replace(/\/\*\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(code).not.toMatch(/(?:genre|mimeType)\s*[!=]==\s*'(?:audio|video|image|fichier)'/);
    });
  });
});

describe('le battement de bail', () => {
  it('a un seul site, lib/api/invite.ts — le module de participation appelle rafraichis, jamais un chemin', () => {
    const participation = source(PARTICIPATION);
    expect(participation).toContain('rafraichis(');
    expect(participation).not.toContain('anonymous/refresh');
    expect(participation).not.toContain('guest-sessions');
    // Le chemin est COMPOSÉ là (`${PREFIXE}/guest-sessions/me`), en PATCH — la forme de `link-admission.ts:775-777`.
    const invite = source('lib/api/invite.ts');
    expect(invite).toMatch(/\/guest-sessions\/me/);
    expect(invite).toContain("METHODE_DU_BATTEMENT = 'PATCH'");
  });
});

/**
 * LE NOM D'UNE LANGUE — trois écrans, et il en existait DEUX versions.
 *
 * `fil-vue.ts` et `story-vue.ts` lisaient `getLanguageInfo(code)` de
 * `@meeshy/shared` (le NOM NATIF : « Español », « Deutsch », « 中文 ») ;
 * `commentaires-vue.ts`, écrit plus tard, appelait
 * `Intl.DisplayNames(['fr'])` (« espagnol », « allemand », « chinois »).
 *
 * Deux mots pour la même langue sur deux écrans de la même application — et
 * sous une ligne de Prisme, dont le rôle est précisément de DIRE dans quelle
 * langue on lit. C'est la dimension 6 (même mot partout) et la 11 (une source
 * de vérité) perdues d'un seul geste, et aucune garde ne pouvait le voir :
 * chaque fichier était parfaitement cohérent avec lui-même.
 *
 * Le témoin est de SOURCE et non de comportement, pour la raison que ce
 * fichier porte en tête : une jumelle ne se voit à l'exécution qu'une fois
 * qu'elle a divergé, et il est alors trop tard. Il interdit donc les deux
 * choses qui ont produit la divergence — une seconde implémentation, et
 * l'appel direct à l'API de repli.
 */
describe('le nom d’une langue', () => {
  const VUES_QUI_NOMMENT_UNE_LANGUE = [
    'app/connecte/fil-vue.ts',
    'app/connecte/commentaires-vue.ts',
    'app/(public)/stories/[id]/story-vue.ts',
  ];

  it.each(VUES_QUI_NOMMENT_UNE_LANGUE)('vient de lib/contenu/langues.ts (%s)', (chemin) => {
    const vue = source(chemin);

    expect(vue).toContain("from '@/lib/contenu/langues'");
    // Aucune vue ne redéclare la fonction : elle l'IMPORTE.
    expect(vue).not.toMatch(/const nomDeLangue = \(/);
  });

  it.each(VUES_QUI_NOMMENT_UNE_LANGUE)('n’appelle ni Intl.DisplayNames ni getLanguageInfo en direct (%s)', (chemin) => {
    const vue = source(chemin);

    // `Intl.DisplayNames` est la forme DIVERGENTE — elle rend le nom traduit
    // en français, quand tout le reste de l'app rend le nom NATIF.
    expect(vue).not.toContain('Intl.DisplayNames');
    // Et `getLanguageInfo` est la bonne source, mais lue à UN seul endroit :
    // trois lectures directes sont trois occasions de re-diverger.
    expect(vue).not.toContain('getLanguageInfo');
  });
});
