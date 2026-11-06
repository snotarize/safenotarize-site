// SafeNotarize Standard document handoff — RELEASE DISABLED.
// No live API URL or private token is stored in this file.
// Enable only after the Standard private handoff backend has independently
// passed access, document integrity, idempotency, and existing-workflow checks.
window.SN_HANDOFF = Object.freeze({
  enabled: false,
  multidocEnabled: false,
  endpoint: '',
  turnstileSiteKey: '0x4AAAAAAF2zhQ7vo9NKBGsh',
  allowedSiteOrigins: ['https://safenotarize.com', 'https://www.safenotarize.com']
});
