/**
 * ============================================
 * Content Moderation AI — Training Script
 * ============================================
 * 
 * Trains a TensorFlow.js CNN text classifier.
 * 
 * Categories:  0=clean, 1=sexual, 2=hate_cultural, 3=threat
 * 
 * SUPPORTS MULTIPLE DATA SOURCES:
 *   1. JSON  →  { "data": [{ "text": "...", "label": "..." }] }
 *   2. CSV   →  text,label  (header row required)
 *   3. TXT   →  label<TAB>text  (one per line)
 * 
 * HOW TO ADD DATA:
 *   Option 1: Drop files into ai-model/training-data/
 *   Option 2: Pass a URL directly:
 *     node ai-model/train.js --url https://example.com/dataset.csv
 *     node ai-model/train.js --url https://raw.githubusercontent.com/user/repo/data.json
 *     node ai-model/train.js --url https://kaggle.com/.../download  (direct download link)
 * 
 *   You can pass multiple URLs:
 *     node ai-model/train.js --url URL1 --url URL2
 * 
 * Run:    node ai-model/train.js
 * Output: ai-model/trained-model/
 * ============================================
 */

const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ---- Config ----
const VOCAB_SIZE = 2000;
const MAX_SEQ_LENGTH = 30;
const EMBEDDING_DIM = 32;
const EPOCHS = 25;
const BATCH_SIZE = 32;
const DATA_DIR = path.join(__dirname, 'training-data');
const MODEL_DIR = path.join(__dirname, 'trained-model');
const LABELS = ['clean', 'sexual', 'hate_cultural', 'threat'];

// ============================================================
// ARGUMENT PARSING
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { urls: [], hfDatasets: [], limit: 500 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) { result.urls.push(args[++i]); }
    else if (args[i] === '--hf' && args[i + 1]) { result.hfDatasets.push(args[++i]); }
    else if (args[i] === '--limit' && args[i + 1]) { result.limit = parseInt(args[++i]); }
  }
  return result;
}

