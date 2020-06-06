const path = require('path');
const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');

const app = express();
const configWebpack = require(path.join(__dirname, './webpack.config.js'));
if (!configWebpack.mode) {
  configWebpack.mode = 'production';
}
const compiler = webpack(configWebpack);
const config = require(path.join(__dirname, './config'));

// Tell express to use the webpack-dev-middleware and use the webpack.config.js
// configuration file as a base.
app.use(webpackDevMiddleware(compiler, {
  publicPath: `${configWebpack.output.publicPath}`,
}));

// Serve the files on port 3000.
app.listen(config.MAIN.CLIENT_PORT, function() {
  console.log('Example app listening on port 3000!\n');
});
