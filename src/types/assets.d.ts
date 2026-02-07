/**
 * CSS Modules 类型声明
 * 允许 TypeScript 识别 .module.css 文件
 */
declare module '*.module.css' {
    const classes: { [key: string]: string }
    export default classes
}

declare module '*.module.scss' {
    const classes: { [key: string]: string }
    export default classes
}

declare module '*.css' {
    const css: string
    export default css
}

declare module '*.svg' {
    const content: string
    export default content
}

declare module '*.png' {
    const content: string
    export default content
}

declare module '*.jpg' {
    const content: string
    export default content
}
