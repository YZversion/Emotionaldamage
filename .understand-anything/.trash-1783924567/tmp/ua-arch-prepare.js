import fs from 'node:fs';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  console.error('Usage: node ua-arch-prepare.js <assembled-graph.json> <ua-arch-input.json>');
  process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const fileLevelTypes = new Set([
  'file', 'config', 'document', 'service', 'pipeline',
  'table', 'schema', 'resource', 'endpoint'
]);
const fileNodes = graph.nodes.filter((node) => fileLevelTypes.has(node.type));
const fileNodeIds = new Set(fileNodes.map((node) => node.id));
const allEdges = graph.edges.filter(
  (edge) => fileNodeIds.has(edge.source) && fileNodeIds.has(edge.target)
);
const importEdges = allEdges.filter((edge) => edge.type === 'imports');

fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ fileNodes, importEdges, allEdges }, null, 2)}\n`,
  'utf8'
);
