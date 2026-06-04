const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const gypFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'binding.gyp');
const hFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'src', 'cpp', 'IrSdkNodeBindings.h');

console.log('Running node-irsdk patcher...');

// 1. Patch binding.gyp to strip BOM
if (fs.existsSync(gypFile)) {
  let content = fs.readFileSync(gypFile, 'utf8');
  if (content.startsWith('\ufeff')) {
    content = content.replace(/^\ufeff/, '');
    fs.writeFileSync(gypFile, content, 'utf8');
    console.log('Success: BOM stripped from node-irsdk binding.gyp');
  } else {
    console.log('Info: node-irsdk binding.gyp does not contain BOM. Skipping.');
  }
} else {
  console.log('Warning: node-irsdk binding.gyp not found.');
}

// 2. Patch IrSdkNodeBindings.h to update node::AtExit signature
if (fs.existsSync(hFile)) {
  let content = fs.readFileSync(hFile, 'utf8');
  if (content.includes('node::AtExit(cleanUp);')) {
    content = content.replace('node::AtExit(cleanUp);', 'node::AtExit(v8::Isolate::GetCurrent(), cleanUp);');
    fs.writeFileSync(hFile, content, 'utf8');
    console.log('Success: Updated node::AtExit signature in IrSdkNodeBindings.h');
  } else {
    console.log('Info: node::AtExit signature already updated or not found. Skipping.');
  }
} else {
  console.log('Warning: IrSdkNodeBindings.h not found.');
}

console.log('node-irsdk patcher finished.');
