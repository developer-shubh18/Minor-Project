const axios = require('axios');

// Using the free, keyless Google Translate API (client=gtx)
// This is very stable for testing and provides both translation and detection.
const GOOGLE_API_URL = 'https://translate.googleapis.com/translate_a/single';

/**
 * Detect language of text
 */
exports.detectLanguage = async (text) => {
  try {
    const response = await axios.get(GOOGLE_API_URL, {
      params: {
        client: 'gtx',
        sl: 'auto',
        tl: 'en', // Target language doesn't matter much for detection
        dt: 't',
        q: text
      }
    });

    // The detected language is usually at index 2 of the response array
    if (response.data && response.data[2]) {
      const detected = response.data[2];
      console.log(`[Detection] Detected language: ${detected} for text: "${text.substring(0, 20)}..."`);
      return detected;
    }
    return 'en';
  } catch (err) {
    console.error('Language detection error:', err.message);
    return 'en';
  }
};

/**
 * Translate text to target language
 */
exports.translateText = async (text, targetLanguage, sourceLanguage = 'auto') => {
  try {
    const response = await axios.get(GOOGLE_API_URL, {
      params: {
        client: 'gtx',
        sl: sourceLanguage || 'auto',
        tl: targetLanguage,
        dt: 't',
        q: text
      }
    });

    // The translated text is the first element of the first element's nested array
    // Structure: [[[translated, original, ...]]]
    if (response.data && response.data[0] && response.data[0][0]) {
      const translated = response.data[0].map(item => item[0]).join('');
      return translated;
    }
    return text;
  } catch (err) {
    console.error('Translation error:', err.message);
    return text; // Return original if translation fails
  }
};

/**
 * Translate a message for multiple target languages
 */
exports.translateForRecipients = async (text, sourceLanguage, targetLanguages) => {
  const uniqueLangs = [...new Set(targetLanguages)].filter(lang => lang !== sourceLanguage);
  
  if (uniqueLangs.length === 0) return [];

  const translations = [];

  // Run translations in parallel
  const results = await Promise.allSettled(
    uniqueLangs.map(async (lang) => {
      const translated = await exports.translateText(text, lang, sourceLanguage);
      return { language: lang, text: translated };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      translations.push(result.value);
    }
  }

  return translations;
};

/**
 * Get supported languages (for UI dropdown)
 */
exports.getSupportedLanguages = async () => {
  // Common languages supported by Google Translate
  return [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'hi', name: 'Hindi' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'ko', name: 'Korean' },
    { code: 'tr', name: 'Turkish' },
    { code: 'vi', name: 'Vietnamese' }
  ];
};