// ============================================================
// URL DOWNLOAD — fetch datasets from direct links
// ============================================================
async function downloadFromURL(url) {
  console.log(`   🌐 Downloading: ${url}`);
  try {
    const response = await axios.get(url, {
      timeout: 60000, maxContentLength: 50 * 1024 * 1024,
      responseType: 'text', headers: { 'User-Agent': 'ContentModerationTrainer/1.0' }
    });

    let ext = path.extname(new URL(url).pathname).toLowerCase();
    if (!ext || !['.json', '.csv', '.txt'].includes(ext)) {
      const content = response.data.trim();
      if (content.startsWith('{') || content.startsWith('[')) ext = '.json';
      else if (content.includes(',') && content.split('\n')[0].toLowerCase().includes('text')) ext = '.csv';
      else ext = '.txt';
    }

    const fileName = `downloaded_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(DATA_DIR, fileName), response.data, 'utf-8');
    console.log(`   ✅ Saved as: ${fileName} (${(response.data.length / 1024).toFixed(1)} KB)\n`);
  } catch (err) {
    console.error(`   ❌ Download failed: ${err.message}\n`);
  }
}

// ============================================================
// HUGGING FACE DATASETS — download via REST API (no Python!)
// ============================================================
// Usage: node ai-model/train.js --hf jjmachan/NSFW-reddit --limit 1000
//
// Supported datasets with auto-mapping:
//   jjmachan/NSFW-reddit        → over_18 field → sexual
//   any dataset with text+label columns → auto-detected
// ============================================================

async function downloadFromHuggingFace(datasetName, limit) {
  console.log(`   🤗 Hugging Face dataset: ${datasetName}`);
  console.log(`      Fetching up to ${limit} rows...\n`);

  const API_BASE = 'https://datasets-server.huggingface.co';
  const allSamples = [];
  const batchSize = 100; // HF API max per request

  try {
    // Fetch in batches
    for (let offset = 0; offset < limit; offset += batchSize) {
      const fetchCount = Math.min(batchSize, limit - offset);
      const url = `${API_BASE}/rows?dataset=${encodeURIComponent(datasetName)}&config=default&split=train&offset=${offset}&length=${fetchCount}`;

      const response = await axios.get(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'ContentModerationTrainer/1.0' }
      });

      const data = response.data;

      if (!data.rows || data.rows.length === 0) break;

      // Auto-detect how to map this dataset's columns
      const rows = data.rows.map(r => r.row);
      const mapped = mapHuggingFaceRows(rows, datasetName);
      allSamples.push(...mapped);

      const progress = Math.min(offset + fetchCount, data.num_rows_total);
      process.stdout.write(`\r      📥 Downloaded: ${progress}/${Math.min(limit, data.num_rows_total)} rows`);

      if (offset + fetchCount >= data.num_rows_total) break;
    }

    console.log('');

    if (allSamples.length === 0) {
      console.log(`   ⚠️  No usable samples found in dataset\n`);
      return;
    }

    // Save as JSON
    const fileName = `hf_${datasetName.replace('/', '_')}_${Date.now()}.json`;
    const fileData = { data: allSamples };
    fs.writeFileSync(path.join(DATA_DIR, fileName), JSON.stringify(fileData, null, 2), 'utf-8');
    console.log(`   ✅ Saved: ${fileName} (${allSamples.length} samples)\n`);

    // Print label distribution
    const counts = {};
    allSamples.forEach(s => { counts[s.label] = (counts[s.label] || 0) + 1; });
    for (const [label, count] of Object.entries(counts)) {
      console.log(`      • ${label}: ${count}`);
    }
    console.log('');
  } catch (err) {
    console.error(`   ❌ HuggingFace download failed: ${err.message}\n`);
  }
}

/**
 * Map HuggingFace dataset rows to our { text, label } format.
 * Different datasets have different column structures — this handles auto-mapping.
 */
function mapHuggingFaceRows(rows, datasetName) {
  const mapped = [];

  for (const row of rows) {
    let text = null;
    let label = null;

    // --- jjmachan/NSFW-reddit: has "title", "over_18", "subreddit" ---
    if (row.title !== undefined && row.over_18 !== undefined) {
      text = row.title;
      label = row.over_18 ? 'sexual' : 'clean';
    }
    // --- Datasets with "text" + "label" columns ---
    else if (row.text && row.label !== undefined) {
      text = row.text;
      // Handle numeric labels (0=clean, 1=toxic, etc.)
      if (typeof row.label === 'number') {
        label = row.label === 0 ? 'clean' : 'hate_cultural';
      } else {
        label = String(row.label).toLowerCase();
      }
    }
    // --- Datasets with "comment_text" + toxicity columns (Jigsaw-style) ---
    else if (row.comment_text) {
      text = row.comment_text;
      if (row.toxic || row.severe_toxic) label = 'hate_cultural';
      else if (row.threat) label = 'threat';
      else if (row.obscene) label = 'sexual';
      else label = 'clean';
    }
    // --- Datasets with "content" or "message" field ---
    else if (row.content || row.message) {
      text = row.content || row.message;
      label = row.label || row.class || row.category || 'clean';
      if (typeof label !== 'string') label = String(label);
      label = label.toLowerCase();
    }

    // Only keep if we got both text and a valid label
    if (text && label && text.trim().length > 3) {
      // Normalize label to our known labels
      label = normalizeLabel(label);
      if (label) {
        mapped.push({ text: text.trim().substring(0, 300), label });
      }
    }
  }

  return mapped;
}

/**
 * Normalize external labels to our 4 categories
 */
function normalizeLabel(label) {
  const map = {
    // Clean
    'clean': 'clean', 'safe': 'clean', 'normal': 'clean', 'sfw': 'clean',
    'not_offensive': 'clean', 'none': 'clean', 'neutral': 'clean', '0': 'clean',
    // Sexual
    'sexual': 'sexual', 'nsfw': 'sexual', 'porn': 'sexual', 'obscene': 'sexual',
    'sexual_explicit': 'sexual', 'adult': 'sexual', 'xxx': 'sexual',
    // Hate / Cultural
    'hate_cultural': 'hate_cultural', 'hate': 'hate_cultural', 'hate_speech': 'hate_cultural',
    'toxic': 'hate_cultural', 'offensive': 'hate_cultural', 'racism': 'hate_cultural',
    'sexism': 'hate_cultural', 'discrimination': 'hate_cultural', 'insult': 'hate_cultural',
    'identity_hate': 'hate_cultural', 'severe_toxic': 'hate_cultural', '1': 'hate_cultural',
    // Threat
    'threat': 'threat', 'violence': 'threat', 'dangerous': 'threat', 'bully': 'threat',
  };
  return map[label] || null;  // null = skip unknown labels
}

// ============================================================
// DATA LOADING — supports JSON, CSV, TXT
// ============================================================
function loadAllDatasets() {
  const allSamples = [];
  const files = fs.readdirSync(DATA_DIR);

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const ext = path.extname(file).toLowerCase();

    try {
      let samples = [];

      if (ext === '.json') {
        samples = loadJSON(filePath);
      } else if (ext === '.csv') {
        samples = loadCSV(filePath);
      } else if (ext === '.txt') {
        samples = loadTXT(filePath);
      } else {
        continue; // skip unsupported files
      }

      // Validate: only keep samples with known labels
      const valid = samples.filter(s => LABELS.includes(s.label));
      allSamples.push(...valid);
      console.log(`   📄 ${file} → ${valid.length} samples loaded`);

      if (valid.length < samples.length) {
        console.log(`      ⚠️  Skipped ${samples.length - valid.length} samples with unknown labels`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Failed to load ${file}: ${err.message}`);
    }
  }

  return allSamples;
}

