const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const gypFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'binding.gyp');
const hFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'src', 'cpp', 'IrSdkNodeBindings.h');
const helpersFile = path.join(projectRoot, 'node_modules', 'node-irsdk', 'src', 'cpp', 'IrSdkBindingHelpers.cpp');

const cbFile = path.join(projectRoot, 'node_modules', 'nan', 'nan_callbacks_12_inl.h');
const implFile = path.join(projectRoot, 'node_modules', 'nan', 'nan_implementation_12_inl.h');

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

// 4. Patch nan_callbacks_12_inl.h for V8 13+ ExternalPointerTypeTag
if (fs.existsSync(cbFile)) {
  let content = fs.readFileSync(cbFile, 'utf8');
  const target = '.As<v8::External>()->Value()';
  const replacement = '.As<v8::External>()->Value(\n#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\nv8::kExternalPointerTypeTagDefault\n#endif\n)';
  if (content.includes(target)) {
    content = content.split(target).join(replacement);
    fs.writeFileSync(cbFile, content, 'utf8');
    console.log('Success: Patched nan_callbacks_12_inl.h for V8 13+ ExternalPointerTypeTag');
  } else {
    console.log('Info: nan_callbacks_12_inl.h already updated or target not found. Skipping.');
  }
} else {
  console.log('Warning: nan_callbacks_12_inl.h not found.');
}

// 5. Patch nan_implementation_12_inl.h for V8 13+ ExternalPointerTypeTag
if (fs.existsSync(implFile)) {
  let content = fs.readFileSync(implFile, 'utf8');
  const target1 = 'return v8::External::New(v8::Isolate::GetCurrent(), value);';
  const replacement1 = 'return v8::External::New(v8::Isolate::GetCurrent(), value\n#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\n, v8::kExternalPointerTypeTagDefault\n#endif\n);';

  const target2 = ', v8::External::New(isolate, reinterpret_cast<void *>(callback)));';
  const replacement2 = ', v8::External::New(isolate, reinterpret_cast<void *>(callback)\n#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\n, v8::kExternalPointerTypeTagDefault\n#endif\n));';

  let updated = false;
  if (content.includes(target1)) {
    content = content.split(target1).join(replacement1);
    updated = true;
  }
  if (content.includes(target2)) {
    content = content.split(target2).join(replacement2);
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(implFile, content, 'utf8');
    console.log('Success: Patched nan_implementation_12_inl.h for V8 13+ ExternalPointerTypeTag');
  } else {
    console.log('Info: nan_implementation_12_inl.h already updated or targets not found. Skipping.');
  }
} else {
  console.log('Warning: nan_implementation_12_inl.h not found.');
}

// 6. Patch better-sqlite3 helpers.cpp SetNativeDataProperty
const helpersFileSqlite = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'src', 'util', 'helpers.cpp');
if (fs.existsSync(helpersFileSqlite)) {
  let content = fs.readFileSync(helpersFileSqlite, 'utf8');
  let updated = false;

  // Use regex to replace 0 with nullptr inside SetNativeDataProperty argument list
  const regex = /func,\s*0,\s*data/g;
  if (regex.test(content)) {
    content = content.replace(regex, (match) => match.replace('0', 'nullptr'));
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(helpersFileSqlite, content, 'utf8');
    console.log('Success: Patched better-sqlite3 helpers.cpp SetNativeDataProperty');
  } else {
    console.log('Info: better-sqlite3 helpers.cpp already patched or target not found. Skipping.');
  }
} else {
  console.log('Warning: better-sqlite3 helpers.cpp not found.');
}

// 7. Patch better-sqlite3 macros.cpp OnlyAddon definition
const macrosFileSqlite = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'src', 'util', 'macros.cpp');
if (fs.existsSync(macrosFileSqlite)) {
  let content = fs.readFileSync(macrosFileSqlite, 'utf8');
  let updated = false;

  if (content.includes('info.Data().As<v8::External>()->Value()')) {
    content = content.replace('#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())', 
      '#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\n#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value(v8::kExternalPointerTypeTagDefault))\n#else\n#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())\n#endif'
    );
    // fallback for CRLF
    content = content.replace('#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())\r', 
      '#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\r\n#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value(v8::kExternalPointerTypeTagDefault))\r\n#else\r\n#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())\r\n#endif\r'
    );
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(macrosFileSqlite, content, 'utf8');
    console.log('Success: Patched better-sqlite3 macros.cpp OnlyAddon definition');
  } else {
    console.log('Info: better-sqlite3 macros.cpp already patched or target not found. Skipping.');
  }
} else {
  console.log('Warning: better-sqlite3 macros.cpp not found.');
}

// 8. Patch better-sqlite3 better_sqlite3.cpp External::New
const mainFileSqlite = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'src', 'better_sqlite3.cpp');
if (fs.existsSync(mainFileSqlite)) {
  let content = fs.readFileSync(mainFileSqlite, 'utf8');
  let updated = false;

  if (content.includes('v8::External::New(isolate, addon)')) {
    content = content.replace('v8::Local<v8::External> data = v8::External::New(isolate, addon);',
      '#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\n\tv8::Local<v8::External> data = v8::External::New(isolate, addon, v8::kExternalPointerTypeTagDefault);\n#else\n\tv8::Local<v8::External> data = v8::External::New(isolate, addon);\n#endif'
    );
    // fallback for CRLF
    content = content.replace('v8::Local<v8::External> data = v8::External::New(isolate, addon);\r',
      '#ifdef V8_EXTERNAL_POINTER_TAG_COUNT\r\n\tv8::Local<v8::External> data = v8::External::New(isolate, addon, v8::kExternalPointerTypeTagDefault);\r\n#else\r\n\tv8::Local<v8::External> data = v8::External::New(isolate, addon);\r\n#endif\r'
    );
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(mainFileSqlite, content, 'utf8');
    console.log('Success: Patched better-sqlite3 better_sqlite3.cpp External::New');
  } else {
    console.log('Info: better-sqlite3 better_sqlite3.cpp already patched or target not found. Skipping.');
  }
} else {
  console.log('Warning: better-sqlite3 better_sqlite3.cpp not found.');
}

console.log('node-irsdk patcher finished.');

