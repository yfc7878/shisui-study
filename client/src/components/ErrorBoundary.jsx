import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('页面渲染失败', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" style={{ margin: '40px auto', maxWidth: 620 }}>
        <div className="empty-icon error"><AlertTriangle size={26} /></div>
        <h3>这个页面遇到了一点问题</h3>
        <p>{this.state.error.message || '未知渲染错误'}。你的数据保存在服务器上，刷新页面通常可以恢复。</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          <RotateCcw size={16} />
          <span>刷新页面</span>
        </button>
      </div>
    );
  }
}
