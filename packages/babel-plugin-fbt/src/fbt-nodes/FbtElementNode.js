/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @emails oncall+internationalization
 * @flow
 */
/*eslint max-len: ["error", 100]*/
/* eslint-disable brace-style */ // Needed due to Flow types inlined in comments

'use strict';

/*::
import type {ParamSet} from '../FbtUtil';
import type FbtImplicitParamNodeType from './FbtImplicitParamNode';
import type {JSModuleNameType} from '../FbtConstants';
import type {AnyStringVariationArg, StringVariationArgsMap} from './FbtArguments';
import type {FbtChildNode, AnyFbtNode} from './FbtNode';

type Options = {|
  // Author of the strings generated by this fbt callsite
  author: ?string;
  // If `true`, the fbt text must match an entry from `FbtCommon`,
  // and the string description will be ignored
  common: boolean;
  // If `true`, do not extract strings from this fbt callsite.
  // We'll still transform this callsite to a regular fbt._() using untranslated texts though.
  // When nullish, we'll give priority to the file-level `doNotExtract` annotation
  // to determine whether to extract the phrase.
  doNotExtract: ?boolean;
  // We normally consolidates whitespace down to one space (`' '`).
  // Turn this off by setting this to `true`
  preserveWhitespace: boolean;
  // fbt project name
  project: string;
  // If defined, the translated string may depend on the gender of the sentence's subject.
  subject: ?BabelNode;
|};
*/

export interface IFbtElementNode {
  /**
   * Returns description of this fbt string for the given map of string variation arguments
   */
  getDescription(argsMap: StringVariationArgsMap): string;
  /**
   * Register a token name
   * @throws if the token name was already registered
   */
  registerToken(name: string, source: AnyFbtNode): void;
  _tokenSet: ParamSet;
  __toJSONForTestsOnly(): mixed;
}

const {
  FbtBooleanOptions,
  ValidFbtOptions,
} = require('../FbtConstants');
const {compactBabelNodeProps} = require('../FbtUtil');
const {
  collectOptionsFromFbtConstruct,
  enforceBabelNode,
  enforceBoolean,
  enforceString,
  errorAt,
  expandStringConcat,
  normalizeSpaces,
  setUniqueToken,
} = require('../FbtUtil');
const {GENDER_ANY} = require('../translate/IntlVariations');
const {GenderStringVariationArg} = require('./FbtArguments');
const FbtNode = require('./FbtNode');
const {
  getChildNodeText,
  getChildNodeTextForDescription,
  getTextFromFbtNodeTree,
  runOnNestedChildren,
} = require('./FbtNodeUtil');
const {
  isArrayExpression,
  isCallExpression,
  isJSXElement,
  isNode,
  isSpreadElement,
} = require('@babel/types');
const invariant = require('invariant');

/**
 * Represents the main fbt() or <fbt> construct.
 * Every nested fbt construct will be reachable from the `children` property.
 *
 * E.g. When we have an fbt callsite like this:
 *
 *     fbt(
 *       [
 *         'Hello',
 *         <strong>
 *           World!
 *         </strong>
 *       ],
 *       'description',
 *     )
 *
 * We'll represent it like this:
 *
 * FbtElementNode                    // fbt()
 *   |
 *   *- FbtTextNode                  // 'Hello'
 *   *- FbtImplicitParamNode         // <strong/>
 *        |
 *        *- FbtTextNode             // 'World!'
 *
 */
