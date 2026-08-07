// ============================================================
// 告警服务 - 邮件通知
// 职责:
//   1. 发送分级邮件告警(error/warn/info)
//   2. 指数退避重试,失败降级到系统 mail 命令
//   3. 写入审计日志 alert-audit.log
//   4. 同组件同级别冷却,防止邮件轰炸
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type AlertLevel = 'error' | 'warn' | 'info';

export interface AlertPayload {
  level: AlertLevel;
  component: string;
  title: string;
  message: string;
  traceId?: string;
  stack?: string;
  context?: Record<string, unknown>;
  url?: string;
  method?: string;
  ip?: string;
}

interface AlertConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  maxRetries: number;
  minIntervalMs: number;
}

interface AuditEntry {
  timestamp: string;
  level: AlertLevel;
  component: string;
  title: string;
  to: string;
  subject: string;
  status: 'success' | 'failed';
  attempts: number;
  error?: string;
}

const lastSentMap = new Map<string, number>();

function loadConfig(): AlertConfig {
  const cfg = env();
  return {
    enabled: cfg.alertEnabled,
    host: cfg.alertSmtpHost,
    port: cfg.alertSmtpPort,
    secure: cfg.alertSmtpSecure,
    user: cfg.alertSmtpUser,
    pass: cfg.alertSmtpPass,
    from: cfg.alertFrom,
    to: cfg.alertTo,
    maxRetries: cfg.alertMaxRetries,
    minIntervalMs: cfg.alertMinIntervalMs,
  };
}

function formatTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildSubject(payload: AlertPayload): string {
  const levelUpper = payload.level.toUpperCase();
  return `[丹青有AI][${levelUpper}][${formatTime()}][${payload.component}] ${payload.title}`;
}

function buildText(payload: AlertPayload): string {
  const lines: string[] = [
    '丹青有AI 监控系统检测到异常，请尽快处理。',
    '',
    '=== 触发信息 ===',
    `告警级别: ${payload.level.toUpperCase()}`,
    `触发时间: ${formatTime()}`,
    `来源组件: ${payload.component}`,
    `告警标题: ${payload.title}`,
    `目标环境: ${env().nodeEnv}`,
  ];

  if (payload.traceId) lines.push(`Trace ID: ${payload.traceId}`);
  if (payload.url) lines.push(`请求地址: ${payload.method ?? 'UNKNOWN'} ${payload.url}`);
  if (payload.ip) lines.push(`客户端 IP: ${payload.ip}`);

  lines.push('', '=== 详细信息 ===', payload.message);

  if (payload.stack) {
    lines.push('', '=== Stack Trace ===', payload.stack);
  }

  if (payload.context && Object.keys(payload.context).length > 0) {
    lines.push('', '=== 上下文 ===');
    for (const [k, v] of Object.entries(payload.context)) {
      lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    }
  }

  lines.push('', '---', '此邮件由 丹青有AI 监控系统自动发送');
  return lines.join('\n');
}

