'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _minimatch = require('minimatch');

var _minimatch2 = _interopRequireDefault(_minimatch);

var _importType = require('../core/importType');

var _importType2 = _interopRequireDefault(_importType);

var _staticRequire = require('../core/staticRequire');

var _staticRequire2 = _interopRequireDefault(_staticRequire);

var _docsUrl = require('../docsUrl');

var _docsUrl2 = _interopRequireDefault(_docsUrl);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const defaultGroups = ['builtin', 'external', 'parent', 'sibling', 'index'];

// REPORTING AND FIXING

function reverse(array) {
  return array.map(function (v) {
    return {
      name: v.name,
      rank: -v.rank,
      node: v.node
    };
  }).reverse();
}

function getTokensOrCommentsAfter(sourceCode, node, count) {
  let currentNodeOrToken = node;
  const result = [];
  for (let i = 0; i < count; i++) {
    currentNodeOrToken = sourceCode.getTokenOrCommentAfter(currentNodeOrToken);
    if (currentNodeOrToken == null) {
      break;
    }
    result.push(currentNodeOrToken);
  }
  return result;
}

function getTokensOrCommentsBefore(sourceCode, node, count) {
  let currentNodeOrToken = node;
  const result = [];
  for (let i = 0; i < count; i++) {
    currentNodeOrToken = sourceCode.getTokenOrCommentBefore(currentNodeOrToken);
    if (currentNodeOrToken == null) {
      break;
    }
    result.push(currentNodeOrToken);
  }
  return result.reverse();
}

function takeTokensAfterWhile(sourceCode, node, condition) {
  const tokens = getTokensOrCommentsAfter(sourceCode, node, 100);
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (condition(tokens[i])) {
      result.push(tokens[i]);
    } else {
      break;
    }
  }
  return result;
}

function takeTokensBeforeWhile(sourceCode, node, condition) {
  const tokens = getTokensOrCommentsBefore(sourceCode, node, 100);
  const result = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (condition(tokens[i])) {
      result.push(tokens[i]);
    } else {
      break;
    }
  }
  return result.reverse();
}

function findOutOfOrder(imported) {
  if (imported.length === 0) {
    return [];
  }
  let maxSeenRankNode = imported[0];
  return imported.filter(function (importedModule) {
    const res = importedModule.rank < maxSeenRankNode.rank;
    if (maxSeenRankNode.rank < importedModule.rank) {
      maxSeenRankNode = importedModule;
    }
    return res;
  });
}

function findRootNode(node) {
  let parent = node;
  while (parent.parent != null && parent.parent.body == null) {
    parent = parent.parent;
  }
  return parent;
}

function findEndOfLineWithComments(sourceCode, node) {
  const tokensToEndOfLine = takeTokensAfterWhile(sourceCode, node, commentOnSameLineAs(node));
  let endOfTokens = tokensToEndOfLine.length > 0 ? tokensToEndOfLine[tokensToEndOfLine.length - 1].range[1] : node.range[1];
  let result = endOfTokens;
  for (let i = endOfTokens; i < sourceCode.text.length; i++) {
    if (sourceCode.text[i] === '\n') {
      result = i + 1;
      break;
    }
    if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t' && sourceCode.text[i] !== '\r') {
      break;
    }
    result = i + 1;
  }
  return result;
}

function commentOnSameLineAs(node) {
  return token => (token.type === 'Block' || token.type === 'Line') && token.loc.start.line === token.loc.end.line && token.loc.end.line === node.loc.end.line;
}

function findStartOfLineWithComments(sourceCode, node) {
  const tokensToEndOfLine = takeTokensBeforeWhile(sourceCode, node, commentOnSameLineAs(node));
  let startOfTokens = tokensToEndOfLine.length > 0 ? tokensToEndOfLine[0].range[0] : node.range[0];
  let result = startOfTokens;
  for (let i = startOfTokens - 1; i > 0; i--) {
    if (sourceCode.text[i] !== ' ' && sourceCode.text[i] !== '\t') {
      break;
    }
    result = i;
  }
  return result;
}

function isPlainRequireModule(node) {
  if (node.type !== 'VariableDeclaration') {
    return false;
  }
  if (node.declarations.length !== 1) {
    return false;
  }
  const decl = node.declarations[0];
  const result = decl.id && (decl.id.type === 'Identifier' || decl.id.type === 'ObjectPattern') && decl.init != null && decl.init.type === 'CallExpression' && decl.init.callee != null && decl.init.callee.name === 'require' && decl.init.arguments != null && decl.init.arguments.length === 1 && decl.init.arguments[0].type === 'Literal';
  return result;
}

function isPlainImportModule(node) {
  return node.type === 'ImportDeclaration' && node.specifiers != null && node.specifiers.length > 0;
}

function canCrossNodeWhileReorder(node) {
  return isPlainRequireModule(node) || isPlainImportModule(node);
}

function canReorderItems(firstNode, secondNode) {
  const parent = firstNode.parent;

  var _sort = [parent.body.indexOf(firstNode), parent.body.indexOf(secondNode)].sort(),
      _sort2 = _slicedToArray(_sort, 2);

  const firstIndex = _sort2[0],
        secondIndex = _sort2[1];

  const nodesBetween = parent.body.slice(firstIndex, secondIndex + 1);
  for (var nodeBetween of nodesBetween) {
    if (!canCrossNodeWhileReorder(nodeBetween)) {
      return false;
    }
  }
  return true;
}

function fixOutOfOrder(context, firstNode, secondNode, order) {
  const sourceCode = context.getSourceCode();

  const firstRoot = findRootNode(firstNode.node);
  const firstRootStart = findStartOfLineWithComments(sourceCode, firstRoot);
  const firstRootEnd = findEndOfLineWithComments(sourceCode, firstRoot);

  const secondRoot = findRootNode(secondNode.node);
  const secondRootStart = findStartOfLineWithComments(sourceCode, secondRoot);
  const secondRootEnd = findEndOfLineWithComments(sourceCode, secondRoot);
  const canFix = canReorderItems(firstRoot, secondRoot);

  let newCode = sourceCode.text.substring(secondRootStart, secondRootEnd);
  if (newCode[newCode.length - 1] !== '\n') {
    newCode = newCode + '\n';
  }

  const message = '`' + secondNode.name + '` import should occur ' + order + ' import of `' + firstNode.name + '`';

  if (order === 'before') {
    context.report({
      node: secondNode.node,
      message: message,
      fix: canFix && (fixer => fixer.replaceTextRange([firstRootStart, secondRootEnd], newCode + sourceCode.text.substring(firstRootStart, secondRootStart)))
    });
  } else if (order === 'after') {
    context.report({
      node: secondNode.node,
      message: message,
      fix: canFix && (fixer => fixer.replaceTextRange([secondRootStart, firstRootEnd], sourceCode.text.substring(secondRootEnd, firstRootEnd) + newCode))
    });
  }
}

function reportOutOfOrder(context, imported, outOfOrder, order) {
  outOfOrder.forEach(function (imp) {
    const found = imported.find(function hasHigherRank(importedItem) {
      return importedItem.rank > imp.rank;
    });
    fixOutOfOrder(context, found, imp, order);
  });
}

function makeOutOfOrderReport(context, imported) {
  const outOfOrder = findOutOfOrder(imported);
  if (!outOfOrder.length) {
    return;
  }
  // There are things to report. Try to minimize the number of reported errors.
  const reversedImported = reverse(imported);
  const reversedOrder = findOutOfOrder(reversedImported);
  if (reversedOrder.length < outOfOrder.length) {
    reportOutOfOrder(context, reversedImported, reversedOrder, 'after');
    return;
  }
  reportOutOfOrder(context, imported, outOfOrder, 'before');
}

function importsSorterAsc(importA, importB) {
  if (importA < importB) {
    return -1;
  }

  if (importA > importB) {
    return 1;
  }

  return 0;
}

function importsSorterDesc(importA, importB) {
  if (importA < importB) {
    return 1;
  }

  if (importA > importB) {
    return -1;
  }

  return 0;
}

function mutateRanksToAlphabetize(imported, alphabetizeOptions) {
  const groupedByRanks = imported.reduce(function (acc, importedItem) {
    if (!Array.isArray(acc[importedItem.rank])) {
      acc[importedItem.rank] = [];
    }
    acc[importedItem.rank].push(importedItem.name);
    return acc;
  }, {});

  const groupRanks = Object.keys(groupedByRanks);

  const sorterFn = alphabetizeOptions.order === 'asc' ? importsSorterAsc : importsSorterDesc;
  const comparator = alphabetizeOptions.caseInsensitive ? (a, b) => sorterFn(String(a).toLowerCase(), String(b).toLowerCase()) : (a, b) => sorterFn(a, b);
  // sort imports locally within their group
  groupRanks.forEach(function (groupRank) {
    groupedByRanks[groupRank].sort(comparator);
  });

  // assign globally unique rank to each import
  let newRank = 0;
  const alphabetizedRanks = groupRanks.sort().reduce(function (acc, groupRank) {
    groupedByRanks[groupRank].forEach(function (importedItemName) {
      acc[importedItemName] = parseInt(groupRank, 10) + newRank;
      newRank += 1;
    });
    return acc;
  }, {});

  // mutate the original group-rank with alphabetized-rank
  imported.forEach(function (importedItem) {
    importedItem.rank = alphabetizedRanks[importedItem.name];
  });
}

// DETECTING

function computePathRank(ranks, pathGroups, path, maxPosition) {
  for (let i = 0, l = pathGroups.length; i < l; i++) {
    var _pathGroups$i = pathGroups[i];
    const pattern = _pathGroups$i.pattern,
          patternOptions = _pathGroups$i.patternOptions,
          group = _pathGroups$i.group;
    var _pathGroups$i$positio = _pathGroups$i.position;
    const position = _pathGroups$i$positio === undefined ? 1 : _pathGroups$i$positio;

    if ((0, _minimatch2.default)(path, pattern, patternOptions || { nocomment: true })) {
      return ranks[group] + position / maxPosition;
    }
  }
}

function computeRank(context, ranks, name, type, excludedImportTypes) {
  const impType = (0, _importType2.default)(name, context);
  let rank;
  if (!excludedImportTypes.has(impType)) {
    rank = computePathRank(ranks.groups, ranks.pathGroups, name, ranks.maxPosition);
  }
  if (typeof rank === 'undefined') {
    rank = ranks.groups[impType];
  }
  if (type !== 'import') {
    rank += 100;
  }

  return rank;
}

