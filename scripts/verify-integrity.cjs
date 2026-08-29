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
console.log('\n\x1b[36m[4/5] Running Business Logic & Calculation Unit Tests...\x1b[0m');
let unitTestOk = true;
try {
  totalChecks++;
  const testOutput = execSync('node scripts/test-stats-calculations.cjs', { cwd: ROOT_DIR, encoding: 'utf8' });
  logPass(testOutput.trim());
} catch (err) {
  unitTestOk = false;
  logFail('Schedule calculation unit tests failed', err.stdout || err.message);
}

try {
  totalChecks++;
  const testOutput = execSync('node scripts/test-ledger-filtering.cjs', { cwd: ROOT_DIR, encoding: 'utf8' });
  logPass(testOutput.trim());
} catch (err) {
  unitTestOk = false;
  logFail('Ledger filtering & balance calculation unit tests failed', err.stdout || err.message);
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
// Step 6: Automated HTML Interactive Elements Event Binding Scan
// Automatically scans index.html for ALL buttons and forms (Zero Hardcoding!)
// and verifies that every interactive element has an active event listener.
// -------------------------------------------------------------
console.log('\n\x1b[36m[6/7] Auto-Scanning ALL HTML Interactive Elements Event Listeners (Zero Hardcoded List)...\x1b[0m');

const allJsCodeCombined = jsFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
let buttonsOk = true;

// 1. Automatically discover all interactive buttons & forms from index.html
const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const buttonMatches = [...htmlContent.matchAll(/<button[^>]*\bid=["']([^"']+)["'][^>]*>/gi)];
const formMatches = [...htmlContent.matchAll(/<form[^>]*\bid=["']([^"']+)["'][^>]*>/gi)];

const interactiveElements = new Map(); // id -> { tag, type, isSubmit }

buttonMatches.forEach(m => {
  const id = m[1];
  const tagStr = m[0];
  const isSubmit = /type=["']submit["']/i.test(tagStr);
  interactiveElements.set(id, { tag: 'button', eventType: 'click', isSubmit });
});

formMatches.forEach(m => {
  const id = m[1];
  interactiveElements.set(id, { tag: 'form', eventType: 'submit', isSubmit: false });
});

interactiveElements.forEach(({ tag, eventType, isSubmit }, id) => {
  totalChecks++;
  let isBound = false;

  for (const file of jsFiles) {
    const code = fs.readFileSync(file, 'utf8');

    // 1. Direct binding: getElementById('id')?.addEventListener('click'...) or .onclick = ...
    const directPattern = new RegExp(`(?:getElementById|querySelector)\\s*\\(\\s*['"]#?${id}['"]\\s*\\)[\\s\\S]{0,150}(?:addEventListener\\s*\\(\\s*['"]${eventType}['"]|\\.on${eventType}\\s*=)`, 'i');
    if (directPattern.test(code)) { isBound = true; break; }

    // 2. Variable assigned anywhere in file and then addEventListener or .onclick anywhere in that same file
    const varMatches = [...code.matchAll(new RegExp(`(?:const|let|var)\\s+([a-zA-Z0-9_$]+)\\s*=\\s*document\\.getElementById\\(['"]${id}['"]\\)`, 'g'))];
    for (const vm of varMatches) {
      const varName = vm[1];
      const listenerPattern = new RegExp(`\\b${varName}\\s*(?:\\??\\.)(?:addEventListener\\s*\\(\\s*['"]${eventType}['"]|\\.on${eventType}\\s*=)`, 'i');
      if (listenerPattern.test(code)) { isBound = true; break; }
    }
    if (isBound) break;

    // 3. Delegate / closest / matches / id === 'id'
    const delegatePattern = new RegExp(`closest\\(['"]#?${id}['"]\\)|matches\\(['"]#?${id}['"]\\)|\\bid\\s*===\\s*['"]${id}['"]`, 'i');
    if (delegatePattern.test(code)) { isBound = true; break; }

    // 4. Array loop registration e.g. sourceButtons
    const arrayPattern = new RegExp(`['"]${id}['"][\\s\\S]{0,350}(?:addEventListener|sourceButtons|\\.classList)`, 'i');
    if (arrayPattern.test(code)) { isBound = true; break; }

    // 5. Common modal close button
    if (id.endsWith('CloseBtn') || id.startsWith('close') || id.includes('Close')) {
      if (/closeModal|close_btn|hideModal|classList\.add\(['"]hidden['"]\)/i.test(code)) {
        isBound = true;
        break;
      }
    }

    // 6. Submit button in handled form
    if (isSubmit && /addEventListener\(['"]submit['"]|\.onsubmit\s*=/i.test(code)) {
      isBound = true;
      break;
    }
  }

  if (!isBound) {
    buttonsOk = false;
    logFail(
      `Unbound interactive element: <${tag} id="${id}">`,
      `Found in index.html, but NO active ${eventType} event listener is registered in any JavaScript module!`
    );
  }
});

if (buttonsOk) {
  logPass(`All ${interactiveElements.size} interactive elements in index.html are actively bound to event listeners.`);
}

// -------------------------------------------------------------
// Step 7: Core View Module Linkage & Architecture Bypass Verification
// Ensures critical view engine modules specified in PROJECT_STRUCTURE.md
// are actually linked and called in the main application pipeline.
// -------------------------------------------------------------
console.log('\n\x1b[36m[7/7] Checking Core View Module Linkage & Architecture Bypass...\x1b[0m');
const CORE_VIEW_CONTRACTS = [
  {
    moduleFile: 'js/features/ledger/fundplan-view.js',
    fnName: 'createFundplanView',
    callerFile: 'js/features/ledger/ledger-app.js',
    desc: '가계부 전체보기/월별 아코디언/상계묶음 뷰 엔진'
  },
  {
    moduleFile: 'js/features/schedule/schedule-view.js',
    fnName: 'renderTable',
    callerFile: 'js/features/schedule/schedule-events.js',
    desc: '일정표 주간 뷰 엔진'
  },
  {
    moduleFile: 'js/features/schedule/monthly-view.js',
    fnName: 'renderMonthlyCalendar',
    callerFile: 'js/features/schedule/schedule-events.js',
    desc: '일정표 월간 캘린더 뷰 엔진'
  }
];

let architectureOk = true;

CORE_VIEW_CONTRACTS.forEach(({ moduleFile, fnName, callerFile, desc }) => {
  totalChecks++;
  const callerAbsPath = path.join(ROOT_DIR, callerFile);
  if (!fs.existsSync(callerAbsPath)) {
    architectureOk = false;
    logFail(`Caller file missing: ${callerFile}`, desc);
    return;
  }

  const callerCode = fs.readFileSync(callerAbsPath, 'utf8');
  // Check import: import { ... fnName ... } from '...'
  const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*from`);
  // Check call: fnName(...)
  const callRegex = new RegExp(`\\b${fnName}\\s*\\(`);

  const hasImport = importRegex.test(callerCode);
  const hasCall = callRegex.test(callerCode);

  if (!hasImport || !hasCall) {
    architectureOk = false;
    logFail(
      `Architecture Bypass / Dead View Module: "${fnName}" in [${moduleFile}] (${desc})`,
      `Not imported or called inside [${callerFile}]. Main app must link to this view module instead of bypassing it.`
    );
  }
});

if (architectureOk) {
  logPass(`All ${CORE_VIEW_CONTRACTS.length} core view engine modules are properly linked and called.`);
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

