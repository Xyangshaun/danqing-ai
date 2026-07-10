
    var STORAGE_KEY = 'danqing_analysis_history';

    // 获取历史记录
    function getHistory() {
      try {
        var data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
      } catch (e) {
        return [];
      }
    }

    // 格式化日期
    function formatDate(timestamp) {
      var d = new Date(timestamp);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var h = String(d.getHours()).padStart(2, '0');
      var min = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + day + ' ' + h + ':' + min;
    }

    // 计算平均分
    function getAverageScore(record) {
      return Math.round((record.composition.score + record.color.score + record.originality.score) / 3);
    }

    // 初始化页面
    function initProfile() {
      var history = getHistory();

      // 更新统计
      document.getElementById('totalCount').textContent = history.length;

      if (history.length === 0) {
        renderEmptyState();
        return;
      }

      // 按时间正序（最早到最近）用于图表
      var sortedAsc = history.slice().sort(function(a, b) { return a.timestamp - b.timestamp; });
      // 按时间倒序用于列表
      var sortedDesc = history.slice().sort(function(a, b) { return b.timestamp - a.timestamp; });

      // 计算平均分
      var totalAvg = sortedAsc.reduce(function(sum, r) {
        return sum + getAverageScore(r);
      }, 0) / sortedAsc.length;
      document.getElementById('avgScore').textContent = Math.round(totalAvg);

      // 进步幅度
      if (sortedAsc.length >= 2) {
        var firstAvg = getAverageScore(sortedAsc[0]);
        var lastAvg = getAverageScore(sortedAsc[sortedAsc.length - 1]);
        var diff = lastAvg - firstAvg;
        var progressEl = document.getElementById('progressText');
        if (diff > 0) {
          progressEl.textContent = '+' + diff;
          progressEl.style.color = 'var(--success)';
        } else if (diff < 0) {
          progressEl.textContent = String(diff);
          progressEl.style.color = 'var(--danger)';
        } else {
          progressEl.textContent = '0';
        }
      }

      // 最佳作品
      renderBestWork(sortedDesc);

      // 历史列表
      renderHistoryList(sortedDesc);

      // 成长曲线图
      renderGrowthChart(sortedAsc);
    }

    // 渲染最佳作品
    function renderBestWork(history) {
      var container = document.getElementById('bestWorkContainer');

      // 找平均分最高的
      var best = history.reduce(function(max, item) {
        return getAverageScore(item) > getAverageScore(max) ? item : max;
      }, history[0]);

      var avg = getAverageScore(best);

      var html =
        '<div class="best-work-card">' +
          (best.imageUrl
            ? '<div class="best-thumb"><img src="' + best.imageUrl + '" alt="最佳作品" /></div>'
            : '<div class="best-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>') +
          '<div class="best-info">' +
            '<div class="best-label">综合评分最高</div>' +
            '<div class="best-title">' + escapeHtml(best.filename || '未命名作品') + '</div>' +
            '<div class="best-date">' + formatDate(best.timestamp) + '</div>' +
            '<div class="best-scores">' +
              '<div class="best-score-item">' +
                '<div class="best-score-value composition">' + best.composition.score + '</div>' +
                '<div class="best-score-label">构图</div>' +
              '</div>' +
              '<div class="best-score-item">' +
                '<div class="best-score-value color">' + best.color.score + '</div>' +
                '<div class="best-score-label">色彩</div>' +
              '</div>' +
              '<div class="best-score-item">' +
                '<div class="best-score-value originality">' + best.originality.score + '</div>' +
                '<div class="best-score-label">原创性</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      container.innerHTML = html;
    }

    // 渲染历史列表
    function renderHistoryList(history) {
      var container = document.getElementById('historyListContainer');
      document.getElementById('historyCount').textContent = '（共 ' + history.length + ' 条）';

      // 最近10条
      var recent = history.slice(0, 10);

      if (recent.length === 0) {
        renderEmptyState();
        return;
      }

      var html = '<div class="history-list">';

      recent.forEach(function(item, idx) {
        var avg = getAverageScore(item);
        html +=
          '<div class="history-item">' +
            (item.imageUrl
              ? '<div class="history-thumb"><img src="' + item.imageUrl + '" alt="" /></div>'
              : '<div class="history-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>') +
            '<div class="history-info">' +
              '<div class="history-filename">' + escapeHtml(item.filename || '未命名作品') + '</div>' +
              '<div class="history-date">' + formatDate(item.timestamp) + '</div>' +
            '</div>' +
            '<div class="history-scores">' +
              '<div class="history-score">' +
                '<div class="history-score-num composition">' + item.composition.score + '</div>' +
                '<div class="history-score-label">构图</div>' +
              '</div>' +
              '<div class="history-score">' +
                '<div class="history-score-num color">' + item.color.score + '</div>' +
                '<div class="history-score-label">色彩</div>' +
              '</div>' +
              '<div class="history-score">' +
                '<div class="history-score-num originality">' + item.originality.score + '</div>' +
                '<div class="history-score-label">原创性</div>' +
              '</div>' +
            '</div>' +
            '<div class="history-average">' +
              '<div class="history-avg-label">平均分</div>' +
              '<div class="history-avg-value">' + avg + '</div>' +
            '</div>' +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;
    }

    // 渲染空状态
    function renderEmptyState() {
      var html =
        '<div class="empty-state">' +
          '<div class="empty-icon">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
              '<polyline points="14 2 14 8 20 8"></polyline>' +
              '<line x1="9" y1="15" x2="15" y2="15"></line>' +
            '</svg>' +
          '</div>' +
          '<div class="empty-text">还没有分析记录</div>' +
          '<div class="empty-hint">上传第一张作业，开始记录你的成长吧</div>' +
          '<br />' +
          '<a class="empty-link" href="index-single.html#judge">去上传作业 →</a>' +
        '</div>';

      document.getElementById('bestWorkContainer').innerHTML = html;
      document.getElementById('historyListContainer').innerHTML = html;
      document.getElementById('historyCount').textContent = '';
    }

    // 绘制成长曲线图
    function renderGrowthChart(history) {
      var canvas = document.getElementById('growthChart');
      if (!canvas) return;

      var ctx = canvas.getContext('2d');

      // 取最近8次
      var data = history.slice(-8);
      if (data.length < 2) {
        drawEmptyChart(ctx, canvas);
        return;
      }

      // 设置 canvas 实际像素尺寸（考虑高DPI）
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      var w = rect.width;
      var h = rect.height;

      var padding = { top: 20, right: 20, bottom: 36, left: 40 };
      var chartW = w - padding.left - padding.right;
      var chartH = h - padding.top - padding.bottom;

      // 数据点
      var n = data.length;
      var xStep = chartW / (n - 1);

      function yPos(score) {
        return padding.top + chartH - (score / 100) * chartH;
      }

      function xPos(i) {
        return padding.left + i * xStep;
      }

      // 清空
      ctx.clearRect(0, 0, w, h);

      // 画网格线（25, 50, 75）
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
      ctx.lineWidth = 1;
      ctx.font = '11px "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      [0, 25, 50, 75, 100].forEach(function(val) {
        var y = yPos(val);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.fillText(val, padding.left - 8, y);
      });

      // 画曲线函数
      function drawLine(key, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (var i = 0; i < n; i++) {
          var x = xPos(i);
          var y = yPos(data[i][key].score);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 画点
        for (var i = 0; i < n; i++) {
          var x = xPos(i);
          var y = yPos(data[i][key].score);
          ctx.fillStyle = '#0b1120';
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      drawLine('composition', '#f59e0b');
      drawLine('color', '#38bdf8');
      drawLine('originality', '#22c55e');

      // X轴标签（日期）
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      data.forEach(function(d, i) {
        var dt = new Date(d.timestamp);
        var label = (dt.getMonth() + 1) + '/' + dt.getDate();
        ctx.fillText(label, xPos(i), h - padding.bottom + 8);
      });
    }

    // 绘制空图表
    function drawEmptyChart(ctx, canvas) {
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#64748b';
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('至少需要 2 次分析记录才能绘制成长曲线', rect.width / 2, rect.height / 2);
    }

    // HTML 转义
    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // 移动端菜单
    function toggleMobileMenu() {
      var menu = document.getElementById('nav-menu');
      var menuIcon = document.getElementById('menu-icon');
      var closeIcon = document.getElementById('close-icon');

      menu.classList.toggle('open');
      if (menu.classList.contains('open')) {
        menuIcon.style.display = 'none';
        closeIcon.style.display = 'block';
      } else {
        menuIcon.style.display = 'block';
        closeIcon.style.display = 'none';
      }
    }

    // 页面加载后初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initProfile);
    } else {
      initProfile();
    }

    // 窗口大小变化重绘图表
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        var history = getHistory().sort(function(a, b) { return a.timestamp - b.timestamp; });
        if (history.length >= 2) {
          renderGrowthChart(history);
        }
      }, 200);
    });
  
