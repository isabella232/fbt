/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @emails oncall+internationalization
 * @flow
 */
/*eslint max-len: ["error", 100]*/

'use strict';

/*::
import typeof BabelTypes from '@babel/types';
import type {
  BabelTransformPlugin,
} from '@babel/core';
import type {FbtCommonMap} from './FbtCommon';
import type {
  FbtCallSiteOptions,
} from './FbtConstants';
import type {
  ExtractTableTextItems,
  FbtFunctionCallPhrase,
} from './babel-processors/FbtFunctionCallProcessor';
import type {FbtRuntimeInput} from '../../../runtime/shared/FbtHooks';
import type {EnumManifest, EnumModule} from './FbtEnumRegistrar';
import type {
  FbtTableKey,
  PatternHash,
  PatternString,
} from '../../../runtime/shared/FbtTable';
import typeof {FbtVariationType} from './translate/IntlVariations';

export type ExtraBabelNodeProps = {
  implicitDesc?: string,
  implicitFbt?: boolean,
  parentIndex?: number,
};
export type FbtBabelNodeCallExpression = BabelNodeCallExpression & ExtraBabelNodeProps;
export type FbtBabelNodeJSXElement = BabelNodeJSXElement & ExtraBabelNodeProps;
export type FbtBabelNodeShape = $Shape<ExtraBabelNodeProps>;

export type ExtraOptions = {[optionName: string]: boolean};
type FbtEnumLoader = (enumFilePath: string) => EnumModule;
export type PluginOptions = {|
  auxiliaryTexts?: boolean,
  collectFbt?: boolean,
  extraOptions: ExtraOptions,
  fbtBase64?: boolean,
  fbtCommon?: FbtCommonMap,
  fbtCommonPath?: ?string,
  // Path to a JS module that must export a function that is responsible for
  // loading an fbt enum (by file path) and return its object.
  // I.e. fbt enum loading function signature: `FbtEnumLoader`
  fbtEnumLoader?: ?string,
  // Function that would return an fbt manifest object
  fbtEnumManifest?: ?EnumManifest,
  // Fbt enum file path
  fbtEnumPath?: ?string,
  // Object map of file paths keyed by fbt enum module names
  fbtEnumToPath?: ?{[enumName: string]: string},
  fbtSentinel?: ?string,
  filename?: ?string,
  reactNativeMode?: boolean,
|};

type TokenAlias = string;

// This is the main payload collected from the fbt callsite.
//
// - For simple fbt calls without interpolation (fbt.param) or multiplexing (fbt.plural,
//   fbt.enum, viewer context variation, etc), this is a simple vanilla string.
// - Otherwise this is a table whose keys correspond to the associated string variation
//   parameters passed to the various fbt constructs (param, plural, pronoun) of this callsite.
//
//  See the docblock for fbt._ for an example of the nested table and its behavior
type TableJSFBTTree = {|
  [key: FbtTableKey]: TableJSFBTTree | TableJSFBTTreeLeaf
|};

type TableJSFBTTreeLeaf =
  | PatternString
  | {|
      desc: string,
      text: string,
      tokenAliases: {|
        [clearTokenName: string]: TokenAlias
      |},
  |};

// Describes the usage of one level of the JSFBT table tree
export type JSFBTMetaEntry = $ReadOnly<{|
  type: $PropertyType<FbtVariationType, 'NUMBER'>,
  singular?: true, // TODO(T29504932) deprecate this
  token?: string, // token name
|} | {|
  type: $PropertyType<FbtVariationType, 'GENDER'>,
  token: string, // token name
|} | {|
  type: $PropertyType<FbtVariationType, 'PRONOUN'>,
|} | {| // for enums
  range: $ReadOnlyArray<string>,
|}>;

type TableJSFBT = $ReadOnly<{|
  t: $ReadOnly<TableJSFBTTree>,
  m: $ReadOnlyArray<?JSFBTMetaEntry>,
|}>;

export type ObjectWithJSFBT = {|
  type: 'text',
  jsfbt: PatternString,
|} | {|
  type: 'table',
  jsfbt: TableJSFBT,
|};

export type Phrase = {|
  ...FbtCallSiteOptions,
  col_beg: number,
  col_end: number,
  // TODO(T38926768): move this to `ObjectWithJSFBT[type=text]` since it should not be
  // defined when we have a JSFBT table
  desc: string,
  filepath: string,
  line_beg: number,
  line_end: number,
  project: string,
  texts?: ExtractTableTextItems,
  ...ObjectWithJSFBT,
|};
type ChildToParentMap = {[childIndex: number]: number};

export type BabelPluginFbt = {
  ({types: BabelTypes, ...}): BabelTransformPlugin<ExtraBabelNodeProps>,
  getExtractedStrings(): Array<Phrase>,
  getChildToParentRelationships(): ChildToParentMap,
  fbtHashKey(PatternString | FbtRuntimeInput, string, boolean): string
};
*/
const FbtCommonFunctionCallProcessor = require('./babel-processors/FbtCommonFunctionCallProcessor');
const FbtFunctionCallProcessor = require('./babel-processors/FbtFunctionCallProcessor');
const JSXFbtProcessor = require('./babel-processors/JSXFbtProcessor');
const FbtCommon = require('./FbtCommon');
const {
  JSModuleName: {FBT},
  ValidFbtOptions,
} = require('./FbtConstants');
const FbtEnumRegistrar = require('./FbtEnumRegistrar');
const fbtHashKey = require('./fbtHashKey');
const FbtShiftEnums = require('./FbtShiftEnums');
const FbtUtil = require('./FbtUtil');
const {
  checkOption,
  objMap,
} = FbtUtil;
const {
  RequireCheck: {isRequireAlias},
} = require('fb-babel-plugin-utils');
const {parse: parseDocblock} = require('jest-docblock');

