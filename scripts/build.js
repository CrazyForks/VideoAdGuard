const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const builds = ['chrome', 'firefox'];

// 跨平台压缩函数
function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });

    output.on('close', () => {
      console.log(`📦 压缩包已创建: ${Math.round(archive.pointer() / 1024)} KB`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // 添加整个目录的内容，但不包含目录本身
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// 版本同步函数
function syncVersion() {
  console.log('🔄 同步版本号...');
  
  // 从package.json读取版本号
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const version = packageJson.version;
  
  console.log(`📦 当前版本: ${version}`);
  
  // 更新Chrome manifest
  const chromeManifestPath = 'manifests/manifest-chrome.json';
  const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
  chromeManifest.version = version;
  fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 2));
  console.log('✅ Chrome manifest 版本已更新');
  
  // 更新Firefox manifest
  const firefoxManifestPath = 'manifests/manifest-firefox.json';
  const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));
  firefoxManifest.version = version;
  fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 2));
  console.log('✅ Firefox manifest 版本已更新');
  
  return version;
}

// 第一步：同步版本号
const version = syncVersion();

// 清理builds目录
console.log('🧹 清理构建目录...');
try {
  if (fs.existsSync('builds')) {
    fs.rmSync('builds', { recursive: true, force: true });
  }
  console.log('✅ 构建目录清理完成');
} catch (error) {
  console.log('⚠️  构建目录清理失败，可能有文件被占用，继续构建...');
}

console.log('\n🚀 开始构建多平台扩展...\n');

// 使用多配置webpack构建
try {
  console.log('正在编译所有平台...');
  execSync('npx webpack --config webpack.config.js', { stdio: 'inherit' });
  console.log('✅ 编译完成\n');
} catch (error) {
  console.error('❌ 编译失败:', error.message);
  process.exit(1);
}

// 创建压缩包 - 使用异步方式
async function createZipFiles() {
  console.log('\n📦 开始创建压缩包...');
  
  for (const browser of builds) {
    const buildDir = path.join('builds', browser);
    const zipName = `VideoAdGuard-${browser}-v${version}.zip`;
    const zipPath = path.join('builds', zipName);
    
    if (fs.existsSync(buildDir)) {
      try {
        // 删除已存在的压缩包
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        
        console.log(`🔄 正在打包 ${browser} 版本...`);
        await createZip(buildDir, zipPath);
        console.log(`✅ ${browser} 版本打包完成: builds/${zipName}`);
      } catch (error) {
        console.error(`❌ ${browser} 版本打包失败:`, error.message);
      }
    } else {
      console.warn(`⚠️  构建目录不存在: ${buildDir}`);
    }
  }
}

// 主函数
async function main() {
  try {
    await createZipFiles();
    
    console.log('\n🎉 所有版本构建完成！');
    console.log('构建文件位置:');
    console.log('- builds/chrome/ (Chrome扩展文件)');
    console.log('- builds/firefox/ (Firefox扩展文件)');
    console.log(`- builds/VideoAdGuard-chrome-v${version}.zip`);
    console.log(`- builds/VideoAdGuard-firefox-v${version}.zip`);
  } catch (error) {
    console.error('❌ 构建过程出错:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();
