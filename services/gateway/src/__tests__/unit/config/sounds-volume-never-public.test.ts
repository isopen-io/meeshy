/**
 * LE VOLUME DES SONS N'EST SERVI QUE PAR LA ROUTE AUTHENTIFIÉE (#7015).
 *
 * ## La question que #7015 posait, et ce que la MESURE a répondu
 *
 * L'issue proposait deux voies pour qu'un `<audio>` du web puisse jouer un
 * son de fond, et lisait le commentaire de `routes/posts/audio.ts` comme la
 * preuve qu'« il existe un chemin public prévu pour ces fichiers ». Mesuré le
 * 2026-09-18, c'est FAUX dans les trois sens :
 *
 *  1. `https://static.meeshy.me/<uuid>.m4a` rend **404**. Le volume
 *     `gateway_sounds` n'est monté sur AUCUN nginx statique — `static-files`
 *     ne monte que `frontend_uploads` et `gateway_uploads`. Le chemin public
 *     n'existe pas : il faudrait le CRÉER.
 *  2. Le commentaire de `audio.ts` dit l'INVERSE de ce qu'on y a lu — il
 *     explique pourquoi le volume est DÉDIÉ, « surtout PAS sous
 *     `UPLOAD_PATH` », précisément pour échapper à ce montage et à son cache
 *     immutable d'un an. C'est une décision de confidentialité, pas une porte
 *     de sortie.
 *  3. Le contenu n'est pas public par nature : sur les 20 publications de
 *     production qui citent ces fichiers, **une est `PRIVATE`** ; et les 18
 *     fichiers présents ont été écrits par l'ancienne route d'envoi manuel
 *     (`POST /stories/audio`, retirée par #4190), qui ne gatait sur AUCUNE
 *     visibilité. `SoundCaptureService`, son successeur, ne capture que du
 *     PUBLIC/COMMUNITY (`feedsSoundLibrary`) — mais cette garde-là est en
 *     AMONT du volume, pas dessus.
 *
 * Le web a donc reçu l'autre voie : les octets voyagent par `fetch`, avec
 * l'en-tête que la session porte déjà, et l'élément média reçoit une URL
 * d'objet (`apps/web-v2/src/lib/api/protected-media.ts`). Aucun jeton dans
 * une URL, aucune nouvelle surface publique.
 *
 * ## Pourquoi un témoin, alors que rien n'est cassé
 *
 * C'est un PIÈGE ARMÉ, au sens du cycle 84 : la non-exposition tient
 * aujourd'hui à l'ABSENCE d'une ligne dans un compose, ce que rien ne nomme
 * « confidentialité ». La première personne qui monte `gateway_sounds` sur le
 * nginx statique — pour servir une vignette, pour « aligner les volumes »,
 * ou en relisant #7015 comme le faisait son énoncé — publierait ces fichiers
 * au monde entier, en cache immutable un an, sans qu'un seul témoin tombe.
 * Ce témoin la force à voir ce qu'elle ouvre.
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `staging-admin-surfaces-ssh-tunnel-only.test.ts` (#6254).
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

/** Le service nginx qui sert `static.<domaine>`, et le volume des sons, par déploiement. */
const DEPLOIEMENTS = [
  { compose: 'docker-compose.prod.yml', statique: 'static-files', volume: 'gateway_sounds' },
  { compose: 'docker-compose.staging.yml', statique: 'static-files-staging', volume: 'gateway_staging_sounds' },
] as const;

/**
 * Isole les lignes d'un service top-level (indenté à 2 espaces) jusqu'à la
 * prochaine clé au même niveau — la seule frontière stable d'un compose écrit
 * à la main.
 */
function serviceBlock(source: string, serviceName: string, compose: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

describe('le volume des sons de fond ne rejoint JAMAIS un magasin public (#7015)', () => {
  describe.each(DEPLOIEMENTS)('$compose', ({ compose, statique, volume }) => {
    const source = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8');

    it(`le volume "${volume}" existe et reste déclaré`, () => {
      // Sans cette assertion, un renommage du volume rendrait la garde
      // ci-dessous trivialement verte — elle chercherait un nom que plus
      // personne ne porte.
      expect(source).toContain(`  ${volume}:`);
    });

    it(`"${statique}" ne monte PAS "${volume}" — il servirait ces fichiers sans authentification, en cache immutable un an`, () => {
      expect(serviceBlock(source, statique, compose)).not.toContain(volume);
    });

    it('la passerelle, elle, le monte bien sur /app/sounds — la route authentifiée doit pouvoir les lire', () => {
      expect(source).toContain(`${volume}:/app/sounds`);
    });
  });
});
