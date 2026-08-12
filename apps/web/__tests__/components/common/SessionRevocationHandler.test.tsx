/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, act } from '@testing-library/react';

const mockLogout = jest.fn();
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ logout: mockLogout }) },
}));

import { SessionRevocationHandler } from '@/components/common/SessionRevocationHandler';

describe('SessionRevocationHandler', () => {
  beforeEach(() => {
    mockLogout.mockClear();
  });

  it('signs the user out when the server revokes their session', () => {
    render(<SessionRevocationHandler />);

    act(() => {
      window.dispatchEvent(new CustomEvent('meeshy:session-revoked'));
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('does not sign anyone out before the event fires', () => {
    render(<SessionRevocationHandler />);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted, so a remount cannot log out twice', () => {
    const { unmount } = render(<SessionRevocationHandler />);
    unmount();

    act(() => {
      window.dispatchEvent(new CustomEvent('meeshy:session-revoked'));
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<SessionRevocationHandler />);
    expect(container).toBeEmptyDOMElement();
  });
});
