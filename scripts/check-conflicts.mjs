import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage']);
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.txt', '.svg']);
const conflictMarkerPattern = /^(<{7}|={7}|>{7})(?:\s|$)/m;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await walk(path.join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

function findDuplicateIds(html) {
  const ids = [];
  const idPattern = /\bid\s*=\s*(["'])(.*?)\1/g;
  let match;

  while ((match = idPattern.exec(html)) !== null) {
    ids.push(match[2]);
  }

  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

function findLocalAssets(html) {
  const assets = [];
  const assetPattern = /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
  let match;

  while ((match = assetPattern.exec(html)) !== null) {
    const asset = match[2];
    if (!asset.startsWith('http://') && !asset.startsWith('https://') && !asset.startsWith('//')) {
      assets.push(asset);
    }
  }

  return assets;
}

const files = await walk(root);
const conflictFiles = [];

for (const file of files) {
  const content = await readFile(file, 'utf8');
  if (conflictMarkerPattern.test(content)) {
    conflictFiles.push(path.relative(root, file));
  }
}

if (conflictFiles.length > 0) {
  throw new Error(`Merge conflict markers found in: ${conflictFiles.join(', ')}`);
}

const htmlPath = path.join(root, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const duplicateIds = findDuplicateIds(html);

if (duplicateIds.length > 0) {
  throw new Error(`Duplicate HTML ids found: ${duplicateIds.join(', ')}`);
}

const missingAssets = [];
for (const asset of findLocalAssets(html)) {
  const assetPath = path.join(root, asset);
  try {
    const assetStats = await stat(assetPath);
    if (!assetStats.isFile()) missingAssets.push(asset);
  } catch {
    missingAssets.push(asset);
  }
}

if (missingAssets.length > 0) {
  throw new Error(`Missing local assets referenced by index.html: ${missingAssets.join(', ')}`);
}

console.log('No merge conflict markers, duplicate HTML ids, or missing local assets found.');
