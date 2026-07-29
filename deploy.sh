#!/bin/bash
# ============================================================
# 观澜 - 一键部署脚本
# 用法:
#   本地构建并推送:  bash deploy.sh
#   远程服务器部署:  ssh user@host 'bash -s' < deploy.sh
# ============================================================
set -e

# ---------- 配置 ----------
APP_NAME="guanlan"
APP_DIR="/home/www/${APP_NAME}"
GIT_REPO="git@github.com:shipitswq/guanlan_04.git"
BRANCH="main"
PORT="${PORT:-3005}"
NODE_VERSION="22"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ---------- 检测运行环境 ----------
if [ -d ".git" ]; then
  # ====== 本地模式：构建并推送 ======
  info "本地构建模式"

  # 检查依赖
  command -v node >/dev/null 2>&1 || error "请安装 Node.js"
  command -v npm  >/dev/null 2>&1 || error "请安装 npm"
  command -v git  >/dev/null 2>&1 || error "请安装 git"

  # 安装依赖
  info "安装前端依赖..."
  npm install

  # 构建前端
  info "构建前端..."
  npm run build

  # 安装后端依赖（server 目录下如有 package.json 则安装）
  if [ -f "server/package.json" ]; then
    info "安装后端依赖..."
    cd server && npm install && cd ..
  fi

  # 提交并推送
  info "推送代码到 GitHub..."
  git add -A
  git commit --allow-empty -m "deploy: $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || true
  git push origin ${BRANCH}

  info "本地构建完成！"
  echo ""
  echo "  下一步，在服务器上执行："
  echo "    ssh user@your-server"
  echo "    curl -sL https://raw.githubusercontent.com/shipitswq/guanlan_04/${BRANCH}/deploy.sh | bash"
  echo ""
  exit 0
fi

# ====== 服务器模式：拉取并启动 ======
info "服务器部署模式"

# ---------- 系统检查 ----------
if ! command -v node &>/dev/null; then
  warn "未安装 Node.js，正在安装..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - || {
    # 备选：使用 nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] || curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
    nvm install ${NODE_VERSION}
    nvm use ${NODE_VERSION}
  }
  info "Node.js $(node -v) 安装完成"
fi

if ! command -v pm2 &>/dev/null; then
  warn "未安装 PM2，正在安装..."
  npm install -g pm2
fi

# ---------- 拉取代码 ----------
if [ -d "${APP_DIR}" ]; then
  info "更新代码..."
  cd "${APP_DIR}"
  git fetch origin
  git reset --hard origin/${BRANCH}
else
  info "首次部署，克隆仓库..."
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone -b ${BRANCH} ${GIT_REPO} "${APP_DIR}"
  cd "${APP_DIR}"
fi

# ---------- 安装依赖 ----------
info "安装依赖..."
npm install --production 2>/dev/null || npm install
if [ -f "server/package.json" ]; then
  cd server && npm install 2>/dev/null || true && cd ..
fi

# ---------- 构建前端 ----------
info "构建前端..."
npm run build

# ---------- 创建数据目录 ----------
mkdir -p server/data

# ---------- 启动 / 重启 ----------
info "启动服务..."
pm2 delete "${APP_NAME}" 2>/dev/null || true
PORT="${PORT}" pm2 start server/index.cjs --name "${APP_NAME}" -- -p ${PORT}
pm2 save

# ---------- 状态检查 ----------
sleep 3
if pm2 show "${APP_NAME}" &>/dev/null; then
  APP_PORT=$(pm2 show "${APP_NAME}" | grep -oP 'http://localhost:\K\d+' || echo ${PORT})
  info "部署成功！"
  echo ""
  echo "  ${APP_NAME} 服务运行中:"
  echo "  http://localhost:${APP_PORT}"
  echo ""
  echo "  PM2 命令:"
  echo "    pm2 logs ${APP_NAME}    # 查看日志"
  echo "    pm2 restart ${APP_NAME} # 重启"
  echo "    pm2 stop ${APP_NAME}    # 停止"
  echo ""
else
  error "服务启动失败，请检查日志: pm2 logs ${APP_NAME}"
fi
