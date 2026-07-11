# 添加 dist 目录到 git
cd dist
git init
git add -A
git commit -m "deploy: GitHub Pages 部署"
git push -f https://github.com/Xyangshaun/danqing-ai.git main:gh-pages
cd ..
