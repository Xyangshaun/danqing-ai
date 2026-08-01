// ============================================================
// 丹青有AI - PM2 进程管理配置
// 使用方法:pm2 start ecosystem.config.cjs --env production
// 日志路径:~/.pm2/logs/
// ============================================================

module.exports = {
  apps: [
    {
      name: 'danqing-api',
      script: 'server/dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // 日志配置
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 自动重启策略
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      // 优雅关闭(等待已有请求完成)
      shutdown_with_message: false,
      kill_timeout: 5000,
      // 文件变化监听(仅开发环境开启,生产关闭)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', 'server/dist'],
    },
  ],
};