/** Load JSON: { "data": [{ "text": "...", "label": "..." }] } */
function loadJSON(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  // Support both { data: [...] } and plain [...] formats
  const items = Array.isArray(raw) ? raw : (raw.data || []);
  return items
    .filter(item => item.text && item.label)
    .map(item => ({ text: String(item.text).trim(), label: String(item.label).trim().toLowerCase() }));
}

/** Load CSV: text,label (first row = header) */
function loadCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect column order from header
  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const textIdx = header.findIndex(h => h === 'text' || h === 'message' || h === 'content' || h === 'comment');
  const labelIdx = header.findIndex(h => h === 'label' || h === 'class' || h === 'category');

  if (textIdx === -1 || labelIdx === -1) {
    console.warn(`      ⚠️  CSV header must contain 'text' and 'label' columns`);
    return [];
  }

  return lines.slice(1).map(line => {
    // Handle quoted CSV fields
    const cols = parseCSVLine(line);
    if (cols.length > Math.max(textIdx, labelIdx)) {
      return { text: cols[textIdx].trim(), label: cols[labelIdx].trim().toLowerCase() };
    }
    return null;
  }).filter(Boolean);
}

/** Parse a single CSV line (handles quoted fields with commas) */
function parseCSVLine(line) {
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { cols.push(current); current = ''; }
    else { current += char; }
  }
  cols.push(current);
  return cols;
}

/** Load TXT: label<TAB>text (one per line) */
function loadTXT(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const tabIdx = line.indexOf('\t');
    if (tabIdx === -1) return null;
    return { label: line.substring(0, tabIdx).trim().toLowerCase(), text: line.substring(tabIdx + 1).trim() };
  }).filter(Boolean);
}

// ============================================================
// TOKENIZER
// ============================================================
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);
}

