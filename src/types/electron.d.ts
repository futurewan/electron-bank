/**
 * Electron API 类型声明
 * 定义 window.electronAPI 和 window.ipcRenderer 的类型
 */

interface IpcRenderer {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    send: (channel: string, ...args: unknown[]) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

interface ElectronAPI {
    versions: {
        node: () => string
        chrome: () => string
        electron: () => string
    }
    ipc: {
        send: (channel: string, data: unknown) => void
        on: (channel: string, callback: (...args: unknown[]) => void) => void
    }
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
        ipcRenderer?: IpcRenderer
    }
}

export { }
