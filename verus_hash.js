// This code implements the `-sMODULARIZE` settings by taking the generated
// JS program code (INNER_JS_CODE) and wrapping it in a factory function.

// When targeting node and ES6 we use `await import ..` in the generated code
// so the outer function needs to be marked as async.
async function VerusHashModule(moduleArg = {}) {
  var Module = moduleArg;
// include: shell.js
// include: minimum_runtime_check.js
(function() {
  // "30.0.0" -> 300000
  function humanReadableVersionToPacked(str) {
    str = str.split('-')[0]; // Remove any trailing part from e.g. "12.53.3-alpha"
    var vers = str.split('.').slice(0, 3);
    while(vers.length < 3) vers.push('00');
    vers = vers.map((n, i, arr) => n.padStart(2, '0'));
    return vers.join('');
  }
  // 300000 -> "30.0.0"
  var packedVersionToHumanReadable = n => [n / 10000 | 0, (n / 100 | 0) % 100, n % 100].join('.');

  var TARGET_NOT_SUPPORTED = 2147483647;

  // Note: We use a typeof check here instead of optional chaining using
  // globalThis because older browsers might not have globalThis defined.
  var currentNodeVersion = typeof process !== 'undefined' && process.versions?.node ? humanReadableVersionToPacked(process.versions.node) : TARGET_NOT_SUPPORTED;
  if (currentNodeVersion < TARGET_NOT_SUPPORTED) {
    throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');
  }
  if (currentNodeVersion < 2147483647) {
    throw new Error(`This emscripten-generated code requires node v${ packedVersionToHumanReadable(2147483647) } (detected v${packedVersionToHumanReadable(currentNodeVersion)})`);
  }

  var userAgent = typeof navigator !== 'undefined' && navigator.userAgent;
  if (!userAgent) {
    return;
  }

  var currentSafariVersion = userAgent.includes("Safari/") && !userAgent.includes("Chrome/") && userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/) ? humanReadableVersionToPacked(userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentSafariVersion < 150000) {
    throw new Error(`This emscripten-generated code requires Safari v${ packedVersionToHumanReadable(150000) } (detected v${currentSafariVersion})`);
  }

  var currentFirefoxVersion = userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentFirefoxVersion < 79) {
    throw new Error(`This emscripten-generated code requires Firefox v79 (detected v${currentFirefoxVersion})`);
  }

  var currentChromeVersion = userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentChromeVersion < 85) {
    throw new Error(`This emscripten-generated code requires Chrome v85 (detected v${currentChromeVersion})`);
  }
})();

// end include: minimum_runtime_check.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = !!globalThis.window;
var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


var programArgs = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

var _scriptName;

if (ENVIRONMENT_IS_WORKER) {
  _scriptName = self.location.href;
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_SHELL) {

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  try {
    scriptDirectory = new URL('.', _scriptName).href; // includes trailing slash
  } catch {
    // Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
    // infer anything from them.
  }

  if (!(globalThis.window || globalThis.WorkerGlobalScope)) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = async (url) => {
    assert(!isFileURI(url), "readAsync does not work with file:// URLs");
    var response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok) {
      return response.arrayBuffer();
    }
    throw new Error(response.status + ' : ' + response.url);
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

var out = console.log.bind(console);
var err = console.error.bind(console);

var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

// perform assertions in shell.js after we set up out() and err(), as otherwise
// if an assertion fails it cannot print the message

assert(!ENVIRONMENT_IS_WEB, 'web environment detected but not enabled at build time (add `web` to `-sENVIRONMENT` to enable)');

assert(!ENVIRONMENT_IS_NODE, 'node environment detected but not enabled at build time (add `node` to `-sENVIRONMENT` to enable)');

assert(!ENVIRONMENT_IS_SHELL, 'shell environment detected but not enabled at build time (add `shell` to `-sENVIRONMENT` to enable)');

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;

if (!globalThis.WebAssembly) {
  err('no native wasm support detected');
}

// Wasm globals

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');

// include: runtime_common.js
// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = 0x02135467;
  HEAPU32[(((max)+(4))>>2)] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max)>>2)];
  var cookie2 = HEAPU32[(((max)+(4))>>2)];
  if (cookie1 != 0x02135467 || cookie2 != 0x89BACDFE) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// include: runtime_exceptions.js
// Base Emscripten EH error class
class EmscriptenEH {}

class EmscriptenSjLj extends EmscriptenEH {}

// end include: runtime_exceptions.js
// include: runtime_debug.js
var runtimeDebug = true; // Switch to false at runtime to disable logging at the right times

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  if (!runtimeDebug && typeof runtimeDebug != 'undefined') return;
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}

// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) abort('Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)');
})();

function consumedModuleProp(prop) {
  var value = Module[prop];
  var msg = `Attempt to modify \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`;
  if (Array.isArray(value)) {
    value = new Proxy(value, {
      set(target, key, val) {
        abort(msg);
        return false;
      },
      defineProperty(target, key, descriptor) {
        abort(msg);
        return false;
      },
      deleteProperty(target, key) {
        abort(msg);
        return false;
      }
    });
  }
  Object.defineProperty(Module, prop, {
    configurable: true,
    get() { return value; },
    set() {
      abort(msg);
    }
  });
}

function makeInvalidEarlyAccess(name) {
  return () => assert(false, `call to '${name}' via reference taken before Wasm module initialization`);

}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_preloadFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         // The old FS has some functionality that WasmFS lacks.
         name === 'FS_createLazyFile' ||
         name === 'FS_createDevice' ||
         name === 'removeRunDependency';
}

function missingLibrarySymbol(sym) {

  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      },
    });
  }
}

// end include: runtime_debug.js
// include: binaryDecode.js
// Prevent Closure from minifying the binaryDecode() function, or otherwise
// Closure may analyze through the WASM_BINARY_DATA placeholder string into this
// function, leading into incorrect results.
/** @noinline */
function binaryDecode(bin) {
  for (var i = 0, l = bin.length, o = new Uint8Array(l), c; i < l; ++i) {
    c = bin.charCodeAt(i);
    o[i] = ~c >> 8 & c; // Recover the null byte in a manner that is compatible with https://crbug.com/453961758
  }
  return o;
}
// end include: binaryDecode.js
// Memory management

var runtimeInitialized = false;



