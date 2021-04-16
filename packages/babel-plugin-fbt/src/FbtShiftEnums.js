/**
 * Copyright 2004-present Facebook. All Rights Reserved.
 *
 * @emails oncall+internationalization
 * @format
 * @flow strict-local
 */
/* eslint-disable fb-www/flow-exact-by-default-object-types */

'use strict';

import type {PatternString} from '../../../runtime/shared/FbtTable';
import type {Phrase, TableJSFBT, TableJSFBTTree} from './index';

const {FbtType} = require('./FbtConstants');
const invariant = require('invariant');

/**
 * Used by collectFbt to output multiple phrases in a flat array.
 * See FbtShiftEnumsTest for example input and output.
 */
function extractEnumsAndFlattenPhrases(
  phrases: $ReadOnlyArray<Phrase>,
): Array<Phrase> {
  return _flatMap<Phrase, Phrase>(phrases, phrase => {
    if (phrase.type === FbtType.TEXT) {
      return phrase;
    }

    const {jsfbt} = phrase;
    const {enums, metadata} = _extractEnumsFromMetadata(jsfbt.m);
    const strippedJsfbts = _buildTablesWithoutEnums(jsfbt.t, enums, []).map(
      table => {
        invariant(
          (metadata.length === 0) === (typeof table === 'string'),
          "Plain text 'table' has no metadata.",
        );
        return typeof table === 'string'
          ? table
          : {
              t: table,
              m: metadata,
            };
      },
    );

    return strippedJsfbts.map(strippedJsfbt =>
      typeof strippedJsfbt === 'object'
        ? {
            ...phrase,
            jsfbt: strippedJsfbt,
            type: FbtType.TABLE,
          }
        : {
            ...phrase,
            jsfbt: strippedJsfbt,
            type: FbtType.TEXT,
          },
    );
  });
}

/**
 * Used by fbt-runtime babel plugin to build a table of enums to hashes of leaf
 * tables. See FbtShiftEnumsTest for example input and output.
 */
function shiftEnumsToTop(
  jsfbt: PatternString | TableJSFBT,
): {|
  shiftedJsfbt: PatternString | $ReadOnly<TableJSFBTTree>,
  enumCount: number,
|} {
  if (typeof jsfbt === 'string') {
    return {shiftedJsfbt: jsfbt, enumCount: 0};
  } else {
    const {enums} = _extractEnumsFromMetadata(jsfbt.m);
    return {
      shiftedJsfbt: _shiftEnumsToTop(enums, [], jsfbt.t),
      enumCount: enums.length,
    };
  }
}

function _extractEnumsFromMetadata(metadata) {
  const enums: Array<$ReadOnlyArray<string>> = [];
  const metadataWithoutEnums = [];
  metadata.forEach(entry => {
    if (entry?.range) {
      enums.push(entry.range);
    } else {
      metadataWithoutEnums.push(entry);
    }
  });
  return {enums, metadata: metadataWithoutEnums};
}

function _buildTablesWithoutEnums(
  table: $ReadOnly<TableJSFBTTree>,
  enums: Array<$ReadOnlyArray<string>>,
  currentEnumKeys: $ReadOnlyArray<string>,
): Array<PatternString | $ReadOnly<TableJSFBTTree>> {
  if (enums.length === 0) {
    return [table];
  }

  const index = currentEnumKeys.length;
  if (index === enums.length) {
    return [_buildTableWithoutEnums(table, currentEnumKeys, 0)];
  }

  return _flatMap<string, PatternString | $ReadOnly<TableJSFBTTree>>(
    enums[index],
    enumKey =>
      _buildTablesWithoutEnums(table, enums, currentEnumKeys.concat([enumKey])),
  );
}

function _shiftEnumsToTop(
  allEnums,
  currentEnumKeys,
  table,
): PatternString | $ReadOnly<TableJSFBTTree> {
  if (allEnums.length === 0) {
    return table;
  }

  const index = currentEnumKeys.length;
  if (index === allEnums.length) {
    // The top enum levels are done, not build the sub-table for current enum
    // branch
    return _buildTableWithoutEnums(table, currentEnumKeys, 0);
  }
  const newTable = {};
  for (const enumKey of allEnums[index]) {
    newTable[enumKey] = _shiftEnumsToTop(
      allEnums,
      currentEnumKeys.concat([enumKey]),
      table,
    );
  }
  return newTable;
}

function _buildTableWithoutEnums(
  curLevel,
  enums,
  index,
): PatternString | TableJSFBTTree {
  if (typeof curLevel === 'string') {
    return curLevel;
  }
  if (index < enums.length && curLevel.hasOwnProperty(enums[index])) {
    return _buildTableWithoutEnums(curLevel[enums[index]], enums, index + 1);
  }
  const result = {};
  for (const key in curLevel) {
    result[key] = _buildTableWithoutEnums(curLevel[key], enums, index);
  }
  return result;
}

/**
 * Maps each element using a mapping function, then flattens the result into a
 * new array. It is identical to a map followed by flattening to a depth of 1.
 */
function _flatMap<V, O>(
  arr: $ReadOnlyArray<V>,
  f: V => O | Array<O>,
): Array<O> {
  return arr.map(f).reduce((arr1, arr2) => arr1.concat(arr2), []);
}

module.exports = {
  extractEnumsAndFlattenPhrases,
  shiftEnumsToTop,
};
