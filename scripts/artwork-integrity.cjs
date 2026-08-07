#!/usr/bin/env node
// ============================================================
// 丹青有AI - 素材库完整性校验脚本
// 职责:
//   1. 为 public/images/artworks/ 生成 MD5 基准清单
//   2. 定期比对生产目录与基准清单,发现篡改/缺失/新增文件
//   3. 检测到异常时自动发送邮件告警
// 用法:
//   生成基准: node scripts/artwork-integrity.cjs generate
//   本地校验: node scripts/artwork-integrity.cjs verify --dir public/images/artworks
//   生产校验: node scripts/artwork-integrity.cjs verify --dir /var/www/danqing-ai/dist/images/artworks --manifest /var/www/danqing-ai/dist/images/artworks-integrity.json
// 环境变量(告警):
//   ALERT_SMTP_HOST    SMTP 服务器,默认 smtp.qq.com
//   ALERT_SMTP_PORT    SMTP 端口,默认 465
//   ALERT_SMTP_USER    发件账号,默认 2692963779@qq.com
//   ALERT_SMTP_PASS    SMTP 授权码(必填,QQ 邮箱不是登录密码)
//   ALERT_TO           收件人,默认 2692963779@qq.com
//   ALERT_FROM         发件人,默认 2692963779@qq.com
// 退出码: 0=正常, 1=异常
// ============================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const MANIFEST_NAME = 'artworks-integrity.json';
const DEFAULT_MANIFEST_PATH = path.resolve(__dirname, '..', MANIFEST_NAME);

function loadAlertConfig() {
  return {
    host: process.env.ALERT_SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.ALERT_SMTP_PORT || '465', 10),
    secure: (process.env.ALERT_SMTP_SECURE || 'true') === 'true',
    user: process.env.ALERT_SMTP_USER || '2692963779@qq.com',
    pass: process.env.ALERT_SMTP_PASS || '',
    to: process.env.ALERT_TO || '2692963779@qq.com',
    from: process.env.ALERT_FROM || '2692963779@qq.com',
  };
}

function buildAlertText({ targetDir, missing, modified, added, elapsed }) {
  const lines = [
    '[丹青有AI] 素材库完整性校验异常',
    `目标目录: ${targetDir}`,
    `校验耗时: ${elapsed}s`,
    `缺失文件: ${missing.length} 个`,
    `被篡改文件: ${modified.length} 个`,
    `新增未知文件: ${added.length} 个`,
    '',
  ];

  if (missing.length) {
    lines.push('=== 缺失文件 ===');
    missing.slice(0, 20).forEach((p) => lines.push(`- ${p}`));
    if (missing.length > 20) lines.push(`... 共 ${missing.length} 个`);
    lines.push('');
  }

  if (modified.length) {
    lines.push('=== 被篡改文件 ===');
    modified.slice(0, 20).forEach((m) => lines.push(`- ${m.path} (大小: ${m.size}B)`));
    if (modified.length > 20) lines.push(`... 共 ${modified.length} 个`);
    lines.push('');
  }

  if (added.length) {
    lines.push('=== 新增未知文件 ===');
    added.slice(0, 20).forEach((p) => lines.push(`- ${p}`));
    if (added.length > 20) lines.push(`... 共 ${added.length} 个`);
    lines.push('');
  }

  lines.push('请尽快登录服务器排查。');
  return lines.join('\n');
}

async function sendMailViaNodemailer(config, subject, text) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject,
    text,
  });
}

