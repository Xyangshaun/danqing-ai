/**
 * 丹青有AI - prototype 静态原型修复验证脚本
 * 无测试框架,使用 Node + 正则断言 HTML/JS 结构,验证 P1a-P1f 修复是否落地。
 * 运行: node proto-verify.cjs
 * 退出码:0=全部通过,1=存在失败项。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const failures = [];
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? ' -> ' + detail : ''}`);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

// ---------- P1a: 图片本地化 + referrerpolicy + onerror 降级 ----------
const htmlFiles = ['index.html', 'console.html', 'diagnose.html', 'history.html', 'growth.html', 'report.html', 'portal.html'];
for (const f of htmlFiles) {
  const src = read(f);
  const externalImg = (src.match(/<img[^>]+src=["']https?:\/\//g) || []).length;
  check(`P1a [${f}] 无外部 http(s) 图片`, externalImg === 0, `发现 ${externalImg} 处外部图片`);
  const missingRef = (src.match(/<img[^>]+(?!referrerpolicy)[^>]*src=/g) || []).filter(m => !/referrerpolicy/.test(m));
  // 简化:统计所有带 src 的 img,检查是否都有 referrerpolicy
  const imgs = (src.match(/<img[^>]+>/g) || []).filter(m => /src=/.test(m));
  const noRef = imgs.filter(m => !/referrerpolicy=/.test(m));
  check(`P1a [${f}] img 均带 referrerpolicy`, noRef.length === 0, `缺 referrerpolicy: ${noRef.length} 处`);
}

const mainJs = read('scripts/main.js');
check('P1a [main.js] 含 initImageFallback 降级', /initImageFallback/.test(mainJs) && /placeholder\.svg/.test(mainJs));

// ---------- P1b: 防重复点击 ----------
const consoleJs = read('scripts/console.js');
const diagJs = read('diagnose.html');
check('P1b [console.js] 含 isAnalyzing 守卫', /isAnalyzing/.test(consoleJs) && /disabled/.test(consoleJs));
check('P1b [diagnose.html] 含 isAnalyzing 守卫', /isAnalyzing/.test(diagJs) && /disabled/.test(diagJs));
check('P1b [console.html] 开始按钮含 id', /id="startAnalysisBtn"/.test(read('console.html')));
check('P1b [diagnose.html] 开始按钮含 id', /id="startAnalysisBtn"/.test(diagJs));

// ---------- P1c: 文件校验 + input file ----------
check('P1c [console.html] 上传区含 fileInput', /id="fileInput"/.test(read('console.html')));
check('P1c [diagnose.html] 上传区含 fileInput', /id="fileInput"/.test(diagJs));
check('P1c [console.js] 含 validateFile 类型/大小校验', /validateFile/.test(consoleJs) && /ALLOWED_TYPES/.test(consoleJs) && /MAX_FILE_SIZE/.test(consoleJs));
check('P1c [console.js] 未上传文件拦截', /请先上传作品图片/.test(consoleJs));

// ---------- P1d: IntersectionObserver 降级 ----------
check('P1d [main.js] 特性检测降级 reveal', /typeof IntersectionObserver === 'undefined'/.test(mainJs) && /add\('visible'\)/.test(mainJs));
check('P1d [main.js] 特性检测降级 counter', /typeof IntersectionObserver === 'undefined'/.test(mainJs));

// ---------- P1e: 键盘可达 ----------
check('P1e [console.js] form-type 键盘可达', /setAttribute\('role', 'button'\)/.test(consoleJs) && /setAttribute\('tabindex', '0'\)/.test(consoleJs) && /keydown/.test(consoleJs));
check('P1e [diagnose.html] 上传区 role=button tabindex', /role="button" tabindex="0"/.test(diagJs));

// ---------- P1f: role=switch ----------
const consoleHtml = read('console.html');
check('P1f [console.html] 设置开关 role=switch', /role="switch"/.test(consoleHtml) && /aria-checked/.test(consoleHtml));

// ---------- 边界:所有上传区都有对应 fileInput ----------
const uploadZones = (consoleHtml.match(/id="uploadZone"/g) || []).length;
const fileInputs = (consoleHtml.match(/id="fileInput"/g) || []).length;
check('边界 [console.html] uploadZone 与 fileInput 数量匹配', uploadZones === fileInputs, `uploadZone=${uploadZones}, fileInput=${fileInputs}`);

// ---------- 汇总 ----------
console.log(`\n=== prototype 修复验证 (${checks.length} 项) ===`);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
}
console.log(`\n结果: ${checks.length - failures.length}/${checks.length} 通过`);
if (failures.length) {
  console.log('\n失败项:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✅');