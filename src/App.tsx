import { HashRouter } from 'react-router-dom'
import Layout from './components/Layout'
import './index.scss'
import AppRouter from './router'

/**
 * 应用根组件
 * 集成路由和布局
 */
function App(): JSX.Element {
  return (
    <HashRouter>
      <Layout>
        <AppRouter />
      </Layout>
    </HashRouter>
  )
}

export default App