function registerNode(context, node, name, type, ranks, imported, excludedImportTypes) {
  const rank = computeRank(context, ranks, name, type, excludedImportTypes);
  if (rank !== -1) {
    imported.push({ name, rank, node });
  }
}

function isInVariableDeclarator(node) {
  return node && (node.type === 'VariableDeclarator' || isInVariableDeclarator(node.parent));
}

const types = ['builtin', 'external', 'internal', 'unknown', 'parent', 'sibling', 'index'];

// Creates an object with type-rank pairs.
// Example: { index: 0, sibling: 1, parent: 1, external: 1, builtin: 2, internal: 2 }
// Will throw an error if it contains a type that does not exist, or has a duplicate
function convertGroupsToRanks(groups) {
  const rankObject = groups.reduce(function (res, group, index) {
    if (typeof group === 'string') {
      group = [group];
    }
    group.forEach(function (groupItem) {
      if (types.indexOf(groupItem) === -1) {
        throw new Error('Incorrect configuration of the rule: Unknown type `' + JSON.stringify(groupItem) + '`');
      }
      if (res[groupItem] !== undefined) {
        throw new Error('Incorrect configuration of the rule: `' + groupItem + '` is duplicated');
      }
      res[groupItem] = index;
    });
    return res;
  }, {});

  const omittedTypes = types.filter(function (type) {
    return rankObject[type] === undefined;
  });

  return omittedTypes.reduce(function (res, type) {
    res[type] = groups.length;
    return res;
  }, rankObject);
}

function convertPathGroupsForRanks(pathGroups) {
  const after = {};
  const before = {};

  const transformed = pathGroups.map((pathGroup, index) => {
    const group = pathGroup.group,
          positionString = pathGroup.position;

    let position = 0;
    if (positionString === 'after') {
      if (!after[group]) {
        after[group] = 1;
      }
      position = after[group]++;
    } else if (positionString === 'before') {
      if (!before[group]) {
        before[group] = [];
      }
      before[group].push(index);
    }

    return Object.assign({}, pathGroup, { position });
  });

  let maxPosition = 1;

  Object.keys(before).forEach(group => {
    const groupLength = before[group].length;
    before[group].forEach((groupIndex, index) => {
      transformed[groupIndex].position = -1 * (groupLength - index);
    });
    maxPosition = Math.max(maxPosition, groupLength);
  });

  Object.keys(after).forEach(key => {
    const groupNextPosition = after[key];
    maxPosition = Math.max(maxPosition, groupNextPosition - 1);
  });

  return {
    pathGroups: transformed,
    maxPosition: maxPosition > 10 ? Math.pow(10, Math.ceil(Math.log10(maxPosition))) : 10
  };
}

function fixNewLineAfterImport(context, previousImport) {
  const prevRoot = findRootNode(previousImport.node);
  const tokensToEndOfLine = takeTokensAfterWhile(context.getSourceCode(), prevRoot, commentOnSameLineAs(prevRoot));

  let endOfLine = prevRoot.range[1];
  if (tokensToEndOfLine.length > 0) {
    endOfLine = tokensToEndOfLine[tokensToEndOfLine.length - 1].range[1];
  }
  return fixer => fixer.insertTextAfterRange([prevRoot.range[0], endOfLine], '\n');
}

function removeNewLineAfterImport(context, currentImport, previousImport) {
  const sourceCode = context.getSourceCode();
  const prevRoot = findRootNode(previousImport.node);
  const currRoot = findRootNode(currentImport.node);
  const rangeToRemove = [findEndOfLineWithComments(sourceCode, prevRoot), findStartOfLineWithComments(sourceCode, currRoot)];
  if (/^\s*$/.test(sourceCode.text.substring(rangeToRemove[0], rangeToRemove[1]))) {
    return fixer => fixer.removeRange(rangeToRemove);
  }
  return undefined;
}

function makeNewlinesBetweenReport(context, imported, newlinesBetweenImports) {
  const getNumberOfEmptyLinesBetween = (currentImport, previousImport) => {
    const linesBetweenImports = context.getSourceCode().lines.slice(previousImport.node.loc.end.line, currentImport.node.loc.start.line - 1);

    return linesBetweenImports.filter(line => !line.trim().length).length;
  };
  let previousImport = imported[0];

  imported.slice(1).forEach(function (currentImport) {
    const emptyLinesBetween = getNumberOfEmptyLinesBetween(currentImport, previousImport);

    if (newlinesBetweenImports === 'always' || newlinesBetweenImports === 'always-and-inside-groups') {
      if (currentImport.rank !== previousImport.rank && emptyLinesBetween === 0) {
        context.report({
          node: previousImport.node,
          message: 'There should be at least one empty line between import groups',
          fix: fixNewLineAfterImport(context, previousImport)
        });
      } else if (currentImport.rank === previousImport.rank && emptyLinesBetween > 0 && newlinesBetweenImports !== 'always-and-inside-groups') {
        context.report({
          node: previousImport.node,
          message: 'There should be no empty line within import group',
          fix: removeNewLineAfterImport(context, currentImport, previousImport)
        });
      }
    } else if (emptyLinesBetween > 0) {
      context.report({
        node: previousImport.node,
        message: 'There should be no empty line between import groups',
        fix: removeNewLineAfterImport(context, currentImport, previousImport)
      });
    }

    previousImport = currentImport;
  });
}

