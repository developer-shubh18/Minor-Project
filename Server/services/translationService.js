const { Translate } = require('@google-cloud/translate').v2;

const translate = new Translate({ key: process.env.GOOGLE_TRANSLATE_API_KEY });

// Detect language of text
exports.detectLanguage = async (text) => {
  try {
    const [detection] = await translate.detect(text);
    return detection.language;
  } catch (err) {
    console.error('Language detection errors:', err.message);
    return 'en';
  }
};

// Translate text to target language
exports.translateText = async (text, targetLanguage, sourceLanguage = null) => {
  try {
    const options = { to: targetLanguage };
    if (sourceLanguage) options.from = sourceLanguage;

    const [translation] = await translate.translate(text, options);
    return translation;
  } catch (err) {
    console.error('Translation error:', err.message);
    return text; // Return original if translation fails
  }
};

// Translate a message for multiple target languages
exports.translateForRecipients = async (text, sourceLanguage, targetLanguages) => {
  const uniqueLangs = [...new Set(targetLanguages)].filter(lang => lang !== sourceLanguage);
  const translations = [];

  for (const lang of uniqueLangs) {
    const translated = await exports.translateText(text, lang, sourceLanguage);
    translations.push({ language: lang, text: translated });
  }

  return translations;
};
