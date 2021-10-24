import ts from 'typescript';
import { SyntaxKind } from 'typescript';

export interface GenerateOptions {
	inputFileText: string;
	inputFileTargetClass: string;
	inputFileName?: string;
	outputFileName?: string;
}

interface MethodArgumentMetadata {
	name: string;
	type: string;
}

interface MethodDeclarationMetadata {
	name: string;
	declarationText: string;
	returnType: string;
	args: MethodArgumentMetadata[];
}

function assert(condition: boolean, errorMessage: string): void {
	if (!condition) throw new Error('[GuardGenerator] ' + errorMessage);
}

function isClassDeclarationWithIdentifier(node: ts.Node, targetClassName: string): boolean {

	if (!node || node.kind !== SyntaxKind.ClassDeclaration) return false;

	const classNode = node as ts.ClassDeclaration;
	const className = classNode.name as ts.Identifier;

	if (!className || className.kind !== SyntaxKind.Identifier) return false;

	return className.escapedText === targetClassName;
}

function findClassNodeByName(source: ts.SourceFile, targetClassName: string): ts.Node | undefined {

	let result: ts.Node | undefined = undefined;

	source.forEachChild(node => {

		if (result) return;
		if (!isClassDeclarationWithIdentifier(node, targetClassName)) return;

		result = node;
	});

	return result;
}

function generateClassInterfaceMethods(methods: MethodDeclarationMetadata[], indent: string): string {
	return methods.map(m =>
		`${indent}${m.declarationText};`
	).join('\n');
}

function getQueueMethodForReturnType(returnType: string): string | undefined {

	if (/^.*Observable<.+>[^\[|\]]*$/.test(returnType)) {
		return 'observe';
	}

	if (/^.*Promise<.+>[^\[|\]]*$/.test(returnType)) {
		return 'add';
	}

	return undefined;
}

function generateClassGuardMethod(method: MethodDeclarationMetadata, sourceRefName: string, indent: string): string {

	const queueMethod = getQueueMethodForReturnType(method.returnType);
	const methodArgs = method.args.map(a => a.name).join(', ');
	const sourceCall = `this.${sourceRefName}.${method.name}(${methodArgs})`;
	const returnStatement = queueMethod ? `this.queue.${queueMethod}(() => ${sourceCall})` : sourceCall;

	return `${indent}${method.declarationText} {
${indent}\treturn ${returnStatement};
${indent}}`;
}

function generateClassGuardMethodList(methods: MethodDeclarationMetadata[], sourceRefName: string, indent: string): string {
	return methods.map(m => generateClassGuardMethod(m, sourceRefName, indent)).join('\n');
}

function parseMethodArgumentDeclarationMetadata(sourceFile: ts.SourceFile, parameter: ts.ParameterDeclaration): MethodArgumentMetadata | null {
	if (!parameter || parameter.kind !== SyntaxKind.Parameter) return null;
	const name = (parameter.name as ts.Identifier)?.getText(sourceFile) ?? '';
	const type = parameter.type?.getFullText(sourceFile) ?? '';
	return { name, type };
}


function parseMethodDeclarationMetadata(sourceFile: ts.SourceFile, memberNode: ts.ClassElement): MethodDeclarationMetadata | null {

	if (!memberNode || memberNode.kind !== SyntaxKind.MethodDeclaration) return null;

	const methodNode = memberNode as ts.MethodDeclaration;
	const name: string = (methodNode.name as ts.Identifier)?.getText(sourceFile) ?? '';
	const args: MethodArgumentMetadata[] = methodNode.parameters.map(v => parseMethodArgumentDeclarationMetadata(sourceFile, v)!).filter(v => v);
	const returnType = methodNode.type?.getFullText(sourceFile) ?? 'any';
	const typedArgumentList = args.map(a => a.name + ': ' + a.type).join(', ');
	const declarationText = `${name}(${typedArgumentList}): ${returnType}`;

	return {
		name,
		args,
		returnType,
		declarationText
	};
}

function parseMethodDeclarationMetadataList(sourceFile: ts.SourceFile, sourceClass: ts.ClassDeclaration): MethodDeclarationMetadata[] {
	return sourceClass.members.map(n => parseMethodDeclarationMetadata(sourceFile, n)!).filter(v => v);
}

function generateOutputFromClassSource(sourceFile: ts.SourceFile, outFileName: string, sourceClass: ts.ClassDeclaration): ts.SourceFile {

	// 1. Import necessary dependencies for new constructs (namely Observable and CommandQueue)
	// 2. create an interface based on the given source class called [CLASS_NAME]Like
	// 3. create a class declaration named [CLASS_NAME]Guard that implements [CLASS_NAME]Like

	const className = sourceClass.name!.escapedText;
	const classLikeInterfaceName = className + 'Like';
	const classGuardName = className + 'Guard';
	const sourceRefName = 'source';
	const methodDeclarations = parseMethodDeclarationMetadataList(sourceFile, sourceClass);

	const sourceFileText = `import { Observable } from 'rxjs';
import { CommandQueue } from '@obsidize/command-queue';

export interface ${classLikeInterfaceName} {
${generateClassInterfaceMethods(methodDeclarations, '\t')}
}

export class ${classGuardName} implements ${classLikeInterfaceName} {
	
\tpublic readonly queue: CommandQueue = new CommandQueue();
	
\tconstructor(
\t\tpublic readonly ${sourceRefName}: ${classLikeInterfaceName}
\t) {
\t}

${generateClassGuardMethodList(methodDeclarations, sourceRefName, '\t')}
}
`;

	return ts.createSourceFile(
		outFileName,
		sourceFileText,
		ts.ScriptTarget.Latest
	);
}

/**
 * Performs the following mutations based on the given options:
 * 
 * 1. Finds a target class declaration in the given input source file text
 * 2. Extracts a basic interface of that class and its methods
 * 3. Generates a wrapper class that takes the interface from step 2 as a source, and implements it with a CommandQueue
 */
export function generateAst(options: GenerateOptions): ts.SourceFile {

	const {
		inputFileName,
		inputFileText,
		inputFileTargetClass,
		outputFileName
	} = Object.assign({ inputFileName: '', outputFileName: '' }, options);

	console.log('generate() with options', {
		inputFileName,
		inputFileSize: inputFileText.length,
		inputFileTargetClass,
		outputFileName
	});

	const inputRootNode = ts.createSourceFile(inputFileName, inputFileText, ts.ScriptTarget.Latest);
	const classNode: ts.Node | undefined = findClassNodeByName(inputRootNode, inputFileTargetClass);

	assert(!!classNode, `Definition for input "${inputFileName}" does not contain a cordova plugin class declaration`);

	return generateOutputFromClassSource(inputRootNode, outputFileName, classNode as ts.ClassDeclaration);
}

/**
 * Convenience to print the generated AST node from the given options.
 */
export function generate(options: GenerateOptions): string {
	const outputRootNode = generateAst(options);
	const printer = ts.createPrinter();
	return printer.printFile(outputRootNode);
}