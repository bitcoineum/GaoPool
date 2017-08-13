var webpack = require('webpack');
var path = require('path');
let CircularDependencyPlugin = require('circular-dependency-plugin')

module.exports = [{
    entry: "./console-miner/gaopool.js",
    target: "node",
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'gaopool.js'
  },
    module: {
        loaders: [
               {test: /\.json$/, loader: "json-loader"},
            {
               test: /\.js$/,
               exclude: /(node_modules|bower_components)/,
               loader: 'babel-loader',
               	query: {
               		presets: ['babel-preset-latest'],
					comments: false
				},
			}
        ]
    },
	node: {
		console: true,
		fs: 'empty'
	},
  plugins: []

},
  {
    entry: "./console-miner/set_percentage.js",
    target: "node",
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'set_percentage.js'
  },
    module: {
        loaders: [
               {test: /\.json$/, loader: "json-loader"},
            {
               test: /\.js$/,
               exclude: /(node_modules|bower_components)/,
               loader: 'babel-loader',
               	query: {
               		presets: ['babel-preset-latest'],
					comments: false
				},
			}
        ]
    },
	node: {
		console: true,
		fs: 'empty'
	},
  plugins: []
}];
