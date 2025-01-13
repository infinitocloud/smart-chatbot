#!/usr/bin/env bash

###############################################################################
# SMART CHATBOT INSTALL + 2 SYSTEMD SERVICES + OPTIONAL HTTPS
#
# - Installs Node, Git, Nginx
# - Clones/updates "smart-chatbot" repo
# - Asks for domain => if blank => server_name _
# - If domain => optionally run Certbot => sets default to https://<domain>
# - Else => defaults to http://<domain> or if no domain => http://<LAN_IP>:3001
# - Creates Nginx config => ^/(api|admin|file-upload-manager) => Node(3001)
#                            everything else => Next.js(3000)
# - If domain + Certbot => non-interactive w/ --redirect => forces HTTP→HTTPS
# - If cert exists => skip/renew/remove
# - Creates or updates systemd services => if they exist => restart
###############################################################################

########################################
# 0) Detect local + public IP
########################################
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

########################################
# 1) Ask for domain => server_name
########################################
read -p "Enter your domain or IP (leave blank if none): " MY_DOMAIN
if [ -z "$MY_DOMAIN" ]; then
  SERVER_NAME="_"
  echo "No domain/IP provided => using server_name _ (catch-all)."
else
  SERVER_NAME="$MY_DOMAIN"
  echo "Using domain/IP for Nginx: $SERVER_NAME"
fi

########################################
# 2) If domain => ask if we want HTTPS
########################################
WANTS_SSL="n"
DEFAULT_BACKEND=""
if [ "$SERVER_NAME" = "_" ]; then
  # No domain => fallback
  DEFAULT_BACKEND="http://$PRIMARY_NET_IP:3001"
else
  # Domain => ask user if they want to enable Certbot SSL => default yes
  read -p "Do you want to enable HTTPS (Certbot) for $SERVER_NAME? (y/n) [y]: " WANTS_SSL
  WANTS_SSL=${WANTS_SSL:-y}
  if [[ "$WANTS_SSL" =~ ^[Yy]$ ]]; then
    # If user wants SSL => default to https
    DEFAULT_BACKEND="https://$SERVER_NAME"
  else
    # If user says no => just http
    DEFAULT_BACKEND="http://$SERVER_NAME"
  fi
fi

########################################
# 3) Ask for backend URL => can override
########################################
echo "If you leave the backend URL blank, we'll use: $DEFAULT_BACKEND"
read -p "Enter the backend base URL (press ENTER to use $DEFAULT_BACKEND): " BACKEND_URL
BACKEND_URL=${BACKEND_URL:-$DEFAULT_BACKEND}
echo "NEXT_PUBLIC_BACKEND_URL = '$BACKEND_URL'"

########################################
# 4) Update packages
########################################
sudo apt-get update -y
sudo apt-get upgrade -y

########################################
# 5) Install basic dependencies + Node
########################################
sudo apt-get install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

########################################
# 6) Clone/update the repo
########################################
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

########################################
# 7) FRONTEND => .env.local => build
########################################
echo "Installing/updating FRONTEND dependencies..."
cd "${REPO_DIR}/frontend"

echo "Creating/updating .env.local with BACKEND_URL..."
cat <<EOF > .env.local
NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL}
EOF

npm install
npm run build

########################################
# 8) BACKEND => install
########################################
echo "Installing/updating BACKEND dependencies..."
cd "${REPO_DIR}/backend"
npm install

########################################
# 9) Configure Nginx
########################################
NGINX_CONF="/etc/nginx/sites-available/${REPO_NAME}.conf"
NGINX_LINK="/etc/nginx/sites-enabled/${REPO_NAME}.conf"

echo "Creating/overwriting Nginx config at: $NGINX_CONF"
sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    # Node routes => port 3001
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
if [ -f "/etc/nginx/sites-enabled/default" ]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi
sudo nginx -t && sudo systemctl reload nginx

if [ "$SERVER_NAME" = "_" ]; then
  echo "Nginx => server_name _ => Access via: http://$PRIMARY_NET_IP or $PUBLIC_IP"
else
  echo "Nginx => domain/IP = $SERVER_NAME => Node(3001) & Next(3000) via reverse proxy"
fi