class FbtElementNode
  extends FbtNode/*:: <
    AnyStringVariationArg,
    BabelNodeCallExpression,
    FbtChildNode
  >
  implements IFbtElementNode
  */ {

  /*::
  static +type: 'element';
  +options: Options;
  */

  _tokenSet /*: ParamSet */ = {};

  getOptions() /*: Options */ {
    const {node} = this;
    const rawOptions = collectOptionsFromFbtConstruct(
      this.moduleName,
      node,
      ValidFbtOptions,
      FbtBooleanOptions,
    );

    try {
      return {
        author: enforceString.orNull(rawOptions.author),
        common: enforceBoolean.orNull(rawOptions.common) || false,
        doNotExtract: enforceBoolean.orNull(rawOptions.doNotExtract),
        preserveWhitespace: enforceBoolean.orNull(rawOptions.preserveWhitespace) || false,
        project: enforceString(rawOptions.project || ''),
        subject: enforceBabelNode.orNull(rawOptions.subject),
      };
    } catch (error) {
      throw errorAt(node, error);
    }
  }

  static getArgsForStringVariationCalcForFbtElement(
    instance: FbtElementNode | FbtImplicitParamNodeType,
    subject: ?BabelNode,
  ) /*: $ReadOnlyArray<AnyStringVariationArg> */ {
    return (isNode(subject)
      ? [new GenderStringVariationArg(instance, subject, [GENDER_ANY])]
      : []
    ).concat(...instance.children.map(c => c.getArgsForStringVariationCalc()));
  }

  getArgsForStringVariationCalc() /*: $ReadOnlyArray<AnyStringVariationArg> */ {
    return this.constructor.getArgsForStringVariationCalcForFbtElement(this, this.options.subject);
  }

  /**
   * Run some sanity checks before producing text
   * @throws if some fbt nodes in the tree have duplicate token names
   */
  static beforeGetTextSanityCheck(
    instance: FbtElementNode | FbtImplicitParamNodeType,
    argsMap: StringVariationArgsMap,
  ): void {
    instance.children.forEach(child => {
      const tokenName = child.getTokenName(argsMap);
      if (tokenName != null) {
        instance.registerToken(tokenName, child);
      }
    });
  }

  /**
   * Run some sanity checks before producing text
   * @throws if some fbt nodes in the tree have duplicate token names
   */
  _beforeGetTextSanityCheck(argsMap: StringVariationArgsMap): void {
    this.constructor.beforeGetTextSanityCheck(this, argsMap);
  }

  getText(
    argsMap: StringVariationArgsMap,
  ): string {
    try {
      this._beforeGetTextSanityCheck(argsMap);
      return getTextFromFbtNodeTree(
        this,
        argsMap,
        this.options.subject,
        this.options.preserveWhitespace,
        getChildNodeText,
      );
    } catch (error) {
      throw errorAt(this.node, error);
    }
  }

  getTextForDescription(
    argsMap: StringVariationArgsMap,
    targetFbtNode: FbtImplicitParamNodeType,
  ): string {
    return getTextFromFbtNodeTree(
      this,
      argsMap,
      this.options.subject,
      this.options.preserveWhitespace,
      getChildNodeTextForDescription.bind(null, targetFbtNode),
    );
  }

  /**
   * @see IFbtElementNode#getDescription
   */
  getDescription(_args /*: StringVariationArgsMap */) /*: string */ {
    const [_, descriptionNode] = this.getCallNodeArguments() || [];
    invariant(descriptionNode != null, 'fbt description argument cannot be found');

    return normalizeSpaces(
      expandStringConcat(
        this.moduleName,
        descriptionNode,
      ).value,
      {preserveWhitespace: !!this.options.preserveWhitespace},
    ).trim();
  }

  /**
   * Create a new class instance given a BabelNode root node.
   * If that node is incompatible, we'll just return `null`.
   */
  static fromBabelNode({
    moduleName,
    node,
  } /*: {|
    moduleName: JSModuleNameType,
    node: BabelNode,
  |} */) /*: ?FbtElementNode */ {
    if (!isCallExpression(node)) {
      return null;
    }
    const fbtElement = new FbtElementNode({
      moduleName,
      node,
    });
    const {arguments: [fbtContentsNode]} = node;

    if (!isArrayExpression(fbtContentsNode)) {
      throw errorAt(
        node,
        `${moduleName}: expected callsite's first argument to be an array`,
      );
    }

    for (const elementChild of (fbtContentsNode.elements || [])) {
      if (elementChild == null) {
        throw errorAt(node, `${moduleName}: elementChild must not be nullish`);
      }
      if (isSpreadElement(elementChild)) {
        throw errorAt(elementChild, `Array spread syntax is not supported`);
      }
      fbtElement.appendChild(this.createChildNode({
        moduleName,
        node: elementChild,
      }));
    }
    return fbtElement;
  }

  /**
   * Create a child fbt node for a given BabelNode.
   */
  static createChildNode({
    moduleName,
    node,
  } /*: {|
    moduleName: JSModuleNameType,
    node: BabelNodeExpression,
  |} */) /*: FbtChildNode */ {
    // Some of these modules may cause dependency cycles with the current one.
    // So we must import them only on-demand rather than on initialization.
    // Don't worry, require() calls are cached.
    const FbtEnumNode = require('./FbtEnumNode');
    const FbtImplicitParamNode = require('./FbtImplicitParamNode');
    const FbtNameNode = require('./FbtNameNode');
    const FbtParamNode = require('./FbtParamNode');
    const FbtPluralNode = require('./FbtPluralNode');
    const FbtPronounNode = require('./FbtPronounNode');
    const FbtSameParamNode = require('./FbtSameParamNode');
    const FbtTextNode = require('./FbtTextNode');

    let fbtChildNode;
    const fbtChildNodeClasses = [
      FbtEnumNode,
      FbtNameNode,
      FbtParamNode,
      FbtPluralNode,
      FbtPronounNode,
      FbtSameParamNode,
      FbtTextNode,
    ];

    for (const Constructor of fbtChildNodeClasses) {
      fbtChildNode = Constructor.fromBabelNode({moduleName, node});
      if (fbtChildNode != null) {
        break;
      }
    }

    // Try to convert to FbtImplicitParamNode as a last resort
    if (fbtChildNode == null && isJSXElement(node)) {
      // Later on, we should only allow non-fbt JSX elements here for auto-wrapping.
      // fbt:param, fbt:pronoun, etc... should appear as children of it.
      fbtChildNode = FbtImplicitParamNode.fromBabelNode({moduleName, node});
    }

    if (fbtChildNode != null) {
      return fbtChildNode;
    }
    throw errorAt(node, `${moduleName}: unsupported babel node: ${node.type}`);
  }

  getImplicitParamNodes(): $ReadOnlyArray<FbtImplicitParamNodeType> {
    // Importing this module only here to avoid dependency cycle
    const FbtImplicitParamNode = require('./FbtImplicitParamNode');
    const ret = [];
    runOnNestedChildren(this, child => {
      if (child instanceof FbtImplicitParamNode) {
        ret.push(child);
      }
    });
    return ret;
  }

  /**
   * @see IFbtElementNode#registerToken
   */
  registerToken(name /*: string */, source /*: AnyFbtNode */) /*: void */ {
    setUniqueToken(source.node, this.moduleName, name, this._tokenSet);
  }

  /**
   * For debugging and unit tests
   */
  static __toJSONForTestsOnlyHelper(instance: FbtElementNode | FbtImplicitParamNodeType): mixed {
    const ret = FbtNode.prototype.__toJSONForTestsOnly.call(instance);
    ret._tokenSet = compactBabelNodeProps(ret._tokenSet, false);
    return ret;
  }

  __toJSONForTestsOnly() /*: mixed */ {
    return this.constructor.__toJSONForTestsOnlyHelper(this);
  }
}
// $FlowFixMe[cannot-write] Needed because node.js v10 does not support static constants on classes
FbtElementNode.type = 'element';

module.exports = FbtElementNode;
