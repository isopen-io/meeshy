import { describe, expect, test } from 'bun:test';

import {
  activeSegmentIndex,
  karaokeSegments,
  karaokeTone,
  segmentSeekTarget,
  type TimedSegment,
} from './transcript-karaoke';

/**
 * LE SUIVI DE LA TRANSCRIPTION PAR LA LECTURE (#6306) — la loi PURE, testée
 * sans navigateur, miroir du karaoké d'iOS (`AudioPlayerView.swift:701`, « la
 * transcription à plat suit la LECTURE »).
 *
 * **Les segments existent déjà et personne ne les lit.**
 * `TranscriptionSegment` (`packages/shared/types/attachment-transcription.ts`)
 * porte `startMs`, `endMs`, `text` et `speakerId`, et voyage jusqu'au web dans
 * `Attachment.transcription.segments`. Le fil n'en prend que `.text`
 * (`api/prism.ts`) : la donnée arrive, aucun consommateur ne la regarde. C'est
 * la même forme que le rognage d'iOS de ce matin — une valeur juste que rien
 * ne lit — et c'est pourquoi cette loi commence par un témoin plutôt que par
 * une vue.
 */

const seg = (startMs: number, endMs: number, text: string): TimedSegment => ({ startMs, endMs, text });

/** Trois segments contigus, la forme nominale d'une transcription Whisper. */
const contigus: readonly TimedSegment[] = [
  seg(0, 1_000, 'Bonjour'),
  seg(1_000, 2_500, 'comment vas-tu'),
  seg(2_500, 4_000, 'à bientôt'),
];

describe('activeSegmentIndex — quel segment est prononcé à cet instant', () => {
  /*
   **L'UNITÉ EST LE PIÈGE, et ce témoin l'a payé en premier.** Les segments sont
   en MILLISECONDES (`TranscriptionSegment.startMs`), la position en SECONDES
   (`useMediaPlayback.position`). La première version de ce fichier passait des
   millisecondes comme position — `activeSegmentIndex(contigus, 1_000)` pour
   « une seconde » — et interrogeait donc la loi à 1 000 secondes de lecture.
   Quatre témoins rouges sur une loi juste.

   Les cas ci-dessous portent des positions en secondes, écrites en décimal
   (`1`, `1.8`, `2.5`) précisément pour qu'aucune relecture ne puisse les
   confondre avec des millisecondes.
  */
  test('le premier segment commence À zéro, pas après', () => {
    // Une lecture qui démarre ne doit pas passer par un état « aucun segment » :
    // le karaoké s'allumerait un dixième de seconde trop tard, à chaque vocal.
    expect(activeSegmentIndex(contigus, 0)).toBe(0);
  });

  test('une borne appartient au segment qui COMMENCE, jamais à celui qui finit', () => {
    // Sans cette règle, à 1,000 s exactement deux segments se disent actifs —
    // ou aucun. Le départage se fait sur `start <= t < end`, une seule fois.
    expect(activeSegmentIndex(contigus, 1)).toBe(1);
    expect(activeSegmentIndex(contigus, 2.5)).toBe(2);
  });

  test('au milieu d’un segment, c’est lui', () => {
    expect(activeSegmentIndex(contigus, 1.8)).toBe(1);
  });

  test('après le dernier segment, le dernier RESTE surligné', () => {
    // La transcription se tait avant la piste (silence de fin, respiration).
    // Rendre `null` éteindrait le karaoké sur les dernières secondes, ce qui se
    // lit comme un défaut d'affichage, pas comme un silence.
    expect(activeSegmentIndex(contigus, 9.999)).toBe(2);
  });

  test('un TROU entre deux segments garde le PRÉCÉDENT allumé', () => {
    // Whisper laisse des trous sur les silences. Éteindre pendant le blanc
    // ferait clignoter la transcription à chaque respiration.
    const troués = [seg(0, 1_000, 'un'), seg(3_000, 4_000, 'deux')];
    expect(activeSegmentIndex(troués, 2)).toBe(0);
  });

  test('aucun segment ⇒ aucun index, jamais un 0 trompeur', () => {
    expect(activeSegmentIndex([], 0.5)).toBeNull();
  });

  test('une position négative retombe sur le premier segment', () => {
    expect(activeSegmentIndex(contigus, -1)).toBe(0);
  });

  test('des segments DÉSORDONNÉS sont lus dans leur ordre temporel', () => {
    // La passerelle ne garantit pas l'ordre du tableau ; s'y fier ferait
    // dépendre l'affichage d'un détail de sérialisation.
    const désordre = [seg(2_500, 4_000, 'trois'), seg(0, 1_000, 'un'), seg(1_000, 2_500, 'deux')];
    expect(activeSegmentIndex(désordre, 1.8)).toBe(2);
  });

  test('la POSITION est en secondes, les SEGMENTS en millisecondes — et les deux ne se confondent pas', () => {
    // Le garde-fou du piège ci-dessus. À 2 (secondes) on est dans le segment
    // 1 000–2 500 ms ; si un jour la loi lisait sa position en millisecondes,
    // 2 tomberait dans le tout premier segment et ce témoin le dirait.
    expect(activeSegmentIndex(contigus, 2)).toBe(1);
  });
});

