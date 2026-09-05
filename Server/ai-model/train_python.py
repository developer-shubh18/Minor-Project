"""
============================================
Content Moderation AI — Python Training Script
============================================

Trains the SAME model architecture as train.js but 10-50x faster
using native TensorFlow. Exports to TensorFlow.js format.

Usage:
  pip install tensorflow tensorflowjs
  python ai-model/train_python.py
  python ai-model/train_python.py --hf jjmachan/NSFW-reddit --limit 1000

The exported model goes to ai-model/trained-model/ and is loaded
by your Node.js server automatically — no changes needed.
============================================
"""

import os
import json
import argparse
import numpy as np

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TF warnings

import tensorflow as tf
from tensorflow import keras

# ---- Paths ----
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'training-data')
MODEL_DIR = os.path.join(SCRIPT_DIR, 'trained-model')

# ---- Config (matches train.js exactly) ----
VOCAB_SIZE = 2000
MAX_SEQ_LENGTH = 30
EMBEDDING_DIM = 64
EPOCHS = 40
BATCH_SIZE = 16
LABELS = ['clean', 'sexual', 'hate_cultural', 'threat']

# ---- Label normalization (matches train.js) ----
LABEL_MAP = {
    'clean': 'clean', 'safe': 'clean', 'normal': 'clean', 'sfw': 'clean',
    'not_offensive': 'clean', 'none': 'clean', 'neutral': 'clean', '0': 'clean',
    'sexual': 'sexual', 'nsfw': 'sexual', 'porn': 'sexual', 'obscene': 'sexual',
    'sexual_explicit': 'sexual', 'adult': 'sexual', 'xxx': 'sexual',
    'hate_cultural': 'hate_cultural', 'hate': 'hate_cultural', 'hate_speech': 'hate_cultural',
    'toxic': 'hate_cultural', 'offensive': 'hate_cultural', 'racism': 'hate_cultural',
    'sexism': 'hate_cultural', 'discrimination': 'hate_cultural', 'insult': 'hate_cultural',
    'identity_hate': 'hate_cultural', 'severe_toxic': 'hate_cultural', '1': 'hate_cultural',
    'threat': 'threat', 'violence': 'threat', 'dangerous': 'threat', 'bully': 'threat',
}


def tokenize(text):
    """Tokenize text (must match Node.js tokenizer exactly)"""
    import re
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    return [w for w in text.split() if len(w) > 0]


# ============================================================
# DATA LOADING
# ============================================================

def load_json_file(filepath):
    with open(filepath, 'r') as f:
        raw = json.load(f)
    items = raw if isinstance(raw, list) else raw.get('data', [])
    return [{'text': str(item['text']).strip(), 'label': str(item['label']).strip().lower()}
            for item in items if item.get('text') and item.get('label')]


def load_csv_file(filepath):
    import csv
    samples = []
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row.get('text') or row.get('message') or row.get('content') or row.get('comment')
            label = row.get('label') or row.get('class') or row.get('category')
            if text and label:
                samples.append({'text': text.strip(), 'label': label.strip().lower()})
    return samples


def load_txt_file(filepath):
    samples = []
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if '\t' in line:
                label, text = line.split('\t', 1)
                samples.append({'text': text.strip(), 'label': label.strip().lower()})
    return samples


def load_all_datasets():
    """Load all files from training-data/ directory"""
    all_samples = []
    for filename in os.listdir(DATA_DIR):
        filepath = os.path.join(DATA_DIR, filename)
        ext = os.path.splitext(filename)[1].lower()
        try:
            if ext == '.json':
                samples = load_json_file(filepath)
            elif ext == '.csv':
                samples = load_csv_file(filepath)
            elif ext == '.txt':
                samples = load_txt_file(filepath)
            else:
                continue

            # Normalize labels and filter
            valid = []
            for s in samples:
                normalized = LABEL_MAP.get(s['label'])
                if normalized:
                    valid.append({'text': s['text'], 'label': normalized})

            all_samples.extend(valid)
            print(f"   📄 {filename} → {len(valid)} samples")
            if len(valid) < len(samples):
                print(f"      ⚠️  Skipped {len(samples) - len(valid)} with unknown labels")
        except Exception as e:
            print(f"   ⚠️  Failed to load {filename}: {e}")

    return all_samples


# ============================================================
# HUGGING FACE DOWNLOAD
# ============================================================

