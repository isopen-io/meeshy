/**
 * `admitEditedContent` — l'unique énoncé de « ce qu'une édition a le droit
 * d'ÉCRIRE », jumeau de `admitMessageEdit` qui dit, lui, QUI a le droit d'éditer.
 *
 * La règle vivait recopiée à trois endroits sur quatre transports d'édition, et
 * la quatrième entrée — `PATCH /messages/:messageId`, celle du client ANDROID —
 * ne la portait pas du tout. Ces tests verrouillent la table complète.
 */

import {
  admitEditedContent,
  isEditedContentRefused,
  EMPTY_EDIT_REFUSAL_MESSAGE,
} from '../../../services/messaging/messageEditContent';

describe('admitEditedContent', () => {
  describe('refus — le message deviendrait muet et vide', () => {
    it('refuse un contenu vide sur un message SANS pièce jointe', () => {
      const admission = admitEditedContent({ content: '', hasAttachments: false });

      expect(admission.admitted).toBe(false);
      expect(isEditedContentRefused(admission) && admission.reason).toBe(
        'empty-without-attachments'
      );
    });

    it('refuse un contenu fait UNIQUEMENT d\'espaces sur un message sans pièce jointe', () => {
      // Le cœur du défaut : `minLength: 1` côté schéma JSON laisse passer
      // «   », que le `.trim()` réduit ensuite à la chaîne vide.
      // Une garde qui ne regarde que la LONGUEUR BRUTE ne voit jamais rien.
      const admission = admitEditedContent({ content: '   ', hasAttachments: false });

      expect(admission.admitted).toBe(false);
    });

    it('refuse les blancs non-espace (tabulation, saut de ligne) au même titre', () => {
      const admission = admitEditedContent({ content: '\t\n\r ', hasAttachments: false });

      expect(admission.admitted).toBe(false);
    });

    it('refuse un contenu absent (`undefined`) sur un message sans pièce jointe', () => {
      // `content` est optionnel dans `UpdateMessageBodySchema` (transport iOS) :
      // l'unité doit encaisser l'absence sans lever, là où un `.trim()` nu
      // jetait un TypeError.
      const admission = admitEditedContent({ content: undefined, hasAttachments: false });

      expect(admission.admitted).toBe(false);
    });

    it('refuse un contenu `null` sur un message sans pièce jointe', () => {
      const admission = admitEditedContent({ content: null, hasAttachments: false });

      expect(admission.admitted).toBe(false);
    });
  });

  describe('admission — la pièce jointe porte le message à elle seule', () => {
    it('admet un contenu vide quand le message PORTE des pièces jointes', () => {
      // Retrait de légende : la pièce jointe reste, le texte s'en va.
      const admission = admitEditedContent({ content: '', hasAttachments: true });

      expect(admission.admitted).toBe(true);
      expect(admission.admitted && admission.content).toBe('');
    });

    it('admet des espaces seuls sur un message à pièces jointes, et les réduit à vide', () => {
      const admission = admitEditedContent({ content: '   ', hasAttachments: true });

      expect(admission.admitted).toBe(true);
      expect(admission.admitted && admission.content).toBe('');
    });

    it('admet un contenu absent sur un message à pièces jointes', () => {
      const admission = admitEditedContent({ content: undefined, hasAttachments: true });

      expect(admission.admitted).toBe(true);
      expect(admission.admitted && admission.content).toBe('');
    });
  });

  describe('le contenu rendu est celui qui doit être ÉCRIT', () => {
    it('rend le contenu débarrassé de ses bords', () => {
      // L'unité rend le texte À ÉCRIRE, pas seulement un verdict : c'est ce qui
      // retire le `.trim()` recopié à chaque appelant — l'endroit exact où le
      // transport iOS a déjà jeté un TypeError sur un `content` absent.
      const admission = admitEditedContent({ content: '  bonjour  ', hasAttachments: false });

      expect(admission.admitted).toBe(true);
      expect(admission.admitted && admission.content).toBe('bonjour');
    });

    it('préserve les blancs INTÉRIEURS', () => {
      const admission = admitEditedContent({
        content: '  deux   mots  ',
        hasAttachments: false,
      });

      expect(admission.admitted && admission.content).toBe('deux   mots');
    });

    it('admet un contenu non vide indépendamment des pièces jointes', () => {
      const withAttachments = admitEditedContent({ content: 'salut', hasAttachments: true });
      const without = admitEditedContent({ content: 'salut', hasAttachments: false });

      expect(withAttachments.admitted).toBe(true);
      expect(without.admitted).toBe(true);
    });
  });

  it('expose un motif de refus unique, partagé par les quatre transports', () => {
    expect(EMPTY_EDIT_REFUSAL_MESSAGE).toEqual(expect.stringContaining('empty'));
  });
});
