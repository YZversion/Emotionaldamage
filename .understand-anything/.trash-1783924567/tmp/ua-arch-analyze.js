import fs from 'node:fs';
import path from 'node:path';

function fail(error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function commonDirectoryPrefix(paths) {
  if (paths.length === 0) return [];
  const directories = paths.map((filePath) => normalizePath(filePath).split('/').slice(0, -1));
  const shortest = Math.min(...directories.map((segments) => segments.length));
  const prefix = [];
  for (let index = 0; index < shortest; index += 1) {
    const segment = directories[0][index];
    if (!directories.every((segments) => segments[index] === segment)) break;
    prefix.push(segment);
  }
  return prefix;
}

function flatPattern(filePath) {
  const name = path.posix.basename(normalizePath(filePath)).toLowerCase();
  if (/\.(test|spec)\.[^.]+$/.test(name) || /^test_.*\.py$/.test(name) || /_test\.go$/.test(name)) return 'test';
  if (/\.config\./.test(name) || name.endsWith('config.json')) return 'config';
  const extension = path.posix.extname(name).slice(1);
  return extension ? `*.${extension}` : 'other';
}

function groupFor(filePath, commonPrefix, isFlat) {
  const normalized = normalizePath(filePath);
  if (isFlat) return flatPattern(normalized);
  const segments = normalized.split('/');
  const remaining = segments.slice(commonPrefix.length);
  return remaining.length > 1 ? remaining[0] : 'root';
}

const directoryPatterns = [
  [['routes', 'api', 'controllers', 'endpoints', 'handlers', 'controller', 'routers', 'blueprints', 'serializers'], 'api'],
  [['services', 'core', 'lib', 'domain', 'logic', 'internal', 'composables', 'mailers', 'jobs', 'channels', 'signals'], 'service'],
  [['models', 'db', 'data', 'persistence', 'repository', 'entities', 'entity', 'migrations', 'sql', 'database', 'schema'], 'data'],
  [['components', 'views', 'pages', 'ui', 'layouts', 'screens'], 'ui'],
  [['middleware', 'plugins', 'interceptors', 'guards'], 'middleware'],
  [['utils', 'helpers', 'common', 'shared', 'tools', 'pkg', 'templatetags'], 'utility'],
  [['config', 'constants', 'env', 'settings', 'management', 'commands'], 'config'],
  [['__tests__', 'test', 'tests', 'spec', 'specs'], 'test'],
  [['types', 'interfaces', 'schemas', 'contracts', 'dtos', 'dto', 'request', 'response'], 'types'],
  [['hooks'], 'hooks'],
  [['store', 'state', 'reducers', 'actions', 'slices'], 'state'],
  [['assets', 'static', 'public'], 'assets'],
  [['cmd', 'bin'], 'entry'],
  [['docs', 'documentation', 'wiki'], 'documentation'],
  [['deploy', 'deployment', 'infra', 'infrastructure', 'docker', 'k8s', 'kubernetes', 'helm', 'charts', 'terraform', 'tf'], 'infrastructure'],
  [['.github', '.gitlab', '.circleci'], 'ci-cd']
];

function directoryPattern(group) {
  const normalized = group.toLowerCase();
  for (const [names, label] of directoryPatterns) {
    if (names.includes(normalized)) return label;
  }
  return null;
}

function filePattern(filePath) {
  const normalized = normalizePath(filePath);
  const name = path.posix.basename(normalized);
  const lower = name.toLowerCase();
  if (/\.(test|spec)\.[^.]+$/i.test(name) || /^test_.*\.py$/i.test(name) || /_test\.go$/i.test(name) || /test\.(java|cs)$/i.test(name) || /_spec\.(rb)$/i.test(name)) return 'test';
  if (/\.d\.ts$/i.test(name)) return 'types';
  if ((lower === 'index.ts' || lower === 'index.js' || lower === '__init__.py') && normalized.split('/').length > 1) return 'entry';
  if (lower === 'manage.py' || lower === 'config.ru' || lower === 'application.java' || lower === 'program.cs') return 'entry';
  if ((lower === 'main.go' && normalized.startsWith('cmd/')) || ((lower === 'main.rs' || lower === 'lib.rs') && normalized.startsWith('src/'))) return 'entry';
  if (['wsgi.py', 'asgi.py', 'cargo.toml', 'go.mod', 'gemfile', 'pom.xml', 'build.gradle', 'composer.json', 'package.json'].includes(lower)) return 'config';
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower.startsWith('docker-compose.')) return 'infrastructure';
  if (/\.(tf|tfvars)$/i.test(name)) return 'infrastructure';
  if (normalized.startsWith('.github/workflows/') || lower === '.gitlab-ci.yml' || lower === 'jenkinsfile') return 'ci-cd';
  if (/\.sql$/i.test(name)) return 'data';
  if (/\.(graphql|gql|proto)$/i.test(name)) return 'types';
  if (/\.(md|rst)$/i.test(name)) return 'documentation';
  if (lower === 'makefile') return 'infrastructure';
  return null;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedObjectOfArrays(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, [...values].sort()])
  );
}

