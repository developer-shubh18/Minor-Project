const axios = require('axios');

const LIBRE_TRANSLATE_URL = process.env.LIBRE_TRANSLATE_URL || 'https://libretranslate.de';

// Detect language of text
exports.detectLanguage = async (text) => {
  try {
    const response = await axios.post(`${LIBRE_TRANSLATE_URL}/detect`, {
      q: text
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    // Response is an array of detections sorted by confidence
    if (response.data && response.data.length > 0) {
      return response.data[0].language;
    }
    return 'en';
  } catch (err) {
    console.error('Language detection error:', err.message);
    return 'en';
  }
};

// Translate text to target language
exports.translateText = async (text, targetLanguage, sourceLanguage = null) => {
  try {
    const payload = {
      q: text,
      source: sourceLanguage || 'auto',
      target: targetLanguage,
      format: 'text'
    };

    const response = await axios.post(`${LIBRE_TRANSLATE_URL}/translate`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data.translatedText;
  } catch (err) {
    console.error('Translation error:', err.message);
    return text; // Return original if translation fails
  }
};

// Translate a message for multiple target languages
exports.translateForRecipients = async (text, sourceLanguage, targetLanguages) => {
  const uniqueLangs = [...new Set(targetLanguages)].filter(lang => lang !== sourceLanguage);
  const translations = [];

  // Run translations in parallel for better performance
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

// Get supported languages from LibreTranslate
exports.getSupportedLanguages = async () => {
  try {
    const response = await axios.get(`${LIBRE_TRANSLATE_URL}/languages`);
    return response.data; // Array of { code, name }
  } catch (err) {
    console.error('Error fetching supported languages:', err.message);
    return [];
  }
};