async function sendMailViaCommand(config, subject, text) {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      'mail',
      ['-s', subject, '-r', config.from, config.to],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(stdout);
      },
    );
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithLog(operation, options) {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 2000;
  const label = options.label ?? '操作';

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[告警] ${label} 第 ${attempt}/${maxRetries} 次尝试...`);
      const result = await operation();
      console.log(`[告警] ${label} 第 ${attempt} 次尝试成功`);
      return result;
    } catch (err) {
      lastError = err;
      console.error(`[告警] ${label} 第 ${attempt}/${maxRetries} 次尝试失败: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** (attempt - 1);
        console.log(`[告警] ${delay}ms 后重试...`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function sendAlert(differences) {
  const config = loadAlertConfig();
  const maxRetries = parseInt(process.env.ALERT_MAX_RETRIES || '3', 10);

  if (!config.pass && config.host === 'smtp.qq.com') {
    console.warn('[告警] 未配置 ALERT_SMTP_PASS(QQ 邮箱 SMTP 授权码),跳过邮件发送');
    console.warn('[告警] 获取授权码: QQ 邮箱设置 -> 账号 -> 开启 SMTP -> 生成授权码');
    return;
  }

  const subject = '[丹青有AI] 素材库完整性校验异常';
  const text = buildAlertText(differences);

  try {
    try {
      await retryWithLog(
        () => sendMailViaNodemailer(config, subject, text),
        { maxRetries, baseDelay: 2000, label: 'nodemailer 邮件发送' },
      );
      console.log('[告警] 邮件已通过 nodemailer 发送');
      return;
    } catch (nodemailerErr) {
      if (nodemailerErr.code === 'MODULE_NOT_FOUND') {
        console.warn('[告警] 未安装 nodemailer,尝试系统 mail 命令');
      } else {
        console.error(`[告警] nodemailer 在 ${maxRetries} 次尝试后均失败`);
      }
    }

    await retryWithLog(
      () => sendMailViaCommand(config, subject, text),
      { maxRetries: 1, baseDelay: 1000, label: '系统 mail 命令发送' },
    );
    console.log('[告警] 邮件已通过系统 mail 命令发送');
  } catch (err) {
    console.error('[告警] 邮件发送最终失败:', err.message);
    console.error('[告警] 请检查 ALERT_SMTP_PASS 和 SMTP 配置');
  }
}

function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function walkDir(dir) {
  const entries = [];
  const stack = [''];
  while (stack.length) {
    const relative = stack.pop();
    const absolute = path.join(dir, relative);
    const items = await fs.promises.readdir(absolute, { withFileTypes: true });
    for (const item of items) {
      const itemRelative = relative ? `${relative}/${item.name}` : item.name;
      const itemAbsolute = path.join(dir, itemRelative);
      if (item.isDirectory()) {
        stack.push(itemRelative);
      } else if (item.isFile()) {
        const stat = await fs.promises.stat(itemAbsolute);
        entries.push({
          path: itemRelative.replace(/\\/g, '/'),
          size: stat.size,
        });
      }
    }
  }
  return entries;
}

async function generateManifest(sourceDir, outputPath) {
  const start = Date.now();
  console.log(`[生成基准] 扫描目录: ${sourceDir}`);
  const entries = await walkDir(sourceDir);
  console.log(`[生成基准] 发现 ${entries.length} 个文件,开始计算 MD5...`);

  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const abs = path.join(sourceDir, entry.path);
    const md5 = await md5File(abs);
    files.push({ path: entry.path, size: entry.size, md5 });
    if ((i + 1) % 500 === 0 || i === entries.length - 1) {
      console.log(`[生成基准] 已处理 ${i + 1}/${entries.length}`);
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDir: path.resolve(sourceDir).replace(/\\/g, '/'),
    fileCount: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    files,
  };

  await fs.promises.writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[生成基准] 完成: ${files.length} 个文件, 总大小 ${(manifest.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[生成基准] 清单已写入: ${outputPath} (耗时 ${elapsed}s)`);
}

async function verifyDirectory(targetDir, manifestPath) {
  const start = Date.now();
  console.log(`[完整性校验] 目标目录: ${targetDir}`);
  console.log(`[完整性校验] 基准清单: ${manifestPath}`);

  if (!fs.existsSync(manifestPath)) {
    console.error(`[完整性校验] 错误: 基准清单不存在 ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  const expectedMap = new Map(manifest.files.map((f) => [f.path, f]));

  const actualEntries = await walkDir(targetDir);
  const actualMap = new Map();
  for (const entry of actualEntries) {
    actualMap.set(entry.path, entry);
  }

  const missing = [];
  const modified = [];
  const added = [];
  const checked = [];

  for (const [relPath, expected] of expectedMap) {
    const actual = actualMap.get(relPath);
    if (!actual) {
      missing.push(relPath);
      continue;
    }

    const abs = path.join(targetDir, relPath);
    const actualMd5 = await md5File(abs);
    checked.push(relPath);

    if (actualMd5 !== expected.md5) {
      modified.push({ path: relPath, expected: expected.md5, actual: actualMd5, size: actual.size });
    }
  }

  for (const [relPath] of actualMap) {
    if (!expectedMap.has(relPath)) {
      added.push(relPath);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[完整性校验] 基准文件数: ${manifest.fileCount}`);
  console.log(`[完整性校验] 已校验文件数: ${checked.length}`);

  if (missing.length === 0 && modified.length === 0 && added.length === 0) {
    console.log(`[完整性校验] 结果: 正常 (耗时 ${elapsed}s)`);
    return;
  }

  console.error(`[完整性校验] 结果: 异常 (耗时 ${elapsed}s)`);
  if (missing.length) {
    console.error(`  缺失文件: ${missing.length} 个`);
    missing.slice(0, 10).forEach((p) => console.error(`    - ${p}`));
    if (missing.length > 10) console.error(`    ... 共 ${missing.length} 个`);
  }
  if (modified.length) {
    console.error(`  被篡改文件: ${modified.length} 个`);
    modified.slice(0, 10).forEach((m) => console.error(`    - ${m.path} (大小: ${m.size}B)`));
    if (modified.length > 10) console.error(`    ... 共 ${modified.length} 个`);
  }
  if (added.length) {
    console.error(`  新增未知文件: ${added.length} 个`);
    added.slice(0, 10).forEach((p) => console.error(`    - ${p}`));
    if (added.length > 10) console.error(`    ... 共 ${added.length} 个`);
  }

  await sendAlert({ targetDir, missing, modified, added, elapsed });
  process.exit(1);
}

function printUsage() {
  console.log(`用法:
  node scripts/artwork-integrity.cjs generate [--dir <sourceDir>] [--out <manifestPath>]
  node scripts/artwork-integrity.cjs verify --dir <targetDir> [--manifest <manifestPath>]

告警环境变量(检测到异常时发送邮件):
  ALERT_SMTP_HOST    SMTP 服务器,默认 smtp.qq.com
  ALERT_SMTP_PORT    SMTP 端口,默认 465
  ALERT_SMTP_USER    发件账号,默认 2692963779@qq.com
  ALERT_SMTP_PASS    SMTP 授权码(QQ 邮箱不是登录密码)
  ALERT_TO           收件人,默认 2692963779@qq.com
  ALERT_FROM         发件人,默认 2692963779@qq.com
  ALERT_MAX_RETRIES  邮件发送最大重试次数,默认 3

示例:
  生成基准清单:
    node scripts/artwork-integrity.cjs generate

  校验生产目录(带邮件告警):
    ALERT_SMTP_PASS=xxxxxx node scripts/artwork-integrity.cjs verify --dir /var/www/danqing-ai/dist/images/artworks --manifest /var/www/danqing-ai/dist/artworks-integrity.json`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (key === '--dir') options.dir = value;
    if (key === '--out') options.out = value;
    if (key === '--manifest') options.manifest = value;
  }
  return { cmd, options };
}

async function main() {
  const { cmd, options } = parseArgs();

  if (cmd === 'generate') {
    const sourceDir = options.dir || path.resolve(__dirname, '..', 'public', 'images', 'artworks');
    const outputPath = options.out || DEFAULT_MANIFEST_PATH;
    await generateManifest(sourceDir, outputPath);
    return;
  }

  if (cmd === 'verify') {
    if (!options.dir) {
      console.error('[错误] verify 模式必须指定 --dir');
      printUsage();
      process.exit(1);
    }
    const targetDir = options.dir;
    const manifestPath = options.manifest || DEFAULT_MANIFEST_PATH;
    await verifyDirectory(targetDir, manifestPath);
    return;
  }

  console.error('[错误] 未知命令');
  printUsage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
