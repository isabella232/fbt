/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @noflow
 */

'use strict';

const del = require('del');
const gulp = require('gulp');
const babel = require('gulp-babel');
const gulpOnce = require('gulp-once');
const rename = require('gulp-rename');
const stripDocblockPragmas = require('gulp-strip-docblock-pragmas');
const path = require('path');

const paths = {
  src: {
    js: ['src/**/*.js', '!dist/**', '!gulpfile.js', '!node_modules/**'],
    json: ['src/**/*.json', '!dist/**', '!node_modules/**'],
  },
  dist: 'dist',
};

const checksumFile = '.checksums';
const once = () => gulpOnce({file: path.join(__dirname, checksumFile)});

const src = (glob, opts) =>
  gulp.src(glob, {
    cwd: __dirname,
    ...opts,
  });

const dest = (glob, opts) =>
  gulp.dest(glob, {
    cwd: __dirname,
    ...opts,
  });

// Strip the 'generated' pragma.
// Files are transpiled and contents no longer match signature
const stripGenerated = () => stripDocblockPragmas({pragmas: ['generated']});

gulp.task(
  'build',
  gulp.parallel(
    function babelPluginFbt_buildDistJS() {
      return src(paths.src.js, {
        follow: true,
      })
        .pipe(once())
        .pipe(stripGenerated())
        .pipe(
          babel({
            plugins: [
              '@babel/plugin-proposal-optional-catch-binding',
              '@babel/plugin-syntax-class-properties',
              '@babel/plugin-syntax-flow',
              'babel-preset-fbjs/plugins/dev-expression',
              '@babel/plugin-proposal-nullish-coalescing-operator',
              '@babel/plugin-proposal-optional-chaining',
              '@babel/plugin-transform-flow-strip-types',
            ],
          }),
        )
        .pipe(dest(paths.dist));
    },
    function babelPluginFbt_buildDistFlowJS() {
      return src(paths.src.js, {
        follow: true,
      })
        .pipe(rename({extname: '.js.flow'}))
        .pipe(once())
        .pipe(stripGenerated())
        .pipe(dest(paths.dist));
    },
    function babelPluginFbt_copyJsonToDist() {
      return src(paths.src.json, {follow: true})
        .pipe(once())
        .pipe(dest(paths.dist));
    },
  ),
);

gulp.task('watch', () => {
  gulp.watch(
    paths.src.js.concat(paths.src.json),
    {
      cwd: __dirname,
      ignoreInitial: false,
    },
    function watchBabelPluginFbt(done) {
      gulp.task('build')(done);
    },
  );
});

gulp.task(
  'clean',
  gulp.series(() =>
    del(
      [
        path.join(__dirname, checksumFile),
        path.join(__dirname, paths.dist, '*'),
      ],
      {force: true},
    ),
  ),
);

gulp.task('default', gulp.series('build'));

module.exports = {
  build: gulp.task('build'),
  clean: gulp.task('clean'),
  watch: gulp.task('watch'),
};
