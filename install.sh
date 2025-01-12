#!/usr/bin/env bash

###############################################################################
# SMART CHATBOT INSTALL + 2 SYSTEMD SERVICES
#
# 1) Installs Node, Git, Nginx, etc.
# 2) Clones (or updates) "smart-chatbot" repo in current directory.
# 3) Asks for domain/IP for Nginx (blank => server_name _;).
# 4) Detects primary LAN IP (fallback => 192.168.1.100) + public IP.
# 5) Asks for backend base URL => NEXT_PUBLIC_BACKEND_URL for the frontend.
# 6) Builds the frontend, installs the backend.
# 7) Overwrites Nginx config:
#    - ^/(api|admin|file-upload-manager) => Node(3001)
#    - everything else => Next.js(3000)
# 8) (Optional) Certbot if domain is set.
# 9) Creates 2 systemd services:
#    - smartchatbot-backend (runs Node on 3001)
#    - smartchatbot-frontend (runs Next.js on 3000)
#   Both use the current \$USER, no prompt for user.
###############################################################################

# --- 0) Detect local + public IPs ---
PRIMARY_NET_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {print $7; exit}')
if [ -z "$PRIMARY_NET_IP" ]; then
  PRIMARY_NET_IP="192.168.1.100"
  echo "Could not auto-detect a primary network IP; using fallback: $PRIMARY_NET_IP"
else
  echo "Detected primary network IP: $PRIMARY_NET_IP"
fi

PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || true)
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="(could not detect public IP)"
fi
echo "Public IP: $PUBLIC_IP"

# --- 1) Ask for domain/IP (blank => server_name _)
read -p "Enter your domain or IP (leave blank if none): " MY_DOMAIN
if [ -z "$MY_DOMAIN" ]; then
  SERVER_NAME="_"
  echo "No domain/IP provided; using server_name _ (catch-all)."
else
  SERVER_NAME="$MY_DOMAIN"
  echo "Using domain/IP for Nginx: $SERVER_NAME"
fi

# --- 2) Ask for the backend URL for the frontend
DEFAULT_BACKEND="http://$PRIMARY_NET_IP:3001"
echo "If you leave the backend URL blank, we'll use: $DEFAULT_BACKEND"
read -p "Enter the backend base URL (press ENTER to use $DEFAULT_BACKEND): " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-$DEFAULT_BACKEND}
echo "NEXT_PUBLIC_BACKEND_URL = '$BACKEND_URL'"

# --- 3) Update packages
sudo apt-get update -y
sudo apt-get upgrade -y

# --- 4) Install basic dependencies
sudo apt-get install -y git curl nginx

# Install Node.js (version 18 LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# --- 5) Clone or update the repository
CURRENT_DIR="$(pwd)"
REPO_NAME="smart-chatbot"
REPO_DIR="${CURRENT_DIR}/${REPO_NAME}"

if [ ! -d "$REPO_DIR" ]; then
  echo "Cloning the repository into ${REPO_DIR}..."
  git clone https://github.com/infinitocloud/smart-chatbot.git "$REPO_NAME"
else
  echo "Directory ${REPO_DIR} already exists. Updating with git pull..."
  cd "$REPO_DIR"
  git reset --hard HEAD
  git pull --rebase
  cd "$CURRENT_DIR"
fi

# --- 6) Configure FRONTEND
echo "Installing/updating FRONTEND dependencies..."
cd "${REPO_DIR}/frontend"

echo "Creating/updating .env.local with BACKEND_URL..."
cat <<EOF > .env.local
NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL}
EOF

npm install
npm run build

# --- 7) Configure BACKEND
echo "Installing/updating BACKEND dependencies..."
cd "${REPO_DIR}/backend"
npm install

# --- 8) Configure Nginx Reverse Proxy
NGINX_CONF="/etc/nginx/sites-available/${REPO_NAME}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${REPO_NAME}.conf"

