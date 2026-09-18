import { beforeEach, describe, expect, test } from 'bun:test';

import { ABSENT_MEDIA_CAPACITY, isMediaAbsent, noteMediaAbsent, resetAbsentMedia } from './media-absent';

/**
 * LE REGISTRE DES MÉDIAS ABSENTS (#7022) — ce qu'il garde, et pourquoi il ne
 * peut pas vivre dans un composant.
 *
 * MESURÉ : 8 fichiers sur 2912 sont réellement absents du volume de production
 * (`docker exec meeshy-gateway`, boucle sur `filePath`), et ils le resteront —
 * aucun octet ne reviendra. Le cadrage du lot en annonçait 582, un chiffre né
 * d'une lecture de `fileUrl` COMME un chemin de disque ; c'est faux et c'est
 * dit dans l'issue. Le nombre change l'ampleur, jamais le devoir : une
 * référence morte doit rendre un état DESSINÉ et SILENCIEUX.
 *
 * POURQUOI UN MODULE ET NON UN `useState`. L'échec est aujourd'hui retenu par
 * l'état LOCAL de chaque surface — `mediaFailed` dans `story.tsx`, `errored`
 * dans `scene-object-media.tsx`, le `display = 'none'` au `onError` d'`Avatar`.
 * Un état local meurt avec son composant, et un fil virtualisé démonte puis
 * remonte ses rangées à chaque passage du défilement : la même référence morte
 * repart en requête, rend son 404, et le navigateur le journalise — une
 * cascade par aller-retour de scroll. La connaissance « ce fichier n'existe
 * pas » n'appartient pas à une rangée, elle appartient à la SESSION.
 *
 * CE QU'IL NE FAIT PAS : il ne met rien en cache, ne retente rien, ne parle à
 * personne. Il retient des ÉCHECS, ce qui est le seul savoir qu'aucune couche
 * réseau ne conserve — un 404 n'entre ni dans le cache HTTP utile, ni dans le
 * seau `medias` du service worker.
 */
