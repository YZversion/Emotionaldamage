const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const mode = process.argv[3];
const commit = process.argv[4];
const analyzedFiles = Number(process.argv[5]);
const analysisDir = path.join(root, '.understand-anything');

if (mode === 'graph') {
  fs.copyFileSync(
    path.join(analysisDir, 'intermediate', 'assembled-graph.json'),
    path.join(analysisDir, 'knowledge-graph.json'),
  );
} else if (mode === 'meta') {
  fs.writeFileSync(path.join(analysisDir, 'meta.json'), JSON.stringify({
    lastAnalyzedAt: new Date().toISOString(),
    gitCommitHash: commit,
    version: '1.0.0',
    analyzedFiles,
  }, null, 2));
} else {
  throw new Error(`Unknown save mode: ${mode}`);
}
