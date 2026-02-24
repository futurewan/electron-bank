
import { app } from 'electron';
import { exec, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface PythonEnvStatus {
    available: boolean;
    version?: string;
    missing?: string[];
    errors?: Record<string, string>;
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

    private resolveBundledPythonPath(scriptDir: string): string | null {
        const candidates = [
            path.join(scriptDir, '.venv/bin/python'),
            path.join(scriptDir, '.venv/Scripts/python.exe'),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
        return null;
    }

    private resolvePythonPath(): string | null {
        const scriptDir = this.getScriptPath();

        if (app.isPackaged) {
            const bundledPython = this.resolveBundledPythonPath(scriptDir);
            if (!bundledPython) {
                return null;
            }
            this.pythonPath = bundledPython;
            return this.pythonPath;
        }

        const venvPython = path.join(scriptDir, '.venv/bin/python');
        const venvPythonWin = path.join(scriptDir, '.venv/Scripts/python.exe');

        if (fs.existsSync(venvPython)) {
            this.pythonPath = venvPython;
        } else if (fs.existsSync(venvPythonWin)) {
            this.pythonPath = venvPythonWin;
        } else {
            this.pythonPath = 'python3';
        }

        return this.pythonPath;
    }

    getPythonExecutable(): string | null {
        return this.resolvePythonPath();
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

        const resolvedPython = this.resolvePythonPath();
        if (!resolvedPython) {
            return {
                available: false,
                error: '打包环境缺少内置 Python 运行时（resources/python/.venv）。请重新打包并包含 .venv 依赖。',
            };
        }

        try {
            // Fix: remove 'this' context issue inside runScript call
            // Pass undefined as last argument compliant with optional ProgressCallback
            const output = await this.runScript('check_env.py', [], undefined);
            const status = JSON.parse(output);

            // 当遇到缺失依赖时：
            // - 打包环境：直接报错（不依赖系统环境，不做运行时安装）
            // - 开发环境：尝试自动安装到当前 Python 环境
            if (!status.available && status.missing && status.missing.length > 0) {
                if (app.isPackaged) {
                    const details = status.errors
                        ? Object.entries(status.errors)
                            .map(([pkg, err]) => `${pkg}: ${String(err)}`)
                            .join(' | ')
                        : '';
                    return {
                        available: false,
                        error: details
                            ? `内置 Python 环境缺少/不可用依赖: ${status.missing.join(', ')}。详细: ${details}。请在构建机按目标架构重建 .venv 并重新打包。`
                            : `内置 Python 环境缺少依赖: ${status.missing.join(', ')}。请在构建机预装依赖并重新打包。`,
                    };
                }

                console.log(`[PythonService] Missing packages: ${status.missing.join(', ')}. Attempting to install...`);
                try {
                    await new Promise<void>((resolve, reject) => {
                        const reqPath = path.join(scriptDir, 'requirements.txt');
                        const cmd = `"${this.pythonPath}" -m pip install -r "${reqPath}"`;
                        console.log(`[PythonService] Executing: ${cmd}`);
                        exec(cmd, (error: any, stdout: string, stderr: string) => {
                            if (error) {
                                console.warn('[PythonService] pip install stderr:', stderr);
                                reject(error);
                            } else {
                                console.log('[PythonService] pip install success:', stdout);
                                resolve();
                            }
                        });
                    });

                    // 安装完成后，再次运行环境检测
                    const newOutput = await this.runScript('check_env.py', [], undefined);
                    return JSON.parse(newOutput);

                } catch (installErr: any) {
                    return { available: false, error: `缺少依赖且尝试自动安装失败: ${status.missing.join(', ')}` };
                }
            }

            return status;
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
            const resolvedPython = this.resolvePythonPath();
            if (!resolvedPython) {
                reject(new Error('Bundled Python runtime not found in packaged app'));
                return;
            }

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
