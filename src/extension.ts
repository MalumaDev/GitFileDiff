// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';


export function getFileFromBranch(
	repoPath: string,
	branch: string,
	relativePath: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(
			`git show ${branch}:"${relativePath}"`,
			{ cwd: repoPath, maxBuffer: 10 * 1024 * 1024 },
			(err, stdout, stderr) => {
				if (err) {
					reject(stderr || err.message);
				} else {
					resolve(stdout);
				}
			}
		);
	});
}

const scheme = 'git-file-branch';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	var repoPath: string = '';

	const handler = () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user

		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			vscode.window.showErrorMessage('No active file.');
			return;
		}

		const fileUri = editor.document.uri;
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);

		if (!workspaceFolder) {
			vscode.window.showErrorMessage('File is not inside a workspace.');
			return;
		}

		repoPath = workspaceFolder.uri.fsPath;
		const relativeFilePath = path.relative(repoPath, fileUri.fsPath);

		// 1. Check if git repo exists
		exec('git rev-parse --is-inside-work-tree', { cwd: repoPath }, (err) => {
			if (err) {
				vscode.window.showErrorMessage('Git is not active in this project.');
				return;
			}

			// 2. Get current branch
			exec('git branch --show-current', { cwd: repoPath }, (err, stdout) => {
				if (err) {
					vscode.window.showErrorMessage('Failed to get current branch.');
					return;
				}

				const currentBranch = stdout.trim();

				// 3. Get all branches
				exec(
					'git branch --format="%(refname:short)"',
					{ cwd: repoPath },
					async (err, stdout) => {
						if (err) {
							vscode.window.showErrorMessage('Failed to list branches.');
							return;
						}

						const branches = stdout
							.split('\n')
							.map(b => b.trim())
							.filter(b => b && b !== currentBranch);

						if (branches.length === 0) {
							vscode.window.showInformationMessage('No other branches found.');
							return;
						}

						// 4. Show picker
						const selectedBranch = await vscode.window.showQuickPick(branches, {
							placeHolder: `Select branch to compare with ${currentBranch}`,
						});

						if (!selectedBranch) {
							return;
						}

						// 5. Get file from branch
						const leftUri = vscode.Uri.parse(
							`${scheme}:/${selectedBranch}/${relativeFilePath}`
						);

						await vscode.commands.executeCommand(
							'vscode.diff',
							leftUri,
							fileUri,
							`${relativeFilePath} (${currentBranch} ↔ ${selectedBranch})`
						);
					}
				);
			});
		});
	};

	const disposables = [
		vscode.commands.registerCommand('gitfilediff.compareFile', handler),
		vscode.commands.registerCommand('gitfilediff.compareFileMenu', handler),
	];

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(
			scheme,
			{
				async provideTextDocumentContent(uri: vscode.Uri) {
					const [, branch, ...fileParts] = uri.path.split('/');
					const filePath = fileParts.join('/');

					return getFileFromBranch(repoPath, branch, filePath)!;
				}
			}
		)
	);

	context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() {

}
