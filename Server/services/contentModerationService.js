/**
 * Content Moderation AI Service
 * ==============================
 * Lightweight wrapper around a trained TensorFlow.js model.
 * 
 * Categories:
 *   0 = clean    — normal conversation
 *   1 = sexual   — sexual / explicit content
 *   2 = hate_cultural — hate speech / cultural insensitivity
 *   3 = threat   — threats / violent language
 * 
 * Usage:
 *   const { moderateMessage, loadModel } = require('./contentModerationService');
 *   await loadModel();                          // once at startup
 *   const result = await moderateMessage(text); // per message
 */

const tf = require('@tensorflow/tfjs');
const path = require('path');
const fs = require('fs');
const { translateText } = require('./translationService');

const MODEL_DIR = path.join(__dirname, '..', 'ai-model', 'trained-model');
const BLOCK_THRESHOLD = 0.65;
const WARN_THRESHOLD = 0.40;

let model = null;
let config = null;

// ---- Load Model ----
async function loadModel() {
  try {
    const modelJsonPath = path.join(MODEL_DIR, 'model.json');
    const configPath = path.join(MODEL_DIR, 'config.json');

    if (!fs.existsSync(modelJsonPath)) {
      console.warn('⚠️  [Moderation] No trained model found. Run: node ai-model/train.js');
      return false;
    }

    // Load model.json and weight files (works with both JS and Python exports)
    const modelJSON = JSON.parse(fs.readFileSync(modelJsonPath, 'utf-8'));

    // Read all weight shard files listed in the manifest
    const weightPaths = modelJSON.weightsManifest[0].paths;
    const weightBuffers = weightPaths.map(p => fs.readFileSync(path.join(MODEL_DIR, p)));
    const totalBytes = weightBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combinedBuffer = new ArrayBuffer(totalBytes);
    const combinedView = new Uint8Array(combinedBuffer);
    let offset = 0;
    for (const buf of weightBuffers) {
      combinedView.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
      offset += buf.byteLength;
    }

    const handler = tf.io.fromMemory({
      modelTopology: modelJSON.modelTopology,
      weightSpecs: modelJSON.weightsManifest[0].weights,
      weightData: combinedBuffer,
    });

    model = await tf.loadLayersModel(handler);
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    console.log('✅ [Moderation] AI model loaded successfully');
    console.log(`   Labels: ${config.labels.join(', ')} | Vocab: ${config.vocabSize} words`);
    return true;
  } catch (err) {
    console.error('❌ [Moderation] Failed to load model:', err.message);
    return false;
  }
}

// ---- Encode (must match training) ----
function encodeText(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);
  const encoded = words.map(w => config.vocab[w] || 1);
  if (encoded.length >= config.maxSeqLength) return encoded.slice(0, config.maxSeqLength);
  return [...encoded, ...new Array(config.maxSeqLength - encoded.length).fill(0)];
}

// Helper to run tensor prediction
async function predictText(textToPredict) {
  const input = tf.tensor2d([encodeText(textToPredict)], [1, config.maxSeqLength], 'int32');
  const prediction = model.predict(input);
  const probs = await prediction.data();
  input.dispose();
  prediction.dispose();

  const scores = {};
  config.labels.forEach((l, i) => { scores[l] = Math.round(probs[i] * 1000) / 1000; });

  const maxIdx = probs.indexOf(Math.max(...probs));
  const label = config.labels[maxIdx];
  const confidence = probs[maxIdx];

  let action = 'clean';
  if (label !== 'clean') {
    if (confidence >= BLOCK_THRESHOLD) action = 'blocked';
    else if (confidence >= WARN_THRESHOLD) action = 'warned';
  }

  return { action, label, confidence: Math.round(confidence * 100) / 100, scores };
}

// ---- Moderate ----
async function moderateMessage(text) {
  if (!model || !config || !text || !text.trim()) {
    return { action: 'clean', label: 'clean', confidence: 0, scores: {} };
  }

  const start = Date.now();
  let primaryResult = await predictText(text);

  // If text has non-ASCII characters (e.g. Hindi, Arabic, Chinese, emojis, accented Latin),
  // translate to English pre-moderation to eliminate the language bypass gap.
  const isNonAscii = /[^\x00-\x7F]/.test(text);
  if (isNonAscii) {
    try {
      const translatedEnglish = await translateText(text, 'en', 'auto');
      if (translatedEnglish && translatedEnglish.toLowerCase() !== text.toLowerCase()) {
        const translatedResult = await predictText(translatedEnglish);
        // If translated result is higher severity or higher confidence, prioritize it
        const severityOrder = { blocked: 3, warned: 2, clean: 1 };
        if (
          severityOrder[translatedResult.action] > severityOrder[primaryResult.action] ||
          (severityOrder[translatedResult.action] === severityOrder[primaryResult.action] &&
            translatedResult.confidence > primaryResult.confidence)
        ) {
          primaryResult = translatedResult;
        }
      }
    } catch (err) {
      console.error('[Moderation.preTranslate] Translation error:', err.message);
    }
  }

  return {
    ...primaryResult,
    processingTimeMs: Date.now() - start
  };
}

// ---- Violation Message ----
function getViolationMessage(result) {
  if (result.action === 'clean') return null;
  const reasons = {
    sexual: 'sexual or explicit content',
    hate_cultural: 'culturally insensitive or hateful content',
    threat: 'threats or violent language'
  };
  const reason = reasons[result.label] || 'inappropriate content';
  if (result.action === 'blocked') {
    return `⛔ Message blocked: Contains ${reason}. Please keep conversations respectful.`;
  }
  return `⚠️ Warning: May contain ${reason}. Please be mindful of your language.`;
}

module.exports = { loadModel, moderateMessage, getViolationMessage };
