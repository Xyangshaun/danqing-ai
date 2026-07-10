import { useEffect, useRef } from 'react';

interface HeatmapCanvasProps {
  heatmapData: number[][];
  focusPoint?: { x: number; y: number };
  title?: string;
  colorScheme?: 'fire' | 'blue' | 'green' | 'purple';
}

export default function HeatmapCanvas({ heatmapData, focusPoint, title, colorScheme = 'fire' }: HeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = heatmapData.length;
    const cols = heatmapData[0]?.length || 1;
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    ctx.fillStyle = 'rgba(250, 248, 245, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw heatmap cells with rounded corners and smooth gradients
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const value = heatmapData[i][j];
        if (value < 0.05) continue;

        const x = j * cellW;
        const y = i * cellH;

        // Create radial gradient for smooth heat spots
        const centerX = x + cellW / 2;
        const centerY = y + cellH / 2;
        const radius = Math.max(cellW, cellH) * 1.2;

        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

        if (value > 0.7) {
          gradient.addColorStop(0, 'rgba(220,50,30,0.9)');
          gradient.addColorStop(0.5, 'rgba(255,100,50,0.5)');
          gradient.addColorStop(1, 'rgba(255,200,150,0.1)');
        } else if (value > 0.4) {
          gradient.addColorStop(0, 'rgba(255,140,50,0.7)');
          gradient.addColorStop(0.6, 'rgba(255,200,120,0.3)');
          gradient.addColorStop(1, 'rgba(255,235,200,0.05)');
        } else if (value > 0.2) {
          gradient.addColorStop(0, 'rgba(255,200,120,0.5)');
          gradient.addColorStop(1, 'rgba(255,240,220,0.05)');
        } else {
          gradient.addColorStop(0, 'rgba(255,220,180,0.3)');
          gradient.addColorStop(1, 'rgba(255,250,245,0)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x - cellW * 0.3, y - cellH * 0.3, cellW * 1.6, cellH * 1.6, cellW * 0.5);
        ctx.fill();
      }
    }

    // Draw focus point crosshair
    if (focusPoint) {
      const fx = focusPoint.x * canvas.width;
      const fy = focusPoint.y * canvas.height;

      ctx.strokeStyle = '#c41e3a';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(fx, 0);
      ctx.lineTo(fx, canvas.height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(canvas.width, fy);
      ctx.stroke();

      ctx.setLineDash([]);

      // Center dot
      ctx.fillStyle = '#c41e3a';
      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, Math.PI * 2);
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = 'rgba(196,30,58,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx, fy, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`视觉重心 (${Math.round(focusPoint.x * 100)}%, ${Math.round(focusPoint.y * 100)}%)`, fx + 18, fy - 8);
    }

    // Draw grid lines (subtle)
    ctx.strokeStyle = 'rgba(200,195,185,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellH);
      ctx.lineTo(canvas.width, i * cellH);
      ctx.stroke();
    }
    for (let j = 1; j < cols; j++) {
      ctx.beginPath();
      ctx.moveTo(j * cellW, 0);
      ctx.lineTo(j * cellW, canvas.height);
      ctx.stroke();
    }
  }, [heatmapData, focusPoint, colorScheme]);

  return (
    <div className="relative">
      {title && (
        <p className="text-xs font-medium text-ink-500 mb-2 text-center">{title}</p>
      )}
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="w-full rounded-xl border border-ink-100"
        style={{ background: '#fdfcf9' }}
      />
      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <span className="text-[10px] text-ink-400">低</span>
        <div className="flex gap-0.5">
          {['rgba(255,240,220,0.5)', 'rgba(255,200,120,0.6)', 'rgba(255,140,50,0.7)', 'rgba(255,80,30,0.85)', 'rgba(196,30,58,0.95)'].map((c, i) => (
            <div key={i} className="w-6 h-2 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span className="text-[10px] text-ink-400">高</span>
      </div>
    </div>
  );
}
