import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/extract-hybridizer-data.mjs <hybridizer.html> <output.json>');
}

const source = fs.readFileSync(inputPath, 'utf8');

function readConstant(name, from = 0) {
  const pattern = new RegExp(`const\\s+${name}\\s*=`, 'g');
  pattern.lastIndex = from;
  const match = pattern.exec(source);
  if (!match) throw new Error(`Could not find ${name}`);
  const start = match.index + match[0].length;
  const end = source.indexOf(';', start);
  return JSON.parse(source.slice(start, end));
}

const latents = readConstant('LATENTS', 4_000_000);
const umap = readConstant('UMAP', 40_000_000);
const weights = readConstant('W', 47_000_000);
const chairIndices = readConstant('CHAIR_IDX', 130_000_000);
const tableIndices = readConstant('TABLE_IDX', 130_000_000);

function farthestSamples(indices, count) {
  const chosen = [indices[0]];
  const best = new Float64Array(indices.length).fill(Number.POSITIVE_INFINITY);
  while (chosen.length < count) {
    const last = umap[chosen.at(-1)];
    let next = indices[0];
    let nextDistance = -1;
    for (let i = 0; i < indices.length; i++) {
      const point = umap[indices[i]];
      const distance = (point[0] - last[0]) ** 2 + (point[1] - last[1]) ** 2;
      if (distance < best[i]) best[i] = distance;
      if (best[i] > nextDistance) {
        nextDistance = best[i];
        next = indices[i];
      }
    }
    chosen.push(next);
  }
  return chosen;
}

function dense(layer, input, relu = true) {
  const output = new Float32Array(layer.b.length);
  for (let rowIndex = 0; rowIndex < layer.b.length; rowIndex++) {
    const row = layer.w[rowIndex];
    let value = layer.b[rowIndex];
    for (let column = 0; column < input.length; column++) value += row[column] * input[column];
    output[rowIndex] = relu && value < 0 ? 0 : value;
  }
  return output;
}

function decode(latent) {
  let values = dense(weights.l0, latent);
  values = dense(weights.l2, values);
  values = dense(weights.l4, values);
  values = dense(weights.l6, values, false);
  const points = [];
  for (let i = 0; i < values.length; i += 3) {
    points.push(+values[i].toFixed(4), +values[i + 1].toFixed(4), +values[i + 2].toFixed(4));
  }
  return points;
}

const exemplars = farthestSamples(chairIndices, 28).map((sourceIndex, designIndex) => ({
  designIndex,
  sourceIndex,
  position: umap[sourceIndex].map(value => +value.toFixed(4)),
  points: decode(latents[sourceIndex]),
}));

const category = new Uint8Array(umap.length);
for (const index of tableIndices) category[index] = 1;

const payload = {
  source: 'ShapeNet Hybridizer supplied by the study author',
  dimensions: 128,
  pointCount: 1024,
  map: umap.map((point, index) => [+point[0].toFixed(4), +point[1].toFixed(4), category[index]]),
  exemplars,
};

fs.writeFileSync(outputPath, JSON.stringify(payload));
console.log(`Wrote ${outputPath}: ${(fs.statSync(outputPath).size / 1_048_576).toFixed(2)} MiB`);
console.log(`Map points: ${payload.map.length}; decoded exemplars: ${payload.exemplars.length}`);
