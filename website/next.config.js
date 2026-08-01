/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态导出,部署到 Vercel/任意静态托管
  output: 'export',
  // 静态导出模式下,next/image 关闭服务端优化
  images: {
    unoptimized: true,
  },
  // 严格模式
  reactStrictMode: true,
  // 尾随斜杠,便于静态托管路由
  trailingSlash: true,
  // 构建产物目录
  distDir: '.next',
  // 官网为纯静态导出,不包含任何 API 路由,不暴露业务端点
  // 注:output: 'export' 模式下不支持 redirects/rewrites,跳转由部署平台处理
};

module.exports = nextConfig;
