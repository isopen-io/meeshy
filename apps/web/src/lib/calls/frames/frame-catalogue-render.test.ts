import { describe, expect, test } from 'bun:test';

import { captureFrames } from './frame-catalogue';
import { frameSlots } from './frame-layout';
import { paintFrame, type FrameFace } from './frame-paint';
import { drewBrandDashes, recorder, written } from './frame-recorder.test-support';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * CHAQUE CADRE DU CATALOGUE SE REND (#8741, #8743, spec § 6) — pour chaque
 * cadre et chaque nombre de sa tranche, aux deux orientations : une case
 * par personne, dans la toile ; la signature Meeshy tracée ; le nom du
 * groupe écrit en groupe seulement.
 */

const NAMES = ['Awa', 'Karim', 'Lina', 'Tomás', 'Mei', 'Noah', 'Inès', 'Yuki', 'Omar', 'Sofia', 'Léo', 'Zara'];
const people = (count: number): readonly FramePerson[] => NAMES.slice(0, count).map((name, index) => ({ id: `u${index}`, name, handle: name.toLowerCase(), isSelf: index === 0 }));
const GROUP = 'Les Copains';
const texts = (isGroup: boolean): FrameTexts => ({ groupName: isGroup ? GROUP : null, isGroup, date: '29 sept. 2026', accent: null });
const faces = (count: number): readonly FrameFace[] => Array.from({ length: count }, () => ({ source: {} as CanvasImageSource, size: { width: 1280, height: 720 } }));
const SIZES = [
  { width: 1080, height: 1920 },
  { width: 1920, height: 1080 },
] as const;

const range = (low: number, high: number): readonly number[] => Array.from({ length: high - low + 1 }, (_, index) => low + index);

const usesGroupTitle = (frame: ReturnType<typeof captureFrames>[number]): boolean => frame.title.source === 'group' || frame.subtitle?.source === 'group';

describe('le catalogue réel se rend', () => {
  captureFrames().forEach((frame) =>
    test(`${frame.id}`, () => {
      const failures = range(frame.people[0], frame.people[1]).flatMap((count) =>
        SIZES.flatMap((size) => {
          const problems: string[] = [];
          const boxes = frameSlots(frame, count, size);
          if (boxes.length !== count) problems.push(`${count}@${size.width}: ${boxes.length} cases`);
          boxes.forEach((box) => {
            const inside = box.rect.x >= -1e-6 && box.rect.y >= -1e-6 && box.rect.x + box.rect.width <= size.width + 1e-6 && box.rect.y + box.rect.height <= size.height + 1e-6;
            if (!inside || box.rect.width <= 0) problems.push(`${count}@${size.width}: case ${box.index} hors toile`);
          });
          const group = recorder();
          paintFrame(group.context, frame, people(count), faces(count), texts(count > 2), size);
          const groupText = written(group.log);
          const mark = frame.brand?.mark;
          const signed = mark === 'logo' ? drewBrandDashes(group.log) : mark !== undefined && groupText.includes('meeshy') && (mark === 'wordmark' || drewBrandDashes(group.log));
          if (!signed) problems.push(`${count}@${size.width}: signature absente`);
          if (count > 2 && usesGroupTitle(frame) && !groupText.some((text) => text.toLocaleUpperCase().startsWith('LES CO'))) problems.push(`${count}@${size.width}: nom du groupe absent`);
          const alone = recorder();
          paintFrame(alone.context, frame, people(count), faces(count), { ...texts(false), groupName: GROUP }, size);
          if (written(alone.log).some((text) => text.toLocaleUpperCase().includes('COPAINS'))) problems.push(`${count}@${size.width}: nom du groupe hors groupe`);
          return problems;
        }),
      );
      expect(failures).toEqual([]);
    }),
  );
});