function buildHtml(payload: AlertPayload): string {
  const rows = [
    ['告警级别', `<span style="color:${payload.level === 'error' ? '#dc2626' : payload.level === 'warn' ? '#d97706' : '#2563eb'}">${payload.level.toUpperCase()}</span>`],
    ['触发时间', formatTime()],
    ['来源组件', payload.component],
    ['告警标题', payload.title],
    ['目标环境', env().nodeEnv],
  ];
  if (payload.traceId) rows.push(['Trace ID', payload.traceId]);
  if (payload.url) rows.push(['请求地址', `${payload.method ?? 'UNKNOWN'} ${payload.url}`]);
  if (payload.ip) rows.push(['客户端 IP', payload.ip]);

  const contextRows = payload.context
    ? Object.entries(payload.context).map(([k, v]) => `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;background:#f9fafb">${k}</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>`).join('')
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>丹青有AI 监控告警</title></head>
<body style="font-family:PingFang SC,Microsoft YaHei,sans-serif;line-height:1.6;color:#1f2937;max-width:720px;margin:24px auto;padding:0 16px">
  <h2 style="color:#dc2626;border-bottom:2px solid #e5e7eb;padding-bottom:8px">丹青有AI 监控告警</h2>
  <p>监控系统检测到异常，请尽快处理。</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    ${rows.map(([k, v]) => `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;background:#f9fafb;width:120px">${k}</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${v}</td></tr>`).join('')}
  </table>
  <h3>详细信息</h3>
  <pre style="background:#f3f4f6;padding:12px;border-radius:6px;overflow:auto">${payload.message.replace(/</g, '&lt;')}</pre>
  ${payload.stack ? `<h3>Stack Trace</h3><pre style="background:#f3f4f6;padding:12px;border-radius:6px;overflow:auto;font-size:12px">${payload.stack.replace(/</g, '&lt;')}</pre>` : ''}
  ${contextRows ? `<h3>上下文</h3><table style="width:100%;border-collapse:collapse;margin:16px 0">${contextRows}</table>` : ''}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#6b7280;font-size:12px">此邮件由 丹青有AI 监控系统自动发送</p>
</body>
</html>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendViaNodemailer(config: AlertConfig, subject: string, text: string, html: string): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject,
    text,
    html,
  });
}

async function sendViaCommand(config: AlertConfig, subject: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      'mail',
      ['-s', subject, '-r', config.from, config.to],
      { timeout: 30000 },
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function sendWithRetry(
  config: AlertConfig,
  subject: string,
  text: string,
  html: string,
): Promise<{ attempts: number; usedCommand: boolean; error?: string }> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      await sendViaNodemailer(config, subject, text, html);
      return { attempts: attempt, usedCommand: false };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.maxRetries) {
        await sleep(2000 * 2 ** (attempt - 1));
      }
    }
  }

  // 降级到系统 mail 命令
  try {
    await sendViaCommand(config, subject, text);
    return { attempts: config.maxRetries, usedCommand: true };
  } catch (err) {
    const cmdErr = err instanceof Error ? err : new Error(String(err));
    return {
      attempts: config.maxRetries,
      usedCommand: true,
      error: `nodemailer: ${lastError?.message}; mail command: ${cmdErr.message}`,
    };
  }
}

function writeAudit(entry: AuditEntry): void {
  try {
    const logDir = path.resolve(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'alert-audit.log');
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (err) {
    logger.error({ err }, '[alert] failed to write audit log');
  }
}

function checkCooldown(config: AlertConfig, payload: AlertPayload): boolean {
  const key = `${payload.level}:${payload.component}`;
  const last = lastSentMap.get(key) ?? 0;
  const now = Date.now();
  if (now - last < config.minIntervalMs) {
    return false;
  }
  lastSentMap.set(key, now);
  return true;
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const config = loadConfig();

  if (!config.enabled) {
    logger.debug({ component: payload.component }, '[alert] disabled, skipping alert');
    return;
  }

  if (!config.pass && config.host === 'smtp.qq.com') {
    logger.warn('[alert] ALERT_SMTP_PASS not configured, skipping email alert');
    return;
  }

  if (!checkCooldown(config, payload)) {
    logger.debug({ component: payload.component, level: payload.level }, '[alert] skipped due to cooldown');
    return;
  }

  const subject = buildSubject(payload);
  const text = buildText(payload);
  const html = buildHtml(payload);

  try {
    const result = await sendWithRetry(config, subject, text, html);
    const status = result.error ? 'failed' : 'success';

    writeAudit({
      timestamp: new Date().toISOString(),
      level: payload.level,
      component: payload.component,
      title: payload.title,
      to: config.to,
      subject,
      status,
      attempts: result.attempts,
      error: result.error,
    });

    if (result.error) {
      logger.error({ error: result.error, attempts: result.attempts }, '[alert] email failed after retries');
    } else {
      logger.info({ attempts: result.attempts, usedCommand: result.usedCommand }, '[alert] email sent');
    }
  } catch (err) {
    logger.error({ err }, '[alert] unexpected error sending alert');
  }
}
