import fs from 'node:fs';

const [graphPath, layersPath, outputPath] = process.argv.slice(2);

if (!graphPath || !layersPath || !outputPath) {
  console.error('Usage: node ua-tour-prepare.js <graph> <layers> <output>');
  process.exit(1);
}

try {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const layers = JSON.parse(fs.readFileSync(layersPath, 'utf8'));
  const fileLevelNodes = graph.nodes.filter((node) => node.type !== 'function');

  fs.writeFileSync(
    outputPath,
    JSON.stringify({ nodes: fileLevelNodes, edges: graph.edges, layers }, null, 2) + '\n',
    'utf8',
  );
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
