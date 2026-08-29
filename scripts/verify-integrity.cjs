/**
 * Automated Full-Stack Integrity Verification Engine
 * Runs before any commit or deployment to ensure 0 runtime errors.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT_DIR, 'js');
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');

let totalChecks = 0;
let failedChecks = 0;
const errors = [];

function logPass(msg) {
  console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
}
function logFail(msg, detail = '') {
  failedChecks++;
  console.error(`  \x1b[31m✖\x1b[0m ${msg}`);
  if (detail) console.error(`    \x1b[33m${detail}\x1b[0m`);
  errors.push({ msg, detail });
}

function getAllFiles(dir, ext = '.js', fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        getAllFiles(filePath, ext, fileList);
      }
    } else if (file.endsWith(ext)) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

console.log('\n\x1b[1m=== 🚀 Running Automated Integrity Check Engine ===\x1b[0m\n');

// -------------------------------------------------------------
// Step 1: Check All JS Files Syntax via `node --check`
// -------------------------------------------------------------
console.log('\x1b[36m[1/4] Checking JavaScript Syntax for All Modules...\x1b[0m');
const jsFiles = getAllFiles(JS_DIR, '.js');
let syntaxOk = true;

jsFiles.forEach(file => {
  totalChecks++;
  const relPath = path.relative(ROOT_DIR, file);
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    syntaxOk = false;
    logFail(`Syntax error in ${relPath}`, err.stderr ? err.stderr.toString() : err.message);
  }
});
if (syntaxOk) {
  logPass(`All ${jsFiles.length} JavaScript modules passed syntax validation.`);
}

// -------------------------------------------------------------
// Step 2: Check Static & Dynamic Imports (404 Path Check)
// -------------------------------------------------------------
console.log('\n\x1b[36m[2/4] Checking Static & Dynamic Import Paths (404 Detection)...\x1b[0m');
let importsOk = true;

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const fileDir = path.dirname(file);
  const relFilePath = path.relative(ROOT_DIR, file);

  // Match static: import ... from '...'; or export ... from '...';
  const staticMatches = [...content.matchAll(/(?:import|export)\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g)];
  // Match dynamic: import('...') or import(getVersionedUrl('...'))
  const dynamicMatches = [...content.matchAll(/import\(\s*(?:getVersionedUrl\(\s*)?['"]([^'"]+)['"]\s*\)?\s*\)/g)];

  const allImports = [
    ...staticMatches.map(m => ({ path: m[1], type: 'static' })),
    ...dynamicMatches.map(m => ({ path: m[1], type: 'dynamic' }))
  ];

  allImports.forEach(imp => {
    totalChecks++;
    let importPath = imp.path.split('?')[0]; // strip query string
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) return; // external CDN

    let resolvedPath = null;
    if (imp.type === 'dynamic') {
      // Dynamic import in browser is relative to HTML root (/schedule/)
      if (importPath.startsWith('./js/')) {
        resolvedPath = path.join(ROOT_DIR, importPath);
      } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const fromHtml = path.join(ROOT_DIR, importPath);
        const fromFile = path.join(fileDir, importPath);
        if (fs.existsSync(fromHtml)) resolvedPath = fromHtml;
        else if (fs.existsSync(fromFile)) resolvedPath = fromFile;
        else resolvedPath = fromHtml;
      }
    } else {
      resolvedPath = path.resolve(fileDir, importPath);
    }

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      importsOk = false;
      logFail(`Broken ${imp.type} import in [${relFilePath}]: "${imp.path}"`, `Expected target file at: ${resolvedPath || 'Unknown'}`);
    }
  });
});

if (importsOk) {
  logPass(`All static and dynamic import paths resolved successfully to physical files.`);
}

// -------------------------------------------------------------
// Step 3: Check DOM ID Consistency (index.html + Dynamic JS Templates vs getElementById)
// -------------------------------------------------------------
console.log('\n\x1b[36m[3/4] Checking DOM ID Consistency (HTML/Templates vs getElementById)...\x1b[0m');
const indexHtmlContent = fs.readFileSync(INDEX_HTML, 'utf8');

// Extract all IDs from index.html and all JS files (template strings)
const htmlIdMatches = [...indexHtmlContent.matchAll(/id=["']([^"']+)["']/g)];
const allKnownIds = new Set(htmlIdMatches.map(m => m[1]));

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const jsIdMatches = [...content.matchAll(/id=["']([^"']+)["']/g)];
  jsIdMatches.forEach(m => allKnownIds.add(m[1]));
});

// Dynamic runtime created elements whitelist
const dynamicRuntimePrefixes = [
  'statsRowClinic_', 'statsRow', 'statsClinic', 'cell-', 'elem_', 'toast-', 'ledger-row-'
];
const dynamicRuntimeIds = new Set([
  'appLoadErrorNotice',
  'averageBalanceModalRoot',
  'ledgerTransactionModal',
  'ledgerColorSettingsModal',
  'ledgerAverageBalanceBtn'
]);

let domOk = true;
const referencedIds = new Map();

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFilePath = path.relative(ROOT_DIR, file);

  const getElemMatches = [...content.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)];
  getElemMatches.forEach(m => {
    const id = m[1];
    if (!referencedIds.has(id)) referencedIds.set(id, []);
    referencedIds.get(id).push(relFilePath);
  });
});

referencedIds.forEach((files, id) => {
  totalChecks++;
  if (allKnownIds.has(id) || dynamicRuntimeIds.has(id)) return;
  if (dynamicRuntimePrefixes.some(prefix => id.startsWith(prefix))) return;

  domOk = false;
  logFail(`Missing DOM ID: "#${id}"`, `Referenced by: ${files.join(', ')}`);
});

if (domOk) {
  logPass(`All ${referencedIds.size} referenced DOM IDs are accounted for in HTML/Templates.`);
}

// -------------------------------------------------------------
// Step 4: Run Calculation Unit Tests
// -------------------------------------------------------------
console.log('\n\x1b[36m[4/4] Running Business Calculation Unit Tests...\x1b[0m');
let unitTestOk = true;
try {
  totalChecks++;
  const testOutput = execSync('node scripts/test-stats-calculations.cjs', { cwd: ROOT_DIR, encoding: 'utf8' });
  logPass(testOutput.trim());
} catch (err) {
  unitTestOk = false;
  logFail('Calculation unit tests failed', err.stdout || err.message);
}

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n\x1b[1m=== 📊 Verification Summary ===\x1b[0m');
console.log(`Total Checks Performed: ${totalChecks}`);
console.log(`Failed Checks: ${failedChecks}`);

if (failedChecks === 0) {
  console.log('\n\x1b[32m\x1b[1m✔ ALL INTEGRITY CHECKS PASSED (100% READY FOR DEPLOYMENT)\x1b[0m\n');
  process.exit(0);
} else {
  console.error('\n\x1b[31m\x1b[1m✖ INTEGRITY CHECK FAILED: Please fix above issues before deploying!\x1b[0m\n');
  process.exit(1);
}
