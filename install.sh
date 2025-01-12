#!/usr/bin/env bash

###############################################################################
# SMART CHATBOT INSTALL SCRIPT
#
# 1) Installs Node, Git, Nginx, etc.
# 2) Clones (or updates) the "smart-chatbot" repo in the current directory.
# 3) Asks for a domain/IP for Nginx (can be left empty => server_name _;).
# 4) Detects the primary network interface IP via "ip route get 1.1.1.1",
#    if that fails => fallback to 192.168.1.100.
# 5) Detects the public IP via "curl http://checkip.amazonaws.com" (if possible).
# 6) Asks for the backend base URL for the frontend. If left blank => http://<PRIMARY_NET_IP>:3001
# 7) Configures the frontend (.env.local) with that BACKEND_URL.
# 8) Configures the backend (npm install).
# 9) Configures Nginx as a reverse proxy to 127.0.0.1:3001.
# 10) Optionally runs Certbot for SSL if a domain is provided.
# 11) Launches BACKEND and FRONTEND in the background with nohup.
#
# Note: If you reboot the machine, these nohup processes will stop.
#       See the "systemd" section at the end for an optional approach
#       to keep them running after reboots.
###############################################################################

# --- Detect primary network interface IP with "ip route get 1.1.1.1" ---
PRIMARY_NET_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {print $7; exit}')
if [ -z "$PRIMARY_NET_IP" ]; then
  PRIMARY_NET_IP="192.168.1.100"
  echo "Could not auto-detect a primary network IP; using fallback: $PRIMARY_NET_IP"
else
  echo "Detected primary network IP: $PRIMARY_NET_IP"
fi

# --- Attempt to get public IP via checkip.amazonaws.com ---
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || true)
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="(could not detect public IP via checkip.amazonaws.com)"
fi
echo "Public IP: $PUBLIC_IP"

# --- Ask for domain or IP (can be empty => server_name _;) ---
read -p "Enter your domain or IP (leave blank if no domain): " MY_DOMAIN
if [ -z "$MY_DOMAIN" ]; then
  SERVER_NAME="_"
  echo "No domain/IP provided; using server_name _ (catch-all)."
else
  SERVER_NAME="$MY_DOMAIN"
  echo "Using domain/IP for Nginx: $SERVER_NAME"
fi

# --- Ask for backend URL for the frontend ---
# If blank => http://<PRIMARY_NET_IP>:3001
DEFAULT_BACKEND="http://$PRIMARY_NET_IP:3001"
echo "If you leave the backend URL blank, we'll use: $DEFAULT_BACKEND"
read -p "Enter the backend base URL (press ENTER to use $DEFAULT_BACKEND): " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-$DEFAULT_BACKEND}

echo "NEXT_PUBLIC_BACKEND_URL = '$BACKEND_URL'"

###############################################################################
# Update packages
###############################################################################
sudo apt-get update -y
sudo apt-get upgrade -y

###############################################################################
# Install basic dependencies (git, curl, nginx, Node.js)
###############################################################################
sudo apt-get install -y git curl nginx

# Install Node.js (version 18 LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

###############################################################################
# Clone or update the repository in the current directory
###############################################################################
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

###############################################################################
# Configure FRONTEND
###############################################################################
echo "Installing/updating FRONTEND dependencies..."
cd "${REPO_DIR}/frontend"

echo "Creating/updating .env.local with BACKEND_URL..."
cat <<EOF > .env.local
NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL}
EOF

npm install
npm run build

###############################################################################
# Configure BACKEND
###############################################################################
echo "Installing/updating BACKEND dependencies..."
cd "${REPO_DIR}/backend"
npm install

###############################################################################
# Configure Nginx Reverse Proxy
###############################################################################
NGINX_CONF="/etc/nginx/sites-available/${REPO_NAME}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${REPO_NAME}.conf"

echo "Creating Nginx config at: $NGINX_CONF"
sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    location / {
        proxy_pass http://127.0.0.1:3001;
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
  echo "Access your server via: http://$PRIMARY_NET_IP (LAN) or $PUBLIC_IP (if reachable)."
else
  echo "Nginx configured with domain/IP = $SERVER_NAME => proxies to :3001"
fi

###############################################################################
# (Optional) Certbot SSL if a domain was set
###############################################################################
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
# Launch BACKEND and FRONTEND in the background
###############################################################################
cd "${REPO_DIR}/backend"
echo "Starting BACKEND (port 3001) in background..."
nohup npm run start > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

cd "${REPO_DIR}/frontend"
echo "Starting FRONTEND (Next.js, port 3000) in background..."
nohup npm run start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

echo
echo "Installation complete!"
echo "Backend PID=$BACKEND_PID, Frontend PID=$FRONTEND_PID"
echo "Local IP (primary interface): $PRIMARY_NET_IP"
echo "Public IP (via checkip.amazonaws.com): $PUBLIC_IP"
if [ "$SERVER_NAME" = "_" ]; then
  echo "No domain was configured, so Nginx is using 'server_name _'."
  echo "You may access the server via: http://$PRIMARY_NET_IP (on port 80 in LAN)"
  echo "If your public IP is reachable, http://$PUBLIC_IP might work externally."
  echo "Frontend points to: $BACKEND_URL"
else
  echo "Access via: http://$SERVER_NAME (or https if SSL installed)."
  echo "Frontend points to: $BACKEND_URL"
fi

