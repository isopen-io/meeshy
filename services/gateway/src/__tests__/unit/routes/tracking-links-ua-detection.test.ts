/**
 * UA detection helpers — tracking-link click analytics
 *
 * `detectBrowser` / `detectOS` / `detectDevice` (routes/tracking-links/types.ts)
 * classify the User-Agent persisted on every tracking-link click (both the
 * `GET /l/:token` redirect path and the manual `POST .../click` path in
 * tracking.ts), which `TrackingLinkService.getTrackingLinkStats` then aggregates
 * into `clicksByBrowser` / `clicksByOS` / `clicksByDevice`.
 *
 * Class of bug (regression guard): a more-specific platform token is swallowed
 * by a less-specific token tested earlier in the chain —
 *   - every Android UA carries `Linux`  → Android was read as `Linux`
 *   - every iPhone/iPad UA carries `Mac OS X` → iOS was read as `macOS`
 *   - Chromium-based Opera carries `Chrome` → Opera was read as `Chrome`
 *   - iPad Safari carries `Mobile/15E148` → iPad was read as `mobile`
 * Each assertion below fails on the pre-fix ordering.
 */

import { describe, it, expect } from '@jest/globals';
import { detectBrowser, detectOS, detectDevice } from '../../../routes/tracking-links/types';

// Real-world User-Agent strings (as sent by production clients).
const UA = {
  androidPhone:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  iPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  iPad:
    'Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
  macDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  linuxDesktop:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  windowsDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  operaDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 OPR/90.0.4480.54',
  edgeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  firefoxDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  safariDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
} as const;

describe('detectOS', () => {
  it('classifies an Android phone as Android, not Linux (regression: Linux token swallows Android)', () => {
    expect(detectOS(UA.androidPhone)).toBe('Android');
  });

  it('classifies an iPhone as iOS, not macOS (regression: "like Mac OS X" swallows iOS)', () => {
    expect(detectOS(UA.iPhone)).toBe('iOS');
  });

  it('classifies an iPad as iOS', () => {
    expect(detectOS(UA.iPad)).toBe('iOS');
  });

  it('still classifies a genuine macOS desktop as macOS', () => {
    expect(detectOS(UA.macDesktop)).toBe('macOS');
  });

  it('still classifies a genuine Linux desktop as Linux', () => {
    expect(detectOS(UA.linuxDesktop)).toBe('Linux');
  });

  it('still classifies Windows', () => {
    expect(detectOS(UA.windowsDesktop)).toBe('Windows');
  });

  it('returns Unknown for an empty UA', () => {
    expect(detectOS('')).toBe('Unknown');
  });
});

describe('detectBrowser', () => {
  it('classifies Chromium-based Opera as Opera, not Chrome (regression: Chrome token swallows Opera)', () => {
    expect(detectBrowser(UA.operaDesktop)).toBe('Opera');
  });

  it('classifies Edge as Edge', () => {
    expect(detectBrowser(UA.edgeDesktop)).toBe('Edge');
  });

  it('still classifies plain Chrome as Chrome', () => {
    expect(detectBrowser(UA.windowsDesktop)).toBe('Chrome');
  });

  it('still classifies Firefox as Firefox', () => {
    expect(detectBrowser(UA.firefoxDesktop)).toBe('Firefox');
  });

  it('still classifies Safari as Safari', () => {
    expect(detectBrowser(UA.safariDesktop)).toBe('Safari');
  });

  it('returns Unknown for an empty UA', () => {
    expect(detectBrowser('')).toBe('Unknown');
  });
});

describe('detectDevice', () => {
  it('classifies an iPad as tablet, not mobile (regression: "Mobile" token swallows iPad)', () => {
    expect(detectDevice(UA.iPad)).toBe('tablet');
  });

  it('classifies an Android tablet (no "Mobile" token) as tablet', () => {
    expect(detectDevice(UA.androidTablet)).toBe('tablet');
  });

  it('classifies an Android phone as mobile', () => {
    expect(detectDevice(UA.androidPhone)).toBe('mobile');
  });

  it('classifies an iPhone as mobile', () => {
    expect(detectDevice(UA.iPhone)).toBe('mobile');
  });

  it('classifies a desktop as desktop', () => {
    expect(detectDevice(UA.windowsDesktop)).toBe('desktop');
  });

  it('returns Unknown for an empty UA', () => {
    expect(detectDevice('')).toBe('Unknown');
  });
});