function buildVocab(samples) {
  const freq = {};
  for (const s of samples) {
    for (const w of tokenize(s.text)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, VOCAB_SIZE - 2);
  const vocab = { '<PAD>': 0, '<UNK>': 1 };
  sorted.forEach(([word], i) => { vocab[word] = i + 2; });
  return vocab;
}

function encodeText(text, vocab) {
  const words = tokenize(text);
  const encoded = words.map(w => vocab[w] || 1);
  if (encoded.length >= MAX_SEQ_LENGTH) return encoded.slice(0, MAX_SEQ_LENGTH);
  return [...encoded, ...new Array(MAX_SEQ_LENGTH - encoded.length).fill(0)];
}

// ============================================================
// MAIN
// ============================================================
async function train() {
  // Step 0: Download from URLs or Hugging Face if provided
  const args = parseArgs();

  if (args.urls.length > 0) {
    console.log('🌐 Downloading datasets from URLs...\n');
    for (const url of args.urls) {
      await downloadFromURL(url);
    }
  }

  if (args.hfDatasets.length > 0) {
    console.log('🤗 Downloading from Hugging Face...\n');
    for (const ds of args.hfDatasets) {
      await downloadFromHuggingFace(ds, args.limit);
    }
  }

  // Load data from all files in training-data/
  console.log('📂 Loading training data from all files...\n');
  const samples = loadAllDatasets();

  if (samples.length === 0) {
    console.error('❌ No training data found! Add files to ai-model/training-data/');
    process.exit(1);
  }

  // Print summary
  const labelCounts = {};
  for (const s of samples) { labelCounts[s.label] = (labelCounts[s.label] || 0) + 1; }
  console.log(`\n   Total samples: ${samples.length}`);
  for (const [label, count] of Object.entries(labelCounts)) {
    console.log(`   • ${label}: ${count}`);
  }

  // Build vocab
  console.log('\n📖 Building vocabulary...');
  const vocab = buildVocab(samples);
  console.log(`   Vocabulary size: ${Object.keys(vocab).length}`);

  // Encode
  console.log('\n🔢 Encoding texts...');
  const shuffled = [...samples].sort(() => Math.random() - 0.5);
  const xData = shuffled.map(s => encodeText(s.text, vocab));
  const yData = shuffled.map(s => LABELS.indexOf(s.label));

  const xTensor = tf.tensor2d(xData, [xData.length, MAX_SEQ_LENGTH], 'int32');
  const yTensor = tf.oneHot(tf.tensor1d(yData, 'int32'), LABELS.length);
  console.log(`   X shape: [${xTensor.shape}]  Y shape: [${yTensor.shape}]`);

  // Build model
  console.log('\n🏗️  Building neural network...');
  const model = tf.sequential();
  model.add(tf.layers.embedding({ inputDim: Object.keys(vocab).length, outputDim: EMBEDDING_DIM, inputLength: MAX_SEQ_LENGTH }));
  model.add(tf.layers.globalAveragePooling1d());
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: LABELS.length, activation: 'softmax' }));
  model.compile({ optimizer: tf.train.adam(0.005), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  model.summary();

  // Train
  console.log('\n🚀 Training started...\n');
  await model.fit(xTensor, yTensor, {
    epochs: EPOCHS, batchSize: BATCH_SIZE, validationSplit: 0.15, shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if ((epoch + 1) % 5 === 0 || epoch === 0) {
          console.log(`   Epoch ${String(epoch + 1).padStart(3)}: loss=${logs.loss.toFixed(4)} | acc=${logs.acc.toFixed(4)} | val_loss=${logs.val_loss.toFixed(4)} | val_acc=${logs.val_acc.toFixed(4)}`);
        }
      }
    }
  });

  // Save model
  console.log('\n💾 Saving model...');
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

  await model.save(tf.io.withSaveHandler(async (artifacts) => {
    const modelJSON = {
      modelTopology: artifacts.modelTopology,
      weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
      format: 'layers-model',
      generatedBy: 'content-moderation-trainer',
    };
    fs.writeFileSync(path.join(MODEL_DIR, 'model.json'), JSON.stringify(modelJSON));
    fs.writeFileSync(path.join(MODEL_DIR, 'weights.bin'), Buffer.from(artifacts.weightData));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));

  // Save config
  fs.writeFileSync(path.join(MODEL_DIR, 'config.json'), JSON.stringify({
    vocab, labels: LABELS, maxSeqLength: MAX_SEQ_LENGTH,
    vocabSize: Object.keys(vocab).length, trainingSamples: samples.length,
    createdAt: new Date().toISOString()
  }, null, 2));

  console.log(`   ✅ Model saved to: ${MODEL_DIR}/`);

  // Quick test
  console.log('\n🧪 Test predictions:\n');
  const tests = [
    'hello how are you doing today',
    'send me your nudes right now',
    'all muslims are terrorists',
    'i will kill you and your family',
    'lets grab dinner this weekend',
    'women belong in the kitchen not work',
    'what time is the class tomorrow',
    'you are so hot come to my bed',
  ];
  for (const text of tests) {
    const input = tf.tensor2d([encodeText(text, vocab)], [1, MAX_SEQ_LENGTH], 'int32');
    const probs = await model.predict(input).data();
    const maxIdx = probs.indexOf(Math.max(...probs));
    console.log(`   ${maxIdx === 0 ? '✅' : '⛔'} "${text}" → ${LABELS[maxIdx]} (${(probs[maxIdx] * 100).toFixed(1)}%)`);
    input.dispose();
  }

  xTensor.dispose(); yTensor.dispose();
  console.log('\n🎉 Training complete!');
}

train().catch(err => { console.error('❌ Training failed:', err); process.exit(1); });
