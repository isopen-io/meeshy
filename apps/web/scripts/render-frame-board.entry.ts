/**
 * LA PAGE DE LA PLANCHE DES CADRES (#8741) — côté navigateur. Construite par
 * `render-frame-board.ts` (Bun.build), jamais par Vite : elle n'entre pas
 * dans l'application. Elle expose `window.frameBoard` : la liste des cadres
 * du catalogue, et le rendu d'un cadre avec des visages SYNTHÉTIQUES
 * (portraits stylisés, déterministes par personne) en PNG.
 */
import { captureFrames } from '../src/lib/calls/frames/frame-catalogue';
import { loadFrameFonts } from '../src/lib/calls/frames/frame-fonts';
import { paintFrame, type FrameFace } from '../src/lib/calls/frames/frame-paint';
import type { FramePerson, FrameTexts } from '../src/lib/calls/frames/frame-text';

const CAST: readonly (readonly [string, string])[] = [
  ['Awa', 'awa.diallo'],
  ['Karim', 'karim_b'],
  ['Lina', 'lina.moreau'],
  ['Tomás', 'tomas.rz'],
  ['Mei', 'mei_lin'],
  ['Noah', 'noah.k'],
  ['Inès', 'ines.fa'],
  ['Yuki', 'yuki_t'],
  ['Omar', 'omar.sy'],
  ['Sofia', 'sofia.r'],
  ['Léo', 'leo.m'],
  ['Zara', 'zara_n'],
];

const WALLS: readonly (readonly [string, string])[] = [
  ['#E9DCCB', '#CDB9A2'],
  ['#C9D6E8', '#93A7C2'],
  ['#D9E4D2', '#A9BCA0'],
  ['#EAD3D3', '#C79E9E'],
  ['#D8D2E8', '#A89FC4'],
  ['#E6E0C8', '#BFB48C'],
];
const SKINS = ['#8D5524', '#E0AC69', '#C68642', '#F1C27D', '#FFDBAC', '#6B4226', '#D9A066'];
const HAIRS = ['#1B1B1B', '#3B2A20', '#1B1B1B', '#6A4E3A', '#101010', '#2A1A12', '#A0522D'];
const CLOTHES = ['#3C5A99', '#B5523B', '#2F6F5E', '#6D4C8D', '#C49A2C', '#34495E', '#9C2F4F'];

const pick = <T,>(items: readonly T[], index: number): T => items[index % items.length] as T;

/** Un portrait stylisé : un mur doux, une fenêtre de lumière, des épaules, un visage aux traits simples. */
function portrait(index: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(720, 960);
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  const [wallTop, wallBottom] = pick(WALLS, index);
  const skin = pick(SKINS, index);
  const hair = pick(HAIRS, index);
  const cloth = pick(CLOTHES, index);
  const wall = context.createLinearGradient(0, 0, 0, 960);
  wall.addColorStop(0, wallTop);
  wall.addColorStop(1, wallBottom);
  context.fillStyle = wall;
  context.fillRect(0, 0, 720, 960);
  const light = context.createRadialGradient(index % 2 === 0 ? 120 : 600, 160, 0, index % 2 === 0 ? 120 : 600, 160, 520);
  light.addColorStop(0, 'rgba(255, 250, 235, 0.55)');
  light.addColorStop(1, 'rgba(255, 250, 235, 0)');
  context.fillStyle = light;
  context.fillRect(0, 0, 720, 960);
  const cx = 360 + ((index * 37) % 60) - 30;
  const long = index % 3 === 1;
  context.fillStyle = hair;
  if (long) {
    context.beginPath();
    context.ellipse(cx, 470, 190, 280, 0, 0, Math.PI * 2);
    context.fill();
  }
  const shirt = context.createLinearGradient(0, 700, 0, 960);
  shirt.addColorStop(0, cloth);
  shirt.addColorStop(1, '#00000055');
  context.fillStyle = cloth;
  context.beginPath();
  context.moveTo(cx - 300, 960);
  context.bezierCurveTo(cx - 290, 760, cx - 170, 700, cx, 700);
  context.bezierCurveTo(cx + 170, 700, cx + 290, 760, cx + 300, 960);
  context.closePath();
  context.fill();
  context.fillStyle = shirt;
  context.fill();
  context.fillStyle = skin;
  context.fillRect(cx - 55, 560, 110, 160);
  context.beginPath();
  context.moveTo(cx - 75, 700);
  context.quadraticCurveTo(cx, 790, cx + 75, 700);
  context.fill();
  const face = context.createRadialGradient(cx - 50, 380, 20, cx, 440, 220);
  face.addColorStop(0, skin);
  face.addColorStop(1, `${skin}CC`);
  context.fillStyle = skin;
  context.beginPath();
  context.ellipse(cx, 440, 150, 190, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = face;
  context.fill();
  context.fillStyle = hair;
  context.beginPath();
  context.ellipse(cx, 330, 158, 110, 0, Math.PI, Math.PI * 2);
  context.quadraticCurveTo(cx + 150, 400, cx + 120, 420);
  context.quadraticCurveTo(cx + 40, 330, cx - 120, 360);
  context.quadraticCurveTo(cx - 160, 380, cx - 158, 330);
  context.fill();
  context.fillStyle = '#1E1A18';
  [-55, 55].forEach((dx) => {
    context.beginPath();
    context.ellipse(cx + dx, 455, 13, 16, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.strokeStyle = '#1E1A18';
  context.lineCap = 'round';
  context.lineWidth = 9;
  [-55, 55].forEach((dx) => {
    context.beginPath();
    context.moveTo(cx + dx - 30, 412);
    context.quadraticCurveTo(cx + dx, 398, cx + dx + 30, 410);
    context.stroke();
  });
  context.strokeStyle = '#7A3B2E';
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(cx - 48, 540);
  context.quadraticCurveTo(cx, 575, cx + 48, 540);
  context.stroke();
  context.fillStyle = 'rgba(255, 140, 120, 0.18)';
  [-95, 95].forEach((dx) => {
    context.beginPath();
    context.ellipse(cx + dx, 510, 32, 20, 0, 0, Math.PI * 2);
    context.fill();
  });
  return canvas;
}

const PORTRAITS = CAST.map((_, index) => portrait(index));

const people = (count: number): readonly FramePerson[] => CAST.slice(0, count).map(([name, handle], index) => ({ id: `p${index}`, name, handle, isSelf: index === 0 }));

const texts = (count: number): FrameTexts => ({ groupName: count > 2 ? 'Les Copains du Jeudi' : null, isGroup: count > 2, date: new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(2026, 8, 29)), accent: null });

async function render(id: string, count: number, width: number, height: number, cameraOff: readonly number[]): Promise<string> {
  const frame = captureFrames().find((candidate) => candidate.id === id);
  if (frame === undefined) throw new Error(`cadre inconnu : ${id}`);
  await loadFrameFonts([frame]);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('canevas indisponible');
  const faces: readonly (FrameFace | null)[] = PORTRAITS.slice(0, count).map((source, index) => (cameraOff.includes(index) ? null : { source, size: { width: 720, height: 960 } }));
  paintFrame(context, frame, people(count), faces, texts(count), { width, height });
  return canvas.toDataURL('image/png');
}

const list = () => captureFrames().map((frame) => ({ id: frame.id, mood: frame.mood, motif: frame.motif, name: frame.name, bucket: frame.bucket, people: frame.people }));

Object.assign(window, { frameBoard: { list, render } });
document.body.dataset.ready = 'true';