echo "Creating/overwriting Nginx config at: $NGINX_CONF"
sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    # Node routes => port 3001 (api, admin, file-upload-manager, etc.)
    location ~* ^/(api|admin|file-upload-manager)(.*)\$ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # Everything else => Next.js => port 3000
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

echo "Enabling Nginx config..."
sudo ln -sf "$NGINX_CONF" "$NGINX_LINK"

# Remove 'default' if desired
if [ -f "/etc/nginx/sites-enabled/default" ]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi

sudo nginx -t && sudo systemctl reload nginx

if [ "$SERVER_NAME" = "_" ]; then
  echo "Nginx configured with server_name _ (catch-all)."
  echo "Requests /api|/admin|/file-upload-manager => Node(3001)"
  echo "All other paths => Next.js(3000)"
  echo "Access via: http://$PRIMARY_NET_IP or $PUBLIC_IP"
else
  echo "Nginx configured with domain/IP = $SERVER_NAME => Node(3001) & Next(3000)"
fi

# --- 9) (Optional) Certbot if domain
if [ "$SERVER_NAME" != "_" ]; then
  read -p "Do you want to install and configure Certbot SSL for $SERVER_NAME? (y/n): " INSTALL_SSL
  if [[ "$INSTALL_SSL" =~ ^[Yy]$ ]]; then
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d "$SERVER_NAME"
    sudo systemctl reload nginx
  fi
else
  echo "No domain set; skipping Certbot."
fi

###############################################################################
# 10) Create TWO systemd services:
#     1) "smartchatbot-backend" => runs Node on port 3001
#     2) "smartchatbot-frontend" => runs Next.js on port 3000
# No prompt for user => using $USER
###############################################################################

# BACKEND SERVICE
SYSTEMD_BACKEND="/etc/systemd/system/smartchatbot-backend.service"
echo "Creating systemd unit for backend: $SYSTEMD_BACKEND (running as $USER)..."

sudo bash -c "cat > $SYSTEMD_BACKEND" <<EOF
[Unit]
Description=Smart Chatbot Backend (Node on port 3001) under $USER
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${REPO_DIR}/backend
KillMode=control-group
Restart=on-failure

ExecStart=/usr/bin/env npm run start

[Install]
WantedBy=multi-user.target
EOF

# FRONTEND SERVICE
SYSTEMD_FRONTEND="/etc/systemd/system/smartchatbot-frontend.service"
echo "Creating systemd unit for frontend: $SYSTEMD_FRONTEND (running as $USER)..."

sudo bash -c "cat > $SYSTEMD_FRONTEND" <<EOF
[Unit]
Description=Smart Chatbot Frontend (Next.js on port 3000) under $USER
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${REPO_DIR}/frontend
KillMode=control-group
Restart=on-failure

ExecStart=/usr/bin/env npm run start

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable both on boot, then start them
sudo systemctl daemon-reload
sudo systemctl enable smartchatbot-backend
sudo systemctl enable smartchatbot-frontend

sudo systemctl start smartchatbot-backend
sudo systemctl start smartchatbot-frontend

echo
echo "Systemd services created:"
echo "  smartchatbot-backend => runs Node server on port 3001"
echo "  smartchatbot-frontend => runs Next.js on port 3000"
echo "Both services run under user: $USER"

echo "Use 'sudo systemctl status smartchatbot-backend' or 'smartchatbot-frontend' to check logs."
echo "Use 'sudo systemctl stop/restart smartchatbot-backend' or 'smartchatbot-frontend'."
echo "They will automatically start on reboot."

echo
echo "Installation complete!"
echo "Local IP: $PRIMARY_NET_IP"
echo "Public IP: $PUBLIC_IP"

if [ "$SERVER_NAME" = "_" ]; then
  echo "No domain => 'server_name _'; access via: http://$PRIMARY_NET_IP"
  echo "Frontend points to: $BACKEND_URL"
else
  echo "Domain: $SERVER_NAME"
  echo "Access: http://$SERVER_NAME (or https if Certbot installed)"
  echo "Frontend points to: $BACKEND_URL"
fi

