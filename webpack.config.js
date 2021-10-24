const path = require('path');

module.exports = {
	entry: './src/index.ts',
	mode: 'development',
	target: 'node',
	externals: ['tslib', 'typescript'],
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: ['.tsx', '.ts', '.js'],
	},
	output: {
		filename: 'index.cjs.js',
		path: path.resolve(__dirname, 'dist'),
		library: {
			type: 'commonjs-module'
		}
	}
};