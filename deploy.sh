#!/bin/bash
# ============================================================
# 观澜 - 一键部署脚本
#
# 用法:
#   远程服务器首次部署:
#     wget -O deploy.sh https://raw.githubusercontent.com/shipitswq/guanlan_04/main/deploy.sh
#     bash deploy.sh
#
#   本地构建（开发机，已有 Node.js）:
#     bash deploy.sh --build
# ============================================================
set -e

# ---------- 配置 ----------
APP_NAME="guanlan"
APP_DIR="/workspace/${APP_NAME}"
GIT_REPO="https://github.com/shipitswq/guanlan_04.git"
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

# ====== 本地构建模式（开发机使用） ======
if [ "$1" = "--build" ]; then
  echo -e "${YELLOW}═══════════════════════════════════════${NC}"
  echo -e "${YELLOW}  本地构建模式                         ${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════${NC}"

  command -v node >/dev/null 2>&1 || error "请安装 Node.js"
  command -v npm  >/dev/null 2>&1 || error "请安装 npm"
  command -v git  >/dev/null 2>&1 || error "请安装 git"

  info "安装依赖..."
  npm install

  info "构建前端..."
  npx vite build

  if [ -f "server/package.json" ]; then
    info "安装后端依赖..."
    cd server && npm install && cd ..
  fi

  info "推送代码到 GitHub..."
  git add -A
  git commit --allow-empty -m "deploy: $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || true
  git push origin ${BRANCH}

  info "本地构建完成！已推送到 GitHub"
  exit 0
fi

# ====== 服务器部署模式 ======
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  观澜 - 服务器一键部署                  ${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo "  应用: ${APP_NAME}"
echo "  目录: ${APP_DIR}"
echo "  端口: ${PORT}"
echo ""

# ---------- 1. 安装 Node.js（如未安装） ----------
install_nodejs() {
  # 检查 node
  if command -v node &>/dev/null; then
    info "Node.js $(node -v) 已安装"
    return
  fi

  warn "Node.js 未安装，开始安装..."

  # 判断系统包管理器
  if command -v apt &>/dev/null; then
    # Debian/Ubuntu
    info "使用 apt 安装 Node.js ${NODE_VERSION}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    # CentOS/RHEL
    info "使用 yum 安装 Node.js ${NODE_VERSION}..."
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    yum install -y nodejs
  else
    # 备选：使用 nvm
    warn "未检测到 apt/yum，使用 nvm 安装..."
    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
    nvm install ${NODE_VERSION}
    nvm use ${NODE_VERSION}
    nvm alias default ${NODE_VERSION}
  fi

  if command -v node &>/dev/null; then
    info "Node.js $(node -v) 安装完成"
  else
    error "Node.js 安装失败，请手动安装: https://nodejs.org/"
  fi
}

install_nodejs

# ---------- 2. 安装 PM2 ----------
if ! command -v pm2 &>/dev/null; then
  warn "PM2 未安装，正在安装..."
  npm install -g pm2
  info "PM2 安装完成"
fi

# ---------- 3. 拉取/更新代码 ----------
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

# ---------- 4. 安装依赖 ----------
info "安装项目依赖..."
npm install 2>/dev/null || npm install --production

if [ -f "server/package.json" ]; then
  cd server && npm install 2>/dev/null || true && cd ..
fi

# ---------- 5. 构建前端 ----------
info "构建前端..."
npx vite build

# ---------- 6. 准备数据目录 ----------
mkdir -p server/data

# ---------- 7. 启动服务 ----------
info "启动服务..."
pm2 delete "${APP_NAME}" 2>/dev/null || true
PORT="${PORT}" pm2 start server/index.cjs --name "${APP_NAME}"
pm2 save
pm2 startup 2>/dev/null || true

# ---------- 8. 验证 ----------
sleep 3
if pm2 show "${APP_NAME}" &>/dev/null; then
  info "部署成功！"
  echo ""
  echo "  ${APP_NAME} 已启动 → http://localhost:${PORT}"
  echo ""
  echo "  管理命令:"
  echo "    pm2 logs ${APP_NAME}    查看日志"
  echo "    pm2 restart ${APP_NAME}  重启"
  echo "    pm2 stop ${APP_NAME}     停止"
  echo ""
  echo "  下次更新:"
  echo "    cd ${APP_DIR} && git pull && npx vite build && pm2 restart ${APP_NAME}"
  echo ""
else
  error "服务启动失败，请检查日志: pm2 logs ${APP_NAME}"
fi
