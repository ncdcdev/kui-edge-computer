var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var plumber = require('gulp-plumber');
var watch = require('gulp-watch');
var concat = require('gulp-concat');
var del = require('del');
var connect = require('gulp-connect');
var webpack = require('webpack-stream');
var notify = require('gulp-notify');
var webpackConfig = require('./webpack.config.js');
var rename = require('gulp-rename');

var outputDir = 'www';

// javascript
gulp.task('clean-js', function(){
  return del([
    outputDir + '/js/**/*'
  ]);
});

gulp.task('compile', ['clean-js'], function(){
  return gulp.src([
      './src/js/index.js',
    ])
    .pipe(plumber({errorHandler: notify.onError('<%= error.message %>')}))
    .pipe(webpack(webpackConfig), null, function(err, stats){
      if(stats.compilation.errors.length > 0){
        notify({
          title: 'webpack error',
          message: stats.compilation.errors[0].eeror
        });
      }
    })
    .pipe(gulp.dest(outputDir + '/js/'))
    .pipe(connect.reload());
});

gulp.task('build', ['compile']);

// all
gulp.task('watch',['server', 'build'], function(){
  // javascript
  watch([
    './src/**/*.js',
    './src/**/*.json',
    '../common/**/*.js',
    '../common/**/*.json',
  ], function(){
    gulp.start('compile');
  });

});

gulp.task('default', function(){
  var spawn = function(){
    var proc = require('child_process').spawn('gulp', ['watch'], {stdio: 'inherit'});
    proc.on('close', function(c){
      spawn();
    });
  };
  spawn();
});