########################################
# 10) (Optional) Certbot => non-interactive
########################################
if [ "$SERVER_NAME" != "_" ] && [[ "$WANTS_SSL" =~ ^[Yy]$ ]]; then
  echo "Installing Certbot + python3-certbot-nginx..."
  sudo apt-get install -y certbot python3-certbot-nginx

  CERT_PATH="/etc/letsencrypt/live/$SERVER_NAME"
  if [ -d "$CERT_PATH" ]; then
    echo
    echo "A certificate for $SERVER_NAME already exists at $CERT_PATH."
    echo "Choose an option:"
    echo "  1) Skip re-running Certbot"
    echo "  2) Force renewal with --force-renewal"
    echo "  3) Remove the old certificate and re-run from scratch"
    read -p "Enter 1/2/3: " CERT_OPTION
    case "$CERT_OPTION" in
      1)
        echo "Skipping Certbot because a certificate already exists."
        ;;
      2)
        echo "Forcing renewal for $SERVER_NAME ..."
        CERTBOT_OUTPUT=$(sudo certbot --nginx \
          --non-interactive \
          --agree-tos \
          --email "web@${SERVER_NAME}" \
          --redirect \
          --force-renewal \
          -d "$SERVER_NAME" 2>&1)
        echo "$CERTBOT_OUTPUT"
        sudo systemctl reload nginx
        if echo "$CERTBOT_OUTPUT" | grep -iq "Congratulations!"; then
          echo "--------------------------------------------------"
          echo "Congratulations! You have successfully forced renewal for https://$SERVER_NAME"
          echo "--------------------------------------------------"
        fi
        ;;
      3)
        echo "Removing old certificate..."
        sudo certbot delete --cert-name "$SERVER_NAME"
        echo "Re-running certbot from scratch for $SERVER_NAME..."
        CERTBOT_OUTPUT=$(sudo certbot --nginx \
          --non-interactive \
          --agree-tos \
          --email "web@${SERVER_NAME}" \
          --redirect \
          -d "$SERVER_NAME" 2>&1)
        echo "$CERTBOT_OUTPUT"
        sudo systemctl reload nginx
        if echo "$CERTBOT_OUTPUT" | grep -iq "Congratulations!"; then
          echo "--------------------------------------------------"
          echo "Congratulations! You have successfully enabled HTTPS on https://$SERVER_NAME"
          echo "--------------------------------------------------"
        fi
        ;;
      *)
        echo "Invalid option. Skipping Certbot."
        ;;
    esac
  else
    echo "No existing cert => issuing a new one for $SERVER_NAME ..."
    CERTBOT_OUTPUT=$(sudo certbot --nginx \
      --non-interactive \
      --agree-tos \
      --email "web@${SERVER_NAME}" \
      --redirect \
      -d "$SERVER_NAME" 2>&1)
    echo "$CERTBOT_OUTPUT"
    sudo systemctl reload nginx

    if echo "$CERTBOT_OUTPUT" | grep -iq "Congratulations!"; then
      echo "--------------------------------------------------"
      echo "Congratulations! You have successfully enabled HTTPS on https://$SERVER_NAME"
      echo "--------------------------------------------------"
    fi
  fi
else
  echo "No domain set or user declined SSL => skipping Certbot."
fi

########################################
# 11) Create or Update systemd services
########################################
cd "$CURRENT_DIR"

SYSTEMD_BACKEND="/etc/systemd/system/smartchatbot-backend.service"
SYSTEMD_FRONTEND="/etc/systemd/system/smartchatbot-frontend.service"

echo
echo "===== BACKEND SERVICE ====="
if [ -f "$SYSTEMD_BACKEND" ]; then
  echo "Detected existing service $SYSTEMD_BACKEND => updating + restarting..."
else
  echo "Creating service file => $SYSTEMD_BACKEND"
fi

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

sudo systemctl daemon-reload
sudo systemctl enable smartchatbot-backend
sudo systemctl restart smartchatbot-backend

echo
echo "===== FRONTEND SERVICE ====="
if [ -f "$SYSTEMD_FRONTEND" ]; then
  echo "Detected existing service $SYSTEMD_FRONTEND => updating + restarting..."
else
  echo "Creating service file => $SYSTEMD_FRONTEND"
fi

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

sudo systemctl daemon-reload
sudo systemctl enable smartchatbot-frontend
sudo systemctl restart smartchatbot-frontend

echo
echo "Systemd services ensured + restarted:"
echo "  smartchatbot-backend => Node server on port 3001"
echo "  smartchatbot-frontend => Next.js on port 3000"
echo "Use: sudo systemctl status smartchatbot-backend / smartchatbot-frontend"

########################################
# 12) Final summary
########################################
echo
echo "Installation complete!"
echo "Local IP: $PRIMARY_NET_IP"
echo "Public IP: $PUBLIC_IP"

if [ "$SERVER_NAME" = "_" ]; then
  echo "No domain => 'server_name _'; access via: http://$PRIMARY_NET_IP"
  echo "Frontend points to: $BACKEND_URL"
else
  echo "Domain: $SERVER_NAME"
  echo "Access: http://$SERVER_NAME (or automatically redirected to HTTPS if Certbot was successful)"
  echo "Frontend points to: $BACKEND_URL"
fi

