const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const commit = process.argv[3];
const intermediate = path.join(root, '.understand-anything', 'intermediate');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(intermediate, name), 'utf8'));

const fragment = readJson('assembled-graph.json');
const scan = readJson('scan-result.json');
const layers = readJson('layers.json');
const tour = readJson('tour.json');

const graph = {
  version: '1.0.0',
  project: {
    name: scan.name,
    languages: scan.languages,
    frameworks: scan.frameworks,
    description: scan.description,
    analyzedAt: new Date().toISOString(),
    gitCommitHash: commit,
  },
  nodes: fragment.nodes,
  edges: fragment.edges,
  layers,
  tour,
};

fs.writeFileSync(path.join(intermediate, 'assembled-graph.json'), JSON.stringify(graph, null, 2));
fs.writeFileSync(path.join(intermediate, 'fingerprint-input.json'), JSON.stringify({
  projectRoot: root,
  sourceFilePaths: scan.files.map((file) => file.path),
  gitCommitHash: commit,
}, null, 2));
