'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.recursivePatternCapture = recursivePatternCapture;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _doctrine = require('doctrine');

var _doctrine2 = _interopRequireDefault(_doctrine);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _eslint = require('eslint');

var _parse = require('eslint-module-utils/parse');

var _parse2 = _interopRequireDefault(_parse);

var _resolve = require('eslint-module-utils/resolve');

var _resolve2 = _interopRequireDefault(_resolve);

var _ignore = require('eslint-module-utils/ignore');

var _ignore2 = _interopRequireDefault(_ignore);

var _hash = require('eslint-module-utils/hash');

var _unambiguous = require('eslint-module-utils/unambiguous');

var unambiguous = _interopRequireWildcard(_unambiguous);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const log = (0, _debug2.default)('eslint-plugin-import:ExportMap');

const exportCache = new Map();

class ExportMap {
  constructor(path) {
    this.path = path;
    this.namespace = new Map();
    // todo: restructure to key on path, value is resolver + map of names
    this.reexports = new Map();
    /**
     * star-exports
     * @type {Set} of () => ExportMap
     */
    this.dependencies = new Set();
    /**
     * dependencies of this module that are not explicitly re-exported
     * @type {Map} from path = () => ExportMap
     */
    this.imports = new Map();
    this.errors = [];
  }

  get hasDefault() {
    return this.get('default') != null;
  } // stronger than this.has

  get size() {
    let size = this.namespace.size + this.reexports.size;
    this.dependencies.forEach(dep => {
      const d = dep();
      // CJS / ignored dependencies won't exist (#717)
      if (d == null) return;
      size += d.size;
    });
    return size;
  }

  /**
   * Note that this does not check explicitly re-exported names for existence
   * in the base namespace, but it will expand all `export * from '...'` exports
   * if not found in the explicit namespace.
   * @param  {string}  name
   * @return {Boolean} true if `name` is exported by this module.
   */
  has(name) {
    if (this.namespace.has(name)) return true;
    if (this.reexports.has(name)) return true;

    // default exports must be explicitly re-exported (#328)
    if (name !== 'default') {
      for (let dep of this.dependencies) {
        let innerMap = dep();

        // todo: report as unresolved?
        if (!innerMap) continue;

        if (innerMap.has(name)) return true;
      }
    }

    return false;
  }

  /**
   * ensure that imported name fully resolves.
   * @param  {[type]}  name [description]
   * @return {Boolean}      [description]
   */
  hasDeep(name) {
    if (this.namespace.has(name)) return { found: true, path: [this] };

    if (this.reexports.has(name)) {
      const reexports = this.reexports.get(name),
            imported = reexports.getImport();

      // if import is ignored, return explicit 'null'
      if (imported == null) return { found: true, path: [this]

        // safeguard against cycles, only if name matches
      };if (imported.path === this.path && reexports.local === name) {
        return { found: false, path: [this] };
      }

      const deep = imported.hasDeep(reexports.local);
      deep.path.unshift(this);

      return deep;
    }

    // default exports must be explicitly re-exported (#328)
    if (name !== 'default') {
      for (let dep of this.dependencies) {
        let innerMap = dep();
        if (innerMap == null) return { found: true, path: [this]
          // todo: report as unresolved?
        };if (!innerMap) continue;

        // safeguard against cycles
        if (innerMap.path === this.path) continue;

        let innerValue = innerMap.hasDeep(name);
        if (innerValue.found) {
          innerValue.path.unshift(this);
          return innerValue;
        }
      }
    }

    return { found: false, path: [this] };
  }

  get(name) {
    if (this.namespace.has(name)) return this.namespace.get(name);

    if (this.reexports.has(name)) {
      const reexports = this.reexports.get(name),
            imported = reexports.getImport();

      // if import is ignored, return explicit 'null'
      if (imported == null) return null;

      // safeguard against cycles, only if name matches
      if (imported.path === this.path && reexports.local === name) return undefined;

      return imported.get(reexports.local);
    }

    // default exports must be explicitly re-exported (#328)
    if (name !== 'default') {
      for (let dep of this.dependencies) {
        let innerMap = dep();
        // todo: report as unresolved?
        if (!innerMap) continue;

        // safeguard against cycles
        if (innerMap.path === this.path) continue;

        let innerValue = innerMap.get(name);
        if (innerValue !== undefined) return innerValue;
      }
    }

    return undefined;
  }

  forEach(callback, thisArg) {
    this.namespace.forEach((v, n) => callback.call(thisArg, v, n, this));

    this.reexports.forEach((reexports, name) => {
      const reexported = reexports.getImport();
      // can't look up meta for ignored re-exports (#348)
      callback.call(thisArg, reexported && reexported.get(reexports.local), name, this);
    });

    this.dependencies.forEach(dep => {
      const d = dep();
      // CJS / ignored dependencies won't exist (#717)
      if (d == null) return;

      d.forEach((v, n) => n !== 'default' && callback.call(thisArg, v, n, this));
    });
  }

  // todo: keys, values, entries?

  reportErrors(context, declaration) {
    context.report({
      node: declaration.source,
      message: `Parse errors in imported module '${declaration.source.value}': ` + `${this.errors.map(e => `${e.message} (${e.lineNumber}:${e.column})`).join(', ')}`
    });
  }
}

exports.default = ExportMap; /**
                              * parse docs from the first node that has leading comments
                              */

function captureDoc(source, docStyleParsers) {
  const metadata = {};

  // 'some' short-circuits on first 'true'

  for (var _len = arguments.length, nodes = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
    nodes[_key - 2] = arguments[_key];
  }

  nodes.some(n => {
    try {

      let leadingComments;

      // n.leadingComments is legacy `attachComments` behavior
      if ('leadingComments' in n) {
        leadingComments = n.leadingComments;
      } else if (n.range) {
        leadingComments = source.getCommentsBefore(n);
      }

      if (!leadingComments || leadingComments.length === 0) return false;

      for (let name in docStyleParsers) {
        const doc = docStyleParsers[name](leadingComments);
        if (doc) {
          metadata.doc = doc;
        }
      }

      return true;
    } catch (err) {
      return false;
    }
  });

  return metadata;
}

const availableDocStyleParsers = {
  jsdoc: captureJsDoc,
  tomdoc: captureTomDoc

  /**
   * parse JSDoc from leading comments
   * @param  {...[type]} comments [description]
   * @return {{doc: object}}
   */
};function captureJsDoc(comments) {
  let doc;

  // capture XSDoc
  comments.forEach(comment => {
    // skip non-block comments
    if (comment.type !== 'Block') return;
    try {
      doc = _doctrine2.default.parse(comment.value, { unwrap: true });
    } catch (err) {
      /* don't care, for now? maybe add to `errors?` */
    }
  });

  return doc;
}

/**
  * parse TomDoc section from comments
  */
function captureTomDoc(comments) {
  // collect lines up to first paragraph break
  const lines = [];
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    if (comment.value.match(/^\s*$/)) break;
    lines.push(comment.value.trim());
  }

  // return doctrine-like object
  const statusMatch = lines.join(' ').match(/^(Public|Internal|Deprecated):\s*(.+)/);
  if (statusMatch) {
    return {
      description: statusMatch[2],
      tags: [{
        title: statusMatch[1].toLowerCase(),
        description: statusMatch[2]
      }]
    };
  }
}

ExportMap.get = function (source, context) {
  const path = (0, _resolve2.default)(source, context);
  if (path == null) return null;

  return ExportMap.for(childContext(path, context));
};

ExportMap.for = function (context) {
  const path = context.path;


  const cacheKey = (0, _hash.hashObject)(context).digest('hex');
  let exportMap = exportCache.get(cacheKey);

  // return cached ignore
  if (exportMap === null) return null;

  const stats = _fs2.default.statSync(path);
  if (exportMap != null) {
    // date equality check
    if (exportMap.mtime - stats.mtime === 0) {
      return exportMap;
    }
    // future: check content equality?
  }

  // check valid extensions first
  if (!(0, _ignore.hasValidExtension)(path, context)) {
    exportCache.set(cacheKey, null);
    return null;
  }

  // check for and cache ignore
  if ((0, _ignore2.default)(path, context)) {
    log('ignored path due to ignore settings:', path);
    exportCache.set(cacheKey, null);
    return null;
  }

  const content = _fs2.default.readFileSync(path, { encoding: 'utf8' });

  // check for and cache unambiguous modules
  if (!unambiguous.test(content)) {
    log('ignored path due to unambiguous regex:', path);
    exportCache.set(cacheKey, null);
    return null;
  }

  log('cache miss', cacheKey, 'for path', path);
  exportMap = ExportMap.parse(path, content, context);

  // ambiguous modules return null
  if (exportMap == null) return null;

  exportMap.mtime = stats.mtime;

  exportCache.set(cacheKey, exportMap);
  return exportMap;
};