/**
 * Default options passed from a docblock.
 */
let defaultOptions /*: FbtCallSiteOptions */;

/**
 * An array containing all collected phrases.
 */
let phrases/*: Array<Phrase>*/;

/**
 * An array containing the child to parent relationships for implicit nodes.
 */
let childToParent/*: ChildToParentMap*/;

function FbtTransform(babel /*: {
  types: BabelTypes,
}*/) /*: BabelTransformPlugin<ExtraBabelNodeProps>*/ {
  const t = babel.types;

  return {
    pre() {
      const pluginOptions: PluginOptions = this.opts;
      pluginOptions.fbtBase64 = pluginOptions.fbtBase64;

      FbtCommon.init(pluginOptions);
      FbtEnumRegistrar.setEnumManifest(getEnumManifest(pluginOptions));
      initExtraOptions(this);
      initDefaultOptions(this);
      phrases = [];
      childToParent = {};
    },

    name: FBT,
    visitor: {
      /**
       * Transform jsx-style <fbt> to fbt() calls.
       */
      JSXElement(path) {
        const root = JSXFbtProcessor.create({
          babelTypes: t,
          path,
        });

        if (!root) {
          return;
        }
        root.convertToFbtFunctionCallNode(phrases.length);
      },

      /**
       * Register enum imports
       */
      ImportDeclaration(path) {
        FbtEnumRegistrar.registerImportIfApplicable(path);
      },

      /**
       * Transform fbt("text", "desc", {project: "project"}) to semantically:
       *
       * fbt._(
       *   fbtSentinel +
       *   JSON.stringify({
       *     type: "text",
       *     texts: ["text"],
       *     desc: "desc",
       *     project: "project",
       *   }) +
       *   fbtSentinel
       * );
       */
      CallExpression(path) {
        const {node} = path;
        const visitor = this;
        const fileSource = visitor.file.code;
        const pluginOptions = visitor.opts;

        let root = FbtCommonFunctionCallProcessor.create({
          babelTypes: t,
          path,
        });

        if (root) {
          path.replaceWith(root.convertToNormalCall());
          return;
        }

        if (isRequireAlias(path.parentPath)) {
          FbtEnumRegistrar.registerRequireIfApplicable(path);
          return;
        }

        // TODO(T40113359): remove this once we've started replacing fbt() -> fbt._()
        // This is currently needed to avoid processing fbt() twice.
        // I.e. when Babel converts JSX -> React.createElement(),
        // it ends up re-evaluating nested CallExpressions
        // $FlowFixMe
        if (node._fbtProcessed) {
          return;
        }

        root = FbtFunctionCallProcessor.create({
          babelTypes: t,
          defaultFbtOptions: defaultOptions,
          fileSource,
          path,
          pluginOptions,
        });

        if (!root) {
          return;
        }

        // TODO(T40113359): remove this once we're done implementing proper conversion to fbt nodes
        // root.convertToFbtNode();

        const {
          callNode,
          metaPhrases,
        } = root.convertToFbtRuntimeCall();

        // TODO(T40113359): maybe remove this once we've started replacing fbt() -> fbt._()
        // This is currently needed to avoid processing fbt() twice
        // (during the enter/exit traversal phases of the babel transform)
        path.skip();
        // TODO(T40113359): remove this once we've started replacing fbt() -> fbt._()
        // This is currently needed to avoid processing fbt() twice.
        // I.e. when Babel converts JSX -> React.createElement(),
        // it ends up re-evaluating nested CallExpressions
        // $FlowFixMe
        node._fbtProcessed = true;

        // TODO(T40113359): implement converted fbt._() callsite
        // path.replaceWith(callNode);

        if (pluginOptions.collectFbt) {
          // TODO(T40113359): implement attaching the "texts" data onto the "phrase" object
          // if (pluginOptions.auxiliaryTexts) {
          //   phrase.texts = texts;
          // }

          let topLevelStringIndex;
          metaPhrases.forEach(({fbtNode, phrase}, index) => {
            if (phrase.doNotExtract) {
              return;
            }
            addPhrase(fbtNode.node, phrase, visitor);
            if (index > 0) {
              if (topLevelStringIndex == null) {
                // `-2` because we just inserted a top-level string and a nested string
                topLevelStringIndex = phrases.length - 2;
              }
              addEnclosingString(phrases.length - 1, topLevelStringIndex);
            }
          });
        }
      }, // CallExpression
    }, // visitor
  }; // babel plugin return
}

