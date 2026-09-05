const { loadModel, moderateMessage, getViolationMessage } = require('../services/contentModerationService');

describe('Content Moderation AI Service Unit Tests', () => {
  beforeAll(async () => {
    // Attempt model load
    await loadModel();
  }, 15000);

  it('should classify polite / benign text as clean', async () => {
    const result = await moderateMessage('Hello, how are you doing today?');
    expect(result).toBeDefined();
    expect(result.action).toBe('clean');
    expect(result.label).toBe('clean');
  });

  it('should return null violation message for clean content', () => {
    const violation = getViolationMessage({ action: 'clean', label: 'clean' });
    expect(violation).toBeNull();
  });

  it('should return descriptive violation message for flagged categories', () => {
    const threatViolation = getViolationMessage({ action: 'blocked', label: 'threat' });
    expect(threatViolation).toContain('threats or violent language');
    expect(threatViolation).toContain('blocked');

    const warningViolation = getViolationMessage({ action: 'warned', label: 'hate_cultural' });
    expect(warningViolation).toContain('culturally insensitive or hateful content');
    expect(warningViolation).toContain('Warning');
  });
});