ExportMap.parse = function (path, content, context) {
  var m = new ExportMap(path);

  try {
    var ast = (0, _parse2.default)(path, content, context);
  } catch (err) {
    log('parse error:', path, err);
    m.errors.push(err);
    return m; // can't continue
  }

  if (!unambiguous.isModule(ast)) return null;

  const docstyle = context.settings && context.settings['import/docstyle'] || ['jsdoc'];
  const docStyleParsers = {};
  docstyle.forEach(style => {
    docStyleParsers[style] = availableDocStyleParsers[style];
  });

  // attempt to collect module doc
  if (ast.comments) {
    ast.comments.some(c => {
      if (c.type !== 'Block') return false;
      try {
        const doc = _doctrine2.default.parse(c.value, { unwrap: true });
        if (doc.tags.some(t => t.title === 'module')) {
          m.doc = doc;
          return true;
        }
      } catch (err) {/* ignore */}
      return false;
    });
  }

  const namespaces = new Map();

  function remotePath(value) {
    return _resolve2.default.relative(value, path, context.settings);
  }

  function resolveImport(value) {
    const rp = remotePath(value);
    if (rp == null) return null;
    return ExportMap.for(childContext(rp, context));
  }

  function getNamespace(identifier) {
    if (!namespaces.has(identifier.name)) return;

    return function () {
      return resolveImport(namespaces.get(identifier.name));
    };
  }

  function addNamespace(object, identifier) {
    const nsfn = getNamespace(identifier);
    if (nsfn) {
      Object.defineProperty(object, 'namespace', { get: nsfn });
    }

    return object;
  }

  function captureDependency(declaration) {
    if (declaration.source == null) return null;
    if (declaration.importKind === 'type') return null; // skip Flow type imports
    const importedSpecifiers = new Set();
    const supportedTypes = new Set(['ImportDefaultSpecifier', 'ImportNamespaceSpecifier']);
    let hasImportedType = false;
    if (declaration.specifiers) {
      declaration.specifiers.forEach(specifier => {
        const isType = specifier.importKind === 'type';
        hasImportedType = hasImportedType || isType;

        if (supportedTypes.has(specifier.type) && !isType) {
          importedSpecifiers.add(specifier.type);
        }
        if (specifier.type === 'ImportSpecifier' && !isType) {
          importedSpecifiers.add(specifier.imported.name);
        }
      });
    }

    // only Flow types were imported
    if (hasImportedType && importedSpecifiers.size === 0) return null;

    const p = remotePath(declaration.source.value);
    if (p == null) return null;
    const existing = m.imports.get(p);
    if (existing != null) return existing.getter;

    const getter = thunkFor(p, context);
    m.imports.set(p, {
      getter,
      source: { // capturing actual node reference holds full AST in memory!
        value: declaration.source.value,
        loc: declaration.source.loc
      },
      importedSpecifiers
    });
    return getter;
  }

  const source = makeSourceCode(content, ast);

  ast.body.forEach(function (n) {

    if (n.type === 'ExportDefaultDeclaration') {
      const exportMeta = captureDoc(source, docStyleParsers, n);
      if (n.declaration.type === 'Identifier') {
        addNamespace(exportMeta, n.declaration);
      }
      m.namespace.set('default', exportMeta);
      return;
    }

    if (n.type === 'ExportAllDeclaration') {
      const getter = captureDependency(n);
      if (getter) m.dependencies.add(getter);
      return;
    }

    // capture namespaces in case of later export
    if (n.type === 'ImportDeclaration') {
      captureDependency(n);
      let ns;
      if (n.specifiers.some(s => s.type === 'ImportNamespaceSpecifier' && (ns = s))) {
        namespaces.set(ns.local.name, n.source.value);
      }
      return;
    }

    if (n.type === 'ExportNamedDeclaration') {
      // capture declaration
      if (n.declaration != null) {
        switch (n.declaration.type) {
          case 'FunctionDeclaration':
          case 'ClassDeclaration':
          case 'TypeAlias': // flowtype with babel-eslint parser
          case 'InterfaceDeclaration':
          case 'DeclareFunction':
          case 'TSDeclareFunction':
          case 'TSEnumDeclaration':
          case 'TSTypeAliasDeclaration':
          case 'TSInterfaceDeclaration':
          case 'TSAbstractClassDeclaration':
          case 'TSModuleDeclaration':
            m.namespace.set(n.declaration.id.name, captureDoc(source, docStyleParsers, n));
            break;
          case 'VariableDeclaration':
            n.declaration.declarations.forEach(d => recursivePatternCapture(d.id, id => m.namespace.set(id.name, captureDoc(source, docStyleParsers, d, n))));
            break;
        }
      }

      const nsource = n.source && n.source.value;
      n.specifiers.forEach(s => {
        const exportMeta = {};
        let local;

        switch (s.type) {
          case 'ExportDefaultSpecifier':
            if (!n.source) return;
            local = 'default';
            break;
          case 'ExportNamespaceSpecifier':
            m.namespace.set(s.exported.name, Object.defineProperty(exportMeta, 'namespace', {
              get() {
                return resolveImport(nsource);
              }
            }));
            return;
          case 'ExportSpecifier':
            if (!n.source) {
              m.namespace.set(s.exported.name, addNamespace(exportMeta, s.local));
              return;
            }
          // else falls through
          default:
            local = s.local.name;
            break;
        }

        // todo: JSDoc
        m.reexports.set(s.exported.name, { local, getImport: () => resolveImport(nsource) });
      });
    }

    // This doesn't declare anything, but changes what's being exported.
    if (n.type === 'TSExportAssignment') {
      const exportedName = n.expression.name;
      const declTypes = ['VariableDeclaration', 'ClassDeclaration', 'TSDeclareFunction', 'TSEnumDeclaration', 'TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSAbstractClassDeclaration', 'TSModuleDeclaration'];
      const exportedDecls = ast.body.filter((_ref) => {
        let type = _ref.type,
            id = _ref.id,
            declarations = _ref.declarations;
        return declTypes.includes(type) && (id && id.name === exportedName || declarations && declarations.find(d => d.id.name === exportedName));
      });
      if (exportedDecls.length === 0) {
        // Export is not referencing any local declaration, must be re-exporting
        m.namespace.set('default', captureDoc(source, docStyleParsers, n));
        return;
      }
      exportedDecls.forEach(decl => {
        if (decl.type === 'TSModuleDeclaration') {
          let currentDecl = decl;
          let moduleDecls = [decl];

          // Find recursive TSModuleDeclaration
          while (currentDecl.body && currentDecl.body.type === 'TSModuleDeclaration') {
            currentDecl = currentDecl.body;
            moduleDecls.push(currentDecl);
          }

          if (currentDecl.body && currentDecl.body.body) {
            currentDecl.body.body.forEach(moduleBlockNode => {
              // Export-assignment exports all members in the namespace,
              // explicitly exported or not.
              const namespaceDecl = moduleBlockNode.type === 'ExportNamedDeclaration' ? moduleBlockNode.declaration : moduleBlockNode;

              if (namespaceDecl.type === 'VariableDeclaration') {
                namespaceDecl.declarations.forEach(d => recursivePatternCapture(d.id, id => m.namespace.set(id.name, captureDoc.apply(undefined, [source, docStyleParsers].concat(moduleDecls, [namespaceDecl, moduleBlockNode])))));
              } else {
                m.namespace.set(namespaceDecl.id.name, captureDoc(source, docStyleParsers, moduleBlockNode));
              }
            });
          }
        } else {
          // Export as default
          m.namespace.set('default', captureDoc(source, docStyleParsers, decl));
        }
      });
    }
  });

  return m;
};

/**
 * The creation of this closure is isolated from other scopes
 * to avoid over-retention of unrelated variables, which has
 * caused memory leaks. See #1266.
 */
function thunkFor(p, context) {
  return () => ExportMap.for(childContext(p, context));
}

/**
 * Traverse a pattern/identifier node, calling 'callback'
 * for each leaf identifier.
 * @param  {node}   pattern
 * @param  {Function} callback
 * @return {void}
 */
function recursivePatternCapture(pattern, callback) {
  switch (pattern.type) {
    case 'Identifier':
      // base case
      callback(pattern);
      break;

    case 'ObjectPattern':
      pattern.properties.forEach(p => {
        recursivePatternCapture(p.value, callback);
      });
      break;

    case 'ArrayPattern':
      pattern.elements.forEach(element => {
        if (element == null) return;
        recursivePatternCapture(element, callback);
      });
      break;

    case 'AssignmentPattern':
      callback(pattern.left);
      break;
  }
}

/**
 * don't hold full context object in memory, just grab what we need.
 */
function childContext(path, context) {
  const settings = context.settings,
        parserOptions = context.parserOptions,
        parserPath = context.parserPath;

  return {
    settings,
    parserOptions,
    parserPath,
    path
  };
}

/**
 * sometimes legacy support isn't _that_ hard... right?
 */
