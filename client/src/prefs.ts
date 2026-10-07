export const SEEN_RULES_KEY = 'al:seen-rules';

export function hasSeenRules(): boolean {
  try { return localStorage.getItem(SEEN_RULES_KEY) === '1'; } catch (e) { console.warn('al:seen-rules unreadable', e); return false; }
}

export function markRulesSeen() {
  try { localStorage.setItem(SEEN_RULES_KEY, '1'); } catch (e) { console.warn('al:seen-rules not saved', e); }
}
