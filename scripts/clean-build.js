#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate the tarballs first
console.log('Building tarballs...');
execSync('oclif pack tarballs --targets darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64', { stdio: 'inherit' });

// Get the version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

// Rename files in dist directory
const distDir = 'dist';
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  
  files.forEach(file => {
    if (file.startsWith('localrun-v') && file.includes('-')) {
      // Only keep .tar.gz files, remove .tar.xz
      if (file.endsWith('.tar.xz')) {
        console.log(`Removing ${file} (keeping only .tar.gz)`);
        fs.unlinkSync(path.join(distDir, file));
        return;
      }
      
      if (file.endsWith('.tar.gz')) {
        // Extract platform and arch from filename
        // Format: localrun-v0.1.17-71914b8-darwin-arm64.tar.gz
        // Target: v0.1.17-darwin-arm64.tar.gz
        
        const parts = file.split('-');
        if (parts.length >= 5) {
          const platform = parts[3];
          const archAndExt = parts.slice(4).join('-'); // handles arm64.tar.gz
          
          const newName = `v${version}-${platform}-${archAndExt}`;
          const oldPath = path.join(distDir, file);
          const newPath = path.join(distDir, newName);
          
          console.log(`Renaming ${file} -> ${newName}`);
          fs.renameSync(oldPath, newPath);
        }
      }
    }
  });
  
  // Remove unwanted files
  const filesToRemove = ['index.js', 'index.d.ts'];
  filesToRemove.forEach(fileName => {
    const filePath = path.join(distDir, fileName);
    if (fs.existsSync(filePath)) {
      console.log(`Removing ${fileName}`);
      fs.unlinkSync(filePath);
    }
  });
}

console.log('Build cleanup completed!');