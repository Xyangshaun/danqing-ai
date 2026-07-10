
    // 全局状态
    let currentFile = null;
    let currentImageDataUrl = null;

    // 初始化拖拽上传
    document.addEventListener('DOMContentLoaded', function() {
      var uploadArea = document.getElementById('uploadArea');
      
      if (uploadArea) {
        uploadArea.addEventListener('dragover', function(e) {
          e.preventDefault();
          e.stopPropagation();
          uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', function(e) {
          e.preventDefault();
          e.stopPropagation();
          uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', function(e) {
          e.preventDefault();
          e.stopPropagation();
          uploadArea.classList.remove('dragover');
          
          var files = e.dataTransfer.files;
          if (files && files.length > 0) {
            processFile(files[0]);
          }
        });
      }
    });

    // 处理文件选择
    function handleFileSelect(event) {
      var files = event.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    }

    // 处理上传的文件
    function processFile(file) {
      var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (allowedTypes.indexOf(file.type) === -1) {
        alert('请上传 JPG、PNG 或 JPEG 格式的图片');
        return;
      }

      var maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('图片大小不能超过 10MB');
        return;
      }

      currentFile = file;

      var reader = new FileReader();
      reader.onload = function(e) {
        currentImageDataUrl = e.target.result;
        
        var previewImage = document.getElementById('previewImage');
        var fileName = document.getElementById('fileName');
        var fileSize = document.getElementById('fileSize');
        var previewArea = document.getElementById('previewArea');
        var uploadArea = document.getElementById('uploadArea');
        var diagnoseBtn = document.getElementById('diagnoseBtn');
        var btnText = document.getElementById('btnText');

        previewImage.src = currentImageDataUrl;
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        uploadArea.style.display = 'none';
        previewArea.classList.add('show');
        diagnoseBtn.disabled = false;
        btnText.textContent = '开始诊断';
      };
      reader.readAsDataURL(file);
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // 删除图片
    function removeImage(event) {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      resetUploadState();
    }

    // 重新选择
    function triggerReupload(event) {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      document.getElementById('fileInput').click();
    }

    // 重置上传状态
    function resetUploadState() {
      currentFile = null;
      currentImageDataUrl = null;
      
      var previewArea = document.getElementById('previewArea');
      var uploadArea = document.getElementById('uploadArea');
      var diagnoseBtn = document.getElementById('diagnoseBtn');
      var btnText = document.getElementById('btnText');
      var fileInput = document.getElementById('fileInput');

      if (previewArea) previewArea.classList.remove('show');
      if (uploadArea) uploadArea.style.display = '';
      if (diagnoseBtn) {
        diagnoseBtn.disabled = true;
      }
      if (btnText) btnText.textContent = '请先上传图片';
      if (fileInput) fileInput.value = '';
    }

    // 开始诊断
    function startDiagnosis() {
      if (!currentImageDataUrl) {
        alert('请先上传图片');
        return;
      }

      var btn = document.getElementById('diagnoseBtn');
      var btnText = document.getElementById('btnText');
      var btnArrow = document.getElementById('btnArrow');
      var btnSpinner = btn.querySelector('.spinner');
      var progress = document.getElementById('analysisProgress');

      btn.classList.add('loading');
      btn.disabled = true;
      btnText.textContent = 'AI 分析中...';
      btnArrow.style.display = 'none';
      btnSpinner.style.display = 'block';

      // 显示进度提示
      if (progress) {
        var steps = progress.querySelectorAll('.progress-step');
        steps.forEach(function(s) { s.classList.remove('active', 'done'); });
        progress.classList.add('show');
        // 依次激活每个步骤
        steps.forEach(function(step, idx) {
          setTimeout(function() {
            steps.forEach(function(s, i) {
              if (i < idx) s.classList.add('done');
              else if (i === idx) s.classList.add('active');
              else { s.classList.remove('active', 'done'); }
            });
          }, idx * 500);
        });
      }

      setTimeout(function() {
        var result = generateAnalysis();
        showResult(result);

        btn.classList.remove('loading');
        btn.disabled = false;
        btnText.textContent = '开始诊断';
        btnArrow.style.display = '';
        btnSpinner.style.display = 'none';

        if (progress) {
          var steps = progress.querySelectorAll('.progress-step');
          steps.forEach(function(s) { s.classList.add('done'); s.classList.remove('active'); });
          setTimeout(function() {
            progress.classList.remove('show');
          }, 800);
        }
      }, 2500);
    }

    // 基于文件名+大小的稳定种子字符串
    function getSeedString() {
      if (currentFile) {
        return currentFile.name + '_' + currentFile.size + '_' + currentFile.lastModified;
      }
      return 'default_seed';
    }

    // 字符串哈希 -> 32位整数
    function hashString(str) {
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // 转为32位整数
      }
      return hash;
    }

    // 种子伪随机数生成器 (mulberry32)
    function seededRandom(seed) {
      var s = seed >>> 0;
      return function() {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // 生成模拟分析结果
    function generateAnalysis() {
      var seed = hashString(getSeedString());
      var rand = seededRandom(seed);

      return {
        composition: {
          score: Math.floor(rand() * 36) + 60,    // 60-95
          desc: getCompositionDesc(rand)
        },
        color: {
          score: Math.floor(rand() * 36) + 60,     // 60-95
          desc: getColorDesc(rand)
        },
        originality: {
          score: Math.floor(rand() * 29) + 70,    // 70-98
          desc: getOriginalityDesc(rand)
        },
        suggestions: generateSuggestions(0, 0, 0) // 占位，下面根据分数重新生成
      };
    }

    // 构图类描述池
    function getCompositionDesc(rand) {
      var pool = [
        '黄金分割运用得当，整体重心稳定',
        '画面比例协调，主体位置较为合适',
        '三分法构图基本到位，略有提升空间',
        '主体位置略偏，建议调整视觉重心',
        '画面均衡度良好，留白处理恰当',
        '构图略显拥挤，可适当精简元素'
      ];
      return pool[Math.floor(rand() * pool.length)];
    }

    // 色彩类描述池
    function getColorDesc(rand) {
      var pool = [
        '色彩搭配协调，整体氛围统一',
        '冷暖对比清晰，画面层次分明',
        '色调控制良好，富有表现力',
        '色彩略显单调，可增加色彩变化',
        '饱和度控制适中，氛围营造到位',
        '局部色彩可再丰富，加强视觉张力'
      ];
      return pool[Math.floor(rand() * pool.length)];
    }

    // 原创性类描述池
    function getOriginalityDesc(rand) {
      var pool = [
        '未检测到高度相似的网络图片，原创性良好',
        '作品具有独特的个人风格，原创性优秀',
        '与现有素材库相似度低，构思新颖',
        '整体构思有创新性，建议继续保持',
        '未发现明显借鉴痕迹，独立完成度高'
      ];
      return pool[Math.floor(rand() * pool.length)];
    }

    // 根据分数生成建议列表
    function generateSuggestions(compScore, colorScore, origScore) {
      var suggestions = [];

      // 构图建议
      var compLow = [
        { text: '画面重心偏右', detail: '，建议增加左侧元素以达到画面平衡' },
        { text: '主体过小', detail: '，尝试放大视觉焦点突出主体地位' },
        { text: '画面略显拥挤', detail: '，可适当精简元素增加留白' },
        { text: '主体位置偏离黄金分割点', detail: '，建议将视觉中心调整至三分线交叉处' }
      ];
      var compHigh = [
        { text: '构图稳定', detail: '，可尝试更具挑战性的非常规构图' },
        { text: '画面比例协调', detail: '，建议在保持平衡的基础上增加动势' }
      ];

      // 色彩建议
      var colorLow = [
        { text: '冷暖对比不足', detail: '，可适当增加互补色增强视觉张力' },
        { text: '整体色调偏灰', detail: '，建议提高色彩饱和度让画面更鲜活' },
        { text: '色彩过渡生硬', detail: '，可加入中间色调使色彩过渡更自然' },
        { text: '色彩层次单一', detail: '，建议丰富色相变化以增加画面表现力' }
      ];
      var colorHigh = [
        { text: '色彩搭配和谐', detail: '，可进一步探索更具个性的配色方案' },
        { text: '色调控制优秀', detail: '，建议尝试更强烈的色彩情绪表达' }
      ];

      // 原创性建议
      var origLow = [
        { text: '建议增加个人风格元素', detail: '，让作品更具辨识度' },
        { text: '尝试融入独特的构图视角', detail: '，从非常规角度切入主题' },
        { text: '可借鉴经典但需变形重组', detail: '，避免直接照搬他人作品' }
      ];
      var origHigh = [
        { text: '原创性表现优秀', detail: '，建议继续深化个人艺术语言' }
      ];

      // 精进建议（高分时）
      var polish = [
        { text: '尝试增加画面层次感', detail: '，通过前景、中景、远景的层次塑造空间' },
        { text: '可以考虑加入细节纹理', detail: '，丰富视觉触感和画面信息量' },
        { text: '建议加强光影对比', detail: '，让画面更具戏剧性表现力' },
        { text: '可尝试更具表现力的笔触', detail: '，让画面更具个人风格印记' }
      ];

      // 根据分数选择建议
      if (compScore < 75) {
        var c = compLow[Math.floor(Math.random() * compLow.length)];
        suggestions.push({ text: c.text, detail: c.detail, type: 'composition' });
      } else {
        var c = compHigh[Math.floor(Math.random() * compHigh.length)];
        suggestions.push({ text: c.text, detail: c.detail, type: 'composition' });
      }

      if (colorScore < 75) {
        var c = colorLow[Math.floor(Math.random() * colorLow.length)];
        suggestions.push({ text: c.text, detail: c.detail, type: 'color' });
      } else {
        var c = colorHigh[Math.floor(Math.random() * colorHigh.length)];
        suggestions.push({ text: c.text, detail: c.detail, type: 'color' });
      }

      if (origScore < 80) {
        var c = origLow[Math.floor(Math.random() * origLow.length)];
        suggestions.push({ text: c.text, detail: c.detail, type: 'originality' });
      } else {
        var c = origHigh[Math.floor(Math.random() * origHigh.length)];
        suggestions.push({ text: c.text, detail: c.detail, type: 'originality' });
      }

      // 全部 >= 80 时加入精进建议
      if (compScore >= 80 && colorScore >= 80 && origScore >= 80) {
        var p = polish[Math.floor(Math.random() * polish.length)];
        suggestions.push({ text: p.text, detail: p.detail, type: 'polish' });
      }

      // 保证至少 3 条（此处刚好是 3 条，已满足）
      // 随机补充 1-2 条以增强丰富度
      var extraPool = compLow.concat(colorLow).concat(polish);
      var needMore = Math.random() < 0.6; // 60% 概率再补一条
      if (needMore) {
        var e = extraPool[Math.floor(Math.random() * extraPool.length)];
        suggestions.push({ text: e.text, detail: e.detail, type: 'extra' });
      }

      return suggestions;
    }

    // 显示结果
    function showResult(result) {
      var resultSection = document.getElementById('resultSection');
      var suggestionsList = document.getElementById('suggestionsList');
      var suggestionsSection = document.getElementById('suggestionsSection');
      var resultActions = document.querySelector('.result-actions');

      // 重置动画状态
      var scoreCards = resultSection.querySelectorAll('.score-card');
      scoreCards.forEach(function(card) {
        card.classList.remove('appear');
        card.style.animationDelay = '';
      });
      if (suggestionsSection) suggestionsSection.classList.remove('appear');
      if (resultActions) resultActions.classList.remove('appear');

      var items = suggestionsList ? suggestionsList.querySelectorAll('.suggestion-item') : [];
      items.forEach(function(item) {
        item.classList.remove('appear');
        item.style.animationDelay = '';
      });

      // 填充分数
      var compEl = document.getElementById('compositionScore');
      var compBar = document.getElementById('compositionBar');
      var compDesc = document.getElementById('compositionDesc');
      if (compEl) compEl.innerHTML = result.composition.score + '<span>分</span>';
      if (compBar) { compBar.setAttribute('data-score', result.composition.score); compBar.style.width = '0%'; }
      if (compDesc) compDesc.textContent = result.composition.desc;

      var colorEl = document.getElementById('colorScore');
      var colorBar = document.getElementById('colorBar');
      var colorDesc = document.getElementById('colorDesc');
      if (colorEl) colorEl.innerHTML = result.color.score + '<span>分</span>';
      if (colorBar) { colorBar.setAttribute('data-score', result.color.score); colorBar.style.width = '0%'; }
      if (colorDesc) colorDesc.textContent = result.color.desc;

      var origEl = document.getElementById('originalityScore');
      var origBar = document.getElementById('originalityBar');
      var origDesc = document.getElementById('originalityDesc');
      if (origEl) origEl.innerHTML = result.originality.score + '<span>分</span>';
      if (origBar) { origBar.setAttribute('data-score', result.originality.score); origBar.style.width = '0%'; }
      if (origDesc) origDesc.textContent = result.originality.desc;

      // 生成建议（基于实际分数）
      var suggestions = generateSuggestions(
        result.composition.score,
        result.color.score,
        result.originality.score
      );

      // 渲染建议列表
      if (suggestionsList) {
        suggestionsList.innerHTML = suggestions.map(function(s) {
          return '<li class="suggestion-item">' +
            '<span class="suggestion-arrow">></span>' +
            '<p class="suggestion-text"><strong>' + escapeHtml(s.text) + '</strong>' + escapeHtml(s.detail) + '</p>' +
            '</li>';
        }).join('');
      }

      // 显示结果区域
      if (resultSection) {
        resultSection.classList.add('show');
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // 卡片依次淡入 (stagger)
      scoreCards.forEach(function(card, idx) {
        setTimeout(function() {
          card.classList.add('appear');
        }, 300 + idx * 200);
      });

      // 进度条动画
      setTimeout(function() {
        scoreCards.forEach(function(card, idx) {
          setTimeout(function() {
            var bar = card.querySelector('.score-bar');
            if (bar) {
              var score = bar.getAttribute('data-score');
              bar.style.width = score + '%';
            }
          }, idx * 200);
        });
      }, 700);

      // 建议区域淡入
      setTimeout(function() {
        if (suggestionsSection) suggestionsSection.classList.add('appear');
        var newItems = suggestionsList ? suggestionsList.querySelectorAll('.suggestion-item') : [];
        newItems.forEach(function(item, idx) {
          setTimeout(function() {
            item.classList.add('appear');
          }, idx * 100);
        });
      }, 1400);

      // 底部按钮淡入
      setTimeout(function() {
        if (resultActions) resultActions.classList.add('appear');
      }, 1900);
    }

    // HTML转义
    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // 重置到上传状态
    function resetToUpload() {
      var resultSection = document.getElementById('resultSection');
      if (resultSection) {
        resultSection.classList.remove('show');
      }

      var scoreCards = resultSection ? resultSection.querySelectorAll('.score-card') : [];
      scoreCards.forEach(function(card) {
        card.classList.remove('appear');
      });

      var suggestionsSection = document.getElementById('suggestionsSection');
      if (suggestionsSection) suggestionsSection.classList.remove('appear');

      var resultActions = document.querySelector('.result-actions');
      if (resultActions) resultActions.classList.remove('appear');

      var items = document.querySelectorAll('.suggestion-item');
      items.forEach(function(item) {
        item.classList.remove('appear');
      });

      var scoreBars = document.querySelectorAll('.score-bar');
      scoreBars.forEach(function(bar) {
        bar.style.width = '0%';
      });

      document.getElementById('upload').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 滚动到上传区域
    function scrollToUpload() {
      var uploadSection = document.getElementById('upload');
      if (uploadSection) {
        uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // 移动端菜单切换
    function toggleMobileMenu() {
      const menu = document.getElementById('nav-menu');
      const menuIcon = document.getElementById('menu-icon');
      const closeIcon = document.getElementById('close-icon');
      
      menu.classList.toggle('open');
      if (menu.classList.contains('open')) {
        menuIcon.style.display = 'none';
        closeIcon.style.display = 'block';
      } else {
        menuIcon.style.display = 'block';
        closeIcon.style.display = 'none';
      }
    }

    // 设置导航激活状态
    function setActive(element, sectionId) {
      document.querySelectorAll('.nav-item a').forEach(a => a.classList.remove('active'));
      element.classList.add('active');
      
      const menu = document.getElementById('nav-menu');
      if (menu.classList.contains('open')) {
        toggleMobileMenu();
      }
    }

    // 滚动到顶部
    function scrollToTop(event) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.querySelectorAll('.nav-item a').forEach(a => a.classList.remove('active'));
      document.querySelector('.nav-item:first-child a').classList.add('active');
    }

    // 滚动时更新导航激活状态
    window.addEventListener('scroll', function() {
      const sections = ['home', 'upload', 'judge', 'about'];
      const scrollPos = window.scrollY + 100;
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i]);
        if (section && section.offsetTop <= scrollPos) {
          document.querySelectorAll('.nav-item a').forEach((a, index) => {
            a.classList.toggle('active', index === i);
          });
          break;
        }
      }
    });
  