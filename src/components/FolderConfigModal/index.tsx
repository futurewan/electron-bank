import { FolderOpenOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Space, Typography, message } from 'antd';
import React, { useEffect, useState } from 'react';

const electron = (window as any).electron;

const { Text } = Typography;

interface FolderConfigModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  config: {
    workspaceFolder?: string;
  };
}

/**
 * 工作目录配置弹窗
 * 简化为单一工作目录选择，子目录（00归档、01发票、02银行流水）自动创建
 */
const FolderConfigModal: React.FC<FolderConfigModalProps> = ({
  open,
  onCancel,
  onSuccess,
  config,
}) => {
  const [loading, setLoading] = useState(false);
  const [workspaceFolder, setWorkspaceFolder] = useState(config.workspaceFolder);

  useEffect(() => {
    if (open) {
      setWorkspaceFolder(config.workspaceFolder);
    }
  }, [open, config]);

  const handleSelectFolder = async () => {
    try {
      const res = await electron.file.selectFolder('选择工作目录');

      if (res.success && !res.canceled && res.folderPath) {
        setWorkspaceFolder(res.folderPath);
      }
    } catch (error) {
      message.error('选择文件夹失败');
    }
  };

  const handleOk = async () => {
    if (!workspaceFolder) {
      message.warning('请先选择工作目录');
      return;
    }

    setLoading(true);
    try {
      // 1. 保存配置
      await electron.config.set('workspaceFolder', workspaceFolder);

      // 2. 初始化工作目录结构（自动创建子文件夹）
      const initResult = await electron.file.initWorkspace(workspaceFolder);
      if (initResult.success) {
        if (initResult.created.length > 0) {
          message.success(`工作目录已初始化，自动创建了 ${initResult.created.length} 个子文件夹`);
        } else {
          message.success('工作目录配置已保存');
        }
      } else {
        message.error('初始化工作目录失败: ' + (initResult.error || '未知错误'));
        return;
      }

      onSuccess();
    } catch (error) {
      message.error('保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="设置工作目录"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="保存并继续"
      cancelText="取消"
    >
      <p style={{ marginBottom: 16, color: '#666' }}>
        请选择一个工作目录，系统将在其中自动创建以下子文件夹：
      </p>

      <div style={{
        background: '#f5f5f5',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13,
        color: '#555',
      }}>
        <div>📁 <Text strong>00归档</Text> — 对账完成后的备份目录</div>
        <div>📁 <Text strong>01发票</Text> — 放置发票文件</div>
        <div>📁 <Text strong>02银行流水</Text> — 放置银行流水文件</div>
      </div>

      <Form layout="vertical">
        <Form.Item label="工作目录" required>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={workspaceFolder}
              placeholder="请选择工作目录..."
              readOnly
            />
            <Button
              icon={<FolderOpenOutlined />}
              onClick={handleSelectFolder}
            >
              选择
            </Button>
          </Space.Compact>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default FolderConfigModal;