def download_huggingface(dataset_name, limit=500):
    """Download from HuggingFace API (same as train.js)"""
    import urllib.request
    import urllib.parse

    print(f"   🤗 Hugging Face: {dataset_name}")
    print(f"      Fetching up to {limit} rows...\n")

    API_BASE = 'https://datasets-server.huggingface.co'
    all_samples = []
    batch_size = 100

    for offset in range(0, limit, batch_size):
        fetch_count = min(batch_size, limit - offset)
        url = f"{API_BASE}/rows?dataset={urllib.parse.quote(dataset_name)}&config=default&split=train&offset={offset}&length={fetch_count}"

        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ContentModerationTrainer/1.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
        except Exception as e:
            print(f"\n   ❌ Download failed at offset {offset}: {e}")
            break

        if not data.get('rows'):
            break

        for row_obj in data['rows']:
            row = row_obj['row']
            text, label = None, None

            # NSFW-reddit: title + over_18
            if 'title' in row and 'over_18' in row:
                text = row['title']
                label = 'sexual' if row['over_18'] else 'clean'
            # Standard text+label
            elif 'text' in row and 'label' in row:
                text = row['text']
                label = 'clean' if row['label'] == 0 else 'hate_cultural' if isinstance(row['label'], int) else str(row['label']).lower()
            # Jigsaw-style
            elif 'comment_text' in row:
                text = row['comment_text']
                if row.get('toxic') or row.get('severe_toxic'): label = 'hate_cultural'
                elif row.get('threat'): label = 'threat'
                elif row.get('obscene'): label = 'sexual'
                else: label = 'clean'

            if text and label and len(text.strip()) > 3:
                normalized = LABEL_MAP.get(label)
                if normalized:
                    all_samples.append({'text': text.strip()[:300], 'label': normalized})

        total = min(limit, data.get('num_rows_total', limit))
        print(f"\r      📥 Downloaded: {min(offset + fetch_count, total)}/{total} rows", end='', flush=True)

        if offset + fetch_count >= data.get('num_rows_total', 0):
            break

    print()

    if all_samples:
        filename = f"hf_{dataset_name.replace('/', '_')}_{int(__import__('time').time())}.json"
        filepath = os.path.join(DATA_DIR, filename)
        with open(filepath, 'w') as f:
            json.dump({'data': all_samples}, f, indent=2)
        print(f"   ✅ Saved: {filename} ({len(all_samples)} samples)\n")

        # Print distribution
        from collections import Counter
        counts = Counter(s['label'] for s in all_samples)
        for label, count in counts.items():
            print(f"      • {label}: {count}")
        print()

    return all_samples


# ============================================================
# MANUAL TF.JS EXPORT (no tensorflowjs pip package needed)
# ============================================================

# Maps Keras dtype strings to TF.js dtype strings
DTYPE_MAP = {
    'float32': 'float32', 'float64': 'float32',
    'int32': 'int32', 'int64': 'int32',
    'bool': 'bool',
}