function getAlphabetizeConfig(options) {
  const alphabetize = options.alphabetize || {};
  const order = alphabetize.order || 'ignore';
  const caseInsensitive = alphabetize.caseInsensitive || false;

  return { order, caseInsensitive };
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      url: (0, _docsUrl2.default)('order')
    },

    fixable: 'code',
    schema: [{
      type: 'object',
      properties: {
        groups: {
          type: 'array'
        },
        pathGroupsExcludedImportTypes: {
          type: 'array'
        },
        pathGroups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string'
              },
              patternOptions: {
                type: 'object'
              },
              group: {
                type: 'string',
                enum: types
              },
              position: {
                type: 'string',
                enum: ['after', 'before']
              }
            },
            required: ['pattern', 'group']
          }
        },
        'newlines-between': {
          enum: ['ignore', 'always', 'always-and-inside-groups', 'never']
        },
        alphabetize: {
          type: 'object',
          properties: {
            caseInsensitive: {
              type: 'boolean',
              default: false
            },
            order: {
              enum: ['ignore', 'asc', 'desc'],
              default: 'ignore'
            }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }]
  },

  create: function importOrderRule(context) {
    const options = context.options[0] || {};
    const newlinesBetweenImports = options['newlines-between'] || 'ignore';
    const pathGroupsExcludedImportTypes = new Set(options['pathGroupsExcludedImportTypes'] || ['builtin', 'external']);
    const alphabetize = getAlphabetizeConfig(options);
    let ranks;

    try {
      var _convertPathGroupsFor = convertPathGroupsForRanks(options.pathGroups || []);

      const pathGroups = _convertPathGroupsFor.pathGroups,
            maxPosition = _convertPathGroupsFor.maxPosition;

      ranks = {
        groups: convertGroupsToRanks(options.groups || defaultGroups),
        pathGroups,
        maxPosition
      };
    } catch (error) {
      // Malformed configuration
      return {
        Program: function (node) {
          context.report(node, error.message);
        }
      };
    }
    let imported = [];
    let level = 0;

    function incrementLevel() {
      level++;
    }
    function decrementLevel() {
      level--;
    }

    return {
      ImportDeclaration: function handleImports(node) {
        if (node.specifiers.length) {
          // Ignoring unassigned imports
          const name = node.source.value;
          registerNode(context, node, name, 'import', ranks, imported, pathGroupsExcludedImportTypes);
        }
      },
      CallExpression: function handleRequires(node) {
        if (level !== 0 || !(0, _staticRequire2.default)(node) || !isInVariableDeclarator(node.parent)) {
          return;
        }
        const name = node.arguments[0].value;
        registerNode(context, node, name, 'require', ranks, imported, pathGroupsExcludedImportTypes);
      },
      'Program:exit': function reportAndReset() {
        if (newlinesBetweenImports !== 'ignore') {
          makeNewlinesBetweenReport(context, imported, newlinesBetweenImports);
        }

        if (alphabetize.order !== 'ignore') {
          mutateRanksToAlphabetize(imported, alphabetize);
        }

        makeOutOfOrderReport(context, imported);

        imported = [];
      },
      FunctionDeclaration: incrementLevel,
      FunctionExpression: incrementLevel,
      ArrowFunctionExpression: incrementLevel,
      BlockStatement: incrementLevel,
      ObjectExpression: incrementLevel,
      'FunctionDeclaration:exit': decrementLevel,
      'FunctionExpression:exit': decrementLevel,
      'ArrowFunctionExpression:exit': decrementLevel,
      'BlockStatement:exit': decrementLevel,
      'ObjectExpression:exit': decrementLevel
    };
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9vcmRlci5qcyJdLCJuYW1lcyI6WyJkZWZhdWx0R3JvdXBzIiwicmV2ZXJzZSIsImFycmF5IiwibWFwIiwidiIsIm5hbWUiLCJyYW5rIiwibm9kZSIsImdldFRva2Vuc09yQ29tbWVudHNBZnRlciIsInNvdXJjZUNvZGUiLCJjb3VudCIsImN1cnJlbnROb2RlT3JUb2tlbiIsInJlc3VsdCIsImkiLCJnZXRUb2tlbk9yQ29tbWVudEFmdGVyIiwicHVzaCIsImdldFRva2Vuc09yQ29tbWVudHNCZWZvcmUiLCJnZXRUb2tlbk9yQ29tbWVudEJlZm9yZSIsInRha2VUb2tlbnNBZnRlcldoaWxlIiwiY29uZGl0aW9uIiwidG9rZW5zIiwibGVuZ3RoIiwidGFrZVRva2Vuc0JlZm9yZVdoaWxlIiwiZmluZE91dE9mT3JkZXIiLCJpbXBvcnRlZCIsIm1heFNlZW5SYW5rTm9kZSIsImZpbHRlciIsImltcG9ydGVkTW9kdWxlIiwicmVzIiwiZmluZFJvb3ROb2RlIiwicGFyZW50IiwiYm9keSIsImZpbmRFbmRPZkxpbmVXaXRoQ29tbWVudHMiLCJ0b2tlbnNUb0VuZE9mTGluZSIsImNvbW1lbnRPblNhbWVMaW5lQXMiLCJlbmRPZlRva2VucyIsInJhbmdlIiwidGV4dCIsInRva2VuIiwidHlwZSIsImxvYyIsInN0YXJ0IiwibGluZSIsImVuZCIsImZpbmRTdGFydE9mTGluZVdpdGhDb21tZW50cyIsInN0YXJ0T2ZUb2tlbnMiLCJpc1BsYWluUmVxdWlyZU1vZHVsZSIsImRlY2xhcmF0aW9ucyIsImRlY2wiLCJpZCIsImluaXQiLCJjYWxsZWUiLCJhcmd1bWVudHMiLCJpc1BsYWluSW1wb3J0TW9kdWxlIiwic3BlY2lmaWVycyIsImNhbkNyb3NzTm9kZVdoaWxlUmVvcmRlciIsImNhblJlb3JkZXJJdGVtcyIsImZpcnN0Tm9kZSIsInNlY29uZE5vZGUiLCJpbmRleE9mIiwic29ydCIsImZpcnN0SW5kZXgiLCJzZWNvbmRJbmRleCIsIm5vZGVzQmV0d2VlbiIsInNsaWNlIiwibm9kZUJldHdlZW4iLCJmaXhPdXRPZk9yZGVyIiwiY29udGV4dCIsIm9yZGVyIiwiZ2V0U291cmNlQ29kZSIsImZpcnN0Um9vdCIsImZpcnN0Um9vdFN0YXJ0IiwiZmlyc3RSb290RW5kIiwic2Vjb25kUm9vdCIsInNlY29uZFJvb3RTdGFydCIsInNlY29uZFJvb3RFbmQiLCJjYW5GaXgiLCJuZXdDb2RlIiwic3Vic3RyaW5nIiwibWVzc2FnZSIsInJlcG9ydCIsImZpeCIsImZpeGVyIiwicmVwbGFjZVRleHRSYW5nZSIsInJlcG9ydE91dE9mT3JkZXIiLCJvdXRPZk9yZGVyIiwiZm9yRWFjaCIsImltcCIsImZvdW5kIiwiZmluZCIsImhhc0hpZ2hlclJhbmsiLCJpbXBvcnRlZEl0ZW0iLCJtYWtlT3V0T2ZPcmRlclJlcG9ydCIsInJldmVyc2VkSW1wb3J0ZWQiLCJyZXZlcnNlZE9yZGVyIiwiaW1wb3J0c1NvcnRlckFzYyIsImltcG9ydEEiLCJpbXBvcnRCIiwiaW1wb3J0c1NvcnRlckRlc2MiLCJtdXRhdGVSYW5rc1RvQWxwaGFiZXRpemUiLCJhbHBoYWJldGl6ZU9wdGlvbnMiLCJncm91cGVkQnlSYW5rcyIsInJlZHVjZSIsImFjYyIsIkFycmF5IiwiaXNBcnJheSIsImdyb3VwUmFua3MiLCJPYmplY3QiLCJrZXlzIiwic29ydGVyRm4iLCJjb21wYXJhdG9yIiwiY2FzZUluc2Vuc2l0aXZlIiwiYSIsImIiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImdyb3VwUmFuayIsIm5ld1JhbmsiLCJhbHBoYWJldGl6ZWRSYW5rcyIsImltcG9ydGVkSXRlbU5hbWUiLCJwYXJzZUludCIsImNvbXB1dGVQYXRoUmFuayIsInJhbmtzIiwicGF0aEdyb3VwcyIsInBhdGgiLCJtYXhQb3NpdGlvbiIsImwiLCJwYXR0ZXJuIiwicGF0dGVybk9wdGlvbnMiLCJncm91cCIsInBvc2l0aW9uIiwibm9jb21tZW50IiwiY29tcHV0ZVJhbmsiLCJleGNsdWRlZEltcG9ydFR5cGVzIiwiaW1wVHlwZSIsImhhcyIsImdyb3VwcyIsInJlZ2lzdGVyTm9kZSIsImlzSW5WYXJpYWJsZURlY2xhcmF0b3IiLCJ0eXBlcyIsImNvbnZlcnRHcm91cHNUb1JhbmtzIiwicmFua09iamVjdCIsImluZGV4IiwiZ3JvdXBJdGVtIiwiRXJyb3IiLCJKU09OIiwic3RyaW5naWZ5IiwidW5kZWZpbmVkIiwib21pdHRlZFR5cGVzIiwiY29udmVydFBhdGhHcm91cHNGb3JSYW5rcyIsImFmdGVyIiwiYmVmb3JlIiwidHJhbnNmb3JtZWQiLCJwYXRoR3JvdXAiLCJwb3NpdGlvblN0cmluZyIsImFzc2lnbiIsImdyb3VwTGVuZ3RoIiwiZ3JvdXBJbmRleCIsIk1hdGgiLCJtYXgiLCJrZXkiLCJncm91cE5leHRQb3NpdGlvbiIsInBvdyIsImNlaWwiLCJsb2cxMCIsImZpeE5ld0xpbmVBZnRlckltcG9ydCIsInByZXZpb3VzSW1wb3J0IiwicHJldlJvb3QiLCJlbmRPZkxpbmUiLCJpbnNlcnRUZXh0QWZ0ZXJSYW5nZSIsInJlbW92ZU5ld0xpbmVBZnRlckltcG9ydCIsImN1cnJlbnRJbXBvcnQiLCJjdXJyUm9vdCIsInJhbmdlVG9SZW1vdmUiLCJ0ZXN0IiwicmVtb3ZlUmFuZ2UiLCJtYWtlTmV3bGluZXNCZXR3ZWVuUmVwb3J0IiwibmV3bGluZXNCZXR3ZWVuSW1wb3J0cyIsImdldE51bWJlck9mRW1wdHlMaW5lc0JldHdlZW4iLCJsaW5lc0JldHdlZW5JbXBvcnRzIiwibGluZXMiLCJ0cmltIiwiZW1wdHlMaW5lc0JldHdlZW4iLCJnZXRBbHBoYWJldGl6ZUNvbmZpZyIsIm9wdGlvbnMiLCJhbHBoYWJldGl6ZSIsIm1vZHVsZSIsImV4cG9ydHMiLCJtZXRhIiwiZG9jcyIsInVybCIsImZpeGFibGUiLCJzY2hlbWEiLCJwcm9wZXJ0aWVzIiwicGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMiLCJpdGVtcyIsImVudW0iLCJyZXF1aXJlZCIsImRlZmF1bHQiLCJhZGRpdGlvbmFsUHJvcGVydGllcyIsImNyZWF0ZSIsImltcG9ydE9yZGVyUnVsZSIsIlNldCIsImVycm9yIiwiUHJvZ3JhbSIsImxldmVsIiwiaW5jcmVtZW50TGV2ZWwiLCJkZWNyZW1lbnRMZXZlbCIsIkltcG9ydERlY2xhcmF0aW9uIiwiaGFuZGxlSW1wb3J0cyIsInNvdXJjZSIsInZhbHVlIiwiQ2FsbEV4cHJlc3Npb24iLCJoYW5kbGVSZXF1aXJlcyIsInJlcG9ydEFuZFJlc2V0IiwiRnVuY3Rpb25EZWNsYXJhdGlvbiIsIkZ1bmN0aW9uRXhwcmVzc2lvbiIsIkFycm93RnVuY3Rpb25FeHByZXNzaW9uIiwiQmxvY2tTdGF0ZW1lbnQiLCJPYmplY3RFeHByZXNzaW9uIl0sIm1hcHBpbmdzIjoiQUFBQTs7OztBQUVBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7Ozs7QUFFQSxNQUFNQSxnQkFBZ0IsQ0FBQyxTQUFELEVBQVksVUFBWixFQUF3QixRQUF4QixFQUFrQyxTQUFsQyxFQUE2QyxPQUE3QyxDQUF0Qjs7QUFFQTs7QUFFQSxTQUFTQyxPQUFULENBQWlCQyxLQUFqQixFQUF3QjtBQUN0QixTQUFPQSxNQUFNQyxHQUFOLENBQVUsVUFBVUMsQ0FBVixFQUFhO0FBQzVCLFdBQU87QUFDTEMsWUFBTUQsRUFBRUMsSUFESDtBQUVMQyxZQUFNLENBQUNGLEVBQUVFLElBRko7QUFHTEMsWUFBTUgsRUFBRUc7QUFISCxLQUFQO0FBS0QsR0FOTSxFQU1KTixPQU5JLEVBQVA7QUFPRDs7QUFFRCxTQUFTTyx3QkFBVCxDQUFrQ0MsVUFBbEMsRUFBOENGLElBQTlDLEVBQW9ERyxLQUFwRCxFQUEyRDtBQUN6RCxNQUFJQyxxQkFBcUJKLElBQXpCO0FBQ0EsUUFBTUssU0FBUyxFQUFmO0FBQ0EsT0FBSyxJQUFJQyxJQUFJLENBQWIsRUFBZ0JBLElBQUlILEtBQXBCLEVBQTJCRyxHQUEzQixFQUFnQztBQUM5QkYseUJBQXFCRixXQUFXSyxzQkFBWCxDQUFrQ0gsa0JBQWxDLENBQXJCO0FBQ0EsUUFBSUEsc0JBQXNCLElBQTFCLEVBQWdDO0FBQzlCO0FBQ0Q7QUFD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QUlzTSxVQUFVLENBQVYsSUFBZSxDQUFDLDZCQUFnQnRNLElBQWhCLENBQWhCLElBQXlDLENBQUNtSSx1QkFBdUJuSSxLQUFLdUIsTUFBNUIsQ0FBOUMsRUFBbUY7QUFDakY7QUFDRDtBQUNELGNBQU16QixPQUFPRSxLQUFLNkMsU0FBTCxDQUFlLENBQWYsRUFBa0IrSixLQUEvQjtBQUNBMUUscUJBQ0V0RSxPQURGLEVBRUU1RCxJQUZGLEVBR0VGLElBSEYsRUFJRSxTQUpGLEVBS0VxSCxLQUxGLEVBTUVsRyxRQU5GLEVBT0UwSyw2QkFQRjtBQVNELE9BN0JJO0FBOEJMLHNCQUFnQixTQUFTb0IsY0FBVCxHQUEwQjtBQUN4QyxZQUFJckMsMkJBQTJCLFFBQS9CLEVBQXlDO0FBQ3ZDRCxvQ0FBMEI3RyxPQUExQixFQUFtQzNDLFFBQW5DLEVBQTZDeUosc0JBQTdDO0FBQ0Q7O0FBRUQsWUFBSVEsWUFBWXJILEtBQVosS0FBc0IsUUFBMUIsRUFBb0M7QUFDbEMrQixtQ0FBeUIzRSxRQUF6QixFQUFtQ2lLLFdBQW5DO0FBQ0Q7O0FBRUQ3Riw2QkFBcUJ6QixPQUFyQixFQUE4QjNDLFFBQTlCOztBQUVBQSxtQkFBVyxFQUFYO0FBQ0QsT0ExQ0k7QUEyQ0wrTCwyQkFBcUJULGNBM0NoQjtBQTRDTFUsMEJBQW9CVixjQTVDZjtBQTZDTFcsK0JBQXlCWCxjQTdDcEI7QUE4Q0xZLHNCQUFnQlosY0E5Q1g7QUErQ0xhLHdCQUFrQmIsY0EvQ2I7QUFnREwsa0NBQTRCQyxjQWhEdkI7QUFpREwsaUNBQTJCQSxjQWpEdEI7QUFrREwsc0NBQWdDQSxjQWxEM0I7QUFtREwsNkJBQXVCQSxjQW5EbEI7QUFvREwsK0JBQXlCQTtBQXBEcEIsS0FBUDtBQXNERDtBQTNKYyxDQUFqQiIsImZpbGUiOiJvcmRlci5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5pbXBvcnQgbWluaW1hdGNoIGZyb20gJ21pbmltYXRjaCdcbmltcG9ydCBpbXBvcnRUeXBlIGZyb20gJy4uL2NvcmUvaW1wb3J0VHlwZSdcbmltcG9ydCBpc1N0YXRpY1JlcXVpcmUgZnJvbSAnLi4vY29yZS9zdGF0aWNSZXF1aXJlJ1xuaW1wb3J0IGRvY3NVcmwgZnJvbSAnLi4vZG9jc1VybCdcblxuY29uc3QgZGVmYXVsdEdyb3VwcyA9IFsnYnVpbHRpbicsICdleHRlcm5hbCcsICdwYXJlbnQnLCAnc2libGluZycsICdpbmRleCddXG5cbi8vIFJFUE9SVElORyBBTkQgRklYSU5HXG5cbmZ1bmN0aW9uIHJldmVyc2UoYXJyYXkpIHtcbiAgcmV0dXJuIGFycmF5Lm1hcChmdW5jdGlvbiAodikge1xuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiB2Lm5hbWUsXG4gICAgICByYW5rOiAtdi5yYW5rLFxuICAgICAgbm9kZTogdi5ub2RlLFxuICAgIH1cbiAgfSkucmV2ZXJzZSgpXG59XG5cbmZ1bmN0aW9uIGdldFRva2Vuc09yQ29tbWVudHNBZnRlcihzb3VyY2VDb2RlLCBub2RlLCBjb3VudCkge1xuICBsZXQgY3VycmVudE5vZGVPclRva2VuID0gbm9kZVxuICBjb25zdCByZXN1bHQgPSBbXVxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QWZ0ZXIoY3VycmVudE5vZGVPclRva2VuKVxuICAgIGlmIChjdXJyZW50Tm9kZU9yVG9rZW4gPT0gbnVsbCkge1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgcmVzdWx0LnB1c2goY3VycmVudE5vZGVPclRva2VuKVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gZ2V0VG9rZW5zT3JDb21tZW50c0JlZm9yZShzb3VyY2VDb2RlLCBub2RlLCBjb3VudCkge1xuICBsZXQgY3VycmVudE5vZGVPclRva2VuID0gbm9kZVxuICBjb25zdCByZXN1bHQgPSBbXVxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBjdXJyZW50Tm9kZU9yVG9rZW4gPSBzb3VyY2VDb2RlLmdldFRva2VuT3JDb21tZW50QmVmb3JlKGN1cnJlbnROb2RlT3JUb2tlbilcbiAgICBpZiAoY3VycmVudE5vZGVPclRva2VuID09IG51bGwpIHtcbiAgICAgIGJyZWFrXG4gICAgfVxuICAgIHJlc3VsdC5wdXNoKGN1cnJlbnROb2RlT3JUb2tlbilcbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKVxufVxuXG5mdW5jdGlvbiB0YWtlVG9rZW5zQWZ0ZXJXaGlsZShzb3VyY2VDb2RlLCBub2RlLCBjb25kaXRpb24pIHtcbiAgY29uc3QgdG9rZW5zID0gZ2V0VG9rZW5zT3JDb21tZW50c0FmdGVyKHNvdXJjZUNvZGUsIG5vZGUsIDEwMClcbiAgY29uc3QgcmVzdWx0ID0gW11cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSlcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHRha2VUb2tlbnNCZWZvcmVXaGlsZShzb3VyY2VDb2RlLCBub2RlLCBjb25kaXRpb24pIHtcbiAgY29uc3QgdG9rZW5zID0gZ2V0VG9rZW5zT3JDb21tZW50c0JlZm9yZShzb3VyY2VDb2RlLCBub2RlLCAxMDApXG4gIGNvbnN0IHJlc3VsdCA9IFtdXG4gIGZvciAobGV0IGkgPSB0b2tlbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoY29uZGl0aW9uKHRva2Vuc1tpXSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRva2Vuc1tpXSlcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0LnJldmVyc2UoKVxufVxuXG5mdW5jdGlvbiBmaW5kT3V0T2ZPcmRlcihpbXBvcnRlZCkge1xuICBpZiAoaW1wb3J0ZWQubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdXG4gIH1cbiAgbGV0IG1heFNlZW5SYW5rTm9kZSA9IGltcG9ydGVkWzBdXG4gIHJldHVybiBpbXBvcnRlZC5maWx0ZXIoZnVuY3Rpb24gKGltcG9ydGVkTW9kdWxlKSB7XG4gICAgY29uc3QgcmVzID0gaW1wb3J0ZWRNb2R1bGUucmFuayA8IG1heFNlZW5SYW5rTm9kZS5yYW5rXG4gICAgaWYgKG1heFNlZW5SYW5rTm9kZS5yYW5rIDwgaW1wb3J0ZWRNb2R1bGUucmFuaykge1xuICAgICAgbWF4U2VlblJhbmtOb2RlID0gaW1wb3J0ZWRNb2R1bGVcbiAgICB9XG4gICAgcmV0dXJuIHJlc1xuICB9KVxufVxuXG5mdW5jdGlvbiBmaW5kUm9vdE5vZGUobm9kZSkge1xuICBsZXQgcGFyZW50ID0gbm9kZVxuICB3aGlsZSAocGFyZW50LnBhcmVudCAhPSBudWxsICYmIHBhcmVudC5wYXJlbnQuYm9keSA9PSBudWxsKSB7XG4gICAgcGFyZW50ID0gcGFyZW50LnBhcmVudFxuICB9XG4gIHJldHVybiBwYXJlbnRcbn1cblxuZnVuY3Rpb24gZmluZEVuZE9mTGluZVdpdGhDb21tZW50cyhzb3VyY2VDb2RlLCBub2RlKSB7XG4gIGNvbnN0IHRva2Vuc1RvRW5kT2ZMaW5lID0gdGFrZVRva2Vuc0FmdGVyV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29tbWVudE9uU2FtZUxpbmVBcyhub2RlKSlcbiAgbGV0IGVuZE9mVG9rZW5zID0gdG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoID4gMFxuICAgID8gdG9rZW5zVG9FbmRPZkxpbmVbdG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoIC0gMV0ucmFuZ2VbMV1cbiAgICA6IG5vZGUucmFuZ2VbMV1cbiAgbGV0IHJlc3VsdCA9IGVuZE9mVG9rZW5zXG4gIGZvciAobGV0IGkgPSBlbmRPZlRva2VuczsgaSA8IHNvdXJjZUNvZGUudGV4dC5sZW5ndGg7IGkrKykge1xuICAgIGlmIChzb3VyY2VDb2RlLnRleHRbaV0gPT09ICdcXG4nKSB7XG4gICAgICByZXN1bHQgPSBpICsgMVxuICAgICAgYnJlYWtcbiAgICB9XG4gICAgaWYgKHNvdXJjZUNvZGUudGV4dFtpXSAhPT0gJyAnICYmIHNvdXJjZUNvZGUudGV4dFtpXSAhPT0gJ1xcdCcgJiYgc291cmNlQ29kZS50ZXh0W2ldICE9PSAnXFxyJykge1xuICAgICAgYnJlYWtcbiAgICB9XG4gICAgcmVzdWx0ID0gaSArIDFcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGNvbW1lbnRPblNhbWVMaW5lQXMobm9kZSkge1xuICByZXR1cm4gdG9rZW4gPT4gKHRva2VuLnR5cGUgPT09ICdCbG9jaycgfHwgIHRva2VuLnR5cGUgPT09ICdMaW5lJykgJiZcbiAgICAgIHRva2VuLmxvYy5zdGFydC5saW5lID09PSB0b2tlbi5sb2MuZW5kLmxpbmUgJiZcbiAgICAgIHRva2VuLmxvYy5lbmQubGluZSA9PT0gbm9kZS5sb2MuZW5kLmxpbmVcbn1cblxuZnVuY3Rpb24gZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIG5vZGUpIHtcbiAgY29uc3QgdG9rZW5zVG9FbmRPZkxpbmUgPSB0YWtlVG9rZW5zQmVmb3JlV2hpbGUoc291cmNlQ29kZSwgbm9kZSwgY29tbWVudE9uU2FtZUxpbmVBcyhub2RlKSlcbiAgbGV0IHN0YXJ0T2ZUb2tlbnMgPSB0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggPiAwID8gdG9rZW5zVG9FbmRPZkxpbmVbMF0ucmFuZ2VbMF0gOiBub2RlLnJhbmdlWzBdXG4gIGxldCByZXN1bHQgPSBzdGFydE9mVG9rZW5zXG4gIGZvciAobGV0IGkgPSBzdGFydE9mVG9rZW5zIC0gMTsgaSA+IDA7IGktLSkge1xuICAgIGlmIChzb3VyY2VDb2RlLnRleHRbaV0gIT09ICcgJyAmJiBzb3VyY2VDb2RlLnRleHRbaV0gIT09ICdcXHQnKSB7XG4gICAgICBicmVha1xuICAgIH1cbiAgICByZXN1bHQgPSBpXG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBpc1BsYWluUmVxdWlyZU1vZHVsZShub2RlKSB7XG4gIGlmIChub2RlLnR5cGUgIT09ICdWYXJpYWJsZURlY2xhcmF0aW9uJykge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG4gIGlmIChub2RlLmRlY2xhcmF0aW9ucy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuICBjb25zdCBkZWNsID0gbm9kZS5kZWNsYXJhdGlvbnNbMF1cbiAgY29uc3QgcmVzdWx0ID0gZGVjbC5pZCAmJlxuICAgIChkZWNsLmlkLnR5cGUgPT09ICdJZGVudGlmaWVyJyB8fCBkZWNsLmlkLnR5cGUgPT09ICdPYmplY3RQYXR0ZXJuJykgJiZcbiAgICBkZWNsLmluaXQgIT0gbnVsbCAmJlxuICAgIGRlY2wuaW5pdC50eXBlID09PSAnQ2FsbEV4cHJlc3Npb24nICYmXG4gICAgZGVjbC5pbml0LmNhbGxlZSAhPSBudWxsICYmXG4gICAgZGVjbC5pbml0LmNhbGxlZS5uYW1lID09PSAncmVxdWlyZScgJiZcbiAgICBkZWNsLmluaXQuYXJndW1lbnRzICE9IG51bGwgJiZcbiAgICBkZWNsLmluaXQuYXJndW1lbnRzLmxlbmd0aCA9PT0gMSAmJlxuICAgIGRlY2wuaW5pdC5hcmd1bWVudHNbMF0udHlwZSA9PT0gJ0xpdGVyYWwnXG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gaXNQbGFpbkltcG9ydE1vZHVsZShub2RlKSB7XG4gIHJldHVybiBub2RlLnR5cGUgPT09ICdJbXBvcnREZWNsYXJhdGlvbicgJiYgbm9kZS5zcGVjaWZpZXJzICE9IG51bGwgJiYgbm9kZS5zcGVjaWZpZXJzLmxlbmd0aCA+IDBcbn1cblxuZnVuY3Rpb24gY2FuQ3Jvc3NOb2RlV2hpbGVSZW9yZGVyKG5vZGUpIHtcbiAgcmV0dXJuIGlzUGxhaW5SZXF1aXJlTW9kdWxlKG5vZGUpIHx8IGlzUGxhaW5JbXBvcnRNb2R1bGUobm9kZSlcbn1cblxuZnVuY3Rpb24gY2FuUmVvcmRlckl0ZW1zKGZpcnN0Tm9kZSwgc2Vjb25kTm9kZSkge1xuICBjb25zdCBwYXJlbnQgPSBmaXJzdE5vZGUucGFyZW50XG4gIGNvbnN0IFtmaXJzdEluZGV4LCBzZWNvbmRJbmRleF0gPSBbXG4gICAgcGFyZW50LmJvZHkuaW5kZXhPZihmaXJzdE5vZGUpLFxuICAgIHBhcmVudC5ib2R5LmluZGV4T2Yoc2Vjb25kTm9kZSksXG4gIF0uc29ydCgpXG4gIGNvbnN0IG5vZGVzQmV0d2VlbiA9IHBhcmVudC5ib2R5LnNsaWNlKGZpcnN0SW5kZXgsIHNlY29uZEluZGV4ICsgMSlcbiAgZm9yICh2YXIgbm9kZUJldHdlZW4gb2Ygbm9kZXNCZXR3ZWVuKSB7XG4gICAgaWYgKCFjYW5Dcm9zc05vZGVXaGlsZVJlb3JkZXIobm9kZUJldHdlZW4pKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gZml4T3V0T2ZPcmRlcihjb250ZXh0LCBmaXJzdE5vZGUsIHNlY29uZE5vZGUsIG9yZGVyKSB7XG4gIGNvbnN0IHNvdXJjZUNvZGUgPSBjb250ZXh0LmdldFNvdXJjZUNvZGUoKVxuXG4gIGNvbnN0IGZpcnN0Um9vdCA9IGZpbmRSb290Tm9kZShmaXJzdE5vZGUubm9kZSlcbiAgY29uc3QgZmlyc3RSb290U3RhcnQgPSBmaW5kU3RhcnRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgZmlyc3RSb290KVxuICBjb25zdCBmaXJzdFJvb3RFbmQgPSBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIGZpcnN0Um9vdClcblxuICBjb25zdCBzZWNvbmRSb290ID0gZmluZFJvb3ROb2RlKHNlY29uZE5vZGUubm9kZSlcbiAgY29uc3Qgc2Vjb25kUm9vdFN0YXJ0ID0gZmluZFN0YXJ0T2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIHNlY29uZFJvb3QpXG4gIGNvbnN0IHNlY29uZFJvb3RFbmQgPSBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIHNlY29uZFJvb3QpXG4gIGNvbnN0IGNhbkZpeCA9IGNhblJlb3JkZXJJdGVtcyhmaXJzdFJvb3QsIHNlY29uZFJvb3QpXG5cbiAgbGV0IG5ld0NvZGUgPSBzb3VyY2VDb2RlLnRleHQuc3Vic3RyaW5nKHNlY29uZFJvb3RTdGFydCwgc2Vjb25kUm9vdEVuZClcbiAgaWYgKG5ld0NvZGVbbmV3Q29kZS5sZW5ndGggLSAxXSAhPT0gJ1xcbicpIHtcbiAgICBuZXdDb2RlID0gbmV3Q29kZSArICdcXG4nXG4gIH1cblxuICBjb25zdCBtZXNzYWdlID0gJ2AnICsgc2Vjb25kTm9kZS5uYW1lICsgJ2AgaW1wb3J0IHNob3VsZCBvY2N1ciAnICsgb3JkZXIgK1xuICAgICAgJyBpbXBvcnQgb2YgYCcgKyBmaXJzdE5vZGUubmFtZSArICdgJ1xuXG4gIGlmIChvcmRlciA9PT0gJ2JlZm9yZScpIHtcbiAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICBub2RlOiBzZWNvbmROb2RlLm5vZGUsXG4gICAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgICAgZml4OiBjYW5GaXggJiYgKGZpeGVyID0+XG4gICAgICAgIGZpeGVyLnJlcGxhY2VUZXh0UmFuZ2UoXG4gICAgICAgICAgW2ZpcnN0Um9vdFN0YXJ0LCBzZWNvbmRSb290RW5kXSxcbiAgICAgICAgICBuZXdDb2RlICsgc291cmNlQ29kZS50ZXh0LnN1YnN0cmluZyhmaXJzdFJvb3RTdGFydCwgc2Vjb25kUm9vdFN0YXJ0KVxuICAgICAgICApKSxcbiAgICB9KVxuICB9IGVsc2UgaWYgKG9yZGVyID09PSAnYWZ0ZXInKSB7XG4gICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgbm9kZTogc2Vjb25kTm9kZS5ub2RlLFxuICAgICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICAgIGZpeDogY2FuRml4ICYmIChmaXhlciA9PlxuICAgICAgICBmaXhlci5yZXBsYWNlVGV4dFJhbmdlKFxuICAgICAgICAgIFtzZWNvbmRSb290U3RhcnQsIGZpcnN0Um9vdEVuZF0sXG4gICAgICAgICAgc291cmNlQ29kZS50ZXh0LnN1YnN0cmluZyhzZWNvbmRSb290RW5kLCBmaXJzdFJvb3RFbmQpICsgbmV3Q29kZVxuICAgICAgICApKSxcbiAgICB9KVxuICB9XG59XG5cbmZ1bmN0aW9uIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgaW1wb3J0ZWQsIG91dE9mT3JkZXIsIG9yZGVyKSB7XG4gIG91dE9mT3JkZXIuZm9yRWFjaChmdW5jdGlvbiAoaW1wKSB7XG4gICAgY29uc3QgZm91bmQgPSBpbXBvcnRlZC5maW5kKGZ1bmN0aW9uIGhhc0hpZ2hlclJhbmsoaW1wb3J0ZWRJdGVtKSB7XG4gICAgICByZXR1cm4gaW1wb3J0ZWRJdGVtLnJhbmsgPiBpbXAucmFua1xuICAgIH0pXG4gICAgZml4T3V0T2ZPcmRlcihjb250ZXh0LCBmb3VuZCwgaW1wLCBvcmRlcilcbiAgfSlcbn1cblxuZnVuY3Rpb24gbWFrZU91dE9mT3JkZXJSZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQpIHtcbiAgY29uc3Qgb3V0T2ZPcmRlciA9IGZpbmRPdXRPZk9yZGVyKGltcG9ydGVkKVxuICBpZiAoIW91dE9mT3JkZXIubGVuZ3RoKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgLy8gVGhlcmUgYXJlIHRoaW5ncyB0byByZXBvcnQuIFRyeSB0byBtaW5pbWl6ZSB0aGUgbnVtYmVyIG9mIHJlcG9ydGVkIGVycm9ycy5cbiAgY29uc3QgcmV2ZXJzZWRJbXBvcnRlZCA9IHJldmVyc2UoaW1wb3J0ZWQpXG4gIGNvbnN0IHJldmVyc2VkT3JkZXIgPSBmaW5kT3V0T2ZPcmRlcihyZXZlcnNlZEltcG9ydGVkKVxuICBpZiAocmV2ZXJzZWRPcmRlci5sZW5ndGggPCBvdXRPZk9yZGVyLmxlbmd0aCkge1xuICAgIHJlcG9ydE91dE9mT3JkZXIoY29udGV4dCwgcmV2ZXJzZWRJbXBvcnRlZCwgcmV2ZXJzZWRPcmRlciwgJ2FmdGVyJylcbiAgICByZXR1cm5cbiAgfVxuICByZXBvcnRPdXRPZk9yZGVyKGNvbnRleHQsIGltcG9ydGVkLCBvdXRPZk9yZGVyLCAnYmVmb3JlJylcbn1cblxuZnVuY3Rpb24gaW1wb3J0c1NvcnRlckFzYyhpbXBvcnRBLCBpbXBvcnRCKSB7XG4gIGlmIChpbXBvcnRBIDwgaW1wb3J0Qikge1xuICAgIHJldHVybiAtMVxuICB9XG5cbiAgaWYgKGltcG9ydEEgPiBpbXBvcnRCKSB7XG4gICAgcmV0dXJuIDFcbiAgfVxuXG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGltcG9ydHNTb3J0ZXJEZXNjKGltcG9ydEEsIGltcG9ydEIpIHtcbiAgaWYgKGltcG9ydEEgPCBpbXBvcnRCKSB7XG4gICAgcmV0dXJuIDFcbiAgfVxuXG4gIGlmIChpbXBvcnRBID4gaW1wb3J0Qikge1xuICAgIHJldHVybiAtMVxuICB9XG5cbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gbXV0YXRlUmFua3NUb0FscGhhYmV0aXplKGltcG9ydGVkLCBhbHBoYWJldGl6ZU9wdGlvbnMpIHtcbiAgY29uc3QgZ3JvdXBlZEJ5UmFua3MgPSBpbXBvcnRlZC5yZWR1Y2UoZnVuY3Rpb24oYWNjLCBpbXBvcnRlZEl0ZW0pIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWNjW2ltcG9ydGVkSXRlbS5yYW5rXSkpIHtcbiAgICAgIGFjY1tpbXBvcnRlZEl0ZW0ucmFua10gPSBbXVxuICAgIH1cbiAgICBhY2NbaW1wb3J0ZWRJdGVtLnJhbmtdLnB1c2goaW1wb3J0ZWRJdGVtLm5hbWUpXG4gICAgcmV0dXJuIGFjY1xuICB9LCB7fSlcblxuICBjb25zdCBncm91cFJhbmtzID0gT2JqZWN0LmtleXMoZ3JvdXBlZEJ5UmFua3MpXG5cbiAgY29uc3Qgc29ydGVyRm4gPSBhbHBoYWJldGl6ZU9wdGlvbnMub3JkZXIgPT09ICdhc2MnID8gaW1wb3J0c1NvcnRlckFzYyA6IGltcG9ydHNTb3J0ZXJEZXNjXG4gIGNvbnN0IGNvbXBhcmF0b3IgPSBhbHBoYWJldGl6ZU9wdGlvbnMuY2FzZUluc2Vuc2l0aXZlID8gKGEsIGIpID0+IHNvcnRlckZuKFN0cmluZyhhKS50b0xvd2VyQ2FzZSgpLCBTdHJpbmcoYikudG9Mb3dlckNhc2UoKSkgOiAoYSwgYikgPT4gc29ydGVyRm4oYSwgYilcbiAgLy8gc29ydCBpbXBvcnRzIGxvY2FsbHkgd2l0aGluIHRoZWlyIGdyb3VwXG4gIGdyb3VwUmFua3MuZm9yRWFjaChmdW5jdGlvbihncm91cFJhbmspIHtcbiAgICBncm91cGVkQnlSYW5rc1tncm91cFJhbmtdLnNvcnQoY29tcGFyYXRvcilcbiAgfSlcblxuICAvLyBhc3NpZ24gZ2xvYmFsbHkgdW5pcXVlIHJhbmsgdG8gZWFjaCBpbXBvcnRcbiAgbGV0IG5ld1JhbmsgPSAwXG4gIGNvbnN0IGFscGhhYmV0aXplZFJhbmtzID0gZ3JvdXBSYW5rcy5zb3J0KCkucmVkdWNlKGZ1bmN0aW9uKGFjYywgZ3JvdXBSYW5rKSB7XG4gICAgZ3JvdXBlZEJ5UmFua3NbZ3JvdXBSYW5rXS5mb3JFYWNoKGZ1bmN0aW9uKGltcG9ydGVkSXRlbU5hbWUpIHtcbiAgICAgIGFjY1tpbXBvcnRlZEl0ZW1OYW1lXSA9IHBhcnNlSW50KGdyb3VwUmFuaywgMTApICsgbmV3UmFua1xuICAgICAgbmV3UmFuayArPSAxXG4gICAgfSlcbiAgICByZXR1cm4gYWNjXG4gIH0sIHt9KVxuXG4gIC8vIG11dGF0ZSB0aGUgb3JpZ2luYWwgZ3JvdXAtcmFuayB3aXRoIGFscGhhYmV0aXplZC1yYW5rXG4gIGltcG9ydGVkLmZvckVhY2goZnVuY3Rpb24oaW1wb3J0ZWRJdGVtKSB7XG4gICAgaW1wb3J0ZWRJdGVtLnJhbmsgPSBhbHBoYWJldGl6ZWRSYW5rc1tpbXBvcnRlZEl0ZW0ubmFtZV1cbiAgfSlcbn1cblxuLy8gREVURUNUSU5HXG5cbmZ1bmN0aW9uIGNvbXB1dGVQYXRoUmFuayhyYW5rcywgcGF0aEdyb3VwcywgcGF0aCwgbWF4UG9zaXRpb24pIHtcbiAgZm9yIChsZXQgaSA9IDAsIGwgPSBwYXRoR3JvdXBzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGNvbnN0IHsgcGF0dGVybiwgcGF0dGVybk9wdGlvbnMsIGdyb3VwLCBwb3NpdGlvbiA9IDEgfSA9IHBhdGhHcm91cHNbaV1cbiAgICBpZiAobWluaW1hdGNoKHBhdGgsIHBhdHRlcm4sIHBhdHRlcm5PcHRpb25zIHx8IHsgbm9jb21tZW50OiB0cnVlIH0pKSB7XG4gICAgICByZXR1cm4gcmFua3NbZ3JvdXBdICsgKHBvc2l0aW9uIC8gbWF4UG9zaXRpb24pXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSYW5rKGNvbnRleHQsIHJhbmtzLCBuYW1lLCB0eXBlLCBleGNsdWRlZEltcG9ydFR5cGVzKSB7XG4gIGNvbnN0IGltcFR5cGUgPSBpbXBvcnRUeXBlKG5hbWUsIGNvbnRleHQpXG4gIGxldCByYW5rXG4gIGlmICghZXhjbHVkZWRJbXBvcnRUeXBlcy5oYXMoaW1wVHlwZSkpIHtcbiAgICByYW5rID0gY29tcHV0ZVBhdGhSYW5rKHJhbmtzLmdyb3VwcywgcmFua3MucGF0aEdyb3VwcywgbmFtZSwgcmFua3MubWF4UG9zaXRpb24pXG4gIH1cbiAgaWYgKHR5cGVvZiByYW5rID09PSAndW5kZWZpbmVkJykge1xuICAgIHJhbmsgPSByYW5rcy5ncm91cHNbaW1wVHlwZV1cbiAgfVxuICBpZiAodHlwZSAhPT0gJ2ltcG9ydCcpIHtcbiAgICByYW5rICs9IDEwMFxuICB9XG5cbiAgcmV0dXJuIHJhbmtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJOb2RlKGNvbnRleHQsIG5vZGUsIG5hbWUsIHR5cGUsIHJhbmtzLCBpbXBvcnRlZCwgZXhjbHVkZWRJbXBvcnRUeXBlcykge1xuICBjb25zdCByYW5rID0gY29tcHV0ZVJhbmsoY29udGV4dCwgcmFua3MsIG5hbWUsIHR5cGUsIGV4Y2x1ZGVkSW1wb3J0VHlwZXMpXG4gIGlmIChyYW5rICE9PSAtMSkge1xuICAgIGltcG9ydGVkLnB1c2goe25hbWUsIHJhbmssIG5vZGV9KVxuICB9XG59XG5cbmZ1bmN0aW9uIGlzSW5WYXJpYWJsZURlY2xhcmF0b3Iobm9kZSkge1xuICByZXR1cm4gbm9kZSAmJlxuICAgIChub2RlLnR5cGUgPT09ICdWYXJpYWJsZURlY2xhcmF0b3InIHx8IGlzSW5WYXJpYWJsZURlY2xhcmF0b3Iobm9kZS5wYXJlbnQpKVxufVxuXG5jb25zdCB0eXBlcyA9IFsnYnVpbHRpbicsICdleHRlcm5hbCcsICdpbnRlcm5hbCcsICd1bmtub3duJywgJ3BhcmVudCcsICdzaWJsaW5nJywgJ2luZGV4J11cblxuLy8gQ3JlYXRlcyBhbiBvYmplY3Qgd2l0aCB0eXBlLXJhbmsgcGFpcnMuXG4vLyBFeGFtcGxlOiB7IGluZGV4OiAwLCBzaWJsaW5nOiAxLCBwYXJlbnQ6IDEsIGV4dGVybmFsOiAxLCBidWlsdGluOiAyLCBpbnRlcm5hbDogMiB9XG4vLyBXaWxsIHRocm93IGFuIGVycm9yIGlmIGl0IGNvbnRhaW5zIGEgdHlwZSB0aGF0IGRvZXMgbm90IGV4aXN0LCBvciBoYXMgYSBkdXBsaWNhdGVcbmZ1bmN0aW9uIGNvbnZlcnRHcm91cHNUb1JhbmtzKGdyb3Vwcykge1xuICBjb25zdCByYW5rT2JqZWN0ID0gZ3JvdXBzLnJlZHVjZShmdW5jdGlvbihyZXMsIGdyb3VwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgZ3JvdXAgPT09ICdzdHJpbmcnKSB7XG4gICAgICBncm91cCA9IFtncm91cF1cbiAgICB9XG4gICAgZ3JvdXAuZm9yRWFjaChmdW5jdGlvbihncm91cEl0ZW0pIHtcbiAgICAgIGlmICh0eXBlcy5pbmRleE9mKGdyb3VwSXRlbSkgPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW5jb3JyZWN0IGNvbmZpZ3VyYXRpb24gb2YgdGhlIHJ1bGU6IFVua25vd24gdHlwZSBgJyArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZ3JvdXBJdGVtKSArICdgJylcbiAgICAgIH1cbiAgICAgIGlmIChyZXNbZ3JvdXBJdGVtXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW5jb3JyZWN0IGNvbmZpZ3VyYXRpb24gb2YgdGhlIHJ1bGU6IGAnICsgZ3JvdXBJdGVtICsgJ2AgaXMgZHVwbGljYXRlZCcpXG4gICAgICB9XG4gICAgICByZXNbZ3JvdXBJdGVtXSA9IGluZGV4XG4gICAgfSlcbiAgICByZXR1cm4gcmVzXG4gIH0sIHt9KVxuXG4gIGNvbnN0IG9taXR0ZWRUeXBlcyA9IHR5cGVzLmZpbHRlcihmdW5jdGlvbih0eXBlKSB7XG4gICAgcmV0dXJuIHJhbmtPYmplY3RbdHlwZV0gPT09IHVuZGVmaW5lZFxuICB9KVxuXG4gIHJldHVybiBvbWl0dGVkVHlwZXMucmVkdWNlKGZ1bmN0aW9uKHJlcywgdHlwZSkge1xuICAgIHJlc1t0eXBlXSA9IGdyb3Vwcy5sZW5ndGhcbiAgICByZXR1cm4gcmVzXG4gIH0sIHJhbmtPYmplY3QpXG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQYXRoR3JvdXBzRm9yUmFua3MocGF0aEdyb3Vwcykge1xuICBjb25zdCBhZnRlciA9IHt9XG4gIGNvbnN0IGJlZm9yZSA9IHt9XG5cbiAgY29uc3QgdHJhbnNmb3JtZWQgPSBwYXRoR3JvdXBzLm1hcCgocGF0aEdyb3VwLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IHsgZ3JvdXAsIHBvc2l0aW9uOiBwb3NpdGlvblN0cmluZyB9ID0gcGF0aEdyb3VwXG4gICAgbGV0IHBvc2l0aW9uID0gMFxuICAgIGlmIChwb3NpdGlvblN0cmluZyA9PT0gJ2FmdGVyJykge1xuICAgICAgaWYgKCFhZnRlcltncm91cF0pIHtcbiAgICAgICAgYWZ0ZXJbZ3JvdXBdID0gMVxuICAgICAgfVxuICAgICAgcG9zaXRpb24gPSBhZnRlcltncm91cF0rK1xuICAgIH0gZWxzZSBpZiAocG9zaXRpb25TdHJpbmcgPT09ICdiZWZvcmUnKSB7XG4gICAgICBpZiAoIWJlZm9yZVtncm91cF0pIHtcbiAgICAgICAgYmVmb3JlW2dyb3VwXSA9IFtdXG4gICAgICB9XG4gICAgICBiZWZvcmVbZ3JvdXBdLnB1c2goaW5kZXgpXG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIHBhdGhHcm91cCwgeyBwb3NpdGlvbiB9KVxuICB9KVxuXG4gIGxldCBtYXhQb3NpdGlvbiA9IDFcblxuICBPYmplY3Qua2V5cyhiZWZvcmUpLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgZ3JvdXBMZW5ndGggPSBiZWZvcmVbZ3JvdXBdLmxlbmd0aFxuICAgIGJlZm9yZVtncm91cF0uZm9yRWFjaCgoZ3JvdXBJbmRleCwgaW5kZXgpID0+IHtcbiAgICAgIHRyYW5zZm9ybWVkW2dyb3VwSW5kZXhdLnBvc2l0aW9uID0gLTEgKiAoZ3JvdXBMZW5ndGggLSBpbmRleClcbiAgICB9KVxuICAgIG1heFBvc2l0aW9uID0gTWF0aC5tYXgobWF4UG9zaXRpb24sIGdyb3VwTGVuZ3RoKVxuICB9KVxuXG4gIE9iamVjdC5rZXlzKGFmdGVyKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICBjb25zdCBncm91cE5leHRQb3NpdGlvbiA9IGFmdGVyW2tleV1cbiAgICBtYXhQb3NpdGlvbiA9IE1hdGgubWF4KG1heFBvc2l0aW9uLCBncm91cE5leHRQb3NpdGlvbiAtIDEpXG4gIH0pXG5cbiAgcmV0dXJuIHtcbiAgICBwYXRoR3JvdXBzOiB0cmFuc2Zvcm1lZCxcbiAgICBtYXhQb3NpdGlvbjogbWF4UG9zaXRpb24gPiAxMCA/IE1hdGgucG93KDEwLCBNYXRoLmNlaWwoTWF0aC5sb2cxMChtYXhQb3NpdGlvbikpKSA6IDEwLFxuICB9XG59XG5cbmZ1bmN0aW9uIGZpeE5ld0xpbmVBZnRlckltcG9ydChjb250ZXh0LCBwcmV2aW91c0ltcG9ydCkge1xuICBjb25zdCBwcmV2Um9vdCA9IGZpbmRSb290Tm9kZShwcmV2aW91c0ltcG9ydC5ub2RlKVxuICBjb25zdCB0b2tlbnNUb0VuZE9mTGluZSA9IHRha2VUb2tlbnNBZnRlcldoaWxlKFxuICAgIGNvbnRleHQuZ2V0U291cmNlQ29kZSgpLCBwcmV2Um9vdCwgY29tbWVudE9uU2FtZUxpbmVBcyhwcmV2Um9vdCkpXG5cbiAgbGV0IGVuZE9mTGluZSA9IHByZXZSb290LnJhbmdlWzFdXG4gIGlmICh0b2tlbnNUb0VuZE9mTGluZS5sZW5ndGggPiAwKSB7XG4gICAgZW5kT2ZMaW5lID0gdG9rZW5zVG9FbmRPZkxpbmVbdG9rZW5zVG9FbmRPZkxpbmUubGVuZ3RoIC0gMV0ucmFuZ2VbMV1cbiAgfVxuICByZXR1cm4gKGZpeGVyKSA9PiBmaXhlci5pbnNlcnRUZXh0QWZ0ZXJSYW5nZShbcHJldlJvb3QucmFuZ2VbMF0sIGVuZE9mTGluZV0sICdcXG4nKVxufVxuXG5mdW5jdGlvbiByZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpIHtcbiAgY29uc3Qgc291cmNlQ29kZSA9IGNvbnRleHQuZ2V0U291cmNlQ29kZSgpXG4gIGNvbnN0IHByZXZSb290ID0gZmluZFJvb3ROb2RlKHByZXZpb3VzSW1wb3J0Lm5vZGUpXG4gIGNvbnN0IGN1cnJSb290ID0gZmluZFJvb3ROb2RlKGN1cnJlbnRJbXBvcnQubm9kZSlcbiAgY29uc3QgcmFuZ2VUb1JlbW92ZSA9IFtcbiAgICBmaW5kRW5kT2ZMaW5lV2l0aENvbW1lbnRzKHNvdXJjZUNvZGUsIHByZXZSb290KSxcbiAgICBmaW5kU3RhcnRPZkxpbmVXaXRoQ29tbWVudHMoc291cmNlQ29kZSwgY3VyclJvb3QpLFxuICBdXG4gIGlmICgvXlxccyokLy50ZXN0KHNvdXJjZUNvZGUudGV4dC5zdWJzdHJpbmcocmFuZ2VUb1JlbW92ZVswXSwgcmFuZ2VUb1JlbW92ZVsxXSkpKSB7XG4gICAgcmV0dXJuIChmaXhlcikgPT4gZml4ZXIucmVtb3ZlUmFuZ2UocmFuZ2VUb1JlbW92ZSlcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkXG59XG5cbmZ1bmN0aW9uIG1ha2VOZXdsaW5lc0JldHdlZW5SZXBvcnQgKGNvbnRleHQsIGltcG9ydGVkLCBuZXdsaW5lc0JldHdlZW5JbXBvcnRzKSB7XG4gIGNvbnN0IGdldE51bWJlck9mRW1wdHlMaW5lc0JldHdlZW4gPSAoY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpID0+IHtcbiAgICBjb25zdCBsaW5lc0JldHdlZW5JbXBvcnRzID0gY29udGV4dC5nZXRTb3VyY2VDb2RlKCkubGluZXMuc2xpY2UoXG4gICAgICBwcmV2aW91c0ltcG9ydC5ub2RlLmxvYy5lbmQubGluZSxcbiAgICAgIGN1cnJlbnRJbXBvcnQubm9kZS5sb2Muc3RhcnQubGluZSAtIDFcbiAgICApXG5cbiAgICByZXR1cm4gbGluZXNCZXR3ZWVuSW1wb3J0cy5maWx0ZXIoKGxpbmUpID0+ICFsaW5lLnRyaW0oKS5sZW5ndGgpLmxlbmd0aFxuICB9XG4gIGxldCBwcmV2aW91c0ltcG9ydCA9IGltcG9ydGVkWzBdXG5cbiAgaW1wb3J0ZWQuc2xpY2UoMSkuZm9yRWFjaChmdW5jdGlvbihjdXJyZW50SW1wb3J0KSB7XG4gICAgY29uc3QgZW1wdHlMaW5lc0JldHdlZW4gPSBnZXROdW1iZXJPZkVtcHR5TGluZXNCZXR3ZWVuKGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KVxuXG4gICAgaWYgKG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgPT09ICdhbHdheXMnXG4gICAgICAgIHx8IG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgPT09ICdhbHdheXMtYW5kLWluc2lkZS1ncm91cHMnKSB7XG4gICAgICBpZiAoY3VycmVudEltcG9ydC5yYW5rICE9PSBwcmV2aW91c0ltcG9ydC5yYW5rICYmIGVtcHR5TGluZXNCZXR3ZWVuID09PSAwKSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgICBub2RlOiBwcmV2aW91c0ltcG9ydC5ub2RlLFxuICAgICAgICAgIG1lc3NhZ2U6ICdUaGVyZSBzaG91bGQgYmUgYXQgbGVhc3Qgb25lIGVtcHR5IGxpbmUgYmV0d2VlbiBpbXBvcnQgZ3JvdXBzJyxcbiAgICAgICAgICBmaXg6IGZpeE5ld0xpbmVBZnRlckltcG9ydChjb250ZXh0LCBwcmV2aW91c0ltcG9ydCksXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2UgaWYgKGN1cnJlbnRJbXBvcnQucmFuayA9PT0gcHJldmlvdXNJbXBvcnQucmFua1xuICAgICAgICAmJiBlbXB0eUxpbmVzQmV0d2VlbiA+IDBcbiAgICAgICAgJiYgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cyAhPT0gJ2Fsd2F5cy1hbmQtaW5zaWRlLWdyb3VwcycpIHtcbiAgICAgICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgICAgIG5vZGU6IHByZXZpb3VzSW1wb3J0Lm5vZGUsXG4gICAgICAgICAgbWVzc2FnZTogJ1RoZXJlIHNob3VsZCBiZSBubyBlbXB0eSBsaW5lIHdpdGhpbiBpbXBvcnQgZ3JvdXAnLFxuICAgICAgICAgIGZpeDogcmVtb3ZlTmV3TGluZUFmdGVySW1wb3J0KGNvbnRleHQsIGN1cnJlbnRJbXBvcnQsIHByZXZpb3VzSW1wb3J0KSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGVtcHR5TGluZXNCZXR3ZWVuID4gMCkge1xuICAgICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgICBub2RlOiBwcmV2aW91c0ltcG9ydC5ub2RlLFxuICAgICAgICBtZXNzYWdlOiAnVGhlcmUgc2hvdWxkIGJlIG5vIGVtcHR5IGxpbmUgYmV0d2VlbiBpbXBvcnQgZ3JvdXBzJyxcbiAgICAgICAgZml4OiByZW1vdmVOZXdMaW5lQWZ0ZXJJbXBvcnQoY29udGV4dCwgY3VycmVudEltcG9ydCwgcHJldmlvdXNJbXBvcnQpLFxuICAgICAgfSlcbiAgICB9XG5cbiAgICBwcmV2aW91c0ltcG9ydCA9IGN1cnJlbnRJbXBvcnRcbiAgfSlcbn1cblxuZnVuY3Rpb24gZ2V0QWxwaGFiZXRpemVDb25maWcob3B0aW9ucykge1xuICBjb25zdCBhbHBoYWJldGl6ZSA9IG9wdGlvbnMuYWxwaGFiZXRpemUgfHwge31cbiAgY29uc3Qgb3JkZXIgPSBhbHBoYWJldGl6ZS5vcmRlciB8fCAnaWdub3JlJ1xuICBjb25zdCBjYXNlSW5zZW5zaXRpdmUgPSBhbHBoYWJldGl6ZS5jYXNlSW5zZW5zaXRpdmUgfHwgZmFsc2VcblxuICByZXR1cm4ge29yZGVyLCBjYXNlSW5zZW5zaXRpdmV9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBtZXRhOiB7XG4gICAgdHlwZTogJ3N1Z2dlc3Rpb24nLFxuICAgIGRvY3M6IHtcbiAgICAgIHVybDogZG9jc1VybCgnb3JkZXInKSxcbiAgICB9LFxuXG4gICAgZml4YWJsZTogJ2NvZGUnLFxuICAgIHNjaGVtYTogW1xuICAgICAge1xuICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgIGdyb3Vwczoge1xuICAgICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzOiB7XG4gICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcGF0aEdyb3Vwczoge1xuICAgICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgcGF0dGVybjoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBwYXR0ZXJuT3B0aW9uczoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBncm91cDoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgICBlbnVtOiB0eXBlcyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgIGVudW06IFsnYWZ0ZXInLCAnYmVmb3JlJ10sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsncGF0dGVybicsICdncm91cCddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgICduZXdsaW5lcy1iZXR3ZWVuJzoge1xuICAgICAgICAgICAgZW51bTogW1xuICAgICAgICAgICAgICAnaWdub3JlJyxcbiAgICAgICAgICAgICAgJ2Fsd2F5cycsXG4gICAgICAgICAgICAgICdhbHdheXMtYW5kLWluc2lkZS1ncm91cHMnLFxuICAgICAgICAgICAgICAnbmV2ZXInLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFscGhhYmV0aXplOiB7XG4gICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgY2FzZUluc2Vuc2l0aXZlOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBvcmRlcjoge1xuICAgICAgICAgICAgICAgIGVudW06IFsnaWdub3JlJywgJ2FzYycsICdkZXNjJ10sXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogJ2lnbm9yZScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgXSxcbiAgfSxcblxuICBjcmVhdGU6IGZ1bmN0aW9uIGltcG9ydE9yZGVyUnVsZSAoY29udGV4dCkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSBjb250ZXh0Lm9wdGlvbnNbMF0gfHwge31cbiAgICBjb25zdCBuZXdsaW5lc0JldHdlZW5JbXBvcnRzID0gb3B0aW9uc1snbmV3bGluZXMtYmV0d2VlbiddIHx8ICdpZ25vcmUnXG4gICAgY29uc3QgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXMgPSBuZXcgU2V0KG9wdGlvbnNbJ3BhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzJ10gfHwgWydidWlsdGluJywgJ2V4dGVybmFsJ10pXG4gICAgY29uc3QgYWxwaGFiZXRpemUgPSBnZXRBbHBoYWJldGl6ZUNvbmZpZyhvcHRpb25zKVxuICAgIGxldCByYW5rc1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgcGF0aEdyb3VwcywgbWF4UG9zaXRpb24gfSA9IGNvbnZlcnRQYXRoR3JvdXBzRm9yUmFua3Mob3B0aW9ucy5wYXRoR3JvdXBzIHx8IFtdKVxuICAgICAgcmFua3MgPSB7XG4gICAgICAgIGdyb3VwczogY29udmVydEdyb3Vwc1RvUmFua3Mob3B0aW9ucy5ncm91cHMgfHwgZGVmYXVsdEdyb3VwcyksXG4gICAgICAgIHBhdGhHcm91cHMsXG4gICAgICAgIG1heFBvc2l0aW9uLFxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBNYWxmb3JtZWQgY29uZmlndXJhdGlvblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgUHJvZ3JhbTogZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgIGNvbnRleHQucmVwb3J0KG5vZGUsIGVycm9yLm1lc3NhZ2UpXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgfVxuICAgIGxldCBpbXBvcnRlZCA9IFtdXG4gICAgbGV0IGxldmVsID0gMFxuXG4gICAgZnVuY3Rpb24gaW5jcmVtZW50TGV2ZWwoKSB7XG4gICAgICBsZXZlbCsrXG4gICAgfVxuICAgIGZ1bmN0aW9uIGRlY3JlbWVudExldmVsKCkge1xuICAgICAgbGV2ZWwtLVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBJbXBvcnREZWNsYXJhdGlvbjogZnVuY3Rpb24gaGFuZGxlSW1wb3J0cyhub2RlKSB7XG4gICAgICAgIGlmIChub2RlLnNwZWNpZmllcnMubGVuZ3RoKSB7IC8vIElnbm9yaW5nIHVuYXNzaWduZWQgaW1wb3J0c1xuICAgICAgICAgIGNvbnN0IG5hbWUgPSBub2RlLnNvdXJjZS52YWx1ZVxuICAgICAgICAgIHJlZ2lzdGVyTm9kZShcbiAgICAgICAgICAgIGNvbnRleHQsXG4gICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICdpbXBvcnQnLFxuICAgICAgICAgICAgcmFua3MsXG4gICAgICAgICAgICBpbXBvcnRlZCxcbiAgICAgICAgICAgIHBhdGhHcm91cHNFeGNsdWRlZEltcG9ydFR5cGVzXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgQ2FsbEV4cHJlc3Npb246IGZ1bmN0aW9uIGhhbmRsZVJlcXVpcmVzKG5vZGUpIHtcbiAgICAgICAgaWYgKGxldmVsICE9PSAwIHx8ICFpc1N0YXRpY1JlcXVpcmUobm9kZSkgfHwgIWlzSW5WYXJpYWJsZURlY2xhcmF0b3Iobm9kZS5wYXJlbnQpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmFtZSA9IG5vZGUuYXJndW1lbnRzWzBdLnZhbHVlXG4gICAgICAgIHJlZ2lzdGVyTm9kZShcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICAncmVxdWlyZScsXG4gICAgICAgICAgcmFua3MsXG4gICAgICAgICAgaW1wb3J0ZWQsXG4gICAgICAgICAgcGF0aEdyb3Vwc0V4Y2x1ZGVkSW1wb3J0VHlwZXNcbiAgICAgICAgKVxuICAgICAgfSxcbiAgICAgICdQcm9ncmFtOmV4aXQnOiBmdW5jdGlvbiByZXBvcnRBbmRSZXNldCgpIHtcbiAgICAgICAgaWYgKG5ld2xpbmVzQmV0d2VlbkltcG9ydHMgIT09ICdpZ25vcmUnKSB7XG4gICAgICAgICAgbWFrZU5ld2xpbmVzQmV0d2VlblJlcG9ydChjb250ZXh0LCBpbXBvcnRlZCwgbmV3bGluZXNCZXR3ZWVuSW1wb3J0cylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhbHBoYWJldGl6ZS5vcmRlciAhPT0gJ2lnbm9yZScpIHtcbiAgICAgICAgICBtdXRhdGVSYW5rc1RvQWxwaGFiZXRpemUoaW1wb3J0ZWQsIGFscGhhYmV0aXplKVxuICAgICAgICB9XG5cbiAgICAgICAgbWFrZU91dE9mT3JkZXJSZXBvcnQoY29udGV4dCwgaW1wb3J0ZWQpXG5cbiAgICAgICAgaW1wb3J0ZWQgPSBbXVxuICAgICAgfSxcbiAgICAgIEZ1bmN0aW9uRGVjbGFyYXRpb246IGluY3JlbWVudExldmVsLFxuICAgICAgRnVuY3Rpb25FeHByZXNzaW9uOiBpbmNyZW1lbnRMZXZlbCxcbiAgICAgIEFycm93RnVuY3Rpb25FeHByZXNzaW9uOiBpbmNyZW1lbnRMZXZlbCxcbiAgICAgIEJsb2NrU3RhdGVtZW50OiBpbmNyZW1lbnRMZXZlbCxcbiAgICAgIE9iamVjdEV4cHJlc3Npb246IGluY3JlbWVudExldmVsLFxuICAgICAgJ0Z1bmN0aW9uRGVjbGFyYXRpb246ZXhpdCc6IGRlY3JlbWVudExldmVsLFxuICAgICAgJ0Z1bmN0aW9uRXhwcmVzc2lvbjpleGl0JzogZGVjcmVtZW50TGV2ZWwsXG4gICAgICAnQXJyb3dGdW5jdGlvbkV4cHJlc3Npb246ZXhpdCc6IGRlY3JlbWVudExldmVsLFxuICAgICAgJ0Jsb2NrU3RhdGVtZW50OmV4aXQnOiBkZWNyZW1lbnRMZXZlbCxcbiAgICAgICdPYmplY3RFeHByZXNzaW9uOmV4aXQnOiBkZWNyZW1lbnRMZXZlbCxcbiAgICB9XG4gIH0sXG59XG4iXX0=