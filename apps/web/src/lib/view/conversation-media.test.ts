import { describe, expect, test } from 'bun:test';

import type { Attachment } from '../api/types';
import { projectConversationMedia, openingIndexOf, type MediaOfConversation } from './conversation-media';

/**
 * LES MÉDIAS DE LA CONVERSATION, À PLAT ET DANS L'ORDRE DU FIL (#6303).
 *
 * La visionneuse ne feuillette aujourd'hui que les pièces DU message ouvert
 * (`attachment-blocks.tsx`, `items={visual}`). L'issue demande la conversation
 * entière — c'est la parité avec `ConversationMediaGalleryView` d'iOS, qui
 * pagine tout le fil et montre la pellicule du lot.
 *
 * La projection est PURE : elle prend les messages CHARGÉS et rend une liste
 * plate. Deux exigences la gouvernent, et elles viennent l'une et l'autre d'un
 * défaut évité :
 *
 * - **L'ordre est celui du FIL, jamais celui du montage.** Un registre alimenté
 *   par les rangées au montage verrait la pellicule rétrécir et se réordonner
 *   pendant le défilement — la fenêtre de virtualisation ne monte qu'une
 *   poignée de rangées.
 * - **Les pièces MASQUÉES gardent leur position** (D-41, #6189). Les retirer
 *   décalerait tous les index suivants, et la visionneuse ouvrirait un autre
 *   média que celui touché.
 */

const img = (id: string): Attachment =>
  ({ id, mimeType: 'image/jpeg', fileUrl: `https://x/${id}.jpg` }) as unknown as Attachment;
const vid = (id: string): Attachment =>
  ({ id, mimeType: 'video/mp4', fileUrl: `https://x/${id}.mp4` }) as unknown as Attachment;
const aud = (id: string): Attachment =>
  ({ id, mimeType: 'audio/mpeg', fileUrl: `https://x/${id}.m4a` }) as unknown as Attachment;
const doc = (id: string): Attachment =>
  ({ id, mimeType: 'application/pdf', fileUrl: `https://x/${id}.pdf` }) as unknown as Attachment;

const msg = (id: string, attachments: readonly Attachment[]) => ({ id, attachments });

describe('projectConversationMedia — la liste plate du fil', () => {
  test('aplatit les pièces VISUELLES de tous les messages, dans l’ordre', () => {
    const flat = projectConversationMedia([
      msg('m1', [img('a'), img('b')]),
      msg('m2', [vid('c')]),
    ]);
    expect(flat.map((e) => e.attachment.id)).toEqual(['a', 'b', 'c']);
    expect(flat.map((e) => e.messageId)).toEqual(['m1', 'm1', 'm2']);
  });

  test('AUDIO et documents restent dehors — la visionneuse ne les rend pas', () => {
    // `galleryPage` d'iOS ne connaît que `.image` et `.video` ; y laisser entrer
    // un vocal ouvrirait une page noire sans contrôle.
    const flat = projectConversationMedia([msg('m1', [img('a'), aud('v'), doc('d'), vid('c')])]);
    expect(flat.map((e) => e.attachment.id)).toEqual(['a', 'c']);
  });

  test('un message SANS pièce n’occupe aucune place', () => {
    const flat = projectConversationMedia([msg('m1', []), msg('m2', [img('a')]), msg('m3', undefined as never)]);
    expect(flat.map((e) => e.attachment.id)).toEqual(['a']);
  });

  test('la liste est VIDE quand le fil n’a chargé aucun média', () => {
    expect(projectConversationMedia([msg('m1', []), msg('m2', [doc('d')])])).toEqual([]);
  });
});

describe('openingIndexOf — quel média s’ouvre quand on en touche un', () => {
  const flat: readonly MediaOfConversation[] = projectConversationMedia([
    msg('m1', [img('a'), img('b')]),
    msg('m2', [vid('c')]),
  ]);

  test('rend la position DANS LE FIL de la pièce touchée, pas son rang dans son message', () => {
    // Le défaut que ce témoin garde : toucher la première pièce de `m2` ouvrait
    // l'index 0 — la première pièce de la CONVERSATION — parce que l'index
    // venait du message. On ouvrait alors un autre média que celui touché.
    expect(openingIndexOf(flat, 'm2', 'c')).toBe(2);
    expect(openingIndexOf(flat, 'm1', 'b')).toBe(1);
  });

  test('une pièce introuvable ouvre le DÉBUT plutôt que rien', () => {
    // Un média peut disparaître du fil entre le tap et l'ouverture (purge,
    // suppression). Rendre `null` laisserait une visionneuse vide ; 0 ouvre au
    // moins quelque chose de cohérent.
    expect(openingIndexOf(flat, 'm9', 'zzz')).toBe(0);
  });

  test('le même identifiant dans DEUX messages ne se confond pas', () => {
    // Les identifiants de pièce ne sont uniques que par message sur certains
    // chemins ; l'appariement porte donc sur le COUPLE (message, pièce).
    const doublons = projectConversationMedia([msg('m1', [img('same')]), msg('m2', [img('same')])]);
    expect(openingIndexOf(doublons, 'm2', 'same')).toBe(1);
  });
});
