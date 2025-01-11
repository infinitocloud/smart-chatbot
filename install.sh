#!/usr/bin/env bash

# 1) Actualizar paquetes
sudo apt-get update -y
sudo apt-get upgrade -y

# 2) Instalar dependencias básicas (git, node, etc.)
sudo apt-get install -y git curl

# 3) Instalar Node.js (versión 18 LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4) Clonar el repo (frontend y backend)
cd ./
git clone https://github.com/infinitocloud/smart-chatbot.git smart-chatbot

# 5) Instalar dependencias frontend
cd smart-chatbot/frontend

echo "Creando .env.local con la URL del backend..."
cat <<EOF > .env.local
NEXT_PUBLIC_BACKEND_URL=http://192.168.1.139:3001
EOF

# Con esto .env.local ya existe, Next.js leerá la variable en build
npm install
npm run build  # compila Next.js con la var NEXT_PUBLIC_BACKEND_URL

# 6) Instalar dependencias backend
cd ../backend
npm install

# 7) Levantar el backend
#    (Si tu package.json en backend tiene "start": "node server.js",
#     npm run start ejecutará node server.js)
npm run start &
BACKEND_PID=$!

# 8) (Opcional) Arrancar frontend en modo producción
cd ../frontend
npm run start &
FRONTEND_PID=$!

echo "Deployment completed!"
echo "Backend PID=$BACKEND_PID, Frontend PID=$FRONTEND_PID"