function makeSourceCode(text, ast) {
  if (_eslint.SourceCode.length > 1) {
    // ESLint 3
    return new _eslint.SourceCode(text, ast);
  } else {
    // ESLint 4, 5
    return new _eslint.SourceCode({ text, ast });
  }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9FeHBvcnRNYXAuanMiXSwibmFtZXMiOlsicmVjdXJzaXZlUGF0dGVybkNhcHR1cmUiLCJ1bmFtYmlndW91cyIsImxvZyIsImV4cG9ydENhY2hlIiwiTWFwIiwiRXhwb3J0TWFwIiwiY29uc3RydWN0b3IiLCJwYXRoIiwibmFtZXNwYWNlIiwicmVleHBvcnRzIiwiZGVwZW5kZW5jaWVzIiwiU2V0IiwiaW1wb3J0cyIsImVycm9ycyIsImhhc0RlZmF1bHQiLCJnZXQiLCJzaXplIiwiZm9yRWFjaCIsImRlcCIsImQiLCJoYXMiLCJuYW1lIiwiaW5uZXJNYXAiLCJoYXNEZWVwIiwiZm91bmQiLCJpbXBvcnRlZCIsImdldEltcG9ydCIsImxvY2FsIiwiZGVlcCIsInVuc2hpZnQiLCJpbm5lclZhbHVlIiwidW5kZWZpbmVkIiwiY2FsbGJhY2siLCJ0aGlzQXJnIiwidiIsIm4iLCJjYWxsIiwicmVleHBvcnRlZCIsInJlcG9ydEVycm9ycyIsImNvbnRleHQiLCJkZWNsYXJhdGlvbiIsInJlcG9ydCIsIm5vZGUiLCJzb3VyY2UiLCJtZXNzYWdlIiwidmFsdWUiLCJtYXAiLCJlIiwibGluZU51bWJlciIsImNvbHVtbiIsImpvaW4iLCJjYXB0dXJlRG9jIiwiZG9jU3R5bGVQYXJzZXJzIiwibWV0YWRhdGEiLCJub2RlcyIsInNvbWUiLCJsZWFkaW5nQ29tbWVudHMiLCJyYW5nZSIsImdldENvbW1lbnRzQmVmb3JlIiwibGVuZ3RoIiwiZG9jIiwiZXJyIiwiYXZhaWxhYmxlRG9jU3R5bGVQYXJzZXJzIiwianNkb2MiLCJjYXB0dXJlSnNEb2MiLCJ0b21kb2MiLCJjYXB0dXJlVG9tRG9jIiwiY29tbWVudHMiLCJjb21tZW50IiwidHlwZSIsImRvY3RyaW5lIiwicGFyc2UiLCJ1bndyYXAiLCJsaW5lcyIsImkiLCJtYXRjaCIsInB1c2giLCJ0cmltIiwic3RhdHVzTWF0Y2giLCJkZXNjcmlwdGlvbiIsInRhZ3MiLCJ0aXRsZSIsInRvTG93ZXJDYXNlIiwiZm9yIiwiY2hpbGRDb250ZXh0IiwiY2FjaGVLZXkiLCJkaWdlc3QiLCJleHBvcnRNYXAiLCJzdGF0cyIsImZzIiwic3RhdFN5bmMiLCJtdGltZSIsInNldCIsImNvbnRlbnQiLCJyZWFkRmlsZVN5bmMiLCJlbmNvZGluZyIsInRlc3QiLCJtIiwiYXN0IiwiaXNNb2R1bGUiLCJkb2NzdHlsZSIsInNldHRpbmdzIiwic3R5bGUiLCJjIiwidCIsIm5hbWVzcGFjZXMiLCJyZW1vdGVQYXRoIiwicmVzb2x2ZSIsInJlbGF0aXZlIiwicmVzb2x2ZUltcG9ydCIsInJwIiwiZ2V0TmFtZXNwYWNlIiwiaWRlbnRpZmllciIsImFkZE5hbWVzcGFjZSIsIm9iamVjdCIsIm5zZm4iLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImNhcHR1cmVEZXBlbmRlbmN5IiwiaW1wb3J0S2luZCIsImltcG9ydGVkU3BlY2lmaWVycyIsInN1cHBvcnRlZFR5cGVzIiwiaGFzSW1wb3J0ZWRUeXBlIiwic3BlY2lmaWVycyIsInNwZWNpZmllciIsImlzVHlwZSIsImFkZCIsInAiLCJleGlzdGluZyIsImdldHRlciIsInRodW5rRm9yIiwibG9jIiwibWFrZVNvdXJjZUNvZGUiLCJib2R5IiwiZXhwb3J0TWV0YSIsIm5zIiwicyIsImlkIiwiZGVjbGFyYXRpb25zIiwibnNvdXJjZSIsImV4cG9ydGVkIiwiZXhwb3J0ZWROYW1lIiwiZXhwcmVzc2lvbiIsImRlY2xUeXBlcyIsImV4cG9ydGVkRGVjbHMiLCJmaWx0ZXIiLCJpbmNsdWRlcyIsImZpbmQiLCJkZWNsIiwiY3VycmVudERlY2wiLCJtb2R1bGVEZWNscyIsIm1vZHVsZUJsb2NrTm9kZSIsIm5hbWVzcGFjZURlY2wiLCJwYXR0ZXJuIiwicHJvcGVydGllcyIsImVsZW1lbnRzIiwiZWxlbWVudCIsImxlZnQiLCJwYXJzZXJPcHRpb25zIiwicGFyc2VyUGF0aCIsInRleHQiLCJTb3VyY2VDb2RlIl0sIm1hcHBpbmdzIjoiOzs7OztRQThtQmdCQSx1QixHQUFBQSx1Qjs7QUE5bUJoQjs7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TDtBQUNFQSxjQUFRQyxVQUFSLENBQW1CekksT0FBbkIsQ0FBMkI4RyxLQUFLO0FBQzlCL0gsZ0NBQXdCK0gsRUFBRWxGLEtBQTFCLEVBQWlDYixRQUFqQztBQUNELE9BRkQ7QUFHQTs7QUFFRixTQUFLLGNBQUw7QUFDRXlILGNBQVFFLFFBQVIsQ0FBaUIxSSxPQUFqQixDQUEwQjJJLE9BQUQsSUFBYTtBQUNwQyxZQUFJQSxXQUFXLElBQWYsRUFBcUI7QUFDckI1SixnQ0FBd0I0SixPQUF4QixFQUFpQzVILFFBQWpDO0FBQ0QsT0FIRDtBQUlBOztBQUVGLFNBQUssbUJBQUw7QUFDRUEsZUFBU3lILFFBQVFJLElBQWpCO0FBQ0E7QUFwQko7QUFzQkQ7O0FBRUQ7OztBQUdBLFNBQVN6RSxZQUFULENBQXNCN0UsSUFBdEIsRUFBNEJnQyxPQUE1QixFQUFxQztBQUFBLFFBQzNCOEQsUUFEMkIsR0FDYTlELE9BRGIsQ0FDM0I4RCxRQUQyQjtBQUFBLFFBQ2pCeUQsYUFEaUIsR0FDYXZILE9BRGIsQ0FDakJ1SCxhQURpQjtBQUFBLFFBQ0ZDLFVBREUsR0FDYXhILE9BRGIsQ0FDRndILFVBREU7O0FBRW5DLFNBQU87QUFDTDFELFlBREs7QUFFTHlELGlCQUZLO0FBR0xDLGNBSEs7QUFJTHhKO0FBSkssR0FBUDtBQU1EOztBQUdEOzs7QUFHQSxTQUFTNkgsY0FBVCxDQUF3QjRCLElBQXhCLEVBQThCOUQsR0FBOUIsRUFBbUM7QUFDakMsTUFBSStELG1CQUFXdEcsTUFBWCxHQUFvQixDQUF4QixFQUEyQjtBQUN6QjtBQUNBLFdBQU8sSUFBSXNHLGtCQUFKLENBQWVELElBQWYsRUFBcUI5RCxHQUFyQixDQUFQO0FBQ0QsR0FIRCxNQUdPO0FBQ0w7QUFDQSxXQUFPLElBQUkrRCxrQkFBSixDQUFlLEVBQUVELElBQUYsRUFBUTlELEdBQVIsRUFBZixDQUFQO0FBQ0Q7QUFDRiIsImZpbGUiOiJFeHBvcnRNYXAuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZnMgZnJvbSAnZnMnXG5cbmltcG9ydCBkb2N0cmluZSBmcm9tICdkb2N0cmluZSdcblxuaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJ1xuXG5pbXBvcnQgeyBTb3VyY2VDb2RlIH0gZnJvbSAnZXNsaW50J1xuXG5pbXBvcnQgcGFyc2UgZnJvbSAnZXNsaW50LW1vZHVsZS11dGlscy9wYXJzZSdcbmltcG9ydCByZXNvbHZlIGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvcmVzb2x2ZSdcbmltcG9ydCBpc0lnbm9yZWQsIHsgaGFzVmFsaWRFeHRlbnNpb24gfSBmcm9tICdlc2xpbnQtbW9kdWxlLXV0aWxzL2lnbm9yZSdcblxuaW1wb3J0IHsgaGFzaE9iamVjdCB9IGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvaGFzaCdcbmltcG9ydCAqIGFzIHVuYW1iaWd1b3VzIGZyb20gJ2VzbGludC1tb2R1bGUtdXRpbHMvdW5hbWJpZ3VvdXMnXG5cbmNvbnN0IGxvZyA9IGRlYnVnKCdlc2xpbnQtcGx1Z2luLWltcG9ydDpFeHBvcnRNYXAnKVxuXG5jb25zdCBleHBvcnRDYWNoZSA9IG5ldyBNYXAoKVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFeHBvcnRNYXAge1xuICBjb25zdHJ1Y3RvcihwYXRoKSB7XG4gICAgdGhpcy5wYXRoID0gcGF0aFxuICAgIHRoaXMubmFtZXNwYWNlID0gbmV3IE1hcCgpXG4gICAgLy8gdG9kbzogcmVzdHJ1Y3R1cmUgdG8ga2V5IG9uIHBhdGgsIHZhbHVlIGlzIHJlc29sdmVyICsgbWFwIG9mIG5hbWVzXG4gICAgdGhpcy5yZWV4cG9ydHMgPSBuZXcgTWFwKClcbiAgICAvKipcbiAgICAgKiBzdGFyLWV4cG9ydHNcbiAgICAgKiBAdHlwZSB7U2V0fSBvZiAoKSA9PiBFeHBvcnRNYXBcbiAgICAgKi9cbiAgICB0aGlzLmRlcGVuZGVuY2llcyA9IG5ldyBTZXQoKVxuICAgIC8qKlxuICAgICAqIGRlcGVuZGVuY2llcyBvZiB0aGlzIG1vZHVsZSB0aGF0IGFyZSBub3QgZXhwbGljaXRseSByZS1leHBvcnRlZFxuICAgICAqIEB0eXBlIHtNYXB9IGZyb20gcGF0aCA9ICgpID0+IEV4cG9ydE1hcFxuICAgICAqL1xuICAgIHRoaXMuaW1wb3J0cyA9IG5ldyBNYXAoKVxuICAgIHRoaXMuZXJyb3JzID0gW11cbiAgfVxuXG4gIGdldCBoYXNEZWZhdWx0KCkgeyByZXR1cm4gdGhpcy5nZXQoJ2RlZmF1bHQnKSAhPSBudWxsIH0gLy8gc3Ryb25nZXIgdGhhbiB0aGlzLmhhc1xuXG4gIGdldCBzaXplKCkge1xuICAgIGxldCBzaXplID0gdGhpcy5uYW1lc3BhY2Uuc2l6ZSArIHRoaXMucmVleHBvcnRzLnNpemVcbiAgICB0aGlzLmRlcGVuZGVuY2llcy5mb3JFYWNoKGRlcCA9PiB7XG4gICAgICBjb25zdCBkID0gZGVwKClcbiAgICAgIC8vIENKUyAvIGlnbm9yZWQgZGVwZW5kZW5jaWVzIHdvbid0IGV4aXN0ICgjNzE3KVxuICAgICAgaWYgKGQgPT0gbnVsbCkgcmV0dXJuXG4gICAgICBzaXplICs9IGQuc2l6ZVxuICAgIH0pXG4gICAgcmV0dXJuIHNpemVcbiAgfVxuXG4gIC8qKlxuICAgKiBOb3RlIHRoYXQgdGhpcyBkb2VzIG5vdCBjaGVjayBleHBsaWNpdGx5IHJlLWV4cG9ydGVkIG5hbWVzIGZvciBleGlzdGVuY2VcbiAgICogaW4gdGhlIGJhc2UgbmFtZXNwYWNlLCBidXQgaXQgd2lsbCBleHBhbmQgYWxsIGBleHBvcnQgKiBmcm9tICcuLi4nYCBleHBvcnRzXG4gICAqIGlmIG5vdCBmb3VuZCBpbiB0aGUgZXhwbGljaXQgbmFtZXNwYWNlLlxuICAgKiBAcGFyYW0gIHtzdHJpbmd9ICBuYW1lXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgYG5hbWVgIGlzIGV4cG9ydGVkIGJ5IHRoaXMgbW9kdWxlLlxuICAgKi9cbiAgaGFzKG5hbWUpIHtcbiAgICBpZiAodGhpcy5uYW1lc3BhY2UuaGFzKG5hbWUpKSByZXR1cm4gdHJ1ZVxuICAgIGlmICh0aGlzLnJlZXhwb3J0cy5oYXMobmFtZSkpIHJldHVybiB0cnVlXG5cbiAgICAvLyBkZWZhdWx0IGV4cG9ydHMgbXVzdCBiZSBleHBsaWNpdGx5IHJlLWV4cG9ydGVkICgjMzI4KVxuICAgIGlmIChuYW1lICE9PSAnZGVmYXVsdCcpIHtcbiAgICAgIGZvciAobGV0IGRlcCBvZiB0aGlzLmRlcGVuZGVuY2llcykge1xuICAgICAgICBsZXQgaW5uZXJNYXAgPSBkZXAoKVxuXG4gICAgICAgIC8vIHRvZG86IHJlcG9ydCBhcyB1bnJlc29sdmVkP1xuICAgICAgICBpZiAoIWlubmVyTWFwKSBjb250aW51ZVxuXG4gICAgICAgIGlmIChpbm5lck1hcC5oYXMobmFtZSkpIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogZW5zdXJlIHRoYXQgaW1wb3J0ZWQgbmFtZSBmdWxseSByZXNvbHZlcy5cbiAgICogQHBhcmFtICB7W3R5cGVdfSAgbmFtZSBbZGVzY3JpcHRpb25dXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59ICAgICAgW2Rlc2NyaXB0aW9uXVxuICAgKi9cbiAgaGFzRGVlcChuYW1lKSB7XG4gICAgaWYgKHRoaXMubmFtZXNwYWNlLmhhcyhuYW1lKSkgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHBhdGg6IFt0aGlzXSB9XG5cbiAgICBpZiAodGhpcy5yZWV4cG9ydHMuaGFzKG5hbWUpKSB7XG4gICAgICBjb25zdCByZWV4cG9ydHMgPSB0aGlzLnJlZXhwb3J0cy5nZXQobmFtZSlcbiAgICAgICAgICAsIGltcG9ydGVkID0gcmVleHBvcnRzLmdldEltcG9ydCgpXG5cbiAgICAgIC8vIGlmIGltcG9ydCBpcyBpZ25vcmVkLCByZXR1cm4gZXhwbGljaXQgJ251bGwnXG4gICAgICBpZiAoaW1wb3J0ZWQgPT0gbnVsbCkgcmV0dXJuIHsgZm91bmQ6IHRydWUsIHBhdGg6IFt0aGlzXSB9XG5cbiAgICAgIC8vIHNhZmVndWFyZCBhZ2FpbnN0IGN5Y2xlcywgb25seSBpZiBuYW1lIG1hdGNoZXNcbiAgICAgIGlmIChpbXBvcnRlZC5wYXRoID09PSB0aGlzLnBhdGggJiYgcmVleHBvcnRzLmxvY2FsID09PSBuYW1lKSB7XG4gICAgICAgIHJldHVybiB7IGZvdW5kOiBmYWxzZSwgcGF0aDogW3RoaXNdIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgZGVlcCA9IGltcG9ydGVkLmhhc0RlZXAocmVleHBvcnRzLmxvY2FsKVxuICAgICAgZGVlcC5wYXRoLnVuc2hpZnQodGhpcylcblxuICAgICAgcmV0dXJuIGRlZXBcbiAgICB9XG5cblxuICAgIC8vIGRlZmF1bHQgZXhwb3J0cyBtdXN0IGJlIGV4cGxpY2l0bHkgcmUtZXhwb3J0ZWQgKCMzMjgpXG4gICAgaWYgKG5hbWUgIT09ICdkZWZhdWx0Jykge1xuICAgICAgZm9yIChsZXQgZGVwIG9mIHRoaXMuZGVwZW5kZW5jaWVzKSB7XG4gICAgICAgIGxldCBpbm5lck1hcCA9IGRlcCgpXG4gICAgICAgIGlmIChpbm5lck1hcCA9PSBudWxsKSByZXR1cm4geyBmb3VuZDogdHJ1ZSwgcGF0aDogW3RoaXNdIH1cbiAgICAgICAgLy8gdG9kbzogcmVwb3J0IGFzIHVucmVzb2x2ZWQ/XG4gICAgICAgIGlmICghaW5uZXJNYXApIGNvbnRpbnVlXG5cbiAgICAgICAgLy8gc2FmZWd1YXJkIGFnYWluc3QgY3ljbGVzXG4gICAgICAgIGlmIChpbm5lck1hcC5wYXRoID09PSB0aGlzLnBhdGgpIGNvbnRpbnVlXG5cbiAgICAgICAgbGV0IGlubmVyVmFsdWUgPSBpbm5lck1hcC5oYXNEZWVwKG5hbWUpXG4gICAgICAgIGlmIChpbm5lclZhbHVlLmZvdW5kKSB7XG4gICAgICAgICAgaW5uZXJWYWx1ZS5wYXRoLnVuc2hpZnQodGhpcylcbiAgICAgICAgICByZXR1cm4gaW5uZXJWYWx1ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZm91bmQ6IGZhbHNlLCBwYXRoOiBbdGhpc10gfVxuICB9XG5cbiAgZ2V0KG5hbWUpIHtcbiAgICBpZiAodGhpcy5uYW1lc3BhY2UuaGFzKG5hbWUpKSByZXR1cm4gdGhpcy5uYW1lc3BhY2UuZ2V0KG5hbWUpXG5cbiAgICBpZiAodGhpcy5yZWV4cG9ydHMuaGFzKG5hbWUpKSB7XG4gICAgICBjb25zdCByZWV4cG9ydHMgPSB0aGlzLnJlZXhwb3J0cy5nZXQobmFtZSlcbiAgICAgICAgICAsIGltcG9ydGVkID0gcmVleHBvcnRzLmdldEltcG9ydCgpXG5cbiAgICAgIC8vIGlmIGltcG9ydCBpcyBpZ25vcmVkLCByZXR1cm4gZXhwbGljaXQgJ251bGwnXG4gICAgICBpZiAoaW1wb3J0ZWQgPT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgICAgLy8gc2FmZWd1YXJkIGFnYWluc3QgY3ljbGVzLCBvbmx5IGlmIG5hbWUgbWF0Y2hlc1xuICAgICAgaWYgKGltcG9ydGVkLnBhdGggPT09IHRoaXMucGF0aCAmJiByZWV4cG9ydHMubG9jYWwgPT09IG5hbWUpIHJldHVybiB1bmRlZmluZWRcblxuICAgICAgcmV0dXJuIGltcG9ydGVkLmdldChyZWV4cG9ydHMubG9jYWwpXG4gICAgfVxuXG4gICAgLy8gZGVmYXVsdCBleHBvcnRzIG11c3QgYmUgZXhwbGljaXRseSByZS1leHBvcnRlZCAoIzMyOClcbiAgICBpZiAobmFtZSAhPT0gJ2RlZmF1bHQnKSB7XG4gICAgICBmb3IgKGxldCBkZXAgb2YgdGhpcy5kZXBlbmRlbmNpZXMpIHtcbiAgICAgICAgbGV0IGlubmVyTWFwID0gZGVwKClcbiAgICAgICAgLy8gdG9kbzogcmVwb3J0IGFzIHVucmVzb2x2ZWQ/XG4gICAgICAgIGlmICghaW5uZXJNYXApIGNvbnRpbnVlXG5cbiAgICAgICAgLy8gc2FmZWd1YXJkIGFnYWluc3QgY3ljbGVzXG4gICAgICAgIGlmIChpbm5lck1hcC5wYXRoID09PSB0aGlzLnBhdGgpIGNvbnRpbnVlXG5cbiAgICAgICAgbGV0IGlubmVyVmFsdWUgPSBpbm5lck1hcC5nZXQobmFtZSlcbiAgICAgICAgaWYgKGlubmVyVmFsdWUgIT09IHVuZGVmaW5lZCkgcmV0dXJuIGlubmVyVmFsdWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICBmb3JFYWNoKGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gICAgdGhpcy5uYW1lc3BhY2UuZm9yRWFjaCgodiwgbikgPT5cbiAgICAgIGNhbGxiYWNrLmNhbGwodGhpc0FyZywgdiwgbiwgdGhpcykpXG5cbiAgICB0aGlzLnJlZXhwb3J0cy5mb3JFYWNoKChyZWV4cG9ydHMsIG5hbWUpID0+IHtcbiAgICAgIGNvbnN0IHJlZXhwb3J0ZWQgPSByZWV4cG9ydHMuZ2V0SW1wb3J0KClcbiAgICAgIC8vIGNhbid0IGxvb2sgdXAgbWV0YSBmb3IgaWdub3JlZCByZS1leHBvcnRzICgjMzQ4KVxuICAgICAgY2FsbGJhY2suY2FsbCh0aGlzQXJnLCByZWV4cG9ydGVkICYmIHJlZXhwb3J0ZWQuZ2V0KHJlZXhwb3J0cy5sb2NhbCksIG5hbWUsIHRoaXMpXG4gICAgfSlcblxuICAgIHRoaXMuZGVwZW5kZW5jaWVzLmZvckVhY2goZGVwID0+IHtcbiAgICAgIGNvbnN0IGQgPSBkZXAoKVxuICAgICAgLy8gQ0pTIC8gaWdub3JlZCBkZXBlbmRlbmNpZXMgd29uJ3QgZXhpc3QgKCM3MTcpXG4gICAgICBpZiAoZCA9PSBudWxsKSByZXR1cm5cblxuICAgICAgZC5mb3JFYWNoKCh2LCBuKSA9PlxuICAgICAgICBuICE9PSAnZGVmYXVsdCcgJiYgY2FsbGJhY2suY2FsbCh0aGlzQXJnLCB2LCBuLCB0aGlzKSlcbiAgICB9KVxuICB9XG5cbiAgLy8gdG9kbzoga2V5cywgdmFsdWVzLCBlbnRyaWVzP1xuXG4gIHJlcG9ydEVycm9ycyhjb250ZXh0LCBkZWNsYXJhdGlvbikge1xuICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgIG5vZGU6IGRlY2xhcmF0aW9uLnNvdXJjZSxcbiAgICAgIG1lc3NhZ2U6IGBQYXJzZSBlcnJvcnMgaW4gaW1wb3J0ZWQgbW9kdWxlICcke2RlY2xhcmF0aW9uLnNvdXJjZS52YWx1ZX0nOiBgICtcbiAgICAgICAgICAgICAgICAgIGAke3RoaXMuZXJyb3JzXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKGUgPT4gYCR7ZS5tZXNzYWdlfSAoJHtlLmxpbmVOdW1iZXJ9OiR7ZS5jb2x1bW59KWApXG4gICAgICAgICAgICAgICAgICAgICAgICAuam9pbignLCAnKX1gLFxuICAgIH0pXG4gIH1cbn1cblxuLyoqXG4gKiBwYXJzZSBkb2NzIGZyb20gdGhlIGZpcnN0IG5vZGUgdGhhdCBoYXMgbGVhZGluZyBjb21tZW50c1xuICovXG5mdW5jdGlvbiBjYXB0dXJlRG9jKHNvdXJjZSwgZG9jU3R5bGVQYXJzZXJzLCAuLi5ub2Rlcykge1xuICBjb25zdCBtZXRhZGF0YSA9IHt9XG5cbiAgLy8gJ3NvbWUnIHNob3J0LWNpcmN1aXRzIG9uIGZpcnN0ICd0cnVlJ1xuICBub2Rlcy5zb21lKG4gPT4ge1xuICAgIHRyeSB7XG5cbiAgICAgIGxldCBsZWFkaW5nQ29tbWVudHNcblxuICAgICAgLy8gbi5sZWFkaW5nQ29tbWVudHMgaXMgbGVnYWN5IGBhdHRhY2hDb21tZW50c2AgYmVoYXZpb3JcbiAgICAgIGlmICgnbGVhZGluZ0NvbW1lbnRzJyBpbiBuKSB7XG4gICAgICAgIGxlYWRpbmdDb21tZW50cyA9IG4ubGVhZGluZ0NvbW1lbnRzXG4gICAgICB9IGVsc2UgaWYgKG4ucmFuZ2UpIHtcbiAgICAgICAgbGVhZGluZ0NvbW1lbnRzID0gc291cmNlLmdldENvbW1lbnRzQmVmb3JlKG4pXG4gICAgICB9XG5cbiAgICAgIGlmICghbGVhZGluZ0NvbW1lbnRzIHx8IGxlYWRpbmdDb21tZW50cy5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZVxuXG4gICAgICBmb3IgKGxldCBuYW1lIGluIGRvY1N0eWxlUGFyc2Vycykge1xuICAgICAgICBjb25zdCBkb2MgPSBkb2NTdHlsZVBhcnNlcnNbbmFtZV0obGVhZGluZ0NvbW1lbnRzKVxuICAgICAgICBpZiAoZG9jKSB7XG4gICAgICAgICAgbWV0YWRhdGEuZG9jID0gZG9jXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gbWV0YWRhdGFcbn1cblxuY29uc3QgYXZhaWxhYmxlRG9jU3R5bGVQYXJzZXJzID0ge1xuICBqc2RvYzogY2FwdHVyZUpzRG9jLFxuICB0b21kb2M6IGNhcHR1cmVUb21Eb2MsXG59XG5cbi8qKlxuICogcGFyc2UgSlNEb2MgZnJvbSBsZWFkaW5nIGNvbW1lbnRzXG4gKiBAcGFyYW0gIHsuLi5bdHlwZV19IGNvbW1lbnRzIFtkZXNjcmlwdGlvbl1cbiAqIEByZXR1cm4ge3tkb2M6IG9iamVjdH19XG4gKi9cbmZ1bmN0aW9uIGNhcHR1cmVKc0RvYyhjb21tZW50cykge1xuICBsZXQgZG9jXG5cbiAgLy8gY2FwdHVyZSBYU0RvY1xuICBjb21tZW50cy5mb3JFYWNoKGNvbW1lbnQgPT4ge1xuICAgIC8vIHNraXAgbm9uLWJsb2NrIGNvbW1lbnRzXG4gICAgaWYgKGNvbW1lbnQudHlwZSAhPT0gJ0Jsb2NrJykgcmV0dXJuXG4gICAgdHJ5IHtcbiAgICAgIGRvYyA9IGRvY3RyaW5lLnBhcnNlKGNvbW1lbnQudmFsdWUsIHsgdW53cmFwOiB0cnVlIH0pXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAvKiBkb24ndCBjYXJlLCBmb3Igbm93PyBtYXliZSBhZGQgdG8gYGVycm9ycz9gICovXG4gICAgfVxuICB9KVxuXG4gIHJldHVybiBkb2Ncbn1cblxuLyoqXG4gICogcGFyc2UgVG9tRG9jIHNlY3Rpb24gZnJvbSBjb21tZW50c1xuICAqL1xuZnVuY3Rpb24gY2FwdHVyZVRvbURvYyhjb21tZW50cykge1xuICAvLyBjb2xsZWN0IGxpbmVzIHVwIHRvIGZpcnN0IHBhcmFncmFwaCBicmVha1xuICBjb25zdCBsaW5lcyA9IFtdXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29tbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjb21tZW50ID0gY29tbWVudHNbaV1cbiAgICBpZiAoY29tbWVudC52YWx1ZS5tYXRjaCgvXlxccyokLykpIGJyZWFrXG4gICAgbGluZXMucHVzaChjb21tZW50LnZhbHVlLnRyaW0oKSlcbiAgfVxuXG4gIC8vIHJldHVybiBkb2N0cmluZS1saWtlIG9iamVjdFxuICBjb25zdCBzdGF0dXNNYXRjaCA9IGxpbmVzLmpvaW4oJyAnKS5tYXRjaCgvXihQdWJsaWN8SW50ZXJuYWx8RGVwcmVjYXRlZCk6XFxzKiguKykvKVxuICBpZiAoc3RhdHVzTWF0Y2gpIHtcbiAgICByZXR1cm4ge1xuICAgICAgZGVzY3JpcHRpb246IHN0YXR1c01hdGNoWzJdLFxuICAgICAgdGFnczogW3tcbiAgICAgICAgdGl0bGU6IHN0YXR1c01hdGNoWzFdLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBzdGF0dXNNYXRjaFsyXSxcbiAgICAgIH1dLFxuICAgIH1cbiAgfVxufVxuXG5FeHBvcnRNYXAuZ2V0ID0gZnVuY3Rpb24gKHNvdXJjZSwgY29udGV4dCkge1xuICBjb25zdCBwYXRoID0gcmVzb2x2ZShzb3VyY2UsIGNvbnRleHQpXG4gIGlmIChwYXRoID09IG51bGwpIHJldHVybiBudWxsXG5cbiAgcmV0dXJuIEV4cG9ydE1hcC5mb3IoY2hpbGRDb250ZXh0KHBhdGgsIGNvbnRleHQpKVxufVxuXG5FeHBvcnRNYXAuZm9yID0gZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgY29uc3QgeyBwYXRoIH0gPSBjb250ZXh0XG5cbiAgY29uc3QgY2FjaGVLZXkgPSBoYXNoT2JqZWN0KGNvbnRleHQpLmRpZ2VzdCgnaGV4JylcbiAgbGV0IGV4cG9ydE1hcCA9IGV4cG9ydENhY2hlLmdldChjYWNoZUtleSlcblxuICAvLyByZXR1cm4gY2FjaGVkIGlnbm9yZVxuICBpZiAoZXhwb3J0TWFwID09PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gIGNvbnN0IHN0YXRzID0gZnMuc3RhdFN5bmMocGF0aClcbiAgaWYgKGV4cG9ydE1hcCAhPSBudWxsKSB7XG4gICAgLy8gZGF0ZSBlcXVhbGl0eSBjaGVja1xuICAgIGlmIChleHBvcnRNYXAubXRpbWUgLSBzdGF0cy5tdGltZSA9PT0gMCkge1xuICAgICAgcmV0dXJuIGV4cG9ydE1hcFxuICAgIH1cbiAgICAvLyBmdXR1cmU6IGNoZWNrIGNvbnRlbnQgZXF1YWxpdHk/XG4gIH1cblxuICAvLyBjaGVjayB2YWxpZCBleHRlbnNpb25zIGZpcnN0XG4gIGlmICghaGFzVmFsaWRFeHRlbnNpb24ocGF0aCwgY29udGV4dCkpIHtcbiAgICBleHBvcnRDYWNoZS5zZXQoY2FjaGVLZXksIG51bGwpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIC8vIGNoZWNrIGZvciBhbmQgY2FjaGUgaWdub3JlXG4gIGlmIChpc0lnbm9yZWQocGF0aCwgY29udGV4dCkpIHtcbiAgICBsb2coJ2lnbm9yZWQgcGF0aCBkdWUgdG8gaWdub3JlIHNldHRpbmdzOicsIHBhdGgpXG4gICAgZXhwb3J0Q2FjaGUuc2V0KGNhY2hlS2V5LCBudWxsKVxuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHBhdGgsIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KVxuXG4gIC8vIGNoZWNrIGZvciBhbmQgY2FjaGUgdW5hbWJpZ3VvdXMgbW9kdWxlc1xuICBpZiAoIXVuYW1iaWd1b3VzLnRlc3QoY29udGVudCkpIHtcbiAgICBsb2coJ2lnbm9yZWQgcGF0aCBkdWUgdG8gdW5hbWJpZ3VvdXMgcmVnZXg6JywgcGF0aClcbiAgICBleHBvcnRDYWNoZS5zZXQoY2FjaGVLZXksIG51bGwpXG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIGxvZygnY2FjaGUgbWlzcycsIGNhY2hlS2V5LCAnZm9yIHBhdGgnLCBwYXRoKVxuICBleHBvcnRNYXAgPSBFeHBvcnRNYXAucGFyc2UocGF0aCwgY29udGVudCwgY29udGV4dClcblxuICAvLyBhbWJpZ3VvdXMgbW9kdWxlcyByZXR1cm4gbnVsbFxuICBpZiAoZXhwb3J0TWFwID09IG51bGwpIHJldHVybiBudWxsXG5cbiAgZXhwb3J0TWFwLm10aW1lID0gc3RhdHMubXRpbWVcblxuICBleHBvcnRDYWNoZS5zZXQoY2FjaGVLZXksIGV4cG9ydE1hcClcbiAgcmV0dXJuIGV4cG9ydE1hcFxufVxuXG5cbkV4cG9ydE1hcC5wYXJzZSA9IGZ1bmN0aW9uIChwYXRoLCBjb250ZW50LCBjb250ZXh0KSB7XG4gIHZhciBtID0gbmV3IEV4cG9ydE1hcChwYXRoKVxuXG4gIHRyeSB7XG4gICAgdmFyIGFzdCA9IHBhcnNlKHBhdGgsIGNvbnRlbnQsIGNvbnRleHQpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZygncGFyc2UgZXJyb3I6JywgcGF0aCwgZXJyKVxuICAgIG0uZXJyb3JzLnB1c2goZXJyKVxuICAgIHJldHVybiBtIC8vIGNhbid0IGNvbnRpbnVlXG4gIH1cblxuICBpZiAoIXVuYW1iaWd1b3VzLmlzTW9kdWxlKGFzdCkpIHJldHVybiBudWxsXG5cbiAgY29uc3QgZG9jc3R5bGUgPSAoY29udGV4dC5zZXR0aW5ncyAmJiBjb250ZXh0LnNldHRpbmdzWydpbXBvcnQvZG9jc3R5bGUnXSkgfHwgWydqc2RvYyddXG4gIGNvbnN0IGRvY1N0eWxlUGFyc2VycyA9IHt9XG4gIGRvY3N0eWxlLmZvckVhY2goc3R5bGUgPT4ge1xuICAgIGRvY1N0eWxlUGFyc2Vyc1tzdHlsZV0gPSBhdmFpbGFibGVEb2NTdHlsZVBhcnNlcnNbc3R5bGVdXG4gIH0pXG5cbiAgLy8gYXR0ZW1wdCB0byBjb2xsZWN0IG1vZHVsZSBkb2NcbiAgaWYgKGFzdC5jb21tZW50cykge1xuICAgIGFzdC5jb21tZW50cy5zb21lKGMgPT4ge1xuICAgICAgaWYgKGMudHlwZSAhPT0gJ0Jsb2NrJykgcmV0dXJuIGZhbHNlXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBkb2MgPSBkb2N0cmluZS5wYXJzZShjLnZhbHVlLCB7IHVud3JhcDogdHJ1ZSB9KVxuICAgICAgICBpZiAoZG9jLnRhZ3Muc29tZSh0ID0+IHQudGl0bGUgPT09ICdtb2R1bGUnKSkge1xuICAgICAgICAgIG0uZG9jID0gZG9jXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyKSB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9KVxuICB9XG5cbiAgY29uc3QgbmFtZXNwYWNlcyA9IG5ldyBNYXAoKVxuXG4gIGZ1bmN0aW9uIHJlbW90ZVBhdGgodmFsdWUpIHtcbiAgICByZXR1cm4gcmVzb2x2ZS5yZWxhdGl2ZSh2YWx1ZSwgcGF0aCwgY29udGV4dC5zZXR0aW5ncylcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc29sdmVJbXBvcnQodmFsdWUpIHtcbiAgICBjb25zdCBycCA9IHJlbW90ZVBhdGgodmFsdWUpXG4gICAgaWYgKHJwID09IG51bGwpIHJldHVybiBudWxsXG4gICAgcmV0dXJuIEV4cG9ydE1hcC5mb3IoY2hpbGRDb250ZXh0KHJwLCBjb250ZXh0KSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldE5hbWVzcGFjZShpZGVudGlmaWVyKSB7XG4gICAgaWYgKCFuYW1lc3BhY2VzLmhhcyhpZGVudGlmaWVyLm5hbWUpKSByZXR1cm5cblxuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZUltcG9ydChuYW1lc3BhY2VzLmdldChpZGVudGlmaWVyLm5hbWUpKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZE5hbWVzcGFjZShvYmplY3QsIGlkZW50aWZpZXIpIHtcbiAgICBjb25zdCBuc2ZuID0gZ2V0TmFtZXNwYWNlKGlkZW50aWZpZXIpXG4gICAgaWYgKG5zZm4pIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmplY3QsICduYW1lc3BhY2UnLCB7IGdldDogbnNmbiB9KVxuICAgIH1cblxuICAgIHJldHVybiBvYmplY3RcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhcHR1cmVEZXBlbmRlbmN5KGRlY2xhcmF0aW9uKSB7XG4gICAgaWYgKGRlY2xhcmF0aW9uLnNvdXJjZSA9PSBudWxsKSByZXR1cm4gbnVsbFxuICAgIGlmIChkZWNsYXJhdGlvbi5pbXBvcnRLaW5kID09PSAndHlwZScpIHJldHVybiBudWxsIC8vIHNraXAgRmxvdyB0eXBlIGltcG9ydHNcbiAgICBjb25zdCBpbXBvcnRlZFNwZWNpZmllcnMgPSBuZXcgU2V0KClcbiAgICBjb25zdCBzdXBwb3J0ZWRUeXBlcyA9IG5ldyBTZXQoWydJbXBvcnREZWZhdWx0U3BlY2lmaWVyJywgJ0ltcG9ydE5hbWVzcGFjZVNwZWNpZmllciddKVxuICAgIGxldCBoYXNJbXBvcnRlZFR5cGUgPSBmYWxzZVxuICAgIGlmIChkZWNsYXJhdGlvbi5zcGVjaWZpZXJzKSB7XG4gICAgICBkZWNsYXJhdGlvbi5zcGVjaWZpZXJzLmZvckVhY2goc3BlY2lmaWVyID0+IHtcbiAgICAgICAgY29uc3QgaXNUeXBlID0gc3BlY2lmaWVyLmltcG9ydEtpbmQgPT09ICd0eXBlJ1xuICAgICAgICBoYXNJbXBvcnRlZFR5cGUgPSBoYXNJbXBvcnRlZFR5cGUgfHwgaXNUeXBlXG5cbiAgICAgICAgaWYgKHN1cHBvcnRlZFR5cGVzLmhhcyhzcGVjaWZpZXIudHlwZSkgJiYgIWlzVHlwZSkge1xuICAgICAgICAgIGltcG9ydGVkU3BlY2lmaWVycy5hZGQoc3BlY2lmaWVyLnR5cGUpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNwZWNpZmllci50eXBlID09PSAnSW1wb3J0U3BlY2lmaWVyJyAmJiAhaXNUeXBlKSB7XG4gICAgICAgICAgaW1wb3J0ZWRTcGVjaWZpZXJzLmFkZChzcGVjaWZpZXIuaW1wb3J0ZWQubmFtZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG5cbiAgICAvLyBvbmx5IEZsb3cgdHlwZXMgd2VyZSBpbXBvcnRlZFxuICAgIGlmIChoYXNJbXBvcnRlZFR5cGUgJiYgaW1wb3J0ZWRTcGVjaWZpZXJzLnNpemUgPT09IDApIHJldHVybiBudWxsXG5cbiAgICBjb25zdCBwID0gcmVtb3RlUGF0aChkZWNsYXJhdGlvbi5zb3VyY2UudmFsdWUpXG4gICAgaWYgKHAgPT0gbnVsbCkgcmV0dXJuIG51bGxcbiAgICBjb25zdCBleGlzdGluZyA9IG0uaW1wb3J0cy5nZXQocClcbiAgICBpZiAoZXhpc3RpbmcgIT0gbnVsbCkgcmV0dXJuIGV4aXN0aW5nLmdldHRlclxuXG4gICAgY29uc3QgZ2V0dGVyID0gdGh1bmtGb3IocCwgY29udGV4dClcbiAgICBtLmltcG9ydHMuc2V0KHAsIHtcbiAgICAgIGdldHRlcixcbiAgICAgIHNvdXJjZTogeyAgLy8gY2FwdHVyaW5nIGFjdHVhbCBub2RlIHJlZmVyZW5jZSBob2xkcyBmdWxsIEFTVCBpbiBtZW1vcnkhXG4gICAgICAgIHZhbHVlOiBkZWNsYXJhdGlvbi5zb3VyY2UudmFsdWUsXG4gICAgICAgIGxvYzogZGVjbGFyYXRpb24uc291cmNlLmxvYyxcbiAgICAgIH0sXG4gICAgICBpbXBvcnRlZFNwZWNpZmllcnMsXG4gICAgfSlcbiAgICByZXR1cm4gZ2V0dGVyXG4gIH1cblxuICBjb25zdCBzb3VyY2UgPSBtYWtlU291cmNlQ29kZShjb250ZW50LCBhc3QpXG5cbiAgYXN0LmJvZHkuZm9yRWFjaChmdW5jdGlvbiAobikge1xuXG4gICAgaWYgKG4udHlwZSA9PT0gJ0V4cG9ydERlZmF1bHREZWNsYXJhdGlvbicpIHtcbiAgICAgIGNvbnN0IGV4cG9ydE1ldGEgPSBjYXB0dXJlRG9jKHNvdXJjZSwgZG9jU3R5bGVQYXJzZXJzLCBuKVxuICAgICAgaWYgKG4uZGVjbGFyYXRpb24udHlwZSA9PT0gJ0lkZW50aWZpZXInKSB7XG4gICAgICAgIGFkZE5hbWVzcGFjZShleHBvcnRNZXRhLCBuLmRlY2xhcmF0aW9uKVxuICAgICAgfVxuICAgICAgbS5uYW1lc3BhY2Uuc2V0KCdkZWZhdWx0JywgZXhwb3J0TWV0YSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmIChuLnR5cGUgPT09ICdFeHBvcnRBbGxEZWNsYXJhdGlvbicpIHtcbiAgICAgIGNvbnN0IGdldHRlciA9IGNhcHR1cmVEZXBlbmRlbmN5KG4pXG4gICAgICBpZiAoZ2V0dGVyKSBtLmRlcGVuZGVuY2llcy5hZGQoZ2V0dGVyKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gY2FwdHVyZSBuYW1lc3BhY2VzIGluIGNhc2Ugb2YgbGF0ZXIgZXhwb3J0XG4gICAgaWYgKG4udHlwZSA9PT0gJ0ltcG9ydERlY2xhcmF0aW9uJykge1xuICAgICAgY2FwdHVyZURlcGVuZGVuY3kobilcbiAgICAgIGxldCBuc1xuICAgICAgaWYgKG4uc3BlY2lmaWVycy5zb21lKHMgPT4gcy50eXBlID09PSAnSW1wb3J0TmFtZXNwYWNlU3BlY2lmaWVyJyAmJiAobnMgPSBzKSkpIHtcbiAgICAgICAgbmFtZXNwYWNlcy5zZXQobnMubG9jYWwubmFtZSwgbi5zb3VyY2UudmFsdWUpXG4gICAgICB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBpZiAobi50eXBlID09PSAnRXhwb3J0TmFtZWREZWNsYXJhdGlvbicpIHtcbiAgICAgIC8vIGNhcHR1cmUgZGVjbGFyYXRpb25cbiAgICAgIGlmIChuLmRlY2xhcmF0aW9uICE9IG51bGwpIHtcbiAgICAgICAgc3dpdGNoIChuLmRlY2xhcmF0aW9uLnR5cGUpIHtcbiAgICAgICAgICBjYXNlICdGdW5jdGlvbkRlY2xhcmF0aW9uJzpcbiAgICAgICAgICBjYXNlICdDbGFzc0RlY2xhcmF0aW9uJzpcbiAgICAgICAgICBjYXNlICdUeXBlQWxpYXMnOiAvLyBmbG93dHlwZSB3aXRoIGJhYmVsLWVzbGludCBwYXJzZXJcbiAgICAgICAgICBjYXNlICdJbnRlcmZhY2VEZWNsYXJhdGlvbic6XG4gICAgICAgICAgY2FzZSAnRGVjbGFyZUZ1bmN0aW9uJzpcbiAgICAgICAgICBjYXNlICdUU0RlY2xhcmVGdW5jdGlvbic6XG4gICAgICAgICAgY2FzZSAnVFNFbnVtRGVjbGFyYXRpb24nOlxuICAgICAgICAgIGNhc2UgJ1RTVHlwZUFsaWFzRGVjbGFyYXRpb24nOlxuICAgICAgICAgIGNhc2UgJ1RTSW50ZXJmYWNlRGVjbGFyYXRpb24nOlxuICAgICAgICAgIGNhc2UgJ1RTQWJzdHJhY3RDbGFzc0RlY2xhcmF0aW9uJzpcbiAgICAgICAgICBjYXNlICdUU01vZHVsZURlY2xhcmF0aW9uJzpcbiAgICAgICAgICAgIG0ubmFtZXNwYWNlLnNldChuLmRlY2xhcmF0aW9uLmlkLm5hbWUsIGNhcHR1cmVEb2Moc291cmNlLCBkb2NTdHlsZVBhcnNlcnMsIG4pKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBjYXNlICdWYXJpYWJsZURlY2xhcmF0aW9uJzpcbiAgICAgICAgICAgIG4uZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zLmZvckVhY2goKGQpID0+XG4gICAgICAgICAgICAgIHJlY3Vyc2l2ZVBhdHRlcm5DYXB0dXJlKGQuaWQsXG4gICAgICAgICAgICAgICAgaWQgPT4gbS5uYW1lc3BhY2Uuc2V0KGlkLm5hbWUsIGNhcHR1cmVEb2Moc291cmNlLCBkb2NTdHlsZVBhcnNlcnMsIGQsIG4pKSkpXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5zb3VyY2UgPSBuLnNvdXJjZSAmJiBuLnNvdXJjZS52YWx1ZVxuICAgICAgbi5zcGVjaWZpZXJzLmZvckVhY2goKHMpID0+IHtcbiAgICAgICAgY29uc3QgZXhwb3J0TWV0YSA9IHt9XG4gICAgICAgIGxldCBsb2NhbFxuXG4gICAgICAgIHN3aXRjaCAocy50eXBlKSB7XG4gICAgICAgICAgY2FzZSAnRXhwb3J0RGVmYXVsdFNwZWNpZmllcic6XG4gICAgICAgICAgICBpZiAoIW4uc291cmNlKSByZXR1cm5cbiAgICAgICAgICAgIGxvY2FsID0gJ2RlZmF1bHQnXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIGNhc2UgJ0V4cG9ydE5hbWVzcGFjZVNwZWNpZmllcic6XG4gICAgICAgICAgICBtLm5hbWVzcGFjZS5zZXQocy5leHBvcnRlZC5uYW1lLCBPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0TWV0YSwgJ25hbWVzcGFjZScsIHtcbiAgICAgICAgICAgICAgZ2V0KCkgeyByZXR1cm4gcmVzb2x2ZUltcG9ydChuc291cmNlKSB9LFxuICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICBjYXNlICdFeHBvcnRTcGVjaWZpZXInOlxuICAgICAgICAgICAgaWYgKCFuLnNvdXJjZSkge1xuICAgICAgICAgICAgICBtLm5hbWVzcGFjZS5zZXQocy5leHBvcnRlZC5uYW1lLCBhZGROYW1lc3BhY2UoZXhwb3J0TWV0YSwgcy5sb2NhbCkpXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZWxzZSBmYWxscyB0aHJvdWdoXG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGxvY2FsID0gcy5sb2NhbC5uYW1lXG4gICAgICAgICAgICBicmVha1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG9kbzogSlNEb2NcbiAgICAgICAgbS5yZWV4cG9ydHMuc2V0KHMuZXhwb3J0ZWQubmFtZSwgeyBsb2NhbCwgZ2V0SW1wb3J0OiAoKSA9PiByZXNvbHZlSW1wb3J0KG5zb3VyY2UpIH0pXG4gICAgICB9KVxuICAgIH1cblxuICAgIC8vIFRoaXMgZG9lc24ndCBkZWNsYXJlIGFueXRoaW5nLCBidXQgY2hhbmdlcyB3aGF0J3MgYmVpbmcgZXhwb3J0ZWQuXG4gICAgaWYgKG4udHlwZSA9PT0gJ1RTRXhwb3J0QXNzaWdubWVudCcpIHtcbiAgICAgIGNvbnN0IGV4cG9ydGVkTmFtZSA9IG4uZXhwcmVzc2lvbi5uYW1lXG4gICAgICBjb25zdCBkZWNsVHlwZXMgPSBbXG4gICAgICAgICdWYXJpYWJsZURlY2xhcmF0aW9uJyxcbiAgICAgICAgJ0NsYXNzRGVjbGFyYXRpb24nLFxuICAgICAgICAnVFNEZWNsYXJlRnVuY3Rpb24nLFxuICAgICAgICAnVFNFbnVtRGVjbGFyYXRpb24nLFxuICAgICAgICAnVFNUeXBlQWxpYXNEZWNsYXJhdGlvbicsXG4gICAgICAgICdUU0ludGVyZmFjZURlY2xhcmF0aW9uJyxcbiAgICAgICAgJ1RTQWJzdHJhY3RDbGFzc0RlY2xhcmF0aW9uJyxcbiAgICAgICAgJ1RTTW9kdWxlRGVjbGFyYXRpb24nLFxuICAgICAgXVxuICAgICAgY29uc3QgZXhwb3J0ZWREZWNscyA9IGFzdC5ib2R5LmZpbHRlcigoeyB0eXBlLCBpZCwgZGVjbGFyYXRpb25zIH0pID0+IFxuICAgICAgICBkZWNsVHlwZXMuaW5jbHVkZXModHlwZSkgJiYgXG4gICAgICAgIChcbiAgICAgICAgICAoaWQgJiYgaWQubmFtZSA9PT0gZXhwb3J0ZWROYW1lKSB8fFxuICAgICAgICAgIChkZWNsYXJhdGlvbnMgJiYgZGVjbGFyYXRpb25zLmZpbmQoZCA9PiBkLmlkLm5hbWUgPT09IGV4cG9ydGVkTmFtZSkpXG4gICAgICAgIClcbiAgICAgIClcbiAgICAgIGlmIChleHBvcnRlZERlY2xzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAvLyBFeHBvcnQgaXMgbm90IHJlZmVyZW5jaW5nIGFueSBsb2NhbCBkZWNsYXJhdGlvbiwgbXVzdCBiZSByZS1leHBvcnRpbmdcbiAgICAgICAgbS5uYW1lc3BhY2Uuc2V0KCdkZWZhdWx0JywgY2FwdHVyZURvYyhzb3VyY2UsIGRvY1N0eWxlUGFyc2VycywgbikpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgZXhwb3J0ZWREZWNscy5mb3JFYWNoKChkZWNsKSA9PiB7XG4gICAgICAgIGlmIChkZWNsLnR5cGUgPT09ICdUU01vZHVsZURlY2xhcmF0aW9uJykge1xuICAgICAgICAgIGxldCBjdXJyZW50RGVjbCA9IGRlY2xcbiAgICAgICAgICBsZXQgbW9kdWxlRGVjbHMgPSBbZGVjbF1cblxuICAgICAgICAgIC8vIEZpbmQgcmVjdXJzaXZlIFRTTW9kdWxlRGVjbGFyYXRpb25cbiAgICAgICAgICB3aGlsZSAoY3VycmVudERlY2wuYm9keSAmJiBjdXJyZW50RGVjbC5ib2R5LnR5cGUgPT09ICdUU01vZHVsZURlY2xhcmF0aW9uJykge1xuICAgICAgICAgICAgY3VycmVudERlY2wgPSBjdXJyZW50RGVjbC5ib2R5XG4gICAgICAgICAgICBtb2R1bGVEZWNscy5wdXNoKGN1cnJlbnREZWNsKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChjdXJyZW50RGVjbC5ib2R5ICYmIGN1cnJlbnREZWNsLmJvZHkuYm9keSkge1xuICAgICAgICAgICAgY3VycmVudERlY2wuYm9keS5ib2R5LmZvckVhY2goKG1vZHVsZUJsb2NrTm9kZSkgPT4ge1xuICAgICAgICAgICAgICAvLyBFeHBvcnQtYXNzaWdubWVudCBleHBvcnRzIGFsbCBtZW1iZXJzIGluIHRoZSBuYW1lc3BhY2UsXG4gICAgICAgICAgICAgIC8vIGV4cGxpY2l0bHkgZXhwb3J0ZWQgb3Igbm90LlxuICAgICAgICAgICAgICBjb25zdCBuYW1lc3BhY2VEZWNsID0gbW9kdWxlQmxvY2tOb2RlLnR5cGUgPT09ICdFeHBvcnROYW1lZERlY2xhcmF0aW9uJyA/XG4gICAgICAgICAgICAgICAgbW9kdWxlQmxvY2tOb2RlLmRlY2xhcmF0aW9uIDpcbiAgICAgICAgICAgICAgICBtb2R1bGVCbG9ja05vZGVcblxuICAgICAgICAgICAgICBpZiAobmFtZXNwYWNlRGVjbC50eXBlID09PSAnVmFyaWFibGVEZWNsYXJhdGlvbicpIHtcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2VEZWNsLmRlY2xhcmF0aW9ucy5mb3JFYWNoKChkKSA9PlxuICAgICAgICAgICAgICAgICAgcmVjdXJzaXZlUGF0dGVybkNhcHR1cmUoZC5pZCwgKGlkKSA9PiBtLm5hbWVzcGFjZS5zZXQoXG4gICAgICAgICAgICAgICAgICAgIGlkLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGNhcHR1cmVEb2MoXG4gICAgICAgICAgICAgICAgICAgICAgc291cmNlLFxuICAgICAgICAgICAgICAgICAgICAgIGRvY1N0eWxlUGFyc2VycyxcbiAgICAgICAgICAgICAgICAgICAgICAuLi5tb2R1bGVEZWNscyxcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lc3BhY2VEZWNsLFxuICAgICAgICAgICAgICAgICAgICAgIG1vZHVsZUJsb2NrTm9kZVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICApKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtLm5hbWVzcGFjZS5zZXQoXG4gICAgICAgICAgICAgICAgICBuYW1lc3BhY2VEZWNsLmlkLm5hbWUsXG4gICAgICAgICAgICAgICAgICBjYXB0dXJlRG9jKHNvdXJjZSwgZG9jU3R5bGVQYXJzZXJzLCBtb2R1bGVCbG9ja05vZGUpKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBFeHBvcnQgYXMgZGVmYXVsdFxuICAgICAgICAgIG0ubmFtZXNwYWNlLnNldCgnZGVmYXVsdCcsIGNhcHR1cmVEb2Moc291cmNlLCBkb2NTdHlsZVBhcnNlcnMsIGRlY2wpKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgfSlcblxuICByZXR1cm4gbVxufVxuXG4vKipcbiAqIFRoZSBjcmVhdGlvbiBvZiB0aGlzIGNsb3N1cmUgaXMgaXNvbGF0ZWQgZnJvbSBvdGhlciBzY29wZXNcbiAqIHRvIGF2b2lkIG92ZXItcmV0ZW50aW9uIG9mIHVucmVsYXRlZCB2YXJpYWJsZXMsIHdoaWNoIGhhc1xuICogY2F1c2VkIG1lbW9yeSBsZWFrcy4gU2VlICMxMjY2LlxuICovXG5mdW5jdGlvbiB0aHVua0ZvcihwLCBjb250ZXh0KSB7XG4gIHJldHVybiAoKSA9PiBFeHBvcnRNYXAuZm9yKGNoaWxkQ29udGV4dChwLCBjb250ZXh0KSlcbn1cblxuXG4vKipcbiAqIFRyYXZlcnNlIGEgcGF0dGVybi9pZGVudGlmaWVyIG5vZGUsIGNhbGxpbmcgJ2NhbGxiYWNrJ1xuICogZm9yIGVhY2ggbGVhZiBpZGVudGlmaWVyLlxuICogQHBhcmFtICB7bm9kZX0gICBwYXR0ZXJuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqIEByZXR1cm4ge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWN1cnNpdmVQYXR0ZXJuQ2FwdHVyZShwYXR0ZXJuLCBjYWxsYmFjaykge1xuICBzd2l0Y2ggKHBhdHRlcm4udHlwZSkge1xuICAgIGNhc2UgJ0lkZW50aWZpZXInOiAvLyBiYXNlIGNhc2VcbiAgICAgIGNhbGxiYWNrKHBhdHRlcm4pXG4gICAgICBicmVha1xuXG4gICAgY2FzZSAnT2JqZWN0UGF0dGVybic6XG4gICAgICBwYXR0ZXJuLnByb3BlcnRpZXMuZm9yRWFjaChwID0+IHtcbiAgICAgICAgcmVjdXJzaXZlUGF0dGVybkNhcHR1cmUocC52YWx1ZSwgY2FsbGJhY2spXG4gICAgICB9KVxuICAgICAgYnJlYWtcblxuICAgIGNhc2UgJ0FycmF5UGF0dGVybic6XG4gICAgICBwYXR0ZXJuLmVsZW1lbnRzLmZvckVhY2goKGVsZW1lbnQpID0+IHtcbiAgICAgICAgaWYgKGVsZW1lbnQgPT0gbnVsbCkgcmV0dXJuXG4gICAgICAgIHJlY3Vyc2l2ZVBhdHRlcm5DYXB0dXJlKGVsZW1lbnQsIGNhbGxiYWNrKVxuICAgICAgfSlcbiAgICAgIGJyZWFrXG5cbiAgICBjYXNlICdBc3NpZ25tZW50UGF0dGVybic6XG4gICAgICBjYWxsYmFjayhwYXR0ZXJuLmxlZnQpXG4gICAgICBicmVha1xuICB9XG59XG5cbi8qKlxuICogZG9uJ3QgaG9sZCBmdWxsIGNvbnRleHQgb2JqZWN0IGluIG1lbW9yeSwganVzdCBncmFiIHdoYXQgd2UgbmVlZC5cbiAqL1xuZnVuY3Rpb24gY2hpbGRDb250ZXh0KHBhdGgsIGNvbnRleHQpIHtcbiAgY29uc3QgeyBzZXR0aW5ncywgcGFyc2VyT3B0aW9ucywgcGFyc2VyUGF0aCB9ID0gY29udGV4dFxuICByZXR1cm4ge1xuICAgIHNldHRpbmdzLFxuICAgIHBhcnNlck9wdGlvbnMsXG4gICAgcGFyc2VyUGF0aCxcbiAgICBwYXRoLFxuICB9XG59XG5cblxuLyoqXG4gKiBzb21ldGltZXMgbGVnYWN5IHN1cHBvcnQgaXNuJ3QgX3RoYXRfIGhhcmQuLi4gcmlnaHQ/XG4gKi9cbmZ1bmN0aW9uIG1ha2VTb3VyY2VDb2RlKHRleHQsIGFzdCkge1xuICBpZiAoU291cmNlQ29kZS5sZW5ndGggPiAxKSB7XG4gICAgLy8gRVNMaW50IDNcbiAgICByZXR1cm4gbmV3IFNvdXJjZUNvZGUodGV4dCwgYXN0KVxuICB9IGVsc2Uge1xuICAgIC8vIEVTTGludCA0LCA1XG4gICAgcmV0dXJuIG5ldyBTb3VyY2VDb2RlKHsgdGV4dCwgYXN0IH0pXG4gIH1cbn1cbiJdfQ==