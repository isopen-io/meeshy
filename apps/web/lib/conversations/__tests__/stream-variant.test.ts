import { streamScrollLayout } from '../stream-variant';

/**
 * La loi de layout des deux variantes de `BubbleStreamPage`.
 *
 * `thread` (/chat/:linkId, conversation partagée) : géométrie de MESSAGERIE —
 * ancien en haut, récent en bas, exactement celle que la perspective Focal
 * attend (`focalFocusLine` ancre la ligne de focus près du BAS du viewport :
 * le dernier message est net, l'historique s'estompe en remontant).
 *
 * `stream` (/, feed d'accueil) : géométrie historique du BubbleStream —
 * récent en haut — bit-à-bit inchangée.
 */
describe('streamScrollLayout', () => {
  it('thread : ancien en haut, récent en bas — la géométrie que Focal attend', () => {
    expect(streamScrollLayout('thread')).toEqual({
      reverseOrder: true,
      scrollDirection: 'up',
      scrollButtonDirection: 'down',
    });
  });

  it('stream : récent en haut — le comportement historique du feed, inchangé', () => {
    expect(streamScrollLayout('stream')).toEqual({
      reverseOrder: false,
      scrollDirection: 'down',
      scrollButtonDirection: 'up',
    });
  });
});
