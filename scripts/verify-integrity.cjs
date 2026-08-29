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
      // ⚠️ 브라우저 동적 import는 항상 해당 모듈 파일 위치 기준으로 경로를 해석함.
      // path.resolve(fileDir, importPath)는 fileDir이 디렉터리이므로 한 단계 덜 올라감.
      // 브라우저는 file URL(파일 경로 자체)을 기준으로 해석하므로, path.resolve(file, '..', importPath)와 동일함.
      resolvedPath = path.resolve(file, '..', importPath);
    } else {
      // 정적 import는 항상 파일 기준 상대경로
      resolvedPath = path.resolve(file, '..', importPath);
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
// Step 5: Callback Contract Verification
// Checks that when fn({ onX: cb }) is called, the function fn
// actually references options.onX (or onX) in its body.
// -------------------------------------------------------------
console.log('\n\x1b[36m[5/5] Checking Callback Contract Integrity (options callbacks are actually called)...\x1b[0m');
let contractOk = true;

// Callback key prefixes to watch (on*, handler*, *Fn, *Callback)
const CALLBACK_KEY_PATTERN = /\b(on[A-Z]\w*|handler\w*|\w+Fn\b|\w+Callback\b)\s*:/g;

// Pass 1: Collect all call sites that pass callbacks in options objects
// Handles both single-line and multi-line object arguments
// e.g. showLedgerView({ onShow: () => ... })
const callSites = []; // { fnName, keys[], callerFile }

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(ROOT_DIR, file);

  // Strategy: find "fnName({" or "fnName( {" then collect text until balanced closing "}"
  const startPattern = /\b([a-zA-Z_$][\w$]*)\s*\(\s*\{/g;
  let m;
  while ((m = startPattern.exec(content)) !== null) {
    const fnName = m[1];
    if (['if', 'while', 'for', 'switch', 'catch', 'function', 'return', 'export', 'import', 'class'].includes(fnName)) continue;

    // Collect text until the matching closing brace
    let depth = 1;
    let i = m.index + m[0].length;
    let objBody = '';
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth > 0) objBody += ch;
      i++;
    }

    // Extract callback-style keys from the collected body
    const keys = [...objBody.matchAll(CALLBACK_KEY_PATTERN)].map(k => k[1]);
    if (keys.length > 0) {
      callSites.push({ fnName, keys, callerFile: relPath });
    }
  }
});

// Pass 2: Build map of functionName -> { defFile, content }
const fnDefMap = {}; // fnName -> [{ defFile, content }]

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(ROOT_DIR, file);

  // Match named function declarations and exported const arrow functions
  const defPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g,
    /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
  ];
  defPatterns.forEach(pat => {
    let m;
    while ((m = pat.exec(content)) !== null) {
      const fnName = m[1];
      if (!fnDefMap[fnName]) fnDefMap[fnName] = [];
      fnDefMap[fnName].push({ defFile: relPath, content });
    }
  });
});

// Pass 3: For each call site, check if callee references each callback key
const KNOWN_SKIP_FNS = new Set([
  // Known patterns that use positional args or internal destructuring — not option-object callbacks
  'Object', 'Array', 'Promise', 'Math', 'JSON', 'console', 'Error', 'Set', 'Map',
  'fetch', 'parseInt', 'parseFloat', 'setTimeout', 'setInterval', 'clearTimeout',
  'addEventListener', 'removeEventListener', 'execSync', 'require', 'path',
  'fs', 'logFail', 'logPass', 'getAllFiles',
]);

// Deduplicate call sites by fnName+key
const checked = new Set();

callSites.forEach(({ fnName, keys, callerFile }) => {
  if (KNOWN_SKIP_FNS.has(fnName)) return;
  const defs = fnDefMap[fnName];
  if (!defs || defs.length === 0) return; // external or built-in, skip

  keys.forEach(key => {
    const dedupKey = `${fnName}::${key}`;
    if (checked.has(dedupKey)) return;
    checked.add(dedupKey);

    totalChecks++;
    // Check if ANY definition of fnName references this key
    const referenced = defs.some(({ content }) => {
      // Accept: options.key, options?.key, { key }, key?.(), key()
      const patterns = [
        new RegExp(`options\\.${key}\\b`),
        new RegExp(`options\\?\\.[^)]*${key}\\b`),
        new RegExp(`[{,]\\s*${key}\\s*[,}]`),
        new RegExp(`\\.${key}\\s*\\??\\.\\s*\\(`),
        new RegExp(`\\b${key}\\s*\\??\\.?\\s*\\(`),
      ];
      return patterns.some(p => p.test(content));
    });

    if (!referenced) {
      contractOk = false;
      logFail(
        `Callback contract broken: "${fnName}({ ${key}: fn })" — key "${key}" is never used inside "${fnName}"`,
        `Called from: ${callerFile}. Check definition in: ${defs.map(d => d.defFile).join(', ')}`
      );
    }
  });
});

if (contractOk) {
  logPass(`All callback contracts verified — every options key passed is actually used by the callee.`);
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

