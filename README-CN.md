# Claude-to-IM Windows 管理脚本

## 🚀 快速开始

### 1. 启动守护进程
双击运行 `start.bat`

### 2. 停止守护进程
双击运行 `stop.bat`

### 3. 检查健康状态
双击运行 `check-health.bat`

## 🔄 开机自动启动

### 安装自动启动
1. 右键点击 `install-autostart.bat`
2. 选择"以管理员身份运行"
3. 安装完成后，每次开机自动启动守护进程

### 卸载自动启动
1. 右键点击 `uninstall-autostart.bat`
2. 选择"以管理员身份运行"

## 📊 脚本说明

| 脚本 | 功能 |
|------|------|
| `start.bat` | 启动守护进程 |
| `stop.bat` | 停止守护进程 |
| `check-health.bat` | 健康状态检查 |
| `autostart-daemon.bat` | 自动启动脚本（系统调用） |
| `install-autostart.bat` | 安装开机自动启动 |
| `uninstall-autostart.bat` | 卸载开机自动启动 |

## ⚙️ 配置文件

| 文件 | 说明 |
|------|------|
| `config.env` | 主配置文件（飞书、微信凭据） |
| `data/weixin-accounts.json` | 微信账户配置 |
| `runtime/status.json` | 运行时状态 |
| `daemon.log` | 守护进程日志 |

## 🔧 故障排除

### 消息不回复
1. 检查守护进程是否运行：运行 `check-health.bat`
2. 重启守护进程：运行 `stop.bat` 然后 `start.bat`
3. 检查日志文件：`daemon.log`

### 守护进程崩溃
守护进程会自动记录错误到 `daemon.log`。查看日志找出问题。

### 首次使用
1. 首次对话需要先发送一条消息建立会话
2. 等待 10-30 秒获取回复
3. 如无回复，再次发送消息

## 📞 支持

- 飞书：给机器人发消息
- 微信：给机器人发消息
- 通道都已启用，自动响应