def export_model_to_tfjs(model, output_dir):
    """Export Keras model to TensorFlow.js layers format (model.json + weights.bin)"""

    # Build weight specs and binary data
    weight_specs = []
    weight_data = bytearray()

    # TF.js expects weight names like: layer_name/variable_name
    # Keras 3 gives names like: embedding/embeddings:0 or dense/kernel:0
    for layer in model.layers:
        for weight in layer.weights:
            # Extract variable name (kernel, bias, embeddings)
            orig_name = weight.name
            var_name = orig_name.split('/')[-1].replace(':0', '')

            tfjs_name = f"{layer.name}/{var_name}"
            w_array = weight.numpy().astype(np.float32)
            w_shape = list(w_array.shape)

            weight_specs.append({
                'name': tfjs_name,
                'shape': w_shape,
                'dtype': 'float32',
            })
            weight_data.extend(w_array.tobytes())

    # Write weights binary
    weights_path = os.path.join(output_dir, 'weights.bin')
    with open(weights_path, 'wb') as f:
        f.write(bytes(weight_data))

    # Build TF.js-compatible model topology manually
    # (Keras 3 format is not compatible with tfjs, so we construct it by hand)
    tfjs_layers = []
    for i, layer in enumerate(model.layers):
        lconfig = layer.get_config()
        class_name = layer.__class__.__name__

        tfjs_layer = {'class_name': class_name, 'config': {}}

        if class_name == 'InputLayer':
            continue  # Skip — we add batch_input_shape to embedding instead

        elif class_name == 'Embedding':
            tfjs_layer['config'] = {
                'name': lconfig['name'],
                'trainable': True,
                'batch_input_shape': [None, MAX_SEQ_LENGTH],
                'dtype': 'float32',
                'input_dim': lconfig['input_dim'],
                'output_dim': lconfig['output_dim'],
                'embeddings_initializer': {'class_name': 'RandomUniform', 'config': {'minval': -0.05, 'maxval': 0.05, 'seed': None}},
                'embeddings_regularizer': None,
                'activity_regularizer': None,
                'embeddings_constraint': None,
                'mask_zero': False,
                'input_length': MAX_SEQ_LENGTH,
            }

        elif class_name == 'Conv1D':
            tfjs_layer['config'] = {
                'name': lconfig['name'],
                'trainable': True,
                'dtype': 'float32',
                'filters': lconfig['filters'],
                'kernel_size': list(lconfig['kernel_size']) if isinstance(lconfig['kernel_size'], tuple) else [lconfig['kernel_size']],
                'strides': [1],
                'padding': lconfig.get('padding', 'valid'),
                'data_format': 'channels_last',
                'dilation_rate': [1],
                'groups': 1,
                'activation': lconfig.get('activation', 'linear'),
                'use_bias': lconfig.get('use_bias', True),
                'kernel_initializer': {'class_name': 'GlorotUniform', 'config': {'seed': None}},
                'bias_initializer': {'class_name': 'Zeros', 'config': {}},
                'kernel_regularizer': None,
                'bias_regularizer': None,
                'activity_regularizer': None,
                'kernel_constraint': None,
                'bias_constraint': None,
            }

        elif class_name == 'GlobalMaxPooling1D':
            tfjs_layer['config'] = {
                'name': lconfig['name'],
                'trainable': True,
                'dtype': 'float32',
                'data_format': 'channels_last',
                'keepdims': False,
            }

        elif class_name == 'Dense':
            tfjs_layer['config'] = {
                'name': lconfig['name'],
                'trainable': True,
                'dtype': 'float32',
                'units': lconfig['units'],
                'activation': lconfig.get('activation', 'linear'),
                'use_bias': lconfig.get('use_bias', True),
                'kernel_initializer': {'class_name': 'GlorotUniform', 'config': {'seed': None}},
                'bias_initializer': {'class_name': 'Zeros', 'config': {}},
                'kernel_regularizer': None,
                'bias_regularizer': None,
                'activity_regularizer': None,
                'kernel_constraint': None,
                'bias_constraint': None,
            }

        elif class_name == 'Dropout':
            tfjs_layer['config'] = {
                'name': lconfig['name'],
                'trainable': True,
                'dtype': 'float32',
                'rate': lconfig['rate'],
                'noise_shape': None,
                'seed': None,
            }

        else:
            # Fallback: pass config as-is
            tfjs_layer['config'] = {k: v for k, v in lconfig.items()}

        tfjs_layers.append(tfjs_layer)

    model_topology = {
        'class_name': 'Sequential',
        'config': {
            'name': 'sequential',
            'layers': tfjs_layers,
        },
        'keras_version': '2.15.0',
        'backend': 'tensorflow',
    }

    # Build model.json
    model_json = {
        'format': 'layers-model',
        'generatedBy': 'content-moderation-trainer-python',
        'convertedBy': None,
        'modelTopology': model_topology,
        'weightsManifest': [{
            'paths': ['weights.bin'],
            'weights': weight_specs,
        }],
    }

    model_json_path = os.path.join(output_dir, 'model.json')
    with open(model_json_path, 'w') as f:
        json.dump(model_json, f)


