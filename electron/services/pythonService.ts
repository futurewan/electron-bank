
import { spawn } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';

export interface PythonEnvStatus {
    available: boolean;
    version?: string;
    missing?: string[];
    error?: string;
}

export type ProgressCallback = (data: any) => void;

export class PythonService {
    private pythonPath: string = 'python3'; // Default, could be configurable
    private scriptPath: string | null = null;

    constructor() {
        // Delay path resolution to avoid accessing 'app' before ready if possible, 
        // or just resolve defaults.
    }

    private getScriptPath(): string {
        if (this.scriptPath) return this.scriptPath;

        if (app.isPackaged) {
            this.scriptPath = path.join(process.resourcesPath, 'python');
        } else {
            // In dev, we are usually in project root or dist-electron.
            // Best to rely on process.cwd() in dev to find source files.
            this.scriptPath = path.join(process.cwd(), 'electron/python');
        }
        return this.scriptPath;
    }

    /**
     * Check Python environment and dependencies
     */
    async checkEnvironment(): Promise<PythonEnvStatus> {
        const scriptDir = this.getScriptPath();
        const checkScript = path.join(scriptDir, 'check_env.py');

        // Check if script exists
        if (!fs.existsSync(checkScript)) {
            return { available: false, error: `Script not found at ${checkScript}` };
        }

        // Check for venv
        const venvPython = path.join(scriptDir, '.venv/bin/python');
        const venvPythonWin = path.join(scriptDir, '.venv/Scripts/python.exe');

        if (fs.existsSync(venvPython)) {
            this.pythonPath = venvPython;
        } else if (fs.existsSync(venvPythonWin)) {
            this.pythonPath = venvPythonWin;
        }

        try {
            // Fix: remove 'this' context issue inside runScript call
            // Pass undefined as last argument compliant with optional ProgressCallback
            const output = await this.runScript('check_env.py', [], undefined);
            return JSON.parse(output);
        } catch (error: any) {
            return { available: false, error: error.message };
        }
    }


    /**
     * Run a Python script
     * @param scriptName Name of the script file in electron/python
     * @param args Command line arguments
     * @param onProgress Callback for streaming progress events
     * @returns Captured STDOUT as string (if not streaming)
     */
    async runScript(
        scriptName: string,
        args: string[] = [],
        onProgress?: ProgressCallback
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const scriptFile = path.join(this.getScriptPath(), scriptName);

            console.log(`[PythonService] Running: ${this.pythonPath} ${scriptFile} ${args.join(' ')}`);

            const process = spawn(this.pythonPath, [scriptFile, ...args]);

            let stdoutBuffer = '';
            let lineBuffer = ''; // Buffer for incomplete lines across chunks
            let stderrBuffer = '';

            process.stdout.on('data', (data) => {
                const chunk = data.toString();

                // Add new chunk to line buffer
                lineBuffer += chunk;

                // Process only complete lines (ending with newline)
                let newlineIndex;
                while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
                    const line = lineBuffer.slice(0, newlineIndex).trim();
                    lineBuffer = lineBuffer.slice(newlineIndex + 1);

                    if (!line) continue;

                    if (onProgress) {
                        try {
                            const event = JSON.parse(line);
                            if (event.type === 'progress') {
                                // Known streaming event, pass to callback
                                onProgress(event);
                            } else {
                                // Not a progress event (e.g. final result), 
                                // pass to callback AND also keep in main stdout buffer
                                onProgress(event);
                                stdoutBuffer += line + '\n';
                            }
                        } catch (e) {
                            // Not a JSON event, just append to buffer
                            // Only append if it looks like useful output, skip empty lines
                            if (line.length > 0) {
                                stdoutBuffer += line + '\n';
                            }
                        }
                    } else {
                        stdoutBuffer += line + '\n';
                    }
                }
            });

            process.stderr.on('data', (data) => {
                stderrBuffer += data.toString();
            });

            process.on('close', (code) => {
                // Flush remaining buffer
                if (lineBuffer.trim()) {
                    const line = lineBuffer.trim();
                    if (onProgress) {
                        try {
                            const event = JSON.parse(line);
                            if (event.type === 'progress') {
                                onProgress(event);
                            } else {
                                onProgress(event);
                                stdoutBuffer += line + '\n';
                            }
                        } catch (e) {
                            stdoutBuffer += line + '\n';
                        }
                    } else {
                        stdoutBuffer += line + '\n';
                    }
                }

                if (stderrBuffer) {
                    console.warn(`[PythonService] stderr for ${scriptName}:`, stderrBuffer.slice(0, 500));
                }
                if (code !== 0) {
                    reject(new Error(`Python script exited with code ${code}. Error: ${stderrBuffer}`));
                } else {
                    console.log(`[PythonService] ${scriptName} completed. stdout buffer length: ${stdoutBuffer.length}`);
                    resolve(stdoutBuffer.trim());
                }
            });

            process.on('error', (err) => {
                console.error(`[PythonService] Failed to spawn Python process:`, err);
                reject(err);
            });
        });
    }
    async extractText(filePath: string): Promise<string> {
        return this.runScript('main.py', ['extract_text', '--file', filePath])
            .then((output: string) => {
                const res: any = JSON.parse(output);
                if (res.success) {
                    return res.text;
                } else {
                    throw new Error(res.message);
                }
            });
    }

    async runMain(command: string, args: string[]): Promise<any> {
        return this.runScript('main.py', [command, ...args])
            .then((output: string) => JSON.parse(output));
    }
}

export const pythonService = new PythonService();
