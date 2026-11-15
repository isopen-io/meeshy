import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { PendingAttachment } from './attachments';
import { envoisLegendes, type LegendeSaisie } from './legendes';

// `File` n'existe que dans un DOM — happy-dom, jamais le moteur `bun:test` nu
// (même dispositif que `attachments.test.ts`). La loi ne LIT jamais le fichier,
// elle le fait voyager ; il faut néanmoins en fabriquer un pour typer.
beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

function piece(localId: string, name: string): PendingAttachment {
  return {
    localId,
    file: new File([new Uint8Array([1])], name, { type: 'image/jpeg' }),
    kind: 'image',
    name,
    size: 1,
  };
}

function legende(localId: string, texte: string, langue: string): LegendeSaisie {
  return { localId, texte, langue };
}

/** Trois images, et les deux dernières légendées dans des langues DIFFÉRENTES
 * de la langue par défaut — c'est la forme exigée par la leçon 261 : au premier
 * rang, la règle juste et le bug « tout le monde prend la langue du composeur »
 * rendent le même verdict, donc le témoin ne pourrait pas tomber. */
const TROIS = [piece('a', 'un.jpg'), piece('b', 'deux.jpg'), piece('c', 'trois.jpg')] as const;

describe("le plan de légendage découpe une sélection en N envois (#6956)", () => {
  test('trois images rendent trois intentions, dans l’ordre de la SÉLECTION', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [legende('c', 'la troisième', 'es'), legende('a', 'la première', 'fr')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois).toHaveLength(3);
    expect(envois.map((e) => e.attachments[0]?.localId)).toEqual(['a', 'b', 'c']);
  });

  test('chaque intention porte EXACTEMENT une pièce', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [],
      langueParDefaut: 'fr',
      protection: {},
    });

    for (const envoi of envois) {
      expect(envoi.attachments).toHaveLength(1);
    }
    expect(envois.map((e) => e.attachments[0]?.name)).toEqual(['un.jpg', 'deux.jpg', 'trois.jpg']);
  });

  test('une image légendée porte son texte', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [legende('b', 'le chat dort', 'fr')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois[1]?.text).toBe('le chat dort');
  });

  test('une image SANS légende part avec un texte vide, jamais celui d’une voisine', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [legende('a', 'seule la première est légendée', 'fr')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois[0]?.text).toBe('seule la première est légendée');
    expect(envois[1]?.text).toBe('');
    expect(envois[2]?.text).toBe('');
  });

  test('CHAQUE légende part dans SA langue — pas celle de sa voisine, pas celle du composeur', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [
        legende('a', 'première', 'fr'),
        legende('b', 'segunda', 'es'),
        legende('c', 'dritte', 'de'),
      ],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois.map((e) => e.language)).toEqual(['fr', 'es', 'de']);
  });

  test('une image sans légende retombe sur la langue du composeur', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [legende('b', 'segunda', 'es')],
      langueParDefaut: 'de',
      protection: {},
    });

    expect(envois.map((e) => e.language)).toEqual(['de', 'es', 'de']);
  });

  test('une légende d’espaces seuls ne fait pas un message à texte blanc', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [legende('b', '   \n  ', 'es')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois[1]?.text).toBe('');
    // Sans légende RÉELLE, la langue d'écriture n'a pas été choisie pour ce
    // message : il repart sur celle du composeur.
    expect(envois[1]?.language).toBe('fr');
  });

  test('une légende est ROGNÉE de ses bords', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [legende('a', '  le chat dort  ', 'fr')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois[0]?.text).toBe('le chat dort');
  });

  test('la protection armée est portée par CHACUN des envois', () => {
    const envois = envoisLegendes({
      pending: TROIS,
      legendes: [],
      langueParDefaut: 'fr',
      protection: { viewOnce: true, ephemeralSeconds: 60 },
    });

    for (const envoi of envois) {
      expect(envoi.protection).toEqual({ viewOnce: true, ephemeralSeconds: 60 });
    }
  });

  test('une sélection vide ne rend AUCUN envoi', () => {
    expect(
      envoisLegendes({ pending: [], legendes: [], langueParDefaut: 'fr', protection: {} }),
    ).toHaveLength(0);
  });

  test('une légende orpheline n’INVENTE aucun message', () => {
    const envois = envoisLegendes({
      pending: [piece('a', 'un.jpg')],
      legendes: [legende('a', 'la bonne', 'fr'), legende('zzz', 'la fantôme', 'es')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois).toHaveLength(1);
    expect(envois[0]?.text).toBe('la bonne');
  });

  test('la DERNIÈRE saisie pour une même pièce gagne — un champ édité deux fois ne dédouble pas son message', () => {
    const envois = envoisLegendes({
      pending: [piece('a', 'un.jpg')],
      legendes: [legende('a', 'première frappe', 'fr'), legende('a', 'frappe corrigée', 'es')],
      langueParDefaut: 'fr',
      protection: {},
    });

    expect(envois).toHaveLength(1);
    expect(envois[0]?.text).toBe('frappe corrigée');
    expect(envois[0]?.language).toBe('es');
  });
});
