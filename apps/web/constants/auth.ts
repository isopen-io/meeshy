/**
 * Authentication related constants and storage keys
 */

export const AUTH_STORAGE_KEYS = {
  AUTH_TOKEN: 'meeshy_auth_token',
  REFRESH_TOKEN: 'meeshy_refresh_token',
  SESSION_TOKEN: 'meeshy_session_token',
  USER_DATA: 'meeshy_user_data',
  ANONYMOUS_SESSION: 'meeshy_anonymous_session',
  ZUSTAND_AUTH: 'meeshy-auth',
  RECENT_SEARCHES: 'meeshy_recent_searches',
  AFFILIATE_TOKEN: 'meeshy_affiliate_token',
  APP_STATE: 'meeshy-app',
  ANONYMOUS_SESSION_TOKEN: 'anonymous_session_token',
  ANONYMOUS_PARTICIPANT: 'anonymous_participant',
  ANONYMOUS_CURRENT_LINK_ID: 'anonymous_current_link_id',
  ANONYMOUS_CURRENT_SHARE_LINK: 'anonymous_current_share_link',
  ANONYMOUS_JUST_JOINED: 'anonymous_just_joined',
};

export const SESSION_STORAGE_KEYS = {
  TWO_FACTOR_TEMP_TOKEN: 'meeshy_2fa_temp_token',
  TWO_FACTOR_USER_ID: 'meeshy_2fa_user_id',
  TWO_FACTOR_USERNAME: 'meeshy_2fa_username',
};