# ============================================================
# MAIN TRAINING
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='Train Content Moderation AI')
    parser.add_argument('--hf', action='append', help='HuggingFace dataset name', default=[])
    parser.add_argument('--limit', type=int, default=500, help='Max rows from HF')
    parser.add_argument('--epochs', type=int, default=EPOCHS, help='Training epochs')
    args = parser.parse_args()

    # Step 1: Download HF datasets if specified
    if args.hf:
        print('🤗 Downloading from Hugging Face...\n')
        for ds in args.hf:
            download_huggingface(ds, args.limit)

    # Step 2: Load all data
    print('📂 Loading training data from all files...\n')
    samples = load_all_datasets()

    if not samples:
        print('❌ No training data found!')
        return

    # Summary
    from collections import Counter
    counts = Counter(s['label'] for s in samples)
    print(f"\n   Total samples: {len(samples)}")
    for label, count in counts.items():
        print(f"   • {label}: {count}")

    # Step 3: Build vocabulary
    print('\n📖 Building vocabulary...')
    word_freq = {}
    for s in samples:
        for w in tokenize(s['text']):
            word_freq[w] = word_freq.get(w, 0) + 1

    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:VOCAB_SIZE - 2]
    vocab = {'<PAD>': 0, '<UNK>': 1}
    for i, (word, _) in enumerate(sorted_words):
        vocab[word] = i + 2
    print(f"   Vocabulary size: {len(vocab)}")

    # Step 4: Train/Test Split
    print('\n🔀 Splitting data (85% train, 15% test)...')
    np.random.shuffle(samples)
    split_idx = int(len(samples) * 0.85)
    train_samples = samples[:split_idx]
    test_samples = samples[split_idx:]
    print(f"   Train: {len(train_samples)} samples | Test: {len(test_samples)} samples")

    # Step 5: Encode
    print('\n🔢 Encoding texts...')

    def encode_text(text):
        words = tokenize(text)
        encoded = [vocab.get(w, 1) for w in words]
        if len(encoded) >= MAX_SEQ_LENGTH:
            return encoded[:MAX_SEQ_LENGTH]
        return encoded + [0] * (MAX_SEQ_LENGTH - len(encoded))

    # Encode Train
    x_train = np.array([encode_text(s['text']) for s in train_samples], dtype=np.int32)
    y_train = np.array([LABELS.index(s['label']) for s in train_samples], dtype=np.int32)
    y_train_onehot = keras.utils.to_categorical(y_train, num_classes=len(LABELS))

    # Encode Test
    x_test = np.array([encode_text(s['text']) for s in test_samples], dtype=np.int32)
    y_test = np.array([LABELS.index(s['label']) for s in test_samples], dtype=np.int32)
    y_test_onehot = keras.utils.to_categorical(y_test, num_classes=len(LABELS))

    print(f"   X_train shape: {x_train.shape}  Y_train shape: {y_train_onehot.shape}")

    # Step 6: Build model
    print('\n🏗️  Building neural network...')
    model = keras.Sequential([
        keras.layers.Embedding(len(vocab), EMBEDDING_DIM, input_length=MAX_SEQ_LENGTH),
        keras.layers.Conv1D(128, 3, activation='relu', padding='same'),
        keras.layers.GlobalMaxPooling1D(),
        keras.layers.Dense(64, activation='relu'),
        keras.layers.Dropout(0.3),
        keras.layers.Dense(len(LABELS), activation='softmax'),
    ])
    model.compile(optimizer=keras.optimizers.Adam(0.001),
                  loss='categorical_crossentropy', metrics=['accuracy'])
    model.summary()

    # Step 7: Train
    print('\n🚀 Training started...\n')
    model.fit(x_train, y_train_onehot,
              epochs=args.epochs, batch_size=BATCH_SIZE,
              validation_data=(x_test, y_test_onehot), shuffle=True, verbose=1)

    # Step 8: Evaluate on Test Data
    print('\n📊 Evaluating on Test Data...')
    loss, accuracy = model.evaluate(x_test, y_test_onehot, verbose=0)
    print(f"   Overall Test Accuracy: {accuracy * 100:.2f}%")

    # Detailed per-class accuracy
    predictions = model.predict(x_test, verbose=0)
    pred_labels = np.argmax(predictions, axis=1)

    print("\n   Per-class accuracy:")
    for i, label in enumerate(LABELS):
        mask = (y_test == i)
        if np.sum(mask) > 0:
            correct = np.sum((pred_labels == i) & mask)
            total = np.sum(mask)
            print(f"      • {label}: {correct}/{total} ({correct/total*100:.1f}%)")

    # Step 9: Export to TensorFlow.js format (manual — no tensorflowjs dependency needed)
    print('\n💾 Saving model...')
    os.makedirs(MODEL_DIR, exist_ok=True)

    export_model_to_tfjs(model, MODEL_DIR)
    print(f"   ✅ Model exported to TF.js format")

    # Save config (for Node.js service)
    config = {
        'vocab': vocab,
        'labels': LABELS,
        'maxSeqLength': MAX_SEQ_LENGTH,
        'vocabSize': len(vocab),
        'trainingSamples': len(samples),
        'trainedWith': 'python-tensorflow',
        'createdAt': __import__('datetime').datetime.now().isoformat()
    }
    with open(os.path.join(MODEL_DIR, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)

    print(f"   ✅ Config saved to: {MODEL_DIR}/config.json")

    # Step 8: Quick test
    print('\n🧪 Test predictions:\n')
    tests = [
        'hello how are you doing today',
        'send me your nudes right now',
        'all muslims are terrorists',
        'i will kill you and your family',
        'lets grab dinner this weekend',
        'women belong in the kitchen not work',
        'what time is the class tomorrow',
        'you are so hot come to my bed',
    ]
    for text in tests:
        encoded = np.array([encode_text(text)], dtype=np.int32)
        probs = model.predict(encoded, verbose=0)[0]
        max_idx = np.argmax(probs)
        icon = '✅' if max_idx == 0 else '⛔'
        print(f"   {icon} \"{text}\" → {LABELS[max_idx]} ({probs[max_idx]*100:.1f}%)")

    print('\n🎉 Training complete!')


if __name__ == '__main__':
    main()

