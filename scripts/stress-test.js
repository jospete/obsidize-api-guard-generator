#! /usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generate } = require('../dist/index.cjs');

const cloneUrl = 'https://github.com/danielsogl/awesome-cordova-plugins.git';
const clonePath = 'tmp/awesome-cordova-plugins';
const rootPluginsDirectoryPath = path.resolve(path.join(clonePath, 'src/@awesome-cordova-plugins/plugins'));
const failures = [];
let runCount = 0;

function exec(cmd) {
	console.log('> ' + cmd);
	execSync(cmd, { stdio: 'inherit' });
}

function cleanCloneDirectory() {
	if (fs.existsSync(clonePath)) {
		fs.rmSync(clonePath, { recursive: true });
	}
}

function getDirectoryNamesIn(rootDirectory) {
	return fs.readdirSync(rootDirectory, { withFileTypes: true })
		.filter(dirent => dirent.isDirectory())
		.map(dirent => dirent.name);
}

function generatePluginGuard(dirName) {

	console.log('generatePluginGuard() -> ' + dirName);

	runCount++;

	const dirPath = path.resolve(path.join(rootPluginsDirectoryPath, dirName));
	const inputFilePath = path.join(dirPath, 'index.ts');
	const outputFilePath = path.join(dirPath, 'guard.ts');
	const inputFileText = fs.readFileSync(inputFilePath, 'utf8');
	const targetClassRegex = new RegExp('export class (' + dirName.replace(/-/g, '') + ') extends', 'gmi');

	try {

		const inputFileTargetClass = targetClassRegex.exec(inputFileText)[1];

		const outputFileText = generate({
			inputFileText,
			inputFileTargetClass
		});

		fs.writeFileSync(outputFilePath, outputFileText, 'utf8');

	} catch (e) {
		console.warn('guard generate failed for ' + dirName + ' -> ' + e);
		failures.push({
			path: inputFilePath,
			plugin: dirName,
			error: (e + '')
		});
	}
}

function performStressTest() {

	cleanCloneDirectory();
	exec('git clone ' + cloneUrl + ' ' + clonePath);

	const pluginDirectories = getDirectoryNamesIn(rootPluginsDirectoryPath);
	pluginDirectories.forEach(dirName => generatePluginGuard(dirName));
}

performStressTest();

if (failures.length > 0) {
	console.warn('caught ' + failures.length + ' errors (out of ' + runCount + ' runs):');
	console.warn(failures);
}