/**
 * 用量监测占位页面
 *
 * 负责：
 * - 展示用量监测功能的占位界面
 * - 提示用户当前版本尚未实现完整功能
 *
 * @module pages/UsagePlaceholderPage
 */

/**
 * 用量监测占位页面组件
 * @returns {JSX.Element}
 */
export default function UsagePlaceholderPage() {
  return (
    <div className="usage-placeholder-page">
      {/* 页面标题区域 */}
      <div className="placeholder-header">
        <h1>用量监测</h1>
        <p className="subtitle">
          当前版本为模块占位，后续将接入 Token 指标与趋势图
        </p>
      </div>

      {/* 占位卡片区域 */}
      <div className="placeholder-cards">
        <div className="placeholder-card">
          <span>指标卡片占位</span>
        </div>
        <div className="placeholder-card">
          <span>图表占位</span>
        </div>
        <div className="placeholder-card">
          <span>表格占位</span>
        </div>
      </div>

      {/* 提示信息 */}
      <p className="hint-text">
        你可以先切回"技能管理"继续工作
      </p>

      <style>{`
        .usage-placeholder-page {
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .placeholder-header {
          margin-bottom: 32px;
        }

        .placeholder-header h1 {
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #1f2937;
        }

        .subtitle {
          font-size: 14px;
          color: #6b7280;
          margin: 0;
        }

        .placeholder-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .placeholder-card {
          border: 2px dashed #d1d5db;
          background-color: #f3f4f6;
          border-radius: 8px;
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          font-size: 14px;
        }

        .hint-text {
          font-size: 14px;
          color: #6b7280;
          text-align: center;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