function updateMemoryViews() {
  var b = wasmMemory.buffer;
  HEAP8 = new Int8Array(b);
  HEAP16 = new Int16Array(b);
  HEAPU8 = new Uint8Array(b);
  HEAPU16 = new Uint16Array(b);
  HEAP32 = new Int32Array(b);
  HEAPU32 = new Uint32Array(b);
  HEAPF32 = new Float32Array(b);
  HEAPF64 = new Float64Array(b);
  HEAP64 = new BigInt64Array(b);
  HEAPU64 = new BigUint64Array(b);
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// end include: runtime_common.js
assert(globalThis.Int32Array && globalThis.Float64Array && Int32Array.prototype.subarray && Int32Array.prototype.set,
       'JS engine does not provide full typed array support');

function preRun() {
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  consumedModuleProp('preRun');
  // Begin ATPRERUNS hooks
  callRuntimeCallbacks(onPreRuns);
  // End ATPRERUNS hooks
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();

  // No ATINITS hooks

  wasmExports['__wasm_call_ctors']();

  // No ATPOSTCTORS hooks
}

function postRun() {
  checkStackCookie();
   // PThreads reuse the runtime from the main thread.

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  consumedModuleProp('postRun');

  // Begin ATPOSTRUNS hooks
  callRuntimeCallbacks(onPostRuns);
  // End ATPOSTRUNS hooks
}

/**
 * @param {string|number=} what
 */
function abort(what) {
  Module['onAbort']?.(what);

  what = `Aborted(${what})`;
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// show errors on likely calls to FS when it was not included
function fsMissing() {
  abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with -sFORCE_FILESYSTEM');
}
var FS = {
  init: fsMissing,
  createDataFile: fsMissing,
  createPreloadedFile: fsMissing,
  createLazyFile: fsMissing,
  open: fsMissing,
  mkdev: fsMissing,
  registerDevice:  fsMissing,
  analyzePath: fsMissing,
  ErrnoError: fsMissing,
};


function createExportWrapper(name, nargs) {
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    var f = wasmExports[name];
    assert(f, `exported native function \`${name}\` not found`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return f(...args);
  };
}

var wasmBinaryFile;

function findWasmBinary() {
  return binaryDecode(' asm   °` `~~` ``|`~~`  ` ` ```~`~~ `~{``~` `||```~`~` `|~`~~ `~~|§env\r__assert_fail env	_abort_js wasi_snapshot_preview1fd_write 	wasi_snapshot_preview1fd_close \nwasi_snapshot_preview1fd_seek envemscripten_resize_heap \n~      \r\r\r   \r\r\r \n\n	\n\n\n\n \n\n\n\n \n\n\n\n\n\n\n\n  \np  AA A ®memory __wasm_call_ctors __indirect_function_table free a\nverus_hash \'malloc _fflush nemscripten_stack_get_end jemscripten_stack_get_base istrerror semscripten_stack_init gemscripten_stack_get_free h_emscripten_stack_restore _emscripten_stack_alloc emscripten_stack_get_current 	& A &#%"$!DCEUV\\^\nýÍ~ g2{{# Ak"  ý   "ý"ýª"ý-  :   ý©"ý -  :    ý"ý©"ý-  :   ýª"ý-  :   ý-  ":   ý -  ":   ý-  "	:   ý-  "\n:  ý  !  ý-  ": 	  ý -  "\r:   ý-  ":   ý-  ": \n  ý -  ":   ý-  ": \r  ý-  ":   ý-  ":     ý\r             ýQ"  s"ý 	 sý \n 	s"ý \n sý  \rs"ý  sý	  s"ý\n  \rsý  s"ý  sý\r  s"ý  sý"Aýk AýlýýNýQ  ý ý 	ý \ný \rý ý	 ý\n ý ý ý\r ý ýýQ  ý\r                ýQ  sý  sý  sý ý\r    ýQý @   kAO\r A !@   j  j-    A|qj"	 Aqr-  s:     Ar"j  j-   	 Aqr-  s:   Aj"AG\r    ý    ý  ýQý   A ¡ A Aü\n  # AÀ k"$   ý   ý   ý  ý  ý   ý   ý  0ý0 A0j! A j! Aj!A !@  At"A ¡ j   A°¡ j   AÀ¡ j   AÐ¡ j   Aà¡ j   Að¡ j   A¢ j   A¢ j  (<!  (86<  (68 (4!  ((64 (0!  (60 ( !	 ( !\n (! (! (,!\r (! ($! (!  (6,  6(  6$  6   6  6  \r6  6   6  6  \n6  	6 Aj"AG\r    ý 0ý 0   ý  ý     ý ý    ý  ý   AÀ j$ ç# AÀ k"$   ý   ý   ý  ý  ý   ý   ý  0ý0 A0j! A j! Aj!A !@   Atj"   Aj   A j   A0j   AÀ j   AÐ j   Aà j   Að j  (<!  (86<  (68 (4!  ((64 (0!	  (60 ( !\n ( ! (! (!\r (,! (! ($! (!  (6,  6(  6$  6   6  6  6  \r6   6  	6  6  \n6 Aj"AG\r    ý 0ý 0   ý  ý     ý ý    ý  ý   AÀ j$ ¤# AÀ k"$      ý    ý  ýQý   ý   ý ýQý  ý    ý  ýQý   ý  0 ý 0ýQý0   )7     )7    ) 7    )07  AÀ j$ ¦# AÀ k"$       ý    ý  ýQý   ý   ý ýQý  ý    ý  ýQý   ý  0 ý 0ýQý0   )7     )7    ) 7    )07  AÀ j$ # AÀ k"$   ý   ý   ý  ý  ý   ý   ý  0ý0 A0j! A j! Aj!A !@  At"A ¦ j   A°¦ j   AÀ¦ j   AÐ¦ j   Aà¦ j   Að¦ j   A§ j   A§ j  (<!  (86<  (68 (4!  ((64 (0!  (60 ( !	 ( !\n (! (! (,!\r (! ($! (!  (6,  6(  6$  6   6  6  \r6  6   6  6  \n6  	6 Aj"AG\r    ý 0ý 0   ý  ý     ý ý    ý  ý   AÀ j$ ¤# AÀ k"$      ý    ý  ýQý   ý   ý ýQý  ý    ý  ýQý   ý  0 ý 0ýQý0   )7     )7    ) 7    )07  AÀ j$ Á# A k"$   ý   ý   ý  ý A ¡   Aj"A°¡   AÀ¡   AÐ¡   (!  (6 (!  6 (!  (6  6  (6  6 Aà¡   Að¡   A¢   A¢   (!  (6 (!  6 (!  (6  6  (6  6 A ¢   A°¢   AÀ¢   AÐ¢   (!  (6 (!  6 (!  (6  6  (6  6 Aà¢   Að¢   A£   A£   (!  (6 (!  6 (!  (6  6  (6  6 A £   A°£   AÀ£   AÐ£   (!  (6 (!  6 (!  (6  6  (6  6@@   kAO\r A !@   j  j-    j-  s:     Ar"j  j-    j-  s:   Aj"A G\r    ý   ý   ýQý     ý  ý  ýQý  A j$ ~# Ak" 7B ! B 7   B"7@   7H  B"7   "7  B"7`   7h  B"7    "7(  B"7P   7X  B"70   "78  B"7p   7x   §AqAtj) !B!@@     §AqAtj) "BÀ  }!   ! B;V\r     B|"§AqAtj) "B< }!   ! B|!   7    B B?B÷îÝ»÷îÝ»÷   B BB?B³æÌ³æÌ3  B BB?B¢Ä¢Ä 7°~{~{# A k"$    B"§AtjA jý  !B !@    ý "B  §Atj"	6    B §Atj"\n6   §"AqAtj!@@@@@@@@@@ Aq  ý  "\r \ný  "ýQ"ý  ý Aj  ý ! \rý  \rý Aj  	ý  !\r 	   ýQ ý ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý  \n \r \r  A AtAqkAtjý  ýQýQ" \rý¼ ý®Aý­ ýN  \rý½ ý®Aý­ ýNýýQý  \ný  !\r \n 	ý  "  ý   ýQýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý  \r A AtAqkAtjý  "ýQ"ý  ý Aj  ý ! ý  ý Aj  	 \r  ý ýQ ýQ" \rý¼ ý®Aý­ ýN  \rý½ ý®Aý­ ýNýýQý  \ný  "\rý                " \r A AtAqkAtjý   ýQýQ"ý " Ä§ý  ý\r  ýQ" \rý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  \rý½ ý®Aý­ ýNýýQ!@ BP\r  	ý  !\r 	 ý  \r ý  "ýQ"ý  ý Aj  ý ! ý  ý Aj  \n \r  ý ýQ ýQ" \rý¼ ý®Aý­ ýN  \rý½ ý®Aý­ ýNýýQý  	ý  !\r 	 ý  \n \rý   A AtAqkAtjý  ý  ý  ý  Aj \n   \nAj  Aj \nA j   \nA0j   ý "\r ý  "ý\r	\n\rý   \r ý\r ý Aj \nAÀ j   \nAÐ j  Aj \nAà j   \nAð j   ý "\r ý  "ý\r	\n\rý   \r ý\r ý Aj \nAj   \nAj  Aj \nA j   \nA°j  	ý  ! 	 \ný  "\r ý " ý  "ý\r  ýQ  ý\r	\n\rýQ" \rý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  \rý½ ý®Aý­ ýNýýQý  \n ý  B=! A AtAqkAtj!A ! \n!@ Aj! ý  !\r@@ A §t¬P\r    BPý   \rýQ"ý  ý Aj  ý  ýQ!  \rý     BPý  ý   Atj"  Aj Aj   A j  Aj A0j  ý  "\r ý "ý\r	\n\r ýQ \r ý\r "\rýQ! Aj!  \rý  B R! ! B|! \r  	ý  ! 	 \ný  "\r \r ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN \r ý½ ý®Aý­ ýNýýQý  \n ý  \ný  "\r A AtAqkAtjý  ýQ"ý  ý Aj  	ý  ! 	 \r ý  ýQ" \rý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  \rý½ ý®Aý­ ýNýýQý  \n ý  	ý  " ý  ýQ"\rý  \rý Aj  \ný  !\r \n  ý  ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý  	 \r \r ýQ" \rý¼ ý®Aý­ ýN  \rý½ ý®Aý­ ýNýýQý   A AtAqkAtjý   	ý  "ýQ"\rý  \rý Aj  \ný  !\r \n  ý  ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý  \r ý  ýQ"ý  ý Aj  	 \r ý  ýQ" \rý¼ ý®Aý­ ýN  \rý½ ý®Aý­ ýNýýQý  Aj! B|"B R\r  A j$  ¤{~{~# Aà k"$   ý  " ý  ýQý ý !  ý 0"ý@  ý0   ýQý    B"§AtjA jý  !B !	@    ý "\nB  §Atj"6    \nB §Atj"6  Aj \n§"AqAtj!\r@@@@@@@@@@ Aq  \rý  " ý  "ýQ"ý  ý AÐ j  ý P! ý  ý AÐ j  ý  !    ýQ ý PýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý      \rA AtAqkAtjý  ýQýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  ý  !  ý  "  \rý   ýQýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   \rA AtAqkAtjý  "ýQ"ý  ý AÐ j  ý P! ý  ý AÐ j     ý PýQ ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  ý  "ý                "  \rA AtAqkAtjý   ýQýQ"ý " \nÄ§ý  ý\r  ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQ!@ BP\r  ý  !  ý   \rý  "ýQ"ý  ý AÐ j  ý P! ý  ý AÐ j     ý PýQ ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  ý  !  ý   ý   \rA AtAqkAtjý  ýP  \rý  ý  AÐ j    Aj  AÐ j A j   A0j   ý P" ý  "ý\r	\n\rý    ý\r ýP AÐ j AÀ j   AÐ j  AÐ j Aà j   Að j   ý P" ý  "ý\r	\n\rý    ý\r ýP AÐ j Aj   Aj  AÐ j A j   A°j  ý  !  ý  " ý P" ý  "ý\r  ýQ  ý\r	\n\rýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   ý  \nB=! \rA AtAqkAtj!A ! !@ Aj! ý  !@@ \n BP\r   \r BPý   ýQ"ý  ý AÐ j  ý P ýQ!  ý   \r  BPý  ýP   Atj"  AÐ j Aj   A j  AÐ j A0j  ý  " ý P"ý\r	\n\r ýQ  ý\r "ýQ! Aj!  ý  B R! ! B|! \r  ý  !  ý  "  ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   ý  \nB=! \rA AtAqkAtj! \nÄ! !@ B! ý  !@@ \n BP\r ý                "  \r Pý   ýQý  §ý  ý\r ! \r  Pý   ýQ"ý  ý AÐ j  ý P" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNý! Aj!  ýQ! B R! B|! \r   ý   ýQý   ý  ý  " \rý  ýQ"ý  ý AÐ j  ý  !   ý P ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý     ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý   \rA AtAqkAtjý   ý  "ýQ"ý  ý AÐ j  ý  !   ý P ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   \rý  ýQ"ý  ý AÐ j    ý P ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  Aj! 	B|"	B R\r  Aà j$  ¹{~{~# Aà k"$   ý  " ý  ýQý ý !  ý 0"ý@  ý0   ýQý    B"§AtjA jý  !B !	@    ý "\nB  §Atj"6    \nB §Atj"6  Aj \n§"AqAtj!\r@@@@@@@@@@ Aq  \rý  " ý  "ýQ"ý  ý AÐ j  ý P! ý  ý AÐ j  ý  !    ýQ ý PýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý      \rA AtAqkAtjý  ýQýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  ý  !  ý  "  \rý   ýQýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   \rA AtAqkAtjý  "ýQ"ý  ý AÐ j  ý P! ý  ý AÐ j     ý PýQ ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  ý  !  ý  "ý                "  \rA AtAqkAtjý   ýQýQ"ý " \nÄ§ý  ý\r  ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý @ BP\r  \rý  " ýQ"ý  ý AÐ j  ý P! ý  ý AÐ j     ý PýQ ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý   ý  \rý   ýQ!  \rA AtAqkAtjý  ýP  \rý  ý  AÐ j    Aj  AÐ j A j   A0j   ý P" ý  "ý\r	\n\rý    ý\r ýP AÐ j AÀ j   AÐ j  AÐ j Aà j   Að j   ý P" ý  "ý\r	\n\rý    ý\r ýP AÐ j Aj   Aj  AÐ j A j   A°j  ý  !  ý  " ý P" ý  "ý\r  ýQ  ý\r	\n\rýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   ý  \nB=! \rA AtAqkAtj!A ! !@ Aj! ý  !@@ \n BP\r   \r BPý   ýQ"ý  ý AÐ j  ý P ýQ!  ý   \r  BPý  ýP   Atj"  AÐ j Aj   A j  AÐ j A0j  ý  " ý P"ý\r	\n\r ýQ  ý\r "ýQ! Aj!  ý  B R! ! B|! \r  ý  !  ý  "  ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   ý  \nB=! \rA AtAqkAtj! \nÄ! !@ B! ý  !@@ \n BP\r ý                "  \r Pý   ýQ"ý  §ý  ý\r ! \r  Pý   ýQ"ý  ý AÐ j  ý P" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNý! Aj!  ýQ! B R! B|! \r  ý  !  ý    ýQý  ý  " \rý  ýQ"ý  ý AÐ j  ý  !   ý P ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý      \rA AtAqkAtjý  ýQýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý   \rA AtAqkAtjý   ý  "ýQ"ý  ý AÐ j  ý  !   ý P ýQ" ý¼ý @   @   @   @  "ý®Aý­ýÿÿ  ÿÿ  ÿÿ  ÿÿ  "ýN  ý½ ý®Aý­ ýNýýQý   \rý  ýQ"ý  ý AÐ j    ý P ýQ" ý¼ ý®Aý­ ýN  ý½ ý®Aý­ ýNýýQý  Aj! 	B|"	B R\r  Aà j$  {~{# A k"$       ! ý              ý ý´       ¯       ý ýî       õ       ýp ýØ       Ã       ý` ýZ       A       ýP ýl       w       ý@ ý6       -       ý0 ý               ý  ý               ýQ! A j ý"§AqAtj) !B !	B!@@ A j  §AqAtj) "\nBÀ  } 	!	 \n  ! B;V\r A j  B|"\n§AqAtj) "B< } 	!	  \n ! B|!  ý 6-lwZAØÃîõ´¯ý   	ýý                ý\r ý ý 	ý!A !@A !@ Aj j,  " A H\r  A j  Aqr-  !  j :  A !@ Aj Ar" j,  "A H\r  A j Aqr-  !   j :   Aj"AG\r  ý  !\r A j$  \r ýQ ýQý {~{# A k"$       ! ý              ý ý´       ¯       ý ýî       õ       ýp ýØ       Ã       ý` ýZ       A       ýP ýl       w       ý@ ý6       -       ý0 ý               ý  ý               ýQ! A j ý"§AqAtj) !B !	B!@@ A j  §AqAtj) "\nBÀ  } 	!	 \n  ! B;V\r A j  B|"\n§AqAtj) "B< } 	!	  \n ! B|!  ý 6-lwZAØÃîõ´¯ý   	ýý                ý\r ý ý 	ý!A !@A !@ Aj j,  " A H\r  A j  Aqr-  !  j :  A !@ Aj Ar" j,  "A H\r  A j Aqr-  !   j :   Aj"AG\r  ý  !\r A j$  \r ýQ ýQý {~{# A k"$       ! ý              ý ý´       ¯       ý ýî       õ       ýp ýØ       Ã       ý` ýZ       A       ýP ýl       w       ý@ ý6       -       ý0 ý               ý  ý               ýQ! A j ý"§AqAtj) !B !	B!@@ A j  §AqAtj) "\nBÀ  } 	!	 \n  ! B;V\r A j  B|"\n§AqAtj) "B< } 	!	  \n ! B|!  ý 6-lwZAØÃîõ´¯ý   	ýý                ý\r ý ý 	ý!A !@A !@ Aj j,  " A H\r  A j  Aqr-  !  j :  A !@ Aj Ar" j,  "A H\r  A j Aqr-  !   j :   Aj"AG\r  ý  !\r A j$  \r ýQ ýQý M@@A (à " AqE\r A A 6à A ! A A   ! A   6 « @@@A (à " AqE\r A A 6à   E\r  A ! A !A ! A ! A !A !A  6¨« A  6¤« A   6¬« ®@@ E\r   (   (¨"jA j! A  k"I\r@ E\r    ü\n    (¤  ( A (¤«     A 6¨    ) B 7   O\r @  j!  ( A j!@  k"AK\r  ! !  ý  ý   ý   ý    (¤  ( A (¤«     A 6¨    ) B 7  A j" I\r   @ E\r    ü\n      (¨ j6¨  @A (°« "E\r  á @A (´« "E\r  á       B  B  B  ý                 ý                 ý                ®{@ AK\r  ý                "ý   ý  @ ß "\r  ý                "ý   ý  @ E\r     ü\n    6 l@A (¸« "\r   A AÀï A¨ "6¸«  A 6¨ ý                "ý   ý0  ý@  ýP  Aà j6¤  A j6     A (¸«  ©  á õ{  BÅ  « "ý                "ýP  ý@  ý0  ý  A 6¨  Aà j6¤  A j6 @A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ @A (°« \r AÃ Á Aû A¯ AÜ A¶    ~# Ak"$ A   (¨"k!  ( !@@ A AI"E\r   (  jA j  ü\n    j!  k"A J\r   ( ª !  ( !@A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ      )" A (´« ( j §jAj  (  "7A   (¨"k!@@ A AI"E\r   (  jA j Aj ü\n    j!  k"A J\r    (    )B §AtjA (¨«    Aj$ ð# A k"$ @@A - ¼« E\r A (°« !A A: ¼« A A 6°« A A A þ A A 6´« A A A þ A (°« !A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ BBÀ A (´« "( "¬By}§!@@ )    )   Aj)    Aj)   )   )  Aj)    Aj)  P\r  Aq! !  !@ Au"	AH\r  	Aq!\n  ! !@ 	AI\r  	Aüÿÿÿq!  ! !A !	@  A (¬«    A j" A (¬«    AÀ j" A (¬«    Aà j" A (¬«    Aj! 	Aj"	 G\r  \nE\r !	A !@ " 	A (¬«    A j! !	 Aj" \nG\r @ E\r   A (¬«    E\r    ü\n     ý ý   ý  ý  E\r  j  ü\n   E\r    j ü\n  @  k"E\r   j jA  ü  A j$  à{# Ak"$    B`7 @@@A (à "AqE\r A A 6à  E\r @ AH\r @ AF\r   A 6  A 6  A 6  A 6  A 6  A 6@ AH\r @ AF\r   A 6  A 6  A 6  A 6  A 6  A 6@A - ¼« "\r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ A - ¼« !@A (°« E\r   ) !@ Aÿq\r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ A - ¼« ! A (´« 5 Q\r @ Aÿq\r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ @A (°« "E\r  á A A 6°« @A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ @A (´« "E\r  á A A 6´« A - ¼« !@ Aÿq\r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ @@@A (°« E\r   ) !@A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ   ( ! A 6 AjA  Atã  (!@A (°« "E\r   F\r  á A  6°« @A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ A (°« !@@ E\r @A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ A$ï "A 6  ý                "ý  ý @A (´« "E\r   F\r  á A  6´« A - ¼« \rA A: ¼« A A 6°« A A A þ A A 6´« A A A þ A (´« "\r@A - ¼« \r A A: ¼« A A 6°« A A A þ A A 6´« A A A þ @A (°« "E\r  á A A 6°«   ý                ý    ) ">   BBÀ  By}B7 Aj$    A  AÀ« é A G!@@@  AqE\r  E\r  Aÿq!@  -   F\r Aj"A G!  Aj" AqE\r \r  E\r@  -   AÿqF\r  AI\r  AÿqAl!@A  (  s"k rAxqAxG\r  Aj!  A|j"AK\r  E\r Aÿq!@@  -   G\r     Aj!  Aj"\r A  A* ¯  AÄ« N° ! A A 6ô« A   6Ü« A A A k6ø« A A (ä 6ü«  A   [@  \r AA !@@ - À¬ AG\r Aj"AG\r A AÀ¬ jA:   AtA 6À­    6 A 5A!@  Aÿ K\r   - À¬ AG\r   At 6À­ A !  AÀ± ´ AÄ±  AÀ± µ \\    (H"Aj r6H@  ( "AqE\r    A r6 A  B 7    (,"6   6     (0j6A   @    ü\n    @ AI\r     »    j!@@   sAq\r @@  Aq\r   !@ \r   !  !@  -  :   Aj! Aj"AqE\r  I\r  A|q!@ AÀ I\r   A@j"K\r @  ( 6   (6  (6  (6  (6  (6  (6  (6  ( 6   ($6$  ((6(  (,6,  (060  (464  (868  (<6< AÀ j! AÀ j" M\r   O\r@  ( 6  Aj! Aj" I\r @ AO\r   !@ AO\r   ! A|j!  !@  -  :    - :   - :   - :  Aj! Aj" M\r @  O\r @  -  :   Aj! Aj" G\r   æ@@ ("\r A ! º \r (!@   ("kM\r      ($  @@ (PA H\r  E\r  !@@   j"Aj-  A\nF\r Aj"E\r      ($  " I\r  k! (!  !A !   ¼   ( j6  j! ,@    l" ½ " G\r  A    n$  Æ !AA    A  ¾ G³# Ak"$   : @@  ("\r @  º E\r A!  (!@  (" F\r   (P Aÿq"F\r    Aj6  :  @   AjA  ($  AF\r A! - ! Aj$  l @  Aè ¿ A N\r A@A (¸ A\nF\r A (ü " A (ø F\r A   Aj6ü   A\n:  A Aè A\nÀ Au	   # A k"$    ("6  (!  6  6   k"6  j!@@@@@  (< AjAr Aj  F""AA " Aj Ø E\r  !@  ("F\r@ AJ\r  ! AA   ("K"	j" (   A  	k"j6  AA 	j" (  k6   k! !  (<   	k" Aj Ø E\r  AG\r    (,"6   6     (0j6 !A !  A 6  B 7    ( A r6  AF\r   (k! A j$   A  B   !@@  AqE\r @  -  \r     k  !@ Aj"AqE\r -  \r @ "Aj!A ( "k rAxqAxF\r @ "Aj! -  \r    k  A  ® "  k  ~@  ½"B4§Aÿq"AÿF\r @ \r @@  D        b\r A !  D      ðC¢ È !  ( A@j!  6     Axj6  BÿÿÿÿÿÿÿBð?¿!   ® @@ AH\r   D      à¢! @ AÿO\r  Axj!  D      à¢!  Aý AýIApj! AxJ\r   D      `¢! @ A¸pM\r  AÉj!  D      `¢!  Aðh AðhKAj!   Aÿj­B4¿¢ò~@ E\r    :     j"Aj :   AI\r    :    :  A}j :   A~j :   AI\r    :  A|j :   A	I\r   A   kAq"j" AÿqAl"6    kA|q"j"A|j 6  A	I\r   6  6 Axj 6  Atj 6  AI\r   6  6  6  6 Apj 6  Alj 6  Ahj 6  Adj 6   AqAr"k"A I\r  ­B~!  j!@  7  7  7  7  A j! A`j"AK\r   æ# AÐk"$   6Ì A jA A(ü   (Ì6È@@A   AÈj AÐ j A j  Ì A N\r A!     ( "A_q6 @@@@  (0\r   AÐ 60  A 6  B 7  (,!   6,A !  (\rA!  º \r    AÈj AÐ j A j  Ì ! A q!@ E\r   A A   ($    A 60   6,  A 6  (!  B 7 A !    ( " r6 A  A q!  AÐj$   ~# AÀ k"$   6< A)j! A\'j!	 A(j!\nA !A !@@@@@A !\r@ ! \r AÿÿÿÿsJ\r \r j! !\r@@@@@@ -  "E\r @@@@ Aÿq"\r  \r! A%G\r \r!@@ - A%F\r  ! \rAj!\r - ! Aj"! A%F\r  \r k"\r Aÿÿÿÿs"J\r\n@  E\r     \rÍ  \r\r  6< Aj!\rA!@ , APj"A	K\r  - A$G\r  Aj!\rA! !  \r6<A !@@ \r,  "A`j"AM\r  \r!A ! \r!A t"AÑqE\r @  \rAj"6<  r! \r, "A`j"A O\r !\rA t"AÑq\r @@ A*G\r @@ , APj"\rA	K\r  - A$G\r @@  \r   \rAtjA\n6 A !  \rAtj( ! Aj!A! \r Aj!@  \r   6<A !A !  ( "\rAj6  \r( !A !  6< AJ\rA  k! AÀ r! A<jÎ "A H\r (<!A !\rA!@@ -  A.F\r A !@ - A*G\r @@ , APj"A	K\r  - A$G\r @@  \r   AtjA\n6 A !  Atj( ! Aj! \r Aj!@  \r A !  ( "Aj6  ( !  6< AJ!  Aj6<A! A<jÎ ! (<!@ \r!A! ",  "\rAjAFI\r Aj! A:l \rjAß j-  "\rAjAÿqAI\r   6<@@ \rAF\r  \rE\r\r@ A H\r @  \r   Atj \r6 \r   Atj) 70  E\r	 A0j \r  Ï  AJ\rA !\r  E\r	  -  A q\r Aÿÿ{q"  AÀ q!A !A ! \n!@@@@@@@@@@@@@@@@@ -  "À"\rASq \r AqAF \r "\rA¨j!	\n  \n!@ \rA¿j  \rAÓ F\rA !A ! )0!A !\r@@@@@@@   (0 6  (0 6  (0 ¬7  (0 ;  (0 :   (0 6  (0 ¬7  A AK! Ar!Aø !\rA !A ! )0" \n \rA qÐ ! P\r AqE\r \rAvA j!A!A !A ! )0" \nÑ ! AqE\r   k"\r  \rJ!@ )0"BU\r  B  }"70A!A !@ AqE\r A!A !A A  Aq"!  \nÒ !  A Hq\r Aÿÿ{q  !@ B R\r  \r  \n! \n!A !  \n k Pj"\r  \rJ!\r - 0!\r (0"\rAÅ  \r!   Aÿÿÿÿ AÿÿÿÿIÇ "\rj!@ AL\r  ! \r!\r ! \r! -  \r )0"PE\rA !\r	@ E\r  (0!A !\r  A  A  Ó  A 6  >  Aj60 Aj!A!A !\r@@ ( "E\r Aj Ú "A H\r   \rkK\r Aj!  \rj"\r I\r A=! \rA H\r\r  A   \r Ó @ \r\r A !\rA ! (0!@ ( "E\r Aj Ú " j" \rK\r   Aj Í  Aj!  \rI\r   A   \r AÀ sÓ   \r  \rJ!\r	  A Hq\r\nA=!   +0    \r    "\rA N\r \r- ! \rAj!\r   \r\n E\rA!\r@@  \rAtj( "E\r  \rAtj   Ï A! \rAj"\rA\nG\r @ \rA\nI\r A!@  \rAtj( \rA! \rAj"\rA\nF\r A!  \r: \'A! 	! \n! ! \n!   k"  J" AÿÿÿÿsJ\rA=!   j"  J"\r K\r  A  \r  Ó     Í   A0 \r  AsÓ   A0  A Ó     Í   A  \r  AÀ sÓ  (<!A !A=!­  6 A! AÀ j$   @  -  A q\r     ½ {A !@  ( ",  APj"A	M\r A @A!@ AÌ³æ K\r A  A\nl"j  AÿÿÿÿsK!   Aj"6  , ! ! ! APj"A\nI\r  ¾ @@@@@@@@@@@@@@@@@@@ Awj 	\n\r  ( "Aj6    ( 6   ( "Aj6    4 7   ( "Aj6    5 7   ( "Aj6    4 7   ( "Aj6    5 7   ( AjAxq"Aj6    ) 7   ( "Aj6    2 7   ( "Aj6    3 7   ( "Aj6    0  7   ( "Aj6    1  7   ( AjAxq"Aj6    ) 7   ( "Aj6    5 7   ( AjAxq"Aj6    ) 7   ( AjAxq"Aj6    ) 7   ( "Aj6    4 7   ( "Aj6    5 7   ( AjAxq"Aj6    + 9       5 @  P\r @ Aj"  §Aq- ð  r:    B" B R\r  . @  P\r @ Aj"  §AqA0r:    B" B R\r  ~@  BT\r @ Aj"  " B\n" B\n~}§A0r:   BÿÿÿÿV\r   §!@  B\nT\r @ Aj" " A\nn"A\nlkA0r:   Aã K\r @ E\r  Aj" A0r:   # Ak"$ @  L\r  AÀq\r     k"A AI"Ê @ \r @   AÍ  A~j"AÿK\r     Í  Aj$      A A Ë È~~|# A°k"$ A ! A 6¬@@ × "	BU\r A!\nA ! "× !	@ AqE\r A!\nA !A A  Aq"\n! \nE!@@ 	Bøÿ Bøÿ R\r   A   \nAj" Aÿÿ{qÓ     \nÍ   A« A®  A q"\rA÷ A²  \r  bAÍ   A    AÀ sÓ     J! Aj!@@@@  A¬jÈ "  "D        a\r   (¬"Aj6¬ A r"Aá G\r A r"Aá F\rA  A H! (¬!  Acj"6¬A  A H! D      °A¢! A Aè A Hj"!\r@ \r ü"6  \rAj!\r  ¸¡D    eÍÍA¢"D        b\r @@ AN\r  ! \r! ! ! !@ A AI!@ \rA|j" I\r  ­!B !	@  5   	|" BëÜ"	BëÜ~}>  A|j" O\r  BëÜT\r  A|j" 	> @@ \r" M\r A|j"\r( E\r   (¬ k"6¬ !\r A J\r @ AJ\r  AjA	nAj! Aæ F!@A  k"\rA	 \rA	I!@@  I\r A A ( !\rAëÜ v!A tAs!A ! !\r@ \r \r( " v j6   q l! \rAj"\r I\r A A ( !\r E\r   6  Aj!  (¬ j"6¬   \rj" "\r Atj   \rkAu J! A H\r A !@  O\r   kAuA	l!A\n!\r ( "A\nI\r @ Aj!  \rA\nl"\rO\r @ A   Aæ Fk A G Aç Fqk"\r  kAuA	lAwjN\r  A`Aìc A Hj \rAÈ j"A	m"Atj!A\n!\r@  A	lk"AJ\r @ \rA\nl!\r Aj"AG\r  Aj!@@ ( "  \rn" \rlk"\r   F\r@@ Aq\r D      @C! \rAëÜG\r  M\r A|j-  AqE\rD     @C!D      à?D      ð?D      ø?  FD      ø?  \rAv"F  I!@ \r  -  A-G\r  ! !   k"6     a\r    \rj"\r6 @ \rAëÜI\r @ A 6 @ A|j" O\r  A|j"A 6   ( Aj"\r6  \rAÿëÜK\r   kAuA	l!A\n!\r ( "A\nI\r @ Aj!  \rA\nl"\rO\r  Aj"\r   \rK!@@ "\r M"\r \rA|j"( E\r @@ Aç F\r  Aq! AsA A " J A{Jq" j!AA~  j! Aq"\r Aw!@ \r  \rA|j( "E\r A\n!A ! A\np\r @ "Aj!  A\nl"pE\r  As! \r kAuA	l!@ A_qAÆ G\r A !   jAwj"A  A J"  H!A !   j jAwj"A  A J"  H!A! AýÿÿÿAþÿÿÿ  r"J\r  A GjAj!@@ A_q"AÆ G\r   AÿÿÿÿsJ\r A  A J!@   Au"s k­ Ò "kAJ\r @ Aj"A0:    kAH\r  A~j" :  A! AjA-A+ A H:    k" AÿÿÿÿsJ\rA!  j" \nAÿÿÿÿsJ\r  A    \nj" Ó     \nÍ   A0   AsÓ @@@@ AÆ G\r  AjA	r!    K"!@ 5  Ò !@@  F\r   AjM\r@ Aj"A0:    AjK\r   G\r  Aj"A0:       kÍ  Aj" M\r @ E\r   AÃ AÍ   \rO\r AH\r@@ 5  Ò " AjM\r @ Aj"A0:    AjK\r     A	 A	HÍ  Awj! Aj" \rO\r A	J! ! \r @ A H\r  \r Aj \r K! AjA	r! !\r@@ \r5  Ò " G\r  Aj"A0:  @@ \r F\r   AjM\r@ Aj"A0:    AjK\r    AÍ  Aj!  rE\r   AÃ AÍ      k"   JÍ   k! \rAj"\r O\r AJ\r   A0 AjAA Ó      kÍ  !  A0 A	jA	A Ó   A    AÀ sÓ     J!  AtAuA	qj!@ AK\r  -  !D      ð?A4 AtkÉ !@ A-G\r    ¡ !    ¡!@ (¬"\r \rAu"s k­ Ò " G\r  Aj"A0:   (¬!\r \nAr! A q! A~j" Aj:   AjA-A+ \rA H:   AH AqEq! Aj!\r@ \r" ü"\rAð j-   r:    \r·¡D      0@¢!@ Aj"\r AjkAG\r  D        a q\r  A.:  Aj!\r D        b\r A! Aûÿÿÿ \n  k"jkJ\r   A    j Aj \r Ajk" A~j H  "j"\r Ó     Í   A0  \r AsÓ    Aj Í   A0  kA A Ó     Í   A   \r AÀ sÓ   \r  \rJ! A°j$  .  ( AjAxq"Aj6    )  )í 9    ½ @  \r A ­   6 A¬A!@@  E\r  Aÿ M\r@@A (ü ( \r  AqA¿F\r­ A6 @ AÿK\r    A?qAr:    AvAÀr:  A@@ A°I\r  A@qAÀG\r   A?qAr:    AvAàr:     AvA?qAr: A@ A|jAÿÿ?K\r    A?qAr:    AvAðr:     AvA?qAr:    AvA?qAr: A­ A6 A!    :  A @  \r A    A Ù       (<Û  Ø K# Ak"$     Aÿq Aj Ø ! )! Aj$ B     (<  Ý ø&# Ak"$ @@@@@  AôK\r @A (º "A  AjAøq  AI"Av"v" AqE\r @@  AsAq j"At"AÀº j" (Èº "(" G\r A  A~ wq6º   A (¨º I\r  ( G\r   6   6 Aj!   Ar6  j" (Ar6 A ( º "M\r@  E\r @@   tA t" A   krqh"At"AÀº j" (Èº " ("G\r A  A~ wq"6º  A (¨º I\r (  G\r  6  6   Ar6   j"  k"Ar6   j 6 @ E\r  AxqAÀº j!A (¬º !@@ A Avt"q\r A   r6º  ! ("A (¨º I\r  6  6  6  6  Aj! A  6¬º A  6 º A (º "	E\r 	hAt(È¼ "(Axq k! !@@@ (" \r  (" E\r  (Axq k"   I"!    !  !  A (¨º "\nI\r (!@@ ("  F\r  (" \nI\r ( G\r  ( G\r   6   6@@@ ("E\r  Aj! ("E\r Aj!@ ! " Aj!  ("\r   Aj!  ("\r   \nI\r A 6 A ! @ E\r @@  ("At"(È¼ G\r  AÈ¼ j  6   \rA  	A~ wq6º   \nI\r@@ ( G\r    6   6  E\r   \nI\r   6@ ("E\r   \nI\r   6   6 ("E\r   \nI\r   6   6@@ AK\r    j" Ar6   j"   (Ar6  Ar6  j" Ar6  j 6 @ E\r  AxqAÀº j!A (¬º ! @@A Avt" q\r A   r6º  ! (" \nI\r   6   6   6   6A  6¬º A  6 º  Aj! A!  A¿K\r   Aj"Axq!A (º "E\r A!@  AôÿÿK\r  A& Avg" kvAq  AtkA>j!A  k!@@@@ At(È¼ "\r A ! A !A !  A A Avk AFt!A !@@ (Axq k" O\r  ! ! \r A ! ! !    ("   AvAqj("F   !  At! ! \r @   r\r A !A t" A   kr q" E\r  hAt(È¼ !   E\r@  (Axq k" I!@  ("\r   (!   !    ! !  \r  E\r  A ( º  kO\r  A (¨º "I\r (!@@ ("  F\r  (" I\r ( G\r  ( G\r   6   6@@@ ("E\r  Aj! ("E\r Aj!@ ! " Aj!  ("\r   Aj!  ("\r   I\r A 6 A ! @ E\r @@  ("At"(È¼ G\r  AÈ¼ j  6   \rA  A~ wq"6º   I\r@@ ( G\r    6   6  E\r   I\r   6@ ("E\r   I\r   6   6 ("E\r   I\r   6   6@@ AK\r    j" Ar6   j"   (Ar6  Ar6  j" Ar6  j 6 @ AÿK\r  AøqAÀº j! @@A (º "A Avt"q\r A   r6º   !  (" I\r   6  6   6  6A! @ AÿÿÿK\r  A& Avg" kvAq  AtrA>s!    6 B 7  AtAÈ¼ j!@@@ A  t"q\r A   r6º   6   6 A A  Avk  AFt!  ( !@ "(Axq F\r  Av!  At!   Aqj"("\r  Aj"  I\r   6   6  6  6  I\r ("  I\r   6  6 A 6  6   6 Aj! @A ( º "  I\r A (¬º !@@   k"AI\r   j" Ar6   j 6   Ar6   Ar6   j"   (Ar6A !A !A  6 º A  6¬º  Aj! @A (¤º " M\r A   k"6¤º A A (°º "  j"6°º   Ar6   Ar6  Aj! @@A (ð½ E\r A (ø½ !A B7ü½ A B 7ô½ A  AjApqAØªÕªs6ð½ A A 6¾ A A 6Ô½ A !A !   A/j"j"A  k"q" M\rA ! @A (Ð½ "E\r A (È½ " j" M\r  K\r@@@A - Ô½ Aq\r @@@@@A (°º "E\r AØ½ ! @@   ( "I\r     (jI\r  (" \r A æ "AF\r !@A (ô½ " Aj" qE\r   k  jA   kqj!  M\r@A (Ð½ " E\r A (È½ " j" M\r   K\r æ "  G\r  k q"æ "  (   (jF\r !   AF\r@  A0jI\r   !  kA (ø½ "jA  kq"æ AF\r  j!  ! AG\rA A (Ô½ Ar6Ô½  æ !A æ !  AF\r  AF\r   O\r   k" A(jM\rA A (È½  j" 6È½ @  A (Ì½ M\r A   6Ì½ @@@@A (°º "E\r AØ½ ! @   ( "  ("jF\r  (" \r @@A (¨º " E\r    O\rA  6¨º A ! A  6Ü½ A  6Ø½ A A6¸º A A (ð½ 6¼º A A 6ä½ @  At" AÀº j"6Èº   6Ìº   Aj" A G\r A  AXj" Ax kAq"k"6¤º A   j"6°º   Ar6   jA(6A A (¾ 6´º   O\r   I\r   (Aq\r     j6A  Ax kAq" j"6°º A A (¤º  j"  k" 6¤º    Ar6  jA(6A A (¾ 6´º @ A (¨º O\r A  6¨º   j!AØ½ ! @@@  ( " F\r  (" \r   - AqE\rAØ½ ! @@@   ( "I\r     (j"I\r  (!  A  AXj" Ax kAq"k"6¤º A   j"6°º   Ar6   jA(6A A (¾ 6´º   A\' kAqjAQj"    AjI"A6 A )à½ 7 A )Ø½ 7A  Aj6à½ A  6Ü½ A  6Ø½ A A 6ä½  Aj! @  A6  Aj!  Aj!   I\r   F\r   (A~q6   k"Ar6  6 @@ AÿK\r  AøqAÀº j! @@A (º "A Avt"q\r A   r6º   !  ("A (¨º I\r   6  6A!A!A! @ AÿÿÿK\r  A& Avg" kvAq  AtrA>s!    6 B 7  AtAÈ¼ j!@@@A (º "A  t"q\r A   r6º   6   6 A A  Avk  AFt!  ( !@ "(Axq F\r  Av!  At!   Aqj"("\r  Aj" A (¨º I\r   6   6A!A! ! !  A (¨º "I\r ("  I\r   6  6   6A ! A!A!  j 6   j  6 A (¤º "  M\r A    k"6¤º A A (°º "  j"6°º   Ar6   Ar6  Aj! ­ A06 A ! Â     6     ( j6   à !  Aj$   \n  Ax  kAqj" Ar6 Ax kAqj"  j"k! @@@ A (°º G\r A  6°º A A (¤º   j"6¤º   Ar6@ A (¬º G\r A  6¬º A A ( º   j"6 º   Ar6  j 6 @ ("AqAG\r  (!@@ AÿK\r @ (" AøqAÀº j"F\r  A (¨º I\r ( G\r@  G\r A A (º A~ Avwq6º @  F\r  A (¨º I\r ( G\r  6  6 (!@@  F\r  ("A (¨º I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ !	 "Aj! ("\r  Aj! ("\r  	A (¨º I\r 	A 6 A ! E\r @@  ("At"(È¼ G\r  AÈ¼ j 6  \rA A (º A~ wq6º  A (¨º I\r@@ ( G\r   6  6 E\r A (¨º "I\r  6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6 Axq"  j!   j"(!  A~q6   Ar6   j  6 @  AÿK\r   AøqAÀº j!@@A (º "A  Avt" q\r A    r6º  !  (" A (¨º I\r  6   6  6   6A!@  AÿÿÿK\r   A&  Avg"kvAq AtrA>s!  6 B 7 AtAÈ¼ j!@@@A (º "A t"q\r A   r6º   6   6  A A Avk AFt! ( !@ "(Axq  F\r Av! At!  Aqj"("\r  Aj"A (¨º I\r  6   6  6  6 A (¨º " I\r ("  I\r  6  6 A 6  6  6 AjÂ  Ä\n@@  E\r   Axj"A (¨º "I\r  A|j( "AqAF\r  Axq" j!@ Aq\r  AqE\r  ( "k" I\r   j! @ A (¬º F\r  (!@ AÿK\r @ (" AøqAÀº j"F\r   I\r ( G\r@  G\r A A (º A~ Avwq6º @  F\r   I\r ( G\r  6  6 (!@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! E\r@@  ("At"(È¼ G\r  AÈ¼ j 6  \rA A (º A~ wq6º   I\r@@ ( G\r   6  6 E\r  I\r  6@ ("E\r   I\r  6  6 ("E\r  I\r  6  6 ("AqAG\r A   6 º   A~q6   Ar6   6   O\r ("AqE\r@@ Aq\r @ A (°º G\r A  6°º A A (¤º   j" 6¤º    Ar6 A (¬º G\rA A 6 º A A 6¬º @ A (¬º "	G\r A  6¬º A A ( º   j" 6 º    Ar6   j  6  (!@@ AÿK\r @ (" AøqAÀº j"F\r   I\r ( G\r@  G\r A A (º A~ Avwq6º @  F\r   I\r ( G\r  6  6 (!\n@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! \nE\r @@  ("At"(È¼ G\r  AÈ¼ j 6  \rA A (º A~ wq6º  \n I\r@@ \n( G\r  \n 6 \n 6 E\r  I\r  \n6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6  Axq  j" Ar6   j  6   	G\rA   6 º   A~q6   Ar6   j  6 @  AÿK\r   AøqAÀº j!@@A (º "A  Avt" q\r A    r6º  !  ("  I\r  6   6  6   6A!@  AÿÿÿK\r   A&  Avg"kvAq AtrA>s!  6 B 7 AtAÈ¼ j!@@@@A (º "A t"q\r A   r6º   6 A! A!  A A Avk AFt! ( !@ "(Axq  F\r Av! At!  Aqj"("\r  Aj"  I\r   6 A! A! ! ! !  I\r (" I\r  6  6A !A! A!  j 6   6   j 6 A A (¸º Aj"A 6¸º Â  ±A!@@  A  AK" Ajq\r  ! @ " At!   I\r @ A@  kI\r ­ A06 A @A AjAxq AI"  jAjß "\r A  Axj!@@  Aj q\r  !  A|j"( "Axq   jAjA   kqAxj"A     kAKj"  k"k!@ Aq\r  ( !   6    j6      (AqrAr6   j" (Ar6   ( AqrAr6   j" (Ar6  ä @  ("AqE\r  Axq" AjM\r     AqrAr6   j"  k"Ar6   j" (Ar6  ä   Ajx@@@ AG\r  ß !A! Aq\r Av"E\r iAK\r@ A@ kM\r A0 A AK â !@ \r A0   6 A ! ø	   j!@@@@  ("AqE\r A (¨º ! AqE\r    ( "k" A (¨º "I\r  j!@  A (¬º F\r   (!@ AÿK\r @  (" AøqAÀº j"F\r   I\r (  G\r@  G\r A A (º A~ Avwq6º @  F\r   I\r (  G\r  6  6  (!@@   F\r   (" I\r (  G\r (  G\r  6  6@@@  ("E\r   Aj!  ("E\r  Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! E\r@@    ("At"(È¼ G\r  AÈ¼ j 6  \rA A (º A~ wq6º   I\r@@ (  G\r   6  6 E\r  I\r  6@  ("E\r   I\r  6  6  ("E\r  I\r  6  6 ("AqAG\r A  6 º   A~q6   Ar6  6   I\r@@ ("Aq\r @ A (°º G\r A   6°º A A (¤º  j"6¤º    Ar6  A (¬º G\rA A 6 º A A 6¬º @ A (¬º "	G\r A   6¬º A A ( º  j"6 º    Ar6   j 6  (!@@ AÿK\r @ (" AøqAÀº j"F\r   I\r ( G\r@  G\r A A (º A~ Avwq6º @  F\r   I\r ( G\r  6  6 (!\n@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! \nE\r @@  ("At"(È¼ G\r  AÈ¼ j 6  \rA A (º A~ wq6º  \n I\r@@ \n( G\r  \n 6 \n 6 E\r  I\r  \n6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6   Axq j"Ar6   j 6    	G\rA  6 º   A~q6   Ar6   j 6 @ AÿK\r  AøqAÀº j!@@A (º "A Avt"q\r A   r6º  ! (" I\r   6   6   6   6A!@ AÿÿÿK\r  A& Avg"kvAq AtrA>s!   6  B 7 AtAÈ¼ j!@@@A (º "A t"q\r A   r6º    6    6 A A Avk AFt! ( !@ "(Axq F\r Av! At!  Aqj"("\r  Aj" I\r   6    6    6    6  I\r (" I\r   6   6  A 6   6   6Â   ? Atd~@@  ­B|BøÿÿÿA (¡ " ­|"BÿÿÿÿV\r å  §"O\r  \r­ A06 AA  6¡     A $ A AjApq$  # # k #  # S~@@ AÀ qE\r   A@j­!B ! E\r  AÀ  k­  ­"!  !   7    7S~@@ AÀ qE\r   A@j­!B ! E\r  AÀ  k­  ­"!  !   7    7©~# A k"$  Bÿÿÿÿÿÿ?!@@ B0Bÿÿ"§"AÿjAýK\r   B< B! Aj­!@@  Bÿÿÿÿÿÿÿÿ" BT\r  B|!  BR\r  B |!B   BÿÿÿÿÿÿÿV"!  ­ |!@   P\r  BÿÿR\r   B< BB! Bÿ!@ AþM\r Bÿ!B ! @Aø Aø  P"" k"Að L\r B ! B !  BÀ  !A !@  F\r  Aj   A kë  ) )B R!     ì  ) "B< )B! @@ Bÿÿÿÿÿÿÿÿ ­"BT\r   B|!  BR\r   B  |!   B    BÿÿÿÿÿÿÿV"!  ­! A j$  B4 B  ¿@  \r A !@A (ø E\r A (ø î !@A (¡ E\r A (¡ î  r!@¸ ( " E\r @@  (  (F\r   î  r!  (8" \r ¹  @  (  (F\r   A A   ($    (\r A@  ("  ("F\r     k¬A  ((    A 6  B 7  B 7A  @  ð " \r ñ    >  A  AK!@@ ß "\rý " E\r       A A û  EA !@  AK\r @@  \r A !   At/ " E\r  AÄ j!      ò  A    ö {@@ (L"A H\r  E\r Aÿÿÿÿq± (G\r@  Aÿq" (PF\r  (" (F\r   Aj6   :     À    ÷ @ AÌ j"ø E\r  ô @@  Aÿq" (PF\r  (" (F\r   Aj6   :    À !@ ù AqE\r  ú      ( "Aÿÿÿÿ 6    ( !  A 6  \r   A³ ]# Ak"$   6A ( "   Ô @    Æ jAj-  A\nF\r A\n õ Â  W# Ak"$ A AAA ( "¾   6    Ô A\n õ Â   A (¾ Ä@@@A - ¾ \r A¾ A ¶ \rA A A ¬ A A: ¾ @A - ¾ \r A (¾ A¾ · \rA A: ¾ Aß "E\r  6   6  A (¾ 6A  6¾ A AÌ A ü  AP@@A (¾ "E\rA  (6¾  ( (    á  A A : ¾  ÿ \n   $ #   kApq"$   # §! AÞc|w{òkoÅ0g+þ×«vÊÉ}úYGð­Ô¢¯¤rÀ·ý&6?÷Ì4¥åñqØ1Ç#Ãâë\'²u	,nZ R;Ö³)ã/SÑ í ü±[jË¾9JLXÏÐïªûCM3EùP<¨Q£@8õ¼¶Ú!ÿóÒÍì_DÄ§~=d]s`OÜ"*Fî¸Þ^Ûà2:\nI$\\ÂÓ¬bäyçÈ7mÕN©lVôêez®ºx%.¦´ÆèÝtK½p>µfHöa5W¹ÁáøiÙéÎU(ß¡\r¿æBhA-°T»{uðþÅ²\nÀ æLp÷/¤kdk óá´f`ÏòS-Þ4yO[ý¯¼ó»O{.æêÖDp9¾ÍîyDrHË°ÏË{+í5S·2nîÍê~ïOÚa\'AâÐ|.^CÂg;Çâý_gÌÊ¯°Ù$)îeÔ¹ÊÛìéæñcM«3~­O@*[dÍ·Ô¿0 ö.i¿#¹Ì²-\\ÈªJrUoÞ¦xúÔ).Oú*wk+´ßîj»®Ö26¢IôD¡¦ì¨É _ KI¯ìå\'ãÇ¢xOØ^!sÔÍ.(¹·ÉY§øª:¿k}0Ùïò7°a\rp`bÆüöSÂC0!ÂEÊZ:Ñ6è¯,»hk"<#´qåX¹ºlëX"8¿Óá$Ýý=wÆð®å<Û±"Ëãä ëÿhb`»}÷+ÇN¹-ÑäâÜÓKsN³,ÄKC0aÃG»ChëÝ1²öïç¨u§Û,GÊ~#^wYu<Kaómù¸¹åmw}ÞÖZ§Í]îF©lªé¨kðCkìÁ\'ó;YS¢+3WùPiËÙÐ`SíäaÚ uî,P£¤c¼º»«é¡¥±ð9Ê0Þ\r«)^±=®B´u.¨ó¤TÕ8»ö\n6y·¶®×B_[»4Þ¯ºÿYÎC8TåËARö&xÉ÷Ê¢jó¹TéL5"(nÀ@¾÷ß¥Q®ÏY¦H¼sÁ+Ò~º<aÁ ¡Åéý½ÖJ(Ìju-+   0X0x -0X+0X 0X-0x+0x 0x Unknown error nan crypto/verus_hash.h ERROR: failed to allocate hash buffer - terminating inf false bad_alloc was thrown in -fno-exceptions mode NAN INF CVerusHashV2 . (null) std::__libcpp_tls_create() failed in __cxa_thread_atexit() libc++abi:                           	             \n\n\n  	  	                               \r \r   	   	                                               	                                                  	                                                   	                                              	                                                      	                                                   	         0123456789ABCDEF                 N ë§~ uú ¹,ý·z¼ ú¢ =I×  *_·úXÙ+Ê½áÍÜ@x }gaì å\nÔ Ì>Ov¯  D ® ®` úw!ë+ `A ©£nN                                                        *                    \'9H                                  8R`S  Ê»  Ò  é	>Yi~Success Illegal byte sequence Domain error Result not representable Not a tty Permission denied Operation not permitted No such file or directory No such process File exists Value too large for defined data type No space left on device Out of memory Resource busy Interrupted system call Resource temporarily unavailable Invalid seek Cross-device link Read-only file system Directory not empty Connection reset by peer Operation timed out Connection refused Host is down Host is unreachable Address in use Broken pipe I/O error No such device or address Block device required No such device Not a directory Is a directory Text file busy Exec format error Invalid argument Argument list too long Symbolic link loop Filename too long Too many open files in system No file descriptors available Bad file descriptor No child process Bad address File too large Too many links No locks available Resource deadlock would occur State not recoverable Owner died Operation canceled Function not implemented No message of desired type Identifier removed Device not a stream No data available Device timeout Out of streams resources Link has been severed Protocol error Bad message File descriptor in bad state Not a socket Destination address required Message too large Protocol wrong type for socket Protocol not available Protocol not supported Socket type not supported Not supported Protocol family not supported Address family not supported by protocol Address not available Network is down Network unreachable Connection reset by network Connection aborted No buffer space available Socket is connected Socket not connected Cannot send after socket shutdown Operation already in progress Operation in progress Stale file handle Data consistency error Resource not available Remote I/O error Quota exceeded No medium found Wrong medium type Multihop attempted Required key not available Key has expired Key has been revoked Key was rejected by service  Aà¸                                               Ø                           ÿÿÿÿ\n                                                               h ø                                                                     ÿÿÿÿÿÿÿÿ                                                                 target_features	+bulk-memory+bulk-memory-opt+call-indirect-overlong+\nmultivalue+mutable-globals+nontrapping-fptoint+reference-types+sign-ext+simd128');
}

function getBinarySync(file) {
  return file;
}

async function getWasmBinary(binaryFile) {

  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(binaryFile)) {
      err(`warning: Loading from a file URI (${binaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  // prepare imports
  var imports = {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  };
  return imports;
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;

    assignWasmExports(wasmExports);

    updateMemoryViews();

    return wasmExports;
  }

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    return receiveInstance(result['instance']);
  }

  var info = getWasmImports();

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module['instantiateWasm']) {
    return new Promise((resolve, reject) => {
      try {
        Module['instantiateWasm'](info, (inst, mod) => {
          resolve(receiveInstance(inst, mod));
        });
      } catch(e) {
        err(`Module.instantiateWasm callback failed with error: ${e}`);
        reject(e);
      }
    });
  }

  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  var exports = receiveInstantiationResult(result);
  return exports;
}

// end include: preamble.js

// Begin JS library code


  class ExitStatus {
      name = 'ExitStatus';
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }

  /** @type {!Int16Array} */
  var HEAP16;

  /** @type {!Int32Array} */
  var HEAP32;

  /** not-@type {!BigInt64Array} */
  var HEAP64;

  /** @type {!Int8Array} */
  var HEAP8;

  /** @type {!Float32Array} */
  var HEAPF32;

  /** @type {!Float64Array} */
  var HEAPF64;

  /** @type {!Uint16Array} */
  var HEAPU16;

  /** @type {!Uint32Array} */
  var HEAPU32;

  /** not-@type {!BigUint64Array} */
  var HEAPU64;

  /** @type {!Uint8Array} */
  var HEAPU8;

  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);

  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);


  
    /**
   * @param {number} ptr
   * @param {string} type
   */
  function getValue(ptr, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': return HEAP8[ptr];
      case 'i8': return HEAP8[ptr];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP64[((ptr)>>3)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      case '*': return HEAPU32[((ptr)>>2)];
      default: abort(`invalid type for getValue: ${type}`);
    }
  }

  var noExitRuntime = true;

  function ptrToString(ptr) {
      assert(typeof ptr === 'number', `ptrToString expects a number, got ${typeof ptr}`);
      // Convert to 32-bit unsigned value
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    }

  
    /**
   * @param {number} ptr
   * @param {number} value
   * @param {string} type
   */
  function setValue(ptr, value, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': HEAP8[ptr] = value; break;
      case 'i8': HEAP8[ptr] = value; break;
      case 'i16': HEAP16[((ptr)>>1)] = value; break;
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'i64': HEAP64[((ptr)>>3)] = BigInt(value); break;
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      case '*': HEAPU32[((ptr)>>2)] = value; break;
      default: abort(`invalid type for setValue: ${type}`);
    }
  }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        err(text);
      }
    };

  

  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
      var maxIdx = idx + maxBytesToRead;
      if (ignoreNul) return maxIdx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // As a tiny code save trick, compare idx against maxIdx using a negation,
      // so that maxBytesToRead=undefined/NaN means Infinity.
      while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
      return idx;
    };
  
  
    /**
   * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
   * array that contains uint8 values, returns a copy of that string as a
   * Javascript String object.
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number=} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
  
      var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
  
      // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = '';
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          if ((u0 & 0xF8) != 0xF0) warnOnce(`Invalid UTF-8 leading byte ${ptrToString(u0)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`);
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
    /**
   * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
   * emscripten HEAP, returns a copy of that string as a Javascript String object.
   *
   * @param {number} ptr
   * @param {number=} maxBytesToRead - An optional length that specifies the
   *   maximum number of bytes to read. You can omit this parameter to scan the
   *   string until the first 0 byte. If maxBytesToRead is passed, and the string
   *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
   *   string will cut short at that byte index.
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : '';
    };
  var ___assert_fail = (condition, filename, line, func) =>
      abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);

  var __abort_js = () =>
      abort('native code called abort()');

  var getHeapMax = () =>
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648;
  
  var alignMemory = (size, alignment) => {
      assert(alignment, 'alignment argument is required');
      return Math.ceil(size / alignment) * alignment;
    };
  
  var growMemory = (size) => {
      var oldHeapSize = wasmMemory.buffer.byteLength;
      var pages = ((size - oldHeapSize + 65535) / 65536) | 0;
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
        updateMemoryViews();
        return 1 /*success*/;
      } catch(e) {
        err(`growMemory: Attempted to grow heap from ${oldHeapSize} bytes to ${size} bytes, but got error: ${e}`);
      }
      // implicit 0 return to save code size (caller will cast "undefined" into 0
      // anyhow)
    };
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      // With multithreaded builds, races can happen (another thread might increase the size
      // in between), so return a failure, and let the caller retry.
      assert(requestedSize > oldSize);
  
      // Memory resize rules:
      // 1.  Always increase heap size to at least the requested size, rounded up
      //     to next page multiple.
      // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
      //     geometrically: increase the heap size according to
      //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
      //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
      // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
      //     linearly: increase the heap size by at least
      //     MEMORY_GROWTH_LINEAR_STEP bytes.
      // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
      //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
      // 4.  If we were unable to allocate as much memory, it may be due to
      //     over-eager decision to excessively reserve due to (3) above.
      //     Hence if an allocation fails, cut down on the amount of excess
      //     growth, in an attempt to succeed to perform a smaller allocation.
  
      // A limit is set for how much we can grow. We should not exceed that
      // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);
        return false;
      }
  
      // Loop through potential heap size increases. If we attempt a too eager
      // reservation that fails, cut down on the attempted size and reserve a
      // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
        // but limit overreserving (default to capping at +96MB overgrowth at most)
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296 );
  
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
  
        var replacement = growMemory(newSize);
        if (replacement) {
  
          return true;
        }
      }
      err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);
      return false;
    };

  var SYSCALLS = {
  varargs:undefined,
  getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
  };
  var _fd_close = (fd) => {
      abort('fd_close called without SYSCALLS_REQUIRE_FILESYSTEM');
    };

  var INT53_MAX = 9007199254740992;
  
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
  
  
      return 70;
    ;
  }

  var printCharBuffers = [null,[],[]];
  
  var printChar = (stream, curr) => {
      var buffer = printCharBuffers[stream];
      assert(buffer);
      if (curr === 0 || curr === 10) {
        (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
        buffer.length = 0;
      } else {
        buffer.push(curr);
      }
    };
  
  var flush_NO_FILESYSTEM = () => {
      // flush anything remaining in the buffers during shutdown
      _fflush(0);
      if (printCharBuffers[1].length) printChar(1, 10);
      if (printCharBuffers[2].length) printChar(2, 10);
    };
  
  
  var _fd_write = (fd, iov, iovcnt, pnum) => {
      // hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
      var num = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        for (var j = 0; j < len; j++) {
          printChar(fd, HEAPU8[ptr+j]);
        }
        num += len;
      }
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    };
// End JS library code

// include: postlibrary.js
// This file is included after the automatically-generated JS library code
// but before the wasm module is created.

{

  // Begin ATMODULES hooks
  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];
if (Module['print']) out = Module['print'];
if (Module['printErr']) err = Module['printErr'];
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];

Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

  // End ATMODULES hooks

  checkIncomingModuleAPI();

  if (Module['arguments']) programArgs = Module['arguments'];
  if (Module['thisProgram']) thisProgram = Module['thisProgram'];

  // Assertions on removed incoming Module JS APIs.
  assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
  assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
  assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
  assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
  assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
  assert(typeof Module['ENVIRONMENT'] == 'undefined', 'Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
  assert(typeof Module['STACK_SIZE'] == 'undefined', 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')
  // If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
  assert(typeof Module['wasmMemory'] == 'undefined', 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
  assert(typeof Module['INITIAL_MEMORY'] == 'undefined', 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

  if (Module['preInit']) {
    if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
    while (Module['preInit'].length > 0) {
      Module['preInit'].shift()();
    }
  }
  consumedModuleProp('preInit');
}

// Begin runtime exports
  var missingLibrarySymbols = [
  'writeI53ToI64',
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'readI53FromI64',
  'readI53FromU64',
  'convertI32PairToI53',
  'convertI32PairToI53Checked',
  'convertU32PairToI53',
  'stackAlloc',
  'getTempRet0',
  'setTempRet0',
  'createNamedFunction',
  'zeroMemory',
  'exitJS',
  'withStackSave',
  'strError',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'readEmAsmArgs',
  'jstoi_q',
  'getExecutableName',
  'autoResumeAudioContext',
  'getDynCaller',
  'dynCall',
  'handleException',
  'keepRuntimeAlive',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'callUserCallback',
  'maybeExit',
  'asyncLoad',
  'asmjsMangle',
  'mmapAlloc',
  'HandleAllocator',
  'getUniqueRunDependency',
  'addRunDependency',
  'removeRunDependency',
  'addOnInit',
  'addOnPostCtor',
  'addOnPreMain',
  'addOnExit',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'ccall',
  'cwrap',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'stringToUTF8Array',
  'stringToUTF8',
  'lengthBytesUTF8',
  'intArrayFromString',
  'intArrayToString',
  'AsciiToString',
  'stringToAscii',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToNewUTF8',
  'stringToUTF8OnStack',
  'writeArrayToMemory',
  'registerKeyEventCallback',
  'maybeCStringToJsString',
  'findEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'registerBatteryEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'jsStackTrace',
  'getCallstack',
  'convertPCtoSourceLocation',
  'getEnvStrings',
  'checkWasiClock',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'initRandomFill',
  'randomFill',
  'safeSetTimeout',
  'setImmediateWrapped',
  'safeRequestAnimationFrame',
  'clearImmediateWrapped',
  'registerPostMainLoop',
  'registerPreMainLoop',
  'getPromise',
  'makePromise',
  'addPromise',
  'idsToPromises',
  'makePromiseCallback',
  'ExceptionInfo',
  'findMatchingCatch',
  'incrementUncaughtExceptionCount',
  'decrementUncaughtExceptionCount',
  'Browser_asyncPrepareDataCounter',
  'isLeapYear',
  'ydayFromDate',
  'arraySum',
  'addDays',
  'getSocketFromFD',
  'getSocketAddress',
  'FS_createPreloadedFile',
  'FS_preloadFile',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_fileDataToTypedArray',
  'FS_stdin_getChar',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'webgl_enable_EXT_polygon_offset_clamp',
  'webgl_enable_EXT_clip_control',
  'webgl_enable_WEBGL_polygon_mode',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'emscriptenWebGLGetUniform',
  'webglGetProgramUniformLocation',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'ALLOC_NORMAL',
  'ALLOC_STACK',
  'allocate',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'demangle',
  'stackTrace',
  'getNativeTypeSize',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

  var unexportedSymbols = [
  'run',
  'out',
  'err',
  'callMain',
  'abort',
  'wasmExports',
  'writeStackCookie',
  'checkStackCookie',
  'INT53_MAX',
  'INT53_MIN',
  'bigintToI53Checked',
  'HEAP8',
  'HEAPU8',
  'HEAP16',
  'HEAPU16',
  'HEAP32',
  'HEAPU32',
  'HEAPF32',
  'HEAPF64',
  'HEAP64',
  'HEAPU64',
  'stackSave',
  'stackRestore',
  'ptrToString',
  'getHeapMax',
  'growMemory',
  'ENV',
  'ERRNO_CODES',
  'DNS',
  'Protocols',
  'Sockets',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'alignMemory',
  'wasmTable',
  'wasmMemory',
  'noExitRuntime',
  'addOnPreRun',
  'addOnPostRun',
  'freeTableIndexes',
  'functionsInTableMap',
  'setValue',
  'getValue',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'UTF16Decoder',
  'JSEvents',
  'specialHTMLTargets',
  'findCanvasEventTarget',
  'currentFullscreenStrategy',
  'restoreOldWindowedStyle',
  'UNWIND_CACHE',
  'ExitStatus',
  'flush_NO_FILESYSTEM',
  'emSetImmediate',
  'emClearImmediate_deps',
  'emClearImmediate',
  'promiseMap',
  'uncaughtExceptionCount',
  'exceptionCaught',
  'Browser',
  'requestFullscreen',
  'requestFullScreen',
  'setCanvasSize',
  'getUserMedia',
  'createContext',
  'getPreloadedImageData__data',
  'wget',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'SYSCALLS',
  'preloadPlugins',
  'FS_stdin_getChar_buffer',
  'FS_unlink',
  'FS_createPath',
  'FS_createDevice',
  'FS_readFile',
  'FS',
  'FS_root',
  'FS_mounts',
  'FS_devices',
  'FS_streams',
  'FS_nextInode',
  'FS_nameTable',
  'FS_currentPath',
  'FS_initialized',
  'FS_ignorePermissions',
  'FS_filesystems',
  'FS_syncFSRequests',
  'FS_lookupPath',
  'FS_getPath',
  'FS_hashName',
  'FS_hashAddNode',
  'FS_hashRemoveNode',
  'FS_lookupNode',
  'FS_createNode',
  'FS_destroyNode',
  'FS_isRoot',
  'FS_isMountpoint',
  'FS_isFile',
  'FS_isDir',
  'FS_isLink',
  'FS_isChrdev',
  'FS_isBlkdev',
  'FS_isFIFO',
  'FS_isSocket',
  'FS_flagsToPermissionString',
  'FS_nodePermissions',
  'FS_mayLookup',
  'FS_mayCreate',
  'FS_mayDelete',
  'FS_mayOpen',
  'FS_checkOpExists',
  'FS_nextfd',
  'FS_getStreamChecked',
  'FS_getStream',
  'FS_createStream',
  'FS_closeStream',
  'FS_dupStream',
  'FS_doSetAttr',
  'FS_chrdev_stream_ops',
  'FS_major',
  'FS_minor',
  'FS_makedev',
  'FS_registerDevice',
  'FS_getDevice',
  'FS_getMounts',
  'FS_syncfs',
  'FS_mount',
  'FS_unmount',
  'FS_lookup',
  'FS_mknod',
  'FS_statfs',
  'FS_statfsStream',
  'FS_statfsNode',
  'FS_create',
  'FS_mkdir',
  'FS_mkdev',
  'FS_symlink',
  'FS_rename',
  'FS_rmdir',
  'FS_readdir',
  'FS_readlink',
  'FS_stat',
  'FS_fstat',
  'FS_lstat',
  'FS_doChmod',
  'FS_chmod',
  'FS_lchmod',
  'FS_fchmod',
  'FS_doChown',
  'FS_chown',
  'FS_lchown',
  'FS_fchown',
  'FS_doTruncate',
  'FS_truncate',
  'FS_ftruncate',
  'FS_utime',
  'FS_open',
  'FS_close',
  'FS_isClosed',
  'FS_llseek',
  'FS_read',
  'FS_write',
  'FS_mmap',
  'FS_msync',
  'FS_ioctl',
  'FS_writeFile',
  'FS_cwd',
  'FS_chdir',
  'FS_createDefaultDirectories',
  'FS_createDefaultDevices',
  'FS_createSpecialDirectories',
  'FS_createStandardStreams',
  'FS_staticInit',
  'FS_init',
  'FS_quit',
  'FS_findObject',
  'FS_analyzePath',
  'FS_createFile',
  'FS_createDataFile',
  'FS_forceLoadFile',
  'FS_createLazyFile',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'GL',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'SDL',
  'SDL_gfx',
  'print',
  'printErr',
  'jstoi_s',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);

  // End runtime exports
  // Begin JS library exports
  // End JS library exports

// end include: postlibrary.js

function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
  ignoredModuleProp('logReadFiles');
  ignoredModuleProp('loadSplitModule');
  ignoredModuleProp('onMalloc');
  ignoredModuleProp('onRealloc');
  ignoredModuleProp('onFree');
  ignoredModuleProp('onSbrkGrow');
  ignoredModuleProp('onCOSCacheHit');
  ignoredModuleProp('onCOSCacheMiss');
  ignoredModuleProp('onCOSStore');
}

// Imports from the Wasm binary.
var _free = Module['_free'] = makeInvalidEarlyAccess('_free');
var _verus_hash = Module['_verus_hash'] = makeInvalidEarlyAccess('_verus_hash');
var _malloc = Module['_malloc'] = makeInvalidEarlyAccess('_malloc');
var _fflush = makeInvalidEarlyAccess('_fflush');
var _emscripten_stack_get_end = makeInvalidEarlyAccess('_emscripten_stack_get_end');
var _emscripten_stack_get_base = makeInvalidEarlyAccess('_emscripten_stack_get_base');
var _strerror = makeInvalidEarlyAccess('_strerror');
var _emscripten_stack_init = makeInvalidEarlyAccess('_emscripten_stack_init');
var _emscripten_stack_get_free = makeInvalidEarlyAccess('_emscripten_stack_get_free');
var __emscripten_stack_restore = makeInvalidEarlyAccess('__emscripten_stack_restore');
var __emscripten_stack_alloc = makeInvalidEarlyAccess('__emscripten_stack_alloc');
var _emscripten_stack_get_current = makeInvalidEarlyAccess('_emscripten_stack_get_current');
var memory = makeInvalidEarlyAccess('memory');
var __indirect_function_table = makeInvalidEarlyAccess('__indirect_function_table');
var wasmMemory = makeInvalidEarlyAccess('wasmMemory');

function assignWasmExports(wasmExports) {
  assert(typeof wasmExports['free'] != 'undefined', 'missing Wasm export: free');
  assert(typeof wasmExports['verus_hash'] != 'undefined', 'missing Wasm export: verus_hash');
  assert(typeof wasmExports['malloc'] != 'undefined', 'missing Wasm export: malloc');
  assert(typeof wasmExports['fflush'] != 'undefined', 'missing Wasm export: fflush');
  assert(typeof wasmExports['emscripten_stack_get_end'] != 'undefined', 'missing Wasm export: emscripten_stack_get_end');
  assert(typeof wasmExports['emscripten_stack_get_base'] != 'undefined', 'missing Wasm export: emscripten_stack_get_base');
  assert(typeof wasmExports['strerror'] != 'undefined', 'missing Wasm export: strerror');
  assert(typeof wasmExports['emscripten_stack_init'] != 'undefined', 'missing Wasm export: emscripten_stack_init');
  assert(typeof wasmExports['emscripten_stack_get_free'] != 'undefined', 'missing Wasm export: emscripten_stack_get_free');
  assert(typeof wasmExports['_emscripten_stack_restore'] != 'undefined', 'missing Wasm export: _emscripten_stack_restore');
  assert(typeof wasmExports['_emscripten_stack_alloc'] != 'undefined', 'missing Wasm export: _emscripten_stack_alloc');
  assert(typeof wasmExports['emscripten_stack_get_current'] != 'undefined', 'missing Wasm export: emscripten_stack_get_current');
  assert(typeof wasmExports['memory'] != 'undefined', 'missing Wasm export: memory');
  assert(typeof wasmExports['__indirect_function_table'] != 'undefined', 'missing Wasm export: __indirect_function_table');
  _free = Module['_free'] = createExportWrapper('free', 1);
  _verus_hash = Module['_verus_hash'] = createExportWrapper('verus_hash', 4);
  _malloc = Module['_malloc'] = createExportWrapper('malloc', 1);
  _fflush = createExportWrapper('fflush', 1);
  _emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'];
  _emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'];
  _strerror = createExportWrapper('strerror', 1);
  _emscripten_stack_init = wasmExports['emscripten_stack_init'];
  _emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'];
  __emscripten_stack_restore = wasmExports['_emscripten_stack_restore'];
  __emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
  _emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'];
  memory = wasmMemory = wasmExports['memory'];
  __indirect_function_table = wasmExports['__indirect_function_table'];
}

var wasmImports = {
  /** @export */
  __assert_fail: ___assert_fail,
  /** @export */
  _abort_js: __abort_js,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_write: _fd_write
};


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

var calledRun;

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

async function run() {
  assert(!calledRun);
  calledRun = true;

  stackCheckInit();

  preRun();

  var setStatus = Module['setStatus'];
  if (setStatus) {
    setStatus('Running...');
    // Yield to the event loop to allow the browser to paint "Running..."
    await new Promise((resolve) => setTimeout(resolve, 1));
    // Then we want to clear the status text, but only after the rest of this function runs.
    setTimeout(setStatus, 1, '');
  }

  if (ABORT) return;

  initRuntime();

  Module['onRuntimeInitialized']?.();
  consumedModuleProp('onRuntimeInitialized');

  assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

  postRun();

  checkStackCookie();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    flush_NO_FILESYSTEM();
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
    warnOnce('(this may also be due to not including full filesystem support - try building with -sFORCE_FILESYSTEM)');
  }
}

var wasmExports;

// In modularize mode the generated code is within a factory function so we
// can use await here (since it's not top-level-await).
wasmExports = await createWasm();
await run();

// end include: postamble.js

// include: postamble_modularize.js
// In MODULARIZE mode we wrap the generated code in a factory function
// and return either the Module itself, or a promise of the module.

// Assertion for attempting to access module properties on the incoming
// moduleArg.  In the past we used this object as the prototype of the module
// and assigned properties to it, but now we return a distinct object.  This
// keeps the instance private until it is ready (i.e the promise has been
// resolved).
for (const prop of Object.keys(Module)) {
  if (!(prop in moduleArg)) {
    Object.defineProperty(moduleArg, prop, {
      configurable: true,
      get() {
        abort(`Access to module property ('${prop}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`)
      }
    });
  }
}
// end include: postamble_modularize.js



  return Module;
}

// Export using a UMD style export, or ES6 exports if selected
if (typeof exports === 'object' && typeof module === 'object') {
  module.exports = VerusHashModule;
  // This default export looks redundant, but it allows TS to import this
  // commonjs style module.
  module.exports.default = VerusHashModule;
} else if (typeof define === 'function' && define['amd'])
  define([], () => VerusHashModule);

