/**
 * `parseJoinNotice` VALIDE, il ne caste pas.
 *
 * `Message.metadata` est un champ JSON libre partagé par toutes les familles de
 * messages système — résumé d'appel, avis d'arrivée, et ce qui viendra. Un
 * lecteur qui se contenterait d'un `as JoinNoticeMetadata` rendrait une carte
 * d'arrivée pour un résumé d'appel, avec un nom `undefined` : le rendu dédié
 * COURT-CIRCUITE le rendu ordinaire, donc une mauvaise reconnaissance ne
 * dégrade pas — elle remplace.
 */

import { describe, it, expect } from 'vitest';
import { parseJoinNotice, JOIN_NOTICE_KIND } from '../utils/join-notice.js';

const valid = {
  kind: JOIN_NOTICE_KIND,
  participantId: 'p1',
  displayName: 'ano_bob',
  isAnonymous: true,
  viaShareLink: true,
};

describe('parseJoinNotice', () => {
  it('reconnaît un avis complet', () => {
    expect(parseJoinNotice(valid)).toEqual(valid);
  });

  // Le pseudo (`ano_…`), le nom donné au formulaire et les règles du lien
  // enrichissent la carte d'arrivée — chacun optionnel, chacun validé : un
  // avis antérieur à ces champs reste reconnu à l'identique.
  it('porte le pseudo, le nom donné et les règles du lien quand ils sont là', () => {
    const enriched = {
      ...valid,
      username: 'ano_Jc_n045',
      givenName: 'Jc Nm',
      linkRules: { canSendMessages: true, canSendFiles: false, canSendImages: true },
    };
    expect(parseJoinNotice(enriched)).toEqual(enriched);
  });

  it('omet un pseudo ou un nom donné vide ou non-string', () => {
    expect(parseJoinNotice({ ...valid, username: '', givenName: 42 })).toEqual(valid);
    expect(parseJoinNotice({ ...valid, username: null, givenName: '' })).toEqual(valid);
  });

  it('omet des règles de lien malformées plutôt que d’affirmer un droit', () => {
    expect(parseJoinNotice({ ...valid, linkRules: 'yes' })).toEqual(valid);
    expect(parseJoinNotice({ ...valid, linkRules: null })).toEqual(valid);
    const molles = parseJoinNotice({
      ...valid,
      linkRules: { canSendMessages: 'true', canSendFiles: 1, canSendImages: undefined },
    });
    expect(molles).toEqual({
      ...valid,
      linkRules: { canSendMessages: false, canSendFiles: false, canSendImages: false },
    });
  });

  it('rend `null` pour une autre famille de message système', () => {
    expect(parseJoinNotice({ kind: 'call', callType: 'audio' })).toBeNull();
    expect(parseJoinNotice({ kind: 'call-live' })).toBeNull();
  });

  it('rend `null` quand le sens manque — mieux vaut le rendu ordinaire qu’une carte vide', () => {
    expect(parseJoinNotice({ kind: JOIN_NOTICE_KIND })).toBeNull();
    expect(parseJoinNotice({ kind: JOIN_NOTICE_KIND, participantId: 'p1' })).toBeNull();
    expect(parseJoinNotice({ kind: JOIN_NOTICE_KIND, displayName: 'Bob' })).toBeNull();
    expect(parseJoinNotice({ kind: JOIN_NOTICE_KIND, participantId: '', displayName: 'Bob' })).toBeNull();
  });

  it('tolère l’absence de métadonnée', () => {
    expect(parseJoinNotice(null)).toBeNull();
    expect(parseJoinNotice(undefined)).toBeNull();
    expect(parseJoinNotice('member-joined')).toBeNull();
    expect(parseJoinNotice(42)).toBeNull();
  });

  // Les deux drapeaux décident d'un AFFICHAGE — « sans compte », « par lien ».
  // Une valeur absente ou molle ne doit jamais devenir une affirmation : le
  // défaut est `false`, c'est-à-dire ne rien prétendre.
  it('n’affirme rien sur la foi d’une valeur molle', () => {
    const loose = parseJoinNotice({ ...valid, isAnonymous: 'yes', viaShareLink: 1 });

    expect(loose).toMatchObject({ isAnonymous: false, viaShareLink: false });
  });

  it('rend les drapeaux absents à `false`', () => {
    const bare = parseJoinNotice({
      kind: JOIN_NOTICE_KIND,
      participantId: 'p1',
      displayName: 'Alice',
    });

    expect(bare).toMatchObject({ isAnonymous: false, viaShareLink: false });
  });
});