describe('segmentSeekTarget — toucher un segment y déplace la lecture', () => {
  test('rend le DÉBUT du segment, en secondes', () => {
    // Le geste attendu est « relis-moi ça », donc le début — jamais le milieu
    // ni la fin, qui couperaient le mot que le lecteur vient de désigner.
    expect(segmentSeekTarget(contigus, 1)).toBe(1);
    expect(segmentSeekTarget(contigus, 2)).toBe(2.5);
  });

  test('un index hors bornes ne déplace rien', () => {
    expect(segmentSeekTarget(contigus, 9)).toBeNull();
    expect(segmentSeekTarget(contigus, -1)).toBeNull();
  });
});

/**
 * LES SEGMENTS DE LA PISTE JOUÉE (#7911) — le karaoké suit ce qu'on ENTEND,
 * pas seulement l'original. Miroir de `resolveDisplaySegments` d'iOS
 * (`AudioPlayerView+Transcription.swift:37`) : segments de la traduction
 * quand la piste traduite joue, repli proportionnel quand rien n'est horodaté.
 */
describe('karaokeSegments — les bornes du texte servi, dans la langue de la piste', () => {
  const original = {
    language: 'en',
    segments: [seg(0, 1_000, 'Hello'), seg(1_000, 2_000, 'team')],
  };
  const translations = {
    fr: { transcription: 'Bonjour équipe', url: '/fr.mp3', segments: [seg(0, 1_200, 'Bonjour'), seg(1_200, 2_400, 'équipe')] },
    de: { transcription: 'Hallo Team', url: '/de.mp3' },
  };

  test('texte original + piste originale ⇒ les segments de la transcription', () => {
    expect(
      karaokeSegments({ transcription: original, translations, servedText: 'Hello team', servedLanguage: 'en', trackLanguage: 'en', durationMs: 2_000 }),
    ).toEqual(original.segments);
  });

  test('traduction servie + piste traduite horodatée ⇒ les segments de la TRADUCTION', () => {
    expect(
      karaokeSegments({ transcription: original, translations, servedText: 'Bonjour équipe', servedLanguage: 'fr', trackLanguage: 'fr', durationMs: 2_400 }),
    ).toEqual(translations.fr.segments);
  });

  test('traduction sans horodatage ⇒ les MOTS répartis sur la durée, au prorata de leur longueur', () => {
    const segments = karaokeSegments({ transcription: original, translations, servedText: 'Hallo Team', servedLanguage: 'de', trackLanguage: 'de', durationMs: 2_000 });
    expect(segments?.map((s) => s.text)).toEqual(['Hallo', 'Team']);
    expect(segments?.[0]?.startMs).toBe(0);
    expect(segments?.[1]?.endMs).toBe(2_000);
    // « Hallo » (5 lettres) dure plus que « Team » (4) : la frontière passe après la moitié.
    expect(segments?.[0]?.endMs).toBeGreaterThan(1_000);
    expect(segments?.[0]?.endMs).toBe(segments?.[1]?.startMs);
  });

  test('texte et piste dans deux langues ⇒ AUCUN karaoké — il affirmerait suivre une voix qui dit autre chose', () => {
    expect(
      karaokeSegments({ transcription: original, translations, servedText: 'Hola equipo', servedLanguage: 'es', trackLanguage: 'en', durationMs: 2_000 }),
    ).toBeUndefined();
  });

  test('aucune durée connue et rien d’horodaté ⇒ aucun karaoké plutôt qu’un karaoké inventé', () => {
    expect(
      karaokeSegments({ transcription: { language: 'en' }, translations: undefined, servedText: 'Hello team', servedLanguage: 'en', trackLanguage: 'en', durationMs: 0 }),
    ).toBeUndefined();
  });

  test('texte vide ⇒ rien à surligner', () => {
    expect(
      karaokeSegments({ transcription: original, translations, servedText: '', servedLanguage: 'en', trackLanguage: 'en', durationMs: 2_000 }),
    ).toBeUndefined();
  });
});

describe('karaokeTone — le rôle de chaque segment pendant l’écoute', () => {
  test('à l’arrêt, tout est au repos : le texte ne garde aucune trace d’un surlignage', () => {
    expect([0, 1, 2].map((i) => karaokeTone(i, null))).toEqual(['idle', 'idle', 'idle']);
  });

  test('en lecture : passés pleins, le prononcé ACTIF, les suivants à venir', () => {
    expect([0, 1, 2].map((i) => karaokeTone(i, 1))).toEqual(['past', 'active', 'upcoming']);
  });
});
