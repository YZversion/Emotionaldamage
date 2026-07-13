import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
  process.exit(1);
}

const entryNames = new Set([
  'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
  'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
  'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
  'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
  'App.swift', 'Application.kt', 'main.cpp', 'main.c',
]);

function sortRanking(items, key) {
  return items.sort((a, b) => b[key] - a[key] || a.id.localeCompare(b.id));
}

try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const nodes = input.nodes || [];
  const edges = input.edges || [];
  const layers = input.layers || [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const fanIn = new Map(nodes.map((node) => [node.id, 0]));
  const fanOut = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (fanOut.has(edge.source)) fanOut.set(edge.source, fanOut.get(edge.source) + 1);
    if (fanIn.has(edge.target)) fanIn.set(edge.target, fanIn.get(edge.target) + 1);
  }

  const fanInRanking = sortRanking(nodes.map((node) => ({
    id: node.id,
    fanIn: fanIn.get(node.id),
    name: node.name,
  })), 'fanIn').slice(0, 20);
  const fanOutRanking = sortRanking(nodes.map((node) => ({
    id: node.id,
    fanOut: fanOut.get(node.id),
    name: node.name,
  })), 'fanOut').slice(0, 20);

  const codeNodes = nodes.filter((node) => node.type === 'file');
  const highFanOutCount = Math.max(1, Math.ceil(nodes.length * 0.1));
  const highFanOutIds = new Set(fanOutRanking.slice(0, highFanOutCount).map((item) => item.id));
  const lowFanInCount = Math.max(1, Math.ceil(codeNodes.length * 0.25));
  const lowFanInIds = new Set(
    [...codeNodes]
      .sort((a, b) => fanIn.get(a.id) - fanIn.get(b.id) || a.id.localeCompare(b.id))
      .slice(0, lowFanInCount)
      .map((node) => node.id),
  );

  const candidates = [];
  for (const node of nodes) {
    let score = 0;
    const normalizedPath = String(node.filePath || '').replace(/\\/g, '/');
    const fileName = path.posix.basename(normalizedPath || node.name || '');
    const depth = normalizedPath ? normalizedPath.split('/').filter(Boolean).length : Infinity;

    if (node.type === 'file') {
      if (entryNames.has(fileName)) score += 3;
      if (depth <= 2) score += 1;
      if (highFanOutIds.has(node.id)) score += 1;
      if (lowFanInIds.has(node.id)) score += 1;
    } else if (node.type === 'document') {
      if (normalizedPath === 'README.md') score += 5;
      else if (depth === 1 && fileName.endsWith('.md')) score += 2;
    }

    if (score > 0) {
      candidates.push({ id: node.id, score, name: node.name, summary: node.summary || '' });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const entryPointCandidates = candidates.slice(0, 5);

  const topCodeEntry = candidates.find((candidate) => nodeMap.get(candidate.id)?.type === 'file');
  const bfsTraversal = { startNode: null, order: [], depthMap: {}, byDepth: {} };
  if (topCodeEntry) {
    const queue = [topCodeEntry.id];
    bfsTraversal.startNode = topCodeEntry.id;
    bfsTraversal.depthMap[topCodeEntry.id] = 0;
    const seen = new Set(queue);
    const adjacency = new Map();
    for (const edge of edges) {
      if (!['imports', 'calls'].includes(edge.type)) continue;
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      adjacency.get(edge.source).push(edge.target);
    }
    for (const targets of adjacency.values()) targets.sort();

    while (queue.length) {
      const current = queue.shift();
      bfsTraversal.order.push(current);
      const currentDepth = bfsTraversal.depthMap[current];
      for (const target of adjacency.get(current) || []) {
        if (seen.has(target)) continue;
        seen.add(target);
        bfsTraversal.depthMap[target] = currentDepth + 1;
        queue.push(target);
      }
    }
    for (const id of bfsTraversal.order) {
      const depth = String(bfsTraversal.depthMap[id]);
      if (!bfsTraversal.byDepth[depth]) bfsTraversal.byDepth[depth] = [];
      bfsTraversal.byDepth[depth].push(id);
    }
  }

  const inventoryItem = (node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    summary: node.summary || '',
  });
  const nonCodeFiles = {
    documentation: nodes.filter((node) => node.type === 'document').map(inventoryItem),
    infrastructure: nodes.filter((node) => ['service', 'pipeline', 'resource'].includes(node.type)).map(inventoryItem),
    data: nodes.filter((node) => ['table', 'schema', 'endpoint'].includes(node.type)).map(inventoryItem),
    config: nodes.filter((node) => node.type === 'config').map(inventoryItem),
  };

  const relationshipTypes = new Set(['imports', 'calls']);
  const directedPairs = new Map();
  for (const edge of edges) {
    if (!relationshipTypes.has(edge.type) || !nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    directedPairs.set(`${edge.source}\u0000${edge.target}\u0000${edge.type}`, true);
  }
  const bidirectionalPairs = [];
  for (const edge of edges) {
    if (!relationshipTypes.has(edge.type) || !nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    if (directedPairs.has(`${edge.target}\u0000${edge.source}\u0000${edge.type}`) && edge.source < edge.target) {
      bidirectionalPairs.push([edge.source, edge.target]);
    }
  }

  const clusters = [];
  const usedSeeds = new Set();
  for (const [left, right] of bidirectionalPairs) {
    const seedKey = `${left}\u0000${right}`;
    if (usedSeeds.has(seedKey)) continue;
    usedSeeds.add(seedKey);
    const members = new Set([left, right]);
    let expanded = true;
    while (expanded && members.size < 5) {
      expanded = false;
      for (const candidate of nodes.map((node) => node.id).sort()) {
        if (members.has(candidate)) continue;
        let connections = 0;
        for (const member of members) {
          for (const type of relationshipTypes) {
            if (directedPairs.has(`${candidate}\u0000${member}\u0000${type}`) ||
                directedPairs.has(`${member}\u0000${candidate}\u0000${type}`)) connections += 1;
          }
        }
        if (connections >= 2) {
          members.add(candidate);
          expanded = true;
          if (members.size === 5) break;
        }
      }
    }
    const memberList = [...members].sort();
    let edgeCount = 0;
    for (const edge of edges) {
      if (memberList.includes(edge.source) && memberList.includes(edge.target)) edgeCount += 1;
    }
    clusters.push({ nodes: memberList, edgeCount });
  }
  clusters.sort((a, b) => b.edgeCount - a.edgeCount || a.nodes.join('|').localeCompare(b.nodes.join('|')));

  const nodeSummaryIndex = Object.fromEntries(nodes.map((node) => [node.id, {
    name: node.name,
    type: node.type,
    summary: node.summary || '',
  }]));

  const result = {
    scriptCompleted: true,
    entryPointCandidates,
    fanInRanking,
    fanOutRanking,
    bfsTraversal,
    nonCodeFiles,
    clusters: clusters.slice(0, 10),
    layers: {
      count: layers.length,
      list: layers.map((layer) => ({ id: layer.id, name: layer.name, description: layer.description })),
    },
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
