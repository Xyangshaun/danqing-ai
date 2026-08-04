/**
 * 丹青有AI - GitHub Pages 部署脚本(已废弃)
 *
 * 2026-08-04 架构调整:
 * 官网和业务应用现已一体化部署到腾讯云 VPS(www.danqing.site):
 *   - 官网(/)→ /var/www/danqing-ai/website/(website/out/)
 *   - 业务应用(/app)→ /var/www/danqing-ai/dist/
 *
 * 本脚本原用于推送 dist/ 到 GitHub Pages,现已废弃。
 * 如需 GitHub Pages 作为备用/预览环境,请使用 website/deploy-gh-pages.cjs
 * (推送 website/out/ 官网产物到 gh-pages 分支)。
 *
 * VPS 部署流程:
 * 1. 本地构建:cd website && npm run build(生成 website/out/)
 * 2. 本地构建:npm run build(生成 dist/)
 * 3. 上传到 VPS:
 *    scp -r website/out/* root@43.128.25.202:/var/www/danqing-ai/website/
 *    scp -r dist/* root@43.128.25.202:/var/www/danqing-ai/dist/
 * 4. 重载 Nginx:ssh root@43.128.25.202 'nginx -t && systemctl reload nginx'
 */

console.warn('[已废弃] 此脚本已不再使用。官网和业务应用现已一体化部署到 VPS。');
console.warn('如需 GitHub Pages 备用环境,请使用 website/deploy-gh-pages.cjs');
console.warn('VPS 部署流程见文件头部注释。');
process.exit(0);
