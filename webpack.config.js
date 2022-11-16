const webpack = require('webpack');
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { ESBuildPlugin, ESBuildMinifyPlugin } = require('esbuild-loader');
const os = require('os')
const base = __dirname;

// function getBuild() {
//   var date = new Date();
//   return `${date.getMonth() + 1}${date.getDate()}${date.getHours()}${date.getMinutes()}${date.getSeconds()}`;
// }

const plugins = [
  new webpack.DefinePlugin({
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
  }),
  // new webpack.ProvidePlugin({
  //   process: 'process/browser',
  // }),
  new ESBuildPlugin()
];

module.exports = {
  entry: {
    'pixi-player-core': ['./src/index.js'],
    'pixi-player-ui': ['./src/player.js'],
  },
  output: {
    filename: process.env.NODE_ENV === 'production' ? '[name].min.js' : '[name].js',
    path: path.resolve(base, 'dist'),
    globalObject: 'this',
    library: 'pixi-player',
    libraryTarget: 'umd',
    libraryExport: 'default'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /(node_modules|bower_components)/,
        loader: "esbuild-loader",
        options: {
          loader: 'jsx',
          target: 'es2015'
        }
      },
      {
        test: /\.(frag|vert|glsl)$/,
        use: 'raw-loader'
      },
      // {
      //   test: /\.wasm$/,
      //   type: "asset/inline"
      // }
    ],
  },
  resolve: {
    // 自动补全的扩展名
    extensions: ['.js', '.jsx', '.vue', '.json', '.ts'],
    fallback: {
      "fs": false,
      "crypto": false,
      "events": false,
      "process": false,
      "path": require.resolve("path-browserify"),
      "util": false,
    }
  },
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    minimizer: [
      new ESBuildMinifyPlugin({target: 'es2015'})
    ]
  },
  plugins,
  watchOptions: {
    ignored: /dist/
  },
  externals: [],
};
