/**
 * La bannière ne dit jamais deux fois la même phrase.
 *
 * Défaut signalé par le porteur produit (2026-08-22, capture d'écran) : la
 * notification d'une story SANS contenu s'affichait
 *
 *     brayan njiki                        ← title  (acteur)
 *     a publié une nouvelle story         ← subtitle (l'ACTION)
 *     a publié une nouvelle story         ← body    (le CONTENU, retombé sur
 *                                                    la même phrase de repli)
 *
 * Les deux lignes viennent de deux champs légitimes qui se trouvent porter le
 * même texte : `buildPushHeader` promeut l'ACTION en subtitle, et le corps du
 * push est le `content` PERSISTÉ — lequel, faute d'excerpt, retombe sur cette
 * même phrase (invariant assumé : la ligne de la LISTE in-app ne doit jamais
 * être vide, elle n'a pas de sous-titre pour la porter).
 *
 * Le correctif ne touche donc NI le contenu persisté NI `buildPushHeader` : il
 * s'applique au seul endroit où les deux lignes se rencontrent, la charge push.
 *
 * @jest-environment node
 */

import { dedupePushSubtitle } from '../../../../services/notifications/NotificationService';

describe('dedupePushSubtitle — la bannière ne se répète pas', () => {
  it('test_dedupePushSubtitle_subtitleEqualsBody_dropsTheSubtitle', () => {
    expect(
      dedupePushSubtitle({
        subtitle: 'a publié une nouvelle story',
        body: 'a publié une nouvelle story',
      })
    ).toBeUndefined();
  });

  it('test_dedupePushSubtitle_differentTexts_keepsTheSubtitle', () => {
    // Le cas nominal : le corps porte l'aperçu du contenu, le subtitle l'action.
    expect(
      dedupePushSubtitle({
        subtitle: 'a commenté un réel de Windie Nh',
        body: 'Trop fort ce passage 😂',
      })
    ).toBe('a commenté un réel de Windie Nh');
  });

  it('test_dedupePushSubtitle_ignoresSurroundingWhitespace', () => {
    // Les deux champs sont tronqués séparément (120 / 200) et peuvent arriver
    // avec des bords différents : c'est la MÊME phrase, elle ne doit pas
    // survivre à un espace près.
    expect(
      dedupePushSubtitle({ subtitle: '  Nouvelle story ', body: 'Nouvelle story' })
    ).toBeUndefined();
  });

  it('test_dedupePushSubtitle_subtitleIsAPrefixOfBody_keepsIt', () => {
    // Prudence délibérée : on ne supprime QUE le doublon EXACT. Un subtitle qui
    // n'est qu'un préfixe du corps porte peut-être une information de plus (le
    // corps est tronqué à 200, pas le subtitle à la même longueur) — le faire
    // disparaître cacherait du texte au lieu d'en dédoublonner.
    expect(
      dedupePushSubtitle({
        subtitle: 'a publié une nouvelle story',
        body: 'a publié une nouvelle story sur son voyage à Douala',
      })
    ).toBe('a publié une nouvelle story');
  });

  it('test_dedupePushSubtitle_noSubtitle_staysUndefined', () => {
    expect(dedupePushSubtitle({ subtitle: undefined, body: 'peu importe' })).toBeUndefined();
    expect(dedupePushSubtitle({ subtitle: '   ', body: 'peu importe' })).toBeUndefined();
  });

  it('test_dedupePushSubtitle_neverEmptiesTheBody', () => {
    // L'invariant qui décide du SENS du correctif : c'est le SUBTITLE qui tombe,
    // jamais le corps. Le corps part vers APNs, FCM (bloc `notification`) et
    // WebPush ; le vider exposerait trois plateformes à une alerte sans texte,
    // là où seul iOS rend un subtitle. La fonction ne renvoie donc jamais de
    // consigne portant sur le corps — sa signature seule le garantit.
    const kept = dedupePushSubtitle({ subtitle: 'x', body: 'x' });
    expect(kept).toBeUndefined();
  });
});
