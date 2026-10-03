import type { CanvasObject, CanvasScene } from './document';

export function backgroundPlaceholderHash(_object: CanvasObject, _scene: CanvasScene): string | undefined {
  return undefined;
}

export function scenePlaceholderHash(_scene: CanvasScene): string | undefined {
  return undefined;
}

export function mediaHasArrived(_src: string): boolean {
  return false;
}

export function noteMediaArrived(_src: string): void {}
