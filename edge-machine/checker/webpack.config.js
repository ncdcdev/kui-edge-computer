const webpack = require('webpack');
const env = process.env.NODE_ENV || 'develop';
const version = '0.0.1';
const path = require('path');

let config = {};

const commonDir = __dirname + '/../common';

let webpackConfig = {
  environment: env,
  entry: {
    bundle: __dirname + '/src/js/index.js',
  },
  output: {
    filename: '[name].js',
  },
  resolve: {
    root: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../'),
      path.resolve(__dirname, '../common/data/env-' + env),
      path.resolve(__dirname, 'src'),
      path.resolve(__dirname, 'src/js'),
    ],
    extensions: ['', '.jsx', '.js']
  },
  resolveLoader: {
    root: [
      path.resolve(__dirname, 'node_modules'),
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(env),
      VERSION: JSON.stringify(version),
      MasterAccount: JSON.stringify(require(commonDir + '/config/' + env + '-user.json')),
      AppPotConfig: JSON.stringify(require(commonDir + '/config/' + env + '.json'))
    }),
    new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /ja|en/),
  ],
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          presets: [
            require.resolve('babel-preset-es2015'),
            require.resolve('babel-preset-stage-0'),
          ]
        }
      },
      {
        test: /\.json$/,
        exclude: /node_modules/,
        loader: 'json-loader',
      }
    ]
  },
  node: {
    fs: 'empty'
  }
}

if(env == 'production'){
  webpackConfig['plugins'].push(
    new webpack.optimize.UglifyJsPlugin({
      compress: {
        warnings: false
      },
      exclude: /apppot.js/
    })
  );
  webpackConfig['devtool'] = "#source-map";
}else{
  webpackConfig['devtool'] = "#source-map";
}
module.exports = webpackConfig;