try {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { fileNodes, importEdges, allEdges } = input;
  if (!Array.isArray(fileNodes) || !Array.isArray(importEdges) || !Array.isArray(allEdges)) {
    throw new Error('Input must contain fileNodes, importEdges, and allEdges arrays');
  }

  const nodeById = new Map(fileNodes.map((node) => [node.id, node]));
  const normalizedPaths = fileNodes.map((node) => normalizePath(node.filePath));
  const prefix = commonDirectoryPrefix(normalizedPaths);
  const isFlat = normalizedPaths.every((filePath) => !filePath.includes('/'));
  const groupByNode = new Map();
  const groups = new Map();
  for (const node of fileNodes) {
    const group = groupFor(node.filePath, prefix, isFlat);
    groupByNode.set(node.id, group);
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(node.id);
  }

  const nodeTypes = new Map();
  for (const node of fileNodes) {
    if (!nodeTypes.has(node.type)) nodeTypes.set(node.type, new Set());
    nodeTypes.get(node.type).add(node.id);
  }

  const fanIn = new Map(fileNodes.map((node) => [node.id, 0]));
  const fanOut = new Map(fileNodes.map((node) => [node.id, 0]));
  const importAdjacency = new Map(fileNodes.map((node) => [node.id, new Set()]));
  const importedBy = new Map(fileNodes.map((node) => [node.id, new Set()]));
  const interGroup = new Map();
  const groupImportsFrom = new Map([...groups.keys()].map((group) => [group, new Set()]));
  const groupImportedBy = new Map([...groups.keys()].map((group) => [group, new Set()]));

  for (const edge of importEdges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    importAdjacency.get(edge.source).add(edge.target);
    importedBy.get(edge.target).add(edge.source);
    increment(fanOut, edge.source);
    increment(fanIn, edge.target);
    const from = groupByNode.get(edge.source);
    const to = groupByNode.get(edge.target);
    increment(interGroup, `${from}\u0000${to}`);
    if (from !== to) {
      groupImportsFrom.get(from).add(to);
      groupImportedBy.get(to).add(from);
    }
  }

  const crossCategory = new Map();
  const nonCodeConnections = [];
  for (const edge of allEdges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;
    increment(crossCategory, `${source.type}\u0000${target.type}\u0000${edge.type}`);
    if (source.type !== 'file' || target.type !== 'file') {
      nonCodeConnections.push({ source: edge.source, target: edge.target, edgeType: edge.type });
    }
  }

  const intraGroupDensity = {};
  for (const group of [...groups.keys()].sort()) {
    let internalEdges = 0;
    let totalEdges = 0;
    for (const edge of importEdges) {
      const from = groupByNode.get(edge.source);
      const to = groupByNode.get(edge.target);
      if (from === group || to === group) totalEdges += 1;
      if (from === group && to === group) internalEdges += 1;
    }
    intraGroupDensity[group] = {
      internalEdges,
      totalEdges,
      density: totalEdges === 0 ? 0 : Number((internalEdges / totalEdges).toFixed(4))
    };
  }

  const patternMatches = {};
  for (const group of [...groups.keys()].sort()) patternMatches[group] = directoryPattern(group);
  const filePatternMatches = Object.fromEntries(
    fileNodes.map((node) => [node.id, filePattern(node.filePath)]).filter(([, match]) => match)
  );

  const infraFiles = fileNodes.filter((node) => ['infrastructure', 'ci-cd'].includes(filePattern(node.filePath))).map((node) => normalizePath(node.filePath));
  const lowerPaths = normalizedPaths.map((filePath) => filePath.toLowerCase());
  const deploymentTopology = {
    hasDockerfile: lowerPaths.some((filePath) => /(^|\/)dockerfile(?:\.|$)/.test(filePath)),
    hasCompose: lowerPaths.some((filePath) => /(^|\/)docker-compose(?:\.|$)/.test(filePath)),
    hasK8s: lowerPaths.some((filePath) => /(^|\/)(k8s|kubernetes|helm|charts)(\/|$)/.test(filePath)),
    hasTerraform: lowerPaths.some((filePath) => /\.(tf|tfvars)$/.test(filePath) || /(^|\/)(terraform|tf)(\/|$)/.test(filePath)),
    hasCI: lowerPaths.some((filePath) => filePath.startsWith('.github/workflows/') || filePath === '.gitlab-ci.yml' || filePath.endsWith('/jenkinsfile') || filePath === 'jenkinsfile'),
    infraFiles: infraFiles.sort()
  };

  const dataPipeline = {
    schemaFiles: fileNodes.filter((node) => ['schema', 'table'].includes(node.type) || /\.(sql|graphql|gql|proto|prisma)$/i.test(node.filePath)).map((node) => normalizePath(node.filePath)).sort(),
    migrationFiles: fileNodes.filter((node) => /(^|\/)migrations?(\/|$)/i.test(normalizePath(node.filePath))).map((node) => normalizePath(node.filePath)).sort(),
    dataModelFiles: fileNodes.filter((node) => /(^|\/)(models?|entities|entity)(\/|$)/i.test(normalizePath(node.filePath)) || node.tags?.some((tag) => ['data-model', 'entity', 'orm'].includes(tag))).map((node) => normalizePath(node.filePath)).sort(),
    apiHandlerFiles: fileNodes.filter((node) => /(^|\/)(routes?|api|controllers?|endpoints?|handlers?)(\/|$)/i.test(normalizePath(node.filePath)) || node.tags?.some((tag) => ['api-handler', 'endpoint'].includes(tag))).map((node) => normalizePath(node.filePath)).sort()
  };

  const documentationNodes = fileNodes.filter((node) => node.type === 'document' || /\.(md|rst)$/i.test(node.filePath));
  const documentedGroups = new Set();
  for (const node of documentationNodes) {
    documentedGroups.add(groupByNode.get(node.id));
    for (const edge of allEdges) {
      if (edge.source === node.id && nodeById.has(edge.target)) documentedGroups.add(groupByNode.get(edge.target));
    }
  }
  const groupNames = [...groups.keys()].sort();
  const docCoverage = {
    groupsWithDocs: documentedGroups.size,
    totalGroups: groupNames.length,
    coverageRatio: groupNames.length === 0 ? 0 : Number((documentedGroups.size / groupNames.length).toFixed(4)),
    undocumentedGroups: groupNames.filter((group) => !documentedGroups.has(group))
  };

  const dependencyDirection = [];
  for (let i = 0; i < groupNames.length; i += 1) {
    for (let j = i + 1; j < groupNames.length; j += 1) {
      const a = groupNames[i];
      const b = groupNames[j];
      const ab = interGroup.get(`${a}\u0000${b}`) || 0;
      const ba = interGroup.get(`${b}\u0000${a}`) || 0;
      if (ab > ba) dependencyDirection.push({ dependent: a, dependsOn: b });
      if (ba > ab) dependencyDirection.push({ dependent: b, dependsOn: a });
    }
  }

  const output = {
    scriptCompleted: true,
    commonPathPrefix: prefix.length ? `${prefix.join('/')}/` : '',
    directoryGroups: sortedObjectOfArrays(groups),
    nodeTypeGroups: sortedObjectOfArrays(nodeTypes),
    importAdjacency: Object.fromEntries([...importAdjacency.entries()].map(([id, targets]) => [id, [...targets].sort()])),
    importedBy: Object.fromEntries([...importedBy.entries()].map(([id, sources]) => [id, [...sources].sort()])),
    groupImportsFrom: sortedObjectOfArrays(groupImportsFrom),
    groupImportedBy: sortedObjectOfArrays(groupImportedBy),
    crossCategoryEdges: [...crossCategory.entries()].map(([key, count]) => {
      const [fromType, toType, edgeType] = key.split('\u0000');
      return { fromType, toType, edgeType, count };
    }).sort((a, b) => `${a.fromType}:${a.toType}:${a.edgeType}`.localeCompare(`${b.fromType}:${b.toType}:${b.edgeType}`)),
    nonCodeConnections,
    interGroupImports: [...interGroup.entries()].map(([key, count]) => {
      const [from, to] = key.split('\u0000');
      return { from, to, count };
    }).sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
    intraGroupDensity,
    patternMatches,
    filePatternMatches,
    deploymentTopology,
    dataPipeline,
    docCoverage,
    dependencyDirection,
    fileStats: {
      totalFileNodes: fileNodes.length,
      filesPerGroup: Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, ids]) => [group, ids.size])),
      nodeTypeCounts: Object.fromEntries([...nodeTypes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, ids]) => [type, ids.size]))
    },
    fileFanIn: Object.fromEntries([...fanIn.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    fileFanOut: Object.fromEntries([...fanOut.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
} catch (error) {
  fail(error);
}
