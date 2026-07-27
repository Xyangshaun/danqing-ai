// ============================================================
// 日志工具(Winston + 脱敏 redactor)
// 对应文档:auth-design.md §3.9 日志脱敏规则
// 严禁日志输出:access_token / refresh_token 明文 / App Secret / 完整手机号 / 完整邮箱
// ============================================================

import winston from 'winston';
import { env } from '../config/env.js';

/**
 * 脱敏规则表(auth-design.md §3.9)
 * - token 类:仅保留前 8 字符 + "..."
 * - App Secret:完全掩码 ****
 * - 手机号:中间 4 位掩码 138****1234
 * - 邮箱:用户名首尾 + 域名 z***@example.com
 */
const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'app_secret',
  'appSecret',
  'feishu_app_secret',
  'feishuAppSecret',
  'client_secret',
  'clientSecret',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'feishu_access_token',
  'private_key',
  'privateKey',
  'jwt_private_key',
  'jwtPrivateKey',
];

function maskToken(value: string): string {
  if (typeof value !== 'string') return '****';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 8)}...`;
}

function maskPhone(value: string): string {
  if (typeof value !== 'string') return '****';
  // 中国手机号:11 位,中间 4 位掩码
  const m = value.match(/^(\+?\d{1,3}[- ]?)?(\d{3})(\d{4})(\d{4})$/);
  if (m) {
    return `${m[1] ?? ''}${m[2]}****${m[4]}`;
  }
  return maskToken(value);
}

function maskEmail(value: string): string {
  if (typeof value !== 'string') return '****';
  const m = value.match(/^([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  if (m) {
    return `${m[1]}***@${m[2]}`;
  }
  return maskToken(value);
}

/**
 * 深度脱敏对象(递归)
 */
function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const keyLower = k.toLowerCase();
      if (SENSITIVE_KEYS.includes(keyLower) || SENSITIVE_KEYS.includes(k)) {
        if (typeof v === 'string') {
          // token 类按 8 字符脱敏
          out[k] = maskToken(v);
        } else {
          out[k] = '****';
        }
      } else if (keyLower === 'phone' || keyLower === 'mobile' || keyLower === 'phone_number') {
        out[k] = typeof v === 'string' ? maskPhone(v) : '****';
      } else if (keyLower === 'email') {
        out[k] = typeof v === 'string' ? maskEmail(v) : '****';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return obj;
}

const redactFormat = winston.format((info) => {
  if (info && typeof info === 'object') {
    const redacted = redact(info) as winston.Logform.TransformableInfo;
    return redacted;
  }
  return info;
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  redactFormat(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  redactFormat(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(redact(meta))}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  }),
);

let loggerInstance: winston.Logger | null = null;

/**
 * 获取 Winston logger 单例
 * 在 src/index.ts 启动时已通过 import 链初始化
 */
export function initLogger(): winston.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }
  const cfg = env();
  loggerInstance = winston.createLogger({
    level: cfg.logLevel,
    format: logFormat,
    defaultMeta: { service: 'danqing-ai-server' },
    transports: [
      new winston.transports.Console({
        format: consoleFormat,
      }),
    ],
    exitOnError: false,
  });
  return loggerInstance;
}

/**
 * 自定义日志方法类型
 * 支持两种调用顺序(便于业务代码):
 *   logger.info('message', { meta })
 *   logger.info({ meta }, 'message')
 *   logger.info({ meta, message: 'message' })
 *   logger.info('plain message')
 */
type LogMethod = (
  arg1: string | Record<string, unknown>,
  arg2?: string | Record<string, unknown>,
) => void;

interface WrappedLogger {
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  verbose: LogMethod;
  silly: LogMethod;
}

/**
 * 将业务调用规整为 winston 标准调用(message 在前,meta 在后)
 */
function dispatch(
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'silly',
  arg1: string | Record<string, unknown>,
  arg2?: string | Record<string, unknown>,
): void {
  if (!loggerInstance) {
    loggerInstance = initLogger();
  }
  if (typeof arg1 === 'string') {
    // logger.info('msg', meta?)
    if (arg2 !== undefined && typeof arg2 === 'object') {
      loggerInstance[level](arg1, arg2);
    } else {
      loggerInstance[level](arg1);
    }
    return;
  }
  // arg1 为对象:logger.info({ ...meta }, 'msg'?)
  if (typeof arg2 === 'string') {
    loggerInstance[level](arg2, arg1);
  } else {
    loggerInstance[level](arg1);
  }
}

const wrappedLogger: WrappedLogger = {
  error: (a1, a2) => dispatch('error', a1, a2),
  warn: (a1, a2) => dispatch('warn', a1, a2),
  info: (a1, a2) => dispatch('info', a1, a2),
  debug: (a1, a2) => dispatch('debug', a1, a2),
  verbose: (a1, a2) => dispatch('verbose', a1, a2),
  silly: (a1, a2) => dispatch('silly', a1, a2),
};

/**
 * 获取 logger 单例
 * 业务代码统一使用:logger.info({ meta }, 'message') 或 logger.info('message', { meta })
 * 注意:第一次调用时会触发 initLogger,要求 env() 已初始化
 */
export const logger: WrappedLogger = wrappedLogger;

export default logger;
