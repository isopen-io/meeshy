/**
 * Tests for lib/navigate.ts
 */

import { replaceLocation, assignLocation } from '@/lib/navigate';

const mockReplace = jest.fn();
let mockLoc: { replace: jest.Mock; href: string };

beforeEach(() => {
  mockReplace.mockClear();
  mockLoc = { replace: mockReplace, href: '' };
});

describe('replaceLocation', () => {
  it('calls window.location.replace with the given URL', () => {
    replaceLocation('/login', mockLoc as unknown as Location);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('passes the URL through verbatim', () => {
    replaceLocation('https://example.com/path?q=1', mockLoc as unknown as Location);
    expect(mockReplace).toHaveBeenCalledWith('https://example.com/path?q=1');
  });
});

describe('assignLocation', () => {
  it('sets window.location.href to the given URL', () => {
    assignLocation('/home', mockLoc);
    expect(mockLoc.href).toBe('/home');
  });

  it('passes the URL through verbatim', () => {
    assignLocation('https://example.com', mockLoc);
    expect(mockLoc.href).toBe('https://example.com');
  });
});