describe('registre des médias absents — #7022', () => {
  beforeEach(() => {
    resetAbsentMedia();
  });

  test('une source jamais vue n’est pas absente — le registre n’affirme que ce qu’il a MESURÉ', () => {
    expect(isMediaAbsent('https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fa.jpg')).toBe(false);
  });

  test('une source dont le chargement a ÉCHOUÉ est absente ensuite', () => {
    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fdisparu.jpg';

    noteMediaAbsent(src);

    expect(isMediaAbsent(src)).toBe(true);
  });

  /**
   * LE TÉMOIN QUI PORTE TOUT LE LOT. Deux LECTEURS distincts de la même
   * source — deux rangées du fil, ou la même rangée avant et après un
   * démontage du virtualiseur — partagent le verdict. C'est précisément ce
   * qu'un `useState` ne peut pas faire, et c'est la cascade de 404 mesurée en
   * console.
   */
  test('le verdict SURVIT au démontage : ce que la première surface apprend, la suivante le sait', () => {
    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fdisparu.jpg';

    const premièreSurface = () => {
      if (isMediaAbsent(src)) return 'dessiné';
      noteMediaAbsent(src);
      return 'requête';
    };

    expect(premièreSurface()).toBe('requête');
    expect(premièreSurface()).toBe('dessiné');
    expect(premièreSurface()).toBe('dessiné');
  });

  test('une source VIDE n’est jamais absente, et ne s’enregistre pas — il n’y a aucune requête à épargner', () => {
    noteMediaAbsent('');

    expect(isMediaAbsent('')).toBe(false);
  });

  /**
   * BORNÉ (dimension 3 — « aucun cache non borné »). Une session longue sur un
   * fil infini verrait sinon le registre croître sans fin. Le plafond est
   * franc et l'éviction est la PLUS ANCIENNE : oublier une absence ne coûte
   * qu'une requête de plus, là où une fuite mémoire coûte l'onglet.
   */
  test('BORNÉ — au-delà du plafond, la plus ANCIENNE absence est oubliée, jamais la plus récente', () => {
    for (let index = 0; index <= ABSENT_MEDIA_CAPACITY; index += 1) noteMediaAbsent(`/m/${index}.jpg`);

    expect(isMediaAbsent('/m/0.jpg')).toBe(false);
    expect(isMediaAbsent(`/m/${ABSENT_MEDIA_CAPACITY}.jpg`)).toBe(true);
    expect(isMediaAbsent('/m/1.jpg')).toBe(true);
  });

  test('ré-enregistrer une absence connue ne la DUPLIQUE pas — le plafond compte des sources, pas des échecs', () => {
    for (let index = 0; index < ABSENT_MEDIA_CAPACITY; index += 1) noteMediaAbsent(`/m/${index}.jpg`);
    for (let index = 0; index < ABSENT_MEDIA_CAPACITY; index += 1) noteMediaAbsent(`/m/${index}.jpg`);

    expect(isMediaAbsent('/m/0.jpg')).toBe(true);
  });

  /**
   * UN APERÇU LOCAL N'EST PAS UNE ABSENCE SERVEUR. `blob:` et `data:` portent
   * la pièce qu'on vient de choisir, pas encore envoyée
   * (`attachmentPreviewOf`, `send/attachments.ts`) : leur URL est unique par
   * session et RÉVOQUÉE à la fin de l'envoi. Les retenir remplirait le
   * plafond d'adresses qui ne reviendront jamais, en évinçant les vraies —
   * et un aperçu qui échoue une fois n'apprend rien sur le fichier.
   */
  test('un aperçu LOCAL (`blob:`/`data:`) ne s’enregistre jamais — son adresse ne vit qu’un envoi', () => {
    noteMediaAbsent('blob:https://staging.meeshy.me/2f0a-…');
    noteMediaAbsent('data:image/png;base64,iVBORw0KGgo=');

    expect(isMediaAbsent('blob:https://staging.meeshy.me/2f0a-…')).toBe(false);
    expect(isMediaAbsent('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
  });

  /**
   * HORS LIGNE, UN ÉCHEC NE PROUVE RIEN SUR LE FICHIER (#7022 suivi — revue
   * adversariale 2026-09-18). `<img onError>` tire aussi bien sur un 404 que
   * sur une antenne coupée : défiler un fil hors-ligne échouait chaque image,
   * les gravait toutes absentes, et au retour du réseau elles restaient
   * « indisponibles » jusqu'à un rechargement complet — alors que leurs
   * octets n'ont jamais bougé. `navigator.onLine === false` est le seul
   * signal FIABLE (`lib/net/online.ts`) : il ne prouve jamais qu'une requête
   * PASSERAIT, mais son absence prouve qu'aucune n'a de sens à retenir.
   */
  test('hors ligne, un échec de chargement ne s’enregistre PAS — l’absence n’est pas mesurée', () => {
    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fcoupure.jpg';
    const navigatorMutable = navigator as Navigator & { onLine?: boolean };
    const descripteur = Object.getOwnPropertyDescriptor(navigatorMutable, 'onLine');
    Object.defineProperty(navigatorMutable, 'onLine', { value: false, configurable: true });

    try {
      noteMediaAbsent(src);
      expect(isMediaAbsent(src)).toBe(false);
    } finally {
      if (descripteur) Object.defineProperty(navigatorMutable, 'onLine', descripteur);
      else Reflect.deleteProperty(navigatorMutable, 'onLine');
    }
  });

  test('EN LIGNE, un échec s’enregistre normalement — la garde ne masque QUE l’absence de réseau', () => {
    const src = 'https://gate.meeshy.me/api/v1/attachments/file/2025%2F10%2Fvivant-en-ligne.jpg';
    const navigatorMutable = navigator as Navigator & { onLine?: boolean };
    const descripteur = Object.getOwnPropertyDescriptor(navigatorMutable, 'onLine');
    Object.defineProperty(navigatorMutable, 'onLine', { value: true, configurable: true });

    try {
      noteMediaAbsent(src);
      expect(isMediaAbsent(src)).toBe(true);
    } finally {
      if (descripteur) Object.defineProperty(navigatorMutable, 'onLine', descripteur);
      else Reflect.deleteProperty(navigatorMutable, 'onLine');
    }
  });
});
