const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const gypFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'binding.gyp');
const hFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'src', 'cpp', 'IrSdkNodeBindings.h');
const helpersFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'src', 'cpp', 'IrSdkBindingHelpers.cpp');

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
    content = content.replace('node::AtExit(cleanUp);', 'node::AddEnvironmentCleanupHook(v8::Isolate::GetCurrent(), cleanUp, nullptr);');
    fs.writeFileSync(hFile, content, 'utf8');
    console.log('Success: Replaced node::AtExit with node::AddEnvironmentCleanupHook in IrSdkNodeBindings.h');
  } else {
    console.log('Info: node::AtExit signature already updated or not found. Skipping.');
  }
} else {
  console.log('Warning: IrSdkNodeBindings.h not found.');
}

// 3. Patch IrSdkBindingHelpers.cpp to replace arr->Set with Nan::Set
if (fs.existsSync(helpersFile)) {
  let content = fs.readFileSync(helpersFile, 'utf8');
  if (content.includes('arr->Set(i, convertTelemetryValueToObject(var, i));')) {
    content = content.replace('arr->Set(i, convertTelemetryValueToObject(var, i));', 'Nan::Set(arr, i, convertTelemetryValueToObject(var, i));');
    fs.writeFileSync(helpersFile, content, 'utf8');
    console.log('Success: Replaced arr->Set with Nan::Set in IrSdkBindingHelpers.cpp');
  } else {
    console.log('Info: arr->Set is already updated or not found. Skipping.');
  }
} else {
  console.log('Warning: IrSdkBindingHelpers.cpp not found.');
}

console.log('node-irsdk patcher finished.');

