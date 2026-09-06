import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const svgPath = 'public/icons/icon.svg';

if (!existsSync(svgPath)) {
  console.error(`❌ 未找到图标源文件: ${svgPath}`);
  console.error('请在 public/icons/ 目录下创建 icon.svg 文件');
  process.exit(1);
}

try {
  const svg = readFileSync(svgPath);
  const sizes = [16, 48, 128];

  await Promise.all(
    sizes.map((size) =>
      sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`),
    ),
  );

  console.log('✅ Icons generated: 16x16, 48x48, 128x128');
} catch (err) {
  console.error('❌ 图标生成失败:', err.message);
  process.exit(1);
}
