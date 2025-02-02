/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @emails oncall+internationalization
 * @flow
 */
/*eslint max-len: ["error", 100]*/

'use strict';

/*::
import type {AnyFbtNode, FbtChildNode} from './FbtNode';
import type {JSModuleNameType} from '../FbtConstants';
import type FbtElementNode from './FbtElementNode';
import type FbtImplicitParamNodeType from './FbtImplicitParamNode';
import type {StringVariationArgsMap} from './FbtArguments';

export type FromBabelNodeFunctionArgs = {|
  moduleName: JSModuleNameType,
  node: BabelNode,
|};
*/

const FbtNodeChecker = require('../FbtNodeChecker');
const {
  errorAt,
  normalizeSpaces,
  varDump,
} = require('../FbtUtil');
const invariant = require('invariant');

function createInstanceFromFbtConstructCallsite/*:: <N: {}> */(
  moduleName /*: JSModuleNameType */,
  node /*: BabelNode */,
  Constructor /*: Class<N> & {+type: string} */,
) /*: ?N */ {
  const checker = FbtNodeChecker.forModule(moduleName);
  const constructName = checker.getFbtConstructNameFromFunctionCall(node);
  return constructName === Constructor.type
    ? new Constructor({
      moduleName,
      node,
    })
    : null;
}

/**
 * Returns the closest ancestor node of type: FbtElementNode | FbtImplicitParamNode
 */
function getClosestElementOrImplicitParamNodeAncestor(
  startNode: AnyFbtNode,
): FbtElementNode | FbtImplicitParamNodeType {
  const ret = startNode.getFirstAncestorOfType(require('./FbtImplicitParamNode')) ||
    startNode.getFirstAncestorOfType(require('./FbtElementNode'));
  invariant(
    ret != null,
    'Unable to find closest ancestor of type FbtElementNode or FbtImplicitParamNode for node: %s',
    varDump(startNode),
  );
  return ret;
}

function runOnNestedChildren(
  node: AnyFbtNode,
  callback: (node: AnyFbtNode) => void,
): void {
  for (const child of node.children) {
    callback(child);
    if (child.children.length) {
      runOnNestedChildren(child, callback);
    }
  }
}

/**
 * Convert input text to a token name.
 *
 * It's using a naive way to replace curly brackets present inside the text to square brackets.
 *
 * It's good enough for now because we currently:
 *   - don't protect/encode curly brackets provided in the source text
 *   - don't prevent token names to contain curly brackets from userland
 *
 * @example `convertToTokenName('Hello {name}') === '=Hello [name]'`
 */
function convertToTokenName(text: string): string {
  return `=${text.replace(/[{}]/g, m => m === '{' ? '[' : ']' )}`;
}

function tokenNameToTextPattern(tokenName: string): string {
  return `{${tokenName}}`;
}

/**
 * Collect and normalize text output from a tree of fbt nodes.
 * @param subject Babel node of the subject's gender of the sentence
 * @param getChildNodeText Callback responsible for returning the text of an FbtChildNode
 */
function getTextFromFbtNodeTree(
  instance: FbtElementNode | FbtImplicitParamNodeType,
  argsMap: StringVariationArgsMap,
  subject: ?BabelNode,
  preserveWhitespace: boolean,
  getChildNodeText: (argsMap: StringVariationArgsMap, child: FbtChildNode) => string,
): string {
  try {
    if (subject) {
      argsMap.mustHave(instance);
    }
    const texts = instance.children.map(getChildNodeText.bind(null, argsMap));
    return normalizeSpaces(
      texts.join(''),
      {preserveWhitespace},
    ).trim();
  } catch (error) {
    throw errorAt(instance.node, error);
  }
}

function getChildNodeText(argsMap: StringVariationArgsMap, child: FbtChildNode): string {
  const FbtImplicitParamNode = require('./FbtImplicitParamNode');
  return child instanceof FbtImplicitParamNode
    ? tokenNameToTextPattern(child.getTokenName(argsMap))
    : child.getText(argsMap);
}

function getChildNodeTextForDescription(
  targetFbtNode: FbtImplicitParamNodeType,
  argsMap: StringVariationArgsMap,
  child: FbtChildNode,
): string {
  const FbtImplicitParamNode = require('./FbtImplicitParamNode');
  if (child instanceof FbtImplicitParamNode) {
    return child === targetFbtNode
      ? tokenNameToTextPattern(child.getTokenName(argsMap))
      : child.getTextForDescription(argsMap, targetFbtNode);
  } else {
    return child.getText(argsMap);
  }
}

module.exports = {
  convertToTokenName,
  createInstanceFromFbtConstructCallsite,
  getChildNodeText,
  getChildNodeTextForDescription,
  getClosestElementOrImplicitParamNodeAncestor,
  getTextFromFbtNodeTree,
  runOnNestedChildren,
  tokenNameToTextPattern,
};
