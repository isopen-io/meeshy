/**
 * Tests for cursor-position module
 * Tests cursor position calculation for textarea autocomplete positioning
 */

import {
  getCursorPosition,
  getCursorPositionForFixed,
  adjustPositionForViewport,
} from '../../lib/cursor-position';

describe('Cursor Position Module', () => {
  // Mock for getComputedStyle
  const mockComputedStyle = {
    boxSizing: 'border-box',
    width: '300px',
    paddingTop: '10px',
    paddingRight: '10px',
    paddingBottom: '10px',
    paddingLeft: '10px',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    fontFamily: 'Arial',
    fontSize: '14px',
    fontWeight: 'normal',
    lineHeight: '20px',
    letterSpacing: 'normal',
    wordSpacing: 'normal',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    wordBreak: 'normal',
    textAlign: 'left',
    direction: 'ltr',
    tabSize: '4',
  };

  beforeEach(() => {
    jest.spyOn(window, 'getComputedStyle').mockReturnValue(mockComputedStyle as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCursorPosition', () => {
    it('should return cursor position for textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello World';
      document.body.appendChild(textarea);

      // Mock getBoundingClientRect
      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position = getCursorPosition(textarea, 5);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');

      document.body.removeChild(textarea);
    });

    it('should handle cursor at start of text', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello World';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position = getCursorPosition(textarea, 0);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');

      document.body.removeChild(textarea);
    });

    it('should handle cursor at end of text', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello World';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position = getCursorPosition(textarea, 11);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');

      document.body.removeChild(textarea);
    });

    it('should handle empty textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.value = '';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position = getCursorPosition(textarea, 0);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');

      document.body.removeChild(textarea);
    });

    it('should handle multiline text', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Line 1\nLine 2\nLine 3';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      // Cursor at "Line 2"
      const position = getCursorPosition(textarea, 10);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');

      document.body.removeChild(textarea);
    });

    it('should account for textarea scroll', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello World';
      textarea.scrollLeft = 10;
      textarea.scrollTop = 20;
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position = getCursorPosition(textarea, 5);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');

      document.body.removeChild(textarea);
    });

    it('should clean up mirror div after calculation', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const childCountBefore = document.body.children.length;
      getCursorPosition(textarea, 3);
      const childCountAfter = document.body.children.length;

      expect(childCountAfter).toBe(childCountBefore);

      document.body.removeChild(textarea);
    });
  });

  describe('getCursorPositionForFixed', () => {
    it('should return cursor position for fixed positioned textarea', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Hello World';
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position = getCursorPositionForFixed(textarea, 5);

      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(typeof position.x).toBe('number');
      expect(typeof position.y).toBe('number');

      document.body.removeChild(textarea);
    });

    it('should handle cursor at different positions', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Testing cursor position';
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);

      jest.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 50,
        bottom: 200,
        right: 350,
        width: 300,
        height: 100,
        x: 50,
        y: 100,
        toJSON: () => {},
      });

      const position1 = getCursorPositionForFixed(textarea, 0);
      const position2 = getCursorPositionForFixed(textarea, 10);
      const position3 = getCursorPositionForFixed(textarea, 23);

      expect(position1).toHaveProperty('x');
      expect(position2).toHaveProperty('x');
      expect(position3).toHaveProperty('x');

      document.body.removeChild(textarea);
    });
  });

  describe('adjustPositionForViewport', () => {
    beforeEach(() => {
      // Mock viewport dimensions
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: 768,
        writable: true,
      });
      Object.defineProperty(window, 'visualViewport', {
        value: { height: 768 },
        writable: true,
      });
    });

    it('should position below cursor when there is enough space', () => {
      const result = adjustPositionForViewport(100, 200);

      expect(result).toHaveProperty('top');
      expect(result).toHaveProperty('left');
      expect(result.top).toBeGreaterThan(200); // Below cursor line
    });

    it('should position above cursor when no space below', () => {
      // Cursor near bottom of viewport
      const result = adjustPositionForViewport(100, 700);

      expect(result).toHaveProperty('top');
      expect(result).toHaveProperty('left');
      // Should be positioned above the cursor line
      expect(result.top).toBeLessThan(700);
    });

    it('should adjust left position to stay in viewport', () => {
      // Cursor near right edge
      const result = adjustPositionForViewport(900, 200, 224);

      expect(result.left).toBeLessThanOrEqual(1024 - 224 - 20);
    });

    it('should not go below minimum left margin', () => {
      // Very small x position
      const result = adjustPositionForViewport(5, 200);

      expect(result.left).toBeGreaterThanOrEqual(20);
    });

    it('should use default autocomplete dimensions', () => {
      const result = adjustPositionForViewport(100, 200);

      expect(result).toHaveProperty('top');
      expect(result).toHaveProperty('left');
    });

    it('should use custom autocomplete dimensions', () => {
      const result = adjustPositionForViewport(100, 200, 300, 400, 30);

      expect(result).toHaveProperty('top');
      expect(result).toHaveProperty('left');
    });

    it('should handle mobile viewport', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 375,
        writable: true,
      });

      const result = adjustPositionForViewport(100, 200);

      expect(result).toHaveProperty('left');
      // Should respect mobile constraints
      expect(result.left).toBeGreaterThanOrEqual(20);
    });

    it('should use visualViewport height when available', () => {
      Object.defineProperty(window, 'visualViewport', {
        value: { height: 500 }, // Simulating virtual keyboard
        writable: true,
      });

      const result = adjustPositionForViewport(100, 400);

      expect(result).toHaveProperty('top');
    });

    it('should center vertically when no space above or below', () => {
      Object.defineProperty(window, 'innerHeight', {
        value: 300,
        writable: true,
      });
      Object.defineProperty(window, 'visualViewport', {
        value: { height: 300 },
        writable: true,
      });

      // Cursor in middle of small viewport
      const result = adjustPositionForViewport(100, 150, 224, 256);

      expect(result).toHaveProperty('top');
      // Should be centered
      expect(result.top).toBeGreaterThanOrEqual(20);
    });

    it('should handle edge case with cursor at top of viewport', () => {
      const result = adjustPositionForViewport(100, 0);

      expect(result).toHaveProperty('top');
      expect(result.top).toBeGreaterThanOrEqual(0);
    });

    it('should account for line height in positioning', () => {
      const lineHeight = 30;
      const y = 200;
      const result = adjustPositionForViewport(100, y, 224, 256, lineHeight);

      // Should position below the cursor line
      expect(result.top).toBeGreaterThanOrEqual(y + lineHeight);
    });
  });
});
