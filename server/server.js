import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeImage } from './analysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'image-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未上传图片' });
    }

    const artType = req.body.artType || 'painting';
    const imagePath = req.file.path;

    const result = await analyzeImage(imagePath, artType);

    fs.unlinkSync(imagePath);

    res.json(result);
  } catch (error) {
    console.error('分析失败:', error);
    res.status(500).json({
      success: false,
      message: '分析失败',
    });
  }
});

app.post('/api/analyze-url', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { url, artType = 'painting' } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL不能为空' });
    }

    const result = await analyzeImage(url, artType);
    
    res.json(result);
  } catch (error) {
    console.error('分析失败:', error);
    res.status(500).json({
      success: false,
      message: '分析失败',
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '服务器运行正常' });
});

app.listen(port, () => {
  console.log(`丹青有AI后端服务运行在 http://localhost:${port}`);
});
