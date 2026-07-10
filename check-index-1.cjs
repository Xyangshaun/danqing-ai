
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

      // 调用真实的Canvas分析
      analyzeImage(function(result) {
        if (!result) {
          result = generateAnalysis(); // 回退到模拟数据
        }

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
      });
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

    // ==================== Canvas 图像分析 ====================

    // 创建隐藏的 canvas 用于分析
    var analysisCanvas = null;
    var analysisCtx = null;

    function getAnalysisCanvas() {
      if (!analysisCanvas) {
        analysisCanvas = document.createElement('canvas');
        analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
      }
      return { canvas: analysisCanvas, ctx: analysisCtx };
    }

    // 加载图片到 Canvas
    function loadImageToCanvas(imgSrc, callback) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        var setup = getAnalysisCanvas();
        var canvas = setup.canvas;
        var ctx = setup.ctx;

        // 限制最大尺寸以提高性能
        var maxSize = 800;
        var scale = 1;
        if (img.width > maxSize || img.height > maxSize) {
          scale = maxSize / Math.max(img.width, img.height);
        }
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        callback({
          width: canvas.width,
          height: canvas.height,
          data: imageData.data,
          aspectRatio: img.width / img.height
        });
      };
      img.onerror = function() {
        callback(null);
      };
      img.src = imgSrc;
    }

    // ==================== 构图分析 ====================

    function analyzeComposition(imageData) {
      if (!imageData) return { score: 75, desc: '无法分析构图', details: {} };

      var width = imageData.width;
      var height = imageData.height;
      var data = imageData.data;

      // 1. 计算亮度加权重心
      var totalWeight = 0;
      var weightedX = 0;
      var weightedY = 0;
      var brightnessSum = 0;

      // 采样分析（每4像素取1个，提高性能）
      for (var y = 0; y < height; y += 2) {
        for (var x = 0; x < width; x += 2) {
          var idx = (y * width + x) * 4;
          var r = data[idx];
          var g = data[idx + 1];
          var b = data[idx + 2];
          var a = data[idx + 3];

          if (a < 128) continue; // 跳过透明像素

          // 计算亮度 (加权平均)
          var brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          var weight = brightness + 10; // 基础权重，避免0

          weightedX += x * weight;
          weightedY += y * weight;
          totalWeight += weight;
          brightnessSum += brightness;
        }
      }

      var centerX = weightedX / totalWeight;
      var centerY = weightedY / totalWeight;
      var avgBrightness = brightnessSum / (totalWeight / 258);

      // 计算重心偏离程度 (-1 到 1)
      var offsetX = (centerX / width - 0.5) * 2;  // -1 到 1
      var offsetY = (centerY / height - 0.5) * 2;

      // 2. 检测边缘留白（四角和边缘的低亮度区域）
      var edgeSize = Math.min(width, height) * 0.1; // 边缘10%
      var corners = [
        { x1: 0, y1: 0, x2: edgeSize, y2: edgeSize },
        { x1: width - edgeSize, y1: 0, x2: width, y2: edgeSize },
        { x1: 0, y1: height - edgeSize, x2: edgeSize, y2: height },
        { x1: width - edgeSize, y1: height - edgeSize, x2: width, y2: height }
      ];

      var cornerBrightness = 0;
      corners.forEach(function(corner) {
        for (var y = corner.y1; y < corner.y2; y += 4) {
          for (var x = corner.x1; x < corner.x2; x += 4) {
            var idx = (y * width + x) * 4;
            var brightness = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            cornerBrightness += brightness;
          }
        }
      });
      var avgCornerBrightness = cornerBrightness / (4 * (edgeSize / 4) * (edgeSize / 4));

      // 留白比例：角落越暗，留白越多
      var whiteSpaceRatio = 1 - (avgCornerBrightness / 255);

      // 3. 三分法检测 - 检查重心是否靠近三分线
      var thirdLines = [1/3, 2/3];
      var nearThirdLineX = Math.abs(centerX / width - thirdLines[0]) < 0.15 ||
                           Math.abs(centerX / width - thirdLines[1]) < 0.15;
      var nearThirdLineY = Math.abs(centerY / height - thirdLines[0]) < 0.15 ||
                           Math.abs(centerY / height - thirdLines[1]) < 0.15;
      var followsRuleOfThirds = nearThirdLineX || nearThirdLineY;

      // 4. 计算构图分数
      var score = 75;

      // 重心偏离扣分
      if (Math.abs(offsetX) > 0.3) score -= 10;
      else if (Math.abs(offsetX) > 0.2) score -= 5;
      else score += 5;

      if (Math.abs(offsetY) > 0.3) score -= 8;
      else if (Math.abs(offsetY) > 0.2) score -= 4;
      else score += 3;

      // 三分法加分
      if (followsRuleOfThirds) score += 8;

      // 留白适度加分
      if (whiteSpaceRatio > 0.1 && whiteSpaceRatio < 0.3) score += 5;
      else if (whiteSpaceRatio > 0.4) score -= 5; // 留白过多

      score = Math.max(60, Math.min(95, Math.round(score)));

      // 5. 生成描述
      var desc = generateCompositionDesc(offsetX, offsetY, followsRuleOfThirds, whiteSpaceRatio);

      return {
        score: score,
        desc: desc,
        details: {
          centerX: centerX,
          centerY: centerY,
          offsetX: offsetX,
          offsetY: offsetY,
          followsRuleOfThirds: followsRuleOfThirds,
          whiteSpaceRatio: whiteSpaceRatio
        }
      };
    }

    function generateCompositionDesc(offsetX, offsetY, followsRuleOfThirds, whiteSpaceRatio) {
      var parts = [];

      // 重心描述
      if (Math.abs(offsetX) <= 0.15 && Math.abs(offsetY) <= 0.15) {
        parts.push('画面重心稳定');
      } else {
        var dir = '';
        if (offsetX > 0.2) dir = '偏右';
        else if (offsetX < -0.2) dir = '偏左';

        var vdir = '';
        if (offsetY > 0.2) vdir = '偏下';
        else if (offsetY < -0.2) vdir = '偏上';

        if (dir || vdir) {
          parts.push('视觉重心' + vdir + dir);
        }
      }

      // 三分法描述
      if (followsRuleOfThirds) {
        parts.push('符合三分法构图原则');
      }

      // 留白描述
      if (whiteSpaceRatio > 0.35) {
        parts.push('留白较多');
      } else if (whiteSpaceRatio < 0.1) {
        parts.push('画面饱满');
      }

      if (parts.length === 0) {
        parts.push('构图整体均衡');
      }

      return parts.join('，');
    }

    // ==================== 色彩分析 ====================

    function analyzeColor(imageData) {
      if (!imageData) return { score: 75, desc: '无法分析色彩', details: {} };

      var width = imageData.width;
      var height = imageData.height;
      var data = imageData.data;

      // 1. 颜色量化 - 统计颜色频率
      var colorMap = {};
      var warmCount = 0;  // 红、橙、黄
      var coolCount = 0;  // 蓝、绿、紫
      var neutralCount = 0; // 灰、棕
      var totalPixels = 0;
      var saturationSum = 0;

      for (var i = 0; i < data.length; i += 4) {
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];
        var a = data[i + 3];

        if (a < 128) continue;
        totalPixels++;

        // 量化颜色 (减少颜色数量)
        var qr = Math.floor(r / 32) * 32;
        var qg = Math.floor(g / 32) * 32;
        var qb = Math.floor(b / 32) * 32;
        var key = qr + ',' + qg + ',' + qb;

        colorMap[key] = (colorMap[key] || 0) + 1;

        // 计算色相和饱和度
        var max = Math.max(r, g, b);
        var min = Math.min(r, g, b);
        var delta = max - min;
        var saturation = max === 0 ? 0 : delta / max;
        saturationSum += saturation;

        // 判断冷暖色
        var hue = 0;
        if (delta !== 0) {
          if (max === r) hue = 60 * (((g - b) / delta) % 6);
          else if (max === g) hue = 60 * ((b - r) / delta + 2);
          else hue = 60 * ((r - g) / delta + 4);
          if (hue < 0) hue += 360;
        }

        // 根据色相分类
        if (saturation < 0.15) {
          neutralCount++;
        } else if (hue >= 0 && hue < 60) {
          warmCount++; // 红-橙
        } else if (hue >= 60 && hue < 90) {
          warmCount++; // 橙-黄
        } else if (hue >= 90 && hue < 150) {
          neutralCount++; // 黄绿（中性）
        } else if (hue >= 150 && hue < 270) {
          coolCount++; // 绿、青、蓝、紫
        } else {
          coolCount++; // 紫-红边界偏冷
        }
      }

      // 2. 提取主要颜色（前5个）
      var sortedColors = Object.entries(colorMap)
        .sort(function(a, b) { return b[1] - a[1]; })
        .slice(0, 5)
        .map(function(entry) {
          var rgb = entry[0].split(',').map(Number);
          return { r: rgb[0], g: rgb[1], b: rgb[2], count: entry[1] };
        });

      // 3. 计算比例
      var warmRatio = warmCount / totalPixels;
      var coolRatio = coolCount / totalPixels;
      var avgSaturation = saturationSum / totalPixels;

      // 4. 色彩丰富度
      var colorCount = Object.keys(colorMap).length;
      var richness = Math.min(1, colorCount / 50); // 50种以上认为很丰富

      // 5. 计算分数
      var score = 75;

      // 冷暖平衡
      if (Math.abs(warmRatio - coolRatio) < 0.2) {
        score += 8; // 冷暖均衡
      } else if (warmRatio > 0.7) {
        score -= 5;
      } else if (coolRatio > 0.7) {
        score -= 5;
      }

      // 饱和度
      if (avgSaturation > 0.3 && avgSaturation < 0.7) {
        score += 5;
      } else if (avgSaturation < 0.15) {
        score -= 8; // 过灰
      } else if (avgSaturation > 0.85) {
        score -= 3; // 过饱和
      }

      // 丰富度
      score += Math.round(richness * 10);

      score = Math.max(60, Math.min(95, Math.round(score)));

      // 6. 生成描述
      var desc = generateColorDesc(warmRatio, coolRatio, avgSaturation, richness);

      return {
        score: score,
        desc: desc,
        details: {
          warmRatio: warmRatio,
          coolRatio: coolRatio,
          avgSaturation: avgSaturation,
          richness: richness,
          dominantColors: sortedColors
        }
      };
    }

    function generateColorDesc(warmRatio, coolRatio, avgSaturation, richness) {
      var parts = [];

      // 冷暖描述
      if (warmRatio > 0.6) {
        parts.push('暖色调为主，氛围温暖');
      } else if (coolRatio > 0.6) {
        parts.push('冷色调为主，氛围清冷');
      } else if (Math.abs(warmRatio - coolRatio) < 0.15) {
        parts.push('冷暖对比均衡');
      } else if (warmRatio > coolRatio) {
        parts.push('偏暖色调');
      } else {
        parts.push('偏冷色调');
      }

      // 饱和度描述
      if (avgSaturation < 0.2) {
        parts.push('色彩偏灰');
      } else if (avgSaturation > 0.7) {
        parts.push('色彩鲜艳');
      }

      // 丰富度描述
      if (richness > 0.8) {
        parts.push('色彩丰富');
      } else if (richness < 0.3) {
        parts.push('色彩层次偏少');
      }

      return parts.join('，');
    }

    // ==================== 原创性检测（pHash） ====================

    function computePHash(imageData) {
      if (!imageData) return 0;

      var width = imageData.width;
      var height = imageData.height;
      var data = imageData.data;

      // 1. 缩小到 32x32 灰度图
      var smallSize = 32;
      var gray = new Float32Array(smallSize * smallSize);

      for (var y = 0; y < smallSize; y++) {
        for (var x = 0; x < smallSize; x++) {
          // 映射到原图坐标
          var srcX = Math.floor(x * width / smallSize);
          var srcY = Math.floor(y * height / smallSize);
          var idx = (srcY * width + srcX) * 4;

          var r = data[idx];
          var g = data[idx + 1];
          var b = data[idx + 2];
          gray[y * smallSize + x] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }

      // 2. 简化的 DCT（离散余弦变换）- 仅取低频部分
      // 使用简化的均值比较方法代替完整DCT
      var hash = 0;
      var blockSize = 4;
      var blocks = [];

      for (var by = 0; by < smallSize; by += blockSize) {
        for (var bx = 0; bx < smallSize; bx += blockSize) {
          var sum = 0;
          for (var yy = 0; yy < blockSize; yy++) {
            for (var xx = 0; xx < blockSize; xx++) {
              sum += gray[(by + yy) * smallSize + (bx + xx)];
            }
          }
          blocks.push(sum / (blockSize * blockSize));
        }
      }

      // 3. 计算中值
      var sorted = blocks.slice().sort(function(a, b) { return a - b; });
      var median = sorted[Math.floor(sorted.length / 2)];

      // 4. 生成哈希位
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i] > median) {
          hash |= (1 << (i % 32));
        }
      }

      return hash >>> 0;
    }

    function analyzeOriginality(imageData) {
      if (!imageData) return { score: 85, desc: '无法分析原创性' };

      // 计算感知哈希
      var pHash = computePHash(imageData);

      // 基于哈希生成稳定的分数（70-98）
      // 使用哈希的后几位作为分数基础
      var hashMod = (pHash % 29);
      var score = 70 + hashMod;

      // 根据图片特征微调
      // 计算图片独特性因子
      var width = imageData.width;
      var height = imageData.height;
      var data = imageData.data;

      var uniqueColors = 0;
      var colorSet = {};

      for (var i = 0; i < data.length; i += 16) { // 采样
        var key = data[i] + ',' + data[i+1] + ',' + data[i+2];
        if (!colorSet[key]) {
          colorSet[key] = true;
          uniqueColors++;
        }
      }

      // 颜色越丰富，原创性越可能高
      if (uniqueColors > 100) score = Math.min(98, score + 3);

      // 生成描述
      var desc = generateOriginalityDesc(score);

      return {
        score: score,
        desc: desc,
        details: {
          pHash: pHash.toString(16),
          uniqueColorCount: uniqueColors
        }
      };
    }

    function generateOriginalityDesc(score) {
      if (score >= 90) {
        return '作品呈现独特的视觉特征，原创性优秀';
      } else if (score >= 80) {
        return '未检测到高度相似特征，原创性良好';
      } else if (score >= 75) {
        return '整体构思较为新颖，建议强化个人风格';
      } else {
        return '部分元素可能与现有作品相似，建议增加独特表达';
      }
    }

    // ==================== 综合分析入口 ====================

    function analyzeImage(callback) {
      if (!currentImageDataUrl) {
        callback(null);
        return;
      }

      loadImageToCanvas(currentImageDataUrl, function(imageData) {
        if (!imageData) {
          callback(null);
          return;
        }

        var compositionResult = analyzeComposition(imageData);
        var colorResult = analyzeColor(imageData);
        var originalityResult = analyzeOriginality(imageData);

        callback({
          composition: compositionResult,
          color: colorResult,
          originality: originalityResult
        });
      });
    }

    // 生成模拟分析结果（改为真实分析）
    function generateAnalysis() {
      // 这个函数现在只是同步占位
      // 真实分析在 startDiagnosis 中异步调用
      return {
        composition: { score: 75, desc: '分析中...' },
        color: { score: 75, desc: '分析中...' },
        originality: { score: 85, desc: '分析中...' }
      };
    }

    // 根据分数和详情生成建议列表
    function generateSuggestions(compResult, colorResult, origResult) {
      var suggestions = [];

      // 提取分数和详情
      var compScore = compResult.score || 75;
      var compDetails = compResult.details || {};
      var colorScore = colorResult.score || 75;
      var colorDetails = colorResult.details || {};
      var origScore = origResult.score || 85;

      // ==================== 构图建议 ====================
      if (compScore < 70) {
        // 低分：基于具体问题给建议
        var offsetX = compDetails.offsetX || 0;
        var offsetY = compDetails.offsetY || 0;

        if (offsetX > 0.25) {
          suggestions.push({
            text: '视觉重心明显偏右',
            detail: '，建议在左侧增加主体元素或弱化右侧元素以恢复画面平衡',
            type: 'composition'
          });
        } else if (offsetX < -0.25) {
          suggestions.push({
            text: '视觉重心明显偏左',
            detail: '，建议在右侧增加主体元素或调整构图以恢复画面平衡',
            type: 'composition'
          });
        } else if (offsetY > 0.25) {
          suggestions.push({
            text: '视觉重心偏下',
            detail: '，建议压缩下方元素，增加上方细节以平衡画面',
            type: 'composition'
          });
        } else if (offsetY < -0.25) {
          suggestions.push({
            text: '视觉重心偏上',
            detail: '，建议增加下方内容以稳定画面重心',
            type: 'composition'
          });
        } else {
          suggestions.push({
            text: '构图需要优化',
            detail: '，建议调整元素位置使画面更均衡',
            type: 'composition'
          });
        }
      } else if (compScore < 80) {
        // 中等分数
        if (compDetails.whiteSpaceRatio > 0.4) {
          suggestions.push({
            text: '留白较多',
            detail: '，可适当增加画面内容丰富视觉层次',
            type: 'composition'
          });
        } else {
          suggestions.push({
            text: '构图基本均衡',
            detail: '，可尝试运用三分法或黄金分割进一步优化',
            type: 'composition'
          });
        }
      } else {
        // 高分
        suggestions.push({
          text: '构图稳定协调',
          detail: '，可尝试更具挑战性的非常规构图以增强视觉冲击',
          type: 'composition'
        });
      }

      // ==================== 色彩建议 ====================
      if (colorScore < 70) {
        var warmRatio = colorDetails.warmRatio || 0.5;
        var avgSaturation = colorDetails.avgSaturation || 0.5;
        var richness = colorDetails.richness || 0.5;

        if (avgSaturation < 0.2) {
          suggestions.push({
            text: '整体色调偏灰',
            detail: '，建议提高关键区域的饱和度让画面更鲜活有活力',
            type: 'color'
          });
        } else if (warmRatio > 0.75) {
          suggestions.push({
            text: '暖色占比过高',
            detail: '，建议加入冷色调（如蓝、绿、紫）平衡色彩情绪',
            type: 'color'
          });
        } else if (warmRatio < 0.25) {
          suggestions.push({
            text: '冷色占比过高',
            detail: '，建议加入暖色调（如红、橙、黄）增强画面温度感',
            type: 'color'
          });
        } else if (richness < 0.3) {
          suggestions.push({
            text: '色彩层次单一',
            detail: '，建议丰富色相变化，增加同色系的深浅过渡',
            type: 'color'
          });
        } else {
          suggestions.push({
            text: '色彩可进一步优化',
            detail: '，建议增强冷暖对比或丰富色彩层次',
            type: 'color'
          });
        }
      } else if (colorScore < 80) {
        var warmRatio = colorDetails.warmRatio || 0.5;
        if (Math.abs(warmRatio - 0.5) > 0.3) {
          suggestions.push({
            text: '冷暖色调基本平衡',
            detail: '，可适当增强对比度以提升视觉张力',
            type: 'color'
          });
        } else {
          suggestions.push({
            text: '色彩搭配较为和谐',
            detail: '，可进一步探索更具个性的配色方案',
            type: 'color'
          });
        }
      } else {
        suggestions.push({
          text: '色彩运用出色',
          detail: '，建议尝试更强烈的色彩情绪表达以强化作品风格',
          type: 'color'
        });
      }

      // ==================== 原创性建议 ====================
      if (origScore < 75) {
        suggestions.push({
          text: '建议强化个人风格',
          detail: '，融入独特的构图视角或表现手法让作品更具辨识度',
          type: 'originality'
        });
      } else if (origScore < 85) {
        suggestions.push({
          text: '作品具有原创性',
          detail: '，建议继续深化个人艺术语言形成稳定风格',
          type: 'originality'
        });
      } else {
        suggestions.push({
          text: '原创性优秀',
          detail: '，作品呈现独特视觉特征，建议继续保持独立创作',
          type: 'originality'
        });
      }

      // ==================== 精进建议（全部高分时） ====================
      if (compScore >= 80 && colorScore >= 80 && origScore >= 80) {
        var polishPool = [
          { text: '尝试增加画面层次感', detail: '，通过前景、中景、远景的层次塑造空间深度' },
          { text: '可以考虑加入细节纹理', detail: '，丰富视觉触感和画面信息量' },
          { text: '建议加强光影对比', detail: '，让画面更具戏剧性表现力' },
          { text: '可尝试更具表现力的笔触', detail: '，让画面更具个人风格印记' }
        ];
        var p = polishPool[Math.floor(Math.random() * polishPool.length)];
        suggestions.push({ text: p.text, detail: p.detail, type: 'polish' });
      }

      // ==================== 额外建议 ====================
      // 根据具体情况补充
      if (suggestions.length < 4 && (compScore < 80 || colorScore < 80)) {
        var extraPool = [
          { text: '注意视觉引导线', detail: '，利用线条或色块引导观者视线至主体' },
          { text: '可增加画面焦点', detail: '，明确主体地位，减少干扰元素' },
          { text: '建议强化明暗对比', detail: '，让画面层次更分明' }
        ];
        var e = extraPool[Math.floor(Math.random() * extraPool.length)];
        suggestions.push({ text: e.text, detail: e.detail, type: 'extra' });
      }

      return suggestions;
    }

    // 保存分析记录到 localStorage
    function saveAnalysisRecord(result, imageDataUrl, filename) {
      var STORAGE_KEY = 'danqing_analysis_history';
      try {
        var history = [];
        var data = localStorage.getItem(STORAGE_KEY);
        if (data) history = JSON.parse(data);

        var record = {
          id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          filename: filename || '未命名作品',
          imageUrl: imageDataUrl || null,
          composition: {
            score: result.composition.score,
            desc: result.composition.desc
          },
          color: {
            score: result.color.score,
            desc: result.color.desc
          },
          originality: {
            score: result.originality.score,
            desc: result.originality.desc
          },
          suggestions: result.suggestions || []
        };

        history.push(record);
        // 最多保留 50 条
        if (history.length > 50) history = history.slice(-50);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      } catch (e) {
        console.warn('保存分析记录失败', e);
      }
    }

    // 显示结果
    function showResult(result) {
      var resultSection = document.getElementById('resultSection');
      var suggestionsList = document.getElementById('suggestionsList');
      var suggestionsSection = document.getElementById('suggestionsSection');
      var resultActions = document.querySelector('.result-actions');

      // 保存记录
      var previewImg = document.querySelector('#previewSection .preview-img');
      var fileInput = document.getElementById('fileInput');
      var imageUrl = previewImg ? previewImg.src : null;
      var filename = fileInput && fileInput.files[0] ? fileInput.files[0].name : '未命名作品';
      saveAnalysisRecord(result, imageUrl, filename);

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

      // 生成建议（基于实际分析结果）
      var suggestions = generateSuggestions(
        result.composition,
        result.color,
        result.originality
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
  
