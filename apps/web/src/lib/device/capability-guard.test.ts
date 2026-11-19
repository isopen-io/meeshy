import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **UN SEUL LECTEUR DES SIGNAUX DE L'APPAREIL** (W10, #11316) - la memoire, les
 * coeurs et `navigator.connection` se lisent dans `lib/device/capability-tier.ts`
 * et nulle part ailleurs : chaque consommateur lit le tier (ou la connexion
 * normalisee) au lieu de reinventer son seuil. Cette garde lit les sources.
 *
 * `links/click-context.ts` n'en decide rien : il releve ces valeurs BRUTES pour
 * la telemetrie d'un clic.
 */
const SRC = fileURLToPath(new URL('../..', import.meta.url));

const READS_RAW_SIGNALS: Readonly<Record<string, string>> = {
  'lib/device/capability-tier.ts': 'le lecteur unique',
  'lib/links/click-context.ts': 'la telemetrie d\'un clic : des valeurs brutes, aucune decision',
  // #19776 — un changement de CHEMIN, aucun seuil : ce module s'abonne a
  // `connection.change` et ne compare que `connection.type`, pour savoir que
  // l'adresse de l'appareil a change (Wi-Fi qui cede a la 4G) et relancer la
  // reprise d'appel. Son en-tete dit lui-meme qu'il IGNORE les estimations de
  // debit et de latence que le meme evenement annonce — « les suivre
  // recyclerait la socket au moindre creux ». C'est l'inverse de reinventer un
  // seuil, ce que cette garde protege. La NARROWNESS de l'exception est
  // mesuree par le temoin ci-dessous, pas supposee.
  'lib/calls/call-network-recovery.ts': 'la reprise d\'appel : `connection.type` et son evenement `change`, aucun seuil',
};

const SIGNAL = /\b(hardwareConcurrency|deviceMemory)\b|navigator\)?\.connection|['"]connection['"]/;

function sources(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('un seul lecteur des signaux de l\'appareil', () => {
  test('aucune source hors le lecteur unique ne lit memoire, coeurs ou connexion', () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path))
      .filter((path) => !(path in READS_RAW_SIGNALS))
      .filter((path) => SIGNAL.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('chaque exception de la liste existe encore', () => {
    for (const path of Object.keys(READS_RAW_SIGNALS)) expect(statSync(join(SRC, path)).isFile()).toBe(true);
  });

  /**
   * Une absolution porte sa MESURE, sinon elle couvre plus que ce qu'elle dit.
   * La reprise d'appel est exemptee pour `connection` SEULEMENT : si elle se
   * mettait a lire la memoire, les coeurs, ou a decider depuis le tier, elle
   * reinventerait le seuil que cette garde protege — et sa ligne d'inventaire,
   * ecrite pour un abonnement, l'aurait absoute en silence.
   */
  test('l\'exception de la reprise d\'appel ne couvre que `connection` — ni memoire, ni coeurs, ni tier', () => {
    const source = readFileSync(join(SRC, 'lib/calls/call-network-recovery.ts'), 'utf8');

    expect(/\b(hardwareConcurrency|deviceMemory)\b/.test(source)).toBe(false);
    expect(/device\/capability-tier/.test(source)).toBe(false);
  });
});

/**
 * **LA PHOTO ENVOYEE NE SUIT PAS LE TIER** (verdict du porteur, #11247 reformule
 * le 2026-10-22) : un appareil de tier bas peut DEVELOPPER plus petit a l'ecran,
 * jamais ENVOYER une photo rabotee. Le chemin qui fabrique le fichier envoye
 * (developpement d'une prise de vue, preparation d'un televersement, le worker
 * qui les execute) ne lit donc jamais le tier : sa taille est celle de la HD
 * (`PHOTO_MAX_EDGE`), sur tout appareil.
 */
const SENT_PHOTO_PATH: readonly string[] = [
  'lib/media/photo-develop.ts',
  'lib/media/photo-develop-core.ts',
  'lib/media/prepare-image-upload.ts',
  'lib/media/image-job.ts',
  'lib/media/image-job-worker.ts',
];

describe('la photo envoyee ne depend pas du tier de l\'appareil', () => {
  test('aucune source du chemin d\'envoi d\'une photo ne lit le tier', () => {
    const readers = SENT_PHOTO_PATH.filter((path) => /device\/capability-tier/.test(readFileSync(join(SRC, path), 'utf8')));
    expect(readers).toEqual([]);
  });
});