FbtTransform.getExtractedStrings = () /*: Array<Phrase>*/ => phrases;

FbtTransform.getChildToParentRelationships = () /*: ChildToParentMap*/ =>
  childToParent || {};

function initExtraOptions(state) {
  Object.assign(ValidFbtOptions, state.opts.extraOptions || {});
}

function initDefaultOptions(state) {
  defaultOptions = {};
  const comment = state.file.ast.comments[0];
  const docblock = (comment && comment.value) || '';
  const fbtDocblockOptions = parseDocblock(docblock).fbt;
  if (fbtDocblockOptions) {
    defaultOptions = JSON.parse(fbtDocblockOptions);
    Object.keys(defaultOptions).forEach(o => checkOption(o, ValidFbtOptions));
  }
  if (!defaultOptions.project) {
    defaultOptions.project = '';
  }
}

function addPhrase(node, phrase, state) {
  phrases.push({
    filepath: state.opts.filename,
    // $FlowFixMe `start` property might be null
    line_beg: node.loc.start.line,
    // $FlowFixMe `start` property might be null
    col_beg: node.loc.start.column,
    // $FlowFixMe `end` property might be null
    line_end: node.loc.end.line,
    // $FlowFixMe `end` property might be null
    col_end: node.loc.end.column,
    ...(phrase /*: FbtFunctionCallPhrase */),
  });
}

function addEnclosingString(childIdx, parentIdx) {
  childToParent[childIdx] = parentIdx;
}

function getEnumManifest(opts): ?EnumManifest {
  const {fbtEnumManifest, fbtEnumPath, fbtEnumToPath} = opts;
  if (fbtEnumManifest != null) {
    return fbtEnumManifest;
  } else if (fbtEnumPath != null) {
    // $FlowExpectedError node.js require() needs to be dynamic
    return require(fbtEnumPath);
  } else if (fbtEnumToPath != null) {
    const loadEnum: FbtEnumLoader = opts.fbtEnumLoader
      ? // $FlowExpectedError node.js require() needs to be dynamic
      require(opts.fbtEnumLoader)
      : require;
    return objMap(fbtEnumToPath, loadEnum);
  }
  return null;
}

FbtTransform.fbtHashKey = fbtHashKey;
FbtTransform.FbtShiftEnums = FbtShiftEnums;
FbtTransform.FbtUtil = FbtUtil;

module.exports = FbtTransform;
