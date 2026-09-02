/**
 * #4502 — le texte de scène ne doit PLUS être recopié dans le `content` d'une
 * story, et les signaux qui en dépendaient doivent le DÉRIVER à la demande.
 *
 * ## La directive (porteur, 2026-08-30)
 *
 * > « Il ne faut plus recopier le texte de scène pour mettre dans le contenu !
 * > Pour la notification on peut récolter les textes de scène si le contenu est
 * > vide, mais sinon on référence le contenu réel. »
 *
 * ## Ce que la recopie alimentait, mesuré avant de la retirer
 *
 * `PostService.createPost` écrivait `content = composeStoryContent(textObjects)`
 * quand l'auteur n'avait saisi aucune description, puis `createPost` RELIT le
 * post (`refreshed`) — donc la route `POST /posts` recevait la valeur recopiée
 * et la donnait à DEUX consommateurs :
 *
 * | consommateur | ce qu'il perdrait sans dérivation |
 * |---|---|
 * | l'aperçu de la notification d'ami | la bannière retomberait sur « a publié une nouvelle story » |
 * | l'extraction des hashtags | un `#voyage` posé sur la scène cesserait d'être indexé |
 *
 * Le second n'était dans AUCUNE des listes de consommateurs dressées avant le
 * lot — ni dans le corps de l'issue, ni dans mon propre relevé. Il n'apparaît
 * pas quand on cherche « qui lit `content` » : il lit `postContent`, une
 * variable locale de la route, deux cents lignes après l'affectation.
 *
 * C'est pourquoi la dérivation est une FONCTION et pas deux expressions en
 * ligne : un troisième consommateur se branchera dessus au lieu de rouvrir la
 * question.
 */

import { describe, it, expect } from '@jest/globals';
import { postSignalText } from '../storyContentComposition';

describe('postSignalText', () => {
  const sceneEffects = {
    textObjects: [{ text: 'Bonjour' }, { text: 'le monde' }],
  };

  it('rend le contenu de l’auteur quand il existe', () => {
    expect(postSignalText({ content: 'Vue depuis le refuge', storyEffects: sceneEffects }))
      .toBe('Vue depuis le refuge');
  });

  it('DÉRIVE des textes de scène quand le contenu est absent', () => {
    expect(postSignalText({ content: null, storyEffects: sceneEffects }))
      .toBe('Bonjour le monde');
  });

  it('traite un contenu vide ou blanc comme absent', () => {
    expect(postSignalText({ content: '', storyEffects: sceneEffects })).toBe('Bonjour le monde');
    expect(postSignalText({ content: '   ', storyEffects: sceneEffects })).toBe('Bonjour le monde');
  });

  /**
   * Le contenu de l'auteur gagne TOUJOURS — c'est la seconde moitié de la
   * directive, « sinon on référence le contenu réel ». Concaténer les deux
   * ferait exactement le doublon qu'on retire.
   */
  it('ne concatène jamais le contenu et la scène', () => {
    expect(postSignalText({ content: 'Vue', storyEffects: sceneEffects })).toBe('Vue');
  });

  it('rend undefined quand il n’y a ni contenu ni texte de scène', () => {
    expect(postSignalText({ content: null, storyEffects: undefined })).toBeUndefined();
    expect(postSignalText({ content: null, storyEffects: { textObjects: [] } })).toBeUndefined();
    expect(postSignalText({ content: '', storyEffects: { textObjects: [{ text: '  ' }] } }))
      .toBeUndefined();
  });

  /**
   * Le v3 loge ses textes dans `scenes[].objects[kind=text]`, pas dans
   * `textObjects`. La dérivation passe par `storyTranslatableTexts`, qui
   * connaît les deux formes — la recopier ici l'aurait fait diverger, et le
   * composer v3 est justement celui qui produit ces stories.
   */
  it('trouve les textes d’une scène v3', () => {
    // **La forme est celle du PRODUCTEUR, pas celle qu'on imagine.** Ce fixture
    // portait d'abord `{ kind: 'text', text: … }` — plausible, et faux : en v3
    // le texte vit sous `payload.text` (`storyEffectsV3.ts:401`). Le témoin est
    // tombé sur ma propre supposition, ce qui est exactement son travail : un
    // fixture inventé aurait attesté une dérivation qui rend `undefined` sur
    // toutes les stories du composer v3, c'est-à-dire sur toutes les neuves.
    const v3 = {
      v: 3,
      scenes: [{ objects: [{ kind: 'text', payload: { text: 'Sonde 4842' } }] }],
    };
    expect(postSignalText({ content: null, storyEffects: v3 })).toBe('Sonde 4842');
  });

  /**
   * L'alias legacy `content` sur un overlay : le décodeur SDK iOS le replie
   * déjà vers `text`, la passerelle doit faire de même — sinon l'overlay
   * disparaît de la dérivation et la bannière redevient muette.
   */
  it('accepte l’alias legacy content d’un overlay', () => {
    expect(postSignalText({ content: null, storyEffects: { textObjects: [{ content: 'Ancien' }] } }))
      .toBe('Ancien');
  });
});
